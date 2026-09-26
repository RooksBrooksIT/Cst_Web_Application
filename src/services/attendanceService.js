import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'

/**
 * Fetches attendance records and aggregates monthly worker attendance report data.
 * Complies 100% with Section 4 of eBricks_Workers_Attendance_and_Report_Flow.txt
 */
export async function fetchWorkersAttendanceReport(orgId, selectedMonth, selectedSiteId = 'all') {
  if (!orgId) {
    return {
      summary: {
        totalActiveWorkersMapped: 0,
        totalDaysLogged: 0,
        overallAttendanceRate: 0,
        totalMonthlyWageOutflow: 0,
        extraLabourTotalCount: 0,
      },
      daysInMonth: 30,
      records: [],
    }
  }

  const monthStr = selectedMonth || new Date().toISOString().slice(0, 7) // YYYY-MM
  const year = parseInt(monthStr.split('-')[0], 10)
  const monthNum = parseInt(monthStr.split('-')[1], 10)
  const daysInMonth = new Date(year, monthNum, 0).getDate()

  // 1. Query daily attendance documents from /organisation/{orgId}/data/workersAttendance
  const attendanceRef = collection(db, 'organisation', orgId, 'workersAttendance')
  const qAttendance = query(attendanceRef, where('month', '==', monthStr))
  let attendanceSnap = await getDocs(qAttendance)

  let attendanceDocs = []
  if (!attendanceSnap.empty) {
    attendanceDocs = attendanceSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } else {
    const allSnap = await getDocs(attendanceRef)
    attendanceDocs = allSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => {
        const dMonth = d.month || (d.date ? d.date.slice(0, 7) : '')
        return dMonth === monthStr || dMonth === `${String(monthNum).padStart(2, '0')}-${year}`
      })
  }

  // Filter by site if specific site is chosen
  if (selectedSiteId && selectedSiteId !== 'all') {
    attendanceDocs = attendanceDocs.filter((d) => d.siteId === selectedSiteId || d.site === selectedSiteId)
  }

  // 2. Fetch Master Worker Directory (/labours or /workersConfig)
  const workersRef = collection(db, 'organisation', orgId, 'labours')
  let workersSnap = await getDocs(workersRef)
  let masterWorkers = []
  if (!workersSnap.empty) {
    masterWorkers = workersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } else {
    const altRef = collection(db, 'organisation', orgId, 'workersConfig')
    const altSnap = await getDocs(altRef)
    masterWorkers = altSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }

  // 3. Fetch Worker-Site Mappings (/workerSiteMapping)
  const mappingRef = collection(db, 'organisation', orgId, 'workerSiteMapping')
  const mappingSnap = await getDocs(mappingRef)
  const workerSiteMap = {}
  mappingSnap.docs.forEach((d) => {
    const data = d.data()
    const sId = data.siteId || d.id
    if (Array.isArray(data.workers)) {
      data.workers.forEach((w) => {
        const wId = typeof w === 'string' ? w : w.workerId || w.id
        if (wId) workerSiteMap[wId] = { siteId: sId, siteName: data.siteName || sId }
      })
    }
  })

  // 4. Fetch Monthly Ledger Fallback (/WorkerMonthlyAttendance)
  const monthlyLedgerRef = collection(db, 'organisation', orgId, 'WorkerMonthlyAttendance')
  const qMonthly = query(monthlyLedgerRef, where('month', '==', monthStr))
  const monthlySnap = await getDocs(qMonthly)
  const monthlyLedgerMap = {}
  monthlySnap.docs.forEach((d) => {
    const data = d.data()
    if (data.workerId) monthlyLedgerMap[data.workerId] = data
  })

  // 5. Aggregate Data Per Worker
  const workerAggMap = {}

  // Seed master workers into aggregation map
  masterWorkers.forEach((w) => {
    const wId = w.id || w.workerId
    if (!wId) return
    const siteInfo = workerSiteMap[wId] || {}
    workerAggMap[wId] = {
      workerId: wId,
      workerName: w.name || w.workerName || w.fullName || 'Worker',
      designation: w.trade || w.designation || w.roleCategory || 'General Labour',
      siteId: siteInfo.siteId || w.siteId || 'Unassigned',
      siteName: siteInfo.siteName || w.siteName || 'Unassigned Site',
      dailySalaryRate: Number(w.dailyWageRate || w.salaryPerDay || w.dailyWage || w.rate || 800),
      presentCount: 0,
      halfDayCount: 0,
      overtimeCount: 0,
      absentCount: 0,
      otHoursTotal: 0,
      totalCalculatedSalary: 0,
      dayGrid: {}, // Day 1..31 status code: 'P', 'H', 'OT', 'A'
    }
  })

  let totalLoggedDaysInMonth = new Set()
  let extraLabourTotalCount = 0

  // Process daily attendance logs
  attendanceDocs.forEach((docData) => {
    const docDateStr = docData.date || docData.Day || docData.day
    if (docDateStr) totalLoggedDaysInMonth.add(docDateStr)

    const dayNumber = docDateStr ? parseInt(String(docDateStr).split('-')[2] || String(docDateStr).split('/')[0], 10) : null

    // Accumulate extra workers count
    if (Array.isArray(docData.extraWorkers)) {
      docData.extraWorkers.forEach((ew) => {
        extraLabourTotalCount += Number(ew.count || 0)
      })
    } else if (docData.totalExtraWorkers) {
      extraLabourTotalCount += Number(docData.totalExtraWorkers || 0)
    }

    // Process workers map / records array in attendance doc
    const workersObj = docData.workers || {}
    const recordsList = Array.isArray(docData.records)
      ? docData.records
      : Object.values(workersObj)

    recordsList.forEach((r) => {
      const wId = r.workerId || r.id
      if (!wId) return

      if (!workerAggMap[wId]) {
        workerAggMap[wId] = {
          workerId: wId,
          workerName: r.workerName || r.name || 'Worker',
          designation: r.designation || r.trade || 'Labour',
          siteId: docData.siteId || r.siteId || 'Site',
          siteName: docData.siteName || r.siteName || docData.site || 'Site',
          dailySalaryRate: Number(r.salaryPerDay || r.baseWage || r.dailySalaryRate || 800),
          presentCount: 0,
          halfDayCount: 0,
          overtimeCount: 0,
          absentCount: 0,
          otHoursTotal: 0,
          totalCalculatedSalary: 0,
          dayGrid: {},
        }
      }

      const worker = workerAggMap[wId]
      const statusRaw = String(r.attendance || r.status || '').toLowerCase().trim()
      const isPresent = statusRaw === 'present' || statusRaw === 'p'
      const isHalfDay = statusRaw === 'half day' || statusRaw === 'hd' || statusRaw === 'h'
      const isOvertime = statusRaw === 'overtime' || statusRaw === 'ot'
      const isAbsent = statusRaw === 'absent' || statusRaw === 'a'

      const rate = Number(r.salaryPerDay || r.baseWage || worker.dailySalaryRate || 800)
      const otHours = Number(r.otHours || 0)

      if (dayNumber && dayNumber >= 1 && dayNumber <= daysInMonth) {
        if (isOvertime) worker.dayGrid[dayNumber] = 'OT'
        else if (isPresent) worker.dayGrid[dayNumber] = 'P'
        else if (isHalfDay) worker.dayGrid[dayNumber] = 'H'
        else if (isAbsent) worker.dayGrid[dayNumber] = 'A'
      }

      if (isOvertime) {
        worker.overtimeCount += 1
        worker.otHoursTotal += otHours
        worker.totalCalculatedSalary += rate + (otHours * (rate / 8))
      } else if (isPresent) {
        worker.presentCount += 1
        worker.totalCalculatedSalary += rate
      } else if (isHalfDay) {
        worker.halfDayCount += 1
        worker.totalCalculatedSalary += rate * 0.5
      } else if (isAbsent) {
        worker.absentCount += 1
      }
    })
  })

  // Merge pre-aggregated fallback data from WorkerMonthlyAttendance if daily logs were missing
  Object.values(monthlyLedgerMap).forEach((ml) => {
    const wId = ml.workerId
    if (!wId) return

    if (!workerAggMap[wId]) {
      workerAggMap[wId] = {
        workerId: wId,
        workerName: ml.workerName || 'Worker',
        designation: ml.designation || 'Labour',
        siteId: ml.siteId || 'Site',
        siteName: ml.site || 'Site',
        dailySalaryRate: Number(ml.baseSalary || 800),
        presentCount: Number(ml.totalPresentDays || 0),
        halfDayCount: 0,
        overtimeCount: 0,
        absentCount: 0,
        otHoursTotal: 0,
        totalCalculatedSalary: Number(ml.calculatedSalary || 0),
        dayGrid: {},
      }
    } else if (workerAggMap[wId].presentCount === 0 && ml.totalPresentDays > 0) {
      workerAggMap[wId].presentCount = Number(ml.totalPresentDays || 0)
      workerAggMap[wId].totalCalculatedSalary = Number(ml.calculatedSalary || 0)
    }
  })

  const records = Object.values(workerAggMap)

  // Filter records by site if specific site selected
  const filteredRecords = selectedSiteId && selectedSiteId !== 'all'
    ? records.filter((r) => r.siteId === selectedSiteId || r.siteName === selectedSiteId)
    : records

  // Summary Metrics Computation
  const totalActiveWorkersMapped = filteredRecords.length
  const totalDaysLogged = totalLoggedDaysInMonth.size
  const totalPossibleDays = totalActiveWorkersMapped * (totalDaysLogged || 1)

  let totalPresentPoints = 0
  let totalMonthlyWageOutflow = 0

  filteredRecords.forEach((r) => {
    totalPresentPoints += r.presentCount * 1.0 + r.overtimeCount * 1.0 + r.halfDayCount * 0.5
    totalMonthlyWageOutflow += r.totalCalculatedSalary
  })

  const overallAttendanceRate = totalPossibleDays > 0
    ? Math.min(100, Math.round((totalPresentPoints / totalPossibleDays) * 100))
    : 0

  return {
    summary: {
      totalActiveWorkersMapped,
      totalDaysLogged,
      overallAttendanceRate,
      totalMonthlyWageOutflow,
      extraLabourTotalCount,
    },
    daysInMonth,
    records: filteredRecords,
  }
}
