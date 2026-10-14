import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  calculateLabourActualTotal,
  calculateSavings,
  calculateIncentive,
  isStageRequestAvailable,
  updateTotalSiteExpense,
} from './expenseService.js'

/**
 * CST Site Supervisor Incentive Service
 * Complies with specification in incentive_flow.txt
 * Handles data fetching, calculation, validation guards, and database writes.
 */

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  const cleaned = String(val).replace(/[^0-9.-]+/g, '').trim()
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

/**
 * Normalizes labour items from various formats into standard:
 * { labourType: string, count: number }
 */
export function normalizeLabourItems(list) {
  if (!list) return []
  if (Array.isArray(list)) {
    return list.map((item) => {
      if (!item) return { labourType: 'Unspecified', count: 0 }
      if (typeof item === 'string') {
        return { labourType: item, count: 1 }
      }
      const labourType =
        item.labourType ||
        item.labourName ||
        item.designation ||
        item.role ||
        item.trade ||
        item.name ||
        item.title ||
        item.category ||
        'Unspecified'

      const count = parseNum(
        item.count ??
        item.qty ??
        item.quantity ??
        item.laboursCount ??
        item.workersCount ??
        item.value ??
        item.numberOfLabours ??
        item.headcount ??
        0
      )

      return { labourType: String(labourType).trim(), count }
    })
  }

  // If passed an object map { "Mason": 4, "Helper": 6 }
  if (typeof list === 'object') {
    return Object.entries(list).map(([key, val]) => ({
      labourType: String(key).trim(),
      count: parseNum(typeof val === 'object' ? (val.count || val.qty || 0) : val),
    }))
  }

  return []
}

/**
 * Merges requested, approved, and actual labour arrays into a single comparison grid.
 * Matches Labour Breakdown Table in incentive_flow.txt Section 3.3
 */
export function buildLabourComparisonGrid({ reqLabours = [], appLabours = [], actLabours = [] }) {
  const normReq = normalizeLabourItems(reqLabours)
  const normApp = normalizeLabourItems(appLabours)
  const normAct = normalizeLabourItems(actLabours)

  const map = new Map()

  normReq.forEach(({ labourType, count }) => {
    if (!map.has(labourType)) {
      map.set(labourType, { labourType, reqCount: 0, appCount: 0, actCount: 0 })
    }
    map.get(labourType).reqCount += count
  })

  normApp.forEach(({ labourType, count }) => {
    if (!map.has(labourType)) {
      map.set(labourType, { labourType, reqCount: 0, appCount: 0, actCount: 0 })
    }
    map.get(labourType).appCount += count
  })

  normAct.forEach(({ labourType, count }) => {
    if (!map.has(labourType)) {
      map.set(labourType, { labourType, reqCount: 0, appCount: 0, actCount: 0 })
    }
    map.get(labourType).actCount += count
  })

  return Array.from(map.values())
}

// ================================================================================================
// SCREEN 1 DATA SOURCE: Fetch Distinct Sites, Supervisors & Stages
// Matches incentive_flow.txt Section 3.2 initState -> _fetchSiteSupervisorData()
// ================================================================================================

