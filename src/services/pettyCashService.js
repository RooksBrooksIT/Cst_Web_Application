import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  query,
  orderBy,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'
import {
  notifyOrganisation,
  notifySupervisor,
  notifyManager,
  NotificationType,
} from './notificationService.js'

/**
 * CST WHITE LABEL - PETTY CASH SYSTEM ENGINE
 * Complete Specification & Data Structure matching Mobile Application
 * Scoped under: /organisation/{orgId}/{collectionName}/{documentId}
 */

// ------------------------------------------------------------------------------------------------
// 1. CANONICAL ENUMS & CATEGORIES
// ------------------------------------------------------------------------------------------------

export const PETTY_CASH_REQUEST_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PENDING_MANAGER_REVIEW: 'PENDING_MANAGER_REVIEW',
  PENDING_MANAGER_APPROVAL: 'PENDING_MANAGER_REVIEW',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  REVISION_REQUIRED: 'REVISION_REQUESTED',
  REJECTED_BY_MANAGER: 'REJECTED_BY_MANAGER',
  PENDING_ORGANIZATION_APPROVAL: 'PENDING_ORGANIZATION_APPROVAL',
  PENDING_ORG_APPROVAL: 'PENDING_ORGANIZATION_APPROVAL',
  REJECTED_BY_ORGANIZATION: 'REJECTED_BY_ORGANIZATION',
  APPROVED: 'APPROVED',
  AWAITING_DISBURSEMENT: 'AWAITING_DISBURSEMENT',
  PENDING_ORG_DISBURSAL: 'AWAITING_DISBURSEMENT',
  PENDING_DISBURSAL: 'AWAITING_DISBURSEMENT',
  DISBURSED: 'DISBURSED',
  FUNDS_DISBURSED: 'DISBURSED',
  AWAITING_RECEIPT_CONFIRMATION: 'AWAITING_RECEIPT_CONFIRMATION',
  RECEIVED: 'RECEIVED',
  FLOAT_ACTIVE_IN_HAND: 'RECEIVED',
  ACTIVE: 'ACTIVE',
  IN_HAND: 'ACTIVE',
  RECONCILIATION_SUBMITTED: 'RECONCILIATION_SUBMITTED',
  SUBMITTED_FOR_AUDIT: 'RECONCILIATION_SUBMITTED',
  MANAGER_AUDITED: 'MANAGER_AUDITED',
  RECOMMENDED_FOR_CLOSURE: 'MANAGER_AUDITED',
  SETTLED_AND_CLOSED: 'SETTLED_AND_CLOSED',
  CLOSED: 'CLOSED',
  FLOAT_REPLENISHED: 'FLOAT_REPLENISHED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
}

export const PETTY_CASH_EXPENSE_STATUS = {
  PENDING_EXPENSE_REVIEW: 'PENDING_EXPENSE_REVIEW',
  EXPENSE_APPROVED: 'EXPENSE_APPROVED',
  EXPENSE_REJECTED: 'EXPENSE_REJECTED',
}

export const PETTY_CASH_RECONCILIATION_STATUS = {
  RECONCILIATION_PENDING: 'RECONCILIATION_PENDING',
  DISCREPANCY_REVIEW: 'DISCREPANCY_REVIEW',
  RECONCILIATION_APPROVED: 'RECONCILIATION_APPROVED',
}

export const PETTY_CASH_RETURN_STATUS = {
  PENDING_RETURN: 'PENDING_RETURN_CONFIRMATION',
  PENDING_RETURN_CONFIRMATION: 'PENDING_RETURN_CONFIRMATION',
  RETURN_CONFIRMED: 'RETURN_CONFIRMED',
  RETURN_REJECTED: 'RETURN_REJECTED',
}

export const SITE_EXPENSE_CATEGORIES = [
  'Office & Site Supplies',
  'Transport & Travel',
  'Emergency Repairs',
  'Refreshments & Meals',
  'Loading & Unloading',
  'Fuel & Utilities',
  'Hardware & Fasteners',
  'Other / Miscellaneous',
]

export const NON_SITE_EXPENSE_CATEGORIES = [
  'Travel & Conveyance',
  'Food & Meals',
  'Office Stationery & Supplies',
  'Mobile & Internet Recharge',
  'Emergency Operational Expenses',
  'Accommodation & Lodging',
  'Training / Certification',
  'Other / Miscellaneous',
]

export const EXPENSE_CATEGORIES = [
  ...SITE_EXPENSE_CATEGORIES.map((c) => ({ id: c, label: c })),
]

// ------------------------------------------------------------------------------------------------
// 2. FIRESTORE COLLECTION PATH HELPERS
// ------------------------------------------------------------------------------------------------

export function getPettyCashCollectionRef(orgId, collectionName) {
  if (!orgId) throw new Error('orgId is required')
  return collection(db, 'organisation', orgId, collectionName)
}

export function getPettyCashDocRef(orgId, collectionName, docId) {
  if (!orgId || !docId) throw new Error('orgId and docId are required')
  return doc(db, 'organisation', orgId, collectionName, docId)
}

