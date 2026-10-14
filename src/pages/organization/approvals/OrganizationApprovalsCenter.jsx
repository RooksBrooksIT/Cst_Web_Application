import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import {
  executeOrganizationApproval,
  executeOrganizationRejection,
} from '../../../services/approvalService'
import { orgAuthorizeRequest } from '../../../services/pettyCashService'
import ApprovalWorkflowStepper from '../../../components/common/ApprovalWorkflowStepper'
import CreateRequisitionModal from '../../../components/common/CreateRequisitionModal'
import { getNormalizedSiteOptions } from '../../../utils/siteUtils.js'
import { getMaterialItemDisplay, getRequestedQtyDisplay } from '../../../utils/materialUtils.js'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Check,
  X,
  AlertTriangle,
  Plus,
  Award,
  MapPin,
  UserCheck,
  Calendar,
  ArrowRight,
  Building2,
  Filter,
  Search,
  FileText,
  ShieldCheck,
  CheckCheck,
  Inbox,
  RotateCcw,
} from 'lucide-react'

function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw)
  return Number.isNaN(d.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export default function OrganizationApprovalsCenter({
  sites = [],
  siteMaterialsRequest = [],
  siteToolsRequest = [],
  siteSupervisorProjectStageSchedule = [],

  pettyCashRequests = [],
  siteSupervisorEntries = [],
  vehicleMovements = [],
}) {
  const { orgId, user, userData } = useAuth()
  const currentUserActor = {
    uid: user?.uid || 'org_admin',
    displayName: userData?.fullName || userData?.FullName || userData?.name || user?.displayName || 'Organization Admin',
  }

  // Active Stream Tab: 'ALL' | 'AUTHORIZED_FORWARDED' | 'MATERIALS' | 'TOOLS' | 'PETTY_CASH' | 'STAGES' | 'VEHICLES' | 'DECLINED' | 'AUDIT_TRAIL'
  const [activeTab, setActiveTab] = useState('ALL')
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')
  const [logCategoryFilter, setLogCategoryFilter] = useState('all')
  const [logStatusFilter, setLogStatusFilter] = useState('all')

  const [feedback, setFeedback] = useState({ type: '', text: '' })
  const [actionLoading, setActionLoading] = useState(false)

  // Action Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false)
  const [approveRemarks, setApproveRemarks] = useState('')

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  function showMsg(type, text) {
    setFeedback({ type, text })
    setTimeout(() => setFeedback({ type: '', text: '' }), 5000)
  }

  // Map Site IDs to Names
  const siteMap = useMemo(() => {
    const map = {}
    sites.forEach((s) => {
      map[s.id] = s.name || s.projectName || s.siteName || s.id
      if (s.siteId) map[s.siteId] = s.name || s.projectName || s.siteName
    })
    return map
  }, [sites])

  // Normalized deduplicated sites for safe dropdown rendering
  const normalizedSites = useMemo(() => getNormalizedSiteOptions(sites), [sites])

  // Aggregate all items with target stream flag
  const allRequisitions = useMemo(() => {
    const items = []
    const seenKeys = new Set()

    const pushItem = (rawItem, stream, collectionName, defaultProps) => {
      if (!rawItem) return
      const rawId = rawItem.id || rawItem.requestId || rawItem.voucherNo || rawItem.entryId || `${stream}_${items.length}`
      const uniqueKey = `${collectionName}_${rawId}`
      if (seenKeys.has(uniqueKey)) return
      seenKeys.add(uniqueKey)

      items.push({
        ...rawItem,
        id: rawItem.id || rawId,
        uniqueKey,
        stream,
        collectionName,
        ...defaultProps,
      })
    }

    // 1. Material Requests
    siteMaterialsRequest.forEach((m) => {
      pushItem(m, 'MATERIALS', 'siteMaterialsRequest', {
        title: `Material Request: ${getMaterialItemDisplay(m)}`,
        subTitle: `${getRequestedQtyDisplay(m)}`,
        siteName: m.siteName || siteMap[m.siteId] || 'Site Location',
        requester: m.supervisorName || m.createdBy || 'Supervisor',
        verifier: m.managerReviewedBy || m.managerName || 'Manager',
        category: 'Material Request',
      })
    })

    // 2. Tool Requests
    siteToolsRequest.forEach((t) => {
      pushItem(t, 'TOOLS', 'siteToolsRequest', {
        title: `Tool Request: ${t.toolName || t.name || 'Machinery'}`,
        subTitle: `Asset Code: ${t.toolCode || t.serialNo || 'YARD_ALLOC'}`,
        siteName: t.siteName || siteMap[t.siteId] || 'Site Location',
        requester: t.supervisorName || t.createdBy || 'Supervisor',
        verifier: t.approvedByManager || t.managerName || 'Manager',
        category: 'Tool & Equipment',
      })
    })

    // 3. Stage Schedules
    siteSupervisorProjectStageSchedule.forEach((st) => {
      pushItem(st, 'STAGES', 'siteSupervisorProjectStageSchedule', {
        title: `Stage Milestone: ${st.stageName || st.stage || 'Milestone'}`,
        subTitle: `Target Completion: ${st.targetDate || 'N/A'}`,
        siteName: st.siteName || siteMap[st.siteId] || 'Site Location',
        requester: st.supervisorName || st.createdBy || 'Supervisor',
        verifier: st.approvedByManager || st.managerName || 'Manager',
        category: 'Stage Schedule',
      })
    })

    // 4. Petty Cash & Daily Expense Claims
    pettyCashRequests.forEach((pc) => {
      const claimAmount = Number(
        pc.requestedAmount || pc.amount || pc.approvedAmount || pc.totalAmount || pc.amountRequested || 0
      )
      pushItem(pc, 'PETTY_CASH', 'pettyCashRequests', {
        title: `Petty Cash Request: ${money(claimAmount)}`,
        subTitle: pc.category || pc.expenseCategory || pc.description || pc.remarks || pc.reason || 'Site Operations',
        siteName: pc.siteName || siteMap[pc.siteId] || 'Site Location',
        requester: pc.supervisorName || pc.requestedBy || 'Supervisor',
        verifier: pc.managerReviewedBy || pc.managerReviewerName || pc.managerName || 'Manager',
        category: 'Petty Cash Request',
      })
    })

    siteSupervisorEntries.forEach((pc) => {
      const isDailyExpense = Boolean(pc.voucherNo || pc.entryId)
      const claimAmount = Number(
        pc.requestedAmount || pc.amount || pc.approvedAmount || pc.totalAmount || pc.amountRequested || 0
      )
      pushItem(pc, 'PETTY_CASH', 'siteSupervisorEntries', {
        title: isDailyExpense
          ? `Expense Claim: ${money(claimAmount)}`
          : `Daily Log Claim: ${money(claimAmount)}`,
        subTitle: pc.category || pc.expenseCategory || pc.description || pc.remarks || pc.reason || 'Site Operations',
        siteName: pc.siteName || siteMap[pc.siteId] || 'Site Location',
        requester: pc.supervisorName || pc.requestedBy || 'Supervisor',
        verifier: pc.managerReviewedBy || pc.managerReviewerName || pc.managerName || 'Manager',
        category: isDailyExpense ? 'Daily Expense Claim' : 'Daily Supervisor Log',
      })
    })

    // 5. Vehicle Movements
    vehicleMovements.forEach((v) => {
      pushItem(v, 'VEHICLES', 'vehicleMovements', {
        title: `Vehicle Request: ${v.vehicleNumber || v.modelName || 'Fleet'}`,
        subTitle: `Purpose: ${v.purpose || 'Transport'}`,
        siteName: v.siteName || siteMap[v.siteId] || 'Site Location',
        requester: v.supervisorName || v.createdBy || 'Supervisor',
        verifier: v.managerName || 'Manager',
        category: 'Vehicle Movement',
      })
    })

    return items
  }, [
    siteMaterialsRequest,
    siteToolsRequest,
    siteSupervisorProjectStageSchedule,
    pettyCashRequests,
    siteSupervisorEntries,
    vehicleMovements,
    siteMap,
  ])

  // Filter items awaiting Organization HQ approval (Stage 3)
  const pendingOrgApprovals = useMemo(() => {
    return allRequisitions.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      return (
        ['pending_org_approval', 'pending_organization_approval', 'manager_verified'].includes(st) ||
        item.currentStep === 2
      )
    })
  }, [allRequisitions])

  // Filter items authorized and forwarded by Organization HQ (Stage 3 -> Stage 4)
  const authorizedForwardedItems = useMemo(() => {
    return allRequisitions.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      if (item.orgApproved === true) return true
      if (['pending_manager_clearance', 'awaiting_disbursement'].includes(st)) return true
      if (['approved', 'cleared', 'disbursed', 'received'].includes(st) && (item.currentStep >= 3 || item.orgApprovedAt || item.orgApprovedBy)) return true
      if (Array.isArray(item.approvalHistory) && item.approvalHistory.some((h) =>
        (String(h.step).includes('3') || String(h.actorRole).toLowerCase() === 'organization') &&
        !String(h.action).toLowerCase().includes('reject') &&
        !String(h.action).toLowerCase().includes('decline')
      )) {
        return true
      }
      return false
    })
  }, [allRequisitions])

  // Filter items declined by Organization HQ
  const declinedItems = useMemo(() => {
    return allRequisitions.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      if (['rejected_by_org', 'rejected_by_organization'].includes(st)) return true
      if (item.orgApproved === false && (item.rejectedBy || item.rejectionReason || item.orgRejectedBy)) return true
      if (Array.isArray(item.approvalHistory) && item.approvalHistory.some((h) =>
        (String(h.step).includes('3') || String(h.actorRole).toLowerCase() === 'organization') &&
        (String(h.action).toLowerCase().includes('reject') || String(h.action).toLowerCase().includes('decline'))
      )) {
        return true
      }
      return false
    })
  }, [allRequisitions])

  // Filter completed / audit history
  const auditTrailItems = useMemo(() => {
    return allRequisitions.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      return ['pending_manager_clearance', 'awaiting_disbursement', 'approved', 'cleared', 'rejected_by_org', 'rejected_by_organization', 'received'].includes(st) ||
        item.orgApproved === true ||
        (Array.isArray(item.approvalHistory) && item.approvalHistory.length > 1)
    })
  }, [allRequisitions])

  // Filter by Active Tab, Category, Status, Site & Search
  const filteredList = useMemo(() => {
    let source = pendingOrgApprovals
    if (activeTab === 'AUTHORIZED_FORWARDED') {
      source = authorizedForwardedItems
    } else if (activeTab === 'DECLINED') {
      source = declinedItems
    } else if (activeTab === 'AUDIT_TRAIL') {
      source = auditTrailItems
    } else if (activeTab === 'ALL') {
      source = pendingOrgApprovals
    } else {
      source = pendingOrgApprovals.filter((item) => item.stream === activeTab)
    }

    return source.filter((item) => {
      // Site filter
      const matchesSite = siteFilter === 'all' || item.siteId === siteFilter

      // Category filter (active on Authorized & Forwarded tab)
      const matchesCategory =
        activeTab !== 'AUTHORIZED_FORWARDED' ||
        logCategoryFilter === 'all' ||
        item.stream === logCategoryFilter

      // Status filter (active on Authorized & Forwarded tab)
      let matchesStatus = true
      if (activeTab === 'AUTHORIZED_FORWARDED' && logStatusFilter !== 'all') {
        const st = String(item.status || item.approvalStatus || '').toLowerCase()
        if (logStatusFilter === 'forwarded') {
          matchesStatus = ['pending_manager_clearance', 'awaiting_disbursement'].includes(st)
        } else if (logStatusFilter === 'cleared') {
          matchesStatus = ['approved', 'cleared', 'disbursed'].includes(st)
        } else if (logStatusFilter === 'received') {
          matchesStatus = st === 'received'
        }
      }

      // Search filter
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        item.title?.toLowerCase().includes(q) ||
        item.subTitle?.toLowerCase().includes(q) ||
        item.siteName?.toLowerCase().includes(q) ||
        item.requester?.toLowerCase().includes(q) ||
        item.verifier?.toLowerCase().includes(q) ||
        item.id?.toLowerCase().includes(q) ||
        item.orgApprovedBy?.toLowerCase().includes(q) ||
        item.orgApprovalRemarks?.toLowerCase().includes(q) ||
        item.rejectionReason?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)

      return matchesSite && matchesCategory && matchesStatus && matchesSearch
    })
  }, [
    activeTab,
    pendingOrgApprovals,
    authorizedForwardedItems,
    declinedItems,
    auditTrailItems,
    siteFilter,
    logCategoryFilter,
    logStatusFilter,
    search,
  ])

  // Handle HQ Authorization (Approve)
  const handleAuthorize = async () => {
    if (!selectedItem) return
    setActionLoading(true)
    try {
      if (selectedItem.collectionName === 'pettyCashRequests') {
        const approvedAmt = selectedItem.approvedAmount || selectedItem.requestedAmount || selectedItem.amount || 0
        await orgAuthorizeRequest(
          orgId,
          selectedItem.id || selectedItem.requestId,
          'authorize',
          approvedAmt,
          approveRemarks,
          currentUserActor
        )
      } else {
        await executeOrganizationApproval(
          orgId,
          selectedItem.collectionName,
          selectedItem.id,
          currentUserActor,
          approveRemarks
        )
      }
      showMsg('success', `Request #${selectedItem.id} authorized by HQ and sent for Manager final clearance.`)
      setIsApproveModalOpen(false)
      setIsDetailModalOpen(false)
      setApproveRemarks('')
    } catch (err) {
      console.error(err)
      showMsg('error', err.message || 'Failed to authorize request')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle HQ Rejection (Decline)
  const handleDecline = async () => {
    if (!selectedItem) return
    if (!rejectReason.trim()) {
      showMsg('error', 'Please enter a rejection reason')
      return
    }

    setActionLoading(true)
    try {
      if (selectedItem.collectionName === 'pettyCashRequests') {
        await orgAuthorizeRequest(
          orgId,
          selectedItem.id || selectedItem.requestId,
          'reject',
          0,
          rejectReason,
          currentUserActor
        )
      } else {
        await executeOrganizationRejection(
          orgId,
          selectedItem.collectionName,
          selectedItem.id,
          currentUserActor,
          rejectReason
        )
      }
      showMsg('success', `Request #${selectedItem.id} declined by HQ. Notification sent.`)
      setIsRejectModalOpen(false)
      setIsDetailModalOpen(false)
      setRejectReason('')
    } catch (err) {
      console.error(err)
      showMsg('error', err.message || 'Failed to decline request')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 text-blue-800">
              Stage 3 HQ Governance
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Organization Approvals Center</h1>
          <p className="text-xs text-slate-500">
            Tier 2 Organization HQ financial and administrative authorization for site requests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/organization/incentive-calculation"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B3470] hover:bg-blue-900 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Award className="w-4 h-4 text-blue-200" />
            <span>Incentive Calculation</span>
          </Link>

          <ExportButton
            filename="org_approvals_master.csv"
            data={filteredList.map((i) => ({
              RequestID: i.id,
              Category: i.category,
              Title: i.title,
              SiteName: i.siteName,
              Supervisor: i.requester,
              ManagerVerifiedBy: i.verifier,
              Status: i.status || i.approvalStatus,
              CreatedAt: formatDate(i.createdAt),
            }))}
          />
        </div>
      </div>

      {/* Feedback Alert Banner */}
      {feedback.text && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`p-4 rounded-2xl bg-white border shadow-xs flex items-center justify-between text-left transition-all cursor-pointer ${
            activeTab === 'ALL' ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Awaiting HQ Authorization</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{pendingOrgApprovals.length}</h3>
            <span className="text-[10px] text-amber-700 font-medium">Stage 3 Action Required</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('AUTHORIZED_FORWARDED')}
          className={`p-4 rounded-2xl bg-white border shadow-xs flex items-center justify-between text-left transition-all cursor-pointer ${
            activeTab === 'AUTHORIZED_FORWARDED' ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Authorized & Forwarded</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{authorizedForwardedItems.length}</h3>
            <span className="text-[10px] text-emerald-700 font-medium">Forwarded to Operations Managers</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DECLINED')}
          className={`p-4 rounded-2xl bg-white border shadow-xs flex items-center justify-between text-left transition-all cursor-pointer ${
            activeTab === 'DECLINED' ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/20' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Declined by HQ</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">{declinedItems.length}</h3>
            <span className="text-[10px] text-rose-700 font-medium">Rejected with Stated Reasons</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* Filter Bar & Tabs */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto w-full scrollbar-none pb-1">
          {[
            { id: 'ALL', label: `Pending HQ Action (${pendingOrgApprovals.length})` },
            { id: 'AUTHORIZED_FORWARDED', label: `Authorized & Forwarded (${authorizedForwardedItems.length})` },
            { id: 'MATERIALS', label: 'Material Requests' },
            { id: 'TOOLS', label: 'Tools & Machinery' },
            { id: 'PETTY_CASH', label: 'Petty Cash / Payments' },
            { id: 'STAGES', label: 'Stage Schedules' },
            { id: 'VEHICLES', label: 'Vehicle Movements' },
            { id: 'DECLINED', label: `Declined by HQ (${declinedItems.length})` },
            { id: 'AUDIT_TRAIL', label: `All History (${auditTrailItems.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sub-Filters & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'AUTHORIZED_FORWARDED' && (
              <>
                <select
                  value={logCategoryFilter}
                  onChange={(e) => setLogCategoryFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-600 font-medium"
                >
                  <option value="all">All Request Types</option>
                  <option value="MATERIALS">Material Requests</option>
                  <option value="TOOLS">Tools & Machinery</option>
                  <option value="PETTY_CASH">Petty Cash / Payments</option>
                  <option value="STAGES">Stage Schedules</option>
                  <option value="VEHICLES">Vehicle Movements</option>
                </select>

                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-600 font-medium"
                >
                  <option value="all">All Lifecycle Statuses</option>
                  <option value="forwarded">Forwarded (Awaiting Manager Clearance)</option>
                  <option value="cleared">Manager Cleared / Released</option>
                  <option value="received">Delivered / Received at Site</option>
                </select>
              </>
            )}

            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-600 font-medium"
            >
              <option value="all">All Construction Sites</option>
              {normalizedSites.map((s, idx) => (
                <option key={`appr-site-${s.id || s.siteId || idx}-${idx}`} value={s.id || s.siteId}>
                  {s.label || s.siteName || s.projectName || s.name || s.id}
                </option>
              ))}
            </select>

            {(siteFilter !== 'all' || logCategoryFilter !== 'all' || logStatusFilter !== 'all' || search) && (
              <button
                type="button"
                onClick={() => {
                  setSiteFilter('all')
                  setLogCategoryFilter('all')
                  setLogStatusFilter('all')
                  setSearch('')
                }}
                className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search request ID, site, requester, remarks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* VIEW A: AUTHORIZED & FORWARDED APPROVAL LOGS TABLE */}
      {activeTab === 'AUTHORIZED_FORWARDED' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-900 to-[#0B3470] p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  STAGE 3 → STAGE 4 FORWARDED LOGS
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {filteredList.length} Record{filteredList.length === 1 ? '' : 's'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white">Authorized & Forwarded Approval Logs</h2>
              <p className="text-xs text-blue-100/80">
                Audit trail of requests authorized by Organization HQ and forwarded to Operations Managers for clearance or disbursement.
              </p>
            </div>

            <ExportButton
              filename="org_authorized_forwarded_logs.csv"
              headers={[
                'Request ID',
                'Category',
                'Request Title',
                'Construction Site',
                'Requested By (Supervisor)',
                'Authorized By (HQ Admin)',
                'Authorization Date & Time',
                'Current Lifecycle Status',
                'Forwarded Next Stage',
                'HQ Remarks / Instructions',
              ]}
              data={filteredList.map((item) => {
                const approver =
                  item.orgApprovedBy ||
                  item.approvalHistory?.find((h) => String(h.step).includes('3'))?.actorName ||
                  'Organization Admin'
                const apprDate = formatDate(
                  item.orgApprovedAt || item.approvalHistory?.find((h) => String(h.step).includes('3'))?.timestamp || item.updatedAt
                )
                const remarks =
                  item.orgApprovalRemarks ||
                  item.approvalHistory?.find((h) => String(h.step).includes('3'))?.remarks ||
                  item.remarks ||
                  'Authorized as per sanctioned budget.'
                const st = String(item.status || item.approvalStatus || '').toLowerCase()
                const nextStage = ['pending_manager_clearance', 'awaiting_disbursement'].includes(st)
                  ? 'Forwarded to Manager for Stage 4 Clearance'
                  : ['approved', 'cleared'].includes(st)
                  ? 'Cleared by Manager (Stage 4 Done)'
                  : ['received'].includes(st)
                  ? 'Received & Confirmed at Site (Stage 5 Done)'
                  : 'Forwarded'

                return [
                  item.id,
                  item.category,
                  item.title,
                  item.siteName,
                  item.requester,
                  approver,
                  apprDate,
                  item.statusDisplay || item.status,
                  nextStage,
                  remarks,
                ]
              })}
              title="Export Approval Logs"
            />
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="p-3.5">Request Ref & Category</th>
                  <th className="p-3.5">Construction Site</th>
                  <th className="p-3.5">Requested By (Supervisor)</th>
                  <th className="p-3.5">Authorized By (HQ)</th>
                  <th className="p-3.5">Approval Date & Time</th>
                  <th className="p-3.5 text-center">Lifecycle & Forwarded Status</th>
                  <th className="p-3.5">HQ Remarks / Directives</th>
                  <th className="p-3.5 text-center">Audit Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      No authorized and forwarded approval logs matching the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, idx) => {
                    const approver =
                      item.orgApprovedBy ||
                      item.approvalHistory?.find((h) => String(h.step).includes('3'))?.actorName ||
                      'Organization Admin'
                    const apprDate = formatDate(
                      item.orgApprovedAt || item.approvalHistory?.find((h) => String(h.step).includes('3'))?.timestamp || item.updatedAt
                    )
                    const remarks =
                      item.orgApprovalRemarks ||
                      item.approvalHistory?.find((h) => String(h.step).includes('3'))?.remarks ||
                      item.remarks ||
                      item.description ||
                      'Authorized as per sanctioned budget.'
                    const status = String(item.status || item.approvalStatus || '').toLowerCase()
                    const isAwaitingManager = ['pending_manager_clearance', 'awaiting_disbursement'].includes(status)
                    const isCleared = ['approved', 'cleared', 'disbursed'].includes(status)
                    const isReceived = status === 'received'

                    return (
                      <tr key={item.uniqueKey || `log-${item.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200/60 inline-block mb-1">
                            #{item.id}
                          </span>
                          <strong className="text-slate-900 block font-bold text-xs">{item.title}</strong>
                          <span className="text-[11px] text-slate-500 font-medium block">{item.category}</span>
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{item.siteName}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-700 font-medium">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.requester}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{approver}</span>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{apprDate}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          {isAwaitingManager ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                              <ArrowRight className="w-3 h-3 text-amber-600" />
                              <span>Forwarded → Manager Clearance</span>
                            </span>
                          ) : isCleared ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Manager Cleared & Released</span>
                            </span>
                          ) : isReceived ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 text-blue-600" />
                              <span>Delivered at Site (Completed)</span>
                            </span>
                          ) : (
                            <StatusBadge status={item.status} />
                          )}
                        </td>
                        <td className="p-3.5 text-slate-600 text-[11px] max-w-xs truncate" title={remarks}>
                          <span className="italic">"{remarks}"</span>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedItem(item)
                              setIsDetailModalOpen(true)
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                            <span>View Log</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'DECLINED' ? (
        /* VIEW B: DECLINED BY HQ LOGS TABLE */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-rose-900 to-rose-800 p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/30 text-rose-200 border border-rose-400/30">
                  HQ DECLINED REGISTER
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30">
                  {filteredList.length} Declined
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white">Declined Request Logs</h2>
              <p className="text-xs text-rose-100/80">
                Log of site requisitions declined by Organization HQ with documented rejection reasons.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="p-3.5">Request Ref & Category</th>
                  <th className="p-3.5">Construction Site</th>
                  <th className="p-3.5">Requested By (Supervisor)</th>
                  <th className="p-3.5">Declined By (HQ)</th>
                  <th className="p-3.5">Decline Date</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Rejection Reason</th>
                  <th className="p-3.5 text-center">Audit Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      No declined requests recorded.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, idx) => {
                    const decliner = item.rejectedBy || item.orgRejectedBy || 'Organization HQ'
                    const decDate = formatDate(item.rejectedAt || item.updatedAt)
                    const reason = item.rejectionReason || 'Declined by Organization HQ.'

                    return (
                      <tr key={item.uniqueKey || `dec-${item.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 inline-block mb-1">
                            #{item.id}
                          </span>
                          <strong className="text-slate-900 block font-bold text-xs">{item.title}</strong>
                          <span className="text-[11px] text-slate-500 font-medium block">{item.category}</span>
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{item.siteName}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-700 font-medium">{item.requester}</td>
                        <td className="p-3.5 font-bold text-rose-800">{decliner}</td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-600">{decDate}</td>
                        <td className="p-3.5 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Declined by HQ</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-rose-700 italic text-[11px] max-w-xs truncate" title={reason}>
                          "{reason}"
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedItem(item)
                              setIsDetailModalOpen(true)
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                            <span>View Log</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW C: PENDING ACTION REQUESTS CARD GRID */
        filteredList.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
            No requests matching the selected category or filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredList.map((item, idx) => {
              const status = item.status || item.approvalStatus || 'pending_org_approval'

              return (
                <div
                  key={item.uniqueKey || `${item.collectionName || item.stream}_${item.id || idx}_${idx}`}
                  className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-mono text-[10px] font-bold">
                          #{item.id}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-1">{item.title}</h3>
                        <p className="text-xs text-slate-500 font-medium">{item.subTitle}</p>
                      </div>
                      <StatusBadge status={status} />
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[11px]">Construction Site:</span>
                        <strong className="text-slate-800 text-[11px]">{item.siteName}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[11px]">Requested By (Supervisor):</span>
                        <span className="text-slate-700 font-medium text-[11px]">{item.requester}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[11px]">Verified By (Manager):</span>
                        <span className="text-emerald-700 font-medium text-[11px]">{item.verifier}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItem(item)
                        setIsDetailModalOpen(true)
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Workflow</span>
                    </button>

                    {activeTab !== 'AUDIT_TRAIL' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(item)
                            setIsRejectModalOpen(true)
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(item)
                            setIsApproveModalOpen(true)
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-[#0B3470] hover:bg-blue-800 text-white font-bold transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>HQ Authorize</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Inspect Detail Modal */}
      {selectedItem && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Request #${selectedItem.id}`}
          subtitle={`${selectedItem.category} · ${selectedItem.siteName}`}
        >
          <div className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                <strong className="text-slate-800">{selectedItem.category}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Site Location</span>
                <strong className="text-slate-800">{selectedItem.siteName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Requested By</span>
                <strong>{selectedItem.requester}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Manager Verifier</span>
                <strong className="text-emerald-700">{selectedItem.verifier}</strong>
              </div>
            </div>

            {/* HQ Authorization / Rejection Details (if processed) */}
            {(selectedItem.orgApproved || selectedItem.orgApprovedBy || selectedItem.orgApprovedAt || selectedItem.rejectedBy || selectedItem.rejectionReason) && (
              <div
                className={`p-4 rounded-xl border ${
                  selectedItem.orgApproved
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2 font-bold text-xs">
                  {selectedItem.orgApproved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Organization HQ Authorization Details</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>Organization HQ Rejection Details</span>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Actor:</span>
                    <strong className="text-slate-800">
                      {selectedItem.orgApproved
                        ? selectedItem.orgApprovedBy || 'Organization Admin'
                        : selectedItem.rejectedBy || selectedItem.orgRejectedBy || 'Organization Admin'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Date & Time:</span>
                    <strong className="text-slate-800 font-mono">
                      {formatDate(selectedItem.orgApprovedAt || selectedItem.rejectedAt || selectedItem.updatedAt)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Remarks / Instructions:</span>
                    <strong className="text-slate-800 italic">
                      "{selectedItem.orgApprovalRemarks || selectedItem.rejectionReason || selectedItem.remarks || 'Authorized as per sanctioned budget.'}"
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Visualizer */}
            <ApprovalWorkflowStepper
              currentStep={selectedItem.currentStep || 2}
              status={selectedItem.status || selectedItem.approvalStatus || ''}
              history={selectedItem.approvalHistory || []}
            />

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Close Details
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* HQ Authorize Modal */}
      {selectedItem && (
        <Modal
          isOpen={isApproveModalOpen}
          onClose={() => setIsApproveModalOpen(false)}
          title="Organization HQ Authorization"
          subtitle={`Authorize Request #${selectedItem.id} (${selectedItem.category})`}
        >
          <div className="p-6 space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 space-y-1">
              <strong className="block text-sm font-bold">{selectedItem.title}</strong>
              <p className="text-xs">{selectedItem.subTitle} · Site: {selectedItem.siteName}</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                HQ Authorization Remarks / Disbursement Instructions (Optional)
              </label>
              <textarea
                rows={3}
                value={approveRemarks}
                onChange={(e) => setApproveRemarks(e.target.value)}
                placeholder="e.g. Authorized as per sanctioned budget. Forwarded to Manager for final dispatch clearance."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>{actionLoading ? 'Authorizing...' : 'Confirm HQ Authorization'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* HQ Decline Modal */}
      {selectedItem && (
        <Modal
          isOpen={isRejectModalOpen}
          onClose={() => setIsRejectModalOpen(false)}
          title="Decline Request"
          subtitle={`Reject Request #${selectedItem.id}`}
        >
          <div className="p-6 space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
              <strong className="block text-sm font-bold">{selectedItem.title}</strong>
              <p className="text-xs">{selectedItem.subTitle} · Site: {selectedItem.siteName}</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter specific financial or administrative reason for declining..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-rose-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                <X className="w-4 h-4" />
                <span>{actionLoading ? 'Declining...' : 'Confirm Decline'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Requisition Modal */}
      <CreateRequisitionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        orgId={orgId}
        currentUser={user}
        sites={normalizedSites}
        onSuccess={() => {
          showMsg('success', 'Request created and entered into the 5-Stage Approval System.')
        }}
      />
    </div>
  )
}
