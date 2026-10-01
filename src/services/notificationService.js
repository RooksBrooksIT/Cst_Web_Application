import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'

/**
 * ================================================================================
 * CST WHITE LABEL (eBRICKS) - NOTIFICATION SERVICE (WEB CLIENT IMPLEMENTATION)
 * Complies 100% with NOTIFICATION_ARCHITECTURE_AND_LOGIC_FLOW.txt
 * ================================================================================
 */

/**
 * Notification Types Registry (Section 2.1)
 */
export const NotificationType = Object.freeze({
  MATERIAL_REQUISITION: 'materialRequisition',
  TOOLS_REQUISITION: 'toolsRequisition',
  PAYMENT_REQUISITION: 'paymentRequisition',
  WORKFORCE_SCHEDULE: 'workforceSchedule',
  PETTY_CASH_REQUEST: 'pettyCashRequest',
  PETTY_CASH_TOPUP: 'pettyCashTopup',
  PETTY_CASH_DISPATCHED: 'pettyCashDispatched',
  ORGANIZATION_EXPENSE: 'organizationExpense',
  MANAGER_EXPENSE: 'managerExpense',
  SITE_ASSIGNMENT: 'siteAssignment',
  SITE_CREATED: 'siteCreated',
  PROJECT_CREATED: 'projectCreated',
  PROJECT_UPDATED: 'projectUpdated',
  MANAGER_ACCOUNT_CREATED: 'managerAccountCreated',
  SUPERVISOR_ACCOUNT_CREATED: 'supervisorAccountCreated',
  TOOL_MOVEMENT: 'toolMovement',
  DAILY_WORK_SCHEDULE: 'dailyWorkSchedule',
  SCHEDULED_REMINDER: 'scheduledReminder',
  SUBSCRIPTION_EXPIRY: 'subscriptionExpiry',
  GENERAL: 'general',
})

/**
 * Canonical Role Normalization (Section 6.4)
 * Handles American vs. British spellings, uppercase/lowercase, and role synonyms
 */
export function normalizeCanonicalRole(role) {
  if (!role) return 'all'
  const r = String(role).trim().toLowerCase()
  if (r === 'organisation' || r === 'organization' || r === 'admin' || r === 'org' || r === 'owner' || r === 'enterprise') {
    return 'organisation'
  }
  if (r === 'manager' || r === 'operations manager' || r === 'site manager' || r === 'project manager' || r.includes('manager') || r === 'config') {
    return 'manager'
  }
  if (r === 'supervisor' || r === 'site supervisor') {
    return 'supervisor'
  }
  if (r === 'manager_and_organisation' || r === 'manager_and_organization') {
    return 'manager_and_organisation'
  }
  return r
}

/**
 * Role Match Verification
 * Determines if a notification targeting a role applies to the current user
 */
export function matchesRole(notificationTargetRole, targetRoles, currentRole, userId, recipientId) {
  const normCurrent = normalizeCanonicalRole(currentRole)

  // Direct recipient match
  if (recipientId && userId && String(recipientId) === String(userId)) {
    return true
  }

  const normTarget = normalizeCanonicalRole(notificationTargetRole)
  const normRolesList = Array.isArray(targetRoles)
    ? targetRoles.map(normalizeCanonicalRole)
    : []

  if (normTarget === 'all' || normRolesList.includes('all')) return true

  if (normCurrent === 'organisation') {
    if (
      normTarget === 'organisation' ||
      normTarget === 'manager_and_organisation' ||
      normRolesList.includes('organisation') ||
      normRolesList.includes('manager_and_organisation')
    ) {
      return true
    }
  }

  if (normCurrent === 'manager') {
    if (
      normTarget === 'manager' ||
      normTarget === 'manager_and_organisation' ||
      normRolesList.includes('manager') ||
      normRolesList.includes('manager_and_organisation')
    ) {
      return true
    }
  }

  if (normCurrent === 'supervisor') {
    if (normTarget === 'supervisor' || normRolesList.includes('supervisor')) {
      return true
    }
  }

  return false
}

/**
 * Format Unique Notification ID matching Flutter schema (Section 4.2)
 */
export function generateNotificationId() {
  const ts = Date.now()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `NOTIF_${ts}_${rand}`
}

/**
 * --------------------------------------------------------------------------------
 * DUAL-COLLECTION PERSISTENCE ENGINE (Section 4.1 & 4.2)
 * Writes simultaneously to:
 * 1. Root: /notifications/{notificationId}
 * 2. Tenant: /organisation/{orgId}/notifications/{notificationId}
 * --------------------------------------------------------------------------------
 */
