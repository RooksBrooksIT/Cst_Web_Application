import React, { useState, useEffect, useMemo } from 'react'
import { fetchWorkersAttendanceReport } from '../../../services/attendanceService.js'
import { money } from '../../../services/reportService.js'
import { exportToCSV, printReport } from '../../../services/exportService.js'

export default function WorkerAttendanceReport({
  orgId,
  sites = [],
  initialMonth = new Date().toISOString().slice(0, 7),
  initialSiteId = 'all',
}) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [reportData, setReportData] = useState({
    summary: {
      totalActiveWorkersMapped: 0,
      totalDaysLogged: 0,
      overallAttendanceRate: 0,
      totalMonthlyWageOutflow: 0,
      extraLabourTotalCount: 0,
    },
    daysInMonth: 30,
    records: [],
  })

  // Sync prop changes if filter from parent hub updates
  useEffect(() => {
    if (initialSiteId !== undefined) {
      setSelectedSiteId(initialSiteId)
    }
  }, [initialSiteId])

  useEffect(() => {
    if (initialMonth) {
      setSelectedMonth(initialMonth.slice(0, 7))
    }
  }, [initialMonth])

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      setLoading(true)
      try {
        const data = await fetchWorkersAttendanceReport(orgId, selectedMonth, selectedSiteId)
        if (isMounted) {
          setReportData(data)
        }
      } catch (err) {
        console.error('Error fetching workers attendance report:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadData()
    return () => {
      isMounted = false
    }
  }, [orgId, selectedMonth, selectedSiteId])

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return reportData.records
    return reportData.records.filter(
      (r) =>
        String(r.workerName || '').toLowerCase().includes(q) ||
        String(r.workerId || '').toLowerCase().includes(q) ||
        String(r.designation || '').toLowerCase().includes(q) ||
        String(r.siteName || '').toLowerCase().includes(q)
    )
  }, [reportData.records, searchQuery])

  const daysArray = useMemo(() => {
    const totalDays = reportData.daysInMonth || 30
    return Array.from({ length: totalDays }, (_, i) => i + 1)
  }, [reportData.daysInMonth])

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return
    const headers = [
      'Worker ID',
      'Worker Name',
      'Designation',
      'Site Name',
      'Daily Rate (INR)',
      'Present Days',
      'Half Days',
      'Overtime Days',
      'Absent Days',
      'Monthly Wages (INR)',
    ]
    const rows = filteredRecords.map((r) => [
      r.workerId,
      r.workerName,
      r.designation,
      r.siteName,
      r.dailySalaryRate,
      r.presentCount,
      r.halfDayCount,
      r.overtimeCount,
      r.absentCount,
      r.totalCalculatedSalary,
    ])
    exportToCSV(`Workers_Attendance_Report_${selectedMonth}`, headers, rows)
  }

  const handlePrintPDF = () => {
    if (filteredRecords.length === 0) return
    const headers = [
      'Worker ID',
      'Worker Name',
      'Designation',
      'Site Name',
      'Daily Rate',
      'P',
      'H',
      'OT',
      'A',
      'Total Wages',
    ]
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Workers Attendance & Muster Roll Report (${selectedMonth})</h2>
        <p style="margin: 4px 0; color: #475569;">Total Active Workers: <strong>${reportData.summary.totalActiveWorkersMapped}</strong> | Total Outflow: <strong>₹${reportData.summary.totalMonthlyWageOutflow.toLocaleString('en-IN')}</strong></p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background-color: #f1f5f9; text-align: left;">
            ${headers.map((h) => `<th style="padding: 6px; border: 1px solid #cbd5e1;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filteredRecords
            .map(
              (r) => `
            <tr>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.workerId}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${r.workerName}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.designation}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.siteName}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">₹${r.dailySalaryRate}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.presentCount}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.halfDayCount}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.overtimeCount}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1;">${r.absentCount}</td>
              <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">₹${r.totalCalculatedSalary.toLocaleString('en-IN')}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `
    printReport(`Workers_Attendance_Report_${selectedMonth}`, content)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header & Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block">
              Workforce & Payroll Analytics
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Workers Attendance & Muster Roll Report
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive daily attendance status grid, overtime accruals, and monthly wage liabilities.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrintPDF}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white transition-colors shadow-2xs cursor-pointer"
            >
              🖨️ Print Report PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Filter by Site
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer"
            >
              <option value="all">All Portfolio Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName || s.projectName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Select Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Search Worker / ID
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by worker name, ID, designation..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* 2. 5 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Mapped Active Workers
          </span>
          <strong className="text-xl font-extrabold text-slate-900 tracking-tight block font-mono">
            {reportData.summary.totalActiveWorkersMapped}
          </strong>
          <span className="text-[10px] text-slate-400 block">Total mapped personnel</span>
        </div>

        {/* Card 2 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Logged Days in Month
          </span>
          <strong className="text-xl font-extrabold text-blue-700 tracking-tight block font-mono">
            {reportData.summary.totalDaysLogged} <span className="text-xs font-normal text-slate-500">Days</span>
          </strong>
          <span className="text-[10px] text-slate-400 block">Shift muster entries</span>
        </div>

        {/* Card 3 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Overall Attendance Rate
          </span>
          <strong className="text-xl font-extrabold text-emerald-700 tracking-tight block font-mono">
            {reportData.summary.overallAttendanceRate}%
          </strong>
          <span className="text-[10px] text-slate-400 block">Present ratio across shifts</span>
        </div>

        {/* Card 4 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Monthly Wage Outflow
          </span>
          <strong className="text-xl font-extrabold text-purple-700 tracking-tight block font-mono">
            {money(reportData.summary.totalMonthlyWageOutflow)}
          </strong>
          <span className="text-[10px] text-slate-400 block">Calculated payroll liability</span>
        </div>

        {/* Card 5 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Extra Casual Labour
          </span>
          <strong className="text-xl font-extrabold text-amber-700 tracking-tight block font-mono">
            {reportData.summary.extraLabourTotalCount}
          </strong>
          <span className="text-[10px] text-slate-400 block">Unmapped walk-in hires</span>
        </div>
      </div>

      {/* 3. Detail Data Table with Day 1..31 Grid */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Worker Attendance Ledger</h3>
            <span className="text-xs text-slate-500 font-medium">
              ({filteredRecords.length} workers)
            </span>
          </div>
          {/* Status Badge Legend */}
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> P (Present)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-amber-400" /> H (Half Day)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-purple-500" /> OT (Overtime)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-500" /> A (Absent)
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Loading worker attendance records...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3 whitespace-nowrap sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    Worker Details
                  </th>
                  <th className="p-3 whitespace-nowrap">Designation</th>
                  <th className="p-3 whitespace-nowrap">Site / Project</th>
                  <th className="p-3 whitespace-nowrap text-right">Daily Rate</th>
                  <th className="p-2 text-center text-emerald-700 font-bold">P</th>
                  <th className="p-2 text-center text-amber-700 font-bold">H</th>
                  <th className="p-2 text-center text-purple-700 font-bold">OT</th>
                  <th className="p-2 text-center text-rose-700 font-bold">A</th>
                  <th className="p-3 whitespace-nowrap text-right font-bold text-slate-900">
                    Total Wages
                  </th>
                  {/* Day-by-Day Grid Headers */}
                  {daysArray.map((dayNum) => (
                    <th key={dayNum} className="p-1.5 text-center font-mono text-[10px] w-7 min-w-[28px]">
                      {dayNum}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10 + daysArray.length} className="p-12 text-center text-slate-400 text-xs">
                      No worker attendance records found for {selectedMonth}.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, rowIdx) => (
                    <tr key={r.workerId || rowIdx} className="hover:bg-slate-50/80 transition-colors">
                      {/* Worker Name & ID */}
                      <td className="p-3 whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">
                        <strong className="block text-slate-900 font-bold">{r.workerName}</strong>
                        <span className="text-[10px] font-mono text-slate-400">{r.workerId}</span>
                      </td>

                      {/* Designation */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          {r.designation}
                        </span>
                      </td>

                      {/* Assigned Site */}
                      <td className="p-3 whitespace-nowrap text-slate-700 font-medium">
                        {r.siteName}
                      </td>

                      {/* Daily Rate */}
                      <td className="p-3 whitespace-nowrap text-right font-mono font-semibold text-slate-800">
                        ₹{r.dailySalaryRate}
                      </td>

                      {/* P, H, OT, A Counts */}
                      <td className="p-2 text-center font-bold text-emerald-700 bg-emerald-50/40">
                        {r.presentCount}
                      </td>
                      <td className="p-2 text-center font-bold text-amber-700 bg-amber-50/40">
                        {r.halfDayCount}
                      </td>
                      <td className="p-2 text-center font-bold text-purple-700 bg-purple-50/40">
                        {r.overtimeCount}
                      </td>
                      <td className="p-2 text-center font-bold text-rose-700 bg-rose-50/40">
                        {r.absentCount}
                      </td>

                      {/* Total Calculated Wages */}
                      <td className="p-3 whitespace-nowrap text-right font-mono font-extrabold text-slate-900 bg-slate-50/60">
                        ₹{r.totalCalculatedSalary.toLocaleString('en-IN')}
                      </td>

                      {/* Day 1 to 31 Grid Badges */}
                      {daysArray.map((dayNum) => {
                        const status = r.dayGrid[dayNum]
                        return (
                          <td key={dayNum} className="p-1 text-center border-l border-slate-100">
                            {status === 'P' ? (
                              <span className="inline-block w-5 h-5 leading-5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                P
                              </span>
                            ) : status === 'H' ? (
                              <span className="inline-block w-5 h-5 leading-5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                H
                              </span>
                            ) : status === 'OT' ? (
                              <span className="inline-block w-5 h-5 leading-5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                OT
                              </span>
                            ) : status === 'A' ? (
                              <span className="inline-block w-5 h-5 leading-5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                A
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono text-[10px]">-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
