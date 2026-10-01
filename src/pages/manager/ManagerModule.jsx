import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Link, NavLink, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useManagerDashboard } from '../../hooks/useManagerDashboard'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationDrawer from '../../components/common/NotificationDrawer'
import logo from '../../assets/logo/FinalLogo.jpg'

// Group 2: Approvals
import ApprovalsCenter from './approvals/ApprovalsCenter'

import ProjectAndSiteSetup from './projects/ProjectAndSiteSetup'
import SitesPortfolio from './projects/SitesPortfolio'
import MasterConfigurations from './projects/MasterConfigurations'
import BlueprintsDrawings from './projects/BlueprintsDrawings'

// Group 4: Field & Supervisor
import SupervisorSetup from './operations/SupervisorSetup'
import SiteSupervisorMap from './operations/SiteSupervisorMap'
import DailySiteEntry from './operations/DailySiteEntry'
import ManagerExpenses from './operations/ManagerExpenses'

// Group 5: Supply Chain
import MaterialsCatalog from './supplychain/MaterialsCatalog'
import MaterialsStock from './supplychain/MaterialsStock'
import MaterialsMovements from './supplychain/MaterialsMovements'
import ToolsCatalog from './supplychain/ToolsCatalog'
import ToolsMovements from './supplychain/ToolsMovements'

// Group 6: Workforce
import ContractorsHub from './workforce/ContractorsHub'
import LabourWageScales from './workforce/LabourWageScales'
import WorkersDirectory from './workforce/WorkersDirectory'
import WorkerSiteMapping from './workforce/WorkerSiteMapping'
import WorkerAttendanceMuster from './workforce/WorkerAttendanceMuster'
import ManagerWorkerAttendanceReport from './workforce/ManagerWorkerAttendanceReport'

// Group 7: Fleet
import VehicleFleetHub from './fleet/VehicleFleetHub'

// Group 8: Notifications, Petty Cash, Support
import ManagerPettyCashHub from './pettycash/ManagerPettyCashHub'
import ManagerNotificationsHub from './notifications/ManagerNotificationsHub'
import ManagerSupportHub from './support/ManagerSupportHub'

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
  ChevronDown,
  LogOut,
  Sparkles,
  Menu,
  X,
  Search,
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
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 space-y-3 z-50">
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

