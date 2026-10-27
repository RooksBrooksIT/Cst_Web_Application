import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from './firebase.js'
import { generateTxnId } from './payuService.js'

/**
 * Subscription Plans, Quotas, Pricing & Quota Enforcement Service
 * Complies with SUBSCRIPTION_PLANS_AND_PAYMENT_FLOW_SPECIFICATION.txt
 */

export const SUBSCRIPTION_PLANS = {
  FREE_TRIAL: {
    id: 'free_trial',
    name: 'Free Trial',
    badge: '14-Day Free Access',
    targetAudience: 'Evaluation tier for new contractors and construction teams',
    durationDays: 14,
    priceMonthly: 0,
    price6Months: 0,
    priceYearly: 0,
    maxProjects: 1,
    maxUsers: 3,
    maxManagers: 1,
    maxSupervisors: 1,
    drawingPolicy: {
      maxActiveDocsPerSite: 1,
      allowDelete: false,
      allowReupload: false,
      description: '1 active doc per site (View Only)',
    },
    features: [
      '1 Active Construction Site / Project',
      '3 Total Eligible Users (1 Admin, 1 Manager, 1 Supervisor)',
      'Unlimited Field Workers (Excluded from quota)',
      'Basic Muster Roll & Daily Diaries',
      '1 Layout Drawing per site (View Only)',
      '14-Day Unrestricted Evaluation',
    ],
  },
  SILVER: {
    id: 'silver',
    name: 'Silver',
    badge: 'Starter Tier',
    targetAudience: 'Starter tier for small contractors & independent builders',
    priceMonthly: 99,
    price6Months: 594,
    priceYearly: 1188,
    monthlyEquivalent6Mo: 99,
    monthlyEquivalentYr: 99,
    maxProjects: 5,
    maxUsers: 5,
    maxManagers: 2,
    maxSupervisors: 2,
    drawingPolicy: {
      maxActiveDocsPerSite: 1,
      allowDelete: false,
      allowReupload: false,
      description: '1 active doc per site (View Only)',
    },
    features: [
      'Up to 5 Active Construction Sites / Projects',
      '5 Total Team Users (Admin + Managers + Supervisors)',
      'Up to 2 Dedicated Project Managers',
      'Up to 2 On-Site Supervisors',
      'Unlimited Field Workers (Excluded from quota)',
      'Petty Cash Float & Expense Tracking',
      'Daily Site Progress Diaries & Photos',
      'Multi-Tier Approvals Center & Workflows',
    ],
  },
  GOLD: {
    id: 'gold',
    name: 'Gold',
    badge: 'Most Popular',
    targetAudience: 'Standard tier for growing construction teams & multi-site contractors',
    popular: true,
    priceMonthly: 199,
    price6Months: 1194,
    priceYearly: 2388,
    monthlyEquivalent6Mo: 199,
    monthlyEquivalentYr: 199,
    maxProjects: 10,
    maxUsers: 15,
    maxManagers: 5,
    maxSupervisors: 10,
    drawingPolicy: {
      maxActiveDocsPerSite: 1,
      allowDelete: true,
      allowReupload: true,
      maxDeletesPerSite: 1,
      maxReuploadsPerSite: 1,
      description: '1 active doc per site (1 Delete & 1 Re-upload permitted)',
    },
    features: [
      'Up to 10 Active Construction Sites / Projects',
      '15 Total Team Users (Admin + Managers + Supervisors)',
      'Up to 5 Dedicated Project Managers',
      'Up to 10 On-Site Supervisors',
      'Unlimited Field Workers (Excluded from quota)',
      '3-Tier Payment Approval Workflow Engine',
      'Material Indents & PO Procurement',
      'Subcontractor MB Sheets & Retention Deductions',
    ],
  },
  PLATINUM: {
    id: 'platinum',
    name: 'Platinum',
    badge: 'Dynamic Scale',
    targetAudience: 'Dynamic scale tier for enterprise developers & large contractors',
    isDynamic: true,
    defaultProjects: 10,
    projectPresets: [5, 10, 15, 20, 25, 30, 40, 50],
    ratePerSiteMonthly: 39.9,
    ratePerSite6Months: 239.4,
    ratePerSiteYearly: 478.8,
    drawingPolicy: {
      maxActiveDocsPerSite: 2,
      allowDelete: true,
      allowReupload: true,
      multiDelete: true,
      multiReupload: true,
      description: '2 active docs per site (Multi-delete & Multi-reupload)',
    },
    features: [
      'Dynamic Site Allocation ({N} Sites: 5, 10, 15, 20, 25, 30, 40, or 50)',
      '{maxUsers} Total Team Users (Admin + Managers + Supervisors)',
      '{maxManagers} Dedicated Managers (clamp(round(N / 2), 2, 25))',
      '{maxSupervisors} On-Site Supervisors (N Sites = N Supervisors)',
      'Unlimited Field Workers (Excluded from quota)',
      'QA/QC Checklist Inspection & Safety Logging',
      'Customer Milestone Tax Invoicing & Realization',
    ],
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    badge: 'Custom Deployment',
    targetAudience: 'Dedicated infrastructure & custom SLA for large firms',
    isCustom: true,
    maxProjects: 999999,
    maxUsers: 999999,
    maxManagers: 999999,
    maxSupervisors: 999999,
    drawingPolicy: {
      maxActiveDocsPerSite: 2,
      allowDelete: true,
      allowReupload: true,
      multiDelete: true,
      multiReupload: true,
      description: 'Full Custom Drawing Quota & Access',
    },
    features: [
      'Unlimited Construction Sites & Projects',
      'Unlimited Team User Seats (Managers & Supervisors)',
      'Unlimited Field Workers',
      'Custom White Label Branding & Subdomain',
      'Dedicated Cloud Deployment & Guaranteed SLA',
      '24/7 Priority Phone & Live Chat Support',
    ],
  },
}

