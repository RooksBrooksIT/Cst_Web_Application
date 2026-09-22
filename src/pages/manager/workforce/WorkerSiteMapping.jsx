import React, { useState, useEffect, useMemo } from 'react'
import {
  Link2,
  Users,
  Building2,
  Search,
  CheckCircle2,
  ArrowRight,
  Shield,
  Briefcase,
  UserCheck,
} from 'lucide-react'
import {
  fetchWorkers,
  updateWorker,
  mapWorkerToSite,
} from '../../../services/workforceService.js'

export default function WorkerSiteMapping({ orgId, sites = [], currentUser, onNotify }) {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSiteId, setFilterSiteId] = useState('ALL')
  const [transferWorker, setTransferWorker] = useState(null)
  const [targetSiteId, setTargetSiteId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const wrks = await fetchWorkers(orgId)
      setWorkers(wrks || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load worker mappings', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleTransferSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !transferWorker || !targetSiteId) return

    setSubmitting(true)
    try {
      const site = sites.find((s) => s.id === targetSiteId)
      const siteName = site?.siteName || site?.projectName || 'Project Site'

      await mapWorkerToSite(orgId, {
        workerId: transferWorker.id || transferWorker.workerId,
        workerName: transferWorker.name || transferWorker.workerName,
        siteId: targetSiteId,
        siteName,
      })

      onNotify?.(`Worker "${transferWorker.name || transferWorker.workerName}" transferred to ${siteName}!`, 'success')
      setTransferWorker(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to transfer worker', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const name = (w.name || w.workerName || '').toLowerCase()
      const trade = (w.designation || w.trade || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || trade.includes(searchQuery.toLowerCase())
      const matchesSite =
        filterSiteId === 'ALL'
          ? true
          : filterSiteId === 'UNASSIGNED'
          ? !w.assignedSiteId
          : w.assignedSiteId === filterSiteId

      return matchesSearch && matchesSite
    })
  }, [workers, searchQuery, filterSiteId])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Field Deployments
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Worker Site Allocation & Mapping</h1>
          <p className="text-sm text-slate-500 mt-1">
            Reassign and transfer direct workforce between projects to balance trades across active concrete pours.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workers by name, trade..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={filterSiteId}
            onChange={(e) => setFilterSiteId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Allocations ({workers.length})</option>
            <option value="UNASSIGNED">Central Yard / Unassigned</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.siteName || s.projectName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Allocations Table */}
      {loading && workers.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading worker allocations...</div>
      ) : filteredWorkers.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No worker mappings in this view</p>
          <p className="text-xs text-slate-400 mt-1">Select another site filter or register workers in the directory.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Worker Personnel</th>
                  <th className="py-3.5 px-4">Trade Specialization</th>
                  <th className="py-3.5 px-4">Currently Deployed At</th>
                  <th className="py-3.5 px-4">Daily Rate</th>
                  <th className="py-3.5 px-4 text-right">Transfer Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredWorkers.map((w) => {
                  const hasSite = Boolean(w.assignedSiteId)
                  return (
                    <tr key={w.id || w.workerId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-100/70 text-blue-700 font-bold text-xs flex items-center justify-center">
                            {(w.name || w.workerName || 'W').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{w.name || w.workerName}</p>
                            <p className="text-xs text-slate-400">{w.phone || 'Direct Worker'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md">
                          {w.designation || w.trade || 'Worker'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span
                            className={`font-medium ${
                              hasSite ? 'text-slate-900 font-bold' : 'text-slate-400 italic'
                            }`}
                          >
                            {w.assignedSiteName || 'Central Yard / Unassigned'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800 text-xs">
                        ₹{(Number(w.salary || w.dailyWageRate) || 0).toLocaleString('en-IN')} / day
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setTransferWorker(w)
                            setTargetSiteId(sites.length > 0 ? sites[0].id : '')
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span>Reassign Site</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {transferWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Transfer Worker to Site</h3>
                <p className="text-xs text-slate-500">
                  {transferWorker.name || transferWorker.workerName} ({transferWorker.designation || transferWorker.trade})
                </p>
              </div>
              <button onClick={() => setTransferWorker(null)} className="p-1 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Current Assignment:</span>{' '}
                {transferWorker.assignedSiteName || 'Central Yard / Unassigned'}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Project Site *
                </label>
                <select
                  required
                  value={targetSiteId}
                  onChange={(e) => setTargetSiteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
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
                  onClick={() => setTransferWorker(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
