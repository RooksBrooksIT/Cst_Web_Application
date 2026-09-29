import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  saveStandardDoc,
  updateStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Daily Site Progress Diary & Expenditures (siteSupervisorEntries)
 * Complies with Section 3.4, Section 4 Flow 3 & Section 5.3 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const WEATHER_TYPES = ['Sunny / Clear Sky', 'Cloudy / Overcast', 'Rainy / Wet Conditions', 'High Winds / Storm']

export async function fetchDailySiteEntries(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteSupervisorEntries')
}

export function subscribeDailySiteEntries(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteSupervisorEntries', onData, onError)
}

export function formatDDMMYYYY(dateInput) {
  if (!dateInput) return ''
  let d = dateInput
  if (dateInput.seconds) {
    d = new Date(dateInput.seconds * 1000)
  } else if (!(dateInput instanceof Date)) {
    d = new Date(dateInput)
  }
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}${mm}${yyyy}`
}

/**
 * Calculates sum of materials, labours, and site sundries, saves to siteSupervisorEntries,
 * and updates cumulative project spent in projects.
 * Complies with eBricks_Manager_Daily_Site_Entry_Flow_and_Backend_Structure.txt Section 3
 */
export async function createDailySiteEntry(orgId, entryData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!entryData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const cleanSiteCode = (entryData.siteCode || '').trim()
  const entryDateObj = entryData.date ? new Date(entryData.date) : new Date()
  const ddMMyyyy = formatDDMMYYYY(entryDateObj)
  const canonicalDocId = cleanSiteCode && ddMMyyyy ? `${cleanSiteCode}_${ddMMyyyy}` : `ENTRY_${timestamp}_${Math.random().toString(36).substring(2, 6)}`
  const entryId = entryData.entryId || canonicalDocId

  // Calculate costs and format materials & labour lists
  const rawMaterials = Array.isArray(entryData.materials) ? entryData.materials : []
  const rawLabours = Array.isArray(entryData.labours) ? entryData.labours : []

  const materials = rawMaterials.map((m) => {
    const qty = Number(m.quantity ?? m.qty ?? 0)
    const price = Number(m.unitPrice ?? m.price ?? 0)
    const amount = Number(m.amount ?? m.total ?? (qty * price)) || 0
    const name = m.materialName || m.type || m.name || ''
    return {
      type: name,
      materialName: name,
      name,
      quantity: qty,
      qty,
      unit: m.unit || 'Units',
      category: m.category || 'General',
      unitPrice: price,
      price,
      amount,
      total: amount,
    }
  })

  const labours = rawLabours.map((l) => {
    const count = Number(l.count ?? l.qty ?? 0)
    const salary = Number(l.salary ?? l.unitSalary ?? l.wage ?? 0)
    const amount = Number(l.amount ?? l.total ?? (count * salary)) || 0
    const trade = l.trade || l.type || l.category || ''
    return {
      type: trade,
      trade,
      category: trade,
      count,
      qty: count,
      salary,
      unitSalary: salary,
      wage: salary,
      amount,
      total: amount,
    }
  })

  const materialsCost = materials.reduce((acc, m) => acc + (Number(m.total) || 0), 0)
  const labourCost = labours.reduce((acc, l) => acc + (Number(l.total) || 0), 0)
  const foodCost = Number(entryData.food ?? entryData.foodCost ?? entryData.expenses?.foodCost) || 0
  const transportCost = Number(entryData.transport ?? entryData.transportCost ?? entryData.expenses?.transportCost) || 0
  const fuelCost = Number(entryData.fuel ?? entryData.fuelCost ?? entryData.expenses?.fuelCost) || 0
  const totalExpense = foodCost + transportCost + fuelCost
  const totalAmount = materialsCost + labourCost + totalExpense

  const actorName = actor?.name || actor?.displayName || actor?.fullName || 'Operations Manager'
  const actorRole = actor?.role || 'manager'

  const payload = {
    entryId,
    id: entryId,
    siteId: entryData.siteId,
    siteCode: entryData.siteCode || '',
    siteLocation: entryData.siteLocation || entryData.location || '',
    location: entryData.location || entryData.siteLocation || '',
    projectName: entryData.projectName || entryData.siteName || '',
    siteName: entryData.siteName || entryData.projectName || '',
    projectStage: entryData.projectStage || entryData.stage || 'Foundation Stage',
    stage: entryData.projectStage || entryData.stage || 'Foundation Stage',
    supervisorId: entryData.supervisorId || actor?.id || 'SUP_DEFAULT',
    supervisorName: entryData.supervisorName || entryData.supervisor || actorName,
    supervisor: entryData.supervisor || entryData.supervisorName || actorName,
    date: entryData.date ? (typeof entryData.date === 'string' ? entryData.date : new Date(entryData.date).toISOString()) : new Date().toISOString(),
    materials,
    labours,
    materialsCost,
    labourCost,
    food: foodCost,
    transport: transportCost,
    fuel: fuelCost,
    expenses: {
      foodCost,
      transportCost,
      fuelCost,
      totalExpense,
    },
    foodCost,
    transportCost,
    fuelCost,
    totalAmount,
    morningStatus: entryData.morningStatus || '',
    afternoonStatus: entryData.afternoonStatus || '',
    workDoneSummary: `${entryData.morningStatus || ''} ${entryData.afternoonStatus || ''}`.trim() || 'Daily site progress logged.',
    weather: entryData.weather || 'Sunny / Clear Sky',
    status: entryData.status || 'pending_manager_review',
    fundedViaPettyCash: Boolean(entryData.fundedViaPettyCash),
    pettyCashRequestId: entryData.pettyCashRequestId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: entryData.supervisorName || actorName,
    lastUpdatedBy: actorName,
    lastUpdatedByRole: actorRole,
  }

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  await setDoc(docRef, payload)

  // Auto-sync cumulative financials to project site
  try {
    const siteRef = doc(db, 'organisation', orgId, 'projects', entryData.siteId)
    const siteSnap = await getDoc(siteRef)
    if (siteSnap.exists()) {
      const currentSpent = Number(siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0)
      const nextSpent = currentSpent + totalAmount
      await updateDoc(siteRef, {
        totalAmountSpent: nextSpent,
        spentAmount: nextSpent,
        amountSpent: nextSpent,
        totalSiteExpense: nextSpent,
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('Could not auto-sync cumulative spent to site:', err)
  }

  // Auto-sync to totalSiteExpensesPerDay
  try {
    const expRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', entryData.siteId)
    const expSnap = await getDoc(expRef)
    if (expSnap.exists()) {
      const curSite = Number(expSnap.data().totalSiteExpense || 0)
      const curAll = Number(expSnap.data().totalAllExpenses || 0)
      await updateDoc(expRef, {
        totalSiteExpense: curSite + totalAmount,
        totalAllExpenses: curAll + totalAmount,
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {}

  return { id: entryId, ...payload }
}

// ------------------------------------------------------------------------------------------------
// LEGACY BACKWARD COMPATIBILITY
// ------------------------------------------------------------------------------------------------

export async function fetchDailySiteLogs(orgId) {
  return fetchDailySiteEntries(orgId)
}

export function subscribeDailySiteLogs(orgId, onData, onError) {
  return subscribeDailySiteEntries(orgId, onData, onError)
}

export async function createDailySiteLog(orgId, logData) {
  return createDailySiteEntry(orgId, logData, { id: logData.supervisorUid, name: logData.supervisorName })
}

export async function reviewDailySiteLog(orgId, logId, managerName, reviewNotes = '') {
  const entryRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', logId)
  await updateDoc(entryRef, {
    managerReviewed: true,
    reviewedBy: managerName,
    reviewNotes,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Updates an existing Daily Site Entry record in Firestore.
 * Preserves existing supervisor fields unless explicitly modified.
 * Modifies the same existing document in place (no duplicate record/collection created).
 * Synchronizes financial adjustments to project site and expense accumulator.
 */
export async function updateDailySiteEntry(orgId, entryId, updateData, actor, previousEntry = {}) {
  if (!orgId) throw new Error('orgId is required')
  if (!entryId) throw new Error('entryId is required')

  // Find exact collection where document exists (siteSupervisorEntries or fallback alias)
  let targetCollection = 'siteSupervisorEntries'
  const primaryRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  const primarySnap = await getDoc(primaryRef)

  if (!primarySnap.exists()) {
    // Check fallback aliases
    const aliases = ['daily_site_logs', 'site_logs', 'daily_logs']
    for (const alias of aliases) {
      const aliasRef = doc(db, 'organisation', orgId, alias, entryId)
      const aliasSnap = await getDoc(aliasRef)
      if (aliasSnap.exists()) {
        targetCollection = alias
        break
      }
    }
  }

  const targetDocRef = doc(db, 'organisation', orgId, targetCollection, entryId)

  const rawMaterials = Array.isArray(updateData.materials) ? updateData.materials : []
  const rawLabours = Array.isArray(updateData.labours) ? updateData.labours : []

  const materials = rawMaterials.map((m) => {
    const qty = Number(m.quantity ?? m.qty ?? 0)
    const price = Number(m.unitPrice ?? m.price ?? 0)
    const amount = Number(m.amount ?? m.total ?? (qty * price)) || 0
    const name = m.materialName || m.type || m.name || ''
    return {
      type: name,
      materialName: name,
      name,
      quantity: qty,
      qty,
      unit: m.unit || 'Units',
      category: m.category || 'General',
      unitPrice: price,
      price,
      amount,
      total: amount,
    }
  })

  const labours = rawLabours.map((l) => {
    const count = Number(l.count ?? l.qty ?? 0)
    const salary = Number(l.salary ?? l.unitSalary ?? l.wage ?? 0)
    const amount = Number(l.amount ?? l.total ?? (count * salary)) || 0
    const trade = l.trade || l.type || l.category || ''
    return {
      type: trade,
      trade,
      category: trade,
      count,
      qty: count,
      salary,
      unitSalary: salary,
      wage: salary,
      amount,
      total: amount,
    }
  })

  const materialsCost = materials.reduce((acc, m) => acc + (Number(m.total) || 0), 0)
  const labourCost = labours.reduce((acc, l) => acc + (Number(l.total) || 0), 0)
  const foodCost = Number(updateData.food ?? updateData.foodCost ?? updateData.expenses?.foodCost) || 0
  const transportCost = Number(updateData.transport ?? updateData.transportCost ?? updateData.expenses?.transportCost) || 0
  const fuelCost = Number(updateData.fuel ?? updateData.fuelCost ?? updateData.expenses?.fuelCost) || 0
  const totalExpense = foodCost + transportCost + fuelCost
  const totalAmount = materialsCost + labourCost + totalExpense

  const prevTotal = Number(
    previousEntry.totalAmount ??
      (Number(previousEntry.materialsCost || 0) +
        Number(previousEntry.labourCost || 0) +
        Number(previousEntry.foodCost || previousEntry.food || 0) +
        Number(previousEntry.transportCost || previousEntry.transport || 0) +
        Number(previousEntry.fuelCost || previousEntry.fuel || 0))
  )
  const diff = totalAmount - prevTotal

  // Format date if provided
  let updatedDate = previousEntry.date
  if (updateData.date) {
    updatedDate = typeof updateData.date === 'string' ? updateData.date : new Date(updateData.date).toISOString()
  }

  const actorName = actor?.name || actor?.displayName || actor?.fullName || 'Operations Manager'
  const actorRole = actor?.role || 'manager'

  // Build clean payload updating only relevant fields, preserving everything else
  const payload = {
    ...(updateData.siteId && { siteId: updateData.siteId }),
    ...(updateData.siteName && { siteName: updateData.siteName }),
    ...(updateData.siteCode && { siteCode: updateData.siteCode }),
    ...(updateData.projectName && { projectName: updateData.projectName }),
    ...(updateData.siteLocation && { siteLocation: updateData.siteLocation, location: updateData.siteLocation }),
    ...(updateData.projectStage && {
      projectStage: updateData.projectStage,
      stage: updateData.projectStage,
    }),
    ...(updateData.weather && { weather: updateData.weather }),
    morningStatus: updateData.morningStatus ?? (previousEntry.morningStatus || ''),
    afternoonStatus: updateData.afternoonStatus ?? (previousEntry.afternoonStatus || ''),
    workDoneSummary:
      `${updateData.morningStatus || ''} ${updateData.afternoonStatus || ''}`.trim() ||
      previousEntry.workDoneSummary ||
      'Daily site progress logged.',
    materials,
    labours,
    materialsCost,
    labourCost,
    food: foodCost,
    transport: transportCost,
    fuel: fuelCost,
    expenses: {
      foodCost,
      transportCost,
      fuelCost,
      totalExpense,
    },
    foodCost,
    transportCost,
    fuelCost,
    totalAmount,
    date: updatedDate,
    managerEdited: true,
    editedByManagerId: actor?.id || actor?.uid || actor?.managerId || 'mgr_lead',
    editedByManagerName: actorName,
    lastUpdatedBy: actorName,
    lastUpdatedByRole: actorRole,
    editedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // Update existing document in place
  await updateDoc(targetDocRef, payload)

  // Stage actuals synchronization (eBricks spec Section 3.C.3)
  try {
    const cleanSup = (previousEntry.supervisorName || previousEntry.supervisor || '').trim()
    const cleanStage = (updateData.projectStage || previousEntry.projectStage || previousEntry.stage || '').trim()
    const cleanCode = (updateData.siteCode || previousEntry.siteCode || '').trim()
    if (cleanCode && cleanSup && cleanStage && diff !== 0) {
      const stageActualId = `${cleanCode}_${cleanSup}_${cleanStage}`
      const stageRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageActual', stageActualId)
      const stageSnap = await getDoc(stageRef)
      if (stageSnap.exists()) {
        const curAct = Number(stageSnap.data().actPayment || 0)
        await updateDoc(stageRef, {
          actPayment: Math.max(0, curAct + diff),
          updatedAt: serverTimestamp(),
        })
      }
    }
  } catch (err) {
    console.warn('Could not sync stage actuals:', err)
  }

  // Handle site change or cumulative cost sync
  const oldSiteId = previousEntry.siteId
  const newSiteId = updateData.siteId || previousEntry.siteId

  if (oldSiteId && newSiteId && oldSiteId !== newSiteId) {
    // Deduct old total from old site
    try {
      const oldSiteRef = doc(db, 'organisation', orgId, 'projects', oldSiteId)
      const oldSiteSnap = await getDoc(oldSiteRef)
      if (oldSiteSnap.exists()) {
        const curSpent = Number(oldSiteSnap.data().totalAmountSpent || oldSiteSnap.data().spentAmount || 0)
        const nextSpent = Math.max(0, curSpent - prevTotal)
        await updateDoc(oldSiteRef, {
          totalAmountSpent: nextSpent,
          spentAmount: nextSpent,
          amountSpent: nextSpent,
          totalSiteExpense: nextSpent,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.warn('Could not deduct spent from old site:', err)
    }

    // Add new total to new site
    try {
      const newSiteRef = doc(db, 'organisation', orgId, 'projects', newSiteId)
      const newSiteSnap = await getDoc(newSiteRef)
      if (newSiteSnap.exists()) {
        const curSpent = Number(newSiteSnap.data().totalAmountSpent || newSiteSnap.data().spentAmount || 0)
        const nextSpent = curSpent + totalAmount
        await updateDoc(newSiteRef, {
          totalAmountSpent: nextSpent,
          spentAmount: nextSpent,
          amountSpent: nextSpent,
          totalSiteExpense: nextSpent,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.warn('Could not add spent to new site:', err)
    }

    // Sync totalSiteExpensesPerDay for both sites
    try {
      const oldExpRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', oldSiteId)
      const oldExpSnap = await getDoc(oldExpRef)
      if (oldExpSnap.exists()) {
        const curSite = Number(oldExpSnap.data().totalSiteExpense || 0)
        const curAll = Number(oldExpSnap.data().totalAllExpenses || 0)
        await updateDoc(oldExpRef, {
          totalSiteExpense: Math.max(0, curSite - prevTotal),
          totalAllExpenses: Math.max(0, curAll - prevTotal),
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {}

    try {
      const newExpRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', newSiteId)
      const newExpSnap = await getDoc(newExpRef)
      if (newExpSnap.exists()) {
        const curSite = Number(newExpSnap.data().totalSiteExpense || 0)
        const curAll = Number(newExpSnap.data().totalAllExpenses || 0)
        await updateDoc(newExpRef, {
          totalSiteExpense: curSite + totalAmount,
          totalAllExpenses: curAll + totalAmount,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {}
  } else if (newSiteId && diff !== 0) {
    // Same site, adjust delta
    try {
      const siteRef = doc(db, 'organisation', orgId, 'projects', newSiteId)
      const siteSnap = await getDoc(siteRef)
      if (siteSnap.exists()) {
        const currentSpent = Number(siteSnap.data().totalAmountSpent || siteSnap.data().spentAmount || 0)
        const nextSpent = Math.max(0, currentSpent + diff)
        await updateDoc(siteRef, {
          totalAmountSpent: nextSpent,
          spentAmount: nextSpent,
          amountSpent: nextSpent,
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.warn('Could not auto-sync cumulative spent to site on update:', err)
    }

    try {
      const expRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', newSiteId)
      const expSnap = await getDoc(expRef)
      if (expSnap.exists()) {
        const curSite = Number(expSnap.data().totalSiteExpense || 0)
        const curAll = Number(expSnap.data().totalAllExpenses || 0)
        await updateDoc(expRef, {
          totalSiteExpense: Math.max(0, curSite + diff),
          totalAllExpenses: Math.max(0, curAll + diff),
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.warn('Could not sync to totalSiteExpensesPerDay on update:', err)
    }
  }

  return { id: entryId, ...previousEntry, ...payload }
}

export async function updateDailySiteLog(orgId, logId, updateData, actor, previousEntry) {
  return updateDailySiteEntry(orgId, logId, updateData, actor, previousEntry)
}
