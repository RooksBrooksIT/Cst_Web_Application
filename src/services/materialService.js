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
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * Material Catalog & Procurement Service
 * Complies with Section 3 Group 5 & Section 5.8 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const MATERIAL_CATEGORIES = [
  'Cement & Binding Materials',
  'Steel & TMT Reinforcement',
  'Aggregates & Sand',
  'Bricks, Blocks & Masonry',
  'Electrical & Conduits',
  'Plumbing & Sanitation',
  'Paints, Waterproofing & Chemicals',
  'Hardware & Fasteners',
  'Timber, Plywood & Formwork',
  'Safety & PPE Gear',
]

export const MATERIAL_UNITS = ['Bags', 'Tons', 'Kg', 'CFT', 'Sq.Ft', 'Cu.M', 'Litres', 'Pieces', 'Meters']

export async function fetchMaterials(orgId) {
  return fetchWithFallback(orgId, 'materials')
}

export function subscribeMaterials(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materials', onData, onError)
}

export async function createMaterial(orgId, materialData) {
  if (!orgId || !materialData.materialName?.trim()) throw new Error('Material name is required')

  const timestamp = Date.now()
  const materialId = materialData.materialId || `MAT_${timestamp.toString().slice(-4)}`

  const payload = {
    materialId,
    materialName: materialData.materialName.trim(),
    name: materialData.materialName.trim(),
    categoryName: materialData.categoryName || materialData.category || 'Cement & Binding Materials',
    category: materialData.categoryName || materialData.category || 'Cement & Binding Materials',
    subCategoryName: materialData.subCategoryName || materialData.subCategory || 'General',
    unitName: materialData.unitName || materialData.unit || 'Bags',
    unit: materialData.unitName || materialData.unit || 'Bags',
    unitPrice: Number(materialData.unitPrice || materialData.standardRate || materialData.rate) || 0,
    standardRate: Number(materialData.unitPrice || materialData.standardRate || materialData.rate) || 0,
    description: materialData.description || '',
    currentTotalStock: Number(materialData.currentTotalStock || materialData.currentStock || materialData.quantity) || 0,
    currentStock: Number(materialData.currentTotalStock || materialData.currentStock || materialData.quantity) || 0,
    minReorderLevel: Number(materialData.minReorderLevel) || 20,
    status: Number(materialData.currentStock || 0) <= 0 ? 'Out of Stock' : (Number(materialData.currentStock || 0) < 20 ? 'Low Stock' : 'In Stock'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'materials', materialId)
  await setDoc(docRef, payload)

  return { id: materialId, ...payload }
}

export async function updateMaterial(orgId, materialId, updates) {
  if (!orgId || !materialId) throw new Error('orgId and materialId are required')
  const docRef = doc(db, 'organisation', orgId, 'materials', materialId)
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteMaterial(orgId, materialId) {
  if (!orgId || !materialId) throw new Error('orgId and materialId are required')
  const docRef = doc(db, 'organisation', orgId, 'materials', materialId)
  await deleteDoc(docRef)
}

// ------------------------------------------------------------------------------------------------
// 2. MATERIAL REQUESTS / REQUISITIONS (/organisation/{orgId}/siteMaterialsRequest)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialRequests(orgId) {
  return fetchWithFallback(orgId, 'siteMaterialsRequest')
}

export function subscribeMaterialRequests(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'siteMaterialsRequest', onData, onError)
}

export async function createMaterialRequest(orgId, requestData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!requestData.materialName?.trim()) throw new Error('Material name is required')
  if (!requestData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const requestId = requestData.requestId || `MAT_REQ_${timestamp}_${Math.random().toString(36).substring(2, 5)}`

  const payload = {
    requestId,
    siteId: requestData.siteId,
    siteName: requestData.siteName || '',
    materialId: requestData.materialId || '',
    materialName: requestData.materialName.trim(),
    category: requestData.category || 'Cement & Binding Materials',
    requestedQty: Number(requestData.requestedQty || requestData.quantity) || 1,
    approvedQty: Number(requestData.approvedQty) || 0,
    unit: requestData.unit || 'Bags',
    urgency: requestData.urgency || 'Normal', // 'Normal', 'High', 'Critical'
    neededByDate: requestData.neededByDate ? new Date(requestData.neededByDate) : serverTimestamp(),
    preferredVendor: requestData.preferredVendor || '',
    estimatedCost: Number(requestData.estimatedCost) || 0,
    supervisorId: actor?.id || requestData.supervisorId || 'sup_lead',
    supervisorName: actor?.name || requestData.supervisorName || 'Site Supervisor',
    remarks: requestData.remarks || '',
    status: requestData.status || 'pending_manager_review',
    managerRemarks: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await setDoc(docRef, payload)

  return { id: requestId, ...payload }
}

export async function approveMaterialRequest(orgId, requestId, managerData, poNumber, supplierName) {
  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await updateDoc(docRef, {
    status: 'approved',
    poNumber: poNumber || `PO-${Date.now().toString().slice(-5)}`,
    preferredVendor: supplierName || 'Approved Vendor',
    managerReviewedBy: managerData.name || 'Operations Manager',
    managerReviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function recordGrnReceipt(orgId, requestId, grnData) {
  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await updateDoc(docRef, {
    status: 'received',
    grnNumber: grnData.challanNo || `GRN-${Date.now()}`,
    receivedDate: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ------------------------------------------------------------------------------------------------
// 3. MATERIAL MOVEMENTS & GATE PASSES (/organisation/{orgId}/materialMovements)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialMovements(orgId) {
  return fetchWithFallback(orgId, 'materialMovements')
}

export function subscribeMaterialMovements(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materialMovements', onData, onError)
}

export async function createMaterialMovement(orgId, movementData, managerActor) {
  if (!orgId || !movementData.materialName?.trim()) throw new Error('Material name required')

  const timestamp = Date.now()
  const movementId = `MMOV_${timestamp}`
  const gatePassNumber = movementData.gatePassNumber || `GP-${timestamp.toString().slice(-6)}`

  const payload = {
    movementId,
    gatePassNumber,
    fromSite: movementData.fromSite || 'Central Warehouse',
    toSite: movementData.toSite || 'Site',
    materialId: movementData.materialId || '',
    materialName: movementData.materialName.trim(),
    quantity: Number(movementData.quantity) || 1,
    unit: movementData.unit || 'Bags',
    dispatchDate: movementData.dispatchDate ? new Date(movementData.dispatchDate) : serverTimestamp(),
    transporterName: movementData.transporterName || '',
    vehicleNumber: movementData.vehicleNumber || '',
    driverPhone: movementData.driverPhone || '',
    receivedStatus: 'In Transit', // 'In Transit' | 'Received' | 'Rejected'
    dispatchedBy: managerActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'materialMovements', movementId)
  await setDoc(docRef, payload)

  return { id: movementId, ...payload }
}

export async function confirmMaterialMovementReceipt(orgId, movementId, receiverActor) {
  if (!orgId || !movementId) throw new Error('orgId and movementId required')
  const docRef = doc(db, 'organisation', orgId, 'materialMovements', movementId)
  await updateDoc(docRef, {
    receivedStatus: 'Received',
    receivedBy: receiverActor?.name || 'Site Supervisor',
    receivedDate: serverTimestamp(),
  })
}
