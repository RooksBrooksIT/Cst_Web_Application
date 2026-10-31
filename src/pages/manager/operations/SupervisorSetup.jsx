import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  Trash2,
} from 'lucide-react'
import {
  fetchSupervisors,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
  toggleSupervisorStatus,
  checkSupervisorUniqueness,
  getNextSupervisorId,
  warmupUsernameCache,
  isUsernameCachedAsTaken,
} from '../../../services/supervisorService.js'
import { SubscriptionLimitService } from '../../../services/subscriptionLimitService.js'
import SubscriptionLimitModal from '../../../components/common/SubscriptionLimitModal.jsx'

export default function SupervisorSetup({ orgId, sites = [], currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState('directory') // 'directory' | 'create'
  const [supervisors, setSupervisors] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'ACTIVE' | 'INACTIVE'

  // Subscription plan limit states
  const [planLimits, setPlanLimits] = useState(null)
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalData, setLimitModalData] = useState(null)

  // Sequential Next Supervisor ID State (SUP001, SUP002, etc.)
  const [nextSupervisorId, setNextSupervisorId] = useState('SUP001')
  const [loadingNextId, setLoadingNextId] = useState(false)

  // Create form state
  const [formFullName, setFormFullName] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formDesignation, setFormDesignation] = useState('Site Supervisor')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Password visibility state in table & edit modal
  const [visiblePasswordIds, setVisiblePasswordIds] = useState({})
  const [showCurrentEditPassword, setShowCurrentEditPassword] = useState(false)
  const [showNewPasswordInEdit, setShowNewPasswordInEdit] = useState(false)

  // Uniqueness validation errors
  const [uniquenessError, setUniquenessError] = useState(null)
  const [validatingField, setValidatingField] = useState(false)

  // Supervisor Username Real-Time Validation State
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameStatusText, setUsernameStatusText] = useState(null)
  const [isUsernameValid, setIsUsernameValid] = useState(null)
  const usernameSeq = useRef(0)

  // Edit / Password Reset Modal
  const [editingSupervisor, setEditingSupervisor] = useState(null)
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editDesignation, setEditDesignation] = useState('')
  const [editNewPassword, setEditNewPassword] = useState('')

  const refreshNextSupervisorId = async () => {
    if (!orgId) return
    setLoadingNextId(true)
    try {
      const nextId = await getNextSupervisorId(orgId)
      setNextSupervisorId(nextId)
    } catch (err) {
      console.error('Failed to calculate next supervisor id:', err)
    } finally {
      setLoadingNextId(false)
    }
  }

  const refreshQuotaAndLimits = async () => {
    if (!orgId) return
    try {
      const limits = await SubscriptionLimitService.getActivePlanLimits(orgId)
      setPlanLimits(limits)
    } catch (err) {
      console.warn('Could not refresh subscription plan limits:', err)
    }
  }

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
    warmupUsernameCache()
    loadData()
    refreshNextSupervisorId()
    refreshQuotaAndLimits()
  }, [orgId])

  const handleSwitchToCreate = async () => {
    if (orgId) {
      try {
        const check = await SubscriptionLimitService.canCreateSupervisor({
          orgId,
          currentPlanName: planLimits?.planName,
          currentSupervisorsCount: supervisors.length,
        })
        if (!check.isAllowed && !check.allowed) {
          setLimitModalData(check)
          setLimitModalOpen(true)
          return
        }
      } catch (err) {
        console.warn('Quota check error:', err)
      }
    }
    setActiveTab('create')
  }

  useEffect(() => {
    if (activeTab === 'create') {
      refreshNextSupervisorId()
    }
  }, [activeTab, orgId])

  // Debounced real-time case-insensitive username validation
  useEffect(() => {
    const clean = formUsername.trim()
    const cleanLower = clean.toLowerCase()
    const seq = ++usernameSeq.current

    if (!clean) {
      setIsCheckingUsername(false)
      setUsernameStatusText(null)
      setIsUsernameValid(null)
      return
    }

    if (clean.length < 3) {
      setIsCheckingUsername(false)
      setUsernameStatusText('Username must be at least 3 characters')
      setIsUsernameValid(false)
      return
    }

    // Instant 0ms synchronous cache check
    if (isUsernameCachedAsTaken(cleanLower)) {
      setIsCheckingUsername(false)
      setUsernameStatusText('Username already exists')
      setIsUsernameValid(false)
      return
    }

    setIsCheckingUsername(true)
    setUsernameStatusText('Checking username...')
    setIsUsernameValid(null)

    const timer = setTimeout(async () => {
      try {
        const res = await checkSupervisorUniqueness(orgId, { username: clean })
        if (seq === usernameSeq.current && formUsername.trim().toLowerCase() === cleanLower) {
          setIsCheckingUsername(false)
          setIsUsernameValid(res.isUnique)
          setUsernameStatusText(res.isUnique ? 'Username is available ✓' : 'Username already exists')
        }
      } catch (_err) {
        if (seq === usernameSeq.current) {
          setIsCheckingUsername(false)
          setIsUsernameValid(false)
          setUsernameStatusText('Error checking username')
        }
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [formUsername, orgId])

  // Debounced check for phone and email uniqueness
  useEffect(() => {
    if (!formPhone && !formEmail) {
      setUniquenessError(null)
      return
    }

    const timer = setTimeout(async () => {
      setValidatingField(true)
      try {
        const res = await checkSupervisorUniqueness(orgId, {
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
  }, [formPhone, formEmail, orgId])

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return

    if (!formPhone || formPhone.length !== 10) {
      setPhoneError('Contact phone number must be exactly 10 digits')
      onNotify?.('Contact phone number must be exactly 10 digits', 'error')
      return
    }

    if (isUsernameValid === false) {
      onNotify?.(usernameStatusText || 'Username already exists', 'error')
      return
    }

    if (uniquenessError) {
      onNotify?.(uniquenessError, 'error')
      return
    }

    setSubmitting(true)
    try {
      const limitCheck = await SubscriptionLimitService.canCreateSupervisor({
        orgId,
        currentPlanName: planLimits?.planName,
        currentSupervisorsCount: supervisors.length,
      })
      if (!limitCheck.allowed) {
        setLimitModalData(limitCheck)
        setLimitModalOpen(true)
        setSubmitting(false)
        return
      }

      const created = await createSupervisor(
        orgId,
        {
          supervisorId: nextSupervisorId,
          fullName: formFullName.trim(),
          username: formUsername.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          password: formPassword.trim(),
          designation: formDesignation,
          assignedSites: [],
        },
        currentUser
      )

      onNotify?.(
        `Supervisor account "${created.SupervisorId || nextSupervisorId}" for "${formFullName}" created successfully!`,
        'success'
      )
      // Reset form
      setFormFullName('')
      setFormUsername('')
      setFormPhone('')
      setPhoneError('')
      setFormEmail('')
      setFormPassword('')
      setIsCheckingUsername(false)
      setUsernameStatusText(null)
      setIsUsernameValid(null)
      setActiveTab('directory')
      await loadData()
      refreshNextSupervisorId()
      await refreshQuotaAndLimits()
    } catch (err) {
      console.error(err)
      if (err.code === 'SUBSCRIPTION_LIMIT_REACHED' || err.code === 'SUBSCRIPTION_EXPIRED' || err.details) {
        setLimitModalData(err.details || {
          reason: err.code === 'SUBSCRIPTION_EXPIRED' ? 'SUBSCRIPTION_EXPIRED' : 'SUPERVISOR_LIMIT_REACHED',
          planName: planLimits?.planName || 'Current Plan',
          currentCount: supervisors.length,
          maxLimit: planLimits?.quotas?.maxSupervisors,
          message: err.message,
        })
        setLimitModalOpen(true)
      } else {
        onNotify?.(err.message || 'Failed to create supervisor', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleStatus = async (sup) => {
    const targetId = sup.SupervisorId || sup.supervisorId || sup.id
    const newStatus = !(sup.isActive !== false && sup.status !== 'Inactive')
    try {
      await toggleSupervisorStatus(orgId, targetId, newStatus)
      onNotify?.(
        `Supervisor "${sup.fullName || sup.FullName}" marked as ${newStatus ? 'Active' : 'Inactive'}`,
        'info'
      )
      await loadData()
      await refreshQuotaAndLimits()
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
    setShowCurrentEditPassword(false)
    setShowNewPasswordInEdit(false)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingSupervisor || !orgId) return

    const cleanEditPhone = editPhone.replace(/\D/g, '')
    if (cleanEditPhone && cleanEditPhone.length !== 10) {
      onNotify?.('Contact phone number must be exactly 10 digits', 'error')
      return
    }

    const targetId = editingSupervisor.SupervisorId || editingSupervisor.supervisorId || editingSupervisor.id
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

      await updateSupervisor(orgId, targetId, updates)
      onNotify?.('Supervisor details updated', 'success')
      setEditingSupervisor(null)
      await loadData()
      await refreshQuotaAndLimits()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update supervisor', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSupervisor = async (sup) => {
    const targetId = sup.SupervisorId || sup.supervisorId || sup.id
    const supName = sup.fullName || sup.FullName || sup.name || targetId
    if (!window.confirm(`Are you sure you want to remove supervisor "${supName}" (${targetId})? This will delete their mobile login access.`)) {
      return
    }
    setLoading(true)
    try {
      await deleteSupervisor(orgId, targetId)
      onNotify?.(`Supervisor "${supName}" has been removed.`, 'info')
      await loadData()
      await refreshQuotaAndLimits()
      await refreshNextSupervisorId()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to remove supervisor', 'error')
    } finally {
      setLoading(false)
    }
  }

  const togglePasswordVisibility = (id) => {
    setVisiblePasswordIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Filtered supervisors
  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((sup) => {
      const supId = (sup.SupervisorId || sup.supervisorId || sup.id || '').toLowerCase()
      const name = (sup.fullName || sup.FullName || sup.name || '').toLowerCase()
      const uname = (sup.username || sup.UserName || '').toLowerCase()
      const phone = (sup.phone || sup.ContactNo || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch =
        !q ||
        supId.includes(q) ||
        name.includes(q) ||
        uname.includes(q) ||
        phone.includes(q)

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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Supervisor Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">
            Provision site supervisors with sequential IDs (SUP001, SUP002...) and manage mobile login credentials.
          </p>
        </div>

        {/* Action Toggle */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('directory')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'directory' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className={`w-4 h-4 ${activeTab === 'directory' ? 'text-white' : 'text-slate-500'}`} />
            <span>Staff Directory ({supervisors.length})</span>
          </button>
          <button
            onClick={handleSwitchToCreate}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'create' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className={`w-4 h-4 ${activeTab === 'create' ? 'text-white' : 'text-slate-500'}`} />
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
                Supervisor will use these credentials to sign in directly on the mobile app.
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
                  Supervisor ID (Auto Generated)
                </label>
                <input
                  type="text"
                  disabled
                  value={nextSupervisorId}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-100/80 border border-slate-200 rounded-xl text-[#0B3470] font-mono font-bold cursor-not-allowed select-none"
                />
              </div>

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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Mobile Login Username *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.replace(/\s+/g, ''))}
                    placeholder="e.g. Ramesh123"
                    className={`w-full px-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl outline-none transition-colors ${
                      isUsernameValid === false
                        ? 'border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-500/20'
                        : isUsernameValid === true
                        ? 'border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20'
                        : 'border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20'
                    }`}
                  />
                  {isCheckingUsername && (
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                {isCheckingUsername ? (
                  <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-1.5">
                    Checking username...
                  </span>
                ) : isUsernameValid === false && usernameStatusText ? (
                  <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 mt-1.5">
                    <span className="text-xs">⚠️</span>
                    {usernameStatusText}
                  </span>
                ) : isUsernameValid === true ? (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1.5">
                    Username is available ✓
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 block mt-1">Global case-insensitive unique login ID</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contact Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    value={formPhone}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
                      setFormPhone(digitsOnly)
                      if (phoneError) setPhoneError('')
                    }}
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    className={`w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 border rounded-xl focus:ring-2 transition-colors ${
                      (formPhone.length > 0 && formPhone.length < 10) || phoneError
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                        : formPhone.length === 10
                        ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/20'
                    }`}
                  />
                </div>
                {phoneError ? (
                  <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 mt-1.5">
                    <span className="text-xs">⚠️</span>
                    {phoneError}
                  </span>
                ) : formPhone.length > 0 && formPhone.length < 10 ? (
                  <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 mt-1.5">
                    <span className="text-xs">⚠️</span>
                    Contact phone number must be exactly 10 digits ({formPhone.length}/10)
                  </span>
                ) : formPhone.length === 10 ? (
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1.5">
                    Contact phone number is valid ✓
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 block mt-1">Must be exactly 10 numeric digits</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                disabled={submitting || isCheckingUsername || isUsernameValid === false || Boolean(uniquenessError) || (formPhone.length > 0 && formPhone.length < 10)}
                className="px-6 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Creating Profile...' : `Save & Issue Account (${nextSupervisorId})`}
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
                placeholder="Search by ID (e.g. SUP001), name, phone..."
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
                      <th className="py-3.5 px-4">Supervisor ID</th>
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
                      const supId = sup.SupervisorId || sup.supervisorId || sup.id

                      return (
                        <tr key={supId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-mono text-xs font-bold text-[#0B3470] bg-blue-50/90 border border-blue-200/80 shadow-2xs">
                              {supId}
                            </span>
                          </td>

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
                            <div className="space-y-1 text-xs">
                              <div className="font-mono text-slate-700 flex items-center gap-1.5">
                                <span className="text-slate-400">User:</span>
                                <span className="font-semibold text-slate-900">{sup.username || sup.UserName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Pass:</span>
                                {sup.password || sup.Password ? (
                                  <div className="flex items-center gap-1.5 font-mono">
                                    <span className="text-slate-800 font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                      {visiblePasswordIds[supId] ? (sup.password || sup.Password) : '••••••••'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => togglePasswordVisibility(supId)}
                                      title={visiblePasswordIds[supId] ? 'Hide password' : 'View password'}
                                      className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                                    >
                                      {visiblePasswordIds[supId] ? (
                                        <EyeOff className="w-3.5 h-3.5" />
                                      ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">Managed externally</span>
                                )}
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
                              <button
                                onClick={() => handleDeleteSupervisor(sup)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Remove Supervisor"
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-blue-50 text-[#0B3470] rounded-md border border-blue-200">
                    {editingSupervisor.SupervisorId || editingSupervisor.supervisorId || editingSupervisor.id}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingSupervisor.fullName || editingSupervisor.FullName}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 font-mono">@{editingSupervisor.username || editingSupervisor.UserName}</p>
              </div>
              <button onClick={() => setEditingSupervisor(null)} className="p-1 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Existing Password Display */}
              {(editingSupervisor.password || editingSupervisor.Password) && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Current Mobile Password
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCurrentEditPassword(!showCurrentEditPassword)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      {showCurrentEditPassword ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-sm font-bold text-slate-800 mt-1">
                    {showCurrentEditPassword ? (editingSupervisor.password || editingSupervisor.Password) : '••••••••'}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit contact number"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
                {editPhone && editPhone.length < 10 && (
                  <span className="text-[11px] text-rose-600 font-semibold block mt-1">
                    Contact phone number must be exactly 10 digits ({editPhone.length}/10)
                  </span>
                )}
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
                <div className="relative">
                  <input
                    type={showNewPasswordInEdit ? 'text' : 'password'}
                    placeholder="Leave blank to keep existing password"
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    minLength={6}
                    className="w-full px-3.5 pr-10 py-2 text-sm bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPasswordInEdit(!showNewPasswordInEdit)}
                    className="p-1 text-amber-700/60 hover:text-amber-900 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showNewPasswordInEdit ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-amber-700/80 mt-1">
                  Enter a new password (min 6 characters) to update mobile app login credentials.
                </p>
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

      {/* Subscription Limit Modal */}
      <SubscriptionLimitModal
        isOpen={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        limitData={limitModalData}
      />
    </div>
  )
}
