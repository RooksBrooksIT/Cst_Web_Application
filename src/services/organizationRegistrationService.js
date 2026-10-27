import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
  setDoc,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from './firebase.js'
import { isGlobalUsernameUnique, addTakenUsernameToCache } from './usernameValidationService.js'
import { calculatePlanQuotas } from './subscriptionService.js'

// CST Namespace constants
export const CST_NAMESPACE_PREFIX = 'cst_'
export const CST_APP_ID = 'cst_white_label'

// Local storage draft key
export const PENDING_REGISTRATION_STORAGE_KEY = 'ebricks_pending_org_registration'

// 14 Curated Brand Color Palettes matching mobile documentation Section 4.3
export const BRAND_COLOR_PALETTE = [
  { id: 'green', name: 'Emerald Green', hex: '#00A86B' },
  { id: 'ocean-blue', name: 'Ocean Blue', hex: '#017FDF' },
  { id: 'teal-forest', name: 'Teal Forest', hex: '#008080' },
  { id: 'royal-purple', name: 'Royal Purple', hex: '#7C3AED' },
  { id: 'vibrant-orange', name: 'Vibrant Orange', hex: '#EA580C' },
  { id: 'cyan-wave', name: 'Cyan Wave', hex: '#06B6D4' },
  { id: 'crimson-red', name: 'Crimson Red', hex: '#DC2626' },
  { id: 'indigo', name: 'Enterprise Indigo', hex: '#4F46E5' },
  { id: 'amber-gold', name: 'Amber Gold', hex: '#F59E0B' },
  { id: 'lime-fresh', name: 'Lime Fresh', hex: '#84CC16' },
  { id: 'rose-pink', name: 'Modern Rose', hex: '#F43F5E' },
  { id: 'deep-violet', name: 'Electric Purple', hex: '#9333EA' },
  { id: 'midnight-dark', name: 'Midnight Dark', hex: '#0F172A' },
]

/**
 * Format date string matching mobile app standard: dd-MM-yyyy
 */
export function formatDateStamp(date = new Date()) {
  const d = new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/**
 * Clean organization name for document ID: remove all whitespace
 */
export function cleanOrgNameForId(orgName) {
  return String(orgName || '').replace(/\s+/g, '')
}

/**
 * Generate standard Organization Document ID:
 * Formula: orgId = "cst_" + cleanOrgName + "_" + dateStr
 * Example: cst_ApexBuildersPrivateLimited_27-10-2026
 */
export function generateOrgId(orgName, dateStr = null) {
  const clean = cleanOrgNameForId(orgName)
  const dStr = dateStr || formatDateStamp()
  return `${CST_NAMESPACE_PREFIX}${clean}_${dStr}`
}

/**
 * Validate CST Organization ID
 */
export function isCstOrgId(orgId) {
  if (!orgId) return false
  const s = String(orgId).toLowerCase()
  return s.startsWith(CST_NAMESPACE_PREFIX) || s.includes('cst')
}

/**
 * Generate unique 6-character alphanumeric uppercase referral code
 */
export async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    try {
      // Check if code is already taken in root organisation or data/referralCode
      const q = query(collection(db, 'organisation'), where('referralCode', '==', code), limit(1))
      const snap = await getDocs(q)
      if (snap.empty) {
        return code
      }
    } catch (_err) {
      return code
    }
  }
  return `CST${Math.floor(100 + Math.random() * 900)}`
}

/**
 * Live Password Strength & Entropy Scorer (Section 3.2 Field 5)
 * Returns { score (0-5), label, color, percent }
 */
