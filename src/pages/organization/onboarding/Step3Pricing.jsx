import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Loader2,
  Lock,
  Headphones,
} from 'lucide-react'
import {
  SUBSCRIPTION_PLANS,
  BILLING_CYCLES,
  calculatePlanPrice,
  calculatePlanQuotas,
} from '../../../services/subscriptionService'
import {
  completeFreeTrialActivation,
  completePaidPlanActivation,
} from '../../../services/organizationRegistrationService'
import { PayUCheckoutModal } from '../subscription/PayUCheckoutModal'
import { TransactionCompletedScreen } from '../subscription/TransactionCompletedScreen'
import { ContactSupportModal } from '../subscription/ContactSupportModal'

function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

export default function Step3Pricing({
  registrationData,
  onBack,
  onComplete,
}) {
  const [selectedCycle, setSelectedCycle] = useState('Yearly')
  const [platinumProjects, setPlatinumProjects] = useState(10)

  const [checkoutData, setCheckoutData] = useState(null)
  const [transactionReceipt, setTransactionReceipt] = useState(null)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')

  const orgId = registrationData.orgId
  const orgName = registrationData.orgName || 'Your Organization'
  const brandColor = registrationData.themeColor || '#00A86B'

  const availablePlans = [
    SUBSCRIPTION_PLANS.FREE_TRIAL,
    SUBSCRIPTION_PLANS.SILVER,
    SUBSCRIPTION_PLANS.GOLD,
    SUBSCRIPTION_PLANS.PLATINUM,
    SUBSCRIPTION_PLANS.ENTERPRISE,
  ]

  // Handler for Plan Selection
  async function handleSelectPlan(plan) {
    setError('')

    const isEnterprise = plan.isCustom
    const isFree = plan.priceMonthly === 0 && !plan.isDynamic

    if (isEnterprise) {
      setIsContactOpen(true)
      return
    }

    const price = plan.isDynamic
      ? calculatePlanPrice('platinum', selectedCycle, platinumProjects)
      : calculatePlanPrice(plan.id, selectedCycle)

    // Scenario A: Free Trial Direct ₹0 Activation
    if (isFree || price === 0) {
      setActivating(true)
      try {
        const res = await completeFreeTrialActivation({
          orgId,
          orgName,
          appName: registrationData.appName,
          themeColor: brandColor,
          email: registrationData.email,
          phone: registrationData.phone,
          username: registrationData.username,
          password: registrationData.password,
          referralCode: registrationData.referralCode,
        })

        onComplete &&
          onComplete({
            ...res,
            isFree: true,
            planName: 'Free Trial',
            billingCycle: 'Free Trial',
            amount: 0,
          })
      } catch (err) {
        console.error('Free trial activation error:', err)
        setError(err.message || 'Failed to activate Free Trial. Please try again.')
      } finally {
        setActivating(false)
      }
      return
    }

    // Scenario B: Paid Plan Checkout (PayU)
    setCheckoutData({
      plan,
      billingCycle: selectedCycle,
      amount: price,
      platinumProjects,
    })
  }

  // Handle successful PayU payment callback
  async function handlePaymentSuccess(payuPayload) {
    setActivating(true)
    try {
      const res = await completePaidPlanActivation({
        orgId,
        orgName,
        appName: registrationData.appName,
        themeColor: brandColor,
        email: registrationData.email,
        phone: registrationData.phone,
        username: registrationData.username,
        password: registrationData.password,
        planName: payuPayload.planName,
        billingCycle: payuPayload.billingCycle,
        amount: payuPayload.amount,
        txnId: payuPayload.txnId,
        payuMoneyId: payuPayload.payuMoneyId,
        paymentMethod: payuPayload.paymentMethod,
        platinumProjects: payuPayload.platinumProjects,
        rawData: payuPayload,
      })

      // Show Transaction Completed Screen
      setTransactionReceipt({
        txnId: res.txnId,
        payuMoneyId: res.payuMoneyId,
        planName: res.planName,
        billingCycle: res.billingCycle,
        amount: res.amount,
        status: 'SUCCESS',
        startDate: res.startDate,
        endDate: res.endDate,
        paymentMethod: res.paymentMethod,
        isQueued: false,
      })
    } catch (err) {
      console.error('Paid plan activation error:', err)
      setError(err.message || 'Payment received but failed to activate account. Support will assist you.')
    } finally {
      setActivating(false)
    }
  }

  // Final confirmation to Dashboard
  function handleGoToDashboard() {
    onComplete &&
      onComplete({
        orgId,
        planName: transactionReceipt?.planName || 'Active',
        isFree: false,
      })
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: brandColor }}>
                Step 3 of 3 · Subscription & Capacity
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Final Step
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Choose Your Plan
            </h2>
            <p className="text-xs text-slate-500">
              Select an operational plan that fits your current construction project volume and team structure.
            </p>
          </div>

          {/* Billing Cadence Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
            {BILLING_CYCLES.map((cycle) => {
              const isSelected = selectedCycle === cycle.id
              return (
                <button
                  key={cycle.id}
                  type="button"
                  onClick={() => setSelectedCycle(cycle.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  style={{
                    backgroundColor: isSelected ? brandColor || '#0B3470' : 'transparent',
                  }}
                >
                  {cycle.label}
                  {cycle.discount && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-400 text-emerald-950 font-extrabold">
                      {cycle.discount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-700 text-xs font-bold">✕</button>
          </div>
        )}

        {/* Loading Overlay */}
        {activating && (
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <div>
              <strong className="block font-bold">Activating your organization account...</strong>
              <span className="text-[11px] text-blue-700">Configuring database collections, security rules, and quotas. Please wait.</span>
            </div>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-stretch pt-2">
          {availablePlans.map((plan) => {
            const isGold = plan.popular
            const isPlatinum = plan.isDynamic
            const isEnterprise = plan.isCustom
            const isFree = plan.priceMonthly === 0 && !isPlatinum

            const price = isPlatinum
              ? calculatePlanPrice('platinum', selectedCycle, platinumProjects)
              : isEnterprise
              ? 0
              : calculatePlanPrice(plan.id, selectedCycle)

            const quotas = isPlatinum
              ? calculatePlanQuotas('platinum', platinumProjects)
              : calculatePlanQuotas(plan.name)

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-5 flex flex-col justify-between border transition-all duration-300 relative ${
                  isGold
                    ? 'bg-gradient-to-b from-blue-50/50 via-white to-white border-blue-600 shadow-xl ring-2 ring-blue-500/20'
                    : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
                }`}
              >
                {/* Popular Badge */}
                {isGold && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider text-white shadow-xs"
                    style={{ backgroundColor: brandColor || '#0B3470' }}
                  >
                    ★ Most Popular
                  </span>
                )}

                <div className="space-y-3.5">
                  {/* Plan Badge & Title */}
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                      {plan.badge}
                    </span>
                    <h3 className="text-lg font-black text-slate-900 mt-0.5">{plan.name}</h3>
                    {plan.targetAudience && (
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{plan.targetAudience}</p>
                    )}
                  </div>

                  {/* Price Box */}
                  <div className="py-2.5 border-y border-slate-100">
                    {isEnterprise ? (
                      <div>
                        <strong className="text-xl font-black text-slate-900 tracking-tight block">Custom</strong>
                        <span className="text-[10px] text-slate-400">Tailored SLA & Quota</span>
                      </div>
                    ) : isFree ? (
                      <div>
                        <strong className="text-2xl font-black text-slate-900 tracking-tight block">₹0</strong>
                        <span className="text-[10px] text-slate-400">14 Days Full Evaluation</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <strong className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                            {money(price)}
                          </strong>
                          <span className="text-[10px] font-semibold text-slate-400">/{selectedCycle}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Includes 18% GST</span>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Projects Slider for Platinum */}
                  {isPlatinum && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="flex justify-between text-[11px] font-bold text-slate-800">
                        <span>Capacity:</span>
                        <span className="text-blue-700 font-mono">{platinumProjects} Sites</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={50}
                        step={5}
                        value={platinumProjects}
                        onChange={(e) => setPlatinumProjects(Number(e.target.value))}
                        className="w-full accent-[#0B3470] cursor-pointer h-1 bg-slate-200 rounded-lg"
                      />
                      <div className="flex justify-between text-[9px] text-slate-400">
                        <span>5</span>
                        <span>25</span>
                        <span>50</span>
                      </div>
                    </div>
                  )}

                  {/* Quotas Box */}
                  <div className="space-y-1 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex justify-between">
                      <span>Sites:</span>
                      <strong className="text-slate-900">{quotas.maxProjects === 999999 ? 'Unlimited' : quotas.maxProjects}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Team Seats:</span>
                      <strong className="text-slate-900">{quotas.maxUsers === 999999 ? 'Unlimited' : quotas.maxUsers}</strong>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 pl-1">
                      <span>└ Mgrs / Sups:</span>
                      <strong className="text-slate-800">{quotas.maxManagers} / {quotas.maxSupervisors}</strong>
                    </div>
                    <div className="flex justify-between text-[10px] text-emerald-700 pl-1">
                      <span>└ Field Workers:</span>
                      <strong className="text-emerald-700">Unlimited</strong>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200/60">
                      <span>Drawings:</span>
                      <strong className="text-slate-900">{quotas.drawingPolicy.maxActiveDocsPerSite} / site</strong>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-1.5 text-[11px] text-slate-600 pt-1">
                    {plan.features.slice(0, 4).map((feat) => {
                      const dynamicText = feat
                        .replace('{N}', platinumProjects)
                        .replace('{maxUsers}', quotas.maxUsers)
                        .replace('{maxManagers}', quotas.maxManagers)
                        .replace('{maxSupervisors}', quotas.maxSupervisors)
                      return (
                        <div key={feat} className="flex items-start gap-1.5 leading-snug">
                          <span className="text-emerald-500 font-bold shrink-0">✓</span>
                          <span className="text-[10px] text-slate-700">{dynamicText}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="pt-5">
                  <button
                    type="button"
                    disabled={activating}
                    onClick={() => handleSelectPlan(plan)}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                      isGold
                        ? 'text-white shadow-md'
                        : isFree
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-800'
                    }`}
                    style={
                      isGold
                        ? { backgroundColor: brandColor || '#0B3470' }
                        : {}
                    }
                  >
                    {isEnterprise
                      ? 'Contact Sales →'
                      : isFree
                      ? 'Start 14-Day Free Trial'
                      : `Proceed with ${plan.name}`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Back Button */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            disabled={activating}
            className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Branding</span>
          </button>

          <span className="text-[11px] text-slate-400">
            🔒 256-bit Bank-Grade SSL Payment Encryption (PayU India)
          </span>
        </div>
      </div>

      {/* PayU Checkout Modal */}
      {checkoutData && (
        <PayUCheckoutModal
          isOpen={Boolean(checkoutData)}
          onClose={() => setCheckoutData(null)}
          plan={checkoutData.plan}
          billingCycle={checkoutData.billingCycle}
          amount={checkoutData.amount}
          platinumProjects={checkoutData.platinumProjects}
          isUpgradeQueued={false}
          orgName={orgName}
          userEmail={registrationData.email}
          userName={registrationData.username}
          userPhone={registrationData.phone}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Transaction Completed Confirmation Modal */}
      {transactionReceipt && (
        <TransactionCompletedScreen
          transactionData={transactionReceipt}
          onClose={handleGoToDashboard}
          orgName={orgName}
        />
      )}

      {/* Contact Support / Enterprise Modal */}
      {isContactOpen && (
        <ContactSupportModal
          isOpen={isContactOpen}
          onClose={() => setIsContactOpen(false)}
          orgName={orgName}
          orgEmail={registrationData.email}
        />
      )}
    </div>
  )
}

