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
import { recalcTotalsAndSyncProject } from './expenseService.js'
import { isNewOrganization, isNewOrganizationSync } from './schemaResolverService.js'

/**
 * CST White Label / eBricks - Organization Direct Expenses Service
 * Scoped under: /organisation/{orgId}/organizationExpenses & organizationEntries
 * Fully synchronizes mobile and web expense records in real-time.
 */

/**
 * Converts any Date or date string to ddMMyyyy (e.g. 28102026).
 * Matches Mobile App deterministic document ID: `${selectedSiteId}_${ddMMyyyy}`
 */
export function formatToDDMMYYYY(dateInput) {
  if (!dateInput) return ''
  let d = null
  if (dateInput instanceof Date) {
    d = dateInput
  } else if (typeof dateInput === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
      const [y, m, day] = dateInput.split('T')[0].split('-').map(Number)
      d = new Date(y, m - 1, day)
    } else {
      d = new Date(dateInput)
    }
  } else if (dateInput && typeof dateInput === 'object') {
    if (typeof dateInput.toDate === 'function') {
      d = dateInput.toDate()
    } else if (typeof dateInput.seconds === 'number') {
      d = new Date(dateInput.seconds * 1000)
    }
  }
  if (!d || isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear())
  return `${day}${month}${year}`
}

/**
 * Resolves the canonical site key without project prefix (format: ST001_newProject).
 * Strips any "PR001_" or project prefix while preserving "ST001_projectName".
 *
 * @param {Object|string} input - Either siteId string or object { siteId, siteCode, projectName, siteName }
 * @returns {string} Canonical site key, e.g. "ST001_newProject"
 */
export function resolveCanonicalSiteKey(input) {
  let rawSiteId = ''
  let rawSiteCode = ''
  let rawProjectName = ''
  let rawSiteName = ''

  if (typeof input === 'string') {
    rawSiteId = input.trim()
  } else if (input && typeof input === 'object') {
    rawSiteId = String(input.siteId || input.id || '').trim()
    rawSiteCode = String(input.siteCode || input.code || '').trim()
    rawProjectName = String(input.projectName || '').trim()
    rawSiteName = String(input.siteName || '').trim()
  }

  const cleanProjectName = (rawProjectName || rawSiteName || '').replace(/\s+/g, '')

  // 1. If rawSiteId has compound parts
  if (rawSiteId.includes('_')) {
    const parts = rawSiteId.split('_').filter(Boolean)

    // Strip trailing 8-digit date stamp if accidentally included (e.g. 28102026)
    if (parts.length >= 2 && /^\d{8}$/.test(parts[parts.length - 1])) {
      parts.pop()
    }

    // If starts with PR prefix (e.g. ['PR001', 'ST001', 'newProject'])
    if (parts.length >= 3 && /^PR\d+/i.test(parts[0])) {
      const codePart = /^ST/i.test(parts[1]) ? parts[1] : (rawSiteCode || `ST${parts[0].replace(/^PR/i, '')}`)
      const namePart = parts.slice(2).join('_')
      return `${codePart}_${namePart}`
    }

    // If it's PR001_newProject (only 2 parts, first is PR)
    if (parts.length === 2 && /^PR\d+/i.test(parts[0])) {
      const codePart = rawSiteCode || `ST${parts[0].replace(/^PR/i, '')}`
      return `${codePart}_${parts[1]}`
    }

    // If it's already ST001_newProject (no PR prefix)
    if (!/^PR\d+/i.test(parts[0])) {
      return parts.join('_')
    }
  }

  // 2. If rawSiteId is just a code like "ST001" or we have siteCode & projectName
  const code = rawSiteCode || (rawSiteId && !rawSiteId.includes('_') ? (rawSiteId.toUpperCase().startsWith('PR') ? `ST${rawSiteId.substring(2)}` : rawSiteId) : 'ST001')
  if (cleanProjectName) {
    return `${code}_${cleanProjectName}`
  }

  return rawSiteId || code
}

