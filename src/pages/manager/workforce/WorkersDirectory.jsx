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
} from 'lucide-react'
import {
  fetchWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  fetchLabourScales,
} from '../../../services/workforceService.js'

export default function WorkersDirectory({ orgId, sites = [], currentUser, onNotify }) {
  const [workers, setWorkers] = useState([])
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [siteFilter, setSiteFilter] = useState('ALL')
  const [tradeFilter, setTradeFilter] = useState('ALL')

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingWorker, setEditingWorker] = useState(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formTrade, setFormTrade] = useState('Mason')
  const [formSalary, setFormSalary] = useState('950')
  const [formOt, setFormOt] = useState('150')
  const [formSiteId, setFormSiteId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [wrks, trds] = await Promise.all([
        fetchWorkers(orgId),
        fetchLabourScales(orgId),
      ])
      setWorkers(wrks || [])
      setTrades(trds || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load workers directory', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleOpenCreate = () => {
    setEditingWorker(null)
    setFormName('')
    setFormPhone('')
    setFormTrade(trades.length > 0 ? trades[0].trade || trades[0].name : 'Mason')
    setFormSalary('950')
    setFormOt('150')
    setFormSiteId(sites.length > 0 ? sites[0].id : '')
    setShowModal(true)
  }

  const handleOpenEdit = (w) => {
    setEditingWorker(w)
    setFormName(w.name || w.workerName || '')
    setFormPhone(w.phone || '')
    setFormTrade(w.designation || w.trade || 'Mason')
    setFormSalary(w.salary || w.dailyWageRate || '950')
    setFormOt(w.overtimeHourlyRate || '150')
    setFormSiteId(w.assignedSiteId || '')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !formName.trim()) return

    setSubmitting(true)
    try {
      const site = sites.find((s) => s.id === formSiteId)
      const siteName = site ? site.siteName || site.projectName : ''

      if (editingWorker) {
        await updateWorker(orgId, editingWorker.id || editingWorker.workerId, {
          name: formName.trim(),
          workerName: formName.trim(),
          phone: formPhone.trim(),
          designation: formTrade,
          trade: formTrade,
          salary: Number(formSalary) || 800,
          dailyWageRate: Number(formSalary) || 800,
          overtimeHourlyRate: Number(formOt) || 120,
          assignedSiteId: formSiteId,
          assignedSiteName: siteName,
        })
        onNotify?.('Worker profile updated', 'success')
      } else {
        await createWorker(orgId, {
          name: formName.trim(),
          phone: formPhone.trim(),
          designation: formTrade,
          salary: Number(formSalary) || 800,
          overtimeHourlyRate: Number(formOt) || 120,
          assignedSiteId: formSiteId,
          assignedSiteName: siteName,
        })
        onNotify?.('Worker registered into roster', 'success')
      }
      setShowModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to save worker', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (workerId) => {
    if (!orgId || !workerId) return
    if (!window.confirm('Delete worker from roster?')) return
    try {
      await deleteWorker(orgId, workerId)
      onNotify?.('Worker profile removed', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete worker', 'error')
    }
  }

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const name = (w.name || w.workerName || '').toLowerCase()
      const phone = (w.phone || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || phone.includes(searchQuery.toLowerCase())
      const matchesSite = siteFilter === 'ALL' || w.assignedSiteId === siteFilter
      const matchesTrade = tradeFilter === 'ALL' || (w.designation || w.trade) === tradeFilter
      return matchesSearch && matchesSite && matchesTrade
    })
  }, [workers, searchQuery, siteFilter, tradeFilter])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Direct Labour Force
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workers Directory & Roster</h1>
          <p className="text-sm text-slate-500 mt-1">
            Register daily wage labour, manage base rate profiles, and monitor ongoing site allocations.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Register Worker</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workers by name, phone..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Sites ({sites.length})</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.siteName || s.projectName}
              </option>
            ))}
          </select>

          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Trades</option>
            {trades.map((t) => (
              <option key={t.id} value={t.trade || t.name}>
                {t.trade || t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Workers Grid */}
      {loading && workers.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading worker roster...</div>
      ) : filteredWorkers.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No workers found in directory</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Register Worker" to add masons, carpenters, or helpers to your labour roster.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWorkers.map((w) => (
            <div
              key={w.id || w.workerId}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
                      {(w.name || w.workerName || 'W').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 leading-snug">{w.name || w.workerName}</h3>
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md mt-0.5 inline-block">
                        {w.designation || w.trade || 'Worker'}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                    Active
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{w.phone || 'No direct phone'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{w.assignedSiteName || 'Central Yard / Unassigned'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Daily Wage</span>
                    <span className="font-bold text-slate-900">
                      ₹{(Number(w.salary || w.dailyWageRate) || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Overtime</span>
                    <span className="font-semibold text-emerald-700">
                      ₹{(Number(w.overtimeHourlyRate) || 120).toLocaleString('en-IN')} / hr
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                <button
                  onClick={() => handleOpenEdit(w)}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  title="Edit Worker"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(w.id || w.workerId)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Worker Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingWorker ? 'Edit Worker Profile' : 'Register Direct Worker'}
                </h3>
                <p className="text-xs text-slate-500">Add to workforce muster roll directory.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Worker Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Suresh Gowda"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Trade / Skill *
                  </label>
                  <select
                    value={formTrade}
                    onChange={(e) => setFormTrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {trades.length > 0 ? (
                      trades.map((t) => (
                        <option key={t.id} value={t.trade || t.name}>
                          {t.trade || t.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Mason">Mason</option>
                        <option value="Male Helper">Male Helper</option>
                        <option value="Female Helper">Female Helper</option>
                        <option value="Carpenter">Carpenter</option>
                        <option value="Barbender">Barbender</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+91 98450 XXXXX"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Daily Base Rate (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formSalary}
                    onChange={(e) => setFormSalary(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Overtime Rate (₹ / hr)
                  </label>
                  <input
                    type="number"
                    value={formOt}
                    onChange={(e) => setFormOt(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Assigned Project Site
                </label>
                <select
                  value={formSiteId}
                  onChange={(e) => setFormSiteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Central Yard / Unassigned</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Worker Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
