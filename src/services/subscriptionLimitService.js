import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { SUBSCRIPTION_PLANS, calculatePlanQuotas } from './subscriptionService.js'

export const PLAN_FEATURE_PERMISSIONS = {
  // Free Trial features
  basic_project_management: ['Free Trial', 'Silver', 'Gold', 'Platinum', 'Enterprise'],
  daily_worker_attendance: ['Free Trial', 'Silver', 'Gold', 'Platinum', 'Enterprise'],
  daily_task_tracking: ['Free Trial', 'Silver', 'Gold', 'Platinum', 'Enterprise'],
  basic_reports: ['Free Trial', 'Silver', 'Gold', 'Platinum', 'Enterprise'],
  drawings_view: ['Free Trial', 'Silver', 'Gold', 'Platinum', 'Enterprise'],

  // Silver features (Requires Silver+)
  multi_site_management: ['Silver', 'Gold', 'Platinum', 'Enterprise'],
  materials_inventory: ['Silver', 'Gold', 'Platinum', 'Enterprise'],
  petty_cash_expenses: ['Silver', 'Gold', 'Platinum', 'Enterprise'],
  exports_reports: ['Silver', 'Gold', 'Platinum', 'Enterprise'],
  approvals_workflow: ['Silver', 'Gold', 'Platinum', 'Enterprise'],

  // Gold features (Requires Gold+)
  contractor_billing: ['Gold', 'Platinum', 'Enterprise'],
  financial_analytics: ['Gold', 'Platinum', 'Enterprise'],
  drawing_deletion: ['Gold', 'Platinum', 'Enterprise'],
  drawing_reupload: ['Gold', 'Platinum', 'Enterprise'],

  // Platinum features (Requires Platinum+)
  dynamic_site_quota: ['Platinum', 'Enterprise'],
  multi_drawings: ['Platinum', 'Enterprise'],
  advanced_workforce_payroll: ['Platinum', 'Enterprise'],
}

export function isFeatureAllowedForPlan(featureKey, planName = 'Free Trial') {
  const normPlan = String(planName || 'Free Trial').trim()
  const allowedTiers = PLAN_FEATURE_PERMISSIONS[featureKey]
  if (!allowedTiers) return true
  return allowedTiers.some((tier) => normPlan.toLowerCase().includes(tier.toLowerCase()))
}

/**
 * CST White Label / eBricks - Subscription Quota & Governance Engine
 * Implements Section 5 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 */

export function formatCanonicalSiteId(siteId = '', siteCode = '', siteName = '') {
  if (!siteId && !siteCode && !siteName) return 'SITE_UNKNOWN'
  const rawId = String(siteId || '').trim()
  const rawCode = String(siteCode || '').trim()
  const rawName = String(siteName || '').trim()

  // If siteCode and siteName provided, construct SiteCode_SiteName (e.g. ST001_Testing)
  if (rawCode && rawName) {
    const code = rawCode.toUpperCase().startsWith('PR') ? `ST${rawCode.substring(2)}` : rawCode
    const name = rawName.replace(/\s+/g, '')
    return `${code}_${name}`
  }

  if (rawId.includes('_')) {
    const parts = rawId.split('_').filter(Boolean)
    if (parts.length >= 2) {
      const codePart = parts[0].toUpperCase().startsWith('PR') ? `ST${parts[0].substring(2)}` : parts[0]
      const namePart = parts.slice(1).join('_')
      return `${codePart}_${namePart}`
    }
  }

  return rawId.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
}

/**
 * Resolves drawing limits for a given plan name
 * @param {string} planName - e.g. "Free Trial", "Silver", "Gold", "Platinum", "Enterprise"
 */
