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
import PettyCashGovernance from './pettycash/PettyCashGovernance'
import OrganizationApprovalsCenter from './approvals/OrganizationApprovalsCenter'

export { OrgFinancePage, SiteFinancialDetailsPage, PettyCashGovernance, OrganizationApprovalsCenter }

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

export function matchesSite(record, site) {
  if (!record || !site) return false
  const siteKeys = [
    site.id,
    site.siteId,
    site.siteid,
    site.code,
    site.siteCode,
    site.projectId,
  ].filter(Boolean).map((k) => String(k).trim().toLowerCase())

  const siteNames = [
    site.siteName,
    site.sitename,
    site.projectName,
    site.name,
  ].filter(Boolean).map((n) => String(n).trim().toLowerCase())

  const recKeys = [
    record.id,
    record.siteId,
    record.siteid,
    record.code,
    record.siteCode,
    record.projectId,
    record.projectID,
  ].filter(Boolean).map((k) => String(k).trim().toLowerCase())

  const recNames = [
    record.siteName,
    record.sitename,
    record.projectName,
    record.name,
  ].filter(Boolean).map((n) => String(n).trim().toLowerCase())

  for (const sKey of siteKeys) {
    if (recKeys.includes(sKey)) return true
  }

  for (const sName of siteNames) {
    if (recNames.includes(sName)) return true
  }

  return false
}

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
export function SiteManagement({ sites = [], managers = [], loading, error }) {
  const { orgId } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSite, setEditingSite] = useState(null)
  const [saving, setSaving] = useState(false)

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

  function handleOpenCreate() {
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

  function handleOpenEdit(site) {
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
      alert('Error saving project: ' + err.message)
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleOpenEdit(row)
          }}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          Edit
        </button>
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
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
          >
            ＋ Add Project Site
          </button>
        </div>
      </div>

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
        searchQuery={search}
        searchFields={['name', 'projectName', 'code', 'siteCode', 'clientName', 'siteLocation']}
        emptyMessage="No construction projects registered. Click 'Add Project Site' to create one."
      />

      {/* Project Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingSite ? 'Edit Project Master' : 'Create New Construction Project'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-3 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
              {saving ? 'Saving...' : editingSite ? 'Save Changes' : '✓ Create Project'}
            </button>
          </div>
        </form>
      </Modal>
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
// ------------------------------------------------------------------------------------------------
export function TeamManagement({ managers = [], sites = [] }) {
  const { orgId } = useAuth()
  const [search, setSearch] = useState('')
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteResult, setInviteResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'manager',
    assignedProjects: [],
  })

  async function handleInvite(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      const res = await createInvitationCode(orgId, formData)
      setInviteResult(res)
    } catch (err) {
      alert('Error creating invite: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      header: 'Staff Name',
      accessor: 'fullName',
      render: (row) => (
        <div>
          <strong className="block text-slate-900">{row.fullName || row.FullName || row.name || row.userName || 'Team Member'}</strong>
          <small className="text-slate-400 font-mono">{row.id}</small>
        </div>
      ),
    },
    {
      header: 'Email / Contact',
      accessor: 'email',
      render: (row) => (
        <div>
          <span className="block text-slate-800">{row.email || row.Email || 'No email registered'}</span>
          <small className="text-slate-500">{row.phone || row.phoneNumber || row.ContactNo || ''}</small>
        </div>
      ),
    },
    {
      header: 'Assigned Role',
      accessor: 'role',
      align: 'center',
      render: (row) => <StatusBadge status={row.role || row.Designation || 'Operations Manager'} />,
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status || 'Active'} />,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Team Governance</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Staff, Managers & Field Roles</h1>
          <p className="text-xs text-slate-500 mt-1">Manage corporate personnel, site assignments, and referral onboarding links.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setInviteResult(null)
            setIsInviteOpen(true)
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
        >
          ＋ Invite Team Member
        </button>
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        placeholder="Search team members by name, email, role..."
      />

      <DataTable
        columns={columns}
        data={managers}
        searchQuery={search}
        searchFields={['fullName', 'FullName', 'name', 'userName', 'email', 'Email', 'role']}
        emptyMessage="No team members listed. Click 'Invite Team Member' to onboard staff."
      />

      <Modal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Generate Referral Onboarding Invitation">
        {inviteResult ? (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h3 className="text-sm font-bold text-slate-900">Invitation Code Generated Successfully!</h3>
            <p className="text-xs text-slate-600">Share this 8-digit referral code with the invited member to join during registration:</p>
            <div className="p-3 bg-slate-100 rounded-xl font-mono text-xl font-extrabold text-blue-800 tracking-widest select-all">
              {inviteResult.code}
            </div>
            <button
              type="button"
              onClick={() => setIsInviteOpen(false)}
              className="w-full py-2.5 rounded-xl font-bold bg-[#0B3470] text-white text-xs"
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
              System Role
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              >
                <option value="manager">Operations / Project Manager</option>
                <option value="supervisor">Site Supervisor</option>
                <option value="customer">Client / Customer</option>
              </select>
            </label>
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
                disabled={saving}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-blue-800 text-white text-xs shadow-sm transition-colors"
              >
                {saving ? 'Generating...' : '✓ Generate Code'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

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
// 8. MAIN ORGANIZATION MODULE DISPATCHER
// ------------------------------------------------------------------------------------------------
export default function OrganizationModule(props) {
  const { module } = useParams()
  const activeModule = props.module || module || 'sites'

  switch (activeModule) {
    case 'finance':
    case 'financials':
      return (
        <OrgFinancePage
          sites={props.sites}
          totalSiteExpensesPerDay={props.totalSiteExpensesPerDay}
          sitePayments={props.sitePayments}
        />
      )
    case 'sites':
    case 'projects':
      return <SiteManagement sites={props.sites} managers={props.managers} loading={props.loading} error={props.error} />
    case 'materials':
    case 'inventory':
      return <MaterialCatalogManagement materials={props.materials || props.inventory} />
    case 'team':
    case 'users':
      return <TeamManagement managers={props.managers} sites={props.sites} />
    case 'approvals':
    case 'approval':
    case 'authorizations':
      return <OrganizationApprovalsCenter {...props} />
    case 'petty-cash':
      return <PettyCashGovernance {...props} />
    case 'reports':
    case 'insights':
    case 'analytics':
      return <OrganizationReportsHub {...props} />
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
      return <SiteManagement sites={props.sites} managers={props.managers} loading={props.loading} error={props.error} />
  }
}
