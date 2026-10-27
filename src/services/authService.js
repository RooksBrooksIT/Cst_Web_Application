import { signInWithEmailAndPassword } from 'firebase/auth'
import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore'
import { auth, db, persistenceReady } from './firebase.js'
import { ensureStorageAuthenticated } from './appStorageService.js'


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

export function createSession(uid, email, orgId, role, profile) {
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
// HIGH-SPEED MANAGER LOOKUP & AUTHENTICATION (FIRESTORE: manager)
// Relevant fields: Email, Password, UserName, FullName, ManagerId, Status, Department, Designation
// ------------------------------------------------------------------------------------------------
async function loginManager(identifier, password) {
  const rawId = (identifier || '').trim()
  const idLower = rawId.toLowerCase()
  const rawPassword = (password || '').trim()
  const digitsOnly = rawId.replace(/\D/g, '')

  if (!rawId || !rawPassword) {
    throw Object.assign(new Error('Please enter both identifier and password.'), { code: 'auth/invalid-credential' })
  }

  const managerCandidates = []
  const seenDocPaths = new Set()

  // 1. Check all subcollections named 'manager' across all organizations via collectionGroup
  try {
    const groupSnap = await getDocs(collectionGroup(db, 'manager'))
    groupSnap.forEach((d) => {
      const path = d.ref.path
      if (!seenDocPaths.has(path)) {
        seenDocPaths.add(path)
        const parentOrgId = d.ref.parent?.parent?.id || 'default_org'
        managerCandidates.push({ doc: d, data: d.data() || {}, orgId: parentOrgId })
      }
    })
  } catch (_err) {
    // collectionGroup might be restricted or index missing; fallback will cover
  }

  // 2. Check top-level collection 'manager' and 'managers'
  for (const topCol of ['manager', 'managers', 'Manager', 'Managers']) {
    try {
      const topSnap = await getDocs(collection(db, topCol))
      topSnap.forEach((d) => {
        const path = d.ref.path
        if (!seenDocPaths.has(path)) {
          seenDocPaths.add(path)
          const data = d.data() || {}
          managerCandidates.push({
            doc: d,
            data,
            orgId: data.orgId || data.organisationId || 'default_org',
          })
        }
      })
    } catch (_err) {}
  }

  // 3. Fallback: inspect organisation subcollections directly
  if (managerCandidates.length === 0) {
    const orgColNames = ['organisation', 'organization', 'organisations', 'organizations']
    for (const orgCol of orgColNames) {
      try {
        const orgsSnap = await getDocs(collection(db, orgCol))
        for (const orgDoc of orgsSnap.docs) {
          const orgId = orgDoc.id
          for (const subCol of ['manager', 'managers']) {
            try {
              const subSnap = await getDocs(collection(db, orgCol, orgId, subCol))
              subSnap.forEach((d) => {
                const path = d.ref.path
                if (!seenDocPaths.has(path)) {
                  seenDocPaths.add(path)
                  managerCandidates.push({ doc: d, data: d.data() || {}, orgId })
                }
              })
            } catch (_subErr) {}
          }
        }
      } catch (_orgErr) {}
    }
  }

  // Validate credentials against Manager records
  for (const item of managerCandidates) {
    const data = item.data
    const docId = item.doc.id
    const orgId = item.orgId

    const email = extractFieldValue(data, ['Email', 'email', 'UserEmail'])
    const storedPassword = extractFieldValue(data, ['Password', 'password', 'pass', 'pin'])
    const userName = extractFieldValue(data, ['UserName', 'username', 'userName', 'Name', 'name'])
    const fullName = extractFieldValue(data, ['FullName', 'fullName', 'Name', 'name']) || userName
    const managerId = extractFieldValue(data, ['ManagerId', 'managerId', 'id', 'uid']) || docId
    const status = extractFieldValue(data, ['Status', 'status']) || 'Active'
    const department = extractFieldValue(data, ['Department', 'department']) || 'Operations'
    const designation = extractFieldValue(data, ['Designation', 'designation']) || 'Site Manager'
    const contactNo = extractFieldValue(data, ['ContactNo', 'contactNo', 'phone', 'Phone', 'Mobile', 'mobile'])

    const contactDigits = contactNo.replace(/\D/g, '')

    const isMatch =
      (userName && userName.toLowerCase() === idLower) ||
      (email && email.toLowerCase() === idLower) ||
      (managerId && managerId.toLowerCase() === idLower) ||
      docId.toLowerCase() === idLower ||
      (digitsOnly && contactDigits && digitsOnly.length >= 8 && contactDigits.endsWith(digitsOnly))

    if (isMatch) {
      // 1. Verify Status = "Active"
      const normalizedStatus = String(status).trim().toLowerCase()
      if (normalizedStatus !== 'active' && normalizedStatus !== 'approved' && normalizedStatus !== 'enabled') {
        throw Object.assign(
          new Error(`Manager account status is "${status}". Please contact your administrator.`),
          { code: 'auth/account-inactive' }
        )
      }

      // 2. Validate Password against Manager credentials
      if (storedPassword && storedPassword === rawPassword) {
        if (email && email.includes('@')) {
          await authenticate(email, rawPassword).catch(() => null)
        }
        if (!auth.currentUser && orgId) {
          await ensureStorageAuthenticated(orgId).catch(() => null)
        }

        return createSession(managerId || docId, email || `${userName || docId}@ebricks.local`, orgId, 'Manager', {
          ...data,
          Email: email,
          UserName: userName,
          FullName: fullName,
          ManagerId: managerId,
          Status: status,
          Department: department,
          Designation: designation,
          role: 'Manager',
        })
      }

      // If stored password mismatch
      throw Object.assign(
        new Error('The password entered is incorrect. Please check your credentials.'),
        { code: 'auth/wrong-password' }
      )
    }
  }

  // Account not found in Manager collection
  throw Object.assign(
    new Error('Manager account not found. Please check your credentials or switch to Organization Login if you are an admin.'),
    { code: 'auth/user-not-found' }
  )
}

// ------------------------------------------------------------------------------------------------
// HIGH-SPEED ORGANIZATION LOOKUP & AUTHENTICATION (FIRESTORE: admin -> data)
// Relevant fields: email, password, role = Organization, username, org_name,
// registrationStatus, isSubscriptionActive, paymentStatus
// ------------------------------------------------------------------------------------------------
async function loginOrganization(identifier, password) {
  const rawId = (identifier || '').trim()
  const idLower = rawId.toLowerCase()
  const rawPassword = (password || '').trim()

  if (!rawId || !rawPassword) {
    throw Object.assign(new Error('Please enter both identifier and password.'), { code: 'auth/invalid-credential' })
  }

  const orgCandidates = []
  const seenOrgDocKeys = new Set()

  // 1. Target admin -> data subcollection structure via collectionGroup('admin')
  try {
    const adminGroupSnap = await getDocs(collectionGroup(db, 'admin'))
    adminGroupSnap.forEach((d) => {
      if (d.id === 'data' || d.id === 'admin') {
        const parentOrgId = d.ref.parent?.parent?.id || 'default_org'
        const key = `${parentOrgId}_admin_data`
        if (!seenOrgDocKeys.has(key)) {
          seenOrgDocKeys.add(key)
          orgCandidates.push({
            data: d.data() || {},
            orgId: parentOrgId,
            source: 'admin/data',
          })
        }
      }
    })
  } catch (_err) {}

  // 2. Query organisation collections directly
  const orgColNames = ['organisation', 'organisations', 'organization', 'organizations']
  for (const orgCol of orgColNames) {
    try {
      const snap = await getDocs(collection(db, orgCol))
      for (const orgDoc of snap.docs) {
        const orgId = orgDoc.id
        const orgDocData = orgDoc.data() || {}

        // Add root organisation document
        const rootKey = `${orgId}_root`
        if (!seenOrgDocKeys.has(rootKey)) {
          seenOrgDocKeys.add(rootKey)
          orgCandidates.push({
            data: orgDocData,
            orgId,
            source: 'root',
          })
        }

        // Check specific admin -> data subcollection doc
        try {
          const adminDataSnap = await getDoc(doc(db, orgCol, orgId, 'admin', 'data'))
          if (adminDataSnap.exists()) {
            const adminKey = `${orgId}_admin_data`
            if (!seenOrgDocKeys.has(adminKey)) {
              seenOrgDocKeys.add(adminKey)
              orgCandidates.push({
                data: adminDataSnap.data() || {},
                orgId,
                source: 'admin/data',
              })
            }
          }
        } catch (_adminErr) {}

        // Check legacy data -> admin subcollection doc
        try {
          const dataAdminSnap = await getDoc(doc(db, orgCol, orgId, 'data', 'admin'))
          if (dataAdminSnap.exists()) {
            const dataAdminKey = `${orgId}_data_admin`
            if (!seenOrgDocKeys.has(dataAdminKey)) {
              seenOrgDocKeys.add(dataAdminKey)
              orgCandidates.push({
                data: dataAdminSnap.data() || {},
                orgId,
                source: 'data/admin',
              })
            }
          }
        } catch (_dataAdminErr) {}
      }
    } catch (_e) {}
  }

  // 3. Also check root doc(db, 'admin', 'data') if present
  try {
    const rootAdminSnap = await getDoc(doc(db, 'admin', 'data'))
    if (rootAdminSnap.exists()) {
      const rootAdminKey = 'root_admin_data'
      if (!seenOrgDocKeys.has(rootAdminKey)) {
        seenOrgDocKeys.add(rootAdminKey)
        orgCandidates.push({
          data: rootAdminSnap.data() || {},
          orgId: 'org_main',
          source: 'root_admin_data',
        })
      }
    }
  } catch (_rootAdminErr) {}

  // Validate credentials against Organization data structure
  for (const candidate of orgCandidates) {
    const data = candidate.data
    const orgId = candidate.orgId

    const email = extractFieldValue(data, ['email', 'Email'])
    const username = extractFieldValue(data, ['username', 'UserName'])
    const storedPassword = extractFieldValue(data, ['password', 'Password', 'pass'])
    const role = extractFieldValue(data, ['role', 'Role']) || 'Organization'
    const orgName = extractFieldValue(data, ['org_name', 'orgName', 'companyName', 'organizationName', 'app_name', 'appName'])
    const orgIdField = extractFieldValue(data, ['organizationId', 'orgId']) || orgId
    const phone = extractFieldValue(data, ['phone', 'Phone', 'contactNo'])
    const isSubscriptionActive = data.isSubscriptionActive !== undefined ? data.isSubscriptionActive : true
    const paymentStatus = extractFieldValue(data, ['paymentStatus', 'payment_status']) || 'SUCCESS'

    const isMatch =
      orgId.toLowerCase() === idLower ||
      (email && email.toLowerCase() === idLower) ||
      (username && username.toLowerCase() === idLower) ||
      (orgName && orgName.toLowerCase() === idLower) ||
      (orgIdField && orgIdField.toLowerCase() === idLower) ||
      (phone && phone.toLowerCase() === idLower)

    if (isMatch) {
      // 1. Verify role = "Organization"
      if (normalizeRole(role) !== 'Organization') {
        throw Object.assign(
          new Error('Access denied. This account does not have Organization administrator privileges.'),
          { code: 'auth/unauthorized-role' }
        )
      }

      // 2. Verify subscription and payment status
      if (isSubscriptionActive === false || paymentStatus === 'FAILED') {
        throw Object.assign(
          new Error('This organization subscription is inactive or payment is pending. Please contact support or complete payment.'),
          { code: 'auth/subscription-inactive' }
        )
      }

      const subscription = data.subscription || data
      if (subscription?.subscriptionEndDate) {
        const endDate = subscription.subscriptionEndDate?.toDate?.() || new Date(subscription.subscriptionEndDate)
        if (endDate < new Date()) {
          throw Object.assign(
            new Error('This organization subscription has expired. Please renew your subscription to continue.'),
            { code: 'auth/subscription-inactive' }
          )
        }
      }

      // 3. Validate credentials
      if (storedPassword && storedPassword === rawPassword) {
        // Authenticate with Firebase Auth if account is linked in Firebase Auth
        if (email && email.includes('@')) {
          await authenticate(email, rawPassword).catch(() => null)
        }

        return createSession(orgId, email || `${orgId}@ebricks.local`, orgId, 'Organization', {
          ...data,
          role: 'Organization',
          org_name: orgName || 'Organization',
          username: username || orgId,
          email,
        })
      }

      // If stored password differs or empty, attempt Firebase Auth
      if (email && email.includes('@')) {
        try {
          const creds = await authenticate(email, rawPassword)
          return createSession(creds.user.uid, creds.user.email, orgId, 'Organization', {
            ...data,
            role: 'Organization',
            org_name: orgName || 'Organization',
            username: username || orgId,
            email: creds.user.email,
          })
        } catch (authErr) {
          if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
            throw Object.assign(
              new Error('The password entered is incorrect. Please check your credentials.'),
              { code: 'auth/wrong-password' }
            )
          }
        }
      }

      // Password mismatch
      throw Object.assign(
        new Error('The password entered is incorrect. Please check your credentials.'),
        { code: 'auth/wrong-password' }
      )
    }
  }

  // Account not found in Organization data structure
  throw Object.assign(
    new Error('Organization account not found. Please check your credentials or switch to Manager Login if you are a site manager.'),
    { code: 'auth/user-not-found' }
  )
}

// ------------------------------------------------------------------------------------------------
// ROLE-BASED LOGIN DISPATCHER
// Enforces strict authentication for the selected login type without cross-role fallback
// ------------------------------------------------------------------------------------------------
export async function loginUser(identifier, password, preferredRole = null) {
  const rawId = (identifier || '').trim()
  const rawPassword = (password || '').trim()

  if (!rawId || !rawPassword) {
    throw Object.assign(new Error('Please enter both identifier and password.'), { code: 'auth/invalid-credential' })
  }

  // Enforce selected login type strictly
  if (preferredRole === 'Manager') {
    return await loginManager(rawId, rawPassword)
  }

  if (preferredRole === 'Organization') {
    return await loginOrganization(rawId, rawPassword)
  }

  // Default fallback if no preferredRole is passed
  const [managerResult, orgResult] = await Promise.allSettled([
    loginManager(rawId, rawPassword),
    loginOrganization(rawId, rawPassword),
  ])

  if (orgResult.status === 'fulfilled') {
    return orgResult.value
  }

  if (managerResult.status === 'fulfilled') {
    return managerResult.value
  }

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

  if (orgErr?.code === 'auth/unauthorized-role') {
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
