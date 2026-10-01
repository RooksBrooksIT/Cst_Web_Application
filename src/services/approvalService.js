import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { fetchWithFallback, subscribeWithFallback } from './firestoreService.js'
import {
  _writeRecord,
  notifyManagerAndOrganisation,
  notifyOrganisation,
  notifySupervisor,
  NotificationType,
} from './notificationService.js'

/**
 * ================================================================================
 * CST WHITE LABEL (eBRICKS) - UNIFIED APPROVAL & REQUEST SERVICE
 * Complies 100% with PROJECT_APPROVAL_AND_REQUEST_SYSTEM_ARCHITECTURE_AND_LOGIC_FLOW.txt
 * ================================================================================
 */

function formatDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

function createAuditEntry(step, action, actorRole, actorName, actorId, remarks = '') {
  const now = new Date()
  return {
    step,
    action,
    actorRole: actorRole || 'User',
    actorName: actorName || 'User',
    actorId: actorId || 'user',
    remarks: remarks || '',
    timestamp: now.toISOString(),
    dateStr: formatDateStr(now),
  }
}

async function dualUpdateDoc(orgId, collectionName, docId, updates) {
  const tenantRef = doc(db, 'organisation', orgId, collectionName, docId)
  const rootRef = doc(db, collectionName, docId)

  await Promise.allSettled([
    updateDoc(tenantRef, updates),
    updateDoc(rootRef, updates).catch(() => {}),
  ])
}

// ------------------------------------------------------------------------------------------------
// STREAM 1: SITE PAYMENT & EXPENSE APPROVALS (siteSupervisorEntries)
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
 * Creates a Site Payment / Daily Expense Requisition (Stage 1)
 */
export async function createSitePaymentRequisition(orgId, requestData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!requestData.siteId) throw new Error('Site selection is required')
  if (!requestData.totalAmount && !requestData.amount) throw new Error('Amount is required')

  const actorName = actor?.displayName || actor?.fullName || actor?.name || 'Site Supervisor'
  const actorId = actor?.uid || actor?.id || 'supervisor'
  const actorRole = actor?.role || 'Supervisor'
  const timestamp = Date.now()
  const entryId = requestData.id || requestData.entryId || `REQ_EXP_${timestamp}`
  const totalAmount = Number(requestData.totalAmount || requestData.amount || 0)

  const auditEntry = createAuditEntry(
    '1. Supervisor Submission',
    'Expense Claim Submitted',
    actorRole,
    actorName,
    actorId,
    requestData.remarks || requestData.description || 'Daily operational expense claim'
  )

  const payload = {
    id: entryId,
    entryId,
    requestId: entryId,
    orgId,
    organizationId: orgId,
    siteId: requestData.siteId,
    siteName: requestData.siteName || '',
    projectStage: requestData.projectStage || 'Foundation',
    category: requestData.category || 'Site Operational Expense',
    materialsCost: Number(requestData.materialsCost) || 0,
    labourCost: Number(requestData.labourCost) || 0,
    foodCost: Number(requestData.foodCost) || 0,
    transportCost: Number(requestData.transportCost) || 0,
    fuelCost: Number(requestData.fuelCost) || 0,
    totalAmount,
    amount: totalAmount,
    description: requestData.description || requestData.remarks || '',
    remarks: requestData.remarks || requestData.description || '',
    voucherNo: requestData.voucherNo || `VOUCH-${timestamp.toString().slice(-6)}`,
    billPhotoUrl: requestData.billPhotoUrl || '',
    date: requestData.date ? new Date(requestData.date) : new Date(),
    
    // 5-Stage Approval Fields
    status: 'pending_manager_review',
    statusDisplay: 'Pending Manager Review',
    approvalStatus: 'pending_manager_review',
    currentStep: 1,
    supervisorId: actorId,
    supervisorName: actorName,
    createdBy: actorName,
    managerReviewed: false,
    managerReviewedBy: null,
    managerReviewedAt: null,
    managerNotes: null,
    orgApproved: false,
    orgApprovedBy: null,
    orgApprovedAt: null,
    rejectionReason: null,
    rejectedBy: null,
    rejectedRole: null,
    utrReference: null,
    approvalHistory: [auditEntry],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const tenantRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  const rootRef = doc(db, 'siteSupervisorEntries', entryId)

  await Promise.allSettled([
    setDoc(tenantRef, payload, { merge: true }),
    setDoc(rootRef, payload, { merge: true }),
  ])

  // Dispatch real-time notification
  try {
    await notifyManagerAndOrganisation({
      orgId,
      title: '💳 New Expense Claim Submitted',
      message: `${actorName} submitted expense claim of ₹${totalAmount.toLocaleString('en-IN')} for ${requestData.siteName || 'site'}.`,
      type: NotificationType.PAYMENT_REQUISITION,
      requestId: entryId,
      siteId: requestData.siteId,
      siteName: requestData.siteName,
      senderUser: actor,
      senderRole: 'supervisor',
      actionRoute: '/manager/approvals',
    })
  } catch (err) {
    console.warn('Expense notification dispatch notice:', err)
  }

  return { id: entryId, ...payload }
}

