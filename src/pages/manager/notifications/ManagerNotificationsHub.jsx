import React, { useState, useMemo } from 'react'
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  Check,
  Building2,
  Package,
  Wrench,
  DollarSign,
  ArrowRight,
  Sparkles,
  Users,
} from 'lucide-react'
import { evaluateAllProjectAlerts } from '../../../utils/projectAlerts'
import { useNotifications } from '../../../hooks/useNotifications'

export default function ManagerNotificationsHub({
  orgId,
  dashboardData = {},
  onNavigate,
  onNotify,
}) {
  const { notifications, markAsRead, markAllAsRead } = useNotifications()
  const [filterType, setFilterType] = useState('ALL') // 'ALL' | 'UNREAD' | 'APPROVAL' | 'STOCK' | 'SYSTEM'
  const [localReadIds, setLocalReadIds] = useState(new Set())

  // Dynamically compute real-time priority alerts from dashboard streams + real-time Firestore notifications
  const alerts = useMemo(() => {
    const list = []

    // 0. Real-Time Firestore Notifications (Section 2.1 & 2.5)
    notifications.forEach((item) => {
      const type = String(item.type || item.requestType || '').toLowerCase()
      const title = item.title || 'System Notification'
      const message = item.body || item.message || ''

      let targetTab = 'dashboard'
      let icon = Bell
      let color = 'text-blue-600 bg-blue-50'
      let category = 'System Update'
      let filterCategory = 'SYSTEM'

      if (type.includes('material') || message.toLowerCase().includes('material')) {
        targetTab = 'approvals'
        icon = Package
        color = 'text-blue-600 bg-blue-50'
        category = 'Material Request'
        filterCategory = 'APPROVAL'
      } else if (type.includes('tool') || message.toLowerCase().includes('tool')) {
        targetTab = 'approvals'
        icon = Wrench
        color = 'text-amber-600 bg-amber-50'
        category = 'Equipment Request'
        filterCategory = 'APPROVAL'
      } else if (type.includes('cash') || type.includes('payment') || type.includes('expense')) {
        targetTab = type.includes('cash') ? 'pettyCash' : 'approvals'
        icon = DollarSign
        color = 'text-emerald-600 bg-emerald-50'
        category = 'Finance & Expense'
        filterCategory = 'APPROVAL'
      } else if (type.includes('workforce') || type.includes('schedule') || type.includes('log')) {
        targetTab = 'workforce'
        icon = Users
        color = 'text-purple-600 bg-purple-50'
        category = 'Workforce & Daily Log'
        filterCategory = 'SYSTEM'
      } else if (type.includes('site') || type.includes('project')) {
        targetTab = 'sites'
        icon = Building2
        color = 'text-indigo-600 bg-indigo-50'
        category = 'Site Management'
        filterCategory = 'SYSTEM'
      }

      const ts = item.createdAt?.toDate
        ? item.createdAt.toDate().getTime()
        : item.createdAt?.seconds
        ? item.createdAt.seconds * 1000
        : item.createdAt
        ? new Date(item.createdAt).getTime()
        : Date.now()

      list.push({
        id: item.id,
        isFirestoreNotification: true,
        originalItem: item,
        type: filterCategory,
        category,
        title,
        message,
        timestamp: ts,
        targetTab,
        priority: item.priority || 'normal',
        icon,
        color,
        isReadInFirestore: item.isRead || item.status === 'read',
      })
    })

    // 1. Site Supervisor Expense Claims
    const pendingClaims = (dashboardData.pendingExpenses || []).filter(
      (e) => e.status === 'pending_manager_review' || !e.status
    )
    pendingClaims.forEach((claim) => {
      list.push({
        id: `claim_${claim.id || claim.entryId}`,
        type: 'APPROVAL',
        category: 'Site Expense Claim',
        title: `Expense Claim: ₹${(claim.totalAmount || 0).toLocaleString('en-IN')}`,
        message: `${claim.siteName || 'Site'} • Submitted by ${claim.supervisorName || 'Supervisor'}`,
        timestamp: claim.date?.seconds ? claim.date.seconds * 1000 : Date.now(),
        targetTab: 'approvals',
        priority: 'high',
        icon: DollarSign,
        color: 'text-purple-600 bg-purple-50',
      })
    })

    // 2. Material Requisitions
    const pendingMaterials = (dashboardData.pendingMaterialRequests || []).filter(
      (m) => m.status === 'pending_manager_review' || !m.status
    )
    pendingMaterials.forEach((mat) => {
      list.push({
        id: `mat_${mat.id || mat.requestId}`,
        type: 'APPROVAL',
        category: 'Material Request',
        title: `Requisition: ${mat.requestedQty || mat.quantity || 1} ${mat.unit || 'Units'} of ${mat.materialName}`,
        message: `${mat.siteName || 'Site'} • Urgency: ${mat.urgency || 'Normal'}`,
        timestamp: mat.createdAt?.seconds ? mat.createdAt.seconds * 1000 : Date.now(),
        targetTab: 'approvals',
        priority: mat.urgency === 'Critical' ? 'critical' : 'normal',
        icon: Package,
        color: 'text-blue-600 bg-blue-50',
      })
    })

    // 3. Equipment Requests
    const pendingTools = (dashboardData.pendingToolRequests || []).filter(
      (t) => t.status === 'pending_manager_review' || !t.status
    )
    pendingTools.forEach((tool) => {
      list.push({
        id: `tool_${tool.id || tool.requestId}`,
        type: 'APPROVAL',
        category: 'Equipment Requisition',
        title: `Tool Dispatch: ${tool.toolName || 'Machinery'}`,
        message: `Requested for ${tool.siteName || 'Project Site'}`,
        timestamp: tool.createdAt?.seconds ? tool.createdAt.seconds * 1000 : Date.now(),
        targetTab: 'approvals',
        priority: 'normal',
        icon: Wrench,
        color: 'text-amber-600 bg-amber-50',
      })
    })

    // 4. Low Stock Alerts
    const lowStock = (dashboardData.materials || []).filter((m) => {
      const stock = Number(m.currentTotalStock || m.currentStock || 0)
      const min = Number(m.minReorderLevel || 20)
      return stock <= min
    })
    lowStock.forEach((m) => {
      list.push({
        id: `stock_${m.id || m.materialId}`,
        type: 'STOCK',
        category: 'Low Stock Alert',
        title: `Replenish: ${m.materialName || m.name}`,
        message: `Current stock: ${m.currentTotalStock || m.currentStock || 0} ${m.unitName || m.unit} (Min: ${m.minReorderLevel || 20})`,
        timestamp: Date.now() - 3600000,
        targetTab: 'materialsStock',
        priority: 'high',
        icon: AlertTriangle,
        color: 'text-rose-600 bg-rose-50',
      })
    })

    // 5. Budget, Expense & Planned End-Date Project Alerts
    const projectAlertsEval = evaluateAllProjectAlerts(dashboardData.sites || [])
    projectAlertsEval.projectAlerts.forEach((pa) => {
      pa.alerts.forEach((alert) => {
        list.push({
          id: `palert_${pa.projectId}_${alert.id}`,
          type: 'PROJECT_ALERT',
          category: alert.type === 'expense' ? 'Budget Expense Alert' : alert.type === 'payment' ? 'Customer Payment Alert' : 'Project End-Date Alert',
          title: `${alert.badgeLabel}: ${pa.projectName}`,
          message: `${alert.description} (Code: ${pa.siteCode || 'SITE'})`,
          timestamp: Date.now() - 1800000,
          targetTab: 'sites',
          priority: alert.severity === 'critical' ? 'critical' : 'high',
          icon: AlertTriangle,
          color: alert.severity === 'critical' ? 'text-rose-600 bg-rose-50' : alert.severity === 'warning' ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50',
        })
      })
    })

    return list.sort((a, b) => b.timestamp - a.timestamp)
  }, [dashboardData, notifications])

  const isAlertUnread = (alert) => {
    if (alert.isFirestoreNotification) {
      return !alert.isReadInFirestore && !localReadIds.has(alert.id)
    }
    return !localReadIds.has(alert.id)
  }

  const toggleRead = (alert) => {
    if (alert.isFirestoreNotification) {
      markAsRead(alert.id)
    }
    setLocalReadIds((prev) => {
      const next = new Set(prev)
      if (next.has(alert.id)) next.delete(alert.id)
      else next.add(alert.id)
      return next
    })
  }

  const handleMarkAllRead = () => {
    markAllAsRead()
    setLocalReadIds(new Set(alerts.map((a) => a.id)))
    onNotify?.('All notifications marked as read', 'info')
  }

  const handleTakeAction = (alert) => {
    if (alert.isFirestoreNotification) {
      markAsRead(alert.id)
    }
    if (alert.targetTab) {
      onNavigate?.(alert.targetTab)
    }
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const isUnread = isAlertUnread(a)
      if (filterType === 'UNREAD') return isUnread
      if (filterType === 'PROJECT_ALERT') return a.type === 'PROJECT_ALERT'
      if (filterType === 'APPROVAL') return a.type === 'APPROVAL'
      if (filterType === 'STOCK') return a.type === 'STOCK'
      if (filterType === 'SYSTEM') return a.type === 'SYSTEM'
      return true
    })
  }, [alerts, filterType, localReadIds, notifications])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
              Operations Alert Feed
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live operations alerts, real-time Firestore requisitions, project budget threshold warnings, and supply chain updates.
          </p>
        </div>

        <button
          onClick={handleMarkAllRead}
          disabled={alerts.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Mark All Read</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'ALL', label: `All Alerts (${alerts.length})` },
          { id: 'UNREAD', label: `Unread (${alerts.filter(isAlertUnread).length})` },
          { id: 'APPROVAL', label: `Approvals (${alerts.filter((a) => a.type === 'APPROVAL').length})` },
          { id: 'PROJECT_ALERT', label: `Project Risk (${alerts.filter((a) => a.type === 'PROJECT_ALERT').length})` },
          { id: 'STOCK', label: `Stock Alerts (${alerts.filter((a) => a.type === 'STOCK').length})` },
          { id: 'SYSTEM', label: `System (${alerts.filter((a) => a.type === 'SYSTEM').length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-4 py-2 rounded-xl font-medium transition-all cursor-pointer ${
              filterType === tab.id
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alert Feed */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">All clear! No pending notifications</p>
          <p className="text-xs text-slate-400 mt-1">
            All approvals, stage milestones, and supply chain telemetry are up to date.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const isUnread = isAlertUnread(alert)
            const Icon = alert.icon || Bell
            const timeAgo = new Date(alert.timestamp).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <div
                key={alert.id}
                className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                  isUnread
                    ? 'bg-white border-blue-200 shadow-xs'
                    : 'bg-slate-50/60 border-slate-200/60 opacity-80'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${alert.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {alert.category}
                      </span>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{alert.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                    <span className="text-[11px] text-slate-400 mt-2 block">{timeAgo}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleRead(alert)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                    title={isUnread ? 'Mark Read' : 'Mark Unread'}
                  >
                    <Check className="w-4 h-4" />
                  </button>

                  {alert.targetTab && (
                    <button
                      onClick={() => handleTakeAction(alert)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
                    >
                      <span>Take Action</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
