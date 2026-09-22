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
  subReport = 'audit',
}) {
  const [activeTab, setActiveTab] = useState(subReport === 'ledger' ? 'ledger' : 'audit')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  React.useEffect(() => {
    if (subReport === 'ledger') setActiveTab('ledger')
    else if (subReport === 'audit') setActiveTab('audit')
  }, [subReport])

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
      const q = searchQuery.trim().toLowerCase()
      const matchesSearch =
        !q ||
        item.siteName?.toLowerCase().includes(q) ||
        item.supervisor?.toLowerCase().includes(q) ||
        item.vendor?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      return matchesMonth && matchesCategory && matchesSearch
    })
  }, [reportData, selectedMonth, categoryFilter, searchQuery])

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
          <small style="color: #93c5fd; font-weight: bold;">NET FLOAT BALANCE</small>
          <div style="font-size: 16px; font-weight: bold;">${money(reportData.kpis.totalRemaining)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Site Name</th>
            <th>Supervisor</th>
            <th>Disbursed Float (₹)</th>
            <th>Spent Amount (₹)</th>
            <th>Remaining Balance (₹)</th>
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
              <td>${s.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport('Petty Cash Audit Statement', content)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header & Sub-Tab Switcher Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block">
              Petty Cash & Float Management
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'ledger' ? 'Itemized Petty Cash Receipts' : 'Petty Cash & Imprest Float Reports'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervisor float balances, emergency disbursal top-ups, and itemized receipt vouchers.
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
              🖨️ Print PDF Statement
            </button>
          </div>
        </div>

        {/* Filters and Sub-Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'ledger' && (
              <>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
                />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
                >
                  <option value="all">All Expense Categories</option>
                  <option value="food">Food & Refreshments</option>
                  <option value="fuel">Fuel & Logistics</option>
                  <option value="tools">Tools & Hardware</option>
                  <option value="materials">Emergency Materials</option>
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search receipt..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs"
                />
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'audit' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Site Float Audit List
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'ledger' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Itemized Receipts
            </button>
          </div>
        </div>
      </div>

      {/* 3 Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Total Disbursed Float</span>
          <strong className="text-2xl font-extrabold text-slate-900 font-mono block">{money(reportData.kpis.totalDisbursed)}</strong>
          <small className="text-slate-400 text-[11px]">Approved allocations across sites</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Total Petty Cash Spent</span>
          <strong className="text-2xl font-extrabold text-amber-700 font-mono block">{money(reportData.kpis.totalSpent)}</strong>
          <small className="text-slate-400 text-[11px]">Voucher expenditures realized</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-emerald-600">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Net Remaining Float</span>
          <strong
            className={`text-2xl font-extrabold font-mono block ${
              reportData.kpis.totalRemaining >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {money(reportData.kpis.totalRemaining)}
          </strong>
          <small className="text-slate-400 text-[11px]">Current liquid balance with supervisors</small>
        </div>
      </div>

      {/* 5A. Site-by-Site Audit Table */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Site / Project</th>
                  <th className="p-3.5">Assigned Supervisor</th>
                  <th className="p-3.5 text-right">Disbursed Float</th>
                  <th className="p-3.5 text-right">Spent Outflow</th>
                  <th className="p-3.5 text-right">Remaining Balance</th>
                  <th className="p-3.5 text-center">Float Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.siteAuditList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                      No petty cash records found for sites.
                    </td>
                  </tr>
                ) : (
                  reportData.siteAuditList.map((s, idx) => (
                    <tr key={s.siteId || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900">{s.siteName}</td>
                      <td className="p-3.5 text-slate-600">{s.supervisor}</td>
                      <td className="p-3.5 text-right font-mono text-slate-700">{money(s.disbursed)}</td>
                      <td className="p-3.5 text-right font-mono text-rose-600 font-bold">-{money(s.spent)}</td>
                      <td className="p-3.5 text-right font-mono font-extrabold text-sm">
                        <span className={s.balance >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                          {money(s.balance)}
                        </span>
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            s.balance < 0
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {s.balance < 0 ? 'Overspent Float' : 'Active Float'}
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

      {/* 5B. Monthly Itemized Ledger */}
      {activeTab === 'ledger' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Site</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Description</th>
                  <th className="p-3.5">Vendor / Payee</th>
                  <th className="p-3.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                      No petty cash receipts found for {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((l, idx) => (
                    <tr key={l.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">{formatDateDisplay(l.date)}</td>
                      <td className="p-3.5 font-bold text-slate-900">{l.siteName}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          {l.category}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-700">{l.description}</td>
                      <td className="p-3.5 text-slate-500">{l.vendor || 'Direct Cash'}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-rose-600">
                        -{money(l.amount)}
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
