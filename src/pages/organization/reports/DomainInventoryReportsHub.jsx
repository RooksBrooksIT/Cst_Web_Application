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
}) {
  const [activeDomain, setActiveDomain] = useState('contractors')
  const [searchQuery, setSearchQuery] = useState('')

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
    const query = searchQuery.trim().toLowerCase()
    if (!query) return reportData.records
    return reportData.records.filter((rec) =>
      Object.values(rec).some((val) =>
        String(val).toLowerCase().includes(query)
      )
    )
  }, [reportData, searchQuery])

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
              ${headers.map((h) => {
                const val = r[h]
                if (typeof val === 'number' && (h.toLowerCase().includes('amount') || h.toLowerCase().includes('payable') || h.toLowerCase().includes('payout') || h.toLowerCase().includes('valuation') || h.toLowerCase().includes('rate'))) {
                  return `<td><strong>${money(val)}</strong></td>`
                }
                return `<td>${val ?? 'N/A'}</td>`
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport(reportData.title, content)
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Export Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Module 6 · Domain Registers</span>
            <h2 className="text-xl font-extrabold text-slate-900">{reportData.title}</h2>
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
              🖨️ Print Domain PDF
            </button>
          </div>
        </div>

        {/* Domain Navigation Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => { setActiveDomain('contractors'); setSearchQuery('') }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeDomain === 'contractors' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            👷 Contractor Payouts
          </button>
          <button
            type="button"
            onClick={() => { setActiveDomain('materials'); setSearchQuery('') }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeDomain === 'materials' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🧱 Material Stock & Valuation
          </button>
          <button
            type="button"
            onClick={() => { setActiveDomain('tools'); setSearchQuery('') }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeDomain === 'tools' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🔧 Tools & Machinery Register
          </button>
          <button
            type="button"
            onClick={() => { setActiveDomain('workers'); setSearchQuery('') }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeDomain === 'workers' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            📋 Worker Muster Roll & Wages
          </button>
          <button
            type="button"
            onClick={() => { setActiveDomain('vehicles'); setSearchQuery('') }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeDomain === 'vehicles' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🚛 Fleet & Vehicles Inventory
          </button>
          <button
            type="button"
            onClick={() => { setActiveDomain('incentives'); setSearchQuery('') }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeDomain === 'incentives' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            🏆 Supervisor Incentives
          </button>
        </div>

        {/* Search Bar */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Filter ${reportData.title}...`}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Summary KPI Highlights */}
      {activeDomain === 'contractors' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Subcontractor Entries</span>
            <strong className="text-2xl font-black text-slate-900 block">{filteredRecords.length}</strong>
          </div>
          <div className="p-4 rounded-2xl bg-[#0B3470] text-white border border-blue-900 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-blue-200 uppercase">Total Contractor Expenditure</span>
            <strong className="text-2xl font-black text-white block">{money(reportData.totalPayout)}</strong>
          </div>
        </div>
      )}

      {activeDomain === 'materials' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Catalog Items</span>
            <strong className="text-2xl font-black text-slate-900 block">{filteredRecords.length}</strong>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 uppercase">Total Material Stock Valuation</span>
            <strong className="text-2xl font-black text-emerald-900 block">{money(reportData.totalValuation)}</strong>
          </div>
        </div>
      )}

      {activeDomain === 'workers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Muster Roll Headcount</span>
            <strong className="text-2xl font-black text-slate-900 block">{filteredRecords.length}</strong>
          </div>
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-blue-700 uppercase">Total Wage Liability</span>
            <strong className="text-2xl font-black text-blue-900 block">{money(reportData.totalWageLiability)}</strong>
          </div>
        </div>
      )}

      {activeDomain === 'incentives' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Milestone Incentive Claims</span>
            <strong className="text-2xl font-black text-slate-900 block">{filteredRecords.length}</strong>
          </div>
          <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-purple-700 uppercase">Net Incentive Outflow</span>
            <strong className="text-2xl font-black text-purple-900 block">{money(reportData.totalIncentives)}</strong>
          </div>
        </div>
      )}

      {/* Dynamic Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                {filteredRecords.length > 0 &&
                  Object.keys(filteredRecords[0]).map((h) => (
                    <th key={h} className="p-3 whitespace-nowrap">
                      {h.replace(/([A-Z])/g, ' $1').toUpperCase()}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="10" className="p-8 text-center text-slate-400 italic">
                    No records found for {reportData.title}.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/70 transition-colors">
                    {Object.entries(r).map(([k, v], cellIdx) => {
                      if (typeof v === 'number' && (k.toLowerCase().includes('amount') || k.toLowerCase().includes('payable') || k.toLowerCase().includes('payout') || k.toLowerCase().includes('valuation') || k.toLowerCase().includes('rate'))) {
                        return (
                          <td key={cellIdx} className="p-3 font-bold text-slate-900 whitespace-nowrap">
                            {money(v)}
                          </td>
                        )
                      }
                      return (
                        <td key={cellIdx} className="p-3 text-slate-700 whitespace-nowrap">
                          {v ?? '—'}
                        </td>
                      )
                    })}
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
