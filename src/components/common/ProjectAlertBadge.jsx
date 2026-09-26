import React, { useState } from 'react'
import { AlertTriangle, Clock, CreditCard, ShieldAlert, X } from 'lucide-react'
import { evaluateProjectAlerts } from '../../utils/projectAlerts'

export default function ProjectAlertBadge({ project, compact = false, showDetailsOnClick = true }) {
  const [showModal, setShowModal] = useState(false)
  const alerts = evaluateProjectAlerts(project)

  if (!alerts || alerts.length === 0) return null

  // Highest severity alert
  const hasCritical = alerts.some((a) => a.severity === 'CRITICAL')
  const primaryAlert = alerts[0]

  const getIcon = (type) => {
    switch (type) {
      case 'EXPENSE_ALERT':
        return <AlertTriangle className="w-3 h-3" />
      case 'PAYMENT_ALERT':
        return <CreditCard className="w-3 h-3" />
      case 'END_DATE_ALERT':
        return <Clock className="w-3 h-3" />
      default:
        return <ShieldAlert className="w-3 h-3" />
    }
  }

  if (compact) {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (showDetailsOnClick) setShowModal(!showModal)
          }}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
            hasCritical
              ? 'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200'
              : 'bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200'
          }`}
          title={primaryAlert.message}
        >
          {getIcon(primaryAlert.type)}
          <span>{primaryAlert.badgeText}</span>
          {alerts.length > 1 && (
            <span className="ml-0.5 px-1 py-0.2 rounded-full bg-slate-900/10 text-[9px]">
              +{alerts.length - 1}
            </span>
          )}
        </button>

        {showModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
            onClick={(e) => {
              e.stopPropagation()
              setShowModal(false)
            }}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  Project Risk & Budget Alerts
                </h4>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {alerts.map((alt) => (
                  <div key={alt.id} className={`p-3 rounded-xl border ${alt.color} space-y-1`}>
                    <div className="flex items-center justify-between font-bold text-[11px]">
                      <span className="flex items-center gap-1">
                        {getIcon(alt.type)}
                        {alt.title}
                      </span>
                      <span className="uppercase text-[9px] px-1.5 py-0.5 rounded font-mono bg-white/60">
                        {alt.severity}
                      </span>
                    </div>
                    <p className="text-slate-800 leading-snug font-medium text-[11px]">{alt.message}</p>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 text-right">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {alerts.map((alt) => (
        <div
          key={alt.id}
          className={`px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${alt.color}`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${alt.dotColor}`} />
            <span className="font-bold">{alt.badgeText}:</span>
            <span className="text-[11px] font-medium opacity-90">{alt.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