/**
 * Manager reviews supervisor daily expense log (Stage 2)
 */
export async function managerReviewSitePayment(orgId, entryId, decision, remarks, managerActor) {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'
  const isApproved = decision === 'VERIFY' || decision === true
  const nextStatus = isApproved ? 'pending_org_approval' : 'rejected_by_manager'
  const nextStatusDisplay = isApproved ? 'Pending Organization Approval' : 'Rejected by Manager'
  const nextStep = isApproved ? 2 : -1

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '2. Manager Verification',
    isApproved ? 'Verified & Forwarded to Organization' : 'Rejected by Manager',
    'Manager',
    actorName,
    actorId,
    remarks || (isApproved ? 'Site claim verified against daily progress.' : 'Declined by Manager.')
  )

  const updates = {
    status: nextStatus,
    statusDisplay: nextStatusDisplay,
    approvalStatus: nextStatus,
    currentStep: nextStep,
    managerReviewed: true,
    managerReviewDate: serverTimestamp(),
    managerReviewedAt: serverTimestamp(),
    managerReviewerId: actorId,
    managerReviewerName: actorName,
    managerReviewedBy: actorName,
    managerNotes: remarks || (isApproved ? 'Verified on site.' : 'Declined by Manager.'),
    rejectionReason: !isApproved ? (remarks || 'Declined by Manager.') : null,
    rejectedBy: !isApproved ? actorName : null,
    rejectedRole: !isApproved ? 'Manager' : null,
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteSupervisorEntries', entryId, updates)

  // Dispatch Notification
  try {
    if (isApproved) {
      await notifyOrganisation({
        orgId,
        title: '💳 Expense Claim Verified',
        message: `Expense claim #${entryId} (₹${(currentData.totalAmount || 0).toLocaleString('en-IN')}) verified by ${actorName}. Awaiting HQ authorization.`,
        type: NotificationType.PAYMENT_REQUISITION,
        requestId: entryId,
        siteId: currentData.siteId,
        siteName: currentData.siteName,
        senderUser: managerActor,
        senderRole: 'manager',
        actionRoute: '/organization/approvals',
      })
    } else {
      await notifySupervisor({
        orgId,
        title: '❌ Expense Claim Declined by Manager',
        message: `Expense claim #${entryId} was declined by ${actorName}. Reason: ${remarks || 'No reason specified'}`,
        type: NotificationType.PAYMENT_REQUISITION,
        requestId: entryId,
        siteId: currentData.siteId,
        siteName: currentData.siteName,
        forSupervisorName: currentData.supervisorName,
        forSupervisorId: currentData.supervisorId,
        senderUser: managerActor,
        senderRole: 'manager',
      })
    }
  } catch (err) {
    console.warn('Payment review notification warning:', err)
  }
}

/**
 * Links a supervisor daily expense claim directly to site petty cash float
 */
