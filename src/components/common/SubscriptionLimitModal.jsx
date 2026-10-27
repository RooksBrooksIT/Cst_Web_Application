import React from 'react'
import { ShieldAlert, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import FreeTrialUserLimitModal from './FreeTrialUserLimitModal'

/**
 * Universal Subscription Quota & Limit Enforcement Modal
 * Complies with Section 5 of SUBSCRIPTION_PLAN_LIMITATIONS.txt
 * Displays when a user hits resource limits (Sites, Managers, Supervisors, Drawings, or Expired Subscription)
 */
export default function SubscriptionLimitModal(props) {
  const {
    isOpen,
    onClose,
    title = 'Subscription Quota Reached',
    message,
    planName = 'Free Trial',
    currentCount,
    maxLimit,
    recommendedPlan = 'Gold',
    resourceType = 'Resource',
    onUpgrade,
    limitData,
    isTrialLimit,
  } = props

  if (!isOpen) return null

  // If this is a Free Trial user quota limit, display the dedicated FreeTrialUserLimitModal
  if (isTrialLimit || limitData?.isTrialLimit) {
    const data = limitData || props
    return (
      <FreeTrialUserLimitModal
        isOpen={isOpen}
        onClose={onClose}
        title={data.title || 'Free Trial User Limit Reached'}
        message={data.message || message}
        adminCount={data.adminCount ?? 1}
        managersCount={data.managersCount ?? data.currentManagersCount ?? 0}
        supervisorsCount={data.supervisorsCount ?? data.currentSupervisorsCount ?? 0}
        workersCount={data.workersCount ?? data.currentWorkersCount ?? 0}
        onUpgrade={onUpgrade}
      />
    )
  }

  const isExpired = title?.toLowerCase().includes('expired') || message?.toLowerCase().includes('expired')
  const isTrial = String(planName || '').toLowerCase().includes('trial') || String(planName || '').toLowerCase().includes('free')
  const upgradeLabel = isExpired ? (isTrial ? 'Select a Plan' : 'Renew Subscription') : `Upgrade to ${recommendedPlan}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
        {/* Top Icon Badge */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-xs border ${
            isExpired
              ? 'bg-rose-50 border-rose-200 text-rose-600'
              : 'bg-amber-50 border-amber-200 text-amber-600'
          }`}
        >
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Header & Description */}
        <div>
          <span
            className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
              isExpired
                ? 'bg-rose-100/80 text-rose-800'
                : 'bg-amber-100/80 text-amber-800'
            }`}
          >
            {isExpired ? 'Subscription Inactive' : 'Quota Limit Exceeded'}
          </span>
          <h3 className="text-lg font-black text-slate-900 mt-2">{title}</h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {message ||
              `You have reached the maximum allowed limit for ${resourceType.toLowerCase()}s on your current subscription plan.`}
          </p>
        </div>

        {/* Current Plan vs Quota Breakdown */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-left space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Current Plan:</span>
            <span className="font-bold text-slate-800 px-2 py-0.5 bg-slate-200/70 rounded-md text-[11px]">
              {planName}
            </span>
          </div>

          {currentCount !== undefined && maxLimit !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">{resourceType} Quota:</span>
              <span className="font-semibold text-rose-600 font-mono text-[11px]">
                {currentCount} / {maxLimit === 999999 ? 'Unlimited' : maxLimit} (Limit Reached)
              </span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
            <span className="text-slate-500">Recommended Next Tier:</span>
            <strong className="text-blue-700 font-bold">{recommendedPlan}</strong>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>

          {onUpgrade ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onUpgrade()
              }}
              className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>{upgradeLabel}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Link
              to="/organization/subscription"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>{upgradeLabel}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