export function getDrawingLimitsForPlan(planName = '') {
  const norm = String(planName || '').toLowerCase().trim()

  if (norm.includes('enterprise')) {
    const policy = SUBSCRIPTION_PLANS.ENTERPRISE.drawingPolicy
    return {
      planName: 'Enterprise',
      maxActiveDocsPerSite: policy.maxActiveDocsPerSite || 2,
      allowDelete: true,
      allowReupload: true,
      maxDeletesPerSite: Infinity,
      maxReuploadsPerSite: Infinity,
      multiDelete: true,
      multiReupload: true,
      description: policy.description,
    }
  }

  if (norm.includes('platinum')) {
    const policy = SUBSCRIPTION_PLANS.PLATINUM.drawingPolicy
    return {
      planName: 'Platinum',
      maxActiveDocsPerSite: policy.maxActiveDocsPerSite || 2,
      allowDelete: true,
      allowReupload: true,
      maxDeletesPerSite: Infinity,
      maxReuploadsPerSite: Infinity,
      multiDelete: true,
      multiReupload: true,
      description: policy.description,
    }
  }

  if (norm.includes('gold')) {
    const policy = SUBSCRIPTION_PLANS.GOLD.drawingPolicy
    return {
      planName: 'Gold',
      maxActiveDocsPerSite: policy.maxActiveDocsPerSite || 1,
      allowDelete: true,
      allowReupload: true,
      maxDeletesPerSite: policy.maxDeletesPerSite || 1,
      maxReuploadsPerSite: policy.maxReuploadsPerSite || 1,
      multiDelete: false,
      multiReupload: false,
      description: policy.description,
    }
  }

  if (norm.includes('silver')) {
    const policy = SUBSCRIPTION_PLANS.SILVER.drawingPolicy
    return {
      planName: 'Silver',
      maxActiveDocsPerSite: policy.maxActiveDocsPerSite || 1,
      allowDelete: false,
      allowReupload: false,
      maxDeletesPerSite: 0,
      maxReuploadsPerSite: 0,
      multiDelete: false,
      multiReupload: false,
      description: policy.description,
    }
  }

  // Default to Free Trial
  const policy = SUBSCRIPTION_PLANS.FREE_TRIAL.drawingPolicy
  return {
    planName: 'Free Trial',
    maxActiveDocsPerSite: policy.maxActiveDocsPerSite || 1,
    allowDelete: false,
    allowReupload: false,
    maxDeletesPerSite: 0,
    maxReuploadsPerSite: 0,
    multiDelete: false,
    multiReupload: false,
    description: policy.description,
  }
}

/**
 * Resolves full active plan limits, quotas, and expiration status for an organization
 * Complies with Section 1, 2, 3, and 5 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 */
export async function getActivePlanLimits(orgId) {
  const trialQuotas = calculatePlanQuotas('Free Trial')
  const trialDrawing = getDrawingLimitsForPlan('Free Trial')
  const defaultLimits = {
    planName: 'Free Trial',
    isExpired: false,
    maxProjects: trialQuotas.maxProjects,
    maxUsers: trialQuotas.maxUsers,
    maxManagers: trialQuotas.maxManagers,
    maxSupervisors: trialQuotas.maxSupervisors,
    quotas: trialQuotas,
    subscription: null,
    ...trialDrawing,
  }

  if (!orgId) return defaultLimits

  try {
    const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')
    const subSnap = await getDoc(subRef)
    let subData = null
    if (subSnap.exists()) {
      subData = subSnap.data()
    } else {
      const orgRef = doc(db, 'organisation', orgId)
      const orgSnap = await getDoc(orgRef)
      if (orgSnap.exists()) {
        const orgData = orgSnap.data()
        subData = orgData?.subscription || orgData?.data?.subscription || null
      }
    }

    if (subData) {
      const planName = subData.subscriptionPlan || subData.planName || 'Free Trial'
      const platinumProjects = subData.platinumProjects || subData.queuedPlatinumProjects || 10
      const quotas = calculatePlanQuotas(planName, platinumProjects)
      const drawingLimits = getDrawingLimitsForPlan(planName)

      const now = new Date()
      const endDate = subData.subscriptionEndDate
        ? (subData.subscriptionEndDate.toDate ? subData.subscriptionEndDate.toDate() : new Date(subData.subscriptionEndDate))
        : null
      const isExpired = subData.isSubscriptionActive === false || (endDate && endDate < now)

      const effectiveMaxProjects = subData.maxProjects || quotas.maxProjects
      const effectiveMaxUsers = subData.maxUsers || quotas.maxUsers
      const effectiveMaxManagers = subData.maxManagers || quotas.maxManagers
      const effectiveMaxSupervisors = subData.maxSupervisors || quotas.maxSupervisors

      return {
        planName,
        isExpired,
        maxProjects: effectiveMaxProjects,
        maxUsers: effectiveMaxUsers,
        maxManagers: effectiveMaxManagers,
        maxSupervisors: effectiveMaxSupervisors,
        quotas: {
          maxProjects: effectiveMaxProjects,
          maxUsers: effectiveMaxUsers,
          maxManagers: effectiveMaxManagers,
          maxSupervisors: effectiveMaxSupervisors,
        },
        subscription: subData,
        ...drawingLimits,
      }
    }
  } catch (err) {
    console.warn('Error reading active plan limits:', err)
  }

  return defaultLimits
}

