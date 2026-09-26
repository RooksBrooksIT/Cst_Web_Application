import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Plus,
  Search,
  Trash2,
  Edit2,
  Phone,
  Building2,
  X,
  RefreshCw,
} from 'lucide-react'
import {
  subscribeWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  subscribeLabourTrades,
  getNextWorkerId,
} from '../../../services/workforceService.js'

export default function WorkersDirectory({ orgId, sites = [], currentUser, onNotify }) {
  const [workers, setWorkers] = useState([])
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [nextWorkerId, setNextWorkerId] = useState('WC001')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [tradeFilter, setTradeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Register Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formDesignation, setFormDesignation] = useState('')
  const [formSalary, setFormSalary] = useState('')
  const [overrideWage, setOverrideWage] = useState(false)
  const [formJoiningDate, setFormJoiningDate] = useState(new Date().toISOString().split('T')[0])
  const [formAddress, setFormAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Edit Modal State
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

  // Real-time Subscriptions
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

  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return

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

      setFormName('')
      setFormPhone('')
      setFormAddress('')
      setOverrideWage(false)
      setShowRegisterModal(false)

      await refreshNextId()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to register worker', 'error')
    } finally {
      setSubmitting(false)
    }
  }

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

  const handleDeleteWorker = async (w) => {
    if (!orgId || !w) return
    const workerId = w.workerId || w.id
    const workerName = w.name || w.workerName

    if (!window.confirm(`Are you sure you want to delete "${workerName}" (${workerId})?`)) {
      return
    }

    try {
      await deleteWorker(orgId, workerId)
      onNotify?.(`Worker "${workerName}" removed`, 'info')
      await refreshNextId()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete worker', 'error')
    }
  }

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
      {/* 1. Minimal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workers Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage worker profiles, trade categories, and standard daily wage rates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRegisterModal(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Worker</span>
        </button>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by worker name, phone, ID, trade..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600 transition-all"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium cursor-pointer"
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
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <span className="text-xs text-slate-500 font-medium ml-auto">
            Showing <strong>{filteredWorkers.length}</strong> workers
          </span>
        </div>
      </div>

      {/* 3. Workers Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading && workers.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-xs">Loading workers directory...</p>
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No workers found</p>
            <p className="text-xs text-slate-400 mt-1">
              Click "Add New Worker" to add your first worker profile.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Worker ID & Name</th>
                  <th className="py-3.5 px-4">Trade / Skill</th>
                  <th className="py-3.5 px-4">Contact Phone</th>
                  <th className="py-3.5 px-4">Assigned Site</th>
                  <th className="py-3.5 px-4 text-right">Daily Wage</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkers.map((w) => {
                  const workerId = w.workerId || w.id
                  const name = w.name || w.workerName
                  const phone = w.phoneNumber || w.phone
                  const trade = w.designation || w.trade || 'Worker'
                  const wage = Number(w.salary || w.dailyWageRate) || 0

                  return (
                    <tr key={workerId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            {(name || 'W').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <strong className="block text-slate-900 font-bold">{name}</strong>
                            <span className="font-mono text-[10px] text-slate-400">{workerId}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 font-semibold text-[11px]">
                          {trade}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {phone ? `+91 ${phone}` : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {w.assignedSiteName || 'Unassigned'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                        ₹{wage.toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {w.status || 'Active'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(w)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Edit Worker"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorker(w)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Worker"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. REGISTER NEW WORKER MODAL */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add New Worker</h3>
                <span className="text-xs text-blue-700 font-mono font-semibold">Assigned ID: {nextWorkerId}</span>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Worker Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Mobile Number (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Trade / Skill *
                  </label>
                  <select
                    value={formDesignation}
                    onChange={(e) => handleDesignationChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {trades.map((t) => {
                      const name = t.designation || t.trade || t.name
                      return (
                        <option key={t.labourId || t.id} value={name}>
                          {name} (₹{t.salary || t.dailyWage}/d)
                        </option>
                      )
                    })}
                  </select>
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
                    value={formSalary}
                    onChange={(e) => setFormSalary(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Joining Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formJoiningDate}
                    onChange={(e) => setFormJoiningDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Residential / Local Address (Optional)
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="e.g. Madurai, Tamil Nadu"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Adding...' : 'Add Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. EDIT WORKER PROFILE MODAL */}
      {showEditModal && editingWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
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
                <input
                  type="text"
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
