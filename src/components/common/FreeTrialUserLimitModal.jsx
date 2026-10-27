import React from 'react'
import { Users, ArrowUpRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Free Trial User Limit Modal
 * Displays when a Free Trial organization attempts to exceed the allowed
 * 3 eligible users (1 Admin + 1 Manager + 1 Site Supervisor).
 * Workers are strictly excluded from this limit.
 */
export default function FreeTrialUserLimitModal({
  isOpen,
  onClose,
  title = 'Free Trial User Limit Reached',
  message,
  adminCount = 1,
  managersCount = 0,
  supervisorsCount = 0,
  workersCount = 0,
  onUpgrade,
}) {
  if (!isOpen) return null

  const totalEligible = adminCount + managersCount + supervisorsCount
  const maxEligible = 3

  const defaultMessage =
    totalEligible >= maxEligible
      ? 'Your organization has used all 3 eligible user slots under the Free Trial plan. Upgrade to a paid plan to expand your workforce capacity.'
      : 'You have reached the maximum allowed limit for this role under the Free Trial plan. Upgrade to a paid plan to add more team members.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 text-center space-y-5 relative">
        {/* Top Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
          <Users className="w-8 h-8" />
        </div>

        {/* Header & Description */}
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 inline-block">
            Free Trial Quota Limit
          </span>
          <h3 className="text-xl font-black text-slate-900 mt-2">{title}</h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
            {message || defaultMessage}
          </p>
        </div>

        {/* Usage Summary Card */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-left space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Eligible Users Allocation
            </span>
            <span className="font-extrabold text-[#0B3470] bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10px]">
              {totalEligible} / {maxEligible} Max Slots
            </span>
          </div>

          <div className="space-y-2">
            {/* 1. Organization Admin */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <div>
                  <strong className="text-slate-900 block font-bold text-xs">Organization Admin</strong>
                  <span className="text-[10px] text-slate-500">Account Owner (Primary User Slot)</span>
                </div>
              </div>
              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 text-[11px]">
                {adminCount} / 1 (Occupied)
              </span>
            </div>

            {/* 2. Manager */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <div>
                  <strong className="text-slate-900 block font-bold text-xs">Site Manager</strong>
                  <span className="text-[10px] text-slate-500">Operations & Approvals Management</span>
                </div>
              </div>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded-md border text-[11px] ${
                  managersCount >= 1
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                }`}
              >
                {managersCount} / 1 {managersCount >= 1 ? '(Limit Reached)' : '(Available)'}
              </span>
            </div>

            {/* 3. Site Supervisor */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <div>
                  <strong className="text-slate-900 block font-bold text-xs">Site Supervisor</strong>
                  <span className="text-[10px] text-slate-500">Daily Progress & Field Logs</span>
                </div>
              </div>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded-md border text-[11px] ${
                  supervisorsCount >= 1
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                }`}
              >
                {supervisorsCount} / 1 {supervisorsCount >= 1 ? '(Limit Reached)' : '(Available)'}
              </span>
            </div>
          </div>

          {/* Excluded Workers Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <strong className="font-bold text-emerald-950 block">Workers: Unlimited</strong>
                <span className="text-[10px] text-emerald-700">Excluded from this subscription limit</span>
              </div>
            </div>
            <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
              {workersCount ?? 0} Registered
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>

          {onUpgrade ? (
            <button
              type="button"
              onClick={() => {
                onClose?.()
                onUpgrade?.()
              }}
              className="flex-1 py-3 px-4 bg-[#0B3470] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>View Plans / Upgrade Plan</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          ) : (
            <Link
              to="/organization/subscription"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-[#0B3470] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>View Plans / Upgrade Plan</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

