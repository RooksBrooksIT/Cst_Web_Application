import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  Package,
  Wrench,
  DollarSign,
  Users,
  Building2,
  CheckCircle2,
  X,
  Volume2,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import StatusBadge from './StatusBadge'

function getCategoryIcon(type, requestType) {
  const t = String(type || requestType || '').toLowerCase()
  if (t.includes('material')) return { icon: Package, color: 'text-blue-600 bg-blue-50 border-blue-200' }
  if (t.includes('tool') || t.includes('equipment')) return { icon: Wrench, color: 'text-amber-600 bg-amber-50 border-amber-200' }
  if (t.includes('cash') || t.includes('payment') || t.includes('expense')) return { icon: DollarSign, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
  if (t.includes('workforce') || t.includes('worker') || t.includes('supervisor')) return { icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-200' }
  if (t.includes('site') || t.includes('project')) return { icon: Building2, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' }
  return { icon: Bell, color: 'text-blue-600 bg-blue-50 border-blue-200' }
}

export default function NotificationDrawer({ isOpen, onClose, role = 'User' }) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    navigateNotification,
    requestBrowserPermission,
  } = useNotifications()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('ALL')
  const [permState, setPermState] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  )

  const handleEnableDesktopNotifications = async () => {
    const res = await requestBrowserPermission()
    setPermState(res)
  }

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const isUnread = !item.isRead && item.status !== 'read'
      if (activeTab === 'UNREAD') return isUnread

      const t = String(item.type || item.requestType || '').toLowerCase()
      if (activeTab === 'APPROVALS') {
        return (
          t.includes('requisition') ||
          t.includes('request') ||
          t.includes('approval') ||
          t.includes('claim') ||
          t.includes('expense')
        )
      }
      if (activeTab === 'MATERIALS') {
        return t.includes('material') || t.includes('indent') || t.includes('stock')
      }
      if (activeTab === 'PETTY_CASH') {
        return t.includes('cash') || t.includes('petty')
      }
      return true
    })
  }, [notifications, activeTab])

  if (!isOpen) return null

  function formatTimestamp(ts) {
    if (!ts) return 'Just now'
    const date = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (Number.isNaN(date.getTime())) return 'Recently'
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{role} Notifications</h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop Alert Prompt if Default */}
          {permState === 'default' && (
            <div className="px-4 py-2.5 bg-blue-50/80 border-b border-blue-100 flex items-center justify-between gap-3 text-xs text-blue-800">
              <div className="flex items-center gap-2 min-w-0">
                <Volume2 className="w-4 h-4 shrink-0 text-blue-600" />
                <span className="truncate">Enable desktop alerts for instant notifications.</span>
              </div>
              <button
                type="button"
                onClick={handleEnableDesktopNotifications}
                className="px-2 py-1 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md shrink-0 transition-colors cursor-pointer text-[11px]"
              >
                Enable
              </button>
            </div>
          )}

          {/* Filter Tabs (Section 2.5) */}
          <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs">
            {[
              { id: 'ALL', label: `All (${notifications.length})` },
              { id: 'UNREAD', label: `Unread (${unreadCount})` },
              { id: 'APPROVALS', label: 'Approvals' },
              { id: 'MATERIALS', label: 'Materials' },
              { id: 'PETTY_CASH', label: 'Petty Cash' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm">
                <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No notifications in this view.</p>
                <span className="text-xs text-slate-400 mt-1 block">
                  New system updates and requests will appear here in real time.
                </span>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const isRead = item.isRead || item.status === 'read'
                const { icon: Icon, color } = getCategoryIcon(item.type, item.requestType)

                return (
                  <div
                    key={item.id}
                    onClick={() => navigateNotification(item, navigate, onClose)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isRead
                        ? 'bg-white border-slate-200/80 opacity-80 hover:opacity-100 hover:border-slate-300 shadow-xs'
                        : 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-500/10 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${color}`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-slate-900 truncate">
                            {item.title || 'System Notification'}
                          </h4>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                            {formatTimestamp(item.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                          {item.body || item.message || 'Tap to inspect details.'}
                        </p>

                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                          <span className="truncate max-w-[160px] font-medium text-slate-600">
                            {item.siteName || item.projectName || 'General'}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.requestType && <StatusBadge status={item.requestType} />}
                            {!isRead && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  markAsRead(item.id)
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 transition-colors"
                                title="Mark as read"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
