import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Workforce, Labour & Attendance Service
 * Scoped under:
 *   /organisation/{orgId}/labours
 *   /organisation/{orgId}/workersConfig (with fallback/mirror workers)
 *   /organisation/{orgId}/workerSiteMapping (with mirror workerSiteMap)
 *   /organisation/{orgId}/siteSupervisorProjectStageSchedule
 *   /organisation/{orgId}/workersAttendance
 *   /organisation/{orgId}/WorkerMonthlyAttendance
 * Complies with MANAGER_WORKFORCE_MANAGEMENT_COMPLETE_FLOW.txt
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

// ================================================================================================
// 1. LABOUR TRADES & WAGE MASTER (/organisation/{orgId}/labours)
// ================================================================================================

/**
 * Computes next sequential Labour Trade ID (LT001, LT002...)
 */
export async function getNextLabourId(orgId) {
  if (!orgId) return 'LT001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'labours'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const lId = (data.labourId || d.id || '').toString()
      const match = lId.match(/^LT(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `LT${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error computing next labour ID:', err)
    return 'LT001'
  }
}

export async function fetchLabourTrades(orgId) {
  return fetchWithFallback(orgId, 'labours')
}

export const fetchLabourScales = fetchLabourTrades

export function subscribeLabourTrades(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'labours', onData, onError)
}

/**
 * Creates a new Labour Trade in master registry
 */
export async function createLabourTrade(orgId, tradeData) {
  if (!orgId) throw new Error('Organization ID is required')
  const designation = (tradeData.designation || tradeData.trade || '').trim()
  if (!designation) throw new Error('Trade Designation is required')

  const salaryVal = Number(tradeData.salary || tradeData.dailyWage) || 800
  if (salaryVal <= 0) throw new Error('Daily Wage must be greater than 0')

  // Case-insensitive duplicate check
  const existing = await fetchLabourTrades(orgId)
  const isDup = existing.some(
    (t) => (t.designation || t.trade || t.name || '').trim().toLowerCase() === designation.toLowerCase()
  )
  if (isDup) {
    throw new Error(`Trade designation "${designation}" already exists in Master Catalog.`)
  }

  const labourId = await getNextLabourId(orgId)
  const docRef = doc(db, 'organisation', orgId, 'labours', labourId)

  const payload = {
    id: labourId,
    labourId,
    designation,
    trade: designation,
    name: designation,
    salary: String(salaryVal),
    dailyWage: salaryVal,
    otHourlyRate: Number(tradeData.otHourlyRate) || Math.round(salaryVal / 6),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(docRef, payload)
  return payload
}

export const createLabourScale = createLabourTrade

export async function updateLabourTrade(orgId, labourId, updates) {
  if (!orgId || !labourId) throw new Error('orgId and labourId are required')
  const docRef = doc(db, 'organisation', orgId, 'labours', labourId)

  const payload = { ...updates, updatedAt: serverTimestamp() }
  if (updates.designation) {
    payload.trade = updates.designation
    payload.name = updates.designation
  }
  if (updates.salary !== undefined) {
    payload.dailyWage = Number(updates.salary)
    payload.salary = String(updates.salary)
  }

  await updateDoc(docRef, payload)
}

export async function deleteLabourTrade(orgId, labourId) {
  if (!orgId || !labourId) throw new Error('orgId and labourId are required')

  // Check if any active worker has this designation
  const workers = await fetchWithFallback(orgId, 'workersConfig')
  const tradeDoc = await getDoc(doc(db, 'organisation', orgId, 'labours', labourId))
  const designation = tradeDoc.exists() ? tradeDoc.data().designation : null

  if (designation) {
    const inUse = workers.some(
      (w) => (w.designation || w.trade || '').trim().toLowerCase() === designation.trim().toLowerCase()
    )
    if (inUse) {
      throw new Error(`Cannot delete "${designation}". It is currently assigned to registered workers.`)
    }
  }

  await deleteDoc(doc(db, 'organisation', orgId, 'labours', labourId))
}

export const deleteLabourScale = deleteLabourTrade

// ================================================================================================
// 2. WORKER MASTER REGISTRY (/organisation/{orgId}/workersConfig)
// ================================================================================================

/**
 * Computes next sequential Worker ID (WC001, WC002...)
 */
export async function getNextWorkerId(orgId) {
  if (!orgId) return 'WC001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'workersConfig'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const wId = (data.workerId || d.id || '').toString()
      const match = wId.match(/^WC(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `WC${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error computing next worker ID:', err)
    return 'WC001'
  }
}

export async function fetchWorkers(orgId) {
  return fetchWithFallback(orgId, 'workersConfig')
}

export function subscribeWorkers(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'workersConfig', onData, onError)
}

/**
 * Registers a new worker in workersConfig and legacy workers mirror
 */
export async function createWorker(orgId, workerData) {
  if (!orgId) throw new Error('Organization ID is required')
  const name = (workerData.name || workerData.workerName || '').trim()
  if (!name || name.length < 2) throw new Error('Worker full name must be at least 2 characters')

  const phone = (workerData.phoneNumber || workerData.phone || '').trim().replace(/\D/g, '')
  if (phone.length !== 10) {
    throw new Error('Contact Mobile Number must be exactly 10 digits')
  }

  const designation = (workerData.designation || workerData.trade || 'Worker').trim()
  const salaryVal = Number(workerData.salary || workerData.dailyWageRate) || 800
  const joiningDate = workerData.joiningDate || new Date().toISOString().split('T')[0]

  const nextId = await getNextWorkerId(orgId)
  const workerId = workerData.workerId || nextId

  const payload = {
    id: workerId,
    workerId,
    name,
    workerName: name,
    phoneNumber: phone,
    phone,
    designation,
    trade: designation,
    salary: String(salaryVal),
    dailyWageRate: salaryVal,
    overtimeHourlyRate: Number(workerData.overtimeHourlyRate) || Math.round(salaryVal / 6),
    joiningDate,
    address: workerData.address?.trim() || '',
    assignedSiteId: workerData.assignedSiteId || '',
    assignedSiteName: workerData.assignedSiteName || '',
    status: workerData.status || 'Active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const batch = writeBatch(db)
  const primaryRef = doc(db, 'organisation', orgId, 'workersConfig', workerId)
  const legacyRef = doc(db, 'organisation', orgId, 'workers', workerId)

  batch.set(primaryRef, payload)
  batch.set(legacyRef, payload)
  await batch.commit()

  return payload
}

export async function updateWorker(orgId, workerId, updates) {
  if (!orgId || !workerId) throw new Error('orgId and workerId are required')

  if (updates.phoneNumber || updates.phone) {
    const rawPhone = (updates.phoneNumber || updates.phone).trim().replace(/\D/g, '')
    if (rawPhone.length !== 10) {
      throw new Error('Contact Mobile Number must be exactly 10 digits')
    }
    updates.phoneNumber = rawPhone
    updates.phone = rawPhone
  }

  const payload = { ...updates, updatedAt: serverTimestamp() }
  if (updates.name) payload.workerName = updates.name
  if (updates.designation) payload.trade = updates.designation
  if (updates.salary !== undefined) {
    payload.dailyWageRate = Number(updates.salary)
    payload.salary = String(updates.salary)
  }

  const batch = writeBatch(db)
  const primaryRef = doc(db, 'organisation', orgId, 'workersConfig', workerId)
  const legacyRef = doc(db, 'organisation', orgId, 'workers', workerId)

  batch.update(primaryRef, payload)
  batch.set(legacyRef, payload, { merge: true })
  await batch.commit()
}

export async function deleteWorker(orgId, workerId) {
  if (!orgId || !workerId) throw new Error('orgId and workerId are required')

  const batch = writeBatch(db)
  const primaryRef = doc(db, 'organisation', orgId, 'workersConfig', workerId)
  const legacyRef = doc(db, 'organisation', orgId, 'workers', workerId)

  batch.delete(primaryRef)
  batch.delete(legacyRef)
  await batch.commit()
}

// ================================================================================================
// 3. WORKER-SITE MAPPING & CROSS-SITE TRANSFERS (/organisation/{orgId}/workerSiteMapping)
// ================================================================================================

export function subscribeSiteWorkerMapping(orgId, siteId, onData, onError) {
  if (!orgId || !siteId) return () => {}
  const docRef = doc(db, 'organisation', orgId, 'workerSiteMapping', siteId)
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() })
      } else {
        onData(null)
      }
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

