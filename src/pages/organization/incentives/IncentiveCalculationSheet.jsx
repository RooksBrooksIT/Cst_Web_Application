import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  Users,
  Clock,
  Sparkles,
  TrendingUp,
  Save,
  HelpCircle,
  FileCheck,
  ShieldCheck,
} from 'lucide-react'
import {
  fetchStageScheduleAndActual,
  saveSupervisorIncentive,
} from '../../../services/incentiveService.js'
import {
  calculateLabourActualTotal,
  calculateSavings,
  calculateIncentive,
  isStageRequestAvailable,
} from '../../../services/expenseService.js'
import Modal from '../../../components/common/Modal'

function formatMoney(amount) {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num)
}

/**
 * Screen 2: Incentive Calculation & Approval Sheet
 * Implements incentive_calculation_sheet.dart specification from incentive_flow.txt
 */
export default function IncentiveCalculationSheet({
  orgId,
  siteId,
  supervisor,
  projectStage,
  projectName = '',
  onBack,
  onSaved,
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successData, setSuccessData] = useState(null)

  // Stage Data State
  const [stageData, setStageData] = useState(null)

  // Interactive Slider State (Default: 10% as per Section 3.3 Item 3)
  const [incentivePercentage, setIncentivePercentage] = useState(10)
  const [hasModified, setHasModified] = useState(false)
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false)

  // Fetch Stage Schedule & Actual data
  useEffect(() => {
    let isCancelled = false
    async function loadData() {
      setLoading(true)
      setErrorMessage('')
      try {
        const data = await fetchStageScheduleAndActual(orgId, siteId, projectStage)
        if (!isCancelled) {
          setStageData(data)
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[IncentiveCalculationSheet] Fetch error:', err)
          setErrorMessage('Failed to load stage schedule or actual records. Please try again.')
        }
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }

    if (orgId && siteId && projectStage) {
      loadData()
    }
    return () => {
      isCancelled = true
    }
  }, [orgId, siteId, projectStage])

  // Computed Financial Values
  const approvedTotal = stageData?.approvedTotal || 0
  const requestedTotal = stageData?.requestedTotal || 0
  const actualTotal = stageData?.actualTotal || 0
  const savedAmount = stageData?.savedAmount || 0

  // Live preview of Incentive Amount
  // Formula: savedAmount * (percentage / 100)
  const calculatedIncentive = useMemo(() => {
    return calculateIncentive(savedAmount, incentivePercentage)
  }, [savedAmount, incentivePercentage])

  // Guard check: Section 3.3 Item 3 & Section 6 Edge Case 2
  // If requestedDays == 0 || approvedDays == 0 || actualDays == 0
  const isAvailable = stageData?.isAvailable ?? false

  function handleSliderChange(val) {
    const parsed = Math.min(100, Math.max(0, Number(val) || 0))
    setIncentivePercentage(parsed)
    setHasModified(true)
  }

  function handleBackClick() {
    if (hasModified && !saveSuccess) {
      setShowExitConfirmModal(true)
    } else {
      onBack()
    }
  }

  // Save & Confirmation Flow (_save)
  // Matches incentive_flow.txt Section 3.3 Item 4 & Section 4.2
  async function handleSave() {
    setErrorMessage('')

    // Pre-save validation: Check if amountToAdd <= 0
    if (calculatedIncentive <= 0) {
      setErrorMessage('Incentive amount must be greater than 0')
      return
    }

    setSaving(true)
    try {
      const result = await saveSupervisorIncentive(orgId, {
        siteId,
        projectName: projectName || siteId,
        projectStage,
        supervisor,
        actualTotal,
        approvedTotal,
        requestedTotal,
        savedAmount,
        incentivePercentage,
        amountToAdd: calculatedIncentive,
      })

      setSaveSuccess(true)
      setHasModified(false)
      setSuccessData(result)

      if (onSaved) {
        onSaved(result)
      }
    } catch (err) {
      console.error('[IncentiveCalculationSheet] Save error:', err)
      setErrorMessage(err.message || 'Failed to save supervisor incentive. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0B3470] border border-blue-200 flex items-center justify-center mx-auto animate-spin">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Loading Stage Financials & Labour Log...</h3>
        <p className="text-xs text-slate-500">Querying planned schedule and actual site deployment for {projectStage}</p>
      </div>
    )
  }

  // GUARD: Missing Schedule or Actual Submissions
  // Section 3.3 Item 3: "Request is not available for this site."
  if (!isAvailable) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Selection</span>
          </button>
        </div>

        <div className="bg-white rounded-3xl p-10 border border-amber-200 text-center max-w-2xl mx-auto shadow-xs space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-amber-100 text-amber-800">
              Stage Prerequisite Incomplete
            </span>
            <h2 className="text-xl font-extrabold text-slate-900">Request is not available for this site.</h2>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Both an approved stage labor schedule (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono">reqDays &gt; 0, appDays &gt; 0</code>) and confirmed actual field logs (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono">actDays &gt; 0</code>) are required before calculating supervisor incentives.
            </p>
          </div>

          {/* Diagnostic status cards */}
          <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto text-left pt-2">
            <div className={`p-3 rounded-xl border ${stageData?.reqDays > 0 ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              <span className="text-[10px] uppercase font-bold block">Requested</span>
              <strong className="text-sm font-extrabold">{stageData?.reqDays || 0} Days</strong>
            </div>
            <div className={`p-3 rounded-xl border ${stageData?.appDays > 0 ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              <span className="text-[10px] uppercase font-bold block">Approved</span>
              <strong className="text-sm font-extrabold">{stageData?.appDays || 0} Days</strong>
            </div>
            <div className={`p-3 rounded-xl border ${stageData?.actDays > 0 ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              <span className="text-[10px] uppercase font-bold block">Actual Taken</span>
              <strong className="text-sm font-extrabold">{stageData?.actDays || 0} Days</strong>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 rounded-xl bg-[#0B3470] text-white text-xs font-bold hover:bg-blue-900 transition cursor-pointer"
            >
              Choose Another Stage or Site
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Actions & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer"
            title="Back to selection"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Stage Cost & Labour Sheet</p>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Supervisor Incentive Evaluation</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Saved to Ledger</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || calculatedIncentive <= 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-md ${
                saving || calculatedIncentive <= 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Recording Payout...' : 'Approve & Save Incentive'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 text-xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-rose-500 hover:text-rose-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Success Banner */}
      {saveSuccess && (
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Data saved successfully</span>
          </div>
          <p className="text-xs text-emerald-800">
            Audit record <code className="font-mono bg-emerald-100/70 px-1 py-0.5 rounded">{successData?.docId}</code> has been written to <code className="font-mono">siteSupervisorIncentives</code> and cumulative expenses in <code className="font-mono">totalSiteExpensesPerDay/{siteId}</code> have been updated atomically.
          </p>
        </div>
      )}

      {/* Header Info Cards: Site ID, Stage, Supervisor, Duration Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Site & Project Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Construction Site</span>
          <strong className="text-base font-extrabold text-slate-900 block truncate">{siteId}</strong>
          <small className="text-xs text-slate-500 block truncate">{projectName || siteId}</small>
        </div>

        {/* Project Stage Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Evaluated Stage</span>
          <strong className="text-base font-extrabold text-slate-900 block truncate">{projectStage}</strong>
          <small className="text-xs text-slate-500 block truncate">Milestone Labour Execution</small>
        </div>

        {/* Supervisor Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Site Supervisor</span>
          <strong className="text-base font-extrabold text-[#0B3470] block truncate">{supervisor}</strong>
          <small className="text-xs text-slate-500 block truncate">Field In-charge & Recipient</small>
        </div>
      </div>

      {/* Duration Badges: Requested | Approved | Actual */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-bold text-slate-700 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-slate-500" />
          <span>Stage Duration Lifecycle:</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 font-semibold text-slate-700">
            Requested: <strong className="text-slate-900">{stageData.reqDays} Days</strong>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 font-semibold text-blue-800">
            Approved: <strong className="text-blue-950">{stageData.appDays} Days</strong>
          </span>
          <span className={`px-3 py-1.5 rounded-xl border font-semibold ${
            stageData.actDays <= stageData.appDays
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            Actual: <strong className="font-extrabold">{stageData.actDays} Days</strong>
            {stageData.actDays < stageData.appDays && (
              <span className="ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                Saved {stageData.appDays - stageData.actDays}d
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Labour Comparison Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0B3470]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Labour Deployment Comparison Table</h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            {stageData.comparisonGrid.length} Trade Categories
          </span>
        </div>

        {stageData.comparisonGrid.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No specific labour breakdown records registered for this stage.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5">Labour Designation / Trade</th>
                  <th className="py-3 px-4 text-center">Requested Count</th>
                  <th className="py-3 px-4 text-center">Approved Count</th>
                  <th className="py-3 px-4 text-center">Actual Deployed</th>
                  <th className="py-3 px-4 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {stageData.comparisonGrid.map((row) => {
                  const diff = row.appCount - row.actCount
                  return (
                    <tr key={row.labourType} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-5 font-bold text-slate-900">{row.labourType}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">{row.reqCount}</td>
                      <td className="py-3 px-4 text-center font-bold text-blue-700">{row.appCount}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">{row.actCount}</td>
                      <td className="py-3 px-4 text-right">
                        {diff > 0 ? (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
                            -{diff} deployed (Savings)
                          </span>
                        ) : diff < 0 ? (
                          <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full text-[11px]">
                            +{Math.abs(diff)} deployed
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Estimated Payment */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estimated Budget</span>
          <strong className="text-2xl font-black text-slate-800 block mt-2">
            {formatMoney(requestedTotal)}
          </strong>
          <small className="text-[11px] text-slate-400 mt-1 block">Requested by supervisor</small>
        </div>

        {/* Card 2: Approved Payment */}
        <div className="bg-white p-5 rounded-2xl border border-blue-200/80 bg-blue-50/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Approved Budget</span>
          <strong className="text-2xl font-black text-[#0B3470] block mt-2">
            {formatMoney(approvedTotal)}
          </strong>
          <small className="text-[11px] text-blue-600/80 mt-1 block">Sanctioned ceiling</small>
        </div>

        {/* Card 3: Actual Payment */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Actual Incurred</span>
            <span className="text-[10px] text-slate-400 font-mono">
              {stageData.actDays}d × {formatMoney(stageData.actPayment)}
            </span>
          </div>
          <strong className="text-2xl font-black text-slate-900 block mt-2">
            {formatMoney(actualTotal)}
          </strong>
          <small className="text-[11px] text-slate-400 mt-1 block">Field payment logged</small>
        </div>

        {/* Card 4: Savings Amount (Highlighted in Emerald Green) */}
        <div className="bg-emerald-50/70 p-5 rounded-2xl border-2 border-emerald-300 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Net Savings Achieved</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-200/80 text-emerald-900">
              {savedAmount > 0 ? 'Surplus' : 'No Savings'}
            </span>
          </div>
          <strong className="text-2xl font-black text-emerald-700 block mt-2">
            {formatMoney(savedAmount)}
          </strong>
          <small className="text-[11px] text-emerald-800 font-medium mt-1 block">
            {savedAmount > 0 ? 'Approved budget − Actual cost' : 'Cost reached or exceeded approved budget'}
          </small>
        </div>
      </div>

      {/* Edge Case Warning: Cost Overrun or Zero Savings */}
      {savedAmount <= 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong>Cost Overrun / No Budget Savings:</strong> The actual stage expenditure ({formatMoney(actualTotal)}) met or exceeded the approved budget ({formatMoney(approvedTotal)}). As per business rules, savings cannot be negative and no performance incentive can be authorized for this stage.
          </div>
        </div>
      )}

      {/* Interactive Incentive Slider Card */}
      <div className={`p-6 md:p-8 rounded-3xl border shadow-xs space-y-6 transition-all ${
        savedAmount > 0 ? 'bg-white border-blue-200' : 'bg-slate-50 border-slate-200 opacity-80'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-[#0B3470]" />
              <h3 className="text-base font-extrabold text-slate-900">Interactive Incentive Percentage Slider</h3>
            </div>
            <p className="text-xs text-slate-500">
              Select the incentive percentage share (0% to 100%) to award the supervisor from the achieved savings.
            </p>
          </div>

          {/* Incentive Payout Highlight Badge */}
          <div className="bg-[#0B3470] text-white px-5 py-3 rounded-2xl shadow-md text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-blue-200 block">Supervisor Payout</span>
            <strong className="text-2xl font-black block tracking-tight">
              {formatMoney(calculatedIncentive)}
            </strong>
          </div>
        </div>

        {/* Slider Controls */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Incentive Percentage</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                disabled={savedAmount <= 0}
                value={incentivePercentage}
                onChange={(e) => handleSliderChange(e.target.value)}
                className="w-16 px-2.5 py-1 text-center font-extrabold text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B3470] bg-white"
              />
              <span className="text-slate-600">%</span>
            </div>
          </div>

          {/* Range Slider Track */}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            disabled={savedAmount <= 0}
            value={incentivePercentage}
            onChange={(e) => handleSliderChange(e.target.value)}
            className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B3470] disabled:cursor-not-allowed"
          />

          {/* Quick preset buttons */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
            <span>0%</span>
            <div className="flex gap-2">
              {[5, 10, 15, 20, 25, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={savedAmount <= 0}
                  onClick={() => handleSliderChange(preset)}
                  className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                    incentivePercentage === preset
                      ? 'bg-[#0B3470] text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
            <span>100%</span>
          </div>
        </div>

        {/* Calculation Details Footnote */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-slate-400 text-[10px] block uppercase font-bold">Calculation Breakdown</span>
            <span>
              {formatMoney(savedAmount)} (Savings) × {incentivePercentage}% = <strong className="text-slate-900">{formatMoney(calculatedIncentive)}</strong>
            </span>
          </div>
          <div className="text-slate-500 text-[11px]">
            Recipient: <strong className="text-[#0B3470]">{supervisor}</strong>
          </div>
        </div>
      </div>

      {/* Footer Save & Back Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={handleBackClick}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          ← Back to Site Selection
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || calculatedIncentive <= 0}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-md ${
            saving || calculatedIncentive <= 0
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
          }`}
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Recording Payout...' : 'Approve & Save Incentive'}</span>
        </button>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      {showExitConfirmModal && (
        <Modal
          isOpen={showExitConfirmModal}
          onClose={() => setShowExitConfirmModal(false)}
          title="Discard Unsaved Incentive?"
          subtitle="You have adjusted the incentive percentage but haven't saved it to the ledger."
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-xs text-slate-600">
            <p>
              Leaving now will discard the current incentive calculation of <strong className="text-slate-900">{formatMoney(calculatedIncentive)}</strong> for {supervisor}.
            </p>
            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirmModal(false)
                  onBack()
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                Discard & Leave
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
