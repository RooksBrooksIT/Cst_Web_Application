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

/**
 * Calculates sum of materials, labours, and site sundries, saves to siteSupervisorEntries,
 * and updates cumulative project spent in projects.
 */
export async function createDailySiteEntry(orgId, entryData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!entryData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const entryId = entryData.entryId || `ENTRY_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  // Calculate costs
  const materials = Array.isArray(entryData.materials) ? entryData.materials : []
  const labours = Array.isArray(entryData.labours) ? entryData.labours : []

  const materialsCost = materials.reduce((acc, m) => acc + (Number(m.total || (Number(m.qty || 0) * Number(m.price || 0))) || 0), 0)
  const labourCost = labours.reduce((acc, l) => acc + (Number(l.total || (Number(l.qty || 0) * Number(l.salary || 0))) || 0), 0)
  const foodCost = Number(entryData.foodCost) || 0
  const transportCost = Number(entryData.transportCost) || 0
  const fuelCost = Number(entryData.fuelCost) || 0
  const totalAmount = materialsCost + labourCost + foodCost + transportCost + fuelCost

  const payload = {
    entryId,
    siteId: entryData.siteId,
    siteName: entryData.siteName || '',
    siteCode: entryData.siteCode || '',
    projectName: entryData.projectName || entryData.siteName || '',
    projectStage: entryData.projectStage || 'Foundation & Plinth',
    supervisorId: actor?.id || entryData.supervisorId || 'mgr_lead',
    supervisorName: actor?.name || entryData.supervisorName || 'Operations Manager',
    date: entryData.date ? new Date(entryData.date) : serverTimestamp(),
    materials,
    labours,
    materialsCost,
    labourCost,
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
        updatedAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.warn('Could not auto-sync cumulative spent to site:', err)
  }

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
