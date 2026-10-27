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
import { SUBSCRIPTION_PLANS, calculatePlanQuotas, isSubscriptionExpired, calculateDaysRemaining } from './subscriptionService.js'

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

export { isSubscriptionExpired, calculateDaysRemaining }

export function isFeatureAllowedForPlan(featureKey, planOrSubscription = 'Free Trial', explicitSubscription = null) {
  let planName = 'Free Trial'
  let subscription = explicitSubscription

  if (typeof planOrSubscription === 'object' && planOrSubscription !== null) {
    subscription = planOrSubscription
    planName = subscription.subscriptionPlan || subscription.planName || 'Free Trial'
  } else if (typeof planOrSubscription === 'string') {
    planName = planOrSubscription
  }

  const normPlan = String(planName || 'Free Trial').trim()
  const isTrial = normPlan.toLowerCase().includes('trial') || normPlan.toLowerCase().includes('free')

  // Check trial status: Active 14-day Free Trial grants full unrestricted access to all features & modules
  if (isTrial) {
    const isExpired = subscription ? isSubscriptionExpired(subscription) : false
    if (!isExpired) {
      return true
    }
    // Expired Free Trial restricts to baseline Free Trial tier permissions
    const allowedTiers = PLAN_FEATURE_PERMISSIONS[featureKey]
    if (!allowedTiers) return true
    return allowedTiers.some((tier) => normPlan.toLowerCase().includes(tier.toLowerCase()))
  }

  // Paid plans: Silver, Gold, Platinum, Enterprise
  if (subscription && isSubscriptionExpired(subscription)) {
    return false
  }

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
export function getDrawingLimitsForPlan(planName = '', subscription = null) {
  let norm = String(planName || '').toLowerCase().trim()
  let sub = subscription

  if (typeof planName === 'object' && planName !== null) {
    sub = planName
    norm = String(sub.subscriptionPlan || sub.planName || '').toLowerCase().trim()
  }

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

  // Free Trial handling
  const isExpired = sub ? isSubscriptionExpired(sub) : false
  if (!isExpired) {
    // 14-Day Free Trial Full Evaluation Drawing Policy:
    // Allows up to 2 active docs per site with multi-delete & multi-reupload enabled
    return {
      planName: 'Free Trial',
      isTrialActive: true,
      isExpired: false,
      maxActiveDocsPerSite: 2,
      allowDelete: true,
      allowReupload: true,
      maxDeletesPerSite: Infinity,
      maxReuploadsPerSite: Infinity,
      multiDelete: true,
      multiReupload: true,
      description: '14-Day Free Trial Full Access (2 active docs per site, full delete/re-upload)',
    }
  }

  // Expired Free Trial
  const policy = SUBSCRIPTION_PLANS.FREE_TRIAL.drawingPolicy
  return {
    planName: 'Free Trial',
    isTrialActive: false,
    isExpired: true,
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
    isTrial: true,
    isTrialActive: true,
    isExpired: false,
    maxProjects: 999999,
    maxUsers: 3,
    maxManagers: 1,
    maxSupervisors: 1,
    quotas: {
      maxProjects: 999999,
      maxUsers: 3,
      maxManagers: 1,
      maxSupervisors: 1,
    },
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
      const isTrial = planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('free')
      const now = new Date()
      const endDate = subData.subscriptionEndDate
        ? (subData.subscriptionEndDate.toDate ? subData.subscriptionEndDate.toDate() : new Date(subData.subscriptionEndDate))
        : null
      const isExpired = subData.isSubscriptionActive === false || (endDate && endDate < now)
      const isTrialActive = isTrial && !isExpired

      if (isTrialActive) {
        const drawingLimits = getDrawingLimitsForPlan(planName, subData)
        return {
          planName: 'Free Trial',
          isTrial: true,
          isTrialActive: true,
          isExpired: false,
          maxProjects: 999999,
          maxUsers: 3,
          maxManagers: 1,
          maxSupervisors: 1,
          quotas: {
            maxProjects: 999999,
            maxUsers: 3,
            maxManagers: 1,
            maxSupervisors: 1,
          },
          subscription: subData,
          endDate,
          ...drawingLimits,
        }
      }

      const platinumProjects = subData.platinumProjects || subData.queuedPlatinumProjects || 10
      const quotas = calculatePlanQuotas(planName, platinumProjects)
      const drawingLimits = getDrawingLimitsForPlan(planName, subData)

      // Single source of truth: calculatePlanQuotas defines limits for standard plans (Free Trial, Silver, Gold, Platinum).
      // Only custom Enterprise tier falls back to custom Firestore numbers.
      const isCustomEnterprise = planName.toLowerCase().includes('enterprise') || planName.toLowerCase().includes('custom')
      const effectiveMaxProjects = isCustomEnterprise ? (subData.maxProjects || quotas.maxProjects) : quotas.maxProjects
      const effectiveMaxUsers = isCustomEnterprise ? (subData.maxUsers || quotas.maxUsers) : quotas.maxUsers
      const effectiveMaxManagers = isCustomEnterprise ? (subData.maxManagers || quotas.maxManagers) : quotas.maxManagers
      const effectiveMaxSupervisors = isCustomEnterprise ? (subData.maxSupervisors || quotas.maxSupervisors) : quotas.maxSupervisors

      return {
        planName,
        isTrial,
        isTrialActive: false,
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
        endDate,
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

    // Supervisors are counted strictly from the supervisor collection

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
export async function canCreateSite({ orgId, currentPlanName = '', currentSitesCount, subscription = null }) {
  const planLimits = subscription
    ? {
        ...calculatePlanQuotas(subscription.subscriptionPlan || currentPlanName || 'Free Trial', 10),
        ...getDrawingLimitsForPlan(subscription.subscriptionPlan || currentPlanName || 'Free Trial', subscription),
        isExpired: isSubscriptionExpired(subscription),
        isTrialActive: !isSubscriptionExpired(subscription) && (String(subscription.subscriptionPlan || currentPlanName || 'Free Trial').toLowerCase().includes('trial') || String(subscription.subscriptionPlan || currentPlanName || 'Free Trial').toLowerCase().includes('free')),
        planName: subscription.subscriptionPlan || currentPlanName || 'Free Trial',
      }
    : (currentPlanName && !currentPlanName.toLowerCase().includes('trial') && !currentPlanName.toLowerCase().includes('free'))
    ? { ...calculatePlanQuotas(currentPlanName), ...getDrawingLimitsForPlan(currentPlanName), isExpired: false }
    : await getActivePlanLimits(orgId)

  const isTrial = String(planLimits.planName || '').toLowerCase().includes('trial') || String(planLimits.planName || '').toLowerCase().includes('free')

  if (planLimits.isExpired) {
    return {
      isAllowed: false,
      allowed: false,
      reason: isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
      title: isTrial ? 'Free Trial Expired' : 'Subscription Expired',
      message: isTrial
        ? 'Your 14-day Free Trial has expired. Please select a subscription plan to continue creating projects.'
        : `Your subscription (${planLimits.planName}) has expired. Please renew your subscription to create new projects.`,
      currentCount: currentSitesCount || 0,
      maxLimit: planLimits.maxProjects,
      planName: planLimits.planName,
      upgradePlan: isTrial ? 'Select Plan' : 'Renew',
      limits: planLimits,
    }
  }

  const activeCount = currentSitesCount !== undefined
    ? currentSitesCount
    : await getActiveSitesCount(orgId)

  // Full Unrestricted Access during active 14-day Free Trial
  if (planLimits.isTrialActive) {
    return {
      isAllowed: true,
      allowed: true,
      currentCount: activeCount,
      maxLimit: planLimits.maxProjects,
      limits: planLimits,
    }
  }

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
  currentSupervisorsCount,
  currentWorkersCount,
  currentTotalUsersCount,
  subscription = null,
}) {
  const planLimits = subscription
    ? {
        ...calculatePlanQuotas(subscription.subscriptionPlan || currentPlanName || 'Free Trial', 10),
        ...getDrawingLimitsForPlan(subscription.subscriptionPlan || currentPlanName || 'Free Trial', subscription),
        isExpired: isSubscriptionExpired(subscription),
        isTrialActive: !isSubscriptionExpired(subscription) && (String(subscription.subscriptionPlan || currentPlanName || 'Free Trial').toLowerCase().includes('trial') || String(subscription.subscriptionPlan || currentPlanName || 'Free Trial').toLowerCase().includes('free')),
        planName: subscription.subscriptionPlan || currentPlanName || 'Free Trial',
      }
    : (currentPlanName && !currentPlanName.toLowerCase().includes('trial') && !currentPlanName.toLowerCase().includes('free'))
    ? { ...calculatePlanQuotas(currentPlanName), ...getDrawingLimitsForPlan(currentPlanName), isExpired: false }
    : await getActivePlanLimits(orgId)

  const isTrial = String(planLimits.planName || '').toLowerCase().includes('trial') || String(planLimits.planName || '').toLowerCase().includes('free')

  if (planLimits.isExpired) {
    return {
      isAllowed: false,
      allowed: false,
      reason: isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
      title: isTrial ? 'Free Trial Expired' : 'Subscription Expired',
      message: isTrial
        ? 'Your 14-day Free Trial has expired. Please select a subscription plan to add managers.'
        : `Your subscription (${planLimits.planName}) has expired. Please renew your subscription to add team members.`,
      currentCount: currentManagersCount || 0,
      maxLimit: planLimits.maxManagers,
      planName: planLimits.planName,
      upgradePlan: isTrial ? 'Select Plan' : 'Renew',
      limits: planLimits,
    }
  }

  // Free Trial Workforce Limits: Max 3 eligible users (1 Admin + 1 Manager + 1 Supervisor), Workers excluded
  if (isTrial) {
    let mgrCount = currentManagersCount
    let supCount = currentSupervisorsCount
    let wkrCount = currentWorkersCount

    if (mgrCount === undefined || supCount === undefined || wkrCount === undefined) {
      const counts = await getTeamCounts(orgId)
      if (mgrCount === undefined) mgrCount = counts.managers
      if (supCount === undefined) supCount = counts.supervisors
      if (wkrCount === undefined) wkrCount = counts.workers
    }

    const adminCount = 1
    const eligibleCount = adminCount + mgrCount + supCount
    const maxEligible = 3
    const maxManagers = 1

    if (mgrCount >= maxManagers) {
      return {
        isAllowed: false,
        allowed: false,
        reason: 'FREE_TRIAL_USER_LIMIT_REACHED',
        title: 'Free Trial User Limit Reached',
        message: 'You have reached the maximum allowed limit of 1 Manager on the Free Trial plan. Upgrade to a paid plan to add more managers.',
        isTrialLimit: true,
        planName: 'Free Trial',
        adminCount,
        maxAdmin: 1,
        managersCount: mgrCount,
        maxManagers: 1,
        supervisorsCount: supCount,
        maxSupervisors: 1,
        workersCount: wkrCount,
        totalEligible: eligibleCount,
        maxEligible,
        upgradePlan: 'Silver',
        limits: planLimits,
      }
    }

    if (eligibleCount >= maxEligible) {
      return {
        isAllowed: false,
        allowed: false,
        reason: 'FREE_TRIAL_USER_LIMIT_REACHED',
        title: 'Free Trial User Limit Reached',
        message: 'Your organization has reached the maximum of 3 eligible users (1 Organization Admin, 1 Manager, 1 Site Supervisor) on the Free Trial plan. Upgrade to a paid plan to add more team members.',
        isTrialLimit: true,
        planName: 'Free Trial',
        adminCount,
        maxAdmin: 1,
        managersCount: mgrCount,
        maxManagers: 1,
        supervisorsCount: supCount,
        maxSupervisors: 1,
        workersCount: wkrCount,
        totalEligible: eligibleCount,
        maxEligible,
        upgradePlan: 'Silver',
        limits: planLimits,
      }
    }

    return {
      isAllowed: true,
      allowed: true,
      currentCount: mgrCount,
      maxLimit: 1,
      adminCount,
      managersCount: mgrCount,
      supervisorsCount: supCount,
      workersCount: wkrCount,
      totalEligible: eligibleCount,
      maxEligible,
      limits: planLimits,
    }
  }

  // Paid Plans Logic
  let mgrCount = currentManagersCount
  let supCount = currentSupervisorsCount

  if (mgrCount === undefined || supCount === undefined) {
    const counts = await getTeamCounts(orgId)
    if (mgrCount === undefined) mgrCount = counts.managers
    if (supCount === undefined) supCount = counts.supervisors
  }

  // The user limit applies ONLY to Managers and Supervisors (and Org Admin). Workers are strictly excluded!
  const adminCount = 1
  const eligibleUsersCount = adminCount + (mgrCount || 0) + (supCount || 0)
  const userCount = eligibleUsersCount

  let nextTier = 'Silver'
  const cur = planLimits.planName.toLowerCase()
  if (cur.includes('silver')) nextTier = 'Gold'
  else if (cur.includes('gold')) nextTier = 'Platinum'
  else if (cur.includes('platinum')) nextTier = 'Enterprise'

  // Step 1: Checks total eligible user count (Admin + Managers + Supervisors) against limits.maxUsers
  if (userCount >= planLimits.maxUsers) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'TOTAL_USERS_LIMIT_REACHED',
      title: 'Team User Quota Reached',
      message: `You have reached your total team quota of ${planLimits.maxUsers} users (Managers and Supervisors) on the ${planLimits.planName} plan. Upgrade to ${nextTier} to add more team members.`,
      currentCount: userCount,
      maxLimit: planLimits.maxUsers,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
      adminCount,
      managersCount: mgrCount,
      supervisorsCount: supCount,
      workersCount: currentWorkersCount,
      totalEligible: userCount,
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
      adminCount,
      managersCount: mgrCount,
      supervisorsCount: supCount,
      workersCount: currentWorkersCount,
      totalEligible: userCount,
    }
  }

  return {
    isAllowed: true,
    allowed: true,
    currentCount: mgrCount,
    maxLimit: planLimits.maxManagers,
    limits: planLimits,
    adminCount,
    managersCount: mgrCount,
    supervisorsCount: supCount,
    workersCount: currentWorkersCount,
    totalEligible: userCount,
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
  currentManagersCount,
  currentSupervisorsCount,
  currentWorkersCount,
  currentTotalUsersCount,
  subscription = null,
}) {
  const planLimits = subscription
    ? {
        ...calculatePlanQuotas(subscription.subscriptionPlan || currentPlanName || 'Free Trial', 10),
        ...getDrawingLimitsForPlan(subscription.subscriptionPlan || currentPlanName || 'Free Trial', subscription),
        isExpired: isSubscriptionExpired(subscription),
        isTrialActive: !isSubscriptionExpired(subscription) && (String(subscription.subscriptionPlan || currentPlanName || 'Free Trial').toLowerCase().includes('trial') || String(subscription.subscriptionPlan || currentPlanName || 'Free Trial').toLowerCase().includes('free')),
        planName: subscription.subscriptionPlan || currentPlanName || 'Free Trial',
      }
    : (currentPlanName && !currentPlanName.toLowerCase().includes('trial') && !currentPlanName.toLowerCase().includes('free'))
    ? { ...calculatePlanQuotas(currentPlanName), ...getDrawingLimitsForPlan(currentPlanName), isExpired: false }
    : await getActivePlanLimits(orgId)

  const isTrial = String(planLimits.planName || '').toLowerCase().includes('trial') || String(planLimits.planName || '').toLowerCase().includes('free')

  if (planLimits.isExpired) {
    return {
      isAllowed: false,
      allowed: false,
      reason: isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
      title: isTrial ? 'Free Trial Expired' : 'Subscription Expired',
      message: isTrial
        ? 'Your 14-day Free Trial has expired. Please select a subscription plan to add supervisors.'
        : `Your subscription (${planLimits.planName}) has expired. Please renew your subscription to add team members.`,
      currentCount: currentSupervisorsCount || 0,
      maxLimit: planLimits.maxSupervisors,
      planName: planLimits.planName,
      upgradePlan: isTrial ? 'Select Plan' : 'Renew',
      limits: planLimits,
    }
  }

  // Free Trial Workforce Limits: Max 3 eligible users (1 Admin + 1 Manager + 1 Supervisor), Workers excluded
  if (isTrial) {
    let mgrCount = currentManagersCount
    let supCount = currentSupervisorsCount
    let wkrCount = currentWorkersCount

    if (mgrCount === undefined || supCount === undefined || wkrCount === undefined) {
      const counts = await getTeamCounts(orgId)
      if (mgrCount === undefined) mgrCount = counts.managers
      if (supCount === undefined) supCount = counts.supervisors
      if (wkrCount === undefined) wkrCount = counts.workers
    }

    const adminCount = 1
    const eligibleCount = adminCount + mgrCount + supCount
    const maxEligible = 3
    const maxSupervisors = 1

    if (supCount >= maxSupervisors) {
      return {
        isAllowed: false,
        allowed: false,
        reason: 'FREE_TRIAL_USER_LIMIT_REACHED',
        title: 'Free Trial User Limit Reached',
        message: 'You have reached the maximum allowed limit of 1 Site Supervisor on the Free Trial plan. Upgrade to a paid plan to add more supervisors.',
        isTrialLimit: true,
        planName: 'Free Trial',
        adminCount,
        maxAdmin: 1,
        managersCount: mgrCount,
        maxManagers: 1,
        supervisorsCount: supCount,
        maxSupervisors: 1,
        workersCount: wkrCount,
        totalEligible: eligibleCount,
        maxEligible,
        upgradePlan: 'Silver',
        limits: planLimits,
      }
    }

    if (eligibleCount >= maxEligible) {
      return {
        isAllowed: false,
        allowed: false,
        reason: 'FREE_TRIAL_USER_LIMIT_REACHED',
        title: 'Free Trial User Limit Reached',
        message: 'Your organization has reached the maximum of 3 eligible users (1 Organization Admin, 1 Manager, 1 Site Supervisor) on the Free Trial plan. Upgrade to a paid plan to add more team members.',
        isTrialLimit: true,
        planName: 'Free Trial',
        adminCount,
        maxAdmin: 1,
        managersCount: mgrCount,
        maxManagers: 1,
        supervisorsCount: supCount,
        maxSupervisors: 1,
        workersCount: wkrCount,
        totalEligible: eligibleCount,
        maxEligible,
        upgradePlan: 'Silver',
        limits: planLimits,
      }
    }

    return {
      isAllowed: true,
      allowed: true,
      currentCount: supCount,
      maxLimit: 1,
      adminCount,
      managersCount: mgrCount,
      supervisorsCount: supCount,
      workersCount: wkrCount,
      totalEligible: eligibleCount,
      maxEligible,
      limits: planLimits,
    }
  }

  // Paid Plans Logic
  let mgrCount = currentManagersCount
  let supCount = currentSupervisorsCount

  if (supCount === undefined || mgrCount === undefined) {
    const counts = await getTeamCounts(orgId)
    if (supCount === undefined) supCount = counts.supervisors
    if (mgrCount === undefined) mgrCount = counts.managers
  }

  // The user limit applies ONLY to Managers and Supervisors (and Org Admin). Workers are strictly excluded!
  const adminCount = 1
  const eligibleUsersCount = adminCount + (mgrCount || 0) + (supCount || 0)
  const userCount = eligibleUsersCount

  let nextTier = 'Silver'
  const cur = planLimits.planName.toLowerCase()
  if (cur.includes('silver')) nextTier = 'Gold'
  else if (cur.includes('gold')) nextTier = 'Platinum'
  else if (cur.includes('platinum')) nextTier = 'Enterprise'

  // Step 1: Checks total eligible user count (Admin + Managers + Supervisors) against limits.maxUsers
  if (userCount >= planLimits.maxUsers) {
    return {
      isAllowed: false,
      allowed: false,
      reason: 'TOTAL_USERS_LIMIT_REACHED',
      title: 'Team User Quota Reached',
      message: `You have reached your total team quota of ${planLimits.maxUsers} users (Managers and Supervisors) on the ${planLimits.planName} plan. Upgrade to ${nextTier} to add more team members.`,
      currentCount: userCount,
      maxLimit: planLimits.maxUsers,
      planName: planLimits.planName,
      upgradePlan: nextTier,
      limits: planLimits,
      adminCount,
      managersCount: mgrCount,
      supervisorsCount: supCount,
      workersCount: currentWorkersCount,
      totalEligible: userCount,
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
      adminCount,
      managersCount: mgrCount,
      supervisorsCount: supCount,
      workersCount: currentWorkersCount,
      totalEligible: userCount,
    }
  }

  return {
    isAllowed: true,
    allowed: true,
    currentCount: supCount,
    maxLimit: planLimits.maxSupervisors,
    limits: planLimits,
    adminCount,
    managersCount: mgrCount,
    supervisorsCount: supCount,
    workersCount: currentWorkersCount,
    totalEligible: userCount,
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
  const isTrial = String(limits.planName || '').toLowerCase().includes('trial') || String(limits.planName || '').toLowerCase().includes('free')

  if (limits.isExpired) {
    return {
      isAllowed: false,
      reason: isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
      message: isTrial
        ? 'Your 14-day Free Trial has expired. Please upgrade to a paid plan to upload site drawings.'
        : `Your subscription (${limits.planName}) has expired. Please renew your subscription to upload drawings.`,
      limits,
      usage,
      upgradePlan: 'Select Plan',
    }
  }

  const activeDocsCount = currentActiveDocs !== null
    ? currentActiveDocs
    : await getActiveDrawingsCountForSite(orgId, cleanSiteId)

  // Full Access during active 14-day Free Trial (allows up to 2 active docs per site and re-uploads)
  if (limits.isTrialActive) {
    if (activeDocsCount + newDocsCount > (limits.maxActiveDocsPerSite || 2)) {
      return {
        isAllowed: false,
        reason: 'ACTIVE_CAPACITY_EXCEEDED',
        message: `Evaluation limit: You have reached the maximum of ${limits.maxActiveDocsPerSite || 2} active documents for Site ${siteId || cleanSiteId}. Upgrade to Platinum for expanded dynamic capacity.`,
        currentActiveDocs: activeDocsCount,
        maxActiveDocsPerSite: limits.maxActiveDocsPerSite || 2,
        limits,
        usage,
        upgradePlan: 'Platinum',
      }
    }

    return {
      isAllowed: true,
      limits,
      usage,
      currentActiveDocs: activeDocsCount,
    }
  }

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
  const isTrial = String(limits.planName || '').toLowerCase().includes('trial') || String(limits.planName || '').toLowerCase().includes('free')

  if (limits.isExpired) {
    return {
      isAllowed: false,
      reason: isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
      message: isTrial
        ? 'Your 14-day Free Trial has expired. Please upgrade to a paid plan to manage drawings.'
        : `Your subscription (${limits.planName}) has expired. Please renew your subscription to delete drawings.`,
      limits,
      usage,
      upgradePlan: 'Select Plan',
    }
  }

  // Full Unrestricted Access during active 14-day Free Trial
  if (limits.isTrialActive) {
    return {
      isAllowed: true,
      isGoldWarning: false,
      limits,
      usage,
    }
  }

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
