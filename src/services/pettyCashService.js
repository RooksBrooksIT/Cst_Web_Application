import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Petty Cash Management Service
 * Complies with Section 3.6, 3.7, 3.8 of Architecture Specification
 */

export const EXPENSE_CATEGORIES = [
  { id: 'materials_local', label: 'Local Materials / Urgent Hardware' },
  { id: 'labour_daily', label: 'Daily Labour Cash Advance / OT' },
  { id: 'equipment_fuel', label: 'Fuel / Diesel for Machinery' },
  { id: 'transport_cartage', label: 'Cartage, Auto & Local Transport' },
  { id: 'refreshments', label: 'Staff & Worker Refreshments' },
  { id: 'office_stationery', label: 'Site Stationery & Printing' },
  { id: 'repairs', label: 'Emergency Repairs & Spares' },
  { id: 'miscellaneous', label: 'Miscellaneous Site Expense' },
]

// ------------------------------------------------------------------------------------------------
// 1. Petty Cash Accounts (/organisation/{orgId}/petty_cash_accounts)
// ------------------------------------------------------------------------------------------------

export async function fetchPettyCashAccounts(orgId) {
  return fetchWithFallback(orgId, 'petty_cash_accounts')
}

export function subscribePettyCashAccounts(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'petty_cash_accounts', onData, onError)
}

export async function createOrUpdatePettyCashAccount(orgId, accountData) {
  const supervisorUid = accountData.supervisorUid || accountData.id || `sup_${Date.now()}`
  const payload = {
    accountId: accountData.accountId || supervisorUid,
    supervisorUid,
    supervisorName: accountData.supervisorName || accountData.name || 'Supervisor',
    organizationId: orgId,
    projectId: accountData.projectId || '',
    projectName: accountData.projectName || 'All Assigned Sites',
    currentBalance: Number(accountData.currentBalance) || 0,
    totalAllocated: Number(accountData.totalAllocated) || 0,
    totalSpent: Number(accountData.totalSpent) || 0,
    totalReturned: Number(accountData.totalReturned) || 0,
    lastDisbursementDate: accountData.lastDisbursementDate || new Date().toISOString(),
    lastExpenseDate: accountData.lastExpenseDate || '',
  }

  await saveStandardDoc(orgId, 'petty_cash_accounts', payload, supervisorUid)
  return payload
}

// ------------------------------------------------------------------------------------------------
// 2. Petty Cash Requests (/organisation/{orgId}/petty_cash_requests)
// ------------------------------------------------------------------------------------------------

export async function fetchPettyCashRequests(orgId) {
  return fetchWithFallback(orgId, 'petty_cash_requests')
}

export function subscribePettyCashRequests(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'petty_cash_requests', onData, onError)
}

export async function createPettyCashRequest(orgId, requestData) {
  const payload = {
    supervisorUid: requestData.supervisorUid || '',
    supervisorName: requestData.supervisorName || 'Supervisor',
    amount: Number(requestData.amount) || 0,
    category: requestData.category || 'site_expense',
    projectId: requestData.projectId || '',
    projectName: requestData.projectName || 'Site',
    reason: requestData.reason || 'Float replenishment',
    status: requestData.status || 'pending_manager',
    paymentMode: requestData.paymentMode || 'upi',
    disbursedBy: '',
    disbursedAt: '',
    rejectionReason: '',
  }

  const docId = await saveStandardDoc(orgId, 'petty_cash_requests', payload)
  return { id: docId, ...payload }
}

export async function disbursePettyCashRequest(orgId, requestId, supervisorUid, amount, disbursedByName, paymentMode = 'bank_transfer') {
  // 1. Update Request
  await updateStandardDoc(orgId, 'petty_cash_requests', requestId, {
    status: 'disbursed',
    disbursedBy: disbursedByName,
    disbursedAt: new Date().toISOString(),
    paymentMode,
  })

  // 2. Update Account
  const accounts = await fetchPettyCashAccounts(orgId)
  const existingAccount = accounts.find((a) => a.supervisorUid === supervisorUid || a.id === supervisorUid)
  if (existingAccount) {
    const newBalance = (Number(existingAccount.currentBalance) || 0) + Number(amount)
    const newAllocated = (Number(existingAccount.totalAllocated) || 0) + Number(amount)
    await updateStandardDoc(orgId, 'petty_cash_accounts', existingAccount.id, {
      currentBalance: newBalance,
      totalAllocated: newAllocated,
      lastDisbursementDate: new Date().toISOString(),
    })
  } else {
    await createOrUpdatePettyCashAccount(orgId, {
      supervisorUid,
      supervisorName: 'Supervisor',
      currentBalance: Number(amount),
      totalAllocated: Number(amount),
      totalSpent: 0,
      totalReturned: 0,
    })
  }
}

// ------------------------------------------------------------------------------------------------
// 3. Petty Cash Expenses (/organisation/{orgId}/petty_cash_expenses)
// ------------------------------------------------------------------------------------------------

export async function fetchPettyCashExpenses(orgId) {
  return fetchWithFallback(orgId, 'petty_cash_expenses')
}

export function subscribePettyCashExpenses(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'petty_cash_expenses', onData, onError)
}

export async function recordPettyCashExpense(orgId, expenseData) {
  const payload = {
    supervisorUid: expenseData.supervisorUid || '',
    supervisorName: expenseData.supervisorName || 'Supervisor',
    projectId: expenseData.projectId || expenseData.siteId || '',
    projectName: expenseData.projectName || expenseData.siteName || 'Site',
    expenseType: expenseData.expenseType || 'site_expense',
    category: expenseData.category || 'materials_local',
    amount: Number(expenseData.amount) || 0,
    date: expenseData.date || new Date().toISOString(),
    description: expenseData.description || expenseData.justification || '',
    vendorName: expenseData.vendorName || 'Local Supplier',
    billReceiptUrl: expenseData.billReceiptUrl || expenseData.receiptUrl || '',
    status: expenseData.status || 'approved',
    approvedBy: expenseData.approvedBy || 'Manager',
    approvedAt: new Date().toISOString(),
  }

  const docId = await saveStandardDoc(orgId, 'petty_cash_expenses', payload)
  return { id: docId, ...payload }
}

export async function approvePettyCashExpense(orgId, expenseId, approverName) {
  await updateStandardDoc(orgId, 'petty_cash_expenses', expenseId, {
    status: 'approved',
    approvedBy: approverName,
    approvedAt: new Date().toISOString(),
  })
}
