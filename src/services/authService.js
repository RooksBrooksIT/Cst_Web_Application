import { signInWithEmailAndPassword } from 'firebase/auth'
import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore'
import { auth, db, persistenceReady } from './firebase.js'
import { ensureStorageAuthenticated } from './appStorageService.js'
import { resolveAuthoritativeSubscription, syncSubscriptionAcrossDocs } from './subscriptionService.js'


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
  if (typeof localStorage !== 'undefined' && localStorage?.setItem) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }
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

  function checkManagerMatch(docId, data) {
    const email = extractFieldValue(data, ['Email', 'email', 'UserEmail'])
    const userName = extractFieldValue(data, ['UserName', 'username', 'userName', 'Name', 'name'])
    const managerId = extractFieldValue(data, ['ManagerId', 'managerId', 'id', 'uid']) || docId
    const contactNo = extractFieldValue(data, ['ContactNo', 'contactNo', 'phone', 'Phone', 'Mobile', 'mobile'])
    const contactDigits = contactNo.replace(/\D/g, '')

    return Boolean(
      (userName && userName.toLowerCase() === idLower) ||
      (email && email.toLowerCase() === idLower) ||
      (managerId && managerId.toLowerCase() === idLower) ||
      (docId && docId.toLowerCase() === idLower) ||
      (docId && docId.includes('_') && docId.split('_').some((part) => part.toLowerCase() === idLower)) ||
      (digitsOnly && contactDigits && digitsOnly.length >= 8 && contactDigits.endsWith(digitsOnly))
    )
  }

  // 0. High-speed check for previously active or cached organization (0ms overhead)
  const storedSession = readStoredSession()
  const cachedOrgId = storedSession?.orgId
  if (cachedOrgId) {
    const directChecks = ['manager', 'managers', 'config_users', 'users'].map(async (subCol) => {
      try {
        const directDoc = await getDoc(doc(db, 'organisation', cachedOrgId, subCol, rawId))
        if (directDoc.exists()) {
          const path = directDoc.ref.path
          if (!seenDocPaths.has(path)) {
            seenDocPaths.add(path)
            managerCandidates.push({ doc: directDoc, data: directDoc.data() || {}, orgId: cachedOrgId })
          }
        }
      } catch (_e) {}
    })
    await Promise.allSettled(directChecks)

    if (managerCandidates.length === 0) {
      try {
        const snap = await getDocs(collection(db, 'organisation', cachedOrgId, 'manager'))
        snap.forEach((d) => {
          const path = d.ref.path
          if (!seenDocPaths.has(path)) {
            seenDocPaths.add(path)
            const data = d.data() || {}
            if (checkManagerMatch(d.id, data)) {
              managerCandidates.push({ doc: d, data, orgId: cachedOrgId })
            }
          }
        })
      } catch (_e) {}
    }
  }

  // 1. Primary path: query subcollections named 'manager', 'managers', 'config_users' across all organizations via collectionGroup
  if (managerCandidates.length === 0) {
    const candidateColGroups = ['manager', 'managers', 'config_users', 'configUsers']
    await Promise.allSettled(
      candidateColGroups.map(async (cgName) => {
        try {
          const groupSnap = await getDocs(collectionGroup(db, cgName))
          groupSnap.forEach((d) => {
            const path = d.ref.path
            if (!seenDocPaths.has(path)) {
              seenDocPaths.add(path)
              const parentOrgId = d.ref.parent?.parent?.id || d.data()?.orgId || d.data()?.organisationId || 'default_org'
              const data = d.data() || {}
              if (checkManagerMatch(d.id, data)) {
                managerCandidates.push({ doc: d, data, orgId: parentOrgId })
              }
            }
          })
        } catch (_err) {
          // collectionGroup might be restricted or index missing; fallback will cover
        }
      })
    )
  }

  // 2. Fallback: only check top-level collections in parallel if no candidate matched
  if (managerCandidates.length === 0) {
    const topColNames = ['manager', 'managers', 'Manager', 'Managers', 'config_users', 'users']
    await Promise.allSettled(
      topColNames.map(async (topCol) => {
        try {
          const topSnap = await getDocs(collection(db, topCol))
          topSnap.forEach((d) => {
            const path = d.ref.path
            if (!seenDocPaths.has(path)) {
              seenDocPaths.add(path)
              const data = d.data() || {}
              if (checkManagerMatch(d.id, data)) {
                managerCandidates.push({
                  doc: d,
                  data,
                  orgId: data.orgId || data.organisationId || 'default_org',
                })
              }
            }
          })
        } catch (_err) {}
      })
    )
  }

  // 3. Fallback: inspect organisation subcollections directly in parallel only if still empty
  if (managerCandidates.length === 0) {
    const orgColNames = ['organisation', 'organization']
    await Promise.allSettled(
      orgColNames.map(async (orgCol) => {
        try {
          const orgsSnap = await getDocs(collection(db, orgCol))
          await Promise.allSettled(
            orgsSnap.docs.map(async (orgDoc) => {
              const orgId = orgDoc.id
              await Promise.allSettled(
                ['manager', 'managers', 'config_users', 'config_user', 'configUsers', 'users'].map(async (subCol) => {
                  try {
                    const subSnap = await getDocs(collection(db, orgCol, orgId, subCol))
                    subSnap.forEach((d) => {
                      const path = d.ref.path
                      if (!seenDocPaths.has(path)) {
                        seenDocPaths.add(path)
                        const data = d.data() || {}
                        if (checkManagerMatch(d.id, data)) {
                          managerCandidates.push({ doc: d, data, orgId })
                        }
                      }
                    })
                  } catch (_subErr) {}
                })
              )
            })
          )
        } catch (_orgErr) {}
      })
    )
  }

  // 4. Fallback: Direct Firebase Authentication if identifier is an email and candidates list is empty
  if (managerCandidates.length === 0 && rawId.includes('@')) {
    try {
      const creds = await authenticate(rawId, rawPassword)
      if (creds?.user) {
        const u = creds.user
        const token = await u.getIdTokenResult().catch(() => null)
        const tokenRole = normalizeRole(token?.claims?.role || token?.claims?.userRole)
        const tokenOrgId = token?.claims?.orgId || token?.claims?.organisationId

        // If the account has an explicit non-Manager role, respect it
        if (tokenRole && tokenRole !== 'Manager') {
          throw Object.assign(
            new Error(`This account is registered as ${tokenRole}. Please switch to ${tokenRole} Login.`),
            { code: 'auth/unauthorized-role' }
          )
        }

        let resolvedOrgId = tokenOrgId || 'default_org'
        let managerProfile = null

        // Lookup manager profile document using the verified user's uid or email
        if (tokenOrgId) {
          for (const sub of ['manager', 'managers', 'config_users', 'users']) {
            try {
              const snap = await getDoc(doc(db, 'organisation', tokenOrgId, sub, u.uid))
              if (snap.exists()) {
                managerProfile = snap.data()
                break
              }
            } catch (_) {}
          }
        }

        if (!managerProfile) {
          try {
            const orgsSnap = await getDocs(collection(db, 'organisation'))
            for (const orgDoc of orgsSnap.docs) {
              const oId = orgDoc.id
              for (const sub of ['manager', 'managers', 'config_users', 'users']) {
                try {
                  const mSnap = await getDoc(doc(db, 'organisation', oId, sub, u.uid))
                  if (mSnap.exists()) {
                    managerProfile = mSnap.data()
                    resolvedOrgId = oId
                    break
                  }
                } catch (_) {}
              }
              if (managerProfile) break
            }
          } catch (_) {}
        }

        return createSession(u.uid, u.email, resolvedOrgId, 'Manager', {
          ...managerProfile,
          Email: u.email,
          FullName: managerProfile?.FullName || managerProfile?.fullName || u.displayName || 'Site Manager',
          UserName: managerProfile?.UserName || managerProfile?.username || u.email.split('@')[0],
          ManagerId: u.uid,
          Status: managerProfile?.Status || managerProfile?.status || 'Active',
          Department: managerProfile?.Department || managerProfile?.department || 'Operations',
          Designation: managerProfile?.Designation || managerProfile?.designation || 'Site Manager',
          role: 'Manager',
        })
      }
    } catch (authErr) {
      if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
        throw Object.assign(
          new Error('The password entered is incorrect. Please check your credentials.'),
          { code: 'auth/wrong-password' }
        )
      }
      if (authErr.code === 'auth/unauthorized-role') {
        throw authErr
      }
    }
  }

  // Validate credentials against Manager records
  let hadManagerCredentialCandidate = false
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

    const isMatch = checkManagerMatch(docId, data)

    if (isMatch) {
      // 1. Verify Status = "Active"
      const normalizedStatus = String(status).trim().toLowerCase()
      if (normalizedStatus !== 'active' && normalizedStatus !== 'approved' && normalizedStatus !== 'enabled') {
        throw Object.assign(
          new Error(`Manager account status is "${status}". Please contact your administrator.`),
          { code: 'auth/account-inactive' }
        )
      }

      // 2. Validate Password against Manager credentials (or Firebase Auth)
      let passwordValid = false
      if (storedPassword && (storedPassword === rawPassword || storedPassword.trim() === rawPassword)) {
        passwordValid = true
      } else if (email && email.includes('@')) {
        try {
          await authenticate(email, rawPassword)
          passwordValid = true
        } catch (authErr) {
          if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
            hadManagerCredentialCandidate = true
          }
        }
      }

      if (passwordValid) {
        if (email && email.includes('@')) {
          authenticate(email, rawPassword).catch(() => null)
        }
        if (!auth.currentUser && orgId) {
          ensureStorageAuthenticated(orgId).catch(() => null)
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

      hadManagerCredentialCandidate = true
    }
  }

  if (hadManagerCredentialCandidate) {
    throw Object.assign(
      new Error('The password entered is incorrect. Please check your credentials.'),
      { code: 'auth/wrong-password' }
    )
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

  function checkOrgCandidateMatch(orgId, data) {
    const email = extractFieldValue(data, ['email', 'Email'])
    const username = extractFieldValue(data, ['username', 'UserName'])
    const orgName = extractFieldValue(data, ['org_name', 'orgName', 'companyName', 'organizationName', 'app_name', 'appName'])
    const orgIdField = extractFieldValue(data, ['organizationId', 'orgId']) || orgId
    const phone = extractFieldValue(data, ['phone', 'Phone', 'contactNo'])

    return (
      (orgId && orgId.toLowerCase() === idLower) ||
      (email && email.toLowerCase() === idLower) ||
      (username && username.toLowerCase() === idLower) ||
      (orgName && orgName.toLowerCase() === idLower) ||
      (orgIdField && orgIdField.toLowerCase() === idLower) ||
      (phone && phone.toLowerCase() === idLower)
    )
  }

  // 1. Direct targeted lookup if identifier matches an org document ID format
  if (idLower.startsWith('cst_')) {
    try {
      const directDoc = await getDoc(doc(db, 'organisation', rawId))
      if (directDoc.exists()) {
        const dData = directDoc.data() || {}
        seenOrgDocKeys.add(`${directDoc.id}_root`)
        orgCandidates.push({ data: dData, orgId: directDoc.id, source: 'root' })
      }
    } catch (_e) {}
  }

  // 2. Query primary 'organisation' collection (fast single-query snapshot)
  if (orgCandidates.length === 0) {
    try {
      const snap = await getDocs(collection(db, 'organisation'))
      for (const orgDoc of snap.docs) {
        const orgDocData = orgDoc.data() || {}
        if (checkOrgCandidateMatch(orgDoc.id, orgDocData)) {
          let data = orgDocData
          // Only fetch admin subdocs if credentials are not in root doc
          if (!data.password && !data.Password) {
            try {
              const [adminDataSnap, dataAdminSnap] = await Promise.all([
                getDoc(doc(db, 'organisation', orgDoc.id, 'admin', 'data')),
                getDoc(doc(db, 'organisation', orgDoc.id, 'data', 'admin')),
              ])
              if (adminDataSnap.exists()) {
                data = { ...data, ...adminDataSnap.data() }
              } else if (dataAdminSnap.exists()) {
                data = { ...data, ...dataAdminSnap.data() }
              }
            } catch (_subErr) {}
          }
          const hasAccountIdentity = data.username || data.email || data.password || data.Password
          if (hasAccountIdentity) {
            seenOrgDocKeys.add(`${orgDoc.id}_root`)
            orgCandidates.push({ data, orgId: orgDoc.id, source: 'root' })
            const storedPass = extractFieldValue(data, ['password', 'Password', 'pass'])
            if (storedPass && storedPass === rawPassword) {
              break // Exact password match found! Stop scanning further documents.
            }
          }
        }
      }
    } catch (_e) {}
  }

  // 3. Fallback: only execute if primary collection had no match
  if (orgCandidates.length === 0) {
    const fallbackTasks = [
      getDocs(collectionGroup(db, 'admin'))
        .then((snap) => {
          snap.forEach((d) => {
            if (d.id === 'data' || d.id === 'admin') {
              const parentOrgId = d.ref.parent?.parent?.id || 'default_org'
              const key = `${parentOrgId}_admin_data`
              if (!seenOrgDocKeys.has(key)) {
                seenOrgDocKeys.add(key)
                const cData = d.data() || {}
                if (checkOrgCandidateMatch(parentOrgId, cData)) {
                  orgCandidates.push({ data: cData, orgId: parentOrgId, source: 'admin/data' })
                }
              }
            }
          })
        })
        .catch(() => {}),
      getDoc(doc(db, 'admin', 'data'))
        .then((snap) => {
          if (snap.exists()) {
            const key = 'root_admin_data'
            if (!seenOrgDocKeys.has(key)) {
              seenOrgDocKeys.add(key)
              const cData = snap.data() || {}
              if (checkOrgCandidateMatch('org_main', cData)) {
                orgCandidates.push({ data: cData, orgId: 'org_main', source: 'root_admin_data' })
              }
            }
          }
        })
        .catch(() => {}),
      ...['organization', 'organisations', 'organizations'].map((col) =>
        getDocs(collection(db, col))
          .then((snap) => {
            snap.forEach((d) => {
              const key = `${d.id}_${col}`
              if (!seenOrgDocKeys.has(key)) {
                seenOrgDocKeys.add(key)
                const cData = d.data() || {}
                if (checkOrgCandidateMatch(d.id, cData)) {
                  orgCandidates.push({ data: cData, orgId: d.id, source: col })
                }
              }
            })
          })
          .catch(() => {})
      ),
    ]
    await Promise.allSettled(fallbackTasks)
  }

  let hadCredentialCandidate = false

  // Validate credentials against Organization data structure
  for (const candidate of orgCandidates) {
    const data = candidate.data
    const orgId = candidate.orgId

    const email = extractFieldValue(data, ['email', 'Email'])
    const username = extractFieldValue(data, ['username', 'UserName'])
    const storedPassword = extractFieldValue(data, ['password', 'Password', 'pass'])
    const role = extractFieldValue(data, ['role', 'Role']) || 'Organization'
    const orgName = extractFieldValue(data, ['org_name', 'orgName', 'companyName', 'organizationName', 'app_name', 'appName'])

    const isMatch = checkOrgCandidateMatch(orgId, data)
    if (!isMatch) continue

    // 1. Validate credentials for this candidate first
    let passwordMatches = false
    let firebaseUser = null

    if (storedPassword && storedPassword === rawPassword) {
      passwordMatches = true
      if (email && email.includes('@')) {
        await authenticate(email, rawPassword).catch(() => null)
      }
    } else if (email && email.includes('@')) {
      try {
        const creds = await authenticate(email, rawPassword)
        if (creds?.user) {
          passwordMatches = true
          firebaseUser = creds.user
        }
      } catch (authErr) {
        if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
          hadCredentialCandidate = true
        }
      }
    }

    if (!passwordMatches) {
      if (storedPassword || email) hadCredentialCandidate = true
      continue // Check next candidate doc before failing
    }

    // 2. Credentials matched! Verify role = "Organization"
    if (normalizeRole(role) !== 'Organization') {
      throw Object.assign(
        new Error('Access denied. This account does not have Organization administrator privileges.'),
        { code: 'auth/unauthorized-role' }
      )
    }

    // 3. Resolve authoritative subscription from /organisation/{orgId}/data/subscription
    let authSub = null
    try {
      authSub = await resolveAuthoritativeSubscription(orgId)
    } catch (_subErr) {
      console.warn(`[loginOrganization] Could not load authoritative subscription for ${orgId}:`, _subErr?.message)
    }

    // Merge authoritative subscription fields
    const effectiveSub = authSub || data.subscription || data
    const effectivePlan = effectiveSub?.subscriptionPlan || data.subscriptionPlan || 'Free Trial'
    const effectiveActive = effectiveSub?.isSubscriptionActive !== undefined
      ? effectiveSub.isSubscriptionActive
      : (data.isSubscriptionActive !== undefined ? data.isSubscriptionActive : true)
    const effectivePaymentStatus = effectiveSub?.paymentStatus || extractFieldValue(data, ['paymentStatus', 'payment_status']) || 'SUCCESS'

    // Self-healing: If authoritative plan differs from candidate/root plan, trigger background synchronization
    if (authSub && (data.subscriptionPlan !== authSub.subscriptionPlan || data.isSubscriptionActive !== authSub.isSubscriptionActive)) {
      syncSubscriptionAcrossDocs(orgId, authSub).catch((syncErr) =>
        console.warn(`[loginOrganization] Background sync failed for ${orgId}:`, syncErr?.message)
      )
    }

    // Verify subscription and payment status using authoritative state
    if (effectiveActive === false || effectivePaymentStatus === 'FAILED') {
      throw Object.assign(
        new Error('This organization subscription is inactive or payment is pending. Please contact support or complete payment.'),
        { code: 'auth/subscription-inactive' }
      )
    }

    if (effectiveSub?.subscriptionEndDate) {
      const endDate = effectiveSub.subscriptionEndDate?.toDate?.() || new Date(effectiveSub.subscriptionEndDate)
      if (endDate < new Date()) {
        throw Object.assign(
          new Error('This organization subscription has expired. Please renew your subscription to continue.'),
          { code: 'auth/subscription-inactive' }
        )
      }
    }

    // Return authenticated session
    const sessionUid = firebaseUser?.uid || orgId
    const sessionEmail = firebaseUser?.email || email || `${orgId}@ebricks.local`

    return createSession(sessionUid, sessionEmail, orgId, 'Organization', {
      ...data,
      ...effectiveSub,
      subscription: effectiveSub,
      subscriptionPlan: effectivePlan,
      isSubscriptionActive: effectiveActive,
      paymentStatus: effectivePaymentStatus,
      role: 'Organization',
      org_name: orgName || 'Organization',
      username: username || orgId,
      email: sessionEmail,
    })
  }

  if (hadCredentialCandidate) {
    throw Object.assign(
      new Error('The password entered is incorrect. Please check your credentials.'),
      { code: 'auth/wrong-password' }
    )
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
    if (typeof localStorage === 'undefined' || !localStorage?.getItem) return null
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearStoredSession() {
  if (typeof localStorage !== 'undefined' && localStorage?.removeItem) {
    localStorage.removeItem(SESSION_KEY)
  }
}

export async function fetchCurrentUserProfile(orgId, uid) {
  if (!orgId || !uid) return null

  try {
    const adminSnapshot = await getDoc(doc(db, 'organisation', orgId, 'data', 'admin'))
    if (adminSnapshot.exists()) {
      const adminData = adminSnapshot.data() || {}
      try {
        const subSnapshot = await getDoc(doc(db, 'organisation', orgId, 'data', 'subscription'))
        if (subSnapshot.exists()) {
          const subData = subSnapshot.data() || {}
          return {
            ...adminData,
            ...subData,
            subscription: subData,
            subscriptionPlan: subData.subscriptionPlan || adminData.subscriptionPlan,
            isSubscriptionActive: subData.isSubscriptionActive !== undefined ? subData.isSubscriptionActive : adminData.isSubscriptionActive,
            paymentStatus: subData.paymentStatus || adminData.paymentStatus,
          }
        }
      } catch (_e) {}
      return adminData
    }
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