export async function linkSitePaymentToPettyCash(orgId, entryId, siteId, pettyCashRequestId, managerActor) {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '4. Manager Final Clearance',
    'Approved & Funded via Petty Cash Float',
    'Manager',
    actorName,
    actorId,
    `Settled from Site Petty Cash Float. PCR Link: ${pettyCashRequestId || 'FLOAT_DISBURSE'}`
  )

  const updates = {
    status: 'approved',
    statusDisplay: 'Approved & Settled',
    approvalStatus: 'approved',
    currentStep: 4,
    fundedViaPettyCash: true,
    pettyCashRequestId: pettyCashRequestId || `PCR_LINK_${Date.now()}`,
    clearedByManagerId: actorId,
    clearedByManagerName: actorName,
    clearedByManager: actorName,
    clearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteSupervisorEntries', entryId, updates)
}

/**
 * Final Manager clearance & disbursement once HQ authorizes (Stage 4)
 */
export async function managerClearSitePayment(orgId, entryId, utrReference = '', managerActor) {
  if (!orgId || !entryId) throw new Error('orgId and entryId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'

  const docRef = doc(db, 'organisation', orgId, 'siteSupervisorEntries', entryId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '4. Manager Final Clearance',
    'Disbursed & Settled',
    'Manager',
    actorName,
    actorId,
    `Payment released to site. Ref/UTR: ${utrReference || 'CASH_DISBURSED'}`
  )

  const updates = {
    status: 'approved',
    statusDisplay: 'Approved & Disbursed',
    approvalStatus: 'cleared',
    currentStep: 4,
    utrReference: utrReference || 'CASH_DISBURSED',
    clearedByManagerId: actorId,
    clearedByManagerName: actorName,
    clearedByManager: actorName,
    clearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteSupervisorEntries', entryId, updates)

  try {
    await notifySupervisor({
      orgId,
      title: '💵 Payment Disbursed for Site',
      message: `Payment #${entryId} has been disbursed by ${actorName}. Ref: ${utrReference || 'CASH_DISBURSED'}.`,
      type: NotificationType.PAYMENT_REQUISITION,
      requestId: entryId,
      siteId: currentData.siteId,
      siteName: currentData.siteName,
      forSupervisorName: currentData.supervisorName,
      forSupervisorId: currentData.supervisorId,
      senderUser: managerActor,
      senderRole: 'manager',
    })
  } catch (err) {
    console.warn('Payment clearance notification warning:', err)
  }
}

// ------------------------------------------------------------------------------------------------
// STREAM 2: MATERIAL ORDERS & INDENTS (siteMaterialsRequest)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialOrderApprovals(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'siteMaterialsRequest')
}

export function subscribeMaterialOrderApprovals(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'siteMaterialsRequest', onData, onError)
}

/**
 * Creates a Site Material Requisition (Stage 1)
 */
export async function createMaterialRequisition(orgId, requestData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!requestData.materialName?.trim()) throw new Error('Material name is required')
  if (!requestData.siteId) throw new Error('Site selection is required')

  const actorName = actor?.displayName || actor?.fullName || actor?.name || 'Site Supervisor'
  const actorId = actor?.uid || actor?.id || 'supervisor'
  const actorRole = actor?.role || 'Supervisor'
  const timestamp = Date.now()
  const requestId = requestData.id || requestData.requestId || `REQ_MAT_${timestamp}`
  const requestedQty = Number(requestData.requestedQty || requestData.quantity) || 1

  const auditEntry = createAuditEntry(
    '1. Supervisor Submission',
    'Material Requisition Submitted',
    actorRole,
    actorName,
    actorId,
    requestData.remarks || `Indent for ${requestedQty} ${requestData.unit || 'Units'} of ${requestData.materialName.trim()}`
  )

  const payload = {
    id: requestId,
    requestId,
    orgId,
    organizationId: orgId,
    siteId: requestData.siteId,
    siteName: requestData.siteName || '',
    siteCode: requestData.siteCode || '',
    materialId: requestData.materialId || '',
    materialName: requestData.materialName.trim(),
    category: requestData.category || 'General Civil',
    requestedQty,
    quantity: requestedQty,
    approvedQty: 0,
    unit: requestData.unit || 'Bags',
    urgency: requestData.urgency || 'Normal',
    neededByDate: requestData.neededByDate ? new Date(requestData.neededByDate) : null,
    preferredVendor: requestData.preferredVendor || '',
    estimatedCost: Number(requestData.estimatedCost) || 0,
    remarks: requestData.remarks || '',
    
    // 5-Stage Approval Fields
    status: 'pending_manager_review',
    statusDisplay: 'Pending Manager Review',
    currentStep: 1,
    supervisorId: actorId,
    supervisorName: actorName,
    createdBy: actorName,
    managerReviewedBy: null,
    managerReviewedAt: null,
    managerRemarks: null,
    orgApproved: false,
    orgApprovedBy: null,
    orgApprovedAt: null,
    gatePassNumber: null,
    clearedByManager: null,
    clearedAt: null,
    receivedBy: null,
    receivedAt: null,
    approvalHistory: [auditEntry],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const tenantRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  const rootRef = doc(db, 'siteMaterialsRequest', requestId)

  await Promise.allSettled([
    setDoc(tenantRef, payload, { merge: true }),
    setDoc(rootRef, payload, { merge: true }),
  ])

  // Dispatch real-time notification
  try {
    await notifyManagerAndOrganisation({
      orgId,
      title: '📦 New Material Indent Submitted',
      message: `${actorName} requested ${requestedQty} ${requestData.unit || 'Units'} of ${requestData.materialName} for ${requestData.siteName || 'site'}.`,
      type: NotificationType.MATERIAL_REQUISITION,
      requestId,
      siteId: requestData.siteId,
      siteName: requestData.siteName,
      senderUser: actor,
      senderRole: 'supervisor',
      actionRoute: '/manager/approvals',
    })
  } catch (err) {
    console.warn('Material indent notification warning:', err)
  }

  return { id: requestId, ...payload }
}

