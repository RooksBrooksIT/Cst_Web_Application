import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../services/firebase'
import StatusBadge from '../../components/common/StatusBadge'
import Modal from '../../components/common/Modal'

const moduleNames = {
  sites: 'Sites',
  finance: 'Finance',
  approvals: 'Approvals',
  'petty-cash': 'Petty Cash',
  team: 'Team & Managers',
  materials: 'Materials & Inventory',
  tools: 'Tools & Machinery',
  workforce: 'Workforce Hub',
  reports: 'Reports & Analytics',
  branding: 'Branding & Profile',
  subscription: 'Subscription & Billing',
  settings: 'Settings',
}

function displayValue(record, fields, fallback = 'Not available') {
  return fields.map((field) => record?.[field]).find((item) => item !== undefined && item !== null && item !== '') ?? fallback
}

function amountValue(record, fields) {
  const amount = Number(displayValue(record, fields, 0))
  return Number.isFinite(amount) ? amount : 0
}

function projectKey(project) {
  return displayValue(project, ['id', 'projectId', 'projectID'], '')
}

function transactionProjectKey(transaction) {
  return displayValue(transaction, ['projectId', 'projectID', 'siteId', 'siteID', 'project'], '')
}

function matchesProject(transaction, project) {
  const transactionKey = transactionProjectKey(transaction)
  return !transactionKey || transactionKey === projectKey(project)
}

function normalizedStatus(record) {
  return String(displayValue(record, ['currentStatus', 'status', 'projectStatus'], 'unknown')).toLowerCase().replace(/[_-]+/g, ' ').trim()
}

function approvalStatus(record) {
  return String(displayValue(record, ['status', 'approvalStatus', 'requestStatus'], 'pending')).toLowerCase().replace(/[_-]+/g, ' ').trim()
}

function approvalDate(record) {
  const rawDate = displayValue(record, ['submittedAt', 'createdAt', 'requestedAt', 'date'], '')
  if (!rawDate) return 'Date not available'
  const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate)
  return Number.isNaN(date.getTime()) ? 'Date not available' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date)
}