/**
 * Counts active (non-archived) sites / projects for an organization
 * Section 1 & 5.1 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 */
export async function getActiveSitesCount(orgId) {
  if (!orgId) return 0
  try {
    const colRef = collection(db, 'organisation', orgId, 'projects')
    const snap = await getDocs(colRef)
    const activeDocs = snap.docs.filter((d) => {
      const data = d.data()
      const status = String(data.status || data.currentStatus || data.projectStatus || '').toLowerCase()
      return status !== 'archived' && !data.isArchived
    })
    if (activeDocs.length > 0) return activeDocs.length

    // Fallback check on 'Site' collection
    const siteSnap = await getDocs(collection(db, 'organisation', orgId, 'Site'))
    const activeSites = siteSnap.docs.filter((d) => {
      const data = d.data()
      const status = String(data.status || '').toLowerCase()
      return status !== 'archived' && !data.isArchived
    })
    return activeSites.length
  } catch (err) {
    console.warn('Error counting active sites:', err)
    return 0
  }
}

/**
 * Retrieves total team user counts (Managers, Supervisors, Workers, Admin)
 * Section 1 & 5.2/5.3 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 */
export async function getTeamCounts(orgId) {
  const counts = { managers: 0, supervisors: 0, workers: 0, totalUsers: 1 } // 1 for Org Admin
  if (!orgId) return counts

  try {
    const [mgrSnap, supSnap, workerSnap] = await Promise.allSettled([
      getDocs(collection(db, 'organisation', orgId, 'manager')),
      getDocs(collection(db, 'organisation', orgId, 'supervisor')),
      getDocs(collection(db, 'organisation', orgId, 'workersConfig')),
    ])

    if (mgrSnap.status === 'fulfilled') {
      counts.managers = mgrSnap.value.size
    }
    if (supSnap.status === 'fulfilled') {
      counts.supervisors = supSnap.value.size
    }
    if (workerSnap.status === 'fulfilled') {
      counts.workers = workerSnap.value.size
    }

    // Fallback check for supervisors under siteSupervisor if 0
    if (counts.supervisors === 0) {
      try {
        const altSup = await getDocs(collection(db, 'organisation', orgId, 'siteSupervisor'))
        counts.supervisors = altSup.size
      } catch (e) {}
    }

    // Cumulative total team users limit of (Managers + Supervisors + Staff)
    counts.totalUsers = counts.managers + counts.supervisors + counts.workers + 1
  } catch (err) {
    console.warn('Error fetching team counts:', err)
  }

  return counts
}

/**
 * Pre-Site Creation Validation Engine
 * Section 5.1 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 *
 * Compares active site count in Firestore against limits.maxProjects.
 * Blocks addition when limit reached, returning upgrade recommendations.
 */
