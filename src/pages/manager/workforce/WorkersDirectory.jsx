import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Phone,
  Building2,
  Calendar,
  X,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  MapPin,
  Check,
  Briefcase,
  Sliders,
} from 'lucide-react'
import {
  fetchWorkers,
  subscribeWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  fetchLabourTrades,
  subscribeLabourTrades,
  getNextWorkerId,
} from '../../../services/workforceService.js'

export default function WorkersDirectory({ orgId, sites = [], currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState('register') // 'register' | 'list'
  const [workers, setWorkers] = useState([])
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [nextWorkerId, setNextWorkerId] = useState('WC001')

  // Search & Filter (Tab 2)
  const [searchQuery, setSearchQuery] = useState('')
  const [tradeFilter, setTradeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Tab 1: Register Form State
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formDesignation, setFormDesignation] = useState('')
  const [formSalary, setFormSalary] = useState('')
  const [overrideWage, setOverrideWage] = useState(false)
  const [formJoiningDate, setFormJoiningDate] = useState(new Date().toISOString().split('T')[0])
  const [formAddress, setFormAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Tab 2: Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingWorker, setEditingWorker] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editDesignation, setEditDesignation] = useState('')
  const [editSalary, setEditSalary] = useState('')
  const [editJoiningDate, setEditJoiningDate] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const refreshNextId = async () => {
    if (!orgId) return
    try {
      const id = await getNextWorkerId(orgId)
      setNextWorkerId(id)
    } catch (e) {
      console.error(e)
    }
  }

  // Real-time Firestore Subscriptions
  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    refreshNextId()

    const unsubWorkers = subscribeWorkers(
      orgId,
      (data) => {
        setWorkers(data || [])
        setLoading(false)
      },
      (err) => {
        console.error('Workers sub error:', err)
        setLoading(false)
      }
    )

    const unsubTrades = subscribeLabourTrades(
      orgId,
      (data) => {
        setTrades(data || [])
        if (data && data.length > 0 && !formDesignation) {
          const firstTrade = data[0]
          setFormDesignation(firstTrade.designation || firstTrade.trade || firstTrade.name)
          setFormSalary(String(firstTrade.salary || firstTrade.dailyWage || 800))
        }
      },
      (err) => console.error('Trades sub error:', err)
    )

    return () => {
      unsubWorkers?.()
      unsubTrades?.()
    }
  }, [orgId])

  // When designation changes in register form, auto-inherit default salary if not overridden
  const handleDesignationChange = (tradeName) => {
    setFormDesignation(tradeName)
    if (!overrideWage) {
      const match = trades.find(
        (t) => (t.designation || t.trade || t.name)?.toLowerCase() === tradeName.toLowerCase()
      )
      if (match) {
        setFormSalary(String(match.salary || match.dailyWage || 800))
      }
    }
  }

  // Handle Tab 1 Register Worker Submit
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) {
      onNotify?.('Organization session not ready', 'error')
      return
    }

    const cleanName = formName.trim()
    if (!cleanName || cleanName.length < 2) {
      onNotify?.('Worker full name must be at least 2 characters', 'error')
      return
    }

    const cleanPhone = formPhone.trim().replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      onNotify?.('Phone number must be exactly 10 digits', 'error')
      return
    }

    const wageNum = Number(formSalary)
    if (isNaN(wageNum) || wageNum <= 0) {
      onNotify?.('Daily Salary must be a positive numeric value', 'error')
      return
    }

    setSubmitting(true)
    try {
      await createWorker(orgId, {
        name: cleanName,
        phoneNumber: cleanPhone,
        phone: cleanPhone,
        designation: formDesignation || 'Worker',
        salary: wageNum,
        joiningDate: formJoiningDate || new Date().toISOString().split('T')[0],
        address: formAddress.trim(),
        status: 'Active',
      })

      onNotify?.(`Worker "${cleanName}" (${nextWorkerId}) successfully registered!`, 'success')

      // Reset form
      setFormName('')
      setFormPhone('')
      setFormAddress('')
      setOverrideWage(false)
      if (trades.length > 0) {
        setFormDesignation(trades[0].designation || trades[0].trade || trades[0].name)
        setFormSalary(String(trades[0].salary || trades[0].dailyWage || 800))
      }

      await refreshNextId()
      setActiveTab('list')
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to register worker', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Open Edit Modal
  const handleOpenEdit = (w) => {
    setEditingWorker(w)
    setEditName(w.name || w.workerName || '')
    setEditPhone((w.phoneNumber || w.phone || '').replace(/\D/g, ''))
    setEditDesignation(w.designation || w.trade || 'Worker')
    setEditSalary(String(w.salary || w.dailyWageRate || '800'))
    setEditJoiningDate(w.joiningDate || '')
    setEditAddress(w.address || '')
    setShowEditModal(true)
  }

  // Handle Edit Submit
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!orgId || !editingWorker) return

    const cleanName = editName.trim()
    if (!cleanName || cleanName.length < 2) {
      onNotify?.('Full Name must be at least 2 characters', 'error')
      return
    }

    const cleanPhone = editPhone.trim().replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      onNotify?.('Phone number must be exactly 10 digits', 'error')
      return
    }

    const wageNum = Number(editSalary)
    if (isNaN(wageNum) || wageNum <= 0) {
      onNotify?.('Daily Salary must be greater than 0', 'error')
      return
    }

    setSavingEdit(true)
    try {
      const workerId = editingWorker.workerId || editingWorker.id
      await updateWorker(orgId, workerId, {
        name: cleanName,
        phoneNumber: cleanPhone,
        phone: cleanPhone,
        designation: editDesignation,
        salary: wageNum,
        joiningDate: editJoiningDate,
        address: editAddress.trim(),
      })

      onNotify?.(`Worker profile "${cleanName}" updated successfully!`, 'success')
      setShowEditModal(false)
      setEditingWorker(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update worker profile', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  // Handle Delete Worker
  const handleDeleteWorker = async (w) => {
    if (!orgId || !w) return
    const workerId = w.workerId || w.id
    const workerName = w.name || w.workerName

    if (!window.confirm(`Are you sure you want to delete "${workerName}" (${workerId}) from the Master Directory?`)) {
      return
    }

    try {
      await deleteWorker(orgId, workerId)
      onNotify?.(`Worker "${workerName}" removed from roster`, 'info')
      await refreshNextId()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete worker', 'error')
    }
  }

  // Filtered Workers for Tab 2
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const name = (w.name || w.workerName || '').toLowerCase()
      const phone = (w.phoneNumber || w.phone || '').toLowerCase()
      const id = (w.workerId || w.id || '').toLowerCase()
      const trade = (w.designation || w.trade || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !q || name.includes(q) || phone.includes(q) || id.includes(q) || trade.includes(q)
      const matchesTrade = tradeFilter === 'ALL' || (w.designation || w.trade) === tradeFilter
      const matchesStatus = statusFilter === 'ALL' || (w.status || 'Active') === statusFilter

      return matchesSearch && matchesTrade && matchesStatus
    })
  }, [workers, searchQuery, tradeFilter, statusFilter])

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/50">
              Direct Labour Force
            </span>
            <span className="text-xs font-medium text-slate-400">• Mobile Synced Master</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workers Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">
            Central workforce registry. Onboard daily wage personnel, track phone credentials, and manage trade profiles.
          </p>
        </div>

        {/* Tab Switch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('register')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-[#0B3470] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tab 1: Register Worker</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'list'
                ? 'bg-white text-[#0B3470] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Tab 2: Workers List ({workers.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: REGISTER NEW WORKER FORM */}
      {activeTab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Worker Onboarding Form</h2>
                <p className="text-xs text-slate-500">
                  Register new individual labour personnel into central organizational directory.
                </p>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full font-mono text-xs font-bold">
                Assigned ID: {nextWorkerId}
              </span>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-5">
              {/* Full Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Worker Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar, Suresh Gowda"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Full legal or site moniker</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Mobile Number (10 Digits) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      +91
                    </span>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="9876543210"
                      className={`w-full pl-12 pr-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl font-mono focus:ring-2 ${
                        formPhone.length > 0 && formPhone.length !== 10
                          ? 'border-rose-300 focus:ring-rose-500/20 focus:border-rose-500 text-rose-800'
                          : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900'
                      }`}
                    />
                  </div>
                  {formPhone.length > 0 && formPhone.length !== 10 ? (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">
                      Must be exactly 10 digits ({formPhone.length}/10 entered)
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">Direct contact for field deployments</p>
                  )}
                </div>
              </div>

              {/* Designation & Wage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Trade / Designation *
                  </label>
                  <select
                    value={formDesignation}
                    onChange={(e) => handleDesignationChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {trades.map((t) => {
                      const name = t.designation || t.trade || t.name
                      return (
                        <option key={t.labourId || t.id} value={name}>
                          {name} (₹{t.salary || t.dailyWage}/day)
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Daily Salary (₹) *
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-blue-700 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideWage}
                        onChange={(e) => setOverrideWage(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Override Base Wage</span>
                    </label>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="1"
                      required
                      disabled={!overrideWage}
                      value={formSalary}
                      onChange={(e) => setFormSalary(e.target.value)}
                      className={`w-full pl-8 pr-3.5 py-2.5 text-sm border rounded-xl font-semibold ${
                        overrideWage
                          ? 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500/20'
                          : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {overrideWage ? 'Custom wage specified for this worker' : 'Inherited from master trade category'}
                  </p>
                </div>
              </div>

              {/* Joining Date & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Date of Joining *
                  </label>
                  <input
                    type="date"
                    required
                    value={formJoiningDate}
                    onChange={(e) => setFormJoiningDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Permanent / Residential Address (Optional)
                  </label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="e.g. Madurai, Tamil Nadu / Camp Shed B"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setFormName('')
                    setFormPhone('')
                    setFormAddress('')
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formName.trim() || formPhone.trim().length !== 10}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Registering...' : 'Register Worker'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Architecture & Information */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">Deterministic Worker Identifier</h3>
              </div>
              <div className="space-y-3 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400 block mb-1">Generated Sequential ID:</span>
                  <div className="p-2.5 bg-slate-800/90 rounded-lg font-mono text-emerald-400 font-semibold border border-slate-700/60">
                    {nextWorkerId}
                  </div>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700 text-[11px] space-y-1.5 mt-4">
                  <p className="font-semibold text-amber-300">Dual-Write Guarantee:</p>
                  <p>1. Primary profile in <code className="text-slate-100">/organisation/{orgId}/workersConfig</code></p>
                  <p>2. Backward-compatible mirror in <code className="text-slate-100">/organisation/{orgId}/workers</code></p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-200/80 p-4 rounded-2xl text-xs text-blue-950">
              <div className="flex items-start gap-2.5">
                <UserCheck className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Next Step: Site Deployment</p>
                  <p className="mt-1 text-blue-900/90 leading-relaxed text-[11px]">
                    Once registered, deploy workers to active construction sites in <strong>Workers Site Mapping</strong> to generate muster roll rosters for site supervisors.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WORKERS LIST & IN-PLACE EDITING */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workers by name, phone, ID, or trade..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 font-medium"
              >
                <option value="ALL">All Trades ({trades.length})</option>
                {trades.map((t) => {
                  const name = t.designation || t.trade || t.name
                  return (
                    <option key={t.labourId || t.id} value={name}>
                      {name}
                    </option>
                  )
                })}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>

              <button
                onClick={() => {
                  setSearchQuery('')
                  setTradeFilter('ALL')
                  setStatusFilter('ALL')
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                title="Reset Filters"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Workers Grid */}
          {loading && workers.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <p className="text-sm">Synchronizing master worker roster...</p>
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No workers found in directory</p>
              <p className="text-xs text-slate-400 mt-1">
                Adjust search criteria or click "Tab 1: Register Worker" to onboard new labour personnel.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredWorkers.map((w) => {
                const workerId = w.workerId || w.id
                const name = w.name || w.workerName
                const phone = w.phoneNumber || w.phone
                const trade = w.designation || w.trade || 'Worker'
                const wage = Number(w.salary || w.dailyWageRate) || 0

                return (
                  <div
                    key={workerId}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-all group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {(name || 'W').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {workerId}
                              </span>
                              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                {w.status || 'Active'}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-slate-900 mt-1 leading-snug">{name}</h3>
                          </div>
                        </div>

                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-md">
                          {trade}
                        </span>
                      </div>

                      <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono">{phone ? `+91 ${phone}` : 'No phone listed'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{w.assignedSiteName || 'Central Yard / Unassigned'}</span>
                        </div>

                        {w.address && (
                          <div className="flex items-center gap-2 text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate text-[11px]">{w.address}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Standard Wage</span>
                          <span className="font-bold text-slate-900">₹{wage.toLocaleString('en-IN')} / day</span>
                        </div>

                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Joined</span>
                          <span className="font-medium text-slate-600">{w.joiningDate || 'Recent'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleOpenEdit(w)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Worker Profile"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteWorker(w)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove from Roster"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* EDIT WORKER PROFILE MODAL */}
      {showEditModal && editingWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Worker Profile</h3>
                <p className="text-xs text-slate-500 font-mono">{editingWorker.workerId || editingWorker.id}</p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingWorker(null)
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Worker Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Trade / Skill *
                  </label>
                  <select
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {trades.map((t) => {
                      const name = t.designation || t.trade || t.name
                      return (
                        <option key={t.labourId || t.id} value={name}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Mobile (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Daily Wage Rate (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editSalary}
                    onChange={(e) => setEditSalary(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={editJoiningDate}
                    onChange={(e) => setEditJoiningDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Residential / Local Address
                </label>
                <textarea
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingWorker(null)
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
                  {savingEdit ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
