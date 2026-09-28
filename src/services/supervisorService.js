import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Supervisor & Field Operations Service
 * Scoped under: /organisation/{orgId}/supervisor and /organisation/{orgId}/siteSupervisorMap
 * Complies with Section 3 Group 4 & Section 5.2/5.7 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 *
 * Supervisor ID Specification:
 * - Format: SUP001, SUP002, SUP003, etc.
 * - Source of truth: SupervisorId field
 * - Firestore Document ID == SupervisorId (e.g. doc('.../supervisor/SUP001'))
 * - Preserves ContactNo, Designation, Email, FullName, Password, Photo, UserName, createdAt, updatedAt
 */

/**
 * Automatically calculates the next sequential Supervisor ID in the format SUP001, SUP002, etc.
 * Uses existing SupervisorId field as the source of truth and prevents duplicate IDs.
 */
export async function getNextSupervisorId(orgId) {
  if (!orgId) return 'SUP001'

  const existingNumbers = new Set()
  const collectionsToCheck = ['supervisor', 'siteSupervisor', 'supervisors']

  for (const colName of collectionsToCheck) {
    try {
      const colRef = collection(db, 'organisation', orgId, colName)
      const snap = await getDocs(colRef)
      snap.docs.forEach((d) => {
        const data = d.data() || {}
        // Check SupervisorId (source of truth), supervisorId, 'Supervisor ID', and doc ID
        const candidates = [
          data.SupervisorId,
          data.supervisorId,
          data['Supervisor ID'],
          d.id,
        ]

        candidates.forEach((val) => {
          if (!val) return
          const match = String(val).trim().match(/^SUP(\d+)$/i)
          if (match && match[1]) {
            const num = parseInt(match[1], 10)
            if (!isNaN(num) && num > 0) {
              existingNumbers.add(num)
            }
          }
        })
      })
    } catch (err) {
      // Continue checking next collection alias
    }
  }

  // Find max sequential number
  const maxNum = existingNumbers.size > 0 ? Math.max(...existingNumbers) : 0
  let nextNum = maxNum + 1

  // Guarantee candidate does not collide with any existing document in Firestore
  while (true) {
    const candidateId = `SUP${String(nextNum).padStart(3, '0')}`
    try {
      const supDoc = await getDoc(doc(db, 'organisation', orgId, 'supervisor', candidateId))
      let siteSupExists = false
      try {
        const siteDoc = await getDoc(doc(db, 'organisation', orgId, 'siteSupervisor', candidateId))
        siteSupExists = siteDoc.exists()
      } catch (e) {}

      if (!supDoc.exists() && !siteSupExists) {
        return candidateId
      }
    } catch (e) {
      if (!existingNumbers.has(nextNum)) {
        return candidateId
      }
    }
    nextNum++
  }
}

/**
 * Fetches all supervisors in the organization across canonical and legacy collections,
 * deduplicating by SupervisorId / ID and normalizing all fields.
 */
export async function fetchSupervisors(orgId) {
  if (!orgId) return []
  const collectionsToCheck = ['supervisor', 'siteSupervisor', 'supervisors']
  const map = new Map()

  for (const colName of collectionsToCheck) {
    try {
      const snap = await getDocs(collection(db, 'organisation', orgId, colName))
      snap.docs.forEach((d) => {
        const data = d.data() || {}
        const primaryId = data.SupervisorId || data.supervisorId || d.id
        if (!map.has(primaryId)) {
          map.set(primaryId, {
            id: primaryId,
            SupervisorId: data.SupervisorId || data.supervisorId || primaryId,
            supervisorId: data.supervisorId || data.SupervisorId || primaryId,
            FullName: data.FullName || data.fullName || data.name || '',
            fullName: data.fullName || data.FullName || data.name || '',
            UserName: data.UserName || data.username || '',
            username: data.username || data.UserName || '',
            ContactNo: data.ContactNo || data.phone || '',
            phone: data.phone || data.ContactNo || '',
            Email: data.Email || data.email || '',
            email: data.email || data.Email || '',
            Designation: data.Designation || data.designation || 'Site Supervisor',
            designation: data.designation || data.Designation || 'Site Supervisor',
            Photo: data.Photo || data.photo || data.PhotoUrl || data.photoUrl || '',
            PhotoUrl: data.PhotoUrl || data.photoUrl || data.Photo || '',
            photoUrl: data.photoUrl || data.PhotoUrl || data.Photo || '',
            Password: data.Password || data.password || '',
            password: data.password || data.Password || '',
            isActive: data.isActive !== false && data.status !== 'Inactive',
            status: data.status || (data.isActive === false ? 'Inactive' : 'Active'),
            assignedSites: Array.isArray(data.assignedSites) ? data.assignedSites : [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            ...data,
          })
        }
      })
    } catch (e) {}
  }

  if (map.size > 0) {
    return Array.from(map.values())
  }
  return fetchWithFallback(orgId, 'supervisors')
}

export function subscribeSupervisors(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'supervisors', onData, onError)
}

