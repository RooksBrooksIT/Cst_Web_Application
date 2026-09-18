import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Workforce & Daily Muster Roll Service
 * Complies with Section 3.10 of Architecture Specification
 */

export const WORKER_SKILLS = [
  { id: 'Skilled', label: 'Skilled (Mason, Plumber, Electrician, Barbender)' },
  { id: 'Semi-Skilled', label: 'Semi-Skilled (Assistant Mason, Carpenter Helper)' },
  { id: 'Unskilled', label: 'Unskilled (General Helper, Earthwork Laborer)' },
]

export async function fetchWorkers(orgId) {
  return fetchWithFallback(orgId, 'workers')
}

export function subscribeWorkers(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'workers', onData, onError)
}

export async function createWorker(orgId, workerData) {
  const payload = {
    name: workerData.name || workerData.workerName || '',
    skillType: workerData.skillType || 'Skilled',
    trade: workerData.trade || 'Masonry',
    phone: workerData.phone || '',
    dailyWageRate: Number(workerData.dailyWageRate || workerData.wageRate) || 750,
    overtimeHourlyRate: Number(workerData.overtimeHourlyRate) || 120,
    assignedProjectId: workerData.assignedProjectId || workerData.siteId || '',
    assignedProjectName: workerData.assignedProjectName || workerData.siteName || '',
    status: 'active',
  }
  const docId = await saveStandardDoc(orgId, 'workers', payload)
  return { id: docId, ...payload }
}

export async function updateWorker(orgId, workerId, updates) {
  await updateStandardDoc(orgId, 'workers', workerId, updates)
}

export async function deleteWorker(orgId, workerId) {
  return deleteStandardDoc(orgId, 'workers', workerId)
}

// ------------------------------------------------------------------------------------------------
// Daily Muster Roll Attendance Logs (/organisation/{orgId}/worker_attendance)
// ------------------------------------------------------------------------------------------------

export async function fetchWorkerAttendance(orgId) {
  return fetchWithFallback(orgId, 'worker_attendance')
}

export function subscribeWorkerAttendance(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'worker_attendance', onData, onError)
}

export async function recordWorkerAttendance(orgId, attendanceData) {
  const headcount = Number(attendanceData.headcount || attendanceData.count) || 1
  const dailyRate = Number(attendanceData.dailyWageRate || attendanceData.rate) || 800
  const otHours = Number(attendanceData.otHours || attendanceData.overtimeHours) || 0
  const hourlyOtRate = dailyRate / 8 * 1.5
  const totalWage = headcount * (dailyRate + (otHours * hourlyOtRate))

  const payload = {
    projectId: attendanceData.projectId || attendanceData.siteId || '',
    projectName: attendanceData.projectName || attendanceData.siteName || 'Site',
    date: attendanceData.date || new Date().toISOString().split('T')[0],
    roleCategory: attendanceData.roleCategory || attendanceData.trade || 'Masons',
    skillType: attendanceData.skillType || 'Skilled',
    headcount,
    shift: attendanceData.shift || 'morning',
    shiftHours: Number(attendanceData.shiftHours) || 8,
    otHours,
    dailyWageRate: dailyRate,
    totalWage,
    supervisorRecordedUid: attendanceData.supervisorRecordedUid || '',
    supervisorName: attendanceData.supervisorName || 'Supervisor',
  }

  const docId = await saveStandardDoc(orgId, 'worker_attendance', payload)
  return { id: docId, ...payload }
}
