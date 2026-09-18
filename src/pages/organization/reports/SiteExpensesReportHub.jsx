import React, { useState, useMemo } from 'react'
import {
  money,
  parseAmount,
  formatDateToISO,
  formatDateDisplay,
  calculateDailySiteExpenses,
  calculateDateRangeExpenses,
  calculateSiteLifetimeSummary,
  PROJECT_STAGES,
} from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'

export default function SiteExpensesReportHub({
  sites = [],
  siteSupervisorEntries = [],
  managerExpenses = [],
  organizationEntries = [],
  contractorEntries = [],
  totalSiteExpensesPerDay = [],
  sitePayments = [],
  siteSupervisorIncentives = [],
  dailySiteLogs = [],
}) {
  const [activeSubTab, setActiveSubTab] = useState('daily') // 'daily' (1A), 'range' (1B), 'summary' (1C)
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedStage, setSelectedStage] = useState('all')
  
  // Date Range state
  const defaultFrom = useMemo(() => {
    const d = new Date()
    d.setDate(1) // First day of current month
    return d.toISOString().slice(0, 10)
  }, [])
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [expandedDates, setExpandedDates] = useState({})

  // Selected site object
  const selectedSite = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId) || sites[0] || null
  }, [sites, selectedSiteId])

  // Update default siteId if empty
  React.useEffect(() => {
    if (!selectedSiteId && sites.length > 0) {
      setSelectedSiteId(sites[0].id)
    }
  }, [sites, selectedSiteId])

  // Toggle Accordion in Range Report
  const toggleDateAccordion = (dateStr) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }))
  }

  // ----------------------------------------------------------------------------------------------
  // 1A. DAILY SITE EXPENSES REPORT CALCULATION
  // ----------------------------------------------------------------------------------------------
  const dailyReport = useMemo(() => {
    return calculateDailySiteExpenses({
      site: selectedSite,
      selectedDate,
      selectedStage,
      siteSupervisorEntries,
      managerExpenses,
      organizationEntries,
      contractorEntries,
      totalSiteExpensesPerDay,
      dailySiteLogs,
    })
  }, [
    selectedSite,
    selectedDate,
    selectedStage,
    siteSupervisorEntries,
    managerExpenses,
    organizationEntries,
    contractorEntries,
    totalSiteExpensesPerDay,
    dailySiteLogs,
  ])

  // ----------------------------------------------------------------------------------------------
  // 1B. DATE RANGE EXPENSES REPORT CALCULATION
  // ----------------------------------------------------------------------------------------------
  const rangeReport = useMemo(() => {
    return calculateDateRangeExpenses({
      site: selectedSite,
      fromDate,
      toDate,
      selectedStage,
      siteSupervisorEntries,
      managerExpenses,
      organizationEntries,
      contractorEntries,
      totalSiteExpensesPerDay,
    })
  }, [
    selectedSite,
    fromDate,
    toDate,
    selectedStage,
    siteSupervisorEntries,
    managerExpenses,
    organizationEntries,
    contractorEntries,
    totalSiteExpensesPerDay,
  ])

  // ----------------------------------------------------------------------------------------------
  // 1C. LIFETIME SITE SUMMARY CALCULATION
  // ----------------------------------------------------------------------------------------------
  const lifetimeSummary = useMemo(() => {
    return calculateSiteLifetimeSummary({
      site: selectedSite,
      totalSiteExpensesPerDay,
      siteSupervisorEntries,
      sitePayments,
      contractorEntries,
      siteSupervisorIncentives,
    })
  }, [
    selectedSite,
    totalSiteExpensesPerDay,
    siteSupervisorEntries,
    sitePayments,
    contractorEntries,
    siteSupervisorIncentives,
  ])

  // Handlers for CSV & Print
  const handleExportDailyCSV = () => {
    const rows = [
      ...dailyReport.labours.map((l) => ['Labour', l.role, `${l.count} workers @ ${money(l.rate)}`, l.amount]),
      ...dailyReport.materials.map((m) => ['Material', m.name, `${m.quantity} ${m.unit} @ ${money(m.unitPrice)}`, m.amount]),
      ['Food Allowance', 'Supervisor Daily Food', '1 Day Allowance', dailyReport.foodAmount],
      ['Transport & Fuel', 'Vehicle / Site Fuel', 'Site Transport', dailyReport.transportAmount],
      ...dailyReport.bills.map((b) => [b.source, b.description, b.vendor, b.amount]),
    ]
    exportToCSV(`Daily_Report_${selectedSite?.projectName || 'Site'}_${selectedDate}`, ['Category', 'Item / Description', 'Unit / Details', 'Amount (INR)'], rows)
  }

  const handlePrintDailyPDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Daily Site Expenses Report</h2>
        <p style="margin: 4px 0; color: #475569;"><strong>Site:</strong> ${dailyReport.siteName} (${dailyReport.siteLocation})</p>
        <p style="margin: 4px 0; color: #475569;"><strong>Date:</strong> ${formatDateDisplay(dailyReport.date)} | <strong>Stage:</strong> ${dailyReport.projectStage} | <strong>Supervisor:</strong> ${dailyReport.supervisorName}</p>
        <div style="background: #0B3470; color: white; padding: 12px; border-radius: 8px; margin-top: 12px; font-size: 16px; font-weight: bold;">
          Grand Total Daily Outflow: ${money(dailyReport.grandTotal)}
        </div>
      </div>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">1. Labour Expenses (Subtotal: ${money(dailyReport.totalLabour)})</h3>
      <table>
        <thead><tr><th>Role / Trade</th><th>Headcount</th><th>Daily Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${dailyReport.labours.length === 0 ? '<tr><td colspan="4">No labour entries logged</td></tr>' : dailyReport.labours.map((l) => `<tr><td>${l.role}</td><td>${l.count}</td><td>${money(l.rate)}</td><td>${money(l.amount)}</td></tr>`).join('')}
        </tbody>
      </table>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">2. Material Expenses (Subtotal: ${money(dailyReport.totalMaterial)})</h3>
      <table>
        <thead><tr><th>Material Name</th><th>Quantity</th><th>Unit Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${dailyReport.materials.length === 0 ? '<tr><td colspan="4">No material entries logged</td></tr>' : dailyReport.materials.map((m) => `<tr><td>${m.name}</td><td>${m.quantity} ${m.unit}</td><td>${money(m.unitPrice)}</td><td>${money(m.amount)}</td></tr>`).join('')}
        </tbody>
      </table>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">3. Food & Transport Expenses</h3>
      <table>
        <thead><tr><th>Allowance Type</th><th>Details</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Food Allowance</td><td>Supervisor Daily Allowance</td><td>${money(dailyReport.foodAmount)}</td></tr>
          <tr><td>Transport & Fuel</td><td>Site logistics and fuel entries</td><td>${money(dailyReport.transportAmount)}</td></tr>
        </tbody>
      </table>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">4. Manager & Direct Org Bills (Subtotal: ${money(dailyReport.totalBills)})</h3>
      <table>
        <thead><tr><th>Source</th><th>Description</th><th>Vendor / Party</th><th>Amount</th></tr></thead>
        <tbody>
          ${dailyReport.bills.length === 0 ? '<tr><td colspan="4">No manager/org bills recorded for this date</td></tr>' : dailyReport.bills.map((b) => `<tr><td>${b.source}</td><td>${b.description}</td><td>${b.vendor}</td><td>${money(b.amount)}</td></tr>`).join('')}
        </tbody>
      </table>
    `
    printReport(`Daily Site Expenses - ${dailyReport.siteName}`, content)
  }

  const handleExportRangeCSV = () => {
    const rows = rangeReport.dayCards.map((day) => [
      day.date,
      day.dayName,
      day.totalLabour,
      day.totalMaterial,
      day.foodAmount,
      day.transportAmount,
      day.totalBills,
      day.grandTotal,
    ])
    exportToCSV(`Date_Range_Report_${selectedSite?.projectName || 'Site'}_${fromDate}_to_${toDate}`, ['Date', 'Day', 'Labour (INR)', 'Materials (INR)', 'Food (INR)', 'Transport (INR)', 'Bills (INR)', 'Daily Total (INR)'], rows)
  }

  const handlePrintRangePDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Date Range Site Expenses Statement</h2>
        <p style="margin: 4px 0; color: #475569;"><strong>Site:</strong> ${rangeReport.siteName}</p>
        <p style="margin: 4px 0; color: #475569;"><strong>Period:</strong> ${rangeReport.fromDate} to ${rangeReport.toDate} (${rangeReport.daysCount} active days)</p>
      </div>

      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 8px;">
          <small style="color: #1e40af; font-weight: bold;">TOTAL LABOUR</small>
          <div style="font-size: 16px; font-weight: bold; color: #1e3a8a;">${money(rangeReport.kpis.totalLabour)}</div>
        </div>
        <div style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px;">
          <small style="color: #166534; font-weight: bold;">TOTAL MATERIALS</small>
          <div style="font-size: 16px; font-weight: bold; color: #14532d;">${money(rangeReport.kpis.totalMaterial)}</div>
        </div>
        <div style="flex: 1; background: #faf5ff; border: 1px solid #e9d5ff; padding: 10px; border-radius: 8px;">
          <small style="color: #6b21a8; font-weight: bold;">BILLS / VOUCHERS</small>
          <div style="font-size: 16px; font-weight: bold; color: #581c87;">${money(rangeReport.kpis.totalBills)}</div>
        </div>
        <div style="flex: 1; background: #0B3470; color: white; padding: 10px; border-radius: 8px;">
          <small style="color: #93c5fd; font-weight: bold;">GRAND TOTAL OUTFLOW</small>
          <div style="font-size: 16px; font-weight: bold;">${money(rangeReport.kpis.grandTotal)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Labour (₹)</th>
            <th>Materials (₹)</th>
            <th>Food & Fuel (₹)</th>
            <th>Bills / Vouchers (₹)</th>
            <th>Daily Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rangeReport.dayCards.length === 0 ? '<tr><td colspan="6">No expense records found in selected range.</td></tr>' : rangeReport.dayCards.map((d) => `
            <tr>
              <td><strong>${formatDateDisplay(d.date)}</strong> (${d.dayName})</td>
              <td>${money(d.totalLabour)}</td>
              <td>${money(d.totalMaterial)}</td>
              <td>${money(d.foodAmount + d.transportAmount)}</td>
              <td>${money(d.totalBills)}</td>
              <td><strong>${money(d.grandTotal)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport(`Range Report - ${rangeReport.siteName}`, content)
  }

  return (
    <div className="space-y-6">
      {/* Top Filter & Sub-Report Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Module 1 · Site Outflows Hub</span>
            <h2 className="text-xl font-extrabold text-slate-900">Site & Project Expenses Reports</h2>
          </div>
          {/* Sub-report selector tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setActiveSubTab('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'daily' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1A. Daily Report
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('range')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'range' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1B. Date Range Report
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('summary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'summary' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1C. Site Summary
            </button>
          </div>
        </div>

        {/* Dynamic Filters Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.projectName || s.siteName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          {activeSubTab === 'daily' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
              />
            </div>
          )}

          {activeSubTab === 'range' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                />
              </div>
            </>
          )}

          {activeSubTab !== 'summary' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Project Stage Filter</label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
              >
                <option value="all">All Stages</option>
                {PROJECT_STAGES.map((stg) => (
                  <option key={stg} value={stg}>{stg}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 1A. DAILY SITE EXPENSES REPORT VIEW */}
      {/* ----------------------------------------------------------------------------------------- */}
      {activeSubTab === 'daily' && (
        <div className="space-y-6">
          {/* Header Metadata Banner */}
          <div className="bg-linear-to-r from-[#0B3470] via-[#0d3f85] to-[#164e96] text-white p-6 rounded-3xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-blue-200 uppercase tracking-widest block">Daily Expense Statement</span>
              <h3 className="text-2xl font-black">{dailyReport.siteName}</h3>
              <p className="text-xs text-blue-100 mt-1">
                📅 {formatDateDisplay(dailyReport.date)} · 🏗️ Stage: <span className="font-semibold text-white">{dailyReport.projectStage}</span> · 👤 Supervisor: <span className="font-semibold text-white">{dailyReport.supervisorName}</span>
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex flex-col items-end">
              <span className="text-[11px] text-blue-200 font-semibold uppercase tracking-wider">Grand Total Daily Expense</span>
              <strong className="text-3xl font-black text-white">{money(dailyReport.grandTotal)}</strong>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleExportDailyCSV}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-[#0B3470] hover:bg-blue-50 transition-colors shadow-xs"
                >
                  📥 Export CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintDailyPDF}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 text-white hover:bg-sky-400 transition-colors shadow-xs"
                >
                  🖨️ Print PDF
                </button>
              </div>
            </div>
          </div>

          {/* 5 Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1: Labour Expenses */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm">👷</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">1. Labour Expenses</h4>
                    <span className="text-[11px] text-slate-400">{dailyReport.labours.length} worker groups recorded</span>
                  </div>
                </div>
                <strong className="text-base font-extrabold text-[#0B3470]">{money(dailyReport.totalLabour)}</strong>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-2">Role / Trade</th>
                      <th className="p-2 text-center">Count</th>
                      <th className="p-2 text-right">Daily Rate</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyReport.labours.length === 0 ? (
                      <tr><td colSpan="4" className="p-4 text-center text-slate-400 italic">No labour entries for this date</td></tr>
                    ) : (
                      dailyReport.labours.map((l, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="p-2 font-medium text-slate-800">{l.role}</td>
                          <td className="p-2 text-center text-slate-600">{l.count}</td>
                          <td className="p-2 text-right text-slate-600">{money(l.rate)}</td>
                          <td className="p-2 text-right font-bold text-slate-900">{money(l.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card 2: Material Expenses */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm">🧱</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">2. Material Expenses</h4>
                    <span className="text-[11px] text-slate-400">{dailyReport.materials.length} material logs</span>
                  </div>
                </div>
                <strong className="text-base font-extrabold text-emerald-700">{money(dailyReport.totalMaterial)}</strong>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-2">Material</th>
                      <th className="p-2 text-center">Quantity</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyReport.materials.length === 0 ? (
                      <tr><td colSpan="4" className="p-4 text-center text-slate-400 italic">No material purchases for this date</td></tr>
                    ) : (
                      dailyReport.materials.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="p-2 font-medium text-slate-800">{m.name}</td>
                          <td className="p-2 text-center text-slate-600">{m.quantity} {m.unit}</td>
                          <td className="p-2 text-right text-slate-600">{money(m.unitPrice)}</td>
                          <td className="p-2 text-right font-bold text-slate-900">{money(m.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card 3 & 4: Food & Transport */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-700 font-bold text-sm">🍱</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">3 & 4. Food & Transport Fuel</h4>
                    <span className="text-[11px] text-slate-400">Supervisor daily allowances & logistics</span>
                  </div>
                </div>
                <strong className="text-base font-extrabold text-amber-700">{money(dailyReport.foodAmount + dailyReport.transportAmount)}</strong>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 block">Food Allowance</span>
                  <strong className="text-lg font-bold text-slate-900">{money(dailyReport.foodAmount)}</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 block">Transport & Fuel</span>
                  <strong className="text-lg font-bold text-slate-900">{money(dailyReport.transportAmount)}</strong>
                </div>
              </div>
            </div>

            {/* Card 5: Manager & Org Bills */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-purple-50 text-purple-700 font-bold text-sm">🧾</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">5. Manager & Direct Org Bills</h4>
                    <span className="text-[11px] text-slate-400">Vouchers, invoices & contractor payouts</span>
                  </div>
                </div>
                <strong className="text-base font-extrabold text-purple-700">{money(dailyReport.totalBills)}</strong>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="p-2">Source / Title</th>
                      <th className="p-2">Vendor / Party</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyReport.bills.length === 0 ? (
                      <tr><td colSpan="3" className="p-4 text-center text-slate-400 italic">No vouchers or direct bills for this date</td></tr>
                    ) : (
                      dailyReport.bills.map((b, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="p-2 font-medium text-slate-800">
                            <span className="text-[10px] uppercase font-bold text-purple-600 block">{b.source}</span>
                            {b.description}
                          </td>
                          <td className="p-2 text-slate-600">{b.vendor}</td>
                          <td className="p-2 text-right font-bold text-slate-900">{money(b.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 1B. DATE RANGE EXPENSES REPORT VIEW */}
      {/* ----------------------------------------------------------------------------------------- */}
      {activeSubTab === 'range' && (
        <div className="space-y-6">
          {/* Range Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wide">Total Labour Outflow</span>
              <strong className="text-xl font-black text-slate-900 block">{money(rangeReport.kpis.totalLabour)}</strong>
              <small className="text-[10px] text-slate-400">{rangeReport.daysCount} active logged days</small>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide">Total Material Outflow</span>
              <strong className="text-xl font-black text-slate-900 block">{money(rangeReport.kpis.totalMaterial)}</strong>
              <small className="text-[10px] text-slate-400">Direct site deliveries</small>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wide">Bills & Vouchers</span>
              <strong className="text-xl font-black text-slate-900 block">{money(rangeReport.kpis.totalBills)}</strong>
              <small className="text-[10px] text-slate-400">Manager & direct payouts</small>
            </div>
            <div className="p-4 rounded-2xl bg-[#0B3470] text-white border border-blue-900 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wide">Grand Total Outflow</span>
              <strong className="text-2xl font-black text-white block">{money(rangeReport.kpis.grandTotal)}</strong>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportRangeCSV}
                  className="text-[10px] font-bold bg-white text-[#0B3470] px-2 py-1 rounded-md"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintRangePDF}
                  className="text-[10px] font-bold bg-sky-400 text-white px-2 py-1 rounded-md"
                >
                  Print PDF
                </button>
              </div>
            </div>
          </div>

          {/* Day-by-Day Chronological Accordion Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Chronological Daily Breakdown ({rangeReport.dayCards.length} days with expense records)
            </h3>
            {rangeReport.dayCards.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                No expense records logged between {rangeReport.fromDate} and {rangeReport.toDate} for this site.
              </div>
            ) : (
              rangeReport.dayCards.map((day) => {
                const isExpanded = !!expandedDates[day.date]
                return (
                  <div key={day.date} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleDateAccordion(day.date)}
                      className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-blue-50 text-[#0B3470] font-bold text-xs flex items-center justify-center">
                          {day.dayName}
                        </span>
                        <div>
                          <strong className="text-sm font-bold text-slate-900 block">{formatDateDisplay(day.date)}</strong>
                          <span className="text-[11px] text-slate-500">
                            Labour: {money(day.totalLabour)} · Materials: {money(day.totalMaterial)} · Bills: {money(day.totalBills)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <strong className="text-base font-extrabold text-slate-900">{money(day.grandTotal)}</strong>
                        <span className="text-xs text-slate-400 font-bold">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          {/* Labour details */}
                          <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                            <span className="font-bold text-blue-700 block mb-1">Labour Outflow ({money(day.totalLabour)})</span>
                            {day.labours.length === 0 ? (
                              <p className="text-slate-400 italic">None recorded</p>
                            ) : (
                              day.labours.map((l, idx) => (
                                <div key={idx} className="flex justify-between py-1 border-b border-slate-50">
                                  <span>{l.role} ({l.count} count)</span>
                                  <span className="font-semibold">{money(l.amount)}</span>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Material details */}
                          <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
                            <span className="font-bold text-emerald-700 block mb-1">Material Outflow ({money(day.totalMaterial)})</span>
                            {day.materials.length === 0 ? (
                              <p className="text-slate-400 italic">None recorded</p>
                            ) : (
                              day.materials.map((m, idx) => (
                                <div key={idx} className="flex justify-between py-1 border-b border-slate-50">
                                  <span>{m.name} ({m.quantity} {m.unit})</span>
                                  <span className="font-semibold">{money(m.amount)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 1C. LIFETIME SITE SUMMARY REPORT VIEW */}
      {/* ----------------------------------------------------------------------------------------- */}
      {activeSubTab === 'summary' && lifetimeSummary && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest block">Lifetime Rollup</span>
                <h3 className="text-2xl font-black text-slate-900">{lifetimeSummary.siteName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  📍 {lifetimeSummary.siteLocation} · 🏗️ Stage: <span className="font-bold text-slate-800">{lifetimeSummary.currentStage}</span> · 👤 Supervisor: <span className="font-bold text-slate-800">{lifetimeSummary.supervisorName}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-500 uppercase">Budget Burn Rate</span>
                <div className="text-2xl font-black text-blue-700">{lifetimeSummary.utilizationRate}%</div>
              </div>
            </div>

            {/* Lifetime Financial Performance Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Contract Budget</span>
                <strong className="text-xl font-bold text-slate-900 block mt-1">{money(lifetimeSummary.budget)}</strong>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Client Received</span>
                <strong className="text-xl font-bold text-emerald-900 block mt-1">{money(lifetimeSummary.totalReceived)}</strong>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <span className="text-[11px] font-bold text-amber-700 uppercase">Total Outflow Spent</span>
                <strong className="text-xl font-bold text-amber-900 block mt-1">{money(lifetimeSummary.totalSpent)}</strong>
              </div>
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                <span className="text-[11px] font-bold text-blue-700 uppercase">Cash in Hand</span>
                <strong className="text-xl font-bold text-blue-900 block mt-1">{money(lifetimeSummary.cashInHand)}</strong>
              </div>
            </div>

            {/* Category Distribution Visual Bars */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Lifetime Expenditure Category Distribution</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Labour Total</span>
                    <span>{money(lifetimeSummary.breakdown.labour)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${lifetimeSummary.totalSpent ? Math.min(100, (lifetimeSummary.breakdown.labour / lifetimeSummary.totalSpent) * 100) : 0}%` }} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Material Total</span>
                    <span>{money(lifetimeSummary.breakdown.material)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${lifetimeSummary.totalSpent ? Math.min(100, (lifetimeSummary.breakdown.material / lifetimeSummary.totalSpent) * 100) : 0}%` }} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Food & Logistics</span>
                    <span>{money(lifetimeSummary.breakdown.foodTransport)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${lifetimeSummary.totalSpent ? Math.min(100, (lifetimeSummary.breakdown.foodTransport / lifetimeSummary.totalSpent) * 100) : 0}%` }} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span>Bills, Vouchers & Incentives</span>
                    <span>{money(lifetimeSummary.breakdown.bills + lifetimeSummary.breakdown.incentives)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${lifetimeSummary.totalSpent ? Math.min(100, ((lifetimeSummary.breakdown.bills + lifetimeSummary.breakdown.incentives) / lifetimeSummary.totalSpent) * 100) : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
