import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import ExportButton from '../../../components/common/ExportButton'
import SiteFinancialDetailsPage from './SiteFinancialDetailsPage'
import {
  amountValue,
  matchesSite,
  money,
  statusBadgeColor,
} from './financeUtils'

export default function OrgFinancePage({
  sites = [],
  totalSiteExpensesPerDay = [],
  sitePayments = [],
}) {
  const { orgId } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [sortBy, setSortBy] = useState('highest_budget')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'grid'
  const [selectedSiteForDetails, setSelectedSiteForDetails] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Pre-calculate site financial rollups according to Section 3 of specification
  const siteFinanceRows = useMemo(() => {
    return sites.map((site) => {
      const siteId = site.siteId || site.siteid || site.id || site.code || ''
      const siteName = site.siteName || site.sitename || site.projectName || site.name || siteId
      const projectName = site.projectName || siteName
      const ownerName = site.ownerName || site.ownername || site.clientName || 'Direct Client'
      const ownerPhone = site.ownerPhoneNumber || site.ownerPhone || site.phone || site.clientPhone || ''
      const category = site.projectCategory || 'House'
      const subCategory = site.projectSubCategory || '2BHK'
      const status = site.currentStatus || site.status || 'Live'
      const location = site.location?.address || site.siteLocation || site.location || 'Location Registered'

      // 1. Budget
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

      // 2. Find matching totalSiteExpensesPerDay doc
      const expDoc = totalSiteExpensesPerDay.find((d) => matchesSite(d, site)) || {}
      const totalAllExp = amountValue(expDoc, ['totalAllExpenses', 'totalAllExpense', 'total_all_expenses', 'totalExpenses', 'totalExpense'])
      const supervisorExp = amountValue(expDoc, ['totalSiteExpense', 'totalSupervisorExpense', 'siteExpense', 'supervisorExpense', 'total_site_expense'])
      const mgrExp = amountValue(expDoc, ['totalMgrExpense', 'totalManagerExpense', 'managerExpense', 'mgrExpense', 'total_mgr_expense'])
      const orgExp = amountValue(expDoc, ['totalOrgExpense', 'totalOrganizationExpense', 'orgExpense', 'organizationExpense', 'total_org_expense'])
      const conExp = amountValue(expDoc, ['totalContractorExpense', 'totalContractorPayments', 'contractorExpense', 'total_contractor_expense'])
      const incExp = amountValue(expDoc, ['totalIncentiveExpenses', 'totalIncentives', 'incentiveExpenses', 'total_incentive_expenses'])
      const calculatedExpenses = supervisorExp + mgrExp + orgExp + conExp + incExp

      const directSiteExpenses = amountValue(site, [
        'amountSpent',
        'amountSpend',
        'spent',
        'spentAmount',
        'totalAllExpenses',
        'totalExpenses',
        'totalExpense',
        'actualExpense',
        'actualExpenditure',
        'actual',
        'expenditure',
        'amount_spent',
        'total_expenses',
        'total_all_expenses',
      ])

      let expenses = 0
      if (totalAllExp > 0) {
        expenses = totalAllExp
      } else if (calculatedExpenses > 0) {
        expenses = calculatedExpenses
      } else {
        expenses = directSiteExpenses
      }

      // 3. Inflow income
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

      const matchingPayments = sitePayments.filter((p) => matchesSite(p, site))
      const paymentsSum = matchingPayments.reduce((sum, p) => {
        return (
          sum +
          amountValue(p, [
            'amount',
            'paymentAmount',
            'paidAmount',
            'receivedAmount',
            'totalAmount',
            'amountPaid',
            'amountReceived',
            'received',
          ])
        )
      }, 0)

      const income = paymentsSum > 0 ? Math.max(directSiteIncome, paymentsSum) : directSiteIncome

      // 4. Balance & Cushion
      const cashInHand = income - expenses
      const explicitBalance = amountValue(site, [
        'amountBalance',
        'balance',
        'remainingBalance',
        'remainingBudget',
        'budgetRemaining',
        'amount_balance',
      ])
      let balance = 0
      if (budget > 0) {
        balance = budget - expenses
      } else if (income > 0) {
        balance = income - expenses
      } else if (explicitBalance !== 0) {
        balance = explicitBalance
      }

      const usagePercent = budget > 0 ? Math.min(100, Math.max(0, Math.round((expenses / budget) * 100))) : 0
      const realizationPercent = budget > 0 ? Math.min(100, Math.max(0, Math.round((income / budget) * 100))) : 0
      const isCritical = usagePercent >= 85

      // Petty cash
      const pcReceived = amountValue(expDoc, ['totalPettyCashReceived', 'pettyCashReceived', 'totalPettyCashDisbursed'])
      const pcSpent = amountValue(expDoc, ['totalPettyCashExpense', 'pettyCashExpense', 'totalPettyCashSpent', 'pettyCashSpent'])
      const pcRemaining = amountValue(expDoc, ['remainingPettyCash', 'pettyCashBalance', 'floatBalance']) || (pcReceived - pcSpent)

      return {
        site,
        expDoc,
        siteId,
        siteName,
        projectName,
        ownerName,
        ownerPhone,
        category,
        subCategory,
        status,
        location,
        budget,
        income,
        expenses,
        balance,
        cashInHand,
        usagePercent,
        realizationPercent,
        isCritical,
        supervisorExp,
        mgrExp,
        orgExp,
        conExp,
        incExp,
        pcRemaining,
      }
    })
  }, [sites, totalSiteExpensesPerDay, sitePayments])

  // Global Financial Overview KPI calculations
  const globalTotalBudget = useMemo(() => siteFinanceRows.reduce((sum, s) => sum + s.budget, 0), [siteFinanceRows])
  const globalTotalIncome = useMemo(() => siteFinanceRows.reduce((sum, s) => sum + s.income, 0), [siteFinanceRows])
  const globalTotalExpenses = useMemo(() => siteFinanceRows.reduce((sum, s) => sum + s.expenses, 0), [siteFinanceRows])
  const globalCashInHand = globalTotalIncome - globalTotalExpenses
  const globalBudgetRemaining = globalTotalBudget > 0 ? globalTotalBudget - globalTotalExpenses : globalCashInHand
  const globalUsagePercent = globalTotalBudget > 0 ? Math.min(100, Math.max(0, Math.round((globalTotalExpenses / globalTotalBudget) * 100))) : 0
  const globalRealizationPercent = globalTotalBudget > 0 ? Math.min(100, Math.max(0, Math.round((globalTotalIncome / globalTotalBudget) * 100))) : 0

  // Category list for filter
  const categoryOptions = useMemo(() => {
    const set = new Set()
    siteFinanceRows.forEach((s) => {
      if (s.category) set.add(s.category)
    })
    return ['All', ...Array.from(set)]
  }, [siteFinanceRows])

  // Status counts for chips
  const liveCount = useMemo(
    () => siteFinanceRows.filter((s) => ['live', 'in progress', 'onprogress', 'ongoing', 'active'].includes(s.status.toLowerCase())).length,
    [siteFinanceRows]
  )
  const completedCount = useMemo(
    () => siteFinanceRows.filter((s) => ['completed', 'done', 'finished'].includes(s.status.toLowerCase())).length,
    [siteFinanceRows]
  )
  const planningCount = useMemo(
    () => siteFinanceRows.filter((s) => ['planning', 'draft', 'setup'].includes(s.status.toLowerCase())).length,
    [siteFinanceRows]
  )
  const criticalCount = useMemo(
    () => siteFinanceRows.filter((s) => s.isCritical).length,
    [siteFinanceRows]
  )

  // Expense categories totals for composition preview
  const expenseComposition = useMemo(() => {
    let supervisor = 0
    let pettyCash = 0
    let manager = 0
    let organization = 0
    let contractor = 0
    let incentive = 0

    siteFinanceRows.forEach((r) => {
      supervisor += r.supervisorExp
      manager += r.mgrExp
      organization += r.orgExp
      contractor += r.conExp
      incentive += r.incExp
    })

    return { supervisor, pettyCash, manager, organization, contractor, incentive }
  }, [siteFinanceRows])

  // Filtering & Sorting
  const filteredAndSortedSites = useMemo(() => {
    let result = siteFinanceRows.filter((item) => {
      // Search
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matches =
          item.siteName.toLowerCase().includes(q) ||
          item.projectName.toLowerCase().includes(q) ||
          item.ownerName.toLowerCase().includes(q) ||
          item.siteId.toLowerCase().includes(q) ||
          item.ownerPhone.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q)
        if (!matches) return false
      }

      // Status filter
      if (statusFilter !== 'All') {
        const s = item.status.toLowerCase()
        if (statusFilter === 'Live') {
          if (!['live', 'active', 'ongoing', 'onprogress', 'in progress'].includes(s)) return false
        } else if (statusFilter === 'In Progress') {
          if (!['in progress', 'onprogress', 'ongoing'].includes(s)) return false
        } else if (statusFilter === 'Planning') {
          if (!['planning', 'draft', 'setup'].includes(s)) return false
        } else if (statusFilter === 'Completed') {
          if (!['completed', 'done', 'finished'].includes(s)) return false
        } else if (statusFilter === 'Critical') {
          if (!item.isCritical) return false
        }
      }

      // Category filter
      if (categoryFilter !== 'All') {
        if (item.category.toLowerCase() !== categoryFilter.toLowerCase()) return false
      }

      return true
    })

    // Sort
    if (sortBy === 'highest_budget') result.sort((a, b) => b.budget - a.budget)
    else if (sortBy === 'highest_expenses') result.sort((a, b) => b.expenses - a.expenses)
    else if (sortBy === 'highest_income') result.sort((a, b) => b.income - a.income)
    else if (sortBy === 'highest_usage') result.sort((a, b) => b.usagePercent - a.usagePercent)
    else if (sortBy === 'lowest_balance') result.sort((a, b) => a.balance - b.balance)
    else if (sortBy === 'name_asc') result.sort((a, b) => a.siteName.localeCompare(b.siteName))

    return result
  }, [siteFinanceRows, search, statusFilter, categoryFilter, sortBy])

  // Pagination for table view
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedSites.length / pageSize))
  const paginatedSites = useMemo(() => {
    if (viewMode === 'grid') return filteredAndSortedSites
    const start = (page - 1) * pageSize
    return filteredAndSortedSites.slice(start, start + pageSize)
  }, [filteredAndSortedSites, page, pageSize, viewMode])

  const isFilterActive = search.trim() !== '' || statusFilter !== 'All' || categoryFilter !== 'All'

  // If a site is selected for drill-down, render the drill-down component
  if (selectedSiteForDetails) {
    return (
      <SiteFinancialDetailsPage
        site={selectedSiteForDetails.site}
        totalExpensesDoc={selectedSiteForDetails.expDoc}
        sitePayments={sitePayments}
        onBack={() => setSelectedSiteForDetails(null)}
        orgId={orgId}
      />
    )
  }

  return (
    <div className="space-y-6 text-slate-800 animate-fade-in pb-12">
      {/* 1. Executive Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
            <span>Organization</span>
            <span>/</span>
            <span>Financial Command Center</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Financial Management & Site Ledgers
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Consolidated multi-site financial management, cash-flow monitoring, client realization rates, and contractual budget cushions.
          </p>
        </div>

        {/* Quick Navigation & Export Action */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/organization/petty-cash"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100 transition-colors shadow-2xs"
          >
            <span>◈</span> Petty Cash Hub
          </Link>
          <Link
            to="/organization/approvals"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200/80 hover:bg-indigo-100 transition-colors shadow-2xs"
          >
            <span>✓</span> Approvals Queue
          </Link>
          <Link
            to="/organization/reports"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 transition-colors shadow-2xs"
          >
            <span>▤</span> Financial Reports
          </Link>

          <ExportButton
            filename="organization_financial_ledger"
            headers={[
              'Site ID',
              'Site Name',
              'Project',
              'Client / Owner',
              'Status',
              'Budget (INR)',
              'Inflow Received (INR)',
              'Expenses (INR)',
              'Net Cash in Hand (INR)',
              'Budget Remaining (INR)',
              'Budget Utilization (%)',
            ]}
            data={filteredAndSortedSites.map((s) => [
              s.siteId,
              s.siteName,
              s.projectName,
              s.ownerName,
              s.status,
              s.budget,
              s.income,
              s.expenses,
              s.cashInHand,
              s.balance,
              `${s.usagePercent}%`,
            ])}
            title="Export Portfolio Financial Ledger"
          />
        </div>
      </div>

      {/* 2. Executive Financial KPI Bento Grid (5 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Total Budget */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Portfolio Budget</span>
            <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
              ₹
            </span>
          </div>
          <strong className="text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight block font-mono">
            {money(globalTotalBudget)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Across {sites.length} registered project sites</span>
        </div>

        {/* KPI 2: Total Customer Inflow */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Total Inflow</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ↓ {globalRealizationPercent}% Realized
            </span>
          </div>
          <strong className="text-xl lg:text-2xl font-extrabold text-emerald-700 tracking-tight block font-mono">
            {money(globalTotalIncome)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Total client milestone payments</span>
        </div>

        {/* KPI 3: Total Expenses */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Total Expenses</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
              ↑ {globalUsagePercent}% Burn
            </span>
          </div>
          <strong className="text-xl lg:text-2xl font-extrabold text-rose-600 tracking-tight block font-mono">
            {money(globalTotalExpenses)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Consolidated outflows across all sites</span>
        </div>

        {/* KPI 4: Operating Liquidity (Cash in Hand) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Cash in Hand</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                globalCashInHand >= 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {globalCashInHand >= 0 ? 'Surplus' : 'Deficit'}
            </span>
          </div>
          <strong
            className={`text-xl lg:text-2xl font-extrabold tracking-tight block font-mono ${
              globalCashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'
            }`}
          >
            {money(globalCashInHand)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Net operating liquidity buffer</span>
        </div>

        {/* KPI 5: Budget Remaining Cushion */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Margin Cushion</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Buffer
            </span>
          </div>
          <strong
            className={`text-xl lg:text-2xl font-extrabold tracking-tight block font-mono ${
              globalBudgetRemaining >= 0 ? 'text-slate-900' : 'text-rose-600'
            }`}
          >
            {money(globalBudgetRemaining)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Total contract unspent margin</span>
        </div>
      </div>

      {/* 3. Portfolio Budget Health & Alert Banner */}
      {criticalCount > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50/60 to-rose-50 border border-rose-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-sm">
              ⚠️
            </span>
            <div>
              <strong className="text-xs font-bold text-rose-900 block">
                Budget Alert: {criticalCount} {criticalCount === 1 ? 'Site has' : 'Sites have'} exceeded 85% of their budget!
              </strong>
              <span className="text-[11px] text-rose-700">
                High burn rate detected. Inspect site expenditure and review pending material bills.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('Critical')}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
          >
            Filter Critical Sites ({criticalCount})
          </button>
        </div>
      )}

      {/* 4. Interactive Control & Filter Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Multi-attribute Search Input */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search site, project, client, ID, or location..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdowns, Sort & View Mode Switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 font-medium">Type:</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value)
                  setPage(1)
                }}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Types' : cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 font-medium">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
              >
                <option value="highest_budget">Highest Budget</option>
                <option value="highest_expenses">Highest Spend</option>
                <option value="highest_income">Highest Inflow</option>
                <option value="highest_usage">Highest % Spent</option>
                <option value="lowest_balance">Lowest Cushion</option>
                <option value="name_asc">Site Name (A-Z)</option>
              </select>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Desktop Table View"
              >
                ▦ Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Grid Cards View"
              >
                ⊞ Cards
              </button>
            </div>

            {/* Reset Filters */}
            {isFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('All')
                  setCategoryFilter('All')
                  setPage(1)
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Status Segmented Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 pb-1 sm:pb-0">
          {[
            { id: 'All', label: 'All Sites', count: siteFinanceRows.length },
            { id: 'Live', label: 'Live / In Progress', count: liveCount },
            { id: 'Planning', label: 'Planning', count: planningCount },
            { id: 'Completed', label: 'Completed', count: completedCount },
            { id: 'Critical', label: '⚠️ Budget Alert (>85%)', count: criticalCount },
          ].map((tab) => {
            const isActive = statusFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id)
                  setPage(1)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent'
                }`}
              >
                {tab.label}
                <span
                  className={`ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 5. Section Header & Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-[#0B3470]" />
          <strong className="text-sm text-slate-900 font-bold">Sites Financial Breakdown</strong>
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200 text-[11px]">
            {filteredAndSortedSites.length} {filteredAndSortedSites.length === 1 ? 'Site' : 'Sites'}
          </span>
        </div>
        <span>
          Showing {viewMode === 'table' ? Math.min(pageSize, filteredAndSortedSites.length) : filteredAndSortedSites.length} of{' '}
          {filteredAndSortedSites.length} matching sites
        </span>
      </div>

      {/* 6. Standard Web Data Table View (Desktop-Optimized) */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Site & Project</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Contract Budget</th>
                  <th className="p-3.5 text-right">Inflow (Received)</th>
                  <th className="p-3.5 text-right">Expenses (Spent)</th>
                  <th className="p-3.5 text-right">Cash in Hand</th>
                  <th className="p-3.5 text-right">Margin Cushion</th>
                  <th className="p-3.5 text-center">Budget Spent</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSites.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400 text-xs">
                      No sites found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedSites.map((item) => (
                    <tr
                      key={item.siteId}
                      onClick={() => setSelectedSiteForDetails(item)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      {/* Site & Project */}
                      <td className="p-3.5 max-w-xs">
                        <strong className="text-slate-900 block text-xs font-bold group-hover:text-blue-700 transition-colors">
                          {item.siteName}
                        </strong>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {item.siteId}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate">
                            {item.ownerName}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-medium text-slate-700">{item.category}</span>
                        <small className="text-slate-400 block">{item.subCategory}</small>
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <StatusBadge status={item.status} />
                      </td>

                      {/* Budget */}
                      <td className="p-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {money(item.budget)}
                      </td>

                      {/* Inflow Received */}
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        +{money(item.income)}
                        <small className="text-[10px] text-slate-400 block font-sans">
                          {item.realizationPercent}% realized
                        </small>
                      </td>

                      {/* Expenses */}
                      <td className="p-3.5 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                        -{money(item.expenses)}
                      </td>

                      {/* Cash in Hand */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-bold ${
                            item.cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'
                          }`}
                        >
                          {money(item.cashInHand)}
                        </span>
                      </td>

                      {/* Margin Cushion */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-bold ${
                            item.balance >= 0 ? 'text-slate-700' : 'text-rose-600'
                          }`}
                        >
                          {money(item.balance)}
                        </span>
                      </td>

                      {/* Budget Utilization Meter */}
                      <td className="p-3.5 text-center min-w-[130px]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span
                              className={`font-bold ${
                                item.isCritical ? 'text-rose-600' : 'text-slate-700'
                              }`}
                            >
                              {item.usagePercent}%
                            </span>
                            {item.isCritical && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 font-bold">
                                Alert
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                item.isCritical ? 'bg-rose-500' : 'bg-[#0B3470]'
                              }`}
                              style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedSiteForDetails(item)
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                        >
                          View Statement →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
              <span>
                Showing {(page - 1) * pageSize + 1} to{' '}
                {Math.min(page * pageSize, filteredAndSortedSites.length)} of {filteredAndSortedSites.length} sites
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-2 font-bold text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. Standard Web Grid Cards View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAndSortedSites.length === 0 ? (
            <div className="col-span-full p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
              <span className="text-3xl block">👛</span>
              <h3 className="text-sm font-bold text-slate-800">No sites found</h3>
              <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('All')
                  setCategoryFilter('All')
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredAndSortedSites.map((item) => (
              <div
                key={item.siteId}
                onClick={() => setSelectedSiteForDetails(item)}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                {/* Card Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                        {item.siteName}
                        <span className="text-slate-400 text-xs font-normal">→</span>
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {item.siteId}
                        </span>
                        {item.projectName !== item.siteName && (
                          <span className="text-[11px] text-slate-500 font-medium truncate max-w-[150px]">
                            {item.projectName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadgeColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  {/* Metadata line */}
                  <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                    <p className="font-medium text-slate-700">{item.category} • {item.subCategory}</p>
                    <p className="text-[11px] text-slate-400 truncate">Owner: {item.ownerName} {item.ownerPhone && `(${item.ownerPhone})`}</p>
                  </div>
                </div>

                {/* 4-Metric Grid */}
                <div className="grid grid-cols-4 gap-2 pt-3 pb-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Budget</span>
                    <strong className="text-slate-900 block font-mono text-xs truncate">{money(item.budget)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Income</span>
                    <strong className="text-emerald-700 block font-mono text-xs truncate">+{money(item.income)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Spent</span>
                    <strong className="text-rose-600 block font-mono text-xs truncate">-{money(item.expenses)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Balance</span>
                    <strong
                      className={`block font-mono text-xs truncate ${
                        item.balance >= 0 ? 'text-purple-700' : 'text-rose-600'
                      }`}
                    >
                      {money(item.balance)}
                    </strong>
                  </div>
                </div>

                {/* Budget Utilization Meter */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Budget Consumed:</span>
                    <strong className={item.isCritical ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                      {item.usagePercent}% {item.isCritical && '⚠️ Critical'}
                    </strong>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        item.isCritical ? 'bg-rose-500' : 'bg-[#0B3470]'
                      }`}
                      style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                    />
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    Cash in Hand: <strong className="font-mono text-slate-700">{money(item.cashInHand)}</strong>
                  </span>
                  <span className="font-bold text-blue-700 group-hover:underline">
                    View Statement →
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
