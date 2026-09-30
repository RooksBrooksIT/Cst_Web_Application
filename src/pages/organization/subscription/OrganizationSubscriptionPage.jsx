import { useState, useMemo } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import {
  SUBSCRIPTION_PLANS,
  calculatePlanQuotas,
  activateSubscription,
} from '../../../services/subscriptionService'
import { PricingScreen } from './PricingScreen'
import { PayUCheckoutModal } from './PayUCheckoutModal'
import { TransactionCompletedScreen } from './TransactionCompletedScreen'
import { ContactSupportModal } from './ContactSupportModal'
import { TermsModal } from './TermsModal'

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime()) ? 'N/A' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(d)
}

function daysRemainingFrom(raw) {
  if (!raw) return 0
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  if (Number.isNaN(d.getTime())) return 0
  const diff = d.getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function OrganizationSubscriptionPage({
  sites = [],
  managers = [],
  subscription: propSubscription = null,
}) {
  const { orgId, userData, user } = useAuth()
  const [viewMode, setViewMode] = useState('manage') // 'manage' | 'pricing'
  const [checkoutData, setCheckoutData] = useState(null)
  const [transactionReceipt, setTransactionReceipt] = useState(null)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [isTermsOpen, setIsTermsOpen] = useState(false)
  const [activating, setActivating] = useState(false)

  // Resolve active subscription from userData / prop / default fallback
  const subscription = useMemo(() => {
    return (
      propSubscription ||
      userData?.subscription ||
      userData?.data?.subscription || {
        subscriptionPlan: 'Free Trial',
        subscriptionType: 'Free Trial',
        isSubscriptionActive: true,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 14 * 86400000),
        maxProjects: 1,
        maxUsers: 2,
        maxManagers: 1,
        maxSupervisors: 1,
      }
    )
  }, [propSubscription, userData])

  const planName = subscription.subscriptionPlan || 'Free Trial'
  const billingCycle = subscription.subscriptionType || 'Monthly'
  const isActive = subscription.isSubscriptionActive !== false
  const daysLeft = daysRemainingFrom(subscription.subscriptionEndDate)
  const isExpired = !isActive || daysLeft === 0

  // Count active staff and projects
  const currentSitesCount = sites.length
  const currentManagersCount = managers.filter((m) => String(m.role || '').toLowerCase().includes('manager')).length
  const currentSupervisorsCount = managers.filter((m) => String(m.role || '').toLowerCase().includes('supervisor')).length
  const totalTeamCount = Math.max(1, managers.length + 1) // +1 for Org Admin

  // Quotas & Limits
  const quotas = useMemo(() => {
    return calculatePlanQuotas(planName, subscription.platinumProjects || 10)
  }, [planName, subscription.platinumProjects])

  const maxSites = subscription.maxProjects || quotas.maxProjects
  const maxManagers = subscription.maxManagers || quotas.maxManagers
  const maxSupervisors = subscription.maxSupervisors || quotas.maxSupervisors
  const maxUsers = subscription.maxUsers || quotas.maxUsers

  // Handlers
  function handleSelectPlanForCheckout(planSelection) {
    setCheckoutData(planSelection)
  }

  async function handlePaymentSuccess(payuPayload) {
    setActivating(true)
    try {
      const res = await activateSubscription({
        orgId,
        planName: payuPayload.planName,
        billingCycle: payuPayload.billingCycle,
        amount: payuPayload.amount,
        paymentMethod: payuPayload.paymentMethod,
        paymentTxnId: payuPayload.txnId,
        payuMoneyId: payuPayload.payuMoneyId,
        isUpgradeQueued: payuPayload.isUpgradeQueued,
        platinumProjects: payuPayload.platinumProjects,
        currentSubscription: subscription,
      })

      setCheckoutData(null)
      setViewMode('manage')

      // Open completion receipt
      setTransactionReceipt({
        txnId: payuPayload.txnId,
        payuMoneyId: payuPayload.payuMoneyId,
        planName: payuPayload.planName,
        billingCycle: payuPayload.billingCycle,
        amount: payuPayload.amount,
        status: 'SUCCESS',
        startDate: res.payload.subscriptionStartDate || new Date(),
        endDate: res.payload.subscriptionEndDate || new Date(Date.now() + 30 * 86400000),
        isQueued: payuPayload.isUpgradeQueued,
        paymentMethod: payuPayload.paymentMethod,
      })
    } catch (err) {
      alert('Error finalizing subscription: ' + err.message)
    } finally {
      setActivating(false)
    }
  }

  if (viewMode === 'pricing') {
    return (
      <>
        <PricingScreen
          isManagingExisting={true}
          currentSubscription={subscription}
          onSelectPlan={handleSelectPlanForCheckout}
          onBack={() => setViewMode('manage')}
          onContactEnterprise={() => setIsContactOpen(true)}
        />

        {checkoutData && (
          <PayUCheckoutModal
            isOpen={Boolean(checkoutData)}
            onClose={() => setCheckoutData(null)}
            plan={checkoutData.plan}
            billingCycle={checkoutData.billingCycle}
            amount={checkoutData.amount}
            platinumProjects={checkoutData.platinumProjects}
            isUpgradeQueued={checkoutData.isUpgradeQueued}
            orgName={userData?.organizationName || 'Your Organization'}
            userEmail={user?.email || 'admin@construction.com'}
            userName={userData?.fullName || 'Admin'}
            userPhone={userData?.phone || userData?.mobile || user?.phoneNumber || '9999999999'}
            onSuccess={handlePaymentSuccess}
          />
        )}

        {transactionReceipt && (
          <TransactionCompletedScreen
            transactionData={transactionReceipt}
            onClose={() => setTransactionReceipt(null)}
            orgName={userData?.organizationName || 'Your Organization'}
          />
        )}

        <ContactSupportModal
          isOpen={isContactOpen}
          onClose={() => setIsContactOpen(false)}
          orgName={userData?.organizationName}
          orgEmail={user?.email}
        />
      </>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Governance</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Manage Subscription</h1>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise tier quotas, team seat allocation, drawing allowances, and PayU billing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('pricing')}
            className="px-4 py-2 rounded-xl text-xs font-extrabold bg-[#0B3470] hover:bg-blue-900 text-white shadow-md transition-all flex items-center gap-1.5"
          >
            ★ Upgrade / Change Plan
          </button>
        </div>
      </div>

      {/* Hero Plan & Billing Status Card (UI Section 3.A.2) */}
      <div className="p-6 md:p-8 rounded-3xl bg-linear-to-br from-[#0B3470] via-[#0d3f85] to-[#164e96] text-white shadow-lg space-y-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl font-bold border border-white/20">
              💎
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black tracking-tight text-white">{planName}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-white/20 text-blue-100 border border-white/30 uppercase tracking-wider">
                  {billingCycle}
                </span>
              </div>
              <span className="text-xs text-blue-200">
                {planName.toLowerCase().includes('enterprise')
                  ? 'Dedicated On-Premise / Enterprise Deployment'
                  : 'Multi-Site Commercial Tier'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                isExpired
                  ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isExpired ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              {isExpired ? 'Subscription Expired' : 'Active Subscription'}
            </span>
          </div>
        </div>

        {/* Expiry & Days Remaining Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10 text-xs">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-0.5">
            <span className="text-[10px] text-blue-200 block font-semibold">Active Since:</span>
            <strong className="text-sm font-bold text-white block">
              {formatDate(subscription.subscriptionStartDate)}
            </strong>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-0.5">
            <span className="text-[10px] text-blue-200 block font-semibold">Valid Until:</span>
            <strong className="text-sm font-bold text-white block">
              {formatDate(subscription.subscriptionEndDate)}
            </strong>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-0.5">
            <span className="text-[10px] text-blue-200 block font-semibold">Days Remaining:</span>
            <strong
              className={`text-sm font-extrabold block ${
                daysLeft < 5 ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
              {daysLeft} Days Remaining
            </strong>
          </div>
        </div>

        {/* Queued Upgrade Notice Banner (if applicable) */}
        {subscription.isUpgradeQueued && (
          <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">⏳</span>
              <span>
                <strong>Upgrade Queued:</strong> {subscription.queuedPlan} ({subscription.queuedPlanType}) scheduled to activate on{' '}
                {formatDate(subscription.queuedStartDate)}.
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950">
              Pending Activation
            </span>
          </div>
        )}
      </div>

      {/* Usage & Quotas Progress Card (UI Section 3.A.3) */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-[#0B3470]" />
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">Active Usage & Resource Quotas</h3>
          </div>
          <span className="text-xs text-slate-400">Real-time capacity utilization</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sites Quota */}
          <div className="space-y-1.5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Active Construction Sites</span>
              <strong className="text-blue-700 font-mono">
                {currentSitesCount} / {maxSites === 999999 ? '∞' : maxSites} Sites
              </strong>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, maxSites === 999999 ? 10 : (currentSitesCount / maxSites) * 100)}%`,
                }}
              />
            </div>
            <small className="text-[10px] text-slate-400 block">
              {maxSites - currentSitesCount > 0
                ? `${maxSites - currentSitesCount} project slots available`
                : 'Project limit reached. Upgrade to add more.'}
            </small>
          </div>

          {/* Managers Quota */}
          <div className="space-y-1.5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Managers Assigned</span>
              <strong className="text-indigo-700 font-mono">
                {currentManagersCount} / {maxManagers === 999999 ? '∞' : maxManagers} Seats
              </strong>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, maxManagers === 999999 ? 10 : (currentManagersCount / maxManagers) * 100)}%`,
                }}
              />
            </div>
            <small className="text-[10px] text-slate-400 block">
              Authorized for site setup, muster roll, and Tier 1 verification.
            </small>
          </div>

          {/* Supervisors Quota */}
          <div className="space-y-1.5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Supervisors Assigned</span>
              <strong className="text-purple-700 font-mono">
                {currentSupervisorsCount} / {maxSupervisors === 999999 ? '∞' : maxSupervisors} Seats
              </strong>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, maxSupervisors === 999999 ? 10 : (currentSupervisorsCount / maxSupervisors) * 100)}%`,
                }}
              />
            </div>
            <small className="text-[10px] text-slate-400 block">
              On-site float wallets, daily diaries, and material GRN.
            </small>
          </div>

          {/* Total Seats */}
          <div className="space-y-1.5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700">Total User Seats</span>
              <strong className="text-emerald-700 font-mono">
                {totalTeamCount} / {maxUsers === 999999 ? '∞' : maxUsers} Users
              </strong>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, maxUsers === 999999 ? 10 : (totalTeamCount / maxUsers) * 100)}%`,
                }}
              />
            </div>
            <small className="text-[10px] text-slate-400 block">
              Sum of Admin, Project Managers, and Site Supervisors.
            </small>
          </div>
        </div>
      </div>

      {/* Plan Entitlements & Layout Drawings Policy (UI Section 3.A.4 & 2.C) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Features Checklist */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            Current Plan Entitlements
          </h3>
          <div className="space-y-2.5 text-xs text-slate-700">
            {quotas.drawingPolicy && (
              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-emerald-600 font-bold">✓</span>
                <div>
                  <strong className="block text-slate-900">Architectural Drawings & Layouts</strong>
                  <span className="text-slate-500">{quotas.drawingPolicy.description}</span>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <div>
                <strong className="block text-slate-900">Multi-Site Operational Sync</strong>
                <span className="text-slate-500">Real-time mobile & web bidirectional synchronization</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <div>
                <strong className="block text-slate-900">10 Standard Financial & Audit Reports</strong>
                <span className="text-slate-500">Instant CSV/Excel download and PDF printing</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <div>
                <strong className="block text-slate-900">3-Tier Payment Approval Engine</strong>
                <span className="text-slate-500">Manager review, Org authorization, and Bank UTR tracking</span>
              </div>
            </div>
          </div>
        </div>

        {/* Layout & Drawings Policy Card */}
        <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-200">
            Layout & Architectural Drawings Quota
          </h3>
          <div className="space-y-3 text-xs text-slate-600">
            <p className="leading-relaxed">
              Construction site drawings and CAD blueprints are managed according to your subscription tier:
            </p>

            <div className="space-y-2">
              <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-800">Free Trial & Silver:</span>
                  <span className="text-slate-500 font-normal">1 active drawing (View Only)</span>
                </div>
                <small className="text-slate-400 block">Deletion and file replacement are restricted.</small>
              </div>

              <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-800">Gold Plan:</span>
                  <span className="text-slate-500 font-normal">1 drawing (1 Delete & 1 Re-upload)</span>
                </div>
                <small className="text-slate-400 block">Allows 1 revision per construction site.</small>
              </div>

              <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-800">Platinum & Enterprise:</span>
                  <span className="text-emerald-700 font-bold">2 active drawings (Multi-replace)</span>
                </div>
                <small className="text-slate-400 block">Unlimited deletions and revision re-uploads.</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer & Support */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div>
          <strong className="text-slate-900 block text-sm">Need a Custom Enterprise Solution?</strong>
          <p className="text-slate-500">
            Contact our dedicated engineering support for on-premise deployments, custom quotas, or white-label SLA.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsTermsOpen(true)}
            className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2"
          >
            Terms & Policy
          </button>
          <button
            type="button"
            onClick={() => setIsContactOpen(true)}
            className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200"
          >
            Contact Sales
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pricing')}
            className="px-5 py-2.5 rounded-xl font-extrabold bg-[#0B3470] hover:bg-blue-900 text-white shadow-md"
          >
            Change Plan →
          </button>
        </div>
      </div>

      {/* Modals */}
      <ContactSupportModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        orgName={userData?.organizationName}
        orgEmail={user?.email}
      />

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />

      {transactionReceipt && (
        <TransactionCompletedScreen
          transactionData={transactionReceipt}
          onClose={() => setTransactionReceipt(null)}
          orgName={userData?.organizationName || 'Your Organization'}
        />
      )}
    </div>
  )
}
