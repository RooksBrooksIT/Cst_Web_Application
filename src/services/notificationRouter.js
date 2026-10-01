import { markAsRead, normalizeCanonicalRole, NotificationType } from './notificationService.js'

/**
 * ================================================================================
 * NOTIFICATION ROUTER (WEB DEEP LINKING & FALLBACKS - Section 2.4)
 * Handles tap debouncing (600ms), auto mark-as-read sync, and destination mapping.
 * ================================================================================
 */

let lastNavigationTime = 0
const DEBOUNCE_THRESHOLD_MS = 600

/**
 * Resolves destination route based on notification type and user role
 */
export function resolveNotificationRoute(item, currentRole) {
  const role = normalizeCanonicalRole(currentRole)
  const isManager = role === 'manager'
  const isOrg = role === 'organisation'
  const basePath = isManager ? '/manager' : '/organization'

  const type = String(item.type || item.requestType || '').toLowerCase()
  const reqType = String(item.requestType || '').toLowerCase()
  const title = String(item.title || '').toLowerCase()
  const message = String(item.message || item.body || '').toLowerCase()
  const text = `${type} ${reqType} ${title} ${message}`

  // 1. Account Creation / Welcome
  if (
    type === NotificationType.MANAGER_ACCOUNT_CREATED.toLowerCase() ||
    type === NotificationType.SUPERVISOR_ACCOUNT_CREATED.toLowerCase() ||
    text.includes('welcome') ||
    text.includes('account created')
  ) {
    return isManager ? '/manager/dashboard' : '/organization/team'
  }

  // 2. Material Requisitions & Indents
  if (
    type === NotificationType.MATERIAL_REQUISITION.toLowerCase() ||
    text.includes('material') ||
    text.includes('indent') ||
    text.includes('stock')
  ) {
    if (isManager) return '/manager/approvals'
    if (isOrg) return '/organization/approvals'
    return `${basePath}/materials`
  }

  // 3. Tools / Equipment Requisitions & Movement
  if (
    type === NotificationType.TOOLS_REQUISITION.toLowerCase() ||
    type === NotificationType.TOOL_MOVEMENT.toLowerCase() ||
    text.includes('tool') ||
    text.includes('equipment') ||
    text.includes('machinery')
  ) {
    if (isManager) return '/manager/approvals'
    if (isOrg) return '/organization/approvals'
    return `${basePath}/tools`
  }

  // 4. Payment Requisitions
  if (
    type === NotificationType.PAYMENT_REQUISITION.toLowerCase() ||
    text.includes('payment requisition') ||
    text.includes('site payment')
  ) {
    if (isManager) return '/manager/approvals'
    return '/organization/approvals'
  }

  // 5. Petty Cash Requests / Top-ups / Dispatches
  if (
    type === NotificationType.PETTY_CASH_REQUEST.toLowerCase() ||
    type === NotificationType.PETTY_CASH_TOPUP.toLowerCase() ||
    type === NotificationType.PETTY_CASH_DISPATCHED.toLowerCase() ||
    text.includes('petty') ||
    text.includes('cash')
  ) {
    return `${basePath}/petty-cash`
  }

  // 6. Corporate / Manager Expenses
  if (
    type === NotificationType.ORGANIZATION_EXPENSE.toLowerCase() ||
    type === NotificationType.MANAGER_EXPENSE.toLowerCase() ||
    text.includes('expense') ||
    text.includes('claim')
  ) {
    if (isManager) return '/manager/approvals'
    return '/organization/approvals'
  }

  // 7. Workforce & Labour Allocation
  if (
    type === NotificationType.WORKFORCE_SCHEDULE.toLowerCase() ||
    type === NotificationType.DAILY_WORK_SCHEDULE.toLowerCase() ||
    text.includes('workforce') ||
    text.includes('labour') ||
    text.includes('attendance') ||
    text.includes('worker')
  ) {
    if (isManager) return '/manager/workforce'
    return '/organization/team'
  }

  // 8. Site & Project Events
  if (
    type === NotificationType.SITE_ASSIGNMENT.toLowerCase() ||
    type === NotificationType.SITE_CREATED.toLowerCase() ||
    type === NotificationType.PROJECT_CREATED.toLowerCase() ||
    type === NotificationType.PROJECT_UPDATED.toLowerCase() ||
    text.includes('project') ||
    text.includes('site')
  ) {
    if (isManager) return '/manager/sites'
    return '/organization/projects'
  }

  // 9. Subscription Expiry Warning
  if (type === NotificationType.SUBSCRIPTION_EXPIRY.toLowerCase() || text.includes('subscription')) {
    return '/organization/subscription'
  }

  // 10. Check if actionRoute directly points to a valid web route
  if (item.actionRoute && typeof item.actionRoute === 'string' && item.actionRoute.startsWith('/')) {
    // If it's a mobile route like '/manager_material_approval', map it
    if (item.actionRoute.includes('approval') || item.actionRoute.includes('requisition')) {
      return `${basePath}/approvals`
    }
    if (item.actionRoute.includes('petty')) {
      return `${basePath}/petty-cash`
    }
    if (item.actionRoute.includes('material')) {
      return isManager ? '/manager/approvals' : '/organization/inventory'
    }
  }

  // Fallbacks (Section 2.4)
  if (isManager) return '/manager/notifications'
  if (isOrg) return '/organization/dashboard'
  return `${basePath}/dashboard`
}

/**
 * Executes debounced tap navigation with automatic read mark sync
 */
export async function handleNotificationNavigation({
  item,
  currentRole,
  orgId,
  navigate,
  onClose,
}) {
  if (!item) return

  // 600ms Tap Debounce Protection
  const now = Date.now()
  if (now - lastNavigationTime < DEBOUNCE_THRESHOLD_MS) {
    return
  }
  lastNavigationTime = now

  // Auto Read-Sync (Section 2.4 #2)
  if (!item.isRead && item.status !== 'read') {
    markAsRead(orgId || item.orgId, item.id || item.notificationId).catch(() => {})
  }

  if (onClose) onClose()

  const destination = resolveNotificationRoute(item, currentRole)
  if (navigate && destination) {
    navigate(destination, { state: { notificationItem: item, actionData: item.actionData } })
  }
}