function cleanId(str) {
  return String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

// ------------------------------------------------------------------------------------------------
// 3. AUDIT LOGGING HELPER
// ------------------------------------------------------------------------------------------------

export async function writePettyCashAuditLog(orgId, logData) {
  try {
    const colRef = collection(db, 'organisation', orgId, 'pettyCashAuditLogs')
    const logDoc = {
      action: logData.action,
      entityType: logData.entityType,
      entityId: logData.entityId,
      actorId: logData.actorId || 'system',
      actorName: logData.actorName || 'System',
      actorRole: logData.actorRole || 'System',
      organizationId: orgId,
      siteId: logData.siteId || null,
      previousState: logData.previousState || null,
      newState: logData.newState || null,
      metadata: logData.metadata || {},
      timestamp: serverTimestamp(),
    }
    await setDoc(doc(colRef), logDoc)
  } catch (err) {
    console.warn('Failed to write audit log:', err)
  }
}

// ------------------------------------------------------------------------------------------------
// 4. FLOW A: REQUEST LIFECYCLE
// ------------------------------------------------------------------------------------------------

/**
 * Step 1: Submit Petty Cash Request (Supervisor or Site Custodian)
 */
export async function submitPettyCashRequest(orgId, requestData, actor) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!requestData.requestedAmount || Number(requestData.requestedAmount) <= 0) {
    throw new Error('Valid requested amount is required')
  }
  if (!requestData.reason?.trim()) {
    throw new Error('Reason for petty cash request is mandatory')
  }

  const supervisorId = actor.id || requestData.supervisorId || 'supervisor'
  const supervisorName = actor.name || requestData.supervisorName || 'Supervisor'
  const timestamp = Date.now()
  const requestId = `PCR_${timestamp}_${cleanId(supervisorId)}`

  const payload = {
    requestId,
    orgId,
    organizationId: orgId,
    requestType: requestData.requestType || (requestData.isReplenishment ? 'REPLENISHMENT' : 'INITIAL_ALLOCATION'),
    requestSource: 'REQUEST_BASED',
    supervisorId,
    supervisorName,
    managerId: requestData.managerId || '',
    managerName: requestData.managerName || '',
    projectId: requestData.projectId || requestData.siteId || '',
    projectName: requestData.projectName || requestData.siteName || '',
    siteId: requestData.siteId || requestData.projectId || null,
    siteName: requestData.siteName || requestData.projectName || '',
    siteCode: requestData.siteCode || '',
    isSiteExpense: Boolean(requestData.siteId || requestData.projectId),
    expenseType: requestData.expenseType || (requestData.siteId ? 'site' : 'other'),
    expenseCategory: requestData.expenseCategory || 'Site Operational Float',
    requiredDate: requestData.requiredDate || null,
    documentUrl: requestData.documentUrl || '',
    amount: Number(requestData.requestedAmount),
    totalAmount: Number(requestData.requestedAmount),
    requestedAmount: Number(requestData.requestedAmount),
    approvedAmount: Number(requestData.requestedAmount),
    disbursedAmount: 0,
    allocatedAmount: 0,
    receivedAmount: 0,
    totalSpent: 0,
    remainingBalance: 0,
    reason: requestData.reason.trim(),
    remarks: requestData.remarks || '',
    status: PETTY_CASH_REQUEST_STATUS.PENDING_MANAGER_REVIEW,
    statusDisplay: 'Pending Manager Review',
    approvalStatus: 'pending_manager_review',
    currentStep: 1,
    currentBalanceAtRequest: Number(requestData.currentBalanceAtRequest) || 0,
    totalAllocatedAtRequest: Number(requestData.totalAllocatedAtRequest) || 0,
    totalUsedAtRequest: Number(requestData.totalUsedAtRequest) || 0,
    approvalHistory: [
      {
        step: '1. Supervisor Submission',
        action: 'Petty Cash Requested',
        actorRole: actor.role || 'Supervisor',
        actorName: supervisorName,
        actorId: supervisorId,
        remarks: requestData.reason.trim(),
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)
  await setDoc(reqRef, payload)

  await writePettyCashAuditLog(orgId, {
    action: 'REQUEST_CREATED',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: supervisorId,
    actorName: supervisorName,
    actorRole: actor.role || 'Supervisor',
    siteId: payload.siteId,
    newState: { status: payload.status, requestedAmount: payload.requestedAmount },
  })

  // Dispatch real-time notification to Operations Manager
  try {
    await notifyManager({
      orgId,
      title: '💵 New Petty Cash Request Submitted',
      message: `${supervisorName} requested petty cash of ₹${Number(requestData.requestedAmount).toLocaleString('en-IN')} for ${payload.siteName || 'site'}.`,
      type: NotificationType.PETTY_CASH_REQUEST,
      requestId,
      siteId: payload.siteId || '',
      siteName: payload.siteName || '',
      senderUser: actor,
      senderRole: 'supervisor',
      actionRoute: '/manager/petty-cash',
      actionData: { requestId, siteId: payload.siteId },
    })
  } catch (err) {
    console.warn('Petty cash request submission notification notice:', err)
  }

  return payload
}

/**
 * Step 2: Manager Reviews & Forwards to HQ or Rejects
 */
export async function managerReviewRequest(orgId, requestId, decision, remarks, managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')
  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)

  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) throw new Error('Petty cash request not found')
  const currentData = reqSnap.data()

  const normDecision = String(decision || '').trim().toLowerCase()
  const isApproved =
    ['forward', 'approve', 'approved', 'verify', 'verified'].includes(normDecision) ||
    decision === true
  const isRevision =
    ['revision', 'revision_requested', 'revision_required', 'request_revision', 'revise'].includes(normDecision)

  let newStatus
  let newStatusDisplay
  let newStep
  let approvalStatus
  let historyAction

  if (isApproved) {
    newStatus = PETTY_CASH_REQUEST_STATUS.PENDING_ORGANIZATION_APPROVAL
    newStatusDisplay = 'Pending HQ Authorization'
    newStep = 2
    approvalStatus = 'pending_organization_approval'
    historyAction = 'Verified & Forwarded to HQ'
  } else if (isRevision) {
    newStatus = PETTY_CASH_REQUEST_STATUS.REVISION_REQUESTED
    newStatusDisplay = 'Revision Requested'
    newStep = 1
    approvalStatus = 'revision_requested'
    historyAction = 'Revision Requested by Manager'
  } else {
    newStatus = PETTY_CASH_REQUEST_STATUS.REJECTED_BY_MANAGER
    newStatusDisplay = 'Rejected by Manager'
    newStep = -1
    approvalStatus = 'rejected_by_manager'
    historyAction = 'Rejected by Manager'
  }

  const historyEntry = {
    step: '2. Manager Review',
    action: historyAction,
    actorRole: 'Manager',
    actorName: managerActor?.name || 'Operations Manager',
    actorId: managerActor?.id || 'manager',
    remarks: remarks || (isApproved ? 'Verified site requirements.' : isRevision ? 'Revision requested.' : 'Rejected.'),
    timestamp: new Date().toISOString(),
  }

  const updates = {
    status: newStatus,
    statusDisplay: newStatusDisplay,
    approvalStatus,
    currentStep: newStep,
    managerReviewedBy: managerActor?.name || 'Manager',
    managerReviewerName: managerActor?.name || 'Manager',
    managerName: managerActor?.name || 'Manager',
    managerReviewedAt: serverTimestamp(),
    managerReviewDate: serverTimestamp(),
    managerReviewRemarks: remarks || '',
    managerNotes: remarks || '',
    revisionNotes: isRevision ? (remarks || '') : (currentData.revisionNotes || ''),
    ...(isApproved || isRevision
      ? {}
      : {
          rejectionReason: remarks || 'Declined by manager',
          rejectedBy: managerActor?.name || 'Manager',
          rejectedRole: 'Manager',
        }),
    approvalHistory: [...(currentData.approvalHistory || []), historyEntry],
    updatedAt: serverTimestamp(),
  }

  await updateDoc(reqRef, updates)

  await writePettyCashAuditLog(orgId, {
    action: isApproved ? 'REQUEST_FORWARDED' : isRevision ? 'REQUEST_REVISION_REQUESTED' : 'REQUEST_REJECTED_BY_MANAGER',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: managerActor?.id || 'manager',
    actorName: managerActor?.name || 'Manager',
    actorRole: 'Manager',
    siteId: currentData.siteId,
    previousState: { status: currentData.status },
    newState: { status: newStatus },
    metadata: { remarks },
  })

  // Dispatch Notification to Organization HQ (or to Supervisor if declined/revision)
  try {
    if (isApproved) {
      await notifyOrganisation({
        orgId,
        title: '💵 Petty Cash Request Awaiting Authorization',
        message: `Petty cash request #${requestId} (₹${Number(currentData.requestedAmount || currentData.amount || 0).toLocaleString('en-IN')}) for ${currentData.siteName || 'site'} verified by ${managerActor?.name || 'Operations Manager'}. Awaiting HQ authorization.`,
        type: NotificationType.PETTY_CASH_REQUEST,
        requestId,
        siteId: currentData.siteId || '',
        siteName: currentData.siteName || '',
        senderUser: managerActor,
        senderRole: 'manager',
        actionRoute: '/organization/petty-cash',
        actionData: {
          requestId,
          siteId: currentData.siteId || '',
          siteName: currentData.siteName || '',
          requestedAmount: currentData.requestedAmount || currentData.amount || 0,
        },
      })
    } else if (isRevision) {
      await notifySupervisor({
        orgId,
        title: '⚠️ Petty Cash Revision Requested',
        message: `Manager requested revision for petty cash request #${requestId} (${currentData.siteName || 'site'}): ${remarks || 'Please update the requested details or budget.'}`,
        type: NotificationType.PETTY_CASH_REQUEST,
        requestId,
        siteId: currentData.siteId || '',
        siteName: currentData.siteName || '',
        forSupervisorName: currentData.supervisorName || '',
        forSupervisorId: currentData.supervisorId || '',
        senderUser: managerActor,
        senderRole: 'manager',
      })
    } else {
      await notifySupervisor({
        orgId,
        title: '❌ Petty Cash Request Declined by Manager',
        message: `Petty cash request #${requestId} for ${currentData.siteName || 'site'} was declined by ${managerActor?.name || 'Manager'}. Reason: ${remarks || 'No reason specified'}`,
        type: NotificationType.PETTY_CASH_REQUEST,
        requestId,
        siteId: currentData.siteId || '',
        siteName: currentData.siteName || '',
        forSupervisorName: currentData.supervisorName || '',
        forSupervisorId: currentData.supervisorId || '',
        senderUser: managerActor,
        senderRole: 'manager',
      })
    }
  } catch (err) {
    console.warn('Petty cash manager review notification notice:', err)
  }
}

/**
 * Step 3: Organization (HQ) Authorizes or Rejects
 */