export function calculatePasswordEntropy(password) {
  if (!password) {
    return { score: 0, label: 'Empty', color: 'bg-slate-200', textClass: 'text-slate-400', percent: '0%' }
  }

  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[a-z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1

  if (score <= 2) {
    return { score, label: 'Weak', color: 'bg-rose-500', textClass: 'text-rose-600', percent: '33%' }
  }
  if (score <= 4) {
    return { score, label: 'Moderate', color: 'bg-amber-500', textClass: 'text-amber-600', percent: '66%' }
  }
  return { score, label: 'Strong', color: 'bg-emerald-500', textClass: 'text-emerald-600', percent: '100%' }
}

/**
 * Check if a Firestore document is a Pending Registration (Section 3.5)
 */
export function isPendingRegistrationDoc(data) {
  if (!data || typeof data !== 'object') return false
  const isSubActive = data.isSubscriptionActive === true
  if (isSubActive) return false

  const step = data.onboardingStep
  const subPlan = data.subscriptionPlan
  const paymentStatus = data.paymentStatus

  return (
    step === 'PAYMENT_PENDING' ||
    subPlan === 'Pending Selection' ||
    (!subPlan && paymentStatus === 'PENDING') ||
    paymentStatus === 'PENDING'
  )
}

/**
 * Real-time Debounced Organization Name Validation (Section 3.3 Field 1)
 */
export async function isOrgNameUnique(orgName) {
  const clean = String(orgName || '').trim()
  if (!clean || clean.length < 2) {
    return {
      isUnique: false,
      message: 'Organization name must be at least 2 characters.',
      isPending: false,
    }
  }

  const cleanLower = clean.toLowerCase()
  const cleanNoSpaceLower = clean.replace(/\s+/g, '').toLowerCase()

  try {
    const snap = await getDocs(collection(db, 'organisation'))
    for (const d of snap.docs) {
      const data = d.data() || {}
      const docOrgName = String(data.org_name || data.orgName || '').trim().toLowerCase()
      const docOrgNoSpace = docOrgName.replace(/\s+/g, '')
      const docIdLower = d.id.toLowerCase()

      const isMatch =
        docOrgName === cleanLower ||
        docOrgNoSpace === cleanNoSpaceLower ||
        docIdLower.startsWith(`cst_${cleanNoSpaceLower}_`)

      if (isMatch) {
        const isPending = isPendingRegistrationDoc(data)
        return {
          isUnique: false,
          isPending,
          pendingData: isPending ? { id: d.id, ...data } : null,
          message: isPending
            ? 'A pending registration exists for this organization. You can resume payment.'
            : 'Organization name already exists. Please use a different name.',
        }
      }
    }

    return {
      isUnique: true,
      message: 'Organization name is available ✓',
      isPending: false,
    }
  } catch (err) {
    console.warn('isOrgNameUnique error:', err)
    return {
      isUnique: true,
      message: 'Organization name is available ✓',
      isPending: false,
    }
  }
}

/**
 * Real-time Debounced Corporate Email Validation (Section 3.3 Field 2)
 */
export async function isGlobalEmailUnique(email) {
  const clean = String(email || '').trim().toLowerCase()
  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/

  if (!clean || !emailRegex.test(clean)) {
    return {
      isUnique: false,
      message: 'Please enter a valid corporate email address.',
    }
  }

  try {
    // 1. Root organisation documents
    const orgSnap = await getDocs(collection(db, 'organisation'))
    for (const d of orgSnap.docs) {
      const data = d.data() || {}
      const docEmail = String(data.email || data.Email || '').trim().toLowerCase()
      if (docEmail === clean) {
        const isPending = isPendingRegistrationDoc(data)
        return {
          isUnique: false,
          isPending,
          pendingData: isPending ? { id: d.id, ...data } : null,
          message: 'Email address already registered.',
        }
      }
    }

    // 2. CollectionGroup queries
    const groupNames = ['manager', 'supervisor', 'supervisors', 'organizationUser', 'configUsers']
    const groupChecks = groupNames.map((name) =>
      getDocs(query(collectionGroup(db, name), where('email', '==', clean), limit(1))).catch(() => null)
    )

    const groupResults = await Promise.all(groupChecks)
    for (const res of groupResults) {
      if (res && !res.empty) {
        return {
          isUnique: false,
          message: 'Email address already registered with another account.',
        }
      }
    }

    return {
      isUnique: true,
      message: 'Email address is available ✓',
    }
  } catch (err) {
    console.warn('isGlobalEmailUnique error:', err)
    return {
      isUnique: true,
      message: 'Email address is available ✓',
    }
  }
}

/**
 * Real-time Debounced Contact Phone Validation (Section 3.3 Field 3)
 */
export async function isGlobalPhoneUnique(phone) {
  const digits = String(phone || '').replace(/\D/g, '')

  if (digits.length !== 10) {
    return {
      isUnique: false,
      message: 'Please enter a valid 10-digit mobile number.',
    }
  }

  try {
    // 1. Root organisation documents
    const orgSnap = await getDocs(collection(db, 'organisation'))
    const phoneKeys = ['phone', 'phoneNumber', 'mobile', 'contactNo', 'ContactNo']

    for (const d of orgSnap.docs) {
      const data = d.data() || {}
      for (const k of phoneKeys) {
        const val = String(data[k] || '').replace(/\D/g, '')
        if (val === digits) {
          const isPending = isPendingRegistrationDoc(data)
          return {
            isUnique: false,
            isPending,
            pendingData: isPending ? { id: d.id, ...data } : null,
            message: 'Phone number already registered.',
          }
        }
      }
    }

    // 2. CollectionGroup queries
    const groupNames = ['manager', 'supervisor', 'supervisors', 'organizationUser', 'configUsers', 'customers']
    const groupChecks = groupNames.map((name) =>
      getDocs(query(collectionGroup(db, name), where('phone', '==', digits), limit(1))).catch(() => null)
    )

    const groupResults = await Promise.all(groupChecks)
    for (const res of groupResults) {
      if (res && !res.empty) {
        return {
          isUnique: false,
          message: 'Phone number already registered.',
        }
      }
    }

    return {
      isUnique: true,
      message: 'Phone number is available ✓',
    }
  } catch (err) {
    console.warn('isGlobalPhoneUnique error:', err)
    return {
      isUnique: true,
      message: 'Phone number is available ✓',
    }
  }
}

/**
 * Simultaneous Multi-Field Atomic Validation (Section 3.4 & 3.5)
 */
export async function validateOrganizationRegistration({ orgName, email, phone, username }) {
  const [orgNameRes, emailRes, phoneRes, usernameRes] = await Promise.all([
    isOrgNameUnique(orgName),
    isGlobalEmailUnique(email),
    isGlobalPhoneUnique(phone),
    isGlobalUsernameUnique(username),
  ])

  const isOrgNameDuplicate = !orgNameRes.isUnique
  const isEmailDuplicate = !emailRes.isUnique
  const isPhoneDuplicate = !phoneRes.isUnique
  const isUsernameDuplicate = !usernameRes.isUnique

  const isValid = !isOrgNameDuplicate && !isEmailDuplicate && !isPhoneDuplicate && !isUsernameDuplicate

  let errorMessage = ''
  if (isOrgNameDuplicate) errorMessage = orgNameRes.message
  else if (isEmailDuplicate) errorMessage = emailRes.message
  else if (isPhoneDuplicate) errorMessage = phoneRes.message
  else if (isUsernameDuplicate) errorMessage = usernameRes.message

  // Check if any duplicate matches a Pending Registration awaiting payment
  const isPending = Boolean(
    orgNameRes.isPending ||
    emailRes.isPending ||
    phoneRes.isPending
  )

  const pendingData =
    orgNameRes.pendingData ||
    emailRes.pendingData ||
    phoneRes.pendingData ||
    null

  return {
    isValid,
    errorMessage,
    isOrgNameDuplicate,
    isEmailDuplicate,
    isPhoneDuplicate,
    isUsernameDuplicate,
    isPending,
    pendingData,
  }
}

/**
 * Find Pending Registration for an identifier (username, email, or orgName)
 */
export async function findPendingRegistration(identifier) {
  if (!identifier) return null
  const cleanLower = String(identifier).trim().toLowerCase()

  try {
    const snap = await getDocs(collection(db, 'organisation'))
    for (const d of snap.docs) {
      const data = d.data() || {}
      const orgName = String(data.org_name || data.orgName || '').toLowerCase()
      const email = String(data.email || '').toLowerCase()
      const username = String(data.username || '').toLowerCase()
      const id = d.id.toLowerCase()

      if (
        orgName === cleanLower ||
        email === cleanLower ||
        username === cleanLower ||
        id === cleanLower ||
        id.includes(cleanLower)
      ) {
        if (isPendingRegistrationDoc(data)) {
          return { id: d.id, ...data }
        }
      }
    }
  } catch (err) {
    console.warn('findPendingRegistration error:', err)
  }
  return null
}

/**
 * Step 2: Multi-Document Batch Persistence for Pending Registration (Section 4.6)
 */
export async function createPendingOrganizationRegistration({
  orgName,
  appName,
  themeColor = '#00A86B',
  email,
  phone,
  username,
  password,
  dateStr = null,
  referralCode = null,
}) {
  const dStr = dateStr || formatDateStamp()
  const orgId = generateOrgId(orgName, dStr)
  const finalAppName = (appName || orgName || 'eBricks').trim()
  const finalReferralCode = referralCode || (await generateUniqueReferralCode())

  const batch = writeBatch(db)

  // Doc 1: /organisation/{orgId} (Root doc)
  const rootRef = doc(db, 'organisation', orgId)
  batch.set(rootRef, {
    app_id: CST_APP_ID,
    app_type: CST_APP_ID,
    is_cst_app: true,
    org_name: orgName,
    app_name: finalAppName,
    theme_color: themeColor,
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    username: username.trim().toLowerCase(),
    password: password,
    role: 'Organization',
    registrationStatus: 'COMPLETED',
    onboardingStep: 'PAYMENT_PENDING',
    isSubscriptionActive: false,
    paymentStatus: 'PENDING',
    subscriptionPlan: 'Pending Selection',
    subscriptionType: '',
    referralCode: finalReferralCode,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }, { merge: true })

  // Doc 2: /organisation/{orgId}/data/admin
  const adminRef = doc(db, 'organisation', orgId, 'data', 'admin')
  batch.set(adminRef, {
    app_id: CST_APP_ID,
    is_cst_app: true,
    username: username.trim().toLowerCase(),
    password: password,
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    role: 'Organization',
    org_name: orgName,
    created_at: serverTimestamp(),
  }, { merge: true })

  // Doc 3: /organisation/{orgId}/data/branding
  const brandingRef = doc(db, 'organisation', orgId, 'data', 'branding')
  batch.set(brandingRef, {
    app_id: CST_APP_ID,
    appName: finalAppName,
    app_name: finalAppName,
    primaryColor: themeColor,
    theme_color: themeColor,
    updated_at: serverTimestamp(),
  }, { merge: true })

  // Doc 4: /organisation/{orgId}/data/referralCode
  const referralRef = doc(db, 'organisation', orgId, 'data', 'referralCode')
  batch.set(referralRef, {
    app_id: CST_APP_ID,
    referralCode: finalReferralCode,
    orgReferralCode: finalReferralCode,
    created_at: serverTimestamp(),
  }, { merge: true })

  // Doc 5: /organisation/{orgId}/data/subscription
  const subRef = doc(db, 'organisation', orgId, 'data', 'subscription')
  batch.set(subRef, {
    app_id: CST_APP_ID,
    isSubscriptionActive: false,
    subscriptionPlan: 'Pending Selection',
    onboardingStep: 'PAYMENT_PENDING',
    paymentStatus: 'PENDING',
    updatedAt: serverTimestamp(),
  }, { merge: true })

  // Doc 6: /organisation/{orgId}/organizationUser/{username}
  const userRef = doc(db, 'organisation', orgId, 'organizationUser', username.trim().toLowerCase())
  batch.set(userRef, {
    app_id: CST_APP_ID,
    username: username.trim().toLowerCase(),
    password: password,
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    role: 'Organization',
    org_name: orgName,
    created_at: serverTimestamp(),
  }, { merge: true })

  // Commit batch write
  await batch.commit()

  // Add username to taken cache immediately
  addTakenUsernameToCache(username)

  // Firebase Auth sync (creates the managed user account)
  try {
    await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  } catch (authErr) {
    if (authErr.code !== 'auth/email-already-in-use') {
      console.warn('Firebase Auth create error (non-fatal):', authErr.message)
    }
  }

  // Save local recovery draft
  savePendingRegistrationDraft({
    orgId,
    orgName,
    appName: finalAppName,
    themeColor,
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    username: username.trim().toLowerCase(),
    password,
    dateStr: dStr,
    referralCode: finalReferralCode,
  })

  return { orgId, referralCode: finalReferralCode }
}

/**
 * Step 3: Complete Free Trial Activation (Direct ₹0 Activation)
 */
export async function completeFreeTrialActivation({
  orgId,
  orgName,
  appName,
  themeColor = '#00A86B',
  email,
  phone,
  username,
  password,
  referralCode = '',
}) {
  if (!orgId) throw new Error('orgId is required')

  const now = new Date()
  const durationDays = 14
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)

  const quotas = calculatePlanQuotas('Free Trial')

  const subscriptionPayload = {
    app_id: CST_APP_ID,
    subscriptionPlan: 'Free Trial',
    subscriptionType: 'Free Trial',
    subscriptionStartDate: Timestamp.fromDate(now),
    subscriptionEndDate: Timestamp.fromDate(endDate),
    isSubscriptionActive: true,
    onboardingStep: 'COMPLETED',
    registrationStatus: 'COMPLETED',
    maxProjects: quotas.maxProjects,
    maxUsers: quotas.maxUsers,
    maxManagers: quotas.maxManagers,
    maxSupervisors: quotas.maxSupervisors,
    paymentGateway: 'None',
    paymentStatus: 'SUCCESS',
    paymentAmount: 0,
    payerName: orgName,
    payerEmail: email,
    payerPhone: phone,
    updatedAt: serverTimestamp(),
  }

  const batch = writeBatch(db)

  // 1. Update /organisation/{orgId}/data/subscription
  batch.set(doc(db, 'organisation', orgId, 'data', 'subscription'), subscriptionPayload, { merge: true })

  // 2. Update root /organisation/{orgId}
  batch.set(
    doc(db, 'organisation', orgId),
    {
      ...subscriptionPayload,
      subscription: subscriptionPayload,
      isSubscriptionActive: true,
      onboardingStep: 'COMPLETED',
      registrationStatus: 'COMPLETED',
      updated_at: serverTimestamp(),
    },
    { merge: true }
  )

  await batch.commit()

  // Cloud Function: Send Free Trial activation invoice/welcome email (Non-blocking)
  try {
    const sendInvoice = httpsCallable(functions, 'sendNewSubscriptionInvoice')
    sendInvoice({
      orgId,
      orgName,
      email,
      username,
      planName: 'Free Trial',
      durationDays: 14,
      expiryDate: endDate.toISOString(),
    }).catch((e) => console.warn('sendNewSubscriptionInvoice notice:', e.message))
  } catch (_e) {}

  // Clear local pending recovery draft
  clearPendingRegistrationDraft()

  return {
    success: true,
    orgId,
    planName: 'Free Trial',
    startDate: now,
    endDate,
  }
}

