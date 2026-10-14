import { useState, useMemo } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import ApprovalWorkflowStepper from '../../../components/common/ApprovalWorkflowStepper'
import CreateRequisitionModal from '../../../components/common/CreateRequisitionModal'
import {
  managerReviewSitePayment,
  linkSitePaymentToPettyCash,
  managerClearSitePayment,
  managerReviewMaterialOrder,
  managerClearMaterialOrder,
  confirmMaterialReceipt,
  managerApproveToolRequest,
  managerDispatchTool,
  confirmToolReceipt,
  managerConfirmToolReturn,
  managerApproveStageMilestone,
} from '../../../services/approvalService.js'
import {
  Plus,
  Eye,
  Truck,
  RotateCcw,
  Search,
} from 'lucide-react'
import {
  getMaterialItemDisplay,
  getRequestedQtyDisplay,
  getApprovedQtyDisplay,
  getMaterialUnitDisplay,
  getMaterialQtyValue,
  getMaterialCategoryDisplay,
} from '../../../utils/materialUtils.js'

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

function matchesPaymentSubTab(entry, tab) {
  const st = String(entry.status || '').toLowerCase()
  const step = Number(entry.currentStep) || 0
  if (tab === 'review') {
    return st === 'pending_manager_review' || st === 'submitted' || step === 1
  }
  if (tab === 'org') {
    return st === 'pending_org_approval' || st === 'pending_organization_approval' || st === 'manager_verified' || step === 2
  }
  if (tab === 'clearance') {
    return st === 'approved_by_org' || st === 'pending_manager_clearance' || step === 3
  }
  if (tab === 'approved') {
    return st === 'approved' || st === 'paid' || st === 'cleared' || st === 'settled' || st === 'completed' || step >= 4
  }
  if (tab === 'rejected') {
    return st.includes('reject') || step === -1
  }
  return true
}

function matchesMaterialSubTab(req, tab) {
  const st = String(req.status || '').toLowerCase()
  const step = Number(req.currentStep) || 0
  if (tab === 'review') {
    return st === 'pending_manager_review' || st === 'submitted' || step === 1
  }
  if (tab === 'org') {
    return st === 'pending_org_approval' || st === 'pending_organization_approval' || st === 'manager_verified' || step === 2
  }
  if (tab === 'clearance') {
    return st === 'authorized_for_procurement' || st === 'approved_by_org' || st === 'pending_manager_clearance' || step === 3
  }
  if (tab === 'approved') {
    return st === 'approved' || st === 'dispatched' || st === 'received' || st === 'cleared' || step >= 4
  }
  if (tab === 'rejected') {
    return st.includes('reject') || step === -1
  }
  return true
}

function matchesToolSubTab(tool, tab) {
  const st = String(tool.status || '').toLowerCase()
  const step = Number(tool.currentStep) || 0
  if (tab === 'review') {
    return st === 'pending_manager_review' || st === 'submitted' || step === 1
  }
  if (tab === 'org') {
    return st === 'pending_org_approval' || st === 'pending_organization_approval' || step === 2
  }
  if (tab === 'clearance') {
    return st === 'approved' || st === 'allocated' || st === 'approved_by_org' || st === 'pending_manager_clearance' || step === 3
  }
  if (tab === 'approved') {
    return st === 'dispatched' || st === 'received' || st === 'returned' || st === 'completed' || step >= 4
  }
  if (tab === 'rejected') {
    return st.includes('reject') || step === -1
  }
  return true
}

function matchesStageSubTab(stg, tab) {
  const isComplete = stg.status === 'completed' || Boolean(stg.isApproved)
  if (tab === 'review') return !isComplete
  if (tab === 'approved') return isComplete
  if (tab === 'org' || tab === 'clearance' || tab === 'rejected') return false
  return true
}

