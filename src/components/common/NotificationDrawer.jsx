import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import StatusBadge from './StatusBadge'

export default function NotificationDrawer({ isOpen, onClose, role }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const navigate = useNavigate()

  if (!isOpen) return null

  function handleNotificationClick(item) {
    markAsRead(item.id)
    onClose()

    const basePath = role === 'Manager' ? '/manager' : '/organization'
    const requestType = String(item.requestType || item.type || '').toLowerCase()

    if (requestType.includes('payment') || requestType.includes('approval')) {
      navigate(`${basePath}/approvals`)
    } else if (requestType.includes('material') || requestType.includes('stock')) {
      navigate(`${basePath}/materials`)
    } else if (requestType.includes('tool') || requestType.includes('equipment')) {
      navigate(`${basePath}/tools`)
    } else if (requestType.includes('cash') || requestType.includes('petty')) {
      navigate(`${basePath}/petty-cash`)
    } else if (requestType.includes('workforce') || requestType.includes('attendance')) {
      navigate(`${basePath}/workforce`)
    } else if (requestType.includes('site')) {
      navigate(`${basePath}/sites`)
    } else {
      navigate(`${basePath}/dashboard`)
    }
  }

  function formatTimestamp(ts) {
    if (!ts) return 'Just now'
    const date = ts.toDate ? ts.toDate() : new Date(ts)
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
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Notifications</h2>
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
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
            {notifications.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                <p className="font-medium text-slate-500">No notifications yet.</p>
                <span className="text-xs text-slate-400 mt-1 block">New system updates and requests will show up here.</span>
              </div>
            ) : (
              notifications.map((item) => {
                const isRead = item.isRead || item.status === 'read'
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isRead
                        ? 'bg-white border-slate-200/80 opacity-75 hover:opacity-100 hover:border-slate-300 shadow-xs'
                        : 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-500/10 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">{item.title || 'System Alert'}</h4>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatTimestamp(item.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{item.body || item.message || 'Tap to inspect details.'}</p>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <span>{item.siteName || item.projectName || 'General'}</span>
                      {item.requestType && <StatusBadge status={item.requestType} />}
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
