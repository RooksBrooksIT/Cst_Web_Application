import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { isNewOrganization } from './schemaResolverService.js'

/**
 * CST Incentive & Expense Rollup Engine
 * Implements the calculations, aggregations, and atomic project synchronization
 * specified in incentive_flow.txt (Sections 4.3, 4.4, 4.5, and 5).
 */

// ================================================================================================
// 1. PURE MATHEMATICAL FUNCTIONS & VALIDATORS (Deterministic & Testable)
// ================================================================================================

/**
 * Calculates total actual expenditure: actualTotal = actDays * actPayment
 * Section 5 Formula 1
 */
export function calculateLabourActualTotal(actDays, actPayment) {
  const days = Math.max(0, Number(actDays) || 0)
  const payment = Math.max(0, Number(actPayment) || 0)
  return Math.round(days * payment * 100) / 100
}

/**
 * Calculates budget savings: savedAmount = max(approvedTotal - actualTotal, 0)
 * Clamped to 0 to prevent negative savings from creating penalties.
 * Section 5 Formula 2 & Section 6 Edge Case 1
 */
export function calculateSavings(approvedTotal, actualTotal) {
  const approved = Math.max(0, Number(approvedTotal) || 0)
  const actual = Math.max(0, Number(actualTotal) || 0)
  const diff = approved - actual
  return Math.max(0, Math.round(diff * 100) / 100)
}

/**
 * Calculates incentive payout: incentiveAmount = savedAmount * (incentivePercentage / 100)
 * Section 5 Formula 3
 */
export function calculateIncentive(savedAmount, incentivePercentage) {
  const savings = Math.max(0, Number(savedAmount) || 0)
  const rawPct = Number(incentivePercentage)
  const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0
  const incentive = savings * (pct / 100)
  return Math.round(incentive * 100) / 100
}

/**
 * Total site expenditure roll-up:
 * totalAllExpenses = supervisorTotal + managerTotal + orgTotal + contractorTotal + incentiveTotal
 * Section 5 Formula 4
 */
export function calculateAllExpensesTotals({
  supervisorTotal = 0,
  managerTotal = 0,
  orgTotal = 0,
  contractorTotal = 0,
  incentiveTotal = 0,
} = {}) {
  const sup = Math.max(0, Number(supervisorTotal) || 0)
  const mgr = Math.max(0, Number(managerTotal) || 0)
  const org = Math.max(0, Number(orgTotal) || 0)
  const con = Math.max(0, Number(contractorTotal) || 0)
  const inc = Math.max(0, Number(incentiveTotal) || 0)
  const totalAll = Math.round((sup + mgr + org + con + inc) * 100) / 100

  return {
    supervisorTotal: sup,
    managerTotal: mgr,
    orgTotal: org,
    contractorTotal: con,
    incentiveTotal: inc,
    totalAllExpenses: totalAll,
  }
}

/**
 * Remaining project balance: amountBalance = amountPaid - totalAllExpenses
 * Section 5 Formula 5
 */
export function calculateProjectBalance(amountPaid, totalAllExpenses) {
  const paid = Number(amountPaid) || 0
  const spent = Number(totalAllExpenses) || 0
  return Math.round((paid - spent) * 100) / 100
}

/**
 * Validates request availability guard:
 * reqDays == 0 || approvedDays == 0 || actualDays == 0
 * Section 3.3 Item 3 & Section 6 Edge Case 2
 */
export function isStageRequestAvailable({ reqDays, appDays, actDays }) {
  const r = Number(reqDays) || 0
  const a = Number(appDays) || 0
  const act = Number(actDays) || 0
  return r > 0 && a > 0 && act > 0
}

/**
 * Helper to parse numbers safely from Firestore document fields
 */
function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  const cleaned = String(val).replace(/[^0-9.-]+/g, '').trim()
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

// ================================================================================================
// 2. FIRESTORE AGGREGATION QUERIES (Multi-tenant scoped with fallback support)
// ================================================================================================