/**
 * Manager reviews and verifies material indent (Stage 2)
 */
export async function managerReviewMaterialOrder(orgId, requestId, isApproved, approvedQty, vendorNotes = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'
  const nextStatus = isApproved ? 'pending_org_approval' : 'rejected_by_manager'
  const nextStatusDisplay = isApproved ? 'Pending Organization Approval' : 'Rejected by Manager'
  const nextStep = isApproved ? 2 : -1

  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '2. Manager Verification',
    isApproved ? 'Verified & Forwarded to Organization' : 'Rejected by Manager',
    'Manager',
    actorName,
    actorId,
    vendorNotes || (isApproved ? `Approved quantity: ${approvedQty || currentData.requestedQty} for procurement.` : 'Declined by Manager.')
  )

  const updates = {
    status: nextStatus,
    statusDisplay: nextStatusDisplay,
    currentStep: nextStep,
    approvedQty: Number(approvedQty) || Number(currentData.requestedQty) || 0,
    managerRemarks: vendorNotes || (isApproved ? 'Verified for site procurement.' : 'Declined.'),
    rejectionReason: !isApproved ? (vendorNotes || 'Declined by manager') : null,
    rejectedBy: !isApproved ? actorName : null,
    rejectedRole: !isApproved ? 'Manager' : null,
    managerReviewedBy: actorName,
    managerReviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteMaterialsRequest', requestId, updates)

  // Dispatch Notification
  try {
    if (isApproved) {
      await notifyOrganisation({
        orgId,
        title: '📦 Material Requisition Verified',
        message: `Material Requisition #${requestId} (${currentData.materialName || 'Material'}) verified by ${actorName}. Awaiting HQ authorization.`,
        type: NotificationType.MATERIAL_REQUISITION,
        requestId,
        siteId: currentData.siteId,
        siteName: currentData.siteName,
        senderUser: managerActor,
        senderRole: 'manager',
        actionRoute: '/organization/approvals',
      })
    } else {
      await notifySupervisor({
        orgId,
        title: '❌ Material Requisition Declined',
        message: `Requisition #${requestId} for ${currentData.materialName || 'Material'} was declined by ${actorName}. Reason: ${vendorNotes || 'No reason specified'}`,
        type: NotificationType.MATERIAL_REQUISITION,
        requestId,
        siteId: currentData.siteId,
        siteName: currentData.siteName,
        forSupervisorName: currentData.supervisorName,
        forSupervisorId: currentData.supervisorId,
        senderUser: managerActor,
        senderRole: 'manager',
      })
    }
  } catch (err) {
    console.warn('Material review notification warning:', err)
  }
}

