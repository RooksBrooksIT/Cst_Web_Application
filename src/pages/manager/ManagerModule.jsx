import { useState, useMemo, useRef, useEffect } from 'react'
import { Link, NavLink, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useManagerDashboard } from '../../hooks/useManagerDashboard'
import { useNotifications } from '../../context/NotificationContext'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import FilterBar from '../../components/common/FilterBar'
import ExportButton from '../../components/common/ExportButton'
import logo from '../../assets/logo/FinalLogo.jpg'

// Services
import { createProject, updateProject, DEFAULT_PROJECT_STAGES } from '../../services/projectService'
import { createMaterialRequest, approveMaterialRequest, recordGrnReceipt } from '../../services/materialService'
import { recordPettyCashExpense, createPettyCashRequest, disbursePettyCashRequest } from '../../services/pettyCashService'
import { recordWorkerAttendance, createWorker, WORKER_SKILLS } from '../../services/workforceService'
import { createContractor, createContractorBill, updateContractorBillStatus, CONTRACTOR_TRADES } from '../../services/contractorService'
import { allocateTool, createTool } from '../../services/toolService'
import { createVehicle, recordFuelLog, VEHICLE_TYPES } from '../../services/fleetService'
import { createQualityChecklist, recordSafetyIncident, INSPECTION_TYPES } from '../../services/qualityService'
import { createCustomerInvoice, recordCustomerPayment } from '../../services/invoiceService'
import { createDailySiteLog, reviewDailySiteLog, WEATHER_TYPES } from '../../services/dailyLogService'
import { executeTier1Review, executeTier3Clearance } from '../../services/approvalService'
import { AVAILABLE_REPORTS, generateReportData } from '../../services/reportService'

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime()) ? 'N/A' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

