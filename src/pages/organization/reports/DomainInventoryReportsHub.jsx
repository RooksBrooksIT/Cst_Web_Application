import React, { useState, useMemo } from 'react'
import {
  money,
  parseAmount,
  calculateDomainReports,
} from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'

export default function DomainInventoryReportsHub({
  contractors = [],
  contractorBills = [],
  contractorEntries = [],
  materials = [],
  tools = [],
  workers = [],
  workerAttendance = [],
  vehicles = [],
  siteSupervisorIncentives = [],
  subReport = 'materials',
  initialSiteId = 'all',
}) {
  const getInitialDomain = (sub) => {
    if (sub === 'materials') return 'materials'
    if (sub === 'tools') return 'tools'
    if (sub === 'summary') return 'contractors'
    return sub || 'materials'
  }

  const [activeDomain, setActiveDomain] = useState(() => getInitialDomain(subReport))
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId)
  const [searchQuery, setSearchQuery] = useState('')

  React.useEffect(() => {
    if (subReport) {
      setActiveDomain(getInitialDomain(subReport))
    }
  }, [subReport])

  React.useEffect(() => {
    if (initialSiteId) {
      setSelectedSiteId(initialSiteId)
    }
  }, [initialSiteId])

  const reportData = useMemo(() => {
    return calculateDomainReports({
      type: activeDomain,
      contractors,
      contractorBills,
      contractorEntries,
      materials,
      tools,
      workers,
      workerAttendance,
      vehicles,
      siteSupervisorIncentives,
    })
  }, [
    activeDomain,
    contractors,
    contractorBills,
    contractorEntries,
    materials,
    tools,
    workers,
    workerAttendance,
    vehicles,
    siteSupervisorIncentives,
  ])

  const filteredRecords = useMemo(() => {
    let list = reportData.records
    if (selectedSiteId && selectedSiteId !== 'all') {
      list = list.filter((r) => r.siteId === selectedSiteId || r.site === selectedSiteId || r.projectId === selectedSiteId)
    }
    const query = searchQuery.trim().toLowerCase()
    if (!query) return list
    return list.filter((rec) =>
      Object.values(rec).some((val) =>
        String(val).toLowerCase().includes(query)
      )
    )
  }, [reportData, searchQuery, selectedSiteId])

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return
    const headers = Object.keys(filteredRecords[0])
    const rows = filteredRecords.map((r) => Object.values(r))
    exportToCSV(`Domain_Report_${activeDomain}`, headers, rows)
  }

  const handlePrintPDF = () => {
    if (filteredRecords.length === 0) return
    const headers = Object.keys(filteredRecords[0])
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">${reportData.title}</h2>
        <p style="margin: 4px 0; color: #475569;">Total Filtered Records: <strong>${filteredRecords.length}</strong></p>
      </div>
      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h.replace(/([A-Z])/g, ' $1').toUpperCase()}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filteredRecords.map((r) => `
            <tr>
              ${headers.map((h) => `<td>${r[h] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport(reportData.title, content)
  }

  const domainTabs = [
    { id: 'materials', label: 'Materials & Stock', icon: '🧱' },
    { id: 'tools', label: 'Tools & Equipment', icon: '🔧' },
    { id: 'contractors', label: 'Contractors', icon: '👷' },
    { id: 'workers', label: 'Workforce Muster', icon: '👥' },
    { id: 'vehicles', label: 'Fleet & Vehicles', icon: '🚛' },
    { id: 'incentives', label: 'Supervisor Incentives', icon: '🏆' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header & Domain Switcher Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block">
              Inventory & Operations
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {reportData.title || 'Inventory & Domain Reports'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditing logs across trade contractors, material consumption, equipment logs, and workforce muster rolls.
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
              🖨️ Print Domain PDF
            </button>
          </div>
        </div>

        {/* Domain Navigation Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pt-3 border-t border-slate-100 pb-1">
          {domainTabs.map((tab) => {
            const isActive = activeDomain === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveDomain(tab.id)
                  setSearchQuery('')
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contractor Summary KPI Cards */}
      {activeDomain === 'contractors' && reportData.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Contractors</span>
            <strong className="text-xl font-extrabold text-blue-700 block font-mono">{reportData.summary.totalRegisteredContractors || 0}</strong>
            <small className="text-slate-400 text-[10px]">Registered trade partners</small>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Billed Value</span>
            <strong className="text-xl font-extrabold text-slate-900 block font-mono">{money(reportData.summary.totalBillValue || 0)}</strong>
            <small className="text-slate-400 text-[10px]">Submitted work bills</small>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Total Paid Out</span>
            <strong className="text-xl font-extrabold text-emerald-700 block font-mono">{money(reportData.summary.totalPaidAmount || 0)}</strong>
            <small className="text-slate-400 text-[10px]">Cleared contractor payments</small>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-amber-500">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Total Outstanding</span>
            <strong className="text-xl font-extrabold text-amber-700 block font-mono">{money(reportData.summary.totalPendingBalance || 0)}</strong>
            <small className="text-slate-400 text-[10px]">Pending contractor balance</small>
          </div>
        </div>
      )}

      {/* Filter Toolbar & Count */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">⌕</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${reportData.title.toLowerCase()}...`}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs"
          />
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Showing <strong>{filteredRecords.length}</strong> {reportData.title} records
        </span>
      </div>

      {/* Standard Dynamic Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                {filteredRecords.length > 0 &&
                  Object.keys(filteredRecords[0]).map((h) => (
                    <th key={h} className="p-3.5 whitespace-nowrap capitalize">
                      {h.replace(/([A-Z])/g, ' $1')}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400 text-xs">
                    No records found in {reportData.title}.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/80 transition-colors">
                    {Object.entries(r).map(([key, val], colIdx) => (
                      <td key={colIdx} className="p-3.5 whitespace-nowrap">
                        {typeof val === 'number' && key.toLowerCase().includes('amount') ? (
                          <strong className="font-mono font-bold text-slate-900">{money(val)}</strong>
                        ) : typeof val === 'number' && key.toLowerCase().includes('rate') ? (
                          <span className="font-mono text-slate-700">{money(val)}</span>
                        ) : (
                          <span className="text-slate-800">{val !== null && val !== undefined && val !== '' ? String(val) : '-'}</span>
                        )}
                      </td>
                    ))}
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