export async function fetchIncentiveSiteSupervisorData(orgId) {
  if (!orgId) return { siteIds: [], siteSupervisors: {}, siteProjectStages: {}, siteMeta: {} }

  const siteIdsSet = new Set()
  const siteSupervisors = {} // siteId -> supervisorName
  const siteProjectStages = {} // siteId -> Array of stages
  const siteMeta = {} // siteId -> { siteName, projectName, etc. }

  try {
    // 1. Fetch siteSupervisorEntries as specified in mobile initState()
    const entriesCol = collection(db, 'organisation', orgId, 'siteSupervisorEntries')
    const entriesSnap = await getDocs(entriesCol)

    entriesSnap.forEach((d) => {
      const data = d.data()
      const sId = String(data.siteId || data.siteCode || '').trim()
      if (!sId) return

      siteIdsSet.add(sId)

      // Supervisor name resolution
      const supName = String(
        data.supervisorName ||
        data.supervisor ||
        data.fullName ||
        data.name ||
        ''
      ).trim()

      if (supName && !siteSupervisors[sId]) {
        siteSupervisors[sId] = supName
      }

      // Project stage resolution
      const stage = String(data.projectStage || data.stage || data.currentStage || '').trim()
      if (stage) {
        if (!siteProjectStages[sId]) {
          siteProjectStages[sId] = new Set()
        }
        siteProjectStages[sId].add(stage)
      }

      if (!siteMeta[sId]) {
        siteMeta[sId] = {
          siteId: sId,
          siteName: data.siteName || data.projectName || sId,
          projectName: data.projectName || data.siteName || sId,
        }
      }
    })

    // 2. Supplement from projects collection to ensure complete site and supervisor coverage
    try {
      const projCol = collection(db, 'organisation', orgId, 'projects')
      const projSnap = await getDocs(projCol)

      projSnap.forEach((d) => {
        const data = d.data()
        const sId = String(data.siteId || data.siteCode || d.id).trim()
        if (!sId) return

        siteIdsSet.add(sId)

        const supName = String(
          data.supervisorName ||
          data.assignedSupervisor ||
          data.supervisor ||
          ''
        ).trim()

        if (supName && !siteSupervisors[sId]) {
          siteSupervisors[sId] = supName
        }

        const stage = String(data.projectStage || data.currentStage || data.stage || '').trim()
        if (stage) {
          if (!siteProjectStages[sId]) {
            siteProjectStages[sId] = new Set()
          }
          siteProjectStages[sId].add(stage)
        }

        if (!siteMeta[sId]) {
          siteMeta[sId] = {
            siteId: sId,
            siteName: data.siteName || data.projectName || data.name || sId,
            projectName: data.projectName || data.siteName || data.name || sId,
          }
        }
      })
    } catch (projErr) {
      console.warn('[fetchIncentiveSiteSupervisorData] Supplemental project fetch error:', projErr)
    }

    // 3. Supplement stages from siteSupervisorProjectStageSchedule
    try {
      const schedCol = collection(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule')
      const schedSnap = await getDocs(schedCol)

      schedSnap.forEach((d) => {
        const data = d.data()
        const sId = String(data.siteId || data.siteCode || '').trim()
        const stage = String(data.projectStage || data.stage || '').trim()
        if (sId && stage) {
          siteIdsSet.add(sId)
          if (!siteProjectStages[sId]) {
            siteProjectStages[sId] = new Set()
          }
          siteProjectStages[sId].add(stage)

          const supName = String(data.supervisorName || data.supervisor || '').trim()
          if (supName && !siteSupervisors[sId]) {
            siteSupervisors[sId] = supName
          }
        }
      })
    } catch (schedErr) {
      console.warn('[fetchIncentiveSiteSupervisorData] Supplemental schedule fetch error:', schedErr)
    }

  } catch (err) {
    console.error('[fetchIncentiveSiteSupervisorData] Error:', err)
  }

  // Convert Set of stages to sorted Arrays
  const formattedStages = {}
  Object.keys(siteProjectStages).forEach((sId) => {
    formattedStages[sId] = Array.from(siteProjectStages[sId]).sort()
  })

  // Fill default stages for sites without explicit recorded stages
  const defaultStages = [
    'Substructure & Foundation',
    'Superstructure & RCC Slabs',
    'Brickwork & Masonry',
    'Plastering & Surface Finishing',
    'Flooring & Tiling Work',
    'Plumbing & Sanitation Works',
    'Electrical & Internal Wiring',
    'Doors, Windows & Carpentry',
    'Internal & External Painting',
    'Final Handover & Snagging',
  ]

  const siteIds = Array.from(siteIdsSet).sort()
  siteIds.forEach((sId) => {
    if (!formattedStages[sId] || formattedStages[sId].length === 0) {
      formattedStages[sId] = [...defaultStages]
    }
    if (!siteSupervisors[sId]) {
      siteSupervisors[sId] = 'Assigned Supervisor'
    }
  })

  return {
    siteIds,
    siteSupervisors,
    siteProjectStages: formattedStages,
    siteMeta,
  }
}

// ================================================================================================
// SCREEN 2 DATA SOURCE: Fetch Stage Schedule & Stage Actual
// Matches incentive_flow.txt Section 3.3 Item 1 & 2
// ================================================================================================

export async function fetchStageScheduleAndActual(orgId, siteId, projectStage) {
  if (!orgId || !siteId || !projectStage) {
    return {
      scheduleDoc: null,
      actualDoc: null,
      isAvailable: false,
      comparisonGrid: [],
      requestedTotal: 0,
      approvedTotal: 0,
      actualTotal: 0,
      savedAmount: 0,
      reqDays: 0,
      appDays: 0,
      actDays: 0,
      actPayment: 0,
    }
  }

  let scheduleDoc = null
  let actualDoc = null

  try {
    // Query 1: siteSupervisorProjectStageSchedule
    // where('siteId', isEqualTo: siteId), where('projectStage', isEqualTo: projectStage), limit(1)
    const schedCol = collection(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule')
    const schedQuery = query(
      schedCol,
      where('siteId', '==', siteId),
      where('projectStage', '==', projectStage),
      limit(1)
    )
    const schedSnap = await getDocs(schedQuery)

    if (!schedSnap.empty) {
      scheduleDoc = { id: schedSnap.docs[0].id, ...schedSnap.docs[0].data() }
    } else {
      // Fallback: search all stages for this site if case/whitespace mismatch
      const allSchedForSite = query(schedCol, where('siteId', '==', siteId))
      const allSnap = await getDocs(allSchedForSite)
      const cleanTargetStage = projectStage.trim().toLowerCase()
      allSnap.forEach((d) => {
        const data = d.data()
        const stg = String(data.projectStage || '').trim().toLowerCase()
        if (stg === cleanTargetStage && !scheduleDoc) {
          scheduleDoc = { id: d.id, ...data }
        }
      })
    }

    // Query 2: siteSupervisorProjectStageActual
    // where('siteId', isEqualTo: siteId), where('projectStage', isEqualTo: projectStage), limit(1)
    const actualCol = collection(db, 'organisation', orgId, 'siteSupervisorProjectStageActual')
    const actualQuery = query(
      actualCol,
      where('siteId', '==', siteId),
      where('projectStage', '==', projectStage),
      limit(1)
    )
    const actualSnap = await getDocs(actualQuery)

    if (!actualSnap.empty) {
      actualDoc = { id: actualSnap.docs[0].id, ...actualSnap.docs[0].data() }
    } else {
      // Fallback: check by composite docId convention if present
      // e.g. cleanCode_cleanSup_cleanStage
      const allActualForSite = query(actualCol, where('siteId', '==', siteId))
      const allActSnap = await getDocs(allActualForSite)
      const cleanTargetStage = projectStage.trim().toLowerCase()
      allActSnap.forEach((d) => {
        const data = d.data()
        const stg = String(data.projectStage || '').trim().toLowerCase()
        if (stg === cleanTargetStage && !actualDoc) {
          actualDoc = { id: d.id, ...data }
        }
      })
    }
  } catch (err) {
    console.error('[fetchStageScheduleAndActual] Query error:', err)
  }

  // Extract Schedule Fields
  const reqDays = parseNum(scheduleDoc?.reqDays ?? scheduleDoc?.requestedDays)
  const appDays = parseNum(scheduleDoc?.appDays ?? scheduleDoc?.approvedDays)
  const requestedTotal = parseNum(
    scheduleDoc?.estimatedPayment ??
    scheduleDoc?.estimatedAmount ??
    scheduleDoc?.requestedAmount ??
    scheduleDoc?.reqPayment
  )
  const approvedTotal = parseNum(
    scheduleDoc?.approvedPayment ??
    scheduleDoc?.approvedAmount ??
    scheduleDoc?.appPayment
  )
  const reqLabours = scheduleDoc?.reqLabours || scheduleDoc?.requestedLabours || []
  const appLabours = scheduleDoc?.appLabours || scheduleDoc?.approvedLabours || []

  // Extract Actual Fields
  const actDays = parseNum(actualDoc?.actDays ?? actualDoc?.actualDays)
  const actPayment = parseNum(actualDoc?.actPayment ?? actualDoc?.actualPayment ?? actualDoc?.dailyRate)
  const actLabours = actualDoc?.actLabours || actualDoc?.actualLabours || []

  // Guard check from Section 3.3 Item 3 & Section 6 Edge Case 2:
  // If requestedDays == 0 || approvedDays == 0 || actualDays == 0,
  // the sheet presents: "Request is not available for this site."
  const isAvailable = isStageRequestAvailable({ reqDays, appDays, actDays })

  // Calculations
  const actualTotal = calculateLabourActualTotal(actDays, actPayment)
  const savedAmount = calculateSavings(approvedTotal, actualTotal)

  // Labour Breakdown Grid
  const comparisonGrid = buildLabourComparisonGrid({ reqLabours, appLabours, actLabours })

  return {
    scheduleDoc,
    actualDoc,
    isAvailable,
    comparisonGrid,
    requestedTotal,
    approvedTotal,
    actualTotal,
    savedAmount,
    reqDays,
    appDays,
    actDays,
    actPayment,
  }
}

// ================================================================================================
// SAVE FLOW: Multi-Document Write Operations & Recalculation
// Matches incentive_flow.txt Section 4.2 Write 1, 2, 3
// ================================================================================================

export async function saveSupervisorIncentive(orgId, {
  siteId,
  projectName,
  projectStage,
  supervisor,
  actualTotal,
  approvedTotal,
  requestedTotal,
  savedAmount,
  incentivePercentage,
  amountToAdd,
}) {
  if (!orgId) throw new Error('orgId is required')
  if (!siteId) throw new Error('siteId is required')
  if (!supervisor) throw new Error('supervisor is required')
  if (!projectStage) throw new Error('projectStage is required')

  const parsedIncentive = parseNum(amountToAdd)
  // Section 3.3 Item 4 Pre-save Validation:
  // Checks if amountToAdd <= 0 -> halts execution.
  if (parsedIncentive <= 0) {
    throw new Error('Incentive amount must be greater than 0')
  }

  // Natural Composite Primary Key Document ID: '${siteId}_${supervisor}_${projectStage}'
  // Section 4.1 Item 3 & Section 6 Edge Case 3
  const cleanSiteId = siteId.trim()
  const cleanSupervisor = supervisor.trim()
  const cleanStage = projectStage.trim()
  const docId = `${cleanSiteId}_${cleanSupervisor}_${cleanStage}`

  // Write 1: Save Detailed Audit Record to 'siteSupervisorIncentives'
  // Section 4.2 Write 1
  const auditDocRef = doc(db, 'organisation', orgId, 'siteSupervisorIncentives', docId)
  const auditPayload = {
    siteId: cleanSiteId,
    projectName: projectName || cleanSiteId,
    projectStage: cleanStage,
    supervisorName: cleanSupervisor,
    actualAmount: Number(actualTotal) || 0,
    approvedAmount: Number(approvedTotal) || 0,
    estimatedAmount: Number(requestedTotal) || 0,
    savedAmount: Number(savedAmount) || 0,
    incentivePercentage: Math.round(Number(incentivePercentage) || 0),
    incentiveAmount: parsedIncentive,
    updatedAt: serverTimestamp(),
  }
  await setDoc(auditDocRef, auditPayload, { merge: true })

  // Write 2: Update Site Expense Document in 'totalSiteExpensesPerDay'
  // Section 4.2 Write 2
  const expenseDocRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', cleanSiteId)
  await setDoc(
    expenseDocRef,
    {
      totalIncentiveExpenses: parsedIncentive,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  // Write 3: Trigger ExpenseService.updateTotalSiteExpense(siteId)
  // Section 4.2 Write 3 & Section 4.5
  const rollupResult = await updateTotalSiteExpense(orgId, cleanSiteId)

  return {
    success: true,
    docId,
    auditPayload,
    rollupResult,
  }
}

/**
 * Fetch all saved incentives for reporting, audit, or listing
 */
export async function fetchSupervisorIncentives(orgId, siteId = null) {
  if (!orgId) return []
  try {
    const colRef = collection(db, 'organisation', orgId, 'siteSupervisorIncentives')
    let q = colRef
    if (siteId) {
      q = query(colRef, where('siteId', '==', siteId))
    }
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('[fetchSupervisorIncentives] Error:', err)
    return []
  }
}

export default {
  normalizeLabourItems,
  buildLabourComparisonGrid,
  fetchIncentiveSiteSupervisorData,
  fetchStageScheduleAndActual,
  saveSupervisorIncentive,
  fetchSupervisorIncentives,
}
