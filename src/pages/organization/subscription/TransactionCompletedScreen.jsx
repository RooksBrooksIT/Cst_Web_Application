import { useMemo } from 'react'

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime()) ? 'N/A' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(d)
}

export function TransactionCompletedScreen({
  transactionData,
  onClose,
  orgName = 'Your Organization',
}) {
  const {
    txnId = 'TXN_SAMPLE',
    payuMoneyId = 'PAYU_SAMPLE',
    planName = 'Gold',
    billingCycle = 'Monthly',
    amount = 199,
    status = 'SUCCESS',
    startDate = new Date(),
    endDate = new Date(Date.now() + 30 * 86400000),
    isQueued = false,
    paymentMethod = 'PayU UPI / NetBanking',
  } = transactionData || {}

  const gstAmount = useMemo(() => Math.round(amount * 0.18), [amount])
  const baseAmount = useMemo(() => amount - gstAmount, [amount, gstAmount])

  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-6 my-auto">
        {/* Success Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl font-extrabold shadow-inner animate-bounce">
            ✓
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
            {isQueued ? 'Upgrade Scheduled' : 'Payment Confirmed & Subscription Active'}
          </p>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {isQueued ? 'Subscription Queued Successfully!' : 'Welcome to eBricks ' + planName + '!'}
          </h2>
          <p className="text-xs text-slate-500">
            {isQueued
              ? `Your upgrade to ${planName} will automatically activate on ${formatDate(startDate)}.`
              : `Your enterprise account has been credited and unlocked with ${planName} entitlements.`}
          </p>
        </div>

        {/* Invoice Receipt Container (Printable) */}
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4 text-xs font-sans print:border-none print:p-0">
          <div className="flex justify-between items-start pb-3 border-b border-slate-200">
            <div>
              <strong className="block text-slate-900 font-extrabold text-sm">{orgName}</strong>
              <span className="text-slate-400 font-mono text-[11px]">Transaction ID: {txnId}</span>
              <span className="text-slate-400 font-mono text-[11px] block">PayU Ref: {payuMoneyId}</span>
            </div>
            <div className="text-right">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {status}
              </span>
              <span className="text-slate-400 block text-[11px] mt-1">{formatDate(new Date())}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-slate-400 block">Plan & Cycle:</span>
              <strong className="text-slate-800 text-xs">{planName} ({billingCycle})</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Payment Mode:</span>
              <strong className="text-slate-800">{paymentMethod}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Valid From:</span>
              <strong className="text-slate-800">{formatDate(startDate)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Valid Until:</span>
              <strong className="text-slate-800">{formatDate(endDate)}</strong>
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5">
            <div className="flex justify-between text-slate-500">
              <span>Subscription Base Rate:</span>
              <span>{money(baseAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>GST (18% Included):</span>
              <span>{money(gstAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold text-sm pt-1 border-t border-slate-200">
              <span>Total Paid:</span>
              <span className="text-[#0B3470] font-mono">{money(amount)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-2 border border-slate-200"
          >
            🖨 Download / Print Tax Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-extrabold bg-[#0B3470] hover:bg-blue-900 text-white shadow-md flex items-center justify-center gap-2"
          >
            Done & Return to Dashboard →
          </button>
        </div>
      </div>
    </div>
  )
}
