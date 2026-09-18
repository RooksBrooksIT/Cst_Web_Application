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
    <div className="space-y-6">
      {/* Top Controls & Stage Selector */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Module 2 · Stage Analytics</span>
            <h2 className="text-xl font-extrabold text-slate-900">Project Stage Expenses Hub</h2>
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
              🖨️ Print Stage PDF
            </button>
          </div>
        </div>

        {/* Stage Selector Pills */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <label className="block text-[11px] font-bold text-slate-600">Select Construction Stage</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {PROJECT_STAGES.map((stg) => (
              <button
                key={stg}
                type="button"
                onClick={() => setSelectedStage(stg)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedStage === stg
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {stg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stage KPI Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Sites in {selectedStage}</span>
          <strong className="text-2xl font-black text-slate-900 block">{stageData.sitesCountInStage}</strong>
          <small className="text-[10px] text-slate-400">Active sites in this milestone</small>
        </div>
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-700 uppercase">Stage Labour Outflow</span>
          <strong className="text-xl font-bold text-blue-900 block">{money(stageData.stageTotalLabour)}</strong>
          <small className="text-[10px] text-blue-600">Headcount & daily wages</small>
        </div>
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-700 uppercase">Stage Materials</span>
          <strong className="text-xl font-bold text-emerald-900 block">{money(stageData.stageTotalMaterial)}</strong>
          <small className="text-[10px] text-emerald-600">Stage specific procurement</small>
        </div>
        <div className="p-4 rounded-2xl bg-[#0B3470] text-white border border-blue-900 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-200 uppercase">Total Stage Outflow</span>
          <strong className="text-2xl font-black text-white block">{money(stageData.grandStageSpend)}</strong>
          <small className="text-[10px] text-blue-200">Across all portfolio sites</small>
        </div>
      </div>

      {/* Sub-Reports Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('summary')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'summary' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          2A. Project Stage Site Summary
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('detail')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'detail' ? 'bg-[#0B3470] text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          2B. Stage Itemized Expense Entries
        </button>
      </div>

      {/* 2A. Stage Site Summary View */}
      {activeSubTab === 'summary' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Sites Portfolio in {selectedStage}</h3>
            <span className="text-xs text-slate-500">{stageData.stageSiteSummary.length} total projects</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="p-3">Site / Project</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Current Milestone Stage</th>
                  <th className="p-3 text-center">Stage Status</th>
                  <th className="p-3 text-right">Spent in {selectedStage}</th>
                  <th className="p-3 text-right">Total Site Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageData.stageSiteSummary.map((s) => (
                  <tr key={s.siteId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-bold text-slate-900">{s.siteName}</td>
                    <td className="p-3 text-slate-600">{s.location}</td>
                    <td className="p-3 font-medium text-slate-700">{s.currentStage}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.isCurrentlyInStage ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {s.isCurrentlyInStage ? 'Live in Stage' : 'Milestone Inactive'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-extrabold text-blue-700">{money(s.spentInStage)}</td>
                    <td className="p-3 text-right font-medium text-slate-800">{money(s.siteBudget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2B. Stage Itemized Detail View */}
      {activeSubTab === 'detail' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Itemized Supervisor & Voucher Logs for {selectedStage}</h3>
            <span className="text-xs text-slate-500">{stageData.detailedEntries.length} entries</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Site / Project</th>
                  <th className="p-3">Supervisor</th>
                  <th className="p-3 text-right">Labour</th>
                  <th className="p-3 text-right">Materials</th>
                  <th className="p-3 text-right">Food/Fuel</th>
                  <th className="p-3 text-right">Total Outflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageData.detailedEntries.length === 0 ? (
                  <tr><td colSpan="7" className="p-6 text-center text-slate-400 italic">No detailed supervisor logs found for {selectedStage} stage.</td></tr>
                ) : (
                  stageData.detailedEntries.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-semibold text-slate-900">{formatDateDisplay(e.date || e.createdAt)}</td>
                      <td className="p-3 text-slate-800">{e.siteName || e.siteId || 'Site'}</td>
                      <td className="p-3 text-slate-600">{e.supervisorName || 'Supervisor'}</td>
                      <td className="p-3 text-right text-slate-700">{money(e.totalLabourAmount || e.labourTotal || 0)}</td>
                      <td className="p-3 text-right text-slate-700">{money(e.totalMaterialAmount || e.materialTotal || 0)}</td>
                      <td className="p-3 text-right text-slate-700">{money((parseAmount(e.foodAllowance || 0)) + (parseAmount(e.transportAmount || 0)))}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{money(e.totalAmount || (parseAmount(e.totalLabourAmount || 0) + parseAmount(e.totalMaterialAmount || 0)))}</td>
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
