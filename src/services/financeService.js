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
import { db } from './firebase'
import { fetchWithFallback, subscribeWithFallback } from './firestoreService'

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
 * Fetches granular itemized expenses for a specific site across:
 * 1. siteSupervisorEntries
 * 2. pettyCashTransactions
 * 3. organizationEntries
 * 4. managerEntries
 * 5. contractorEntries
 * 6. siteSupervisorIncentives
 * 7. petty_cash_expenses (canonical fallback)
 */
export async function fetchSiteGranularExpenses(orgId, siteId, siteObj = null) {
  if (!orgId || (!siteId && !siteObj)) return []
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

  const sources = [
    { col: 'siteSupervisorEntries', category: 'Supervisor Entry' },
    { col: 'pettyCashTransactions', category: 'Petty Cash' },
    { col: 'organizationExpenses', category: 'Organization Expense' },
    { col: 'organizationEntries', category: 'Organization Bill' },
    { col: 'managerExpenses', category: 'Manager Direct Expense' },
    { col: 'managerEntries', category: 'Manager Approved' },
    { col: 'contractorEntries', category: 'Contractor Payment' },
    { col: 'siteSupervisorIncentives', category: 'Supervisor Incentive' },
    { col: 'petty_cash_expenses', category: 'Petty Cash Voucher' },
  ]

  for (const { col, category } of sources) {
    try {
      const q = query(collection(db, 'organisation', orgId, col))
      const snap = await getDocs(q)
      snap.docs.forEach((d) => {
        const data = d.data()
        const sId = String(data.siteId || data.siteid || data.projectId || data.siteID || d.id || '').trim().toLowerCase()
        const sName = String(data.siteName || data.projectName || data.site || '').trim().toLowerCase()

        const isMatch =
          !sId ||
          targetIds.some((t) => sId === t || sId.includes(t) || t.includes(sId)) ||
          targetNames.some((t) => (sName && (sName === t || sName.includes(t) || t.includes(sName))))

        if (isMatch) {
          const rawAmount = data.totalAmount ?? data.amount ?? data.billAmount ?? data.incentiveAmount ?? data.paymentAmount ?? 0
          const billWithDoc =
            data.billUrl ||
            data.imageUrl ||
            (Array.isArray(data.bills) && data.bills.find((b) => b.billUrl || b.imageUrl)?.billUrl) ||
            (Array.isArray(data.bills) && data.bills.find((b) => b.billUrl || b.imageUrl)?.imageUrl) ||
            ''
          results.push({
            id: d.id,
            sourceCollection: col,
            category: data.category || data.expenseCategory || data.expenseType || category,
            title: data.expenseName || data.materialName || data.description || data.contractorName || data.supervisorName || 'Site Expense',
            vendorName: data.vendorName || data.supplier || data.contractorName || data.payeeName || 'Vendor / Contractor',
            amount: parseAmount(rawAmount),
            date: data.date || data.transactionDate || data.createdAt || data.paymentDate || '',
            stage: data.projectStage || data.stage || '',
            billUrl: billWithDoc,
            imageUrl: billWithDoc,
            bills: data.bills || [],
            ...data,
          })
        }
      })
    } catch (e) {}
  }

  // Sort newest first
  results.sort((a, b) => {
    const da = a.date ? (a.date.toDate ? a.date.toDate() : new Date(a.date)) : 0
    const dbTime = b.date ? (b.date.toDate ? b.date.toDate() : new Date(b.date)) : 0
    return dbTime - da
  })

  return results
}
