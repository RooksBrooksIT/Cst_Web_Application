import { useState } from 'react'
import {
  SUBSCRIPTION_PLANS,
  BILLING_CYCLES,
  calculatePlanPrice,
  calculatePlanQuotas,
} from '../../../services/subscriptionService'

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

export function PricingScreen({
  isManagingExisting = false,
  currentSubscription = null,
  onSelectPlan,
  onBack,
  onContactEnterprise,
}) {
  const [selectedCycle, setSelectedCycle] = useState('Yearly')
  const [platinumProjects, setPlatinumProjects] = useState(10)
  const [upgradeTiming, setUpgradeTiming] = useState('immediate') // 'immediate' | 'queued'

  const currentPlanName = currentSubscription?.subscriptionPlan || 'Free Trial'
  const isCurrentActive = currentSubscription?.isSubscriptionActive && currentSubscription?.subscriptionEndDate

  const availablePlans = [
    ...(!isManagingExisting ? [SUBSCRIPTION_PLANS.FREE_TRIAL] : []),
    SUBSCRIPTION_PLANS.SILVER,
    SUBSCRIPTION_PLANS.GOLD,
    SUBSCRIPTION_PLANS.PLATINUM,
    SUBSCRIPTION_PLANS.ENTERPRISE,
  ]

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Header & Back Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-blue-500 shadow-xs transition-colors"
            >
              ← Back
            </button>
          )}
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Enterprise Pricing & Quotas</p>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Select Construction Plan</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Scale site capacity, project drawings, muster rolls, and manager approvals.
            </p>
          </div>
        </div>

        {/* Billing Cycle Pill Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
          {BILLING_CYCLES.map((cycle) => {
            const isSelected = selectedCycle === cycle.id
            return (
              <button
                key={cycle.id}
                type="button"
                onClick={() => setSelectedCycle(cycle.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cycle.label}
                {cycle.discount && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-400 text-emerald-950 font-extrabold">
                    {cycle.discount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Upgrade Timing Option (If active plan is active) */}
      {isCurrentActive && isManagingExisting && (
        <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <strong className="text-blue-950 font-bold block">Upgrade Timing Preference</strong>
            <span className="text-blue-800/80">
              Active plan: <span className="font-semibold">{currentPlanName}</span>. Choose when your new plan should take effect.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUpgradeTiming('immediate')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                upgradeTiming === 'immediate'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-transparent'
              }`}
            >
              Immediate Upgrade
            </button>
            <button
              type="button"
              onClick={() => setUpgradeTiming('queued')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                upgradeTiming === 'queued'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-transparent'
              }`}
            >
              Queued (On Expiry)
            </button>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {availablePlans.map((plan) => {
          const isGold = plan.popular
          const isPlatinum = plan.isDynamic
          const isEnterprise = plan.isCustom
          const isCurrent = isManagingExisting && currentPlanName.toLowerCase().includes(plan.name.toLowerCase())

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
              className={`rounded-3xl p-6 flex flex-col justify-between border transition-all duration-300 relative ${
                isGold
                  ? 'bg-gradient-to-b from-[#0B3470]/5 via-white to-white border-[#0B3470] shadow-lg ring-2 ring-[#0B3470]/20'
                  : 'bg-white border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400'
              }`}
            >
              {/* Top Badges */}
              {isGold && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#0B3470] text-white shadow-xs">
                  ★ Most Popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-6 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Current Active
                </span>
              )}

              <div className="space-y-4">
                {/* Header */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">{plan.badge}</span>
                  <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{plan.name}</h3>
                  {plan.targetAudience && (
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{plan.targetAudience}</p>
                  )}
                </div>

                {/* Pricing Box */}
                <div className="py-2 border-y border-slate-100">
                  {isEnterprise ? (
                    <div>
                      <strong className="text-2xl font-black text-slate-900 tracking-tight block">Custom</strong>
                      <span className="text-[11px] text-slate-400">Tailored deployment & quote</span>
                    </div>
                  ) : plan.priceMonthly === 0 && !isPlatinum ? (
                    <div>
                      <strong className="text-2xl font-black text-slate-900 tracking-tight block">₹0</strong>
                      <span className="text-[11px] text-slate-400">14 Days Free Trial</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <strong className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                          {money(price)}
                        </strong>
                        <span className="text-xs font-semibold text-slate-400">/{selectedCycle}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Includes 18% GST</span>
                    </div>
                  )}
                </div>

                {/* Platinum Interactive Slider */}
                {isPlatinum && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-800">
                      <span>Sites Capacity:</span>
                      <span className="text-[#0B3470] font-mono">{platinumProjects} Sites</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={50}
                      step={5}
                      value={platinumProjects}
                      onChange={(e) => setPlatinumProjects(Number(e.target.value))}
                      className="w-full accent-[#0B3470] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>5 Sites</span>
                      <span>25 Sites</span>
                      <span>50 Sites</span>
                    </div>
                  </div>
                )}

                {/* Quotas Summary */}
                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                  <div className="flex justify-between">
                    <span>Active Sites:</span>
                    <strong className="text-slate-900">{quotas.maxProjects === 999999 ? 'Unlimited' : `${quotas.maxProjects} Sites`}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Team Users:</span>
                    <strong className="text-slate-900">{quotas.maxUsers === 999999 ? 'Unlimited' : `${quotas.maxUsers} Users`}</strong>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 pl-2">
                    <span>└ Managers:</span>
                    <strong className="text-slate-800">{quotas.maxManagers === 999999 ? 'Unlimited' : quotas.maxManagers}</strong>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 pl-2">
                    <span>└ Supervisors:</span>
                    <strong className="text-slate-800">{quotas.maxSupervisors === 999999 ? 'Unlimited' : quotas.maxSupervisors}</strong>
                  </div>
                  <div className="flex justify-between text-[11px] text-emerald-700 pl-2">
                    <span>└ Field Workers:</span>
                    <strong className="text-emerald-700 font-semibold">Unlimited (Excluded)</strong>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200/60">
                    <span>Drawing Uploads:</span>
                    <strong className="text-slate-900">{quotas.drawingPolicy.maxActiveDocsPerSite} / site</strong>
                  </div>
                </div>

                {/* Feature Bullet Points */}
                <div className="space-y-2 text-xs text-slate-600 pt-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Features Included:</p>
                  {plan.features.map((feat) => {
                    const dynamicText = feat
                      .replace('{N}', platinumProjects)
                      .replace('{maxUsers}', quotas.maxUsers)
                      .replace('{maxManagers}', quotas.maxManagers)
                      .replace('{maxSupervisors}', quotas.maxSupervisors)
                    return (
                      <div key={feat} className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span className="text-[11px] leading-tight text-slate-700">{dynamicText}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6">
                {isEnterprise ? (
                  <button
                    type="button"
                    onClick={onContactEnterprise}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black text-white shadow-xs transition-colors"
                  >
                    Contact Enterprise →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPlan({
                        plan,
                        billingCycle: selectedCycle,
                        amount: price,
                        platinumProjects,
                        isUpgradeQueued: upgradeTiming === 'queued',
                      })
                    }
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                      isGold
                        ? 'bg-[#0B3470] hover:bg-blue-900 text-white shadow-md'
                        : 'bg-slate-100 hover:bg-[#0B3470] hover:text-white text-slate-800'
                    }`}
                  >
                    {isCurrent ? 'Extend / Renew' : `Choose ${plan.name} →`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