export const BILLING_CYCLES = [
  { id: 'Monthly', label: 'Monthly', days: 30, discount: null },
  { id: '6 Months', label: '6 Months', days: 180, discount: null },
  { id: 'Yearly', label: 'Yearly', days: 365, discount: null },
]

/**
 * Calculate dynamic price for Platinum plan based on projects N
 */
export function calculatePlatinumPrice(projectCount = 10, cycle = 'Monthly') {
  const N = Number(projectCount) || 10
  if (cycle === '6 Months') return Math.round(N * 239.4)
  if (cycle === 'Yearly') return Math.round(N * 478.8)
  return Math.round(N * 39.9)
}

/**
 * Calculate Plan Price based on Plan and Billing Cycle
 */
export function calculatePlanPrice(planId, cycle = 'Monthly', platinumProjects = 10) {
  const p = String(planId || '').toLowerCase()
  if (p.includes('free') || p.includes('trial')) return 0
  if (p.includes('silver')) {
    if (cycle === '6 Months') return SUBSCRIPTION_PLANS.SILVER.price6Months
    if (cycle === 'Yearly') return SUBSCRIPTION_PLANS.SILVER.priceYearly
    return SUBSCRIPTION_PLANS.SILVER.priceMonthly
  }
  if (p.includes('gold')) {
    if (cycle === '6 Months') return SUBSCRIPTION_PLANS.GOLD.price6Months
    if (cycle === 'Yearly') return SUBSCRIPTION_PLANS.GOLD.priceYearly
    return SUBSCRIPTION_PLANS.GOLD.priceMonthly
  }
  if (p.includes('platinum')) {
    return calculatePlatinumPrice(platinumProjects, cycle)
  }
  if (p.includes('enterprise')) return 0
  return 0
}

/**
 * Plan Feature Permissions Matrix
 */
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

export function isSubscriptionExpired(subscription) {
  if (!subscription) return false
  if (subscription.isSubscriptionActive === false || subscription.status === 'EXPIRED') {
    return true
  }
  const endDateRaw = subscription.subscriptionEndDate || subscription.endDate
  if (endDateRaw) {
    const endDate = endDateRaw?.toDate ? endDateRaw.toDate() : new Date(endDateRaw)
    if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) {
      return true
    }
  }
  return false
}