export async function canCreateSite({ orgId, currentPlanName = '', currentSitesCount }) {
  const planLimits = currentPlanName
    ? { ...calculatePlanQuotas(currentPlanName), ...getDrawingLimitsForPlan(currentPlanName), isExpired: false }
    : await getActivePlanLimits(orgId)

  if (planLimits.isExpired) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'SUBSCRIPTION_EXPIRED',
      title: 'Subscription Expired',
      message: `Your subscription (${planLimits.planName}) has expired. Please renew your subscription to create new projects.`,
      currentCount: currentSitesCount || 0,
      maxLimit: planLimits.maxProjects,
      planName: planLimits.planName,
      upgradePlan: 'Renew',
      limits: planLimits,
    }
  }

  const activeCount = currentSitesCount !== undefined
    ? currentSitesCount
    : await getActiveSitesCount(orgId)

  if (activeCount >= planLimits.maxProjects) {
    let nextTier = 'Silver'
    const cur = planLimits.planName.toLowerCase()
    if (cur.includes('silver')) nextTier = 'Gold'
    else if (cur.includes('gold')) nextTier = 'Platinum'
    else if (cur.includes('platinum')) nextTier = 'Enterprise'

    return {
      isAllowed: false,
      allowed: false,
      reason: 'SITE_LIMIT_REACHED',
      title: 'Active Site Limit Reached',
      message: `You have reached your limit of ${planLimits.maxProjects} active site(s) on the ${planLimits.planName} plan. Upgrade to ${nextTier} to create more construction sites.`,
      currentCount: activeCount,
      maxLimit: planLimits.maxProjects,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
    }
  }

  return {
    isAllowed: true,
    allowed: true,
    currentCount: activeCount,
    maxLimit: planLimits.maxProjects,
    limits: planLimits,
  }
}

/**
 * Pre-Manager Creation Validation Engine
 * Section 5.2 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 *
 * Step 1: Checks total user count against limits.maxTotalUsers.
 * Step 2: Checks manager count against limits.maxManagers.
 */
export async function canCreateManager({
  orgId,
  currentPlanName = '',
  currentManagersCount,
  currentTotalUsersCount,
}) {
  const planLimits = currentPlanName
    ? { ...calculatePlanQuotas(currentPlanName), ...getDrawingLimitsForPlan(currentPlanName), isExpired: false }
    : await getActivePlanLimits(orgId)

  if (planLimits.isExpired) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'SUBSCRIPTION_EXPIRED',
      title: 'Subscription Expired',
      message: `Your subscription (${planLimits.planName}) has expired. Please renew your subscription to add team members.`,
      currentCount: currentManagersCount || 0,
      maxLimit: planLimits.maxManagers,
      planName: planLimits.planName,
      upgradePlan: 'Renew',
      limits: planLimits,
    }
  }

  let mgrCount = currentManagersCount
  let userCount = currentTotalUsersCount
  if (mgrCount === undefined || userCount === undefined) {
    const counts = await getTeamCounts(orgId)
    if (mgrCount === undefined) mgrCount = counts.managers
    if (userCount === undefined) userCount = counts.totalUsers
  }

  let nextTier = 'Silver'
  const cur = planLimits.planName.toLowerCase()
  if (cur.includes('silver')) nextTier = 'Gold'
  else if (cur.includes('gold')) nextTier = 'Platinum'
  else if (cur.includes('platinum')) nextTier = 'Enterprise'

  // Step 1: Checks total user count against limits.maxTotalUsers
  if (userCount >= planLimits.maxUsers) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'TOTAL_USERS_LIMIT_REACHED',
      title: 'Team User Quota Reached',
      message: `You have reached your total team quota of ${planLimits.maxUsers} users on the ${planLimits.planName} plan. Upgrade to ${nextTier} to add more team members.`,
      currentCount: userCount,
      maxLimit: planLimits.maxUsers,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
    }
  }

  // Step 2: Checks manager count against limits.maxManagers
  if (mgrCount >= planLimits.maxManagers) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'MANAGER_LIMIT_REACHED',
      title: 'Manager Quota Reached',
      message: `You have reached the maximum limit of ${planLimits.maxManagers} manager(s) on the ${planLimits.planName} plan. Upgrade to ${nextTier} to add more managers.`,
      currentCount: mgrCount,
      maxLimit: planLimits.maxManagers,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
    }
  }

  return {
    isAllowed: true,
    allowed: true,
    currentCount: mgrCount,
    maxLimit: planLimits.maxManagers,
    limits: planLimits,
  }
}

/**
 * Pre-Supervisor Creation Validation Engine
 * Section 5.3 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 *
 * Step 1: Checks total user count against limits.maxTotalUsers.
 * Step 2: Checks supervisor count against limits.maxSupervisors.
 */
