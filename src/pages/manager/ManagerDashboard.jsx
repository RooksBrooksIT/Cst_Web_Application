import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useManagerDashboard } from '../../hooks/useManagerDashboard'
import { useNotifications } from '../../context/NotificationContext'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import ProjectAlertBadge from '../../components/common/ProjectAlertBadge'
import { evaluateAllProjectAlerts } from '../../utils/projectAlerts'
import logo from '../../assets/logo/FinalLogo.jpg'

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Briefcase,
  Building2,
  CheckCircle2,
  Compass,
  DollarSign,
  FileText,
  FolderTree,
  HelpCircle,
  Link2,
  LogOut,
  Plus,
  Receipt,
  Search,
  Truck,
  Users,
  Wrench,
  X,
  CalendarCheck,
  Coins,
  Sparkles,
} from 'lucide-react'

const displayValue = (value, fallback = '—') => {
  return value === null || value === undefined || value === ''
    ? fallback
    : value
}

const formatCurrency = (value) => {
  const amount = Number(value || 0)
  return `₹${amount.toLocaleString('en-IN')}`
}

const getName = (value) => {
  if (!value) return 'Manager'
  return String(value).trim()
}

function KpiCard({ to, title, value, subtitle, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: {
      icon: 'bg-blue-50 text-blue-700',
      hover: 'group-hover:text-blue-700',
    },
    amber: {
      icon: 'bg-amber-50 text-amber-700',
      hover: 'group-hover:text-amber-700',
    },
    emerald: {
      icon: 'bg-emerald-50 text-emerald-700',
      hover: 'group-hover:text-emerald-700',
    },
    rose: {
      icon: 'bg-rose-50 text-rose-700',
      hover: 'group-hover:text-rose-700',
    },
  }

  const theme = colorMap[color] || colorMap.blue

  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold text-slate-500 ${theme.hover}`}>
          {title}
        </span>

        <span className={`rounded-lg p-2 ${theme.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <strong className="mt-3 block text-3xl font-extrabold text-slate-900">
        {value}
      </strong>

      <small className="mt-1 block text-[11px] text-slate-400">
        {subtitle}
      </small>
    </Link>
  )
}

function ManagerProfileMenu({ user, userData, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const profileName =
    userData?.fullName ||
    userData?.FullName ||
    userData?.name ||
    user?.displayName ||
    'Manager'

  const profileEmail =
    userData?.Email ||
    userData?.email ||
    user?.email ||
    '—'

  const profileDesignation =
    userData?.Designation ||
    userData?.designation ||
    'Manager'

  const profileDepartment =
    userData?.Department ||
    userData?.department ||
    '—'

  const profileId =
    userData?.ManagerId ||
    userData?.managerId ||
    userData?.managerID ||
    '—'

  const role = userData?.role || userData?.Role || 'Manager'

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1.5 text-left transition hover:bg-slate-200"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B3470] text-xs font-bold text-white">
          {getName(profileName).slice(0, 2).toUpperCase()}
        </span>

        <span className="hidden pr-2 sm:block">
          <strong className="block max-w-32 truncate text-xs font-semibold text-slate-800">
            {profileName}
          </strong>
          <small className="block max-w-32 truncate text-[10px] text-slate-500">
            {profileDesignation}
          </small>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="border-b border-slate-100 pb-3">
            <strong className="block text-xs font-bold text-slate-900">
              {profileName}
            </strong>

            <small className="text-[11px] font-semibold text-blue-700">
              {profileDesignation} · {profileDepartment}
            </small>
          </div>

          <div className="space-y-2 py-3 text-xs text-slate-700">
            <div>
              <span className="block text-[10px] text-slate-400">Manager ID</span>
              <span className="font-mono">{profileId}</span>
            </div>

            <div>
              <span className="block text-[10px] text-slate-400">Email</span>
              <span>{profileEmail}</span>
            </div>

            <div>
              <span className="block text-[10px] text-slate-400">Role</span>
              <span className="font-semibold text-emerald-700">{role}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ eyebrow, title, to, linkText = 'View all →' }) {
  return (
    <div className="flex items-end justify-between border-b border-slate-200 pb-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
          {eyebrow}
        </p>

        <h2 className="mt-1 text-base font-bold tracking-tight text-slate-900">
          {title}
        </h2>
      </div>

      {to && (
        <Link to={to} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
          {linkText}
        </Link>
      )}
    </div>
  )
}