export async function _writeRecord(orgId, notificationPayload) {
  if (!orgId) throw new Error('orgId is required to dispatch notification')

  const id = notificationPayload.notificationId || notificationPayload.id || generateNotificationId()
  const nowTimestamp = serverTimestamp()

  const targetRole = notificationPayload.targetRole || notificationPayload.recipientRole || 'all'
  const targetRoles = Array.isArray(notificationPayload.targetRoles) && notificationPayload.targetRoles.length > 0
    ? notificationPayload.targetRoles
    : targetRole === 'manager_and_organisation'
    ? ['manager', 'organisation']
    : [targetRole]

  const title = notificationPayload.title || 'System Notification'
  const message = notificationPayload.message || notificationPayload.body || ''
  const type = notificationPayload.type || NotificationType.GENERAL
  const requestType = notificationPayload.requestType || type

  const fullPayload = {
    notificationId: id,
    id: id,
    title,
    message,
    body: message,
    type,
    requestType,
    priority: notificationPayload.priority || 'normal',
    isRead: false,
    recipientId: notificationPayload.recipientId || 'all',
    recipientRole: notificationPayload.recipientRole || targetRole,
    targetRole,
    targetRoles,
    forSupervisorName: notificationPayload.forSupervisorName || '',
    forSupervisorId: notificationPayload.forSupervisorId || '',
    forManagerName: notificationPayload.forManagerName || '',
    senderId: notificationPayload.senderId || '',
    senderName: notificationPayload.senderName || '',
    senderRole: notificationPayload.senderRole || '',
    siteId: notificationPayload.siteId || '',
    siteName: notificationPayload.siteName || '',
    requestId: notificationPayload.requestId || notificationPayload.docId || '',
    docId: notificationPayload.docId || notificationPayload.requestId || '',
    status: notificationPayload.status || 'Pending',
    actionRoute: notificationPayload.actionRoute || '',
    actionData: notificationPayload.actionData || {},
    data: {
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      notificationId: id,
      actionRoute: notificationPayload.actionRoute || '',
      requestId: notificationPayload.requestId || notificationPayload.docId || '',
      siteId: notificationPayload.siteId || '',
      siteName: notificationPayload.siteName || '',
      type,
      orgId,
      ...(notificationPayload.extraData || {}),
    },
    tenantId: orgId,
    orgId,
    forOrgId: orgId,
    createdAt: nowTimestamp,
    readAt: null,
  }

  const rootRef = doc(db, 'notifications', id)
  const tenantRef = doc(db, 'organisation', orgId, 'notifications', id)

  // Write in parallel with fault-tolerant error isolation (Section 6.1)
  const results = await Promise.allSettled([
    setDoc(tenantRef, fullPayload, { merge: true }),
    setDoc(rootRef, fullPayload, { merge: true }),
  ])

  const tenantFailed = results[0].status === 'rejected'
  const rootFailed = results[1].status === 'rejected'

  if (tenantFailed && rootFailed) {
    console.error('Failed to write notification to both collections:', results[0].reason, results[1].reason)
    throw results[0].reason
  } else if (tenantFailed) {
    console.warn('Tenant notification write warning:', results[0].reason)
  } else if (rootFailed) {
    console.warn('Root notification write warning (proceeding with tenant write):', results[1].reason)
  }

  return id
}

export async function createNotification(orgIdOrPayload, maybePayload) {
  if (typeof orgIdOrPayload === 'string') {
    return _writeRecord(orgIdOrPayload, maybePayload || {})
  }
  const payload = orgIdOrPayload || {}
  const orgId = payload.orgId || payload.tenantId
  return _writeRecord(orgId, payload)
}

/**
 * --------------------------------------------------------------------------------
 * FCM TOKEN LIFECYCLE MANAGEMENT (Section 2.2 #1 & Section 4.3)
 * --------------------------------------------------------------------------------
 */
export async function saveFcmToken({ orgId, role, userName, userId, token }) {
  if (!orgId || !userId || !token) return

  const canonicalRole = normalizeCanonicalRole(role)
  const tokenDocData = {
    token,
    userId: String(userId),
    userName: userName || 'Web User',
    userType: canonicalRole,
    role: canonicalRole,
    orgId,
    platform: 'web',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }

  const globalRef = doc(db, 'fcmTokens', `${orgId}_${canonicalRole}_${userId}`)
  const tenantRef = doc(db, 'organisation', orgId, 'fcmTokens', `${canonicalRole}_${userId}`)

  await Promise.allSettled([
    setDoc(tenantRef, tokenDocData, { merge: true }),
    setDoc(globalRef, tokenDocData, { merge: true }),
  ])
}

