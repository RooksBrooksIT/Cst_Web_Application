import React, { useState, useMemo } from 'react'
import SiteExpensesReportHub from './SiteExpensesReportHub'
import ProjectStageReportsHub from './ProjectStageReportsHub'
import SiteStatusReportHub from './SiteStatusReportHub'
import FinancialStatusReportHub from './FinancialStatusReportHub'
import PettyCashInsightsReportHub from './PettyCashInsightsReportHub'
import DomainInventoryReportsHub from './DomainInventoryReportsHub'
import { money, parseAmount } from '../../../services/reportService'
import ExportButton from '../../../components/common/ExportButton'

export default function OrganizationReportsHub(props) {
  const {
    sites = [],
    projects = [],
    siteSupervisorEntries = [],
    managerExpenses = [],
    organizationEntries = [],
    contractorEntries = [],
    contractors = [],
    contractorBills = [],
    materials = [],
    tools = [],
    workers = [],
    workerAttendance = [],
    vehicles = [],
    siteSupervisorIncentives = [],
    pettyCashAccounts = [],
    pettyCashExpenses = [],
    pettyCashRequests = [],
    totalSiteExpensesPerDay = [],
    sitePayments = [],
    dailySiteLogs = [],
  } = props

  const allSites = sites.length > 0 ? sites : projects

  // 4 Primary Categories as requested
  const categories = [
    {
      id: 'site_expenses',
      label: 'Site Expense Reports',
      desc: 'Daily, Date Range & Cumulative expenses',
      icon: '💳',
      subReports: [
        { id: 'daily', label: 'Daily Expense Report' },
        { id: 'range', label: 'Date Range Report' },
        { id: 'summary', label: 'Cumulative Expense Summary' },
      ],
    },
    {
      id: 'project_reports',
      label: 'Project Reports',
      desc: 'Milestones, progress & site status',
      icon: '🏗️',
      subReports: [
        { id: 'progress', label: 'Project / Milestone Progress' },
        { id: 'status', label: 'Site Status & Progress' },
      ],
    },
    {
      id: 'financial_reports',
      label: 'Financial Reports',
      desc: 'Statements, cash flow & petty cash',
      icon: '📊',
      subReports: [
        { id: 'statement', label: 'Financial Statement' },
        { id: 'cash_flow', label: 'Cash Flow' },
        { id: 'petty_cash', label: 'Petty Cash Report' },
      ],
    },
    {
      id: 'inventory_reports',
      label: 'Inventory Reports',
      desc: 'Materials, tools & asset inventories',
      icon: '📦',
      subReports: [
        { id: 'materials', label: 'Materials' },
        { id: 'tools', label: 'Tools' },
        { id: 'summary', label: 'Inventory Summary' },
      ],
    },
  ]

  const [activeCategory, setActiveCategory] = useState('site_expenses')
  const [activeSubReports, setActiveSubReports] = useState({
    site_expenses: 'daily',
    project_reports: 'progress',
    financial_reports: 'statement',
    inventory_reports: 'materials',
  })

  const currentSubReport = activeSubReports[activeCategory]

  // Filter Bar state
  const todayStr = new Date().toISOString().split('T')[0]
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [filterSiteId, setFilterSiteId] = useState('all')
  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterFromDate, setFilterFromDate] = useState(thirtyDaysAgoStr)
  const [filterToDate, setFilterToDate] = useState(todayStr)
  const [filterStage, setFilterStage] = useState('all')
  const [isGenerating, setIsGenerating] = useState(false)

  // Applied filters sent to active report
  const [appliedFilters, setAppliedFilters] = useState({
    siteId: 'all',
    date: todayStr,
    fromDate: thirtyDaysAgoStr,
    toDate: todayStr,
    stage: 'all',
  })

  const handleGenerateReport = () => {
    setIsGenerating(true)
    setAppliedFilters({
      siteId: filterSiteId,
      date: filterDate,
      fromDate: filterFromDate,
      toDate: filterToDate,
      stage: filterStage,
    })
    setTimeout(() => {
      setIsGenerating(false)
    }, 400)
  }

  const handleSubReportChange = (subId) => {
    setActiveSubReports((prev) => ({
      ...prev,
      [activeCategory]: subId,
    }))
  }

  // Calculate quick summary metrics for executive KPI cards
  const totalBudget = useMemo(() => {
    return allSites.reduce((sum, s) => sum + parseAmount(s.projectBudget || s.budget || 0), 0)
  }, [allSites])

  const totalReceived = useMemo(() => {
    return sitePayments.reduce(
      (sum, p) => sum + parseAmount(p.amountPaid || p.amount || p.totalAmount || 0),
      allSites.reduce((sum, s) => sum + parseAmount(s.amountPaid || 0), 0)
    )
  }, [sitePayments, allSites])

  const totalSpent = useMemo(() => {
    return allSites.reduce(
      (sum, s) => sum + parseAmount(s.amountSpent || s.spentAmount || 0),
      totalSiteExpensesPerDay.reduce((sum, r) => sum + parseAmount(r.totalAllExpenses || r.totalAmount || 0), 0)
    )
  }, [allSites, totalSiteExpensesPerDay])

  const cashInHand = totalReceived - totalSpent
  const activeSitesCount = useMemo(() => {
    return allSites.filter((s) => {
      const st = String(s.currentStatus || s.status || '').toLowerCase()
      return ['live', 'active', 'in progress', 'ongoing', 'onprogress'].includes(st)
    }).length
  }, [allSites])

  const realizationRate = totalBudget > 0 ? Math.min(100, Math.round((totalReceived / totalBudget) * 100)) : 0
  const burnRate = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0

  const activeCategoryObj = categories.find((c) => c.id === activeCategory) || categories[0]

  return (
    <div className="space-y-6 text-slate-800 animate-fade-in pb-12">
      {/* 1. Executive Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
            <span>Organization</span>
            <span>/</span>
            <span>Reports & Analytics</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Reports & Analytics
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Data
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Select a category below to access site expense ledgers, construction milestone updates, cash flow statements, and inventory logs.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton
            filename="portfolio_executive_summary"
            headers={['Metric', 'Value']}
            data={[
              ['Total Portfolio Sites', allSites.length],
              ['Active Sites', activeSitesCount],
              ['Total Approved Contract Budget (INR)', totalBudget],
              ['Cumulative Inflow Received (INR)', totalReceived],
              ['Consolidated Actual Outflows (INR)', totalSpent],
              ['Operating Liquidity / Cash in Hand (INR)', cashInHand],
              ['Payment Realization Rate (%)', `${realizationRate}%`],
              ['Overall Budget Burn Rate (%)', `${burnRate}%`],
            ]}
            title="Export Portfolio Summary"
          />
        </div>
      </div>

      {/* 2. Executive 4-Card Bento KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Sites Audited */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Portfolio Sites</span>
            <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
              🏢
            </span>
          </div>
          <strong className="text-2xl font-extrabold text-slate-900 tracking-tight block font-mono">
            {allSites.length} <span className="text-sm font-sans font-semibold text-slate-500">Sites</span>
          </strong>
          <span className="text-[11px] text-slate-400 block">{activeSitesCount} currently in active progress</span>
        </div>

        {/* KPI 2: Total Inflow */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Total Inflow Realized</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ↓ {realizationRate}%
            </span>
          </div>
          <strong className="text-2xl font-extrabold text-emerald-700 tracking-tight block font-mono">
            {money(totalReceived)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Milestone inflows collected to date</span>
        </div>

        {/* KPI 3: Total Outflows */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Consolidated Outflow</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
              ↑ {burnRate}%
            </span>
          </div>
          <strong className="text-2xl font-extrabold text-rose-600 tracking-tight block font-mono">
            {money(totalSpent)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Actual site & operational spend</span>
        </div>

        {/* KPI 4: Operating Liquidity */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Operating Liquidity</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                cashInHand >= 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {cashInHand >= 0 ? 'Surplus' : 'Deficit'}
            </span>
          </div>
          <strong
            className={`text-2xl font-extrabold tracking-tight block font-mono ${
              cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'
            }`}
          >
            {money(cashInHand)}
          </strong>
          <span className="text-[11px] text-slate-400 block">Net operating cash buffer (Received - Spent)</span>
        </div>
      </div>

      {/* 3. Primary 4-Category Navigation Bar */}
      <section className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{cat.icon}</span>
                  {isActive && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  <strong className={`block text-xs font-extrabold tracking-tight ${isActive ? 'text-white' : 'text-slate-900'}`}>
                    {cat.label}
                  </strong>
                  <span className={`text-[11px] block leading-tight ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {cat.desc}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Sub-Report Selector Pills */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1 whitespace-nowrap">
            Reports:
          </span>
          {activeCategoryObj.subReports.map((sub) => {
            const isSubActive = currentSubReport === sub.id
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSubReportChange(sub.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSubActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {sub.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* 4. Prominent Unified Filter Bar */}
      <section className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-700 font-bold text-sm">🔍</span>
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Filter Section
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Configure parameters and click <strong>Generate Report</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Select Site */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Select Site
            </label>
            <select
              value={filterSiteId}
              onChange={(e) => setFilterSiteId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Portfolio Sites</option>
              {allSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.projectName || s.siteName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          {/* Context-Aware Date Filter */}
          {currentSubReport === 'daily' ? (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Select Date
              </label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Select Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
                  title="From Date"
                />
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
                  title="To Date"
                />
              </div>
            </div>
          )}

          {/* Select Project Stage */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Select Project Stage
            </label>
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Stages</option>
              <option value="Foundation">Foundation</option>
              <option value="Plinth">Plinth</option>
              <option value="Structure">Structure</option>
              <option value="Brickwork">Brickwork</option>
              <option value="Plastering">Plastering</option>
              <option value="Flooring">Flooring</option>
              <option value="Finishing">Finishing</option>
              <option value="Handover">Handover</option>
            </select>
          </div>

          {/* Generate Report Button */}
          <div className="space-y-1 flex flex-col justify-end">
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="w-full h-[38px] bg-[#0B3470] hover:bg-[#082654] text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-75"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 5. Active Report Content Section */}
      <section className="space-y-6">
        {/* Category 1: Site Expense Reports */}
        {activeCategory === 'site_expenses' && (
          <SiteExpensesReportHub
            sites={allSites}
            siteSupervisorEntries={siteSupervisorEntries}
            managerExpenses={managerExpenses}
            organizationEntries={organizationEntries}
            contractorEntries={contractorEntries}
            totalSiteExpensesPerDay={totalSiteExpensesPerDay}
            sitePayments={sitePayments}
            siteSupervisorIncentives={siteSupervisorIncentives}
            dailySiteLogs={dailySiteLogs}
            subReport={currentSubReport}
            initialSiteId={appliedFilters.siteId}
            initialDate={appliedFilters.date}
            initialFromDate={appliedFilters.fromDate}
            initialToDate={appliedFilters.toDate}
            initialStage={appliedFilters.stage}
          />
        )}

        {/* Category 2: Project Reports */}
        {activeCategory === 'project_reports' && (
          <>
            {currentSubReport === 'progress' && (
              <ProjectStageReportsHub
                sites={allSites}
                siteSupervisorEntries={siteSupervisorEntries}
                managerExpenses={managerExpenses}
                organizationEntries={organizationEntries}
                contractorEntries={contractorEntries}
                subReport="progress"
                initialStage={appliedFilters.stage}
              />
            )}
            {currentSubReport === 'status' && (
              <SiteStatusReportHub
                sites={allSites}
                initialSiteId={appliedFilters.siteId}
                initialStage={appliedFilters.stage}
              />
            )}
          </>
        )}

        {/* Category 3: Financial Reports */}
        {activeCategory === 'financial_reports' && (
          <>
            {(currentSubReport === 'statement' || currentSubReport === 'cash_flow') && (
              <FinancialStatusReportHub
                sites={allSites}
                sitePayments={sitePayments}
                totalSiteExpensesPerDay={totalSiteExpensesPerDay}
                siteSupervisorEntries={siteSupervisorEntries}
                subReport={currentSubReport}
                initialSiteId={appliedFilters.siteId}
              />
            )}
            {currentSubReport === 'petty_cash' && (
              <PettyCashInsightsReportHub
                sites={allSites}
                pettyCashAccounts={pettyCashAccounts}
                pettyCashExpenses={pettyCashExpenses}
                pettyCashRequests={pettyCashRequests}
                subReport="audit"
              />
            )}
          </>
        )}

        {/* Category 4: Inventory Reports */}
        {activeCategory === 'inventory_reports' && (
          <DomainInventoryReportsHub
            contractors={contractors}
            contractorBills={contractorBills}
            contractorEntries={contractorEntries}
            materials={materials}
            tools={tools}
            workers={workers}
            workerAttendance={workerAttendance}
            vehicles={vehicles}
            siteSupervisorIncentives={siteSupervisorIncentives}
            subReport={currentSubReport}
          />
        )}
      </section>
    </div>
  )
}