export default function ManagerDashboard() {
  const { orgId, user, userData, logout } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()

  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')

  const dashboardData = useManagerDashboard(
    orgId,
    user?.uid,
    userData?.assignedSites || []
  )

  const {
    sites = [],
    workforce = [],
    materials = [],
    tools = [],
    vehicles = [],
    contractors = [],
    supervisors = [],
    pettyCashRequests = [],
    pettyCashExpenses = [],
    pendingExpenses = [],
    pendingMaterialRequests = [],
    pendingToolRequests = [],
    pendingStageMilestones = [],
    dailyLogs = [],
    loading,
  } = dashboardData

  const managerName =
    userData?.fullName ||
    userData?.FullName ||
    userData?.name ||
    user?.displayName ||
    'Manager'

  const activeSites = sites.filter((site) => {
    const status = String(
      site.currentStatus || site.status || ''
    ).toLowerCase()

    return !['completed', 'cancelled', 'closed'].includes(status)
  }).length

  const projectAlertsSummary = useMemo(() => {
    return evaluateAllProjectAlerts(sites)
  }, [sites])

  const totalHeadcount = workforce.reduce((total, item) => {
    const count = Number(item.headcount || item.count || 0)
    return total + (Number.isFinite(count) ? count : 0)
  }, 0)

  const totalApprovalsPending =
    pendingExpenses.length +
    pendingMaterialRequests.length +
    pendingToolRequests.length +
    pendingStageMilestones.length

  const lowStockMaterials = materials.filter((material) => {
    const stock = Number(
      material.currentTotalStock || material.currentStock || 0
    )

    const minimumStock = Number(material.minReorderLevel || 20)

    return stock <= minimumStock
  })

  const lowStockAlertCount = lowStockMaterials.length

  const pendingPettyCashCount =
    pettyCashRequests.filter(
      (item) => item.status === 'PENDING_MANAGER_REVIEW'
    ).length +
    pettyCashExpenses.filter(
      (item) => item.status === 'PENDING_EXPENSE_REVIEW'
    ).length

  const activeVehicles = vehicles.filter(
    (vehicle) => String(vehicle.status || '').toLowerCase() === 'active'
  ).length

  const universalSearchResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase()

    if (!query) return null

    const results = {
      sites: sites
        .filter((site) =>
          String(site.siteName || site.projectName || '')
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 3),

      supervisors: supervisors
        .filter((supervisor) =>
          String(
            supervisor.fullName ||
              supervisor.FullName ||
              supervisor.name ||
              supervisor.username ||
              ''
          )
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 3),

      materials: materials
        .filter((material) =>
          String(material.materialName || material.name || '')
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 3),

      tools: tools
        .filter((tool) =>
          String(tool.toolName || tool.name || tool.toolCode || '')
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 3),

      contractors: contractors
        .filter((contractor) =>
          String(contractor.contractorName || contractor.trade || '')
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 3),

      vehicles: vehicles
        .filter((vehicle) =>
          String(vehicle.numberPlate || vehicle.modelName || '')
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 3),
    }

    const totalMatches = Object.values(results).reduce(
      (total, values) => total + values.length,
      0
    )

    return { results, totalMatches }
  }, [
    globalSearch,
    sites,
    supervisors,
    materials,
    tools,
    contractors,
    vehicles,
  ])

  const sidebarGroups = [
    {
      title: 'Command & Control',
      items: [
        {
          label: 'Manager Dashboard',
          path: '/manager/dashboard',
          icon: Sparkles,
        },
        {
          label: 'Approvals Center',
          path: '/manager/approvals',
          icon: CheckCircle2,
          badge: totalApprovalsPending,
        },
      ],
    },
    {
      title: 'Project & Site Management',
      items: [
        {
          label: 'Project & Site Setup',
          path: '/manager/project-site-setup',
          icon: Building2,
        },
        {
          label: 'Sites Directory',
          path: '/manager/sites',
          icon: Building2,
        },
        {
          label: 'Project Configuration',
          path: '/manager/project-configs',
          icon: FolderTree,
        },
        {
          label: 'Layout and Drawings',
          path: '/manager/drawings',
          icon: Compass,
        },
      ],
    },
    {
      title: 'Supervisor & Field Operations',
      items: [
        {
          label: 'Supervisor Configuration',
          path: '/manager/supervisors',
          icon: Users,
        },
        {
          label: 'Site-Supervisor Map',
          path: '/manager/supervisor-map',
          icon: Link2,
        },
        {
          label: 'Manager Daily Site Entry',
          path: '/manager/daily-logs',
          icon: FileText,
        },
        {
          label: 'Manager Expenses',
          path: '/manager/manager-expenses',
          icon: Receipt,
        },
      ],
    },
    {
      title: 'Materials & Supply Chain',
      items: [
        {
          label: 'Material Master',
          path: '/manager/materials-catalog',
          icon: Boxes,
        },
        {
          label: 'Material Availability',
          path: '/manager/materials-stock',
          icon: Boxes,
          badge: lowStockAlertCount,
        },
        {
          label: 'Material Information',
          path: '/manager/materials-movements',
          icon: Truck,
        },
        {
          label: 'Tools Master',
          path: '/manager/tools-catalog',
          icon: Wrench,
        },
        {
          label: 'Tools Inventory Details',
          path: '/manager/tools-movements',
          icon: Wrench,
        },
      ],
    },
    {
      title: 'Workforce & Contractors',
      items: [
        {
          label: 'Contractors Directory',
          path: '/manager/contractors',
          icon: Briefcase,
        },
        {
          label: 'Labour Category Config',
          path: '/manager/labour-scales',
          icon: Coins,
        },
        {
          label: 'Workers Configuration',
          path: '/manager/workers',
          icon: Users,
        },
        {
          label: 'Workers Site Mapping',
          path: '/manager/worker-mapping',
          icon: Link2,
        },
        {
          label: 'Worker Attendance',
          path: '/manager/attendance',
          icon: CalendarCheck,
        },
      ],
    },
    {
      title: 'Fleet & Logistics',
      items: [
        {
          label: 'Vehicle Fleet',
          path: '/manager/fleet',
          icon: Truck,
        },
      ],
    },
    {
      title: 'Finance & Support',
      items: [
        {
          label: 'Petty Cash Management',
          path: '/manager/petty-cash',
          icon: DollarSign,
          badge: pendingPettyCashCount,
        },
        {
          label: 'Notifications',
          path: '/manager/notifications',
          icon: Bell,
        },
        {
          label: 'Manager Support',
          path: '/manager/support',
          icon: HelpCircle,
        },
      ],
    },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm text-slate-500">
        Loading construction operations dashboard...
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] font-sans text-slate-900">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col justify-between overflow-y-auto bg-[#0B3470] p-4 shadow-2xl transition-transform duration-300 lg:static lg:z-20 lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <Link
              to="/manager/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3"
            >
              <img
                src={logo}
                alt="eBricks"
                className="h-10 w-auto rounded-xl bg-white p-1 shadow-md"
              />

              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">
                  eBricks
                </strong>

                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
                  Manager Portal
                </span>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="mt-7 space-y-5">
            {sidebarGroups.map((group) => (
              <div key={group.title}>
                <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-200/50">
                  {group.title}
                </p>

                <div className="mt-1 space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isDashboard =
                      item.path === '/manager/dashboard'

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition ${
                          isDashboard
                            ? 'border border-white/20 bg-white/15 font-bold text-white'
                            : 'font-medium text-blue-100/75 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>

                        {item.badge > 0 && (
                          <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-6 border-t border-white/10 px-3 pt-4 text-xs text-white/80">
          <p className="truncate font-semibold">{managerName}</p>
          <span className="text-[10px] text-blue-200">
            Construction Operations Manager
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3.5 shadow-sm backdrop-blur-md sm:px-6">
          <div className="relative flex max-w-2xl flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600 lg:hidden"
            >
              ☰
            </button>

            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                placeholder="Search sites, supervisors, materials, tools or vehicles..."
                className="w-full rounded-xl border border-slate-200 bg-slate-100/90 py-2 pl-9 pr-9 text-xs outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />

              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {universalSearchResults && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
                  <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold">
                    <span>
                      Search Results ({universalSearchResults.totalMatches})
                    </span>

                    <span className="text-[10px] font-normal text-slate-400">
                      Select a result to open its module
                    </span>
                  </div>

                  {universalSearchResults.totalMatches === 0 ? (
                    <p className="py-5 text-center text-xs text-slate-400">
                      No matching construction records found.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3 text-xs">
                      {universalSearchResults.results.sites.length > 0 && (
                        <SearchGroup
                          title="Construction Sites"
                          color="text-blue-600"
                          items={universalSearchResults.results.sites}
                          getLabel={(item) =>
                            `${displayValue(
                              item.siteName || item.projectName,
                              'Unnamed Site'
                            )} · ${displayValue(
                              item.location || item.siteLocation,
                              'Location unavailable'
                            )}`
                          }
                          to="/manager/sites"
                          onSelect={() => setGlobalSearch('')}
                        />
                      )}

                      {universalSearchResults.results.supervisors.length > 0 && (
                        <SearchGroup
                          title="Supervisors"
                          color="text-emerald-600"
                          items={universalSearchResults.results.supervisors}
                          getLabel={(item) =>
                            displayValue(
                              item.fullName ||
                                item.FullName ||
                                item.name ||
                                item.username,
                              'Unnamed Supervisor'
                            )
                          }
                          to="/manager/supervisors"
                          onSelect={() => setGlobalSearch('')}
                        />
                      )}

                      {universalSearchResults.results.materials.length > 0 && (
                        <SearchGroup
                          title="Materials"
                          color="text-teal-600"
                          items={universalSearchResults.results.materials}
                          getLabel={(item) =>
                            displayValue(
                              item.materialName || item.name,
                              'Unnamed Material'
                            )
                          }
                          to="/manager/materials-catalog"
                          onSelect={() => setGlobalSearch('')}
                        />
                      )}

                      {universalSearchResults.results.tools.length > 0 && (
                        <SearchGroup
                          title="Tools and Equipment"
                          color="text-amber-600"
                          items={universalSearchResults.results.tools}
                          getLabel={(item) =>
                            displayValue(
                              item.toolName || item.name || item.toolCode,
                              'Unnamed Tool'
                            )
                          }
                          to="/manager/tools-catalog"
                          onSelect={() => setGlobalSearch('')}
                        />
                      )}

                      {universalSearchResults.results.contractors.length > 0 && (
                        <SearchGroup
                          title="Contractors"
                          color="text-purple-600"
                          items={universalSearchResults.results.contractors}
                          getLabel={(item) =>
                            displayValue(
                              item.contractorName || item.trade,
                              'Unnamed Contractor'
                            )
                          }
                          to="/manager/contractors"
                          onSelect={() => setGlobalSearch('')}
                        />
                      )}

                      {universalSearchResults.results.vehicles.length > 0 && (
                        <SearchGroup
                          title="Vehicles"
                          color="text-orange-600"
                          items={universalSearchResults.results.vehicles}
                          getLabel={(item) =>
                            displayValue(
                              item.numberPlate || item.modelName,
                              'Unnamed Vehicle'
                            )
                          }
                          to="/manager/fleet"
                          onSelect={() => setGlobalSearch('')}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNotificationOpen(true)}
              className="relative rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />

              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            <ManagerProfileMenu
              user={user}
              userData={userData}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 p-5 md:p-8">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
  {/* Decorative background */}
  <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-blue-100/60 blur-3xl" />
  <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-cyan-100/50 blur-3xl" />

  <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr]">
    {/* Main welcome content */}
    <div className="bg-gradient-to-br from-[#0B3470] via-[#10478F] to-[#1768C5] p-6 text-white md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.15)]" />
            Live Operations
          </span>

          <h1 className="mt-5 text-2xl font-extrabold tracking-tight md:text-3xl">
            Good morning, {getName(managerName).split(' ')[0]}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-blue-100/85">
            Manage your construction operations, review field activity, monitor
            material availability, and keep every project moving forward.
          </p>
        </div>

        <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 lg:flex">
          <Building2 className="h-7 w-7 text-blue-100" />
        </div>
      </div>

      {/* Quick metrics */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
          <p className="text-[10px] uppercase tracking-wide text-blue-200">
            Active Sites
          </p>
          <strong className="mt-1 block text-xl font-extrabold">
            {activeSites}
          </strong>
          <span className="text-[10px] text-blue-200">
            of {sites.length} total
          </span>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
          <p className="text-[10px] uppercase tracking-wide text-blue-200">
            Workforce
          </p>
          <strong className="mt-1 block text-xl font-extrabold">
            {totalHeadcount}
          </strong>
          <span className="text-[10px] text-blue-200">
            workers recorded
          </span>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
          <p className="text-[10px] uppercase tracking-wide text-blue-200">
            Approvals
          </p>
          <strong className="mt-1 block text-xl font-extrabold">
            {totalApprovalsPending}
          </strong>
          <span className="text-[10px] text-blue-200">
            awaiting review
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          to="/manager/project-site-setup"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#0B3470] shadow-sm transition hover:bg-blue-50"
        >
          <Plus className="h-4 w-4" />
          Add Construction Site
        </Link>

        <Link
          to="/manager/daily-logs"
          className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/20"
        >
          <FileText className="h-4 w-4" />
          Record Daily Progress
        </Link>
      </div>
    </div>

    {/* Right project overview panel */}
    <div className="relative bg-white p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
            Operations Snapshot
          </p>

          <h2 className="mt-1 text-base font-bold text-slate-900">
            Project Health
          </h2>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Activity className="h-4 w-4" />
        </div>
      </div>

      {/* Project health indicator */}
      <div className="mt-7 flex items-center gap-5">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[10px] border-slate-100" />

          <div
            className="absolute inset-0 rounded-full border-[10px] border-blue-600"
            style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
              transform: 'rotate(-45deg)',
            }}
          />

          <div className="relative text-center">
            <strong className="block text-2xl font-extrabold text-slate-900">
              {sites.length > 0
                ? Math.round((activeSites / sites.length) * 100)
                : 0}
              %
            </strong>

            <span className="text-[10px] text-slate-400">active</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-800">
              Portfolio status
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Current construction activity
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700">
              Operations active
            </span>
          </div>
        </div>
      </div>

      {/* Alert rows */}
      <div className="mt-7 space-y-2">
        <Link
          to="/manager/approvals"
          className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 transition hover:bg-amber-100"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <CheckCircle2 className="h-4 w-4" />
            Pending approvals
          </span>

          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
            {totalApprovalsPending}
          </span>
        </Link>

        <Link
          to="/manager/materials-stock"
          className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 transition hover:bg-rose-100"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-rose-800">
            <Boxes className="h-4 w-4" />
            Low-stock materials
          </span>

          <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-900">
            {lowStockAlertCount}
          </span>
        </Link>

        <Link
          to="/manager/fleet"
          className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 transition hover:bg-blue-100"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-blue-800">
            <Truck className="h-4 w-4" />
            Active vehicles
          </span>

          <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-900">
            {activeVehicles}
          </span>
        </Link>

        <Link
          to="/manager/sites"
          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition ${
            projectAlertsSummary.criticalCount > 0
              ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
              : projectAlertsSummary.warningCount > 0
              ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Project & Budget Alerts
          </span>

          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              projectAlertsSummary.criticalCount > 0
                ? 'bg-rose-200 text-rose-900'
                : projectAlertsSummary.warningCount > 0
                ? 'bg-amber-200 text-amber-900'
                : 'bg-emerald-200 text-emerald-900'
            }`}
          >
            {projectAlertsSummary.totalAlerts} Alert{projectAlertsSummary.totalAlerts !== 1 ? 's' : ''}
          </span>
        </Link>
      </div>
    </div>
  </div>
</section>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              to="/manager/sites"
              title="Active Construction Sites"
              value={activeSites}
              subtitle={`${sites.length} total registered sites`}
              icon={Building2}
              color="blue"
            />

            <KpiCard
              to="/manager/approvals"
              title="Pending Approvals"
              value={totalApprovalsPending}
              subtitle="Expenses, materials and milestones"
              icon={CheckCircle2}
              color="amber"
            />

            <KpiCard
              to="/manager/attendance"
              title="Workers on Site"
              value={totalHeadcount}
              subtitle={`${workforce.length} workforce records`}
              icon={Users}
              color="emerald"
            />

            <KpiCard
              to="/manager/materials-stock"
              title="Low Stock Materials"
              value={lowStockAlertCount}
              subtitle={`${materials.length} materials tracked`}
              icon={Boxes}
              color="rose"
            />
          </section>

          <section className="space-y-4">
            <SectionTitle
              eyebrow="Project Execution"
              title="Active Construction Sites"
              to="/manager/sites"
              linkText="View all sites →"
            />

            {sites.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No construction sites available"
                description="Add your first construction site to begin tracking progress, workforce, expenses, materials, and equipment."
                to="/manager/project-site-setup"
                action="Add Construction Site"
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {sites.slice(0, 6).map((site) => {
                  const budget = Number(
                    site.totalBudget || site.budget || site.contractValue || 0
                  )

                  const spent = Number(
                    site.totalAmountSpent || site.spentAmount || 0
                  )

                  const hasBudget = budget > 0

                  const utilization = hasBudget
                    ? Math.min(100, Math.round((spent / budget) * 100))
                    : 0

                  const siteName = displayValue(
                    site.siteName || site.projectName,
                    'Unnamed Construction Site'
                  )

                  const location = displayValue(
                    site.location || site.siteLocation,
                    'Location not available'
                  )

                  const stage = displayValue(
                    site.projectStage || site.currentStage || site.stage,
                    'Stage not configured'
                  )

                  return (
                    <article
                      key={site.id || site.siteId || siteName}
                      className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="line-clamp-1 text-sm font-bold text-slate-900">
                            {siteName}
                          </h3>

                          <StatusBadge
                            status={
                              site.currentStatus || site.status || 'Active'
                            }
                          />
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          {location}
                        </p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>
                            Stage:{' '}
                            <strong className="text-slate-800">{stage}</strong>
                          </span>

                          <span className="font-bold text-blue-700">
                            {hasBudget
                              ? `${utilization}% Used`
                              : 'Budget not set'}
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-600 transition-all"
                            style={{ width: `${utilization}%` }}
                          />
                        </div>

                        <div className="flex justify-between pt-1 text-[11px] text-slate-400">
                          <span>
                            Spent: {hasBudget ? formatCurrency(spent) : '—'}
                          </span>

                          <span>
                            Budget: {hasBudget ? formatCurrency(budget) : '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                        <Link
                          to="/manager/daily-logs"
                          className="font-medium text-slate-600 hover:text-slate-900"
                        >
                          Daily Log
                        </Link>

                        <Link
                          to="/manager/sites"
                          className="font-bold text-blue-600 hover:text-blue-800"
                        >
                          Site Details →
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <SectionTitle
                eyebrow="Field Execution"
                title="Recent Site Activity"
                to="/manager/daily-logs"
                linkText="View logs →"
              />

              {dailyLogs.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No daily site logs available"
                  description="Daily progress updates will appear here after supervisors or managers submit site logs."
                  to="/manager/daily-logs"
                  action="Open Daily Logs"
                  compact
                />
              ) : (
                <div className="mt-4 space-y-3">
                  {dailyLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id || log.logId}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <Activity className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">
                          {displayValue(
                            log.siteName || log.projectName,
                            'Construction site'
                          )}
                        </p>

                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {displayValue(
                            log.description ||
                              log.workDescription ||
                              log.notes,
                            'Progress update recorded'
                          )}
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          {displayValue(
                            log.date || log.createdAt,
                            'Date unavailable'
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Material Control"
                title="Inventory Alerts"
                to="/manager/materials-stock"
                linkText="Open inventory →"
              />

              {lowStockAlertCount === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No low-stock materials"
                  description="All tracked material quantities are currently above their configured reorder levels."
                  compact
                />
              ) : (
                <div className="mt-4 space-y-2">
                  {lowStockMaterials.slice(0, 6).map((material) => (
                    <div
                      key={material.id || material.materialId}
                      className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 p-3"
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {displayValue(
                          material.materialName || material.name,
                          'Unnamed Material'
                        )}
                      </span>

                      <span className="text-xs font-bold text-rose-700">
                        {Number(
                          material.currentTotalStock ||
                            material.currentStock ||
                            0
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle
              eyebrow="Operations Control"
              title="Construction Management Modules"
            />

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              <ModuleCard
                title="Approvals Center"
                description="Review expenses, material requests, tool requests and project milestones."
                count={`${totalApprovalsPending} pending`}
                to="/manager/approvals"
                icon={CheckCircle2}
                color="amber"
              />

              <ModuleCard
                title="Workforce Management"
                description="Manage contractors, workers, attendance, labour categories and site assignments."
                count={`${totalHeadcount} workers`}
                to="/manager/workers"
                icon={Users}
                color="purple"
              />

              <ModuleCard
                title="Vehicle Fleet"
                description="Monitor construction vehicles, fleet availability and active assignments."
                count={`${activeVehicles} active`}
                to="/manager/fleet"
                icon={Truck}
                color="blue"
              />

              <ModuleCard
                title="Petty Cash"
                description="Review site cash requests, expense vouchers and float transactions."
                count={`${pendingPettyCashCount} pending`}
                to="/manager/petty-cash"
                icon={DollarSign}
                color="emerald"
              />
            </div>
          </section>
        </main>
      </div>

      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        role="Manager"
      />
    </div>
  )
}

function SearchGroup({
  title,
  color,
  items,
  getLabel,
  to,
  onSelect,
}) {
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase ${color}`}>{title}</p>

      <div className="mt-1 space-y-1">
        {items.map((item, index) => (
          <Link
            key={item.id || item.siteId || item.materialId || index}
            to={to}
            onClick={onSelect}
            className="block rounded-lg p-2 font-semibold text-slate-800 hover:bg-slate-50"
          >
            {getLabel(item)}
          </Link>
        ))}
      </div>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  to,
  action,
  compact = false,
}) {
  return (
    <div className={`${compact ? 'py-8' : 'py-12'} text-center`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <Icon className="h-6 w-6" />
      </div>

      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>

      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
        {description}
      </p>

      {to && action && (
        <Link
          to={to}
          className="mt-4 inline-flex rounded-xl bg-[#0B3470] px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-900"
        >
          {action}
        </Link>
      )}
    </div>
  )
}

function ModuleCard({
  title,
  description,
  count,
  to,
  icon: Icon,
  color = 'blue',
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-purple-50 text-purple-700',
  }

  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-3 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>

        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
      </div>

      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
        {description}
      </p>

      <p className="mt-4 text-xs font-bold text-blue-600">{count}</p>
    </Link>
  )
}
