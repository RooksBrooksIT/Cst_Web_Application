import { useState, useEffect, useRef } from 'react'
import Modal from '../../../components/common/Modal'
import {
  generatePayURequestHash,
  generateTxnId,
  launchPayUBoltPayment,
  loadPayUBoltScript,
  PAYU_CONFIG,
} from '../../../services/payuService'

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    amount || 0
  )
}

export function PayUCheckoutModal({
  isOpen,
  onClose,
  plan,
  billingCycle,
  amount,
  platinumProjects = 10,
  isUpgradeQueued = false,
  orgName = 'Your Organization',
  userEmail = 'admin@construction.com',
  userName = 'Admin',
  userPhone = '9876543210',
  onSuccess,
}) {
  const [phone, setPhone] = useState(userPhone || '9876543210')
  const [processing, setProcessing] = useState(false)
  const [loadingSdk, setLoadingSdk] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const [hashData, setHashData] = useState(null)
  const [error, setError] = useState('')
  const formRef = useRef(null)

  const planTitle = plan?.name || 'Gold'
  const isFree = amount === 0
  const isProd = PAYU_CONFIG.environment === 'production'

  // Pre-load PayU Bolt SDK on open
  useEffect(() => {
    if (isOpen && !isFree) {
      setLoadingSdk(true)
      loadPayUBoltScript(isProd)
        .then(() => setSdkReady(true))
        .catch((err) => {
          console.warn('[PayU SDK Warning]:', err.message)
          setSdkReady(false)
        })
        .finally(() => setLoadingSdk(false))
    }
  }, [isOpen, isFree, isProd])

  // Pre-generate SHA-512 hash on mount / plan change
  useEffect(() => {
    if (isOpen && !isFree) {
      const txnid = generateTxnId('TXN')
      generatePayURequestHash({
        txnid,
        amount,
        productinfo: `${orgName} - ${planTitle} (${billingCycle})`,
        firstname: userName || 'Admin',
        email: userEmail || 'user@construction.com',
        udf1: orgName,
        udf2: planTitle,
        udf3: billingCycle,
        udf4: 'ebricks',
        udf5: 'ebricks_subscription',
        isProd,
      })
        .then((res) => {
          setHashData({ ...res, txnid })
        })
        .catch((err) => {
          console.error('Hash generation error:', err)
          setError('Failed to compute secure hash for PayU gateway: ' + err.message)
        })
    }
  }, [isOpen, amount, planTitle, billingCycle, orgName, userEmail, userName, isFree, isProd])

  // Handle in-page PayU Bolt launch
  async function handleLaunchPayU() {
    setError('')
    setProcessing(true)

    // Handle free trial immediately without payment gateway
    if (isFree) {
      try {
        onSuccess({
          txnId: generateTxnId('FREE'),
          payuMoneyId: `FREE_${Date.now()}`,
          amount: 0,
          planName: planTitle,
          billingCycle,
          paymentMethod: 'Free Trial Activation',
          isUpgradeQueued,
          platinumProjects,
        })
      } finally {
        setProcessing(false)
      }
      return
    }

    const txnid = hashData?.txnid || generateTxnId('TXN')
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10) || '9876543210'

    try {
      await launchPayUBoltPayment({
        txnid,
        amount,
        productinfo: `${orgName} - ${planTitle} (${billingCycle})`,
        firstname: userName || 'Admin',
        email: userEmail || 'admin@construction.com',
        phone: cleanPhone,
        udf1: orgName,
        udf2: planTitle,
        udf3: billingCycle,
        udf4: 'ebricks',
        udf5: 'ebricks_subscription',
        isProd,
        onSuccess: (payuRes) => {
          setProcessing(false)
          const finalTxnId = payuRes.txnid || txnid
          const finalPayuMoneyId = payuRes.mihpayid || payuRes.payuMoneyId || `PAYU_${Date.now()}`
          const methodLabel = payuRes.mode ? `PayU ${payuRes.mode.toUpperCase()}` : 'PayU Gateway'

          onSuccess({
            txnId: finalTxnId,
            payuMoneyId: finalPayuMoneyId,
            amount,
            planName: planTitle,
            billingCycle,
            paymentMethod: methodLabel,
            isUpgradeQueued,
            platinumProjects,
          })
          onClose()
        },
        onCancel: (cancelRes) => {
          setProcessing(false)
          setError('Payment was cancelled in PayU. You can try again whenever you are ready.')
        },
        onError: (err) => {
          setProcessing(false)
          setError(err?.message || 'Payment processing was interrupted. You can try again or use direct hosted gateway.')
        },
      })
    } catch (err) {
      setProcessing(false)
      console.warn('PayU Bolt launch error:', err)
      setError('Could not open in-page gateway: ' + (err?.message || 'SDK Error') + '. You can use Direct PayU Hosted Gateway below.')
    }
  }

  // Fallback: Submit form to PayU Hosted Checkout URL
  function handleHostedFallbackSubmit(e) {
    e.preventDefault()
    if (!formRef.current) return
    formRef.current.submit()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`PayU Secure Checkout — ${planTitle}`}>
      <div className="space-y-5 text-xs text-slate-800">
        {/* Order Summary Pill */}
        <div className="p-4 rounded-2xl bg-[#0B3470] text-white flex items-center justify-between shadow-md">
          <div>
            <span className="text-[10px] text-blue-200 font-bold uppercase tracking-widest block">
              {isUpgradeQueued ? 'QUEUED UPGRADE BILLING' : 'IMMEDIATE SUBSCRIPTION'}
            </span>
            <strong className="text-base font-extrabold text-white">
              {planTitle} {plan?.isDynamic && `(${platinumProjects} Sites)`} · {billingCycle}
            </strong>
            <span className="text-[11px] text-blue-200/90 block mt-0.5">Org: {orgName}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-blue-200 block">Total Payable</span>
            <strong className="text-2xl font-black text-emerald-300 font-mono">{money(amount)}</strong>
          </div>
        </div>

        {/* PayU Security & Live Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-800">PayU 256-Bit SSL Encrypted Gateway</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100/80 text-emerald-800 font-bold">
              {isProd ? 'LIVE PRODUCTION' : 'SANDBOX / UAT'}
            </span>
            <span>MID: {isProd ? PAYU_CONFIG.prodMerchantId : PAYU_CONFIG.testMerchantId}</span>
          </div>
        </div>

        {/* Contact Information for PayU Billing Receipt */}
        <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
          <p className="font-bold text-slate-700 text-xs">Customer Billing Details:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Full Name & Email</span>
              <span className="font-semibold text-slate-800 block truncate">{userName}</span>
              <span className="text-slate-500 text-[11px] block truncate">{userEmail}</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block uppercase font-bold mb-1">
                Contact Mobile (for OTP / SMS)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={13}
                placeholder="9876543210"
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Gateway Supported Channels */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-700 block">
            Payment Methods Supported in PayU Gateway:
          </span>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'upi', label: 'UPI / QR', icon: '⚡', sub: 'GPay, PhonePe, Paytm' },
              { id: 'card', label: 'Cards', icon: '💳', sub: 'Visa, Master, RuPay' },
              { id: 'netbanking', label: 'Net Banking', icon: '🏦', sub: 'All Major Banks' },
              { id: 'wallet', label: 'Wallets / EMI', icon: '👛', sub: 'Paytm, Mobikwik' },
            ].map((m) => (
              <div
                key={m.id}
                className="p-2.5 rounded-xl border border-slate-200 bg-white text-center shadow-2xs"
              >
                <span className="text-base block">{m.icon}</span>
                <strong className="text-[11px] font-bold text-slate-800 block mt-0.5">{m.label}</strong>
                <span className="text-[9px] text-slate-400 block truncate">{m.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-fade-in flex items-start gap-2">
            <span className="text-rose-500 font-bold">⚠️</span>
            <div className="flex-1">
              <p>{error}</p>
              {hashData && (
                <button
                  type="button"
                  onClick={handleHostedFallbackSubmit}
                  className="mt-2 text-xs font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
                >
                  Click here to open PayU Hosted Checkout instead →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleLaunchPayU}
            disabled={processing || (!isFree && !hashData)}
            className="px-6 py-2.5 rounded-xl text-white font-extrabold bg-[#0B3470] hover:bg-[#082855] disabled:opacity-50 shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            {processing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Loading PayU Gateway...</span>
              </>
            ) : (
              <>
                <span>Pay {money(amount)} with PayU</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>

        {/* Hidden PayU Form for direct hosted fallback */}
        <form
          ref={formRef}
          action={isProd ? PAYU_CONFIG.prodPayUrl : PAYU_CONFIG.testPayUrl}
          method="POST"
          style={{ display: 'none' }}
        >
          <input type="hidden" name="key" value={hashData?.key || (isProd ? PAYU_CONFIG.prodKey : PAYU_CONFIG.testKey)} />
          <input type="hidden" name="txnid" value={hashData?.txnid || ''} />
          <input type="hidden" name="amount" value={Number(amount).toFixed(2)} />
          <input type="hidden" name="productinfo" value={`${orgName} - ${planTitle} (${billingCycle})`} />
          <input type="hidden" name="firstname" value={userName || 'Admin'} />
          <input type="hidden" name="email" value={userEmail || 'admin@construction.com'} />
          <input type="hidden" name="phone" value={(phone || '').replace(/\D/g, '').slice(-10) || '9876543210'} />
          <input type="hidden" name="surl" value={PAYU_CONFIG.surl} />
          <input type="hidden" name="furl" value={PAYU_CONFIG.furl} />
          <input type="hidden" name="hash" value={hashData?.hash || ''} />
          <input type="hidden" name="service_provider" value="payu_paisa" />
          <input type="hidden" name="udf1" value={orgName} />
          <input type="hidden" name="udf2" value={planTitle} />
          <input type="hidden" name="udf3" value={billingCycle} />
          <input type="hidden" name="udf4" value="ebricks" />
          <input type="hidden" name="udf5" value="ebricks_subscription" />
        </form>
      </div>
    </Modal>
  )
}