export async function deleteFcmToken({ orgId, role, userId }) {
  if (!orgId || !userId) return

  const canonicalRole = normalizeCanonicalRole(role)
  const globalRef = doc(db, 'fcmTokens', `${orgId}_${canonicalRole}_${userId}`)
  const tenantRef = doc(db, 'organisation', orgId, 'fcmTokens', `${canonicalRole}_${userId}`)

  await Promise.allSettled([
    deleteDoc(tenantRef),
    deleteDoc(globalRef),
  ])
}

/**
 * --------------------------------------------------------------------------------
 * MARK AS READ & BATCH SYNC (Section 2.2 #5)
 * --------------------------------------------------------------------------------
 */
export async function markAsRead(orgId, notificationId) {
  if (!notificationId) return

  const updates = {
    isRead: true,
    status: 'read',
    readAt: serverTimestamp(),
  }

  const ops = []
  if (orgId) {
    const tenantRef = doc(db, 'organisation', orgId, 'notifications', notificationId)
    ops.push(updateDoc(tenantRef, updates).catch(() => {}))
  }
  const rootRef = doc(db, 'notifications', notificationId)
  ops.push(updateDoc(rootRef, updates).catch(() => {}))

  await Promise.allSettled(ops)
}

export async function markAllReadForRole(orgId, role, user, notifications = []) {
  if (!orgId) return

  const unreadList = (notifications || []).filter((n) => !n.isRead && n.status !== 'read')
  if (unreadList.length === 0) return

  const batch = writeBatch(db)
  unreadList.forEach((n) => {
    if (n.id) {
      const tRef = doc(db, 'organisation', orgId, 'notifications', n.id)
      batch.update(tRef, {
        isRead: true,
        status: 'read',
        readAt: serverTimestamp(),
      })
    }
  })

  try {
    await batch.commit()
  } catch (err) {
    console.warn('Batch mark all read warning, falling back to individual updates:', err)
    await Promise.allSettled(unreadList.map((n) => markAsRead(orgId, n.id)))
  }
}

/**
 * --------------------------------------------------------------------------------
 * SPECIALIZED DOMAIN EVENT DISPATCHERS (Section 2.2 #4)
 * --------------------------------------------------------------------------------
 */

/**
 * 1. Material, Tool, Payment Requisitions -> Target: Manager & Organisation
 */
export async function notifyManagerAndOrganisation({
  orgId,
  title,
  message,
  type = NotificationType.MATERIAL_REQUISITION,
  requestId,
  docId,
  siteId,
  siteName,
  senderUser,
  senderRole = 'supervisor',
  priority = 'high',
  actionRoute,
  actionData,
}) {
  const actorName = senderUser?.displayName || senderUser?.fullName || senderUser?.name || 'Supervisor'
  const actorId = senderUser?.uid || senderUser?.id || ''

  return _writeRecord(orgId, {
    title: title || '📦 Requisition Pending Authorization',
    message: message || `New request submitted for ${siteName || 'site'} by ${actorName}`,
    type,
    requestType: type,
    priority,
    targetRole: 'manager_and_organisation',
    targetRoles: ['manager', 'organisation'],
    recipientRole: 'manager',
    recipientId: 'all',
    senderId: actorId,
    senderName: actorName,
    senderRole,
    siteId: siteId || '',
    siteName: siteName || '',
    requestId: requestId || docId || '',
    docId: docId || requestId || '',
    status: 'Pending',
    actionRoute: actionRoute || '/manager/approvals',
    actionData: actionData || { requestId, siteId, siteName },
  })
}

/**
 * 2. Site Logs, Petty Cash Requests -> Target: Manager
 */
