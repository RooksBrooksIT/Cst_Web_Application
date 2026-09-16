import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { auth, db, persistenceReady } from './firebase'

const SESSION_KEY = 'constructa_session'

function normalizeRole(value) {
  const role = String(value || '').toLowerCase().replace(/[_.-]/g, ' ').trim()
  if (
    role === 'organization' ||
    role === 'organization admin' ||
    role === 'admin' ||
    role === 'org' ||
    role === 'organisation' ||
    role === 'enterprise'
  ) {
    return 'Organization'
  }
  if (
    role === 'manager' ||
    role === 'operations manager' ||
    role === 'site manager' ||
    role === 'project manager' ||
    role.includes('manager') ||
    role === 'config user' ||
    role === 'config' ||
    role === 'config_user' ||
    role === 'supervisor'
  ) {
    return 'Manager'
  }
  return null
}

function extractFieldValue(data, keys) {
  if (!data || typeof data !== 'object') return ''
  const lowerKeys = keys.map((k) => k.toLowerCase())
  for (const [k, v] of Object.entries(data)) {
    if (lowerKeys.includes(k.toLowerCase()) && v !== undefined && v !== null) {
      return String(v).trim()
    }
  }
  return ''
}

async function authenticate(email, password) {
  if (!email || !email.includes('@')) {
    throw Object.assign(new Error('Invalid email format for Firebase Auth.'), { code: 'auth/invalid-email' })
  }
  await persistenceReady
  return signInWithEmailAndPassword(auth, email, password)
}

function ensureSubscription(organization) {
  if (!organization) return
  const subscription = organization.subscription || organization.data?.subscription
  if (!subscription) return
  const active = subscription.isSubscriptionActive
  const endDate = subscription.subscriptionEndDate?.toDate?.() || new Date(subscription.subscriptionEndDate)
  if (active === false || (subscription.subscriptionEndDate && endDate < new Date())) {
    const error = new Error('This organization subscription is inactive or expired.')
    error.code = 'auth/subscription-inactive'
    throw error
  }
}

