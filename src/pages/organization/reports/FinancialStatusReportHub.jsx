import React, { useState, useMemo } from 'react'
import {
  money,
  parseAmount,
  calculateFinancialStatusReport,
  formatDateDisplay,
} from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'

export default function FinancialStatusReportHub({
  sites = [],
  sitePayments = [],
  totalSiteExpensesPerDay = [],
  siteSupervisorEntries = [],
}) {
  const [activeTab, setActiveTab] = useState('statement') // 'statement' or 'weekly'
  const [selectedSiteId, setSelectedSiteId] = useState('all')

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
        // Simple week number
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
        s.budget,
        s.received,
        s.spent,
        s.cashInHand,
        s.budgetRemaining,
        `${s.utilizationRate}%`,
        s.health,
      ])
      exportToCSV('Financial_Status_Statement', ['Site Name', 'Location', 'Stage', 'Contract Budget (INR)', 'Received Inflow (INR)', 'Actual Outflow (INR)', 'Cash in Hand (INR)', 'Budget Remaining (INR)', 'Utilization Rate %', 'Financial Health'], rows)
    } else {
      const rows = weeklyFlow.map((w) => [
        w.weekLabel,
        w.inflow,
        w.outflow,
        w.net,
      ])
      exportToCSV('Weekly_Cash_Flow_Statement', ['Period', 'Client Inflow (INR)', 'Site Outflow (INR)', 'Net Cash Position (INR)'], rows)
    }
  }

  const handlePrintPDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Executive Financial Status Statement</h2>
        <p style="margin: 4px 0; color: #475569;">Consolidated Multi-Site Budget, Inflows, and Outflow Utilization</p>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px;">
          <small style="color: #64748b; font-weight: bold;">TOTAL BUDGET</small>
          <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${money(reportData.kpis.totalContractBudget)}</div>
        </div>
        <div style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px;">
          <small style="color: #166534; font-weight: bold;">CLIENT INFLOW</small>
          <div style="font-size: 15px; font-weight: bold; color: #14532d;">${money(reportData.kpis.totalClientReceived)}</div>
        </div>
        <div style="flex: 1; background: #fff7ed; border: 1px solid #fed7aa; padding: 10px; border-radius: 8px;">
          <small style="color: #9a3412; font-weight: bold;">ACTUAL SPENT</small>
          <div style="font-size: 15px; font-weight: bold; color: #7c2d12;">${money(reportData.kpis.totalActualSpent)}</div>
        </div>
        <div style="flex: 1; background: #0B3470; color: white; padding: 10px; border-radius: 8px;">
          <small style="color: #93c5fd; font-weight: bold;">NET CASH IN HAND</small>
          <div style="font-size: 15px; font-weight: bold;">${money(reportData.kpis.totalCashInHand)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Site / Location</th>
            <th>Contract Budget</th>
            <th>Client Received</th>
            <th>Actual Spent</th>
            <th>Cash In Hand</th>
            <th>Remaining Budget</th>
            <th>Burn Rate</th>
          </tr>
        </thead>
        <tbody>
          ${filteredStatements.map((s) => `
            <tr>
              <td><strong>${s.siteName}</strong><br/><small style="color: #64748b;">${s.location}</small></td>
              <td>${money(s.budget)}</td>
              <td><span style="color: #15803d; font-weight: bold;">${money(s.received)}</span></td>
              <td><span style="color: #b91c1c; font-weight: bold;">${money(s.spent)}</span></td>
              <td><strong>${money(s.cashInHand)}</strong></td>
              <td>${money(s.budgetRemaining)}</td>
              <td>${s.utilizationRate}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport('Financial Status Statement', content)
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Export Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Module 4 · Financial Audit</span>
            <h2 className="text-xl font-extrabold text-slate-900">Financial Status & Cash Flow Report</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrintPDF}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B3470] hover:bg-blue-900 text-white transition-colors shadow-xs"
            >
              🖨️ Print Financial Statement
            </button>
          </div>
        </div>

        {/* View Switcher & Site Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'statement' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Financial Health Statement
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'weekly' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Weekly Cash Flow Flowsheet
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Filter Site:</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
            >
              <option value="all">All Portfolio Sites ({sites.length})</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Financial Health Statement View */}
      {activeTab === 'statement' && (
        <div className="space-y-6">
          {/* Executive KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Total Portfolio Budget</span>
              <strong className="text-lg font-black text-slate-900 block">{money(reportData.kpis.totalContractBudget)}</strong>
              <small className="text-[10px] text-slate-400">All active projects</small>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-emerald-700 uppercase">Client Received</span>
              <strong className="text-lg font-bold text-emerald-900 block">{money(reportData.kpis.totalClientReceived)}</strong>
              <small className="text-[10px] text-emerald-600">Inflow to date</small>
            </div>
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-amber-700 uppercase">Total Outflows Spent</span>
              <strong className="text-lg font-bold text-amber-900 block">{money(reportData.kpis.totalActualSpent)}</strong>
              <small className="text-[10px] text-amber-600">Site expenditures</small>
            </div>
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-blue-700 uppercase">Net Cash in Hand</span>
              <strong className="text-lg font-bold text-blue-900 block">{money(reportData.kpis.totalCashInHand)}</strong>
              <small className="text-[10px] text-blue-600">Received - Spent</small>
            </div>
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-purple-700 uppercase">Budget Remaining</span>
              <strong className="text-lg font-bold text-purple-900 block">{money(reportData.kpis.totalBudgetRemaining)}</strong>
              <small className="text-[10px] text-purple-600">Contract - Spent</small>
            </div>
            <div className="p-4 rounded-2xl bg-[#0B3470] text-white border border-blue-900 shadow-xs space-y-1">
              <span className="text-[10px] font-bold text-blue-200 uppercase">Overall Burn Rate</span>
              <strong className="text-xl font-black text-white block">{reportData.kpis.overallUtilization}%</strong>
              <small className="text-[10px] text-blue-200">Portfolio average</small>
            </div>
          </div>

          {/* Project Financial Statements Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Project-by-Project Financial Health Audit</h3>
              <span className="text-xs text-slate-500">{filteredStatements.length} sites evaluated</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Site / Project</th>
                    <th className="p-3 text-right">Contract Budget</th>
                    <th className="p-3 text-right">Client Received</th>
                    <th className="p-3 text-right">Actual Spent</th>
                    <th className="p-3 text-right">Cash in Hand</th>
                    <th className="p-3 text-right">Remaining Budget</th>
                    <th className="p-3 text-center">Utilization</th>
                    <th className="p-3 text-center">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStatements.map((s) => (
                    <tr key={s.siteId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3">
                        <strong className="text-slate-900 block">{s.siteName}</strong>
                        <span className="text-[11px] text-slate-400">{s.location} · {s.stage}</span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-800">{money(s.budget)}</td>
                      <td className="p-3 text-right font-bold text-emerald-700">{money(s.received)}</td>
                      <td className="p-3 text-right font-bold text-amber-700">{money(s.spent)}</td>
                      <td className="p-3 text-right font-extrabold text-[#0B3470]">{money(s.cashInHand)}</td>
                      <td className="p-3 text-right text-slate-700">{money(s.budgetRemaining)}</td>
                      <td className="p-3 text-center font-bold text-slate-800">{s.utilizationRate}%</td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          s.health === 'Critical' ? 'bg-rose-100 text-rose-800' : s.health === 'Warning' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {s.health}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Cash Flow View */}
      {activeTab === 'weekly' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Week-by-Week Cash Inflow vs Outflow Ledger</h3>
            <span className="text-xs text-slate-500">{weeklyFlow.length} recorded weeks</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="p-3">Calendar Period</th>
                  <th className="p-3 text-right">Customer Inflow (₹)</th>
                  <th className="p-3 text-right">Site Outflows (₹)</th>
                  <th className="p-3 text-right">Net Cash Position (₹)</th>
                  <th className="p-3 text-center">Flow Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weeklyFlow.length === 0 ? (
                  <tr><td colSpan="5" className="p-6 text-center text-slate-400 italic">No weekly financial data available.</td></tr>
                ) : (
                  weeklyFlow.map((w) => (
                    <tr key={w.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-bold text-slate-900">{w.weekLabel}</td>
                      <td className="p-3 text-right font-semibold text-emerald-700">{money(w.inflow)}</td>
                      <td className="p-3 text-right font-semibold text-amber-700">{money(w.outflow)}</td>
                      <td className="p-3 text-right font-extrabold text-slate-900">{money(w.net)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          w.net >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {w.net >= 0 ? '+ Positive Flow' : '- Cash Deficit'}
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
