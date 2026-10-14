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
 * CST White Label / eBricks - Organization Direct Expenses Service
 * Scoped under: /organisation/{orgId}/organizationExpenses
 * Synchronizes with organizationEntries for full reporting & dashboard compatibility
 */

export async function fetchOrganizationExpenses(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'organizationExpenses', 'organizationEntries')
}

export function subscribeOrganizationExpenses(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'organizationExpenses', onData, onError, 'organizationEntries')
}

export async function recordOrganizationExpense(orgId, expenseData, orgActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!expenseData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const expenseId =
    expenseData.expenseId ||
    `OEXP_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  const bills = Array.isArray(expenseData.bills) ? expenseData.bills : []
  const totalAmount =
    bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0) ||
    (Number(expenseData.totalAmount || expenseData.amount) || 0)

  const primaryBill = bills.find((b) => b.billUrl || b.imageUrl) || {}
  const primaryBillUrl =
    expenseData.billUrl ||
    expenseData.imageUrl ||
    primaryBill.billUrl ||
    primaryBill.imageUrl ||
    null
  const primaryStoragePath =
    expenseData.storagePath || primaryBill.storagePath || null

  const payload = {
    expenseId,
    id: expenseId,
    siteId: expenseData.siteId,
    siteName: expenseData.siteName || '',
    projectStage: expenseData.projectStage || 'Central Administration',
    expenseDate: expenseData.expenseDate
      ? new Date(expenseData.expenseDate)
      : serverTimestamp(),
    raiserId: orgActor?.id || orgActor?.uid || 'org_admin',
    raiserName:
      orgActor?.fullName ||
      orgActor?.name ||
      orgActor?.displayName ||
      'Organization Administrator',
    raiserRole: 'Organization',
    category: 'Organization Bill',
    bills,
    totalAmount,
    amount: totalAmount,
    billUrl: primaryBillUrl,
    imageUrl: primaryBillUrl,
    storagePath: primaryStoragePath,
    remarks: expenseData.remarks || '',
    status: 'recorded',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // 1. Primary write to organizationExpenses
  const docRef = doc(db, 'organisation', orgId, 'organizationExpenses', expenseId)
  await setDoc(docRef, payload)

  // 2. Dual-sync to organizationEntries for existing reporting & analytics
  try {
    const entryRef = doc(db, 'organisation', orgId, 'organizationEntries', expenseId)
    await setDoc(entryRef, payload, { merge: true })
  } catch (err) {
    console.warn('Could not mirror to organizationEntries:', err)
  }

  // 3. Auto-update project site cumulative expenditure
  try {
    const siteRef = doc(db, 'organisation', orgId, 'projects', expenseData.siteId)
    const siteSnap = await getDoc(siteRef)
    if (siteSnap.exists()) {
      const currentSpent = Number(
        siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0
      )
      const nextSpent = currentSpent + totalAmount
      await updateDoc(siteRef, {
        totalAmountSpent: nextSpent,
        spentAmount: nextSpent,
        amountSpent: nextSpent,
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('Could not auto-sync organization expense to site spent:', err)
  }

  return { id: expenseId, ...payload }
}

export async function deleteOrganizationExpense(orgId, expenseId) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'organizationExpenses', expenseId))
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'organizationEntries', expenseId))
  } catch (e) {}
}