export async function notifyManager({
  orgId,
  title,
  message,
  type = NotificationType.DAILY_WORK_SCHEDULE,
  requestId,
  siteId,
  siteName,
  forManagerName = '',
  senderUser,
  senderRole = 'supervisor',
  priority = 'normal',
  actionRoute,
  actionData,
}) {
  const actorName = senderUser?.displayName || senderUser?.fullName || senderUser?.name || 'Supervisor'
  const actorId = senderUser?.uid || senderUser?.id || ''

  return _writeRecord(orgId, {
    title: title || '📋 Site Log Submitted',
    message: message || `Site update logged for ${siteName || 'site'} by ${actorName}`,
    type,
    requestType: type,
    priority,
    targetRole: 'manager',
    targetRoles: ['manager'],
    recipientRole: 'manager',
    recipientId: 'all',
    forManagerName,
    senderId: actorId,
    senderName: actorName,
    senderRole,
    siteId: siteId || '',
    siteName: siteName || '',
    requestId: requestId || '',
    docId: requestId || '',
    status: 'Pending',
    actionRoute: actionRoute || '/manager/approvals',
    actionData: actionData || { requestId, siteId, siteName },
  })
}

/**
 * 3. Manager Expenses, Corporate Changes -> Target: Organisation HQ
 */
export async function notifyOrganisation({
  orgId,
  title,
  message,
  type = NotificationType.ORGANIZATION_EXPENSE,
  requestId,
  siteId,
  siteName,
  senderUser,
  senderRole = 'manager',
  priority = 'high',
  actionRoute,
  actionData,
}) {
  const actorName = senderUser?.displayName || senderUser?.fullName || senderUser?.name || 'Manager'
  const actorId = senderUser?.uid || senderUser?.id || ''

  return _writeRecord(orgId, {
    title: title || '🏢 Organization Level Request',
    message: message || `Operational update submitted by ${actorName}`,
    type,
    requestType: type,
    priority,
    targetRole: 'organisation',
    targetRoles: ['organisation'],
    recipientRole: 'organisation',
    recipientId: 'all',
    senderId: actorId,
    senderName: actorName,
    senderRole,
    siteId: siteId || '',
    siteName: siteName || '',
    requestId: requestId || '',
    docId: requestId || '',
    status: 'Pending',
    actionRoute: actionRoute || '/organization/approvals',
    actionData: actionData || { requestId, siteId, siteName },
  })
}

/**
 * 4. Approvals, Allocations, Cash Dispatches -> Target: Supervisor
 */
export async function notifySupervisor({
  orgId,
  title,
  message,
  type = NotificationType.MATERIAL_REQUISITION,
  requestId,
  siteId,
  siteName,
  forSupervisorName,
  forSupervisorId,
  senderUser,
  senderRole = 'manager',
  priority = 'normal',
  actionRoute,
  actionData,
}) {
  const actorName = senderUser?.displayName || senderUser?.fullName || senderUser?.name || 'Operations Manager'
  const actorId = senderUser?.uid || senderUser?.id || ''

  return _writeRecord(orgId, {
    title: title || '✅ Site Requisition Update',
    message: message || `Update regarding your request for ${siteName || 'site'} by ${actorName}`,
    type,
    requestType: type,
    priority,
    targetRole: 'supervisor',
    targetRoles: ['supervisor'],
    recipientRole: 'supervisor',
    recipientId: forSupervisorId || 'all',
    forSupervisorName: forSupervisorName || '',
    forSupervisorId: forSupervisorId || '',
    senderId: actorId,
    senderName: actorName,
    senderRole,
    siteId: siteId || '',
    siteName: siteName || '',
    requestId: requestId || '',
    docId: requestId || '',
    status: 'Approved',
    actionRoute: actionRoute || '',
    actionData: actionData || { requestId, siteId, siteName },
  })
}

/**
 * 5. Site Assignment -> Target: Assigned Supervisor
 */
export async function notifySiteAssignment({
  orgId,
  siteId,
  siteName,
  supervisorId,
  supervisorName,
  senderUser,
  senderRole = 'organisation',
}) {
  const actorName = senderUser?.displayName || senderUser?.fullName || senderUser?.name || 'Administrator'
  const actorId = senderUser?.uid || senderUser?.id || ''

  return _writeRecord(orgId, {
    title: '🏗️ Site Assignment Notice',
    message: `You have been assigned as Site Supervisor for ${siteName || 'a new site'} by ${actorName}.`,
    type: NotificationType.SITE_ASSIGNMENT,
    requestType: 'site_assignment',
    priority: 'high',
    targetRole: 'supervisor',
    targetRoles: ['supervisor'],
    recipientRole: 'supervisor',
    recipientId: supervisorId || 'all',
    forSupervisorName: supervisorName || '',
    forSupervisorId: supervisorId || '',
    senderId: actorId,
    senderName: actorName,
    senderRole,
    siteId: siteId || '',
    siteName: siteName || '',
    actionRoute: '/sites',
    actionData: { siteId, siteName },
  })
}

