import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  siteSupervisorEntries = [],
  siteMaterialPool = [],
  materialsAvailability = [],
  materialAllocations = [],
  sites = [],
  subReport = 'materials',
  initialSiteId = 'all',
  initialFromDate = null,
  initialToDate = null,
  initialStage = 'all',
  projectStages = [],
}) {
  const getInitialDomain = (sub) => {
    if (sub === 'materials') return 'materials'
    if (sub === 'tools') return 'tools'
    if (sub === 'summary') return 'contractors'
    return sub || 'materials'
  }

  const [activeDomain, setActiveDomain] = useState(() => getInitialDomain(subReport))
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId || 'all')
  const [fromDate, setFromDate] = useState(initialFromDate)
  const [toDate, setToDate] = useState(initialToDate)
  const [stage, setStage] = useState(initialStage || 'all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (subReport) {
      setActiveDomain(getInitialDomain(subReport))
    }
  }, [subReport])

  useEffect(() => {
    setSelectedSiteId(initialSiteId || 'all')
  }, [initialSiteId])

  useEffect(() => {
    setFromDate(initialFromDate)
  }, [initialFromDate])

  useEffect(() => {
    setToDate(initialToDate)
  }, [initialToDate])

  useEffect(() => {
    setStage(initialStage || 'all')
  }, [initialStage])

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
      siteSupervisorEntries,
      siteMaterialPool,
      materialsAvailability,
      materialAllocations,
      sites,
      siteId: selectedSiteId,
      fromDate,
      toDate,
      stage,
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
    siteSupervisorEntries,
    siteMaterialPool,
    materialsAvailability,
    materialAllocations,
    sites,
    selectedSiteId,
    fromDate,
    toDate,
    stage,
  ])

  const filteredRecords = useMemo(() => {
    let list = reportData.records || []
    if (activeDomain !== 'materials' && selectedSiteId && selectedSiteId !== 'all') {
      list = list.filter((r) => r.siteId === selectedSiteId || r.site === selectedSiteId || r.projectId === selectedSiteId)
    }
    const query = searchQuery.trim().toLowerCase()
    if (!query) return list
    return list.filter((rec) =>
      Object.values(rec).some((val) =>
        String(val).toLowerCase().includes(query)
      )
    )
  }, [reportData, searchQuery, selectedSiteId, activeDomain])

  const formatHeader = (h) => {
    if (h === 'materialName') return 'Material Name'
    if (h === 'category') return 'Category'
    if (h === 'unit') return 'Unit'
    if (h === 'currentStock') return 'Current Stock'
    if (h === 'allocated') return 'Allocated'
    if (h === 'consumed') return 'Consumed'
    if (h === 'unitRate') return 'Unit Rate'
    if (h === 'valuation') return 'Valuation'
    if (h === 'status') return 'Status'
    return h.replace(/([A-Z])/g, ' $1').trim()
  }

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return
    const keys = Object.keys(filteredRecords[0])
    const headers = keys.map((h) => formatHeader(h))
    const rows = filteredRecords.map((r) => keys.map((k) => r[k] ?? ''))
    exportToCSV(`Domain_Report_${activeDomain}`, headers, rows)
  }

  const handlePrintPDF = () => {
    if (filteredRecords.length === 0) return
    const keys = Object.keys(filteredRecords[0])
    const headers = keys.map((h) => formatHeader(h))
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">${reportData.title}</h2>
        <p style="margin: 4px 0; color: #475569;">Total Filtered Records: <strong>${filteredRecords.length}</strong></p>
      </div>
      <table border="1" cellpadding="6" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 11px;">
        <thead>
          <tr style="background-color: #f1f5f9; color: #334155; text-align: left;">
            ${headers.map((h) => `<th style="padding: 8px;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filteredRecords
            .map(
              (r) => `
            <tr>
              ${keys
                .map((k) => {
                  const val = r[k]
                  const lowerK = k.toLowerCase()
                  if (lowerK === 'valuation' || lowerK.includes('amount') || lowerK.includes('rate')) {
                    return `<td style="padding: 8px; font-weight: bold;">${money(val || 0)}</td>`
                  }
                  return `<td style="padding: 8px;">${val ?? '-'}</td>`
                })
                .join('')}
            </tr>
          `
            )
            .join('')}
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

  const activeSiteName = useMemo(() => {
    if (!selectedSiteId || selectedSiteId === 'all') return 'All Managed Sites'
    const match = sites.find((s) => s.id === selectedSiteId)
    return match ? (match.projectName || match.siteName || match.name || selectedSiteId) : selectedSiteId
  }, [selectedSiteId, sites])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header & Domain Switcher Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest">
                Inventory & Operations
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                Site: {activeSiteName}
              </span>
              {stage && stage !== 'all' && (
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-200">
                  Stage: {stage}
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {reportData.title || 'Inventory & Domain Reports'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time telemetry and auditing across material stock, direct site allocations, and field consumption.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeDomain === 'incentives' && (
              <Link
                to="/organization/incentive-calculation"
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <span>🏆 New Incentive Calculation →</span>
              </Link>
            )}
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
                    : 'text-slate-600 hover:text-slate-900 bg-transparent'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Materials Summary KPI Cards */}
      {activeDomain === 'materials' && reportData.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Current Stock</span>
            <strong className="text-xl font-extrabold text-blue-700 block font-mono">{Number(reportData.summary.totalStock || 0).toLocaleString()}</strong>
            <small className="text-slate-400 text-[10px]">Active stock on hand</small>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Allocated</span>
            <strong className="text-xl font-extrabold text-slate-900 block font-mono">{Number(reportData.summary.totalAllocated || 0).toLocaleString()}</strong>
            <small className="text-slate-400 text-[10px]">Site dispatched stock</small>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Total Consumed</span>
            <strong className="text-xl font-extrabold text-amber-700 block font-mono">{Number(reportData.summary.totalConsumed || 0).toLocaleString()}</strong>
            <small className="text-slate-400 text-[10px]">Logged in daily works</small>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-emerald-500">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Total Valuation</span>
            <strong className="text-xl font-extrabold text-emerald-700 block font-mono">{money(reportData.summary.totalValuation || 0)}</strong>
            <small className="text-slate-400 text-[10px]">Material inventory value</small>
          </div>
        </div>
      )}

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
                    <th key={h} className="p-3.5 whitespace-nowrap text-xs font-bold text-slate-600">
                      {formatHeader(h)}
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
                    {Object.entries(r).map(([key, val], colIdx) => {
                      const lowerKey = key.toLowerCase()

                      // Currency formatting for valuation, unitRate, amounts, etc.
                      if (
                        lowerKey === 'valuation' ||
                        lowerKey.includes('amount') ||
                        lowerKey.includes('rate') ||
                        lowerKey === 'unitrate' ||
                        lowerKey === 'price'
                      ) {
                        return (
                          <td key={colIdx} className="p-3.5 whitespace-nowrap font-mono font-bold text-slate-900">
                            {money(val || 0)}
                          </td>
                        )
                      }

                      // Status column styling
                      if (lowerKey === 'status') {
                        const statusStr = String(val || '').toLowerCase()
                        let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200'
                        if (statusStr.includes('out') || statusStr.includes('critical') || statusStr.includes('danger')) {
                          badgeClass = 'bg-rose-50 text-rose-700 border-rose-200'
                        } else if (
                          statusStr.includes('warning') ||
                          statusStr.includes('reorder') ||
                          statusStr.includes('low') ||
                          statusStr.includes('pending')
                        ) {
                          badgeClass = 'bg-amber-50 text-amber-700 border-amber-200'
                        } else if (
                          statusStr.includes('adequate') ||
                          statusStr.includes('healthy') ||
                          statusStr.includes('approved') ||
                          statusStr.includes('active')
                        ) {
                          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }
                        return (
                          <td key={colIdx} className="p-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}`}>
                              {String(val || 'N/A')}
                            </span>
                          </td>
                        )
                      }

                      // Numbers formatting (quantities/counts)
                      if (typeof val === 'number') {
                        return (
                          <td key={colIdx} className="p-3.5 whitespace-nowrap font-mono font-semibold text-slate-800">
                            {val.toLocaleString()}
                          </td>
                        )
                      }

                      // Material name or contractor name
                      if (lowerKey === 'materialname' || lowerKey === 'contractorname') {
                        return (
                          <td key={colIdx} className="p-3.5 whitespace-nowrap font-bold text-slate-900">
                            {val || '-'}
                          </td>
                        )
                      }

                      return (
                        <td key={colIdx} className="p-3.5 whitespace-nowrap text-slate-700">
                          {val !== null && val !== undefined && val !== '' ? String(val) : '-'}
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