export async function orgAuthorizeRequest(orgId, requestId, decision, approvedAmount, remarks, orgActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')
  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)

  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) throw new Error('Petty cash request not found')
  const currentData = reqSnap.data()

  const normDecision = String(decision || '').trim().toLowerCase()
  const isApproved = ['authorize', 'approve', 'approved'].includes(normDecision) || decision === true
  const parsedAmount = Number(approvedAmount) > 0 ? Number(approvedAmount) : (currentData.requestedAmount || currentData.amount || 0)

  const newStatus = isApproved
    ? PETTY_CASH_REQUEST_STATUS.AWAITING_DISBURSEMENT
    : PETTY_CASH_REQUEST_STATUS.REJECTED_BY_ORGANIZATION
  const newStatusDisplay = isApproved ? 'Approved - Awaiting Disbursement' : 'Rejected by Organization'
  const newStep = isApproved ? 3 : -1

  const historyEntry = {
    step: '3. Organization Authorization',
    action: isApproved ? `Authorized by HQ (₹${parsedAmount})` : 'Rejected by Organization HQ',
    actorRole: 'Organization',
    actorName: orgActor?.name || 'HQ Finance',
    actorId: orgActor?.id || 'org_admin',
    remarks: remarks || '',
    timestamp: new Date().toISOString(),
  }

  const updates = {
    status: newStatus,
    statusDisplay: newStatusDisplay,
    approvalStatus: isApproved ? 'approved' : 'rejected_by_org',
    currentStep: newStep,
    approvedAmount: parsedAmount,
    allocatedAmount: parsedAmount,
    orgApproved: isApproved,
    orgApprovedBy: orgActor?.name || 'HQ Finance',
    orgApprovedAt: serverTimestamp(),
    orgApprovalRemarks: remarks || '',
    ...(isApproved ? {} : { orgRejectedBy: orgActor?.name || 'HQ', rejectionReason: remarks || 'Declined by HQ' }),
    approvalHistory: [...(currentData.approvalHistory || []), historyEntry],
    updatedAt: serverTimestamp(),
  }

  await updateDoc(reqRef, updates)

  await writePettyCashAuditLog(orgId, {
    action: isApproved ? 'ORGANIZATION_APPROVED' : 'ORGANIZATION_REJECTED',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: orgActor?.id || 'org_admin',
    actorName: orgActor?.name || 'HQ Finance',
    actorRole: 'Organization',
    siteId: currentData.siteId,
    previousState: { status: currentData.status },
    newState: { status: newStatus, approvedAmount: parsedAmount },
  })

  // Dispatch Notification to Manager & Supervisor
  try {
    if (isApproved) {
      await notifyManager({
        orgId,
        title: '✅ Petty Cash Request Authorized by HQ',
        message: `HQ (${orgActor?.name || 'Finance'}) authorized petty cash request #${requestId} (₹${parsedAmount.toLocaleString('en-IN')}) for ${currentData.siteName || 'site'}. Manager disbursement required.`,
        type: NotificationType.PETTY_CASH_REQUEST,
        requestId,
        siteId: currentData.siteId || '',
        siteName: currentData.siteName || '',
        senderUser: orgActor,
        senderRole: 'organisation',
        actionRoute: '/manager/petty-cash',
      })
    } else {
      await notifyManager({
        orgId,
        title: '❌ Petty Cash Request Rejected by HQ',
        message: `Petty cash request #${requestId} for ${currentData.siteName || 'site'} was rejected by HQ. Reason: ${remarks || 'Declined by HQ'}`,
        type: NotificationType.PETTY_CASH_REQUEST,
        requestId,
        siteId: currentData.siteId || '',
        siteName: currentData.siteName || '',
        senderUser: orgActor,
        senderRole: 'organisation',
        actionRoute: '/manager/petty-cash',
      })
      await notifySupervisor({
        orgId,
        title: '❌ Petty Cash Request Rejected by HQ',
        message: `Your petty cash request #${requestId} for ${currentData.siteName || 'site'} was rejected by HQ. Reason: ${remarks || 'Declined by HQ'}`,
        type: NotificationType.PETTY_CASH_REQUEST,
        requestId,
        siteId: currentData.siteId || '',
        siteName: currentData.siteName || '',
        forSupervisorName: currentData.supervisorName || '',
        forSupervisorId: currentData.supervisorId || '',
        senderUser: orgActor,
        senderRole: 'organisation',
      })
    }
  } catch (err) {
    console.warn('Petty cash org authorization notification notice:', err)
  }
}

/**
 * Step 4A: Manager Disburses Funds
 */
export async function managerDisburseFunds(orgId, requestId, disburseAmount, method = 'Cash', referenceId = '', remarks = '', managerActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')

  let actualRef = typeof referenceId === 'string' ? referenceId : ''
  let actualRemarks = typeof remarks === 'string' ? remarks : ''
  let actualActor = managerActor
  if (typeof remarks === 'object' && remarks !== null && !managerActor) {
    actualActor = remarks
    actualRemarks = actualRef
    actualRef = ''
  }

  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)

  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) throw new Error('Petty cash request not found')
  const currentData = reqSnap.data()

  const amt = Number(disburseAmount) > 0 ? Number(disburseAmount) : (currentData.approvedAmount || currentData.requestedAmount || 0)

  const historyEntry = {
    step: '4. Manager Fund Disbursement',
    action: `Funds Disbursed via ${method} (₹${amt})${actualRef ? ` - Ref: ${actualRef}` : ''}`,
    actorRole: 'Manager',
    actorName: actualActor?.name || 'Manager',
    actorId: actualActor?.id || 'manager',
    remarks: actualRemarks || `Disbursed ₹${amt} via ${method}. ${actualRef ? `Ref: ${actualRef}` : ''}`,
    timestamp: new Date().toISOString(),
  }

  const updates = {
    status: PETTY_CASH_REQUEST_STATUS.AWAITING_RECEIPT_CONFIRMATION,
    statusDisplay: 'Disbursed - Awaiting Field Receipt',
    currentStep: 4,
    disbursedAmount: amt,
    disbursedBy: actualActor?.name || 'Manager',
    disbursedAt: serverTimestamp(),
    disburseMethod: method,
    paymentMode: method,
    disbursementRef: actualRef || '',
    transactionRef: actualRef || '',
    approvalHistory: [...(currentData.approvalHistory || []), historyEntry],
    updatedAt: serverTimestamp(),
  }

  await updateDoc(reqRef, updates)

  await writePettyCashAuditLog(orgId, {
    action: 'CASH_DISBURSED',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: actualActor?.id || 'manager',
    actorName: actualActor?.name || 'Manager',
    actorRole: 'Manager',
    siteId: currentData.siteId,
    newState: { status: updates.status, disbursedAmount: amt, method, referenceId: actualRef },
  })

  // Dispatch Notification to Supervisor
  try {
    await notifySupervisor({
      orgId,
      title: '💵 Petty Cash Funds Disbursed',
      message: `Petty cash of ₹${amt.toLocaleString('en-IN')} for ${currentData.siteName || 'site'} has been disbursed via ${method}${actualRef ? ` (Ref: ${actualRef})` : ''} by ${actualActor?.name || 'Operations Manager'}. Please verify and confirm receipt.`,
      type: NotificationType.PETTY_CASH_DISPATCHED,
      requestId,
      siteId: currentData.siteId || '',
      siteName: currentData.siteName || '',
      forSupervisorName: currentData.supervisorName || '',
      forSupervisorId: currentData.supervisorId || '',
      senderUser: actualActor,
      senderRole: 'manager',
    })
  } catch (err) {
    console.warn('Petty cash disbursement notification notice:', err)
  }
}

/**
 * Step 4B: Organization HQ Disburses Funds Directly (Stage 4 / Payout Release)
 */
export async function orgDisburseFunds(orgId, requestId, disburseAmount, method = 'Bank Transfer', referenceId = '', remarks = '', orgActor) {
  if (!orgId || !requestId) throw new Error('orgId and requestId are required')
  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)

  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) throw new Error('Petty cash request not found')
  const currentData = reqSnap.data()

  const amt = Number(disburseAmount) > 0 ? Number(disburseAmount) : (currentData.approvedAmount || currentData.requestedAmount || 0)

  const historyEntry = {
    step: '4. Organization Fund Disbursement',
    action: `Funds Disbursed via ${method} (₹${amt})${referenceId ? ` - Ref: ${referenceId}` : ''}`,
    actorRole: 'Organization',
    actorName: orgActor?.name || 'HQ Finance',
    actorId: orgActor?.id || 'org_finance',
    remarks: remarks || `Disbursed ₹${amt} via ${method}. ${referenceId ? `Ref: ${referenceId}` : ''}`,
    timestamp: new Date().toISOString(),
  }

  const updates = {
    status: PETTY_CASH_REQUEST_STATUS.AWAITING_RECEIPT_CONFIRMATION,
    statusDisplay: 'Disbursed - Awaiting Field Receipt',
    currentStep: 4,
    disbursedAmount: amt,
    disbursedBy: orgActor?.name || 'HQ Finance',
    disbursedAt: serverTimestamp(),
    disburseMethod: method,
    paymentMode: method,
    disbursementRef: referenceId || '',
    transactionRef: referenceId || '',
    orgDisbursed: true,
    approvalHistory: [...(currentData.approvalHistory || []), historyEntry],
    updatedAt: serverTimestamp(),
  }

  await updateDoc(reqRef, updates)

  await writePettyCashAuditLog(orgId, {
    action: 'CASH_DISBURSED_BY_HQ',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: orgActor?.id || 'org_finance',
    actorName: orgActor?.name || 'HQ Finance',
    actorRole: 'Organization',
    siteId: currentData.siteId,
    newState: { status: updates.status, disbursedAmount: amt, referenceId, method },
  })

  // Dispatch Notification to Supervisor and Manager
  try {
    await notifySupervisor({
      orgId,
      title: '💵 Petty Cash Funds Disbursed by HQ',
      message: `Petty cash of ₹${amt.toLocaleString('en-IN')} for ${currentData.siteName || 'site'} has been released via ${method}${referenceId ? ` (Ref: ${referenceId})` : ''}. Please verify and confirm receipt.`,
      type: NotificationType.PETTY_CASH_DISPATCHED,
      requestId,
      siteId: currentData.siteId || '',
      siteName: currentData.siteName || '',
      forSupervisorName: currentData.supervisorName || '',
      forSupervisorId: currentData.supervisorId || '',
      senderUser: orgActor,
      senderRole: 'organisation',
    })
    await notifyManager({
      orgId,
      title: '💵 Petty Cash Funds Disbursed by HQ',
      message: `HQ Finance released ₹${amt.toLocaleString('en-IN')} via ${method} for ${currentData.siteName || 'site'}. Awaiting supervisor receipt confirmation.`,
      type: NotificationType.PETTY_CASH_DISPATCHED,
      requestId,
      siteId: currentData.siteId || '',
      siteName: currentData.siteName || '',
      senderUser: orgActor,
      senderRole: 'organisation',
    })
  } catch (err) {
    console.warn('Petty cash org disbursement notification notice:', err)
  }
}

