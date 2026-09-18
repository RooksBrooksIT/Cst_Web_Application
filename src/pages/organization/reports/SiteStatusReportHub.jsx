import React, { useState, useMemo } from 'react'
import { calculateSiteStatusReport } from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'

export default function SiteStatusReportHub({ sites = [] }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const reportData = useMemo(() => {
    return calculateSiteStatusReport(sites)
  }, [sites])

  const filteredSites = useMemo(() => {
    return reportData.siteList.filter((s) => {
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
      return matchesStatus && matchesSearch
    })
  }, [reportData, statusFilter, searchQuery])

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
    <div className="space-y-6">
      {/* Top Header & Export Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Module 3 · Execution Tracking</span>
            <h2 className="text-xl font-extrabold text-slate-900">Site Status & Timeline Report</h2>
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
              🖨️ Print Status PDF
            </button>
          </div>
        </div>

        {/* Status Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'all' ? 'bg-[#0B3470] text-white border-[#0B3470]' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-80 block">All Sites</span>
            <strong className="text-xl font-black">{reportData.totalSites}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('live')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'live' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-80 block">Live Sites</span>
            <strong className="text-xl font-black">{reportData.statusCounts.live}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'in_progress' ? 'bg-blue-700 text-white border-blue-700' : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-80 block">In Progress</span>
            <strong className="text-xl font-black">{reportData.statusCounts.in_progress}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('planning')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'planning' ? 'bg-amber-700 text-white border-amber-700' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-80 block">Planning</span>
            <strong className="text-xl font-black">{reportData.statusCounts.planning}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'completed' ? 'bg-purple-700 text-white border-purple-700' : 'bg-purple-50 border-purple-200 text-purple-800'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-80 block">Completed</span>
            <strong className="text-xl font-black">{reportData.statusCounts.completed}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('on_hold')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'on_hold' ? 'bg-rose-700 text-white border-rose-700' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-80 block">On Hold</span>
            <strong className="text-xl font-black">{reportData.statusCounts.on_hold}</strong>
          </button>
        </div>

        {/* Search Bar */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by site name, manager, location, or stage..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Sites Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Project Milestone & Delay Analysis</h3>
          <span className="text-xs text-slate-500">{filteredSites.length} sites displayed</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="p-3">Site / Location</th>
                <th className="p-3">Manager / Supervisor</th>
                <th className="p-3">Stage</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Planned Schedule</th>
                <th className="p-3">Actual Schedule</th>
                <th className="p-3 text-center">Timeline Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSites.length === 0 ? (
                <tr><td colSpan="7" className="p-6 text-center text-slate-400 italic">No sites match the selected status or query.</td></tr>
              ) : (
                filteredSites.map((s) => (
                  <tr key={s.siteId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <strong className="text-slate-900 block">{s.siteName}</strong>
                      <span className="text-[11px] text-slate-400">{s.location}</span>
                    </td>
                    <td className="p-3 font-medium text-slate-700">{s.manager}</td>
                    <td className="p-3 font-semibold text-[#0B3470]">{s.stage}</td>
                    <td className="p-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-linear-to-r from-blue-600 to-indigo-600 h-2 rounded-full" style={{ width: `${s.progress}%` }} />
                        </div>
                        <span className="font-bold text-slate-700 min-w-8 text-right">{s.progress}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">
                      <div><span className="text-[10px] text-slate-400">Start:</span> {s.plannedStart}</div>
                      <div><span className="text-[10px] text-slate-400">Target:</span> {s.plannedEnd}</div>
                    </td>
                    <td className="p-3 text-slate-600">
                      <div><span className="text-[10px] text-slate-400">Started:</span> {s.actualStart}</div>
                      <div><span className="text-[10px] text-slate-400">End:</span> {s.actualEnd}</div>
                    </td>
                    <td className="p-3 text-center">
                      {s.delayStatus === 'delayed' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          ⚠️ Delayed ({s.delayDays}d)
                        </span>
                      ) : s.delayStatus === 'approaching_deadline' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          ⏳ Due in {s.delayDays}d
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ✓ On Track
                        </span>
                      )}
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
