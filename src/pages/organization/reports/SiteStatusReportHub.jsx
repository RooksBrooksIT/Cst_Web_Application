import React, { useState, useMemo } from 'react'
import { calculateSiteStatusReport } from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'
import StatusBadge from '../../../components/common/StatusBadge'

export default function SiteStatusReportHub({
  sites = [],
  initialSiteId = 'all',
  initialStage = 'all',
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId)

  // Sync with prop changes if updated by parent filter
  React.useEffect(() => {
    if (initialSiteId) setSelectedSiteId(initialSiteId)
  }, [initialSiteId])

  const reportData = useMemo(() => {
    return calculateSiteStatusReport(sites)
  }, [sites])

  const filteredSites = useMemo(() => {
    return reportData.siteList.filter((s) => {
      const matchesSite = selectedSiteId === 'all' || s.siteId === selectedSiteId
      const matchesStage = initialStage === 'all' || !initialStage || s.stage?.toLowerCase() === initialStage.toLowerCase()
      const matchesStatus =
        statusFilter === 'all' ||
        s.status.toLowerCase().replace(/\s+/g, '_') === statusFilter.toLowerCase()
      const query = searchQuery.trim().toLowerCase()
      const matchesSearch =
        !query ||
        s.siteName.toLowerCase().includes(query) ||
        s.location.toLowerCase().includes(query) ||
        s.manager.toLowerCase().includes(query) ||
        s.stage.toLowerCase().includes(query)
      return matchesSite && matchesStage && matchesStatus && matchesSearch
    })
  }, [reportData, selectedSiteId, initialStage, statusFilter, searchQuery])

  // Count timeline health
  const healthCounts = useMemo(() => {
    let onTrack = 0
    let delayed = 0
    let approaching = 0
    let completed = 0

    reportData.siteList.forEach((s) => {
      if (s.status.toLowerCase() === 'completed') completed += 1
      else if (s.delayStatus === 'delayed') delayed += 1
      else if (s.delayStatus === 'approaching_deadline') approaching += 1
      else onTrack += 1
    })

    return { onTrack, delayed, approaching, completed }
  }, [reportData])

  const handleExportCSV = () => {
    const rows = filteredSites.map((s) => [
      s.siteName,
      s.location,
      s.manager,
      s.stage,
      s.status,
      `${s.progress}%`,
      s.plannedStart,
      s.plannedEnd,
      s.actualStart,
      s.actualEnd,
      s.delayStatus === 'delayed' ? `Delayed by ${s.delayDays} days` : s.delayStatus === 'approaching_deadline' ? `Approaching (${s.delayDays} days)` : 'On Track',
    ])
    exportToCSV('Site_Status_Timeline_Report', ['Site Name', 'Location', 'Manager', 'Stage', 'Status', 'Progress %', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Timeline Health'], rows)
  }

  const handlePrintPDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Site & Project Status & Timeline Report</h2>
        <p style="margin: 4px 0; color: #475569;">Total Portfolio Sites: <strong>${reportData.totalSites}</strong> | Filtered Sites: <strong>${filteredSites.length}</strong></p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Site / Location</th>
            <th>Manager / Supervisor</th>
            <th>Current Stage</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Planned Timeline</th>
            <th>Timeline Health</th>
          </tr>
        </thead>
        <tbody>
          ${filteredSites.map((s) => `
            <tr>
              <td><strong>${s.siteName}</strong><br/><small style="color: #64748b;">${s.location}</small></td>
              <td>${s.manager}</td>
              <td>${s.stage}</td>
              <td>${s.status}</td>
              <td><strong>${s.progress}%</strong></td>
              <td>${s.plannedStart} to ${s.plannedEnd}</td>
              <td>
                <span style="font-weight: bold; color: ${s.delayStatus === 'delayed' ? '#b91c1c' : s.delayStatus === 'approaching_deadline' ? '#b45309' : '#15803d'};">
                  ${s.delayStatus === 'delayed' ? `⚠️ Delayed (${s.delayDays}d)` : s.delayStatus === 'approaching_deadline' ? `⏳ Approaching (${s.delayDays}d)` : '✓ On Track'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport('Site Status & Timeline Report', content)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header & Search Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block">
              Execution Status
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Site Status & Progress Report
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live schedule tracking, percentage completion meters, deadline forecasts, and delay alerts.
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
              🖨️ Print PDF
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">⌕</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search site, manager, stage, or location..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Project Statuses</option>
              <option value="live">Live / In Progress</option>
              <option value="planning">Planning / Draft</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline Health KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Sites</span>
          <strong className="text-2xl font-extrabold text-slate-900 block font-mono">{reportData.totalSites}</strong>
          <small className="text-slate-400 text-[11px]">Across organization</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">On Track</span>
          <strong className="text-2xl font-extrabold text-emerald-700 block font-mono">{healthCounts.onTrack} Sites</strong>
          <small className="text-slate-400 text-[11px]">Progressing on schedule</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Approaching Deadline</span>
          <strong className="text-2xl font-extrabold text-amber-700 block font-mono">{healthCounts.approaching} Sites</strong>
          <small className="text-slate-400 text-[11px]">Within 14 days of end date</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-rose-500">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Delayed / Overdue</span>
          <strong className="text-2xl font-extrabold text-rose-600 block font-mono">{healthCounts.delayed} Sites</strong>
          <small className="text-slate-400 text-[11px]">Immediate intervention required</small>
        </div>
      </div>

      {/* Standard Desktop Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Site / Location</th>
                <th className="p-3.5">Supervisor / Manager</th>
                <th className="p-3.5">Current Stage</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-center min-w-[140px]">Progress</th>
                <th className="p-3.5">Contract Timeline</th>
                <th className="p-3.5 text-center">Schedule Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 text-xs">
                    No sites found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSites.map((s, idx) => (
                  <tr key={s.siteId || idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <strong className="text-slate-900 block text-xs font-bold">{s.siteName}</strong>
                      <span className="text-[11px] text-slate-400 truncate block">{s.location}</span>
                    </td>
                    <td className="p-3.5 text-slate-700 font-medium">{s.manager}</td>
                    <td className="p-3.5 font-semibold text-blue-700">{s.stage}</td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-slate-700">
                          <span>Progress</span>
                          <span>{s.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                          <div
                            className={`h-1.5 rounded-full ${
                              s.progress >= 100
                                ? 'bg-emerald-500'
                                : s.delayStatus === 'delayed'
                                ? 'bg-rose-500'
                                : 'bg-[#0B3470]'
                            }`}
                            style={{ width: `${Math.min(100, s.progress)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-600 whitespace-nowrap text-[11px]">
                      <div>{s.plannedStart}</div>
                      <div className="text-slate-400">→ {s.plannedEnd}</div>
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          s.delayStatus === 'delayed'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : s.delayStatus === 'approaching_deadline'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {s.delayStatus === 'delayed'
                          ? `Delayed (${s.delayDays}d)`
                          : s.delayStatus === 'approaching_deadline'
                          ? `Due in ${s.delayDays}d`
                          : 'On Track'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