export async function canCreateSupervisor({
  orgId,
  currentPlanName = '',
  currentSupervisorsCount,
  currentTotalUsersCount,
}) {
  const planLimits = currentPlanName
    ? { ...calculatePlanQuotas(currentPlanName), ...getDrawingLimitsForPlan(currentPlanName), isExpired: false }
    : await getActivePlanLimits(orgId)

  if (planLimits.isExpired) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'SUBSCRIPTION_EXPIRED',
      title: 'Subscription Expired',
      message: `Your subscription (${planLimits.planName}) has expired. Please renew your subscription to add team members.`,
      currentCount: currentSupervisorsCount || 0,
      maxLimit: planLimits.maxSupervisors,
      planName: planLimits.planName,
      upgradePlan: 'Renew',
      limits: planLimits,
    }
  }

  let supCount = currentSupervisorsCount
  let userCount = currentTotalUsersCount
  if (supCount === undefined || userCount === undefined) {
    const counts = await getTeamCounts(orgId)
    if (supCount === undefined) supCount = counts.supervisors
    if (userCount === undefined) userCount = counts.totalUsers
  }

  let nextTier = 'Silver'
  const cur = planLimits.planName.toLowerCase()
  if (cur.includes('silver')) nextTier = 'Gold'
  else if (cur.includes('gold')) nextTier = 'Platinum'
  else if (cur.includes('platinum')) nextTier = 'Enterprise'

  // Step 1: Checks total user count against limits.maxTotalUsers
  if (userCount >= planLimits.maxUsers) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'TOTAL_USERS_LIMIT_REACHED',
      title: 'Team User Quota Reached',
      message: `You have reached your total team quota of ${planLimits.maxUsers} users on the ${planLimits.planName} plan. Upgrade to ${nextTier} to add more team members.`,
      currentCount: userCount,
      maxLimit: planLimits.maxUsers,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
    }
  }

  // Step 2: Checks supervisor count against limits.maxSupervisors
  if (supCount >= planLimits.maxSupervisors) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'SUPERVISOR_LIMIT_REACHED',
      title: 'Supervisor Quota Reached',
      message: `You have reached the maximum limit of ${planLimits.maxSupervisors} supervisor(s) on the ${planLimits.planName} plan. Upgrade to ${nextTier} to add more supervisors.`,
      currentCount: supCount,
      maxLimit: planLimits.maxSupervisors,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
    }
  }

  return {
    isAllowed: true,
    allowed: true,
    currentCount: supCount,
    maxLimit: planLimits.maxSupervisors,
    limits: planLimits,
  }
}

/**
 * Retrieves site drawing usage metrics from collection: siteDrawingsUsage
 */
export async function getSiteDrawingUsage(orgId, siteId) {
  const cleanSiteId = formatCanonicalSiteId(siteId)
  const defaultUsage = {
    siteId: cleanSiteId,
    totalUploadCount: 0,
    reuploadCount: 0,
    deleteCount: 0,
    lastUploadedAt: null,
    lastDeletedAt: null,
    updatedAt: null,
  }

  if (!orgId || !cleanSiteId) return defaultUsage

  try {
    // Primary multi-tenant path
    const docRef = doc(db, 'organisation', orgId, 'siteDrawingsUsage', cleanSiteId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return { ...defaultUsage, ...snap.data(), siteId: cleanSiteId }
    }

    // Fallback root path
    const rootRef = doc(db, 'siteDrawingsUsage', cleanSiteId)
    const rootSnap = await getDoc(rootRef)
    if (rootSnap.exists()) {
      return { ...defaultUsage, ...rootSnap.data(), siteId: cleanSiteId }
    }
  } catch (err) {
    console.warn('Error fetching site drawing usage:', err)
  }

  return defaultUsage
}

/**
 * Counts currently active documents for a site across siteDrawings
 */
