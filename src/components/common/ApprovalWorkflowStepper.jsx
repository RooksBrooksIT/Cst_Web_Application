import { ShieldCheck, CheckCircle2, XCircle, Clock } from 'lucide-react'

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw)
  return Number.isNaN(d.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/**
 * Universal 5-Stage Workflow Stepper & Audit Log Component
 * Complies with Section 3 & 4.3 of PROJECT_APPROVAL_AND_REQUEST_SYSTEM_ARCHITECTURE_AND_LOGIC_FLOW.txt
 */
export default function ApprovalWorkflowStepper({ currentStep = 1, status = '', history = [] }) {
  const isRejected = currentStep === -1 || status.includes('reject')

  const stages = [
    { num: 1, name: '1. Supervisor Submission', code: 'pending_manager_review' },
    { num: 2, name: '2. Manager Verification', code: 'pending_org_approval' },
    { num: 3, name: '3. Organization Authorization', code: 'pending_manager_clearance' },
    { num: 4, name: '4. Manager Final Clearance', code: 'approved' },
    { num: 5, name: '5. Site Receipt Confirmation', code: 'received' },
  ]

  return (
    <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>5-Stage Approval Lifecycle Status</span>
        </h4>
        {isRejected ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>Declined / Rejected</span>
          </span>
        ) : currentStep >= 4 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>{currentStep === 5 || status === 'received' ? 'Completed & Confirmed' : 'Approved & Dispatched'}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            <span>In Review (Stage {currentStep} of 5)</span>
          </span>
        )}
      </div>

      {/* Stepper Progress Bar */}
      <div className="grid grid-cols-5 gap-1.5 text-center">
        {stages.map((stg) => {
          let stepState = 'upcoming' // 'passed' | 'current' | 'upcoming' | 'rejected'

          if (isRejected && (currentStep === stg.num || (currentStep === -1 && stg.num === 2 && status.includes('manager')) || (currentStep === -1 && stg.num === 3 && status.includes('org')))) {
            stepState = 'rejected'
          } else if (currentStep > stg.num || (currentStep === 4 && (status === 'received' || status === 'completed'))) {
            stepState = 'passed'
          } else if (currentStep === stg.num) {
            stepState = 'current'
          }

          return (
            <div key={stg.num} className="space-y-1.5">
              <div
                className={`h-2 rounded-full transition-all ${
                  stepState === 'passed'
                    ? 'bg-emerald-500'
                    : stepState === 'current'
                    ? 'bg-[#0B3470] animate-pulse'
                    : stepState === 'rejected'
                    ? 'bg-rose-500'
                    : 'bg-slate-200'
                }`}
              />
              <span className="text-[10px] font-bold block text-slate-700 truncate">{stg.name}</span>
            </div>
          )
        })}
      </div>

      {/* Audit History Log */}
      {history && history.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Immutable Audit Trail History ({history.length} Event{history.length > 1 ? 's' : ''})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {history.map((hist, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-white border border-slate-200/70 text-xs space-y-1 shadow-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-900">{hist.step || hist.action}</span>
                  <span className="text-slate-400 font-mono text-[10px]">{hist.dateStr || formatDate(hist.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="font-semibold text-slate-800">{hist.actorName}</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-slate-100 font-medium text-slate-600">
                    {hist.actorRole}
                  </span>
                </div>
                {hist.remarks && (
                  <p className="text-slate-600 italic bg-slate-50/70 p-1.5 rounded-lg border border-slate-100 text-[11px]">
                    "{hist.remarks}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