export default function ApprovalsCenter({
  sites = [],
  siteSupervisorEntries = [],
  siteMaterialsRequest = [],
  siteToolsRequest = [],
  siteSupervisorProjectStageSchedule = [],
}) {
  const { orgId, user, userData } = useAuth()
  const managerActor = {
    id: user?.uid || 'mgr_lead',
    name: userData?.fullName || userData?.FullName || userData?.name || 'Operations Manager',
    role: 'Manager',
  }

  // Active Stream Tab: 'payments' | 'materials' | 'tools' | 'stages'
  const [activeStream, setActiveStream] = useState('payments')
  const [subTab, setSubTab] = useState('review') // 'review' | 'org' | 'clearance' | 'approved' | 'rejected'
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')

  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })

  function showMsg(type, text) {
    setFeedback({ type, text })
    setTimeout(() => setFeedback({ type: '', text: '' }), 5000)
  }

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)

  // Rejection modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Material Review modal (Stage 2)
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [approvedQty, setApprovedQty] = useState('')
  const [vendorNotes, setVendorNotes] = useState('')

  // Material Clearance Gate Pass modal (Stage 4)
  const [isGatePassModalOpen, setIsGatePassModalOpen] = useState(false)
  const [gatePassNo, setGatePassNo] = useState('')
  const [dispatchRemarks, setDispatchRemarks] = useState('')

  // Payment Clearance UTR modal (Stage 4)
  const [isPaymentClearanceModalOpen, setIsPaymentClearanceModalOpen] = useState(false)
  const [utrReference, setUtrReference] = useState('')

  // Tool Allocation modal (Stage 2)
  const [isToolModalOpen, setIsToolModalOpen] = useState(false)
  const [assetSerialId, setAssetSerialId] = useState('')

  // Tool Dispatch modal (Stage 4)
  const [isToolDispatchModalOpen, setIsToolDispatchModalOpen] = useState(false)
  const [toolDispatchNotes, setToolDispatchNotes] = useState('')

  // Receipt Confirmation modal (Stage 5)
  const [isReceiptConfirmModalOpen, setIsReceiptConfirmModalOpen] = useState(false)
  const [receiptNotes, setReceiptNotes] = useState('')
  const [receiptType, setReceiptType] = useState('material') // 'material' | 'tool'

  // Tool Return modal
  const [isReturnConditionModalOpen, setIsReturnConditionModalOpen] = useState(false)
  const [returnCondition, setReturnCondition] = useState('Working')

  // Milestone Sign-off modal
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false)
  const [milestoneQualityNotes, setMilestoneQualityNotes] = useState('')

  // Map Site ID to Name
  const siteMap = useMemo(() => {
    const map = {}
    sites.forEach((s) => {
      map[s.id] = s.name || s.projectName || s.id
    })
    return map
  }, [sites])

  // Stream Total Pending Counts (for Stream Bento Cards)
  const pendingPaymentsCount = useMemo(() => {
    return siteSupervisorEntries.filter((e) => matchesPaymentSubTab(e, 'review')).length
  }, [siteSupervisorEntries])

  const pendingMaterialsCount = useMemo(() => {
    return siteMaterialsRequest.filter((r) => matchesMaterialSubTab(r, 'review')).length
  }, [siteMaterialsRequest])

  const pendingToolsCount = useMemo(() => {
    return siteToolsRequest.filter((t) => matchesToolSubTab(t, 'review')).length
  }, [siteToolsRequest])

  const pendingStagesCount = useMemo(() => {
    return siteSupervisorProjectStageSchedule.filter((s) => matchesStageSubTab(s, 'review')).length
  }, [siteSupervisorProjectStageSchedule])

  // Subtab count maps for current active stream
  const subTabCounts = useMemo(() => {
    const tabs = ['review', 'org', 'clearance', 'approved', 'rejected']
    const counts = {}

    if (activeStream === 'payments') {
      tabs.forEach((tab) => {
        counts[tab] = siteSupervisorEntries.filter((e) => matchesPaymentSubTab(e, tab)).length
      })
    } else if (activeStream === 'materials') {
      tabs.forEach((tab) => {
        counts[tab] = siteMaterialsRequest.filter((r) => matchesMaterialSubTab(r, tab)).length
      })
    } else if (activeStream === 'tools') {
      tabs.forEach((tab) => {
        counts[tab] = siteToolsRequest.filter((t) => matchesToolSubTab(t, tab)).length
      })
    } else if (activeStream === 'stages') {
      tabs.forEach((tab) => {
        counts[tab] = siteSupervisorProjectStageSchedule.filter((s) => matchesStageSubTab(s, tab)).length
      })
    }

    return counts
  }, [
    activeStream,
    siteSupervisorEntries,
    siteMaterialsRequest,
    siteToolsRequest,
    siteSupervisorProjectStageSchedule,
  ])

  // Filtered lists for each stream applying subTab, siteFilter, and search
  const filteredPayments = useMemo(() => {
    const q = search.toLowerCase().trim()
    return siteSupervisorEntries.filter((entry) => {
      if (!matchesPaymentSubTab(entry, subTab)) return false
      if (siteFilter !== 'all' && entry.siteId !== siteFilter) return false
      if (q) {
        const siteName = (siteMap[entry.siteId] || '').toLowerCase()
        const sup = (entry.supervisorName || '').toLowerCase()
        const id = (entry.id || '').toLowerCase()
        const stage = (entry.projectStage || '').toLowerCase()
        if (!siteName.includes(q) && !sup.includes(q) && !id.includes(q) && !stage.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [siteSupervisorEntries, subTab, siteFilter, search, siteMap])

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase().trim()
    return siteMaterialsRequest.filter((req) => {
      if (!matchesMaterialSubTab(req, subTab)) return false
      if (siteFilter !== 'all' && req.siteId !== siteFilter) return false
      if (q) {
        const mat = (getMaterialItemDisplay(req) || '').toLowerCase()
        const siteName = (siteMap[req.siteId] || '').toLowerCase()
        const id = (req.requestId || req.id || '').toLowerCase()
        const cat = (getMaterialCategoryDisplay(req) || '').toLowerCase()
        if (!mat.includes(q) && !siteName.includes(q) && !id.includes(q) && !cat.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [siteMaterialsRequest, subTab, siteFilter, search, siteMap])

  const filteredTools = useMemo(() => {
    const q = search.toLowerCase().trim()
    return siteToolsRequest.filter((tool) => {
      if (!matchesToolSubTab(tool, subTab)) return false
      if (siteFilter !== 'all' && tool.siteId !== siteFilter) return false
      if (q) {
        const toolName = (tool.toolName || '').toLowerCase()
        const siteName = (siteMap[tool.siteId] || '').toLowerCase()
        const id = (tool.requestId || tool.id || '').toLowerCase()
        const serial = (tool.assignedSerialId || '').toLowerCase()
        if (!toolName.includes(q) && !siteName.includes(q) && !id.includes(q) && !serial.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [siteToolsRequest, subTab, siteFilter, search, siteMap])

  const filteredStages = useMemo(() => {
    const q = search.toLowerCase().trim()
    return siteSupervisorProjectStageSchedule.filter((stg) => {
      if (!matchesStageSubTab(stg, subTab)) return false
      if (siteFilter !== 'all' && stg.siteId !== siteFilter) return false
      if (q) {
        const stageName = (stg.stageName || stg.name || '').toLowerCase()
        const siteName = (siteMap[stg.siteId] || '').toLowerCase()
        if (!stageName.includes(q) && !siteName.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [siteSupervisorProjectStageSchedule, subTab, siteFilter, search, siteMap])

  // Handlers
  async function handleVerifyPayment(entry) {
    if (!window.confirm(`Verify and forward expense of ${money(entry.totalAmount)} to Organization HQ?`)) return
    setActionLoading(true)
    try {
      await managerReviewSitePayment(orgId, entry.id, 'VERIFY', 'Verified by Operations Manager', managerActor)
      showMsg('success', 'Payment verified and forwarded to Organization HQ for Tier-2 authorization.')
    } catch (err) {
      showMsg('error', err.message || 'Verification failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleLinkPettyCash(entry) {
    if (!window.confirm(`Fund claim of ${money(entry.totalAmount)} directly from site petty cash float?`)) return
    setActionLoading(true)
    try {
      await linkSitePaymentToPettyCash(orgId, entry.id, entry.siteId, null, managerActor)
      showMsg('success', 'Claim approved and linked to Site Petty Cash float.')
    } catch (err) {
      showMsg('error', err.message || 'Failed to link to petty cash')
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePaymentClearanceSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerClearSitePayment(orgId, selectedItem.id, utrReference.trim(), managerActor)
      showMsg('success', `Payment claim disbursed and settled. Ref: ${utrReference.trim() || 'CASH_DISBURSED'}`)
      setIsPaymentClearanceModalOpen(false)
      setSelectedItem(null)
      setUtrReference('')
    } catch (err) {
      showMsg('error', err.message || 'Disbursement clearance failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRejectSubmit(e) {
    e.preventDefault()
    if (!selectedItem || !rejectReason.trim()) {
      showMsg('error', 'Rejection reason is required.')
      return
    }
    setActionLoading(true)
    try {
      if (activeStream === 'payments') {
        await managerReviewSitePayment(orgId, selectedItem.id, 'REJECT', rejectReason.trim(), managerActor)
      } else if (activeStream === 'materials') {
        await managerReviewMaterialOrder(orgId, selectedItem.id, false, 0, rejectReason.trim(), managerActor)
      } else if (activeStream === 'tools') {
        await managerApproveToolRequest(orgId, selectedItem.id, false, rejectReason.trim(), managerActor)
      }
      showMsg('success', 'Item rejected and feedback recorded.')
      setIsRejectModalOpen(false)
      setSelectedItem(null)
      setRejectReason('')
    } catch (err) {
      showMsg('error', err.message || 'Failed to reject')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMaterialApproveSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerReviewMaterialOrder(orgId, selectedItem.id, true, Number(approvedQty), vendorNotes, managerActor)
      showMsg('success', 'Material order verified & forwarded to Organization HQ for procurement authorization.')
      setIsMaterialModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      showMsg('error', err.message || 'Failed to approve material request')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleGatePassSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerClearMaterialOrder(orgId, selectedItem.id, gatePassNo.trim(), managerActor, dispatchRemarks.trim())
      showMsg('success', `Gate Pass #${gatePassNo || 'GP-AUTO'} issued. Materials dispatched to site.`)
      setIsGatePassModalOpen(false)
      setSelectedItem(null)
      setGatePassNo('')
      setDispatchRemarks('')
    } catch (err) {
      showMsg('error', err.message || 'Failed to issue gate pass')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleToolApproveSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerApproveToolRequest(orgId, selectedItem.id, true, assetSerialId.trim(), managerActor)
      showMsg('success', 'Tool allocation approved with yard asset tag assigned.')
      setIsToolModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      showMsg('error', err.message || 'Failed to approve tool request')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleToolDispatchSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerDispatchTool(orgId, selectedItem.id, toolDispatchNotes.trim(), managerActor)
      showMsg('success', `Equipment ${selectedItem.toolName} dispatched from yard to site.`)
      setIsToolDispatchModalOpen(false)
      setSelectedItem(null)
      setToolDispatchNotes('')
    } catch (err) {
      showMsg('error', err.message || 'Failed to dispatch equipment')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReceiptConfirmSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      if (receiptType === 'material') {
        await confirmMaterialReceipt(orgId, selectedItem.id, receiptNotes.trim(), managerActor)
        showMsg('success', 'Site physical delivery verified and confirmed into site inventory.')
      } else {
        await confirmToolReceipt(orgId, selectedItem.id, receiptNotes.trim(), managerActor)
        showMsg('success', 'Equipment arrival and physical condition verified at site.')
      }
      setIsReceiptConfirmModalOpen(false)
      setSelectedItem(null)
      setReceiptNotes('')
    } catch (err) {
      showMsg('error', err.message || 'Failed to confirm receipt')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleToolReturnSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerConfirmToolReturn(orgId, selectedItem.id, returnCondition, managerActor)
      showMsg('success', `Tool returned to central yard with condition tagged as ${returnCondition}.`)
      setIsReturnConditionModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      showMsg('error', err.message || 'Failed to confirm return')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMilestoneApproveSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerApproveStageMilestone(orgId, selectedItem.id, milestoneQualityNotes, managerActor)
      showMsg('success', 'Stage milestone inspected & verified! Subsequent stage unlocked.')
      setIsMilestoneModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      showMsg('error', err.message || 'Failed to approve milestone')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback.text && (
        <div
          className={`p-4 rounded-xl text-xs font-bold border shadow-xs animate-fade-in flex items-center justify-between ${
            feedback.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <span>{feedback.type === 'error' ? '⚠️ ' : '✅ '}{feedback.text}</span>
          <button type="button" onClick={() => setFeedback({ type: '', text: '' })}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 text-blue-800">
              Operations Control
            </span>
            <span className="text-xs text-slate-400 font-mono">/ Management Approvals</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Approvals Center</h1>
          <p className="text-xs text-slate-500">
            Multi-Tier technical review and sign-off gateway for site finances, raw materials, plant tools, and construction milestones
          </p>
        </div>

        {/* Global Action: Create Requisition */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Request</span>
          </button>
        </div>
      </div>

      {/* 4 Core Operational Stream Cards (2x2 Bento) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { id: 'payments', label: '1. Site Payments', desc: 'Labour wages & expense claims', count: pendingPaymentsCount, icon: '💳', color: 'blue' },
          { id: 'materials', label: '2. Material Orders', desc: 'Raw cement, steel & sand orders', count: pendingMaterialsCount, icon: '📦', color: 'amber' },
          { id: 'tools', label: '3. Tools & Plant', desc: 'Machinery & equipment dispatch', count: pendingToolsCount, icon: '⚙️', color: 'emerald' },
          { id: 'stages', label: '4. Stage Milestones', desc: 'Quality checks & stage handovers', count: pendingStagesCount, icon: '🏗️', color: 'indigo' },
        ].map((stream) => {
          const active = activeStream === stream.id
          return (
            <button
              key={stream.id}
              type="button"
              onClick={() => {
                setActiveStream(stream.id)
                setSubTab('review')
              }}
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                active
                  ? 'bg-white border-[#0B3470] shadow-md ring-2 ring-blue-600/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{stream.icon}</span>
                {stream.count > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-xs animate-pulse">
                    {stream.count} Pending
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                    Clear
                  </span>
                )}
              </div>
              <div className="mt-3">
                <h3 className="font-bold text-slate-900 text-sm">{stream.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{stream.desc}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Main Approval Stream Surface */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Sub-Tabs & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 px-4 pt-2 gap-2 bg-slate-50/50">
          <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
            {[
              { id: 'review', label: '1. MGR REVIEW' },
              { id: 'org', label: '2. ORG APPROVAL' },
              { id: 'clearance', label: '3. MGR CLEARANCE' },
              { id: 'approved', label: '4. APPROVED & SETTLED' },
              { id: 'rejected', label: '5. DECLINED' },
            ].map((tab) => {
              const active = subTab === tab.id
              const count = subTabCounts[tab.id] || 0
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 pb-2 sm:pb-0">
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-600"
            >
              <option value="all">All Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.projectName || s.id}
                </option>
              ))}
            </select>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 w-36 sm:w-48"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* STREAM 1: SITE PAYMENTS */}
        {/* ------------------------------------------------------------- */}
        {activeStream === 'payments' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Supervisor Daily Expense Claims</h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredPayments.length} item{filteredPayments.length !== 1 ? 's' : ''} in{' '}
                  <span className="font-semibold text-blue-700">{subTab.toUpperCase()}</span> stage
                </p>
              </div>
              <ExportButton
                data={filteredPayments.map((e) => ({
                  ID: e.id,
                  Site: siteMap[e.siteId] || e.siteId,
                  Supervisor: e.supervisorName,
                  MaterialsCost: e.materialsCost,
                  LabourCost: e.labourCost,
                  Sundries: (Number(e.foodCost) || 0) + (Number(e.transportCost) || 0) + (Number(e.fuelCost) || 0),
                  TotalAmount: e.totalAmount,
                  Status: e.status,
                  Date: formatDate(e.date),
                }))}
                filename="site_payment_approvals.csv"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Site / Stage</th>
                    <th className="py-2.5 px-3">Supervisor</th>
                    <th className="py-2.5 px-3">Materials Cost</th>
                    <th className="py-2.5 px-3">Labour Wages</th>
                    <th className="py-2.5 px-3">Sundries</th>
                    <th className="py-2.5 px-3">Total Claim</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No payment claims matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((entry) => {
                      const sundries = (Number(entry.foodCost) || 0) + (Number(entry.transportCost) || 0) + (Number(entry.fuelCost) || 0)
                      const isPendingReview = entry.status === 'pending_manager_review' || entry.currentStep === 1
                      const isClearanceReady = entry.status === 'approved_by_org' || entry.status === 'pending_manager_clearance' || entry.currentStep === 3

                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 text-slate-600">{formatDate(entry.date)}</td>
                          <td className="py-2.5 px-3">
                            <strong className="block text-slate-900">{siteMap[entry.siteId] || entry.siteId}</strong>
                            <span className="text-[10px] text-blue-600">{entry.projectStage || 'Foundation'}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{entry.supervisorName || 'Supervisor'}</td>
                          <td className="py-2.5 px-3 text-slate-700">{money(entry.materialsCost)}</td>
                          <td className="py-2.5 px-3 text-slate-700">{money(entry.labourCost)}</td>
                          <td className="py-2.5 px-3 text-slate-500">{money(sundries)}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{money(entry.totalAmount)}</td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={entry.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Inspect Workflow & Audit History Button */}
                              <button
                                type="button"
                                title="View 5-Stage Approval History"
                                onClick={() => {
                                  setSelectedItem(entry)
                                  setIsAuditModalOpen(true)
                                }}
                                className="p-1 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Stage 1 Actions */}
                              {isPendingReview && (
                                <>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => handleVerifyPayment(entry)}
                                    className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                  >
                                    ✓ Verify & Forward
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => handleLinkPettyCash(entry)}
                                    className="px-2 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                                  >
                                    💵 Petty Cash
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => {
                                      setSelectedItem(entry)
                                      setRejectReason('')
                                      setIsRejectModalOpen(true)
                                    }}
                                    className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                  >
                                    ✕ Reject
                                  </button>
                                </>
                              )}

                              {/* Stage 4 Clearance Action */}
                              {isClearanceReady && (
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => {
                                    setSelectedItem(entry)
                                    setUtrReference('')
                                    setIsPaymentClearanceModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                >
                                  Disburse & Clear
                                </button>
                              )}

                              {!isPendingReview && !isClearanceReady && (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {entry.status === 'approved' ? '✓ Settled' : entry.statusDisplay || entry.status}
                                </span>
                              )}
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

        {/* ------------------------------------------------------------- */}
        {/* STREAM 2: MATERIAL ORDERS */}
        {/* ------------------------------------------------------------- */}
        {activeStream === 'materials' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Site Raw Material Requests</h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredMaterials.length} item{filteredMaterials.length !== 1 ? 's' : ''} in{' '}
                  <span className="font-semibold text-blue-700">{subTab.toUpperCase()}</span> stage
                </p>
              </div>
              <ExportButton
                data={filteredMaterials.map((r) => ({
                  ID: r.requestId || r.id,
                  Site: siteMap[r.siteId] || r.siteId,
                  Material: getMaterialItemDisplay(r),
                  RequestedQty: getRequestedQtyDisplay(r),
                  ApprovedQty: getApprovedQtyDisplay(r),
                  Unit: getMaterialUnitDisplay(r),
                  Urgency: r.urgency,
                  Status: r.status,
                  GatePass: r.gatePassNumber || '',
                }))}
                filename="material_indent_approvals.csv"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Req ID</th>
                    <th className="py-2.5 px-3">Site</th>
                    <th className="py-2.5 px-3">Material Item</th>
                    <th className="py-2.5 px-3">Requested Qty</th>
                    <th className="py-2.5 px-3">Approved Qty</th>
                    <th className="py-2.5 px-3">Urgency</th>
                    <th className="py-2.5 px-3">Needed By</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No material requests matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((req) => {
                      const isPendingReview = req.status === 'pending_manager_review' || req.currentStep === 1
                      const isClearanceReady =
                        req.status === 'authorized_for_procurement' ||
                        req.status === 'approved_by_org' ||
                        req.status === 'pending_manager_clearance' ||
                        req.currentStep === 3
                      const isDispatched = req.status === 'dispatched' || (req.currentStep === 4 && !req.receivedAt)

                      return (
                        <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{req.requestId || req.id}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[req.siteId] || req.siteId}</td>
                          <td className="py-2.5 px-3">
                            <strong className="block text-slate-900">{getMaterialItemDisplay(req)}</strong>
                            <span className="text-[10px] text-slate-400">{getMaterialCategoryDisplay(req)}</span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{getRequestedQtyDisplay(req)}</td>
                          <td className="py-2.5 px-3 text-slate-700">{getApprovedQtyDisplay(req)}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              req.urgency === 'Critical' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {req.urgency || 'Normal'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{formatDate(req.neededByDate)}</td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={req.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Audit Trail Inspector */}
                              <button
                                type="button"
                                title="View 5-Stage Approval History"
                                onClick={() => {
                                  setSelectedItem(req)
                                  setIsAuditModalOpen(true)
                                }}
                                className="p-1 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Stage 1: Review & Authorize */}
                              {isPendingReview && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedItem(req)
                                      setApprovedQty(String(req.approvedQty || getMaterialQtyValue(req) || ''))
                                      setVendorNotes('')
                                      setIsMaterialModalOpen(true)
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 shadow-xs"
                                  >
                                    Verify Qty
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedItem(req)
                                      setRejectReason('')
                                      setIsRejectModalOpen(true)
                                    }}
                                    className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                  >
                                    ✕
                                  </button>
                                </>
                              )}

                              {/* Stage 4: Issue Gate Pass & Dispatch */}
                              {isClearanceReady && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(req)
                                    setGatePassNo(`GP-${Date.now().toString().slice(-6)}`)
                                    setDispatchRemarks('')
                                    setIsGatePassModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Issue Gate Pass</span>
                                </button>
                              )}

                              {/* Stage 5: Confirm Physical Receipt at Site */}
                              {isDispatched && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(req)
                                    setReceiptType('material')
                                    setReceiptNotes('Material unloaded at site, quantity & bag seal verified.')
                                    setIsReceiptConfirmModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
                                >
                                  Confirm Receipt
                                </button>
                              )}

                              {!isPendingReview && !isClearanceReady && !isDispatched && (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {req.status === 'received' ? '✓ Received at Site' : req.statusDisplay || req.status}
                                </span>
                              )}
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

        {/* ------------------------------------------------------------- */}
        {/* STREAM 3: TOOLS & MACHINERY */}
        {/* ------------------------------------------------------------- */}
        {activeStream === 'tools' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Plant & Power Tool Requests</h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredTools.length} item{filteredTools.length !== 1 ? 's' : ''} in{' '}
                  <span className="font-semibold text-blue-700">{subTab.toUpperCase()}</span> stage
                </p>
              </div>
              <ExportButton
                data={filteredTools.map((t) => ({
                  ID: t.requestId || t.id,
                  Site: siteMap[t.siteId] || t.siteId,
                  Tool: t.toolName,
                  Quantity: t.quantity,
                  AssetSerial: t.assignedSerialId || '',
                  Status: t.status,
                  ReturnCondition: t.returnCondition || '',
                }))}
                filename="tool_request_approvals.csv"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Req ID</th>
                    <th className="py-2.5 px-3">Site</th>
                    <th className="py-2.5 px-3">Tool Name</th>
                    <th className="py-2.5 px-3">Quantity</th>
                    <th className="py-2.5 px-3">Assigned Asset ID</th>
                    <th className="py-2.5 px-3">Start Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTools.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No equipment requests matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTools.map((tool) => {
                      const isPendingReview = tool.status === 'pending_manager_review' || tool.currentStep === 1
                      const isReadyToDispatch =
                        tool.status === 'approved' ||
                        tool.status === 'allocated' ||
                        tool.status === 'pending_manager_clearance' ||
                        tool.currentStep === 3
                      const isDispatched = tool.status === 'dispatched'
                      const isReceived = tool.status === 'received'

                      return (
                        <tr key={tool.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{tool.requestId || tool.id}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[tool.siteId] || tool.siteId}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{tool.toolName}</td>
                          <td className="py-2.5 px-3 text-slate-800">{tool.quantity || 1} Nos</td>
                          <td className="py-2.5 px-3 font-mono text-blue-700">{tool.assignedSerialId || 'Unassigned'}</td>
                          <td className="py-2.5 px-3 text-slate-500">{formatDate(tool.startDate)}</td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={tool.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Audit Trail Inspector */}
                              <button
                                type="button"
                                title="View 5-Stage Approval History"
                                onClick={() => {
                                  setSelectedItem(tool)
                                  setIsAuditModalOpen(true)
                                }}
                                className="p-1 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Stage 1: Assign Yard Asset Tag */}
                              {isPendingReview && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(tool)
                                    setAssetSerialId(`YARD_${tool.toolName?.replace(/\s+/g, '_')}_01`)
                                    setIsToolModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 shadow-xs"
                                >
                                  Allocate Asset Serial
                                </button>
                              )}

                              {/* Stage 4: Dispatch Tool from Yard */}
                              {isReadyToDispatch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(tool)
                                    setToolDispatchNotes('Dispatched on company equipment truck')
                                    setIsToolDispatchModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Dispatch Tool</span>
                                </button>
                              )}

                              {/* Stage 5: Confirm Site Receipt */}
                              {isDispatched && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(tool)
                                    setReceiptType('tool')
                                    setReceiptNotes('Asset arrived at site yard, operational testing passed.')
                                    setIsReceiptConfirmModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
                                >
                                  Confirm Arrival
                                </button>
                              )}

                              {/* Return Inspection */}
                              {isReceived && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(tool)
                                    setReturnCondition('Working')
                                    setIsReturnConditionModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-xs flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Return to Yard</span>
                                </button>
                              )}

                              {!isPendingReview && !isReadyToDispatch && !isDispatched && !isReceived && (
                                <span className="text-[11px] text-slate-400 font-mono">✓ {tool.status}</span>
                              )}
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

        {/* ------------------------------------------------------------- */}
        {/* STREAM 4: STAGE MILESTONES */}
        {/* ------------------------------------------------------------- */}
        {activeStream === 'stages' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Project Stage Milestones & Quality Sign-Off</h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredStages.length} milestone{filteredStages.length !== 1 ? 's' : ''} in{' '}
                  <span className="font-semibold text-blue-700">{subTab.toUpperCase()}</span> stage
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Order</th>
                    <th className="py-2.5 px-3">Site</th>
                    <th className="py-2.5 px-3">Stage Milestone</th>
                    <th className="py-2.5 px-3">Completion %</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Quality Remarks</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStages.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No milestone schedules registered.
                      </td>
                    </tr>
                  ) : (
                    filteredStages.map((stg) => {
                      const isComplete = stg.status === 'completed' || Boolean(stg.isApproved)
                      return (
                        <tr key={stg.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">#{stg.stageOrder || 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[stg.siteId] || stg.siteId}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{stg.stageName || stg.name}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-blue-700">{stg.completionPercentage || (isComplete ? 100 : 0)}%</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={stg.status || (isComplete ? 'completed' : 'in_progress')} />
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{stg.qualityCheckRemarks || 'Pending final physical inspection'}</td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="View 5-Stage Approval History"
                                onClick={() => {
                                  setSelectedItem(stg)
                                  setIsAuditModalOpen(true)
                                }}
                                className="p-1 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {!isComplete ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(stg)
                                    setMilestoneQualityNotes('Physical QA check verified. Work approved.')
                                    setIsMilestoneModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                >
                                  ✓ Sign Off Milestone
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-600 font-bold font-mono">✓ Signed Off</span>
                              )}
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
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ------------------------------------------------------------- */}

      {/* Create Requisition Modal */}
      <CreateRequisitionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        orgId={orgId}
        currentUser={user}
        sites={sites}
        onSuccess={() => {
          showMsg('success', 'Request successfully submitted to the 5-Stage Approval Pipeline.')
        }}
      />

      {/* Audit Trail & 5-Stage Workflow Modal */}
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => {
          setIsAuditModalOpen(false)
          setSelectedItem(null)
        }}
        title="Request Lifecycle & Audit Trail"
        subtitle={`Item #${selectedItem?.id || selectedItem?.requestId || ''} · ${siteMap[selectedItem?.siteId] || ''}`}
      >
        <div className="p-6 space-y-4">
          <ApprovalWorkflowStepper
            currentStep={selectedItem?.currentStep || 1}
            status={selectedItem?.status || ''}
            history={selectedItem?.approvalHistory || []}
          />
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAuditModalOpen(false)
                setSelectedItem(null)
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Rejection Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Request / Payment Claim"
        subtitle="Mandatory feedback will be recorded and notified to the submitter"
      >
        <form onSubmit={handleRejectSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Rejection *</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Quantity discrepancy / Ineligible expenditure / Over sanctioned rate"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsRejectModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Material Review Modal (Stage 2) */}
      <Modal
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
        title="Authorize Raw Material Order"
        subtitle={`Item: ${getMaterialItemDisplay(selectedItem)} for ${siteMap[selectedItem?.siteId] || selectedItem?.siteId}`}
      >
        <form onSubmit={handleMaterialApproveSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Approved Quantity {getMaterialUnitDisplay(selectedItem) ? `(${getMaterialUnitDisplay(selectedItem)})` : ''} *
              </label>
              <input
                type="number"
                value={approvedQty}
                onChange={(e) => setApprovedQty(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Supplier / Vendor</label>
              <input
                type="text"
                defaultValue={selectedItem?.preferredVendor || 'Approved Vendor'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Notes / Delivery Instructions</label>
            <input
              type="text"
              value={vendorNotes}
              onChange={(e) => setVendorNotes(e.target.value)}
              placeholder="e.g. Schedule delivery by Friday morning before concrete pour"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsMaterialModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Saving...' : 'Authorize Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Material Clearance Gate Pass Modal (Stage 4) */}
      <Modal
        isOpen={isGatePassModalOpen}
        onClose={() => setIsGatePassModalOpen(false)}
        title="Issue Warehouse Gate Pass & Clear Dispatch"
        subtitle={`Item: ${getMaterialItemDisplay(selectedItem)} (${getApprovedQtyDisplay(selectedItem) !== '—' ? getApprovedQtyDisplay(selectedItem) : getRequestedQtyDisplay(selectedItem)})`}
      >
        <form onSubmit={handleGatePassSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Gate Pass Number *</label>
            <input
              type="text"
              value={gatePassNo}
              onChange={(e) => setGatePassNo(e.target.value)}
              placeholder="e.g. GP-2026-8812"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold outline-none focus:border-blue-600"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Dispatch Remarks / Vehicle Details</label>
            <textarea
              rows={2}
              value={dispatchRemarks}
              onChange={(e) => setDispatchRemarks(e.target.value)}
              placeholder="e.g. Loaded onto Truck MH-12-AB-3421 with original challan copy"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsGatePassModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Issuing...' : 'Issue Gate Pass & Dispatch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Clearance & UTR Modal (Stage 4) */}
      <Modal
        isOpen={isPaymentClearanceModalOpen}
        onClose={() => setIsPaymentClearanceModalOpen(false)}
        title="Disburse Payment & Record Settlement"
        subtitle={`Amount: ${money(selectedItem?.totalAmount)} for ${siteMap[selectedItem?.siteId] || ''}`}
      >
        <form onSubmit={handlePaymentClearanceSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bank UTR / Transaction Reference *</label>
            <input
              type="text"
              value={utrReference}
              onChange={(e) => setUtrReference(e.target.value)}
              placeholder="e.g. UTR-HDFC-9921481 or CASH_DISBURSED"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold outline-none focus:border-blue-600"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsPaymentClearanceModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Disbursing...' : 'Confirm Disbursement'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tool Allocation Modal (Stage 2) */}
      <Modal
        isOpen={isToolModalOpen}
        onClose={() => setIsToolModalOpen(false)}
        title="Assign Asset Serial from Yard"
        subtitle={`Allocate ${selectedItem?.toolName} to ${siteMap[selectedItem?.siteId] || selectedItem?.siteId}`}
      >
        <form onSubmit={handleToolApproveSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Asset Serial / Barcode ID *</label>
            <input
              type="text"
              value={assetSerialId}
              onChange={(e) => setAssetSerialId(e.target.value)}
              placeholder="e.g. YARD_MIXER_04 or AST-7819"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-mono font-bold"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsToolModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Authorizing...' : 'Authorize & Tag Asset'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tool Dispatch Modal (Stage 4) */}
      <Modal
        isOpen={isToolDispatchModalOpen}
        onClose={() => setIsToolDispatchModalOpen(false)}
        title="Dispatch Machinery from Central Yard"
        subtitle={`Tool: ${selectedItem?.toolName} (Asset Tag: ${selectedItem?.assignedSerialId})`}
      >
        <form onSubmit={handleToolDispatchSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Dispatch Remarks / Vehicle Details</label>
            <textarea
              rows={2}
              value={toolDispatchNotes}
              onChange={(e) => setToolDispatchNotes(e.target.value)}
              placeholder="e.g. Transported via company recovery trailer"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsToolDispatchModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Dispatching...' : 'Confirm Dispatch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Site Receipt Confirmation Modal (Stage 5) */}
      <Modal
        isOpen={isReceiptConfirmModalOpen}
        onClose={() => setIsReceiptConfirmModalOpen(false)}
        title="Confirm Physical Delivery at Construction Site"
        subtitle={`Verifying delivery of ${receiptType === 'material' ? getMaterialItemDisplay(selectedItem) : selectedItem?.toolName}`}
      >
        <form onSubmit={handleReceiptConfirmSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Site Receipt Inspection Remarks</label>
            <textarea
              rows={3}
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="e.g. Unloaded at site yard, bag count matches invoice, quality verified"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsReceiptConfirmModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Confirming...' : 'Confirm Receipt at Site'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tool Return Condition Modal */}
      <Modal
        isOpen={isReturnConditionModalOpen}
        onClose={() => setIsReturnConditionModalOpen(false)}
        title="Confirm Equipment Return to Yard"
        subtitle={`Tool: ${selectedItem?.toolName} (${selectedItem?.assignedSerialId || ''})`}
      >
        <form onSubmit={handleToolReturnSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Inspection Condition *</label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-semibold"
            >
              <option value="Working">Working / Good Condition (Return to Stock)</option>
              <option value="Needs Service">Needs Service / Overhaul Required</option>
              <option value="Damaged">Damaged / Repair Needed</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsReturnConditionModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Confirming...' : 'Confirm Return & Update Yard'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stage Milestone Modal */}
      <Modal
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        title="Sign Off Project Stage Milestone"
        subtitle={`Milestone: ${selectedItem?.stageName || selectedItem?.name} for ${siteMap[selectedItem?.siteId] || selectedItem?.siteId}`}
      >
        <form onSubmit={handleMilestoneApproveSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Quality Inspection Remarks & Sign-Off Notes *</label>
            <textarea
              rows={3}
              value={milestoneQualityNotes}
              onChange={(e) => setMilestoneQualityNotes(e.target.value)}
              placeholder="e.g. Concrete cube compression strength test passed. Rebar placement verified against drawing Rev 2."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsMilestoneModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer">
              {actionLoading ? 'Signing Off...' : 'Confirm Milestone Sign-Off'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