export function calculateDaysRemaining(endDateRaw) {
  if (!endDateRaw) return 0
  const endDate = endDateRaw?.toDate ? endDateRaw.toDate() : new Date(endDateRaw)
  if (!endDate || Number.isNaN(endDate.getTime())) return 0
  const diffMs = endDate.getTime() - Date.now()
  if (diffMs <= 0) return 0
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

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
 * Calculate Quotas for a Plan
 */
export function calculatePlanQuotas(planName, platinumProjects = 10) {
  const p = String(planName || '').toLowerCase()
  if (p.includes('free') || p.includes('trial')) {
    return {
      planName: 'Free Trial',
      maxProjects: 1,
      maxUsers: 3,
      maxManagers: 1,
      maxSupervisors: 1,
      drawingPolicy: SUBSCRIPTION_PLANS.FREE_TRIAL.drawingPolicy,
    }
  }
  if (p.includes('silver')) {
    return {
      planName: 'Silver',
      maxProjects: 5,
      maxUsers: 5,
      maxManagers: 2,
      maxSupervisors: 2,
      drawingPolicy: SUBSCRIPTION_PLANS.SILVER.drawingPolicy,
    }
  }
  if (p.includes('gold')) {
    return {
      planName: 'Gold',
      maxProjects: 10,
      maxUsers: 15,
      maxManagers: 5,
      maxSupervisors: 10,
      drawingPolicy: SUBSCRIPTION_PLANS.GOLD.drawingPolicy,
    }
  }
  if (p.includes('platinum')) {
    const N = Math.max(5, Number(platinumProjects) || 10)
    return {
      planName: 'Platinum',
      maxProjects: N,
      maxManagers: Math.max(2, Math.min(25, Math.round(N / 2))),
      maxSupervisors: N,
      maxUsers: Math.round(N * 1.5),
      drawingPolicy: SUBSCRIPTION_PLANS.PLATINUM.drawingPolicy,
    }
  }
  if (p.includes('enterprise')) {
    return {
      planName: 'Enterprise',
      maxProjects: 999999,
      maxUsers: 999999,
      maxManagers: 999999,
      maxSupervisors: 999999,
      drawingPolicy: SUBSCRIPTION_PLANS.ENTERPRISE.drawingPolicy,
    }
  }
  return {
    planName: 'Free Trial',
    maxProjects: 1,
    maxUsers: 3,
    maxManagers: 1,
    maxSupervisors: 1,
    drawingPolicy: SUBSCRIPTION_PLANS.FREE_TRIAL.drawingPolicy,
  }
}

/**
 * Automatically checks and promotes queued plan when current plan end date passes.
 * Complies with Section 6.2 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 */
export async function checkAndPromoteQueuedSubscription(orgId, subscription) {
  if (!orgId || !subscription) return subscription

  const now = new Date()
  const endDate = subscription.subscriptionEndDate
    ? (subscription.subscriptionEndDate.toDate ? subscription.subscriptionEndDate.toDate() : new Date(subscription.subscriptionEndDate))
    : null

  if (endDate && endDate <= now) {
    if (subscription.isUpgradeQueued && subscription.queuedPlan) {
      const queuedPlan = subscription.queuedPlan
      const queuedType = subscription.queuedPlanType || 'Monthly'
      const queuedProjects = subscription.queuedPlatinumProjects || 10
      const quotas = calculatePlanQuotas(queuedPlan, queuedProjects)

      const queuedStart = subscription.queuedStartDate
        ? (subscription.queuedStartDate.toDate ? subscription.queuedStartDate.toDate() : new Date(subscription.queuedStartDate))
        : now
      const queuedEnd = subscription.queuedEndDate
        ? (subscription.queuedEndDate.toDate ? subscription.queuedEndDate.toDate() : new Date(subscription.queuedEndDate))
        : new Date(queuedStart.getTime() + 30 * 86400000)

      const payload = {
        subscriptionPlan: queuedPlan,
        subscriptionType: queuedType,
        subscriptionStartDate: Timestamp.fromDate(queuedStart),
        subscriptionEndDate: Timestamp.fromDate(queuedEnd),
        isSubscriptionActive: true,
        isUpgradeQueued: false,
        queuedPlan: null,
        queuedPlanType: null,
        queuedStartDate: null,
        queuedEndDate: null,
        queuedPaymentTxnId: null,
        queuedPaymentAmount: null,
        queuedPlatinumProjects: null,
        maxProjects: quotas.maxProjects,
        maxUsers: quotas.maxUsers,
        maxManagers: quotas.maxManagers,
        maxSupervisors: quotas.maxSupervisors,
        platinumProjects: queuedPlan.toLowerCase().includes('platinum') ? queuedProjects : null,
        updatedAt: serverTimestamp(),
      }

      try {
        const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')
        await setDoc(subRef, payload, { merge: true })
        await setDoc(
          doc(db, 'organisation', orgId),
          { subscription: payload, updatedAt: serverTimestamp() },
          { merge: true }
        )
      } catch (err) {
        console.warn('Error promoting queued subscription:', err)
      }

      return { ...subscription, ...payload }
    } else if (subscription.isSubscriptionActive) {
      // Revert to inactive status upon expiration without queue
      try {
        const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')
        await setDoc(subRef, { isSubscriptionActive: false, updatedAt: serverTimestamp() }, { merge: true })
        await setDoc(
          doc(db, 'organisation', orgId),
          { 'subscription.isSubscriptionActive': false, updatedAt: serverTimestamp() },
          { merge: true }
        )
      } catch (e) {}
      return { ...subscription, isSubscriptionActive: false }
    }
  }

  return subscription
}

/**
 * Fetch subscription config for an organization from Firestore
 */
export async function fetchSubscription(orgId) {
  if (!orgId) return null
  try {
    const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')
    const snap = await getDoc(subRef)
    if (snap.exists()) {
      const sub = { id: snap.id, ...snap.data() }
      return await checkAndPromoteQueuedSubscription(orgId, sub)
    }
    // Fallback check on root org doc
    const orgRef = doc(db, 'organisation', orgId)
    const orgSnap = await getDoc(orgRef)
    if (orgSnap.exists()) {
      const data = orgSnap.data()
      const sub = data.subscription || data.data?.subscription || null
      return sub ? await checkAndPromoteQueuedSubscription(orgId, sub) : null
    }
  } catch (err) {
    console.error('Error fetching subscription:', err)
  }
  return null
}

/**
 * Subscribe to real-time subscription config
 */
export function subscribeSubscription(orgId, onData, onError) {
  if (!orgId) return () => {}
  const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')
  return onSnapshot(
    subRef,
    async (snap) => {
      if (snap.exists()) {
        const sub = { id: snap.id, ...snap.data() }
        const verified = await checkAndPromoteQueuedSubscription(orgId, sub)
        onData(verified)
      } else {
        // Check root doc fallback
        getDoc(doc(db, 'organisation', orgId)).then(async (orgSnap) => {
          if (orgSnap.exists()) {
            const data = orgSnap.data()
            const sub = data.subscription || data.data?.subscription || null
            const verified = sub ? await checkAndPromoteQueuedSubscription(orgId, sub) : null
            onData(verified)
          } else {
            onData(null)
          }
        })
      }
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

/**
 * Update or Activate Subscription in Firestore
 */
export async function activateSubscription({
  orgId,
  planName,
  billingCycle = 'Monthly',
  amount = 0,
  paymentMethod = 'PayU UPI',
  paymentTxnId = null,
  payuMoneyId = null,
  isUpgradeQueued = false,
  platinumProjects = 10,
  currentSubscription = null,
}) {
  if (!orgId) throw new Error('Organization ID is required.')

  const quotas = calculatePlanQuotas(planName, platinumProjects)
  const txnId = paymentTxnId || generateTxnId('TXN')
  const pMoneyId = payuMoneyId || `PAYU_${Date.now()}`
  const now = new Date()

  let durationDays = 30
  if (billingCycle === '6 Months') durationDays = 180
  else if (billingCycle === 'Yearly') durationDays = 365
  else if (planName.toLowerCase().includes('trial')) durationDays = 14

  const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')

  if (isUpgradeQueued && currentSubscription?.subscriptionEndDate) {
    const curEnd = currentSubscription.subscriptionEndDate.toDate
      ? currentSubscription.subscriptionEndDate.toDate()
      : new Date(currentSubscription.subscriptionEndDate)
    const queuedEnd = new Date(curEnd.getTime() + durationDays * 86400000)

    const payload = {
      isUpgradeQueued: true,
      queuedPlan: planName,
      queuedPlanType: billingCycle,
      queuedStartDate: Timestamp.fromDate(curEnd),
      queuedEndDate: Timestamp.fromDate(queuedEnd),
      queuedPaymentTxnId: txnId,
      queuedPaymentAmount: Number(amount) || 0,
      queuedPlatinumProjects: platinumProjects,
      updatedAt: serverTimestamp(),
    }

    await setDoc(subRef, payload, { merge: true })
    return { status: 'QUEUED', payload, txnId }
  }

  // Immediate Activation
  const startDate = now
  const endDate = new Date(now.getTime() + durationDays * 86400000)

  const payload = {
    subscriptionPlan: planName,
    subscriptionType: billingCycle,
    subscriptionStartDate: Timestamp.fromDate(startDate),
    subscriptionEndDate: Timestamp.fromDate(endDate),
    isSubscriptionActive: true,
    onboardingStep: 'COMPLETED',
    maxProjects: quotas.maxProjects,
    maxUsers: quotas.maxUsers,
    maxManagers: quotas.maxManagers,
    maxSupervisors: quotas.maxSupervisors,
    paymentGateway: 'PayU',
    paymentTxnId: txnId,
    payuMoneyId: pMoneyId,
    paymentStatus: 'SUCCESS',
    paymentAmount: Number(amount) || 0,
    paymentMethod,
    platinumProjects: planName.toLowerCase().includes('platinum') ? platinumProjects : null,
    isUpgradeQueued: false,
    updatedAt: serverTimestamp(),
  }

  await setDoc(subRef, payload, { merge: true })

  // Mirror to root organisation doc for backward compatibility
  try {
    await setDoc(
      doc(db, 'organisation', orgId),
      {
        subscription: payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  } catch (e) {}

  return { status: 'ACTIVATED', payload, txnId }
}

/**
 * Quota & Access Control Checks
 */
export function checkQuotaLimits({
  subscription,
  currentSites = 0,
  currentManagers = 0,
  currentSupervisors = 0,
  currentUsers = 0,
}) {
  const plan = subscription?.subscriptionPlan || 'Free Trial'
  const isExpired = isSubscriptionExpired(subscription)
  const isTrial = plan.toLowerCase().includes('trial') || plan.toLowerCase().includes('free')
  const isTrialActive = isTrial && !isExpired

  // Eligible subscription users: 1 Admin + Managers + Supervisors. Workers are strictly excluded!
  const eligibleUsers = 1 + currentManagers + currentSupervisors

  const canAddTrialManager = !isExpired && currentManagers < 1 && eligibleUsers < 3
  const canAddTrialSupervisor = !isExpired && currentSupervisors < 1 && eligibleUsers < 3

  const quotas = calculatePlanQuotas(plan, subscription?.platinumProjects || 10)
  const maxSites = isTrialActive ? 999999 : (subscription?.maxProjects || quotas.maxProjects)
  const maxManagers = isTrialActive ? 1 : (subscription?.maxManagers || quotas.maxManagers)
  const maxSupervisors = isTrialActive ? 1 : (subscription?.maxSupervisors || quotas.maxSupervisors)
  const maxUsers = isTrialActive ? 3 : (subscription?.maxUsers || quotas.maxUsers)

  return {
    isExpired,
    isTrial,
    isTrialActive,
    canCreateSite: !isExpired && currentSites < maxSites,
    canAddManager: isTrialActive ? canAddTrialManager : (!isExpired && currentManagers < maxManagers && eligibleUsers < maxUsers),
    canAddSupervisor: isTrialActive ? canAddTrialSupervisor : (!isExpired && currentSupervisors < maxSupervisors && eligibleUsers < maxUsers),
    canAddUser: isTrialActive ? eligibleUsers < 3 : (!isExpired && eligibleUsers < maxUsers),
    maxSites,
    maxManagers,
    maxSupervisors,
    maxUsers,
    currentSites,
    currentManagers,
    currentSupervisors,
    currentUsers: eligibleUsers,
  }
}