/**
 * Step 3: Complete Paid Plan Activation (PayU Verified Payment)
 */
export async function completePaidPlanActivation({
  orgId,
  orgName,
  appName,
  themeColor = '#00A86B',
  email,
  phone,
  username,
  password,
  planName = 'Gold',
  billingCycle = 'Yearly',
  amount = 0,
  txnId = null,
  payuMoneyId = null,
  paymentMethod = 'PayU Gateway',
  platinumProjects = 10,
  rawData = {},
}) {
  if (!orgId) throw new Error('orgId is required')

  const now = new Date()
  let durationDays = 30
  if (billingCycle === '6 Months') durationDays = 180
  else if (billingCycle === 'Yearly') durationDays = 365

  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
  const quotas = calculatePlanQuotas(planName, platinumProjects)

  const finalTxnId = txnId || `PAYU_${Date.now()}`
  const finalPayuMoneyId = payuMoneyId || `PAYU_REF_${Date.now()}`

  const subscriptionPayload = {
    app_id: CST_APP_ID,
    subscriptionPlan: planName,
    subscriptionType: billingCycle,
    subscriptionStartDate: Timestamp.fromDate(now),
    subscriptionEndDate: Timestamp.fromDate(endDate),
    isSubscriptionActive: true,
    onboardingStep: 'COMPLETED',
    registrationStatus: 'COMPLETED',
    maxProjects: quotas.maxProjects,
    maxUsers: quotas.maxUsers,
    maxManagers: quotas.maxManagers,
    maxSupervisors: quotas.maxSupervisors,
    paymentGateway: 'PayU',
    paymentTxnId: finalTxnId,
    payuMoneyId: finalPayuMoneyId,
    paymentStatus: 'SUCCESS',
    paymentAmount: Number(amount) || 0,
    paymentMethod,
    platinumProjects: planName.toLowerCase().includes('platinum') ? platinumProjects : null,
    payerName: orgName,
    payerEmail: email,
    payerPhone: phone,
    updatedAt: serverTimestamp(),
  }

  const batch = writeBatch(db)

  // 1. Update /organisation/{orgId}/data/subscription
  batch.set(doc(db, 'organisation', orgId, 'data', 'subscription'), subscriptionPayload, { merge: true })

  // 2. Update root /organisation/{orgId}
  batch.set(
    doc(db, 'organisation', orgId),
    {
      ...subscriptionPayload,
      subscription: subscriptionPayload,
      isSubscriptionActive: true,
      onboardingStep: 'COMPLETED',
      registrationStatus: 'COMPLETED',
      updated_at: serverTimestamp(),
    },
    { merge: true }
  )

  await batch.commit()

  // Cloud Function: Verify subscription & send tax invoice email (Non-blocking)
  try {
    const verifySubFn = httpsCallable(functions, 'verifySubscription')
    verifySubFn({
      orgId,
      txnid: finalTxnId,
      payuMoneyId: finalPayuMoneyId,
      rawData: {
        txnid: finalTxnId,
        amount: String(amount),
        status: 'success',
        ...rawData,
      },
      planDetails: {
        planName,
        planType: billingCycle,
        amount: Number(amount),
        payerName: orgName,
        payerEmail: email,
        payerPhone: phone,
        username,
      },
    }).catch((e) => console.warn('verifySubscription function notice:', e.message))
  } catch (_e) {}

  // Clear local pending recovery draft
  clearPendingRegistrationDraft()

  return {
    success: true,
    orgId,
    txnId: finalTxnId,
    payuMoneyId: finalPayuMoneyId,
    planName,
    billingCycle,
    amount,
    startDate: now,
    endDate,
    paymentMethod,
  }
}