/**
 * Sums Supervisor Expenses ('siteSupervisorEntries' where siteId == siteId -> sums totalAmount)
 * Section 4.2 Write 3 Step 1.a
 */
export async function _sumSupervisorExpenses(orgId, siteId) {
  if (!orgId || !siteId) return 0
  try {
    const colRef = collection(db, 'organisation', orgId, 'siteSupervisorEntries')
    const q = query(colRef, where('siteId', '==', siteId))
    const snap = await getDocs(q)
    let total = 0
    snap.forEach((d) => {
      const data = d.data()
      total += parseNum(data.totalAmount ?? data.amount)
    })
    return total
  } catch (err) {
    console.warn(`[_sumSupervisorExpenses] Error aggregating for site ${siteId}:`, err)
    return 0
  }
}

/**
 * Sums Manager Expenses:
 * - For new organizations: queries 'managerExpenses' only
 * - For existing organizations: queries 'managerExpenses' & 'managerEntries' with deduplication
 * Section 4.2 Write 3 Step 1.b
 */
export async function _sumManagerExpenses(orgId, siteId) {
  if (!orgId || !siteId) return 0
  try {
    const isNewOrg = await isNewOrganization(orgId)
    const collectionsToQuery = isNewOrg ? ['managerExpenses'] : ['managerExpenses', 'managerEntries']
    const dedupedDocs = new Map()

    for (const colName of collectionsToQuery) {
      try {
        const colRef = collection(db, 'organisation', orgId, colName)
        const snap = await getDocs(colRef)
        snap.forEach((d) => {
          if (!dedupedDocs.has(d.id)) {
            dedupedDocs.set(d.id, d.data())
          }
        })
      } catch (_) {}
    }

    let total = 0
    const targetClean = String(siteId).toLowerCase().trim()

    dedupedDocs.forEach((data, docId) => {
      const sId = String(data.siteId || data.site || '').toLowerCase().trim()
      const pName = String(data.projectName || data.siteName || '').toLowerCase().trim()
      const dId = String(docId).toLowerCase().trim()

      const isMatch =
        sId === targetClean ||
        (sId && (targetClean.includes(sId) || sId.includes(targetClean))) ||
        (pName && (targetClean.includes(pName) || pName.includes(targetClean))) ||
        dId.startsWith(targetClean)

      if (isMatch) {
        if (Array.isArray(data.bills) && data.bills.length > 0) {
          total += data.bills.reduce((acc, b) => acc + parseNum(b.billAmount ?? b.amount), 0)
        } else {
          total += parseNum(data.totalAmount ?? data.amount ?? data.managerExpenseTotalAmount)
        }
      }
    })

    return total
  } catch (err) {
    console.warn(`[_sumManagerExpenses] Error aggregating for site ${siteId}:`, err)
    return 0
  }
}

/**
 * Sums Organization Expenses:
 * - For new organizations: queries 'organizationExpenses' only
 * - For existing organizations: queries 'organizationExpenses' & 'organizationEntries' with deduplication
 * Section 4.2 Write 3 Step 1.c
 */
export async function _sumOrganizationExpenses(orgId, siteId) {
  if (!orgId || !siteId) return 0
  try {
    const isNewOrg = await isNewOrganization(orgId)
    const collectionsToQuery = isNewOrg ? ['organizationExpenses'] : ['organizationExpenses', 'organizationEntries']
    const dedupedDocs = new Map()

    for (const colName of collectionsToQuery) {
      try {
        const colRef = collection(db, 'organisation', orgId, colName)
        const snap = await getDocs(colRef)
        snap.forEach((d) => {
          if (!dedupedDocs.has(d.id)) {
            dedupedDocs.set(d.id, d.data())
          }
        })
      } catch (_) {}
    }

    let total = 0
    const targetClean = String(siteId).toLowerCase().trim()

    dedupedDocs.forEach((data, docId) => {
      const sId = String(data.siteId || data.site || '').toLowerCase().trim()
      const pName = String(data.projectName || data.siteName || '').toLowerCase().trim()
      const dId = String(docId).toLowerCase().trim()

      const isMatch =
        sId === targetClean ||
        (sId && (targetClean.includes(sId) || sId.includes(targetClean))) ||
        (pName && (targetClean.includes(pName) || pName.includes(targetClean))) ||
        dId.startsWith(targetClean)

      if (isMatch) {
        if (Array.isArray(data.bills) && data.bills.length > 0) {
          total += data.bills.reduce((acc, b) => acc + parseNum(b.billAmount ?? b.amount), 0)
        } else {
          total += parseNum(data.totalAmount ?? data.amount ?? data.orgExpenseTotalAmount)
        }
      }
    })

    return total
  } catch (err) {
    console.warn(`[_sumOrganizationExpenses] Error aggregating for site ${siteId}:`, err)
    return 0
  }
}