export default function ManagerModule() {
  const { module } = useParams()
  const { orgId, user, userData, logout } = useAuth()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()

  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  const dashboardData = useManagerDashboard(orgId, user?.uid, userData?.assignedSites || [])
  const {
    sites,
    workforce,
    materials,
    tools,
    approvals,
    pettyCashRequests = [],
    pettyCashExpenses = [],
    pendingExpenses = [],
    pendingMaterialRequests = [],
    pendingToolRequests = [],
    pendingStageMilestones = [],
    loading,
    error,
  } = dashboardData

  const managerName =
    userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Operations Manager'

  const currentUser = useMemo(
    () => ({
      id: user?.uid || 'mgr_lead',
      name: managerName,
      email: user?.email,
      role: 'Manager',
    }),
    [user, managerName]
  )

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Live count badges
  const totalPendingApprovals =
    (pendingExpenses?.length || 0) +
    (pendingMaterialRequests?.length || 0) +
    (pendingToolRequests?.length || 0) +
    (pendingStageMilestones?.length || 0)

  const totalPettyCashPending =
    (pettyCashRequests?.filter((r) => r.status === 'PENDING_MANAGER_REVIEW')?.length || 0) +
    (pettyCashExpenses?.filter((e) => e.status === 'PENDING_EXPENSE_REVIEW')?.length || 0)

  // 8 Categorized Sidebar Groups (Matching Mobile Screen Registry)
  const sidebarGroups = [
    {
      title: 'COMMAND & CONTROL',
      items: [
        { id: 'dashboard', label: 'Manager Dashboard', path: '/manager/dashboard', icon: Sparkles },
        {
          id: 'approvals',
          label: 'Approvals Center',
          path: '/manager/approvals',
          icon: CheckCircle2,
          badge: totalPendingApprovals,
        },
      ],
    },
    {
      title: 'PROJECT & SITE MANAGEMENT',
      items: [
        { id: 'project-site-setup', label: 'Project & Site Setup', path: '/manager/project-site-setup', icon: Building2 },
        { id: 'sites', label: 'Sites Directory', path: '/manager/sites', icon: Building2 },
        { id: 'project-configs', label: 'Project Configuration', path: '/manager/project-configs', icon: FolderTree },
        { id: 'drawings', label: 'Layout and Drawings', path: '/manager/drawings', icon: Compass },
      ],
    },
    {
      title: 'SUPERVISOR & FIELD OPS',
      items: [
        { id: 'supervisors', label: 'Supervisor Configuration', path: '/manager/supervisors', icon: Users },
        { id: 'supervisor-map', label: 'Site-Supervisor Map', path: '/manager/supervisor-map', icon: Link2 },
        { id: 'daily-logs', label: 'Manager Daily Site Entry', path: '/manager/daily-logs', icon: FileText },
        { id: 'manager-expenses', label: 'Manager Expenses', path: '/manager/manager-expenses', icon: Receipt },
      ],
    },
    {
      title: 'MATERIALS & SUPPLY CHAIN',
      items: [
        { id: 'materials-catalog', label: 'Material Master', path: '/manager/materials-catalog', icon: Boxes },
        { id: 'materials-stock', label: 'Material Availability', path: '/manager/materials-stock', icon: Boxes },
        { id: 'materials-movements', label: 'Material Information', path: '/manager/materials-movements', icon: Truck },
        { id: 'tools-catalog', label: 'Tools Master', path: '/manager/tools-catalog', icon: Wrench },
        { id: 'tools-movements', label: 'Tools Inventory Details', path: '/manager/tools-movements', icon: Wrench },
      ],
    },
    {
      title: 'WORKFORCE & CONTRACTORS',
      items: [
        { id: 'contractors', label: 'Contractors Directory', path: '/manager/contractors', icon: Briefcase },
        { id: 'labour-scales', label: 'Labour Category Config', path: '/manager/labour-scales', icon: Coins },
        { id: 'workers', label: 'Workers Configuration', path: '/manager/workers', icon: Users },
        { id: 'worker-mapping', label: 'Workers Site Mapping', path: '/manager/worker-mapping', icon: Link2 },
        { id: 'attendance', label: 'Worker Attendance', path: '/manager/attendance', icon: CalendarCheck },
        { id: 'attendance-report', label: 'Worker Attendance Report', path: '/manager/attendance-report', icon: FileText },
      ],
    },
    {
      title: 'FLEET & LOGISTICS',
      items: [
        { id: 'fleet', label: 'Vehicle Fleet', path: '/manager/fleet', icon: Truck },
      ],
    },
    {
      title: 'FINANCE & SUPPORT',
      items: [
        {
          id: 'petty-cash',
          label: 'Petty Cash Management',
          path: '/manager/petty-cash',
          icon: DollarSign,
          badge: totalPettyCashPending,
        },
        { id: 'notifications', label: 'Notifications', path: '/manager/notifications', icon: Bell },
        { id: 'support', label: 'Manager Support', path: '/manager/support', icon: HelpCircle },
      ],
    },
  ]

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const renderModuleComponent = () => {
    switch (module) {
      // Group 2: Approvals
      case 'approvals':
        return (
          <ApprovalsCenter
            orgId={orgId}
            currentUser={currentUser}
            sites={sites}
            siteSupervisorEntries={dashboardData.siteSupervisorEntries || approvals || []}
            siteMaterialsRequest={dashboardData.siteMaterialsRequest || []}
            siteToolsRequest={dashboardData.siteToolsRequest || []}
            siteSupervisorProjectStageSchedule={dashboardData.siteSupervisorProjectStageSchedule || []}
            pendingExpenses={pendingExpenses}
            pendingMaterialRequests={pendingMaterialRequests}
            pendingToolRequests={pendingToolRequests}
            pendingStageMilestones={pendingStageMilestones}
            onNotify={showToast}
          />
        )

      // Group 3: Projects
      case 'project-site-setup':
      case 'site-setup':
      case 'site-wizard':
        return <ProjectAndSiteSetup orgId={orgId} currentUser={currentUser} onNotify={showToast} />
      case 'sites':
        return <SitesPortfolio sites={sites} onNotify={showToast} />
      case 'project-configs':
      case 'project-configuration':
        return <MasterConfigurations orgId={orgId} onNotify={showToast} />
      case 'drawings':
        return <BlueprintsDrawings orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />

      // Group 4: Field & Supervisor
      case 'supervisors':
        return <SupervisorSetup orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'supervisor-map':
        return <SiteSupervisorMap orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'daily-logs':
        return <DailySiteEntry orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'manager-expenses':
        return <ManagerExpenses orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />

      // Group 5: Supply Chain
      case 'materials':
      case 'materials-catalog':
        return <MaterialsCatalog orgId={orgId} currentUser={currentUser} onNotify={showToast} />
      case 'materials-stock':
        return <MaterialsStock orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'materials-movements':
        return <MaterialsMovements orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'tools':
      case 'tools-catalog':
        return <ToolsCatalog orgId={orgId} currentUser={currentUser} onNotify={showToast} />
      case 'tools-movements':
        return <ToolsMovements orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />

      // Group 6: Workforce
      case 'contractors':
        return <ContractorsHub orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'labour-scales':
        return <LabourWageScales orgId={orgId} onNotify={showToast} />
      case 'workers':
        return <WorkersDirectory orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'worker-mapping':
        return <WorkerSiteMapping orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'attendance':
      case 'workforce':
        return <WorkerAttendanceMuster orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />
      case 'attendance-report':
        return <ManagerWorkerAttendanceReport orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />

      // Group 7: Fleet
      case 'fleet':
        return <VehicleFleetHub orgId={orgId} sites={sites} currentUser={currentUser} onNotify={showToast} />

      // Group 8: Finance & Support
      case 'petty-cash':
        return <ManagerPettyCashHub {...dashboardData} sites={sites} onNotify={showToast} />
      case 'notifications':
        return (
          <ManagerNotificationsHub
            orgId={orgId}
            dashboardData={dashboardData}
            onNavigate={(tab) => navigate(`/manager/${tab}`)}
            onNotify={showToast}
          />
        )
      case 'support':
        return <ManagerSupportHub orgId={orgId} currentUser={currentUser} onNotify={showToast} />

      default:
        return <SitesPortfolio sites={sites} onNotify={showToast} />
    }
  }

  return (
    <div className="h-screen bg-[#F8FAFC] text-slate-900 flex font-sans overflow-hidden">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-semibold animate-fade-in ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <span>{toastMessage.message}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Enterprise Categorized #0B3470 Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0B3470] p-4 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-xl lg:z-20 shrink-0 h-screen overflow-y-auto ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between px-2 py-1">
            <Link
              to="/manager/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3"
            >
              <img className="h-10 w-auto rounded-xl object-contain bg-white p-1 shadow-md" src={logo} alt="eBricks" />
              <div className="text-white">
                <strong className="block text-sm font-extrabold tracking-wide">eBricks</strong>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Manager Portal</span>
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

          {/* Categorized Navigation Groups */}
          <div className="space-y-5">
            {sidebarGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-blue-200/50">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    module === item.id ||
                    (item.id === 'dashboard' && !module) ||
                    (item.id === 'materials-catalog' && module === 'materials') ||
                    (item.id === 'attendance' && module === 'workforce') ||
                    (item.id === 'tools-catalog' && module === 'tools')

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

        {/* Manager Profile Footer */}
        <div className="pt-4 border-t border-white/10 mt-6">
          <div className="px-3 py-2 text-white/80 text-xs">
            <p className="font-semibold text-white truncate">{managerName}</p>
            <span className="text-[10px] text-blue-200">Site Operations Lead</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto bg-[#F8FAFC]">
        {/* Topbar Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl border border-slate-200 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            <Link
              to="/manager/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 transition-colors"
            >
              ← Command Center
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Indicator */}
            <div className="hidden md:flex items-center text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
              Live Workspace · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date())}
            </div>

            {/* Notifications Button */}
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

        {/* Submodule Viewport */}
        <main className="p-6 md:p-8 max-w-7xl w-full mx-auto flex-1">{renderModuleComponent()}</main>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} role="Manager" />
    </div>
  )
}
