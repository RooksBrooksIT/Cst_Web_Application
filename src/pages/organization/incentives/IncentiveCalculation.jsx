import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck,
  AlertTriangle,
  FileSpreadsheet,
  IndianRupee,
  Clock,
  History,
  TrendingUp,
} from 'lucide-react'
import {
  fetchIncentiveSiteSupervisorData,
  fetchSupervisorIncentives,
} from '../../../services/incentiveService.js'
import IncentiveCalculationSheet from './IncentiveCalculationSheet'
import DataTable from '../../../components/common/DataTable'
import FilterBar from '../../../components/common/FilterBar'
import ExportButton from '../../../components/common/ExportButton'

function formatMoney(amount) {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(val) {
  if (!val) return '—'
  const d = val?.toDate ? val.toDate() : new Date(val)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

/**
 * Screen 1: Site & Stage Selection (IncentiveCalculation)
 * Implements incentive_calculation.dart specification from incentive_flow.txt Section 3.2
 */
export default function IncentiveCalculation({
  orgId,
  sites = [],
  user,
  onNotify,
}) {
  const navigate = useNavigate()
  const location = useLocation()

  // Form State
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [supervisorName, setSupervisorName] = useState('')
  const [selectedProjectStage, setSelectedProjectStage] = useState('')

  // Loaded Options State
  const [siteIds, setSiteIds] = useState([])
  const [siteSupervisors, setSiteSupervisors] = useState({})
  const [siteProjectStages, setSiteProjectStages] = useState({})
  const [siteMeta, setSiteMeta] = useState({})

  // View Mode: 'form' (Screen 1) or 'sheet' (Screen 2)
  const [activeView, setActiveView] = useState('form')

  // History / Ledger Records
  const [incentiveLedger, setIncentiveLedger] = useState([])
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [loadingLedger, setLoadingLedger] = useState(false)

  // Status & Validation
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState('')
  const [successToast, setSuccessToast] = useState('')

  // 1. Fetch Site Supervisor Data on mount
  // Matches Section 3.2 initState() -> _fetchSiteSupervisorData()
  async function loadInitialData() {
    if (!orgId) return
    setLoading(true)
    setFormError('')
    try {
      const data = await fetchIncentiveSiteSupervisorData(orgId)
      setSiteIds(data.siteIds)
      setSiteSupervisors(data.siteSupervisors)
      setSiteProjectStages(data.siteProjectStages)
      setSiteMeta(data.siteMeta)

      // Auto-select first site if available and none selected
      if (data.siteIds.length > 0 && !selectedSiteId) {
        const firstSite = data.siteIds[0]
        setSelectedSiteId(firstSite)
        setSupervisorName(data.siteSupervisors[firstSite] || '')
        const stages = data.siteProjectStages[firstSite] || []
        if (stages.length > 0) {
          setSelectedProjectStage(stages[0])
        }
      }
    } catch (err) {
      console.error('[IncentiveCalculation] Load error:', err)
      setFormError('Failed to load active sites and supervisors. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  // Load History Ledger
  async function loadLedger() {
    if (!orgId) return
    setLoadingLedger(true)
    try {
      const list = await fetchSupervisorIncentives(orgId)
      setIncentiveLedger(list)
    } catch (err) {
      console.error('[IncentiveCalculation] Ledger fetch error:', err)
    } finally {
      setLoadingLedger(false)
    }
  }

  useEffect(() => {
    loadInitialData()
    loadLedger()
  }, [orgId])

  // Filtered Stages for current Site ID
  // Section 3.2 Item 2.a: Looks up supervisor & filters project stages
  const availableStages = useMemo(() => {
    if (!selectedSiteId) return []
    return siteProjectStages[selectedSiteId] || []
  }, [selectedSiteId, siteProjectStages])

  // On Site Dropdown Changed
  // Section 3.2 Item 2.a onChanged callback triggers:
  // - Sets _selectedSiteId = newValue
  // - Looks up _supervisorName = _siteSupervisors[newValue]
  // - Filters _filteredProjectStages = _siteProjectStages[newValue]
  // - Resets _selectedProjectStage = null (or first stage)
  function handleSiteChange(newSiteId) {
    setSelectedSiteId(newSiteId)
    setFormError('')

    const sup = siteSupervisors[newSiteId] || 'Assigned Supervisor'
    setSupervisorName(sup)

    const stages = siteProjectStages[newSiteId] || []
    if (stages.length > 0) {
      setSelectedProjectStage(stages[0])
    } else {
      setSelectedProjectStage('')
    }
  }

  // Form Validation & Navigation to Screen 2
  // Section 3.2 Item 3 "Calculate" Button:
  // - Executes validation
  // - Pushes to IncentiveCalculationSheet
  function handleCalculate() {
    setFormError('')
    if (!selectedSiteId) {
      setFormError('Please select a Site ID.')
      return
    }
    if (!selectedProjectStage) {
      setFormError('Please select a Project Stage.')
      return
    }

    setActiveView('sheet')
  }

  // "Reset" Button: Clears selections and resets form state
  // Section 3.2 Item 3
  function handleReset() {
    if (siteIds.length > 0) {
      const firstSite = siteIds[0]
      setSelectedSiteId(firstSite)
      setSupervisorName(siteSupervisors[firstSite] || '')
      const stages = siteProjectStages[firstSite] || []
      setSelectedProjectStage(stages.length > 0 ? stages[0] : '')
    } else {
      setSelectedSiteId('')
      setSupervisorName('')
      setSelectedProjectStage('')
    }
    setFormError('')
  }

  // "Cancel" Button: Pops back
  function handleCancel() {
    navigate(-1)
  }

  function handleSheetSaved(result) {
    setSuccessToast(`Incentive successfully recorded for ${supervisorName}!`)
    loadLedger()
    setTimeout(() => {
      setSuccessToast('')
    }, 6000)
  }

  // Columns for the Audit History Table
  const historyColumns = [
    {
      key: 'siteId',
      title: 'Site Code',
      render: (val, r) => (
        <div>
          <span className="font-extrabold text-slate-900 block">{val}</span>
          <span className="text-[11px] text-slate-400 block truncate">{r.projectName || val}</span>
        </div>
      ),
    },
    {
      key: 'projectStage',
      title: 'Project Stage',
      render: (val) => <span className="font-bold text-blue-700">{val}</span>,
    },
    {
      key: 'supervisorName',
      title: 'Supervisor',
      render: (val) => <span className="font-semibold text-slate-800">{val}</span>,
    },
    {
      key: 'approvedAmount',
      title: 'Approved Budget',
      render: (val) => <span className="text-slate-600 font-medium">{formatMoney(val)}</span>,
    },
    {
      key: 'actualAmount',
      title: 'Actual Cost',
      render: (val) => <span className="text-slate-700 font-medium">{formatMoney(val)}</span>,
    },
    {
      key: 'savedAmount',
      title: 'Savings Achieved',
      render: (val) => (
        <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
          {formatMoney(val)}
        </span>
      ),
    },
    {
      key: 'incentivePercentage',
      title: 'Rate',
      render: (val) => <span className="font-bold text-slate-700">{val}%</span>,
    },
    {
      key: 'incentiveAmount',
      title: 'Payout Amount',
      render: (val) => (
        <strong className="text-emerald-700 font-black text-sm block">
          {formatMoney(val)}
        </strong>
      ),
    },
    {
      key: 'updatedAt',
      title: 'Recorded On',
      render: (val) => <span className="text-slate-400 text-xs">{formatDate(val)}</span>,
    },
  ]

  // If Screen 2 is active, render IncentiveCalculationSheet
  if (activeView === 'sheet') {
    return (
      <IncentiveCalculationSheet
        orgId={orgId}
        siteId={selectedSiteId}
        supervisor={supervisorName}
        projectStage={selectedProjectStage}
        projectName={siteMeta[selectedSiteId]?.projectName || selectedSiteId}
        onBack={() => setActiveView('form')}
        onSaved={handleSheetSaved}
      />
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 text-[#0B3470]">
              Performance & Labor Cost Engine
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Mobile & Web Synchronized</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2.5">
            <Award className="w-7 h-7 text-[#0B3470]" />
            <span>Site Supervisor Incentive Calculation</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Evaluate project stage labour efficiency, calculate cost savings against approved labor ceilings, and award verified incentive bonuses to Site Supervisors with atomic project financial rollup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              loadInitialData()
              loadLedger()
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast('')}
            className="text-emerald-700 font-bold hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Message Alert */}
      {formError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-semibold">{formError}</span>
        </div>
      )}

      {/* Main Calculation Setup Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SCREEN 1 FORM: Parameters Selection Card */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 md:p-8 border border-slate-200/90 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Form Parameters</span>
            <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">Select Site & Construction Stage</h2>
            <p className="text-xs text-slate-500">
              The supervisor in charge will be auto-resolved, and stage options are filtered specifically to the selected site.
            </p>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto" />
              <p>Loading active site supervisor directory from Firestore...</p>
            </div>
          ) : siteIds.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">No Active Sites Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No sites with supervisor entries were detected in the database. Ensure daily site logs or stage schedules are registered.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleCalculate()
              }}
              className="space-y-5"
            >
              {/* Field 1: Site ID Dropdown */}
              {/* Section 3.2 Item 2.a: Site ID Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Site ID / Code *</span>
                  <span className="text-[11px] font-normal text-slate-400">{siteIds.length} Active Sites</span>
                </label>
                <select
                  value={selectedSiteId}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  className="w-full px-4 py-3 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B3470] bg-white text-slate-900"
                >
                  {siteIds.map((sId) => {
                    const meta = siteMeta[sId]
                    return (
                      <option key={sId} value={sId}>
                        {sId} {meta?.siteName && meta.siteName !== sId ? `— ${meta.siteName}` : ''}
                      </option>
                    )
                  })}
                </select>
                <p className="text-[11px] text-slate-400">
                  Selecting a Site ID queries associated stage labor schedules and actual logs.
                </p>
              </div>

              {/* Field 2: Supervisor Name (Read-Only Auto-Populated) */}
              {/* Section 3.2 Item 2.b: Read-only TextFormField displaying _supervisorName */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Site Supervisor Name</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Auto-Resolved
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={supervisorName || 'No supervisor assigned'}
                    className="w-full px-4 py-3 pl-10 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none cursor-not-allowed"
                  />
                  <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
                <p className="text-[11px] text-slate-400">
                  Automatically populated from site supervisor records to eliminate manual entry errors.
                </p>
              </div>

              {/* Field 3: Project Stage Dropdown */}
              {/* Section 3.2 Item 2.c: Populated only with stages relevant to the selected site */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Project Stage *</span>
                  <span className="text-[11px] font-normal text-slate-400">{availableStages.length} Stages Available</span>
                </label>
                <select
                  value={selectedProjectStage}
                  onChange={(e) => setSelectedProjectStage(e.target.value)}
                  className="w-full px-4 py-3 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B3470] bg-white text-slate-900"
                >
                  {availableStages.map((stg) => (
                    <option key={stg} value={stg}>
                      {stg}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  Calculates savings between approved labor ceiling and actual costs for this milestone.
                </p>
              </div>

              {/* Form Action Buttons: Calculate, Reset, Cancel */}
              {/* Section 3.2 Item 3 */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Reset Form
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0B3470] hover:bg-blue-900 active:scale-98 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  <span>Calculate Incentive</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Info / Rules Summary Card */}
        <div className="space-y-5">
          <div className="bg-[#0B3470] text-white rounded-3xl p-6 shadow-md space-y-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">How Incentives Work</h3>
              <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                Rewards site supervisors when a stage is finished under the approved labour budget ceiling.
              </p>
            </div>

            <div className="space-y-3 pt-2 text-xs border-t border-white/15">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/20 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span><strong>Actual Cost:</strong> <code className="bg-white/10 px-1 py-0.5 rounded font-mono">actDays × actPayment</code></span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/20 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span><strong>Net Savings:</strong> <code className="bg-white/10 px-1 py-0.5 rounded font-mono">max(approved − actual, 0)</code></span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/20 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span><strong>Bonus Payout:</strong> <code className="bg-white/10 px-1 py-0.5 rounded font-mono">savings × (percentage / 100)</code></span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/20 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                <span><strong>Atomic Rollup:</strong> Synced to <code className="bg-white/10 px-1 py-0.5 rounded font-mono">totalSiteExpensesPerDay</code> & <code className="bg-white/10 px-1 py-0.5 rounded font-mono">projects</code> balance</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Database Consistency</span>
            <h4 className="text-xs font-bold text-slate-800">Shared Mobile & Web Firestore Ledger</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Every authorized bonus writes an immutable audit record to <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">siteSupervisorIncentives</code> and immediately updates project balance.
            </p>
          </div>
        </div>
      </div>

      {/* Audit History / Previous Authorized Incentives Section */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#0B3470]" />
              <h2 className="text-lg font-black text-slate-900">Authorized Supervisor Incentives Audit Trail</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical supervisor performance incentives logged in <code className="font-mono text-slate-700">siteSupervisorIncentives</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ExportButton
              filename="siteSupervisorIncentives_ledger"
              headers={[
                { key: 'siteId', label: 'Site Code' },
                { key: 'projectName', label: 'Project Name' },
                { key: 'projectStage', label: 'Project Stage' },
                { key: 'supervisorName', label: 'Supervisor' },
                { key: 'approvedAmount', label: 'Approved Budget' },
                { key: 'actualAmount', label: 'Actual Cost' },
                { key: 'savedAmount', label: 'Savings' },
                { key: 'incentivePercentage', label: 'Incentive %' },
                { key: 'incentiveAmount', label: 'Incentive Payout' },
              ]}
              data={incentiveLedger}
              title="Supervisor Incentives Audit Ledger"
            />
          </div>
        </div>

        <FilterBar
          searchQuery={ledgerSearch}
          onSearchChange={setLedgerSearch}
          placeholder="Search by Site ID, Stage, or Supervisor Name..."
        />

        <DataTable
          columns={historyColumns}
          data={incentiveLedger}
          searchQuery={ledgerSearch}
          emptyMessage="No supervisor incentive payouts have been recorded yet."
        />
      </div>
    </div>
  )
}
