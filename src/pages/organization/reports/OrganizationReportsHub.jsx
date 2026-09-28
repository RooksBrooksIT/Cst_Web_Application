import React, { useState, useMemo } from 'react'
import SiteExpensesReportHub from './SiteExpensesReportHub'
import ProjectStageReportsHub from './ProjectStageReportsHub'
import SiteStatusReportHub from './SiteStatusReportHub'
import FinancialStatusReportHub from './FinancialStatusReportHub'
import PettyCashInsightsReportHub from './PettyCashInsightsReportHub'
import DomainInventoryReportsHub from './DomainInventoryReportsHub'
import WorkerAttendanceReport from './WorkerAttendanceReport'
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
    orgId,
  } = props

  const allSites = sites.length > 0 ? sites : projects

  const categories = [
    {
      id: 'site_expenses',
      label: 'Site Expenses',
      desc: 'Daily & cumulative site spend',
      icon: '💳',
      subReports: [
        { id: 'daily', label: 'Daily Expense Report' },
        { id: 'range', label: 'Date Range Report' },
        { id: 'summary', label: 'Cumulative Expense Summary' },
      ],
    },
    {
      id: 'workforce_reports',
      label: 'Workforce & Attendance',
      desc: 'Muster roll & wage ledgers',
      icon: '👥',
      subReports: [
        { id: 'muster', label: 'Attendance & Muster Roll' },
        { id: 'incentives', label: 'Supervisor & Manager Incentives' },
      ],
    },
    {
      id: 'project_reports',
      label: 'Project Reports',
      desc: 'Progress & milestone schedules',
      icon: '🏗️',
      subReports: [
        { id: 'progress', label: 'Milestone Progress' },
        { id: 'status', label: 'Site Status & Timeline' },
      ],
    },
    {
      id: 'financial_reports',
      label: 'Financial Reports',
      desc: 'Statements & cash flow audit',
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
      desc: 'Materials, tools & asset logs',
      icon: '📦',
      subReports: [
        { id: 'materials', label: 'Material Stock' },
        { id: 'tools', label: 'Tools & Machinery' },
        { id: 'summary', label: 'Contractor Payouts' },
      ],
    },
  ]

  const [activeCategory, setActiveCategory] = useState('site_expenses')
  const [activeSubReports, setActiveSubReports] = useState({
    site_expenses: 'daily',
    workforce_reports: 'muster',
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

  const [appliedFilters, setAppliedFilters] = useState({
    siteId: 'all',
    date: todayStr,
    fromDate: thirtyDaysAgoStr,
    toDate: todayStr,
    stage: 'all',
  })

  const handleSiteChange = (val) => {
    setFilterSiteId(val)
    setAppliedFilters((prev) => ({ ...prev, siteId: val }))
  }

  const handleDateChange = (val) => {
    setFilterDate(val)
    setAppliedFilters((prev) => ({ ...prev, date: val }))
  }

  const handleFromDateChange = (val) => {
    setFilterFromDate(val)
    setAppliedFilters((prev) => ({ ...prev, fromDate: val }))
  }

  const handleToDateChange = (val) => {
    setFilterToDate(val)
    setAppliedFilters((prev) => ({ ...prev, toDate: val }))
  }

  const handleStageChange = (val) => {
    setFilterStage(val)
    setAppliedFilters((prev) => ({ ...prev, stage: val }))
  }

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
    }, 300)
  }

  const handleSubReportChange = (subId) => {
    setActiveSubReports((prev) => ({
      ...prev,
      [activeCategory]: subId,
    }))
  }

  // Quick KPI summary calculations
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
  const activeCategoryObj = categories.find((c) => c.id === activeCategory) || categories[0]

  return (
    <div className="space-y-5 text-slate-800 animate-fade-in pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Organization Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time multi-site financial summaries, attendance ledgers, inventory logs, and milestone progress.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ExportButton
            filename="portfolio_executive_summary"
            headers={['Metric', 'Value']}
            data={[
              ['Total Portfolio Sites', allSites.length],
              ['Total Approved Contract Budget (INR)', totalBudget],
              ['Cumulative Inflow Received (INR)', totalReceived],
              ['Consolidated Actual Outflows (INR)', totalSpent],
              ['Operating Liquidity (INR)', cashInHand],
            ]}
            title="Export Portfolio Summary"
          />
        </div>
      </div>

      {/* 2. Executive 4-KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Portfolio Sites</span>
          <strong className="text-xl font-extrabold text-slate-900 block font-mono mt-0.5">
            {allSites.length} <span className="text-xs font-normal text-slate-500">Active Sites</span>
          </strong>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Inflow Received</span>
          <strong className="text-xl font-extrabold text-emerald-700 block font-mono mt-0.5">
            {money(totalReceived)}
          </strong>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Consolidated Outflow</span>
          <strong className="text-xl font-extrabold text-rose-600 block font-mono mt-0.5">
            {money(totalSpent)}
          </strong>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Operating Liquidity</span>
          <strong className={`text-xl font-extrabold block font-mono mt-0.5 ${cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
            {money(cashInHand)}
          </strong>
        </div>
      </div>

      {/* 2B. Insight Dashboard Quick Access Reports Portal */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <span>🚀</span>
            <span>Insight Dashboard Quick Reports Portal</span>
          </h3>
          <span className="text-[11px] text-slate-400">Direct report navigation</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setActiveCategory('site_expenses')
              handleSubReportChange('range')
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left transition-all cursor-pointer group"
          >
            <span className="text-base block mb-1">💳</span>
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-700 block truncate">Site Expenses</span>
            <span className="text-[10px] text-slate-400 block truncate">Daily & range spend</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('project_reports')
              handleSubReportChange('progress')
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left transition-all cursor-pointer group"
          >
            <span className="text-base block mb-1">🏗️</span>
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-700 block truncate">Stage Expenses</span>
            <span className="text-[10px] text-slate-400 block truncate">Milestones & budget</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('project_reports')
              handleSubReportChange('status')
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left transition-all cursor-pointer group"
          >
            <span className="text-base block mb-1">⏱️</span>
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-700 block truncate">Site Status</span>
            <span className="text-[10px] text-slate-400 block truncate">Timeline & delays</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('financial_reports')
              handleSubReportChange('statement')
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left transition-all cursor-pointer group"
          >
            <span className="text-base block mb-1">📊</span>
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-700 block truncate">Financial Status</span>
            <span className="text-[10px] text-slate-400 block truncate">Balance sheet & flows</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('inventory_reports')
              handleSubReportChange('summary')
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left transition-all cursor-pointer group"
          >
            <span className="text-base block mb-1">👷</span>
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-700 block truncate">Contractor Report</span>
            <span className="text-[10px] text-slate-400 block truncate">Trade bills & payouts</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('financial_reports')
              handleSubReportChange('petty_cash')
            }}
            className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left transition-all cursor-pointer group"
          >
            <span className="text-base block mb-1">💵</span>
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-blue-700 block truncate">Petty Cash</span>
            <span className="text-[10px] text-slate-400 block truncate">Float & receipts</span>
          </button>
        </div>
      </div>

      {/* 3. Category Tabs & Sub-Reports Selector */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-100">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            )
          })}
        </div>

        {/* Sub-report pills */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            Sub Reports:
          </span>
          {activeCategoryObj.subReports.map((sub) => {
            const isSubActive = currentSubReport === sub.id
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSubReportChange(sub.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSubActive
                    ? 'bg-[#0B3470] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent'
                }`}
              >
                {sub.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 4. Compact Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
              Filter Site
            </label>
            <select
              value={filterSiteId}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer"
            >
              <option value="all">All Managed Sites</option>
              {allSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.projectName || s.siteName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          {currentSubReport === 'daily' ? (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                Select Date
              </label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer"
              />
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => handleFromDateChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                />
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => handleToDateChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
              Project Stage
            </label>
            <select
              value={filterStage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer"
            >
              <option value="all">All Stages</option>
              <option value="Foundation">Foundation</option>
              <option value="Plinth">Plinth</option>
              <option value="Structure">Structure</option>
              <option value="Brickwork">Brickwork</option>
              <option value="Plastering">Plastering</option>
              <option value="Flooring">Flooring</option>
              <option value="Finishing">Finishing</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="w-full py-2 bg-[#0B3470] hover:bg-[#082654] text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-75"
            >
              {isGenerating ? (
                <span>Filtering...</span>
              ) : (
                <span>Apply Filter</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 5. Active Report Content */}
      <div className="space-y-6">
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

        {activeCategory === 'workforce_reports' && (
          <>
            {currentSubReport === 'muster' && (
              <WorkerAttendanceReport
                orgId={orgId}
                sites={allSites}
                initialMonth={appliedFilters.date ? appliedFilters.date.slice(0, 7) : new Date().toISOString().slice(0, 7)}
                initialSiteId={appliedFilters.siteId}
              />
            )}
            {currentSubReport === 'incentives' && (
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
                subReport="incentives"
                initialSiteId={appliedFilters.siteId}
              />
            )}
          </>
        )}

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
                initialSiteId={appliedFilters.siteId}
              />
            )}
          </>
        )}

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
            initialSiteId={appliedFilters.siteId}
          />
        )}
      </div>
    </div>
  )
}