/**
 * Checks uniqueness of username, phone, and email within organization across user accounts
 */
export async function checkSupervisorUniqueness(orgId, { username, phone, email, currentId = null }) {
  if (!orgId) return { isUnique: true }

  const checked = new Set()
  const collectionsToCheck = ['supervisor', 'siteSupervisor', 'supervisors']

  for (const colName of collectionsToCheck) {
    try {
      const snap = await getDocs(collection(db, 'organisation', orgId, colName))
      for (const d of snap.docs) {
        if (checked.has(d.id)) continue
        checked.add(d.id)

        const data = d.data() || {}
        const docSupervisorId = data.SupervisorId || data.supervisorId || d.id

        if (currentId && (d.id === currentId || docSupervisorId === currentId)) {
          continue
        }

        if (
          username &&
          String(data.UserName || data.username || '').toLowerCase() === String(username).toLowerCase().trim()
        ) {
          return { isUnique: false, field: 'username', message: `Username "${username}" is already taken.` }
        }
        if (phone && String(data.ContactNo || data.phone || '').trim() === String(phone).trim()) {
          return { isUnique: false, field: 'phone', message: `Contact Number "${phone}" is already registered.` }
        }
        if (
          email &&
          String(data.Email || data.email || '').toLowerCase() === String(email).toLowerCase().trim()
        ) {
          return { isUnique: false, field: 'email', message: `Email "${email}" is already registered.` }
        }
      }
    } catch (e) {}
  }

  return { isUnique: true }
}

/**
 * Creates a new field supervisor profile with credentials
 * Strictly adheres to:
 * 1. Supervisor ID format: SUP001, SUP002, SUP003, etc.
 * 2. SupervisorId field is the source of truth
 * 3. Firestore Document ID is IDENTICAL to the generated SupervisorId
 * 4. Preserves existing fields: ContactNo, Designation, Email, FullName, Password, Photo, UserName, createdAt, updatedAt
 */
