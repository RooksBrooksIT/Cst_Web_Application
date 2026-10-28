import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import StatusBadge from '../../components/common/StatusBadge'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import FilterBar from '../../components/common/FilterBar'
import ExportButton from '../../components/common/ExportButton'

// Services
import { createProject, updateProject, deleteProject, DEFAULT_PROJECT_STAGES } from '../../services/projectService'
import { createMaterial, updateMaterial, deleteMaterial, MATERIAL_CATEGORIES, MATERIAL_UNITS } from '../../services/materialService'
import { createTool, updateTool, deleteTool, TOOL_CATEGORIES } from '../../services/toolService'
import { createInvitationCode } from '../../services/userService'
import { createOrUpdatePettyCashAccount, disbursePettyCashRequest, approvePettyCashExpense } from '../../services/pettyCashService'
import { executeTier2OrgApproval } from '../../services/approvalService'
import { fetchSiteGranularExpenses } from '../../services/financeService'
import { OrganizationSubscriptionPage } from './subscription/OrganizationSubscriptionPage'
import OrganizationReportsHub from './reports/OrganizationReportsHub'
import OrgFinancePage from './finance/OrgFinancePage'
import SiteFinancialDetailsPage from './finance/SiteFinancialDetailsPage'
import OrganizationExpenses from './operations/OrganizationExpenses'
import PettyCashGovernance from './pettycash/PettyCashGovernance'
import OrganizationApprovalsCenter from './approvals/OrganizationApprovalsCenter'
import TeamManagement from './team/TeamManagement'
import OrganizationInventoryHub from './inventory/OrganizationInventoryHub'
import BlueprintsDrawings from '../manager/projects/BlueprintsDrawings'
import ConstructionDocuments from '../common/ConstructionDocuments'
import IncentiveCalculation from './incentives/IncentiveCalculation'
import { SubscriptionLimitService, isFeatureAllowedForPlan, isSubscriptionExpired } from '../../services/subscriptionLimitService'
import SubscriptionLimitModal from '../../components/common/SubscriptionLimitModal'
import { ShieldAlert, ArrowUpRight, Eye } from 'lucide-react'
import { matchesSite } from '../../services/reportService'

export { OrgFinancePage, SiteFinancialDetailsPage, OrganizationExpenses, PettyCashGovernance, OrganizationApprovalsCenter, TeamManagement, BlueprintsDrawings, ConstructionDocuments, IncentiveCalculation }

function displayValue(record, fields, fallback = 'Not available') {
  return fields.map((field) => record?.[field]).find((item) => item !== undefined && item !== null && item !== '') ?? fallback
}

export function parseAmount(val) {
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

export function amountValue(record, fields) {
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

export { matchesSite }

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime()) ? 'N/A' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

function statusBadgeColor(status) {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'completed' || s === 'done' || s === 'finished') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s === 'planning' || s === 'draft' || s === 'setup') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  if (s === 'hold' || s === 'paused' || s === 'pending' || s === 'on hold') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (s === 'delay' || s === 'delayed' || s === 'overdue' || s === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-200'
  return 'bg-sky-50 text-sky-700 border-sky-200' // Live / In Progress
}

// ------------------------------------------------------------------------------------------------
// 1 & 2. ORGANIZATION FINANCE & SITE DETAILS (Modularized in ./finance/)
// ------------------------------------------------------------------------------------------------
// OrgFinancePage and SiteFinancialDetailsPage are imported from ./finance/

