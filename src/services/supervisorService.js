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
  onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'
import { notifySiteAssignment } from './notificationService.js'
import { SubscriptionLimitService } from './subscriptionLimitService.js'
import {
  isGlobalUsernameUnique,
  warmupUsernameCache,
  isUsernameCachedAsTaken,
  addTakenUsernameToCache,
} from './usernameValidationService.js'

export {
  isGlobalUsernameUnique,
  warmupUsernameCache,
  isUsernameCachedAsTaken,
  addTakenUsernameToCache,
}


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

  try {
    const colRef = collection(db, 'organisation', orgId, 'supervisor')
    const snap = await getDocs(colRef)
    snap.docs.forEach((d) => {
      const data = d.data() || {}
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
    console.warn('Error reading existing supervisor IDs:', err)
  }

  // Find max sequential number
  const maxNum = existingNumbers.size > 0 ? Math.max(...existingNumbers) : 0
  let nextNum = maxNum + 1

  // Guarantee candidate does not collide with any existing document in supervisor collection
  while (true) {
    const candidateId = `SUP${String(nextNum).padStart(3, '0')}`
    try {
      const supDoc = await getDoc(doc(db, 'organisation', orgId, 'supervisor', candidateId))
      if (!supDoc.exists()) {
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

  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'supervisor'))
    return snap.docs.map((d) => {
      const data = d.data() || {}
      const primaryId = data.SupervisorId || data.supervisorId || d.id
      return {
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
      }
    })
  } catch (err) {
    console.warn('Error fetching supervisors from supervisor collection:', err)
    return []
  }
}

export function subscribeSupervisors(orgId, onData, onError) {
  if (!orgId) return () => {}
  const colRef = collection(db, 'organisation', orgId, 'supervisor')
  return onSnapshot(
    colRef,
    (snapshot) => {
      const supervisors = snapshot.docs.map((d) => {
        const data = d.data() || {}
        const primaryId = data.SupervisorId || data.supervisorId || d.id
        return {
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
        }
      })
      onData(supervisors)
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

/**
 * Checks uniqueness of username, phone, and email within organization across user accounts
 */
export async function checkSupervisorUniqueness(orgId, { username, phone, email, currentId = null }) {
  if (!orgId) return { isUnique: true }

  // 1. Universal Case-Insensitive Global Username Validation
  if (username && String(username).trim()) {
    const userRes = await isGlobalUsernameUnique(username, { orgId, excludeDocId: currentId })
    if (!userRes.isUnique) {
      return { isUnique: false, field: 'username', message: 'Username already exists' }
    }
  }

  // 2. Phone and Email Uniqueness Check within Organization supervisor collection
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'supervisor'))
    for (const d of snap.docs) {
      const data = d.data() || {}
      const docSupervisorId = data.SupervisorId || data.supervisorId || d.id

      if (currentId && (d.id === currentId || docSupervisorId === currentId)) {
        continue
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

  return { isUnique: true, message: 'Username is available ✓' }
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

  // Enforce Subscription Plan Limit (Section 5.3 of SUBSCRIPTION_PLAN_LIMITATIONS.txt)
  const validation = await SubscriptionLimitService.canCreateSupervisor({ orgId })
  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    error.limits = validation.limits
    error.details = validation
    throw error
  }

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
  // Store newly created supervisor data only in the existing `supervisor` Firestore collection
  const supRef = doc(db, 'organisation', orgId, 'supervisor', supervisorId)
  await setDoc(supRef, payload)

  addTakenUsernameToCache(supervisorData.username)
  addTakenUsernameToCache(supervisorId)

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

  const supRef = doc(db, 'organisation', orgId, 'supervisor', supervisorId)
  await updateDoc(supRef, payload)
}

/**
 * Toggles active / inactive status of a supervisor
 */
export async function toggleSupervisorStatus(orgId, supervisorId, isActive) {
  return updateSupervisor(orgId, supervisorId, { isActive: Boolean(isActive) })
}

/**
 * Deletes a supervisor profile from the supervisor collection
 */
export async function deleteSupervisor(orgId, supervisorId) {
  if (!orgId || !supervisorId) throw new Error('orgId and supervisorId are required')
  const supRef = doc(db, 'organisation', orgId, 'supervisor', supervisorId)
  await deleteDoc(supRef)
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

// Helper to resolve canonical siteDocId (e.g. ST001_Testing), siteId (ST001), and siteName (Testing)
export function parseSiteIdentifiers(mapData) {
  const siteObj = mapData.site || {}
  const rawSiteDocId = String(mapData.siteDocId || siteObj.siteDocId || '').trim()
  const rawSiteId = String(mapData.siteId || siteObj.siteId || siteObj.siteCode || mapData.siteCode || '').trim()
  const rawSiteName = String(mapData.siteName || siteObj.siteName || mapData.projectName || siteObj.projectName || '').trim()

  let siteDocId = ''
  let siteId = ''
  let siteName = ''

  // 1. If explicit siteDocId provided (e.g. "ST001_Testing")
  if (rawSiteDocId && rawSiteDocId.includes('_')) {
    siteDocId = rawSiteDocId
    const parts = siteDocId.split('_').filter(Boolean)
    siteId = parts[0]
    siteName = parts.slice(1).join('_')
  }

  // 2. If compound ID with 3 or more parts (e.g. "PR003_ST003_RooksAndBrooks" or "PR001_ST001_Testing")
  if (!siteDocId && rawSiteId.includes('_')) {
    const parts = rawSiteId.split('_').filter(Boolean)
    if (parts.length >= 3 && parts[0].toUpperCase().startsWith('PR')) {
      const codePart = parts[1].toUpperCase().startsWith('PR') ? `ST${parts[1].substring(2)}` : parts[1]
      const namePart = parts.slice(2).join('_')
      siteDocId = `${codePart}_${namePart}`
      siteId = codePart
      siteName = namePart
    } else if (parts.length >= 2) {
      const codePart = parts[0].toUpperCase().startsWith('PR') ? `ST${parts[0].substring(2)}` : parts[0]
      const namePart = parts.slice(1).join('_')
      siteDocId = `${codePart}_${namePart}`
      siteId = codePart
      siteName = namePart
    }
  }

  // 3. Fallback: construct from siteCode/siteId and siteName
  if (!siteDocId) {
    const code = rawSiteId.toUpperCase().startsWith('PR') ? `ST${rawSiteId.substring(2)}` : (rawSiteId || 'ST001')
    const name = (rawSiteName || 'Site').replace(/\s+/g, '')
    siteDocId = `${code}_${name}`
    siteId = code
    siteName = rawSiteName || name
  }

  if (!siteId && siteDocId.includes('_')) {
    siteId = siteDocId.split('_')[0]
  }
  if (!siteName && siteDocId.includes('_')) {
    siteName = siteDocId.split('_').slice(1).join('_')
  }

  return { siteDocId, siteId, siteName }
}

export async function mapSupervisorToSite(orgId, mapData, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!mapData.siteId && !mapData.siteDocId && !mapData.site) throw new Error('Site is required')
  if (!mapData.supervisorId && !mapData.SupervisorId && !mapData['Supervisor ID']) throw new Error('Supervisor is required')

  const { siteDocId, siteId, siteName } = parseSiteIdentifiers(mapData)

  const supervisorName = (
    mapData.FullName ||
    mapData.supervisorName ||
    mapData.supervisor ||
    'Supervisor'
  ).trim()
  const cleanSupName = supervisorName.replace(/\s+/g, '')

  const supervisorId = String(
    mapData.supervisorId ||
    mapData.SupervisorId ||
    mapData['Supervisor ID'] ||
    'SUP001'
  ).trim()

  // Format: site document ID / site name format + supervisor name (e.g. ST001_Testing_Abinesh)
  const mappingId = `${siteDocId}_${cleanSupName}`

  const managerName = (
    managerActor?.name ||
    managerActor?.displayName ||
    managerActor?.fullName ||
    mapData.managerName ||
    mapData.manager ||
    mapData.assignedByManager ||
    'Sharan'
  ).trim()

  const managerId = (
    managerActor?.id ||
    managerActor?.uid ||
    mapData.managerId ||
    ''
  ).trim()

  const projectName = (
    mapData.projectName ||
    mapData.project ||
    siteName ||
    'Testing'
  ).trim()

  const stage = (
    mapData.projectStage ||
    mapData.stage ||
    'Ground'
  ).trim()

  const formatIsoDate = (d) => {
    if (!d) return ''
    if (typeof d === 'string') return d
    if (d instanceof Date) return d.toISOString().split('T')[0]
    if (d?.toDate) return d.toDate().toISOString().split('T')[0]
    if (d?.seconds) return new Date(d.seconds * 1000).toISOString().split('T')[0]
    return ''
  }

  const startDate = formatIsoDate(mapData.startDate)
  const endDate = formatIsoDate(mapData.endDate)
  const joinedDate = formatIsoDate(mapData.joinedDate)
  const joinedOn = mapData['Joined On'] || mapData.joinedOn || ''

  const siteObj = mapData.site || {}
  const location = (
    mapData.location ||
    siteObj.location ||
    siteObj.siteLocation ||
    ''
  ).trim()

  const siteComments = (
    mapData.siteComments ||
    mapData.comments ||
    ''
  ).trim()

  const payload = {
    FullName: supervisorName,
    'Joined On': joinedOn,
    'Supervisor ID': supervisorId,
    SupervisorId: supervisorId,
    assignedByManager: managerName,
    endDate: endDate,
    joinedDate: joinedDate,
    location: location,
    manager: managerName,
    managerId: managerId,
    managerName: managerName,
    project: projectName,
    projectName: projectName,
    projectStage: stage,
    site: siteDocId,
    siteComments: siteComments,
    siteDocId: siteDocId,
    siteId: siteId,
    siteName: siteName,
    stage: stage,
    startDate: startDate,
    supervisor: supervisorName,
    supervisorId: supervisorId,
    supervisorName: supervisorName,
    updatedAt: serverTimestamp(),
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
        const siteToAssign = siteDocId || mapData.siteId
        if (!existing.includes(siteToAssign)) {
          await updateDoc(supRef, {
            assignedSites: [...existing, siteToAssign],
            updatedAt: serverTimestamp(),
          })
        }
      }
    } catch (err) {
      console.warn('Could not update supervisor assignedSites array:', err)
    }
  }

  // Dispatch site assignment notification (Section 2.2 #4 & Flow 1)
  try {
    await notifySiteAssignment({
      orgId,
      siteId: siteDocId || mapData.siteId,
      siteName: siteName || projectName || 'Assigned Site',
      supervisorId: supervisorId,
      supervisorName: supervisorName,
      senderUser: managerActor,
      senderRole: 'manager',
    })
  } catch (notifErr) {
    console.warn('Site assignment notification dispatch warning:', notifErr)
  }

  return { id: mappingId, ...payload }
}

export async function removeSupervisorMapping(orgId, mappingId, siteId, supervisorId) {
  if (!orgId || !mappingId) throw new Error('orgId and mappingId are required')
  const mapRef = doc(db, 'organisation', orgId, 'siteSupervisorMap', mappingId)
  await deleteDoc(mapRef)

  if (supervisorId) {
    const collections = ['supervisor', 'siteSupervisor']
    for (const col of collections) {
      try {
        const supRef = doc(db, 'organisation', orgId, col, supervisorId)
        const supSnap = await getDoc(supRef)
        if (supSnap.exists()) {
          const existing = supSnap.data().assignedSites || []
          await updateDoc(supRef, {
            assignedSites: existing.filter(
              (s) => s !== siteId && s !== mappingId && !mappingId.startsWith(s + '_')
            ),
            updatedAt: serverTimestamp(),
          })
        }
      } catch (err) {
        console.warn('Could not update supervisor assignedSites array upon de-link:', err)
      }
    }
  }
}
