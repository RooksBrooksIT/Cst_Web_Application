import React, { useState, useEffect, useMemo } from 'react'
import {
  Wrench,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Building2,
  Calendar,
  X,
  UserCheck,
  AlertCircle,
} from 'lucide-react'
import {
  fetchToolMovements,
  dispatchToolMovement,
  recordToolReturn,
  fetchTools,
} from '../../../services/toolService.js'

export default function ToolsMovements({ orgId, sites = [], currentUser, onNotify }) {
  const [movements, setMovements] = useState([])
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'Dispatched' | 'Returned'

  // Dispatch Modal
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [selectedToolId, setSelectedToolId] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [supervisorName, setSupervisorName] = useState('')
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [dispatchNotes, setDispatchNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Return Modal
  const [returnMovement, setReturnMovement] = useState(null)
  const [returnCondition, setReturnCondition] = useState('Working') // 'Working' | 'Damaged' | 'Needs Service'
  const [submittingReturn, setSubmittingReturn] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [moves, tls] = await Promise.all([
        fetchToolMovements(orgId),
        fetchTools(orgId),
      ])
      setMovements(moves || [])
      setTools(tls || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load tool movements', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const availableTools = useMemo(() => {
    return tools.filter((t) => t.status === 'Available' || !t.status)
  }, [tools])

  const handleDispatchSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !selectedToolId || !selectedSiteId) {
      onNotify?.('Select both an equipment item and project site', 'error')
      return
    }

    setSubmitting(true)
    try {
      const tool = tools.find((t) => (t.id || t.toolId) === selectedToolId)
      const site = sites.find((s) => s.id === selectedSiteId)

      await dispatchToolMovement(
        orgId,
        {
          toolId: selectedToolId,
          toolName: tool?.toolName || tool?.name || 'Equipment',
          toolCode: tool?.toolCode || '',
          siteId: selectedSiteId,
          siteName: site?.siteName || site?.projectName || 'Project Site',
          supervisorName: supervisorName || 'Site Engineer',
          expectedReturnDate,
          notes: dispatchNotes,
        },
        currentUser
      )

      onNotify?.('Equipment dispatched to site custody!', 'success')
      setShowDispatchModal(false)
      setSelectedToolId('')
      setSupervisorName('')
      setDispatchNotes('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to dispatch equipment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReturnSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !returnMovement) return

    setSubmittingReturn(true)
    try {
      await recordToolReturn(
        orgId,
        returnMovement.id || returnMovement.movementId,
        returnMovement.toolId,
        returnCondition,
        currentUser
      )

      onNotify?.('Equipment return confirmed and logged back to yard!', 'success')
      setReturnMovement(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to record return', 'error')
    } finally {
      setSubmittingReturn(false)
    }
  }

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const toolName = (m.toolName || '').toLowerCase()
      const siteName = (m.siteName || '').toLowerCase()
      const sup = (m.supervisorName || '').toLowerCase()
      const matchesSearch =
        toolName.includes(searchQuery.toLowerCase()) ||
        siteName.includes(searchQuery.toLowerCase()) ||
        sup.includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [movements, searchQuery, statusFilter])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
              Custody & Movements
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Equipment Site Custody & Handover</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain strict custody logs for machinery dispatched to site supervisors with return inspection condition tracking.
          </p>
        </div>

        <button
          onClick={() => {
            if (availableTools.length > 0 && !selectedToolId) setSelectedToolId(availableTools[0].id || availableTools[0].toolId)
            if (sites.length > 0 && !selectedSiteId) setSelectedSiteId(sites[0].id)
            setShowDispatchModal(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Dispatch Equipment to Site</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by tool, site, supervisor..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Movements ({movements.length})</option>
            <option value="Dispatched">Currently in Field Custody</option>
            <option value="Returned">Returned to Yard</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      {loading && movements.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading custody log...</div>
      ) : filteredMovements.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <ArrowRightLeft className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No equipment movements recorded</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Dispatch Equipment to Site" to hand over power tools or surveying instruments.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Equipment</th>
                  <th className="py-3.5 px-4">Site Location</th>
                  <th className="py-3.5 px-4">Custody In-Charge</th>
                  <th className="py-3.5 px-4">Dispatch / Return Dates</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMovements.map((item) => {
                  const isDispatched = item.status === 'Dispatched'
                  const dispatchDate = item.dispatchDate?.seconds
                    ? new Date(item.dispatchDate.seconds * 1000).toLocaleDateString()
                    : 'Recent'

                  return (
                    <tr key={item.id || item.movementId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
                            <Wrench className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{item.toolName}</p>
                            <p className="text-xs font-mono text-slate-400">{item.toolCode || 'Asset'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.siteName}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-800">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{item.supervisorName || 'Site Supervisor'}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        <p>Out: {dispatchDate}</p>
                        {item.returnDate && (
                          <p className="text-emerald-700 font-medium">
                            Returned: {new Date(item.returnDate?.seconds ? item.returnDate.seconds * 1000 : item.returnDate).toLocaleDateString()}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isDispatched
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isDispatched ? 'bg-blue-500' : 'bg-emerald-500'
                            }`}
                          />
                          {item.status || 'Dispatched'}
                        </span>
                        {item.returnCondition && (
                          <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">
                            Condition: {item.returnCondition}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isDispatched && (
                          <button
                            onClick={() => {
                              setReturnMovement(item)
                              setReturnCondition('Working')
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Log Return
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Dispatch Equipment to Site</h3>
                <p className="text-xs text-slate-500">Authorize custody transfer to field crew.</p>
              </div>
              <button onClick={() => setShowDispatchModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Select Equipment / Tool *
                </label>
                <select
                  required
                  value={selectedToolId}
                  onChange={(e) => setSelectedToolId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select Equipment...</option>
                  {tools.map((t) => (
                    <option key={t.id || t.toolId} value={t.id || t.toolId}>
                      {t.toolName || t.name} [{t.toolCode || t.id}] - {t.status || 'Available'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Target Construction Site *
                </label>
                <select
                  required
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select Site...</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Custody In-Charge
                  </label>
                  <input
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    placeholder="Supervisor Name"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Expected Return Date
                  </label>
                  <input
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Dispatch Directives / Notes
                </label>
                <textarea
                  rows="2"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="e.g. Issued with 2 spare battery packs and charger"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Dispatching...' : 'Dispatch to Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returnMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Log Equipment Return</h3>
                <p className="text-xs text-slate-500">Acknowledge custody return to Central Yard.</p>
              </div>
              <button onClick={() => setReturnMovement(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <p className="font-semibold text-slate-800">{returnMovement.toolName}</p>
                <p className="text-slate-500 mt-0.5">Returning from: {returnMovement.siteName}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Inspection Condition
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="cond"
                      value="Working"
                      checked={returnCondition === 'Working'}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      className="text-blue-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Good / Fully Functional</span>
                      <p className="text-[11px] text-slate-500">Ready for immediate redeployment.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="cond"
                      value="Needs Service"
                      checked={returnCondition === 'Needs Service'}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      className="text-amber-600"
                    />
                    <div>
                      <span className="font-semibold text-amber-800">Needs Service / Lubrication</span>
                      <p className="text-[11px] text-slate-500">Send to workshop for routine check.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="cond"
                      value="Damaged"
                      checked={returnCondition === 'Damaged'}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      className="text-rose-600"
                    />
                    <div>
                      <span className="font-semibold text-rose-800">Damaged / Broken Part</span>
                      <p className="text-[11px] text-slate-500">Flag for repair or vendor replacement.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturnMovement(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingReturn ? 'Logging Return...' : 'Acknowledge Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
