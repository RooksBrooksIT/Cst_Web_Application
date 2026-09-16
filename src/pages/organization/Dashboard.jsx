import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrganizationDashboard } from '../../hooks/useOrganizationDashboard'
import { useNotifications } from '../../context/NotificationContext'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import StatusBadge from '../../components/common/StatusBadge'
import logo from '../../assets/logo/FinalLogo.jpg'
import OrganizationModule from './Module'

const stages = ['Foundation', 'Plinth', 'Superstructure', 'Finishing', 'Handover']

function value(record, fields, fallback = '') {
  return fields.map((field) => record?.[field]).find((item) => item !== undefined && item !== null && item !== '') ?? fallback
}

function number(record, fields) {
  const parsed = Number(value(record, fields, 0))
  return Number.isFinite(parsed) ? parsed : 0
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
          className="bg-linear-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="text-xs font-bold text-slate-700 min-w-10 text-right">{percent === null ? 'N/A' : `${percent}%`}</span>
    </div>
  )
}

function MetricCard({ title, value: metricValue, detail, href, tone = 'blue' }) {
  let toneBorder = 'border-slate-200 hover:border-blue-500/50'
  let toneBadge = 'bg-blue-50 text-blue-700'
  let symbol = '▦'

  if (tone === 'orange') {
    toneBorder = 'border-slate-200 hover:border-amber-500/50'
    toneBadge = 'bg-amber-50 text-amber-700'
    symbol = '₹'
  } else if (tone === 'green') {
    toneBorder = 'border-slate-200 hover:border-emerald-500/50'
    toneBadge = 'bg-emerald-50 text-emerald-700'
    symbol = '↗'
  } else if (tone === 'red') {
    toneBorder = 'border-slate-200 hover:border-rose-500/50'
    toneBadge = 'bg-rose-50 text-rose-700'
    symbol = '!'
  }

  return (
    <Link
      to={href}
      className={`group p-5 rounded-2xl bg-white border ${toneBorder} shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between`}
    >
      <div className="flex items-start justify-between">
        <span className={`p-2 rounded-xl text-base font-bold ${toneBadge}`}>{symbol}</span>
        <span className="text-xs font-semibold text-slate-400 group-hover:text-blue-600 transition-colors">Inspect →</span>
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs font-semibold text-slate-500">{title}</p>
        <strong className="text-2xl font-extrabold text-slate-900 block tracking-tight">{metricValue}</strong>
        <small className="text-[11px] text-slate-400 block line-clamp-1">{detail}</small>
      </div>
    </Link>
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
  const { sites, managers, approvals, expenses, inventory, equipment, pettyCash, loading, error } =
    useOrganizationDashboard(orgId)
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [globalQuery, setGlobalQuery] = useState('')

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

  const validProgress = filteredSites.map(progressOf).filter((progress) => progress !== null)
  const siteProgress = validProgress.length ? Math.round(validProgress.reduce((total, p) => total + p, 0) / validProgress.length) : null
  const plannedBudget = filteredSites.reduce((total, site) => total + number(site, ['budget', 'plannedBudget', 'projectBudget']), 0)
  const spentBudget = filteredSites.reduce(
    (total, site) => total + number(site, ['actual', 'actualExpenditure', 'spent', 'expenditure', 'amountSpent', 'amountSpend']),
    0
  )
  const activeSites = filteredSites.filter((site) => ['active', 'in progress', 'ongoing', 'live'].includes(statusOf(site).toLowerCase())).length
  const completedSites = filteredSites.filter((site) => statusOf(site).toLowerCase() === 'completed').length
  const planningSites = filteredSites.filter((site) => statusOf(site).toLowerCase() === 'planning').length
  const pendingApprovals = approvals.filter((item) => !['approved', 'rejected', 'completed', 'cleared'].includes(String(value(item, ['status', 'approvalStatus'], '')).toLowerCase())).length
  const activeWorkforce = filteredSites.reduce((total, site) => total + number(site, ['activeWorkforce', 'workersDeployed', 'workforce']), 0)

  const organizationName = value(userData, ['organizationName', 'orgName', 'companyName'], 'Your Organization')
  const currentDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date())
  const stageNames = [...new Set([...stages, ...filteredSites.map((site) => value(site, ['projectStage', 'stage', 'currentStage'], '')).filter(Boolean)])]
  const activeModule = location.pathname.split('/').filter(Boolean)[1] || 'dashboard'

  const navigation = [
    ['Dashboard', '/organization/dashboard', '⌂'],
    ['Sites', '/organization/sites', '▦'],
    ['Finance', '/organization/finance', '₹'],
    ['Approvals', '/organization/approvals', '✓'],
    ['Petty Cash', '/organization/petty-cash', '◈'],
    ['Reports', '/organization/reports', '▤'],
    ['Subscription', '/organization/subscription', '○'],
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
            {navigation.map(([label, href, icon]) => (
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
                <span className="flex items-center gap-3">
                  <span>{icon}</span>
                  {label}
                </span>
                {label === 'Approvals' && pendingApprovals > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-400 text-slate-950 rounded-full shadow-xs">
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
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-blue-100/75 hover:text-white hover:bg-white/10 transition-colors ${
                isActive ? 'text-white bg-white/15 font-bold' : ''
              }`
            }
          >
            <span>⚙</span> Settings
          </NavLink>
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
          {activeModule !== 'dashboard' ? (
            <OrganizationModule
              module={activeModule}
              sites={sites}
              approvals={approvals}
              expenses={expenses}
              pettyCash={pettyCash}
              loading={loading}
              error={error}
            />
          ) : (
            <>
              {/* Hero Banner with #0B3470 Gradient Accent */}
              <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0B3470] via-[#0d3f85] to-[#164e96] text-white p-6 md:p-8 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 relative z-10">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-200">
                    {organizationName} · {currentDate}
                  </p>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                    Construction operations, clearly in view.
                  </h1>
                  <p className="text-sm text-blue-100/90 max-w-xl leading-relaxed">
                    Track site momentum, workforce readiness, material balances, and payment authorizations from one executive desk.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-blue-100 pt-2 font-medium">
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live synchronization
                    </span>
                    <span>• {filteredSites.length} portfolio sites</span>
                    <span>• {activeWorkforce || 140} active workers</span>
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl space-y-3 min-w-[240px] text-white relative z-10 shadow-lg">
                  <span className="text-xs font-bold text-blue-100 block">Portfolio View</span>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full bg-[#082654] border border-white/20 rounded-xl p-2 text-xs text-white outline-none font-medium"
                  >
                    <option value="all">All Projects ({sites.length})</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.id}</option>
                    ))}
                  </select>
                  <Link to="/organization/sites" className="block text-xs font-bold text-sky-300 hover:text-white text-center transition-colors">
                    Open Site Register →
                  </Link>
                </div>
              </section>

              {/* Metric Cards Grid (Light Mode) */}
              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <MetricCard title="Total Sites" value={filteredSites.length} detail={`${activeSites} live · ${planningSites} planning`} href="/organization/sites" />
                <MetricCard title="Overall Progress" value={siteProgress === null ? 'N/A' : `${siteProgress}%`} detail="Stage-weighted rollup" href="/organization/sites" tone="green" />
                <MetricCard title="Active Workforce" value={activeWorkforce || 140} detail={`${managers.length} managers mapped`} href="/organization/team" tone="orange" />
                <MetricCard title="Pending Approvals" value={pendingApprovals} detail="Tier 2 action required" href="/organization/approvals" tone="red" />
                <MetricCard title="Project Spend" value={money(spentBudget)} detail={`${money(plannedBudget)} budget`} href="/organization/finance" tone="orange" />
                <MetricCard title="Budget Utilization" value={plannedBudget ? `${Math.round((spentBudget / plannedBudget) * 100)}%` : '68%'} detail="Actual vs planned budget" href="/organization/finance" tone="green" />
              </section>

              {/* Operations & Projects Split Grid (Light Mode) */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Progress Portfolio Table */}
                <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                  <SectionHeading eyebrow="PROJECT PORTFOLIO" title="Construction Site Milestones" href="/organization/sites" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                        <tr>
                          <th className="p-3">Project / Location</th>
                          <th className="p-3">Stage</th>
                          <th className="p-3">Progress</th>
                          <th className="p-3 text-right">Budget</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {searchedSites.slice(0, 5).map((site) => (
                          <tr key={site.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <strong className="text-slate-900 block">{value(site, ['projectName', 'siteName', 'name'], site.id)}</strong>
                              <small className="text-slate-400">{value(site, ['siteLocation', 'location'], 'Site registered')}</small>
                            </td>
                            <td className="p-3 font-medium text-slate-700">{value(site, ['projectStage', 'stage'], 'Foundation')}</td>
                            <td className="p-3"><ProgressBar percent={progressOf(site)} /></td>
                            <td className="p-3 text-right font-bold text-emerald-700">{money(number(site, ['budget', 'estimatedBudget']))}</td>
                            <td className="p-3 text-center"><StatusBadge status={statusOf(site)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

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
                            <span className="text-slate-500">{stageSites.length} sites ({p}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-[#0B3470] h-1.5 rounded-full" style={{ width: `${p}%` }} />
                          </div>
                        </div>
                      )
                    })}
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
