import React, { useState, useMemo } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import {
  managerReviewSitePayment,
  linkSitePaymentToPettyCash,
  managerClearSitePayment,
  managerReviewMaterialOrder,
  managerClearMaterialOrder,
  managerApproveToolRequest,
  managerDispatchTool,
  managerConfirmToolReturn,
  managerApproveStageMilestone,
} from '../../../services/approvalService.js'

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
  const [subTab, setSubTab] = useState('review') // 'review' | 'org' | 'clearance' | 'approved'
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')

  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })

  function showMsg(type, text) {
    setFeedback({ type, text })
    setTimeout(() => setFeedback({ type: '', text: '' }), 5000)
  }

  // Modals state
  const [selectedItem, setSelectedItem] = useState(null)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false)
  const [approvedQty, setApprovedQty] = useState('')
  const [vendorNotes, setVendorNotes] = useState('')

  const [isToolModalOpen, setIsToolModalOpen] = useState(false)
  const [assetSerialId, setAssetSerialId] = useState('')

  const [isReturnConditionModalOpen, setIsReturnConditionModalOpen] = useState(false)
  const [returnCondition, setReturnCondition] = useState('Working')

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

  // Stream Counts
  const pendingPaymentsCount = useMemo(() => {
    return siteSupervisorEntries.filter((e) => e.status === 'pending_manager_review').length
  }, [siteSupervisorEntries])

  const pendingMaterialsCount = useMemo(() => {
    return siteMaterialsRequest.filter((r) => r.status === 'pending_manager_review').length
  }, [siteMaterialsRequest])

  const pendingToolsCount = useMemo(() => {
    return siteToolsRequest.filter((t) => t.status === 'pending_manager_review').length
  }, [siteToolsRequest])

  const pendingStagesCount = useMemo(() => {
    return siteSupervisorProjectStageSchedule.filter((s) => s.status === 'in_progress' || s.status === 'pending').length
  }, [siteSupervisorProjectStageSchedule])

  // Handlers
  async function handleVerifyPayment(entry) {
    if (!window.confirm(`Verify and forward expense of ${money(entry.totalAmount)} to Organization HQ?`)) return
    setActionLoading(true)
    try {
      await managerReviewSitePayment(orgId, entry.id, 'VERIFY', 'Verified by Operations Manager', managerActor)
      showMsg('success', 'Payment verified and forwarded to Organization HQ for Tier-2 approval.')
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
      }
      showMsg('success', 'Item rejected with feedback recorded.')
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
      showMsg('success', 'Material order verified & forwarded for procurement.')
      setIsMaterialModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      showMsg('error', err.message || 'Failed to approve material request')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleToolApproveSubmit(e) {
    e.preventDefault()
    if (!selectedItem) return
    setActionLoading(true)
    try {
      await managerApproveToolRequest(orgId, selectedItem.id, assetSerialId.trim(), managerActor)
      showMsg('success', 'Tool allocation approved with yard asset tag assigned.')
      setIsToolModalOpen(false)
      setSelectedItem(null)
    } catch (err) {
      showMsg('error', err.message || 'Failed to approve tool request')
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
              className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                active
                  ? 'bg-white border-[#0B3470] shadow-md ring-2 ring-blue-600/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{stream.icon}</span>
                {stream.count > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-xs animate-pulse">
                    {stream.count} Overdue
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
            ].map((tab) => {
              const active = subTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#0B3470] shadow-xs border border-slate-200/80 -mb-px'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
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
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 w-36 sm:w-48"
            />
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
                <p className="text-xs text-slate-500">Review itemized materials, labour muster roll, and food/transport sundries</p>
              </div>
              <ExportButton
                data={siteSupervisorEntries.map((e) => ({
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
                  {siteSupervisorEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No payment claims recorded.
                      </td>
                    </tr>
                  ) : (
                    siteSupervisorEntries.map((entry) => {
                      const sundries = (Number(entry.foodCost) || 0) + (Number(entry.transportCost) || 0) + (Number(entry.fuelCost) || 0)
                      const isPending = entry.status === 'pending_manager_review'
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
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
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
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">
                                {entry.status === 'approved' ? '✓ Settled' : 'Processed'}
                              </span>
                            )}
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
                <h3 className="text-sm font-bold text-slate-900">Site Raw Material Requisitions</h3>
                <p className="text-xs text-slate-500">Review required quantities, urgency, vendor quotes, and delivery timelines</p>
              </div>
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
                  {siteMaterialsRequest.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No material requests pending.
                      </td>
                    </tr>
                  ) : (
                    siteMaterialsRequest.map((req) => {
                      const isPending = req.status === 'pending_manager_review'
                      return (
                        <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{req.requestId || req.id}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[req.siteId] || req.siteId}</td>
                          <td className="py-2.5 px-3">
                            <strong className="block text-slate-900">{req.materialName}</strong>
                            <span className="text-[10px] text-slate-400">{req.category}</span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{req.requestedQty} {req.unit}</td>
                          <td className="py-2.5 px-3 text-slate-700">{req.approvedQty ? `${req.approvedQty} ${req.unit}` : '—'}</td>
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
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItem(req)
                                    setApprovedQty(String(req.requestedQty || ''))
                                    setVendorNotes('')
                                    setIsMaterialModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 shadow-xs"
                                >
                                  Review & Authorize
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
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">✓ Processed</span>
                            )}
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
                <h3 className="text-sm font-bold text-slate-900">Plant & Power Tool Requisitions</h3>
                <p className="text-xs text-slate-500">Assign yard assets, issue site dispatch gate passes, and inspect returned conditions</p>
              </div>
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
                  {siteToolsRequest.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No equipment requisitions logged.
                      </td>
                    </tr>
                  ) : (
                    siteToolsRequest.map((tool) => {
                      const isPending = tool.status === 'pending_manager_review'
                      const isDispatched = tool.status === 'dispatched'
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
                            {isPending ? (
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
                            ) : isDispatched ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedItem(tool)
                                  setReturnCondition('Working')
                                  setIsReturnConditionModalOpen(true)
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                              >
                                Confirm Return
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">✓ {tool.status}</span>
                            )}
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
                <p className="text-xs text-slate-500">Sign off completion of construction stages and unlock subsequent Gantt phases</p>
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
                  {siteSupervisorProjectStageSchedule.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No milestone schedule registered. Launch a new site in Project & Site Setup to initialize milestones.
                      </td>
                    </tr>
                  ) : (
                    siteSupervisorProjectStageSchedule.map((stg) => {
                      const isComplete = stg.status === 'completed' || stg.isApproved
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
      {/* Rejection Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Requisition / Payment Claim"
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
            <button type="button" onClick={() => setIsRejectModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs">
              {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Material Review Modal */}
      <Modal
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
        title="Authorize Raw Material Order"
        subtitle={`Item: ${selectedItem?.materialName} for ${siteMap[selectedItem?.siteId] || selectedItem?.siteId}`}
      >
        <form onSubmit={handleMaterialApproveSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Approved Quantity ({selectedItem?.unit}) *</label>
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
            <button type="button" onClick={() => setIsMaterialModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs">
              {actionLoading ? 'Saving...' : 'Authorize Requisition'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Tool Allocation Modal */}
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
            <button type="button" onClick={() => setIsToolModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs">
              {actionLoading ? 'Authorizing...' : 'Authorize & Tag Asset'}
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
            <button type="button" onClick={() => setIsReturnConditionModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
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
            <button type="button" onClick={() => setIsMilestoneModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
              {actionLoading ? 'Signing Off...' : 'Confirm Milestone Sign-Off'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