// ------------------------------------------------------------------------------------------------
// 3. PROJECT & SITES MASTER MODULE
// ------------------------------------------------------------------------------------------------
export function SiteManagement({ sites = [], managers = [], subscription, loading, error }) {
  const { orgId, role } = useAuth()
  const isOrgUser = !role || String(role).toLowerCase().includes('org') || String(role).toLowerCase() === 'admin'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [limitModalData, setLimitModalData] = useState(null)
  const [editingSite, setEditingSite] = useState(null)
  const [viewingSite, setViewingSite] = useState(null)
  const [saving, setSaving] = useState(false)

  const planName = subscription?.subscriptionPlan || 'Free Trial'
  const maxSites = subscription?.maxProjects || (planName === 'Gold' ? 10 : planName === 'Silver' ? 5 : 1)
  const isAtLimit = sites.length >= maxSites

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    siteLocation: '',
    totalBudget: '',
    startDate: '',
    estimatedEndDate: '',
    managerName: '',
  })

  async function handleOpenCreate() {
    if (isOrgUser) {
      alert('Organization users have view-only access to site information.')
      return
    }
    const check = await SubscriptionLimitService.canCreateSite({
      orgId,
      currentSitesCount: sites.length,
      currentPlanName: planName,
    })
    if (!check.isAllowed) {
      setLimitModalData({
        title: check.title || 'Site Quota Reached',
        message: check.message,
        planName: check.planName || planName,
        currentCount: check.currentCount !== undefined ? check.currentCount : sites.length,
        maxLimit: check.maxLimit !== undefined ? check.maxLimit : maxSites,
        recommendedPlan: check.upgradePlan || 'Silver',
        resourceType: 'Site',
      })
      return
    }

    setEditingSite(null)
    setFormData({
      name: '',
      code: `PRJ-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      siteLocation: '',
      totalBudget: '',
      startDate: new Date().toISOString().split('T')[0],
      estimatedEndDate: '',
      managerName: managers[0]?.fullName || managers[0]?.name || '',
    })
    setIsModalOpen(true)
  }

  function handleOpenView(site) {
    setViewingSite(site)
  }

  function handleOpenEdit(site) {
    if (isOrgUser) {
      handleOpenView(site)
      return
    }
    setEditingSite(site)
    setFormData({
      name: site.name || site.projectName || '',
      code: site.code || site.siteCode || '',
      clientName: site.clientName || '',
      clientPhone: site.clientPhone || '',
      clientEmail: site.clientEmail || '',
      siteLocation: site.location?.address || site.siteLocation || '',
      totalBudget: site.totalBudget || site.budget || site.estimatedBudget || '',
      startDate: site.startDate?.split?.('T')?.[0] || '',
      estimatedEndDate: site.estimatedEndDate?.split?.('T')?.[0] || '',
      managerName: site.managerName || '',
    })
    setIsModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (isOrgUser) {
      alert('Organization users have view-only access to site information.')
      return
    }
    if (!orgId) return
    setSaving(true)
    try {
      if (editingSite) {
        await updateProject(orgId, editingSite.id, formData)
      } else {
        await createProject(orgId, formData)
      }
      setIsModalOpen(false)
    } catch (err) {
      if (err.code === 'SITE_LIMIT_REACHED' || err.code === 'FREE_TRIAL_LIMIT_REACHED' || err.code === 'SUBSCRIPTION_EXPIRED') {
        setIsModalOpen(false)
        setLimitModalData({
          title: err.code === 'SUBSCRIPTION_EXPIRED' ? 'Subscription Expired' : (err.code === 'FREE_TRIAL_LIMIT_REACHED' ? 'Free Trial Limit Reached' : 'Site Quota Reached'),
          message: err.message,
          planName,
          currentCount: sites.length,
          maxLimit,
          recommendedPlan: err.upgradePlan || 'Silver',
          resourceType: 'Site',
        })
      } else {
        alert('Error saving project: ' + err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      header: 'Project Code',
      accessor: 'code',
      render: (row) => (
        <span className="font-mono text-blue-700 font-bold">{row.code || row.siteCode || row.id}</span>
      ),
    },
    {
      header: 'Project / Site Name',
      accessor: 'name',
      render: (row) => (
        <div>
          <strong className="block text-slate-900">{row.name || row.projectName}</strong>
          <small className="text-slate-400">{row.location?.address || row.siteLocation || 'Location registered'}</small>
        </div>
      ),
    },
    {
      header: 'Client',
      accessor: 'clientName',
      render: (row) => row.clientName || 'Standard Client',
    },
    {
      header: 'Budget',
      accessor: 'totalBudget',
      align: 'right',
      render: (row) => (
        <span className="font-bold text-emerald-700">
          {money(amountValue(row, ['totalBudget', 'budget', 'estimatedBudget']))}
        </span>
      ),
    },
    {
      header: 'Current Stage',
      accessor: 'currentStage',
      align: 'center',
      render: (row) => <span className="font-medium text-slate-700">{row.currentStage || row.projectStage || 'Foundation'}</span>,
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status || row.currentStatus || 'Active'} />,
    },
    {
      header: 'Actions',
      align: 'center',
      render: (row) => (
        isOrgUser ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenView(row)
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenEdit(row)
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Edit
          </button>
        )
      ),
    },
  ]

  const statusCounts = useMemo(() => {
    return {
      all: sites.length,
      in_progress: sites.filter((s) => ['in_progress', 'active', 'ongoing'].includes(String(s.status || s.currentStatus || '').toLowerCase())).length,
      completed: sites.filter((s) => String(s.status || s.currentStatus || '').toLowerCase() === 'completed').length,
    }
  }, [sites])

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const st = String(s.status || s.currentStatus || '').toLowerCase()
      if (statusFilter === 'in_progress') return ['in_progress', 'active', 'ongoing'].includes(st)
      if (statusFilter === 'completed') return st === 'completed'
      return true
    })
  }, [sites, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Project Master</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Construction Sites Portfolio</h1>
          <p className="text-xs text-slate-500 mt-1">Multi-site milestone tracking, financial budgets, and spatial management.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!isOrgUser && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0B3470] hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <span>+ Create Project</span>
            </button>
          )}
          <ExportButton
            filename="ebricks_projects"
            headers={['Project Code', 'Project Name', 'Client', 'Budget (INR)', 'Stage', 'Status']}
            data={filteredSites.map((s) => [
              s.code || s.siteCode || s.id,
              s.name || s.projectName,
              s.clientName || 'Standard Client',
              amountValue(s, ['totalBudget', 'budget', 'estimatedBudget']),
              s.currentStage || s.projectStage || 'Foundation',
              s.status || s.currentStatus || 'Active',
            ])}
            title="Projects Portfolio Master"
          />
        </div>
      </div>

      {/* Subscription Quota Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 font-medium">Subscription Quota:</span>
          <span className="font-bold text-slate-800">
            {sites.length} / {maxSites === 999999 ? 'Unlimited' : maxSites} Active Sites
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {planName} Plan
          </span>
        </div>
        {isAtLimit && (
          <Link
            to="/organization/subscription"
            className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors shrink-0"
          >
            <span>Quota Reached — Upgrade to add more</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <SubscriptionLimitModal
        isOpen={Boolean(limitModalData)}
        onClose={() => setLimitModalData(null)}
        {...limitModalData}
      />

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        tabs={[
          { id: 'all', label: 'All Projects', count: statusCounts.all },
          { id: 'in_progress', label: 'In Progress', count: statusCounts.in_progress },
          { id: 'completed', label: 'Completed', count: statusCounts.completed },
        ]}
        activeTab={statusFilter}
        onTabChange={setStatusFilter}
        placeholder="Search projects by name, code, client..."
      />

      <DataTable
        columns={columns}
        data={filteredSites}
        onRowClick={(row) => (isOrgUser ? handleOpenView(row) : handleOpenEdit(row))}
        searchQuery={search}
        searchFields={['name', 'projectName', 'code', 'siteCode', 'clientName', 'siteLocation']}
        emptyMessage="No construction projects registered."
      />

      {/* View-Only Site Details Modal for Organization Users */}
      {viewingSite && (
        <Modal
          isOpen={Boolean(viewingSite)}
          onClose={() => setViewingSite(null)}
          title={viewingSite.name || viewingSite.projectName || 'Site Details'}
          subtitle={`Project Code: ${viewingSite.code || viewingSite.siteCode || viewingSite.projectCode || viewingSite.id || 'N/A'}`}
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <StatusBadge status={viewingSite.status || viewingSite.currentStatus || 'Active'} />
                <span className="font-semibold text-slate-700">
                  {viewingSite.currentStage || viewingSite.projectStage || 'Foundation'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                ID: {viewingSite.id || viewingSite.siteId || viewingSite.projectId || 'N/A'}
              </span>
            </div>

            {/* Client & Personnel Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Client Name</span>
                <strong className="text-slate-800 text-xs">{viewingSite.clientName || viewingSite.ownerName || 'Standard Client'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Client Contact</span>
                <span className="text-slate-700 text-xs">
                  {viewingSite.clientPhone || viewingSite.ownerPhoneNumber || viewingSite.clientEmail
                    ? `${viewingSite.clientPhone || viewingSite.ownerPhoneNumber || ''} ${viewingSite.clientEmail ? `(${viewingSite.clientEmail})` : ''}`
                    : 'No contact provided'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Manager</span>
                <span className="text-slate-700 text-xs">{viewingSite.managerName || 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Supervisor</span>
                <span className="text-slate-700 text-xs">{viewingSite.supervisorName || 'Unassigned'}</span>
              </div>
            </div>

            {/* Financial Overview */}
            <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-100">
              <div>
                <span className="text-blue-700 block text-[10px] uppercase font-bold">Sanctioned Budget</span>
                <strong className="text-sm font-black text-slate-900">
                  {money(amountValue(viewingSite, ['totalBudget', 'budget', 'projectBudget', 'estimatedBudget']))}
                </strong>
              </div>
              <div>
                <span className="text-blue-700 block text-[10px] uppercase font-bold">Amount Paid / Advance</span>
                <strong className="text-sm font-black text-blue-800">
                  {money(amountValue(viewingSite, ['amountPaid', 'advancePaid', 'amountReceived']))}
                </strong>
              </div>
              <div>
                <span className="text-blue-700 block text-[10px] uppercase font-bold">Balance</span>
                <strong className="text-sm font-black text-emerald-700">
                  {money(amountValue(viewingSite, ['amountBalance', 'balance', 'balanceAmount']))}
                </strong>
              </div>
            </div>

            {/* Location & Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="sm:col-span-2">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Site Location / Address</span>
                <span className="text-slate-700 text-xs">
                  {viewingSite.location?.address || viewingSite.siteLocation || viewingSite.location || 'Location registered'}
                </span>
                {Number(viewingSite.latitude) !== 0 && viewingSite.latitude && (
                  <span className="block font-mono text-[11px] text-slate-500 mt-0.5">
                    GPS: {viewingSite.latitude}, {viewingSite.longitude}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Start Date</span>
                <span className="text-slate-700 text-xs font-mono">
                  {viewingSite.startDate?.split?.('T')?.[0] || viewingSite.plannedStartDate?.split?.('T')?.[0] || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Completion Date</span>
                <span className="text-slate-700 text-xs font-mono">
                  {viewingSite.estimatedEndDate?.split?.('T')?.[0] || viewingSite.plannedEndDate?.split?.('T')?.[0] || 'N/A'}
                </span>
              </div>
            </div>

            {/* Contract Info if applicable */}
            {viewingSite.isContractWork && (
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-900">
                <span className="text-[10px] uppercase font-bold block">Subcontract Work</span>
                <span>Contractor: <strong>{viewingSite.contractorName || 'N/A'}</strong> · Budget: <strong>{money(viewingSite.contractorBudget)}</strong></span>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingSite(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Project Modal (restricted to non-organization roles) */}
      {!isOrgUser && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingSite ? 'Edit Project Master' : 'Create New Construction Project'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Project Name *
              <input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Skyline Heights - Phase 1"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Project Code
              <input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Client Name
              <input
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                placeholder="Client / Firm"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Client Phone
              <input
                value={formData.clientPhone}
                onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                placeholder="+91 9876543210"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Client Email
              <input
                type="email"
                value={formData.clientEmail}
                onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                placeholder="client@ebricks.com"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Site Location / Address
              <input
                value={formData.siteLocation}
                onChange={(e) => setFormData({ ...formData, siteLocation: e.target.value })}
                placeholder="Sector 42, Metro Road"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Estimated Total Budget (INR) *
              <input
                type="number"
                required
                value={formData.totalBudget}
                onChange={(e) => setFormData({ ...formData, totalBudget: e.target.value })}
                placeholder="5000000"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Start Date
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Target Completion Date
              <input
                type="date"
                value={formData.estimatedEndDate}
                onChange={(e) => setFormData({ ...formData, estimatedEndDate: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-full sm:w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingSite ? 'Save Changes' : '✓ Create Project'}
            </button>
          </div>
        </form>
      </Modal>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 4. MASTER MATERIAL CATALOG
// ------------------------------------------------------------------------------------------------
export function MaterialCatalogManagement({ materials = [] }) {
  const { orgId } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: 'Cement',
    unit: 'Bags',
    standardRate: '',
    hsnCode: '',
    minReorderLevel: '50',
  })

  function handleOpenCreate() {
    setFormData({
      name: '',
      category: 'Cement',
      unit: 'Bags',
      standardRate: '',
      hsnCode: '',
      minReorderLevel: '50',
    })
    setIsModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      await createMaterial(orgId, formData)
      setIsModalOpen(false)
    } catch (err) {
      alert('Error creating material: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      header: 'Material Name',
      accessor: 'name',
      render: (row) => <strong className="text-slate-900">{row.name || row.materialName}</strong>,
    },
    {
      header: 'Category',
      accessor: 'category',
      render: (row) => <StatusBadge status={row.category || 'General'} />,
    },
    {
      header: 'Unit',
      accessor: 'unit',
      align: 'center',
      render: (row) => row.unit || 'Units',
    },
    {
      header: 'Standard Rate (INR)',
      accessor: 'standardRate',
      align: 'right',
      render: (row) => <span className="font-bold text-slate-800">{money(amountValue(row, ['standardRate', 'rate']))}</span>,
    },
    {
      header: 'HSN Tax Code',
      accessor: 'hsnCode',
      align: 'center',
      render: (row) => <span className="font-mono text-slate-500">{row.hsnCode || 'HSN-6810'}</span>,
    },
    {
      header: 'Safety Stock Limit',
      accessor: 'minReorderLevel',
      align: 'right',
      render: (row) => <span className="text-slate-600 font-semibold">{row.minReorderLevel || 10} {row.unit}</span>,
    },
  ]

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false
      return true
    })
  }, [materials, categoryFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Master Catalog</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Material Standards & Unit Rates</h1>
          <p className="text-xs text-slate-500 mt-1">Universal materials, benchmark procurement rates, HSN tax codes, and reorder levels.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            filename="master_materials"
            headers={['Material Name', 'Category', 'Unit', 'Standard Rate (INR)', 'HSN Code', 'Min Safety Stock']}
            data={filteredMaterials.map((m) => [
              m.name || m.materialName,
              m.category || 'Cement',
              m.unit || 'Bags',
              m.standardRate || 0,
              m.hsnCode || '',
              m.minReorderLevel || 10,
            ])}
            title="Master Material Catalog"
          />
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
          >
            ＋ Add Master Material
          </button>
        </div>
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder="Search materials by name, category, HSN..."
        rightAction={
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium outline-none focus:bg-white"
          >
            <option value="all">All Categories</option>
            {MATERIAL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        }
      />

      <DataTable
        columns={columns}
        data={filteredMaterials}
        searchQuery={search}
        searchFields={['name', 'materialName', 'category', 'hsnCode']}
        emptyMessage="No master materials found. Click 'Add Master Material' to populate your catalogue."
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Master Material Specification">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-medium text-slate-700">
            Material Name *
            <input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Fe 500 TMT Steel 12mm"
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Category
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Measurement Unit
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              >
                {MATERIAL_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              Standard Rate (INR) *
              <input
                type="number"
                required
                value={formData.standardRate}
                onChange={(e) => setFormData({ ...formData, standardRate: e.target.value })}
                placeholder="420"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              HSN Code
              <input
                value={formData.hsnCode}
                onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                placeholder="7214"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Min Safety Stock
              <input
                type="number"
                value={formData.minReorderLevel}
                onChange={(e) => setFormData({ ...formData, minReorderLevel: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors"
            >
              {saving ? 'Adding...' : '✓ Add to Catalog'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 5. TEAM & USER GOVERNANCE
// Handled by enterprise TeamManagement component in ./team/TeamManagement
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// 6. PETTY CASH GOVERNANCE
// Handled by enterprise PettyCashGovernance component in ./pettycash/PettyCashGovernance
// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// 7. COMPREHENSIVE REPORTS & AUDIT ENGINE
// ------------------------------------------------------------------------------------------------
export function ReportsEngine(rawData) {
  const [selectedReportId, setSelectedReportId] = useState(AVAILABLE_REPORTS[0].id)
  const [search, setSearch] = useState('')

  const activeReportMeta = AVAILABLE_REPORTS.find((r) => r.id === selectedReportId) || AVAILABLE_REPORTS[0]
  const reportRecords = useMemo(() => {
    return generateReportData(selectedReportId, rawData)
  }, [selectedReportId, rawData])

  const headers = useMemo(() => {
    if (reportRecords.length === 0) return []
    return Object.keys(reportRecords[0])
  }, [reportRecords])

  const columns = useMemo(() => {
    return headers.map((h) => ({
      header: h,
      accessor: h,
      render: (row) => {
        const val = row[h]
        if (typeof val === 'number' && (h.toLowerCase().includes('inr') || h.toLowerCase().includes('amount') || h.toLowerCase().includes('budget') || h.toLowerCase().includes('spent'))) {
          return <span className="font-bold text-slate-800">{money(val)}</span>
        }
        return val
      },
    }))
  }, [headers])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Audit Center</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Interactive Financial & Operational Reports</h1>
          <p className="text-xs text-slate-500 mt-1">Multi-site data aggregation across budgets, indents, muster rolls, machinery, and quality.</p>
        </div>
        <ExportButton
          filename={selectedReportId}
          headers={headers}
          data={reportRecords}
          title={activeReportMeta.title}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {AVAILABLE_REPORTS.map((rep) => (
          <button
            key={rep.id}
            type="button"
            onClick={() => {
              setSelectedReportId(rep.id)
              setSearch('')
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedReportId === rep.id
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {rep.title.split('Report')[0].split('Statement')[0].trim()}
          </button>
        ))}
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder={`Search ${activeReportMeta.title}...`}
      />

      <DataTable
        columns={columns}
        data={reportRecords}
        searchQuery={search}
        emptyMessage={`No data records available for ${activeReportMeta.title}.`}
      />
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// Plan Feature Gate Component
// ------------------------------------------------------------------------------------------------
function PlanFeatureGate({ featureName, requiredTier = 'Gold', planName = 'Free Trial', subscription = null, description }) {
  const isExpired = subscription ? isSubscriptionExpired(subscription) : false
  const isTrial = planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('free')

  const title = isTrial && isExpired
    ? '14-Day Free Trial Expired'
    : isExpired
    ? 'Subscription Plan Expired'
    : `${requiredTier} Plan Feature`

  const subtext = isTrial && isExpired
    ? `Your 14-day Free Trial period has ended. Select a subscription plan to regain access to ${featureName} and continue full platform operations.`
    : isExpired
    ? `Your subscription (${planName}) has expired. Please renew or upgrade to regain access to ${featureName}.`
    : (description || `This module requires the ${requiredTier} plan or above. Your organization is currently on the ${planName} plan.`)

  return (
    <div className="bg-white rounded-3xl p-8 md:p-12 border border-slate-200 text-center max-w-2xl mx-auto shadow-xs my-8 space-y-5 animate-fade-in">
      <div className={`w-16 h-16 rounded-2xl ${isExpired ? 'bg-rose-50 border border-rose-200 text-rose-600' : 'bg-amber-50 border border-amber-200 text-amber-600'} flex items-center justify-center mx-auto shadow-xs`}>
        <ShieldAlert className="w-8 h-8" />
      </div>
      <div>
        <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isExpired ? 'text-rose-700 bg-rose-50 border border-rose-200' : 'text-blue-600 bg-blue-50 border border-blue-200'} px-3 py-1 rounded-full`}>
          {isTrial && isExpired ? 'Trial Ended' : isExpired ? 'Expired' : `${requiredTier} Plan Feature`}
        </span>
        <h2 className="text-2xl font-black text-slate-900 mt-3">{title}</h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          {subtext}
        </p>
      </div>

      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-left max-w-md mx-auto space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Current Plan:</span>
          <span className="font-bold text-slate-800 px-2 py-0.5 bg-slate-200/70 rounded-md text-[11px]">{planName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Status:</span>
          <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${isExpired ? 'text-rose-700 bg-rose-100' : 'text-emerald-700 bg-emerald-100'}`}>
            {isExpired ? 'Expired' : 'Active'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Required Plan:</span>
          <strong className="text-blue-700">{requiredTier}+</strong>
        </div>
      </div>

      <div className="pt-2">
        <Link
          to="/organization/subscription"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3470] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
        >
          <span>{isExpired ? 'Select a Plan' : `Upgrade to ${requiredTier}`}</span>
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 8. MAIN ORGANIZATION MODULE DISPATCHER
// ------------------------------------------------------------------------------------------------
export default function OrganizationModule(props) {
  const { module } = useParams()
  const activeModule = props.module || module || 'sites'
  const planName = props.subscription?.subscriptionPlan || 'Free Trial'

  switch (activeModule) {
    case 'finance':
    case 'financials':
      if (!isFeatureAllowedForPlan('petty_cash_expenses', planName, props.subscription)) {
        return (
          <PlanFeatureGate
            featureName="Finance & Expense Management"
            requiredTier="Silver"
            planName={planName}
            description="Financial expense tracking, daily entries submissions, and vendor cost ledgers require the Silver plan or above."
          />
        )
      }
      return (
        <OrgFinancePage
          sites={props.sites}
          totalSiteExpensesPerDay={props.totalSiteExpensesPerDay}
          sitePayments={props.sitePayments}
        />
      )
    case 'expenses':
    case 'organization-expenses':
    case 'org-expenses':
      return (
        <OrganizationExpenses
          orgId={props.orgId}
          sites={props.sites}
          currentUser={props.user}
          onNotify={props.onNotify}
        />
      )
    case 'sites':
    case 'projects':
      return (
        <SiteManagement
          sites={props.sites}
          managers={props.managers}
          subscription={props.subscription}
          loading={props.loading}
          error={props.error}
        />
      )
    case 'drawings':
    case 'blueprints':
    case 'layouts':
    case 'layout-drawings':
      return <BlueprintsDrawings orgId={props.orgId} sites={props.sites} currentUser={props.user} onNotify={props.onNotify} />
    case 'construction-documents':
    case 'construction-docs':
      return <ConstructionDocuments orgId={props.orgId} sites={props.sites} currentUser={props.user} onNotify={props.onNotify} />
    case 'materials':
    case 'inventory':
    case 'tools':
    case 'assets':
    case 'equipment':
      if (!isFeatureAllowedForPlan('materials_inventory', planName, props.subscription)) {
        return (
          <PlanFeatureGate
            featureName="Inventory & Supply Chain"
            requiredTier="Silver"
            planName={planName}
            description="Material indent, purchasing, vendor tracking, and equipment movements require the Silver plan or above."
          />
        )
      }
      return <OrganizationInventoryHub {...props} />
    case 'team':
    case 'users':
    case 'staff':
    case 'workforce':
      return (
        <TeamManagement
          managers={props.managers}
          supervisors={props.supervisors}
          workers={props.workers}
          sites={props.sites}
          projects={props.projects}
        />
      )
    case 'approvals':
    case 'approval':
    case 'authorizations':
      if (!isFeatureAllowedForPlan('approvals_workflow', planName, props.subscription)) {
        return (
          <PlanFeatureGate
            featureName="Multi-Tier Approvals Center"
            requiredTier="Silver"
            planName={planName}
            description="Multi-tier payment approval workflows, milestone authorizations, and contractor sign-offs require the Silver plan or above."
          />
        )
      }
      return <OrganizationApprovalsCenter {...props} />
    case 'petty-cash':
      if (!isFeatureAllowedForPlan('petty_cash_expenses', planName, props.subscription)) {
        return (
          <PlanFeatureGate
            featureName="Petty Cash Governance"
            requiredTier="Silver"
            planName={planName}
            description="Petty cash floats, expense tracking, and reimbursement workflows require the Silver plan or above."
          />
        )
      }
      return <PettyCashGovernance {...props} />
    case 'reports':
    case 'insights':
    case 'analytics':
      return <OrganizationReportsHub {...props} />
    case 'incentives':
    case 'incentive':
    case 'incentive-calculation':
    case 'supervisor-incentives':
      return <IncentiveCalculation {...props} />
    case 'subscription':
    case 'plans':
    case 'billing':
      return (
        <OrganizationSubscriptionPage
          sites={props.sites}
          managers={props.managers}
          subscription={props.subscription}
        />
      )
    default:
      return (
        <SiteManagement
          sites={props.sites}
          managers={props.managers}
          subscription={props.subscription}
          loading={props.loading}
          error={props.error}
        />
      )
  }
}