export async function fetchSiteWorkerMapping(orgId, siteId) {
  if (!orgId || !siteId) return null
  const docRef = doc(db, 'organisation', orgId, 'workerSiteMapping', siteId)
  const snap = await getDoc(docRef)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export function subscribeAllSiteMappings(orgId, onData, onError) {
  if (!orgId) return () => {}
  const colRef = collection(db, 'organisation', orgId, 'workerSiteMapping')
  return onSnapshot(
    colRef,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

export async function fetchWorkerSiteMappings(orgId) {
  return fetchWithFallback(orgId, 'workerSiteMapping')
}

/**
 * Saves site worker allocation with automatic atomic cross-site transfer cleanup
 */
export async function saveSiteWorkerMapping(orgId, siteId, siteName, supervisor, workersList) {
  if (!orgId || !siteId) throw new Error('orgId and siteId are required')

  const batch = writeBatch(db)
  const cleanSiteId = siteId.trim()
  const cleanSiteName = siteName.trim()
  const combinedKey = `${cleanSiteId}_${cleanSiteName}`

  const docData = {
    site: cleanSiteId,
    siteId: cleanSiteId,
    siteName: cleanSiteName,
    projectName: cleanSiteName,
    supervisor: supervisor || 'Unassigned',
    totalWorkersMapped: workersList.length,
    workers: workersList,
    updatedAt: serverTimestamp(),
  }

  // 1. Commit mapping to canonical keys across workerSiteMapping and mirror workerSiteMap
  const targetKeys = [cleanSiteId, cleanSiteName, combinedKey]
  for (const key of targetKeys) {
    const ref1 = doc(db, 'organisation', orgId, 'workerSiteMapping', key)
    const ref2 = doc(db, 'organisation', orgId, 'workerSiteMap', key)
    batch.set(ref1, docData, { merge: true })
    batch.set(ref2, docData, { merge: true })
  }

  // 2. Clean up transferred workers from all other sites atomically
  const addedIds = new Set(workersList.map((w) => (w.workerId || w.id || '').toLowerCase()).filter(Boolean))
  const otherDocsSnap = await getDocs(collection(db, 'organisation', orgId, 'workerSiteMapping'))

  for (const otherDoc of otherDocsSnap.docs) {
    if (targetKeys.includes(otherDoc.id.trim())) continue
    const data = otherDoc.data()
    const rawWorkers = data.workers || []
    let modified = false

    const filtered = rawWorkers.filter((w) => {
      const id = (w.workerId || w.id || '').toString().toLowerCase()
      if (id && addedIds.has(id)) {
        modified = true
        return false // Remove transferred worker
      }
      return true
    })

    if (modified) {
      batch.update(otherDoc.ref, {
        workers: filtered,
        totalWorkersMapped: filtered.length,
        updatedAt: serverTimestamp(),
      })
    }
  }

  // 3. Update assignedSiteId on individual worker records
  for (const w of workersList) {
    const wId = w.workerId || w.id
    if (wId) {
      const wRef = doc(db, 'organisation', orgId, 'workersConfig', wId)
      batch.update(wRef, {
        assignedSiteId: cleanSiteId,
        assignedSiteName: cleanSiteName,
        updatedAt: serverTimestamp(),
      })
    }
  }

  await batch.commit()
}

// Legacy single-worker map helper
export async function mapWorkerToSite(orgId, mappingData) {
  if (!orgId || !mappingData.workerId || !mappingData.siteId) {
    throw new Error('workerId and siteId required')
  }

  const siteId = mappingData.siteId
  const siteName = mappingData.siteName || ''

  // Fetch current roster
  const existingMapping = await fetchSiteWorkerMapping(orgId, siteId)
  const currentWorkers = existingMapping?.workers || []

  // Check if already in roster
  const alreadyIn = currentWorkers.some((w) => (w.workerId || w.id) === mappingData.workerId)
  if (!alreadyIn) {
    currentWorkers.push({
      workerId: mappingData.workerId,
      workerName: mappingData.workerName || '',
      workerDesignation: mappingData.workerDesignation || mappingData.trade || 'Worker',
      workerSalary: String(mappingData.workerSalary || 800),
      workerPhone: mappingData.workerPhone || '',
      siteId,
      siteName,
      assignmentStatus: 'Active',
      mappingDate: new Date().toLocaleDateString('en-GB'),
    })
  }

  return saveSiteWorkerMapping(orgId, siteId, siteName, mappingData.supervisor || 'Site Supervisor', currentWorkers)
}

// ================================================================================================
// 4. WORKFORCE REQUISITIONS & MULTI-TIER APPROVALS (/organisation/{orgId}/siteSupervisorProjectStageSchedule)
// ================================================================================================

export function subscribeWorkforceRequisitions(orgId, onData, onError) {
  if (!orgId) return () => {}
  const colRef = collection(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule')
  return onSnapshot(
    colRef,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

export async function fetchWorkforceRequisitions(orgId) {
  return fetchWithFallback(orgId, 'siteSupervisorProjectStageSchedule')
}

export function createAuditEntry(step, action, actorRole, actorName, actorId, remarks) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return {
    step,
    action,
    actorRole,
    actorName,
    actorId: actorId || '',
    remarks: remarks || '',
    timestamp: Timestamp.fromDate(now),
    dateStr,
  }
}

/**
 * Stage 1: Manager reviews and forwards to Organization HQ
 */
export async function managerVerifyAndForward(orgId, docId, managerName, managerId, remarks) {
  const audit = createAuditEntry(
    '2. Manager Initial Review',
    'Verified & Forwarded to Organization',
    'Manager',
    managerName,
    managerId,
    remarks || 'Verified and forwarded for HQ authorization.'
  )

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', docId)
  await updateDoc(docRef, {
    status: 'pending_org_approval',
    statusDisplay: 'Pending Organization Approval',
    currentStep: 2,
    managerName,
    managerId,
    managerReviewRemarks: remarks || '',
    approvalHistory: arrayUnion(audit),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Stage 1 Rejection: Manager rejects request
 */
export async function managerReject(orgId, docId, managerName, reason) {
  const audit = createAuditEntry(
    '2. Manager Initial Review',
    'Rejected by Manager',
    'Manager',
    managerName,
    '',
    reason || 'Declined by Manager.'
  )

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', docId)
  await updateDoc(docRef, {
    status: 'rejected_by_manager',
    statusDisplay: 'Rejected by Manager',
    currentStep: -1,
    rejectionReason: reason || 'Declined by Manager.',
    rejectedBy: managerName,
    rejectedRole: 'Manager',
    approvalHistory: arrayUnion(audit),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Stage 2: Organization HQ authorizes and sends back to Manager for clearance
 */
export async function orgAuthorize(orgId, docId, orgUserName, orgUserId, remarks) {
  const audit = createAuditEntry(
    '3. Organization Authorization',
    'Approved by Organization',
    'Organization',
    orgUserName,
    orgUserId,
    remarks || 'Organization authorization granted. Returned to Manager.'
  )

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', docId)
  await updateDoc(docRef, {
    status: 'pending_manager_clearance',
    statusDisplay: 'Pending Manager Clearance',
    currentStep: 3,
    orgApprovedBy: orgUserName,
    orgApprovalRemarks: remarks || '',
    approvalHistory: arrayUnion(audit),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Stage 2 Rejection: Organization HQ rejects request
 */
export async function orgReject(orgId, docId, orgUserName, reason) {
  const audit = createAuditEntry(
    '3. Organization Authorization',
    'Rejected by Organization',
    'Organization',
    orgUserName,
    '',
    reason || 'Declined by Organization HQ.'
  )

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', docId)
  await updateDoc(docRef, {
    status: 'rejected_by_org',
    statusDisplay: 'Rejected by Organization',
    currentStep: -1,
    rejectionReason: reason || 'Declined by Organization HQ.',
    rejectedBy: orgUserName,
    rejectedRole: 'Organization',
    approvalHistory: arrayUnion(audit),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Stage 3: Manager final clearance & dispatch release
 */
export async function managerFinalClearance(orgId, docId, managerName, managerId, remarks) {
  const audit = createAuditEntry(
    '4. Manager Final Clearance',
    'Final Approval & Release Completed',
    'Manager',
    managerName,
    managerId,
    remarks || 'Final clearance granted. Dispatched to site.'
  )

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', docId)
  await updateDoc(docRef, {
    status: 'approved',
    statusDisplay: 'Approved & Released',
    currentStep: 4,
    finalApprovedBy: managerName,
    finalClearanceRemarks: remarks || '',
    approvalHistory: arrayUnion(audit),
    updatedAt: serverTimestamp(),
  })
}

// ================================================================================================
// 5. DAILY ATTENDANCE & PAYROLL CALCULATION ENGINE
// ================================================================================================

export async function fetchWorkerAttendance(orgId) {
  return fetchWithFallback(orgId, 'workersAttendance')
}

export function subscribeWorkerAttendance(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'workersAttendance', onData, onError)
}

/**
 * Submits daily site muster roll and atomically updates WorkerMonthlyAttendance
 */
export async function submitDailyAttendance(
  orgId,
  siteId,
  siteName,
  supervisorName,
  supervisorId,
  attendanceDate,
  workersAttendanceList,
  extraWorkers = []
) {
  if (!orgId || !siteId) throw new Error('orgId and siteId are required')

  const batch = writeBatch(db)
  const now = new Date()
  const dateObj = attendanceDate ? new Date(attendanceDate) : now
  const todayDate = dateObj.toISOString().split('T')[0] // yyyy-MM-dd
  const currentMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}` // yyyy-MM
  const currentDay = String(dateObj.getDate()).padStart(2, '0')
  const formattedDate = `${currentDay}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`

  let mappedPresentCount = 0
  let totalComputedPayroll = 0

  // 1. Update individual monthly attendance records
  for (const record of workersAttendanceList) {
    const statusLower = (record.status || record.attendance || 'P').toLowerCase()
    const isPresent = statusLower === 'p' || statusLower === 'present' || statusLower === 'overtime'
    const isHalfDay = statusLower === 'hd' || statusLower === 'half day'

    if (isPresent || isHalfDay) {
      mappedPresentCount += 1
    }

    const wage = Number(record.computedWage || record.salary || record.baseWage) || 800
    totalComputedPayroll += wage

    const workerId = record.workerId || record.id
    if (workerId) {
      const monthlyDocId = `${workerId}_${currentMonth}`
      const monthlyDocRef = doc(db, 'organisation', orgId, 'WorkerMonthlyAttendance', monthlyDocId)

      const dailyEntry = {
        status: isPresent ? 'present' : isHalfDay ? 'half day' : 'absent',
        otHours: Number(record.otHours || 0),
        salaryPerDay: wage,
        markedAt: serverTimestamp(),
      }

      batch.set(
        monthlyDocRef,
        {
          workerId,
          workerName: record.workerName || record.name || 'Worker',
          designation: record.trade || record.designation || 'Worker',
          site: siteName,
          siteId: siteId,
          month: currentMonth,
          baseSalary: record.baseWage || record.salary || '800',
          status: 'verified',
          [`attendanceData.${todayDate}`]: dailyEntry,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    }
  }

  // 2. Prepare comprehensive site daily attendance document
  const cleanSiteId = siteId.trim().replace(/\s+/g, '_')
  const cleanSiteName = siteName.trim().replace(/\s+/g, '_')
  const cleanSupName = (supervisorName || 'Supervisor').trim().replace(/\s+/g, '_')
  const attendanceDocId = `${cleanSiteId}_${cleanSiteName}_${cleanSupName}_${todayDate}`

  const attendanceDocRef = doc(db, 'organisation', orgId, 'workersAttendance', attendanceDocId)

  // Map of worker individual logs keyed by workerId
  const workersMap = {}
  workersAttendanceList.forEach((r) => {
    const wId = r.workerId || r.id
    workersMap[wId] = {
      workerId: wId,
      workerName: r.workerName || r.name,
      designation: r.trade || r.designation,
      baseWage: r.baseWage || r.salary,
      attendance: r.status === 'P' ? 'Present' : r.status === 'HD' ? 'Half Day' : 'Absent',
      otHours: Number(r.otHours || 0),
      computedWage: r.computedWage,
      siteId,
      siteName,
    }
  })

  batch.set(
    attendanceDocRef,
    {
      docId: attendanceDocId,
      day: currentDay,
      month: `${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`,
      site: siteName,
      siteId,
      siteName,
      date: todayDate,
      Day: formattedDate,
      supervisor: supervisorName || 'Supervisor',
      supervisorId: supervisorId || '',
      workers: workersMap,
      records: workersAttendanceList,
      extraWorkers,
      totalMappedWorkers: workersAttendanceList.length,
      totalMappedPresent: mappedPresentCount,
      totalExtraWorkers: extraWorkers.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0),
      totalWorkersOnSite: mappedPresentCount + extraWorkers.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0),
      totalWage: totalComputedPayroll,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  await batch.commit()

  // 3. Recalculate monthly salaries
  await recalculateMonthlySalaries(orgId, siteId, currentMonth)
}

export const recordWorkerAttendanceBatch = async (orgId, siteId, siteName, date, attendanceRecords, recorderActor) => {
  return submitDailyAttendance(
    orgId,
    siteId,
    siteName,
    recorderActor?.name || 'Operations Manager',
    recorderActor?.id || 'mgr_lead',
    date,
    attendanceRecords,
    []
  )
}

/**
 * Recalculates monthly salary totals in WorkerMonthlyAttendance
 */
export async function recalculateMonthlySalaries(orgId, siteId, month) {
  try {
    const q = query(
      collection(db, 'organisation', orgId, 'WorkerMonthlyAttendance'),
      where('month', '==', month),
      where('siteId', '==', siteId)
    )

    const snap = await getDocs(q)
    if (snap.empty) return

    const batch = writeBatch(db)
    for (const d of snap.docs) {
      const data = d.data()
      const attendanceMap = data.attendanceData || {}
      let totalSalary = 0.0
      let presentDays = 0

      Object.values(attendanceMap).forEach((details) => {
        if (!details) return
        const status = (details.status || '').toLowerCase()
        const salaryPerDay = parseFloat(details.salaryPerDay) || 0.0

        if (status === 'present' || status === 'overtime') {
          totalSalary += salaryPerDay
          presentDays += 1
        } else if (status === 'half day') {
          totalSalary += salaryPerDay / 2.0
          presentDays += 1
        }
      })

      batch.update(d.ref, {
        calculatedSalary: totalSalary,
        totalPresentDays: presentDays,
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  } catch (e) {
    console.error('Error recalculating monthly salaries:', e)
  }
}
