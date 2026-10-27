import React from 'react'
import { AlertCircle, ArrowRight, X } from 'lucide-react'

export default function PendingResumeModal({
  isOpen,
  onClose,
  onResume,
  pendingData,
}) {
  if (!isOpen || !pendingData) return null

  const orgName = pendingData.org_name || pendingData.orgName || pendingData.username || 'your organization'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-7 space-y-5 my-auto">
        {/* Header Icon & Title */}
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Pending Registration
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              An account for <strong className="text-slate-800 font-semibold">{orgName}</strong> was already registered and is awaiting subscription payment.
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs text-slate-600 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-400">Organization:</span>
            <strong className="text-slate-800">{pendingData.org_name || orgName}</strong>
          </div>
          {pendingData.username && (
            <div className="flex justify-between">
              <span className="text-slate-400">Admin Username:</span>
              <strong className="text-slate-800 font-mono">{pendingData.username}</strong>
            </div>
          )}
          {pendingData.email && (
            <div className="flex justify-between">
              <span className="text-slate-400">Corporate Email:</span>
              <strong className="text-slate-800">{pendingData.email}</strong>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-400">Status:</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
              Payment Pending
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onResume(pendingData)}
            className="flex-1 py-3 px-4 rounded-xl bg-[#0B3470] hover:bg-[#082654] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Resume Payment</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