/**
 * Generates the deterministic document ID for Organization Expenses in format:
 * ${siteId}_${projectName}_${ddMMyyyy} -> e.g. "ST001_newProject_28102026"
 * Ensures no project ID prefix (PR001_) or OEXP_ timestamp is included.
 *
 * @param {Object} params
 * @param {string} [params.siteId] - e.g. "ST001" or "PR001_ST001_newProject" or "ST001_newProject"
 * @param {string} [params.siteCode] - e.g. "ST001"
 * @param {string} [params.projectName] - e.g. "newProject"
 * @param {string} [params.siteName] - e.g. "newProject"
 * @param {Date|string|Object} [params.expenseDate] - Expense date
 * @param {Date|string|Object} [params.date] - Alternate date
 * @returns {string} e.g. "ST001_newProject_28102026"
 */
export function generateOrganizationExpenseDocId(input) {
  let dateInput = null
  if (input && typeof input === 'object') {
    dateInput = input.expenseDate || input.date || input.entryDate || null
  }
  const canonicalSiteKey = resolveCanonicalSiteKey(input)
  const ddmmyyyy = formatToDDMMYYYY(dateInput || new Date())
  return `${canonicalSiteKey}_${ddmmyyyy}`
}

export async function fetchOrganizationExpenses(orgId) {
  if (!orgId) return []
  const isNewOrg = await isNewOrganization(orgId)
  const collectionsToRead = isNewOrg ? ['organizationExpenses'] : ['organizationExpenses', 'organizationEntries']
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

  const isNewOrg = isNewOrganizationSync(orgId)
  const collectionsToListen = isNewOrg ? ['organizationExpenses'] : ['organizationExpenses', 'organizationEntries']

  const recordsByCol = {}
  collectionsToListen.forEach((col) => {
    recordsByCol[col] = new Map()
  })

  const emitMerged = () => {
    const deduped = new Map()
    // 1. Ingest mobile entries as base/fallback (if applicable for legacy orgs)
    if (recordsByCol.organizationEntries) {
      for (const [id, rec] of recordsByCol.organizationEntries.entries()) {
        deduped.set(id, rec)
      }
    }
    // 2. Overlay / merge primary organizationExpenses (authoritative source)
    if (recordsByCol.organizationExpenses) {
      for (const [id, rec] of recordsByCol.organizationExpenses.entries()) {
        deduped.set(id, rec)
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
  for (const colName of collectionsToListen) {
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

  // Resolve canonical site key without project ID prefix (e.g. ST001_newProject)
  const canonicalSiteKey = resolveCanonicalSiteKey({
    siteId: expenseData.siteId,
    siteCode: expenseData.siteCode,
    projectName: expenseData.projectName,
    siteName: expenseData.siteName,
  })

  // Calculate deterministic Document ID matching: ${siteId}_${projectName}_${ddMMyyyy}
  // e.g. ST001_newProject_28102026 (never includes OEXP_, timestamp, random suffix, or PR001_ prefix)
  const expenseId =
    expenseData.expenseId ||
    generateOrganizationExpenseDocId({
      siteId: canonicalSiteKey,
      siteCode: expenseData.siteCode,
      projectName: expenseData.projectName,
      siteName: expenseData.siteName,
      expenseDate: expenseData.expenseDate || expenseData.date,
    })

  // Check if document already exists to merge bills and prevent silent overwrite (Constraint 7)
  const primaryDocRef = doc(db, 'organisation', orgId, 'organizationExpenses', expenseId)
  let existingData = null
  let existingBills = []

  try {
    const existingSnap = await getDoc(primaryDocRef)
    if (existingSnap.exists()) {
      existingData = existingSnap.data()
      existingBills = Array.isArray(existingData.bills) ? existingData.bills : []
    }
  } catch (lookupErr) {
    console.warn(`[recordOrganizationExpense] Existing doc lookup note for ${expenseId}:`, lookupErr?.message)
  }

  const bills = Array.isArray(expenseData.bills) ? expenseData.bills : []
  const raiserId = orgActor?.id || orgActor?.uid || existingData?.raiserId || 'org_admin'
  const raiserName =
    orgActor?.fullName ||
    orgActor?.name ||
    orgActor?.displayName ||
    existingData?.raiserName ||
    'Organization Administrator'
  const raiserRole = orgActor?.userRole || orgActor?.role || existingData?.raiserRole || 'Organization'

  const normalizedNewBills = bills.map((b, idx) => {
    const rawQty = b.quantity !== undefined ? b.quantity : (b.qty !== undefined ? b.qty : (b.billQuantity !== undefined ? b.billQuantity : null))
    const parsedQty = rawQty !== null && rawQty !== undefined && rawQty !== ''
      ? (Number.isFinite(Number(rawQty)) ? Number(rawQty) : rawQty)
      : null

    return {
      billNo: b.billNo || (existingBills.length + idx + 1).toString().padStart(3, '0'),
      billVendor: b.vendor || b.billVendor || 'Vendor',
      vendor: b.vendor || b.billVendor || 'Vendor',
      quantity: parsedQty,
      qty: parsedQty,
      billAmount: Number(b.amount || b.billAmount) || 0,
      amount: Number(b.amount || b.billAmount) || 0,
      billCopy: b.billUrl || b.imageUrl || b.billCopy || 'billURL',
      billUrl: b.billUrl || b.imageUrl || b.billCopy || '',
      imageUrl: b.billUrl || b.imageUrl || b.billCopy || '',
      storagePath: b.storagePath || '',
      description: b.description || b.purpose || '',
      raisedBy: raiserId,
      raisedByName: raiserName,
      userRole: raiserRole,
      createdAt: new Date(),
    }
  })

  // Merge bills: [...existingBills, ...normalizedNewBills]
  const allBills = [...existingBills, ...normalizedNewBills]
  const totalAmount =
    allBills.reduce((acc, b) => acc + (Number(b.amount || b.billAmount) || 0), 0) ||
    (Number(expenseData.totalAmount || expenseData.amount) || 0)
  const hasNumericQty = allBills.some((b) => b.quantity !== null && b.quantity !== undefined && Number.isFinite(Number(b.quantity)))
  const totalQuantity = hasNumericQty
    ? allBills.reduce((acc, b) => acc + (typeof b.quantity === 'number' ? b.quantity : (Number(b.quantity) || 0)), 0)
    : (expenseData.quantity !== undefined && expenseData.quantity !== null && expenseData.quantity !== ''
        ? (Number.isFinite(Number(expenseData.quantity)) ? Number(expenseData.quantity) : expenseData.quantity)
        : (existingData?.quantity !== undefined ? existingData.quantity : null))

  const primaryBill = allBills.find((b) => b.billUrl || b.imageUrl || b.billCopy) || {}
  const primaryBillUrl =
    expenseData.billUrl ||
    expenseData.imageUrl ||
    primaryBill.billUrl ||
    primaryBill.imageUrl ||
    primaryBill.billCopy ||
    null
  const primaryStoragePath =
    expenseData.storagePath || primaryBill.storagePath || null

  const remarks = existingData?.remarks
    ? (expenseData.remarks && !existingData.remarks.includes(expenseData.remarks)
        ? `${existingData.remarks} | ${expenseData.remarks}`
        : existingData.remarks)
    : (expenseData.remarks || '')

  const payload = {
    expenseId,
    id: expenseId,
    siteId: canonicalSiteKey,
    rawSiteId: expenseData.siteId,
    siteName: expenseData.siteName || existingData?.siteName || '',
    projectName: expenseData.projectName || expenseData.siteName || existingData?.projectName || '',
    projectStage: expenseData.projectStage || existingData?.projectStage || 'Central Administration',
    expenseDate: expenseData.expenseDate
      ? new Date(expenseData.expenseDate)
      : (existingData?.expenseDate || serverTimestamp()),
    entryDate: expenseData.expenseDate
      ? new Date(expenseData.expenseDate)
      : (existingData?.entryDate || serverTimestamp()),
    date: expenseData.expenseDate || existingData?.date || new Date().toISOString(),
    raiserId,
    raiserName,
    raiserRole,
    category: 'Organization Bill',
    bills: allBills,
    quantity: totalQuantity,
    qty: totalQuantity,
    totalAmount,
    amount: totalAmount,
    billUrl: primaryBillUrl,
    imageUrl: primaryBillUrl,
    storagePath: primaryStoragePath,
    remarks,
    status: 'recorded',
    createdAt: existingData?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // 1. Primary write to organizationExpenses (Authoritative source for all users)
  await setDoc(primaryDocRef, payload)

  // 2. Dual-sync to legacy collections ONLY for existing organizations (Preserves 100% backward compatibility)
  const isNewOrg = await isNewOrganization(orgId)
  if (!isNewOrg) {
    try {
      const entryRef = doc(db, 'organisation', orgId, 'organizationEntries', expenseId)
      await setDoc(entryRef, payload, { merge: true })
    } catch (err) {
      console.warn('Could not mirror to organizationEntries:', err)
    }

    try {
      const summaryRef = doc(db, 'organisation', orgId, 'organizationExpenseSummary', expenseId)
      await setDoc(summaryRef, {
        siteId: canonicalSiteKey,
        projectName: payload.projectName,
        projectStage: payload.projectStage,
        orgExpenseTotalAmount: totalAmount,
        quantity: totalQuantity,
        date: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (err) {}
  }

  // 4. Auto-update project site cumulative expenditure (delta only if existing)
  const previousDocAmount = Number(existingData?.totalAmount || existingData?.amount || 0)
  const deltaSpent = totalAmount - previousDocAmount

  try {
    const targetSiteId = expenseData.siteId
    const siteRef = doc(db, 'organisation', orgId, 'projects', targetSiteId)
    const siteSnap = await getDoc(siteRef)
    if (siteSnap.exists()) {
      const currentSpent = Number(
        siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0
      )
      const nextSpent = currentSpent + deltaSpent
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

  // 5. Sync totalSiteExpensesPerDay with STRICT format ST001_newProject (no date appended)
  try {
    await recalcTotalsAndSyncProject(orgId, canonicalSiteKey)
  } catch (syncErr) {
    console.warn('[recordOrganizationExpense] recalcTotalsAndSyncProject warning:', syncErr?.message)
  }

  return normalizeExpenseRecord(expenseId, payload, 'Organization')
}

export async function deleteOrganizationExpense(orgId, expenseId, siteId = null) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')

  let targetSiteId = siteId
  let expenseAmount = 0

  try {
    const snap = await getDoc(doc(db, 'organisation', orgId, 'organizationExpenses', expenseId))
    if (snap.exists()) {
      const data = snap.data()
      if (!targetSiteId) targetSiteId = data.siteId || data.rawSiteId
      expenseAmount = Number(data.totalAmount || data.amount || 0)
    }
  } catch (_) {}

  const canonicalSiteKey = targetSiteId ? resolveCanonicalSiteKey(targetSiteId) : null
  const isNewOrg = await isNewOrganization(orgId)

  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'organizationExpenses', expenseId))
  } catch (e) {}

  if (!isNewOrg) {
    try {
      await deleteDoc(doc(db, 'organisation', orgId, 'organizationEntries', expenseId))
    } catch (e) {}
    try {
      await deleteDoc(doc(db, 'organisation', orgId, 'organizationExpenseSummary', expenseId))
    } catch (e) {}
  }

  // Adjust site cumulative expenditure
  if (targetSiteId && expenseAmount > 0) {
    try {
      const siteRef = doc(db, 'organisation', orgId, 'projects', targetSiteId)
      const siteSnap = await getDoc(siteRef)
      if (siteSnap.exists()) {
        const currentSpent = Number(
          siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0
        )
        const nextSpent = Math.max(0, currentSpent - expenseAmount)
        await updateDoc(siteRef, {
          totalAmountSpent: nextSpent,
          spentAmount: nextSpent,
          amountSpent: nextSpent,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (_) {}
  }

  // Re-sync totalSiteExpensesPerDay under ST001_newProject
  if (canonicalSiteKey) {
    try {
      await recalcTotalsAndSyncProject(orgId, canonicalSiteKey)
    } catch (_) {}
  }
}

/**
 * Deletes a single bill entry from an organization expense document.
 * If the document only contains this 1 bill, deletes the entire document.
 */
export async function deleteOrganizationExpenseBill(orgId, expenseId, billIdOrIndex, siteId = null) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')

  const docRef = doc(db, 'organisation', orgId, 'organizationExpenses', expenseId)
  let existingData = null
  try {
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      existingData = snap.data()
    }
  } catch (err) {
    console.warn(`[deleteOrganizationExpenseBill] Doc lookup error:`, err?.message)
  }

  if (!existingData) {
    return deleteOrganizationExpense(orgId, expenseId, siteId)
  }

  const bills = Array.isArray(existingData.bills) ? [...existingData.bills] : []

  // If doc only has 1 bill or none, delete whole document
  if (bills.length <= 1) {
    return deleteOrganizationExpense(
      orgId,
      expenseId,
      siteId || existingData.siteId || existingData.rawSiteId
    )
  }

  // Find index of bill to remove
  let removeIndex = -1
  if (typeof billIdOrIndex === 'number') {
    removeIndex = billIdOrIndex
  } else if (typeof billIdOrIndex === 'string') {
    removeIndex = bills.findIndex(
      (b, idx) =>
        b.id === billIdOrIndex ||
        b.billNo === billIdOrIndex ||
        `bill_${idx}` === billIdOrIndex
    )
  }

  if (removeIndex < 0 || removeIndex >= bills.length) {
    return deleteOrganizationExpense(
      orgId,
      expenseId,
      siteId || existingData.siteId || existingData.rawSiteId
    )
  }

  const removedBill = bills[removeIndex]
  const removedAmount = Number(removedBill.amount || removedBill.billAmount || 0)
  bills.splice(removeIndex, 1)

  const newTotal = bills.reduce(
    (acc, b) => acc + (Number(b.amount || b.billAmount) || 0),
    0
  )

  const primaryBill = bills.find((b) => b.billUrl || b.imageUrl || b.billCopy) || {}
  const primaryBillUrl =
    primaryBill.billUrl || primaryBill.imageUrl || primaryBill.billCopy || null

  const updatedPayload = {
    bills,
    totalAmount: newTotal,
    amount: newTotal,
    billUrl: primaryBillUrl,
    imageUrl: primaryBillUrl,
    updatedAt: serverTimestamp(),
  }

  await updateDoc(docRef, updatedPayload)

  // Mirror to legacy collections ONLY for existing organizations
  const isNewOrg = await isNewOrganization(orgId)
  if (!isNewOrg) {
    try {
      const entryRef = doc(db, 'organisation', orgId, 'organizationEntries', expenseId)
      await updateDoc(entryRef, updatedPayload)
    } catch (_) {}

    try {
      const summaryRef = doc(db, 'organisation', orgId, 'organizationExpenseSummary', expenseId)
      await updateDoc(summaryRef, {
        orgExpenseTotalAmount: newTotal,
        updatedAt: serverTimestamp(),
      })
    } catch (_) {}
  }

  // Adjust site cumulative expenditure
  const targetSiteId = siteId || existingData.rawSiteId || existingData.siteId
  if (targetSiteId && removedAmount > 0) {
    try {
      const siteRef = doc(db, 'organisation', orgId, 'projects', targetSiteId)
      const siteSnap = await getDoc(siteRef)
      if (siteSnap.exists()) {
        const currentSpent = Number(
          siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0
        )
        const nextSpent = Math.max(0, currentSpent - removedAmount)
        await updateDoc(siteRef, {
          totalAmountSpent: nextSpent,
          spentAmount: nextSpent,
          amountSpent: nextSpent,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (_) {}
  }

  const canonicalSiteKey = targetSiteId ? resolveCanonicalSiteKey(targetSiteId) : null
  if (canonicalSiteKey) {
    try {
      await recalcTotalsAndSyncProject(orgId, canonicalSiteKey)
    } catch (_) {}
  }
}

