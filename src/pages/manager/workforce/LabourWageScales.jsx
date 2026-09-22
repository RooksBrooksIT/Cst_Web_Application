import React, { useState, useEffect, useMemo } from 'react'
import {
  Coins,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Edit2,
  AlertCircle,
  IndianRupee,
  Clock,
  Briefcase,
  X,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react'
import {
  fetchLabourTrades,
  subscribeLabourTrades,
  createLabourTrade,
  updateLabourTrade,
  deleteLabourTrade,
  getNextLabourId,
} from '../../../services/workforceService.js'

export default function LabourWageScales({ orgId, onNotify }) {
  const [activeMode, setActiveMode] = useState('new') // 'new' | 'update'
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [nextLabourId, setNextLabourId] = useState('LT001')
  const [searchQuery, setSearchQuery] = useState('')

  // Mode 1: New Labour Trade Form
  const [formDesignation, setFormDesignation] = useState('')
  const [formSalary, setFormSalary] = useState('')
  const [formOtRate, setFormOtRate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Mode 2: Edit Modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingTrade, setEditingTrade] = useState(null)
  const [editDesignation, setEditDesignation] = useState('')
  const [editSalary, setEditSalary] = useState('')
  const [editOtRate, setEditOtRate] = useState('')
  const [enableSalaryEdit, setEnableSalaryEdit] = useState(false) // Security Lock
  const [savingEdit, setSavingEdit] = useState(false)

  const refreshNextId = async () => {
    if (!orgId) return
    try {
      const id = await getNextLabourId(orgId)
      setNextLabourId(id)
    } catch (e) {
      console.error(e)
    }
  }

  // Real-time listener
  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    refreshNextId()

    const unsub = subscribeLabourTrades(
      orgId,
      (data) => {
        setTrades(data || [])
        setLoading(false)
      },
      (err) => {
        console.error('LabourTrades sub error:', err)
        setLoading(false)
      }
    )

    return () => unsub?.()
  }, [orgId])

  // Handle Create Trade
  const handleCreateTrade = async (e) => {
    e.preventDefault()
    if (!orgId) {
      onNotify?.('Organization session not ready', 'error')
      return
    }

    const cleanName = formDesignation.trim()
    if (!cleanName) {
      onNotify?.('Please enter a valid Labour Designation', 'error')
      return
    }

    const wageNum = Number(formSalary)
    if (isNaN(wageNum) || wageNum <= 0) {
      onNotify?.('Daily Salary must be a positive numeric value', 'error')
      return
    }

    setSubmitting(true)
    try {
      await createLabourTrade(orgId, {
        designation: cleanName,
        salary: wageNum,
        otHourlyRate: Number(formOtRate) || Math.round(wageNum / 6),
      })

      onNotify?.(`Labour Trade "${cleanName}" registered with base wage ₹${wageNum}/day!`, 'success')
      setFormDesignation('')
      setFormSalary('')
      setFormOtRate('')
      await refreshNextId()
      setActiveMode('update')
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to create labour trade', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Open Edit Modal
  const handleOpenEdit = (trade) => {
    setEditingTrade(trade)
    setEditDesignation(trade.designation || trade.trade || trade.name || '')
    setEditSalary(String(trade.salary || trade.dailyWage || ''))
    setEditOtRate(String(trade.otHourlyRate || ''))
    setEnableSalaryEdit(false) // locked by default
    setShowEditModal(true)
  }

  // Handle Edit Submit
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!orgId || !editingTrade) return

    const cleanName = editDesignation.trim()
    if (!cleanName) {
      onNotify?.('Trade Designation cannot be empty', 'error')
      return
    }

    const wageNum = Number(editSalary)
    if (isNaN(wageNum) || wageNum <= 0) {
      onNotify?.('Daily Salary must be greater than 0', 'error')
      return
    }

    setSavingEdit(true)
    try {
      const tradeId = editingTrade.labourId || editingTrade.id
      await updateLabourTrade(orgId, tradeId, {
        designation: cleanName,
        salary: wageNum,
        dailyWage: wageNum,
        otHourlyRate: Number(editOtRate) || Math.round(wageNum / 6),
      })

      onNotify?.(`Trade "${cleanName}" updated successfully!`, 'success')
      setShowEditModal(false)
      setEditingTrade(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update trade', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  // Handle Delete Trade
  const handleDeleteTrade = async (trade) => {
    if (!orgId || !trade) return
    const tradeId = trade.labourId || trade.id
    const tradeName = trade.designation || trade.trade || trade.name

    if (!window.confirm(`Are you sure you want to delete wage scale for "${tradeName}"?`)) {
      return
    }

    try {
      await deleteLabourTrade(orgId, tradeId)
      onNotify?.(`Trade "${tradeName}" removed from catalog`, 'info')
      await refreshNextId()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete trade', 'error')
    }
  }

  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const name = (t.designation || t.trade || t.name || '').toLowerCase()
      const id = (t.labourId || t.id || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()
      return !q || name.includes(q) || id.includes(q)
    })
  }, [trades, searchQuery])

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/50">
              Workforce Payroll Governance
            </span>
            <span className="text-xs font-medium text-slate-400">• Mobile Synced Master</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Labour Category Config</h1>
          <p className="text-sm text-slate-500 mt-1">
            Standardize master construction trade designations, baseline 8-hour daily wages, and overtime rates.
          </p>
        </div>

        {/* Mode Selector Segmented Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 self-start sm:self-auto">
          <button
            onClick={() => setActiveMode('new')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeMode === 'new'
                ? 'bg-white text-[#0B3470] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>1. New Labour Trade</span>
          </button>
          <button
            onClick={() => setActiveMode('update')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeMode === 'update'
                ? 'bg-white text-[#0B3470] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>2. Update Labour Trade ({trades.length})</span>
          </button>
        </div>
      </div>

      {/* MODE 1: NEW LABOUR TRADE FORM */}
      {activeMode === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add New Master Trade</h2>
                <p className="text-xs text-slate-500">
                  Define an enterprise trade category with approved benchmark day wages.
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-full font-mono text-xs font-bold">
                Auto-ID: {nextLabourId}
              </span>
            </div>

            <form onSubmit={handleCreateTrade} className="space-y-5">
              {/* Auto ID Readonly */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Labour ID (Auto-Generated)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={nextLabourId}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono font-bold cursor-not-allowed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Calculated sequentially (LT001, LT002...)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Labour Designation / Trade Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formDesignation}
                    onChange={(e) => setFormDesignation(e.target.value)}
                    placeholder="e.g. Mason, Carpenter, Barbender, Electrician, Helper"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Wage & OT Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Daily Salary / Standard Wage (INR) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={formSalary}
                      onChange={(e) => setFormSalary(e.target.value)}
                      placeholder="e.g. 850"
                      className="w-full pl-8 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Standard 8-hour shift rate per worker</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Overtime Hourly Rate (INR / hr)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={formOtRate}
                      onChange={(e) => setFormOtRate(e.target.value)}
                      placeholder={formSalary ? Math.round(Number(formSalary) / 6).toString() : 'e.g. 140'}
                      className="w-full pl-8 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Default: ~Daily Wage / 6 hours</p>
                </div>
              </div>

              {/* Submit Action */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setFormDesignation('')
                    setFormSalary('')
                    setFormOtRate('')
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Clear Fields
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formDesignation.trim() || !formSalary}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Saving...' : 'Save Labour Trade'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Info Box */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Mobile Data Alignment</h3>
              </div>
              <div className="space-y-3 text-xs text-slate-300">
                <p>
                  Trade categories written to <code className="text-emerald-400 font-mono">/organisation/{orgId}/labours/{nextLabourId}</code> directly populate:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                  <li>Supervisor daily muster roll categories</li>
                  <li>Worker onboarding trade dropdowns</li>
                  <li>Budget estimation for stage labour indents</li>
                </ul>
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-2xl text-xs text-emerald-900">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Automated Wage Inheritance</p>
                  <p className="mt-1 text-emerald-800/90 leading-relaxed text-[11px]">
                    When adding new workers in the directory, selecting a trade automatically inherits this benchmark day rate, eliminating manual salary re-entry errors.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: UPDATE LABOUR TRADE DIRECTORY */}
      {activeMode === 'update' && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search trade by designation or ID..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-semibold">
                {filteredTrades.length} Active Trade Categories
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Trades Grid / Table */}
          {loading && trades.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <p className="text-sm">Synchronizing trade registry...</p>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Coins className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No labour trade scales found</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "1. New Labour Trade" above to create master construction trade categories.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredTrades.map((t) => {
                const tradeId = t.labourId || t.id
                const designation = t.designation || t.trade || t.name
                const wage = Number(t.salary || t.dailyWage) || 0
                const ot = Number(t.otHourlyRate) || Math.round(wage / 6)

                return (
                  <div
                    key={tradeId}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-emerald-400 transition-all group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                          <Coins className="w-4 h-4" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Trade"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTrade(t)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Trade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <span className="font-mono text-[11px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {tradeId}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-1 leading-snug">{designation}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Construction Trade Scale</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Base Day Shift:</span>
                          <span className="text-base font-bold text-slate-900">
                            ₹{wage.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500">Overtime:</span>
                          <span className="font-semibold text-emerald-700">
                            ₹{ot.toLocaleString('en-IN')} / hr
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* EDIT MODAL WITH SECURITY LOCK */}
      {showEditModal && editingTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Update Labour Trade</h3>
                <p className="text-xs text-slate-500 font-mono">{editingTrade.labourId || editingTrade.id}</p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingTrade(null)
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Labour Designation *
                </label>
                <input
                  type="text"
                  required
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              {/* Salary Editing Lock Switch */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSalaryEdit}
                    onChange={(e) => setEnableSalaryEdit(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Enable Salary Rate Editing</span>
                  {enableSalaryEdit ? (
                    <Unlock className="w-3.5 h-3.5 text-emerald-600 ml-auto" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-amber-600 ml-auto" />
                  )}
                </label>
                <p className="text-[11px] text-amber-800/80 mt-1">
                  Wage adjustments will update payroll calculations for future attendance sessions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Daily Base Salary (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={!enableSalaryEdit}
                    value={editSalary}
                    onChange={(e) => setEditSalary(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-xl font-bold ${
                      enableSalaryEdit
                        ? 'bg-slate-50 border-slate-200 text-slate-900'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    OT Rate (₹ / hr)
                  </label>
                  <input
                    type="number"
                    min="0"
                    disabled={!enableSalaryEdit}
                    value={editOtRate}
                    onChange={(e) => setEditOtRate(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-xl font-semibold ${
                      enableSalaryEdit
                        ? 'bg-slate-50 border-slate-200 text-slate-900'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingTrade(null)
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