/**
 * Manager issues final clearance & gate pass (Stage 4)
 */
export async function managerClearMaterialOrder(orgId, requestId, gatePassNo = '', managerActor, dispatchRemarks = '') {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'
  const finalGatePass = gatePassNo || `GP-${Date.now().toString().slice(-6)}`

  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '4. Manager Final Clearance',
    'Cleared for Site Dispatch',
    'Manager',
    actorName,
    actorId,
    `Warehouse Gate Pass: ${finalGatePass}. ${dispatchRemarks || 'Items released for transport to site.'}`
  )

  const updates = {
    status: 'approved',
    statusDisplay: 'Approved & Dispatched',
    currentStep: 4,
    gatePassNumber: finalGatePass,
    dispatchRemarks: dispatchRemarks || 'Dispatched from central company warehouse',
    clearedByManager: actorName,
    clearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteMaterialsRequest', requestId, updates)

  // Dispatch Notification
  try {
    await notifySupervisor({
      orgId,
      title: '🚚 Materials Dispatched to Site',
      message: `Materials for Requisition #${requestId} (${currentData.materialName || 'Material'}) dispatched from Central Yard. Gate Pass: ${finalGatePass}.`,
      type: NotificationType.MATERIAL_REQUISITION,
      requestId,
      siteId: currentData.siteId,
      siteName: currentData.siteName,
      forSupervisorName: currentData.supervisorName,
      forSupervisorId: currentData.supervisorId,
      senderUser: managerActor,
      senderRole: 'manager',
    })
  } catch (err) {
    console.warn('Material dispatch notification warning:', err)
  }
}

/**
 * Site Supervisor confirms physical delivery at site (Stage 5)
 */
