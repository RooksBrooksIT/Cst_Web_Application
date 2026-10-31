import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { fetchWithFallback, subscribeWithFallback } from './firestoreService.js'
import { matchesSite, parseDateToTime, amountValue } from '../pages/organization/finance/financeUtils.js'
import { isNewOrganization, isNewOrganizationSync } from './schemaResolverService.js'

/**
 * Finance Service for Organization Finance Page & Site Financial Details Drill-down
 * Complies with ORGANIZATION_FINANCE_PAGE_SPECIFICATION.txt
 */

export async function fetchTotalSiteExpenses(orgId) {
  if (!orgId) return []
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'totalSiteExpensesPerDay'))
    if (!snap.empty) {
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
  } catch (e) {
    console.error('Error fetching totalSiteExpensesPerDay:', e)
  }
  return []
}

export function subscribeTotalSiteExpenses(orgId, onData, onError) {
  if (!orgId) return () => {}
  return onSnapshot(
    collection(db, 'organisation', orgId, 'totalSiteExpensesPerDay'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

export async function fetchSitePayments(orgId, siteId = null) {
  if (!orgId) return []
  try {
    let q = collection(db, 'organisation', orgId, 'SitePayment')
    if (siteId) {
      q = query(q, where('siteId', '==', siteId))
    }
    const snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
  } catch (e) {
    console.warn('SitePayment collection query error / empty:', e)
  }
  return []
}

export function subscribeSitePayments(orgId, onData, onError) {
  if (!orgId) return () => {}
  return onSnapshot(
    collection(db, 'organisation', orgId, 'SitePayment'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

export function parseAmount(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]+/g, '').trim()
    if (!cleaned) return 0
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Processes, itemizes, and deduplicates raw expense documents from all ledger streams for a site.
 * Ensures:
 * 1. Mirrored documents between duplicate collections (managerExpenses vs managerEntries,
 *    organizationExpenses vs organizationEntries, pettyCashTransactions vs petty_cash_expenses)
 *    are deduplicated using unique document IDs and transaction IDs.
 * 2. Genuinely different records (different doc IDs / transactions) are preserved and displayed
 *    with their respective categories (e.g. Manager Direct Expense vs Manager Approved).
 * 3. Exact bill numbers are retrieved from bills array or document level, falling back to 'N/A'.
 * 4. Itemized bills (when bills array > 1) are expanded into individual ledger rows with exact amounts.
 * 5. Prevents double-counting and verifies filtered total matches displayed records.
 */
export function processRawGranularExpenseDocs({
  sourcesWithDocs = [],
  siteId,
  siteObj = null,
}) {
  const results = []

  const targetIds = [
    siteId,
    siteObj?.id,
    siteObj?.siteId,
    siteObj?.siteid,
    siteObj?.code,
    siteObj?.siteCode,
    siteObj?.projectId,
  ].filter(Boolean).map((k) => String(k).trim().toLowerCase())

  const targetNames = [
    siteObj?.siteName,
    siteObj?.sitename,
    siteObj?.projectName,
    siteObj?.name,
  ].filter(Boolean).map((n) => String(n).trim().toLowerCase())

  // Track unique record IDs to prevent duplicate entries from appearing in the ledger
  const seenDocIds = new Set()
  const seenTransactionIds = new Set()

  for (const { col, category, docs } of sourcesWithDocs) {
    if (!Array.isArray(docs)) continue

    docs.forEach((docItem) => {
      const data = docItem.data || docItem
      const docId = String(docItem.id || data.id || data.docId || '').trim()

      // 1. Strict Site Matching Logic
      let isMatch = false
      if (siteObj && matchesSite({ id: docId, ...data }, siteObj)) {
        isMatch = true
      } else {
        const sId = String(data.siteId || data.siteid || data.projectId || data.siteID || '').trim().toLowerCase()
        const sName = String(data.siteName || data.projectName || data.site || '').trim().toLowerCase()

        if (sId && targetIds.some((t) => sId === t || sId.includes(t) || t.includes(sId))) {
          isMatch = true
        } else if (sName && targetNames.some((t) => sName === t || sName.includes(t) || t.includes(sName))) {
          isMatch = true
        } else if (docId) {
          const cleanDocId = docId.toLowerCase()
          if (targetIds.some((t) => t && t.length >= 3 && cleanDocId.includes(t))) {
            isMatch = true
          }
        }
      }

      if (!isMatch) return

      // 2. Duplicate Detection: Check if this document or transaction was already processed
      const rawExpenseId = String(data.expenseId || data.transactionId || data.voucherId || data.voucherNo || '').trim()
      const rawId = String(data.id || '').trim()

      if (docId && seenDocIds.has(docId)) {
        return // Duplicate mirror document ID already included
      }
      if (rawExpenseId && seenTransactionIds.has(rawExpenseId)) {
        return // Duplicate mirror transaction ID already included
      }
      if (rawId && rawId !== docId && seenDocIds.has(rawId)) {
        return // Duplicate internal ID already included
      }

      // Register unique identifiers
      if (docId) seenDocIds.add(docId)
      if (rawExpenseId) seenTransactionIds.add(rawExpenseId)
      if (rawId) seenDocIds.add(rawId)

      // 3. Itemized Bills Normalization vs Document-Level Record
      const rawBills = Array.isArray(data.bills) ? data.bills : []
      const validBills = rawBills.filter(
        (b) => b && (parseAmount(b.amount || b.billAmount) > 0 || b.description || b.vendor || b.billNo)
      )

      const defaultStage = data.projectStage || data.stage || ''
      const effectiveCategory = data.category || data.expenseCategory || data.expenseType || category

      if (validBills.length > 1) {
        // Multiple itemized bills: generate an individual row per bill
        validBills.forEach((b, idx) => {
          const bAmt = parseAmount(b.amount || b.billAmount)
          const bBillNo = (b.billNo || b.billNumber || b.invoiceNo || b.invoiceNumber || '').toString().trim()
          const bVendor = (b.vendor || b.billVendor || b.vendorName || data.vendorName || data.supplier || data.contractorName || data.payeeName || 'Vendor / Contractor').toString().trim()
          const bDesc = (b.description || b.purpose || b.remarks || data.description || data.expenseName || (bVendor ? `${bVendor} Bill` : `Bill #${bBillNo || idx + 1}`)).toString().trim()
          const bQty = b.quantity !== undefined && b.quantity !== null && b.quantity !== ''
            ? b.quantity
            : (b.qty !== undefined && b.qty !== null && b.qty !== '' ? b.qty : null)
          const bDoc = (b.billUrl || b.imageUrl || (b.billCopy && b.billCopy !== 'billURL' ? b.billCopy : '') || data.billUrl || data.imageUrl || '').toString().trim()
          const bStoragePath = (b.storagePath || data.storagePath || '').toString().trim()
          const bDate = b.date || b.billDate || data.date || data.expenseDate || data.createdAt || data.transactionDate || ''

          results.push({
            id: `${docId}_bill_${b.id || b.billNo || idx}`,
            refId: `${docId} (#${idx + 1})`,
            parentDocId: docId,
            sourceCollection: col,
            category: effectiveCategory,
            title: bDesc,
            billNo: bBillNo || 'N/A',
            vendorName: bVendor,
            quantity: bQty,
            amount: bAmt,
            date: bDate,
            stage: defaultStage,
            billUrl: bDoc,
            imageUrl: bDoc,
            storagePath: bStoragePath,
            rawDoc: data,
            rawBill: b,
            isItemizedBill: true,
          })
        })
      } else if (validBills.length === 1) {
        // Single itemized bill in array
        const b = validBills[0]
        const bAmt = parseAmount(b.amount || b.billAmount || data.totalAmount || data.amount)
        const bBillNo = (b.billNo || b.billNumber || b.invoiceNo || b.invoiceNumber || data.billNo || data.billNumber || data.invoiceNo || data.referenceNo || '').toString().trim()
        const bVendor = (b.vendor || b.billVendor || b.vendorName || data.vendorName || data.supplier || data.contractorName || data.payeeName || 'Vendor / Contractor').toString().trim()
        const bDesc = (b.description || b.purpose || b.remarks || data.description || data.expenseName || data.materialName || 'Site Expense').toString().trim()
        const bQty = b.quantity !== undefined && b.quantity !== null && b.quantity !== ''
          ? b.quantity
          : (b.qty !== undefined && b.qty !== null && b.qty !== '' ? b.qty : (data.quantity !== undefined && data.quantity !== null && data.quantity !== '' ? data.quantity : null))
        const bDoc = (b.billUrl || b.imageUrl || (b.billCopy && b.billCopy !== 'billURL' ? b.billCopy : '') || data.billUrl || data.imageUrl || '').toString().trim()
        const bStoragePath = (b.storagePath || data.storagePath || '').toString().trim()
        const bDate = b.date || b.billDate || data.date || data.expenseDate || data.createdAt || data.transactionDate || ''

        results.push({
          id: docId,
          refId: docId,
          parentDocId: docId,
          sourceCollection: col,
          category: effectiveCategory,
          title: bDesc,
          billNo: bBillNo || 'N/A',
          vendorName: bVendor,
          quantity: bQty,
          amount: bAmt,
          date: bDate,
          stage: defaultStage,
          billUrl: bDoc,
          imageUrl: bDoc,
          storagePath: bStoragePath,
          rawDoc: data,
          rawBill: b,
          isItemizedBill: false,
        })
      } else {
        // Standard document-level expense record
        const rawAmount = data.totalAmount ?? data.amount ?? data.billAmount ?? data.incentiveAmount ?? data.paymentAmount ?? 0
        const billNo = (data.billNo || data.billNumber || data.invoiceNo || data.invoiceNumber || data.voucherNo || data.voucherNumber || data.referenceNo || '').toString().trim()
        const vendor = (data.vendorName || data.vendor || data.supplier || data.contractorName || data.payeeName || data.supervisorName || 'Vendor / Contractor').toString().trim()
        const desc = (data.expenseName || data.materialName || data.description || data.purpose || data.remarks || (data.role ? `${data.role} Payment` : 'Site Expense')).toString().trim()
        const qty = data.quantity !== undefined && data.quantity !== null && data.quantity !== ''
          ? data.quantity
          : (data.qty !== undefined && data.qty !== null && data.qty !== '' ? data.qty : null)
        const docUrl = (data.billUrl || data.imageUrl || (data.billCopy && data.billCopy !== 'billURL' ? data.billCopy : '') || '').toString().trim()
        const storagePath = (data.storagePath || '').toString().trim()
        const date = data.date || data.expenseDate || data.transactionDate || data.paymentDate || data.createdAt || ''

        results.push({
          id: docId,
          refId: docId,
          parentDocId: docId,
          sourceCollection: col,
          category: effectiveCategory,
          title: desc,
          billNo: billNo || 'N/A',
          vendorName: vendor,
          quantity: qty,
          amount: parseAmount(rawAmount),
          date,
          stage: defaultStage,
          billUrl: docUrl,
          imageUrl: docUrl,
          storagePath,
          rawDoc: data,
          rawBill: null,
          isItemizedBill: false,
        })
      }
    })
  }

  // Sort newest first using parsed timestamps
  results.sort((a, b) => {
    const ta = parseDateToTime(a.date, a.parentDocId || a.id)
    const tb = parseDateToTime(b.date, b.parentDocId || b.id)
    return tb - ta
  })

  return results
}

/**
 * Fetches granular itemized expenses for a specific site across all ledger streams.
 * Prevents duplicates between mirrored collections (e.g. managerExpenses & managerEntries,
 * organizationExpenses & organizationEntries, pettyCashTransactions & petty_cash_expenses).
 * 
 * Ensures that Manager Direct Expense and Manager Approved entries are displayed separately
 * only when they represent genuinely different expense records.
 */
export async function fetchSiteGranularExpenses(orgId, siteId, siteObj = null) {
  if (!orgId || (!siteId && !siteObj)) return []

  const isNewOrg = await isNewOrganization(orgId)

  // Ordered so primary canonical collections evaluate before cross-platform mirrors.
  // For new organizations, legacy mirrored collections (organizationEntries, managerEntries) are excluded.
  const sources = [
    { col: 'siteSupervisorEntries', category: 'Supervisor Entry' },
    { col: 'pettyCashTransactions', category: 'Petty Cash' },
    { col: 'organizationExpenses', category: 'Organization Expense' },
    { col: 'managerExpenses', category: 'Manager Direct Expense' },
    { col: 'contractorEntries', category: 'Contractor Payment' },
    { col: 'siteSupervisorIncentives', category: 'Supervisor Incentive' },
    ...(!isNewOrg
      ? [
          { col: 'organizationEntries', category: 'Organization Bill' },
          { col: 'managerEntries', category: 'Manager Approved' },
        ]
      : []),
    { col: 'petty_cash_expenses', category: 'Petty Cash Voucher' },
  ]

  const sourcesWithDocs = []

  for (const { col, category } of sources) {
    try {
      const q = query(collection(db, 'organisation', orgId, col))
      const snap = await getDocs(q)
      const docs = snap.docs.map((d) => ({
        id: d.id,
        data: d.data(),
      }))
      sourcesWithDocs.push({ col, category, docs })
    } catch (e) {
      console.warn(`Error querying source collection ${col}:`, e?.message)
    }
  }

  return processRawGranularExpenseDocs({
    sourcesWithDocs,
    siteId,
    siteObj,
  })
}

/**
 * Subscribes in real-time to granular itemized expenses for a specific site across all ledger streams.
 * Automatically recalculates deduplicated transactions whenever any expense collection is updated.
 */
export function subscribeSiteGranularExpenses(orgId, siteId, siteObj = null, onData, onError) {
  if (!orgId || (!siteId && !siteObj)) {
    if (onData) onData([])
    return () => {}
  }

  const isNewOrg = isNewOrganizationSync(orgId)

  // For new organizations, only attach listeners to canonical streams.
  const sources = [
    { col: 'siteSupervisorEntries', category: 'Supervisor Entry' },
    { col: 'pettyCashTransactions', category: 'Petty Cash' },
    { col: 'organizationExpenses', category: 'Organization Expense' },
    { col: 'managerExpenses', category: 'Manager Direct Expense' },
    { col: 'contractorEntries', category: 'Contractor Payment' },
    { col: 'siteSupervisorIncentives', category: 'Supervisor Incentive' },
    ...(!isNewOrg
      ? [
          { col: 'organizationEntries', category: 'Organization Bill' },
          { col: 'managerEntries', category: 'Manager Approved' },
        ]
      : []),
    { col: 'petty_cash_expenses', category: 'Petty Cash Voucher' },
  ]

  const docsByCol = new Map()
  sources.forEach((s) => docsByCol.set(s.col, []))

  const emit = () => {
    const sourcesWithDocs = sources.map(({ col, category }) => ({
      col,
      category,
      docs: docsByCol.get(col) || [],
    }))
    const processed = processRawGranularExpenseDocs({
      sourcesWithDocs,
      siteId,
      siteObj,
    })
    if (onData) onData(processed)
  }

  const unsubs = []

  for (const { col } of sources) {
    try {
      const colRef = collection(db, 'organisation', orgId, col)
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          const docs = snap.docs.map((d) => ({
            id: d.id,
            data: d.data(),
          }))
          docsByCol.set(col, docs)
          emit()
        },
        (err) => {
          console.warn(`[subscribeSiteGranularExpenses] Error listening to ${col}:`, err?.message)
          if (onError) onError(err)
        }
      )
      unsubs.push(unsub)
    } catch (err) {
      console.warn(`[subscribeSiteGranularExpenses] Could not attach listener for ${col}:`, err?.message)
    }
  }

  return () => {
    unsubs.forEach((u) => u && u())
  }
}

/**
 * Calculates consolidated total expenses and category subtotals for a site
 * from granular documents with fallback to summary rollup documents or project fields.
 * Prevents double counting, dedupes mirror collections, validates amount fields,
 * and handles missing or null amounts safely.
 */
export function calculateSiteTotalExpenses({
  site = {},
  granularExpenses = null,
  sourcesWithDocs = null,
  totalExpensesDoc = null,
}) {
  let effectiveGranularItems = []
  if (Array.isArray(granularExpenses) && granularExpenses.length > 0) {
    effectiveGranularItems = granularExpenses
  } else if (Array.isArray(sourcesWithDocs) && sourcesWithDocs.length > 0) {
    effectiveGranularItems = processRawGranularExpenseDocs({
      sourcesWithDocs,
      siteId: site?.siteId || site?.id || '',
      siteObj: site,
    })
  }

  if (effectiveGranularItems.length > 0) {
    let totalExpenses = 0
    let supervisor = 0
    let pettyCash = 0
    let manager = 0
    let organization = 0
    let contractor = 0
    let incentive = 0

    effectiveGranularItems.forEach((exp) => {
      const amt = parseAmount(exp.amount)
      totalExpenses += amt

      const cat = String(exp.category || '').toLowerCase()
      const src = String(exp.sourceCollection || '').toLowerCase()

      if (src === 'sitesupervisorentries' || cat.includes('supervisor entry') || cat.includes('daily entry')) {
        supervisor += amt
      } else if (src === 'pettycashtransactions' || src === 'petty_cash_expenses' || cat.includes('petty cash')) {
        pettyCash += amt
      } else if (src === 'managerexpenses' || src === 'managerentries' || cat.includes('manager')) {
        manager += amt
      } else if (src === 'organizationexpenses' || src === 'organizationentries' || cat.includes('organization')) {
        organization += amt
      } else if (src === 'contractorentries' || cat.includes('contractor')) {
        contractor += amt
      } else if (src === 'sitesupervisorincentives' || cat.includes('incentive')) {
        incentive += amt
      } else {
        if (cat.includes('petty')) pettyCash += amt
        else if (cat.includes('manager')) manager += amt
        else if (cat.includes('org')) organization += amt
        else if (cat.includes('contract')) contractor += amt
        else if (cat.includes('inc')) incentive += amt
        else supervisor += amt
      }
    })

    return {
      totalExpenses,
      categoryBreakdown: {
        supervisor,
        pettyCash,
        manager,
        organization,
        contractor,
        incentive,
      },
      isFromGranular: true,
      items: effectiveGranularItems,
    }
  }

  // Fallback to totalSiteExpensesPerDay or project fields
  const expDoc = totalExpensesDoc || {}
  const totalAllExp = amountValue(expDoc, ['totalAllExpenses', 'totalAllExpense', 'total_all_expenses', 'totalExpenses', 'totalExpense'])
  const supervisorExp = amountValue(expDoc, ['totalSiteExpense', 'totalSupervisorExpense', 'siteExpense', 'supervisorExpense', 'total_site_expense'])
  const mgrExp = amountValue(expDoc, ['totalMgrExpense', 'totalManagerExpense', 'managerExpense', 'mgrExpense', 'total_mgr_expense'])
  const orgExp = amountValue(expDoc, ['totalOrgExpense', 'totalOrganizationExpense', 'orgExpense', 'organizationExpense', 'total_org_expense'])
  const conExp = amountValue(expDoc, ['totalContractorExpense', 'totalContractorPayments', 'contractorExpense', 'total_contractor_expense'])
  const incExp = amountValue(expDoc, ['totalIncentiveExpenses', 'totalIncentives', 'incentiveExpenses', 'total_incentive_expenses'])
  const calculatedExpenses = supervisorExp + mgrExp + orgExp + conExp + incExp

  const directSiteExpenses = amountValue(site, [
    'amountSpent',
    'amountSpend',
    'spent',
    'spentAmount',
    'totalAllExpenses',
    'totalExpenses',
    'totalExpense',
    'actualExpense',
    'actualExpenditure',
    'actual',
    'expenditure',
    'amount_spent',
    'total_expenses',
    'total_all_expenses',
  ])

  let fallbackTotal = 0
  if (totalAllExp > 0) {
    fallbackTotal = totalAllExp
  } else if (calculatedExpenses > 0) {
    fallbackTotal = calculatedExpenses
  } else {
    fallbackTotal = directSiteExpenses
  }

  return {
    totalExpenses: fallbackTotal,
    categoryBreakdown: {
      supervisor: supervisorExp,
      pettyCash: amountValue(expDoc, ['totalPettyCashExpense', 'pettyCashExpense', 'totalPettyCashSpent', 'pettyCashSpent']),
      manager: mgrExp,
      organization: orgExp,
      contractor: conExp,
      incentive: incExp,
    },
    isFromGranular: false,
    items: [],
  }
}

/**
 * Calculates related financial metrics consistently with the total expenses:
 * - Net Cash in Hand = Customer Inflow - Total Expenses
 * - Budget Cushion & Consumption = Contract Budget - Total Expenses (or remaining balance)
 * - Budget Utilization = (Total Expenses / Contract Budget) * 100
 */
export function calculateSiteFinancialMetrics({
  budget = 0,
  income = 0,
  expenses = 0,
  explicitBalance = 0,
}) {
  const safeBudget = parseAmount(budget)
  const safeIncome = parseAmount(income)
  const safeExpenses = parseAmount(expenses)

  const cashInHand = safeIncome - safeExpenses
  let budgetRemaining = 0
  if (safeBudget > 0) {
    budgetRemaining = safeBudget - safeExpenses
  } else if (safeIncome > 0) {
    budgetRemaining = safeIncome - safeExpenses
  } else if (explicitBalance !== 0 && explicitBalance !== null && explicitBalance !== undefined) {
    budgetRemaining = parseAmount(explicitBalance)
  } else {
    budgetRemaining = cashInHand
  }

  const usagePercent = safeBudget > 0 ? Math.min(100, Math.max(0, Math.round((safeExpenses / safeBudget) * 100))) : 0
  const realizationPercent = safeBudget > 0 ? Math.min(100, Math.max(0, Math.round((safeIncome / safeBudget) * 100))) : 0
  const isBudgetCritical = usagePercent >= 85
  const isBudgetWarning = usagePercent >= 70 && usagePercent < 85

  return {
    budget: safeBudget,
    income: safeIncome,
    expenses: safeExpenses,
    cashInHand,
    budgetRemaining,
    balance: budgetRemaining,
    usagePercent,
    realizationPercent,
    isBudgetCritical,
    isBudgetWarning,
  }
}
