import React, { useState, useMemo } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import {
  executeOrganizationApproval,
  executeOrganizationRejection,
} from '../../../services/approvalService'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Package,
  Wrench,
  DollarSign,
  CalendarCheck,
  Truck,
  Eye,
  Check,
  X,
  AlertTriangle,
  FileText,
  User,
  ShieldCheck,
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
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/**
 * 5-Stage Workflow Stepper Component
 * Renders the 5-stage lifecycle and audit trail timeline
 */
function ApprovalWorkflowStepper({ currentStep = 1, status = '', history = [] }) {
  const isRejected = currentStep === -1 || status.includes('reject')

  const stages = [
    { num: 1, name: '1. Supervisor Submission', code: 'pending_manager_review' },
    { num: 2, name: '2. Manager Verification', code: 'pending_org_approval' },
    { num: 3, name: '3. Organization Authorization', code: 'pending_manager_clearance' },
    { num: 4, name: '4. Manager Final Clearance', code: 'approved' },
    { num: 5, name: '5. Site Receipt Confirmation', code: 'received' },
  ]

  return (
    <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-blue-600" />
        <span>5-Stage Approval Lifecycle Status</span>
      </h4>

      {/* Stepper Progress Bar */}
      <div className="grid grid-cols-5 gap-1.5 text-center">
        {stages.map((stg) => {
          let stepState = 'upcoming' // 'passed' | 'current' | 'upcoming' | 'rejected'

          if (isRejected && currentStep === stg.num) {
            stepState = 'rejected'
          } else if (currentStep > stg.num || (currentStep === 4 && status === 'received')) {
            stepState = 'passed'
          } else if (currentStep === stg.num) {
            stepState = 'current'
          }

          return (
            <div key={stg.num} className="space-y-1.5">
              <div
                className={`h-2 rounded-full transition-all ${
                  stepState === 'passed'
                    ? 'bg-emerald-500'
                    : stepState === 'current'
                    ? 'bg-[#0B3470] animate-pulse'
                    : stepState === 'rejected'
                    ? 'bg-rose-500'
                    : 'bg-slate-200'
                }`}
              />
              <span className="text-[10px] font-bold block text-slate-700 truncate">{stg.name}</span>
            </div>
          )
        })}
      </div>

      {/* Audit History Log */}
      {history.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Audit History Log</p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {history.map((hist, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-white border border-slate-200/70 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-900">{hist.step || hist.action}</span>
                  <span className="text-slate-400 font-mono text-[10px]">{hist.dateStr || formatDate(hist.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-extrabold">
                    {hist.actorRole || 'Actor'}
                  </span>
                  <span className="font-medium">{hist.actorName || 'User'}</span>
                  {hist.remarks && <span className="text-slate-500 italic">· "{hist.remarks}"</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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

  // Active Stream Tab: 'ALL' | 'MATERIALS' | 'TOOLS' | 'PETTY_CASH' | 'STAGES' | 'VEHICLES' | 'AUDIT_TRAIL'
  const [activeTab, setActiveTab] = useState('ALL')
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')

  const [feedback, setFeedback] = useState({ type: '', text: '' })
  const [actionLoading, setActionLoading] = useState(false)

  // Action Modals
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

  // Aggregate all items with target stream flag
  const allRequisitions = useMemo(() => {
    const items = []

    // 1. Material Requests
    siteMaterialsRequest.forEach((m) => {
      items.push({
        ...m,
        stream: 'MATERIALS',
        collectionName: 'siteMaterialsRequest',
        title: `Material Request: ${m.materialName || m.name || 'Materials'}`,
        subTitle: `${m.quantity || m.requestedQty || 1} ${m.unit || 'Units'}`,
        siteName: m.siteName || siteMap[m.siteId] || 'Site Location',
        requester: m.supervisorName || m.createdBy || 'Supervisor',
        verifier: m.managerReviewedBy || m.managerName || 'Manager',
        category: 'Material Requisition',
      })
    })

    // 2. Tool Requests
    siteToolsRequest.forEach((t) => {
      items.push({
        ...t,
        stream: 'TOOLS',
        collectionName: 'siteToolsRequest',
        title: `Tool Requisition: ${t.toolName || t.name || 'Machinery'}`,
        subTitle: `Asset Code: ${t.toolCode || t.serialNo || 'YARD_ALLOC'}`,
        siteName: t.siteName || siteMap[t.siteId] || 'Site Location',
        requester: t.supervisorName || t.createdBy || 'Supervisor',
        verifier: t.approvedByManager || t.managerName || 'Manager',
        category: 'Tool & Equipment',
      })
    })

    // 3. Stage Schedules
    siteSupervisorProjectStageSchedule.forEach((st) => {
      items.push({
        ...st,
        stream: 'STAGES',
        collectionName: 'siteSupervisorProjectStageSchedule',
        title: `Stage Milestone: ${st.stageName || st.stage || 'Milestone'}`,
        subTitle: `Target Completion: ${st.targetDate || 'N/A'}`,
        siteName: st.siteName || siteMap[st.siteId] || 'Site Location',
        requester: st.supervisorName || st.createdBy || 'Supervisor',
        verifier: st.approvedByManager || st.managerName || 'Manager',
        category: 'Stage Schedule',
      })
    })

    // 4. Petty Cash & Daily Expense Claims
    pettyCashRequests.concat(siteSupervisorEntries).forEach((pc) => {
      items.push({
        ...pc,
        stream: 'PETTY_CASH',
        collectionName: pc.voucherNo || pc.entryId ? 'siteSupervisorEntries' : 'pettyCashRequests',
        title: `Expense Claim: ${money(pc.amount || pc.totalAmount || pc.amountRequested || 0)}`,
        subTitle: pc.category || pc.description || pc.remarks || 'Site Operations',
        siteName: pc.siteName || siteMap[pc.siteId] || 'Site Location',
        requester: pc.supervisorName || pc.requestedBy || 'Supervisor',
        verifier: pc.managerReviewerName || pc.managerName || 'Manager',
        category: 'Petty Cash / Payment',
      })
    })

    // 5. Vehicle Movements
    vehicleMovements.forEach((v) => {
      items.push({
        ...v,
        stream: 'VEHICLES',
        collectionName: 'vehicleMovements',
        title: `Vehicle Requisition: ${v.vehicleNumber || v.modelName || 'Fleet'}`,
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
      return ['pending_org_approval', 'pending_organization_approval', 'manager_verified'].includes(st)
    })
  }, [allRequisitions])

  // Filter completed / audit history
  const auditTrailItems = useMemo(() => {
    return allRequisitions.filter((item) => {
      const st = String(item.status || item.approvalStatus || '').toLowerCase()
      return ['pending_manager_clearance', 'approved', 'cleared', 'rejected_by_org', 'received'].includes(st)
    })
  }, [allRequisitions])

  // Filter by Active Tab & Search
  const filteredList = useMemo(() => {
    let source = activeTab === 'AUDIT_TRAIL' ? auditTrailItems : pendingOrgApprovals

    return source.filter((item) => {
      const matchesTab = activeTab === 'ALL' || activeTab === 'AUDIT_TRAIL' || item.stream === activeTab
      const matchesSite = siteFilter === 'all' || item.siteId === siteFilter
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        item.title?.toLowerCase().includes(q) ||
        item.siteName?.toLowerCase().includes(q) ||
        item.requester?.toLowerCase().includes(q) ||
        item.id?.toLowerCase().includes(q)

      return matchesTab && matchesSite && matchesSearch
    })
  }, [activeTab, pendingOrgApprovals, auditTrailItems, siteFilter, search])

  // Handle HQ Authorization (Approve)
  const handleAuthorize = async () => {
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await executeOrganizationApproval(
        orgId,
        selectedItem.collectionName,
        selectedItem.id,
        currentUserActor,
        approveRemarks
      )
      showMsg('success', `Requisition #${selectedItem.id} authorized by HQ and sent for Manager final clearance.`)
      setIsApproveModalOpen(false)
      setIsDetailModalOpen(false)
      setApproveRemarks('')
    } catch (err) {
      console.error(err)
      showMsg('error', err.message || 'Failed to authorize requisition')
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
      await executeOrganizationRejection(
        orgId,
        selectedItem.collectionName,
        selectedItem.id,
        currentUserActor,
        rejectReason
      )
      showMsg('success', `Requisition #${selectedItem.id} declined by HQ. Notification sent.`)
      setIsRejectModalOpen(false)
      setIsDetailModalOpen(false)
      setRejectReason('')
    } catch (err) {
      console.error(err)
      showMsg('error', err.message || 'Failed to decline requisition')
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
            Tier 2 Organization HQ financial and administrative authorization for site requisitions.
          </p>
        </div>

        <ExportButton
          filename="org_approvals_master.csv"
          data={filteredList.map((i) => ({
            RequisitionID: i.id,
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

      {/* Feedback Alert Banner */}
      {feedback.text && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Awaiting HQ Authorization</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{pendingOrgApprovals.length}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Authorized & Forwarded</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">
              {auditTrailItems.filter((i) => ['pending_manager_clearance', 'approved', 'cleared', 'received'].includes(String(i.status).toLowerCase())).length}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Declined by HQ</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">
              {auditTrailItems.filter((i) => String(i.status).toLowerCase().includes('reject')).length}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar & Tabs */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto scrollbar-none pb-1 lg:pb-0">
          {[
            { id: 'ALL', label: `Pending HQ Action (${pendingOrgApprovals.length})` },
            { id: 'MATERIALS', label: 'Material Requests' },
            { id: 'TOOLS', label: 'Tools & Machinery' },
            { id: 'PETTY_CASH', label: 'Petty Cash / Payments' },
            { id: 'STAGES', label: 'Stage Schedules' },
            { id: 'VEHICLES', label: 'Vehicle Movements' },
            { id: 'AUDIT_TRAIL', label: `Approval History (${auditTrailItems.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search requisition, site, supervisor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* Requisitions List */}
      {filteredList.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          No requisitions matching the selected category or filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((item) => {
            const currentStep = item.currentStep || 2
            const status = item.status || item.approvalStatus || 'pending_org_approval'

            return (
              <div
                key={item.id}
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
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors flex items-center gap-1"
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
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-colors flex items-center gap-1"
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
                        className="px-3.5 py-1.5 rounded-xl bg-[#0B3470] hover:bg-blue-800 text-white font-bold transition-colors flex items-center gap-1 shadow-xs"
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
      )}

      {/* Inspect Detail Modal */}
      {selectedItem && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Requisition #${selectedItem.id}`}
          subtitle={`${selectedItem.category} · ${selectedItem.siteName}`}
        >
          <div className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                <strong className="text-slate-800">{selectedItem.category}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Site Location</span>
                <strong className="text-slate-800">{selectedItem.siteName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Created By</span>
                <strong>{selectedItem.requester}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Manager Verifier</span>
                <strong className="text-emerald-700">{selectedItem.verifier}</strong>
              </div>
            </div>

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
          subtitle={`Authorize Requisition #${selectedItem.id} (${selectedItem.category})`}
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
          title="Decline Requisition"
          subtitle={`Reject Requisition #${selectedItem.id}`}
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
    </div>
  )
}