/**
 * Local Draft Storage Helpers
 */
export function savePendingRegistrationDraft(data) {
  if (!data) return
  try {
    localStorage.setItem(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify(data))
    if (data.orgId) localStorage.setItem('pending_org_id', data.orgId)
    if (data.orgName) localStorage.setItem('pending_org_name', data.orgName)
    if (data.email) localStorage.setItem('pending_email', data.email)
    if (data.phone) localStorage.setItem('pending_phone', data.phone)
    if (data.username) localStorage.setItem('pending_username', data.username)
    if (data.password) localStorage.setItem('pending_password', data.password)
    if (data.appName) localStorage.setItem('pending_app_name', data.appName)
    if (data.themeColor) localStorage.setItem('pending_theme_color', data.themeColor)
    if (data.dateStr) localStorage.setItem('pending_date_str', data.dateStr)
  } catch (e) {
    console.warn('Draft save notice:', e)
  }
}

export function getPendingRegistrationDraft() {
  try {
    const raw = localStorage.getItem(PENDING_REGISTRATION_STORAGE_KEY)
    if (raw) return JSON.parse(raw)

    const orgId = localStorage.getItem('pending_org_id')
    if (orgId) {
      return {
        orgId,
        orgName: localStorage.getItem('pending_org_name') || '',
        email: localStorage.getItem('pending_email') || '',
        phone: localStorage.getItem('pending_phone') || '',
        username: localStorage.getItem('pending_username') || '',
        password: localStorage.getItem('pending_password') || '',
        appName: localStorage.getItem('pending_app_name') || '',
        themeColor: localStorage.getItem('pending_theme_color') || '#00A86B',
        dateStr: localStorage.getItem('pending_date_str') || formatDateStamp(),
      }
    }
  } catch (e) {
    console.warn('Draft read notice:', e)
  }
  return null
}

export function clearPendingRegistrationDraft() {
  try {
    localStorage.removeItem(PENDING_REGISTRATION_STORAGE_KEY)
    localStorage.removeItem('pending_org_id')
    localStorage.removeItem('pending_org_name')
    localStorage.removeItem('pending_email')
    localStorage.removeItem('pending_phone')
    localStorage.removeItem('pending_username')
    localStorage.removeItem('pending_password')
    localStorage.removeItem('pending_app_name')
    localStorage.removeItem('pending_theme_color')
    localStorage.removeItem('pending_date_str')
  } catch (e) {}
}