/**
 * 6. Welcome / Account Creation Notifications
 */
export async function notifyAccountCreated({
  orgId,
  userRole,
  userId,
  userName,
  userEmail,
  senderUser,
}) {
  const isManager = normalizeCanonicalRole(userRole) === 'manager'
  const type = isManager ? NotificationType.MANAGER_ACCOUNT_CREATED : NotificationType.SUPERVISOR_ACCOUNT_CREATED

  return _writeRecord(orgId, {
    title: '🎉 Welcome to CST White Label',
    message: `Welcome ${userName || 'User'}! Your ${isManager ? 'Manager' : 'Supervisor'} account has been configured.`,
    type,
    requestType: 'account_created',
    priority: 'normal',
    targetRole: isManager ? 'manager' : 'supervisor',
    targetRoles: [isManager ? 'manager' : 'supervisor'],
    recipientRole: isManager ? 'manager' : 'supervisor',
    recipientId: userId || 'all',
    forSupervisorName: isManager ? '' : userName,
    forManagerName: isManager ? userName : '',
    senderId: senderUser?.uid || 'system_admin',
    senderName: senderUser?.displayName || 'Administrator',
    senderRole: 'organisation',
    actionRoute: isManager ? '/manager/dashboard' : '/',
    actionData: { userEmail, userRole },
  })
}

/**
 * 7. Site or Project Created / Updated -> Target: Org & Managers
 */
export async function notifyProjectOrSiteEvent({
  orgId,
  isProject = true,
  isUpdate = false,
  itemId,
  itemName,
  siteCode,
  senderUser,
  senderRole = 'organisation',
}) {
  const actionText = isUpdate ? 'updated' : 'registered'
  const entityText = isProject ? 'Project' : 'Site'
  const type = isProject
    ? isUpdate ? NotificationType.PROJECT_UPDATED : NotificationType.PROJECT_CREATED
    : NotificationType.SITE_CREATED

  const actorName = senderUser?.displayName || senderUser?.fullName || senderUser?.name || 'Administrator'

  return _writeRecord(orgId, {
    title: `🏗️ ${entityText} ${isUpdate ? 'Updated' : 'Registered'}`,
    message: `${entityText} "${itemName || 'Untitled'}" was ${actionText} by ${actorName}.`,
    type,
    requestType: isProject ? 'project' : 'site',
    priority: 'normal',
    targetRole: 'manager_and_organisation',
    targetRoles: ['manager', 'organisation'],
    recipientRole: 'all',
    recipientId: 'all',
    senderId: senderUser?.uid || '',
    senderName: actorName,
    senderRole,
    siteId: itemId || '',
    siteName: itemName || '',
    actionRoute: isProject ? '/organization/projects' : '/organization/sites',
    actionData: { itemId, itemName, siteCode },
  })
}

/**
 * 8. Daily Supervisor Site Log Reminder (Scheduled Notifications - Section 4.4 & 5.4)
 */
export async function scheduleDailySupervisorReminder({
  orgId,
  siteId,
  siteName,
  supervisorId,
  supervisorName,
  scheduledTimeIso,
}) {
  if (!orgId) throw new Error('orgId is required')

  const scheduleId = `SCHED_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  const scheduledDate = scheduledTimeIso ? new Date(scheduledTimeIso) : new Date(Date.now() + 86400000)

  const payload = {
    id: scheduleId,
    scheduleId,
    title: '📋 Daily Site Log Reminder',
    body: `Please submit today's site progress, workforce entries, and material consumption for ${siteName || 'your site'}.`,
    targetRole: 'supervisor',
    forSupervisorName: supervisorName || '',
    forSupervisorId: supervisorId || '',
    siteId: siteId || '',
    siteName: siteName || '',
    orgId,
    forOrgId: orgId,
    requestType: 'daily_site_log',
    repeat: 'daily',
    status: 'pending',
    scheduledAt: scheduledDate,
    createdAt: serverTimestamp(),
    deliveredCount: 0,
    lastDeliveredAt: null,
  }

  const globalSchedRef = doc(db, 'scheduled_notifications', scheduleId)
  const tenantSchedRef = doc(db, 'organisation', orgId, 'scheduled_notifications', scheduleId)

  await Promise.allSettled([
    setDoc(tenantSchedRef, payload),
    setDoc(globalSchedRef, payload),
  ])

  return scheduleId
}
