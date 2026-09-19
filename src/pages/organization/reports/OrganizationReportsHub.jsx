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
  const [activeTab, setActiveTab] = useState('site_expenses') // 'site_expenses', 'stage_expenses', 'status', 'financial', 'petty_cash', 'domain'

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

  const reportTabs = [
    {
      id: 'site_expenses',
      label: 'Site Expenses',
      desc: 'Daily, Range & Cumulative',
      icon: '💰',
    },
    {
      id: 'stage_expenses',
      label: 'Milestone Stages',
      desc: 'Foundation to Finishing Burn',
      icon: '🏗️',
    },
    {
      id: 'status',
      label: 'Site Status & Progress',
      desc: 'Timeline, Delays & Schedule',
      icon: '⏱️',
    },
    {
      id: 'financial',
      label: 'Financial Statements',
      desc: 'Cash Flow & Balance Sheet',
      icon: '📊',
    },
    {
      id: 'petty_cash',
      label: 'Petty Cash Audit',
      desc: 'Float Balances & Receipts',
      icon: '💵',
    },
    {
      id: 'domain',
      label: 'Domain & Inventory',
      desc: 'Contractors, Materials & Tools',
      icon: '📦',
    },
  ]

  return (
    <div className="space-y-6 text-slate-800 animate-fade-in pb-12">
      {/* 1. Executive Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
            <span>Organization</span>
            <span>/</span>
            <span>Reports & Analytics</span>
            <span>/</span>
            <span>Executive Hub</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Reports & Analytics Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Audit Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Comprehensive operational auditing across multi-site expenses, construction milestone stages, cash flow statements, and inventory muster rolls.
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
            title="Export Portfolio Audit Executive Summary"
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
          <span className="text-[11px] text-slate-400 block">{activeSitesCount} currently in active construction</span>
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
          <span className="text-[11px] text-slate-400 block">Actual site & corporate expenditures</span>
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

      {/* 3. Primary Report Hub Navigation Tabs */}
      <section className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
          {reportTabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between space-y-1 ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base">{tab.icon}</span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
                <div>
                  <strong className={`block text-xs font-bold ${isActive ? 'text-white' : 'text-slate-900'}`}>
                    {tab.label}
                  </strong>
                  <span className={`text-[10px] block leading-tight ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {tab.desc}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* 4. Active Sub-Report Module View */}
      <section className="space-y-6">
        {activeTab === 'site_expenses' && (
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
          />
        )}

        {activeTab === 'stage_expenses' && (
          <ProjectStageReportsHub
            sites={allSites}
            siteSupervisorEntries={siteSupervisorEntries}
            managerExpenses={managerExpenses}
            organizationEntries={organizationEntries}
            contractorEntries={contractorEntries}
          />
        )}

        {activeTab === 'status' && (
          <SiteStatusReportHub sites={allSites} />
        )}

        {activeTab === 'financial' && (
          <FinancialStatusReportHub
            sites={allSites}
            sitePayments={sitePayments}
            totalSiteExpensesPerDay={totalSiteExpensesPerDay}
            siteSupervisorEntries={siteSupervisorEntries}
          />
        )}

        {activeTab === 'petty_cash' && (
          <PettyCashInsightsReportHub
            sites={allSites}
            pettyCashAccounts={pettyCashAccounts}
            pettyCashExpenses={pettyCashExpenses}
            pettyCashRequests={pettyCashRequests}
          />
        )}

        {activeTab === 'domain' && (
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
          />
        )}
      </section>
    </div>
  )
}
