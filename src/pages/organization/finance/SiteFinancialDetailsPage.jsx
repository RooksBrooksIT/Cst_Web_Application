import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Image as ImageIcon } from 'lucide-react'
import StatusBadge from '../../../components/common/StatusBadge'
import ExportButton from '../../../components/common/ExportButton'
import BillImagePreviewModal from '../../../components/common/BillImagePreviewModal'
import {
  fetchSiteGranularExpenses,
  subscribeSiteGranularExpenses,
  calculateSiteTotalExpenses,
  calculateSiteFinancialMetrics,
  processRawGranularExpenseDocs,
} from '../../../services/financeService.js'
import { isNewOrganizationSync } from '../../../services/schemaResolverService.js'
import {
  amountValue,
  matchesSite,
  money,
  formatDate,
  statusBadgeColor,
  parseDateToTime,
} from './financeUtils'

export default function SiteFinancialDetailsPage({
  site = {},
  totalExpensesDoc = null,
  sitePayments = [],
  managerExpenses = [],
  managerEntries = [],
  organizationExpenses = [],
  organizationEntries = [],
  siteSupervisorEntries = [],
  contractorEntries = [],
  siteSupervisorIncentives = [],
  pettyCashExpenses = [],
  pettyCashTransactions = [],
  onBack,
  orgId,
}) {
  const [activeTab, setActiveTab] = useState('summary')
  const [granularExpenses, setGranularExpenses] = useState([])
  const [loadingExpenses, setLoadingExpenses] = useState(true)
  const [expenseSearch, setExpenseSearch] = useState('')
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all')
  const [expenseSort, setExpenseSort] = useState('newest')
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    imageUrl: '',
    storagePath: '',
    orgId: '',
    title: '',
    vendor: '',
    amount: '',
    billNo: '',
    date: '',
    quantity: '',
  })

  const siteId = site.siteId || site.siteid || site.id || site.code || ''
  const siteName = site.siteName || site.sitename || site.projectName || site.name || siteId
  const projectName = site.projectName || siteName
  const ownerName = site.ownerName || site.ownername || site.clientName || 'Direct Client'
  const ownerPhone = site.ownerPhoneNumber || site.ownerPhone || site.phone || site.clientPhone || 'No Phone'
  const category = site.projectCategory || 'House'
  const subCategory = site.projectSubCategory || '2BHK'
  const siteLocation = site.location?.address || site.siteLocation || site.location || 'Location Registered'
  const status = site.currentStatus || site.status || 'Live'
  const startDate = site.startDate?.split?.('T')?.[0] || '2026-09-01'
  const endDate = site.plannedEndDate?.split?.('T')?.[0] || site.estimatedEndDate?.split?.('T')?.[0] || '2027-03-31'
  const supervisorName = site.supervisorName || site.supervisor || site.managerName || 'Assigned Site Supervisor'

  // Calculations according to Section 3 of specification
  const budget = amountValue(site, [
    'projectBudget',
    'budget',
    'totalBudget',
    'estimatedBudget',
    'plannedBudget',
    'project_budget',
    'contractValue',
    'total_budget',
  ])

  const sitePaymentItems = useMemo(() => {
    return sitePayments.filter((p) => matchesSite(p, site))
  }, [sitePayments, site])

  const sitePaymentsSum = useMemo(() => {
    return sitePaymentItems.reduce((sum, p) => {
      return sum + amountValue(p, [
        'amount',
        'paymentAmount',
        'paidAmount',
        'receivedAmount',
        'totalAmount',
        'amountPaid',
        'amountReceived',
        'received',
      ])
    }, 0)
  }, [sitePaymentItems])

  const directSiteIncome = amountValue(site, [
    'amountPaid',
    'paid',
    'amountReceived',
    'receivedAmount',
    'totalReceived',
    'received',
    'totalIncome',
    'income',
    'amount_paid',
    'amount_received',
    'paid_amount',
    'clientPayment',
    'customerPayment',
  ])
  const received = sitePaymentsSum > 0 ? Math.max(directSiteIncome, sitePaymentsSum) : directSiteIncome

  // Pre-calculate granular expenses from live props for immediate instant display
  const propGranularExpenses = useMemo(() => {
    const hasAnyProps =
      (managerExpenses && managerExpenses.length > 0) ||
      (organizationExpenses && organizationExpenses.length > 0) ||
      (siteSupervisorEntries && siteSupervisorEntries.length > 0) ||
      (contractorEntries && contractorEntries.length > 0) ||
      (pettyCashTransactions && pettyCashTransactions.length > 0)

    if (!hasAnyProps) return []

    const isNewOrg = isNewOrganizationSync(orgId)
    const sourcesWithDocs = [
      { col: 'siteSupervisorEntries', category: 'Supervisor Entry', docs: siteSupervisorEntries },
      { col: 'pettyCashTransactions', category: 'Petty Cash', docs: pettyCashTransactions },
      { col: 'organizationExpenses', category: 'Organization Expense', docs: organizationExpenses },
      { col: 'managerExpenses', category: 'Manager Direct Expense', docs: managerExpenses },
      { col: 'contractorEntries', category: 'Contractor Payment', docs: contractorEntries },
      { col: 'siteSupervisorIncentives', category: 'Supervisor Incentive', docs: siteSupervisorIncentives },
      ...(!isNewOrg
        ? [
            { col: 'organizationEntries', category: 'Organization Bill', docs: organizationEntries },
            { col: 'managerEntries', category: 'Manager Approved', docs: managerEntries },
          ]
        : []),
      { col: 'petty_cash_expenses', category: 'Petty Cash Voucher', docs: pettyCashExpenses },
    ]

    return processRawGranularExpenseDocs({
      sourcesWithDocs,
      siteId,
      siteObj: site,
    })
  }, [
    managerExpenses,
    managerEntries,
    organizationExpenses,
    organizationEntries,
    siteSupervisorEntries,
    contractorEntries,
    siteSupervisorIncentives,
    pettyCashExpenses,
    pettyCashTransactions,
    siteId,
    site,
  ])

  // Real-time subscription to granular expenses for the selected site
  useEffect(() => {
    let cancelled = false
    setLoadingExpenses(true)

    const unsub = subscribeSiteGranularExpenses(
      orgId,
      siteId,
      site,
      (items) => {
        if (!cancelled) {
          setGranularExpenses(items)
          setLoadingExpenses(false)
        }
      },
      (err) => {
        console.warn('[SiteFinancialDetailsPage] Fallback fetch on subscription error:', err?.message)
        fetchSiteGranularExpenses(orgId, siteId, site)
          .then((items) => {
            if (!cancelled) {
              setGranularExpenses(items)
              setLoadingExpenses(false)
            }
          })
          .catch(() => {
            if (!cancelled) setLoadingExpenses(false)
          })
      }
    )

    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [orgId, siteId, site])

  const effectiveGranularExpenses = useMemo(() => {
    if (granularExpenses && granularExpenses.length > 0) return granularExpenses
    if (propGranularExpenses && propGranularExpenses.length > 0) return propGranularExpenses
    return []
  }, [granularExpenses, propGranularExpenses])

  // Consolidate expenses accurately using calculateSiteTotalExpenses
  const expDoc = totalExpensesDoc || {}
  const {
    totalExpenses: spent,
    categoryBreakdown,
  } = useMemo(() => {
    return calculateSiteTotalExpenses({
      site,
      granularExpenses: effectiveGranularExpenses,
      totalExpensesDoc: expDoc,
    })
  }, [site, effectiveGranularExpenses, expDoc])

  const supervisorExp = categoryBreakdown.supervisor
  const mgrExp = categoryBreakdown.manager
  const orgExp = categoryBreakdown.organization
  const conExp = categoryBreakdown.contractor
  const incExp = categoryBreakdown.incentive
  const pcSpent = categoryBreakdown.pettyCash || amountValue(expDoc, ['totalPettyCashExpense', 'pettyCashExpense', 'totalPettyCashSpent', 'pettyCashSpent'])
  const pcReceived = amountValue(expDoc, ['totalPettyCashReceived', 'pettyCashReceived', 'totalPettyCashDisbursed'])
  const pcRemaining = amountValue(expDoc, ['remainingPettyCash', 'pettyCashBalance', 'floatBalance']) || (pcReceived - pcSpent)

  // Consolidate financial metrics consistently with the actual expenses
  const explicitBalance = amountValue(site, ['amountBalance', 'balance', 'remainingBalance', 'remainingBudget', 'budgetRemaining', 'amount_balance'])
  const {
    cashInHand,
    budgetRemaining,
    usagePercent,
    realizationPercent,
    isBudgetCritical,
    isBudgetWarning,
  } = useMemo(() => {
    return calculateSiteFinancialMetrics({
      budget,
      income: received,
      expenses: spent,
      explicitBalance,
    })
  }, [budget, received, spent, explicitBalance])

  // Filter & sort granular expenses
  const filteredGranularExpenses = useMemo(() => {
    let list = [...effectiveGranularExpenses]

    if (expenseSearch.trim()) {
      const q = expenseSearch.trim().toLowerCase()
      list = list.filter((exp) => {
        return (
          (exp.title && exp.title.toLowerCase().includes(q)) ||
          (exp.vendorName && exp.vendorName.toLowerCase().includes(q)) ||
          (exp.category && exp.category.toLowerCase().includes(q)) ||
          (exp.stage && exp.stage.toLowerCase().includes(q)) ||
          (exp.billNo && exp.billNo.toLowerCase().includes(q)) ||
          (exp.id && exp.id.toLowerCase().includes(q)) ||
          (exp.refId && exp.refId.toLowerCase().includes(q))
        )
      })
    }

    if (expenseCategoryFilter !== 'all') {
      list = list.filter((exp) => {
        const cat = (exp.category || '').toLowerCase()
        return cat.includes(expenseCategoryFilter.toLowerCase())
      })
    }

    if (expenseSort === 'highest') {
      list.sort((a, b) => (b.amount || 0) - (a.amount || 0))
    } else if (expenseSort === 'lowest') {
      list.sort((a, b) => (a.amount || 0) - (b.amount || 0))
    } else {
      // newest
      list.sort((a, b) => {
        const da = parseDateToTime(a.date, a.parentDocId || a.id)
        const dbTime = parseDateToTime(b.date, b.parentDocId || b.id)
        return dbTime - da
      })
    }

    return list
  }, [effectiveGranularExpenses, expenseSearch, expenseCategoryFilter, expenseSort])

  const totalFilteredExpenseAmount = useMemo(() => {
    return filteredGranularExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  }, [filteredGranularExpenses])

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 pb-12">
      {/* 1. Breadcrumbs & Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs transition-all cursor-pointer"
          >
            <span>←</span> Back to Financial Overview
          </button>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Finance / Sites /</span>
            <span className="text-xs font-bold text-slate-900">{siteName}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/organization/expenses"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200/80 hover:bg-blue-100 transition-colors"
          >
             Organization Expenses
          </Link>

          <Link
            to="/organization/petty-cash"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100 transition-colors"
          >
             Petty Cash Ledger
          </Link>

          <ExportButton
            filename={`financial_statement_${siteId || 'site'}`}
            headers={['Metric', 'Amount (INR)']}
            data={[
              ['Contract Budget', budget],
              ['Customer Inflow (Received)', received],
              ['Total Consolidated Expenses', spent],
              ['Net Cash in Hand (Received - Spent)', cashInHand],
              ['Remaining Budget Cushion', budgetRemaining],
              ['Budget Utilization Rate (%)', `${usagePercent}%`],
              ['Supervisor / Daily Site Expenses', supervisorExp],
              ['Manager Expenses', mgrExp],
              ['Organization Overhead Expenses', orgExp],
              ['Contractor Payments', conExp],
              ['Supervisor Incentives', incExp],
              ['Site Petty Cash Disbursed', pcReceived],
              ['Site Petty Cash Spent', pcSpent],
              ['Site Petty Cash Remaining Float', pcRemaining],
            ]}
            title={`Site Financial Statement — ${siteName}`}
          />
        </div>
      </div>

      {/* 2. Site Profile & Metadata Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{siteName}</h1>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                {siteId}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadgeColor(status)}`}>
                {status}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            {projectName !== siteName && (
              <p className="text-xs text-slate-500 font-medium">Master Project: {projectName}</p>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Supervisor:</span>
            <strong className="text-slate-800 font-semibold">{supervisorName}</strong>
          </div>
        </div>

        {/* 4-Item Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 block font-medium">Category & Structure</span>
            <strong className="text-slate-900 block text-sm font-bold">{category} • {subCategory}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 block font-medium">Client / Project Owner</span>
            <strong className="text-slate-900 block text-sm font-bold truncate">{ownerName}</strong>
            <small className="text-slate-500 block">{ownerPhone}</small>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 block font-medium">Site Location</span>
            <strong className="text-slate-900 block text-sm font-bold truncate">{siteLocation}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <span className="text-slate-400 block font-medium">Contract Duration</span>
            <strong className="text-slate-900 block text-sm font-bold">{startDate} → {endDate}</strong>
          </div>
        </div>
      </div>

      {/* 3. 4-Column Executive Financial KPI Bento Grid (2 cols on mobile, 4 on lg:) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Metric 1: Budget */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 sm:space-y-3 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Contract Budget</span>
            <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
              ₹
            </span>
          </div>
          <div>
            <strong className="text-lg sm:text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight block font-mono truncate">
              {money(budget)}
            </strong>
            <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5 sm:mt-1 line-clamp-1">Approved contract</span>
          </div>
        </div>

        {/* Metric 2: Customer Inflow */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 sm:space-y-3 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Customer Inflow</span>
            <span className="px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              ↓ {realizationPercent}%
            </span>
          </div>
          <div>
            <strong className="text-lg sm:text-xl lg:text-2xl font-extrabold text-emerald-700 tracking-tight block font-mono truncate">
              {money(received)}
            </strong>
            <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5 sm:mt-1 line-clamp-1">Payments received</span>
          </div>
        </div>

        {/* Metric 3: Consolidated Expenses */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 sm:space-y-3 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Total Expenses</span>
            <span className="px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
              ↑ {usagePercent}%
            </span>
          </div>
          <div>
            <strong className="text-lg sm:text-xl lg:text-2xl font-extrabold text-rose-600 tracking-tight block font-mono truncate">
              {money(spent)}
            </strong>
            <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5 sm:mt-1 line-clamp-1">Project outflows</span>
          </div>
        </div>

        {/* Metric 4: Cash in Hand / Margin */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 sm:space-y-3 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Net Cash in Hand</span>
            <span
              className={`px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold border shrink-0 ${
                cashInHand >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {cashInHand >= 0 ? 'Surplus' : 'Deficit'}
            </span>
          </div>
          <div>
            <strong
              className={`text-lg sm:text-xl lg:text-2xl font-extrabold tracking-tight block font-mono truncate ${
                cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'
              }`}
            >
              {money(cashInHand)}
            </strong>
            <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5 sm:mt-1 line-clamp-1">Net liquid buffer</span>
          </div>
        </div>
      </div>

      {/* 4. Budget Utilization & Remaining Margin Cushion Bar */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Budget Cushion & Consumption</span>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs sm:text-sm font-semibold text-slate-700">Remaining Cushion:</span>
              <strong className={`text-base sm:text-lg font-extrabold font-mono ${budgetRemaining >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                {money(budgetRemaining)}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                isBudgetCritical
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : isBudgetWarning
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {usagePercent}% of Total Budget Utilized
            </span>
          </div>
        </div>

        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              isBudgetCritical
                ? 'bg-rose-500'
                : isBudgetWarning
                ? 'bg-amber-500'
                : 'bg-[#0B3470]'
            }`}
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>Spent: <strong className="font-mono text-slate-800">{money(spent)}</strong></span>
          <span>Target Contract: <strong className="font-mono text-slate-800">{money(budget)}</strong></span>
        </div>
      </div>

      {/* 5. Site Petty Cash Float Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-50 to-amber-50/40 border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base text-amber-600">◈</span>
            <strong className="text-sm font-bold text-slate-900">Site Petty Cash Wallet</strong>
            <span
              className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                pcRemaining < 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {pcRemaining < 0 ? 'Overspent Float' : 'Active Float'}
            </span>
          </div>
          <p className="text-xs text-slate-500">Supervisor on-site spendable cash allocation & emergency disbursements</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-3 text-center">
          <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Disbursed</span>
            <strong className="text-[11px] sm:text-xs font-bold text-slate-800 font-mono truncate block">{money(pcReceived)}</strong>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Spent</span>
            <strong className="text-[11px] sm:text-xs font-bold text-rose-600 font-mono truncate block">{money(pcSpent)}</strong>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Remaining</span>
            <strong
              className={`text-[11px] sm:text-xs font-bold font-mono truncate block ${
                pcRemaining >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {money(pcRemaining)}
            </strong>
          </div>
        </div>
      </div>

      {/* 6. Standard Web Tabbed Interface */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto w-full max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x">
          {[
            { id: 'summary', label: 'Financial Health & Breakdown' },
            { id: 'income', label: `Client Inflow Payments (${sitePaymentItems.length})` },
            { id: 'expenses', label: `Itemized Expense Ledger (${granularExpenses.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 text-xs font-bold flex items-center gap-2 rounded-lg transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === t.id
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-transparent'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Financial Health & Breakdown */}
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Category Distribution Card */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Expense Category Distribution</h3>
                <span className="text-xs text-slate-400 font-mono">Consolidated {money(spent)}</span>
              </div>

              <div className="space-y-3 text-xs">
                {[
                  {
                    label: 'Site Supervisor Daily Entries',
                    amount: supervisorExp,
                    color: 'bg-blue-600',
                    textColor: 'text-blue-700',
                  },
                  {
                    label: 'Site Petty Cash Expenses',
                    amount: pcSpent,
                    color: 'bg-amber-500',
                    textColor: 'text-amber-700',
                  },
                  {
                    label: 'Manager Approved Expenses',
                    amount: mgrExp,
                    color: 'bg-indigo-600',
                    textColor: 'text-indigo-700',
                  },
                  {
                    label: 'Organization Overhead / Office Bills',
                    amount: orgExp,
                    color: 'bg-purple-600',
                    textColor: 'text-purple-700',
                  },
                  {
                    label: 'Contractor Disbursements',
                    amount: conExp,
                    color: 'bg-rose-600',
                    textColor: 'text-rose-700',
                  },
                  {
                    label: 'Supervisor Incentives & Extras',
                    amount: incExp,
                    color: 'bg-emerald-600',
                    textColor: 'text-emerald-700',
                  },
                ].map((item) => {
                  const share = spent > 0 ? Math.round((item.amount / spent) * 100) : 0
                  return (
                    <div key={item.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">{share}%</span>
                          <strong className={`font-mono text-sm ${item.textColor}`}>{money(item.amount)}</strong>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-1.5 rounded-full ${item.color}`} style={{ width: `${Math.min(100, share)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Financial Performance Indicators Card */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-5">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Financial Performance & Health Ratios</h3>
                <p className="text-xs text-slate-500 mt-0.5">Realization rates, cash flow coverage, and cost margin cushion</p>
              </div>

              <div className="space-y-4 text-xs">
                {/* 1. Payment Realization */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <strong className="text-slate-800 block text-xs font-semibold">Payment Realization Rate</strong>
                      <span className="text-slate-400 text-[11px]">Client payments received vs contract budget</span>
                    </div>
                    <strong className="text-base font-extrabold text-emerald-700 font-mono">
                      {budget > 0 ? `${((received / budget) * 100).toFixed(1)}%` : '0%'}
                    </strong>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2 rounded-full"
                      style={{ width: `${Math.min(100, budget > 0 ? (received / budget) * 100 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* 2. Margin Cushion */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <strong className="text-slate-800 block text-xs font-semibold">Cost Cushion Margin</strong>
                      <span className="text-slate-400 text-[11px]">Remaining margin buffer before exceeding contract</span>
                    </div>
                    <strong
                      className={`text-base font-extrabold font-mono ${
                        budgetRemaining >= 0 ? 'text-blue-700' : 'text-rose-600'
                      }`}
                    >
                      {budget > 0 ? `${(((budget - spent) / budget) * 100).toFixed(1)}%` : '0%'}
                    </strong>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-700 h-2 rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, budget > 0 ? ((budget - spent) / budget) * 100 : 0))}%` }}
                    />
                  </div>
                </div>

                {/* 3. Cash Flow Health */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <strong className="text-slate-800 block text-xs font-semibold">Working Capital Position</strong>
                    <span className="text-slate-400 text-[11px]">Total Client Received minus Total Spent</span>
                  </div>
                  <span
                    className={`px-3 py-1.5 rounded-xl font-extrabold text-xs border ${
                      cashInHand >= 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {cashInHand >= 0 ? `+ ${money(cashInHand)} (Surplus)` : `- ${money(Math.abs(cashInHand))} (Deficit)`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Client Inflow Ledger */}
        {activeTab === 'income' && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-emerald-800 block">Total Inflow Collected</span>
                <strong className="text-2xl font-extrabold text-emerald-900 font-mono mt-0.5 block">{money(received)}</strong>
                <span className="text-xs text-emerald-700">Consolidated client payments deposited into project account</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1.5 bg-emerald-600 text-white rounded-xl shadow-xs">
                  {sitePaymentItems.length} Milestone Records
                </span>
                <ExportButton
                  filename={`client_payments_${siteId}`}
                  headers={['Payment Stage / Note', 'Date', 'Amount (INR)']}
                  data={sitePaymentItems.map((p, idx) => [
                    p.notes || p.stageName || p.description || `Milestone #${idx + 1}`,
                    formatDate(p.paymentDate || p.date || p.createdAt),
                    amountValue(p, ['amount', 'paymentAmount']),
                  ])}
                  title="Export Payments"
                />
              </div>
            </div>

            {/* Standard Data Table for Payments */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-emerald-50/70 border-b border-emerald-100 text-[10px] text-emerald-700 font-medium">
                <span>← Swipe horizontally to view full ledger →</span>
                <span className="font-mono">{sitePaymentItems.length} Records</span>
              </div>
              <div className="overflow-x-auto touch-pan-x [scrollbar-width:thin]">
                <table className="w-full min-w-[620px] text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5 whitespace-nowrap">Milestone / Description</th>
                      <th className="p-3.5 whitespace-nowrap">Payment Date</th>
                      <th className="p-3.5 whitespace-nowrap">Payment Ref / Stage</th>
                      <th className="p-3.5 text-right whitespace-nowrap">Inflow Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sitePaymentItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-12 text-center text-slate-400 text-xs">
                          No client milestone payment records found in SitePayment for this site.
                        </td>
                      </tr>
                    ) : (
                      sitePaymentItems.map((p, idx) => {
                        const amt = amountValue(p, ['amount', 'paymentAmount'])
                        return (
                          <tr key={p.id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5">
                              <strong className="text-slate-900 block text-xs">
                                {p.notes || p.stageName || p.description || `Milestone Inflow #${idx + 1}`}
                              </strong>
                              <span className="text-[11px] text-slate-400">Transaction ID: {p.id}</span>
                            </td>
                            <td className="p-3.5 text-slate-600 whitespace-nowrap">
                              {formatDate(p.paymentDate || p.date || p.createdAt)}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                {p.stage || p.projectStage || 'Milestone Entry'}
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-mono font-extrabold text-sm text-emerald-700 whitespace-nowrap">
                              + {money(amt)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Itemized Expenses Ledger */}
        {activeTab === 'expenses' && (
          <div className="space-y-4 animate-fade-in">
            {/* Filter Toolbar for Itemized Expenses */}
            <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 w-full md:max-w-sm">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">⌕</span>
                <input
                  type="text"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search expense description, vendor, stage..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
                />
              </div>

              {/* Category Filter Pills & Actions */}
              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold outline-none focus:border-blue-600 shadow-xs cursor-pointer"
                >
                  <option value="all">All Expense Categories</option>
                  <option value="Supervisor">Supervisor Entries</option>
                  <option value="Petty Cash">Petty Cash Vouchers</option>
                  <option value="Manager">Manager Approved</option>
                  <option value="Organization">Organization Bills</option>
                  <option value="Contractor">Contractor Payments</option>
                  <option value="Incentive">Incentives</option>
                </select>

                <select
                  value={expenseSort}
                  onChange={(e) => setExpenseSort(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold outline-none focus:border-blue-600 shadow-xs cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="highest">Highest Amount</option>
                  <option value="lowest">Lowest Amount</option>
                </select>

                <ExportButton
                  filename={`itemized_expenses_${siteId}`}
                  headers={['Date', 'Title', 'Bill No.', 'Category', 'Vendor / Payee', 'Stage', 'Quantity', 'Amount (INR)']}
                  data={filteredGranularExpenses.map((exp) => [
                    formatDate(exp.date),
                    exp.title,
                    exp.billNo || 'N/A',
                    exp.category,
                    exp.vendorName || 'Direct Expense',
                    exp.stage || '-',
                    exp.quantity !== undefined && exp.quantity !== null && exp.quantity !== '' ? exp.quantity : '-',
                    exp.amount,
                  ])}
                  title="Export Expenses"
                />
              </div>
            </div>

            {/* Results Count & Filter Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-500 px-1">
              <span>
                Showing <strong>{filteredGranularExpenses.length}</strong> of {granularExpenses.length} ledger entries
              </span>
              <span>
                Filtered Total: <strong className="font-mono text-rose-600 font-bold">{money(totalFilteredExpenseAmount)}</strong>
              </span>
            </div>

            {/* Standard Data Table for Expenses */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-blue-50/70 border-b border-blue-100 text-[10px] text-blue-700 font-medium">
                <span>← Swipe horizontally to view itemized expenses →</span>
                <span className="font-mono">9 Columns</span>
              </div>
              <div className="overflow-x-auto touch-pan-x [scrollbar-width:thin]">
                <table className="w-full min-w-[760px] text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5 whitespace-nowrap">Date</th>
                      <th className="p-3.5">Expense Title / Description</th>
                      <th className="p-3.5 whitespace-nowrap">Bill No.</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Vendor / Payee</th>
                      <th className="p-3.5">Stage</th>
                      <th className="p-3.5 text-center whitespace-nowrap">Quantity</th>
                      <th className="p-3.5 whitespace-nowrap">Bill Document</th>
                      <th className="p-3.5 text-right whitespace-nowrap">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingExpenses ? (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-slate-500 text-xs">
                          <span className="animate-pulse">Loading itemized expense ledger...</span>
                        </td>
                      </tr>
                    ) : filteredGranularExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-slate-400 text-xs">
                          No granular expense vouchers matching the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredGranularExpenses.map((exp, idx) => (
                        <tr key={exp.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-slate-500 whitespace-nowrap">
                            {formatDate(exp.date)}
                          </td>
                          <td className="p-3.5">
                            <strong className="text-slate-900 block text-xs">{exp.title}</strong>
                            {exp.refId ? (
                              <span className="text-[10px] text-slate-400 font-mono">Ref: {exp.refId}</span>
                            ) : exp.id ? (
                              <span className="text-[10px] text-slate-400 font-mono">Ref: {exp.id}</span>
                            ) : null}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            {exp.billNo && exp.billNo !== 'N/A' ? (
                              <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                                #{exp.billNo}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">N/A</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {exp.category}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-600 font-medium">
                            {exp.vendorName || 'Direct Expense'}
                          </td>
                          <td className="p-3.5">
                            {exp.stage ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                {exp.stage}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-700">
                            {exp.quantity !== undefined && exp.quantity !== null && exp.quantity !== '' ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-semibold">
                                {exp.quantity}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            {exp.billUrl || exp.imageUrl || exp.storagePath ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewModal({
                                    isOpen: true,
                                    imageUrl: exp.billUrl || exp.imageUrl || '',
                                    storagePath: exp.storagePath || '',
                                    orgId: orgId,
                                    title: exp.title || 'Expense Document',
                                    vendor: exp.vendorName || '',
                                    amount: exp.amount || '',
                                    billNo: exp.billNo && exp.billNo !== 'N/A' ? exp.billNo : (exp.refId || exp.id || ''),
                                    date: formatDate(exp.date),
                                    quantity: exp.quantity !== undefined && exp.quantity !== null && exp.quantity !== '' ? exp.quantity : '',
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                                title="Click to view uploaded bill image"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>View Bill</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No file</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-mono font-extrabold text-sm text-rose-600 whitespace-nowrap">
                            - {money(exp.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Universal Bill Image / Document Previewer Modal */}
      <BillImagePreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ ...previewModal, isOpen: false })}
        imageUrl={previewModal.imageUrl}
        storagePath={previewModal.storagePath}
        orgId={previewModal.orgId || orgId}
        title={previewModal.title}
        vendor={previewModal.vendor}
        amount={previewModal.amount}
        billNo={previewModal.billNo}
        date={previewModal.date}
        quantity={previewModal.quantity}
      />
    </div>
  )
}
