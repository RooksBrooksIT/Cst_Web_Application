import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore'
import { db } from './firebase.js'

/**
 * Universal High-Speed Case-Insensitive Username Validation Engine
 * Aligned 1:1 with the CST / eBricks Mobile Application Architecture (FirestoreService.isGlobalUsernameUnique).
 * 
 * Features:
 * - Strict Case-Insensitivity (e.g., 'Sharan123' rejects 'sharan123', 'SHARAN123', 'ShArAn123')
 * - Instant 0ms Synchronous In-Memory Cache Lookups
 * - Non-blocking Background Cache Warmup
 * - Fast Tier 1 Indexed Queries using .limit(1) with early short-circuit termination
 * - Tier 2 Fallback Scan across Organization, Manager, and Supervisor collections
 * - Standardized messages:
 *   - Duplicate: "Username already exists"
 *   - Unique: "Username is available ✓"
 */

// In-memory cache for taken usernames (always lowercase)
const _cachedTakenUsernames = new Set()

// In-memory cache for confirmed unique usernames (lowercase -> timestamp, TTL 60 seconds)
const _cachedUniqueUsernames = new Map()
const UNIQUE_CACHE_TTL_MS = 60 * 1000

let _cacheWarmed = false
let _isWarmingUp = false
let _warmupPromise = null

/**
 * Synchronous 0ms check to see if a username is already known to be taken in local cache
 */
export function isUsernameCachedAsTaken(username) {
  if (!username) return false
  const cleanLower = String(username).trim().toLowerCase()
  return _cachedTakenUsernames.has(cleanLower)
}

/**
 * Explicitly registers a username in the local taken cache (e.g. after successful account creation)
 */
export function addTakenUsernameToCache(username) {
  if (!username) return
  const cleanLower = String(username).trim().toLowerCase()
  if (cleanLower) {
    _cachedTakenUsernames.add(cleanLower)
    _cachedUniqueUsernames.delete(cleanLower)
  }
}

/**
 * Helper to extract usernames and IDs from a document snapshot into the local cache
 */
function extractAndCacheDoc(docSnap) {
  if (!docSnap) return
  const data = typeof docSnap.data === 'function' ? docSnap.data() || {} : docSnap
  const docId = (docSnap.id || '').toLowerCase()

  if (docId) {
    _cachedTakenUsernames.add(docId)
    if (docId.includes('_')) {
      const suffix = docId.substring(docId.lastIndexOf('_') + 1).trim()
      if (suffix) {
        _cachedTakenUsernames.add(suffix)
      }
    }
  }

  const fieldsToCheck = [
    'UserName',
    'username',
    'userName',
    'adminUsername',
    'admin_username',
    'code',
  ]

  for (const field of fieldsToCheck) {
    const val = data[field]
    if (val && typeof val === 'string') {
      const cleanVal = val.trim().toLowerCase()
      if (cleanVal) {
        _cachedTakenUsernames.add(cleanVal)
      }
    }
  }
}

/**
 * Asynchronously warms up the username cache in the background without blocking the UI
 */
export function warmupUsernameCache() {
  if (_cacheWarmed || _isWarmingUp) {
    return _warmupPromise || Promise.resolve()
  }

  _isWarmingUp = true
  _warmupPromise = (async () => {
    try {
      // 1. Root organisation collection
      try {
        const orgSnap = await getDocs(collection(db, 'organisation'))
        orgSnap.forEach(extractAndCacheDoc)
      } catch (_e) {}

      // 2. Collection groups for managers, supervisors, and config users
      const groupPromises = [
        getDocs(collectionGroup(db, 'manager')).catch(() => ({ forEach: () => {} })),
        getDocs(collectionGroup(db, 'supervisor')).catch(() => ({ forEach: () => {} })),
        getDocs(collectionGroup(db, 'supervisors')).catch(() => ({ forEach: () => {} })),
        getDocs(collectionGroup(db, 'configUsers')).catch(() => ({ forEach: () => {} })),
        getDocs(collectionGroup(db, 'config_users')).catch(() => ({ forEach: () => {} })),
        getDocs(collectionGroup(db, 'organizationUser')).catch(() => ({ forEach: () => {} })),
      ]

      const groups = await Promise.all(groupPromises)
      groups.forEach((snap) => snap.forEach?.(extractAndCacheDoc))

      // 3. Root collections
      for (const rootCol of ['manager', 'managers', 'supervisor', 'supervisors']) {
        try {
          const rootSnap = await getDocs(collection(db, rootCol))
          rootSnap.forEach(extractAndCacheDoc)
        } catch (_e) {}
      }

      _cacheWarmed = true
    } catch (err) {
      console.warn('warmupUsernameCache warning:', err)
    } finally {
      _isWarmingUp = false
    }
  })()

  return _warmupPromise
}

