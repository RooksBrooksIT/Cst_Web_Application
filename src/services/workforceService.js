import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
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
 * CST White Label - Workforce, Labour & Attendance Service
 * Scoped under:
 *   /organisation/{orgId}/labours
 *   /organisation/{orgId}/workers
 *   /organisation/{orgId}/workerSiteMapping
 *   /organisation/{orgId}/workerAttendance
 * Complies with Section 3 Group 6 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const DEFAULT_LABOUR_CATEGORIES = [
  { trade: 'Mason', dailyWage: 950, otHourlyRate: 150 },
  { trade: 'Male Helper', dailyWage: 650, otHourlyRate: 100 },
  { trade: 'Female Helper', dailyWage: 600, otHourlyRate: 90 },
  { trade: 'Carpenter', dailyWage: 900, otHourlyRate: 140 },
  { trade: 'Barbender', dailyWage: 900, otHourlyRate: 140 },
  { trade: 'Welder', dailyWage: 850, otHourlyRate: 130 },
  { trade: 'Electrician', dailyWage: 900, otHourlyRate: 140 },
  { trade: 'Plumber', dailyWage: 850, otHourlyRate: 130 },
]

// ------------------------------------------------------------------------------------------------
// 1. LABOUR WAGE SCALES (/organisation/{orgId}/labours)
// ------------------------------------------------------------------------------------------------

export async function fetchLabourScales(orgId) {
  return fetchWithFallback(orgId, 'labours')
}

export async function createLabourScale(orgId, scaleData) {
  if (!orgId || !scaleData.trade?.trim()) throw new Error('Trade name is required')
  const id = `LAB_${Date.now()}`
  const docRef = doc(db, 'organisation', orgId, 'labours', id)
  const payload = {
    id,
    trade: scaleData.trade.trim(),
    name: scaleData.trade.trim(),
    dailyWage: Number(scaleData.dailyWage) || 800,
    otHourlyRate: Number(scaleData.otHourlyRate) || 120,
    createdAt: serverTimestamp(),
  }
  await setDoc(docRef, payload)
  return payload
}

export async function deleteLabourScale(orgId, id) {
  await deleteDoc(doc(db, 'organisation', orgId, 'labours', id))
}

// ------------------------------------------------------------------------------------------------
// 2. DIRECT WORKERS DIRECTORY (/organisation/{orgId}/workers)
// ------------------------------------------------------------------------------------------------

export async function fetchWorkers(orgId) {
  return fetchWithFallback(orgId, 'workers')
}

export function subscribeWorkers(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'workers', onData, onError)
}

export async function createWorker(orgId, workerData) {
  if (!orgId || !workerData.name?.trim()) throw new Error('Worker name is required')

  const timestamp = Date.now()
  const workerId = workerData.workerId || `WRK_${timestamp.toString().slice(-4)}`

  const payload = {
    workerId,
    name: workerData.name.trim(),
    workerName: workerData.name.trim(),
    phone: workerData.phone?.trim() || '',
    address: workerData.address || '',
    joiningDate: workerData.joiningDate ? new Date(workerData.joiningDate) : serverTimestamp(),
    designation: workerData.designation || 'Mason',
    trade: workerData.designation || 'Mason',
    salary: Number(workerData.salary || workerData.dailyWageRate) || 800,
    dailyWageRate: Number(workerData.salary || workerData.dailyWageRate) || 800,
    overtimeHourlyRate: Number(workerData.overtimeHourlyRate) || 120,
    assignedSiteId: workerData.assignedSiteId || '',
    assignedSiteName: workerData.assignedSiteName || '',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'workers', workerId)
  await setDoc(docRef, payload)

  return { id: workerId, ...payload }
}

export async function updateWorker(orgId, workerId, updates) {
  if (!orgId || !workerId) throw new Error('orgId and workerId are required')
  const docRef = doc(db, 'organisation', orgId, 'workers', workerId)
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteWorker(orgId, workerId) {
  if (!orgId || !workerId) throw new Error('orgId and workerId are required')
  const docRef = doc(db, 'organisation', orgId, 'workers', workerId)
  await deleteDoc(docRef)
}

// ------------------------------------------------------------------------------------------------
// 3. WORKER SITE MAPPING (/organisation/{orgId}/workerSiteMapping)
// ------------------------------------------------------------------------------------------------

export async function fetchWorkerSiteMappings(orgId) {
  return fetchWithFallback(orgId, 'workerSiteMapping')
}

export async function mapWorkerToSite(orgId, mappingData) {
  if (!orgId || !mappingData.workerId || !mappingData.siteId) throw new Error('workerId and siteId required')
  const id = `WMAP_${mappingData.siteId}_${mappingData.workerId}`
  const docRef = doc(db, 'organisation', orgId, 'workerSiteMapping', id)
  const payload = {
    id,
    siteId: mappingData.siteId,
    siteName: mappingData.siteName || '',
    workerId: mappingData.workerId,
    workerName: mappingData.workerName || '',
    allocatedDate: serverTimestamp(),
  }
  await setDoc(docRef, payload)

  // Also update worker record
  await updateWorker(orgId, mappingData.workerId, {
    assignedSiteId: mappingData.siteId,
    assignedSiteName: mappingData.siteName || '',
  })

  return payload
}

// ------------------------------------------------------------------------------------------------
// 4. WORKER ATTENDANCE MUSTER ROLL (/organisation/{orgId}/workerAttendance)
// ------------------------------------------------------------------------------------------------

export async function fetchWorkerAttendance(orgId) {
  return fetchWithFallback(orgId, 'workerAttendance')
}

export function subscribeWorkerAttendance(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'workerAttendance', onData, onError)
}

export async function recordWorkerAttendanceBatch(orgId, siteId, siteName, date, attendanceRecords, recorderActor) {
  if (!orgId || !siteId) throw new Error('orgId and siteId are required')

  const dateStr = date || new Date().toISOString().split('T')[0]
  const docId = `ATTN_${siteId}_${dateStr}`
  const docRef = doc(db, 'organisation', orgId, 'workerAttendance', docId)

  const totalWage = attendanceRecords.reduce((acc, r) => acc + (Number(r.computedWage) || 0), 0)
  const presentCount = attendanceRecords.filter((r) => r.status === 'P').length
  const halfDayCount = attendanceRecords.filter((r) => r.status === 'HD').length
  const absentCount = attendanceRecords.filter((r) => r.status === 'A').length

  const payload = {
    docId,
    siteId,
    siteName: siteName || '',
    date: dateStr,
    records: attendanceRecords, // [{ workerId, workerName, status: 'P'|'HD'|'A', otHours: 0, computedWage: 800 }]
    totalWage,
    presentCount,
    halfDayCount,
    absentCount,
    headcount: presentCount + halfDayCount,
    count: presentCount + halfDayCount,
    recordedBy: recorderActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(docRef, payload)
  return { id: docId, ...payload }
}

// Legacy wrapper
export async function recordWorkerAttendance(orgId, attendanceData) {
  return recordWorkerAttendanceBatch(
    orgId,
    attendanceData.projectId || attendanceData.siteId,
    attendanceData.projectName || attendanceData.siteName,
    attendanceData.date,
    attendanceData.workers || attendanceData.records || [],
    { name: attendanceData.supervisorName }
  )
}
