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
  Award,
  MapPin,
  UserCheck,
  Calendar,
  Building2,
  Filter,
  Search,
  FileText,
  RotateCcw,
  Inbox,
  ArrowRight,
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

const APPROVAL_CATEGORIES = [
  { id: 'all', label: 'All Categories', stream: null },
  { id: 'MATERIALS', label: 'Material Requests', stream: 'MATERIALS' },
  { id: 'TOOLS', label: 'Tools & Equipment', stream: 'TOOLS' },
  { id: 'PETTY_CASH', label: 'Petty Cash & Claims', stream: 'PETTY_CASH' },
  { id: 'STAGES', label: 'Stage Schedules', stream: 'STAGES' },
  { id: 'VEHICLES', label: 'Vehicle Movements', stream: 'VEHICLES' },
]

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

  // Primary status navigation: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL_HISTORY'
  const [statusTab, setStatusTab] = useState('PENDING')
  // Category filter: 'all' | 'MATERIALS' | 'TOOLS' | 'PETTY_CASH' | 'STAGES' | 'VEHICLES'
  const [categoryFilter, setCategoryFilter] = useState('all')
  // Preserved activeTab for backward compatibility
  const [activeTab, setActiveTab] = useState('ALL')
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')
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

  // Filter items awaiting Organization approval
  const pendingOrgApprovals = useMemo(() => {
    return allRequisitions.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      return (
        ['pending_org_approval', 'pending_organization_approval', 'manager_verified'].includes(st) ||
        item.currentStep === 2
      )
    })
  }, [allRequisitions])

  // Filter items approved & forwarded by Organization
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

  // Filter items rejected by Organization
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

  // Active status items source for counting categories
  const currentStatusSource = useMemo(() => {
    if (statusTab === 'APPROVED' || activeTab === 'AUTHORIZED_FORWARDED') return authorizedForwardedItems
    if (statusTab === 'REJECTED' || activeTab === 'DECLINED') return declinedItems
    if (statusTab === 'ALL_HISTORY' || activeTab === 'AUDIT_TRAIL') return auditTrailItems
    return pendingOrgApprovals
  }, [statusTab, activeTab, authorizedForwardedItems, declinedItems, auditTrailItems, pendingOrgApprovals])

  // Category counts within currently selected status
  const categoryCounts = useMemo(() => {
    const counts = { all: currentStatusSource.length }
    APPROVAL_CATEGORIES.forEach((cat) => {
      if (cat.stream) {
        counts[cat.id] = currentStatusSource.filter((item) => item.stream === cat.stream).length
      }
    })
    return counts
  }, [currentStatusSource])

  // Filter by Active Tab, Category, Status, Site & Search
  const filteredList = useMemo(() => {
    let source = pendingOrgApprovals
    if (statusTab === 'APPROVED' || activeTab === 'AUTHORIZED_FORWARDED') {
      source = authorizedForwardedItems
    } else if (statusTab === 'REJECTED' || activeTab === 'DECLINED') {
      source = declinedItems
    } else if (statusTab === 'ALL_HISTORY' || activeTab === 'AUDIT_TRAIL') {
      source = auditTrailItems
    } else {
      source = pendingOrgApprovals
    }

    return source.filter((item) => {
      // Category filter
      if (categoryFilter !== 'all' && item.stream !== categoryFilter) {
        return false
      }

      // Site filter
      if (siteFilter !== 'all' && item.siteId !== siteFilter) {
        return false
      }

      // Status filter (on Approved tab)
      if ((statusTab === 'APPROVED' || activeTab === 'AUTHORIZED_FORWARDED') && logStatusFilter !== 'all') {
        const st = String(item.status || item.approvalStatus || '').toLowerCase()
        if (logStatusFilter === 'forwarded' && !['pending_manager_clearance', 'awaiting_disbursement'].includes(st)) {
          return false
        }
        if (logStatusFilter === 'cleared' && !['approved', 'cleared', 'disbursed'].includes(st)) {
          return false
        }
        if (logStatusFilter === 'received' && st !== 'received') {
          return false
        }
      }

      // Search filter
      const q = search.trim().toLowerCase()
      if (q) {
        const match =
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
        if (!match) return false
      }

      return true
    })
  }, [
    statusTab,
    activeTab,
    categoryFilter,
    pendingOrgApprovals,
    authorizedForwardedItems,
    declinedItems,
    auditTrailItems,
    siteFilter,
    logStatusFilter,
    search,
  ])

  // Handle Organization Approval
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
      showMsg('success', `Request #${selectedItem.id} approved successfully and forwarded for operations clearance.`)
      setIsApproveModalOpen(false)
      setIsDetailModalOpen(false)
      setApproveRemarks('')
    } catch (err) {
      console.error(err)
      showMsg('error', err.message || 'Failed to approve request')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle Organization Rejection
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
      showMsg('success', `Request #${selectedItem.id} rejected. Notification sent.`)
      setIsRejectModalOpen(false)
      setIsDetailModalOpen(false)
      setRejectReason('')
    } catch (err) {
      console.error(err)
      showMsg('error', err.message || 'Failed to reject request')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organization Approvals</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review and manage site requisitions, material requests, and operational expense approvals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/organization/incentive-calculation"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer border border-slate-200/80 shadow-2xs"
          >
            <Award className="w-4 h-4 text-amber-600" />
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
            title="Export Approvals"
          />
        </div>
      </div>

      {/* Feedback Alert Banner */}
      {feedback.text && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Pending Approvals */}
        <button
          type="button"
          onClick={() => {
            setStatusTab('PENDING')
            setActiveTab('ALL')
            setCategoryFilter('all')
          }}
          className={`p-5 rounded-2xl bg-white border text-left transition-all cursor-pointer shadow-xs group ${
            statusTab === 'PENDING'
              ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                Pending Approvals
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-600 font-mono tracking-tight">
                  {pendingOrgApprovals.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">Requests</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 group-hover:scale-105 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Awaiting Review</span>
            <span className="font-semibold text-amber-700 font-mono text-[11px]">Action Required</span>
          </div>
        </button>

        {/* Card 2: Approved Requests */}
        <button
          type="button"
          onClick={() => {
            setStatusTab('APPROVED')
            setActiveTab('AUTHORIZED_FORWARDED')
            setCategoryFilter('all')
          }}
          className={`p-5 rounded-2xl bg-white border text-left transition-all cursor-pointer shadow-xs group ${
            statusTab === 'APPROVED'
              ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/20'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Approved Requests
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 font-mono tracking-tight">
                  {authorizedForwardedItems.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">Requests</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Approved & Forwarded</span>
            <span className="font-semibold text-emerald-700 font-mono text-[11px]">In Execution</span>
          </div>
        </button>

        {/* Card 3: Rejected Requests */}
        <button
          type="button"
          onClick={() => {
            setStatusTab('REJECTED')
            setActiveTab('DECLINED')
            setCategoryFilter('all')
          }}
          className={`p-5 rounded-2xl bg-white border text-left transition-all cursor-pointer shadow-xs group ${
            statusTab === 'REJECTED'
              ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/20'
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                Rejected Requests
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-rose-600 font-mono tracking-tight">
                  {declinedItems.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">Requests</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 group-hover:scale-105 transition-transform">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Declined with Reasons</span>
            <span className="font-semibold text-rose-700 font-mono text-[11px]">Documented</span>
          </div>
        </button>
      </div>

      {/* Navigation & Filter Hub */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 space-y-3.5">
        {/* Tier 1: Primary Status Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-100">
          {[
            {
              id: 'PENDING',
              legacyKey: 'ALL',
              label: 'Pending Approvals',
              count: pendingOrgApprovals.length,
              icon: Clock,
            },
            {
              id: 'APPROVED',
              legacyKey: 'AUTHORIZED_FORWARDED',
              label: 'Approved Requests',
              count: authorizedForwardedItems.length,
              icon: CheckCircle2,
            },
            {
              id: 'REJECTED',
              legacyKey: 'DECLINED',
              label: 'Rejected Requests',
              count: declinedItems.length,
              icon: XCircle,
            },
            {
              id: 'ALL_HISTORY',
              legacyKey: 'AUDIT_TRAIL',
              label: 'All History',
              count: auditTrailItems.length,
              icon: FileText,
            },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = statusTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusTab(tab.id)
                  setActiveTab(tab.legacyKey)
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Tier 2: Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 whitespace-nowrap">
            Category:
          </span>
          {APPROVAL_CATEGORIES.map((cat) => {
            const isCatActive = categoryFilter === cat.id
            const count = categoryCounts[cat.id] ?? 0

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat.id)
                  if (statusTab === 'PENDING') {
                    setActiveTab(cat.stream || 'ALL')
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isCatActive
                    ? 'bg-blue-50 text-blue-800 border border-blue-200/90 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/60'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
                    isCatActive ? 'bg-blue-200/60 text-blue-900' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Tier 3: Search & Dropdown Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Construction Site Selector */}
            <div className="relative min-w-[200px]">
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#0B3470] transition-all cursor-pointer shadow-2xs"
              >
                <option value="all">All Construction Sites ({normalizedSites.length})</option>
                {normalizedSites.map((s, idx) => (
                  <option key={`appr-site-${s.id || s.siteId || idx}-${idx}`} value={s.id || s.siteId}>
                    {s.label || s.siteName || s.projectName || s.name || s.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Lifecycle Status Selector (on Approved tab) */}
            {statusTab === 'APPROVED' && (
              <div className="relative min-w-[190px]">
                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-[#0B3470] transition-all cursor-pointer shadow-2xs"
                >
                  <option value="all">All Lifecycle Statuses</option>
                  <option value="forwarded">Awaiting Manager Clearance</option>
                  <option value="cleared">Cleared & Released</option>
                  <option value="received">Delivered to Site</option>
                </select>
              </div>
            )}

            {/* Reset Filters */}
            {(siteFilter !== 'all' || categoryFilter !== 'all' || logStatusFilter !== 'all' || search) && (
              <button
                type="button"
                onClick={() => {
                  setSiteFilter('all')
                  setCategoryFilter('all')
                  setLogStatusFilter('all')
                  setSearch('')
                  if (statusTab === 'PENDING') setActiveTab('ALL')
                }}
                className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer border border-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by ID, site, requester, item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-slate-900 outline-none focus:border-[#0B3470] focus:bg-white transition-all shadow-2xs placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VIEW A: APPROVED REQUESTS TABLE */}
      {statusTab === 'APPROVED' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0B3470] p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                  Approved Requests
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {filteredList.length} Record{filteredList.length === 1 ? '' : 's'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white">Approved Requests Log</h2>
              <p className="text-xs text-blue-100/80">
                Audit trail of site requisitions approved and forwarded to Operations Managers for clearance and dispatch.
              </p>
            </div>

            <ExportButton
              filename="org_approved_requests.csv"
              headers={[
                'Request ID',
                'Category',
                'Request Title',
                'Construction Site',
                'Requested By (Supervisor)',
                'Approved By',
                'Approval Date & Time',
                'Lifecycle Status',
                'Approval Remarks',
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
                  'Approved as per sanctioned budget.'

                return [
                  item.id,
                  item.category,
                  item.title,
                  item.siteName,
                  item.requester,
                  approver,
                  apprDate,
                  item.statusDisplay || item.status,
                  remarks,
                ]
              })}
              title="Export Approved Requests"
            />
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="p-3.5">Request Ref & Category</th>
                  <th className="p-3.5">Construction Site</th>
                  <th className="p-3.5">Requested By</th>
                  <th className="p-3.5">Approved By</th>
                  <th className="p-3.5">Approval Date & Time</th>
                  <th className="p-3.5 text-center">Lifecycle Status</th>
                  <th className="p-3.5">Approval Remarks</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      No approved requests matching the selected filter criteria.
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
                      'Approved as per sanctioned budget.'
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
                              <span>Awaiting Manager Clearance</span>
                            </span>
                          ) : isCleared ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Cleared & Released</span>
                            </span>
                          ) : isReceived ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3 text-blue-600" />
                              <span>Delivered to Site</span>
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
                            <span>View Details</span>
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
      ) : statusTab === 'REJECTED' ? (
        /* VIEW B: REJECTED REQUESTS TABLE */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-900 p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/30 text-rose-200 border border-rose-400/30">
                  Rejected Requests
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30">
                  {filteredList.length} Rejected
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white">Rejected Requests Log</h2>
              <p className="text-xs text-rose-100/80">
                Records of site requisitions rejected with documented reasons.
              </p>
            </div>

            <ExportButton
              filename="org_rejected_requests.csv"
              headers={[
                'Request ID',
                'Category',
                'Request Title',
                'Construction Site',
                'Requested By',
                'Rejected By',
                'Rejection Date',
                'Status',
                'Rejection Reason',
              ]}
              data={filteredList.map((item) => [
                item.id,
                item.category,
                item.title,
                item.siteName,
                item.requester,
                item.rejectedBy || item.orgRejectedBy || 'Organization Admin',
                formatDate(item.rejectedAt || item.updatedAt),
                'Rejected',
                item.rejectionReason || 'Rejected by Organization.',
              ])}
              title="Export Rejected Requests"
            />
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="p-3.5">Request Ref & Category</th>
                  <th className="p-3.5">Construction Site</th>
                  <th className="p-3.5">Requested By</th>
                  <th className="p-3.5">Rejected By</th>
                  <th className="p-3.5">Rejection Date</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Rejection Reason</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      No rejected requests recorded.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, idx) => {
                    const decliner = item.rejectedBy || item.orgRejectedBy || 'Organization Admin'
                    const decDate = formatDate(item.rejectedAt || item.updatedAt)
                    const reason = item.rejectionReason || 'Rejected by Organization.'

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
                            <span>Rejected</span>
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
                            <span>View Details</span>
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
      ) : statusTab === 'ALL_HISTORY' ? (
        /* VIEW C: ALL HISTORY TABLE */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800 p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                  All History
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {filteredList.length} Record{filteredList.length === 1 ? '' : 's'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white">Requisition History Log</h2>
              <p className="text-xs text-slate-300">
                Complete audit history of site requisitions and their approval lifecycle transitions.
              </p>
            </div>

            <ExportButton
              filename="org_approvals_history.csv"
              headers={[
                'Request ID',
                'Category',
                'Request Title',
                'Construction Site',
                'Requested By',
                'Manager Verified By',
                'Status',
                'Date',
              ]}
              data={filteredList.map((item) => [
                item.id,
                item.category,
                item.title,
                item.siteName,
                item.requester,
                item.verifier,
                item.status || item.approvalStatus,
                formatDate(item.createdAt || item.updatedAt),
              ])}
              title="Export History"
            />
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="p-3.5">Request Ref & Category</th>
                  <th className="p-3.5">Item / Request Details</th>
                  <th className="p-3.5">Construction Site</th>
                  <th className="p-3.5">Requested By</th>
                  <th className="p-3.5">Manager Verified</th>
                  <th className="p-3.5 text-center">Lifecycle Status</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      No historical requests found matching the current search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, idx) => (
                    <tr key={item.uniqueKey || `hist-${item.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 inline-block mb-1">
                          #{item.id}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium block">{item.category}</span>
                      </td>
                      <td className="p-3.5">
                        <strong className="text-slate-900 block font-bold text-xs">{item.title}</strong>
                        <span className="text-[11px] text-slate-500 font-medium block">{item.subTitle}</span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{item.siteName}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-700 font-medium">{item.requester}</td>
                      <td className="p-3.5 text-emerald-700 font-semibold">{item.verifier}</td>
                      <td className="p-3.5 text-center">
                        <StatusBadge status={item.status || item.approvalStatus} />
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
                          <span>View Details</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW D: PENDING APPROVALS TABLE */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-700 to-amber-600 p-4 sm:p-5 rounded-2xl text-white shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                  Pending Approvals
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-900/40 text-amber-100 border border-amber-300/30">
                  {filteredList.length} Action Required
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white">Pending Requests Awaiting Approval</h2>
              <p className="text-xs text-amber-100/90">
                Review and take approval or rejection decisions on requisitions submitted by supervisors and verified by managers.
              </p>
            </div>

            <ExportButton
              filename="org_pending_approvals.csv"
              headers={[
                'Request ID',
                'Category',
                'Request Title',
                'Construction Site',
                'Requested By',
                'Manager Verified By',
                'Status',
                'Date',
              ]}
              data={filteredList.map((item) => [
                item.id,
                item.category,
                item.title,
                item.siteName,
                item.requester,
                item.verifier,
                item.status || item.approvalStatus || 'pending_org_approval',
                formatDate(item.createdAt || item.updatedAt),
              ])}
              title="Export Pending Requests"
            />
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/90 text-slate-500 font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="p-3.5">Request Ref & Category</th>
                  <th className="p-3.5">Item / Request Details</th>
                  <th className="p-3.5">Construction Site</th>
                  <th className="p-3.5">Requested By</th>
                  <th className="p-3.5">Manager Verified</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      No pending requests awaiting approval matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item, idx) => {
                    const status = item.status || item.approvalStatus || 'pending_org_approval'

                    return (
                      <tr key={item.uniqueKey || `pending-${item.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200/60 inline-block mb-1">
                            #{item.id}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium block">{item.category}</span>
                        </td>
                        <td className="p-3.5">
                          <strong className="text-slate-900 block font-bold text-xs">{item.title}</strong>
                          <span className="text-[11px] text-slate-500 font-medium block">{item.subTitle}</span>
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
                        <td className="p-3.5 font-semibold text-emerald-700">
                          <span>{item.verifier}</span>
                        </td>
                        <td className="p-3.5 text-center">
                          <StatusBadge status={status} />
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItem(item)
                                setIsDetailModalOpen(true)
                              }}
                              title="View Details"
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItem(item)
                                setIsRejectModalOpen(true)
                              }}
                              title="Reject Request"
                              className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] border border-rose-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItem(item)
                                setIsApproveModalOpen(true)
                              }}
                              title="Approve Request"
                              className="px-3 py-1.5 rounded-xl bg-[#0B3470] hover:bg-blue-800 text-white font-bold text-[11px] transition-colors inline-flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {selectedItem && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Request Details #${selectedItem.id}`}
          subtitle={`${selectedItem.category} · ${selectedItem.siteName}`}
        >
          <div className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                <strong className="text-slate-800">{selectedItem.category}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Construction Site</span>
                <strong className="text-slate-800">{selectedItem.siteName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Requested By</span>
                <strong className="text-slate-800">{selectedItem.requester}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Manager Verified</span>
                <strong className="text-emerald-700">{selectedItem.verifier}</strong>
              </div>
            </div>

            {/* Approval / Rejection Audit Details */}
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
                      <span>Approval Audit Details</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>Rejection Audit Details</span>
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
                      "{selectedItem.orgApprovalRemarks || selectedItem.rejectionReason || selectedItem.remarks || 'Approved as per sanctioned budget.'}"
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
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Approve Modal */}
      {selectedItem && (
        <Modal
          isOpen={isApproveModalOpen}
          onClose={() => setIsApproveModalOpen(false)}
          title="Approve Request"
          subtitle={`Approve Request #${selectedItem.id} (${selectedItem.category})`}
        >
          <div className="p-6 space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 space-y-1">
              <strong className="block text-sm font-bold">{selectedItem.title}</strong>
              <p className="text-xs">{selectedItem.subTitle} · Site: {selectedItem.siteName}</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Approval Remarks & Instructions (Optional)
              </label>
              <textarea
                rows={3}
                value={approveRemarks}
                onChange={(e) => setApproveRemarks(e.target.value)}
                placeholder="e.g. Approved as per sanctioned budget. Forwarded to Manager for final dispatch clearance."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{actionLoading ? 'Approving...' : 'Confirm Approval'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {selectedItem && (
        <Modal
          isOpen={isRejectModalOpen}
          onClose={() => setIsRejectModalOpen(false)}
          title="Reject Request"
          subtitle={`Reject Request #${selectedItem.id}`}
        >
          <div className="p-6 space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
              <strong className="block text-sm font-bold">{selectedItem.title}</strong>
              <p className="text-xs">{selectedItem.subTitle} · Site: {selectedItem.siteName}</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Reason for Rejection <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter specific financial or administrative reason for rejecting..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-rose-600 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>{actionLoading ? 'Rejecting...' : 'Confirm Rejection'}</span>
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
          showMsg('success', 'Request created and submitted for approval.')
        }}
      />
    </div>
  )
}
