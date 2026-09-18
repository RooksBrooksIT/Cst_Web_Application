import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Contractor & Sub-contractor Billing Service
 * Complies with Section 3.9 of Architecture Specification
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
// 1. Contractors Directory (/organisation/{orgId}/contractors)
// ------------------------------------------------------------------------------------------------

export async function fetchContractors(orgId) {
  return fetchWithFallback(orgId, 'contractors')
}

export function subscribeContractors(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'contractors', onData, onError)
}

export async function createContractor(orgId, contractorData) {
  const payload = {
    name: contractorData.name || contractorData.contractorName || '',
    trade: contractorData.trade || 'Civil & RCC Structure',
    phone: contractorData.phone || contractorData.contactNo || '',
    panGst: contractorData.panGst || contractorData.gstNumber || '',
    workOrders: Array.isArray(contractorData.workOrders) ? contractorData.workOrders : [],
    status: 'active',
  }
  const docId = await saveStandardDoc(orgId, 'contractors', payload)
  return { id: docId, ...payload }
}

export async function updateContractor(orgId, contractorId, updates) {
  await updateStandardDoc(orgId, 'contractors', contractorId, updates)
}

export async function deleteContractor(orgId, contractorId) {
  return deleteStandardDoc(orgId, 'contractors', contractorId)
}

// ------------------------------------------------------------------------------------------------
// 2. Contractor Bills & Measurement Sheets (/organisation/{orgId}/contractor_bills)
// ------------------------------------------------------------------------------------------------

export async function fetchContractorBills(orgId) {
  return fetchWithFallback(orgId, 'contractor_bills')
}

export function subscribeContractorBills(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'contractor_bills', onData, onError)
}

export async function createContractorBill(orgId, billData) {
  const grossAmount = Number(billData.grossAmount) || (Number(billData.measuredQty) * Number(billData.rate)) || 0
  const tdsDeduction = Number(billData.tdsDeduction) || (grossAmount * 0.01) // 1% or 2%
  const retentionDeduction = Number(billData.retentionDeduction) || (grossAmount * 0.05) // 5% retention
  const netPayable = grossAmount - tdsDeduction - retentionDeduction

  const payload = {
    contractorId: billData.contractorId || '',
    contractorName: billData.contractorName || 'Contractor',
    workOrderId: billData.workOrderId || '',
    projectId: billData.projectId || billData.siteId || '',
    projectName: billData.projectName || billData.siteName || 'Site',
    billNumber: billData.billNumber || `BILL-${Date.now().toString().slice(-4)}`,
    measurementSheetUrl: billData.measurementSheetUrl || '',
    workDescription: billData.workDescription || '',
    measuredQty: Number(billData.measuredQty) || 0,
    rate: Number(billData.rate) || 0,
    grossAmount,
    tdsDeduction,
    retentionDeduction,
    netPayable,
    status: billData.status || 'submitted',
    date: billData.date || new Date().toISOString(),
  }

  const docId = await saveStandardDoc(orgId, 'contractor_bills', payload)
  return { id: docId, ...payload }
}

export async function updateContractorBillStatus(orgId, billId, status, paymentRef = '') {
  await updateStandardDoc(orgId, 'contractor_bills', billId, {
    status,
    paymentRef,
    settledAt: status === 'paid' ? new Date().toISOString() : '',
  })
}
