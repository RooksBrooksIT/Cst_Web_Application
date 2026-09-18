import { useState, useEffect } from 'react'
import Modal from '../../../components/common/Modal'
import { generatePayURequestHash, generateTxnId, PAYU_CONFIG } from '../../../services/payuService'

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
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
  onSuccess,
}) {
  const [activeMethod, setActiveMethod] = useState('upi')
  const [upiId, setUpiId] = useState('builder@okhdfcbank')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [selectedBank, setSelectedBank] = useState('HDFC')
  const [processing, setProcessing] = useState(false)
  const [hashData, setHashData] = useState(null)
  const [error, setError] = useState('')

  const planTitle = plan?.name || 'Gold'
  const isFree = amount === 0

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
        isProd: PAYU_CONFIG.environment === 'production',
      })
        .then((res) => {
          setHashData({ ...res, txnid })
        })
        .catch((err) => {
          console.error('Hash generation error:', err)
        })
    }
  }, [isOpen, amount, planTitle, billingCycle, orgName, userEmail, userName, isFree])

  async function handleCompletePayment() {
    setProcessing(true)
    setError('')
    try {
      // Simulate gateway authorization latency
      await new Promise((resolve) => setTimeout(resolve, 1400))

      const txnId = hashData?.txnid || generateTxnId('TXN')
      const payuMoneyId = `PAYU_${Date.now()}`

      let methodLabel = 'PayU UPI'
      if (activeMethod === 'card') methodLabel = 'PayU Credit/Debit Card'
      else if (activeMethod === 'netbanking') methodLabel = `PayU NetBanking (${selectedBank})`
      else if (activeMethod === 'wallet') methodLabel = 'PayU Mobile Wallet'

      onSuccess({
        txnId,
        payuMoneyId,
        amount,
        planName: planTitle,
        billingCycle,
        paymentMethod: methodLabel,
        isUpgradeQueued,
        platinumProjects,
      })
    } catch (err) {
      setError(err.message || 'Payment processing failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`PayU Secure Checkout — ${planTitle}`}>
      <div className="space-y-6 text-xs text-slate-800">
        {/* Order Summary Pill */}
        <div className="p-4 rounded-2xl bg-[#0B3470] text-white flex items-center justify-between shadow-md">
          <div>
            <span className="text-[10px] text-blue-200 font-bold uppercase tracking-widest block">
              {isUpgradeQueued ? 'QUEUED UPGRADE BILLING' : 'IMMEDIATE SUBSCRIPTION'}
            </span>
            <strong className="text-base font-extrabold text-white">
              {planTitle} {plan?.isDynamic && `(${platinumProjects} Sites)`} · {billingCycle}
            </strong>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-blue-200 block">Total Payable</span>
            <strong className="text-2xl font-black text-emerald-300 font-mono">{money(amount)}</strong>
          </div>
        </div>

        {/* PayU Security & Hash Badge */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>PayU 256-Bit SSL Encrypted Gateway</span>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            Env: <strong className="text-slate-700">{PAYU_CONFIG.environment.toUpperCase()}</strong>
          </span>
        </div>

        {/* Payment Method Selector Tabs */}
        <div className="space-y-3">
          <label className="font-bold text-slate-700 block">Select Payment Method:</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'upi', label: 'UPI / QR', icon: '⚡' },
              { id: 'card', label: 'Cards', icon: '💳' },
              { id: 'netbanking', label: 'Net Banking', icon: '🏦' },
              { id: 'wallet', label: 'Wallets', icon: '👛' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveMethod(m.id)}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  activeMethod === m.id
                    ? 'border-[#0B3470] bg-blue-50/80 text-[#0B3470] font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                <span className="text-base block">{m.icon}</span>
                <span className="text-[11px] block mt-0.5">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Method Sub-Panels */}
        {activeMethod === 'upi' && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Instant UPI Payment</span>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Google Pay / PhonePe / Paytm
              </span>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 text-[11px]">Enter UPI Virtual Payment Address (VPA):</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="username@bank"
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-semibold outline-none focus:border-blue-600"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              A collect request will be sent to your UPI app, or use instant simulation mode.
            </p>
          </div>
        )}

        {activeMethod === 'card' && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-fade-in">
            <div>
              <label className="block text-slate-500 mb-1 text-[11px]">Card Number</label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="4111 2222 3333 4444"
                maxLength={19}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono outline-none focus:border-blue-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 mb-1 text-[11px]">Expiry (MM/YY)</label>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="12/28"
                  maxLength={5}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 text-[11px]">CVV</label>
                <input
                  type="password"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  placeholder="•••"
                  maxLength={4}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>
        )}

        {activeMethod === 'netbanking' && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-fade-in">
            <label className="block text-slate-500 mb-1 text-[11px]">Choose Major Indian Bank:</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak', 'PNB'].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBank(b)}
                  className={`p-2 rounded-xl text-center border text-xs font-semibold ${
                    selectedBank === b
                      ? 'border-[#0B3470] bg-[#0B3470] text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {b} Bank
                </button>
              ))}
            </div>
          </div>
        )}

        {activeMethod === 'wallet' && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 animate-fade-in text-slate-600">
            <p>Supported Wallets: Paytm, Mobikwik, Airtel Money, Freecharge.</p>
            <small className="text-[10px] text-slate-400 block">
              You will be redirected to the wallet portal to authenticate.
            </small>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCompletePayment}
            disabled={processing}
            className="px-6 py-2.5 rounded-xl text-white font-extrabold bg-[#0B3470] hover:bg-blue-900 shadow-md flex items-center gap-2"
          >
            {processing ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Authorizing with PayU...
              </>
            ) : (
              `Authorize & Pay ${money(amount)} →`
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