/**
 * Step 5: Supervisor Confirms Receipt (CRITICAL ATOMIC FIRESTORE TRANSACTION)
 */
export async function confirmAmountReceived(orgId, reqData, supervisorActor) {
  if (!orgId || !reqData?.requestId) throw new Error('orgId and requestId are required')

  const requestId = reqData.requestId
  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)
  const accountId = reqData.siteId ? `${orgId}_${reqData.siteId}` : cleanId(supervisorActor.id || 'supervisor')
  const accountRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)
  const txnId = `TXN_${Date.now()}_RECV`
  const txnRef = doc(db, 'organisation', orgId, 'pettyCashTransactions', txnId)
  const auditRef = doc(collection(db, 'organisation', orgId, 'pettyCashAuditLogs'))

  await runTransaction(db, async (txn) => {
    const reqSnap = await txn.get(reqRef)
    if (!reqSnap.exists()) throw new Error('Request document not found')
    const rData = reqSnap.data()

    // Idempotency check: Exit if already confirmed
    if (rData.receivedAt || rData.status === PETTY_CASH_REQUEST_STATUS.RECEIVED) {
      return
    }

    const receivedAmt = Number(rData.disbursedAmount || rData.approvedAmount || rData.requestedAmount || 0)
    const isReplenishment = rData.requestType === 'REPLENISHMENT'

    const accSnap = await txn.get(accountRef)
    const accData = accSnap.exists() ? accSnap.data() : {}

    const prevAllocated = Number(accData.totalAllocated) || 0
    const prevReceived = Number(accData.totalReceived) || prevAllocated
    const prevSpent = Number(accData.totalSpent || accData.totalUsed) || 0
    const prevReturned = Number(accData.totalReturned) || 0
    const prevAvailable = accData.availableBalance !== undefined
      ? Number(accData.availableBalance)
      : prevReceived - prevSpent - prevReturned
    const prevCycleAllocated = Number(accData.currentCycleAllocated) || prevAllocated

    const newTotalAllocated = prevAllocated + receivedAmt
    const newTotalReceived = prevReceived + receivedAmt
    const newAvailableBal = prevAvailable + receivedAmt
    const newCycleAllocated = isReplenishment ? prevCycleAllocated + receivedAmt : receivedAmt

    const historyEntry = {
      step: '5. Amount Received Confirmation',
      action: `Amount Received Confirmed (₹${receivedAmt})`,
      actorRole: 'Supervisor',
      actorName: supervisorActor.name || 'Supervisor',
      actorId: supervisorActor.id || 'supervisor',
      remarks: `Physically received ₹${receivedAmt} float in hand.`,
      timestamp: new Date().toISOString(),
    }

    // 1. Update Request
    txn.update(reqRef, {
      status: PETTY_CASH_REQUEST_STATUS.RECEIVED,
      statusDisplay: 'Funds Active in Field',
      currentStep: 5,
      receivedAmount: receivedAmt,
      receivedAt: serverTimestamp(),
      receivedBySupervisorId: supervisorActor.id || 'supervisor',
      receivedBySupervisorName: supervisorActor.name || 'Supervisor',
      remainingBalance: receivedAmt,
      approvalHistory: [...(rData.approvalHistory || []), historyEntry],
      updatedAt: serverTimestamp(),
    })

    // 2. Set / Merge Site Account
    txn.set(
      accountRef,
      {
        accountId,
        orgId,
        organizationId: orgId,
        siteId: rData.siteId || '',
        siteName: rData.siteName || '',
        supervisorId: supervisorActor.id || rData.supervisorId || '',
        supervisorName: supervisorActor.name || rData.supervisorName || '',
        custodianSupervisorId: supervisorActor.id || rData.supervisorId || '',
        custodianSupervisorName: supervisorActor.name || rData.supervisorName || '',
        managerId: rData.managerId || '',
        managerName: rData.managerName || '',
        totalAllocated: newTotalAllocated,
        totalReceived: newTotalReceived,
        totalSpent: prevSpent,
        totalUsed: prevSpent,
        totalReturned: prevReturned,
        availableBalance: newAvailableBal,
        reservedBalance: Number(accData.reservedBalance) || 0,
        currentCycleAllocated: newCycleAllocated,
        currentCycleId: requestId,
        status: 'ACTIVE',
        lowBalanceTriggered: false,
        lastTransactionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // 3. Post Immutable Ledger Transaction
    txn.set(txnRef, {
      transactionId: txnId,
      idempotencyKey: `RECV_${requestId}_${receivedAmt}`,
      pettyCashId: requestId,
      referenceId: requestId,
      accountId,
      pettyCashAccountId: accountId,
      orgId,
      organizationId: orgId,
      supervisorId: supervisorActor.id || rData.supervisorId || '',
      supervisorName: supervisorActor.name || rData.supervisorName || '',
      managerId: rData.managerId || '',
      managerName: rData.managerName || '',
      siteId: rData.siteId || null,
      siteName: rData.siteName || '',
      siteCode: rData.siteCode || '',
      isSiteExpense: Boolean(rData.siteId),
      expenseType: rData.expenseType || (rData.siteId ? 'site' : 'other'),
      transactionType: isReplenishment ? 'REPLENISHMENT' : 'INITIAL_FUND',
      category: isReplenishment ? 'Replenishment' : 'Initial Fund',
      expenseCategory: isReplenishment ? 'Replenishment' : 'Initial Fund',
      description: `Petty cash received and confirmed for ${rData.siteName || 'Site'}`,
      amount: receivedAmt,
      previousBalance: prevAvailable,
      newBalance: newAvailableBal,
      remarks: `Float confirmed by ${supervisorActor.name || 'Supervisor'}`,
      status: 'POSTED',
      transactionDate: serverTimestamp(),
      createdBy: supervisorActor.name || 'Supervisor',
      createdRole: 'Supervisor',
      createdAt: serverTimestamp(),
    })

    // 4. Audit Log
    txn.set(auditRef, {
      action: 'CASH_RECEIPT_CONFIRMED',
      entityType: 'REQUEST',
      entityId: requestId,
      actorId: supervisorActor.id || 'supervisor',
      actorName: supervisorActor.name || 'Supervisor',
      actorRole: 'Supervisor',
      organizationId: orgId,
      siteId: rData.siteId || null,
      previousState: { availableBalance: prevAvailable },
      newState: { availableBalance: newAvailableBal, status: 'RECEIVED' },
      metadata: { receivedAmount: receivedAmt, txnId },
      timestamp: serverTimestamp(),
    })
  })
}

// ------------------------------------------------------------------------------------------------
// 5. FLOW B: TWO-STAGE EXPENSE LIFECYCLE
// ------------------------------------------------------------------------------------------------

/**
 * Stage 1: Submit Petty Cash Expense (Atomic: Validates spendable balance and reserves funds)
 */
export async function submitPettyCashExpense(orgId, expenseData, actor) {
  if (!orgId) throw new Error('orgId is required')
  const amount = Number(expenseData.amount)
  if (!amount || amount <= 0) throw new Error('Expense amount must be greater than zero')
  if (!expenseData.description?.trim()) throw new Error('Expense description is required')

  // Requirement: If amount >= 500, receiptUrl is mandatory OR noReceiptReason must be provided
  if (amount >= 500 && !expenseData.receiptUrl && !expenseData.noReceiptReason?.trim()) {
    throw new Error('For expenses of ₹500 or more, a receipt image or written justification is mandatory')
  }

  const supervisorId = actor.id || expenseData.submittedBy || 'supervisor'
  const supervisorName = actor.name || expenseData.submittedByName || 'Supervisor'
  const accountId = expenseData.siteId ? `${orgId}_${expenseData.siteId}` : cleanId(supervisorId)
  const accountRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)

  const timestamp = Date.now()
  const expenseId = `EXP_${timestamp}_${cleanId(supervisorId)}`
  const idempotencyKey = `EXP_${supervisorId}_${timestamp}_${amount}`
  const expRef = doc(db, 'organisation', orgId, 'pettyCashExpenses', expenseId)
  const auditRef = doc(collection(db, 'organisation', orgId, 'pettyCashAuditLogs'))

  await runTransaction(db, async (txn) => {
    const accSnap = await txn.get(accountRef)
    const accData = accSnap.exists() ? accSnap.data() : {}

    const availableBal = Number(accData.availableBalance) || 0
    const reservedBal = Number(accData.reservedBalance) || 0
    const spendableBal = Math.max(0, availableBal - reservedBal)

    if (amount > spendableBal) {
      throw new Error(
        `Insufficient spendable balance. Available: ₹${availableBal}, Reserved: ₹${reservedBal}, Spendable: ₹${spendableBal}. Requested: ₹${amount}`
      )
    }

    const newReserved = reservedBal + amount

    // 1. Update Account: Reserve balance
    txn.set(
      accountRef,
      {
        reservedBalance: newReserved,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // 2. Create Expense Doc
    txn.set(expRef, {
      expenseId,
      idempotencyKey,
      accountId,
      pettyCashAccountId: accountId,
      orgId,
      organizationId: orgId,
      expenseType: expenseData.expenseType || (expenseData.siteId ? 'site' : 'other'),
      isSiteExpense: Boolean(expenseData.siteId),
      siteId: expenseData.siteId || null,
      siteName: expenseData.siteName || '',
      siteCode: expenseData.siteCode || '',
      pettyCashId: expenseData.pettyCashId || '',
      submittedBy: supervisorId,
      submittedByName: supervisorName,
      managerId: expenseData.managerId || '',
      managerName: expenseData.managerName || '',
      amount,
      category: expenseData.category || 'Other / Miscellaneous',
      expenseCategory: expenseData.category || 'Other / Miscellaneous',
      description: expenseData.description.trim(),
      vendorName: expenseData.vendorName || '',
      receiptUrl: expenseData.receiptUrl || '',
      receiptFileName: expenseData.receiptFileName || '',
      receiptUploadedAt: expenseData.receiptUrl ? serverTimestamp() : null,
      receiptRequired: amount >= 500,
      noReceiptReason: expenseData.noReceiptReason || null,
      receiptVerified: false,
      receiptVerifiedBy: null,
      receiptVerifiedAt: null,
      status: PETTY_CASH_EXPENSE_STATUS.PENDING_EXPENSE_REVIEW,
      reviewedBy: null,
      reviewRemarks: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      postedToLedger: false,
      transactionId: null,
      transactionDate: expenseData.transactionDate ? new Date(expenseData.transactionDate) : serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // 3. Audit Log
    txn.set(auditRef, {
      action: 'EXPENSE_SUBMITTED',
      entityType: 'EXPENSE',
      entityId: expenseId,
      actorId: supervisorId,
      actorName: supervisorName,
      actorRole: 'Supervisor',
      organizationId: orgId,
      siteId: expenseData.siteId || null,
      newState: { status: 'PENDING_EXPENSE_REVIEW', amount, reservedBalance: newReserved },
      timestamp: serverTimestamp(),
    })
  })

  return expenseId
}

/**
 * Stage 2A: Manager Approves Expense (Atomic: Deducts balance, releases reserve, posts to immutable ledger)
 */
export async function managerApproveExpense(orgId, expenseId, remarks = '', managerActor) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')

  const expRef = doc(db, 'organisation', orgId, 'pettyCashExpenses', expenseId)
  const txnId = `TXN_${Date.now()}_EXP`
  const txnRef = doc(db, 'organisation', orgId, 'pettyCashTransactions', txnId)
  const auditRef = doc(collection(db, 'organisation', orgId, 'pettyCashAuditLogs'))

  await runTransaction(db, async (txn) => {
    const expSnap = await txn.get(expRef)
    if (!expSnap.exists()) throw new Error('Expense record not found')
    const expData = expSnap.data()

    if (expData.status === PETTY_CASH_EXPENSE_STATUS.EXPENSE_APPROVED) {
      return // Idempotent check
    }

    const amount = Number(expData.amount)
    const accountId = expData.accountId || (expData.siteId ? `${orgId}_${expData.siteId}` : cleanId(expData.submittedBy))
    const accountRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)

    const accSnap = await txn.get(accountRef)
    const accData = accSnap.exists() ? accSnap.data() : {}

    const availableBal = Number(accData.availableBalance) || 0
    const reservedBal = Number(accData.reservedBalance) || 0
    const totalSpent = Number(accData.totalSpent || accData.totalUsed) || 0

    if (amount > availableBal) {
      throw new Error(`Cannot approve expense: Account available balance (₹${availableBal}) is less than expense amount (₹${amount})`)
    }

    const newAvailable = availableBal - amount
    const newReserved = Math.max(0, reservedBal - amount)
    const newTotalSpent = totalSpent + amount

    // Low Balance Check: 10% of cycle or fundLimit
    const baseLimit = Number(accData.fundLimit) > 0
      ? Number(accData.fundLimit)
      : Number(accData.currentCycleAllocated || accData.totalAllocated) || 0
    const thresholdPercent = Number(accData.lowBalanceThresholdPercent) || 10.0
    const thresholdAmount = Number(accData.configuredMinimumBalance) > 0
      ? Number(accData.configuredMinimumBalance)
      : baseLimit * (thresholdPercent / 100.0)

    const isLowBalance = newAvailable <= thresholdAmount && baseLimit > 0

    // 1. Update Account
    txn.set(
      accountRef,
      {
        availableBalance: newAvailable,
        reservedBalance: newReserved,
        totalSpent: newTotalSpent,
        totalUsed: newTotalSpent,
        postedExpenseBalance: newTotalSpent,
        lowBalanceTriggered: isLowBalance,
        lastTransactionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // 2. Post to Immutable Ledger
    txn.set(txnRef, {
      transactionId: txnId,
      idempotencyKey: `EXP_APPROVED_${expenseId}`,
      pettyCashId: expData.pettyCashId || '',
      referenceId: expenseId,
      accountId,
      pettyCashAccountId: accountId,
      orgId,
      organizationId: orgId,
      supervisorId: expData.submittedBy,
      supervisorName: expData.submittedByName,
      managerId: managerActor.id || 'manager',
      managerName: managerActor.name || 'Operations Manager',
      siteId: expData.siteId || null,
      siteName: expData.siteName || '',
      siteCode: expData.siteCode || '',
      expenseType: expData.expenseType || (expData.siteId ? 'site' : 'other'),
      vendorName: expData.vendorName || '',
      isSiteExpense: Boolean(expData.siteId),
      transactionType: 'EXPENSE_APPROVED',
      expenseCategory: expData.category || 'Other / Miscellaneous',
      category: expData.category || 'Other / Miscellaneous',
      description: expData.description,
      amount,
      previousBalance: availableBal,
      newBalance: newAvailable,
      remarks: remarks || expData.description,
      attachmentUrl: expData.receiptUrl || '',
      status: 'POSTED',
      transactionDate: expData.transactionDate || serverTimestamp(),
      createdBy: managerActor.name || 'Operations Manager',
      createdRole: 'Manager',
      createdAt: serverTimestamp(),
    })

    // 3. Update Expense Doc
    txn.update(expRef, {
      status: PETTY_CASH_EXPENSE_STATUS.EXPENSE_APPROVED,
      reviewedBy: managerActor.name || 'Operations Manager',
      reviewRemarks: remarks || '',
      approvedAt: serverTimestamp(),
      postedToLedger: true,
      transactionId: txnId,
      receiptVerified: Boolean(expData.receiptUrl),
      receiptVerifiedBy: expData.receiptUrl ? managerActor.name || 'Manager' : null,
      receiptVerifiedAt: expData.receiptUrl ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    })

    // 4. Write Audit Log
    txn.set(auditRef, {
      action: 'EXPENSE_APPROVED',
      entityType: 'EXPENSE',
      entityId: expenseId,
      actorId: managerActor.id || 'manager',
      actorName: managerActor.name || 'Manager',
      actorRole: 'Manager',
      organizationId: orgId,
      siteId: expData.siteId || null,
      previousState: { status: expData.status, availableBalance: availableBal },
      newState: { status: 'EXPENSE_APPROVED', availableBalance: newAvailable, txnId },
      metadata: { amount, isLowBalance },
      timestamp: serverTimestamp(),
    })
  })
}

/**
 * Stage 2B: Manager Rejects Expense (Atomic: Releases reserve balance back to spendable)
 */
export async function managerRejectExpense(orgId, expenseId, reason, managerActor) {
  if (!orgId || !expenseId) throw new Error('orgId and expenseId are required')
  if (!reason?.trim()) throw new Error('Rejection reason is mandatory')

  const expRef = doc(db, 'organisation', orgId, 'pettyCashExpenses', expenseId)
  const auditRef = doc(collection(db, 'organisation', orgId, 'pettyCashAuditLogs'))

  await runTransaction(db, async (txn) => {
    const expSnap = await txn.get(expRef)
    if (!expSnap.exists()) throw new Error('Expense record not found')
    const expData = expSnap.data()

    if (expData.status !== PETTY_CASH_EXPENSE_STATUS.PENDING_EXPENSE_REVIEW) {
      throw new Error('Expense is not pending review')
    }

    const amount = Number(expData.amount)
    const accountId = expData.accountId || (expData.siteId ? `${orgId}_${expData.siteId}` : cleanId(expData.submittedBy))
    const accountRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)

    const accSnap = await txn.get(accountRef)
    const accData = accSnap.exists() ? accSnap.data() : {}
    const currentReserved = Number(accData.reservedBalance) || 0
    const newReserved = Math.max(0, currentReserved - amount)

    // 1. Release reserved balance from Account
    txn.set(
      accountRef,
      {
        reservedBalance: newReserved,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // 2. Update Expense
    txn.update(expRef, {
      status: PETTY_CASH_EXPENSE_STATUS.EXPENSE_REJECTED,
      reviewedBy: managerActor.name || 'Operations Manager',
      rejectionReason: reason.trim(),
      rejectedAt: serverTimestamp(),
      postedToLedger: false,
      updatedAt: serverTimestamp(),
    })

    // 3. Write Audit Log
    txn.set(auditRef, {
      action: 'EXPENSE_REJECTED',
      entityType: 'EXPENSE',
      entityId: expenseId,
      actorId: managerActor.id || 'manager',
      actorName: managerActor.name || 'Manager',
      actorRole: 'Manager',
      organizationId: orgId,
      siteId: expData.siteId || null,
      previousState: { status: expData.status },
      newState: { status: 'EXPENSE_REJECTED', rejectionReason: reason.trim() },
      timestamp: serverTimestamp(),
    })
  })
}

// ------------------------------------------------------------------------------------------------
// 6. FLOW C: PHYSICAL CASH RECONCILIATION
// ------------------------------------------------------------------------------------------------

/**
 * Submit Physical Cash Reconciliation Count
 */
export async function submitReconciliation(orgId, reconData, actor) {
  if (!orgId) throw new Error('orgId is required')

  const expectedCash = Number(reconData.expectedCash) || 0
  const physicalCash = Number(reconData.physicalCash) || 0
  const diff = physicalCash - expectedCash

  if (Math.abs(diff) > 0.01 && !reconData.differenceReason?.trim()) {
    throw new Error('A detailed reason is mandatory when physical cash differs from expected book balance')
  }

  const supervisorId = actor.id || reconData.submittedBy || 'supervisor'
  const supervisorName = actor.name || reconData.submittedByName || 'Supervisor'
  const timestamp = Date.now()
  const reconciliationId = `REC_${timestamp}_${cleanId(supervisorId)}`
  const accountId = reconData.siteId ? `${orgId}_${reconData.siteId}` : cleanId(supervisorId)

  const status = Math.abs(diff) > 0.01
    ? PETTY_CASH_RECONCILIATION_STATUS.DISCREPANCY_REVIEW
    : PETTY_CASH_RECONCILIATION_STATUS.RECONCILIATION_PENDING

  const payload = {
    reconciliationId,
    accountId,
    orgId,
    organizationId: orgId,
    siteId: reconData.siteId || null,
    siteName: reconData.siteName || '',
    expectedCash,
    physicalCash,
    difference: diff,
    differenceReason: reconData.differenceReason?.trim() || null,
    supportingAttachment: reconData.supportingAttachment || '',
    submittedBy: supervisorId,
    submittedByName: supervisorName,
    reviewedBy: null,
    reviewRemarks: null,
    reviewedAt: null,
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const recRef = doc(db, 'organisation', orgId, 'pettyCashReconciliations', reconciliationId)
  await setDoc(recRef, payload)

  await writePettyCashAuditLog(orgId, {
    action: 'RECONCILIATION_SUBMITTED',
    entityType: 'RECONCILIATION',
    entityId: reconciliationId,
    actorId: supervisorId,
    actorName: supervisorName,
    actorRole: 'Supervisor',
    siteId: reconData.siteId,
    metadata: { expectedCash, physicalCash, difference: diff, status },
  })

  return payload
}

/**
 * Approve Physical Cash Reconciliation
 */
export async function approveReconciliation(orgId, reconciliationId, remarks = '', managerActor) {
  if (!orgId || !reconciliationId) throw new Error('orgId and reconciliationId are required')
  const recRef = doc(db, 'organisation', orgId, 'pettyCashReconciliations', reconciliationId)

  await updateDoc(recRef, {
    status: PETTY_CASH_RECONCILIATION_STATUS.RECONCILIATION_APPROVED,
    reviewedBy: managerActor.name || 'Manager',
    reviewRemarks: remarks || 'Reconciliation tally verified.',
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await writePettyCashAuditLog(orgId, {
    action: 'RECONCILIATION_APPROVED',
    entityType: 'RECONCILIATION',
    entityId: reconciliationId,
    actorId: managerActor.id,
    actorName: managerActor.name,
    actorRole: 'Manager',
  })
}

/**
 * Stage 7: Organization HQ Final Settlement & General Ledger Closure
 */
export async function settlePettyCashReconciliation(orgId, reconciliationId, settlementType = 'CARRY_FORWARD', remarks = '', orgActor) {
  if (!orgId || !reconciliationId) throw new Error('orgId and reconciliationId are required')
  const recRef = doc(db, 'organisation', orgId, 'pettyCashReconciliations', reconciliationId)

  const recSnap = await getDoc(recRef)
  if (!recSnap.exists()) throw new Error('Reconciliation record not found')
  const rData = recSnap.data()

  await updateDoc(recRef, {
    status: PETTY_CASH_REQUEST_STATUS.SETTLED_AND_CLOSED,
    settlementType,
    settledBy: orgActor?.name || 'HQ Finance',
    settledById: orgActor?.id || 'org_admin',
    settlementRemarks: remarks || 'Reconciliation settled and posted to GL.',
    settledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await writePettyCashAuditLog(orgId, {
    action: 'RECONCILIATION_SETTLED_AND_CLOSED',
    entityType: 'RECONCILIATION',
    entityId: reconciliationId,
    actorId: orgActor?.id || 'org_admin',
    actorName: orgActor?.name || 'HQ Finance',
    actorRole: 'Organization',
    siteId: rData.siteId || null,
    metadata: { settlementType, remarks },
  })

  try {
    await notifySupervisor({
      orgId,
      title: '⚖️ Petty Cash Reconciliation Settled',
      message: `Reconciliation #${reconciliationId} for ${rData.siteName || 'site'} has been formally audited, settled, and closed by HQ Finance.`,
      type: NotificationType.PETTY_CASH_REQUEST,
      siteId: rData.siteId || '',
      siteName: rData.siteName || '',
      forSupervisorName: rData.submittedByName || '',
      forSupervisorId: rData.submittedBy || '',
      senderUser: orgActor,
      senderRole: 'organisation',
    })
    await notifyManager({
      orgId,
      title: '⚖️ Petty Cash Reconciliation Settled',
      message: `HQ Finance signed off and closed reconciliation #${reconciliationId} for ${rData.siteName || 'site'}.`,
      type: NotificationType.PETTY_CASH_REQUEST,
      siteId: rData.siteId || '',
      siteName: rData.siteName || '',
      senderUser: orgActor,
      senderRole: 'organisation',
    })
  } catch (err) {
    console.warn('Petty cash reconciliation settlement notification notice:', err)
  }
}

// ------------------------------------------------------------------------------------------------
// 7. FLOW D: CASH RETURN WORKFLOW (SURRENDER UNSPENT PHYSICAL CASH)
// ------------------------------------------------------------------------------------------------

/**
 * Supervisor initiates cash return
 */
export async function submitCashReturn(orgId, returnData, actor) {
  if (!orgId) throw new Error('orgId is required')
  const returnAmount = Number(returnData.returnAmount)
  if (!returnAmount || returnAmount <= 0) throw new Error('Valid return amount is required')
  if (!returnData.reason?.trim()) throw new Error('Reason for cash return is mandatory')

  const supervisorId = actor.id || returnData.returnedBy || 'supervisor'
  const supervisorName = actor.name || returnData.returnedByName || 'Supervisor'
  const timestamp = Date.now()
  const returnId = `RET_${timestamp}_${cleanId(supervisorId)}`
  const accountId = returnData.siteId ? `${orgId}_${returnData.siteId}` : cleanId(supervisorId)

  const payload = {
    returnId,
    accountId,
    orgId,
    organizationId: orgId,
    siteId: returnData.siteId || null,
    siteName: returnData.siteName || '',
    returnAmount,
    returnedBy: supervisorId,
    returnedByName: supervisorName,
    receivedBy: null,
    receivedByName: null,
    returnDate: returnData.returnDate ? new Date(returnData.returnDate) : serverTimestamp(),
    proofUrl: returnData.proofUrl || '',
    reason: returnData.reason.trim(),
    status: PETTY_CASH_RETURN_STATUS.PENDING_RETURN_CONFIRMATION,
    transactionId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const retRef = doc(db, 'organisation', orgId, 'pettyCashReturns', returnId)
  await setDoc(retRef, payload)

  await writePettyCashAuditLog(orgId, {
    action: 'CASH_RETURN_SUBMITTED',
    entityType: 'RETURN',
    entityId: returnId,
    actorId: supervisorId,
    actorName: supervisorName,
    actorRole: 'Supervisor',
    siteId: returnData.siteId,
    metadata: { returnAmount },
  })

  return payload
}

/**
 * Manager or HQ confirms receipt of physical cash return (Atomic: updates account & posts ledger)
 */
export async function confirmCashReturn(orgId, returnId, remarks = '', managerActor) {
  if (!orgId || !returnId) throw new Error('orgId and returnId are required')

  const retRef = doc(db, 'organisation', orgId, 'pettyCashReturns', returnId)
  const txnId = `TXN_${Date.now()}_RET`
  const txnRef = doc(db, 'organisation', orgId, 'pettyCashTransactions', txnId)
  const auditRef = doc(collection(db, 'organisation', orgId, 'pettyCashAuditLogs'))

  await runTransaction(db, async (txn) => {
    const retSnap = await txn.get(retRef)
    if (!retSnap.exists()) throw new Error('Cash return record not found')
    const rData = retSnap.data()

    if (rData.status === PETTY_CASH_RETURN_STATUS.RETURN_CONFIRMED) {
      return // Idempotent check
    }

    const returnAmt = Number(rData.returnAmount)
    const accountId = rData.accountId
    const accountRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)

    const accSnap = await txn.get(accountRef)
    const accData = accSnap.exists() ? accSnap.data() : {}

    const availableBal = Number(accData.availableBalance) || 0
    const totalReturned = Number(accData.totalReturned) || 0

    const newAvailable = Math.max(0, availableBal - returnAmt)
    const newReturned = totalReturned + returnAmt

    // 1. Update Account
    txn.set(
      accountRef,
      {
        availableBalance: newAvailable,
        totalReturned: newReturned,
        lastTransactionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )

    // 2. Post Immutable Ledger Transaction
    txn.set(txnRef, {
      transactionId: txnId,
      idempotencyKey: `RET_CONFIRMED_${returnId}`,
      referenceId: returnId,
      accountId,
      pettyCashAccountId: accountId,
      orgId,
      organizationId: orgId,
      supervisorId: rData.returnedBy,
      supervisorName: rData.returnedByName,
      managerId: managerActor.id || 'manager',
      managerName: managerActor.name || 'Operations Manager',
      siteId: rData.siteId || null,
      siteName: rData.siteName || '',
      isSiteExpense: Boolean(rData.siteId),
      transactionType: 'CASH_RETURN',
      expenseCategory: 'Cash Return',
      category: 'Cash Return',
      description: `Cash return acknowledged for ${rData.siteName || 'Site'} (${rData.reason || 'Surrendered cash'})`,
      amount: returnAmt,
      previousBalance: availableBal,
      newBalance: newAvailable,
      remarks: remarks || `Physical cash surrendered back: ₹${returnAmt}`,
      status: 'POSTED',
      transactionDate: serverTimestamp(),
      createdBy: managerActor.name || 'Manager',
      createdRole: 'Manager',
      createdAt: serverTimestamp(),
    })

    // 3. Update Return Doc
    txn.update(retRef, {
      status: PETTY_CASH_RETURN_STATUS.RETURN_CONFIRMED,
      receivedBy: managerActor.id || 'manager',
      receivedByName: managerActor.name || 'Manager',
      transactionId: txnId,
      updatedAt: serverTimestamp(),
    })

    // 4. Audit Log
    txn.set(auditRef, {
      action: 'CASH_RETURN_CONFIRMED',
      entityType: 'RETURN',
      entityId: returnId,
      actorId: managerActor.id || 'manager',
      actorName: managerActor.name || 'Manager',
      actorRole: 'Manager',
      organizationId: orgId,
      siteId: rData.siteId || null,
      previousState: { availableBalance: availableBal },
      newState: { availableBalance: newAvailable, status: 'RETURN_CONFIRMED' },
      metadata: { returnAmount: returnAmt, txnId },
      timestamp: serverTimestamp(),
    })
  })
}

// ------------------------------------------------------------------------------------------------
// 8. FLOW E: PROACTIVE MANAGER ALLOCATION
// ------------------------------------------------------------------------------------------------

/**
 * Manager directly initiates fund allocation (Jumps straight to HQ Authorization)
 */
export async function createProactiveManagerAllocation(orgId, allocationData, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  const amount = Number(allocationData.amount)
  if (!amount || amount <= 0) throw new Error('Valid allocation amount is required')

  const managerId = managerActor.id || 'manager'
  const managerName = managerActor.name || 'Operations Manager'
  const timestamp = Date.now()
  const requestId = `PCM_${timestamp}_${cleanId(allocationData.supervisorId || managerId)}`

  const payload = {
    requestId,
    orgId,
    organizationId: orgId,
    requestType: 'MANUAL_MANAGER',
    requestSource: 'MANUAL_MANAGER',
    supervisorId: allocationData.supervisorId || '',
    supervisorName: allocationData.supervisorName || 'Site Supervisor',
    managerId,
    managerName,
    projectId: allocationData.projectId || allocationData.siteId || '',
    projectName: allocationData.projectName || allocationData.siteName || '',
    siteId: allocationData.siteId || allocationData.projectId || null,
    siteName: allocationData.siteName || allocationData.projectName || '',
    siteCode: allocationData.siteCode || '',
    isSiteExpense: Boolean(allocationData.siteId),
    expenseType: allocationData.siteId ? 'site' : 'other',
    expenseCategory: 'Proactive Site Allocation',
    amount,
    totalAmount: amount,
    requestedAmount: amount,
    approvedAmount: amount,
    disbursedAmount: 0,
    allocatedAmount: amount,
    receivedAmount: 0,
    totalSpent: 0,
    remainingBalance: 0,
    reason: allocationData.reason || 'Manager proactive site fund allocation',
    remarks: allocationData.remarks || '',
    status: PETTY_CASH_REQUEST_STATUS.PENDING_ORGANIZATION_APPROVAL,
    statusDisplay: 'Pending HQ Authorization',
    approvalStatus: 'pending_organization_approval',
    currentStep: 2,
    managerReviewedBy: managerName,
    managerReviewerName: managerName,
    managerName: managerName,
    managerReviewedAt: serverTimestamp(),
    managerReviewRemarks: allocationData.remarks || 'Initiated directly by Project Manager.',
    approvalHistory: [
      {
        step: '2. Manager Direct Allocation',
        action: `Manager Allocated Float (₹${amount})`,
        actorRole: 'Manager',
        actorName: managerName,
        actorId: managerId,
        remarks: allocationData.reason || 'Proactive float allocation',
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)
  await setDoc(reqRef, payload)

  await writePettyCashAuditLog(orgId, {
    action: 'MANAGER_ALLOCATION_CREATED',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: managerId,
    actorName: managerName,
    actorRole: 'Manager',
    siteId: payload.siteId,
    newState: { status: payload.status, allocatedAmount: amount },
  })

  // Dispatch Notification to Organization HQ
  try {
    await notifyOrganisation({
      orgId,
      title: '💵 Proactive Float Allocation Awaiting Authorization',
      message: `${managerName} initiated proactive float allocation #${requestId} (₹${amount.toLocaleString('en-IN')}) for ${payload.siteName || 'site'}. Awaiting HQ authorization.`,
      type: NotificationType.PETTY_CASH_REQUEST,
      requestId,
      siteId: payload.siteId || '',
      siteName: payload.siteName || '',
      senderUser: managerActor,
      senderRole: 'manager',
      actionRoute: '/organization/petty-cash',
      actionData: {
        requestId,
        siteId: payload.siteId || '',
        siteName: payload.siteName || '',
        requestedAmount: amount,
      },
    })
  } catch (err) {
    console.warn('Petty cash proactive allocation notification notice:', err)
  }

  return payload
}

/**
 * Stage 8: Imprest Float Replenishment Order
 * Calculates the exact delta required to restore the site wallet back to its initial cap
 */
export async function createImprestReplenishmentRequest(orgId, siteId, customAmount = null, actor) {
  if (!orgId || !siteId) throw new Error('orgId and siteId are required')

  const accountId = `${orgId}_${siteId}`
  const accountRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)
  const accSnap = await getDoc(accountRef)

  let targetLimit = 50000
  let currentAvailable = 0
  let siteName = 'Site'
  let supervisorId = ''
  let supervisorName = 'Site Custodian'
  let managerId = ''
  let managerName = ''

  if (accSnap.exists()) {
    const aData = accSnap.data()
    targetLimit = Number(aData.fundLimit) || Number(aData.totalAllocated) || 50000
    currentAvailable = Number(aData.availableBalance) || 0
    siteName = aData.siteName || aData.projectName || 'Site'
    supervisorId = aData.supervisorId || aData.custodianSupervisorId || ''
    supervisorName = aData.supervisorName || aData.custodianSupervisorName || 'Site Custodian'
    managerId = aData.managerId || ''
    managerName = aData.managerName || ''
  }

  const deficit = Math.max(0, targetLimit - currentAvailable)
  const replenishAmount = customAmount !== null && Number(customAmount) > 0 ? Number(customAmount) : deficit

  if (replenishAmount <= 0) {
    throw new Error(`Site wallet is already at full float cap (Available: ₹${currentAvailable.toLocaleString('en-IN')}, Cap: ₹${targetLimit.toLocaleString('en-IN')})`)
  }

  const timestamp = Date.now()
  const requestId = `PCR_${timestamp}_REPLENISH_${cleanId(siteId)}`
  const actorName = actor?.name || 'Finance Lead'
  const actorRole = actor?.role || 'Organization'

  const payload = {
    requestId,
    orgId,
    organizationId: orgId,
    requestType: 'REPLENISHMENT',
    requestSource: 'IMPREST_REPLENISHMENT',
    isReplenishment: true,
    supervisorId,
    supervisorName,
    managerId,
    managerName,
    siteId,
    siteName,
    isSiteExpense: true,
    expenseCategory: 'Imprest Float Replenishment',
    amount: replenishAmount,
    totalAmount: replenishAmount,
    requestedAmount: replenishAmount,
    approvedAmount: replenishAmount,
    disbursedAmount: 0,
    allocatedAmount: replenishAmount,
    receivedAmount: 0,
    totalSpent: 0,
    remainingBalance: 0,
    reason: `Stage 8 Imprest Replenishment to restore site float cap to ₹${targetLimit.toLocaleString('en-IN')}. (Current: ₹${currentAvailable.toLocaleString('en-IN')})`,
    remarks: `Initiated by ${actorName} (${actorRole})`,
    status: PETTY_CASH_REQUEST_STATUS.PENDING_ORGANIZATION_APPROVAL,
    statusDisplay: 'Pending HQ Authorization',
    approvalStatus: 'pending_organization_approval',
    currentStep: 2,
    approvalHistory: [
      {
        step: '1. Imprest Replenishment Triggered',
        action: `Replenishment Order Generated (₹${replenishAmount.toLocaleString('en-IN')})`,
        actorRole,
        actorName,
        actorId: actor?.id || 'admin',
        remarks: `Float restoring order up to ₹${targetLimit.toLocaleString('en-IN')}`,
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const reqRef = doc(db, 'organisation', orgId, 'pettyCashRequests', requestId)
  await setDoc(reqRef, payload)

  await writePettyCashAuditLog(orgId, {
    action: 'IMPREST_REPLENISHMENT_ORDER_CREATED',
    entityType: 'REQUEST',
    entityId: requestId,
    actorId: actor?.id || 'admin',
    actorName,
    actorRole,
    siteId,
    newState: { status: payload.status, replenishAmount, targetLimit, currentAvailable },
  })

  // Dispatch Notification to Organization HQ
  try {
    await notifyOrganisation({
      orgId,
      title: '🔄 Imprest Float Replenishment Order Generated',
      message: `Imprest replenishment order #${requestId} (₹${replenishAmount.toLocaleString('en-IN')}) created for ${siteName} to restore float cap. Awaiting HQ disbursement authorization.`,
      type: NotificationType.PETTY_CASH_REQUEST,
      requestId,
      siteId,
      siteName,
      senderUser: actor,
      senderRole: actorRole.toLowerCase(),
      actionRoute: '/organization/petty-cash',
      actionData: {
        requestId,
        siteId,
        siteName,
        requestedAmount: replenishAmount,
      },
    })
  } catch (err) {
    console.warn('Petty cash replenishment notification notice:', err)
  }

  return payload
}

// ------------------------------------------------------------------------------------------------
// 9. BACKWARD-COMPATIBLE WRAPPERS & EXPORTS
// ------------------------------------------------------------------------------------------------

export async function fetchPettyCashAccounts(orgId) {
  return fetchWithFallback(orgId, 'pettyCashAccounts')
}

export function subscribePettyCashAccounts(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'pettyCashAccounts', onData, onError)
}

export async function createOrUpdatePettyCashAccount(orgId, accountData) {
  const supervisorUid = accountData.supervisorUid || accountData.supervisorId || accountData.id || `sup_${Date.now()}`
  const siteId = accountData.siteId || accountData.projectId || ''
  const accountId = siteId ? `${orgId}_${siteId}` : cleanId(supervisorUid)

  const payload = {
    accountId,
    orgId,
    organizationId: orgId,
    supervisorId: supervisorUid,
    supervisorName: accountData.supervisorName || accountData.name || 'Supervisor',
    custodianSupervisorId: supervisorUid,
    custodianSupervisorName: accountData.supervisorName || accountData.name || 'Supervisor',
    siteId,
    siteName: accountData.siteName || accountData.projectName || 'All Assigned Sites',
    availableBalance: Number(accountData.currentBalance || accountData.availableBalance) || 0,
    totalAllocated: Number(accountData.totalAllocated) || 0,
    totalReceived: Number(accountData.totalReceived || accountData.totalAllocated) || 0,
    totalSpent: Number(accountData.totalSpent || accountData.totalUsed) || 0,
    totalUsed: Number(accountData.totalSpent || accountData.totalUsed) || 0,
    totalReturned: Number(accountData.totalReturned) || 0,
    fundLimit: Number(accountData.fundLimit) || 50000,
    configuredMinimumBalance: Number(accountData.configuredMinimumBalance) || 5000,
    status: accountData.status || 'ACTIVE',
    updatedAt: serverTimestamp(),
  }

  const accRef = doc(db, 'organisation', orgId, 'pettyCashAccounts', accountId)
  await setDoc(accRef, payload, { merge: true })
  return payload
}

export async function fetchPettyCashRequests(orgId) {
  return fetchWithFallback(orgId, 'pettyCashRequests')
}

export function subscribePettyCashRequests(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'pettyCashRequests', onData, onError)
}

export async function createPettyCashRequest(orgId, requestData) {
  return submitPettyCashRequest(orgId, requestData, {
    id: requestData.supervisorUid || requestData.supervisorId || 'supervisor',
    name: requestData.supervisorName || 'Supervisor',
    role: 'Supervisor',
  })
}

export async function disbursePettyCashRequest(orgId, requestId, supervisorUid, amount, disbursedByName, paymentMode = 'Cash') {
  return managerDisburseFunds(orgId, requestId, amount, paymentMode, '', {
    id: 'manager',
    name: disbursedByName || 'Operations Manager',
  })
}

export async function fetchPettyCashExpenses(orgId) {
  return fetchWithFallback(orgId, 'pettyCashExpenses')
}

export function subscribePettyCashExpenses(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'pettyCashExpenses', onData, onError)
}

export async function recordPettyCashExpense(orgId, expenseData) {
  return submitPettyCashExpense(orgId, expenseData, {
    id: expenseData.supervisorUid || expenseData.submittedBy || 'supervisor',
    name: expenseData.supervisorName || expenseData.submittedByName || 'Supervisor',
    role: 'Supervisor',
  })
}

export async function approvePettyCashExpense(orgId, expenseId, approverName) {
  return managerApproveExpense(orgId, expenseId, '', {
    id: 'manager',
    name: approverName || 'Operations Manager',
  })
}
