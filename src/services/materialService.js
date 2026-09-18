import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Material Catalog & Procurement Service
 * Complies with Section 3.4 & 3.5 of Architecture Specification
 */

export const MATERIAL_CATEGORIES = [
  'Cement',
  'Steel',
  'Aggregates',
  'Bricks & Blocks',
  'Electrical',
  'Plumbing',
  'Paints & Chemicals',
  'Hardware & Fasteners',
  'Timber & Plywood',
  'Safety Gear',
]

export const MATERIAL_UNITS = ['Bags', 'Tons', 'Kg', 'CFT', 'Sq.Ft', 'Cu.M', 'Litres', 'Pieces', 'Meters']

export async function fetchMaterials(orgId) {
  return fetchWithFallback(orgId, 'materials')
}

export function subscribeMaterials(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materials', onData, onError)
}

export async function createMaterial(orgId, materialData) {
  const payload = {
    name: materialData.name || materialData.materialName || '',
    materialName: materialData.name || materialData.materialName || '',
    category: materialData.category || 'Cement',
    unit: materialData.unit || 'Bags',
    standardRate: Number(materialData.standardRate || materialData.rate) || 0,
    hsnCode: materialData.hsnCode || '',
    minReorderLevel: Number(materialData.minReorderLevel) || 10,
    currentTotalStock: Number(materialData.currentTotalStock || materialData.currentStock || materialData.quantity) || 0,
    currentStock: Number(materialData.currentTotalStock || materialData.currentStock || materialData.quantity) || 0,
    siteStock: materialData.siteStock || {},
    isApproved: materialData.isApproved !== undefined ? materialData.isApproved : true,
    status: 'In Stock',
  }
  const docId = await saveStandardDoc(orgId, 'materials', payload)
  return { id: docId, ...payload }
}

export async function updateMaterial(orgId, materialId, updates) {
  await updateStandardDoc(orgId, 'materials', materialId, updates)
}

export async function deleteMaterial(orgId, materialId) {
  return deleteStandardDoc(orgId, 'materials', materialId)
}

// ------------------------------------------------------------------------------------------------
// Material Indents / Requests & GRN Receipts (/organisation/{orgId}/material_requests)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialRequests(orgId) {
  return fetchWithFallback(orgId, 'material_requests')
}

export function subscribeMaterialRequests(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'material_requests', onData, onError)
}

export async function createMaterialRequest(orgId, requestData) {
  const payload = {
    projectId: requestData.projectId || requestData.siteId || '',
    projectName: requestData.projectName || requestData.siteName || '',
    requestedByUid: requestData.requestedByUid || requestData.userId || '',
    requestedByName: requestData.requestedByName || requestData.userName || 'Supervisor',
    items: Array.isArray(requestData.items) ? requestData.items : [],
    status: requestData.status || 'pending_manager',
    urgency: requestData.urgency || 'medium',
    deliveryExpectedDate: requestData.deliveryExpectedDate || '',
    supplierId: requestData.supplierId || '',
    supplierName: requestData.supplierName || '',
    poNumber: requestData.poNumber || `PO-${Date.now().toString().slice(-5)}`,
    grnReceipts: Array.isArray(requestData.grnReceipts) ? requestData.grnReceipts : [],
    managerApproval: requestData.managerApproval || null,
  }
  const docId = await saveStandardDoc(orgId, 'material_requests', payload)
  return { id: docId, ...payload }
}

export async function approveMaterialRequest(orgId, requestId, managerData, poNumber, supplierName) {
  await updateStandardDoc(orgId, 'material_requests', requestId, {
    status: 'approved',
    poNumber: poNumber || `PO-${Date.now().toString().slice(-5)}`,
    supplierName: supplierName || 'Approved Vendor',
    managerApproval: {
      approvedBy: managerData.name || managerData.fullName || 'Operations Manager',
      approvedByUid: managerData.uid || '',
      approvedAt: new Date().toISOString(),
      remarks: managerData.remarks || 'Approved for site delivery',
    },
  })
}

export async function recordGrnReceipt(orgId, requestId, grnData) {
  // Add GRN entry to request and update inventory
  const payload = {
    grnId: `GRN-${Date.now()}`,
    receivedDate: grnData.receivedDate || new Date().toISOString(),
    receivedBy: grnData.receivedBy || 'Site Storekeeper',
    invoiceNumber: grnData.invoiceNumber || grnData.challanNo || '',
    billUrl: grnData.billUrl || '',
    receivedItems: grnData.items || [],
  }
  
  await updateStandardDoc(orgId, 'material_requests', requestId, {
    status: 'received',
    lastGrn: payload,
  })
}