function createSession(uid, email, orgId, role, profile) {
  const fullName =
    extractFieldValue(profile, ['FullName', 'fullName', 'UserName', 'userName', 'name', 'Name']) ||
    email ||
    'User'

  const session = {
    isLoggedIn: true,
    uid: String(uid || extractFieldValue(profile, ['ManagerId', 'managerId', 'uid', 'userId']) || 'user_' + Date.now()),
    email: email || extractFieldValue(profile, ['Email', 'email', 'UserEmail']) || '',
    orgId: String(orgId || 'default_org'),
    role: role || 'Organization',
    userData: {
      ...profile,
      fullName,
      email: email || extractFieldValue(profile, ['Email', 'email', 'UserEmail']) || '',
    },
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

// ------------------------------------------------------------------------------------------------
// HIGH-SPEED MANAGER LOOKUP & AUTHENTICATION
// ------------------------------------------------------------------------------------------------
async function loginManager(identifier, password) {
  const rawId = (identifier || '').trim()
  const idLower = rawId.toLowerCase()
  const rawPassword = (password || '').trim()
  const digitsOnly = rawId.replace(/\D/g, '')

  if (!rawId || !rawPassword) {
    throw Object.assign(new Error('Please enter both identifier and password.'), { code: 'auth/invalid-credential' })
  }

  let directAuthPromise = null
  if (rawId.includes('@')) {
    directAuthPromise = authenticate(rawId, rawPassword).catch(() => null)
  }

  const candidatePromises = []

  // Top-level collections
  const topColNames = [
    'manager',
    'managers',
    'Manager',
    'Managers',
    'config_users',
    'config_user',
    'configUsers',
    'users',
    'Users',
  ]

  topColNames.forEach((colName) => {
    candidatePromises.push(
      getDocs(collection(db, colName))
        .then((s) => s.docs.map((d) => ({ doc: d, orgId: d.data()?.orgId || d.data()?.organisationId || 'org_main' })))
        .catch(() => [])
    )
  })

  // Organization sub-collections
  const orgColNames = ['organisation', 'organisations', 'organization', 'organizations', 'Organisation', 'Organization']
  const orgDocs = []

  for (const orgCol of orgColNames) {
    try {
      const snap = await getDocs(collection(db, orgCol))
      snap.docs.forEach((d) => orgDocs.push({ id: d.id, col: orgCol }))
    } catch (e) {}
  }

  const uniqueOrgs = []
  const seenOrgIds = new Set()
  orgDocs.forEach((o) => {
    if (!seenOrgIds.has(o.id)) {
      seenOrgIds.add(o.id)
      uniqueOrgs.push(o)
    }
  })

  const subColNames = [
    'manager',
    'managers',
    'Manager',
    'Managers',
    'config_users',
    'config_user',
    'configUsers',
    'users',
    'Users',
    'team',
    'Team',
    'staff',
  ]

  uniqueOrgs.forEach(({ id: orgId, col: orgCol }) => {
    subColNames.forEach((subCol) => {
      candidatePromises.push(
        getDocs(collection(db, orgCol, orgId, subCol))
          .then((s) => s.docs.map((d) => ({ doc: d, orgId })))
          .catch(() => [])
      )
    })
  })

  const allGroups = await Promise.all(candidatePromises)
  const allCandidates = allGroups.flat()

  for (const item of allCandidates) {
    const data = item.doc.data() || {}
    const docId = item.doc.id
    const orgId = item.orgId

    const userName = extractFieldValue(data, ['UserName', 'username', 'userName', 'Name', 'name'])
    const email = extractFieldValue(data, ['Email', 'email', 'UserEmail'])
    const contactNo = extractFieldValue(data, ['ContactNo', 'contactNo', 'phone', 'Phone', 'Mobile', 'mobile', 'phoneNumber'])
    const managerId = extractFieldValue(data, ['ManagerId', 'managerId', 'id', 'uid']) || docId
    const storedPassword = extractFieldValue(data, ['Password', 'password', 'pass', 'pin'])
    const status = extractFieldValue(data, ['Status', 'status']) || 'Active'

    const contactDigits = contactNo.replace(/\D/g, '')

    const isMatch =
      (userName && userName.toLowerCase() === idLower) ||
      (email && email.toLowerCase() === idLower) ||
      (managerId && managerId.toLowerCase() === idLower) ||
      (contactNo && contactNo.toLowerCase() === idLower) ||
      (digitsOnly && contactDigits && digitsOnly.length >= 8 && contactDigits.endsWith(digitsOnly)) ||
      docId.toLowerCase() === idLower

    if (isMatch) {
      if (status && !['active', 'approved', 'enabled', 'verified'].includes(status.toLowerCase())) {
        throw Object.assign(
          new Error(`Manager account status is "${status}". Please contact your administrator.`),
          { code: 'auth/account-inactive' }
        )
      }

      if (storedPassword && storedPassword === rawPassword) {
        const directAuthCreds = directAuthPromise ? await directAuthPromise : null
        const uid = directAuthCreds?.user?.uid || managerId || docId
        const finalEmail = email || directAuthCreds?.user?.email || `${userName || docId}@ebricks.local`
        return createSession(uid, finalEmail, orgId, 'Manager', data)
      }

      if (email && email.includes('@')) {
        try {
          const creds = await authenticate(email, rawPassword)
          return createSession(creds.user.uid, creds.user.email, orgId, 'Manager', data)
        } catch (authErr) {
          if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
            throw Object.assign(new Error('The password entered is incorrect.'), { code: 'auth/wrong-password' })
          }
        }
      }

      if (storedPassword && storedPassword !== rawPassword) {
        throw Object.assign(new Error('The password entered is incorrect.'), { code: 'auth/wrong-password' })
      }
    }
  }

  if (directAuthPromise) {
    const creds = await directAuthPromise
    if (creds) {
      return createSession(creds.user.uid, creds.user.email, uniqueOrgs[0]?.id || 'org_main', 'Manager', {
        email: creds.user.email,
        fullName: creds.user.displayName || creds.user.email,
      })
    }
  }

  throw Object.assign(
    new Error('Manager account not found.'),
    { code: 'auth/user-not-found' }
  )
}

// ------------------------------------------------------------------------------------------------
// HIGH-SPEED ORGANIZATION LOOKUP & AUTHENTICATION
// ------------------------------------------------------------------------------------------------
async function loginOrganization(identifier, password) {
  const rawId = (identifier || '').trim()
  const idLower = rawId.toLowerCase()
  const rawPassword = (password || '').trim()

  if (!rawId || !rawPassword) {
    throw Object.assign(new Error('Please enter both identifier and password.'), { code: 'auth/invalid-credential' })
  }

  const orgColNames = ['organisation', 'organisations', 'organization', 'organizations', 'Organisation', 'Organization']
  const allOrgDocs = []

  for (const orgCol of orgColNames) {
    try {
      const snap = await getDocs(collection(db, orgCol))
      snap.docs.forEach((d) => allOrgDocs.push({ doc: d, col: orgCol }))
    } catch (e) {}
  }

  for (const { doc: orgDoc, col: orgCol } of allOrgDocs) {
    const orgData = orgDoc.data() || {}
    const orgId = orgDoc.id

    const orgEmail = extractFieldValue(orgData, ['email', 'Email'])
    const orgUsername = extractFieldValue(orgData, ['username', 'UserName'])
    const orgPhone = extractFieldValue(orgData, ['phone', 'Phone', 'contactNo'])
    const orgName = extractFieldValue(orgData, ['org_name', 'companyName', 'organizationName'])
    const orgIdField = extractFieldValue(orgData, ['organizationId', 'orgId']) || orgId

    let adminData = null
    try {
      const adminSnap = await getDoc(doc(db, orgCol, orgId, 'data', 'admin'))
      if (adminSnap.exists()) adminData = adminSnap.data()
    } catch (e) {}

    const adminEmail = extractFieldValue(adminData, ['email', 'Email'])
    const adminUsername = extractFieldValue(adminData, ['username', 'UserName'])
    const adminPhone = extractFieldValue(adminData, ['phone', 'Phone'])
    const adminPassword = extractFieldValue(adminData, ['Password', 'password', 'pass'])
    const orgPassword = extractFieldValue(orgData, ['Password', 'password', 'pass'])

    const isMatch =
      orgId.toLowerCase() === idLower ||
      (orgEmail && orgEmail.toLowerCase() === idLower) ||
      (orgUsername && orgUsername.toLowerCase() === idLower) ||
      (orgPhone && orgPhone.toLowerCase() === idLower) ||
      (orgName && orgName.toLowerCase() === idLower) ||
      (orgIdField && orgIdField.toLowerCase() === idLower) ||
      (adminEmail && adminEmail.toLowerCase() === idLower) ||
      (adminUsername && adminUsername.toLowerCase() === idLower) ||
      (adminPhone && adminPhone.toLowerCase() === idLower)

    if (isMatch) {
      ensureSubscription(orgData)

      const storedPassword = adminPassword || orgPassword
      if (storedPassword && storedPassword === rawPassword) {
        return createSession(orgId, adminEmail || orgEmail || `${orgId}@ebricks.local`, orgId, 'Organization', adminData || orgData)
      }

      const emailToAuth = adminEmail || orgEmail || (rawId.includes('@') ? rawId : '')
      if (emailToAuth && emailToAuth.includes('@')) {
        try {
          const creds = await authenticate(emailToAuth, rawPassword)
          return createSession(creds.user.uid, creds.user.email, orgId, 'Organization', adminData || orgData)
        } catch (authErr) {
          if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
            throw Object.assign(new Error('The password entered is incorrect.'), { code: 'auth/wrong-password' })
          }
        }
      }

      if (storedPassword && storedPassword !== rawPassword) {
        throw Object.assign(new Error('The password entered is incorrect.'), { code: 'auth/wrong-password' })
      }
    }
  }

  // Direct Firebase Auth fallback
  if (rawId.includes('@')) {
    const creds = await authenticate(rawId, rawPassword)
    return createSession(creds.user.uid, creds.user.email, allOrgDocs[0]?.doc?.id || 'org_main', 'Organization', {
      email: creds.user.email,
      fullName: creds.user.displayName || creds.user.email,
    })
  }

  throw Object.assign(
    new Error('Organization account not found.'),
    { code: 'auth/user-not-found' }
  )
}

