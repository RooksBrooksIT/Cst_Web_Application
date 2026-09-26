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
function formatDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

/**
 * Organization HQ Authorization (Stage 3 -> Stage 4 handoff)
 * Complies 100% with Section 4.B of eBricks_Organization_Approvals_Workflow.txt
 */
export async function executeOrganizationApproval(orgId, collectionName, docId, currentUser, remarks = '') {
  if (!orgId || !collectionName || !docId) throw new Error('orgId, collectionName, and docId are required')

  const actorName = currentUser?.displayName || currentUser?.fullName || currentUser?.name || currentUser?.email || 'Organization Admin'
  const actorId = currentUser?.uid || 'org_hq_admin'
  const now = new Date()

  const docRef = doc(db, 'organisation', orgId, collectionName, docId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}

  const auditEntry = {
    step: '3. Organization Authorization',
    action: 'Approved by Organization',
    actorRole: 'Organization',
    actorName: actorName,
    actorId: actorId,
    remarks: remarks || 'Authorized by Organization HQ.',
    timestamp: now.toISOString(),
    dateStr: formatDateStr(now),
  }

  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  await updateDoc(docRef, {
    status: 'pending_manager_clearance',
    approvalStatus: 'pending_manager_clearance',
    statusDisplay: 'Pending Manager Clearance',
    currentStep: 3,
    orgApproved: true,
    orgApprovedBy: actorName,
    orgApprovalRemarks: remarks || 'Authorized by Organization HQ.',
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  })

  // Write In-App Notification
  try {
    const notificationPayload = {
      title: '✅ Requisition Authorized by HQ',
      body: `HQ (${actorName}) authorized Requisition #${docId}. Manager clearance required to release to site.`,
      targetRole: 'manager_and_organisation',
      targetRoles: ['manager', 'organisation'],
      requestType: collectionName,
      requestId: docId,
      docId: docId,
      siteId: currentData.siteId || currentData.siteid || '',
      status: 'pending_manager_clearance',
      senderRole: 'Organization',
      senderName: actorName,
      createdAt: serverTimestamp(),
    }
    await saveStandardDoc(orgId, 'notifications', notificationPayload)
  } catch (err) {
    console.warn('Notification write warning:', err)
  }
}

/**
 * Organization HQ Rejection (Stage 3 decline)
 * Complies 100% with Section 4.C of eBricks_Organization_Approvals_Workflow.txt
 */
export async function executeOrganizationRejection(orgId, collectionName, docId, currentUser, rejectionReason = '') {
  if (!orgId || !collectionName || !docId) throw new Error('orgId, collectionName, and docId are required')

  const actorName = currentUser?.displayName || currentUser?.fullName || currentUser?.name || currentUser?.email || 'Organization Admin'
  const actorId = currentUser?.uid || 'org_hq_admin'
  const now = new Date()

  const docRef = doc(db, 'organisation', orgId, collectionName, docId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}

  const auditEntry = {
    step: '3. Organization Authorization',
    action: 'Rejected by Organization',
    actorRole: 'Organization',
    actorName: actorName,
    actorId: actorId,
    remarks: rejectionReason || 'Declined by Organization HQ.',
    timestamp: now.toISOString(),
    dateStr: formatDateStr(now),
  }

  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  await updateDoc(docRef, {
    status: 'rejected_by_org',
    approvalStatus: 'rejected_by_org',
    statusDisplay: 'Rejected by Organization',
    currentStep: -1,
    orgApproved: false,
    rejectionReason: rejectionReason || 'Declined by Organization HQ.',
    rejectedBy: actorName,
    rejectedRole: 'Organization',
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  })

  // Write In-App Notification
  try {
    const notificationPayload = {
      title: '❌ Requisition Declined by HQ',
      body: `Requisition #${docId} was declined by HQ (${actorName}). Reason: ${rejectionReason || 'No reason specified'}`,
      targetRole: 'manager_and_organisation',
      targetRoles: ['manager', 'organisation'],
      requestType: collectionName,
      requestId: docId,
      docId: docId,
      siteId: currentData.siteId || currentData.siteid || '',
      status: 'rejected_by_org',
      senderRole: 'Organization',
      senderName: actorName,
      createdAt: serverTimestamp(),
    }
    await saveStandardDoc(orgId, 'notifications', notificationPayload)
  } catch (err) {
    console.warn('Notification write warning:', err)
  }
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
  const currentUser = { displayName: orgAdminName }
  if (isApproved) {
    return executeOrganizationApproval(orgId, 'siteSupervisorEntries', approvalId, currentUser, remarks)
  } else {
    return executeOrganizationRejection(orgId, 'siteSupervisorEntries', approvalId, currentUser, remarks)
  }
}

export async function executeTier3Clearance(orgId, approvalId, managerName, utrReference) {
  return managerClearSitePayment(orgId, approvalId, utrReference, { name: managerName })
}
