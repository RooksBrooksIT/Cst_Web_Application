import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useManagerDashboard } from '../../hooks/useManagerDashboard'
import { useNotifications } from '../../context/NotificationContext'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import logo from '../../assets/logo/FinalLogo.jpg'

import {
  Building2,
  CheckCircle2,
  Users,
  Briefcase,
  Boxes,
  Wrench,
  Truck,
  DollarSign,
  FileText,
  Compass,
  Link2,
  Coins,
  Receipt,
  CalendarCheck,
  Fuel,
  Bell,
  HelpCircle,
  FolderTree,
  Sparkles,
  Search,
  ArrowRight,
  Plus,
  Activity,
  AlertTriangle,
  LogOut,
  X,
  Layers,
} from 'lucide-react'

function ManagerProfileMenu({ user, userData, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const profileName =
    userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'
  const profileEmail = userData?.Email || userData?.email || user?.email || 'Not available'
  const profileDesignation = userData?.Designation || userData?.designation || 'Project Manager'
  const profileDept = userData?.Department || userData?.department || 'Operations'
  const profileId = userData?.ManagerId || userData?.managerId || 'MG-001'

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 transition-all text-left cursor-pointer"
      >
        <span className="w-8 h-8 rounded-lg bg-[#0B3470] text-white font-bold text-xs flex items-center justify-center shadow-xs">
          {profileName.slice(0, 2).toUpperCase()}
        </span>
        <div className="hidden sm:block pr-2">
          <strong className="block text-xs font-semibold text-slate-800">{profileName}</strong>
          <small className="block text-[10px] text-slate-500">{profileDesignation}</small>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 space-y-3 z-50 animate-fade-in">
          <div className="border-b border-slate-100 pb-2">
            <strong className="block text-xs font-bold text-slate-900">{profileName}</strong>
            <small className="text-[11px] text-blue-700 font-semibold">
              {profileDesignation} · {profileDept}
            </small>
          </div>
          <div className="space-y-1.5 text-xs text-slate-700">
            <div>
              <span className="text-slate-400 text-[10px] block">Manager ID:</span>
              <span className="font-mono text-slate-800">{profileId}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Email:</span>
              {profileEmail}
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Role:</span>
              <span className="text-emerald-700 font-semibold">Operations Manager</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function ManagerDashboard() {
  const { orgId, user, userData, logout } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')

  const dashboardData = useManagerDashboard(orgId, user?.uid, userData?.assignedSites || [])
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
    userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'

  // Metric Computations
  const activeSites = sites.filter(
    (s) => !['completed', 'cancelled'].includes(String(s.currentStatus || s.status || '').toLowerCase())
  ).length

  const totalHeadcount = workforce.reduce((acc, w) => acc + (Number(w.headcount || w.count || 1) || 0), 0)

  const totalApprovalsPending =
    pendingExpenses.length +
    pendingMaterialRequests.length +
    pendingToolRequests.length +
    pendingStageMilestones.length

  const lowStockAlertCount = materials.filter((m) => {
    const stock = Number(m.currentTotalStock || m.currentStock || 0)
    const min = Number(m.minReorderLevel || 20)
    return stock <= min
  }).length

  const pendingPettyCashCount =
    pettyCashRequests.filter((r) => r.status === 'PENDING_MANAGER_REVIEW').length +
    pettyCashExpenses.filter((e) => e.status === 'PENDING_EXPENSE_REVIEW').length

  const activeVehicles = vehicles.filter((v) => v.status === 'Active' || !v.status).length
  const dispatchedTools = tools.filter((t) => t.status === 'Dispatched').length

  // Universal Cross-Collection Search Engine
  const universalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return null
    const q = globalSearch.toLowerCase().trim()

    const results = {
      sites: sites
        .filter((s) => (s.siteName || s.projectName || '').toLowerCase().includes(q))
        .slice(0, 3),
      supervisors: supervisors
        .filter((s) => (s.fullName || s.FullName || s.username || '').toLowerCase().includes(q))
        .slice(0, 3),
      materials: materials
        .filter((m) => (m.materialName || m.name || '').toLowerCase().includes(q))
        .slice(0, 3),
      tools: tools
        .filter((t) => (t.toolName || t.toolCode || '').toLowerCase().includes(q))
        .slice(0, 3),
      contractors: contractors
        .filter((c) => (c.contractorName || c.trade || '').toLowerCase().includes(q))
        .slice(0, 3),
      vehicles: vehicles
        .filter((v) => (v.numberPlate || v.modelName || '').toLowerCase().includes(q))
        .slice(0, 3),
    }

    const totalMatches =
      results.sites.length +
      results.supervisors.length +
      results.materials.length +
      results.tools.length +
      results.contractors.length +
      results.vehicles.length

    return { results, totalMatches }
  }, [globalSearch, sites, supervisors, materials, tools, contractors, vehicles])

  // Sidebar Operational Groups
  const sidebarGroups = [
    {
      title: 'COMMAND & CONTROL',
      items: [
        { id: 'dashboard', label: 'Executive Dashboard', path: '/manager/dashboard', icon: Sparkles },
        {
          id: 'approvals',
          label: 'Approvals Center',
          path: '/manager/approvals',
          icon: CheckCircle2,
          badge: totalApprovalsPending,
        },
      ],
    },
    {
      title: 'PROJECT & SITE MANAGEMENT',
      items: [
        { id: 'site-wizard', label: 'Project Setup Wizard', path: '/manager/site-wizard', icon: Building2 },
        { id: 'sites', label: 'Sites Portfolio', path: '/manager/sites', icon: Building2 },
        { id: 'project-configs', label: 'Master Configurations', path: '/manager/project-configs', icon: FolderTree },
        { id: 'drawings', label: 'Blueprints & CAD', path: '/manager/drawings', icon: Compass },
      ],
    },
    {
      title: 'SUPERVISOR & FIELD OPS',
      items: [
        { id: 'supervisors', label: 'Supervisor Profiles', path: '/manager/supervisors', icon: Users },
        { id: 'supervisor-map', label: 'Site-Supervisor Map', path: '/manager/supervisor-map', icon: Link2 },
        { id: 'daily-logs', label: 'Daily Progress Diary', path: '/manager/daily-logs', icon: FileText },
        { id: 'manager-expenses', label: 'Manager Site Expenses', path: '/manager/manager-expenses', icon: Receipt },
      ],
    },
    {
      title: 'MATERIALS & SUPPLY CHAIN',
      items: [
        { id: 'materials-catalog', label: 'Materials Catalog', path: '/manager/materials-catalog', icon: Boxes },
        { id: 'materials-stock', label: 'Stock & Low Alerts', path: '/manager/materials-stock', icon: Boxes, badge: lowStockAlertCount },
        { id: 'materials-movements', label: 'Delivery Gate Passes', path: '/manager/materials-movements', icon: Truck },
        { id: 'tools-catalog', label: 'Tools & Plant Machinery', path: '/manager/tools-catalog', icon: Wrench },
        { id: 'tools-movements', label: 'Equipment Custody', path: '/manager/tools-movements', icon: Wrench },
      ],
    },
    {
      title: 'WORKFORCE & CONTRACTORS',
      items: [
        { id: 'contractors', label: 'Contractors & Entries', path: '/manager/contractors', icon: Briefcase },
        { id: 'labour-scales', label: 'Labour Wage Scales', path: '/manager/labour-scales', icon: Coins },
        { id: 'workers', label: 'Workers Roster', path: '/manager/workers', icon: Users },
        { id: 'worker-mapping', label: 'Site Allocations', path: '/manager/worker-mapping', icon: Link2 },
        { id: 'attendance', label: 'Daily Muster Roll', path: '/manager/attendance', icon: CalendarCheck },
      ],
    },
    {
      title: 'FLEET & LOGISTICS',
      items: [
        { id: 'fleet', label: 'Vehicles, Drivers & Fuel', path: '/manager/fleet', icon: Truck },
      ],
    },
    {
      title: 'FINANCE & SUPPORT',
      items: [
        {
          id: 'petty-cash',
          label: 'Petty Cash Hub',
          path: '/manager/petty-cash',
          icon: DollarSign,
          badge: pendingPettyCashCount,
        },
        { id: 'notifications', label: 'Priority Alerts Stream', path: '/manager/notifications', icon: Bell },
        { id: 'support', label: 'Helpdesk & Support', path: '/manager/support', icon: HelpCircle },
      ],
    },
  ]

  // 8 Operation Bento Cards
  const bentoCards = [
    {
      title: 'Approvals Center',
      count: `${totalApprovalsPending} Claims`,
      badge: totalApprovalsPending > 0 ? 'Requires Action' : 'Cleared',
      badgeColor: totalApprovalsPending > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
      desc: 'Verify field supervisor expense claims, approve material requisitions, and sign off milestone stages.',
      icon: CheckCircle2,
      iconColor: 'text-amber-600 bg-amber-50',
      link: '/manager/approvals',
    },
    {
      title: 'Project Portfolio',
      count: `${sites.length} Projects`,
      badge: `${activeSites} Active`,
      badgeColor: 'bg-blue-100 text-blue-800',
      desc: 'Launch new construction sites via wizard, configure categories and inspect architectural schematics.',
      icon: Building2,
      iconColor: 'text-blue-600 bg-blue-50',
      link: '/manager/sites',
    },
    {
      title: 'Field Operations',
      count: `${supervisors.length} Staff`,
      badge: 'Live Feed',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      desc: 'Provision supervisor mobile credentials, map site jurisdictions, and monitor daily progress diaries.',
      icon: Users,
      iconColor: 'text-emerald-600 bg-emerald-50',
      link: '/manager/daily-logs',
    },
    {
      title: 'Supply Chain & Stock',
      count: `${materials.length} SKUs`,
      badge: lowStockAlertCount > 0 ? `${lowStockAlertCount} Low Stock` : 'Stock Optimal',
      badgeColor: lowStockAlertCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800',
      desc: 'Manage benchmark material rates, issue delivery gate passes, and track plant machinery custody.',
      icon: Boxes,
      iconColor: 'text-teal-600 bg-teal-50',
      link: '/manager/materials-catalog',
    },
    {
      title: 'Workforce & Contractors',
      count: `${contractors.length} Contractors`,
      badge: `${totalHeadcount || '120+'} Labourers`,
      badgeColor: 'bg-purple-100 text-purple-800',
      desc: 'Sub-contractor work measurements, trade wage benchmarks, and daily attendance muster roll.',
      icon: Briefcase,
      iconColor: 'text-purple-600 bg-purple-50',
      link: '/manager/contractors',
    },
    {
      title: 'Fleet & Fuel Telemetry',
      count: `${vehicles.length} Vehicles`,
      badge: `${activeVehicles} on Duty`,
      badgeColor: 'bg-amber-100 text-amber-800',
      desc: 'Track tippers and mixers, verify driver commercial licenses, and log odometer diesel consumption.',
      icon: Truck,
      iconColor: 'text-amber-600 bg-amber-50',
      link: '/manager/fleet',
    },
    {
      title: 'Petty Cash Hub',
      count: `${pendingPettyCashCount} Vouchers`,
      badge: 'Dual-Control',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      desc: 'Disburse site cash floats, verify field expense vouchers, and audit instant balance ledgers.',
      icon: DollarSign,
      iconColor: 'text-emerald-600 bg-emerald-50',
      link: '/manager/petty-cash',
    },
    {
      title: 'Alerts & Support',
      count: `${totalApprovalsPending + lowStockAlertCount} Alerts`,
      badge: 'Operational',
      badgeColor: 'bg-slate-100 text-slate-800',
      desc: 'Priority notification stream, SOP construction documentation, and 24/7 engineering field support.',
      icon: HelpCircle,
      iconColor: 'text-indigo-600 bg-indigo-50',
      link: '/manager/notifications',
    },
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-slate-500 text-sm">
        Loading manager operational command center...
      </div>
    )
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

      {/* Enterprise #0B3470 Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0B3470] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-xl lg:z-20 shrink-0 h-screen overflow-y-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 py-1">
            <Link
              to="/manager/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3"
            >
              <img className="h-10 w-auto rounded-xl object-contain bg-white p-1 shadow-md" src={logo} alt="CST" />
              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">CST Construction</strong>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Manager Desk</span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Categorized 8 Groups in Sidebar */}
          <div className="space-y-5">
            {sidebarGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-200/50">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.id === 'dashboard'

                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-white/15 text-white font-bold border border-white/20 shadow-xs'
                          : 'text-blue-100/75 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-200/70'}`} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-400 text-slate-950 rounded-full shadow-xs">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-white/10 mt-6">
          <div className="px-3 py-2 text-white/80 text-xs">
            <p className="font-semibold text-white truncate">{managerName}</p>
            <span className="text-[10px] text-blue-200">Site Operations Lead</span>
          </div>
        </div>
      </aside>

      {/* Main Content Surface */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto bg-[#F8FAFC]">
        {/* Universal Topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-lg relative">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl border border-slate-200"
            >
              ☰
            </button>

            {/* Universal Search Input */}
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Universal search: sites, supervisors, materials, tools, vehicles..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-100/90 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="p-1 text-slate-400 hover:text-slate-600 absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Universal Search Results Popover */}
              {universalSearchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 space-y-3 z-50 max-h-96 overflow-y-auto animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-bold text-slate-800">
                    <span>Search Results ({universalSearchResults.totalMatches} matches)</span>
                    <span className="text-[10px] text-slate-400">Click item to navigate</span>
                  </div>

                  {universalSearchResults.totalMatches === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center">No matching entities found.</p>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {/* Sites */}
                      {universalSearchResults.results.sites.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-blue-600 uppercase">Project Sites</p>
                          {universalSearchResults.results.sites.map((s) => (
                            <Link
                              key={s.id}
                              to="/manager/sites"
                              onClick={() => setGlobalSearch('')}
                              className="block p-2 rounded-lg hover:bg-slate-50 font-semibold text-slate-900"
                            >
                              {s.siteName || s.projectName} • {s.location || 'Active Site'}
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Supervisors */}
                      {universalSearchResults.results.supervisors.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase">Field Supervisors</p>
                          {universalSearchResults.results.supervisors.map((s) => (
                            <Link
                              key={s.id || s.supervisorId}
                              to="/manager/supervisors"
                              onClick={() => setGlobalSearch('')}
                              className="block p-2 rounded-lg hover:bg-slate-50 font-semibold text-slate-900"
                            >
                              {s.fullName || s.FullName || s.name} (@{s.username || s.UserName})
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Materials */}
                      {universalSearchResults.results.materials.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-teal-600 uppercase">Materials Catalog</p>
                          {universalSearchResults.results.materials.map((m) => (
                            <Link
                              key={m.id || m.materialId}
                              to="/manager/materials-catalog"
                              onClick={() => setGlobalSearch('')}
                              className="block p-2 rounded-lg hover:bg-slate-50 font-semibold text-slate-900"
                            >
                              {m.materialName || m.name} ({m.categoryName || m.category})
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Tools */}
                      {universalSearchResults.results.tools.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-amber-600 uppercase">Tools & Equipment</p>
                          {universalSearchResults.results.tools.map((t) => (
                            <Link
                              key={t.id || t.toolId}
                              to="/manager/tools-catalog"
                              onClick={() => setGlobalSearch('')}
                              className="block p-2 rounded-lg hover:bg-slate-50 font-semibold text-slate-900"
                            >
                              {t.toolName || t.name} [{t.toolCode || t.id}]
                            </Link>
                          ))}
                        </div>
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
              onClick={() => setIsNotifOpen(true)}
              className="relative p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            <ManagerProfileMenu user={user} userData={userData} onLogout={handleLogout} />
          </div>
        </header>

        {/* Executive Bento Surface */}
        <main className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          {/* Welcome Banner */}
          <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0B3470] via-[#0D3F87] to-[#1258BE] p-6 md:p-8 shadow-md text-white">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
                  Operations Executive Command Desk
                </span>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  Welcome back, {managerName.split(' ')[0]}.
                </h1>
                <p className="text-sm text-blue-100/85 max-w-xl leading-relaxed">
                  Real-time operational dashboard for civil sites, materials supply chain, contractor measurements,
                  and mobile supervisor delegations.
                </p>
              </div>

              {/* Quick Floating Action Triggers */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  to="/manager/site-wizard"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-[#0B3470] shadow-sm hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Launch Site Wizard</span>
                </Link>
                <Link
                  to="/manager/daily-logs"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/15 text-white border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Daily Progress Log</span>
                </Link>
              </div>
            </div>
          </section>

          {/* KPI Carousel */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              to="/manager/sites"
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 group-hover:text-blue-600 transition-colors">
                  Active Projects
                </span>
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">
                  <Building2 className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-slate-900">{activeSites}</strong>
                <span className="text-xs text-emerald-600 font-semibold">{sites.length} Total</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Sites in construction portfolio</small>
            </Link>

            <Link
              to="/manager/approvals"
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 group-hover:text-amber-600 transition-colors">
                  Pending Approvals
                </span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-amber-600">
                  {totalApprovalsPending}
                </strong>
                <span className="text-xs text-amber-700 font-semibold">Action needed</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Expenses, Indents, Milestones</small>
            </Link>

            <Link
              to="/manager/attendance"
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 group-hover:text-emerald-600 transition-colors">
                  Workforce On Site
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-slate-900">
                  {totalHeadcount || '120+'}
                </strong>
                <span className="text-xs text-blue-600 font-semibold">Active today</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Direct labour & masons muster</small>
            </Link>

            <Link
              to="/manager/petty-cash"
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 group-hover:text-purple-600 transition-colors">
                  Petty Cash Floats
                </span>
                <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-slate-900">
                  {pendingPettyCashCount}
                </strong>
                <span className="text-xs text-purple-700 font-semibold">Pending Review</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Dual-control site float ledgers</small>
            </Link>
          </section>

          {/* 8 Operational Categories Bento Grid */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Operational Core Categories
                </p>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Manager 8-Group Operations Center
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {bentoCards.map((card) => {
                const Icon = card.icon
                return (
                  <Link
                    key={card.title}
                    to={card.link}
                    className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${card.iconColor}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${card.badgeColor}`}>
                          {card.badge}
                        </span>
                      </div>

                      <div className="mt-3">
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1">
                          <span>{card.title}</span>
                          <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                        </h3>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">{card.count}</p>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">
                          {card.desc}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-semibold group-hover:text-blue-800">
                      <span>Open Module</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Live Sites Progress Portfolio */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Site Execution</p>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Active Sites Portfolio</h2>
              </div>
              <Link to="/manager/sites" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                View all sites →
              </Link>
            </div>

            {sites.length === 0 ? (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-500 space-y-3 shadow-xs">
                <p className="text-sm font-medium">No active sites registered yet.</p>
                <Link
                  to="/manager/site-wizard"
                  className="inline-flex px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white shadow-xs"
                >
                  Launch Project Setup Wizard
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sites.slice(0, 6).map((site) => {
                  const budget = Number(site.totalBudget || site.budget || site.contractValue || 0)
                  const spent = Number(site.totalAmountSpent || site.spentAmount || 0)
                  const utilization = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
                  const stage = site.projectStage || site.currentStage || 'Active Phase'

                  return (
                    <div
                      key={site.id}
                      className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                            {site.siteName || site.projectName || 'Site ' + site.id}
                          </h3>
                          <StatusBadge status={site.currentStatus || site.status || 'Active'} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {site.location || site.siteLocation || 'Location registered'}
                        </p>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Stage: <strong className="text-slate-800">{stage}</strong></span>
                          <span className="font-bold text-blue-700">{utilization}% Budget</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                          <span>Spent: ₹{spent.toLocaleString('en-IN')}</span>
                          <span>Budget: ₹{budget.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <Link
                          to={`/manager/daily-logs`}
                          className="text-slate-600 hover:text-slate-900 font-medium"
                        >
                          Daily Log
                        </Link>
                        <Link to={`/manager/sites`} className="text-blue-600 hover:text-blue-800 font-bold">
                          Site Details →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} role="Manager" />
    </div>
  )
}
