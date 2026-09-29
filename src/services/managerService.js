import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { fetchWithFallback, subscribeWithFallback } from './firestoreService'

/**
 * CST Manager Governance & Uniqueness Engine
 * Manages /organisation/{orgId}/manager documents and enforces case-insensitive global username uniqueness.
 */

export function subscribeManagers(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'manager', onData, onError)
}

export async function fetchManagers(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'manager')
}

/**
 * Validates requested username against all role collections case-insensitively.
 * Checks: manager, supervisor, siteSupervisor, users, config_users, organisation docs.
 */
export async function checkGlobalUsernameUniqueness(orgId, targetUsername) {
  if (!targetUsername || !targetUsername.trim()) {
    return { isUnique: false, message: 'Username is required.' }
  }

  const cleanTarget = targetUsername.trim().toLowerCase()
  const checkedPaths = new Set()

  // 1. Organization-level subcollections
  const subColNames = ['manager', 'managers', 'supervisor', 'supervisors', 'siteSupervisor', 'config_users', 'users']
  if (orgId) {
    for (const subCol of subColNames) {
      try {
        const snap = await getDocs(collection(db, 'organisation', orgId, subCol))
        for (const d of snap.docs) {
          if (checkedPaths.has(d.ref.path)) continue
          checkedPaths.add(d.ref.path)
          const data = d.data() || {}
          const un = String(data.UserName || data.userName || data.username || data.name || '').trim().toLowerCase()
          if (un && un === cleanTarget) {
            return {
              isUnique: false,
              message: 'Username already exists. Please use another username.',
            }
          }
        }
      } catch (_err) {}
    }
  }

  // 2. Root-level role collections
  const rootCols = ['manager', 'managers', 'supervisor', 'supervisors', 'users', 'organisation', 'organisations', 'invitations']
  for (const rootCol of rootCols) {
    try {
      const snap = await getDocs(collection(db, rootCol))
      for (const d of snap.docs) {
        if (checkedPaths.has(d.ref.path)) continue
        checkedPaths.add(d.ref.path)
        const data = d.data() || {}
        const un = String(data.UserName || data.userName || data.username || data.code || '').trim().toLowerCase()
        if (un && un === cleanTarget) {
          return {
            isUnique: false,
            message: 'Username already exists. Please use another username.',
          }
        }
      }
    } catch (_err) {}
  }

  // 3. Collection Group cross-checking for manager and supervisor
  for (const colGroup of ['manager', 'supervisor']) {
    try {
      const groupSnap = await getDocs(collectionGroup(db, colGroup))
      for (const d of groupSnap.docs) {
        if (checkedPaths.has(d.ref.path)) continue
        checkedPaths.add(d.ref.path)
        const data = d.data() || {}
        const un = String(data.UserName || data.userName || data.username || '').trim().toLowerCase()
        if (un && un === cleanTarget) {
          return {
            isUnique: false,
            message: 'Username already exists. Please use another username.',
          }
        }
      }
    } catch (_err) {}
  }

  return { isUnique: true }
}

/**
 * Calculates next sequential Manager ID in MG###_Username format
 */
export async function getNextManagerId(orgId, username) {
  let maxSeq = 0
  try {
    const snap = await fetchWithFallback(orgId, 'manager')
    snap.forEach((d) => {
      const mId = String(d.ManagerId || d.managerId || d.id || '')
      const match = mId.match(/^MG(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxSeq) maxSeq = num
      }
    })
  } catch (_e) {}

  const seqStr = `MG${String(maxSeq + 1).padStart(3, '0')}`
  const cleanUsername = (username || '').trim().replace(/\s+/g, '')
  return `${seqStr}_${cleanUsername}`
}

/**
 * Creates a new Manager document in /organisation/{orgId}/manager/{ManagerId}
 */
export async function createManager(orgId, managerData) {
  if (!orgId) throw new Error('Organization ID is required')
  const fullName = (managerData.fullName || managerData.name || '').trim()
  const username = (managerData.username || managerData.userName || '').trim()
  const password = (managerData.password || '').trim()
  const phone = (managerData.phone || managerData.contactNo || managerData.ContactNo || '').trim()
  const email = (managerData.email || '').trim().toLowerCase()
  const department = managerData.department || 'Operations'
  const designation = managerData.designation || 'Site Manager'

  if (!fullName) throw new Error('Full Name is required')
  if (!username) throw new Error('Username is required')
  if (!password) throw new Error('Password is required')
  if (!phone) throw new Error('Contact Number is required')

  // Global case-insensitive username validation
  const uniqueCheck = await checkGlobalUsernameUniqueness(orgId, username)
  if (!uniqueCheck.isUnique) {
    throw new Error(uniqueCheck.message)
  }

  const managerId = await getNextManagerId(orgId, username)

  const payload = {
    ManagerId: managerId,
    UserName: username,
    FullName: fullName,
    ContactNo: phone,
    Email: email,
    Department: department,
    Designation: designation,
    Password: password,
    Status: 'Active',
    orgId,
    organizationId: orgId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // Write to /organisation/{orgId}/manager/{managerId}
  await setDoc(doc(db, 'organisation', orgId, 'manager', managerId), payload)

  // Write to top-level /manager/{managerId} for cross-tenant auth compatibility
  try {
    await setDoc(doc(db, 'manager', managerId), payload, { merge: true })
  } catch (_e) {}

  return { id: managerId, ...payload }
}
