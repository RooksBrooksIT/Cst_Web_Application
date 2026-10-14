import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Manager Direct Expenses Service
 * Scoped under: /organisation/{orgId}/managerExpenses
 * Complies with Section 3 Group 4 & Section 4.4 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export async function fetchManagerExpenses(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'managerExpenses')
}

export function subscribeManagerExpenses(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'managerExpenses', onData, onError)
}

export async function recordManagerExpense(orgId, expenseData, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!expenseData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const expenseId = expenseData.expenseId || `MEXP_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  const bills = Array.isArray(expenseData.bills) ? expenseData.bills : []
  const totalAmount = bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0) || (Number(expenseData.totalAmount || expenseData.amount) || 0)

  const primaryBill = bills.find((b) => b.billUrl || b.imageUrl) || {}
  const primaryBillUrl = expenseData.billUrl || expenseData.imageUrl || primaryBill.billUrl || primaryBill.imageUrl || null
  const primaryStoragePath = expenseData.storagePath || primaryBill.storagePath || null

  const payload = {
    expenseId,
    siteId: expenseData.siteId,
    siteName: expenseData.siteName || '',
    projectStage: expenseData.projectStage || 'Superstructure & RCC Slabs',
    expenseDate: expenseData.expenseDate ? new Date(expenseData.expenseDate) : serverTimestamp(),
    managerId: managerActor?.id || managerActor?.uid || 'mgr_lead',
    managerName: managerActor?.fullName || managerActor?.name || managerActor?.displayName || 'Operations Manager',
    raiserRole: 'Manager',
    bills,
    totalAmount,
    billUrl: primaryBillUrl,
    imageUrl: primaryBillUrl,
    storagePath: primaryStoragePath,
    remarks: expenseData.remarks || '',
    status: 'recorded',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'managerExpenses', expenseId)
  await setDoc(docRef, payload)

  // Auto-update project site cumulative expenditure
  try {
    const siteRef = doc(db, 'organisation', orgId, 'projects', expenseData.siteId)
    const siteSnap = await getDoc(siteRef)
    if (siteSnap.exists()) {
      const currentSpent = Number(siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0)
      const nextSpent = currentSpent + totalAmount
      await updateDoc(siteRef, {
        totalAmountSpent: nextSpent,
        spentAmount: nextSpent,
        amountSpent: nextSpent,
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('Could not auto-sync manager expense to site spent:', err)
  }

  return { id: expenseId, ...payload }
}

export async function deleteManagerExpense(orgId, expenseId) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')
  const docRef = doc(db, 'organisation', orgId, 'managerExpenses', expenseId)
  await deleteDoc(docRef)
}
