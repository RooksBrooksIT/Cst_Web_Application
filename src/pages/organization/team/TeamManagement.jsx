import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Users,
  HardHat,
  Wrench,
  Shield,
  Building2,
  Mail,
  Phone,
  Search,
  RefreshCw,
  UserPlus,
  Check,
  Copy,
  MapPin,
  X,
} from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import { createInvitationCode, fetchOrgUsers } from '../../../services/userService'
import { subscribeSupervisors, fetchSupervisors } from '../../../services/supervisorService'
import { subscribeWorkers, fetchWorkers } from '../../../services/workforceService'
import {
  subscribeManagers,
  fetchManagers,
  createManager,
  checkGlobalUsernameUniqueness,
  warmupUsernameCache,
  isUsernameCachedAsTaken,
} from '../../../services/managerService'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../../services/firebase'
import { SubscriptionLimitService } from '../../../services/subscriptionLimitService'
import SubscriptionLimitModal from '../../../components/common/SubscriptionLimitModal'
import FreeTrialUserLimitModal from '../../../components/common/FreeTrialUserLimitModal'

/**
 * Normalizes any workforce member (Manager, Supervisor, Worker)
 * into a standard unified format for table display and filtering.
 */
function normalizeWorkforceMember(item, explicitCategory = null, sites = [], workerSiteMap = {}, supervisorSiteMap = {}) {
  const id = String(
    item.ManagerId ||
    item.managerId ||
    item.SupervisorId ||
    item.supervisorId ||
    item.workerId ||
    item.WorkerId ||
    item.id ||
    item.uid ||
    ''
  ).trim()

  const rawName = (
    item.fullName ||
    item.FullName ||
    item.name ||
    item.workerName ||
    item.WorkerName ||
    item.userName ||
    item.UserName ||
    item.username ||
    'Team Member'
  ).trim()

  const rawRole = String(
    item.role ||
    item.Role ||
    item.designation ||
    item.Designation ||
    item.trade ||
    item.Trade ||
    item.roleCategory ||
    ''
  ).trim()

  // 1. Determine Role Category: 'manager' | 'supervisor' | 'worker'
  let roleCategory = explicitCategory
  if (!roleCategory) {
    const roleLower = rawRole.toLowerCase()
    if (
      item.workerId ||
      item.dailyWageRate !== undefined ||
      item.trade ||
      item.salaryPerDay !== undefined ||
      item.overtimeHourlyRate !== undefined ||
      roleLower.includes('worker') ||
      roleLower.includes('labour') ||
      roleLower.includes('labor') ||
      roleLower.includes('mason') ||
      roleLower.includes('carpenter') ||
      roleLower.includes('electrician') ||
      roleLower.includes('plumber') ||
      roleLower.includes('painter') ||
      roleLower.includes('helper') ||
      roleLower.includes('bar bender') ||
      roleLower.includes('welder') ||
      roleLower.includes('fitter')
    ) {
      roleCategory = 'worker'
    } else if (
      item.supervisorId ||
      item.SupervisorId ||
      roleLower.includes('supervisor') ||
      roleLower.includes('foreman')
    ) {
      roleCategory = 'supervisor'
    } else if (
      item.managerId ||
      item.ManagerId ||
      roleLower.includes('manager') ||
      roleLower.includes('admin') ||
      roleLower.includes('head') ||
      roleLower.includes('director') ||
      roleLower.includes('executive')
    ) {
      roleCategory = 'manager'
    } else {
      roleCategory = 'worker'
    }
  }

  // 2. Determine Designation / Trade Label
  let designation = rawRole
  if (!designation) {
    if (roleCategory === 'manager') designation = 'Operations Manager'
    else if (roleCategory === 'supervisor') designation = 'Site Supervisor'
    else designation = 'General Field Worker'
  }

  // 3. Contact Info
  const email = (item.email || item.Email || item.officialEmail || '').trim()
  const phone = (item.phone || item.phoneNumber || item.ContactNo || item.contactNo || item.mobile || '').trim()

  // 4. Site / Project Assignment Resolution
  const assignedSites = resolveSiteAssignments(item, id, rawName, roleCategory, sites, workerSiteMap, supervisorSiteMap)

  // 5. Status Resolution
  let status = 'Active'
  if (item.status) {
    status = item.status
  } else if (item.Status) {
    status = item.Status
  } else if (item.isActive === false || item.is_active === false) {
    status = 'Inactive'
  } else if (item.isActive === true || item.is_active === true) {
    status = 'Active'
  }

  return {
    id: id || `WF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    fullName: rawName,
    username: (item.username || item.userName || item.UserName || '').trim(),
    email,
    phone,
    roleCategory, // 'manager' | 'supervisor' | 'worker'
    designation,
    department: (item.department || item.Department || '').trim(),
    assignedSites, // string[]
    status,
    raw: item,
  }
}

/**
 * Resolves all site and project associations for a person
 */
function resolveSiteAssignments(item, id, name, roleCategory, sites = [], workerSiteMap = {}, supervisorSiteMap = {}) {
  const result = []

  // Check direct assignedSiteName or siteName on item
  if (item.assignedSiteName && !result.includes(item.assignedSiteName)) {
    result.push(item.assignedSiteName)
  }
  if (item.siteName && item.siteName !== 'Unassigned' && item.siteName !== 'Unassigned Site' && !result.includes(item.siteName)) {
    result.push(item.siteName)
  }
  if (item.projectName && !result.includes(item.projectName)) {
    result.push(item.projectName)
  }

  // Check array of assignedSites or assignedProjects
  if (Array.isArray(item.assignedSites)) {
    item.assignedSites.forEach((s) => {
      const siteStr = typeof s === 'string' ? s : s?.name || s?.siteName || s?.projectName || s?.id
      if (siteStr && !result.includes(siteStr)) result.push(siteStr)
    })
  }
  if (Array.isArray(item.assignedProjects)) {
    item.assignedProjects.forEach((p) => {
      const pStr = typeof p === 'string' ? p : p?.name || p?.projectName || p?.title || p?.id
      if (pStr && !result.includes(pStr)) result.push(pStr)
    })
  }

  // Check Worker-to-Site mappings
  if (roleCategory === 'worker' && id && workerSiteMap[id]) {
    const sName = workerSiteMap[id]
    if (sName && !result.includes(sName)) result.push(sName)
  }

  // Check Supervisor-to-Site mappings
  if (roleCategory === 'supervisor' && id && supervisorSiteMap[id]) {
    const sName = supervisorSiteMap[id]
    if (sName && !result.includes(sName)) result.push(sName)
  }

  // Check site list cross-reference
  if (sites && sites.length > 0) {
    sites.forEach((site) => {
      const sId = site.id || site.code || site.siteCode
      const sName = site.projectName || site.siteName || site.name || sId

      const mgrId = site.managerId || site.managerID
      const mgrName = site.managerName || site.manager || site.assignedManager
      const supId = site.supervisorId || site.supervisorID
      const supName = site.supervisorName || site.supervisor

      if (roleCategory === 'manager') {
        const matchesId = id && mgrId && String(id).toLowerCase() === String(mgrId).toLowerCase()
        const matchesName = name && mgrName && name.toLowerCase() === String(mgrName).toLowerCase()
        if ((matchesId || matchesName) && !result.includes(sName)) {
          result.push(sName)
        }
      } else if (roleCategory === 'supervisor') {
        const matchesId = id && supId && String(id).toLowerCase() === String(supId).toLowerCase()
        const matchesName = name && supName && name.toLowerCase() === String(supName).toLowerCase()
        if ((matchesId || matchesName) && !result.includes(sName)) {
          result.push(sName)
        }
      }

      // Check single assignedSiteId on item matching site
      const itemSiteId = item.assignedSiteId || item.siteId || item.projectId
      if (itemSiteId && (itemSiteId === site.id || itemSiteId === site.code) && !result.includes(sName)) {
        result.push(sName)
      }
    })
  }

  return result
}

/**
 * Role category badge component with distinctive executive / field styling
 */
function RoleBadge({ roleCategory, designation }) {
  const meta = {
    manager: {
      bg: 'bg-blue-50/90 text-[#0B3470] border-blue-200/90 shadow-2xs',
      icon: Shield,
      label: 'Manager',
      dot: 'bg-blue-600',
    },
    supervisor: {
      bg: 'bg-emerald-50/90 text-emerald-800 border-emerald-200/90 shadow-2xs',
      icon: HardHat,
      label: 'Supervisor',
      dot: 'bg-emerald-600',
    },
    worker: {
      bg: 'bg-amber-50/90 text-amber-900 border-amber-200/90 shadow-2xs',
      icon: Wrench,
      label: 'Worker',
      dot: 'bg-amber-500',
    },
  }[roleCategory] || {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Users,
    label: 'Field Staff',
    dot: 'bg-slate-400',
  }

  const Icon = meta.icon

  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-tight border ${meta.bg}`}>
        <Icon className="w-3 h-3 shrink-0" />
        <span>{meta.label}</span>
      </span>
      {designation && designation.toLowerCase() !== meta.label.toLowerCase() && (
        <span className="text-[11px] text-slate-500 font-medium pl-0.5 truncate max-w-[190px]">
          {designation}
        </span>
      )}
    </div>
  )
}