export async function confirmMaterialReceipt(orgId, requestId, receiptNotes = '', supervisorActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = supervisorActor?.name || supervisorActor?.displayName || 'Site Supervisor'
  const actorId = supervisorActor?.id || supervisorActor?.uid || 'sup_lead'

  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '5. Site Receipt Confirmation',
    'Received at Construction Site',
    'Supervisor',
    actorName,
    actorId,
    receiptNotes || 'Physical delivery verified against gate pass and quality checked.'
  )

  const updates = {
    status: 'received',
    statusDisplay: 'Received / Active',
    currentStep: 5,
    receivedBy: actorName,
    receivedAt: serverTimestamp(),
    receiptNotes: receiptNotes || '',
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteMaterialsRequest', requestId, updates)

  try {
    await notifyManagerAndOrganisation({
      orgId,
      title: '📦 Delivery Confirmed at Site',
      message: `Requisition #${requestId} (${currentData.materialName}) marked as physically received at ${currentData.siteName || 'site'} by ${actorName}.`,
      type: NotificationType.MATERIAL_REQUISITION,
      requestId,
      siteId: currentData.siteId,
      siteName: currentData.siteName,
      senderUser: supervisorActor,
      senderRole: 'supervisor',
      actionRoute: '/manager/approvals',
    })
  } catch (err) {
    console.warn('Receipt confirmation notification warning:', err)
  }
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

/**
 * Creates a Site Tool / Equipment Requisition (Stage 1)
 */
export async function createToolRequisition(orgId, requestData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!requestData.toolName?.trim()) throw new Error('Tool Name is required')
  if (!requestData.siteId) throw new Error('Site selection is required')

  const actorName = actor?.displayName || actor?.fullName || actor?.name || 'Site Supervisor'
  const actorId = actor?.uid || actor?.id || 'supervisor'
  const actorRole = actor?.role || 'Supervisor'
  const timestamp = Date.now()
  const requestId = requestData.id || requestData.requestId || `REQ_TOOL_${timestamp}`
  const quantity = Number(requestData.quantity) || 1

  const auditEntry = createAuditEntry(
    '1. Supervisor Submission',
    'Equipment Requisition Submitted',
    actorRole,
    actorName,
    actorId,
    requestData.purpose || `Request for ${quantity} unit(s) of ${requestData.toolName.trim()}`
  )

  const payload = {
    id: requestId,
    requestId,
    orgId,
    organizationId: orgId,
    siteId: requestData.siteId,
    siteName: requestData.siteName || '',
    toolId: requestData.toolId || '',
    toolName: requestData.toolName.trim(),
    toolCode: requestData.toolCode || '',
    category: requestData.category || 'Heavy Machinery',
    quantity,
    startDate: requestData.startDate ? new Date(requestData.startDate) : new Date(),
    expectedDurationDays: Number(requestData.expectedDurationDays) || 7,
    urgency: requestData.urgency || 'Normal',
    purpose: requestData.purpose || '',
    
    // 5-Stage Approval Fields
    status: 'pending_manager_review',
    statusDisplay: 'Pending Manager Review',
    currentStep: 1,
    supervisorId: actorId,
    supervisorName: actorName,
    createdBy: actorName,
    assignedSerialId: null,
    managerReviewedBy: null,
    managerReviewedAt: null,
    orgApproved: false,
    orgApprovedBy: null,
    orgApprovedAt: null,
    clearedByManager: null,
    clearedAt: null,
    returnCondition: null,
    returnedAt: null,
    approvalHistory: [auditEntry],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const tenantRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  const rootRef = doc(db, 'siteToolsRequest', requestId)

  await Promise.allSettled([
    setDoc(tenantRef, payload, { merge: true }),
    setDoc(rootRef, payload, { merge: true }),
  ])

  // Dispatch real-time notification
  try {
    await notifyManagerAndOrganisation({
      orgId,
      title: '⚙️ New Tool Requisition Submitted',
      message: `${actorName} requested ${requestData.toolName} for ${requestData.siteName || 'site'}.`,
      type: NotificationType.TOOLS_REQUISITION,
      requestId,
      siteId: requestData.siteId,
      siteName: requestData.siteName,
      senderUser: actor,
      senderRole: 'supervisor',
      actionRoute: '/manager/approvals',
    })
  } catch (err) {
    console.warn('Tool requisition notification warning:', err)
  }

  return { id: requestId, ...payload }
}

/**
 * Manager verifies equipment requisition and assigns Asset Tag (Stage 2)
 */
export async function managerApproveToolRequest(orgId, requestId, isApproved = true, assignedAssetSerial = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'
  const nextStatus = isApproved ? 'pending_org_approval' : 'rejected_by_manager'
  const nextStatusDisplay = isApproved ? 'Pending Organization Approval' : 'Rejected by Manager'
  const nextStep = isApproved ? 2 : -1

  const docRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '2. Manager Verification',
    isApproved ? 'Verified & Plant Yard Serial Assigned' : 'Rejected by Manager',
    'Manager',
    actorName,
    actorId,
    isApproved ? `Allocated Central Yard Asset: ${assignedAssetSerial || 'TAG_ASSIGNED'}` : (assignedAssetSerial || 'Declined by Manager.')
  )

  const updates = {
    status: nextStatus,
    statusDisplay: nextStatusDisplay,
    currentStep: nextStep,
    assignedSerialId: assignedAssetSerial || 'YARD_ALLOC_01',
    managerReviewedBy: actorName,
    approvedByManager: actorName,
    managerReviewedAt: serverTimestamp(),
    approvedAt: serverTimestamp(),
    rejectionReason: !isApproved ? (assignedAssetSerial || 'Declined by manager') : null,
    rejectedBy: !isApproved ? actorName : null,
    rejectedRole: !isApproved ? 'Manager' : null,
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteToolsRequest', requestId, updates)

  try {
    if (isApproved) {
      await notifyOrganisation({
        orgId,
        title: '⚙️ Equipment Request Verified',
        message: `Equipment Requisition #${requestId} (${currentData.toolName}) verified with Yard Tag ${assignedAssetSerial || 'Allocated'}. Awaiting HQ authorization.`,
        type: NotificationType.TOOLS_REQUISITION,
        requestId,
        siteId: currentData.siteId,
        siteName: currentData.siteName,
        senderUser: managerActor,
        senderRole: 'manager',
        actionRoute: '/organization/approvals',
      })
    } else {
      await notifySupervisor({
        orgId,
        title: '❌ Equipment Requisition Declined',
        message: `Tool Requisition #${requestId} for ${currentData.toolName} was declined by ${actorName}.`,
        type: NotificationType.TOOLS_REQUISITION,
        requestId,
        siteId: currentData.siteId,
        siteName: currentData.siteName,
        forSupervisorName: currentData.supervisorName,
        forSupervisorId: currentData.supervisorId,
        senderUser: managerActor,
        senderRole: 'manager',
      })
    }
  } catch (err) {
    console.warn('Tool review notification warning:', err)
  }
}

/**
 * Manager dispatches equipment to site (Stage 4)
 */
export async function managerDispatchTool(orgId, requestId, dispatchNotes = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'

  const docRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '4. Manager Final Clearance',
    'Machinery Dispatched to Site',
    'Manager',
    actorName,
    actorId,
    dispatchNotes || 'Asset dispatched from central plant yard trailer.'
  )

  const updates = {
    status: 'dispatched',
    statusDisplay: 'Dispatched to Site',
    currentStep: 4,
    dispatchNotes: dispatchNotes || 'Asset dispatched from central plant yard',
    dispatchedBy: actorName,
    clearedByManager: actorName,
    clearedAt: serverTimestamp(),
    dispatchedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteToolsRequest', requestId, updates)

  try {
    await notifySupervisor({
      orgId,
      title: '🚚 Machinery Dispatched to Site',
      message: `${currentData.toolName || 'Tool'} (Serial: ${currentData.assignedSerialId || 'Yard Tag'}) is en route to site.`,
      type: NotificationType.TOOLS_REQUISITION,
      requestId,
      siteId: currentData.siteId,
      siteName: currentData.siteName,
      forSupervisorName: currentData.supervisorName,
      forSupervisorId: currentData.supervisorId,
      senderUser: managerActor,
      senderRole: 'manager',
    })
  } catch (err) {
    console.warn('Tool dispatch notification warning:', err)
  }
}

/**
 * Site Supervisor confirms machinery arrived at site (Stage 5)
 */
export async function confirmToolReceipt(orgId, requestId, receiptNotes = '', supervisorActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = supervisorActor?.name || supervisorActor?.displayName || 'Site Supervisor'
  const actorId = supervisorActor?.id || supervisorActor?.uid || 'sup_lead'

  const docRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '5. Site Receipt Confirmation',
    'Equipment Received & Active on Site',
    'Supervisor',
    actorName,
    actorId,
    receiptNotes || 'Equipment arrived, physical serial verified and active on site.'
  )

  const updates = {
    status: 'received',
    statusDisplay: 'Received / Active',
    currentStep: 5,
    receivedBy: actorName,
    receivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteToolsRequest', requestId, updates)
}

/**
 * Manager inspects tool upon return to central yard
 */
export async function managerConfirmToolReturn(orgId, requestId, returnCondition = 'Working', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'

  const docRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    'Return Inspection',
    'Returned to Central Yard',
    'Manager',
    actorName,
    actorId,
    `Asset condition verified as: ${returnCondition}`
  )

  const updates = {
    status: 'returned',
    statusDisplay: 'Returned to Yard',
    returnCondition, // 'Working' | 'Damaged' | 'Needs Service'
    receivedBackBy: actorName,
    returnedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteToolsRequest', requestId, updates)
}

// ------------------------------------------------------------------------------------------------
// STREAM 4: STAGE MILESTONES (siteSupervisorProjectStageSchedule)
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

  const actorName = managerActor?.name || managerActor?.displayName || 'Operations Manager'
  const actorId = managerActor?.id || managerActor?.uid || 'mgr_lead'

  const schedRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', scheduleId)
  const snap = await getDoc(schedRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    'Quality & Milestone Review',
    'Milestone Inspected & Completed',
    'Manager',
    actorName,
    actorId,
    qualityNotes || 'Physical inspection verified. Milestone approved.'
  )

  const updates = {
    status: 'completed',
    statusDisplay: 'Milestone Completed',
    isApproved: true,
    currentStep: 5,
    qualityCheckRemarks: qualityNotes || 'Physical inspection verified. Milestone approved.',
    approvedByManager: actorName,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, 'siteSupervisorProjectStageSchedule', scheduleId, updates)

  try {
    await notifyManagerAndOrganisation({
      orgId,
      title: '🏗️ Stage Milestone Completed',
      message: `Stage "${currentData.stageName || 'Milestone'}" for ${currentData.siteName || 'Site'} verified & approved by ${actorName}.`,
      type: NotificationType.PROJECT_UPDATED,
      requestId: scheduleId,
      siteId: currentData.siteId,
      siteName: currentData.siteName,
      senderUser: managerActor,
      senderRole: 'manager',
      actionRoute: '/organization/projects',
    })
  } catch (err) {
    console.warn('Milestone completion notification warning:', err)
  }
}

