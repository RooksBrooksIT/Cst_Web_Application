import React, { useState, useMemo } from 'react'
import {
  money,
  parseAmount,
  calculatePettyCashInsights,
  formatDateDisplay,
} from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'

export default function PettyCashInsightsReportHub({
  sites = [],
  pettyCashAccounts = [],
  pettyCashExpenses = [],
  pettyCashRequests = [],
}) {
  const [activeTab, setActiveTab] = useState('audit') // 'audit' or 'ledger'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [categoryFilter, setCategoryFilter] = useState('all')

  const reportData = useMemo(() => {
    return calculatePettyCashInsights({
      sites,
      pettyCashAccounts,
      pettyCashExpenses,
      pettyCashRequests,
    })
  }, [sites, pettyCashAccounts, pettyCashExpenses, pettyCashRequests])

  // Filtered monthly ledger
  const filteredLedger = useMemo(() => {
    return reportData.itemizedLedger.filter((item) => {
      const matchesMonth = item.rawDate ? String(item.rawDate).startsWith(selectedMonth) : true
      const matchesCategory = categoryFilter === 'all' || item.category.toLowerCase().includes(categoryFilter.toLowerCase())
      return matchesMonth && matchesCategory
    })
  }, [reportData, selectedMonth, categoryFilter])

  const handleExportCSV = () => {
    if (activeTab === 'audit') {
      const rows = reportData.siteAuditList.map((s) => [
        s.siteName,
        s.supervisor,
        s.disbursed,
        s.spent,
        s.balance,
        s.status,
      ])
      exportToCSV('Petty_Cash_Site_Audit_Report', ['Site Name', 'Supervisor', 'Disbursed (INR)', 'Spent (INR)', 'Remaining Float (INR)', 'Status'], rows)
    } else {
      const rows = filteredLedger.map((l) => [
        l.date,
        l.siteName,
        l.supervisor,
        l.vendor,
        l.category,
        l.description,
        l.amount,
        l.status,
      ])
      exportToCSV(`Petty_Cash_Ledger_${selectedMonth}`, ['Date', 'Site', 'Supervisor', 'Vendor', 'Category', 'Description', 'Amount (INR)', 'Status'], rows)
    }
  }

  const handlePrintPDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Petty Cash Governance & Audit Report</h2>
        <p style="margin: 4px 0; color: #475569;">Enterprise Imprest Float Balances & Itemized Receipts</p>
      </div>

      <div style="display: flex; gap: 12px; margin-bottom: 20px;">
        <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 8px;">
          <small style="color: #1e40af; font-weight: bold;">TOTAL DISBURSED</small>
          <div style="font-size: 16px; font-weight: bold; color: #1e3a8a;">${money(reportData.kpis.totalDisbursed)}</div>
        </div>
        <div style="flex: 1; background: #fff7ed; border: 1px solid #fed7aa; padding: 10px; border-radius: 8px;">
          <small style="color: #9a3412; font-weight: bold;">TOTAL SPENT</small>
          <div style="font-size: 16px; font-weight: bold; color: #7c2d12;">${money(reportData.kpis.totalSpent)}</div>
        </div>
        <div style="flex: 1; background: #0B3470; color: white; padding: 10px; border-radius: 8px;">
          <small style="color: #93c5fd; font-weight: bold;">NET FLOAT IN HAND</small>
          <div style="font-size: 16px; font-weight: bold;">${money(reportData.kpis.netFloatInHand)}</div>
        </div>
      </div>

      <h3>Site-by-Site Petty Cash Balances</h3>
      <table>
        <thead>
          <tr>
            <th>Site Name</th>
            <th>Supervisor</th>
            <th>Disbursed</th>
            <th>Spent</th>
            <th>Remaining Float</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.siteAuditList.map((s) => `
            <tr>
              <td><strong>${s.siteName}</strong></td>
              <td>${s.supervisor}</td>
              <td>${money(s.disbursed)}</td>
              <td>${money(s.spent)}</td>
              <td><strong>${money(s.balance)}</strong></td>
              <td><span style="font-weight: bold; color: ${s.isOverspent ? '#b91c1c' : '#15803d'};">${s.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport('Petty Cash Audit Statement', content)
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Export Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Module 5 · Imprest Governance</span>
            <h2 className="text-xl font-extrabold text-slate-900">Petty Cash Insights & Audit Hub</h2>
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
              🖨️ Print Petty Cash PDF
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'audit' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Site Imprest Float Audit
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ledger' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Monthly Itemized Receipt Ledger
          </button>
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-600 uppercase">Total Petty Cash Disbursed</span>
          <strong className="text-2xl font-black text-slate-900 block">{money(reportData.kpis.totalDisbursed)}</strong>
          <small className="text-[10px] text-slate-400">Approved top-up allocations</small>
        </div>
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase">Total Spent by Supervisors</span>
          <strong className="text-2xl font-black text-amber-900 block">{money(reportData.kpis.totalSpent)}</strong>
          <small className="text-[10px] text-amber-600">Reconciled site receipts</small>
        </div>
        <div className="p-4 rounded-2xl bg-[#0B3470] text-white border border-blue-900 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-200 uppercase">Net Float in Hand</span>
          <strong className="text-2xl font-black text-white block">{money(reportData.kpis.netFloatInHand)}</strong>
          <small className="text-[10px] text-blue-200">Across all supervisors & sites</small>
        </div>
      </div>

      {/* Site Imprest Float Audit View */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Site-by-Site Petty Cash Audit Matrix</h3>
            <span className="text-xs text-slate-500">{reportData.siteAuditList.length} sites registered</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="p-3">Site / Project</th>
                  <th className="p-3">Supervisor</th>
                  <th className="p-3 text-right">Disbursed (₹)</th>
                  <th className="p-3 text-right">Spent Outflows (₹)</th>
                  <th className="p-3 text-right">Remaining Float (₹)</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.siteAuditList.map((s) => (
                  <tr key={s.siteId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-bold text-slate-900">{s.siteName}</td>
                    <td className="p-3 text-slate-700">{s.supervisor}</td>
                    <td className="p-3 text-right font-medium text-slate-800">{money(s.disbursed)}</td>
                    <td className="p-3 text-right font-semibold text-amber-700">{money(s.spent)}</td>
                    <td className="p-3 text-right font-extrabold text-[#0B3470]">{money(s.balance)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        s.isOverspent ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly Itemized Receipt Ledger View */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                >
                  <option value="all">All Categories</option>
                  <option value="fuel">Fuel / Transport</option>
                  <option value="food">Food Allowance</option>
                  <option value="tools">Tools & Hardware</option>
                  <option value="materials">Local Materials</option>
                </select>
              </div>
            </div>
            <span className="text-xs text-slate-500 font-semibold">{filteredLedger.length} items logged in {selectedMonth}</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Site / Project</th>
                    <th className="p-3">Supervisor</th>
                    <th className="p-3">Vendor / Shop</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLedger.length === 0 ? (
                    <tr><td colSpan="7" className="p-6 text-center text-slate-400 italic">No petty cash expense receipts for this month.</td></tr>
                  ) : (
                    filteredLedger.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-semibold text-slate-900">{l.date}</td>
                        <td className="p-3 text-slate-800">{l.siteName}</td>
                        <td className="p-3 text-slate-600">{l.supervisor}</td>
                        <td className="p-3 text-slate-700">{l.vendor}</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-[10px]">{l.category}</span></td>
                        <td className="p-3 text-slate-600 max-w-xs truncate">{l.description}</td>
                        <td className="p-3 text-right font-bold text-slate-900">{money(l.amount)}</td>
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
  )
}
