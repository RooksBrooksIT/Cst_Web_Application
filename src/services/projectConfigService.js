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
 * CST White Label - Project Master Configurations Service (5 Pillars)
 * Scoped under:
 *   /organisation/{orgId}/projectCategories
 *   /organisation/{orgId}/projectSubCategories
 *   /organisation/{orgId}/projectStages
 *   /organisation/{orgId}/projectContracts
 *   /organisation/{orgId}/projectStatuses
 * Complies with Section 3.3 & Section 5.12 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const DEFAULT_CONFIGS = {
  categories: [
    'Residential Construction',
    'Commercial Complexes',
    'Industrial & Warehouses',
    'Infrastructure & Roads',
    'Renovation & Interior Fit-Outs',
  ],
  subCategories: [
    { name: 'Gated Villa Community', category: 'Residential Construction' },
    { name: 'High-Rise Apartments', category: 'Residential Construction' },
    { name: 'Corporate Office Tech Park', category: 'Commercial Complexes' },
    { name: 'Retail Mall & Multiplex', category: 'Commercial Complexes' },
    { name: 'Heavy Pre-Engineered Factory', category: 'Industrial & Warehouses' },
  ],
  stages: [
    '1. Site Demarcation & Mobilization',
    '2. Deep Excavation & Piling',
    '3. Foundation & Footing Cast',
    '4. Plinth Beams & Backfilling',
    '5. Superstructure Columns & RCC Slabs',
    '6. Masonry, Brickwork & AAC Blocks',
    '7. Internal & External Plastering',
    '8. Plumbing, Electrical & MEP Rough-In',
    '9. Flooring, Tiling & Painting',
    '10. Snag Rectification & Final Handover',
  ],
  contracts: [
    'Turnkey Comprehensive (Material + Labour)',
    'Item Rate Bill of Quantities (BOQ)',
    'Pure Labour & Machinery Contract',
    'Cost-Plus-Percentage Management',
    'Lump-Sum Milestone Agreement',
  ],
  statuses: [
    'Upcoming / Planning',
    'Mobilization in Progress',
    'Active Construction',
    'Suspended / On Hold',
    'Snagging Inspection',
    'Completed & Handed Over',
  ],
}

// 1. Project Categories
export async function fetchProjectCategories(orgId) {
  return fetchWithFallback(orgId, 'projectCategories')
}

export async function addProjectCategory(orgId, name) {
  if (!orgId || !name?.trim()) throw new Error('Category name is required')
  const id = `CAT_${Date.now()}`
  const docRef = doc(db, 'organisation', orgId, 'projectCategories', id)
  const payload = { id, projectCategory: name.trim(), name: name.trim(), createdAt: serverTimestamp() }
  await setDoc(docRef, payload)
  return payload
}

export async function deleteProjectCategory(orgId, id) {
  await deleteDoc(doc(db, 'organisation', orgId, 'projectCategories', id))
}

// 2. Project Sub-Categories
export async function fetchProjectSubCategories(orgId) {
  return fetchWithFallback(orgId, 'projectSubCategories')
}

export async function addProjectSubCategory(orgId, name, parentCategory = '') {
  if (!orgId || !name?.trim()) throw new Error('Sub-category name is required')
  const id = `SUBCAT_${Date.now()}`
  const docRef = doc(db, 'organisation', orgId, 'projectSubCategories', id)
  const payload = {
    id,
    projectSubCategory: name.trim(),
    name: name.trim(),
    projectCategory: parentCategory || '',
    createdAt: serverTimestamp(),
  }
  await setDoc(docRef, payload)
  return payload
}

export async function deleteProjectSubCategory(orgId, id) {
  await deleteDoc(doc(db, 'organisation', orgId, 'projectSubCategories', id))
}

// 3. Project Stages
export async function fetchProjectStages(orgId) {
  return fetchWithFallback(orgId, 'projectStages')
}

export async function addProjectStage(orgId, name, order = 1) {
  if (!orgId || !name?.trim()) throw new Error('Stage name is required')
  const id = `STG_${Date.now()}`
  const docRef = doc(db, 'organisation', orgId, 'projectStages', id)
  const payload = {
    id,
    projectStage: name.trim(),
    name: name.trim(),
    order: Number(order) || 1,
    createdAt: serverTimestamp(),
  }
  await setDoc(docRef, payload)
  return payload
}

export async function deleteProjectStage(orgId, id) {
  await deleteDoc(doc(db, 'organisation', orgId, 'projectStages', id))
}

// 4. Project Contracts
export async function fetchProjectContracts(orgId) {
  return fetchWithFallback(orgId, 'projectContracts')
}

export async function addProjectContract(orgId, name) {
  if (!orgId || !name?.trim()) throw new Error('Contract name is required')
  const id = `CONT_${Date.now()}`
  const docRef = doc(db, 'organisation', orgId, 'projectContracts', id)
  const payload = { id, projectContract: name.trim(), name: name.trim(), createdAt: serverTimestamp() }
  await setDoc(docRef, payload)
  return payload
}

export async function deleteProjectContract(orgId, id) {
  await deleteDoc(doc(db, 'organisation', orgId, 'projectContracts', id))
}

// 5. Project Statuses
export async function fetchProjectStatuses(orgId) {
  return fetchWithFallback(orgId, 'projectStatuses')
}

export async function addProjectStatus(orgId, name) {
  if (!orgId || !name?.trim()) throw new Error('Status name is required')
  const id = `STAT_${Date.now()}`
  const docRef = doc(db, 'organisation', orgId, 'projectStatuses', id)
  const payload = { id, projectStatus: name.trim(), name: name.trim(), createdAt: serverTimestamp() }
  await setDoc(docRef, payload)
  return payload
}

export async function deleteProjectStatus(orgId, id) {
  await deleteDoc(doc(db, 'organisation', orgId, 'projectStatuses', id))
}