function ManagerProfileMenu({ user, userData, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const profileName = userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'
  const profileEmail = userData?.Email || userData?.email || user?.email || 'Not available'
  const profileDesignation = userData?.Designation || userData?.designation || 'Project Manager'
  const profileDept = userData?.Department || userData?.department || 'Operations'
  const profileId = userData?.ManagerId || userData?.managerId || 'MG-001'

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 transition-all text-left"
      >
        <span className="w-8 h-8 rounded-lg bg-[#0B3470] text-white font-bold text-xs flex items-center justify-center shadow-xs">
          {profileName.slice(0, 2).toUpperCase()}
        </span>
        <div className="hidden sm:block pr-2">
          <strong className="block text-xs font-semibold text-slate-800">{profileName}</strong>
          <small className="block text-[10px] text-slate-500">{profileDesignation}</small>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 space-y-3 z-50 animate-fade-in">
          <div className="border-b border-slate-100 pb-2">
            <strong className="block text-xs font-bold text-slate-900">{profileName}</strong>
            <small className="text-[11px] text-blue-700 font-semibold">{profileDesignation} · {profileDept}</small>
          </div>
          <div className="space-y-1.5 text-xs text-slate-700">
            <div><span className="text-slate-400 text-[10px] block">Manager ID:</span><span className="font-mono text-slate-800">{profileId}</span></div>
            <div><span className="text-slate-400 text-[10px] block">Email:</span>{profileEmail}</div>
            <div><span className="text-slate-400 text-[10px] block">Role:</span><span className="text-emerald-700 font-semibold">Operations Manager</span></div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 1. SITE SETUP WIZARD (5 STEPS) - LIGHT MODE
// ------------------------------------------------------------------------------------------------
function SiteSetupWizard({ orgId }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    projectName: '',
    siteCode: '',
    clientName: '',
    clientPhone: '',
    siteLocation: '',
    estimatedBudget: '',
    startDate: new Date().toISOString().split('T')[0],
    estimatedEndDate: '',
    stages: DEFAULT_PROJECT_STAGES,
    supervisors: '',
    pettyCashInitial: '50000',
    selectedTools: ['Concrete Mixer 10/7', 'Vibrator Needle 40mm', 'Total Station'],
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      await createProject(orgId, {
        name: formData.projectName,
        code: formData.siteCode || `PRJ-${Date.now().toString().slice(-4)}`,
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        siteLocation: formData.siteLocation,
        totalBudget: Number(formData.estimatedBudget) || 0,
        startDate: formData.startDate,
        estimatedEndDate: formData.estimatedEndDate,
        stages: formData.stages,
      })
      alert('Site setup completed! Project launched successfully.')
      navigate('/manager/sites')
    } catch (err) {
      alert('Error creating site: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Manager / Setup Wizard</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Project & Site Setup Wizard</h1>
          <p className="text-xs text-slate-500 mt-1">Configure site stages, milestone weights, and initialize spatial allocations.</p>
        </div>
        <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
          Step {step} of 5
        </span>
      </div>

      {/* Wizard Progress Bar */}
      <div className="grid grid-cols-5 gap-2">
        {['Basic Info', 'Stage Milestones', 'Key Materials', 'Field Team', 'Review & Launch'].map((label, idx) => (
          <div key={label} className="space-y-1 text-center">
            <div
              className={`h-2 rounded-full transition-all ${
                step > idx + 1 ? 'bg-emerald-500' : step === idx + 1 ? 'bg-[#0B3470]' : 'bg-slate-200'
              }`}
            />
            <span className="text-[10px] font-semibold text-slate-500 block line-clamp-1">{label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Step 1: Project Identity & Location</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700">
                Project Name *
                <input
                  required
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="e.g. Metro Commercial Complex"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Project Code
                <input
                  value={formData.siteCode}
                  onChange={(e) => setFormData({ ...formData, siteCode: e.target.value })}
                  placeholder="PRJ-2026-042"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700">
                Client / Firm Name
                <input
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  placeholder="Apex Infra Ltd"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Client Phone
                <input
                  value={formData.clientPhone}
                  onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700">
                Site Location
                <input
                  value={formData.siteLocation}
                  onChange={(e) => setFormData({ ...formData, siteLocation: e.target.value })}
                  placeholder="Plot 104, Outer Ring Road"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Total Budget (INR) *
                <input
                  type="number"
                  required
                  value={formData.estimatedBudget}
                  onChange={(e) => setFormData({ ...formData, estimatedBudget: e.target.value })}
                  placeholder="7500000"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
                />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Step 2: Milestone Stages Configuration</h2>
            <div className="space-y-2">
              {formData.stages.map((stg, i) => (
                <div key={stg.stageId} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs">
                    {i + 1}
                  </span>
                  <span className="flex-1 font-semibold text-slate-800">{stg.name}</span>
                  <span className="text-slate-500 font-mono">Stage #{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Step 3: Initial Material Requisitions</h2>
            <p className="text-xs text-slate-500">Standard initial bootstrap materials will be flagged for procurement.</p>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-900">
              <div className="font-semibold">Default Materials Setup:</div>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>OPC 53 Grade Cement — 500 Bags</li>
                <li>Fe 500 TMT Steel 12mm/16mm — 10 Tonnes</li>
                <li>20mm Graded Aggregate Stone — 1,500 CFT</li>
                <li>M-Sand / River Sand — 2,000 CFT</li>
              </ul>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Step 4: Field Team & Supervisor Allocation</h2>
            <label className="block text-xs font-medium text-slate-700">
              Assigned Field Supervisors (Comma separated names)
              <input
                value={formData.supervisors}
                onChange={(e) => setFormData({ ...formData, supervisors: e.target.value })}
                placeholder="e.g. Suresh Patel, Ankit Verma"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Initial Petty Cash Float Allocation (INR)
              <input
                type="number"
                value={formData.pettyCashInitial}
                onChange={(e) => setFormData({ ...formData, pettyCashInitial: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Step 5: Review & Project Launch</h2>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div><span className="text-slate-400">Project Name:</span> <strong className="text-slate-900">{formData.projectName}</strong></div>
              <div><span className="text-slate-400">Total Budget:</span> <strong className="text-emerald-700 font-mono">{money(formData.estimatedBudget)}</strong></div>
              <div><span className="text-slate-400">Site Location:</span> <span className="text-slate-800">{formData.siteLocation}</span></div>
              <div><span className="text-slate-400">Client:</span> <span className="text-slate-800">{formData.clientName}</span></div>
            </div>
          </div>
        )}

        {/* Wizard Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              ← Previous
            </button>
          ) : <div />}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
            >
              Next Step →
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
            >
              {saving ? 'Creating...' : '✓ Launch Project'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 2. DAILY SITE PROGRESS LOGS (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function DailyLogsManager({ orgId, dailyLogs = [], sites = [] }) {
  const [search, setSearch] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleReviewSubmit(e) {
    e.preventDefault()
    if (!orgId || !selectedLog) return
    setSaving(true)
    try {
      await reviewDailySiteLog(orgId, selectedLog.id, 'Operations Manager', reviewNotes)
      setSelectedLog(null)
      alert('Daily site log reviewed and signed off!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      header: 'Date',
      accessor: 'date',
      render: (row) => <span className="font-mono text-blue-700 font-bold">{row.date || 'N/A'}</span>,
    },
    {
      header: 'Site / Location',
      accessor: 'projectName',
      render: (row) => row.projectName || 'Site',
    },
    {
      header: 'Weather',
      accessor: 'weather',
      render: (row) => row.weather || 'Sunny',
    },
    {
      header: 'Workforce Total',
      accessor: 'workforceCount',
      align: 'center',
      render: (row) => <span className="font-bold text-slate-800">{row.workforceCount?.total || 12} workers</span>,
    },
    {
      header: 'Work Summary',
      accessor: 'workDoneSummary',
      render: (row) => <span className="line-clamp-1 text-slate-600">{row.workDoneSummary || 'Daily progress'}</span>,
    },
    {
      header: 'Manager Review',
      accessor: 'managerReviewed',
      align: 'center',
      render: (row) => (
        <StatusBadge status={row.managerReviewed ? 'Reviewed' : 'Pending Review'} />
      ),
    },
    {
      header: 'Action',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setSelectedLog(row)
            setReviewNotes(row.reviewNotes || '')
          }}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          {row.managerReviewed ? 'View' : 'Review →'}
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Manager / Site Logs</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Daily Site Progress Diaries</h1>
          <p className="text-xs text-slate-500 mt-1">Review end-of-day supervisor logs, workforce counts, weather, and photos.</p>
        </div>
        <ExportButton
          filename="daily_site_logs"
          headers={['Date', 'Site', 'Weather', 'Workforce', 'Summary', 'Hindrances', 'Reviewed']}
          data={dailyLogs.map((l) => [
            l.date || '',
            l.projectName || 'Site',
            l.weather || 'Sunny',
            l.workforceCount?.total || 12,
            l.workDoneSummary || '',
            l.hindrances || '',
            l.managerReviewed ? 'Yes' : 'No',
          ])}
          title="Daily Site Progress Logs"
        />
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder="Search logs by site, date, summary..."
      />

      <DataTable
        columns={columns}
        data={dailyLogs}
        searchQuery={search}
        searchFields={['projectName', 'date', 'workDoneSummary', 'weather']}
        emptyMessage="No supervisor daily site logs submitted yet today."
      />

      {/* Review Modal */}
      <Modal isOpen={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} title="Daily Site Log Review & Sign-off">
        {selectedLog && (
          <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Site: <strong className="text-slate-800">{selectedLog.projectName}</strong></span>
                <span className="text-slate-500">Date: <strong className="text-slate-800">{selectedLog.date}</strong></span>
              </div>
              <div><span className="text-slate-500">Weather:</span> <span className="text-slate-800">{selectedLog.weather}</span></div>
              <div>
                <span className="text-slate-500">Workforce Deployed:</span>{' '}
                <strong className="text-blue-700 font-mono">
                  {selectedLog.workforceCount?.masons || 4} Masons, {selectedLog.workforceCount?.helpers || 8} Helpers (Total: {selectedLog.workforceCount?.total || 12})
                </strong>
              </div>
              <div><span className="text-slate-500">Progress Narrative:</span> <p className="text-slate-800 mt-1 font-medium">{selectedLog.workDoneSummary}</p></div>
              <div><span className="text-slate-500">Bottlenecks / Delays:</span> <p className="text-rose-700 mt-1 font-medium">{selectedLog.hindrances || 'None'}</p></div>
            </div>

            <label className="block font-medium text-slate-700">
              Manager Review Comments / Technical Sign-off Notes:
              <textarea
                rows="3"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Verified site photograph and RCC casting progress. Approved."
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
              >
                {saving ? 'Signing...' : '✓ Sign-off Log'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 3. DAILY WORKFORCE MUSTER ROLL (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function WorkforceManager({ orgId, workforce = [], sites = [] }) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    siteId: sites[0]?.id || '',
    roleCategory: 'Masons',
    skillType: 'Skilled',
    headcount: 8,
    shiftHours: 8,
    otHours: 0,
    dailyWageRate: 850,
  })

  async function handleAddEntry(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      const siteObj = sites.find((s) => s.id === formData.siteId)
      await recordWorkerAttendance(orgId, {
        ...formData,
        projectId: formData.siteId,
        projectName: siteObj?.name || siteObj?.projectName || 'Site',
      })
      setIsAddOpen(false)
      alert('Daily attendance muster roll entry saved.')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      header: 'Date',
      accessor: 'date',
      render: (row) => formatDate(row.date || row.createdAt),
    },
    {
      header: 'Site Name',
      accessor: 'projectName',
      render: (row) => row.projectName || row.siteName || 'Site',
    },
    {
      header: 'Trade Category',
      accessor: 'roleCategory',
      render: (row) => <StatusBadge status={row.roleCategory || 'Masons'} />,
    },
    {
      header: 'Headcount',
      accessor: 'headcount',
      align: 'center',
      render: (row) => <span className="font-extrabold text-blue-700">{row.headcount || 1}</span>,
    },
    {
      header: 'Shift / OT',
      accessor: 'shiftHours',
      align: 'center',
      render: (row) => `${row.shiftHours || 8} hrs ${row.otHours ? `(+${row.otHours}h OT)` : ''}`,
    },
    {
      header: 'Daily Rate',
      accessor: 'dailyWageRate',
      align: 'right',
      render: (row) => money(row.dailyWageRate),
    },
    {
      header: 'Total Wage Liability',
      accessor: 'totalWage',
      align: 'right',
      render: (row) => <span className="font-bold text-emerald-700">{money(row.totalWage)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Manager / Workforce</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Daily Muster Roll & Labor Wages</h1>
          <p className="text-xs text-slate-500 mt-1">Log attendance counts, overtime hours, and calculate daily wage liabilities.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            filename="muster_roll"
            headers={['Date', 'Site', 'Trade', 'Headcount', 'Shift Hours', 'OT Hours', 'Daily Rate', 'Total Wage']}
            data={workforce.map((w) => [
              w.date || '',
              w.projectName || w.siteName || 'Site',
              w.roleCategory || 'Masons',
              w.headcount || 1,
              w.shiftHours || 8,
              w.otHours || 0,
              w.dailyWageRate || 0,
              w.totalWage || 0,
            ])}
            title="Workforce Muster Roll Statement"
          />
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
          >
            ＋ Record Muster Roll
          </button>
        </div>
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder="Search attendance by site, trade, date..."
      />

      <DataTable
        columns={columns}
        data={workforce}
        searchQuery={search}
        searchFields={['projectName', 'siteName', 'roleCategory', 'date']}
        emptyMessage="No muster roll attendance logged today."
      />

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Record Daily Labor Attendance">
        <form onSubmit={handleAddEntry} className="space-y-4">
          <label className="block text-xs font-medium text-slate-700">
            Target Site *
            <select
              value={formData.siteId}
              onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.projectName || s.id}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Trade Category
              <select
                value={formData.roleCategory}
                onChange={(e) => setFormData({ ...formData, roleCategory: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              >
                {['Masons', 'Carpenters', 'Barbenders', 'Electricians', 'Plumbers', 'General Helpers / Laborers'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Headcount (Workers) *
              <input
                type="number"
                required
                value={formData.headcount}
                onChange={(e) => setFormData({ ...formData, headcount: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Overtime Hours
              <input
                type="number"
                value={formData.otHours}
                onChange={(e) => setFormData({ ...formData, otHours: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Daily Wage Rate (INR) *
              <input
                type="number"
                required
                value={formData.dailyWageRate}
                onChange={(e) => setFormData({ ...formData, dailyWageRate: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors"
            >
              {saving ? 'Saving...' : '✓ Record Attendance'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 4. MATERIAL INDENTS & INWARD GRN (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function MaterialsProcurement({ orgId, materialRequests = [], materials = [], sites = [] }) {
  const [isGrnOpen, setIsGrnOpen] = useState(false)
  const [selectedIndent, setSelectedIndent] = useState(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    receivedBy: 'Site Storekeeper',
  })

  async function handleApproveIndent(indent) {
    if (!orgId) return
    try {
      await approveMaterialRequest(orgId, indent.id, { name: 'Operations Manager' }, `PO-${Date.now().toString().slice(-4)}`, 'Ultratech Dist.')
      alert('Material indent approved and Purchase Order (PO) issued!')
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function handleGrnSubmit(e) {
    e.preventDefault()
    if (!orgId || !selectedIndent) return
    setSaving(true)
    try {
      await recordGrnReceipt(orgId, selectedIndent.id, formData)
      setIsGrnOpen(false)
      alert('Goods Received Note (GRN) recorded and stock updated!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      header: 'PO / Indent #',
      accessor: 'poNumber',
      render: (row) => <span className="font-mono text-blue-700 font-bold">{row.poNumber || row.id}</span>,
    },
    {
      header: 'Site',
      accessor: 'projectName',
      render: (row) => row.projectName || 'Site',
    },
    {
      header: 'Requested By',
      accessor: 'requestedByName',
      render: (row) => row.requestedByName || 'Supervisor',
    },
    {
      header: 'Urgency',
      accessor: 'urgency',
      align: 'center',
      render: (row) => <StatusBadge status={row.urgency || 'medium'} />,
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status || 'pending'} />,
    },
    {
      header: 'Actions',
      align: 'center',
      render: (row) => {
        const isPending = row.status === 'pending_manager' || row.status === 'pending'
        const isApproved = row.status === 'approved' || row.status === 'ordered'
        if (isPending) {
          return (
            <button
              type="button"
              onClick={() => handleApproveIndent(row)}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800"
            >
              Approve PO ✓
            </button>
          )
        }
        if (isApproved) {
          return (
            <button
              type="button"
              onClick={() => {
                setSelectedIndent(row)
                setIsGrnOpen(true)
              }}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Record GRN ＋
            </button>
          )
        }
        return <span className="text-xs text-slate-400 font-medium">Received ✓</span>
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Manager / Procurement</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Material Indents & Goods Inward (GRN)</h1>
          <p className="text-xs text-slate-500 mt-1">Review supervisor field requisitions, approve Purchase Orders, and log GRN deliveries.</p>
        </div>
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder="Search indents by PO#, site, supervisor..."
      />

      <DataTable
        columns={columns}
        data={materialRequests}
        searchQuery={search}
        searchFields={['poNumber', 'projectName', 'requestedByName', 'supplierName']}
        emptyMessage="No material indents pending review."
      />

      {/* GRN Modal */}
      <Modal isOpen={isGrnOpen} onClose={() => setIsGrnOpen(false)} title="Record Goods Received Note (GRN)">
        {selectedIndent && (
          <form onSubmit={handleGrnSubmit} className="space-y-4 text-xs">
            <p className="text-slate-600">
              Confirming delivery for <strong>{selectedIndent.poNumber || 'PO'}</strong> at <strong>{selectedIndent.projectName}</strong>.
            </p>
            <label className="block font-medium text-slate-700">
              Supplier Delivery Challan / Invoice # *
              <input
                required
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                placeholder="e.g. CH-9901"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block font-medium text-slate-700">
              Received By (Storekeeper / Supervisor)
              <input
                value={formData.receivedBy}
                onChange={(e) => setFormData({ ...formData, receivedBy: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsGrnOpen(false)}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
              >
                {saving ? 'Processing...' : '✓ Confirm GRN Receipt'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 5. 3-TIER PAYMENT APPROVALS (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function ManagerApprovals({ orgId, approvals = [] }) {
  const [selectedApproval, setSelectedApproval] = useState(null)
  const [actionNotes, setActionNotes] = useState('')
  const [utrRef, setUtrRef] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleTier1Review(approval, isApproved) {
    if (!orgId) return
    setSubmitting(true)
    try {
      await executeTier1Review(orgId, approval.id, 'Operations Manager', isApproved, actionNotes)
      setSelectedApproval(null)
      alert(isApproved ? 'Tier 1 Review verified and forwarded to Organization.' : 'Claim rejected.')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTier3Clearance(approval) {
    if (!orgId || !utrRef) {
      alert('Please enter the bank UTR / Reference number.')
      return
    }
    setSubmitting(true)
    try {
      await executeTier3Clearance(orgId, approval.id, 'Operations Manager', utrRef)
      setSelectedApproval(null)
      alert('Tier 3 Payment Clearance completed! Payment marked as cleared.')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Manager / Approvals</p>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Payment Verification & Final Clearance</h1>
        <p className="text-xs text-slate-500 mt-1">Execute Tier 1 Site Measurement Reviews and Tier 3 Banking Clearance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {approvals.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-400">
            No payment claims pending action.
          </div>
        ) : (
          approvals.map((app) => {
            const status = String(app.approvalStatus || app.status || 'pending_manager_review').toLowerCase()
            const isTier1Pending = status.includes('manager_review') || status === 'pending'
            const isTier3Pending = status.includes('manager_clearance') || status === 'approved'

            return (
              <div key={app.id} className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{app.payeeName || app.title || 'Contractor Claim'}</h3>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-slate-500">{app.projectName || 'Site Location'} · Stage: {app.stage || 'Structure'}</p>
                  <div className="text-lg font-extrabold text-emerald-700">{money(app.claimedAmount || app.amount || 0)}</div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {isTier1Pending && (
                    <button
                      type="button"
                      onClick={() => setSelectedApproval({ ...app, actionType: 'tier1' })}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white transition-colors"
                    >
                      Conduct Tier 1 Review →
                    </button>
                  )}
                  {isTier3Pending && (
                    <button
                      type="button"
                      onClick={() => setSelectedApproval({ ...app, actionType: 'tier3' })}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      Clear Payment (Tier 3) ✓
                    </button>
                  )}
                  {!isTier1Pending && !isTier3Pending && (
                    <span className="text-xs text-slate-400 font-medium">Reviewed ({status})</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedApproval && (
        <Modal
          isOpen={Boolean(selectedApproval)}
          onClose={() => setSelectedApproval(null)}
          title={selectedApproval.actionType === 'tier1' ? 'Tier 1 Manager Review & Forwarding' : 'Tier 3 Final Payment Clearance'}
        >
          {selectedApproval.actionType === 'tier1' ? (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                Confirm that site measurements for <strong>{selectedApproval.payeeName}</strong> ({money(selectedApproval.claimedAmount || selectedApproval.amount)}) match physical progress.
              </p>
              <label className="block font-medium text-slate-700">
                Verification Remarks:
                <textarea
                  rows="3"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Measurement sheet verified against stage progress."
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleTier1Review(selectedApproval, false)}
                  className="w-1/2 py-2.5 rounded-xl font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                >
                  Reject Claim
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleTier1Review(selectedApproval, true)}
                  className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-sm"
                >
                  {submitting ? 'Submitting...' : '✓ Approve & Forward to Org'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                Organization approved payment of <strong>{money(selectedApproval.claimedAmount || selectedApproval.amount)}</strong>. Record the bank transaction UTR reference to mark as cleared.
              </p>
              <label className="block font-medium text-slate-700">
                Bank UTR / Transaction Reference *
                <input
                  required
                  value={utrRef}
                  onChange={(e) => setUtrRef(e.target.value)}
                  placeholder="e.g. HDFC000192837465"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
                />
              </label>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleTier3Clearance(selectedApproval)}
                className="w-full py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
              >
                {submitting ? 'Clearing...' : '✓ Record UTR & Clear Payment'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 6. MAIN MANAGER MODULE DISPATCHER
// ------------------------------------------------------------------------------------------------
export default function ManagerModule() {
  const { module } = useParams()
  const { orgId, user, userData, logout } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')

  const dashboardData = useManagerDashboard(orgId, user?.uid, userData?.assignedSites || [])
  const { sites, workforce, materials, materialRequests, tools, approvals, dailyLogs, loading, error } = dashboardData

  const managerName = userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'

  const navItems = [
    { id: 'dashboard', label: 'Command Center', href: '/manager/dashboard', icon: '⌂' },
    { id: 'site-wizard', label: 'Site Setup Wizard', href: '/manager/site-wizard', icon: '⚡' },
    { id: 'sites', label: 'Sites Portfolio', href: '/manager/sites', icon: '▦' },
    { id: 'daily-logs', label: 'Daily Progress Diaries', href: '/manager/daily-logs', icon: '📝' },
    { id: 'workforce', label: 'Muster Roll & Wages', href: '/manager/workforce', icon: '👷' },
    { id: 'materials', label: 'Materials & Indents', href: '/manager/materials', icon: '📦' },
    { id: 'approvals', label: 'Payment Approvals', href: '/manager/approvals', icon: '✓', badge: approvals.filter((a) => String(a.approvalStatus || a.status).includes('pending')).length },
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="h-screen bg-[#F8FAFC] text-slate-900 flex font-sans overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Strict #0B3470 Sidebar (Desktop Fixed & Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B3470] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-xl lg:z-20 shrink-0 h-screen overflow-y-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 py-1">
            <Link to="/manager/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
              <img className="h-10 w-auto rounded-xl object-contain bg-white p-1 shadow-md" src={logo} alt="eBricks" />
              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">eBricks</strong>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Operations Hub</span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 text-base"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-200/60">OPERATIONAL DESK</p>
            {navItems.map((item) => {
              const isActive = module === item.id || (item.id === 'dashboard' && !module)
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white/15 text-white font-bold border border-white/20 shadow-xs'
                      : 'text-blue-100/75 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span>{item.icon}</span>
                    {item.label}
                  </span>
                  {item.badge > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-slate-950 rounded-full shadow-xs">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <div className="px-3 py-2 text-white/80 text-xs">
            <p className="font-semibold text-white">{managerName}</p>
            <span className="text-[10px] text-blue-200">Site Operations Lead</span>
          </div>
        </div>
      </aside>

      {/* Main Light Content Surface (Independently Scrollable) */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto bg-[#F8FAFC]">
        {/* Topbar Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl border border-slate-200 transition-colors"
              aria-label="Open navigation menu"
            >
              ☰
            </button>
            <span className="text-slate-400 text-sm hidden sm:inline">⌕</span>
            <input
              type="text"
              aria-label="Search records"
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.target.value)}
              placeholder="Search site activities, materials, workers..."
              className="w-full bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/manager/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200"
            >
              ← Command Dashboard
            </Link>

            <button
              type="button"
              onClick={() => setIsNotifOpen(true)}
              className="relative p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl border border-slate-200 transition-colors"
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            <ManagerProfileMenu user={user} userData={userData} onLogout={handleLogout} />
          </div>
        </header>

        {/* Submodule Main Surface */}
        <main className="p-6 md:p-8 max-w-7xl w-full mx-auto flex-1">
          {module === 'site-wizard' && <SiteSetupWizard orgId={orgId} />}
          {module === 'daily-logs' && <DailyLogsManager orgId={orgId} dailyLogs={dailyLogs} sites={sites} />}
          {module === 'workforce' && <WorkforceManager orgId={orgId} workforce={workforce} sites={sites} />}
          {module === 'materials' && <MaterialsProcurement orgId={orgId} materialRequests={materialRequests} materials={materials} sites={sites} />}
          {module === 'approvals' && <ManagerApprovals orgId={orgId} approvals={approvals} />}
          {(!module || module === 'sites' || module === 'dashboard') && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Active Portfolio</p>
                  <h1 className="text-xl font-bold text-slate-900">Registered Construction Sites</h1>
                </div>
                <Link
                  to="/manager/site-wizard"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
                >
                  ＋ New Site Wizard
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sites.map((s) => (
                  <div key={s.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-slate-900 text-base">{s.name || s.projectName || s.id}</h3>
                      <StatusBadge status={s.status || s.currentStatus || 'Active'} />
                    </div>
                    <p className="text-xs text-slate-500">{s.location?.address || s.siteLocation || 'Location registered'}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-700">
                        <span>Current Stage: <strong className="text-slate-900">{s.currentStage || s.projectStage || 'Foundation'}</strong></span>
                        <span className="font-bold text-blue-700">{s.progress || 0}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                        <div className="bg-linear-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all" style={{ width: `${s.progress || 0}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} role="Manager" />
    </div>
  )
}
