import React, { useState, useEffect, useMemo } from 'react'
import {
  Coins,
  Plus,
  Search,
  Sparkles,
  Trash2,
  AlertCircle,
  IndianRupee,
  Clock,
  Briefcase,
  X,
} from 'lucide-react'
import {
  fetchLabourScales,
  createLabourScale,
  deleteLabourScale,
  DEFAULT_LABOUR_CATEGORIES,
} from '../../../services/workforceService.js'

export default function LabourWageScales({ orgId, onNotify }) {
  const [scales, setScales] = useState([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Form modal
  const [showModal, setShowModal] = useState(false)
  const [formTrade, setFormTrade] = useState('')
  const [formDailyWage, setFormDailyWage] = useState('')
  const [formOtRate, setFormOtRate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchLabourScales(orgId)
      setScales(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load wage scales', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleAddScale = async (e) => {
    e.preventDefault()
    if (!orgId || !formTrade.trim()) return

    setSubmitting(true)
    try {
      await createLabourScale(orgId, {
        trade: formTrade.trim(),
        dailyWage: Number(formDailyWage) || 800,
        otHourlyRate: Number(formOtRate) || 120,
      })

      onNotify?.(`Wage scale for "${formTrade}" added!`, 'success')
      setShowModal(false)
      setFormTrade('')
      setFormDailyWage('')
      setFormOtRate('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to add wage scale', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id, trade) => {
    if (!orgId || !id) return
    if (!window.confirm(`Delete wage scale for "${trade}"?`)) return
    try {
      await deleteLabourScale(orgId, id)
      onNotify?.(`Wage scale for "${trade}" removed`, 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete wage scale', 'error')
    }
  }

  const handleSeedDefaults = async () => {
    if (!orgId) return
    setSeeding(true)
    try {
      for (const item of DEFAULT_LABOUR_CATEGORIES) {
        if (!scales.some((s) => (s.trade || s.name)?.toLowerCase() === item.trade.toLowerCase())) {
          await createLabourScale(orgId, item)
        }
      }
      onNotify?.('Industry standard labour wage scales loaded successfully!', 'success')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load defaults', 'error')
    } finally {
      setSeeding(false)
    }
  }

  const filteredScales = useMemo(() => {
    return scales.filter((s) => {
      const trade = (s.trade || s.name || '').toLowerCase()
      return trade.includes(searchQuery.toLowerCase())
    })
  }, [scales, searchQuery])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              Payroll Governance
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Labour Wage Scales & Trade Rates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Standardize daily base shifts and overtime hourly rates across masons, carpenters, bar benders, and helpers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDefaults}
            disabled={seeding || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{seeding ? 'Seeding...' : 'Load Standard Trades'}</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Trade Scale</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trade role..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <span className="text-xs text-slate-400 font-medium">{filteredScales.length} Active Wage Scales</span>
      </div>

      {/* Scales Cards */}
      {loading && scales.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading wage scales...</div>
      ) : filteredScales.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Coins className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No wage scales registered</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Load Standard Trades" to populate civil trade rates or "Add Trade Scale" to create custom wage categories.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredScales.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-all group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    <Coins className="w-4 h-4" />
                  </div>
                  <button
                    onClick={() => handleDelete(s.id, s.trade || s.name)}
                    className="p-1 text-slate-300 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-900 mt-3">{s.trade || s.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Civil & MEP Trade Scale</p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Standard Daily Shift (8h):</span>
                    <span className="text-base font-bold text-slate-900">
                      ₹{(Number(s.dailyWage) || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500">Overtime Rate:</span>
                    <span className="font-semibold text-emerald-700">
                      ₹{(Number(s.otHourlyRate) || 0).toLocaleString('en-IN')} / hr
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Trade Wage Scale</h3>
                <p className="text-xs text-slate-500">Benchmark daily rates for muster roll payroll.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddScale} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Trade Role / Designation *
                </label>
                <input
                  type="text"
                  required
                  value={formTrade}
                  onChange={(e) => setFormTrade(e.target.value)}
                  placeholder="e.g. Tile Mason / Polisher"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Daily Base Wage (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formDailyWage}
                    onChange={(e) => setFormDailyWage(e.target.value)}
                    placeholder="e.g. 950"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Overtime Rate (₹ / hr)
                  </label>
                  <input
                    type="number"
                    value={formOtRate}
                    onChange={(e) => setFormOtRate(e.target.value)}
                    placeholder="e.g. 150"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
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
                  {submitting ? 'Saving...' : 'Add Trade Scale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