// ------------------------------------------------------------------------------------------------
// STAGE 3: ORGANIZATION HQ AUTHORIZATION & REJECTION (Universal HQ Actions)
// ------------------------------------------------------------------------------------------------

/**
 * Organization HQ Authorization (Stage 3 -> Stage 4 handoff)
 */
export async function executeOrganizationApproval(orgId, collectionName, docId, currentUser, remarks = '') {
  if (!orgId || !collectionName || !docId) throw new Error('orgId, collectionName, and docId are required')

  const actorName = currentUser?.displayName || currentUser?.fullName || currentUser?.name || currentUser?.email || 'Organization Admin'
  const actorId = currentUser?.uid || 'org_hq_admin'

  const docRef = doc(db, 'organisation', orgId, collectionName, docId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '3. Organization Authorization',
    'Approved by Organization HQ',
    'Organization',
    actorName,
    actorId,
    remarks || 'Authorized by Organization HQ.'
  )

  const updates = {
    status: 'pending_manager_clearance',
    approvalStatus: 'pending_manager_clearance',
    statusDisplay: 'Pending Manager Clearance',
    currentStep: 3,
    orgApproved: true,
    orgApprovedBy: actorName,
    orgApprovedAt: serverTimestamp(),
    orgApprovalRemarks: remarks || 'Authorized by Organization HQ.',
    updatedAt: serverTimestamp(),
    approvalHistory: [...existingHistory, auditEntry],
  }

  await dualUpdateDoc(orgId, collectionName, docId, updates)

  // Write In-App Notification (Dual-Collection Persistence Engine - Section 4.1 & 4.2)
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
      siteName: currentData.siteName || currentData.sitename || '',
      status: 'pending_manager_clearance',
      senderRole: 'organisation',
      senderName: actorName,
      senderId: actorId,
      actionRoute: '/manager/approvals',
    }
    await _writeRecord(orgId, notificationPayload)
  } catch (err) {
    console.warn('Notification write warning:', err)
  }
}