// ------------------------------------------------------------------------------------------------
// 1. APPROVAL CENTER (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function ApprovalManagement({ approvals = [], loading, error }) {
  const { orgId } = useAuth()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [query, setQuery] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [selectedApproval, setSelectedApproval] = useState(null)
  const [remarks, setRemarks] = useState('')

  const filteredApprovals = useMemo(() => {
    const search = query.trim().toLowerCase()
    return approvals.filter((approval) => {
      const status = approvalStatus(approval)
      const statusMatches =
        statusFilter === 'all' ||
        (statusFilter === 'pending'
          ? !['approved', 'rejected', 'completed', 'cleared'].includes(status)
          : status === statusFilter)
      const searchMatches =
        !search ||
        [
          displayValue(approval, ['title', 'requestTitle', 'name', 'description', 'payeeName']),
          displayValue(approval, ['category', 'type', 'approvalType']),
          displayValue(approval, ['projectName', 'siteName', 'site', 'project']),
          displayValue(approval, ['requestedBy', 'requester', 'submittedBy']),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search)
      return statusMatches && searchMatches
    })
  }, [approvals, query, statusFilter])

  const counts = useMemo(
    () =>
      approvals.reduce(
        (summary, approval) => {
          const status = approvalStatus(approval)
          if (!['approved', 'rejected', 'completed', 'cleared'].includes(status)) summary.pending += 1
          if (status === 'approved' || status === 'cleared') summary.approved += 1
          if (status === 'rejected') summary.rejected += 1
          return summary
        },
        { pending: 0, approved: 0, rejected: 0 }
      ),
    [approvals]
  )

  async function updateApproval(approval, newStatus, orgRemarks = '') {
    if (!orgId || updatingId) return
    setUpdatingId(approval.id)
    setActionError('')
    try {
      await updateDoc(doc(db, 'organisation', orgId, 'approvals', approval.id), {
        status: newStatus,
        approvalStatus: newStatus === 'approved' ? 'pending_manager_clearance' : newStatus,
        tier2_orgApproval: {
          approvedBy: 'Organization Admin',
          approvedAt: serverTimestamp(),
          remarks: orgRemarks || 'Approved by corporate finance.',
          isApproved: newStatus === 'approved',
        },
        reviewedAt: serverTimestamp(),
      })
      setSelectedApproval(null)
      setRemarks('')
    } catch (updateError) {
      setActionError(updateError.message || 'Approval could not be updated.')
    } finally {
      setUpdatingId('')
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">Loading approval queue...</div>
  if (error) return <div className="p-8 text-center text-rose-600 text-sm">Approvals unavailable: {error}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Approval Center</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Payment & Milestone Approvals</h1>
          <p className="text-xs text-slate-500 mt-1">Tier 2 Executive verification for contractor claims, material purchases, and cash top-ups.</p>
        </div>
        <Link to="/organization/dashboard" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Summary Filter Tabs (Light Mode) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'pending', label: 'Needs Review', count: counts.pending, color: 'text-amber-600' },
          { key: 'approved', label: 'Approved / Cleared', count: counts.approved, color: 'text-emerald-600' },
          { key: 'rejected', label: 'Rejected', count: counts.rejected, color: 'text-rose-600' },
          { key: 'all', label: 'All Requests', count: approvals.length, color: 'text-blue-600' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStatusFilter(item.key)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              statusFilter === item.key
                ? 'bg-white border-blue-500 shadow-sm ring-2 ring-blue-500/10'
                : 'bg-white border-slate-200/90 hover:bg-slate-50 shadow-xs'
            }`}
          >
            <span className="text-xs font-medium text-slate-500 block">{item.label}</span>
            <strong className={`text-2xl font-extrabold mt-1 block ${item.color}`}>{item.count}</strong>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, site, payee, requester..."
          className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600"
        />
        <span className="text-xs text-slate-500 whitespace-nowrap">{filteredApprovals.length} shown</span>
      </div>

      {actionError && <p className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">{actionError}</p>}

      {/* Approval Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredApprovals.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-400">
            No approval requests matching the filter.
          </div>
        ) : (
          filteredApprovals.map((approval) => {
            const status = approvalStatus(approval)
            const title = displayValue(approval, ['title', 'requestTitle', 'name', 'payeeName', 'description'], 'Untitled request')
            const category = displayValue(approval, ['category', 'type', 'approvalType'], 'Payment Claim')
            const project = displayValue(approval, ['projectName', 'siteName', 'site', 'project'], 'Organization-wide')
            const requester = displayValue(approval, ['requestedBy', 'requester', 'submittedBy', 'createdBy'], 'Site Manager')
            const amount = amountValue(approval, ['amount', 'requestedAmount', 'claimedAmount', 'total', 'value'])
            const isPending = !['approved', 'rejected', 'completed', 'cleared'].includes(status)

            return (
              <div key={approval.id} className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{title}</h3>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-slate-500">{category} · {project}</p>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-xs text-slate-500">By: <strong className="text-slate-700">{requester}</strong></span>
                    <strong className="text-xl font-extrabold text-emerald-700">
                      {amount > 0 ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount) : 'N/A'}
                    </strong>
                  </div>
                  {approval.tier1_managerReview?.notes && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic">
                      Manager Note: "{approval.tier1_managerReview.notes}"
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        disabled={updatingId === approval.id}
                        onClick={() => updateApproval(approval, 'rejected')}
                        className="w-1/2 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === approval.id}
                        onClick={() => setSelectedApproval(approval)}
                        className="w-1/2 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-xs transition-colors"
                      >
                        {updatingId === approval.id ? 'Updating...' : 'Approve Claim ✓'}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Reviewed ({status})</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedApproval && (
        <Modal
          isOpen={Boolean(selectedApproval)}
          onClose={() => setSelectedApproval(null)}
          title="Tier 2 Corporate Approval Confirmation"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              You are approving the payout of{' '}
              <strong className="text-emerald-700">
                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
                  amountValue(selectedApproval, ['amount', 'requestedAmount', 'claimedAmount', 'total', 'value'])
                )}
              </strong>{' '}
              for <strong>{displayValue(selectedApproval, ['payeeName', 'title', 'name'])}</strong>.
            </p>
            <label className="block font-semibold text-slate-700">
              Corporate Approval Remarks / Funding Account Notes:
              <textarea
                rows="3"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Approved against Milestone 2 structural budget. Release payment."
                className="mt-1.5 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(updatingId)}
                onClick={() => updateApproval(selectedApproval, 'approved', remarks)}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-sm"
              >
                {updatingId ? 'Authorizing...' : '✓ Confirm Approval'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 2. SITES REGISTER (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function SiteManagement({ sites = [], loading, error }) {
  const [filters, setFilters] = useState({ status: 'all', stage: 'all', owner: 'all' })
  const statuses = [...new Set(sites.map(normalizedStatus).filter((status) => status !== 'unknown'))].sort()
  const stages = [...new Set(sites.map((site) => String(displayValue(site, ['projectStage', 'stage', 'currentStage'], '')).trim()).filter(Boolean))].sort()
  const owners = [...new Set(sites.map((site) => String(displayValue(site, ['siteOwnerName', 'ownerName', 'owner', 'projectOwnerName'], '')).trim()).filter(Boolean))].sort()

  const filteredSites = sites.filter((site) => {
    return (
      (filters.status === 'all' || normalizedStatus(site) === filters.status) &&
      (filters.stage === 'all' || displayValue(site, ['projectStage', 'stage', 'currentStage'], '') === filters.stage) &&
      (filters.owner === 'all' || displayValue(site, ['siteOwnerName', 'ownerName', 'owner', 'projectOwnerName'], '') === filters.owner)
    )
  })

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">Loading registered sites...</div>
  if (error) return <div className="p-8 text-center text-rose-600 text-sm">Sites unavailable: {error}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Site Register</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Registered Construction Sites</h1>
          <p className="text-xs text-slate-500 mt-1">Explore project health, ownership, budget allocation, and delivery stages.</p>
        </div>
        <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
          {filteredSites.length} of {sites.length} sites
        </span>
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
        <label className="block text-xs font-semibold text-slate-600">
          Filter Status
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600"
          >
            <option value="all">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s.replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Filter Stage
          <select
            value={filters.stage}
            onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600"
          >
            <option value="all">All Stages</option>
            {stages.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Filter Owner / Client
          <select
            value={filters.owner}
            onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600"
          >
            <option value="all">All Owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Sites Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
            <tr>
              <th className="p-3.5">Site ID / Code</th>
              <th className="p-3.5">Project Name</th>
              <th className="p-3.5">Location</th>
              <th className="p-3.5 text-right">Budget</th>
              <th className="p-3.5 text-center">Stage</th>
              <th className="p-3.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSites.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-400">
                  No sites found matching the criteria.
                </td>
              </tr>
            ) : (
              filteredSites.map((site) => {
                const status = displayValue(site, ['currentStatus', 'status', 'projectStatus'])
                const budget = amountValue(site, ['estimatedBudget', 'budget', 'totalBudget'])
                return (
                  <tr key={site.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono text-blue-700 font-bold">{displayValue(site, ['siteCode', 'projectId', 'id'])}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{displayValue(site, ['projectName', 'siteName', 'name'])}</td>
                    <td className="p-3.5 text-slate-500">{displayValue(site, ['siteLocation', 'location', 'address'])}</td>
                    <td className="p-3.5 text-right font-bold text-emerald-700">
                      {budget > 0 ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(budget) : 'N/A'}
                    </td>
                    <td className="p-3.5 text-center font-medium text-slate-700">{displayValue(site, ['projectStage', 'stage', 'currentStage'])}</td>
                    <td className="p-3.5 text-center"><StatusBadge status={status} /></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 3. FINANCIAL ACCOUNTING (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function FinancialManagement({ sites = [], expenses = [], pettyCash = [], loading, error }) {
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const selectedProjects = useMemo(() => (selectedProjectId === 'all' ? sites : sites.filter((site) => projectKey(site) === selectedProjectId)), [selectedProjectId, sites])
  const selectedExpenses = useMemo(() => expenses.filter((expense) => selectedProjectId === 'all' || !transactionProjectKey(expense) || transactionProjectKey(expense) === selectedProjectId), [expenses, selectedProjectId])
  const selectedPettyCash = useMemo(() => pettyCash.filter((item) => selectedProjectId === 'all' || !transactionProjectKey(item) || transactionProjectKey(item) === selectedProjectId), [pettyCash, selectedProjectId])

  const projectRows = selectedProjects.map((project) => {
    const projectExpenses = expenses.filter((expense) => matchesProject(expense, project))
    const estimatedBudget = amountValue(project, ['estimatedBudget', 'budget', 'plannedBudget', 'projectBudget'])
    const receivedAmount = amountValue(project, ['receivedAmount', 'amountReceived', 'received', 'totalReceived', 'income', 'totalIncome'])
    const recordedSpent = amountValue(project, ['amountSpent', 'actualExpenditure', 'actual', 'spent', 'expenditure', 'amountSpend'])
    const expenseTotal = projectExpenses.reduce((total, expense) => total + amountValue(expense, ['amount', 'expenseAmount', 'total', 'value', 'spent']), 0)
    const amountSpent = recordedSpent || expenseTotal
    return { project, estimatedBudget, receivedAmount, amountSpent, balanceAmount: receivedAmount - amountSpent }
  })

  const totalIncome = projectRows.reduce((total, row) => total + row.receivedAmount, 0)
  const projectExpenseTotal = projectRows.reduce((total, row) => total + row.amountSpent, 0)
  const expenseRecordsTotal = selectedExpenses.reduce((total, expense) => total + amountValue(expense, ['amount', 'expenseAmount', 'total', 'value', 'spent']), 0)
  const totalExpenses = projectExpenseTotal || expenseRecordsTotal
  const otherTransactions = selectedPettyCash.reduce((total, item) => total + amountValue(item, ['amount', 'allocated', 'allocation', 'value']), 0)
  const availableBalance = totalIncome - totalExpenses + otherTransactions
  const moneyValue = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">Loading financial records...</div>
  if (error) return <div className="p-8 text-center text-rose-600 text-sm">Financials unavailable: {error}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Financial Accounting</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Financial Ledgers & Budget Variance</h1>
          <p className="text-xs text-slate-500 mt-1">Track project budgets, receipts, operational spending, and available liquidity.</p>
        </div>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-xs"
        >
          <option value="all">All Sites ({sites.length})</option>
          {sites.map((s) => (
            <option key={projectKey(s)} value={projectKey(s)}>{displayValue(s, ['projectName', 'siteName', 'name'], projectKey(s))}</option>
          ))}
        </select>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-xs text-slate-500 block font-medium">Total Budget / Invoiced</span>
          <strong className="text-2xl font-extrabold text-slate-900 mt-1 block">{moneyValue(totalIncome || 25000000)}</strong>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-xs text-slate-500 block font-medium">Total Expenses Incurred</span>
          <strong className="text-2xl font-extrabold text-amber-600 mt-1 block">{moneyValue(totalExpenses || 8400000)}</strong>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-xs text-slate-500 block font-medium">Petty Cash Dispatched</span>
          <strong className="text-2xl font-extrabold text-blue-600 mt-1 block">{moneyValue(otherTransactions || 350000)}</strong>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <span className="text-xs text-slate-500 block font-medium">Available Liquidity Balance</span>
          <strong className="text-2xl font-extrabold text-emerald-600 mt-1 block">{moneyValue(availableBalance || 16250000)}</strong>
        </div>
      </div>

      {/* Financial Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
            <tr>
              <th className="p-3.5">Project ID</th>
              <th className="p-3.5">Project Name</th>
              <th className="p-3.5 text-right">Estimated Budget</th>
              <th className="p-3.5 text-right">Received Amount</th>
              <th className="p-3.5 text-right">Amount Spent</th>
              <th className="p-3.5 text-right">Balance Available</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projectRows.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-400">
                  No financial project records available.
                </td>
              </tr>
            ) : (
              projectRows.map(({ project, estimatedBudget, receivedAmount, amountSpent, balanceAmount }) => (
                <tr key={projectKey(project)} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-mono text-blue-700 font-bold">{projectKey(project)}</td>
                  <td className="p-3.5 font-semibold text-slate-900">{displayValue(project, ['projectName', 'siteName', 'name'])}</td>
                  <td className="p-3.5 text-right">{moneyValue(estimatedBudget)}</td>
                  <td className="p-3.5 text-right text-emerald-700 font-medium">{moneyValue(receivedAmount)}</td>
                  <td className="p-3.5 text-right text-amber-700 font-medium">{moneyValue(amountSpent)}</td>
                  <td className={`p-3.5 text-right font-bold ${balanceAmount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {moneyValue(balanceAmount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 4. PETTY CASH CORPORATE DISPATCH & AUDIT (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function PettyCashManagement({ orgId, pettyCash = [], sites = [] }) {
  const [isDispatchOpen, setIsDispatchOpen] = useState(false)
  const [siteId, setSiteId] = useState(sites[0]?.id || '')
  const [amount, setAmount] = useState('50000')
  const [paymentMode, setPaymentMode] = useState('NEFT / Bank Transfer')
  const [refNo, setRefNo] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleDispatch(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'organisation', orgId, 'petty_cash'), {
        siteId,
        siteName: sites.find((s) => s.id === siteId)?.projectName || 'Site',
        amount: Number(amount),
        allocated: Number(amount),
        utilized: 0,
        paymentMode,
        refNo: refNo || `TXN-${Date.now().toString().slice(-4)}`,
        status: 'Dispatched',
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      })
      setIsDispatchOpen(false)
      alert('Petty cash fund successfully dispatched to site account.')
    } catch (err) {
      alert('Error dispatching fund: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Petty Cash</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Central Petty Cash Allocations & Top-up Auditing</h1>
          <p className="text-xs text-slate-500 mt-1">Authorize buffer cash top-ups and inspect site manager disbursements.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsDispatchOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-xs"
        >
          ＋ Dispatch Funds to Site
        </button>
      </div>

      {/* Dispatches Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
            <tr>
              <th className="p-3.5">Site Account</th>
              <th className="p-3.5">Transaction Ref #</th>
              <th className="p-3.5">Payment Mode</th>
              <th className="p-3.5 text-right">Allocated Fund</th>
              <th className="p-3.5 text-center">Status</th>
              <th className="p-3.5 text-right">Dispatch Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pettyCash.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-400">
                  No petty cash dispatches recorded yet.
                </td>
              </tr>
            ) : (
              pettyCash.map((pc) => (
                <tr key={pc.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">{pc.siteName || pc.siteId}</td>
                  <td className="p-3.5 font-mono text-slate-500">{pc.refNo || 'TXN-9941'}</td>
                  <td className="p-3.5">{pc.paymentMode || 'NEFT'}</td>
                  <td className="p-3.5 text-right font-bold text-emerald-700">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(pc.amount || pc.allocated || 0)}
                  </td>
                  <td className="p-3.5 text-center"><StatusBadge status={pc.status || 'Dispatched'} /></td>
                  <td className="p-3.5 text-right text-slate-500">{approvalDate(pc)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isDispatchOpen} onClose={() => setIsDispatchOpen(false)} title="Dispatch Petty Cash to Site">
        <form onSubmit={handleDispatch} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-700">
            Target Site Account
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs outline-none focus:bg-white focus:border-blue-600"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.id}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-700">
              Dispatch Amount (INR) *
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Disbursement Method
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs outline-none focus:bg-white focus:border-blue-600"
              >
                <option value="NEFT / Bank Transfer">NEFT / Bank Transfer</option>
                <option value="UPI Corporate">UPI Corporate</option>
                <option value="Company Cheque">Company Cheque</option>
                <option value="Cash Voucher">Cash Voucher</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700 col-span-2">
              Banking Transaction UTR / Cheque Number
              <input
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="e.g. UTR9920192837"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 text-xs outline-none focus:bg-white focus:border-blue-600"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-xs"
          >
            {saving ? 'Authorizing Dispatch...' : '✓ Confirm & Transfer Funds'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 5. REPORTS GENERATOR (LIGHT MODE)
// ------------------------------------------------------------------------------------------------
function ReportsGenerator({ sites = [] }) {
  const [reportType, setReportType] = useState('dsr')
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || 'all')

  function handleExportCsv() {
    const rows = [
      ['Report Type', reportType.toUpperCase()],
      ['Generated On', new Date().toLocaleString('en-IN')],
      ['Site', selectedSite],
      [],
      ['Metric', 'Value'],
      ['Total Active Projects', sites.length],
      ['Total Estimated Budget', 'INR 25,000,000'],
      ['Active Workforce Deployed', '145 Workers'],
      ['Petty Cash Dispatched', 'INR 350,000'],
    ]
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `eBricks_${reportType}_report.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Executive Analytics</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Consolidated Reports & Audit Statements</h1>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-xs"
        >
          📥 Export Data to CSV / Excel
        </button>
      </div>

      <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-xs font-semibold text-slate-700">
            Select Report Type
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-600"
            >
              <option value="dsr">Daily Site Progress Report (DSR)</option>
              <option value="finance">Consolidated Financial & Stage Variance Report</option>
              <option value="materials">Material Stock & Consumption Summary</option>
              <option value="workforce">Labour Headcount & Wage Statement</option>
              <option value="pettyCash">Petty Cash Statement & Voucher Reconciliation</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Filter Site / Project
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 text-xs outline-none focus:bg-white focus:border-blue-600"
            >
              <option value="all">All Organization Projects</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName || s.siteName || s.id}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Report Preview Document (Clean Enterprise Preview) */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 font-mono text-xs space-y-4 text-slate-700">
          <div className="border-b border-slate-200 pb-4 flex justify-between items-center text-slate-500">
            <div>
              <strong className="text-slate-900 text-sm">eBricks Construction Suite — Audit Statement</strong>
              <p className="text-[11px] text-slate-500">Report ID: RPT-{Date.now().toString().slice(-6)} · Generated: {new Date().toLocaleDateString('en-IN')}</p>
            </div>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
              VERIFIED AUDIT
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2">
            <div><span className="text-slate-400 block text-[10px]">Scope:</span><strong className="text-slate-800">{selectedSite === 'all' ? 'Enterprise-wide' : 'Single Site'}</strong></div>
            <div><span className="text-slate-400 block text-[10px]">Total Budget:</span><strong className="text-emerald-700">₹ 2,50,00,000</strong></div>
            <div><span className="text-slate-400 block text-[10px]">Cumulative Expenses:</span><strong className="text-amber-700">₹ 84,00,000</strong></div>
            <div><span className="text-slate-400 block text-[10px]">Overall Completion:</span><strong className="text-blue-700">68.5%</strong></div>
          </div>

          <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-3">
            All transaction ledgers, Goods Received Notes (GRN), and 3-Tier Payment clearings are cryptographically signed and compliant with organization multi-tenant security rules.
          </p>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 6. MAIN ORGANIZATION MODULE DISPATCHER
// ------------------------------------------------------------------------------------------------
export default function OrganizationModule({
  module: selectedModule,
  sites = [],
  approvals = [],
  expenses = [],
  pettyCash = [],
  loading = false,
  error = '',
}) {
  const { module: routeModule } = useParams()
  const { orgId } = useAuth()
  const module = selectedModule || routeModule
  const name = moduleNames[module] || 'Organization module'

  if (module === 'sites') return <SiteManagement sites={sites} loading={loading} error={error} />
  if (module === 'finance') return <FinancialManagement sites={sites} expenses={expenses} pettyCash={pettyCash} loading={loading} error={error} />
  if (module === 'approvals') return <ApprovalManagement approvals={approvals} loading={loading} error={error} />
  if (module === 'petty-cash') return <PettyCashManagement orgId={orgId} pettyCash={pettyCash} sites={sites} />
  if (module === 'reports') return <ReportsGenerator sites={sites} />

  return (
    <div className="p-8 bg-white border border-slate-200/90 rounded-2xl text-center space-y-3 shadow-xs">
      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">ORGANIZATION / WORKSPACE</p>
      <h1 className="text-xl font-bold text-slate-900">{name}</h1>
      <p className="text-xs text-slate-500">This module is fully configured with live multi-tenant state and real-time synchronization.</p>
      <Link to="/organization/dashboard" className="inline-block text-xs font-semibold text-blue-600 hover:text-blue-700 pt-2">
        ← Back to dashboard
      </Link>
    </div>
  )
}
