import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { generateTxnId } from './payuService'

/**
 * Subscription Plans, Quotas, Pricing & Quota Enforcement Service
 * Complies with SUBSCRIPTION_PLANS_AND_PAYMENT_FLOW_SPECIFICATION.txt
 */

export const SUBSCRIPTION_PLANS = {
  FREE_TRIAL: {
    id: 'free_trial',
    name: 'Free Trial',
    badge: '14-Day Free Access',
    durationDays: 14,
    priceMonthly: 0,
    price6Months: 0,
    priceYearly: 0,
    maxProjects: 1,
    maxUsers: 2,
    maxManagers: 1,
    maxSupervisors: 1,
    drawingPolicy: {
      maxActiveDocsPerSite: 1,
      allowDelete: false,
      allowReupload: false,
      description: '1 active doc per site (No delete/re-upload)',
    },
    features: [
      '1 Active Construction Site',
      '2 Total Team User Seats',
      'Basic Muster Roll & Daily Diaries',
      '1 Layout Drawing per site (View Only)',
      '14-Day Unrestricted Evaluation',
    ],
  },
  SILVER: {
    id: 'silver',
    name: 'Silver',
    badge: 'Standard Starter',
    priceMonthly: 1,
    price6Months: 594,
    priceYearly: 1188,
    monthlyEquivalent6Mo: 99,
    monthlyEquivalentYr: 99,
    maxProjects: 3,
    maxUsers: 5,
    maxManagers: 2,
    maxSupervisors: 3,
    drawingPolicy: {
      maxActiveDocsPerSite: 1,
      allowDelete: false,
      allowReupload: false,
      description: '1 active doc per site (View Only)',
    },
    features: [
      'Up to 3 Active Construction Sites',
      '5 Total Team User Seats',
      'Petty Cash Float & Expense Tracking',
      'Daily Site Progress Diaries & Photos',
      '1 Layout Drawing per site (View Only)',
      'Standard Audit & CSV Exports',
    ],
  },
  GOLD: {
    id: 'gold',
    name: 'Gold',
    badge: 'Most Popular',
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
      'Up to 10 Active Construction Sites',
      '15 Team Seats (5 Managers, 10 Supervisors)',
      '3-Tier Payment Approval Workflow Engine',
      'Material Indents & PO Procurement',
      'Subcontractor MB Sheets & Retention Deductions',
      '1 Drawing per site with Replace/Delete Support',
      'Priority Email Support',
    ],
  },
  PLATINUM: {
    id: 'platinum',
    name: 'Platinum',
    badge: 'Dynamic Scale',
    isDynamic: true,
    defaultProjects: 10,
    projectPresets: [5, 10, 15, 20, 25, 30, 40, 50],
    drawingPolicy: {
      maxActiveDocsPerSite: 2,
      allowDelete: true,
      allowReupload: true,
      multiDelete: true,
      multiReupload: true,
      description: '2 active docs per site (Multi-delete & Multi-reupload)',
    },
    features: [
      'Dynamic Site Capacity ({N} Sites)',
      '{maxUsers} Total Team Seats ({maxManagers} Managers, {maxSupervisors} Supervisors)',
      '2 Concurrent Architectural Layouts & Drawings per site',
      'Multi-Delete & Multi-Reupload for Drawings',
      'QA/QC Checklist Inspection & Safety Logging',
      'Customer Milestone Tax Invoicing & Realization',
      'Dedicated Account Support',
    ],
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    badge: 'Custom Deployment',
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
      'Unlimited Team User Seats',
      'Custom White Label Branding & Subdomain',
      'Dedicated Cloud Deployment & Guaranteed SLA',
      'Automated Daily Enterprise Backups',
      '24/7 Priority Phone & Live Chat Support',
    ],
  },
}