/**
 * Organization HQ Rejection (Stage 3 decline)
 */
export async function executeOrganizationRejection(orgId, collectionName, docId, currentUser, rejectionReason = '') {
  if (!orgId || !collectionName || !docId) throw new Error('orgId, collectionName, and docId are required')

  const actorName = currentUser?.displayName || currentUser?.fullName || currentUser?.name || currentUser?.email || 'Organization Admin'
  const actorId = currentUser?.uid || 'org_hq_admin'

  const docRef = doc(db, 'organisation', orgId, collectionName, docId)
  const snap = await getDoc(docRef)
  const currentData = snap.exists() ? snap.data() : {}
  const existingHistory = Array.isArray(currentData.approvalHistory) ? currentData.approvalHistory : []

  const auditEntry = createAuditEntry(
    '3. Organization Authorization',
    'Rejected by Organization HQ',
    'Organization',
    actorName,
    actorId,
    rejectionReason || 'Declined by Organization HQ.'
  )

  const updates = {
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
  }

  await dualUpdateDoc(orgId, collectionName, docId, updates)

  // Write In-App Notification (Dual-Collection Persistence Engine - Section 4.1 & 4.2)
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
      siteName: currentData.siteName || currentData.sitename || '',
      status: 'rejected_by_org',
      senderRole: 'organisation',
      senderName: actorName,
      senderId: actorId,
      actionRoute: '/manager/approvals',
    }
    await _writeRecord(orgId, notificationPayload)
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

export const executeTier2OrgApproval = executeOrganizationApproval
export const executeTier2OrgRejection = executeOrganizationRejection

