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
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { normalizeExpenseRecord } from './expenseNormalizationService.js'
import { recalcTotalsAndSyncProject } from './expenseService.js'

/**
 * CST White Label - Manager Direct Expenses Service
 * Scoped under: /organisation/{orgId}/managerExpenses & managerEntries
 * Synchronizes mobile and web manager expense records in real-time.
 */

/**
 * Converts any Date or date string to ddMMyyyy (e.g. 28102026).
 * Matches Mobile App deterministic document ID: `${selectedSiteId}_${ddMMyyyy}`
 */
export function formatToDDMMYYYY(dateInput) {
  if (!dateInput) return ''
  let d
  if (dateInput instanceof Date) {
    d = dateInput
  } else if (typeof dateInput === 'string') {
    if (dateInput.includes('-')) {
      const parts = dateInput.split('-')
      if (parts.length === 3) {
        // Assume YYYY-MM-DD
        const year = parts[0]
        const month = parts[1].padStart(2, '0')
        const day = parts[2].padStart(2, '0')
        return `${day}${month}${year}`
      }
    }
    d = new Date(dateInput)
  } else if (dateInput?.seconds) {
    d = new Date(dateInput.seconds * 1000)
  } else {
    d = new Date(dateInput)
  }

  if (isNaN(d.getTime())) return ''
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
    rawSiteCode = String(input.siteCode || '').trim()
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
 * Generates the deterministic document ID for Manager Expenses in format:
 * ${siteId}_${projectName}_${ddMMyyyy} -> e.g. "ST001_newProject_28102026"
 * Ensures no project ID prefix (PR001_) is included.
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
export function generateManagerExpenseDocId(input) {
  let dateInput = null
  if (input && typeof input === 'object') {
    dateInput = input.expenseDate || input.date || input.entryDate || null
  }
  const canonicalSiteKey = resolveCanonicalSiteKey(input)
  const ddmmyyyy = formatToDDMMYYYY(dateInput || new Date())
  return `${canonicalSiteKey}_${ddmmyyyy}`
}

/**
 * Fetches existing manager expense record for a site on a specific date if already logged.
 * Reads from /organisation/{orgId}/managerExpenses/{ST001_newProject_ddMMyyyy}
 */
export async function fetchDayManagerExpense(orgId, siteId, dateInput, extraParams = {}) {
  if (!orgId || !siteId || !dateInput) return null
  const ddmmyyyy = formatToDDMMYYYY(dateInput)
  if (!ddmmyyyy) return null

  const canonicalSiteKey = resolveCanonicalSiteKey({ siteId, ...extraParams })
  const docId = `${canonicalSiteKey}_${ddmmyyyy}`

  try {
    const docRef = doc(db, 'organisation', orgId, 'managerExpenses', docId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return { id: snap.id, docId: snap.id, ...snap.data() }
    }
  } catch (err) {
    console.warn(`[fetchDayManagerExpense] Error checking day doc ${docId}:`, err?.message)
  }

  // Fallback: check if raw siteId_${ddmmyyyy} was used previously
  if (siteId && siteId !== canonicalSiteKey) {
    try {
      const rawDocId = `${siteId}_${ddmmyyyy}`
      const rawDocRef = doc(db, 'organisation', orgId, 'managerExpenses', rawDocId)
      const rawSnap = await getDoc(rawDocRef)
      if (rawSnap.exists()) {
        return { id: rawSnap.id, docId: rawSnap.id, ...rawSnap.data() }
      }
    } catch (_) {}
  }

  return null
}

export async function fetchManagerExpenses(orgId) {
  if (!orgId) return []
  const collectionsToRead = ['managerExpenses', 'managerEntries']
  const dedupedMap = new Map()

  for (const colName of collectionsToRead) {
    try {
      const snap = await getDocs(collection(db, 'organisation', orgId, colName))
      snap.docs.forEach((d) => {
        const normalized = normalizeExpenseRecord(d.id, d.data(), 'Manager')
        if (normalized) {
          if (!dedupedMap.has(d.id)) {
            dedupedMap.set(d.id, normalized)
          } else {
            const existing = dedupedMap.get(d.id)
            if ((!existing.bills || existing.bills.length === 0) && (normalized.bills && normalized.bills.length > 0)) {
              dedupedMap.set(d.id, normalized)
            }
          }
        }
      })
    } catch (err) {
      console.warn(`[fetchManagerExpenses] Could not read ${colName}:`, err?.message)
    }
  }

  return Array.from(dedupedMap.values()).sort((a, b) => {
    const tA = a.date instanceof Date ? a.date.getTime() : (a.expenseDate?.seconds ? a.expenseDate.seconds * 1000 : 0)
    const tB = b.date instanceof Date ? b.date.getTime() : (b.expenseDate?.seconds ? b.expenseDate.seconds * 1000 : 0)
    return tB - tA
  })
}

export function subscribeManagerExpenses(orgId, onData, onError) {
  if (!orgId) return () => {}

  const recordsByCol = {
    managerExpenses: new Map(),
    managerEntries: new Map(),
  }

  const emitMerged = () => {
    const deduped = new Map()
    for (const [id, rec] of recordsByCol.managerEntries.entries()) {
      deduped.set(id, rec)
    }
    for (const [id, rec] of recordsByCol.managerExpenses.entries()) {
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
  for (const colName of ['managerExpenses', 'managerEntries']) {
    try {
      const colRef = collection(db, 'organisation', orgId, colName)
      const unsub = onSnapshot(
        colRef,
        (snap) => {
          recordsByCol[colName].clear()
          snap.docs.forEach((d) => {
            const normalized = normalizeExpenseRecord(d.id, d.data(), 'Manager')
            if (normalized) {
              recordsByCol[colName].set(d.id, normalized)
            }
          })
          emitMerged()
        },
        (err) => {
          console.warn(`[subscribeManagerExpenses] error on ${colName}:`, err?.message)
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

export async function recordManagerExpense(orgId, expenseData, managerActor) {
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
  // e.g. ST001_newProject_28102026 (never includes PR001_ prefix)
  const docId =
    expenseData.expenseId ||
    generateManagerExpenseDocId({
      siteId: canonicalSiteKey,
      siteCode: expenseData.siteCode,
      projectName: expenseData.projectName,
      siteName: expenseData.siteName,
      expenseDate: expenseData.expenseDate || expenseData.date,
    })

  // Check if document already exists to merge bills (Mobile Section 2.6 step 3)
  const primaryDocRef = doc(db, 'organisation', orgId, 'managerExpenses', docId)
  let existingData = null
  let existingBills = []

  try {
    const existingSnap = await getDoc(primaryDocRef)
    if (existingSnap.exists()) {
      existingData = existingSnap.data()
      existingBills = Array.isArray(existingData.bills) ? existingData.bills : []
    }
  } catch (lookupErr) {
    console.warn(`[recordManagerExpense] Existing doc lookup note for ${docId}:`, lookupErr?.message)
  }

  const newBills = Array.isArray(expenseData.bills) ? expenseData.bills : []
  const managerId = managerActor?.id || managerActor?.uid || existingData?.managerId || 'mgr_lead'
  const managerName = managerActor?.fullName || managerActor?.FullName || managerActor?.name || managerActor?.displayName || existingData?.managerName || 'Operations Manager'
  const managerRole = managerActor?.userRole || managerActor?.role || 'Manager'

  const normalizedNewBills = newBills.map((b, idx) => {
    const amt = Number(b.amount || b.billAmount) || 0
    const billDocUrl = b.billUrl || b.imageUrl || b.billCopy || ''
    const billStoragePath = b.storagePath || ''
    const billDateVal = b.billDate
      ? (b.billDate instanceof Date ? b.billDate : (typeof b.billDate === 'string' ? new Date(b.billDate) : (b.billDate.seconds ? new Date(b.billDate.seconds * 1000) : new Date())))
      : (expenseData.expenseDate ? new Date(expenseData.expenseDate) : new Date())

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
      billAmount: amt,
      amount: amt,
      billCopy: billDocUrl || 'billURL',
      billUrl: billDocUrl,
      imageUrl: billDocUrl,
      storagePath: billStoragePath,
      billDate: billDateVal,
      description: b.description || b.purpose || '',
      raisedBy: managerId,
      raisedByName: managerName,
      userRole: managerRole,
      createdAt: new Date(),
    }
  })

  // Merge bills: [...existingBills, ...newBills]
  const allBills = [...existingBills, ...normalizedNewBills]
  const totalAmount = allBills.reduce((acc, b) => acc + (Number(b.billAmount || b.amount) || 0), 0) || (Number(expenseData.totalAmount || expenseData.amount) || 0)
  const hasNumericQty = allBills.some((b) => b.quantity !== null && b.quantity !== undefined && Number.isFinite(Number(b.quantity)))
  const totalQuantity = hasNumericQty
    ? allBills.reduce((acc, b) => acc + (typeof b.quantity === 'number' ? b.quantity : (Number(b.quantity) || 0)), 0)
    : (expenseData.quantity !== undefined && expenseData.quantity !== null && expenseData.quantity !== ''
        ? (Number.isFinite(Number(expenseData.quantity)) ? Number(expenseData.quantity) : expenseData.quantity)
        : (existingData?.quantity !== undefined ? existingData.quantity : null))

  const primaryBill = allBills.find((b) => b.billUrl || b.imageUrl || (b.billCopy && b.billCopy !== 'billURL')) || {}
  const primaryBillUrl = expenseData.billUrl || expenseData.imageUrl || primaryBill.billUrl || primaryBill.imageUrl || (primaryBill.billCopy !== 'billURL' ? primaryBill.billCopy : null) || null
  const primaryStoragePath = expenseData.storagePath || primaryBill.storagePath || null

  const resolvedDate = expenseData.expenseDate
    ? new Date(expenseData.expenseDate)
    : (existingData?.expenseDate ? (existingData.expenseDate.seconds ? new Date(existingData.expenseDate.seconds * 1000) : new Date(existingData.expenseDate)) : new Date())

  const payload = {
    expenseId: docId,
    id: docId,
    siteId: canonicalSiteKey,
    siteCode: expenseData.siteCode || canonicalSiteKey.split('_')[0] || '',
    siteName: expenseData.siteName || existingData?.siteName || '',
    projectName: expenseData.projectName || existingData?.projectName || expenseData.siteName || '',
    projectStage: expenseData.projectStage || existingData?.projectStage || 'Superstructure & RCC Slabs',
    projectCategory: expenseData.projectStage || existingData?.projectStage || 'Superstructure & RCC Slabs',
    supervisorName: expenseData.supervisorName || existingData?.supervisorName || expenseData.selectedSupervisorId || 'SUP_001',
    managerId,
    managerName,
    raisedBy: managerId,
    raisedByName: managerName,
    userRole: managerRole,
    raiserRole: managerRole,
    expenseDate: resolvedDate,
    entryDate: resolvedDate,
    date: expenseData.expenseDate || (typeof existingData?.date === 'string' ? existingData.date : new Date().toISOString()),
    bills: allBills,
    quantity: totalQuantity,
    qty: totalQuantity,
    totalAmount,
    amount: totalAmount,
    billUrl: primaryBillUrl,
    imageUrl: primaryBillUrl,
    storagePath: primaryStoragePath,
    remarks: expenseData.remarks || existingData?.remarks || '',
    status: 'recorded',
    createdAt: existingData?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // 1. Primary write to managerExpenses (docId: ST001_newProject_28102026)
  await setDoc(primaryDocRef, payload, { merge: true })

  // 2. Cross-platform mirror to managerEntries (docId: ST001_newProject_28102026)
  try {
    const entryRef = doc(db, 'organisation', orgId, 'managerEntries', docId)
    await setDoc(entryRef, payload, { merge: true })
  } catch (err) {
    console.warn('[recordManagerExpense] Could not mirror to managerEntries:', err?.message)
  }

  // 3. Daily Aggregate Summary to managerExpenseSummary (docId: ST001_newProject_28102026)
  try {
    const summaryRef = doc(db, 'organisation', orgId, 'managerExpenseSummary', docId)
    await setDoc(summaryRef, {
      siteId: canonicalSiteKey,
      projectName: payload.projectName,
      projectStage: payload.projectStage,
      managerExpenseTotalAmount: totalAmount,
      quantity: totalQuantity,
      managerId,
      managerName,
      date: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    console.warn('[recordManagerExpense] Could not write managerExpenseSummary:', err?.message)
  }

  // 4. Financial Rollup Engine: Recalculate totals and atomically sync project balance (Section 2.6 & Section 4)
  // In totalSiteExpensesPerDay collection, the document ID format remains exactly canonicalSiteKey: "ST001_newProject"
  try {
    await recalcTotalsAndSyncProject(orgId, canonicalSiteKey)
  } catch (syncErr) {
    console.warn('[recordManagerExpense] recalcTotalsAndSyncProject warning:', syncErr?.message)
  }

  return normalizeExpenseRecord(docId, payload, 'Manager')
}

export async function deleteManagerExpense(orgId, expenseId, siteId = null) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')

  let targetSiteId = siteId
  if (!targetSiteId) {
    try {
      const snap = await getDoc(doc(db, 'organisation', orgId, 'managerExpenses', expenseId))
      if (snap.exists()) {
        targetSiteId = snap.data().siteId
      }
    } catch (_) {}
  }

  // Resolve canonical site key (ST001_newProject) so totalSiteExpensesPerDay is updated with ST001_newProject
  const canonicalSiteKey = targetSiteId ? resolveCanonicalSiteKey(targetSiteId) : null

  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'managerExpenses', expenseId))
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'managerEntries', expenseId))
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'organisation', orgId, 'managerExpenseSummary', expenseId))
  } catch (e) {}

  if (canonicalSiteKey) {
    try {
      await recalcTotalsAndSyncProject(orgId, canonicalSiteKey)
    } catch (e) {
      console.warn('[deleteManagerExpense] recalcTotalsAndSyncProject warning:', e?.message)
    }
  }
}