/**
 * Sums Contractor Expenses ('contractorEntries' where siteId == siteId -> sums totalAmount)
 * Section 4.2 Write 3 Step 1.d
 */
export async function _sumContractorExpenses(orgId, siteId) {
  if (!orgId || !siteId) return 0
  try {
    const colRef = collection(db, 'organisation', orgId, 'contractorEntries')
    const q = query(colRef, where('siteId', '==', siteId))
    const snap = await getDocs(q)
    let total = 0
    snap.forEach((d) => {
      const data = d.data()
      total += parseNum(data.totalAmount ?? data.amount)
    })
    return total
  } catch (err) {
    console.warn(`[_sumContractorExpenses] Error aggregating for site ${siteId}:`, err)
    return 0
  }
}

/**
 * Sums Incentive Expenses ('siteSupervisorIncentives' where siteId == siteId -> sums incentiveAmount)
 * Section 4.2 Write 3 Step 1.e
 */
export async function _sumIncentiveExpenses(orgId, siteId) {
  if (!orgId || !siteId) return 0
  try {
    const colRef = collection(db, 'organisation', orgId, 'siteSupervisorIncentives')
    const q = query(colRef, where('siteId', '==', siteId))
    const snap = await getDocs(q)
    let total = 0
    snap.forEach((d) => {
      const data = d.data()
      total += parseNum(data.incentiveAmount ?? data.amount)
    })
    return total
  } catch (err) {
    console.warn(`[_sumIncentiveExpenses] Error aggregating for site ${siteId}:`, err)
    return 0
  }
}

// ================================================================================================
// 3. ATOMIC FIRESTORE TRANSACTION & PROJECT FINANCIAL SYNC (ExpenseService)
// ================================================================================================

/**
 * Recalculates all site expense subtotals and synchronizes project balance atomically.
 * Matches ExpenseService.recalcTotalsAndSyncProject(siteId) from incentive_flow.txt
 *
 * Steps:
 * 1. Executes 5 aggregation queries in parallel
 * 2. Sums totalAllExpenses = supervisor + manager + organization + contractor + incentive
 * 3. In an atomic transaction:
 *    - Updates 'totalSiteExpensesPerDay/{siteId}'
 *    - Finds matching project in 'projects', computes amountBalance = amountPaid - totalAllExpenses
 *    - Updates project 'amountSpent' and 'amountBalance'
 */