/**
 * Checks whether a document snapshot matches the target username case-insensitively
 */
function isDocMatch(docSnap, cleanLower, excludeDocId) {
  if (!docSnap) return false
  if (excludeDocId) {
    const parentOrgId = docSnap.ref?.parent?.parent?.id
    if (docSnap.id === excludeDocId || parentOrgId === excludeDocId) {
      return false
    }
  }

  const data = typeof docSnap.data === 'function' ? docSnap.data() || {} : docSnap

  const candidateFields = [
    data.UserName,
    data.username,
    data.userName,
    data.adminUsername,
    data.admin_username,
  ]

  for (const c of candidateFields) {
    if (c && String(c).trim().toLowerCase() === cleanLower) {
      return true
    }
  }

  const docId = (docSnap.id || '').toLowerCase()
  if (docId === cleanLower) {
    return true
  }

  if (docId.includes('_')) {
    const suffix = docId.substring(docId.lastIndexOf('_') + 1).trim()
    if (suffix && suffix === cleanLower) {
      return true
    }
  }

  return false
}

/**
 * Core validation function matching mobile application's FirestoreService.isGlobalUsernameUnique.
 * 
 * @param {string} username - Target username to check
 * @param {Object} [options]
 * @param {string} [options.orgId] - Optional current organization ID context
 * @param {string} [options.excludeDocId] - Optional document ID to exclude (e.g. during profile edit)
 * @returns {Promise<{isUnique: boolean, message: string}>}
 */