export async function getActiveDrawingsCountForSite(orgId, siteId) {
  const cleanSiteId = formatCanonicalSiteId(siteId)
  if (!orgId || !cleanSiteId) return 0

  let activeCount = 0

  try {
    const orgColRef = collection(db, 'organisation', orgId, 'siteDrawings')
    const q1 = query(orgColRef, where('siteId', '==', cleanSiteId))
    const snap1 = await getDocs(q1)

    snap1.forEach((d) => {
      const data = d.data()
      if (data.status !== 'Inactive') {
        if (Array.isArray(data.siteDocs)) {
          activeCount += data.siteDocs.length
        } else if (data.totalDocuments !== undefined) {
          activeCount += Number(data.totalDocuments) || 0
        } else {
          activeCount += 1
        }
      }
    })

    // Also check unnormalized siteId if different
    if (snap1.empty && siteId && siteId !== cleanSiteId) {
      const q2 = query(orgColRef, where('siteId', '==', siteId))
      const snap2 = await getDocs(q2)
      snap2.forEach((d) => {
        const data = d.data()
        if (data.status !== 'Inactive') {
          if (Array.isArray(data.siteDocs)) {
            activeCount += data.siteDocs.length
          } else if (data.totalDocuments !== undefined) {
            activeCount += Number(data.totalDocuments) || 0
          } else {
            activeCount += 1
          }
        }
      })
    }
  } catch (err) {
    console.warn('Error counting active site drawings:', err)
  }

  return activeCount
}

/**
 * Pre-Upload Validation Engine
 * Section 5.2 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 *
 * @param {Object} params
 * @param {string} params.orgId
 * @param {string} params.siteId
 * @param {number} [params.newDocsCount=1]
 * @param {string} [params.currentPlanName]
 * @param {number} [params.currentActiveDocs] - optional pre-fetched active count
 */
export async function canUploadDrawing({
  orgId,
  siteId,
  newDocsCount = 1,
  currentPlanName = '',
  currentActiveDocs = null,
}) {
  const cleanSiteId = formatCanonicalSiteId(siteId)
  const limits = currentPlanName ? getDrawingLimitsForPlan(currentPlanName) : await getActivePlanLimits(orgId)
  const usage = await getSiteDrawingUsage(orgId, cleanSiteId)

  const activeDocsCount = currentActiveDocs !== null
    ? currentActiveDocs
    : await getActiveDrawingsCountForSite(orgId, cleanSiteId)

  // 1. Active Document Capacity Check
  if (activeDocsCount + newDocsCount > limits.maxActiveDocsPerSite) {
    return {
      isAllowed: false,
      reason: 'ACTIVE_CAPACITY_EXCEEDED',
      message: `You have reached your limit of ${limits.maxActiveDocsPerSite} active document(s) for Site ${siteId || cleanSiteId}. Upgrade to Platinum to upload up to 2 active documents per site.`,
      currentActiveDocs: activeDocsCount,
      maxActiveDocsPerSite: limits.maxActiveDocsPerSite,
      limits,
      usage,
      upgradePlan: 'Platinum',
    }
  }

  // 2. Re-upload / Subsequent Upload Check
  if (usage.totalUploadCount > 0) {
    if (!limits.allowReupload) {
      return {
        isAllowed: false,
        reason: 'REUPLOAD_NOT_PERMITTED',
        message: `Re-uploading is not permitted on the ${limits.planName} plan. Upgrade to Gold or Platinum.`,
        limits,
        usage,
        upgradePlan: 'Gold',
      }
    }

    if (limits.maxReuploadsPerSite !== Infinity && usage.reuploadCount >= limits.maxReuploadsPerSite) {
      return {
        isAllowed: false,
        reason: 'REUPLOAD_QUOTA_EXHAUSTED',
        message: `You have exhausted your ${limits.maxReuploadsPerSite} allowed re-upload for Site ${siteId || cleanSiteId} on the ${limits.planName} plan. Upgrade to Platinum for multi-reupload.`,
        limits,
        usage,
        upgradePlan: 'Platinum',
      }
    }
  }

  return {
    isAllowed: true,
    limits,
    usage,
    currentActiveDocs: activeDocsCount,
  }
}

/**
 * Pre-Delete Validation Engine
 * Section 5.3 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 *
 * @param {Object} params
 * @param {string} params.orgId
 * @param {string} params.siteId
 * @param {string} [params.currentPlanName]
 */
