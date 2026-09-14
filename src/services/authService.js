import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, collectionGroup, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { auth, db, persistenceReady } from './firebase'

const SESSION_KEY = 'constructa_session'
const ROLE_FIELDS = ['role', 'userRole', 'user_type', 'userType']

function normalizeRole(value) {
  const role = String(value || '').toLowerCase().replace(/[_.-]/g, ' ')
  if (role === 'organization' || role === 'organization admin' || role === 'admin') return 'Organization'
  if (role === 'manager' || role === 'operations manager') return 'Manager'
  return null
}

function getRole(data = {}) {
  for (const field of ROLE_FIELDS) {
    const role = normalizeRole(data[field])
    if (role) return role
  }
  return null
}

function firstValue(data, fields) {
  return fields.map((field) => data?.[field]).find((value) => value !== undefined && value !== null && value !== '')
}

async function findByFields(ref, fields, value) {
  for (const field of fields) {
    const result = await getDocs(query(ref, where(field, '==', value), limit(1)))
    if (!result.empty) return result.docs[0]
  }
  return null
}

async function getAdmin(orgRef) {
  const adminSnapshot = await getDoc(doc(orgRef, 'data', 'admin'))
  return adminSnapshot.exists() ? adminSnapshot : null
}

async function findOrganization(identifier) {
  const organisations = collection(db, 'organisation')
  const directReference = doc(organisations, identifier)
  const directSnapshot = await getDoc(directReference)
  if (directSnapshot.exists()) return { ref: directReference, data: directSnapshot.data() }

  const organizationDoc = await findByFields(organisations, ['email', 'username', 'phone', 'org_name', 'organizationId'], identifier)
  if (organizationDoc) return { ref: organizationDoc.ref, data: organizationDoc.data() }

  for (const collectionName of ['admin', 'organizationUser']) {
    const userDoc = await findByFields(collectionGroup(db, collectionName), ['email', 'username', 'phone', 'org_name'], identifier)
    if (userDoc) {
      const orgRef = userDoc.ref.parent.parent
      return { ref: orgRef, data: (await getDoc(orgRef)).data(), adminData: userDoc.data() }
    }
  }
  return null
}

async function findManagerAcrossOrganizations(identifier) {
  for (const collectionName of ['config_users', 'configUsers']) {
    const managerDoc = await findByFields(collectionGroup(db, collectionName), ['UserName', 'username', 'userName', 'email', 'phone'], identifier)
    if (managerDoc) {
      const orgRef = managerDoc.ref.parent.parent
      return { organization: { ref: orgRef, data: (await getDoc(orgRef)).data() }, manager: { ref: managerDoc.ref, data: managerDoc.data() } }
    }
  }
  return null
}

async function authenticate(email, password) {
  await persistenceReady
  return signInWithEmailAndPassword(auth, email, password)
}

function ensureSubscription(organization) {
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

async function completeLogin(credentials, role, orgRef, profile) {
  const token = await credentials.user.getIdTokenResult(true)
  const claimedRole = getRole(token.claims)
  const finalRole = claimedRole || role
  if (claimedRole && claimedRole !== role) {
    await signOut(auth)
    const error = new Error('Your account is not authorized for this workspace.')
    error.code = 'auth/unauthorized-role'
    throw error
  }
  if (!finalRole || !orgRef) {
    await signOut(auth)
    const error = new Error('Your account does not have a valid Organization or Manager role.')
    error.code = 'auth/unauthorized-role'
    throw error
  }

  const session = { isLoggedIn: true, uid: credentials.user.uid, email: credentials.user.email, orgId: orgRef.id, role: finalRole, userData: profile }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function loginUser(identifier, password) {
  const normalizedIdentifier = identifier.trim()

  const organization = await findOrganization(normalizedIdentifier)
  const adminData = organization?.adminData || (organization ? (await getAdmin(organization.ref))?.data() : null)
  if (organization && adminData) {
    ensureSubscription(organization.data)
    const email = firstValue(adminData, ['email', 'Email']) || (normalizedIdentifier.includes('@') ? normalizedIdentifier : '')
    if (!email) throw Object.assign(new Error('This organization account needs a Firebase Authentication email before it can sign in.'), { code: 'auth/account-not-configured' })
    const credentials = await authenticate(email, password)
    return completeLogin(credentials, getRole(adminData) || 'Organization', organization.ref, adminData)
  }

  const managerMatch = await findManagerAcrossOrganizations(normalizedIdentifier)
  if (managerMatch) {
    const email = firstValue(managerMatch.manager.data, ['email', 'Email'])
    if (!email) throw Object.assign(new Error('This manager account needs a Firebase Authentication email before it can sign in.'), { code: 'auth/account-not-configured' })
    const credentials = await authenticate(email, password)
    return completeLogin(credentials, getRole(managerMatch.manager.data) || 'Manager', managerMatch.organization.ref, managerMatch.manager.data)
  }

  throw Object.assign(new Error('Organization or Manager account was not found.'), { code: 'auth/user-not-found' })
}

export function readStoredSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY)
}

export { normalizeRole }