export async function recalcTotalsAndSyncProject(orgId, siteId) {
  if (!orgId) throw new Error('orgId is required')
  if (!siteId) throw new Error('siteId is required')

  // Step 1: Run aggregation queries concurrently
  const [
    supervisorTotal,
    managerTotal,
    orgTotal,
    contractorTotal,
    incentiveTotal,
  ] = await Promise.all([
    _sumSupervisorExpenses(orgId, siteId),
    _sumManagerExpenses(orgId, siteId),
    _sumOrganizationExpenses(orgId, siteId),
    _sumContractorExpenses(orgId, siteId),
    _sumIncentiveExpenses(orgId, siteId),
  ])

  // Step 2: Compute rollup totals
  const totals = calculateAllExpensesTotals({
    supervisorTotal,
    managerTotal,
    orgTotal,
    contractorTotal,
    incentiveTotal,
  })

  const { totalAllExpenses } = totals

  // Step 3: Atomic Transaction
  const expenseRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', siteId)

  // Find candidate project document references
  // 1. Direct doc by siteId
  // 2. Query where siteId == siteId, siteCode == siteId, or id == siteId
  let targetProjectDocRef = null
  let initialAmountPaid = 0

  try {
    const directProjectRef = doc(db, 'organisation', orgId, 'projects', siteId)
    const directSnap = await getDoc(directProjectRef)
    if (directSnap.exists()) {
      targetProjectDocRef = directProjectRef
      initialAmountPaid = parseNum(directSnap.data().amountPaid ?? directSnap.data().contractValue)
    } else {
      // Query projects collection for matching siteId or siteCode
      const projCol = collection(db, 'organisation', orgId, 'projects')
      const q = query(projCol, where('siteId', '==', siteId))
      const querySnap = await getDocs(q)
      if (!querySnap.empty) {
        targetProjectDocRef = querySnap.docs[0].ref
        initialAmountPaid = parseNum(querySnap.docs[0].data().amountPaid ?? querySnap.docs[0].data().contractValue)
      } else {
        // Fallback: check by siteCode
        const qCode = query(projCol, where('siteCode', '==', siteId))
        const codeSnap = await getDocs(qCode)
        if (!codeSnap.empty) {
          targetProjectDocRef = codeSnap.docs[0].ref
          initialAmountPaid = parseNum(codeSnap.docs[0].data().amountPaid ?? codeSnap.docs[0].data().contractValue)
        }
      }
    }
  } catch (lookupErr) {
    console.warn(`[recalcTotalsAndSyncProject] Project lookup warning for site ${siteId}:`, lookupErr)
  }

  // Execute atomic transaction
  await runTransaction(db, async (transaction) => {
    // Read project in transaction if reference was found
    let freshAmountPaid = initialAmountPaid
    if (targetProjectDocRef) {
      try {
        const projSnap = await transaction.get(targetProjectDocRef)
        if (projSnap.exists()) {
          const pData = projSnap.data()
          freshAmountPaid = parseNum(pData.amountPaid ?? pData.contractValue ?? 0)
        }
      } catch (e) {
        console.warn(`[recalcTotalsAndSyncProject] Transaction read warning for project:`, e)
      }
    }

    const amountBalance = calculateProjectBalance(freshAmountPaid, totalAllExpenses)

    // Write 1: Upsert totalSiteExpensesPerDay document
    transaction.set(
      expenseRef,
      {
        siteId,
        totalSiteExpense: totals.supervisorTotal,
        totalMgrExpense: totals.managerTotal,
        totalOrgExpense: totals.orgTotal,
        totalContractorExpense: totals.contractorTotal,
        totalIncentiveExpenses: totals.incentiveTotal,
        totalAllExpenses,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // Write 2: If matching project exists, update financial balance
    if (targetProjectDocRef) {
      transaction.update(targetProjectDocRef, {
        amountSpent: totalAllExpenses,
        spentAmount: totalAllExpenses,
        totalAmountSpent: totalAllExpenses,
        amountBalance,
        updatedAt: serverTimestamp(),
      })
    }
  })

  return {
    siteId,
    totals,
    amountBalance: calculateProjectBalance(initialAmountPaid, totalAllExpenses),
  }
}

/**
 * Standard alias for compatibility with mobile specification:
 * ExpenseService.updateTotalSiteExpense(siteId)
 */
export async function updateTotalSiteExpense(orgId, siteId) {
  return recalcTotalsAndSyncProject(orgId, siteId)
}

/**
 * Class-like / namespace object export to mirror mobile ExpenseService exactly
 */
export const ExpenseService = {
  updateTotalSiteExpense,
  recalcTotalsAndSyncProject,
  _sumSupervisorExpenses,
  _sumManagerExpenses,
  _sumOrganizationExpenses,
  _sumContractorExpenses,
  _sumIncentiveExpenses,
  calculateLabourActualTotal,
  calculateSavings,
  calculateIncentive,
  calculateAllExpensesTotals,
  calculateProjectBalance,
  isStageRequestAvailable,
}

export default ExpenseService