export async function canDeleteDrawing({
  orgId,
  siteId,
  currentPlanName = '',
}) {
  const cleanSiteId = formatCanonicalSiteId(siteId)
  const limits = currentPlanName ? getDrawingLimitsForPlan(currentPlanName) : await getActivePlanLimits(orgId)
  const usage = await getSiteDrawingUsage(orgId, cleanSiteId)

  // 1. Deletion Permitted Check
  if (!limits.allowDelete) {
    return {
      isAllowed: false,
      reason: 'DELETE_NOT_PERMITTED',
      message: `Document deletion is not permitted on the ${limits.planName} plan. Users can upload and view documents only.`,
      limits,
      usage,
      upgradePlan: 'Gold',
    }
  }

  // 2. Delete Quota Exhaustion Check
  if (limits.maxDeletesPerSite !== Infinity && usage.deleteCount >= limits.maxDeletesPerSite) {
    return {
      isAllowed: false,
      reason: 'DELETE_QUOTA_EXHAUSTED',
      message: `You have exhausted your ${limits.maxDeletesPerSite} allowed deletion for Site ${siteId || cleanSiteId} on the ${limits.planName} plan. Upgrade to Platinum for unlimited deletions.`,
      limits,
      usage,
      upgradePlan: 'Platinum',
    }
  }

  return {
    isAllowed: true,
    isGoldWarning: limits.planName === 'Gold' && limits.maxDeletesPerSite === 1,
    limits,
    usage,
  }
}

/**
 * Usage Accounting: Record Drawing Upload
 * Section 5.4 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 */
export async function recordDrawingUpload(orgId, siteId, count = 1) {
  if (!orgId) return
  const cleanSiteId = formatCanonicalSiteId(siteId)
  const currentUsage = await getSiteDrawingUsage(orgId, cleanSiteId)

  const isSubsequentUpload = (currentUsage.totalUploadCount || 0) > 0
  const totalUploadCount = (currentUsage.totalUploadCount || 0) + count
  const reuploadCount = isSubsequentUpload ? (currentUsage.reuploadCount || 0) + count : (currentUsage.reuploadCount || 0)

  const payload = {
    siteId: cleanSiteId,
    totalUploadCount,
    reuploadCount,
    deleteCount: currentUsage.deleteCount || 0,
    lastUploadedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'siteDrawingsUsage', cleanSiteId)
  await setDoc(docRef, payload, { merge: true })

  // Backward compatibility fallback to root
  try {
    const rootRef = doc(db, 'siteDrawingsUsage', cleanSiteId)
    await setDoc(rootRef, payload, { merge: true })
  } catch (e) {}

  return payload
}

/**
 * Usage Accounting: Record Drawing Delete
 * Section 5.4 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 */
export async function recordDrawingDelete(orgId, siteId, count = 1) {
  if (!orgId) return
  const cleanSiteId = formatCanonicalSiteId(siteId)
  const currentUsage = await getSiteDrawingUsage(orgId, cleanSiteId)

  const deleteCount = (currentUsage.deleteCount || 0) + count

  const payload = {
    siteId: cleanSiteId,
    totalUploadCount: currentUsage.totalUploadCount || 0,
    reuploadCount: currentUsage.reuploadCount || 0,
    deleteCount,
    lastDeletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'siteDrawingsUsage', cleanSiteId)
  await setDoc(docRef, payload, { merge: true })

  // Backward compatibility fallback to root
  try {
    const rootRef = doc(db, 'siteDrawingsUsage', cleanSiteId)
    await setDoc(rootRef, payload, { merge: true })
  } catch (e) {}

  return payload
}

export const SubscriptionLimitService = {
  getDrawingLimitsForPlan,
  getActivePlanLimits,
  getSiteDrawingUsage,
  getActiveDrawingsCountForSite,
  getActiveSitesCount,
  getTeamCounts,
  canCreateSite,
  canCreateManager,
  canCreateSupervisor,
  canUploadDrawing,
  canDeleteDrawing,
  recordDrawingUpload,
  recordDrawingDelete,
  formatCanonicalSiteId,
  isFeatureAllowed: isFeatureAllowedForPlan,
}

export default SubscriptionLimitService
