import React, { useState, useMemo } from 'react'
import {
  money,
  parseAmount,
  PROJECT_STAGES,
  calculateProjectStageReport,
  formatDateDisplay,
} from '../../../services/reportService'
import { exportToCSV, printReport } from '../../../services/exportService'

export default function ProjectStageReportsHub({
  sites = [],
  siteSupervisorEntries = [],
  managerExpenses = [],
  organizationEntries = [],
  contractorEntries = [],
}) {
  const [selectedStage, setSelectedStage] = useState(PROJECT_STAGES[0])
  const [activeSubTab, setActiveSubTab] = useState('summary') // 'summary' (2A) or 'detail' (2B)

  const stageData = useMemo(() => {
    return calculateProjectStageReport({
      selectedStage,
      sites,
      siteSupervisorEntries,
      managerExpenses,
      organizationEntries,
      contractorEntries,
    })
  }, [selectedStage, sites, siteSupervisorEntries, managerExpenses, organizationEntries, contractorEntries])

  const handleExportCSV = () => {
    if (activeSubTab === 'summary') {
      const rows = stageData.stageSiteSummary.map((s) => [
        s.siteName,
        s.location,
        s.currentStage,
        s.isCurrentlyInStage ? 'Active In Stage' : 'Completed / Previous',
        s.entriesCount,
        s.spentInStage,
        s.siteBudget,
      ])
      exportToCSV(`Stage_Summary_${selectedStage}`, ['Site Name', 'Location', 'Current Stage', 'Stage Status', 'Entries Count', 'Stage Outflow (INR)', 'Total Site Budget (INR)'], rows)
    } else {
      const rows = stageData.detailedEntries.map((e) => [
        e.date || e.createdAt,
        e.siteName || e.siteId || 'Site',
        e.supervisorName || 'Supervisor',
        e.totalLabourAmount || 0,
        e.totalMaterialAmount || 0,
        (e.foodAllowance || 0) + (e.transportAmount || 0),
        e.totalAmount || 0,
      ])
      exportToCSV(`Stage_Details_${selectedStage}`, ['Date', 'Site', 'Supervisor', 'Labour (INR)', 'Materials (INR)', 'Food/Fuel (INR)', 'Total Amount (INR)'], rows)
    }
  }

  const handlePrintPDF = () => {
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Project Stage Expenditure Audit: ${selectedStage}</h2>
        <p style="margin: 4px 0; color: #475569;">Active Sites in Stage: <strong>${stageData.sitesCountInStage}</strong> | Total Cumulative Stage Burn: <strong>${money(stageData.grandStageSpend)}</strong></p>
      </div>

      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1; background: #eff6ff; padding: 10px; border-radius: 8px;">
          <small style="color: #1e40af; font-weight: bold;">STAGE LABOUR</small>
          <div style="font-size: 16px; font-weight: bold; color: #1e3a8a;">${money(stageData.stageTotalLabour)}</div>
        </div>
        <div style="flex: 1; background: #f0fdf4; padding: 10px; border-radius: 8px;">
          <small style="color: #166534; font-weight: bold;">STAGE MATERIALS</small>
          <div style="font-size: 16px; font-weight: bold; color: #14532d;">${money(stageData.stageTotalMaterial)}</div>
        </div>
        <div style="flex: 1; background: #0B3470; color: white; padding: 10px; border-radius: 8px;">
          <small style="color: #93c5fd; font-weight: bold;">TOTAL STAGE OUTFLOW</small>
          <div style="font-size: 16px; font-weight: bold;">${money(stageData.grandStageSpend)}</div>
        </div>
      </div>

      <h3 style="color: #0f172a; margin-top: 16px;">Site-wise Breakdown in ${selectedStage} Stage</h3>
      <table>
        <thead>
          <tr>
            <th>Site / Project</th>
            <th>Location</th>
            <th>Stage Status</th>
            <th>Stage Outflow</th>
            <th>Site Total Budget</th>
          </tr>
        </thead>
        <tbody>
          ${stageData.stageSiteSummary.map((s) => `
            <tr>
              <td><strong>${s.siteName}</strong></td>
              <td>${s.location}</td>
              <td>${s.isCurrentlyInStage ? '<span style="color: green; font-weight: bold;">Currently In Stage</span>' : 'Past Stage / Milestone'}</td>
              <td><strong>${money(s.spentInStage)}</strong></td>
              <td>${money(s.siteBudget)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printReport(`Stage Report - ${selectedStage}`, content)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Controls & Stage Selector Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-widest block">
              Module 2 · Stage Analytics
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Project Stage Expenses Hub
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect construction milestones from Foundation to Finishing and track stage-specific expenditure burn.
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
              🖨️ Print Stage PDF
            </button>
          </div>
        </div>

        {/* Stage Selector Pills */}
        <div className="space-y-1.5 pt-3 border-t border-slate-100">
          <label className="block text-[11px] font-bold text-slate-600">Select Construction Stage</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PROJECT_STAGES.map((stg) => (
              <button
                key={stg}
                type="button"
                onClick={() => setSelectedStage(stg)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedStage === stg
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {stg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stage KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Sites in {selectedStage}</span>
          <strong className="text-2xl font-extrabold text-slate-900 block font-mono">{stageData.sitesCountInStage}</strong>
          <small className="text-[11px] text-slate-400">Active sites in this milestone</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Stage Labour Outflow</span>
          <strong className="text-2xl font-extrabold text-blue-700 font-mono block">{money(stageData.stageTotalLabour)}</strong>
          <small className="text-[11px] text-slate-400">Headcount & wages in this stage</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Stage Materials</span>
          <strong className="text-2xl font-extrabold text-emerald-700 font-mono block">{money(stageData.stageTotalMaterial)}</strong>
          <small className="text-[11px] text-slate-400">Stage specific procurement</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-[#0B3470]">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Stage Outflow</span>
          <strong className="text-2xl font-extrabold text-[#0B3470] font-mono block">{money(stageData.grandStageSpend)}</strong>
          <small className="text-[11px] text-slate-400">Across all portfolio sites</small>
        </div>
      </div>

      {/* Sub-Reports Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('summary')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'summary' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          2A. Project Stage Site Summary
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('detail')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'detail' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          2B. Stage Itemized Expense Entries
        </button>
      </div>

      {/* 2A. Project Stage Site Summary View */}
      {activeSubTab === 'summary' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Site / Project</th>
                  <th className="p-3.5">Location</th>
                  <th className="p-3.5 text-center">Stage Status</th>
                  <th className="p-3.5 text-center">Entries</th>
                  <th className="p-3.5 text-right">Stage Outflow</th>
                  <th className="p-3.5 text-right">Total Site Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageData.stageSiteSummary.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                      No sites recorded with expenses or activity in the {selectedStage} stage.
                    </td>
                  </tr>
                ) : (
                  stageData.stageSiteSummary.map((s, idx) => (
                    <tr key={s.siteId || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <strong className="text-slate-900 block text-xs">{s.siteName}</strong>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {s.siteId}</span>
                      </td>
                      <td className="p-3.5 text-slate-600">{s.location}</td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            s.isCurrentlyInStage
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {s.isCurrentlyInStage ? 'Active In Stage' : 'Past Milestone'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-semibold text-slate-600">{s.entriesCount}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-[#0B3470]">
                        {money(s.spentInStage)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-700">{money(s.siteBudget)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2B. Detailed Stage Ledger View */}
      {activeSubTab === 'detail' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Site / Project</th>
                  <th className="p-3.5">Supervisor</th>
                  <th className="p-3.5 text-right">Labour (₹)</th>
                  <th className="p-3.5 text-right">Materials (₹)</th>
                  <th className="p-3.5 text-right">Food & Fuel (₹)</th>
                  <th className="p-3.5 text-right">Total Outflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageData.detailedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-xs">
                      No granular entries logged for the {selectedStage} stage.
                    </td>
                  </tr>
                ) : (
                  stageData.detailedEntries.map((e, idx) => (
                    <tr key={e.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">{formatDateDisplay(e.date || e.createdAt)}</td>
                      <td className="p-3.5 font-bold text-slate-800">{e.siteName || e.siteId || 'Site'}</td>
                      <td className="p-3.5 text-slate-600">{e.supervisorName || 'Supervisor'}</td>
                      <td className="p-3.5 text-right font-mono text-slate-700">{money(e.totalLabourAmount || 0)}</td>
                      <td className="p-3.5 text-right font-mono text-emerald-700">{money(e.totalMaterialAmount || 0)}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600">
                        {money((e.foodAllowance || 0) + (e.transportAmount || 0))}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-[#0B3470]">
                        {money(e.totalAmount || 0)}
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
