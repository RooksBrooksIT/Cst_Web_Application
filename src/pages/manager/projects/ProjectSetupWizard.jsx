import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { createCompleteProjectSetup, DEFAULT_PROJECT_STAGES } from '../../../services/projectService'

export default function ProjectSetupWizard({ orgId, supervisors = [], contractors = [] }) {
  const navigate = useNavigate()
  const { user, userData } = useAuth()
  const managerActor = {
    id: user?.uid || 'mgr_lead',
    name: userData?.fullName || userData?.FullName || userData?.name || 'Operations Manager',
  }

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [formData, setFormData] = useState({
    // Step 1: Site Details
    siteName: '',
    siteLocation: '',
    latitude: '',
    longitude: '',
    projectCategory: 'Residential Construction',
    startDate: new Date().toISOString().split('T')[0],
    targetEndDate: '',

    // Step 2: Project Configuration
    projectName: '',
    clientName: '',
    clientPhone: '',
    totalBudget: '',
    advancePaid: '',
    projectSubCategory: 'Gated Villa Community',
    contractType: 'Turnkey with Material',
    startingStage: '1. Site Demarcation & Mobilization',
    contractorName: '',
    contractorBudget: '',

    // Step 3: Site Supervisor Map
    supervisorId: '',
    supervisorName: '',
    joinedDate: new Date().toISOString().split('T')[0],
    supervisorComments: '',
  })

  // Geolocation trigger
  function handleUseCurrentLocation() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData((prev) => ({
            ...prev,
            latitude: pos.coords.latitude.toFixed(6),
            longitude: pos.coords.longitude.toFixed(6),
          }))
        },
        (err) => {
          alert('Could not access current location: ' + err.message)
        }
      )
    } else {
      alert('Geolocation not supported by this browser.')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    setErrorMsg('')
    try {
      const selectedSup = supervisors.find((s) => (s.SupervisorId || s.id) === formData.supervisorId)
      await createCompleteProjectSetup(
        orgId,
        {
          ...formData,
          supervisorName: selectedSup ? (selectedSup.FullName || selectedSup.name) : formData.supervisorName,
          stages: DEFAULT_PROJECT_STAGES,
        },
        managerActor
      )
      navigate('/manager/sites')
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initialize project site.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Onboarding Gateway</span>
          <h1 className="text-xl font-bold text-slate-900">Project & Site Setup Wizard</h1>
          <p className="text-xs text-slate-500">Initialize a new construction project, client contract, and assign field supervisor in 3 steps</p>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
          Step {step} of 3
        </span>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Wizard Progress Bar */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1, title: '1. Site & Geofence' },
          { num: 2, title: '2. Project & Budgets' },
          { num: 3, title: '3. Supervisor Mapping' },
        ].map((s) => (
          <div
            key={s.num}
            className={`p-3 rounded-xl border text-center transition-all ${
              step === s.num
                ? 'bg-white border-[#0B3470] shadow-xs text-[#0B3470] font-bold'
                : step > s.num
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <span className="text-xs">{s.title}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        {/* STEP 1: SITE DETAILS & GEOFENCE */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Step 1: Construction Site Details & GPS Coordinates</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Site Name *</label>
                <input
                  type="text"
                  value={formData.siteName}
                  onChange={(e) => setFormData({ ...formData, siteName: e.target.value, projectName: formData.projectName || e.target.value })}
                  placeholder="e.g. Skyline Residency Phase 1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-semibold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Category *</label>
                <select
                  value={formData.projectCategory}
                  onChange={(e) => setFormData({ ...formData, projectCategory: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="Residential Construction">Residential Construction</option>
                  <option value="Commercial Complexes">Commercial Complexes</option>
                  <option value="Industrial & Warehouses">Industrial & Warehouses</option>
                  <option value="Infrastructure & Roads">Infrastructure & Roads</option>
                  <option value="Renovation & Interior Fit-Outs">Renovation & Interior Fit-Outs</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Site Physical Location / Address *</label>
              <input
                type="text"
                value={formData.siteLocation}
                onChange={(e) => setFormData({ ...formData, siteLocation: e.target.value })}
                placeholder="e.g. Bypass Road, Gandhipuram, Coimbatore, Tamil Nadu"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                required
              />
            </div>

            {/* GPS Geofence */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">GPS Coordinates & Geofence</span>
                  <span className="text-[11px] text-slate-500">Coordinates ensure supervisors and muster rolls operate on-site</span>
                </div>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1.5"
                >
                  <span>📍</span> Use Current Location
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="e.g. 11.0168"
                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="e.g. 76.9558"
                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-600 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Site Start Date *</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Completion Date</label>
                <input
                  type="date"
                  value={formData.targetEndDate}
                  onChange={(e) => setFormData({ ...formData, targetEndDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (!formData.siteName || !formData.siteLocation) {
                    setErrorMsg('Please provide site name and location before continuing.')
                    return
                  }
                  setErrorMsg('')
                  setStep(2)
                }}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
              >
                Next: Project Configuration →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PROJECT CONFIGURATION & BUDGETS */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Step 2: Project Financials, Client & Sub-Category</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Parent Project Name *</label>
                <input
                  type="text"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="e.g. Skyline Township"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sub-Category</label>
                <select
                  value={formData.projectSubCategory}
                  onChange={(e) => setFormData({ ...formData, projectSubCategory: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="Gated Villa Community">Gated Villa Community</option>
                  <option value="High-Rise Apartments">High-Rise Apartments</option>
                  <option value="Corporate Office Tech Park">Corporate Office Tech Park</option>
                  <option value="Retail Mall & Multiplex">Retail Mall & Multiplex</option>
                  <option value="Heavy Pre-Engineered Factory">Heavy Pre-Engineered Factory</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Client / Owner Name</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  placeholder="e.g. Aditya Vardhan"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Client Contact Phone</label>
                <input
                  type="tel"
                  value={formData.clientPhone}
                  onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sanctioned Project Budget (₹ INR) *</label>
                <input
                  type="number"
                  value={formData.totalBudget}
                  onChange={(e) => setFormData({ ...formData, totalBudget: e.target.value })}
                  placeholder="e.g. 15000000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Advance Received (₹)</label>
                <input
                  type="number"
                  value={formData.advancePaid}
                  onChange={(e) => setFormData({ ...formData, advancePaid: e.target.value })}
                  placeholder="e.g. 2500000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contract Type</label>
                <select
                  value={formData.contractType}
                  onChange={(e) => setFormData({ ...formData, contractType: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="Turnkey with Material">Turnkey with Material</option>
                  <option value="Labour Contract">Labour Contract</option>
                  <option value="Item Rate (BOQ)">Item Rate (BOQ)</option>
                  <option value="Cost-Plus-Percentage">Cost-Plus-Percentage</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Starting Construction Stage</label>
                <select
                  value={formData.startingStage}
                  onChange={(e) => setFormData({ ...formData, startingStage: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                >
                  {DEFAULT_PROJECT_STAGES.map((s) => (
                    <option key={s.stageId} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Contractor</label>
                <input
                  type="text"
                  value={formData.contractorName}
                  onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
                  placeholder="e.g. Precision Civil Works"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contractor Sanctioned Budget (₹)</label>
                <input
                  type="number"
                  value={formData.contractorBudget}
                  onChange={(e) => setFormData({ ...formData, contractorBudget: e.target.value })}
                  placeholder="e.g. 4500000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formData.totalBudget) {
                    setErrorMsg('Please specify a sanctioned project budget.')
                    return
                  }
                  setErrorMsg('')
                  setStep(3)
                }}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
              >
                Next: Supervisor Assignment →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUPERVISOR MAPPING & ATOMIC SAVE */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Step 3: Assign Field Supervisor & Deploy</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Field Supervisor</label>
              <select
                value={formData.supervisorId}
                onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-semibold"
              >
                <option value="">Select an active registered supervisor</option>
                {supervisors.map((sup) => (
                  <option key={sup.SupervisorId || sup.id} value={sup.SupervisorId || sup.id}>
                    {sup.FullName || sup.fullName || sup.name} ({sup.Designation || 'Supervisor'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">If supervisor is not registered yet, you can onboard them later in Supervisor Setup</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supervisor Deployment Date</label>
                <input
                  type="date"
                  value={formData.joinedDate}
                  onChange={(e) => setFormData({ ...formData, joinedDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deployment Stage</label>
                <input
                  type="text"
                  disabled
                  value={formData.startingStage}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Briefing & Comments</label>
              <textarea
                rows={3}
                value={formData.supervisorComments}
                onChange={(e) => setFormData({ ...formData, supervisorComments: e.target.value })}
                placeholder="e.g. Lead supervisor for civil execution, rebar inspections, and daily muster rolls."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            {/* Summary Review Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <span className="font-bold text-slate-900 block text-xs">Deployment Summary:</span>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div><span className="text-slate-400">Site:</span> <strong>{formData.siteName}</strong></div>
                <div><span className="text-slate-400">Category:</span> {formData.projectCategory}</div>
                <div><span className="text-slate-400">Sanctioned Budget:</span> <strong className="text-slate-900">₹{Number(formData.totalBudget).toLocaleString('en-IN')}</strong></div>
                <div><span className="text-slate-400">Starting Stage:</span> {formData.startingStage}</div>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-7 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-md transition-transform active:scale-95"
              >
                {saving ? 'Launching Project Site...' : '⚡ Launch Site & Commit Onboarding'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
