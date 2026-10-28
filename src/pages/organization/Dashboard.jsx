import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrganizationDashboard } from '../../hooks/useOrganizationDashboard'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import logo from '../../assets/logo/FinalLogo.jpg'
import OrganizationModule from './Module'
import ProjectAlertBadge from '../../components/common/ProjectAlertBadge'
import { evaluateAllProjectAlerts } from '../../utils/projectAlerts'
import { getNormalizedSiteOptions } from '../../utils/siteUtils.js'
import {
  Building2,
  Wallet,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  Plus,
  ArrowRight,
  Search,
  Boxes,
  FileText,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  BarChart3,
  DollarSign,
  Layers,
  Compass,
  Briefcase,
  Layers3,
  LayoutDashboard,
  IndianRupee,
  CreditCard,
  Settings,
  Receipt,
  Award,
} from 'lucide-react'

function value(record, fields, fallback = '') {
  return fields.map((field) => record?.[field]).find((item) => item !== undefined && item !== null && item !== '') ?? fallback
}

function parseAmount(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]+/g, '').trim()
    if (!cleaned) return 0
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function number(record, fields) {
  if (!record || !fields) return 0
  for (const field of fields) {
    const val = record[field]
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseAmount(val)
      if (parsed !== 0 || val === 0 || val === '0') {
        return parsed
      }
    }
  }
  return 0
}

function progressOf(record) {
  const raw = value(record, ['progress', 'progressPercentage', 'completion'], null)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null
}

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

function statusOf(site) {
  return String(value(site, ['currentStatus', 'status', 'projectStatus'], 'Status unavailable')).replace(/_/g, ' ')
}

function ProgressBar({ percent }) {
  const p = percent === null ? 0 : percent
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
        <div
          className="bg-linear-to-r from-[#0B3470] to-blue-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs font-bold text-slate-700 min-w-10 text-right">{percent === null ? 'N/A' : `${percent}%`}</span>
    </div>
  )
}

function MetricCard({ title, value: metricValue, detail, icon: Icon, tone = 'blue', badge }) {
  const toneMap = {
    blue: { bg: 'bg-blue-50 text-[#0B3470]' },
    green: { bg: 'bg-emerald-50 text-emerald-700' },
    orange: { bg: 'bg-amber-50 text-amber-700' },
    red: { bg: 'bg-rose-50 text-rose-700' },
    indigo: { bg: 'bg-indigo-50 text-indigo-700' },
  }
  const theme = toneMap[tone] || toneMap.blue

  return (
    <div
      className="relative p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs ${theme.bg}`}>
          {Icon ? <Icon className="w-5 h-5" /> : '▦'}
        </span>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs font-semibold text-slate-500 line-clamp-1">{title}</p>
        <strong className="text-2xl md:text-3xl font-extrabold text-slate-900 block tracking-tight">{metricValue}</strong>
        <small className="text-[11px] text-slate-400 block line-clamp-1 font-medium">{detail}</small>
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title, href, action = 'View all' }) {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
      <div>
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{eyebrow}</p>
        <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
      </div>
      {href && (
        <Link to={href} className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
          {action} →
        </Link>
      )}
    </div>
  )
}

