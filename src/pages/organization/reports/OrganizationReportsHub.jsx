import React, { useState } from 'react'
import SiteExpensesReportHub from './SiteExpensesReportHub'
import ProjectStageReportsHub from './ProjectStageReportsHub'
import SiteStatusReportHub from './SiteStatusReportHub'
import FinancialStatusReportHub from './FinancialStatusReportHub'
import PettyCashInsightsReportHub from './PettyCashInsightsReportHub'
import DomainInventoryReportsHub from './DomainInventoryReportsHub'
import { money, parseAmount } from '../../../services/reportService'

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

  // Calculate quick summary metrics for the top banner
  const totalBudget = allSites.reduce((sum, s) => sum + parseAmount(s.projectBudget || s.budget || 0), 0)
  const totalReceived = sitePayments.reduce((sum, p) => sum + parseAmount(p.amountPaid || p.amount || p.totalAmount || 0), allSites.reduce((sum, s) => sum + parseAmount(s.amountPaid || 0), 0))
  const totalSpent = allSites.reduce((sum, s) => sum + parseAmount(s.amountSpent || s.spentAmount || 0), totalSiteExpensesPerDay.reduce((sum, r) => sum + parseAmount(r.totalAllExpenses || r.totalAmount || 0), 0))
  const cashInHand = totalReceived - totalSpent

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Hero Insights Banner with #0B3470 Theme Accent */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0B3470] via-[#0d3f85] to-[#164e96] text-white p-6 md:p-8 shadow-md">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-white/15 text-blue-200 tracking-wider">
                Enterprise Insights Engine
              </span>
              <span className="text-xs text-blue-200">· Full Specification v1.0</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Reports & Analytics Center
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl leading-relaxed">
              Consolidated real-time operational auditing across multi-site expenses, construction milestone stages, cash flow statements, and inventory muster rolls.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl grid grid-cols-2 gap-4 text-white min-w-[280px]">
            <div>
              <span className="text-[10px] text-blue-200 font-semibold uppercase">Total Portfolio Sites</span>
              <strong className="text-xl font-bold block">{allSites.length} Active</strong>
            </div>
            <div>
              <span className="text-[10px] text-blue-200 font-semibold uppercase">Net Cash in Hand</span>
              <strong className="text-xl font-bold block text-emerald-300">{money(cashInHand)}</strong>
            </div>
            <div>
              <span className="text-[10px] text-blue-200 font-semibold uppercase">Contract Budget</span>
              <strong className="text-sm font-semibold block">{money(totalBudget)}</strong>
            </div>
            <div>
              <span className="text-[10px] text-blue-200 font-semibold uppercase">Total Outflows</span>
              <strong className="text-sm font-semibold block text-amber-300">{money(totalSpent)}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* 6 Primary Report Hub Navigation Pills */}
      <section className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex gap-2 overflow-x-auto p-1">
          <button
            type="button"
            onClick={() => setActiveTab('site_expenses')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'site_expenses'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>💰</span> 1. Site Expenses Hub
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stage_expenses')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'stage_expenses'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>🏗️</span> 2. Stage Expenses Hub
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'status'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>⏱️</span> 3. Site Status & Progress
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('financial')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'financial'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>📊</span> 4. Financial Health & Flow
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('petty_cash')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'petty_cash'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>💵</span> 5. Petty Cash Insights
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('domain')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === 'domain'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>📦</span> 6. Domain & Inventory Reports
          </button>
        </div>
      </section>

      {/* Render Active Sub-Report View */}
      <section>
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
