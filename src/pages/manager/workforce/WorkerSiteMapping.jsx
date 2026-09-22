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
  AlertTriangle,
  X,
  Plus,
  Save,
  RefreshCw,
  Sparkles,
  Phone,
  Trash2,
} from 'lucide-react'
import {
  fetchWorkers,
  subscribeWorkers,
  subscribeSiteWorkerMapping,
  subscribeAllSiteMappings,
  saveSiteWorkerMapping,
} from '../../../services/workforceService.js'

export default function WorkerSiteMapping({ orgId, sites = [], currentUser, onNotify }) {
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [allWorkers, setAllWorkers] = useState([])
  const [allSiteMappings, setAllSiteMappings] = useState([])
  const [currentSiteMapping, setCurrentSiteMapping] = useState(null)
  const [loading, setLoading] = useState(true)

  // Allocation Staging State
  const [selectedWorkerId, setSelectedWorkerId] = useState('')
  const [stagedWorkers, setStagedWorkers] = useState([])
  const [savingDeploy, setSavingDeploy] = useState(false)

  // Filter & Search
  const [searchRoster, setSearchRoster] = useState('')

  // Auto-select first site
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id)
    }
  }, [sites, selectedSiteId])

  // Real-time Subscriptions
  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    // 1. Subscribe to Workers Master
    const unsubWorkers = subscribeWorkers(
      orgId,
      (data) => {
        setAllWorkers(data || [])
        setLoading(false)
      },
      (err) => {
        console.error('Workers sub error:', err)
        setLoading(false)
      }
    )

    // 2. Subscribe to All Site Mappings (for live cross-site conflict detection)
    const unsubAllMappings = subscribeAllSiteMappings(
      orgId,
      (data) => setAllSiteMappings(data || []),
      (err) => console.error('All mappings sub error:', err)
    )

    return () => {
      unsubWorkers?.()
      unsubAllMappings?.()
    }
  }, [orgId])

  // Subscribe to Currently Selected Site Mapping
  useEffect(() => {
    if (!orgId || !selectedSiteId) return

    const unsubSelected = subscribeSiteWorkerMapping(
      orgId,
      selectedSiteId,
      (mapping) => {
        setCurrentSiteMapping(mapping)
        // Initialize staged workers with current roster from database
        if (mapping && Array.isArray(mapping.workers)) {
          setStagedWorkers(mapping.workers)
        } else {
          setStagedWorkers([])
        }
      },
      (err) => console.error('Selected site mapping error:', err)
    )

    return () => unsubSelected?.()
  }, [orgId, selectedSiteId])

  // Selected site object
  const selectedSiteObj = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId) || null
  }, [sites, selectedSiteId])

  const currentSupervisor = useMemo(() => {
    return (
      selectedSiteObj?.assignedSupervisor ||
      selectedSiteObj?.supervisorName ||
      selectedSiteObj?.supervisor ||
      currentSiteMapping?.supervisor ||
      'Site In-Charge'
    )
  }, [selectedSiteObj, currentSiteMapping])

  // Map of workerId -> assigned site info across all other sites
  const workerLocationMap = useMemo(() => {
    const map = {}
    allSiteMappings.forEach((siteDoc) => {
      const sId = siteDoc.siteId || siteDoc.site || siteDoc.id
      const sName = siteDoc.siteName || siteDoc.projectName || sId
      const list = siteDoc.workers || []
      list.forEach((w) => {
        const wId = (w.workerId || w.id || '').toString().toLowerCase()
        if (wId) {
          map[wId] = {
            siteId: sId,
            siteName: sName,
            workerName: w.workerName || w.name,
            mappingDate: w.mappingDate,
          }
        }
      })
    })
    return map
  }, [allSiteMappings])

  // Conflict state for currently selected dropdown worker
  const selectedWorkerObj = useMemo(() => {
    return allWorkers.find((w) => (w.workerId || w.id) === selectedWorkerId) || null
  }, [allWorkers, selectedWorkerId])

  const workerConflict = useMemo(() => {
    if (!selectedWorkerId) return null
    const loc = workerLocationMap[selectedWorkerId.toLowerCase()]
    if (loc && loc.siteId !== selectedSiteId) {
      return loc
    }
    return null
  }, [selectedWorkerId, workerLocationMap, selectedSiteId])

  // Add Worker to Staging Roster
  const handleAddWorkerToRoster = () => {
    if (!selectedWorkerObj) {
      onNotify?.('Please select a worker from the dropdown', 'error')
      return
    }

    const workerId = selectedWorkerObj.workerId || selectedWorkerObj.id
    const alreadyStaged = stagedWorkers.some((w) => (w.workerId || w.id) === workerId)
    if (alreadyStaged) {
      onNotify?.(`Worker "${selectedWorkerObj.name || selectedWorkerObj.workerName}" is already in this site roster`, 'error')
      return
    }

    const newEntry = {
      workerId,
      workerName: selectedWorkerObj.name || selectedWorkerObj.workerName,
      workerDesignation: selectedWorkerObj.designation || selectedWorkerObj.trade || 'Worker',
      workerSalary: String(selectedWorkerObj.salary || selectedWorkerObj.dailyWageRate || 800),
      workerPhone: selectedWorkerObj.phoneNumber || selectedWorkerObj.phone || '',
      siteId: selectedSiteId,
      siteName: selectedSiteObj?.siteName || selectedSiteObj?.projectName || selectedSiteId,
      assignmentStatus: 'Active',
      mappingDate: new Date().toLocaleDateString('en-GB'),
    }

    setStagedWorkers((prev) => [...prev, newEntry])
    setSelectedWorkerId('')
    onNotify?.(`Added "${newEntry.workerName}" to deployment queue`, 'info')
  }

  // Remove Worker from Staging
  const handleRemoveFromRoster = (workerId) => {
    setStagedWorkers((prev) => prev.filter((w) => (w.workerId || w.id) !== workerId))
  }

  // Commit Deployment to Database
  const handleConfirmDeployment = async () => {
    if (!orgId || !selectedSiteId) return
    const siteName = selectedSiteObj?.siteName || selectedSiteObj?.projectName || selectedSiteId

    setSavingDeploy(true)
    try {
      await saveSiteWorkerMapping(
        orgId,
        selectedSiteId,
        siteName,
        currentSupervisor,
        stagedWorkers
      )

      onNotify?.(
        `Workforce deployment confirmed! ${stagedWorkers.length} worker(s) successfully mapped to ${siteName}.`,
        'success'
      )
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to save workforce allocation', 'error')
    } finally {
      setSavingDeploy(false)
    }
  }

  // Filtered Roster for View
  const filteredRoster = useMemo(() => {
    return stagedWorkers.filter((w) => {
      const name = (w.workerName || w.name || '').toLowerCase()
      const trade = (w.workerDesignation || w.designation || w.trade || '').toLowerCase()
      const q = searchRoster.toLowerCase().trim()
      return !q || name.includes(q) || trade.includes(q)
    })
  }, [stagedWorkers, searchRoster])

  // Trade breakdown counts
  const tradeBreakdown = useMemo(() => {
    const map = {}
    stagedWorkers.forEach((w) => {
      const t = w.workerDesignation || w.designation || w.trade || 'Worker'
      map[t] = (map[t] || 0) + 1
    })
    return map
  }, [stagedWorkers])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/50">
              Field Deployments & Transfer Ledger
            </span>
            <span className="text-xs font-medium text-slate-400">• Mobile Synced Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workers Site Mapping</h1>
          <p className="text-sm text-slate-500 mt-1">
            Allocate registered labour force to project sites, detect scheduling conflicts, and manage cross-site transfers.
          </p>
        </div>

        <button
          onClick={handleConfirmDeployment}
          disabled={savingDeploy || !selectedSiteId}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{savingDeploy ? 'Saving Deployments...' : `Confirm & Deploy Workers (${stagedWorkers.length})`}</span>
        </button>
      </div>

      {/* 1. SITE CONTEXT & SELECTOR CARD */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Target Project Site:
            </label>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName || s.projectName || s.id} [{s.id}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Context Badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1 bg-slate-100 rounded-lg text-slate-700 font-medium">
              <span className="text-slate-400 mr-1.5">Site ID:</span>
              <strong className="font-mono">{selectedSiteId}</strong>
            </div>

            <div className="px-3 py-1 bg-emerald-50 rounded-lg text-emerald-800 font-medium border border-emerald-200/60">
              <span className="text-emerald-600 mr-1.5">Supervisor:</span>
              <strong>{currentSupervisor}</strong>
            </div>

            <div className="px-3 py-1 bg-blue-50 rounded-lg text-blue-800 font-bold border border-blue-200/60">
              <span>{stagedWorkers.length} Deployed</span>
            </div>
          </div>
        </div>

        {/* 2. WORKER SELECTION & CONFLICT DETECTION INTERFACE */}
        <div className="pt-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Select Worker to Deploy onto this Site
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-900 font-medium"
              >
                <option value="">Select a registered worker from master directory...</option>
                {allWorkers.map((w) => {
                  const wId = w.workerId || w.id
                  const name = w.name || w.workerName
                  const trade = w.designation || w.trade || 'Worker'
                  const isStaged = stagedWorkers.some((sw) => (sw.workerId || sw.id) === wId)
                  const assignedElsewhere = workerLocationMap[wId?.toLowerCase()]
                  const isOtherSite = assignedElsewhere && assignedElsewhere.siteId !== selectedSiteId

                  return (
                    <option key={wId} value={wId}>
                      {name} [{wId}] — {trade} (₹{w.salary || w.dailyWageRate}/d)
                      {isStaged ? ' [Already in this site]' : isOtherSite ? ` [Mapped to ${assignedElsewhere.siteName}]` : ' [Available]'}
                    </option>
                  )
                })}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddWorkerToRoster}
              disabled={!selectedWorkerId}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Worker to Site</span>
            </button>
          </div>

          {/* CROSS-SITE CONFLICT BANNER */}
          {workerConflict && (
            <div className="mt-3 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div>
                <strong className="block text-amber-900 font-bold">Cross-Site Scheduling Notice:</strong>
                <p className="mt-0.5 text-amber-800">
                  Worker <strong>"{selectedWorkerObj?.name}"</strong> is currently deployed at Site{' '}
                  <strong>"{workerConflict.siteName}"</strong>. Confirming deployment here will automatically and atomically transfer them from {workerConflict.siteName}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. CURRENT DEPLOYMENT ROSTER TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Roster Header Toolbar */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Active Site Workforce Roster ({stagedWorkers.length})
            </h3>
            <p className="text-xs text-slate-500">
              Personnel mapped to {selectedSiteObj?.siteName || selectedSiteId}. Directly feeds daily supervisor muster roll.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchRoster}
                onChange={(e) => setSearchRoster(e.target.value)}
                placeholder="Filter by name or trade..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Trade Badges Strip */}
        {Object.keys(tradeBreakdown).length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Trades Composition:
            </span>
            {Object.entries(tradeBreakdown).map(([trade, count]) => (
              <span
                key={trade}
                className="px-2.5 py-0.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
              >
                {trade}: <strong className="text-blue-700">{count}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Roster Table */}
        {stagedWorkers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No workforce deployed to this site yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Select workers from the dropdown above and click "Add Worker to Site" to build the site muster.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Worker Personnel</th>
                  <th className="py-3 px-4">Trade Specialization</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Base Daily Wage</th>
                  <th className="py-3 px-4">Deployment Date</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRoster.map((w) => {
                  const workerId = w.workerId || w.id
                  const name = w.workerName || w.name
                  const trade = w.workerDesignation || w.designation || w.trade
                  const phone = w.workerPhone || w.phone
                  const wage = Number(w.workerSalary || w.salary || w.dailyWageRate) || 0

                  return (
                    <tr key={workerId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {(name || 'W').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{name}</p>
                            <span className="font-mono text-[10px] text-slate-400">{workerId}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold rounded-md">
                          {trade}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {phone ? `+91 ${phone}` : '—'}
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-900 text-xs">
                        ₹{wage.toLocaleString('en-IN')} / day
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-500 font-medium">
                        {w.mappingDate || new Date().toLocaleDateString('en-GB')}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleRemoveFromRoster(workerId)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove from this Site Roster"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
