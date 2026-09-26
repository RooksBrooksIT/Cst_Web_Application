import React, { useState, useMemo } from 'react'
import {
  money,
  parseAmount,
  calculateFinancialStatusReport,
  formatDateDisplay,
} from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'
import StatusBadge from '../../../components/common/StatusBadge'

export default function FinancialStatusReportHub({
  sites = [],
  sitePayments = [],
  totalSiteExpensesPerDay = [],
  siteSupervisorEntries = [],
  subReport = 'statement',
  initialSiteId = 'all',
}) {
  const [activeTab, setActiveTab] = useState(subReport === 'cash_flow' ? 'weekly' : 'statement')
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId)

  React.useEffect(() => {
    if (subReport === 'cash_flow') setActiveTab('weekly')
    else if (subReport === 'statement') setActiveTab('statement')
  }, [subReport])

  React.useEffect(() => {
    if (initialSiteId) setSelectedSiteId(initialSiteId)
  }, [initialSiteId])

  const reportData = useMemo(() => {
    return calculateFinancialStatusReport({ sites, sitePayments, totalSiteExpensesPerDay })
  }, [sites, sitePayments, totalSiteExpensesPerDay])

  const filteredStatements = useMemo(() => {
    if (selectedSiteId === 'all') return reportData.statements
    return reportData.statements.filter((s) => s.siteId === selectedSiteId)
  }, [reportData, selectedSiteId])

  // Weekly Cash Flow Rollup (inflows vs outflows grouped by week)
  const weeklyFlow = useMemo(() => {
    const weeks = {}

    // Process Inflows (SitePayment)
    sitePayments.forEach((p) => {
      const d = new Date(p.paymentDate || p.date || p.createdAt || new Date())
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear()
        const startOfYear = new Date(year, 0, 1)
        const pastDaysOfYear = (d - startOfYear) / 86400000
        const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7)
        const key = `${year}-W${String(weekNum).padStart(2, '0')}`

        if (!weeks[key]) {
          weeks[key] = { key, weekLabel: `Week ${weekNum}, ${year}`, inflow: 0, outflow: 0, net: 0 }
        }
        weeks[key].inflow += parseAmount(p.amountPaid || p.amount || p.totalAmount || 0)
      }
    })

    // Process Outflows (totalSiteExpensesPerDay / siteSupervisorEntries)
    totalSiteExpensesPerDay.forEach((r) => {
      const d = new Date(r.date || r.createdAt || new Date())
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear()
        const startOfYear = new Date(year, 0, 1)
        const pastDaysOfYear = (d - startOfYear) / 86400000
        const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7)
        const key = `${year}-W${String(weekNum).padStart(2, '0')}`

        if (!weeks[key]) {
          weeks[key] = { key, weekLabel: `Week ${weekNum}, ${year}`, inflow: 0, outflow: 0, net: 0 }
        }
        weeks[key].outflow += parseAmount(r.totalAllExpenses || r.totalAmount || r.totalSpend || 0)
      }
    })

    const sortedWeeks = Object.values(weeks).sort((a, b) => b.key.localeCompare(a.key))
    sortedWeeks.forEach((w) => {
      w.net = w.inflow - w.outflow
    })

    return sortedWeeks
  }, [sitePayments, totalSiteExpensesPerDay])

  const handleExportCSV = () => {
    if (activeTab === 'statement') {
      const rows = filteredStatements.map((s) => [
        s.siteName,
        s.location,
        s.stage,
        s.status,
        s.budget,
        s.received,
        `${s.receivedRatio}%`,
        s.spent,
        s.cashInHand,
        s.budgetRemaining,
        `${s.utilizationPercent}%`,
      ])
      exportToCSV('Financial_Status_Statement', ['Site Name', 'Location', 'Current Stage', 'Status', 'Contract Budget (INR)', 'Received Inflow (INR)', 'Realization %', 'Actual Spent (INR)', 'Cash in Hand (INR)', 'Remaining Budget (INR)', 'Utilization %'], rows)
    } else {
      const rows = weeklyFlow.map((w) => [
        w.weekLabel,
        w.inflow,
        w.outflow,
        w.net,
      ])
      exportToCSV('Weekly_Cash_Flow_Statement', ['Week', 'Cash Inflow (INR)', 'Cash Outflow (INR)', 'Net Cash Flow (INR)'], rows)
    }
  }

  const handlePrintPDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Official Financial Status Statement</h2>
        <p style="margin: 4px 0; color: #475569;">Portfolio Baseline Budget: <strong>${money(reportData.kpis.totalBudget)}</strong> | Realized Inflows: <strong>${money(reportData.kpis.totalReceived)}</strong></p>
      </div>

      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1; background: #eff6ff; padding: 10px; border-radius: 8px;">
          <small style="color: #1e40af; font-weight: bold;">TOTAL BUDGET</small>
          <div style="font-size: 16px; font-weight: bold; color: #1e3a8a;">${money(reportData.kpis.totalBudget)}</div>
        </div>
        <div style="flex: 1; background: #f0fdf4; padding: 10px; border-radius: 8px;">
          <small style="color: #166534; font-weight: bold;">CUSTOMER RECEIVED</small>
          <div style="font-size: 16px; font-weight: bold; color: #14532d;">${money(reportData.kpis.totalReceived)}</div>
        </div>
        <div style="flex: 1; background: #fff1f2; padding: 10px; border-radius: 8px;">
          <small style="color: #be123c; font-weight: bold;">TOTAL OUTFLOWS</small>
          <div style="font-size: 16px; font-weight: bold; color: #9f1239;">${money(reportData.kpis.totalSpent)}</div>
        </div>
        <div style="flex: 1; background: #0B3470; color: white; padding: 10px; border-radius: 8px;">
          <small style="color: #93c5fd; font-weight: bold;">CASH IN HAND</small>
          <div style="font-size: 16px; font-weight: bold;">${money(reportData.kpis.cashInHand)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Site / Location</th>
            <th>Stage</th>
            <th>Budget (₹)</th>
            <th>Received (₹)</th>
            <th>Spent (₹)</th>
            <th>Cash in Hand (₹)</th>
            <th>Remaining (₹)</th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          ${filteredStatements.map((s) => `
            <tr>
              <td><strong>${s.siteName}</strong><br/><small style="color: #64748b;">${s.location}</small></td>
              <td>${s.stage}</td>
              <td>${money(s.budget)}</td>
              <td>${money(s.received)}</td>
              <td>${money(s.spent)}</td>
              <td><strong>${money(s.cashInHand)}</strong></td>
              <td>${money(s.budgetRemaining)}</td>
              <td><strong>${s.utilizationPercent}%</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport('Financial Status Statement', content)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Controls & Sub-Tab Switcher Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block">
              Financial Overview
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'weekly' ? 'Cash Flow Analysis' : 'Financial Statement & Budget Status'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Consolidated balance sheets, client inflow realization rates, and weekly cash flow ledgers.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrintPDF}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white transition-colors shadow-2xs cursor-pointer"
            >
              🖨️ Print Statement PDF
            </button>
          </div>
        </div>

        {/* Filters and Sub-Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-semibold">Filter Site:</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Portfolio Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.projectName || s.siteName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'statement' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Financial Statement
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'weekly' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cash Flow
            </button>
          </div>
        </div>
      </div>

      {/* 6 Executive Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Estimated Budget</span>
          <strong className="text-xl font-extrabold text-slate-900 font-mono block">{money(reportData.kpis.totalBudget)}</strong>
          <small className="text-slate-400 text-[10px]">Contract baseline</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Customer Received</span>
          <strong className="text-xl font-extrabold text-emerald-700 font-mono block">{money(reportData.kpis.totalReceived)}</strong>
          <small className="text-slate-400 text-[10px]">Realized inflows</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Total Outflows</span>
          <strong className="text-xl font-extrabold text-rose-600 font-mono block">{money(reportData.kpis.totalSpent)}</strong>
          <small className="text-slate-400 text-[10px]">Actual site spend</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-purple-600">
          <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">Net Cash Balance</span>
          <strong
            className={`text-xl font-extrabold font-mono block ${
              reportData.kpis.cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'
            }`}
          >
            {money(reportData.kpis.cashInHand)}
          </strong>
          <small className="text-slate-400 text-[10px]">Inflow minus outflow</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Pending Customer</span>
          <strong className="text-xl font-extrabold text-amber-700 font-mono block">{money(reportData.kpis.pendingCustomerAmount || 0)}</strong>
          <small className="text-slate-400 text-[10px]">Receivables due</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Remaining Cushion</span>
          <strong className="text-xl font-extrabold text-blue-700 font-mono block">{money(reportData.kpis.remainingBudget || 0)}</strong>
          <small className="text-slate-400 text-[10px]">Unspent budget</small>
        </div>
      </div>

      {/* Customer Inflow Realization Progress Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-[#0B3470] p-4 rounded-2xl text-white shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <span className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">Payment Realization Rate</span>
          <h4 className="text-sm font-bold">
            Customer Inflows vs Contract Budget: <span className="text-emerald-400">{reportData.kpis.receivedRatio || 0}%</span>
          </h4>
        </div>
        <div className="w-full sm:w-1/2 space-y-1">
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
            <div
              className="bg-emerald-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, reportData.kpis.receivedRatio || 0)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-300 font-mono">
            <span>Received: {money(reportData.kpis.totalReceived)}</span>
            <span>Pending: {money(reportData.kpis.pendingCustomerAmount || 0)}</span>
          </div>
        </div>
      </div>

      {/* 4A. Comprehensive Financial Statement Table */}
      {activeTab === 'statement' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Site & Location</th>
                  <th className="p-3.5">Stage</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Contract Budget</th>
                  <th className="p-3.5 text-right">Received Inflow</th>
                  <th className="p-3.5 text-right">Spent Outflows</th>
                  <th className="p-3.5 text-right">Cash in Hand</th>
                  <th className="p-3.5 text-right">Remaining Cushion</th>
                  <th className="p-3.5 text-center">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStatements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 text-xs">
                      No financial records matching selected site filter.
                    </td>
                  </tr>
                ) : (
                  filteredStatements.map((s, idx) => (
                    <tr key={s.siteId || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <strong className="text-slate-900 block text-xs font-bold">{s.siteName}</strong>
                        <span className="text-[11px] text-slate-400">{s.location}</span>
                      </td>
                      <td className="p-3.5 font-semibold text-blue-700">{s.stage}</td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {money(s.budget)}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        +{money(s.received)}
                        <small className="text-[10px] text-slate-400 block font-sans">{s.receivedRatio}% realized</small>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                        -{money(s.spent)}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-purple-700 whitespace-nowrap">
                        {money(s.cashInHand)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-700 whitespace-nowrap">
                        {money(s.budgetRemaining)}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            s.utilizationPercent >= 85
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {s.utilizationPercent}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4B. Weekly Cash Flow Rollup Table */}
      {activeTab === 'weekly' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Calendar Week</th>
                  <th className="p-3.5 text-right">Cash Inflow (₹)</th>
                  <th className="p-3.5 text-right">Cash Outflow (₹)</th>
                  <th className="p-3.5 text-right">Net Operating Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weeklyFlow.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 text-xs">
                      No weekly transactions recorded.
                    </td>
                  </tr>
                ) : (
                  weeklyFlow.map((w) => (
                    <tr key={w.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900">{w.weekLabel}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                        +{money(w.inflow)}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-rose-600">
                        -{money(w.outflow)}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full font-mono font-bold text-xs border ${
                            w.net >= 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {w.net >= 0 ? `+ ${money(w.net)}` : `- ${money(Math.abs(w.net))}`}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
