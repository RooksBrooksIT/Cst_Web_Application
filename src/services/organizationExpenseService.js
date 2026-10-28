import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { normalizeExpenseRecord } from './expenseNormalizationService.js'

/**
 * CST White Label / eBricks - Organization Direct Expenses Service
 * Scoped under: /organisation/{orgId}/organizationExpenses & organizationEntries
 * Fully synchronizes mobile and web expense records in real-time.
 */

export async function fetchOrganizationExpenses(orgId) {
  if (!orgId) return []
  const collectionsToRead = ['organizationExpenses', 'organizationEntries']
  const dedupedMap = new Map()

  for (const colName of collectionsToRead) {
    try {
      const snap = await getDocs(collection(db, 'organisation', orgId, colName))
      snap.docs.forEach((d) => {
        const normalized = normalizeExpenseRecord(d.id, d.data(), 'Organization')
        if (normalized) {
          if (!dedupedMap.has(d.id)) {
            dedupedMap.set(d.id, normalized)
          } else {
            // Keep the one with more itemized bills if duplicate
            const existing = dedupedMap.get(d.id)
            if ((!existing.bills || existing.bills.length === 0) && (normalized.bills && normalized.bills.length > 0)) {
              dedupedMap.set(d.id, normalized)
            }
          }
        }
      })
    } catch (err) {
      console.warn(`[fetchOrganizationExpenses] Could not read ${colName}:`, err?.message)
    }
  }

  return Array.from(dedupedMap.values()).sort((a, b) => {
    const tA = a.date instanceof Date ? a.date.getTime() : (a.expenseDate?.seconds ? a.expenseDate.seconds * 1000 : 0)
    const tB = b.date instanceof Date ? b.date.getTime() : (b.expenseDate?.seconds ? b.expenseDate.seconds * 1000 : 0)
    return tB - tA
  })
}

export function subscribeOrganizationExpenses(orgId, onData, onError) {
  if (!orgId) return () => {}

  const recordsByCol = {
    organizationExpenses: new Map(),
    organizationEntries: new Map(),
  }

  const emitMerged = () => {
    const deduped = new Map()
    // 1. Ingest mobile entries
    for (const [id, rec] of recordsByCol.organizationEntries.entries()) {
      deduped.set(id, rec)
    }
    // 2. Overlay / merge web expenses
    for (const [id, rec] of recordsByCol.organizationExpenses.entries()) {
      if (!deduped.has(id)) {
        deduped.set(id, rec)
      } else {
        const existing = deduped.get(id)
        if ((!existing.bills || existing.bills.length === 0) && (rec.bills && rec.bills.length > 0)) {
          deduped.set(id, rec)
        }
      }
    }

    const list = Array.from(deduped.values()).sort((a, b) => {
      const tA = a.date instanceof Date ? a.date.getTime() : (a.expenseDate?.seconds ? a.expenseDate.seconds * 1000 : 0)
      const tB = b.date instanceof Date ? b.date.getTime() : (b.expenseDate?.seconds ? b.expenseDate.seconds * 1000 : 0)
      return tB - tA
    })

    onData(list)
  }

  const unsubs = []
  for (const colName of ['organizationExpenses', 'organizationEntries']) {
    try {
      const colRef = collection(db, 'organisation', orgId, colName)
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          recordsByCol[colName].clear()
          snap.docs.forEach((d) => {
            const normalized = normalizeExpenseRecord(d.id, d.data(), 'Organization')
            if (normalized) {
              recordsByCol[colName].set(d.id, normalized)
            }
          })
          emitMerged()
        },
        (err) => {
          console.warn(`[subscribeOrganizationExpenses] error on ${colName}:`, err?.message)
          if (onError) onError(err)
        }
      )
      unsubs.push(unsub)
    } catch (e) {
      console.warn(`Could not listen to ${colName}:`, e)
    }
  }

  return () => {
    unsubs.forEach((u) => u && u())
  }
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
    bills.reduce((acc, b) => acc + (Number(b.amount || b.billAmount) || 0), 0) ||
    (Number(expenseData.totalAmount || expenseData.amount) || 0)

  const primaryBill = bills.find((b) => b.billUrl || b.imageUrl || b.billCopy) || {}
  const primaryBillUrl =
    expenseData.billUrl ||
    expenseData.imageUrl ||
    primaryBill.billUrl ||
    primaryBill.imageUrl ||
    primaryBill.billCopy ||
    null
  const primaryStoragePath =
    expenseData.storagePath || primaryBill.storagePath || null

  const normalizedBills = bills.map((b, idx) => ({
    billNo: b.billNo || (idx + 1).toString().padStart(3, '0'),
    billVendor: b.vendor || b.billVendor || 'Vendor',
    vendor: b.vendor || b.billVendor || 'Vendor',
    billAmount: Number(b.amount || b.billAmount) || 0,
    amount: Number(b.amount || b.billAmount) || 0,
    billCopy: b.billUrl || b.imageUrl || b.billCopy || 'billURL',
    billUrl: b.billUrl || b.imageUrl || b.billCopy || '',
    imageUrl: b.billUrl || b.imageUrl || b.billCopy || '',
    storagePath: b.storagePath || '',
    description: b.description || b.purpose || '',
  }))

  const payload = {
    expenseId,
    id: expenseId,
    siteId: expenseData.siteId,
    siteName: expenseData.siteName || '',
    projectName: expenseData.projectName || expenseData.siteName || '',
    projectStage: expenseData.projectStage || 'Central Administration',
    expenseDate: expenseData.expenseDate
      ? new Date(expenseData.expenseDate)
      : serverTimestamp(),
    entryDate: expenseData.expenseDate
      ? new Date(expenseData.expenseDate)
      : serverTimestamp(),
    date: expenseData.expenseDate || new Date().toISOString(),
    raiserId: orgActor?.id || orgActor?.uid || 'org_admin',
    raiserName:
      orgActor?.fullName ||
      orgActor?.name ||
      orgActor?.displayName ||
      'Organization Administrator',
    raiserRole: 'Organization',
    category: 'Organization Bill',
    bills: normalizedBills,
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

  // 2. Dual-sync to organizationEntries for existing mobile & reporting compatibility
  try {
    const entryRef = doc(db, 'organisation', orgId, 'organizationEntries', expenseId)
    await setDoc(entryRef, payload, { merge: true })
  } catch (err) {
    console.warn('Could not mirror to organizationEntries:', err)
  }

  // 3. Mirror summary for mobile expense summary screens
  try {
    const summaryRef = doc(db, 'organisation', orgId, 'organizationExpenseSummary', expenseId)
    await setDoc(summaryRef, {
      siteId: expenseData.siteId,
      projectName: payload.projectName,
      projectStage: payload.projectStage,
      orgExpenseTotalAmount: totalAmount,
      date: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {}

  // 4. Auto-update project site cumulative expenditure
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

  return normalizeExpenseRecord(expenseId, payload, 'Organization')
}

export async function deleteOrganizationExpense(orgId, expenseId) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'organizationExpenses', expenseId))
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'organizationEntries', expenseId))
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'organizationExpenseSummary', expenseId))
  } catch (e) {}
}
