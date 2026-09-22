import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
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
 * CST White Label - 4-Stream Management & Approvals Center Service
 * Complies with Section 3 Group 2 & Section 4 Flow 2 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

// ------------------------------------------------------------------------------------------------
// STREAM 1: SITE PAYMENT APPROVALS (siteSupervisorEntries)
// ------------------------------------------------------------------------------------------------

export async function fetchSitePaymentApprovals(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteSupervisorEntries')
}

export function subscribeSitePaymentApprovals(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteSupervisorEntries', onData, onError)
}

/**
 * Manager reviews supervisor daily expense log:
 * - 'VERIFY': moves to 'pending_org_approval'
 * - 'REJECT': moves to 'rejected_by_manager' with mandatory reason
 */
export async function managerReviewSitePayment(orgId, entryId, decision, remarks, managerActor) {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')

  const nextStatus = decision === 'VERIFY' ? 'pending_org_approval' : 'rejected_by_manager'
  const entryRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)

  await updateDoc(entryRef, {
    status: nextStatus,
    approvalStatus: nextStatus,
    managerReviewed: true,
    managerReviewDate: serverTimestamp(),
    managerReviewerId: managerActor?.id || 'mgr_lead',
    managerReviewerName: managerActor?.name || 'Operations Manager',
    managerNotes: remarks || (decision === 'VERIFY' ? 'Verified on site and forwarded to Org HQ.' : 'Declined by Manager.'),
    rejectionReason: decision === 'REJECT' ? remarks : null,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Links a supervisor daily expense claim directly to site petty cash
 */
export async function linkSitePaymentToPettyCash(orgId, entryId, siteId, pettyCashRequestId, managerActor) {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')

  const entryRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  await updateDoc(entryRef, {
    status: 'approved',
    approvalStatus: 'approved',
    fundedViaPettyCash: true,
    pettyCashRequestId: pettyCashRequestId || `PCR_LINK_${Date.now()}`,
    clearedByManagerId: managerActor?.id || 'mgr_lead',
    clearedByManagerName: managerActor?.name || 'Operations Manager',
    clearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Final Manager clearance once HQ approves
 */
export async function managerClearSitePayment(orgId, entryId, utrReference = '', managerActor) {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')

  const entryRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  await updateDoc(entryRef, {
    status: 'approved',
    approvalStatus: 'cleared',
    utrReference: utrReference || 'CASH_DISBURSED',
    clearedByManagerId: managerActor?.id || 'mgr_lead',
    clearedByManagerName: managerActor?.name || 'Operations Manager',
    clearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ------------------------------------------------------------------------------------------------
// STREAM 2: MATERIAL ORDERS APPROVAL (siteMaterialsRequest)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialOrderApprovals(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteMaterialsRequest')
}

export function subscribeMaterialOrderApprovals(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteMaterialsRequest', onData, onError)
}

export async function managerReviewMaterialOrder(orgId, requestId, isApproved, approvedQty, vendorNotes = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const nextStatus = isApproved ? 'pending_org_approval' : 'rejected_by_manager'
  const reqRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)

  await updateDoc(reqRef, {
    status: nextStatus,
    approvedQty: Number(approvedQty) || 0,
    managerRemarks: vendorNotes || (isApproved ? 'Approved by Manager for procurement.' : 'Declined.'),
    rejectionReason: !isApproved ? vendorNotes : null,
    managerReviewedBy: managerActor?.name || 'Operations Manager',
    managerReviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function managerClearMaterialOrder(orgId, requestId, gatePassNo = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const reqRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await updateDoc(reqRef, {
    status: 'approved',
    gatePassNumber: gatePassNo || `GP-${Date.now().toString().slice(-6)}`,
    clearedByManager: managerActor?.name || 'Operations Manager',
    clearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ------------------------------------------------------------------------------------------------
// STREAM 3: TOOLS & EQUIPMENT REQUISITIONS (siteToolsRequest)
// ------------------------------------------------------------------------------------------------

export async function fetchToolRequestApprovals(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteToolsRequest')
}

export function subscribeToolRequestApprovals(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteToolsRequest', onData, onError)
}

export async function managerApproveToolRequest(orgId, requestId, assignedAssetSerial = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const reqRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  await updateDoc(reqRef, {
    status: 'approved',
    assignedSerialId: assignedAssetSerial || 'YARD_ALLOC_01',
    approvedByManager: managerActor?.name || 'Operations Manager',
    approvedAt: serverTimestamp(),
  })
}

export async function managerDispatchTool(orgId, requestId, dispatchNotes = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const reqRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  await updateDoc(reqRef, {
    status: 'dispatched',
    dispatchNotes: dispatchNotes || 'Asset dispatched from central plant yard',
    dispatchedBy: managerActor?.name || 'Operations Manager',
    dispatchedAt: serverTimestamp(),
  })
}

export async function managerConfirmToolReturn(orgId, requestId, returnCondition = 'Working', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const reqRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  await updateDoc(reqRef, {
    status: 'returned',
    returnCondition, // 'Working' | 'Damaged' | 'Needs Service'
    receivedBackBy: managerActor?.name || 'Operations Manager',
    returnedAt: serverTimestamp(),
  })
}

// ------------------------------------------------------------------------------------------------
// STREAM 4: STAGE MILESTONES APPROVAL (siteSupervisorProjectStageSchedule)
// ------------------------------------------------------------------------------------------------

export async function fetchStageMilestoneApprovals(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteSupervisorProjectStageSchedule')
}

export function subscribeStageMilestoneApprovals(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteSupervisorProjectStageSchedule', onData, onError)
}

export async function managerApproveStageMilestone(orgId, scheduleId, qualityNotes = '', managerActor) {
  if (!orgId || !scheduleId) throw new Error('orgId and scheduleId are required')

  const schedRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', scheduleId)
  await updateDoc(schedRef, {
    status: 'completed',
    isApproved: true,
    qualityCheckRemarks: qualityNotes || 'Physical inspection verified. Milestone approved.',
    approvedByManager: managerActor?.name || 'Operations Manager',
    approvedAt: serverTimestamp(),
  })
}

// ------------------------------------------------------------------------------------------------
// LEGACY BACKWARD-COMPATIBLE WRAPPERS
// ------------------------------------------------------------------------------------------------

export async function fetchApprovals(orgId) {
  return fetchSitePaymentApprovals(orgId)
}

export function subscribeApprovals(orgId, onData, onError) {
  return subscribeSitePaymentApprovals(orgId, onData, onError)
}

export async function executeTier1Review(orgId, approvalId, managerName, isApproved, notes = '') {
  return managerReviewSitePayment(orgId, approvalId, isApproved ? 'VERIFY' : 'REJECT', notes, { name: managerName })
}

export async function executeTier2OrgApproval(orgId, approvalId, orgAdminName, isApproved, remarks = '') {
  const nextStatus = isApproved ? 'pending_manager_clearance' : 'rejected_by_org'
  const entryRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', approvalId)
  await updateDoc(entryRef, {
    status: nextStatus,
    approvalStatus: nextStatus,
    orgApproved: isApproved,
    orgApprovedBy: orgAdminName,
    orgRemarks: remarks,
    updatedAt: serverTimestamp(),
  })
}

export async function executeTier3Clearance(orgId, approvalId, managerName, utrReference) {
  return managerClearSitePayment(orgId, approvalId, utrReference, { name: managerName })
}