export async function createSupervisor(orgId, supervisorData, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!supervisorData.fullName?.trim()) throw new Error('Full Name is required')
  if (!supervisorData.username?.trim()) throw new Error('Username is required')
  if (!supervisorData.password?.trim()) throw new Error('Password is required')
  if (!supervisorData.phone?.trim()) throw new Error('Contact Phone is required')

  const uniqueCheck = await checkSupervisorUniqueness(orgId, {
    username: supervisorData.username,
    phone: supervisorData.phone,
    email: supervisorData.email,
  })

  if (!uniqueCheck.isUnique) {
    throw new Error(uniqueCheck.message)
  }

  // 1. Determine Supervisor ID in SUP### format (e.g. SUP001, SUP002...)
  let supervisorId = null
  const candidate = (supervisorData.supervisorId || supervisorData.SupervisorId || '').trim()

  if (candidate && /^SUP\d+$/i.test(candidate)) {
    const upperCandidate = candidate.toUpperCase()
    // Verify it doesn't already exist in Firestore
    const checkSup = await getDoc(doc(db, 'organisation', orgId, 'supervisor', upperCandidate))
    let checkSiteSup = false
    try {
      const siteDoc = await getDoc(doc(db, 'organisation', orgId, 'siteSupervisor', upperCandidate))
      checkSiteSup = siteDoc.exists()
    } catch (e) {}

    if (!checkSup.exists() && !checkSiteSup) {
      supervisorId = upperCandidate
    }
  }

  // If no explicit unused SUP ID was provided, automatically determine the next sequential ID
  if (!supervisorId) {
    supervisorId = await getNextSupervisorId(orgId)
  }

  const fullName = supervisorData.fullName.trim()
  const username = supervisorData.username.trim().toLowerCase()
  const password = supervisorData.password.trim()
  const phone = supervisorData.phone.trim()
  const email = supervisorData.email ? supervisorData.email.trim().toLowerCase() : ''
  const designation = supervisorData.designation || 'Site Supervisor'
  const photo = supervisorData.photo || supervisorData.photoUrl || ''

  // 2. Build payload strictly preserving existing fields and structure
  const payload = {
    // Source of truth ID
    SupervisorId: supervisorId,
    supervisorId,

    // Required fields with exact schema and casing preserved
    FullName: fullName,
    fullName,
    name: fullName,

    UserName: username,
    userName: username,
    username,

    Password: password,
    password,

    ContactNo: phone,
    phone,

    Email: email,
    email,

    Designation: designation,
    designation,

    Photo: photo,
    PhotoUrl: photo,
    photoUrl: photo,

    // Status and role metadata
    isActive: true,
    status: 'Active',
    role: 'supervisor',
    assignedSites: Array.isArray(supervisorData.assignedSites) ? supervisorData.assignedSites : [],
    createdByManagerId: managerActor?.id || 'mgr_lead',
    createdByManagerName: managerActor?.name || 'Operations Manager',
    organizationId: orgId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // 3. Document ID MUST BE EXACTLY the generated SupervisorId (no random IDs)
  const supRef = doc(db, 'organisation', orgId, 'supervisor', supervisorId)
  await setDoc(supRef, payload)

  // Mirror to legacy siteSupervisor alias collection with identical Document ID
  try {
    const siteSupRef = doc(db, 'organisation', orgId, 'siteSupervisor', supervisorId)
    await setDoc(siteSupRef, payload)
  } catch (err) {
    console.warn('Could not mirror supervisor to siteSupervisor collection:', err)
  }

  return { id: supervisorId, SupervisorId: supervisorId, ...payload }
}

/**
 * Updates supervisor details or resets password across supervisor collections
 */
export async function updateSupervisor(orgId, supervisorId, updates) {
  if (!orgId || !supervisorId) throw new Error('orgId and supervisorId are required')

  const payload = { ...updates, updatedAt: serverTimestamp() }
  if (updates.fullName) {
    payload.FullName = updates.fullName
    payload.fullName = updates.fullName
    payload.name = updates.fullName
  }
  if (updates.phone) {
    payload.ContactNo = updates.phone
    payload.phone = updates.phone
  }
  if (updates.email !== undefined) {
    payload.Email = updates.email
    payload.email = updates.email
  }
  if (updates.designation) {
    payload.Designation = updates.designation
    payload.designation = updates.designation
  }
  if (updates.password) {
    payload.Password = updates.password
    payload.password = updates.password
  }
  if (updates.photo || updates.photoUrl) {
    payload.Photo = updates.photo || updates.photoUrl
    payload.PhotoUrl = updates.photoUrl || updates.photo
    payload.photoUrl = updates.photoUrl || updates.photo
  }
  if (updates.isActive !== undefined) {
    payload.isActive = Boolean(updates.isActive)
    payload.status = updates.isActive ? 'Active' : 'Inactive'
  }

  const collections = ['supervisor', 'siteSupervisor']
  for (const col of collections) {
    try {
      const supRef = doc(db, 'organisation', orgId, col, supervisorId)
      await updateDoc(supRef, payload)
    } catch (err) {
      // Document might not exist in secondary alias collection
    }
  }
}

/**
 * Toggles active / inactive status of a supervisor
 */
