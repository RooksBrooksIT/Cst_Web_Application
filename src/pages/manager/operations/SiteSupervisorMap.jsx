import React, { useState, useEffect, useMemo } from 'react'
import {
  Link2,
  Unlink,
  Building2,
  UserCheck,
  Calendar,
  Layers,
  Search,
  Plus,
  AlertCircle,
  CheckCircle2,
  User,
  Shield,
  HelpCircle,
} from 'lucide-react'
import {
  fetchSiteSupervisorMappings,
  mapSupervisorToSite,
  removeSupervisorMapping,
  fetchSupervisors,
} from '../../../services/supervisorService.js'

export default function SiteSupervisorMap({ orgId, sites = [], currentUser, onNotify }) {
  const [mappings, setMappings] = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')

  // New mapping form state
  const [showAddModal, setShowAddModal] = useState(false)
  const [formSiteId, setFormSiteId] = useState('')
  const [formSupervisorId, setFormSupervisorId] = useState('')
  const [formProjectStage, setFormProjectStage] = useState('Superstructure Columns & RCC Slabs')
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0])
  const [formComments, setFormComments] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Unlink modal
  const [unlinkModal, setUnlinkModal] = useState(null)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [maps, sups] = await Promise.all([
        fetchSiteSupervisorMappings(orgId),
        fetchSupervisors(orgId),
      ])
      setMappings(maps || [])
      setSupervisors(sups || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load site supervisor assignments', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleCreateMapping = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!formSiteId || !formSupervisorId) {
      onNotify?.('Please select both a site and a supervisor', 'error')
      return
    }

    setSubmitting(true)
    try {
      const site = sites.find((s) => s.id === formSiteId)
      const sup = supervisors.find((s) => (s.id || s.supervisorId) === formSupervisorId)

      await mapSupervisorToSite(
        orgId,
        {
          siteId: formSiteId,
          siteName: site?.siteName || site?.projectName || 'Project Site',
          siteCode: site?.siteCode || '',
          supervisorId: formSupervisorId,
          supervisorName: sup?.fullName || sup?.FullName || sup?.name || 'Supervisor',
          projectStage: formProjectStage,
          location: site?.location || '',
          startDate: formStartDate,
          comments: formComments,
        },
        currentUser
      )

      onNotify?.('Supervisor successfully assigned to site!', 'success')
      setShowAddModal(false)
      setFormSiteId('')
      setFormSupervisorId('')
      setFormComments('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to map supervisor', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmUnlink = async () => {
    if (!unlinkModal || !orgId) return
    try {
      await removeSupervisorMapping(
        orgId,
        unlinkModal.id,
        unlinkModal.siteId,
        unlinkModal.supervisorId || unlinkModal['Supervisor ID']
      )
      onNotify?.('Supervisor assignment removed from site', 'info')
      setUnlinkModal(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to remove assignment', 'error')
    }
  }

  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      const siteName = (m.siteName || m.projectName || '').toLowerCase()
      const supName = (m.supervisorName || m.supervisor || '').toLowerCase()
      const stage = (m.projectStage || '').toLowerCase()
      const matchesSearch =
        siteName.includes(searchQuery.toLowerCase()) ||
        supName.includes(searchQuery.toLowerCase()) ||
        stage.includes(searchQuery.toLowerCase())

      const matchesSite = selectedSiteFilter === 'ALL' || m.siteId === selectedSiteFilter

      return matchesSearch && matchesSite
    })
  }, [mappings, searchQuery, selectedSiteFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Field Deployments
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Site-Supervisor Map</h1>
          <p className="text-sm text-slate-500 mt-1">
            Map qualified field supervisors to specific construction sites and milestones for daily entry delegation.
          </p>
        </div>
        <button
          onClick={() => {
            if (sites.length > 0 && !formSiteId) setFormSiteId(sites[0].id)
            if (supervisors.length > 0 && !formSupervisorId) setFormSupervisorId(supervisors[0].id || supervisors[0].supervisorId)
            setShowAddModal(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Assign Supervisor to Site</span>
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
            placeholder="Search assignments by site, supervisor..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={selectedSiteFilter}
            onChange={(e) => setSelectedSiteFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Project Sites ({sites.length})</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.siteName || s.projectName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mappings Table */}
      {loading && mappings.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading assignments...</div>
      ) : filteredMappings.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Link2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No supervisor assignments recorded</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Assign Supervisor to Site" to grant mobile site entry permissions to an engineer.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Construction Site</th>
                  <th className="py-3.5 px-4">Assigned Supervisor</th>
                  <th className="py-3.5 px-4">Supervised Stage</th>
                  <th className="py-3.5 px-4">Effective Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMappings.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 leading-snug">
                            {item.siteName || item.projectName || 'Site'}
                          </p>
                          <p className="text-xs text-slate-400">{item.location || 'Active Project'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                          <UserCheck className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-slate-800">
                          {item.supervisorName || item.supervisor}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-md inline-block">
                        {item.projectStage || 'All Stages'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {item.startDate ? new Date(item.startDate?.seconds ? item.startDate.seconds * 1000 : item.startDate).toLocaleDateString() : 'Active'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setUnlinkModal(item)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Unlink supervisor from site"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>De-link</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Assignment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assign Field Supervisor</h3>
                <p className="text-xs text-slate-500">Connect a supervisor to a project site for daily log authority.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMapping} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Target Project Site *
                </label>
                <select
                  required
                  value={formSiteId}
                  onChange={(e) => setFormSiteId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select Site...</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Field Supervisor *
                </label>
                <select
                  required
                  value={formSupervisorId}
                  onChange={(e) => setFormSupervisorId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select Supervisor...</option>
                  {supervisors.map((sup) => (
                    <option key={sup.id || sup.supervisorId} value={sup.id || sup.supervisorId}>
                      {sup.fullName || sup.FullName || sup.name} (@{sup.username || sup.UserName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Assigned Project Stage
                  </label>
                  <input
                    type="text"
                    value={formProjectStage}
                    onChange={(e) => setFormProjectStage(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Start / Effective Date
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Assignment Directives / Comments
                </label>
                <textarea
                  rows="2"
                  value={formComments}
                  onChange={(e) => setFormComments(e.target.value)}
                  placeholder="e.g. In charge of structural columns casting and batching plant coordination"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl"
                >
                  {submitting ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unlink Confirmation */}
      {unlinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">De-link Supervisor?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Revoke <span className="font-semibold text-slate-800">"{unlinkModal.supervisorName}"</span>'s access to{' '}
              <span className="font-semibold text-slate-800">"{unlinkModal.siteName}"</span>? They will no longer be
              able to submit daily progress entries for this site.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setUnlinkModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnlink}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                De-link Supervisor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