export const BILLING_CYCLES = [
  { id: 'Monthly', label: 'Monthly', days: 30, discount: null },
  { id: '6 Months', label: '6 Months', days: 180, discount: 'Save 10%' },
  { id: 'Yearly', label: 'Yearly (Best Value)', days: 365, discount: 'Save 20%' },
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
 * Calculate Quotas for a Plan
 */
export function calculatePlanQuotas(planName, platinumProjects = 10) {
  const p = String(planName || '').toLowerCase()
  if (p.includes('free') || p.includes('trial')) {
    return {
      maxProjects: 1,
      maxUsers: 2,
      maxManagers: 1,
      maxSupervisors: 1,
      drawingPolicy: SUBSCRIPTION_PLANS.FREE_TRIAL.drawingPolicy,
    }
  }
  if (p.includes('silver')) {
    return {
      maxProjects: 3,
      maxUsers: 5,
      maxManagers: 2,
      maxSupervisors: 3,
      drawingPolicy: SUBSCRIPTION_PLANS.SILVER.drawingPolicy,
    }
  }
  if (p.includes('gold')) {
    return {
      maxProjects: 10,
      maxUsers: 15,
      maxManagers: 5,
      maxSupervisors: 10,
      drawingPolicy: SUBSCRIPTION_PLANS.GOLD.drawingPolicy,
    }
  }
  if (p.includes('platinum')) {
    const N = Number(platinumProjects) || 10
    return {
      maxProjects: N,
      maxManagers: Math.max(2, Math.min(25, Math.floor(N / 2))),
      maxSupervisors: N,
      maxUsers: Math.round(N * 1.5),
      drawingPolicy: SUBSCRIPTION_PLANS.PLATINUM.drawingPolicy,
    }
  }
  if (p.includes('enterprise')) {
    return {
      maxProjects: 999999,
      maxUsers: 999999,
      maxManagers: 999999,
      maxSupervisors: 999999,
      drawingPolicy: SUBSCRIPTION_PLANS.ENTERPRISE.drawingPolicy,
    }
  }
  return {
    maxProjects: 1,
    maxUsers: 2,
    maxManagers: 1,
    maxSupervisors: 1,
    drawingPolicy: SUBSCRIPTION_PLANS.FREE_TRIAL.drawingPolicy,
  }
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
      return { id: snap.id, ...snap.data() }
    }
    // Fallback check on root org doc
    const orgRef = doc(db, 'organisation', orgId)
    const orgSnap = await getDoc(orgRef)
    if (orgSnap.exists()) {
      const data = orgSnap.data()
      return data.subscription || data.data?.subscription || null
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
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() })
      } else {
        // Check root doc fallback
        getDoc(doc(db, 'organisation', orgId)).then((orgSnap) => {
          if (orgSnap.exists()) {
            const data = orgSnap.data()
            onData(data.subscription || data.data?.subscription || null)
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
  const isExpired = subscription?.isSubscriptionActive === false ||
    (subscription?.subscriptionEndDate && (subscription.subscriptionEndDate.toDate ? subscription.subscriptionEndDate.toDate() : new Date(subscription.subscriptionEndDate)) < new Date())

  const maxSites = subscription?.maxProjects || (plan === 'Gold' ? 10 : plan === 'Silver' ? 3 : 1)
  const maxManagers = subscription?.maxManagers || (plan === 'Gold' ? 5 : plan === 'Silver' ? 2 : 1)
  const maxSupervisors = subscription?.maxSupervisors || (plan === 'Gold' ? 10 : plan === 'Silver' ? 3 : 1)
  const maxUsers = subscription?.maxUsers || (plan === 'Gold' ? 15 : plan === 'Silver' ? 5 : 2)

  return {
    isExpired,
    canCreateSite: !isExpired && currentSites < maxSites,
    canAddManager: !isExpired && currentManagers < maxManagers && currentUsers < maxUsers,
    canAddSupervisor: !isExpired && currentSupervisors < maxSupervisors && currentUsers < maxUsers,
    canAddUser: !isExpired && currentUsers < maxUsers,
    maxSites,
    maxManagers,
    maxSupervisors,
    maxUsers,
    currentSites,
    currentManagers,
    currentSupervisors,
    currentUsers,
  }
}