/**
 * Site Assignment badge list
 */
function SiteAssignmentBadge({ sites = [] }) {
  if (!sites || sites.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200/70">
        <MapPin className="w-2.5 h-2.5 text-slate-400" />
        Unassigned
      </span>
    )
  }

  if (sites.length === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50/70 text-slate-800 border border-blue-100">
        <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
        <span className="truncate max-w-[180px]">{sites[0]}</span>
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 max-w-[240px]">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
        <Building2 className="w-2.5 h-2.5 text-blue-600" />
        {sites[0]}
      </span>
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200" title={sites.slice(1).join(', ')}>
        +{sites.length - 1} more
      </span>
    </div>
  )
}

export default function TeamManagement({
  managers: propManagers = [],
  supervisors: propSupervisors = [],
  workers: propWorkers = [],
  sites = [],
  projects = [],
}) {
  const { orgId } = useAuth()

  // Real-time backend states
  const [fetchedManagers, setFetchedManagers] = useState([])
  const [fetchedSupervisors, setFetchedSupervisors] = useState([])
  const [fetchedWorkers, setFetchedWorkers] = useState([])
  const [fetchedUsers, setFetchedUsers] = useState([])
  const [workerSiteMap, setWorkerSiteMap] = useState({})
  const [supervisorSiteMap, setSupervisorSiteMap] = useState({})
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Filtering & Search
  const [activeRoleFilter, setActiveRoleFilter] = useState('ALL') // 'ALL' | 'MANAGER' | 'SUPERVISOR' | 'WORKER'
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  // Invite Modal
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteResult, setInviteResult] = useState(null)
  const [savingInvite, setSavingInvite] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'manager',
    assignedProjects: [],
  })

  // Plan Limits & Quotas State
  const [planLimits, setPlanLimits] = useState(null)
  const [limitModalData, setLimitModalData] = useState(null)
  const [trialLimitModalData, setTrialLimitModalData] = useState(null)

  // Manager Creation Modal State
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false)
  const [managerFormData, setManagerFormData] = useState({
    fullName: '',
    username: '',
    password: '',
    phone: '',
    email: '',
    department: 'Operations',
    designation: 'Site Manager',
  })
  const [managerSubmitLoading, setManagerSubmitLoading] = useState(false)
  const [managerError, setManagerError] = useState('')
  const [managerSuccess, setManagerSuccess] = useState('')

  // Manager Username Real-Time Validation State
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const [usernameStatusText, setUsernameStatusText] = useState(null)
  const [isUsernameValid, setIsUsernameValid] = useState(null)
  const usernameValidationSeq = useRef(0)

  // Warm up username cache and load plan limits on mount
  useEffect(() => {
    warmupUsernameCache()
    if (orgId) {
      SubscriptionLimitService.getActivePlanLimits(orgId).then(setPlanLimits)
    }
  }, [orgId])

  // Debounced real-time case-insensitive username uniqueness check
  useEffect(() => {
    if (!isManagerModalOpen) {
      setIsCheckingUsername(false)
      setUsernameStatusText(null)
      setIsUsernameValid(null)
      return
    }

    const clean = (managerFormData.username || '').trim()
    const cleanLower = clean.toLowerCase()
    const seq = ++usernameValidationSeq.current

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
        const res = await checkGlobalUsernameUniqueness(orgId, clean)
        if (seq === usernameValidationSeq.current && (managerFormData.username || '').trim().toLowerCase() === cleanLower) {
          setIsCheckingUsername(false)
          setIsUsernameValid(res.isUnique)
          setUsernameStatusText(res.isUnique ? 'Username is available ✓' : 'Username already exists')
        }
      } catch (_err) {
        if (seq === usernameValidationSeq.current) {
          setIsCheckingUsername(false)
          setIsUsernameValid(false)
          setUsernameStatusText('Error checking username')
        }
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [managerFormData.username, isManagerModalOpen, orgId])

  async function handleOpenCreateManagerModal() {
    setManagerError('')
    setManagerSuccess('')
    const check = await SubscriptionLimitService.canCreateManager({
      orgId,
      currentManagersCount: metrics.managersCount,
      currentSupervisorsCount: metrics.supervisorsCount,
      currentWorkersCount: metrics.workersCount,
      currentTotalUsersCount: 1 + metrics.managersCount + metrics.supervisorsCount,
      currentPlanName: planLimits?.planName,
    })
    if (!check.isAllowed) {
      if (
        check.isTrialLimit ||
        check.reason === 'FREE_TRIAL_USER_LIMIT_REACHED' ||
        (planLimits?.isTrial && check.reason !== 'SUBSCRIPTION_EXPIRED' && check.reason !== 'TRIAL_EXPIRED')
      ) {
        setTrialLimitModalData({
          title: check.title || 'Free Trial User Limit Reached',
          message: check.message,
          adminCount: check.adminCount ?? 1,
          managersCount: check.managersCount ?? metrics.managersCount,
          supervisorsCount: check.supervisorsCount ?? metrics.supervisorsCount,
          workersCount: check.workersCount ?? metrics.workersCount,
          totalEligible: check.totalEligible ?? (1 + metrics.managersCount + metrics.supervisorsCount),
          maxEligible: check.maxEligible ?? 3,
        })
      } else {
        setLimitModalData({
          title: check.title || 'Manager Quota Reached',
          message: check.message,
          planName: check.planName || planLimits?.planName,
          currentCount: check.currentCount,
          maxLimit: check.maxLimit,
          recommendedPlan: check.upgradePlan || 'Gold',
          resourceType: check.reason?.includes('TOTAL') ? 'Team User' : 'Manager',
        })
      }
      return
    }
    setIsManagerModalOpen(true)
  }

  async function handleCreateManagerSubmit(e) {
    e.preventDefault()
    if (!orgId) return

    if (isUsernameValid === false) {
      setManagerError(usernameStatusText || 'Username already exists')
      return
    }

    setManagerSubmitLoading(true)
    setManagerError('')
    setManagerSuccess('')

    try {
      const created = await createManager(orgId, managerFormData)
      setManagerSuccess(`Manager "${created.FullName}" created successfully (ID: ${created.ManagerId}).`)
      setManagerFormData({
        fullName: '',
        username: '',
        password: '',
        phone: '',
        email: '',
        department: 'Operations',
        designation: 'Site Manager',
      })
      setUsernameStatusText(null)
      setIsUsernameValid(null)
      setIsCheckingUsername(false)
      setTimeout(() => {
        setIsManagerModalOpen(false)
        setManagerSuccess('')
      }, 1500)
    } catch (err) {
      if (
        err.code === 'FREE_TRIAL_USER_LIMIT_REACHED' ||
        (planLimits?.isTrial && err.code === 'MANAGER_LIMIT_REACHED')
      ) {
        setIsManagerModalOpen(false)
        setTrialLimitModalData({
          title: 'Free Trial User Limit Reached',
          message: err.message,
          adminCount: 1,
          managersCount: metrics.managersCount,
          supervisorsCount: metrics.supervisorsCount,
          workersCount: metrics.workersCount,
          totalEligible: 1 + metrics.managersCount + metrics.supervisorsCount,
          maxEligible: 3,
        })
      } else if (
        err.code === 'TOTAL_USERS_LIMIT_REACHED' ||
        err.code === 'MANAGER_LIMIT_REACHED' ||
        err.code === 'SUBSCRIPTION_EXPIRED' ||
        err.code === 'TRIAL_EXPIRED'
      ) {
        setIsManagerModalOpen(false)
        setLimitModalData({
          title:
            err.code === 'SUBSCRIPTION_EXPIRED'
              ? 'Subscription Expired'
              : err.code === 'TRIAL_EXPIRED'
                ? 'Free Trial Expired'
                : 'Manager Quota Reached',
          message: err.message,
          planName: planLimits?.planName,
          recommendedPlan: err.upgradePlan || 'Gold',
          resourceType: err.code?.includes('TOTAL') ? 'Team User' : 'Manager',
        })
      } else {
        setManagerError(err.message || 'Failed to create Manager account.')
      }
    } finally {
      setManagerSubmitLoading(false)
    }
  }

  // 1. Live Subscriptions & Fallback Fetching from Firestore
  useEffect(() => {
    if (!orgId) return

    let cancelled = false

    // A. Subscribe to Managers (/organisation/{orgId}/manager)
    const unsubManagers = subscribeManagers(
      orgId,
      (data) => {
        if (!cancelled && data) setFetchedManagers(data)
      },
      (err) => console.warn('Managers subscription fallback:', err)
    )

    // B. Subscribe to Supervisors
    const unsubSupervisors = subscribeSupervisors(
      orgId,
      (data) => {
        if (!cancelled && data) setFetchedSupervisors(data)
      },
      (err) => console.warn('Supervisors subscription fallback:', err)
    )

    // C. Subscribe to Workers
    const unsubWorkers = subscribeWorkers(
      orgId,
      (data) => {
        if (!cancelled && data) setFetchedWorkers(data)
      },
      (err) => console.warn('Workers subscription fallback:', err)
    )

    // D. Subscribe to Worker-Site Mapping
    let unsubWorkerSiteMap = () => { }
    try {
      unsubWorkerSiteMap = onSnapshot(
        collection(db, 'organisation', orgId, 'workerSiteMapping'),
        (snapshot) => {
          if (cancelled) return
          const mapping = {}
          snapshot.docs.forEach((d) => {
            const data = d.data()
            const sId = data.siteId || d.id
            const sName = data.siteName || sId
            if (Array.isArray(data.workers)) {
              data.workers.forEach((w) => {
                const wId = typeof w === 'string' ? w : w.workerId || w.id
                if (wId) mapping[wId] = sName
              })
            }
          })
          setWorkerSiteMap(mapping)
        },
        (err) => console.warn('WorkerSiteMap snapshot error:', err)
      )
    } catch (e) {
      console.warn('Could not attach workerSiteMapping listener:', e)
    }

    // E. Subscribe to Supervisor-Site Mapping
    let unsubSupMap = () => { }
    try {
      unsubSupMap = onSnapshot(
        collection(db, 'organisation', orgId, 'siteSupervisorMap'),
        (snapshot) => {
          if (cancelled) return
          const mapping = {}
          snapshot.docs.forEach((d) => {
            const data = d.data()
            const supId = data.supervisorId || data['Supervisor ID']
            const siteName = data.siteName || data.site || d.id
            if (supId) mapping[supId] = siteName
          })
          setSupervisorSiteMap(mapping)
        },
        (err) => console.warn('SiteSupervisorMap snapshot error:', err)
      )
    } catch (e) {
      console.warn('Could not attach siteSupervisorMap listener:', e)
    }

    // F. Initial direct fetch of org users (catches root users & subcollections)
    fetchOrgUsers(orgId)
      .then((users) => {
        if (!cancelled && users && users.length > 0) {
          setFetchedUsers(users)
        }
      })
      .catch((err) => console.warn('fetchOrgUsers error:', err))

    return () => {
      cancelled = true
      unsubManagers?.()
      unsubSupervisors?.()
      unsubWorkers?.()
      unsubWorkerSiteMap?.()
      unsubSupMap?.()
    }
  }, [orgId])

  // Manual Refresh Handler
  async function handleRefresh() {
    if (!orgId) return
    setIsRefreshing(true)
    try {
      const [mgrs, sups, wrks, users] = await Promise.allSettled([
        fetchManagers(orgId),
        fetchSupervisors(orgId),
        fetchWorkers(orgId),
        fetchOrgUsers(orgId),
      ])
      if (mgrs.status === 'fulfilled' && mgrs.value) setFetchedManagers(mgrs.value)
      if (sups.status === 'fulfilled' && sups.value) setFetchedSupervisors(sups.value)
      if (wrks.status === 'fulfilled' && wrks.value) setFetchedWorkers(wrks.value)
      if (users.status === 'fulfilled' && users.value) setFetchedUsers(users.value)
    } catch (err) {
      console.error('Refresh error:', err)
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  // 2. Comprehensive Workforce Master Aggregation
  const allWorkforce = useMemo(() => {
    const combinedSites = [...sites, ...projects]
    const dedupeMap = new Map()

    // Helper to register person
    const register = (item, explicitRole) => {
      if (!item) return
      const normalized = normalizeWorkforceMember(item, explicitRole, combinedSites, workerSiteMap, supervisorSiteMap)
      if (!normalized.id && !normalized.fullName) return

      // Deduplication key
      const key = (normalized.id || normalized.email || normalized.phone || normalized.fullName).toLowerCase().trim()
      if (!dedupeMap.has(key)) {
        dedupeMap.set(key, normalized)
      } else {
        // Merge enriched attributes
        const existing = dedupeMap.get(key)
        if (!existing.email && normalized.email) existing.email = normalized.email
        if (!existing.phone && normalized.phone) existing.phone = normalized.phone
        if (existing.assignedSites.length === 0 && normalized.assignedSites.length > 0) {
          existing.assignedSites = normalized.assignedSites
        }
        if (normalized.roleCategory !== 'worker' && existing.roleCategory === 'worker') {
          existing.roleCategory = normalized.roleCategory
          existing.designation = normalized.designation
        }
      }
    }

      // A. Ingest Managers (from manager collection, props, and org users)
      ; (propManagers || []).forEach((m) => register(m, 'manager'))
      ; (fetchedManagers || []).forEach((m) => register(m, 'manager'))
      ; (fetchedUsers || []).forEach((u) => register(u, null))

      // B. Ingest Supervisors
      ; (propSupervisors || []).forEach((s) => register(s, 'supervisor'))
      ; (fetchedSupervisors || []).forEach((s) => register(s, 'supervisor'))

      // C. Ingest Workers
      ; (propWorkers || []).forEach((w) => register(w, 'worker'))
      ; (fetchedWorkers || []).forEach((w) => register(w, 'worker'))

    const list = Array.from(dedupeMap.values())

    // Sort by role hierarchy (Managers -> Supervisors -> Workers), then by name
    const roleRank = { manager: 1, supervisor: 2, worker: 3 }
    return list.sort((a, b) => {
      const rankDiff = (roleRank[a.roleCategory] || 4) - (roleRank[b.roleCategory] || 4)
      if (rankDiff !== 0) return rankDiff
      return a.fullName.localeCompare(b.fullName)
    })
  }, [
    propManagers,
    propSupervisors,
    propWorkers,
    fetchedManagers,
    fetchedSupervisors,
    fetchedWorkers,
    fetchedUsers,
    sites,
    projects,
    workerSiteMap,
    supervisorSiteMap,
  ])

  // 3. Metric Calculations
  const metrics = useMemo(() => {
    const total = allWorkforce.length
    const managersCount = allWorkforce.filter((w) => w.roleCategory === 'manager').length
    const supervisorsCount = allWorkforce.filter((w) => w.roleCategory === 'supervisor').length
    const workersCount = allWorkforce.filter((w) => w.roleCategory === 'worker').length
    const assignedCount = allWorkforce.filter((w) => w.assignedSites && w.assignedSites.length > 0).length

    return {
      total,
      managersCount,
      supervisorsCount,
      workersCount,
      assignedCount,
    }
  }, [allWorkforce])

  // 4. Distinct Sites for Filter Dropdown
  const distinctSiteOptions = useMemo(() => {
    const set = new Set()
    sites.forEach((s) => {
      const name = s.projectName || s.siteName || s.name
      if (name) set.add(name)
    })
    allWorkforce.forEach((w) => {
      w.assignedSites.forEach((s) => set.add(s))
    })
    return Array.from(set).sort()
  }, [sites, allWorkforce])

  // 5. Filtered Workforce
  const filteredWorkforce = useMemo(() => {
    let list = allWorkforce

    // Role Tab Filter
    if (activeRoleFilter !== 'ALL') {
      list = list.filter((w) => w.roleCategory.toUpperCase() === activeRoleFilter)
    }

    // Site Filter
    if (selectedSiteFilter === 'UNASSIGNED') {
      list = list.filter((w) => !w.assignedSites || w.assignedSites.length === 0)
    } else if (selectedSiteFilter !== 'ALL') {
      list = list.filter((w) => w.assignedSites && w.assignedSites.includes(selectedSiteFilter))
    }

    // Status Filter
    if (selectedStatusFilter !== 'ALL') {
      list = list.filter((w) => w.status.toLowerCase() === selectedStatusFilter.toLowerCase())
    }

    // Search Query (Multi-field)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((w) => {
        const nameMatch = w.fullName.toLowerCase().includes(q)
        const idMatch = w.id.toLowerCase().includes(q)
        const userMatch = w.username.toLowerCase().includes(q)
        const emailMatch = w.email.toLowerCase().includes(q)
        const phoneMatch = w.phone.toLowerCase().includes(q)
        const roleMatch = w.roleCategory.toLowerCase().includes(q)
        const desigMatch = w.designation.toLowerCase().includes(q)
        const siteMatch = w.assignedSites.some((s) => s.toLowerCase().includes(q))
        return (
          nameMatch ||
          idMatch ||
          userMatch ||
          emailMatch ||
          phoneMatch ||
          roleMatch ||
          desigMatch ||
          siteMatch
        )
      })
    }

    return list
  }, [allWorkforce, activeRoleFilter, selectedSiteFilter, selectedStatusFilter, searchQuery])

  // Filter handlers with page reset
  const handleRoleFilterChange = (role) => {
    setActiveRoleFilter(role)
    setCurrentPage(1)
  }
  const handleSiteFilterChange = (site) => {
    setSelectedSiteFilter(site)
    setCurrentPage(1)
  }
  const handleStatusFilterChange = (status) => {
    setSelectedStatusFilter(status)
    setCurrentPage(1)
  }
  const handleSearchChange = (query) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }
  const handleResetFilters = () => {
    setActiveRoleFilter('ALL')
    setSelectedSiteFilter('ALL')
    setSelectedStatusFilter('ALL')
    setSearchQuery('')
    setCurrentPage(1)
  }

  // 6. Pagination with safe clamping
  const totalPages = Math.max(1, Math.ceil(filteredWorkforce.length / pageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const paginatedWorkforce = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return filteredWorkforce.slice(start, start + pageSize)
  }, [filteredWorkforce, safeCurrentPage, pageSize])

  function handleOpenInviteModal() {
    setInviteResult(null)
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'manager',
      assignedProjects: [],
    })
    setIsInviteOpen(true)
  }

  // 7. Invite Submission
  async function handleInvite(e) {
    e.preventDefault()
    if (!orgId) return

    const selectedRole = String(formData.role || 'manager').toLowerCase()
    if (selectedRole.includes('manager')) {
      const check = await SubscriptionLimitService.canCreateManager({
        orgId,
        currentManagersCount: metrics.managersCount,
        currentSupervisorsCount: metrics.supervisorsCount,
        currentWorkersCount: metrics.workersCount,
        currentTotalUsersCount: 1 + metrics.managersCount + metrics.supervisorsCount,
        currentPlanName: planLimits?.planName,
      })
      if (!check.isAllowed) {
        setIsInviteOpen(false)
        if (
          check.isTrialLimit ||
          check.reason === 'FREE_TRIAL_USER_LIMIT_REACHED' ||
          (planLimits?.isTrial && check.reason !== 'SUBSCRIPTION_EXPIRED' && check.reason !== 'TRIAL_EXPIRED')
        ) {
          setTrialLimitModalData({
            title: check.title || 'Free Trial User Limit Reached',
            message: check.message,
            adminCount: check.adminCount ?? 1,
            managersCount: check.managersCount ?? metrics.managersCount,
            supervisorsCount: check.supervisorsCount ?? metrics.supervisorsCount,
            workersCount: check.workersCount ?? metrics.workersCount,
            totalEligible: check.totalEligible ?? (1 + metrics.managersCount + metrics.supervisorsCount),
            maxEligible: check.maxEligible ?? 3,
          })
        } else {
          setLimitModalData({
            title: check.title || 'Manager Quota Reached',
            message: check.message,
            planName: check.planName || planLimits?.planName,
            currentCount: check.currentCount,
            maxLimit: check.maxLimit,
            recommendedPlan: check.upgradePlan || 'Gold',
            resourceType: check.reason?.includes('TOTAL') ? 'Team User' : 'Manager',
          })
        }
        return
      }
    } else if (selectedRole.includes('supervisor')) {
      const check = await SubscriptionLimitService.canCreateSupervisor({
        orgId,
        currentManagersCount: metrics.managersCount,
        currentSupervisorsCount: metrics.supervisorsCount,
        currentWorkersCount: metrics.workersCount,
        currentTotalUsersCount: 1 + metrics.managersCount + metrics.supervisorsCount,
        currentPlanName: planLimits?.planName,
      })
      if (!check.isAllowed) {
        setIsInviteOpen(false)
        if (
          check.isTrialLimit ||
          check.reason === 'FREE_TRIAL_USER_LIMIT_REACHED' ||
          (planLimits?.isTrial && check.reason !== 'SUBSCRIPTION_EXPIRED' && check.reason !== 'TRIAL_EXPIRED')
        ) {
          setTrialLimitModalData({
            title: check.title || 'Free Trial User Limit Reached',
            message: check.message,
            adminCount: check.adminCount ?? 1,
            managersCount: check.managersCount ?? metrics.managersCount,
            supervisorsCount: check.supervisorsCount ?? metrics.supervisorsCount,
            workersCount: check.workersCount ?? metrics.workersCount,
            totalEligible: check.totalEligible ?? (1 + metrics.managersCount + metrics.supervisorsCount),
            maxEligible: check.maxEligible ?? 3,
          })
        } else {
          setLimitModalData({
            title: check.title || 'Supervisor Quota Reached',
            message: check.message,
            planName: check.planName || planLimits?.planName,
            currentCount: check.currentCount,
            maxLimit: check.maxLimit,
            recommendedPlan: check.upgradePlan || 'Silver',
            resourceType: check.reason?.includes('TOTAL') ? 'Team User' : 'Supervisor',
          })
        }
        return
      }
    }

    setSavingInvite(true)
    try {
      const res = await createInvitationCode(orgId, formData)
      setInviteResult(res)
    } catch (err) {
      if (err.limitCheck || err.details) {
        setIsInviteOpen(false)
        const check = err.limitCheck || err.details
        if (
          check.isTrialLimit ||
          check.reason === 'FREE_TRIAL_USER_LIMIT_REACHED' ||
          (planLimits?.isTrial && check.reason !== 'SUBSCRIPTION_EXPIRED' && check.reason !== 'TRIAL_EXPIRED')
        ) {
          setTrialLimitModalData({
            title: check.title || 'Free Trial User Limit Reached',
            message: check.message,
            adminCount: check.adminCount ?? 1,
            managersCount: check.managersCount ?? metrics.managersCount,
            supervisorsCount: check.supervisorsCount ?? metrics.supervisorsCount,
            workersCount: check.workersCount ?? metrics.workersCount,
            totalEligible: check.totalEligible ?? (1 + metrics.managersCount + metrics.supervisorsCount),
            maxEligible: check.maxEligible ?? 3,
          })
        } else {
          setLimitModalData({
            title: check.title || 'User Quota Reached',
            message: check.message,
            planName: check.planName || planLimits?.planName,
            currentCount: check.currentCount,
            maxLimit: check.maxLimit,
            recommendedPlan: check.upgradePlan || 'Gold',
            resourceType: 'User',
          })
        }
      } else {
        alert('Error creating invite: ' + err.message)
      }
    } finally {
      setSavingInvite(false)
    }
  }

  function handleCopyInviteCode(code) {
    navigator.clipboard?.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2500)
  }

  // Export Columns & Data
  const exportHeaders = ['Staff Name', 'Member ID', 'Role Category', 'Designation / Trade', 'Email', 'Phone', 'Site Assignment', 'Status']
  const exportData = useMemo(() => {
    return filteredWorkforce.map((w) => ({
      name: w.fullName,
      id: w.id,
      category: w.roleCategory.toUpperCase(),
      designation: w.designation,
      email: w.email || 'N/A',
      phone: w.phone || 'N/A',
      sites: w.assignedSites.length > 0 ? w.assignedSites.join('; ') : 'Unassigned',
      status: w.status,
    }))
  }, [filteredWorkforce])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-50 text-[#0B3470] border border-blue-200/80">
              Corporate & Field Governance
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-medium">Multi-Tier Workforce Hub</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Staff, Managers & Field Roles</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Centralized directory of corporate managers, on-site supervisors, and active field workforce with real-time site deployments.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={handleOpenCreateManagerModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Manager</span>
          </button>

         

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
            title="Reload workforce data from Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <ExportButton
            filename={`complete_workforce_roster_${new Date().toISOString().split('T')[0]}`}
            headers={exportHeaders}
            data={exportData}
            title="Complete Corporate & Field Workforce Roster"
          />
        </div>
      </div>

      {/* Subscription Team Quotas Status Bar */}
      {planLimits && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
            <span className="font-semibold text-slate-700">Subscription Quota Allocation</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {planLimits.planName} Plan
            </span>
          </div>
          {planLimits.isTrial ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Org Admin:</span>
                <span className="font-mono font-bold text-slate-800">
                  1 / 1
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Manager:</span>
                <span className={`font-mono font-bold ${metrics.managersCount >= 1 ? 'text-amber-600' : 'text-slate-800'}`}>
                  {metrics.managersCount} / 1
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Site Supervisor:</span>
                <span className={`font-mono font-bold ${metrics.supervisorsCount >= 1 ? 'text-amber-600' : 'text-slate-800'}`}>
                  {metrics.supervisorsCount} / 1
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                <span className="text-emerald-700 font-medium">Workers:</span>
                <span className="font-mono font-bold text-emerald-800">
                  {metrics.workersCount} (Unlimited)
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Subscription Users:</span>
                <span className={`font-mono font-bold ${1 + metrics.managersCount + metrics.supervisorsCount >= (planLimits.maxUsers || 2) ? 'text-rose-600' : 'text-slate-800'}`}>
                  {1 + metrics.managersCount + metrics.supervisorsCount} / {planLimits.maxUsers === 999999 ? 'Unlimited' : planLimits.maxUsers}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Dedicated Managers:</span>
                <span className={`font-mono font-bold ${metrics.managersCount >= (planLimits.maxManagers || 1) ? 'text-rose-600' : 'text-slate-800'}`}>
                  {metrics.managersCount} / {planLimits.maxManagers === 999999 ? 'Unlimited' : planLimits.maxManagers}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Site Supervisors:</span>
                <span className={`font-mono font-bold ${metrics.supervisorsCount >= (planLimits.maxSupervisors || 1) ? 'text-rose-600' : 'text-slate-800'}`}>
                  {metrics.supervisorsCount} / {planLimits.maxSupervisors === 999999 ? 'Unlimited' : planLimits.maxSupervisors}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500">Field Workers:</span>
                <span className="font-mono font-bold text-slate-800">
                  {metrics.workersCount} (Excluded from Limit)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Free Trial User Limit Modal */}
      <FreeTrialUserLimitModal
        isOpen={Boolean(trialLimitModalData)}
        onClose={() => setTrialLimitModalData(null)}
        {...trialLimitModalData}
      />

      {/* Paid Subscription Limit Modal */}
      <SubscriptionLimitModal
        isOpen={Boolean(limitModalData)}
        onClose={() => setLimitModalData(null)}
        {...limitModalData}
      />

      {/* Interactive Metric Cards (Clickable quick filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        <button
          type="button"
          onClick={() => handleRoleFilterChange('ALL')}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 ${activeRoleFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
              : 'bg-white text-slate-700 border-slate-200/90 hover:border-slate-300 shadow-xs hover:-translate-y-0.5'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeRoleFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
              Total Workforce
            </span>
            <Users className={`w-4 h-4 ${activeRoleFilter === 'ALL' ? 'text-blue-300' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-black">{metrics.total}</div>
          <div className={`text-[11px] mt-1 ${activeRoleFilter === 'ALL' ? 'text-slate-300' : 'text-slate-400'}`}>
            Complete Roster
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleRoleFilterChange('MANAGER')}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 ${activeRoleFilter === 'MANAGER'
              ? 'bg-[#0B3470] text-white border-[#0B3470] shadow-md ring-2 ring-blue-500/20'
              : 'bg-white text-slate-700 border-slate-200/90 hover:border-blue-200 shadow-xs hover:-translate-y-0.5'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeRoleFilter === 'MANAGER' ? 'text-blue-200' : 'text-blue-600'}`}>
              Managers
            </span>
            <Shield className={`w-4 h-4 ${activeRoleFilter === 'MANAGER' ? 'text-blue-200' : 'text-blue-600'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black">{metrics.managersCount}</div>
          <div className={`text-[11px] mt-1 ${activeRoleFilter === 'MANAGER' ? 'text-blue-200' : 'text-slate-400'}`}>
            Operations & Project Leads
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleRoleFilterChange('SUPERVISOR')}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 ${activeRoleFilter === 'SUPERVISOR'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white text-slate-700 border-slate-200/90 hover:border-emerald-200 shadow-xs hover:-translate-y-0.5'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeRoleFilter === 'SUPERVISOR' ? 'text-emerald-100' : 'text-emerald-600'}`}>
              Supervisors
            </span>
            <HardHat className={`w-4 h-4 ${activeRoleFilter === 'SUPERVISOR' ? 'text-emerald-200' : 'text-emerald-600'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black">{metrics.supervisorsCount}</div>
          <div className={`text-[11px] mt-1 ${activeRoleFilter === 'SUPERVISOR' ? 'text-emerald-100' : 'text-slate-400'}`}>
            Field Supervisors
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleRoleFilterChange('WORKER')}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-200 ${activeRoleFilter === 'WORKER'
              ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/20'
              : 'bg-white text-slate-700 border-slate-200/90 hover:border-amber-200 shadow-xs hover:-translate-y-0.5'
            }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${activeRoleFilter === 'WORKER' ? 'text-amber-100' : 'text-amber-600'}`}>
              Workers
            </span>
            <Wrench className={`w-4 h-4 ${activeRoleFilter === 'WORKER' ? 'text-amber-200' : 'text-amber-600'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black">{metrics.workersCount}</div>
          <div className={`text-[11px] mt-1 ${activeRoleFilter === 'WORKER' ? 'text-amber-100' : 'text-slate-400'}`}>
            Trades & General Labor
          </div>
        </button>

        <div className="col-span-2 sm:col-span-1 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-white text-slate-700 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Site Deployments</span>
            <Building2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {metrics.assignedCount}
            <span className="text-xs font-medium text-slate-400 ml-1.5">/ {metrics.total}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {metrics.total > 0 ? `${Math.round((metrics.assignedCount / metrics.total) * 100)}% deployed to sites` : 'No members'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        {/* Role Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl overflow-x-auto touch-pan-x scrollbar-none max-w-full">
            <button
              type="button"
              onClick={() => handleRoleFilterChange('ALL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeRoleFilter === 'ALL'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <span>All Workforce</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeRoleFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {metrics.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleFilterChange('MANAGER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeRoleFilter === 'MANAGER'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Managers</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeRoleFilter === 'MANAGER' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {metrics.managersCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleFilterChange('SUPERVISOR')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeRoleFilter === 'SUPERVISOR'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <HardHat className="w-3.5 h-3.5" />
              <span>Supervisors</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeRoleFilter === 'SUPERVISOR' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {metrics.supervisorsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleFilterChange('WORKER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeRoleFilter === 'WORKER'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Workers</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeRoleFilter === 'WORKER' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {metrics.workersCount}
              </span>
            </button>
          </div>

          {/* Active Filter Badges / Summary */}
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium self-end lg:self-auto">
            <span>Showing <strong className="text-slate-900">{filteredWorkforce.length}</strong> of {metrics.total} members</span>
            {(activeRoleFilter !== 'ALL' || selectedSiteFilter !== 'ALL' || selectedStatusFilter !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold inline-flex items-center gap-1 ml-2 transition-colors"
              >
                <X className="w-3 h-3" />
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* Inputs & Dropdown Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-1">
          {/* Search Input */}
          <div className="lg:col-span-6 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, ID, phone, trade, site..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Site Filter Dropdown */}
          <div className="lg:col-span-4 relative">
            <select
              value={selectedSiteFilter}
              onChange={(e) => handleSiteFilterChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 cursor-pointer transition-all"
            >
              <option value="ALL">🏢 All Sites & Projects</option>
              <option value="UNASSIGNED">⚠️ Unassigned Personnel Only</option>
              {distinctSiteOptions.map((s) => (
                <option key={s} value={s}>
                  📍 {s}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div className="lg:col-span-2 relative">
            <select
              value={selectedStatusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 cursor-pointer transition-all"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
              <option value="Pending">Pending Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Unified Workforce Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {/* Mobile Swipe Guidance Banner */}
        <div className="block sm:hidden text-center py-1.5 px-3 bg-slate-50 border-b border-slate-100 text-[11px] font-medium text-slate-500">
          ← Swipe horizontally to inspect full roster →
        </div>

        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full text-left text-xs text-slate-700 min-w-[700px]">
            <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="p-3.5 pl-5 min-w-[220px]">Member Name & ID</th>
                <th className="p-3.5 min-w-[200px]">Email / Contact</th>
                <th className="p-3.5 min-w-[170px]">Assigned Role</th>
                <th className="p-3.5 min-w-[200px]">Site / Project Assignment</th>
                <th className="p-3.5 pr-5 text-center min-w-[110px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedWorkforce.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">No workforce records found</h3>
                      <p className="text-xs text-slate-500">
                        {searchQuery || activeRoleFilter !== 'ALL' || selectedSiteFilter !== 'ALL'
                          ? 'No personnel match the current filter or search criteria. Try resetting filters.'
                          : 'No staff, managers, supervisors, or workers currently registered.'}
                      </p>
                      {(searchQuery || activeRoleFilter !== 'ALL' || selectedSiteFilter !== 'ALL' || selectedStatusFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedWorkforce.map((person) => {
                  // Initials
                  const parts = person.fullName.split(' ').filter(Boolean)
                  const initials = parts.length > 1
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : person.fullName.substring(0, 2).toUpperCase()

                  const avatarTheme = {
                    manager: 'bg-blue-100 text-[#0B3470] border-blue-200 ring-blue-500/20',
                    supervisor: 'bg-emerald-100 text-emerald-800 border-emerald-200 ring-emerald-500/20',
                    worker: 'bg-amber-100 text-amber-900 border-amber-200 ring-amber-500/20',
                  }[person.roleCategory] || 'bg-slate-100 text-slate-700 border-slate-200'

                  return (
                    <tr
                      key={person.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Name & ID */}
                      <td className="p-3.5 pl-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border shadow-2xs ${avatarTheme}`}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <strong className="block text-slate-900 font-bold group-hover:text-blue-900 transition-colors truncate max-w-[200px]">
                              {person.fullName}
                            </strong>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60" title={`Unique ID: ${person.id}`}>
                                {person.id}
                              </span>
                              {person.username && person.username !== person.fullName && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[90px]">
                                  @{person.username}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email / Contact */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          {person.email ? (
                            <a
                              href={`mailto:${person.email}`}
                              className="flex items-center gap-1.5 text-xs text-slate-800 hover:text-blue-600 transition-colors truncate max-w-[210px]"
                              title={person.email}
                            >
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{person.email}</span>
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 italic">
                              <Mail className="w-3 h-3 text-slate-300 shrink-0" />
                              No email registered
                            </span>
                          )}

                          {person.phone ? (
                            <a
                              href={`tel:${person.phone}`}
                              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-emerald-700 transition-colors font-mono"
                              title={person.phone}
                            >
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{person.phone}</span>
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[10px] text-slate-400 italic">
                              <Phone className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                              No contact phone
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Assigned Role */}
                      <td className="p-3.5">
                        <RoleBadge
                          roleCategory={person.roleCategory}
                          designation={person.designation}
                        />
                      </td>

                      {/* Site / Project Assignment */}
                      <td className="p-3.5">
                        <SiteAssignmentBadge sites={person.assignedSites} />
                      </td>

                      {/* Status */}
                      <td className="p-3.5 pr-5 text-center">
                        <StatusBadge status={person.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-800">{(safeCurrentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-slate-800">{Math.min(safeCurrentPage * pageSize, filteredWorkforce.length)}</strong> of{' '}
              <strong className="text-slate-800">{filteredWorkforce.length}</strong> personnel
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold disabled:opacity-40 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-700 text-xs">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold disabled:opacity-40 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Referral Onboarding Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Generate Referral Onboarding Invitation"
      >
        {inviteResult ? (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h3 className="text-sm font-bold text-slate-900">Invitation Code Generated Successfully!</h3>
            <p className="text-xs text-slate-600">
              Share this 8-digit referral code with the invited member to join during registration:
            </p>
            <div className="relative group">
              <div className="p-3.5 bg-slate-100 rounded-xl font-mono text-2xl font-extrabold text-[#0B3470] tracking-widest select-all border border-slate-200">
                {inviteResult.code}
              </div>
              <button
                type="button"
                onClick={() => handleCopyInviteCode(inviteResult.code)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">Copied to clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Click to Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 text-left text-xs text-slate-700 space-y-1">
              <div><strong className="text-slate-900">Assigned Role:</strong> <span className="capitalize">{inviteResult.role}</span></div>
              {inviteResult.name && <div><strong className="text-slate-900">Name:</strong> {inviteResult.name}</div>}
              {inviteResult.email && <div><strong className="text-slate-900">Email:</strong> {inviteResult.email}</div>}
            </div>

            <button
              type="button"
              onClick={() => setIsInviteOpen(false)}
              className="w-full py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <label className="block text-xs font-medium text-slate-700">
              Staff Member Name *
              <input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Ramesh K. Sharma"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700">
                Official Email
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ramesh@ebricks.com"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>

              <label className="block text-xs font-medium text-slate-700">
                Contact Phone
                <input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              System Role *
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              >
                <option value="manager">Operations / Project Manager</option>
                <option value="supervisor">Site Supervisor</option>
                <option value="customer">Client / Customer</option>
                <option value="staff">Corporate Field Staff</option>
              </select>
            </label>

            {/* Optional Site Assignment */}
            {sites && sites.length > 0 && (
              <label className="block text-xs font-medium text-slate-700">
                Initial Site Assignment (Optional)
                <select
                  value={formData.assignedProjects?.[0] || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      assignedProjects: e.target.value ? [e.target.value] : [],
                    })
                  }
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                >
                  <option value="">Unassigned</option>
                  {sites.map((s, idx) => (
                    <option key={`team-site-${s.id || s.siteId || idx}-${idx}`} value={s.id}>
                      {s.projectName || s.siteName || s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingInvite}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors"
              >
                {savingInvite ? 'Generating...' : '✓ Generate Code'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Direct Manager Account Creation Modal */}
      <Modal
        isOpen={isManagerModalOpen}
        onClose={() => {
          setIsManagerModalOpen(false)
          setManagerError('')
          setManagerSuccess('')
          setUsernameStatusText(null)
          setIsUsernameValid(null)
          setIsCheckingUsername(false)
        }}
        title="Create New Organization Manager Account"
      >
        <form onSubmit={handleCreateManagerSubmit} className="space-y-4">
          {managerError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold flex items-start gap-2">
              <span className="text-sm">⚠️</span>
              <div>{managerError}</div>
            </div>
          )}

          {managerSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold flex items-center gap-2">
              <span className="text-sm">✓</span>
              <div>{managerSuccess}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Full Name *
              <input
                required
                value={managerFormData.fullName}
                onChange={(e) => setManagerFormData({ ...managerFormData, fullName: e.target.value })}
                placeholder="e.g. Sharan Rooks"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>

            <label className="block text-xs font-medium text-slate-700">
              Username *
              <div className="relative mt-1">
                <input
                  required
                  value={managerFormData.username}
                  onChange={(e) => setManagerFormData({ ...managerFormData, username: e.target.value.replace(/\s+/g, '') })}
                  placeholder="e.g. Sharan123"
                  className={`w-full bg-slate-50 border rounded-xl p-2.5 pr-8 text-xs text-slate-900 outline-none transition-colors ${isUsernameValid === false
                      ? 'border-rose-400 focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                      : isUsernameValid === true
                        ? 'border-emerald-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                        : 'border-slate-300 focus:bg-white focus:border-blue-600'
                    }`}
                />
                {isCheckingUsername && (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              {isCheckingUsername ? (
                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1">
                  Checking username...
                </span>
              ) : isUsernameValid === false && usernameStatusText ? (
                <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 mt-1">
                  <span className="text-xs">⚠️</span>
                  {usernameStatusText}
                </span>
              ) : isUsernameValid === true ? (
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                  Username is available ✓
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 block mt-0.5">Global case-insensitive unique login ID</span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Account Password *
              <input
                type="password"
                required
                value={managerFormData.password}
                onChange={(e) => setManagerFormData({ ...managerFormData, password: e.target.value })}
                placeholder="••••••••"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>

            <label className="block text-xs font-medium text-slate-700">
              Contact Number *
              <input
                required
                value={managerFormData.phone}
                onChange={(e) => setManagerFormData({ ...managerFormData, phone: e.target.value })}
                placeholder="8489044572"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-700">
            Official Email Address
            <input
              type="email"
              value={managerFormData.email}
              onChange={(e) => setManagerFormData({ ...managerFormData, email: e.target.value })}
              placeholder="sharan.rooks@gmail.com"
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Department
              <input
                value={managerFormData.department}
                onChange={(e) => setManagerFormData({ ...managerFormData, department: e.target.value })}
                placeholder="Operations"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>

            <label className="block text-xs font-medium text-slate-700">
              Designation
              <input
                value={managerFormData.designation}
                onChange={(e) => setManagerFormData({ ...managerFormData, designation: e.target.value })}
                placeholder="Site Manager"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsManagerModalOpen(false)
                setManagerError('')
                setManagerSuccess('')
              }}
              className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={managerSubmitLoading || isCheckingUsername || isUsernameValid === false}
              className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {managerSubmitLoading ? 'Saving Manager...' : '✓ Create Manager Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
