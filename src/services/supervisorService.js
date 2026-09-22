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
 */

export async function fetchSupervisors(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'supervisors')
}

export function subscribeSupervisors(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'supervisors', onData, onError)
}

/**
 * Checks uniqueness of username, phone, and email within organization and across user accounts
 */
export async function checkSupervisorUniqueness(orgId, { username, phone, email, currentId = null }) {
  if (!orgId) return { isUnique: true }
  
  const supervisorsRef = collection(db, 'organisation', orgId, 'supervisor')
  const snap = await getDocs(supervisorsRef)
  
  for (const d of snap.docs) {
    if (currentId && d.id === currentId) continue
    const data = d.data()
    if (username && String(data.UserName || data.username || '').toLowerCase() === String(username).toLowerCase().trim()) {
      return { isUnique: false, field: 'username', message: `Username "${username}" is already taken.` }
    }
    if (phone && String(data.ContactNo || data.phone || '').trim() === String(phone).trim()) {
      return { isUnique: false, field: 'phone', message: `Contact Number "${phone}" is already registered.` }
    }
    if (email && String(data.Email || data.email || '').toLowerCase() === String(email).toLowerCase().trim()) {
      return { isUnique: false, field: 'email', message: `Email "${email}" is already registered.` }
    }
  }

  return { isUnique: true }
}

/**
 * Creates a new field supervisor profile with credentials
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

  const cleanName = supervisorData.username.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const supervisorId = supervisorData.supervisorId || `sup_${cleanName}_${Date.now().toString().slice(-4)}`

  const payload = {
    SupervisorId: supervisorId,
    supervisorId,
    FullName: supervisorData.fullName.trim(),
    fullName: supervisorData.fullName.trim(),
    name: supervisorData.fullName.trim(),
    UserName: supervisorData.username.trim().toLowerCase(),
    userName: supervisorData.username.trim().toLowerCase(),
    username: supervisorData.username.trim().toLowerCase(),
    Password: supervisorData.password.trim(),
    password: supervisorData.password.trim(),
    ContactNo: supervisorData.phone.trim(),
    phone: supervisorData.phone.trim(),
    Email: supervisorData.email ? supervisorData.email.trim().toLowerCase() : '',
    email: supervisorData.email ? supervisorData.email.trim().toLowerCase() : '',
    Designation: supervisorData.designation || 'Site Supervisor',
    designation: supervisorData.designation || 'Site Supervisor',
    PhotoUrl: supervisorData.photoUrl || '',
    photoUrl: supervisorData.photoUrl || '',
    isActive: true,
    status: 'Active',
    assignedSites: Array.isArray(supervisorData.assignedSites) ? supervisorData.assignedSites : [],
    createdByManagerId: managerActor?.id || 'mgr_lead',
    createdByManagerName: managerActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const supRef = doc(db, 'organisation', orgId, 'supervisor', supervisorId)
  await setDoc(supRef, payload)

  return { id: supervisorId, ...payload }
}

/**
 * Updates supervisor details or resets password
 */
export async function updateSupervisor(orgId, supervisorId, updates) {
  if (!orgId || !supervisorId) throw new Error('orgId and supervisorId are required')

  const payload = { ...updates, updatedAt: serverTimestamp() }
  if (updates.fullName) {
    payload.FullName = updates.fullName
    payload.name = updates.fullName
  }
  if (updates.phone) {
    payload.ContactNo = updates.phone
  }
  if (updates.email) {
    payload.Email = updates.email
  }
  if (updates.designation) {
    payload.Designation = updates.designation
  }
  if (updates.password) {
    payload.Password = updates.password
  }
  if (updates.isActive !== undefined) {
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

  const mappingId = `MAP_${mapData.siteId}_${mapData.supervisorId}`
  const payload = {
    siteId: mapData.siteId,
    siteName: mapData.siteName || '',
    siteCode: mapData.siteCode || '',
    projectId: mapData.projectId || mapData.siteId,
    projectName: mapData.projectName || mapData.siteName || '',
    supervisorId: mapData.supervisorId,
    'Supervisor ID': mapData.supervisorId,
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

  // Also update supervisor assignedSites array
  try {
    const supRef = doc(db, 'organisation', orgId, 'supervisor', mapData.supervisorId)
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

  return { id: mappingId, ...payload }
}

export async function removeSupervisorMapping(orgId, mappingId, siteId, supervisorId) {
  if (!orgId || !mappingId) throw new Error('orgId and mappingId are required')
  const mapRef = doc(db, 'organisation', orgId, 'siteSupervisorMap', mappingId)
  await deleteDoc(mapRef)

  if (supervisorId && siteId) {
    try {
      const supRef = doc(db, 'organisation', orgId, 'supervisor', supervisorId)
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
