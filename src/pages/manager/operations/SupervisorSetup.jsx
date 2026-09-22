import React, { useState, useEffect, useMemo } from 'react'
import {
  UserCheck,
  UserPlus,
  Users,
  Search,
  KeyRound,
  Phone,
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  Building2,
  Power,
  Edit2,
  Lock,
  RefreshCw,
  Eye,
  EyeOff,
  User,
} from 'lucide-react'
import {
  fetchSupervisors,
  createSupervisor,
  updateSupervisor,
  toggleSupervisorStatus,
  checkSupervisorUniqueness,
} from '../../../services/supervisorService.js'

export default function SupervisorSetup({ orgId, sites = [], currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState('directory') // 'directory' | 'create'
  const [supervisors, setSupervisors] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'ACTIVE' | 'INACTIVE'

  // Create form state
  const [formFullName, setFormFullName] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formDesignation, setFormDesignation] = useState('Site Supervisor')
  const [formAssignedSites, setFormAssignedSites] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Uniqueness validation errors
  const [uniquenessError, setUniquenessError] = useState(null)
  const [validatingField, setValidatingField] = useState(false)

  // Edit / Password Reset Modal
  const [editingSupervisor, setEditingSupervisor] = useState(null)
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editDesignation, setEditDesignation] = useState('')
  const [editNewPassword, setEditNewPassword] = useState('')

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchSupervisors(orgId)
      setSupervisors(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load supervisor profiles', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  // Debounced check for uniqueness
  useEffect(() => {
    if (!formUsername && !formPhone && !formEmail) {
      setUniquenessError(null)
      return
    }

    const timer = setTimeout(async () => {
      setValidatingField(true)
      try {
        const res = await checkSupervisorUniqueness(orgId, {
          username: formUsername,
          phone: formPhone,
          email: formEmail,
        })
        if (!res.isUnique) {
          setUniquenessError(res.message)
        } else {
          setUniquenessError(null)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setValidatingField(false)
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [formUsername, formPhone, formEmail, orgId])

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (uniquenessError) {
      onNotify?.(uniquenessError, 'error')
      return
    }

    setSubmitting(true)
    try {
      await createSupervisor(
        orgId,
        {
          fullName: formFullName.trim(),
          username: formUsername.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          password: formPassword.trim(),
          designation: formDesignation,
          assignedSites: formAssignedSites,
        },
        currentUser
      )

      onNotify?.(`Supervisor account for "${formFullName}" created successfully!`, 'success')
      // Reset form
      setFormFullName('')
      setFormUsername('')
      setFormPhone('')
      setFormEmail('')
      setFormPassword('')
      setFormAssignedSites([])
      setActiveTab('directory')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to create supervisor', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleStatus = async (sup) => {
    const newStatus = !(sup.isActive !== false && sup.status !== 'Inactive')
    try {
      await toggleSupervisorStatus(orgId, sup.id || sup.supervisorId, newStatus)
      onNotify?.(
        `Supervisor "${sup.fullName || sup.FullName}" marked as ${newStatus ? 'Active' : 'Inactive'}`,
        'info'
      )
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to update supervisor status', 'error')
    }
  }

  const handleOpenEdit = (sup) => {
    setEditingSupervisor(sup)
    setEditPhone(sup.phone || sup.ContactNo || '')
    setEditEmail(sup.email || sup.Email || '')
    setEditDesignation(sup.designation || sup.Designation || 'Site Supervisor')
    setEditNewPassword('')
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingSupervisor || !orgId) return

    setSubmitting(true)
    try {
      const updates = {
        phone: editPhone.trim(),
        email: editEmail.trim(),
        designation: editDesignation.trim(),
      }
      if (editNewPassword.trim()) {
        updates.password = editNewPassword.trim()
      }

      await updateSupervisor(orgId, editingSupervisor.id || editingSupervisor.supervisorId, updates)
      onNotify?.('Supervisor details updated', 'success')
      setEditingSupervisor(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update supervisor', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered supervisors
  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((sup) => {
      const name = (sup.fullName || sup.FullName || sup.name || '').toLowerCase()
      const uname = (sup.username || sup.UserName || '').toLowerCase()
      const phone = (sup.phone || sup.ContactNo || '').toLowerCase()
      const matchesSearch =
        name.includes(searchQuery.toLowerCase()) ||
        uname.includes(searchQuery.toLowerCase()) ||
        phone.includes(searchQuery.toLowerCase())

      const isActive = sup.isActive !== false && sup.status !== 'Inactive'
      const matchesStatus =
        statusFilter === 'ALL' || (statusFilter === 'ACTIVE' && isActive) || (statusFilter === 'INACTIVE' && !isActive)

      return matchesSearch && matchesStatus
    })
  }, [supervisors, searchQuery, statusFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              Field Operations Staff
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Supervisor Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Provision site supervisors with secure mobile credentials and manage their field active statuses.
          </p>
        </div>

        {/* Action Toggle */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('directory')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'directory' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-slate-500" />
            <span>Staff Directory ({supervisors.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'create' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Supervisor</span>
          </button>
        </div>
      </div>

      {/* TAB 0: CREATE SUPERVISOR */}
      {activeTab === 'create' && (
        <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Provision New Supervisor Account</h2>
              <p className="text-xs text-slate-500">
                Supervisor can use these credentials to sign in directly on the mobile app.
              </p>
            </div>
          </div>

          {uniquenessError && (
            <div className="p-3.5 mb-6 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs font-medium text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uniquenessError}</span>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Mobile Login Username *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="e.g. ramesh_cst"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 lowercase"
                  />
                  {validatingField && (
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contact Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address (Optional)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. ramesh@cst.com"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Mobile Login Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    minLength={6}
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Designation / Role
                </label>
                <select
                  value={formDesignation}
                  onChange={(e) => setFormDesignation(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="Site Supervisor">Site Supervisor</option>
                  <option value="Senior Civil Supervisor">Senior Civil Supervisor</option>
                  <option value="Junior Site Engineer">Junior Site Engineer</option>
                  <option value="MEP Field Supervisor">MEP Field Supervisor</option>
                  <option value="General Foreman">General Foreman</option>
                </select>
              </div>
            </div>

            {/* Assigned Sites Multi-Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Initial Construction Sites Assignment
              </label>
              <div className="max-h-40 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
                {sites.length === 0 ? (
                  <p className="text-xs text-slate-400">No sites available in project portfolio.</p>
                ) : (
                  sites.map((site) => {
                    const isChecked = formAssignedSites.includes(site.id)
                    return (
                      <label
                        key={site.id}
                        className="flex items-center gap-3 py-2 cursor-pointer hover:bg-white px-2 rounded-lg transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormAssignedSites([...formAssignedSites, site.id])
                            } else {
                              setFormAssignedSites(formAssignedSites.filter((id) => id !== site.id))
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300"
                        />
                        <span className="text-xs font-medium text-slate-800">
                          {site.siteName || site.projectName}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || Boolean(uniquenessError)}
                className="px-6 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Creating Profile...' : 'Save & Issue Mobile Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 1: SUPERVISOR DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff by name, phone, user..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="ALL">All Supervisors ({supervisors.length})</option>
                <option value="ACTIVE">Active Staff</option>
                <option value="INACTIVE">Inactive / Suspended</option>
              </select>
            </div>
          </div>

          {/* Supervisors Table / Cards */}
          {loading && supervisors.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading supervisor directory...</div>
          ) : filteredSupervisors.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No supervisors registered yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "Create Supervisor" to provision credentials for your site engineers.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Supervisor Profile</th>
                      <th className="py-3.5 px-4">Credentials & Contact</th>
                      <th className="py-3.5 px-4">Assigned Sites</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredSupervisors.map((sup) => {
                      const isActive = sup.isActive !== false && sup.status !== 'Inactive'
                      const assigned = Array.isArray(sup.assignedSites) ? sup.assignedSites : []

                      return (
                        <tr key={sup.id || sup.supervisorId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-blue-100/70 text-blue-700 font-bold text-xs flex items-center justify-center">
                                {(sup.fullName || sup.FullName || 'S').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 leading-snug">
                                  {sup.fullName || sup.FullName || sup.name}
                                </p>
                                <p className="text-xs text-slate-500">{sup.designation || sup.Designation || 'Field Supervisor'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5 text-xs">
                              <div className="font-mono text-slate-700 flex items-center gap-1">
                                <span className="text-slate-400">User:</span>
                                <span className="font-semibold">{sup.username || sup.UserName}</span>
                              </div>
                              <div className="text-slate-500 flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{sup.phone || sup.ContactNo || 'No phone'}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {assigned.length === 0 ? (
                                <span className="text-xs text-slate-400 italic">No sites assigned</span>
                              ) : (
                                assigned.map((siteId) => {
                                  const site = sites.find((s) => s.id === siteId)
                                  return (
                                    <span
                                      key={siteId}
                                      className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-medium rounded-md"
                                    >
                                      {site?.siteName || site?.projectName || siteId}
                                    </span>
                                  )
                                })
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}
                              />
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEdit(sup)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit / Reset Password"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleStatus(sup)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isActive
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={isActive ? 'Deactivate Account' : 'Activate Account'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit / Password Reset Modal */}
      {editingSupervisor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit {editingSupervisor.fullName || editingSupervisor.FullName}
                </h3>
                <p className="text-xs text-slate-500 font-mono">@{editingSupervisor.username || editingSupervisor.UserName}</p>
              </div>
              <button onClick={() => setEditingSupervisor(null)} className="p-1 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Designation
                </label>
                <input
                  type="text"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/60">
                <label className="block text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  Reset Mobile Password
                </label>
                <input
                  type="password"
                  placeholder="Leave blank to keep existing password"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSupervisor(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl"
                >
                  {submitting ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
