import { useState, useMemo, useRef, useEffect } from 'react'
import { Link, NavLink, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useManagerDashboard } from '../../hooks/useManagerDashboard'
import { useNotifications } from '../../context/NotificationContext'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import Modal from '../../components/common/Modal'
import logo from '../../assets/logo/FinalLogo.jpg'

// Helpers
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A'
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
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
    siteLocation: '',
    estimatedBudget: '',
    startDate: '',
    estimatedEndDate: '',
    stages: [
      { name: 'Foundation', weightage: 20 },
      { name: 'Structure', weightage: 30 },
      { name: 'Masonry & Plaster', weightage: 25 },
      { name: 'Finishing & MEP', weightage: 20 },
      { name: 'Handover & Snagging', weightage: 5 },
    ],
    materials: [
      { item: 'OPC 53 Cement', qty: '1000', unit: 'Bags' },
      { item: 'Fe 500 TMT Steel', qty: '15', unit: 'Tonnes' },
      { item: 'River Sand / M-Sand', qty: '2000', unit: 'CFT' },
    ],
    supervisors: '',
    contractors: '',
    pettyCashInitial: '50000',
    selectedTools: ['Total Station Theodolite', 'Concrete Mixer 10/7', 'Plate Compactor'],
  })

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'organisation', orgId, 'sites'), {
        projectName: formData.projectName,
        siteName: formData.projectName,
        siteCode: formData.siteCode || `SITE-${Date.now().toString().slice(-4)}`,
        clientName: formData.clientName,
        siteLocation: formData.siteLocation,
        estimatedBudget: Number(formData.estimatedBudget) || 0,
        budget: Number(formData.estimatedBudget) || 0,
        amountSpent: 0,
        startDate: formData.startDate || new Date().toISOString(),
        estimatedEndDate: formData.estimatedEndDate || '',
        currentStatus: 'In Progress',
        status: 'In Progress',
        projectStage: 'Foundation',
        stage: 'Foundation',
        progress: 0,
        stages: formData.stages,
        supervisors: formData.supervisors ? formData.supervisors.split(',').map((s) => s.trim()) : [],
        contractors: formData.contractors ? formData.contractors.split(',').map((c) => c.trim()) : [],
        createdAt: serverTimestamp(),
      })
      alert('Site successfully created and initialized!')
      navigate('/manager/sites')
    } catch (err) {
      alert('Error creating site: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Wizard Header & Stepper */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Multi-Step Setup Wizard</p>
            <h1 className="text-xl font-bold text-slate-900">Initialize New Construction Project & Site</h1>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
            Step {step} of 5
          </span>
        </div>

        {/* Stepper Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {['1. Basic Info', '2. Milestones', '3. Bill of Materials', '4. Workforce', '5. Cash & Tools'].map((title, i) => (
            <button
              type="button"
              key={title}
              onClick={() => setStep(i + 1)}
              className={`cursor-pointer p-2 text-center rounded-xl border text-xs font-semibold transition-all ${
                step === i + 1
                  ? 'bg-[#0B3470] text-white border-blue-900 shadow-xs'
                  : step > i + 1
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      {/* Step Contents */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Step 1: Project & Client Fundamentals</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-xs font-medium text-slate-700">
                Project / Site Name *
                <input
                  name="projectName"
                  required
                  value={formData.projectName}
                  onChange={handleChange}
                  placeholder="e.g. Prestige Greenwoods Block A"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Site Code / Identification
                <input
                  name="siteCode"
                  value={formData.siteCode}
                  onChange={handleChange}
                  placeholder="e.g. BLR-SIT-042"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Client / Developer Name
                <input
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleChange}
                  placeholder="e.g. Urban Habitat Infra Ltd"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Estimated Total Budget (INR) *
                <input
                  type="number"
                  name="estimatedBudget"
                  required
                  value={formData.estimatedBudget}
                  onChange={handleChange}
                  placeholder="e.g. 15000000"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 md:col-span-2">
                Physical Site Address / GPS Location *
                <input
                  name="siteLocation"
                  required
                  value={formData.siteLocation}
                  onChange={handleChange}
                  placeholder="e.g. Survey No. 44, Whitefield Main Road, Bengaluru"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Planned Start Date
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Target Completion Date
                <input
                  type="date"
                  name="estimatedEndDate"
                  value={formData.estimatedEndDate}
                  onChange={handleChange}
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 outline-none"
                />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Step 2: Milestone Stages & Weightage</h2>
            <p className="text-xs text-slate-500">Configure standard stage weightages for milestone billing and progress rollups.</p>
            <div className="space-y-3">
              {formData.stages.map((stage, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="w-6 text-xs text-slate-500 font-bold">{idx + 1}.</span>
                  <input
                    value={stage.name}
                    onChange={(e) => {
                      const newStages = [...formData.stages]
                      newStages[idx].name = e.target.value
                      setFormData({ ...formData, stages: newStages })
                    }}
                    className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-600 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Weight:</span>
                    <input
                      type="number"
                      value={stage.weightage}
                      onChange={(e) => {
                        const newStages = [...formData.stages]
                        newStages[idx].weightage = Number(e.target.value) || 0
                        setFormData({ ...formData, stages: newStages })
                      }}
                      className="w-16 bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs text-center focus:border-blue-600 outline-none"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Step 3: Initial Bill of Materials (BOM)</h2>
            <p className="text-xs text-slate-500">Estimate initial procurement quantities for foundation phase.</p>
            <div className="space-y-3">
              {formData.materials.map((mat, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    value={mat.item}
                    onChange={(e) => {
                      const mats = [...formData.materials]
                      mats[idx].item = e.target.value
                      setFormData({ ...formData, materials: mats })
                    }}
                    placeholder="Material name"
                    className="bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-600 outline-none"
                  />
                  <input
                    type="number"
                    value={mat.qty}
                    onChange={(e) => {
                      const mats = [...formData.materials]
                      mats[idx].qty = e.target.value
                      setFormData({ ...formData, materials: mats })
                    }}
                    placeholder="Quantity"
                    className="bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-600 outline-none"
                  />
                  <input
                    value={mat.unit}
                    onChange={(e) => {
                      const mats = [...formData.materials]
                      mats[idx].unit = e.target.value
                      setFormData({ ...formData, materials: mats })
                    }}
                    placeholder="Unit (Bags/Tonnes)"
                    className="bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs focus:border-blue-600 outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Step 4: Workforce & Contractor Mapping</h2>
            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-700">
                Assigned Site Supervisors (Comma separated names or emails)
                <input
                  name="supervisors"
                  value={formData.supervisors}
                  onChange={handleChange}
                  placeholder="e.g. Ramesh Kumar, Suresh Nair"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Contractors / Labour Agencies (Comma separated)
                <input
                  name="contractors"
                  value={formData.contractors}
                  onChange={handleChange}
                  placeholder="e.g. Star Civil Works, Apex Electricals"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 outline-none"
                />
              </label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Step 5: Initial Petty Cash & Equipment Allocation</h2>
            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-700">
                Initial Site Petty Cash Allocation (INR)
                <input
                  type="number"
                  name="pettyCashInitial"
                  value={formData.pettyCashInitial}
                  onChange={handleChange}
                  placeholder="50000"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-sm focus:border-blue-600 outline-none"
                />
              </label>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Initial Tools & Machinery Dispatched</label>
                <div className="flex flex-wrap gap-2">
                  {['Total Station Theodolite', 'Concrete Mixer 10/7', 'Plate Compactor', 'Bar Bending Machine', 'Safety Helmets & Harnesses (50 sets)'].map((tool) => (
                    <span key={tool} className="px-3 py-1.5 rounded-lg text-xs bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                      ✓ {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              ← Back
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
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-transform active:scale-95"
            >
              {saving ? 'Creating Project...' : '✓ Complete Setup & Launch Site'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 2. DAILY WORKFORCE & CONTRACTOR LOGS - LIGHT MODE
// ------------------------------------------------------------------------------------------------
function WorkforceManager({ orgId, workforce = [], sites = [] }) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [siteId, setSiteId] = useState(sites[0]?.id || '')
  const [roleCategory, setRoleCategory] = useState('Masons')
  const [headcount, setHeadcount] = useState(10)
  const [shiftHours, setShiftHours] = useState(8)
  const [otHours, setOtHours] = useState(2)
  const [dailyWageRate, setDailyWageRate] = useState(800)
  const [saving, setSaving] = useState(false)

  async function handleAddEntry(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      const calculatedWage = Number(headcount) * (Number(dailyWageRate) + (Number(otHours) * (Number(dailyWageRate) / 8) * 1.5))
      await addDoc(collection(db, 'organisation', orgId, 'workforce'), {
        siteId,
        siteName: sites.find((s) => s.id === siteId)?.projectName || 'Site',
        roleCategory,
        headcount: Number(headcount),
        shiftHours: Number(shiftHours),
        otHours: Number(otHours),
        dailyWageRate: Number(dailyWageRate),
        totalWage: calculatedWage,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      })
      setIsAddOpen(false)
      alert('Workforce daily attendance entry recorded.')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Workforce Planning & Wage Logs</p>
          <h1 className="text-xl font-bold text-slate-900">Daily Labor Attendance & Contractor Measurements</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
        >
          ＋ Record Daily Attendance
        </button>
      </div>

      {/* Workforce Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Site Name</th>
                <th className="p-3.5">Trade Category</th>
                <th className="p-3.5 text-center">Headcount</th>
                <th className="p-3.5 text-center">Shift / OT</th>
                <th className="p-3.5 text-right">Daily Rate</th>
                <th className="p-3.5 text-right">Total Wage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workforce.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400">
                    No attendance entries logged yet today. Click "Record Daily Attendance" to add.
                  </td>
                </tr>
              ) : (
                workforce.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-slate-500">{formatDate(entry.date || entry.createdAt)}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{entry.siteName || entry.siteId}</td>
                    <td className="p-3.5"><StatusBadge status={entry.roleCategory || 'Masonry'} /></td>
                    <td className="p-3.5 text-center font-bold text-blue-700">{entry.headcount || 0}</td>
                    <td className="p-3.5 text-center text-slate-600">{entry.shiftHours || 8} hrs {entry.otHours ? `(+${entry.otHours}h OT)` : ''}</td>
                    <td className="p-3.5 text-right text-slate-600">{formatCurrency(entry.dailyWageRate)}</td>
                    <td className="p-3.5 text-right font-bold text-emerald-600">{formatCurrency(entry.totalWage)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Record Workforce Daily Attendance">
        <form onSubmit={handleAddEntry} className="space-y-4">
          <label className="block text-xs font-medium text-slate-700">
            Site / Project
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.id}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Trade Category
              <select
                value={roleCategory}
                onChange={(e) => setRoleCategory(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              >
                {['Masons', 'Carpenters', 'Bar Benders', 'Electricians', 'Plumbers', 'Helpers / Laborers'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Headcount (Workers)
              <input
                type="number"
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Overtime (OT Hours)
              <input
                type="number"
                value={otHours}
                onChange={(e) => setOtHours(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Daily Wage Rate (INR)
              <input
                type="number"
                value={dailyWageRate}
                onChange={(e) => setDailyWageRate(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
          >
            {saving ? 'Saving...' : 'Save Daily Attendance Log'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 3. MATERIALS & INWARD GRN - LIGHT MODE
// ------------------------------------------------------------------------------------------------
function MaterialsManager({ orgId, materials = [], sites = [] }) {
  const [isGrnOpen, setIsGrnOpen] = useState(false)
  const [siteId, setSiteId] = useState(sites[0]?.id || '')
  const [materialName, setMaterialName] = useState('OPC 53 Cement')
  const [quantity, setQuantity] = useState(200)
  const [unit, setUnit] = useState('Bags')
  const [challanNo, setChallanNo] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreateGRN(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'organisation', orgId, 'inventory'), {
        siteId,
        siteName: sites.find((s) => s.id === siteId)?.projectName || 'Site',
        materialName,
        currentStock: Number(quantity),
        unit,
        challanNo: challanNo || `CH-${Date.now().toString().slice(-4)}`,
        supplierName: supplierName || 'Direct Vendor',
        status: 'In Stock',
        lastUpdated: serverTimestamp(),
      })
      setIsGrnOpen(false)
      alert('Goods Received Note (GRN) logged and site stock incremented!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Inventory & Goods Inward</p>
          <h1 className="text-xl font-bold text-slate-900">Materials Stock, Requisitions & Inward Delivery (GRN)</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsGrnOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
        >
          ＋ Inward Delivery (Create GRN)
        </button>
      </div>

      {/* Materials Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Material Item</th>
                <th className="p-3.5">Site Name</th>
                <th className="p-3.5">Challan / Ref #</th>
                <th className="p-3.5">Supplier / Vendor</th>
                <th className="p-3.5 text-center">Current Stock</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400">
                    No site inventory logged yet. Click "Inward Delivery (Create GRN)" to add material stock.
                  </td>
                </tr>
              ) : (
                materials.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{m.materialName || m.name}</td>
                    <td className="p-3.5 text-slate-700">{m.siteName || m.siteId}</td>
                    <td className="p-3.5 font-mono text-slate-500">{m.challanNo || 'CH-0042'}</td>
                    <td className="p-3.5 text-slate-600">{m.supplierName || 'Ultratech Cement Co.'}</td>
                    <td className="p-3.5 text-center font-bold text-blue-700">{m.currentStock || m.quantity || 0} {m.unit || 'Units'}</td>
                    <td className="p-3.5 text-center"><StatusBadge status={m.status || 'In Stock'} /></td>
                    <td className="p-3.5 text-right text-slate-500">{formatDate(m.lastUpdated || m.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal isOpen={isGrnOpen} onClose={() => setIsGrnOpen(false)} title="Create Goods Received Note (GRN)">
        <form onSubmit={handleCreateGRN} className="space-y-4">
          <label className="block text-xs font-medium text-slate-700">
            Receiving Site
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.id}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Material Description
              <input
                required
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g. 20mm Aggregate Stone"
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Quantity & Unit
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-2/3 bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
                />
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Bags/CFT"
                  className="w-1/3 bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Vendor / Supplier Slip #
              <input
                value={challanNo}
                onChange={(e) => setChallanNo(e.target.value)}
                placeholder="e.g. INV-9901"
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Supplier / Company Name
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. JSW Steel Dist."
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
          >
            {saving ? 'Processing GRN...' : '✓ Confirm Goods Inward & Update Stock'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 4. TOOLS & EQUIPMENT TRACKING - LIGHT MODE
// ------------------------------------------------------------------------------------------------
function ToolsManager({ orgId, tools = [], sites = [] }) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [toolName, setToolName] = useState('')
  const [assetTag, setAssetTag] = useState('')
  const [siteId, setSiteId] = useState(sites[0]?.id || '')
  const [assignedTo, setAssignedTo] = useState('')
  const [condition, setCondition] = useState('Good')
  const [saving, setSaving] = useState(false)

  async function handleAddTool(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'organisation', orgId, 'equipment'), {
        toolName,
        assetTag: assetTag || `EQ-${Date.now().toString().slice(-4)}`,
        siteId,
        siteName: sites.find((s) => s.id === siteId)?.projectName || 'Site',
        assignedTo: assignedTo || 'Site Store',
        condition,
        status: 'Active',
        createdAt: serverTimestamp(),
      })
      setIsAddOpen(false)
      alert('Tool issued / asset registered successfully.')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Equipment & Assets</p>
          <h1 className="text-xl font-bold text-slate-900">Machinery & Tools Movement, Condition & Issue Logs</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
        >
          ＋ Issue / Register Tool
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Asset Tag</th>
                <th className="p-3.5">Equipment / Tool</th>
                <th className="p-3.5">Current Site</th>
                <th className="p-3.5">Assigned Custodian</th>
                <th className="p-3.5 text-center">Condition</th>
                <th className="p-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tools.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    No tools logged yet. Click "Issue / Register Tool" to track site equipment.
                  </td>
                </tr>
              ) : (
                tools.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono text-blue-700 font-bold">{t.assetTag || 'EQ-01'}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{t.toolName || t.name}</td>
                    <td className="p-3.5 text-slate-700">{t.siteName || t.siteId}</td>
                    <td className="p-3.5 text-slate-600">{t.assignedTo || 'Store Keeper'}</td>
                    <td className="p-3.5 text-center"><StatusBadge status={t.condition || 'Good'} /></td>
                    <td className="p-3.5 text-center"><StatusBadge status={t.status || 'Active'} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Issue & Register Site Tool">
        <form onSubmit={handleAddTool} className="space-y-4">
          <label className="block text-xs font-medium text-slate-700">
            Tool / Machine Name *
            <input
              required
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g. Concrete Vibrator Needle 40mm"
              className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Asset Tag / Barcode #
              <input
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="e.g. AST-VIB-01"
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Assigned Site
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.id}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Issued To (Supervisor / Sub-Contractor)
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. Ramesh S. (Civil Lead)"
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Equipment Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs focus:border-blue-600 outline-none"
              >
                <option value="Good">Good Condition</option>
                <option value="Maintenance Required">Maintenance Required</option>
                <option value="Damaged">Damaged / Repair Needed</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
          >
            {saving ? 'Registering...' : '✓ Issue Tool & Save Entry'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 5. 3-TIER PAYMENT APPROVALS - LIGHT MODE
// ------------------------------------------------------------------------------------------------
function ManagerApprovals({ orgId, approvals = [] }) {
  const [selectedApproval, setSelectedApproval] = useState(null)
  const [actionNotes, setActionNotes] = useState('')
  const [utrRef, setUtrRef] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Tier 1 Manager Review (Forward to Org)
  async function handleTier1Review(approval, isApproved) {
    if (!orgId) return
    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'organisation', orgId, 'approvals', approval.id), {
        approvalStatus: isApproved ? 'pending_org_approval' : 'rejected',
        status: isApproved ? 'pending_org_approval' : 'rejected',
        tier1_managerReview: {
          reviewedBy: 'Manager',
          reviewedAt: serverTimestamp(),
          notes: actionNotes || (isApproved ? 'Verified site measurement and progress.' : 'Measurement discrepancy.'),
          isApproved,
        },
        reviewedAt: serverTimestamp(),
      })
      setSelectedApproval(null)
      alert(isApproved ? 'Tier 1 Review completed. Forwarded to Organization for Tier 2 Approval.' : 'Payment claim rejected.')
    } catch (err) {
      alert('Error updating approval: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Tier 3 Manager Clearance (Bank UTR Released)
  async function handleTier3Clearance(approval) {
    if (!orgId || !utrRef) {
      alert('Please enter the bank UTR / Reference number.')
      return
    }
    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'organisation', orgId, 'approvals', approval.id), {
        approvalStatus: 'cleared',
        status: 'cleared',
        tier3_managerClearance: {
          clearedBy: 'Manager',
          clearedAt: serverTimestamp(),
          utrReference: utrRef,
          isCleared: true,
        },
        clearedAt: serverTimestamp(),
      })
      setSelectedApproval(null)
      alert('Tier 3 Payment Clearance completed! Payment marked as cleared.')
    } catch (err) {
      alert('Error clearing payment: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">3-Tier Approval Lifecycle</p>
        <h1 className="text-xl font-bold text-slate-900">Payment Verification & Final Clearance Portal</h1>
        <p className="text-xs text-slate-500 mt-1">Execute Tier 1 Technical Reviews and Tier 3 Banking Clearance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {approvals.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 shadow-xs">
            No payment approval claims pending at this time.
          </div>
        ) : (
          approvals.map((app) => {
            const status = String(app.approvalStatus || app.status || 'pending_manager_review').toLowerCase()
            const isTier1Pending = status.includes('manager_review') || status === 'pending'
            const isTier3Pending = status.includes('manager_clearance') || status === 'approved'

            return (
              <div key={app.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{app.payeeName || app.title || 'Contractor Claim'}</h3>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-slate-500">{app.projectName || app.siteName || 'Site Location'} · Stage: {app.stage || 'Structure'}</p>
                  <div className="text-lg font-extrabold text-emerald-600">{formatCurrency(app.claimedAmount || app.amount || 0)}</div>
                  {app.tier1_managerReview?.notes && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 italic">
                      " {app.tier1_managerReview.notes} "
                    </p>
                  )}
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
                    <span className="text-xs text-slate-500">Status: {status}</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Action Modal */}
      {selectedApproval && (
        <Modal
          isOpen={Boolean(selectedApproval)}
          onClose={() => setSelectedApproval(null)}
          title={selectedApproval.actionType === 'tier1' ? 'Tier 1 Manager Review & Forwarding' : 'Tier 3 Final Payment Clearance'}
        >
          {selectedApproval.actionType === 'tier1' ? (
            <div className="space-y-4 text-xs">
              <p className="text-slate-700">
                Confirm that site measurements and work milestones for <strong>{selectedApproval.payeeName}</strong> ({formatCurrency(selectedApproval.claimedAmount || selectedApproval.amount)}) match verified physical progress.
              </p>
              <label className="block font-medium text-slate-700">
                Technical Review Remarks & Verification Notes:
                <textarea
                  rows="3"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="e.g. 100% plastering completed as per specification. Measurement sheet verified."
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-blue-600 outline-none"
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
                  className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white"
                >
                  {submitting ? 'Submitting...' : '✓ Approve & Forward to Org'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <p className="text-slate-700">
                Organization has approved payment of <strong>{formatCurrency(selectedApproval.claimedAmount || selectedApproval.amount)}</strong>. Record the bank transaction UTR reference to mark as cleared.
              </p>
              <label className="block font-medium text-slate-700">
                Bank UTR / Transaction Reference Number *
                <input
                  required
                  value={utrRef}
                  onChange={(e) => setUtrRef(e.target.value)}
                  placeholder="e.g. HDFC000192837465"
                  className="mt-1 w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:border-blue-600 outline-none"
                />
              </label>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleTier3Clearance(selectedApproval)}
                className="w-full py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
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

  const { sites, workforce, materials, tools, approvals, loading, error } =
    useManagerDashboard(orgId, user?.uid, userData?.assignedSites || [])

  const managerName = userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', href: '/manager/dashboard', icon: '⌂' },
    { id: 'site-wizard', label: 'Site Setup Wizard', href: '/manager/site-wizard', icon: '⚡' },
    { id: 'sites', label: 'Sites Register', href: '/manager/sites', icon: '▦' },
    { id: 'workforce', label: 'Daily Workforce', href: '/manager/workforce', icon: '👷' },
    { id: 'materials', label: 'Materials & GRN', href: '/manager/materials', icon: '📦' },
    { id: 'tools', label: 'Tools Movement', href: '/manager/tools', icon: '🔧' },
    { id: 'approvals', label: 'Payment Approvals', href: '/manager/approvals', icon: '✓' },
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Strict #0B3470 Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B3470] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-xl lg:z-20 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 py-1">
            <Link to="/manager/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
              <img className="h-10 w-auto rounded-xl object-contain bg-white p-1 shadow-md" src={logo} alt="eBricks" />
              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">eBricks</strong>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Manager Hub</span>
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
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-200/60">OPERATIONAL MODULES</p>
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

      {/* Main Light Content Surface */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#F8FAFC]">
        {/* Topbar Header (Light Mode) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200/90 shadow-xs">
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

        {/* Submodule View */}
        <main className="p-6 md:p-8 max-w-6xl w-full mx-auto flex-1">
          {module === 'site-wizard' && <SiteSetupWizard orgId={orgId} />}
          {module === 'workforce' && <WorkforceManager orgId={orgId} workforce={workforce} sites={sites} />}
          {module === 'materials' && <MaterialsManager orgId={orgId} materials={materials} sites={sites} />}
          {module === 'tools' && <ToolsManager orgId={orgId} tools={tools} sites={sites} />}
          {module === 'approvals' && <ManagerApprovals orgId={orgId} approvals={approvals} />}
          {(!module || module === 'sites' || module === 'dashboard') && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Active Portfolio</p>
                  <h1 className="text-xl font-bold text-slate-900">Registered Sites & Progress Status</h1>
                </div>
                <Link
                  to="/manager/site-wizard"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
                >
                  ＋ New Site Wizard
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sites.map((s) => (
                  <div key={s.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-slate-900 text-base">{s.projectName || s.siteName || s.id}</h3>
                      <StatusBadge status={s.currentStatus || s.status || 'Active'} />
                    </div>
                    <p className="text-xs text-slate-500">{s.siteLocation || 'Location registered'}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-700">
                        <span>Current Stage: <strong className="text-slate-900">{s.projectStage || s.stage || 'Foundation'}</strong></span>
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

      {/* Notification Drawer */}
      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} role="Manager" />
    </div>
  )
}