export async function toggleSupervisorStatus(orgId, supervisorId, isActive) {
  return updateSupervisor(orgId, supervisorId, { isActive: Boolean(isActive) })
}

/**
 * Deletes a supervisor profile across collections
 */
export async function deleteSupervisor(orgId, supervisorId) {
  if (!orgId || !supervisorId) throw new Error('orgId and supervisorId are required')
  const collections = ['supervisor', 'siteSupervisor']
  for (const col of collections) {
    try {
      const supRef = doc(db, 'organisation', orgId, col, supervisorId)
      await deleteDoc(supRef)
    } catch (err) {}
  }
}

// ------------------------------------------------------------------------------------------------
// 2. SITE SUPERVISOR MAPPING (/organisation/{orgId}/siteSupervisorMap/{mappingId})
// ------------------------------------------------------------------------------------------------

export async function fetchSiteSupervisorMappings(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteSupervisorMap')
}

export function subscribeSiteSupervisorMappings(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteSupervisorMap', onData, onError)
}

export async function mapSupervisorToSite(orgId, mapData, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!mapData.siteId) throw new Error('Site is required')
  if (!mapData.supervisorId) throw new Error('Supervisor is required')

  const supervisorId = mapData.supervisorId
  const mappingId = `MAP_${mapData.siteId}_${supervisorId}`
  const payload = {
    siteId: mapData.siteId,
    siteName: mapData.siteName || '',
    siteCode: mapData.siteCode || '',
    projectId: mapData.projectId || mapData.siteId,
    projectName: mapData.projectName || mapData.siteName || '',
    SupervisorId: supervisorId,
    supervisorId: supervisorId,
    'Supervisor ID': supervisorId,
    supervisorName: mapData.supervisorName || '',
    supervisor: mapData.supervisorName || '',
    projectStage: mapData.projectStage || 'Foundation & Plinth',
    location: mapData.location || '',
    joinedDate: mapData.joinedDate ? new Date(mapData.joinedDate) : serverTimestamp(),
    startDate: mapData.startDate ? new Date(mapData.startDate) : serverTimestamp(),
    endDate: mapData.endDate ? new Date(mapData.endDate) : null,
    comments: mapData.comments || '',
    managerId: managerActor?.id || 'mgr_lead',
    managerName: managerActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
  }

  const mapRef = doc(db, 'organisation', orgId, 'siteSupervisorMap', mappingId)
  await setDoc(mapRef, payload)

  // Also update supervisor assignedSites array on both collections
  const collections = ['supervisor', 'siteSupervisor']
  for (const col of collections) {
    try {
      const supRef = doc(db, 'organisation', orgId, col, supervisorId)
      const supSnap = await getDoc(supRef)
      if (supSnap.exists()) {
        const existing = supSnap.data().assignedSites || []
        if (!existing.includes(mapData.siteId)) {
          await updateDoc(supRef, {
            assignedSites: [...existing, mapData.siteId],
            updatedAt: serverTimestamp(),
          })
        }
      }
    } catch (err) {
      console.warn('Could not update supervisor assignedSites array:', err)
    }
  }

  return { id: mappingId, ...payload }
}

export async function removeSupervisorMapping(orgId, mappingId, siteId, supervisorId) {
  if (!orgId || !mappingId) throw new Error('orgId and mappingId are required')
  const mapRef = doc(db, 'organisation', orgId, 'siteSupervisorMap', mappingId)
  await deleteDoc(mapRef)

  if (supervisorId && siteId) {
    const collections = ['supervisor', 'siteSupervisor']
    for (const col of collections) {
      try {
        const supRef = doc(db, 'organisation', orgId, col, supervisorId)
        const supSnap = await getDoc(supRef)
        if (supSnap.exists()) {
          const existing = supSnap.data().assignedSites || []
          await updateDoc(supRef, {
            assignedSites: existing.filter((s) => s !== siteId),
            updatedAt: serverTimestamp(),
          })
        }
      } catch (err) {
        console.warn('Could not update supervisor assignedSites array upon de-link:', err)
      }
    }
  }
}