function ProfileMenu({ user, userData, role, onRefresh, onLogout }) {
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const menuRef = useRef(null)
  const profileName = value(userData, ['fullName', 'name', 'displayName'], user?.displayName || user?.email || 'Organization Admin')
  const profileEmail = value(userData, ['email', 'Email'], user?.email || 'Not available')
  const profilePhone = value(userData, ['phone', 'phoneNumber', 'mobile'], user?.phoneNumber || 'Not available')

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  async function handleOpen() {
    setOpen((current) => !current)
    if (!open) {
      setRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
      }
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 transition-all text-left"
      >
        <span className="w-8 h-8 rounded-lg bg-[#0B3470] text-white font-bold text-xs flex items-center justify-center shadow-xs">
          {profileName.slice(0, 2).toUpperCase()}
        </span>
        <div className="hidden sm:block pr-2">
          <strong className="block text-xs font-semibold text-slate-800">{profileName}</strong>
          <small className="block text-[10px] text-slate-500">Organization Admin</small>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 space-y-3 z-50 animate-fade-in">
          <div className="border-b border-slate-100 pb-2">
            <strong className="block text-xs font-bold text-slate-900">{profileName}</strong>
            <small className="text-[11px] text-slate-500">{refreshing ? 'Refreshing profile...' : 'Active Administrator'}</small>
          </div>
          <div className="space-y-1.5 text-xs text-slate-700">
            <div><span className="text-slate-400 text-[10px] block">Email:</span>{profileEmail}</div>
            <div><span className="text-slate-400 text-[10px] block">Phone:</span>{profilePhone}</div>
            <div><span className="text-slate-400 text-[10px] block">Role:</span><span className="text-emerald-700 font-semibold">{role || 'Organization'}</span></div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function OrganizationDashboard() {
  const { orgId, user, role, userData, refreshUserProfile, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const orgDashboardData = useOrganizationDashboard(orgId)
  const dashboardData = orgDashboardData
  const {
    projects,
    sites,
    materials,
    materialRequests,
    pettyCashAccounts,
    pettyCashRequests,
    pettyCashExpenses,
    contractors,
    contractorBills,
    workers,
    workersConfig,
    workerSiteMapping,
    workerAttendance,
    tools,
    vehicles,
    qualityChecklists,
    safetyIncidents,
    customerInvoices,
    dailySiteLogs,
    approvals,
    supervisors,
    managers,
    expenses,
    pettyCash,
    totalSiteExpensesPerDay,
    sitePayments,
    subscription,
    loading,
    error,
    siteMaterialsRequest,
    siteToolsRequest,
    siteSupervisorProjectStageSchedule,
    siteSupervisorEntries,
    managerExpenses,
    managerEntries,
    managerExpenseSummary,
    organizationExpenses,
    organizationEntries,
    organizationExpenseSummary,
    contractorEntries,
    vehicleMovements,
    projectStages,
    materialsAvailability,
    siteMaterialPool,
    materialAllocations,
  } = orgDashboardData
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [globalQuery, setGlobalQuery] = useState('')

  const normalizedSites = useMemo(() => getNormalizedSiteOptions(sites), [sites])

  const filteredSites = useMemo(
    () => (selectedProjectId === 'all' ? sites : sites.filter((site) => site.id === selectedProjectId)),
    [selectedProjectId, sites]
  )

  const searchedSites = useMemo(() => {
    const query = globalQuery.trim().toLowerCase()
    if (!query) return filteredSites
    return filteredSites.filter((site) =>
      [
        value(site, ['projectName', 'siteName', 'name']),
        value(site, ['siteLocation', 'location', 'address']),
        value(site, ['managerName', 'manager', 'assignedManager', 'supervisor', 'ownerName']),
        statusOf(site),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
  }, [filteredSites, globalQuery])

  const plannedBudget = filteredSites.reduce(
    (total, site) =>
      total +
      number(site, [
        'projectBudget',
        'budget',
        'totalBudget',
        'estimatedBudget',
        'plannedBudget',
        'project_budget',
        'contractValue',
        'total_budget',
      ]),
    0
  )

  const spentBudget = filteredSites.reduce((total, site) => {
    const sId = String(site.id || site.siteId || site.siteid || site.code || '').trim().toLowerCase()
    const sName = String(site.name || site.siteName || site.sitename || site.projectName || '').trim().toLowerCase()

    const expDoc = totalSiteExpensesPerDay.find((d) => {
      const dId = String(d.id || d.siteId || d.siteid || d.projectId || '').trim().toLowerCase()
      const dName = String(d.siteName || d.sitename || d.projectName || d.name || '').trim().toLowerCase()
      return (sId && dId && (sId === dId || dId.includes(sId) || sId.includes(dId))) ||
             (sName && dName && (sName === dName || dName.includes(sName) || sName.includes(dName)))
    })

    const totalAllExp = expDoc ? number(expDoc, ['totalAllExpenses', 'totalAllExpense', 'total_all_expenses', 'totalExpenses', 'totalExpense']) : 0
    const supervisorExp = expDoc ? number(expDoc, ['totalSiteExpense', 'totalSupervisorExpense', 'siteExpense']) : 0
    const mgrExp = expDoc ? number(expDoc, ['totalMgrExpense', 'totalManagerExpense', 'managerExpense']) : 0
    const orgExp = expDoc ? number(expDoc, ['totalOrgExpense', 'totalOrganizationExpense', 'orgExpense']) : 0
    const conExp = expDoc ? number(expDoc, ['totalContractorExpense', 'totalContractorPayments']) : 0
    const incExp = expDoc ? number(expDoc, ['totalIncentiveExpenses', 'totalIncentives']) : 0
    const calculatedDocExp = supervisorExp + mgrExp + orgExp + conExp + incExp

    const directSiteExp = number(site, [
      'amountSpent',
      'amountSpend',
      'spent',
      'spentAmount',
      'actual',
      'actualExpenditure',
      'actualExpense',
      'totalAllExpenses',
      'totalExpenses',
      'totalExpense',
      'expenditure',
      'amount_spent',
    ])

    const siteSpend = totalAllExp > 0 ? totalAllExp : calculatedDocExp > 0 ? calculatedDocExp : directSiteExp
    return total + siteSpend
  }, 0)
  const activeSites = filteredSites.filter((site) => ['active', 'in progress', 'ongoing', 'live'].includes(statusOf(site).toLowerCase())).length
  const completedSites = filteredSites.filter((site) => statusOf(site).toLowerCase() === 'completed').length
  const planningSites = filteredSites.filter((site) => statusOf(site).toLowerCase() === 'planning').length
  const pendingApprovals = useMemo(() => {
    const all = [
      ...(siteMaterialsRequest || []),
      ...(siteToolsRequest || []),
      ...(siteSupervisorProjectStageSchedule || []),
      ...(pettyCashRequests || []),
      ...(siteSupervisorEntries || []),
      ...(vehicleMovements || []),
    ]
    return all.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      return ['pending_org_approval', 'pending_organization_approval', 'manager_verified'].includes(st)
    }).length
  }, [
    siteMaterialsRequest,
    siteToolsRequest,
    siteSupervisorProjectStageSchedule,
    pettyCashRequests,
    siteSupervisorEntries,
    vehicleMovements,
  ])

  const activeWorkforce = useMemo(() => {
    if (!filteredSites || filteredSites.length === 0) {
      return 0
    }

    let totalFromSites = 0
    let hasSiteSpecificData = false

    filteredSites.forEach((site) => {
      const sId = String(site.id || site.siteId || '').trim().toLowerCase()
      const sName = String(site.projectName || site.siteName || site.name || '').trim().toLowerCase()

      const directCount = number(site, ['activeWorkforce', 'workersDeployed', 'workforce'])

      const mappingDoc = (workerSiteMapping || []).find((m) => {
        const mId = String(m.siteId || m.id || '').trim().toLowerCase()
        const mName = String(m.siteName || m.name || '').trim().toLowerCase()
        return (sId && mId && (sId === mId || mId.includes(sId) || sId.includes(mId))) ||
               (sName && mName && (sName === mName || mName.includes(sName) || sName.includes(mName)))
      })
      const mappedCount = mappingDoc
        ? Array.isArray(mappingDoc.workers)
          ? mappingDoc.workers.length
          : Number(mappingDoc.totalWorkersMapped) || 0
        : 0

      const attendanceDocs = (workerAttendance || []).filter((a) => {
        const aId = String(a.siteId || a.id || '').trim().toLowerCase()
        const aName = String(a.siteName || a.name || '').trim().toLowerCase()
        return (sId && aId && (sId === aId || aId.includes(sId) || sId.includes(aId))) ||
               (sName && aName && (sName === aName || aName.includes(sName) || sName.includes(aName)))
      })
      const attendanceCount = attendanceDocs.reduce((max, a) => {
        const cnt = Number(a?.totalWorkersOnSite || a?.totalMappedPresent || a?.headcount || a?.presentCount || 0) ||
          (Array.isArray(a?.workers) ? a.workers.filter((w) => w.status === 'present' || w.status === 'P' || w.isPresent).length : 0)
        return Math.max(max, cnt)
      }, 0)

      const siteWorkforce = Math.max(directCount, mappedCount, attendanceCount)
      if (siteWorkforce > 0) {
        hasSiteSpecificData = true
        totalFromSites += siteWorkforce
      }
    })

    if (hasSiteSpecificData) {
      return totalFromSites
    }

    if (selectedProjectId === 'all') {
      const registeredCount = (workersConfig && workersConfig.length > 0)
        ? workersConfig.length
        : (workers && workers.length > 0 ? workers.length : 0)
      if (registeredCount > 0) {
        return registeredCount
      }
    }

    return 0
  }, [filteredSites, workerSiteMapping, workerAttendance, workersConfig, workers, selectedProjectId])

  const subscriptionExpiryInfo = useMemo(() => {
    if (!subscription) return null
    const planName = subscription.subscriptionPlan || subscription.planName || 'Free Trial'
    const isEnterprise = String(planName).toLowerCase() === 'enterprise'
    if (isEnterprise) return null

    const endDateRaw = subscription.subscriptionEndDate || subscription.endDate
    let endDate = null
    if (endDateRaw?.toDate) endDate = endDateRaw.toDate()
    else if (endDateRaw?.seconds) endDate = new Date(endDateRaw.seconds * 1000)
    else if (endDateRaw) endDate = new Date(endDateRaw)

    const now = new Date()
    let daysRemaining = subscription.daysRemaining
    if (daysRemaining === undefined && endDate && !isNaN(endDate.getTime())) {
      daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    }

    const isTrial = planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('free')

    const isExpired =
      subscription.isSubscriptionActive === false ||
      (daysRemaining !== undefined && daysRemaining <= 0) ||
      (endDate && endDate.getTime() <= now.getTime())

    const isExpiringSoon = !isExpired && daysRemaining !== undefined && daysRemaining <= 5

    return {
      planName,
      isTrial,
      daysRemaining: daysRemaining ?? 0,
      isExpired,
      isExpiringSoon,
      isQueuedUpgrade: Boolean(subscription.isUpgradeQueued && subscription.queuedPlan),
      queuedPlanName: subscription.queuedPlan?.planName,
    }
  }, [subscription])

  const organizationName = value(userData, ['organizationName', 'orgName', 'companyName'], 'Your Organization')
  const currentDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date())
  const configuredStageNames = (projectStages || [])
    .map((s) => (s.projectStage || s.name || '').trim())
    .filter(Boolean)
  const stageNames = configuredStageNames.length > 0
    ? configuredStageNames
    : [...new Set(filteredSites.map((site) => value(site, ['projectStage', 'stage', 'currentStage'], '')).filter(Boolean))]
  const activeModule = location.pathname.split('/').filter(Boolean)[1] || 'dashboard'

  const navigation = [
    ['Dashboard', '/organization/dashboard', LayoutDashboard],
    ['Sites', '/organization/sites', Building2],
    ['Layout & Drawings', '/organization/drawings', Compass],
    ['Staff & Workforce', '/organization/team', Users],
    ['Inventory & Assets', '/organization/inventory', Boxes],
    ['Finance', '/organization/finance', IndianRupee],
    ['Organization Expenses', '/organization/expenses', Receipt],
    ['Approvals', '/organization/approvals', CheckCircle2],
    ['Incentives', '/organization/incentive-calculation', Award],
    ['Petty Cash', '/organization/petty-cash', Wallet],
    ['Reports', '/organization/reports', BarChart3],
    ['Subscription', '/organization/subscription', CreditCard],
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  if (loading && activeModule === 'dashboard') {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">Loading organization command center...</div>
  }

  return (
    <div className="h-screen bg-[#F8FAFC] text-slate-900 flex font-sans overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Strict #0B3470 Sidebar (Desktop Fixed & Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B3470] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-xl lg:z-20 shrink-0 h-screen overflow-y-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 py-1">
            <Link to="/organization/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
              <img className="h-10 w-auto rounded-xl object-contain bg-white p-1 shadow-md" src={logo} alt="eBricks" />
              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">eBricks</strong>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Enterprise</span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 text-base"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-200/60">CORPORATE MODULES</p>
            {navigation.map(([label, href, Icon]) => (
              <NavLink
                key={label}
                to={href}
                end={label === 'Dashboard'}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white/15 text-white font-bold border border-white/20 shadow-xs'
                      : 'text-blue-100/75 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-5 h-5 shrink-0 text-white">
                    <Icon className="w-4 h-4 text-white shrink-0" />
                  </span>
                  <span className="truncate">{label}</span>
                </span>
                {label === 'Approvals' && pendingApprovals > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-slate-950 rounded-full shadow-xs shrink-0">
                    {pendingApprovals}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <NavLink
            to="/organization/settings"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? 'text-white bg-white/15 font-bold border border-white/20 shadow-xs'
                  : 'text-blue-100/75 hover:text-white hover:bg-white/10'
              }`
            }
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-5 h-5 shrink-0 text-white">
                <Settings className="w-4 h-4 text-white shrink-0" />
              </span>
              <span className="truncate">Settings</span>
            </span>
          </NavLink>
        </div>
      </aside>

      {/* Main Light Content Surface (Independently Scrollable) */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto bg-[#F8FAFC]">
        {/* Topbar Header (Light Mode) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl border border-slate-200 transition-colors"
              aria-label="Open navigation menu"
            >
              ☰
            </button>
            <span className="text-slate-400 text-sm hidden sm:inline">⌕</span>
            <input
              type="text"
              aria-label="Search records"
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.target.value)}
              placeholder="Search projects, managers, approvals..."
              className="w-full bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNotifOpen(true)}
              className="relative p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl border border-slate-200 transition-colors"
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>
            <ProfileMenu user={user} userData={userData} role={role} onRefresh={refreshUserProfile} onLogout={handleLogout} />
          </div>
        </header>

        {/* Module Content Surface */}
        <main className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          {/* Subscription Expiry / Warning Banner */}
          {subscriptionExpiryInfo?.isExpired && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-950">
                    Subscription Plan Expired ({subscriptionExpiryInfo.planName})
                  </h4>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Your active plan cycle has ended. Creating new sites, managers, and supervisors is temporarily suspended until renewed.
                  </p>
                </div>
              </div>
              <Link
                to="/organization/subscription"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shrink-0 flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Renew / Upgrade Plan
              </Link>
            </div>
          )}

          {subscriptionExpiryInfo?.isExpiringSoon && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-950">
                    Plan Expiring Soon: {subscriptionExpiryInfo.daysRemaining} {subscriptionExpiryInfo.daysRemaining === 1 ? 'day' : 'days'} remaining ({subscriptionExpiryInfo.planName})
                  </h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {subscriptionExpiryInfo.isQueuedUpgrade
                      ? `Your queued plan "${subscriptionExpiryInfo.queuedPlanName}" will automatically activate when this cycle ends.`
                      : 'Renew or upgrade your subscription now to prevent operational disruption.'}
                  </p>
                </div>
              </div>
              <Link
                to="/organization/subscription"
                className="px-4 py-2 bg-[#0B3470] hover:bg-blue-800 text-white text-xs font-bold rounded-xl shrink-0 flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                Manage Subscription →
              </Link>
            </div>
          )}

          {activeModule !== 'dashboard' ? (
            <OrganizationModule
              module={activeModule}
              orgId={orgId}
              user={user}
              projects={projects}
              sites={sites}
              materials={materials}
              materialRequests={materialRequests}
              siteMaterialsRequest={siteMaterialsRequest}
              siteToolsRequest={siteToolsRequest}
              siteSupervisorProjectStageSchedule={siteSupervisorProjectStageSchedule}
              siteSupervisorEntries={siteSupervisorEntries}
              vehicleMovements={vehicleMovements}
              pettyCashAccounts={pettyCashAccounts}
              pettyCashRequests={pettyCashRequests}
              pettyCashExpenses={pettyCashExpenses}
              contractors={contractors}
              contractorBills={contractorBills}
              workers={workers}
              workerAttendance={workerAttendance}
              tools={tools}
              vehicles={vehicles}
              qualityChecklists={qualityChecklists}
              safetyIncidents={safetyIncidents}
              customerInvoices={customerInvoices}
              dailySiteLogs={dailySiteLogs}
              approvals={approvals}
              supervisors={supervisors}
              managers={managers}
              managerExpenses={managerExpenses}
              managerEntries={managerEntries}
              managerExpenseSummary={managerExpenseSummary}
              organizationExpenses={organizationExpenses}
              organizationEntries={organizationEntries}
              organizationExpenseSummary={organizationExpenseSummary}
              contractorEntries={contractorEntries}
              expenses={expenses}
              pettyCash={pettyCash}
              totalSiteExpensesPerDay={totalSiteExpensesPerDay}
              sitePayments={sitePayments}
              subscription={subscription}
              projectStages={projectStages}
              materialsAvailability={materialsAvailability}
              siteMaterialPool={siteMaterialPool}
              materialAllocations={materialAllocations}
              loading={loading}
              error={error}
            />
          ) : (
            <>
              {/* Modern Organization Header & Control Bar */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-[#0B3470] px-3 py-0.5 text-[11px] font-bold border border-blue-200/80">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        {organizationName} · Live Operations Desk
                      </span>
                      <span className="text-xs text-slate-500 font-medium">{currentDate}</span>
                    </div>

                    <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                      Executive Construction Control & Governance
                    </h1>

                    <p className="text-xs text-slate-500 max-w-3xl">
                      Real-time telemetry across site progress milestones, Tier-2 HQ authorization queues, material stock reserves, and project budget utilization.
                    </p>
                  </div>

                  {/* Top Bar Quick Controls */}
                  <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-auto">
                    <div>
                      <select
                        aria-label="Filter Portfolio View"
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
                      >
                        <option value="all">All Portfolio Projects ({normalizedSites.length})</option>
                        {normalizedSites.map((s, idx) => (
                          <option key={`dash-proj-${s.id || s.siteId || idx}-${idx}`} value={s.id || s.siteId}>
                            {s.label || s.projectName || s.siteName || s.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* <Link
                      to="/organization/sites"
                      className="px-3.5 py-2 rounded-xl bg-[#0B3470] hover:bg-[#082654] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Site</span>
                    </Link> */}

                    <Link
                      to="/organization/approvals"
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>HQ Approvals</span>
                      {pendingApprovals > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-black bg-white text-amber-800 rounded-full">
                          {pendingApprovals}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              </div>

              {/* Metric Cards Grid */}
              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard
                  title="Total Sites"
                  value={filteredSites.length}
                  detail={`${activeSites} live · ${planningSites} planning`}
                  icon={Building2}
                  tone="blue"
                />
                <MetricCard
                  title="Active Workforce"
                  value={`${activeWorkforce} Workers`}
                  detail={`${managers?.length || 0} managers · ${supervisors?.length || 0} supervisors · ${activeWorkforce} active workers`}
                  icon={Users}
                  tone="orange"
                />
                <MetricCard
                  title="Pending HQ Approvals"
                  value={pendingApprovals}
                  detail="Tier 2 action required"
                  icon={ShieldCheck}
                  tone="red"
                  badge={pendingApprovals > 0 ? `${pendingApprovals} Pending` : null}
                />
                <MetricCard
                  title="Total Spend"
                  value={money(spentBudget)}
                  detail={`${money(plannedBudget)} budget`}
                  icon={Wallet}
                  tone="indigo"
                />
                <MetricCard
                  title="Budget Utilization"
                  value={plannedBudget ? `${Math.round((spentBudget / plannedBudget) * 100)}%` : '0%'}
                  detail="Actual vs sanctioned limit"
                  icon={TrendingUp}
                  tone="green"
                />
              </section>

              {/* Operations & Projects Split Grid */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Progress Portfolio Table */}
                <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">PROJECT PORTFOLIO</p>
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">Construction Site Milestones & Telemetry</h2>
                    </div>
                    <Link to="/organization/sites" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                      View all sites →
                    </Link>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                        <tr>
                          <th className="p-3">Project / Location</th>
                          <th className="p-3">Stage & Risk Alerts</th>
                          <th className="p-3">Progress</th>
                          <th className="p-3 text-right">Sanctioned Budget</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {searchedSites.slice(0, 5).map((site) => (
                          <tr key={site.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0B3470] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
                                  <Building2 className="w-4 h-4" />
                                </div>
                                <div>
                                  <strong className="text-slate-900 block font-bold">
                                    {value(site, ['projectName', 'siteName', 'name'], site.id)}
                                  </strong>
                                  <small className="text-slate-400">
                                    {value(site, ['siteLocation', 'location'], 'Site registered')}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="space-y-1">
                                <span className="font-medium text-slate-800">
                                  {value(site, ['projectStage', 'stage'], 'Foundation')}
                                </span>
                                <div className="mt-0.5">
                                  <ProjectAlertBadge project={site} showDetails={true} />
                                </div>
                              </div>
                            </td>
                            <td className="p-3 min-w-[140px]">
                              <ProgressBar percent={progressOf(site)} />
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-700">
                              {money(number(site, ['projectBudget', 'budget', 'estimatedBudget']))}
                            </td>
                            <td className="p-3 text-center">
                              <StatusBadge status={statusOf(site)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right Sidebar Column: Execution Pipeline & Quick Governance */}
                <div className="space-y-6">
                  {/* Stage Distribution */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                    <SectionHeading eyebrow="STAGE DISTRIBUTION" title="Execution Pipeline" />
                    <div className="space-y-3">
                      {stageNames.map((stage) => {
                        const stageSites = filteredSites.filter((s) => String(value(s, ['projectStage', 'stage'], '')).toLowerCase() === stage.toLowerCase())
                        const progressValues = stageSites.map(progressOf).filter((p) => p !== null)
                        const p = progressValues.length ? Math.round(progressValues.reduce((t, i) => t + i, 0) / progressValues.length) : 0
                        return (
                          <div key={stage} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-800">{stage}</span>
                              <span className="text-slate-500 font-medium">{stageSites.length} sites ({p}%)</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-[#0B3470] h-1.5 rounded-full transition-all duration-500" style={{ width: `${p}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Executive Governance Quick Hub */}
                  <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">GOVERNANCE & CONTROLS</p>
                    <h3 className="text-sm font-bold text-slate-900">Executive Modules</h3>

                    <div className="space-y-2 pt-1">
                      <Link
                        to="/organization/approvals"
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/70 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-800 group-hover:text-blue-900">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>Tier-2 HQ Approvals</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900">
                          {pendingApprovals} Pending
                        </span>
                      </Link>

                      <Link
                        to="/organization/petty-cash"
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200/70 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-800 group-hover:text-emerald-900">
                          <Wallet className="w-4 h-4 text-emerald-600" />
                          <span>Petty Cash Governance</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700" />
                      </Link>

                      <Link
                        to="/organization/reports"
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-purple-50/60 border border-slate-200/70 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-800 group-hover:text-purple-900">
                          <BarChart3 className="w-4 h-4 text-purple-600" />
                          <span>Executive Reports & Audit</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-700" />
                      </Link>

                      <Link
                        to="/organization/incentive-calculation"
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-amber-50/60 border border-slate-200/70 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-800 group-hover:text-amber-900">
                          <Award className="w-4 h-4 text-amber-600" />
                          <span>Incentive Calculation Engine</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-700" />
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} role="Organization" />
    </div>
  )
}
