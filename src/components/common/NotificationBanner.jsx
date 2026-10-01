import { useEffect, useState } from 'react'
import {
  Bell,
  Package,
  Wrench,
  DollarSign,
  Building2,
  Users,
  ExternalLink,
  X,
} from 'lucide-react'

function getNotificationIcon(type, requestType) {
  const t = String(type || requestType || '').toLowerCase()
  if (t.includes('material')) return { icon: Package, color: 'text-blue-600 bg-blue-50 border-blue-200' }
  if (t.includes('tool') || t.includes('equipment')) return { icon: Wrench, color: 'text-amber-600 bg-amber-50 border-amber-200' }
  if (t.includes('cash') || t.includes('payment') || t.includes('expense')) return { icon: DollarSign, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
  if (t.includes('workforce') || t.includes('worker') || t.includes('supervisor')) return { icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-200' }
  if (t.includes('site') || t.includes('project')) return { icon: Building2, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' }
  return { icon: Bell, color: 'text-blue-600 bg-blue-50 border-blue-200' }
}

export default function NotificationBanner({ notification, onAction, onDismiss }) {
  const [progress, setProgress] = useState(100)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (!notification) return

    const duration = 4500 // 4.5 seconds (Section 2.3 #5)
    const interval = 50
    const step = (interval / duration) * 100

    const timer = setInterval(() => {
      if (!isPaused) {
        setProgress((prev) => {
          if (prev <= step) {
            clearInterval(timer)
            onDismiss()
            return 0
          }
          return prev - step
        })
      }
    }, interval)

    return () => clearInterval(timer)
  }, [notification, isPaused, onDismiss])

  if (!notification) return null

  const { icon: Icon, color } = getNotificationIcon(notification.type, notification.requestType)
  const title = notification.title || 'System Notification'
  const message = notification.message || notification.body || 'New operational update received.'

  return (
    <div
      className="fixed top-4 right-4 z-50 max-w-sm w-full transition-all duration-300 animate-in slide-in-from-top-4 fade-in"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative overflow-hidden bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xl p-4 ring-1 ring-slate-900/5">
        <div className="flex items-start gap-3.5">
          {/* Leading Icon */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${color}`}>
            <Icon className="w-5 h-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                Real-Time Alert
              </span>
              {notification.siteName && (
                <span className="text-[11px] text-slate-500 font-medium truncate max-w-[120px]">
                  • {notification.siteName}
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1">
              {title}
            </h4>
            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
              {message}
            </p>

            {/* Action Bar */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onAction(notification)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <span>VIEW</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onDismiss}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4.5s Auto-dismiss progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
