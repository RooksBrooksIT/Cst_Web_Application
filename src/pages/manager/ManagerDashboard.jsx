import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useManagerDashboard } from '../../hooks/useManagerDashboard'
import { useNotifications } from '../../context/NotificationContext'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import logo from '../../assets/logo/FinalLogo.jpg'

function ManagerProfileMenu({ user, userData, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const profileName = userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'
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
        className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 transition-all text-left"
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
            <small className="text-[11px] text-blue-700 font-semibold">{profileDesignation} · {profileDept}</small>
          </div>
          <div className="space-y-1.5 text-xs text-slate-700">
            <div><span className="text-slate-400 text-[10px] block">Manager ID:</span><span className="font-mono text-slate-800">{profileId}</span></div>
            <div><span className="text-slate-400 text-[10px] block">Email:</span>{profileEmail}</div>
            <div><span className="text-slate-400 text-[10px] block">Role:</span><span className="text-emerald-700 font-semibold">Operations Manager</span></div>
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

export default function ManagerDashboard() {
  const { orgId, user, userData, logout } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('all')

  const { sites, workforce, materials, tools, approvals, pettyCash, vouchers, loading, error } =
    useManagerDashboard(orgId, user?.uid, userData?.assignedSites || [])

  const managerName = userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'
  const filteredSites = selectedSiteFilter === 'all' ? sites : sites.filter((s) => s.id === selectedSiteFilter)

  // Calculations
  const activeSites = filteredSites.filter((s) => !['completed', 'cancelled'].includes(String(s.currentStatus || s.status || '').toLowerCase())).length
  const totalWorkers = workforce.reduce((acc, w) => acc + (Number(w.headcount || w.count || 1) || 0), 0)
  const pendingApprovals = approvals.filter((a) => ['pending_manager_review', 'pending_manager_clearance', 'pending'].includes(String(a.approvalStatus || a.status || '').toLowerCase())).length
  const pendingVouchers = vouchers.filter((v) => ['submitted', 'pending'].includes(String(v.status || '').toLowerCase())).length

  const navigation = [
    { label: 'Dashboard', href: '/manager/dashboard', icon: '⌂' },
    { label: 'Site Setup Wizard', href: '/manager/site-wizard', icon: '⚡' },
    { label: 'Sites Register', href: '/manager/sites', icon: '▦' },
    { label: 'Daily Workforce', href: '/manager/workforce', icon: '👷' },
    { label: 'Materials & GRN', href: '/manager/materials', icon: '📦' },
    { label: 'Tools Movement', href: '/manager/tools', icon: '🔧' },
    { label: 'Payment Approvals', href: '/manager/approvals', icon: '✓', badge: pendingApprovals },
  ]

  const quickNav = [
    { label: 'Site Setup Wizard', href: '/manager/site-wizard', icon: '⚡', desc: 'Initialize new project in 5 steps' },
    { label: 'Daily Workforce', href: '/manager/workforce', icon: '👷', desc: 'Attendance, wages & contractors' },
    { label: 'Materials & GRN', href: '/manager/materials', icon: '📦', desc: 'Inward delivery & requisitions' },
    { label: 'Tools & Movement', href: '/manager/tools', icon: '🔧', desc: 'Issue, track & maintain gear' },
    { label: 'Payment Approvals', href: '/manager/approvals', icon: '✓', desc: 'Tier 1 & Tier 3 verification' },
    { label: 'Sites Register', href: '/manager/sites', icon: '▦', desc: 'Overview of all active project sites' },
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-slate-500 text-sm">Loading manager operations workspace...</div>
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Strict #0B3470 Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B3470] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-xl lg:z-20 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 py-1">
            <Link to="/manager/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
              <img className="h-10 w-auto rounded-xl object-contain bg-white p-1 shadow-md" src={logo} alt="eBricks" />
              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">eBricks</strong>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Manager Hub</span>
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
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-200/60">OPERATIONAL MODULES</p>
            {navigation.map((item) => (
              <NavLink
                key={item.label}
                to={item.href}
                end={item.href === '/manager/dashboard'}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white/15 text-white font-bold border border-white/20 shadow-xs'
                      : 'text-blue-100/75 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <span className="flex items-center gap-3">
                  <span>{item.icon}</span>
                  {item.label}
                </span>
                {item.badge > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-slate-950 rounded-full shadow-xs">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <div className="px-3 py-2 text-white/80 text-xs">
            <p className="font-semibold text-white">{managerName}</p>
            <span className="text-[10px] text-blue-200">Site Operations Lead</span>
          </div>
        </div>
      </aside>

      {/* Main Light Content Surface */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#F8FAFC]">
        {/* Topbar Header (Light Mode) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200/90 shadow-xs">
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
              placeholder="Search site activities, materials, workers..."
              className="w-full bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
              Live Workspace · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date())}
            </div>

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

            <ManagerProfileMenu user={user} userData={userData} onLogout={handleLogout} />
          </div>
        </header>

        {/* Main Workspace */}
        <main className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8 flex-1">
          {/* Welcome Hero Banner */}
          <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0B3470] via-[#0D3F87] to-[#1258BE] border border-blue-900/40 p-6 md:p-8 shadow-md text-white">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-200">Site Operations Management</span>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  Good day, {managerName.split(' ')[0]}.
                </h1>
                <p className="text-sm text-blue-100/85 max-w-xl leading-relaxed">
                  Direct your construction teams, track material arrivals, approve labor wages, and clear milestone payments from your operational command desk.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/manager/site-wizard"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-blue-50 text-[#0B3470] shadow-md transition-transform active:scale-95"
                >
                  <span>＋</span> Setup New Site
                </Link>
                <Link
                  to="/manager/workforce"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/20 text-white border border-white/20 transition-colors"
                >
                  <span>👷</span> Daily Workforce Log
                </Link>
              </div>
            </div>
          </section>

          {/* Live Counter KPI Cards */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Active Sites</span>
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">▦</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-slate-900">{activeSites}</strong>
                <span className="text-xs text-emerald-600 font-semibold">{sites.length} total</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Assigned to your portfolio</small>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Deployed Workforce</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">👷</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-slate-900">{totalWorkers || '120+'}</strong>
                <span className="text-xs text-blue-600 font-semibold">Active today</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Across all active stages</small>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Pending Approvals</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">✓</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-amber-600">{pendingApprovals}</strong>
                <span className="text-xs text-amber-700 font-semibold">Action needed</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Tier 1 & Tier 3 clearance</small>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Petty Cash Vouchers</span>
                <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold">₹</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <strong className="text-2xl md:text-3xl font-extrabold text-slate-900">{pendingVouchers}</strong>
                <span className="text-xs text-slate-500 font-semibold">Unreviewed</span>
              </div>
              <small className="text-[11px] text-slate-400 mt-1">Submitted by supervisors</small>
            </div>
          </section>

          {/* Quick Operations Modules Grid */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Operational Tools</p>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Manager Modules & Workflows</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {quickNav.map((item) => (
                <Link
                  key={item.label}
                  to={item.href}
                  className="group p-5 rounded-2xl bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-400/60 shadow-xs hover:shadow-md transition-all duration-200 flex items-start gap-4"
                >
                  <span className="text-xl p-3 rounded-xl bg-blue-50 text-blue-700 group-hover:bg-[#0B3470] group-hover:text-white transition-colors">
                    {item.icon}
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                      {item.label}
                      <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Active Sites Progress Matrix */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Live Projects</p>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Site Execution & Stage Health</h2>
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
                  Launch 5-Step Site Wizard
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sites.slice(0, 6).map((site) => {
                  const progress = Number(site.progress || site.progressPercentage || 65)
                  const stage = site.projectStage || site.stage || site.currentStage || 'Superstructure'
                  return (
                    <div
                      key={site.id}
                      className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{site.projectName || site.siteName || site.name || 'Site ' + site.id}</h3>
                          <StatusBadge status={site.currentStatus || site.status || 'In Progress'} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{site.siteLocation || site.location || site.address || 'Location registered'}</p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Stage: <strong className="text-slate-800">{stage}</strong></span>
                          <span className="font-bold text-blue-700">{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                          <div
                            className="bg-linear-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                          />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <Link to={`/manager/workforce?siteId=${site.id}`} className="text-slate-500 hover:text-slate-900 font-medium">
                          Workforce
                        </Link>
                        <Link to={`/manager/materials?siteId=${site.id}`} className="text-blue-600 hover:text-blue-700 font-semibold">
                          Manage stock →
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

      {/* Notification Drawer */}
      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} role="Manager" />
    </div>
  )
}
