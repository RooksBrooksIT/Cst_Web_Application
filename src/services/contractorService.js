import {
  collection,
  doc,
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
 * CST White Label - Contractor & Sub-Contractor Management Service
 * Scoped under: /organisation/{orgId}/contractors and /organisation/{orgId}/contractorEntries
 * Complies with Section 3 Group 6 & Section 5.6 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const CONTRACTOR_TRADES = [
  'Civil & RCC Structure',
  'Centering & Formwork',
  'Masonry & Plastering',
  'Electrical & Conduiting',
  'Plumbing & Sanitation',
  'Painting & Waterproofing',
  'Flooring & Tile Laying',
  'Fabrication & Structural Steel',
  'Carpentry & Woodwork',
  'HVAC & Firefighting',
]

// ------------------------------------------------------------------------------------------------
// 1. CONTRACTOR REGISTRY (/organisation/{orgId}/contractors)
// ------------------------------------------------------------------------------------------------

export async function fetchContractors(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'contractors')
}

export function subscribeContractors(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'contractors', onData, onError)
}

export async function createContractor(orgId, contractorData) {
  if (!orgId) throw new Error('orgId is required')
  if (!contractorData.contractorName?.trim()) throw new Error('Contractor Name is required')

  const timestamp = Date.now()
  const contractorId = contractorData.contractorId || `CONT_${timestamp.toString().slice(-4)}`

  const payload = {
    contractorId,
    contractorName: contractorData.contractorName.trim(),
    name: contractorData.contractorName.trim(),
    phone: contractorData.phone?.trim() || '',
    contractorNumber: contractorData.phone?.trim() || '',
    address: contractorData.address || '',
    projectField: contractorData.projectField || contractorData.trade || 'Civil & RCC Structure',
    trade: contractorData.projectField || contractorData.trade || 'Civil & RCC Structure',
    panGst: contractorData.panGst || '',
    contractValue: Number(contractorData.contractValue) || 0,
    advancePaid: Number(contractorData.advancePaid) || 0,
    retentionPercentage: Number(contractorData.retentionPercentage) || 5,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'contractors', contractorId)
  await setDoc(docRef, payload)

  return { id: contractorId, ...payload }
}

export async function updateContractor(orgId, contractorId, updates) {
  if (!orgId || !contractorId) throw new Error('orgId and contractorId are required')
  const docRef = doc(db, 'organisation', orgId, 'contractors', contractorId)
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteContractor(orgId, contractorId) {
  if (!orgId || !contractorId) throw new Error('orgId and contractorId are required')
  const docRef = doc(db, 'organisation', orgId, 'contractors', contractorId)
  await deleteDoc(docRef)
}

// ------------------------------------------------------------------------------------------------
// 2. CONTRACTOR DAILY WORK ENTRY (/organisation/{orgId}/contractorEntries)
// ------------------------------------------------------------------------------------------------

export async function fetchContractorEntries(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'contractorEntries')
}

export function subscribeContractorEntries(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'contractorEntries', onData, onError)
}

export async function createContractorEntry(orgId, entryData) {
  if (!orgId) throw new Error('orgId is required')
  if (!entryData.contractorId) throw new Error('Contractor selection is required')
  if (!entryData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const entryId = entryData.entryId || `CENTRY_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  const payload = {
    entryId,
    contractorId: entryData.contractorId,
    contractorName: entryData.contractorName || '',
    siteId: entryData.siteId,
    siteName: entryData.siteName || '',
    date: entryData.date ? new Date(entryData.date) : serverTimestamp(),
    projectField: entryData.projectField || 'Civil Works',
    workDescription: entryData.workDescription || 'Structural work completed',
    measurement: entryData.measurement || '',
    materials: Array.isArray(entryData.materials) ? entryData.materials : [],
    labours: Array.isArray(entryData.labours) ? entryData.labours : [],
    amount: Number(entryData.amount || entryData.claimedAmount) || 0,
    claimedAmount: Number(entryData.amount || entryData.claimedAmount) || 0,
    status: entryData.status || 'pending', // 'pending', 'approved', 'paid'
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'contractorEntries', entryId)
  await setDoc(docRef, payload)

  return { id: entryId, ...payload }
}

export async function updateContractorEntryStatus(orgId, entryId, status, remarks = '') {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')
  const docRef = doc(db, 'organisation', orgId, 'contractorEntries', entryId)
  await updateDoc(docRef, {
    status,
    remarks,
    updatedAt: serverTimestamp(),
  })
}

// Legacy wrappers
export async function createContractorBill(orgId, billData) {
  return createContractorEntry(orgId, billData)
}

export async function updateContractorBillStatus(orgId, billId, status) {
  return updateContractorEntryStatus(orgId, billId, status)
}
