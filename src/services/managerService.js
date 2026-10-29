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
import { db } from './firebase.js'
import { fetchWithFallback, subscribeWithFallback } from './firestoreService.js'
import { SubscriptionLimitService } from './subscriptionLimitService.js'

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
} from './usernameValidationService.js'

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
 * Validates standard email address format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(email.trim())
}

/**
 * Validates standard 10-digit numeric contact number (0-9)
 */
export function isValidContactNumber(phone) {
  if (!phone || typeof phone !== 'string') return false
  return /^\d{10}$/.test(phone.trim())
}

/**
 * Validates manager password minimum length (8 characters)
 */
export function isValidManagerPassword(password) {
  if (!password || typeof password !== 'string') return false
  return password.length >= 8
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
  if (!isValidManagerPassword(password)) {
    throw new Error('Password must be at least 8 characters long')
  }
  if (!phone) throw new Error('Contact Number is required')
  if (!isValidContactNumber(phone)) {
    throw new Error('Contact number must be exactly 10 numeric digits')
  }
  if (!email) throw new Error('Official email address is required')
  if (!isValidEmail(email)) {
    throw new Error('Please enter a valid email address (e.g. manager@example.com)')
  }

  // Enforce Subscription Plan Limit (Section 5.2 of SUBSCRIPTION_PLAN_LIMITATIONS.txt)
  const validation = await SubscriptionLimitService.canCreateManager({ orgId })
  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    error.limits = validation.limits
    error.details = validation
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

/**
 * Updates manager details, status, or credentials in /organisation/{orgId}/manager/{managerId}
 */
export async function updateManager(orgId, managerId, updates = {}) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!managerId) throw new Error('Manager ID is required')

  const mgrRef = doc(db, 'organisation', orgId, 'manager', managerId)
  const payload = { updatedAt: serverTimestamp() }

  if (updates.fullName !== undefined) {
    const fn = String(updates.fullName || '').trim()
    if (!fn) throw new Error('Full Name cannot be empty')
    payload.FullName = fn
    payload.fullName = fn
    payload.name = fn
  }

  if (updates.phone !== undefined) {
    const ph = String(updates.phone || '').trim()
    if (!ph) throw new Error('Contact Number cannot be empty')
    payload.ContactNo = ph
    payload.phone = ph
  }

  if (updates.email !== undefined) {
    const em = String(updates.email || '').trim().toLowerCase()
    if (em && !isValidEmail(em)) {
      throw new Error('Please enter a valid email address (e.g. manager@example.com)')
    }
    payload.Email = em
    payload.email = em
  }

  if (updates.designation !== undefined) {
    payload.Designation = String(updates.designation || 'Site Manager').trim()
    payload.designation = payload.Designation
  }

  if (updates.department !== undefined) {
    payload.Department = String(updates.department || 'Operations').trim()
    payload.department = payload.Department
  }

  if (updates.password !== undefined && updates.password !== '') {
    const pwd = String(updates.password).trim()
    if (!pwd) throw new Error('Password cannot be empty')
    payload.Password = pwd
    payload.password = pwd
  }

  if (updates.status !== undefined) {
    payload.Status = String(updates.status).trim()
    payload.status = payload.Status
  }

  await setDoc(mgrRef, payload, { merge: true })
  return { id: managerId, ...payload }
}