// ------------------------------------------------------------------------------------------------
// UNIFIED INTELLIGENT LOGIN FLOW (AUTO-DETECTS ORGANIZATION VS MANAGER)
// ------------------------------------------------------------------------------------------------
export async function loginUser(identifier, password, preferredRole = null) {
  const rawId = (identifier || '').trim()
  const rawPassword = (password || '').trim()

  if (!rawId || !rawPassword) {
    throw Object.assign(new Error('Please enter both identifier and password.'), { code: 'auth/invalid-credential' })
  }

  // If role is explicitly provided
  if (preferredRole === 'Manager') {
    try {
      return await loginManager(rawId, rawPassword)
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/account-inactive') throw err
      try {
        return await loginOrganization(rawId, rawPassword)
      } catch (e) {
        throw err
      }
    }
  }

  if (preferredRole === 'Organization') {
    try {
      return await loginOrganization(rawId, rawPassword)
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/subscription-inactive') throw err
      try {
        return await loginManager(rawId, rawPassword)
      } catch (e) {
        throw err
      }
    }
  }

  // Unified auto-detection: Run manager and organization validation concurrently
  const [managerResult, orgResult] = await Promise.allSettled([
    loginManager(rawId, rawPassword),
    loginOrganization(rawId, rawPassword),
  ])

  if (managerResult.status === 'fulfilled') {
    return managerResult.value
  }

  if (orgResult.status === 'fulfilled') {
    return orgResult.value
  }

  // Check specific errors
  const managerErr = managerResult.reason
  const orgErr = orgResult.reason

  if (managerErr?.code === 'auth/wrong-password' || orgErr?.code === 'auth/wrong-password') {
    throw Object.assign(new Error('The password entered is incorrect.'), { code: 'auth/wrong-password' })
  }

  if (managerErr?.code === 'auth/account-inactive') {
    throw managerErr
  }

  if (orgErr?.code === 'auth/subscription-inactive') {
    throw orgErr
  }

  throw Object.assign(
    new Error('The username, email, or password entered is incorrect. Please check your credentials.'),
    { code: 'auth/invalid-credential' }
  )
}

export function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY)
}

export async function fetchCurrentUserProfile(orgId, uid) {
  if (!orgId || !uid) return null

  try {
    const adminSnapshot = await getDoc(doc(db, 'organisation', orgId, 'data', 'admin'))
    if (adminSnapshot.exists()) return adminSnapshot.data()
  } catch (e) {}

  for (const colName of ['manager', 'managers', 'config_users', 'config_user', 'configUsers', 'users']) {
    try {
      const userSnapshot = await getDoc(doc(db, 'organisation', orgId, colName, uid))
      if (userSnapshot.exists()) return userSnapshot.data()
    } catch (e) {}
  }

  return null
}

export { normalizeRole }