export async function isGlobalUsernameUnique(username, options = {}) {
  const { orgId, excludeDocId } = options
  const clean = String(username || '').trim()

  if (!clean) {
    return { isUnique: false, message: 'Username is required.' }
  }

  const cleanLower = clean.toLowerCase()

  if (clean.length < 3) {
    return { isUnique: false, message: 'Username must be at least 3 characters' }
  }

  // 0. INSTANT CACHE CHECKS (0ms)
  if (_cachedTakenUsernames.has(cleanLower)) {
    return { isUnique: false, message: 'Username already exists' }
  }

  const cachedUniqueTime = _cachedUniqueUsernames.get(cleanLower)
  if (cachedUniqueTime && Date.now() - cachedUniqueTime < UNIQUE_CACHE_TTL_MS) {
    return { isUnique: true, message: 'Username is available ✓' }
  }

  // Trigger background cache warmup if not yet warmed
  if (!_cacheWarmed) {
    warmupUsernameCache()
  }

  try {
    // 1. TIER 1: Fast Parallel Indexed Queries with .limit(1) and short-circuiting
    const variations = new Set([
      clean,
      cleanLower,
      clean.toUpperCase(),
    ])
    if (clean.length > 1) {
      variations.add(clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase())
    }

    const queryPromises = []

    // A. Subcollections under current active organization (if orgId present)
    if (orgId) {
      for (const subCol of ['manager', 'supervisor']) {
        const colRef = collection(db, 'organisation', orgId, subCol)
        for (const v of variations) {
          queryPromises.push(getDocs(query(colRef, where('UserName', '==', v), limit(1))))
          queryPromises.push(getDocs(query(colRef, where('username', '==', v), limit(1))))
        }
      }
    }

    // B. Collection groups across all organizations
    const colGroups = ['manager', 'supervisor', 'supervisors', 'configUsers', 'config_users', 'organizationUser']
    for (const group of colGroups) {
      try {
        const groupRef = collectionGroup(db, group)
        for (const v of variations) {
          queryPromises.push(getDocs(query(groupRef, where('UserName', '==', v), limit(1))))
          queryPromises.push(getDocs(query(groupRef, where('username', '==', v), limit(1))))
        }
      } catch (_e) {}
    }

    // C. Root collections
    for (const rootCol of ['manager', 'supervisor', 'organisation', 'organisations']) {
      try {
        const rootRef = collection(db, rootCol)
        for (const v of variations) {
          queryPromises.push(getDocs(query(rootRef, where('UserName', '==', v), limit(1))))
          queryPromises.push(getDocs(query(rootRef, where('username', '==', v), limit(1))))
        }
      } catch (_e) {}
    }

    // D. Direct Document ID lookups
    const docPromises = []
    for (const v of variations) {
      docPromises.push(getDoc(doc(db, 'organisation', v)))
      docPromises.push(getDoc(doc(db, 'manager', v)))
      docPromises.push(getDoc(doc(db, 'supervisor', v)))
      if (orgId) {
        docPromises.push(getDoc(doc(db, 'organisation', orgId, 'manager', v)))
        docPromises.push(getDoc(doc(db, 'organisation', orgId, 'supervisor', v)))
      }
    }

    // Execute with race/short-circuit detection
    let matchFound = false

    const wrappedQueries = queryPromises.map(async (p) => {
      try {
        const snap = await p
        if (matchFound) return
        for (const d of snap.docs) {
          if (isDocMatch(d, cleanLower, excludeDocId)) {
            matchFound = true
            _cachedTakenUsernames.add(cleanLower)
            return
          }
        }
      } catch (_e) {}
    })

    const wrappedDocs = docPromises.map(async (p) => {
      try {
        const d = await p
        if (matchFound) return
        if (d.exists() && isDocMatch(d, cleanLower, excludeDocId)) {
          matchFound = true
          _cachedTakenUsernames.add(cleanLower)
          return
        }
      } catch (_e) {}
    })

    await Promise.all([...wrappedQueries, ...wrappedDocs])

    if (matchFound) {
      _cachedTakenUsernames.add(cleanLower)
      return { isUnique: false, message: 'Username already exists' }
    }

    // If cache is already warmed, Tier 1 is definitive!
    if (_cacheWarmed) {
      _cachedUniqueUsernames.set(cleanLower, Date.now())
      return { isUnique: true, message: 'Username is available ✓' }
    }

    // 2. TIER 2: Fast CollectionGroup / Root Collection Scan (if cache not yet warmed)
    const tier2Snaps = await Promise.all([
      getDocs(collection(db, 'organisation')).catch(() => ({ docs: [] })),
      getDocs(collectionGroup(db, 'manager')).catch(() => ({ docs: [] })),
      getDocs(collectionGroup(db, 'supervisor')).catch(() => ({ docs: [] })),
      getDocs(collectionGroup(db, 'supervisors')).catch(() => ({ docs: [] })),
      getDocs(collectionGroup(db, 'configUsers')).catch(() => ({ docs: [] })),
      getDocs(collectionGroup(db, 'config_users')).catch(() => ({ docs: [] })),
    ])

    for (const snap of tier2Snaps) {
      for (const d of snap.docs) {
        extractAndCacheDoc(d)
        if (isDocMatch(d, cleanLower, excludeDocId)) {
          _cachedTakenUsernames.add(cleanLower)
          return { isUnique: false, message: 'Username already exists' }
        }
      }
    }

    _cacheWarmed = true
    _cachedUniqueUsernames.set(cleanLower, Date.now())
    return { isUnique: true, message: 'Username is available ✓' }
  } catch (err) {
    console.error('isGlobalUsernameUnique error:', err)
    // Fail-safe: if cache already knows it, reject, else allow with availability
    if (_cachedTakenUsernames.has(cleanLower)) {
      return { isUnique: false, message: 'Username already exists' }
    }
    return { isUnique: true, message: 'Username is available ✓' }
  }
}

/**
 * Primary interface for Manager username uniqueness check
 */
export async function checkGlobalUsernameUniqueness(orgId, targetUsername) {
  return isGlobalUsernameUnique(targetUsername, { orgId })
}

/**
 * Primary interface for Supervisor username uniqueness check
 */
export async function checkSupervisorUsernameUniqueness(orgId, targetUsername, currentId = null) {
  return isGlobalUsernameUnique(targetUsername, { orgId, excludeDocId: currentId })
}

/**
 * Primary interface for Organization username uniqueness check
 */
export async function checkOrganizationUsernameUniqueness(targetUsername) {
  return isGlobalUsernameUnique(targetUsername)
}

/**
 * Validates organization registration fields matching mobile FirestoreService.validateOrganizationRegistration
 */
export async function validateOrganizationRegistration({ username = '' } = {}) {
  const cleanUsername = String(username).trim()
  const userCheck = await isGlobalUsernameUnique(cleanUsername)
  if (!userCheck.isUnique) {
    return {
      isValid: false,
      errorMessage: 'Username already exists',
      isUsernameDuplicate: true,
    }
  }
  return { isValid: true, message: 'Username is available ✓' }
}

