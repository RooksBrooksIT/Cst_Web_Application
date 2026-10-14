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
import { SubscriptionLimitService } from './subscriptionLimitService'

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

import {
  isGlobalUsernameUnique,
  checkGlobalUsernameUniqueness,
  warmupUsernameCache,
  isUsernameCachedAsTaken,
  addTakenUsernameToCache,
} from './usernameValidationService'

export {
  isGlobalUsernameUnique,
  checkGlobalUsernameUniqueness,
  warmupUsernameCache,
  isUsernameCachedAsTaken,
  addTakenUsernameToCache,
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

  // Enforce Subscription Plan Limit (Section 5.2 of SUBSCRIPTION_PLAN_LIMITATIONS.txt)
  const validation = await SubscriptionLimitService.canCreateManager({ orgId })
  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    error.limits = validation.limits
    throw error
  }

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

  addTakenUsernameToCache(username)
  addTakenUsernameToCache(managerId)

  return { id: managerId, ...payload }
}
