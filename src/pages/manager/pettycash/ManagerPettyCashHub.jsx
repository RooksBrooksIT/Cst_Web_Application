import React, { useState, useMemo } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import DataTable from '../../../components/common/DataTable'
import FilterBar from '../../../components/common/FilterBar'
import ExportButton from '../../../components/common/ExportButton'
import {
  PETTY_CASH_REQUEST_STATUS,
  PETTY_CASH_EXPENSE_STATUS,
  PETTY_CASH_RECONCILIATION_STATUS,
  PETTY_CASH_RETURN_STATUS,
  SITE_EXPENSE_CATEGORIES,
  managerReviewRequest,
  managerDisburseFunds,
  confirmAmountReceived,
  submitPettyCashExpense,
  managerApproveExpense,
  managerRejectExpense,
  submitReconciliation,
  approveReconciliation,
  submitCashReturn,
  confirmCashReturn,
  createProactiveManagerAllocation,
} from '../../../services/pettyCashService'

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

export default function ManagerPettyCashHub({
  sites = [],
  pettyCashAccounts = [],
  pettyCashRequests = [],
  pettyCashExpenses = [],
  pettyCashTransactions = [],
  pettyCashReconciliations = [],
  pettyCashReturns = [],
  pettyCashAuditLogs = [],
}) {
  const { orgId, user, userData } = useAuth()
  const managerActor = {
    id: user?.uid || 'manager_uid',
    name: userData?.fullName || userData?.FullName || userData?.name || 'Operations Manager',
    role: 'Manager',
  }

  // Active Tab State
  const [activeTab, setActiveTab] = useState('requests') // requests, expenses, field-ops, reconciliations, wallets
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')

  // Feedback & Loading State
  const [actionLoading, setActionLoading] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState({ type: '', text: '' })

  function showMessage(type, text) {
    setFeedbackMsg({ type, text })
    setTimeout(() => setFeedbackMsg({ type: '', text: '' }), 5000)
  }

  // Receipt Lightbox Modal
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [lightboxTitle, setLightboxTitle] = useState('')

  // 1. Proactive Manager Allocation Modal
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false)
  const [allocationForm, setAllocationForm] = useState({
    siteId: '',
    allocatedAmount: '',
    purpose: '',
    fundType: 'INITIAL_FLOAT', // INITIAL_FLOAT | TOP_UP
  })

  // 2. Request Review Modal (Verify & Forward or Reject)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [reviewDecision, setReviewDecision] = useState('VERIFY') // VERIFY | REJECT
  const [reviewRemarks, setReviewRemarks] = useState('')

  // 3. Disburse Funds Modal
  const [isDisburseModalOpen, setIsDisburseModalOpen] = useState(false)
  const [disburseRequest, setDisburseRequest] = useState(null)
  const [disburseAmount, setDisburseAmount] = useState('')
  const [disburseMethod, setDisburseMethod] = useState('Cash')
  const [disburseRemarks, setDisburseRemarks] = useState('')

  // 4. Reject Expense Modal
  const [isRejectExpenseModalOpen, setIsRejectExpenseModalOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [rejectExpenseReason, setRejectExpenseReason] = useState('')

  // 5. Field Expense Submission Form
  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    siteId: '',
    amount: '',
    category: SITE_EXPENSE_CATEGORIES[0],
    purpose: '',
    paidTo: '',
    spentBy: managerActor.name,
    receiptUrl: '',
    noReceiptReason: '',
    expenseDate: new Date().toISOString().split('T')[0],
  })

  // 6. Reconciliation Modal
  const [isReconModalOpen, setIsReconModalOpen] = useState(false)
  const [reconSiteId, setReconSiteId] = useState('')
  const [denominations, setDenominations] = useState({
    d2000: 0,
    d500: 0,
    d200: 0,
    d100: 0,
    d50: 0,
    d20: 0,
    d10: 0,
    coins: 0,
  })
  const [reconNotes, setReconNotes] = useState('')

  // 7. Cash Return Modal
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [returnForm, setReturnForm] = useState({
    siteId: '',
    returnAmount: '',
    reason: 'Site Work Phase Completed',
    method: 'Cash',
    notes: '',
  })

  // Denomination Count Calculation
  const countedPhysicalTotal = useMemo(() => {
    return (
      (Number(denominations.d2000) || 0) * 2000 +
      (Number(denominations.d500) || 0) * 500 +
      (Number(denominations.d200) || 0) * 200 +
      (Number(denominations.d100) || 0) * 100 +
      (Number(denominations.d50) || 0) * 50 +
      (Number(denominations.d20) || 0) * 20 +
      (Number(denominations.d10) || 0) * 10 +
      (Number(denominations.coins) || 0)
    )
  }, [denominations])

  // Aggregate Metrics
  const totalAvailableFloat = useMemo(() => {
    return pettyCashAccounts.reduce((acc, a) => acc + (Number(a.availableBalance) || 0), 0)
  }, [pettyCashAccounts])

  const pendingRequestsCount = useMemo(() => {
    return pettyCashRequests.filter(
      (r) => r.status === PETTY_CASH_REQUEST_STATUS.PENDING_MANAGER_REVIEW
    ).length
  }, [pettyCashRequests])

  const awaitingDisbursementCount = useMemo(() => {
    return pettyCashRequests.filter(
      (r) =>
        r.status === PETTY_CASH_REQUEST_STATUS.AWAITING_DISBURSEMENT ||
        r.status === PETTY_CASH_REQUEST_STATUS.APPROVED
    ).length
  }, [pettyCashRequests])

  const pendingExpensesCount = useMemo(() => {
    return pettyCashExpenses.filter(
      (e) =>
        e.status === PETTY_CASH_EXPENSE_STATUS.PENDING_EXPENSE_REVIEW ||
        String(e.status || '').toLowerCase() === 'submitted'
    ).length
  }, [pettyCashExpenses])

  const lowBalanceSites = useMemo(() => {
    return pettyCashAccounts.filter((a) => {
      const base = Number(a.fundLimit) > 0 ? Number(a.fundLimit) : Number(a.currentCycleAllocated || a.totalAllocated) || 0
      if (base <= 0) return false
      const avail = Number(a.availableBalance) || 0
      return avail <= base * 0.10
    })
  }, [pettyCashAccounts])

  // Map Site ID to Name
  const siteMap = useMemo(() => {
    const map = {}
    sites.forEach((s) => {
      map[s.id] = s.name || s.projectName || s.id
    })
    return map
  }, [sites])

  // Filtered Datasets
  const filteredRequests = useMemo(() => {
    return pettyCashRequests.filter((r) => {
      const matchesSite = siteFilter === 'all' || r.siteId === siteFilter
      const q = search.toLowerCase()
      const matchesQuery =
        !q ||
        (r.requestId || '').toLowerCase().includes(q) ||
        (siteMap[r.siteId] || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        (r.requesterName || '').toLowerCase().includes(q)
      return matchesSite && matchesQuery
    })
  }, [pettyCashRequests, siteFilter, search, siteMap])

  const filteredExpenses = useMemo(() => {
    return pettyCashExpenses.filter((e) => {
      const matchesSite = siteFilter === 'all' || e.siteId === siteFilter
      const q = search.toLowerCase()
      const matchesQuery =
        !q ||
        (e.expenseId || e.voucherNumber || '').toLowerCase().includes(q) ||
        (siteMap[e.siteId] || '').toLowerCase().includes(q) ||
        (e.purpose || '').toLowerCase().includes(q) ||
        (e.paidTo || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q)
      return matchesSite && matchesQuery
    })
  }, [pettyCashExpenses, siteFilter, search, siteMap])

  const awaitingConfirmationReceipts = useMemo(() => {
    return pettyCashRequests.filter(
      (r) =>
        r.status === PETTY_CASH_REQUEST_STATUS.DISBURSED ||
        r.status === PETTY_CASH_REQUEST_STATUS.AWAITING_RECEIPT_CONFIRMATION
    )
  }, [pettyCashRequests])

  // Handlers
  async function handleReviewSubmit(e) {
    e.preventDefault()
    if (!selectedRequest || !orgId) return
    setActionLoading(true)
    try {
      const decision = reviewDecision === 'VERIFY' ? 'VERIFY' : 'REJECT'
      await managerReviewRequest(orgId, selectedRequest.id, decision, reviewRemarks, managerActor)
      showMessage('success', `Request ${selectedRequest.requestId || selectedRequest.id} marked as ${decision === 'VERIFY' ? 'Forwarded to HQ' : 'Rejected'}.`)
      setIsReviewModalOpen(false)
      setSelectedRequest(null)
      setReviewRemarks('')
    } catch (err) {
      showMessage('error', err.message || 'Failed to submit review.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDisburseSubmit(e) {
    e.preventDefault()
    if (!disburseRequest || !orgId) return
    const amt = Number(disburseAmount)
    if (!amt || amt <= 0) {
      showMessage('error', 'Please enter a valid disbursement amount.')
      return
    }
    setActionLoading(true)
    try {
      await managerDisburseFunds(orgId, disburseRequest.id, amt, disburseMethod, disburseRemarks, managerActor)
      showMessage('success', `Funds of ${money(amt)} disbursed via ${disburseMethod}. Awaiting field confirmation.`)
      setIsDisburseModalOpen(false)
      setDisburseRequest(null)
      setDisburseAmount('')
      setDisburseRemarks('')
    } catch (err) {
      showMessage('error', err.message || 'Failed to disburse funds.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleConfirmPhysicalReceipt(req) {
    if (!window.confirm(`Confirm that cash amount of ${money(req.disbursedAmount || req.approvedAmount || req.requestedAmount)} has been physically received in hand for site wallet?`)) return
    setActionLoading(true)
    try {
      await confirmAmountReceived(orgId, req, managerActor)
      showMessage('success', 'Physical cash receipt confirmed! Site available float credited.')
    } catch (err) {
      showMessage('error', err.message || 'Failed to confirm receipt.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleApproveExpense(expense) {
    if (!window.confirm(`Approve expense ${expense.voucherNumber || expense.expenseId} for ${money(expense.amount)} and post to Immutable Ledger?`)) return
    setActionLoading(true)
    try {
      await managerApproveExpense(orgId, expense.id, 'Audited and approved by Operations Manager', managerActor)
      showMessage('success', `Expense ${expense.voucherNumber || expense.expenseId} approved and posted to Ledger.`)
    } catch (err) {
      showMessage('error', err.message || 'Failed to approve expense.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRejectExpenseSubmit(e) {
    e.preventDefault()
    if (!selectedExpense || !rejectExpenseReason.trim()) {
      showMessage('error', 'Rejection reason is mandatory.')
      return
    }
    setActionLoading(true)
    try {
      await managerRejectExpense(orgId, selectedExpense.id, rejectExpenseReason.trim(), managerActor)
      showMessage('success', `Expense rejected. Reserved funds released back to site wallet.`)
      setIsRejectExpenseModalOpen(false)
      setSelectedExpense(null)
      setRejectExpenseReason('')
    } catch (err) {
      showMessage('error', err.message || 'Failed to reject expense.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCreateAllocation(e) {
    e.preventDefault()
    if (!allocationForm.siteId || !allocationForm.allocatedAmount || !allocationForm.purpose) {
      showMessage('error', 'All allocation fields are required.')
      return
    }
    setActionLoading(true)
    try {
      const selectedSite = sites.find((s) => s.id === allocationForm.siteId)
      await createProactiveManagerAllocation(
        orgId,
        {
          siteId: allocationForm.siteId,
          siteName: selectedSite?.name || selectedSite?.projectName || allocationForm.siteId,
          amount: Number(allocationForm.allocatedAmount),
          purpose: allocationForm.purpose,
          fundType: allocationForm.fundType,
        },
        managerActor
      )
      showMessage('success', 'Proactive float allocation initiated and forwarded for HQ authorization.')
      setIsAllocationModalOpen(false)
      setAllocationForm({
        siteId: '',
        allocatedAmount: '',
        purpose: '',
        fundType: 'INITIAL_FLOAT',
      })
    } catch (err) {
      showMessage('error', err.message || 'Failed to initiate allocation.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleFieldExpenseSubmit(e) {
    e.preventDefault()
    if (!expenseForm.siteId || !expenseForm.amount || !expenseForm.purpose || !expenseForm.paidTo) {
      showMessage('error', 'Please fill in all mandatory expense fields.')
      return
    }
    const amt = Number(expenseForm.amount)
    if (amt >= 500 && !expenseForm.receiptUrl && !expenseForm.noReceiptReason.trim()) {
      showMessage('error', 'For expenses of ₹500 or more without a receipt, a valid explanation reason is mandatory.')
      return
    }

    // Check spendable balance
    const targetAccount = pettyCashAccounts.find((a) => a.siteId === expenseForm.siteId)
    const spendable = targetAccount ? Number(targetAccount.spendableBalance ?? (Number(targetAccount.availableBalance || 0) - Number(targetAccount.reservedBalance || 0))) : 0
    if (amt > spendable) {
      showMessage('error', `Insufficient spendable balance! Available: ${money(spendable)}, Requested: ${money(amt)}`)
      return
    }

    setActionLoading(true)
    try {
      const selectedSite = sites.find((s) => s.id === expenseForm.siteId)
      await submitPettyCashExpense(
        orgId,
        {
          siteId: expenseForm.siteId,
          siteName: selectedSite?.name || selectedSite?.projectName || expenseForm.siteId,
          amount: amt,
          category: expenseForm.category,
          purpose: expenseForm.purpose,
          paidTo: expenseForm.paidTo,
          spentBy: expenseForm.spentBy || managerActor.name,
          receiptUrl: expenseForm.receiptUrl || '',
          noReceiptReason: expenseForm.noReceiptReason || '',
          expenseDate: expenseForm.expenseDate,
        },
        managerActor
      )
      showMessage('success', 'Expense voucher submitted! Funds reserved pending approval.')
      setIsNewExpenseModalOpen(false)
      setExpenseForm({
        siteId: '',
        amount: '',
        category: SITE_EXPENSE_CATEGORIES[0],
        purpose: '',
        paidTo: '',
        spentBy: managerActor.name,
        receiptUrl: '',
        noReceiptReason: '',
        expenseDate: new Date().toISOString().split('T')[0],
      })
    } catch (err) {
      showMessage('error', err.message || 'Failed to submit field expense.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReconciliationSubmit(e) {
    e.preventDefault()
    if (!reconSiteId) {
      showMessage('error', 'Please select a site to reconcile.')
      return
    }
    const targetAccount = pettyCashAccounts.find((a) => a.siteId === reconSiteId)
    const systemBalance = targetAccount ? Number(targetAccount.availableBalance) || 0 : 0
    const selectedSite = sites.find((s) => s.id === reconSiteId)

    setActionLoading(true)
    try {
      await submitReconciliation(
        orgId,
        {
          siteId: reconSiteId,
          siteName: selectedSite?.name || selectedSite?.projectName || reconSiteId,
          physicalCashCount: countedPhysicalTotal,
          systemBalance,
          denominations,
          notes: reconNotes,
        },
        managerActor
      )
      showMessage('success', `Physical cash count of ${money(countedPhysicalTotal)} submitted for audit.`)
      setIsReconModalOpen(false)
      setReconSiteId('')
      setDenominations({ d2000: 0, d500: 0, d200: 0, d100: 0, d50: 0, d20: 0, d10: 0, coins: 0 })
      setReconNotes('')
    } catch (err) {
      showMessage('error', err.message || 'Failed to record reconciliation.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReturnSubmit(e) {
    e.preventDefault()
    if (!returnForm.siteId || !returnForm.returnAmount) {
      showMessage('error', 'Site and return amount are required.')
      return
    }
    const amt = Number(returnForm.returnAmount)
    const targetAccount = pettyCashAccounts.find((a) => a.siteId === returnForm.siteId)
    const avail = targetAccount ? Number(targetAccount.availableBalance) || 0 : 0
    if (amt > avail) {
      showMessage('error', `Cannot return ${money(amt)}. Site available balance is only ${money(avail)}.`)
      return
    }

    setActionLoading(true)
    try {
      const selectedSite = sites.find((s) => s.id === returnForm.siteId)
      await submitCashReturn(
        orgId,
        {
          siteId: returnForm.siteId,
          siteName: selectedSite?.name || selectedSite?.projectName || returnForm.siteId,
          returnAmount: amt,
          reason: returnForm.reason,
          paymentMethod: returnForm.method,
          notes: returnForm.notes,
        },
        managerActor
      )
      showMessage('success', `Cash return voucher of ${money(amt)} initiated. Awaiting confirmation.`)
      setIsReturnModalOpen(false)
      setReturnForm({ siteId: '', returnAmount: '', reason: 'Site Work Phase Completed', method: 'Cash', notes: '' })
    } catch (err) {
      showMessage('error', err.message || 'Failed to submit cash return.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleConfirmReturnReceived(ret) {
    if (!window.confirm(`Confirm receipt of ${money(ret.returnAmount)} returned from ${ret.siteName || ret.siteId}? This will atomically update the site account.`)) return
    setActionLoading(true)
    try {
      await confirmCashReturn(orgId, ret.id, 'Cash received and deposited by Operations Manager', managerActor)
      showMessage('success', `Cash return confirmed! Site float updated.`)
    } catch (err) {
      showMessage('error', err.message || 'Failed to confirm cash return.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleApproveRecon(recon) {
    if (!window.confirm(`Approve physical reconciliation record for ${recon.siteName || recon.siteId}?`)) return
    setActionLoading(true)
    try {
      await approveReconciliation(orgId, recon.id, 'Audited and signed off by Operations Manager', managerActor)
      showMessage('success', 'Reconciliation record approved.')
    } catch (err) {
      showMessage('error', err.message || 'Failed to approve reconciliation.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {feedbackMsg.text && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between border shadow-sm animate-fade-in ${
            feedbackMsg.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <span>{feedbackMsg.type === 'error' ? '⚠️ ' : '✅ '}{feedbackMsg.text}</span>
          <button type="button" onClick={() => setFeedbackMsg({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* 10% Low-Balance Warning Alert */}
      {lowBalanceSites.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500 text-white font-black text-lg flex items-center justify-center shadow-xs">
              ⚠️
            </span>
            <div>
              <strong className="block text-sm font-bold text-amber-950">
                Low Balance Alert ({lowBalanceSites.length} Site{lowBalanceSites.length > 1 ? 's' : ''} ≤ 10% Float)
              </strong>
              <p className="text-xs text-amber-800">
                {lowBalanceSites
                  .map((a) => `${siteMap[a.siteId] || a.siteId} (${money(a.availableBalance)})`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAllocationForm({
                siteId: lowBalanceSites[0].siteId,
                allocatedAmount: '25000',
                purpose: 'Emergency 10% Float Replenishment',
                fundType: 'TOP_UP',
              })
              setIsAllocationModalOpen(true)
            }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors shrink-0"
          >
            ＋ Rapid Top-Up Request
          </button>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 text-blue-800">
              Operations Control
            </span>
            <span className="text-xs text-slate-400 font-mono">/ Manager Hub</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Petty Cash Management</h1>
          <p className="text-xs text-slate-500">
            Dual-Control Site Wallets, Request Life-Cycle, Voucher Approvals & Cash Reconciliations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAllocationModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-all flex items-center gap-1.5"
          >
            <span>＋</span> Proactive Site Allocation
          </button>
          <button
            type="button"
            onClick={() => setIsNewExpenseModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs transition-all flex items-center gap-1.5"
          >
            <span>📝</span> Record Field Expense
          </button>
          <button
            type="button"
            onClick={() => setIsReconModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs transition-all flex items-center gap-1.5"
          >
            <span>⚖️</span> Count & Reconcile
          </button>
          <button
            type="button"
            onClick={() => setIsReturnModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs transition-all flex items-center gap-1.5"
          >
            <span>↩️</span> Surrender Cash
          </button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total Live Float</p>
          <h3 className="text-lg font-extrabold text-slate-900 mt-1">{money(totalAvailableFloat)}</h3>
          <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">Across assigned sites</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Pending Review</p>
          <h3 className="text-lg font-extrabold text-amber-600 mt-1">{pendingRequestsCount}</h3>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Requests awaiting manager</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Pending Disbursement</p>
          <h3 className="text-lg font-extrabold text-blue-600 mt-1">{awaitingDisbursementCount}</h3>
          <span className="text-[11px] text-slate-500 mt-0.5 block">HQ authorized, release funds</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Pending Audits</p>
          <h3 className="text-lg font-extrabold text-indigo-600 mt-1">{pendingExpensesCount}</h3>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Vouchers awaiting approval</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-slate-400">Low Float Alert</p>
          <h3 className={`text-lg font-extrabold mt-1 ${lowBalanceSites.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {lowBalanceSites.length}
          </h3>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Sites ≤ 10% threshold</span>
        </div>
      </div>

      {/* Main Tab Navigation & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 px-4 pt-2 gap-2 bg-slate-50/50">
          <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
            {[
              { id: 'requests', label: 'Requests & Disbursals', count: pendingRequestsCount + awaitingDisbursementCount, icon: '📋' },
              { id: 'expenses', label: 'Expense Voucher Audits', count: pendingExpensesCount, icon: '🧾' },
              { id: 'field-ops', label: 'Field Custodian Desk', count: awaitingConfirmationReceipts.length, icon: '👷' },
              { id: 'reconciliations', label: 'Reconciliations & Returns', count: pettyCashReturns.filter((r) => r.status === 'PENDING_RETURN' || r.status === 'PENDING_RETURN_CONFIRMATION').length, icon: '⚖️' },
              { id: 'wallets', label: 'Site Wallets & Ledgers', count: 0, icon: '💼' },
            ].map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>
                      {tab.count}
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
              <option value="all">All Assigned Sites</option>
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

        {/* Tab 1: Requests & Disbursals */}
        {activeTab === 'requests' && (
          <div className="p-5 space-y-6">
            {/* Sub-section 1: Requests Pending Manager Review */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Supervisor Requests Pending Manager Review</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                      {filteredRequests.filter((r) => r.status === PETTY_CASH_REQUEST_STATUS.PENDING_MANAGER_REVIEW).length}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Step 2: Verify and recommend to HQ, or reject with feedback</p>
                </div>
              </div>

              {filteredRequests.filter((r) => r.status === PETTY_CASH_REQUEST_STATUS.PENDING_MANAGER_REVIEW).length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 text-center text-xs text-slate-500">
                  🎉 No supervisor requests currently awaiting manager review.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Req ID</th>
                        <th className="py-2.5 px-3">Site</th>
                        <th className="py-2.5 px-3">Requester</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Category / Reason</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRequests
                        .filter((r) => r.status === PETTY_CASH_REQUEST_STATUS.PENDING_MANAGER_REVIEW)
                        .map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-700 font-bold">{r.requestId || r.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[r.siteId] || r.siteId}</td>
                            <td className="py-2.5 px-3 text-slate-600">{r.requesterName || 'Field Supervisor'}</td>
                            <td className="py-2.5 px-3 font-bold text-blue-700">{money(r.requestedAmount)}</td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={r.reason}>
                              <span className="font-semibold text-slate-800 block text-[11px]">{r.expenseCategory || 'Site Operational Float'}</span>
                              {r.reason}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{formatDate(r.createdAt || r.submittedAt)}</td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRequest(r)
                                    setReviewDecision('VERIFY')
                                    setReviewRemarks('')
                                    setIsReviewModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                >
                                  ✓ Verify & Forward
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRequest(r)
                                    setReviewDecision('REJECT')
                                    setReviewRemarks('')
                                    setIsReviewModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sub-section 2: Awaiting Manager Disbursement */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>HQ Authorized — Awaiting Manager Disbursement</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                      {filteredRequests.filter((r) => r.status === PETTY_CASH_REQUEST_STATUS.AWAITING_DISBURSEMENT || r.status === PETTY_CASH_REQUEST_STATUS.APPROVED).length}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Step 4: HQ has approved. Manager hands over physical cash or executes transfer</p>
                </div>
              </div>

              {filteredRequests.filter((r) => r.status === PETTY_CASH_REQUEST_STATUS.AWAITING_DISBURSEMENT || r.status === PETTY_CASH_REQUEST_STATUS.APPROVED).length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 text-center text-xs text-slate-500">
                  No requests currently awaiting manager disbursement.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Req ID</th>
                        <th className="py-2.5 px-3">Site</th>
                        <th className="py-2.5 px-3">Authorized Amount</th>
                        <th className="py-2.5 px-3">HQ Approver / Notes</th>
                        <th className="py-2.5 px-3">Authorized Date</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRequests
                        .filter((r) => r.status === PETTY_CASH_REQUEST_STATUS.AWAITING_DISBURSEMENT || r.status === PETTY_CASH_REQUEST_STATUS.APPROVED)
                        .map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-700 font-bold">{r.requestId || r.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[r.siteId] || r.siteId}</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-700">{money(r.approvedAmount || r.requestedAmount)}</td>
                            <td className="py-2.5 px-3 text-slate-600">
                              <span className="font-semibold text-slate-800 block text-[11px]">{r.authorizedByName || 'HQ Admin'}</span>
                              <span className="text-slate-500">{r.organizationRemarks || 'Approved'}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{formatDate(r.authorizedAt || r.updatedAt)}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setDisburseRequest(r)
                                  setDisburseAmount(String(r.approvedAmount || r.requestedAmount))
                                  setDisburseMethod('Cash')
                                  setDisburseRemarks('')
                                  setIsDisburseModalOpen(true)
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 shadow-xs transition-colors"
                              >
                                💵 Disburse Funds
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sub-section 3: Full Request History */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">All Request Logs & Progress</h3>
                  <p className="text-xs text-slate-500">Track 5-step lifecycle status of all petty cash allocations</p>
                </div>
                <ExportButton
                  data={filteredRequests.map((r) => ({
                    RequestID: r.requestId || r.id,
                    Site: siteMap[r.siteId] || r.siteId,
                    Requester: r.requesterName || 'N/A',
                    RequestedAmount: r.requestedAmount,
                    ApprovedAmount: r.approvedAmount || 0,
                    Status: r.status,
                    Category: r.expenseCategory || 'General',
                    CreatedDate: formatDate(r.createdAt),
                  }))}
                  filename="manager_petty_cash_requests.csv"
                />
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Req ID</th>
                      <th className="py-2.5 px-3">Site</th>
                      <th className="py-2.5 px-3">Requested</th>
                      <th className="py-2.5 px-3">Approved</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">5-Step Lifecycle</th>
                      <th className="py-2.5 px-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map((r) => {
                      const stepIndex =
                        r.status === 'RECEIVED' || r.status === 'ACTIVE'
                          ? 5
                          : r.status === 'DISBURSED' || r.status === 'AWAITING_RECEIPT_CONFIRMATION'
                          ? 4
                          : r.status === 'APPROVED' || r.status === 'AWAITING_DISBURSEMENT'
                          ? 3
                          : r.status === 'PENDING_ORGANIZATION_APPROVAL'
                          ? 2
                          : r.status === 'PENDING_MANAGER_REVIEW'
                          ? 1
                          : 0
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-700 font-bold">{r.requestId || r.id}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[r.siteId] || r.siteId}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{money(r.requestedAmount)}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-700">{money(r.approvedAmount || 0)}</td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <span
                                  key={s}
                                  className={`w-4 h-1.5 rounded-full ${
                                    s <= stepIndex
                                      ? 'bg-emerald-500'
                                      : 'bg-slate-200'
                                  }`}
                                  title={`Step ${s}`}
                                />
                              ))}
                              <span className="text-[10px] text-slate-400 font-mono ml-1">
                                {stepIndex}/5
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{formatDate(r.updatedAt || r.createdAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Expense Voucher Audits */}
        {activeTab === 'expenses' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Expense Voucher Verification Queue</h3>
                <p className="text-xs text-slate-500">
                  Dual-control audit: Approving an expense atomically deducts balance and logs an immutable ledger entry.
                </p>
              </div>
              <ExportButton
                data={filteredExpenses.map((e) => ({
                  Voucher: e.voucherNumber || e.expenseId,
                  Site: siteMap[e.siteId] || e.siteId,
                  Category: e.category,
                  Amount: e.amount,
                  SpentBy: e.spentBy,
                  PaidTo: e.paidTo,
                  Purpose: e.purpose,
                  Status: e.status,
                  Date: e.expenseDate || formatDate(e.createdAt),
                }))}
                filename="petty_cash_expenses_audit.csv"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Voucher #</th>
                    <th className="py-2.5 px-3">Site</th>
                    <th className="py-2.5 px-3">Category / Payee</th>
                    <th className="py-2.5 px-3">Purpose</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Receipt / Bill</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Audit Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No expense vouchers matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => {
                      const isPending =
                        exp.status === PETTY_CASH_EXPENSE_STATUS.PENDING_EXPENSE_REVIEW ||
                        String(exp.status || '').toLowerCase() === 'submitted'
                      const isHighAmount = Number(exp.amount) >= 500
                      const hasReceipt = Boolean(exp.receiptUrl)

                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            {exp.voucherNumber || exp.expenseId || exp.id}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {siteMap[exp.siteId] || exp.siteId}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-800 block text-[11px]">{exp.category}</span>
                            <span className="text-slate-500">Paid to: {exp.paidTo || exp.spentBy}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={exp.purpose}>
                            {exp.purpose}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {money(exp.amount)}
                          </td>
                          <td className="py-2.5 px-3">
                            {hasReceipt ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setLightboxUrl(exp.receiptUrl)
                                  setLightboxTitle(`Receipt for Voucher: ${exp.voucherNumber || exp.expenseId}`)
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                              >
                                📎 View Receipt
                              </button>
                            ) : isHighAmount ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  No Bill (≥ ₹500)
                                </span>
                                {exp.noReceiptReason && (
                                  <p className="text-[10px] text-slate-500 italic max-w-[140px] truncate" title={exp.noReceiptReason}>
                                    "{exp.noReceiptReason}"
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No bill required</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={exp.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleApproveExpense(exp)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => {
                                    setSelectedExpense(exp)
                                    setRejectExpenseReason('')
                                    setIsRejectExpenseModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">
                                {exp.status === 'EXPENSE_APPROVED' ? '✓ Audited' : '✕ Rejected'}
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

        {/* Tab 3: Field Custodian Desk (Direct Site Operations) */}
        {activeTab === 'field-ops' && (
          <div className="p-5 space-y-6">
            {/* Step 5 Confirmation: Physical Receipt in Hand */}
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                    <span>Awaiting Field Custodian Physical Confirmation</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-200 text-blue-900">
                      {awaitingConfirmationReceipts.length}
                    </span>
                  </h3>
                  <p className="text-xs text-blue-800">
                    Step 5 of Lifecycle: Once cash is physically counted and handed to the site supervisor, confirm receipt to atomically credit the site's available float.
                  </p>
                </div>
              </div>

              {awaitingConfirmationReceipts.length === 0 ? (
                <div className="p-4 rounded-xl bg-white/70 border border-blue-100 text-xs text-blue-700">
                  ✓ All disbursed allocations have been confirmed by site custodians.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {awaitingConfirmationReceipts.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-white border border-blue-200/80 shadow-xs flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <strong className="block text-sm font-bold text-slate-900">
                            {siteMap[req.siteId] || req.siteId}
                          </strong>
                          <span className="text-xs text-slate-500 font-mono">{req.requestId || req.id}</span>
                        </div>
                        <span className="text-base font-black text-emerald-700">
                          {money(req.disbursedAmount || req.approvedAmount || req.requestedAmount)}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 space-y-0.5 bg-slate-50 p-2 rounded-lg">
                        <div><span className="text-slate-400">Payment Mode:</span> {req.paymentMethod || req.paymentMode || 'Cash'}</div>
                        <div><span className="text-slate-400">Disbursed By:</span> {req.disbursedByName || 'Manager'}</div>
                        <div><span className="text-slate-400">Disbursed At:</span> {formatDate(req.disbursedAt)}</div>
                      </div>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleConfirmPhysicalReceipt(req)}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>✓</span> Confirm Physical Cash Received
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Field Operations Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-lg font-bold">
                  📝
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Submit On-Site Expense Voucher</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Record daily site expenses with bill upload and automatic balance reservation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewExpenseModalOpen(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
                >
                  Record Site Expense
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg font-bold">
                  ⚖️
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Physical Cash Denomination Count</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Perform physical note count audit and check discrepancy against system ledger.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReconModalOpen(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
                >
                  Start Physical Count
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg font-bold">
                  ↩️
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Surrender Surplus Site Float</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Return surplus petty cash on project completion or supervisor transfer.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                >
                  Initiate Float Return
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Reconciliations & Returns */}
        {activeTab === 'reconciliations' && (
          <div className="p-5 space-y-6">
            {/* Sub-section 1: Physical Cash Audits */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Physical Cash Reconciliations</h3>
                  <p className="text-xs text-slate-500">Periodic physical cash audits compared against system ledger balance</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReconModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                >
                  ＋ New Physical Count
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Audit ID</th>
                      <th className="py-2.5 px-3">Site</th>
                      <th className="py-2.5 px-3">Counted Physical</th>
                      <th className="py-2.5 px-3">System Ledger</th>
                      <th className="py-2.5 px-3">Discrepancy</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Auditor</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pettyCashReconciliations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No physical reconciliation logs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      pettyCashReconciliations.map((rec) => {
                        const disc = Number(rec.discrepancyAmount || 0)
                        const isPending = rec.status === 'RECONCILIATION_PENDING' || rec.status === 'DISCREPANCY_REVIEW'
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{rec.reconciliationId || rec.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[rec.siteId] || rec.siteId}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{money(rec.physicalCashCount)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{money(rec.systemBalance)}</td>
                            <td className="py-2.5 px-3">
                              {disc === 0 ? (
                                <span className="text-emerald-600 font-bold">Exact Match (₹0)</span>
                              ) : (
                                <span className={`font-bold ${disc < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                                  {disc < 0 ? `Shortage: -${money(Math.abs(disc))}` : `Surplus: +${money(disc)}`}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={rec.status} />
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{rec.auditorName || rec.submittedByName || 'Supervisor'}</td>
                            <td className="py-2.5 px-3 text-right">
                              {isPending ? (
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleApproveRecon(rec)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                >
                                  ✓ Sign Off
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">✓ Signed Off</span>
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

            {/* Sub-section 2: Surplus Cash Returns */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Surplus Cash Returns Queue</h3>
                  <p className="text-xs text-slate-500">Unspent site float returned to headquarters or operations manager</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  ＋ Surrender Cash
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Return ID</th>
                      <th className="py-2.5 px-3">Site</th>
                      <th className="py-2.5 px-3">Return Amount</th>
                      <th className="py-2.5 px-3">Reason</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pettyCashReturns.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No cash returns recorded.
                        </td>
                      </tr>
                    ) : (
                      pettyCashReturns.map((ret) => {
                        const isPending = ret.status === 'PENDING_RETURN' || ret.status === 'PENDING_RETURN_CONFIRMATION' || ret.status === 'INITIATED'
                        return (
                          <tr key={ret.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{ret.returnId || ret.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[ret.siteId] || ret.siteId}</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-700">{money(ret.returnAmount)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{ret.reason}</td>
                            <td className="py-2.5 px-3 text-slate-500">{ret.paymentMethod || 'Cash'}</td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={ret.status} />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {isPending ? (
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handleConfirmReturnReceived(ret)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                                >
                                  ✓ Confirm Receipt
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">✓ Returned</span>
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
          </div>
        )}

        {/* Tab 5: Site Wallets & Ledgers */}
        {activeTab === 'wallets' && (
          <div className="p-5 space-y-6">
            {/* Wallet Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pettyCashAccounts.map((acc) => {
                const siteName = siteMap[acc.siteId] || acc.siteName || acc.siteId
                const available = Number(acc.availableBalance) || 0
                const reserved = Number(acc.reservedBalance) || 0
                const spendable = Number(acc.spendableBalance ?? Math.max(0, available - reserved))
                const totalAlloc = Number(acc.currentCycleAllocated || acc.totalAllocated || acc.fundLimit) || 0
                const isLow = totalAlloc > 0 && available <= totalAlloc * 0.10

                return (
                  <div
                    key={acc.id}
                    className={`p-5 rounded-2xl bg-white border shadow-xs space-y-4 ${
                      isLow ? 'border-amber-300 ring-1 ring-amber-300/60' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <strong className="block text-base font-bold text-slate-900">{siteName}</strong>
                        <span className="text-xs text-slate-400 font-mono">ID: {acc.siteId}</span>
                      </div>
                      {isLow ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                          ⚠️ ≤10% FLOAT
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Healthy Float
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Available</span>
                        <strong className="text-sm font-extrabold text-slate-900">{money(available)}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Spendable</span>
                        <strong className="text-sm font-extrabold text-blue-700">{money(spendable)}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Reserved (Pending)</span>
                        <span className="text-xs font-semibold text-amber-600">{money(reserved)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Cycle Limit</span>
                        <span className="text-xs font-semibold text-slate-700">{money(totalAlloc)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAllocationForm({
                            siteId: acc.siteId,
                            allocatedAmount: '50000',
                            purpose: 'Float Top-Up',
                            fundType: 'TOP_UP',
                          })
                          setIsAllocationModalOpen(true)
                        }}
                        className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors text-center"
                      >
                        ＋ Top-Up Float
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExpenseForm((prev) => ({ ...prev, siteId: acc.siteId }))
                          setIsNewExpenseModalOpen(true)
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"
                      >
                        Add Bill
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Master Immutable Transaction Ledger */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Immutable Master Transaction Ledger</h3>
                  <p className="text-xs text-slate-500">Official double-entry audit trail for all credits and debits</p>
                </div>
                <ExportButton
                  data={pettyCashTransactions.map((tx) => ({
                    TransactionID: tx.transactionId || tx.id,
                    Site: siteMap[tx.siteId] || tx.siteId,
                    Type: tx.type,
                    Amount: tx.amount,
                    OpeningBalance: tx.openingBalance,
                    ClosingBalance: tx.closingBalance,
                    Reference: tx.referenceNumber || 'N/A',
                    Date: formatDate(tx.timestamp || tx.createdAt),
                  }))}
                  filename="petty_cash_master_ledger.csv"
                />
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Txn ID</th>
                      <th className="py-2.5 px-3">Site</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Opening</th>
                      <th className="py-2.5 px-3">Closing</th>
                      <th className="py-2.5 px-3">Reference / Description</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pettyCashTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No transactions recorded in the master ledger yet.
                        </td>
                      </tr>
                    ) : (
                      pettyCashTransactions.map((tx) => {
                        const isCredit =
                          tx.type === 'DISBURSEMENT_CREDIT' ||
                          tx.type === 'INITIAL_ALLOCATION' ||
                          tx.type === 'TOP_UP'
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{tx.transactionId || tx.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{siteMap[tx.siteId] || tx.siteId}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isCredit
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {tx.type}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 font-bold ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {isCredit ? `+${money(tx.amount)}` : `-${money(tx.amount)}`}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{money(tx.openingBalance)}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{money(tx.closingBalance)}</td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={tx.description}>
                              {tx.referenceNumber ? `[Ref: ${tx.referenceNumber}] ` : ''}
                              {tx.description || 'Petty cash ledger entry'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{formatDate(tx.timestamp || tx.createdAt)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Proactive Manager Allocation */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isAllocationModalOpen}
        onClose={() => setIsAllocationModalOpen(false)}
        title="Proactive Site Float Allocation"
        subtitle="Initiate top-up float for site operations and submit for HQ authorization"
      >
        <form onSubmit={handleCreateAllocation} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Site *</label>
            <select
              value={allocationForm.siteId}
              onChange={(e) => setAllocationForm({ ...allocationForm, siteId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            >
              <option value="">Select Project Site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.projectName || s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Allocation Type *</label>
              <select
                value={allocationForm.fundType}
                onChange={(e) => setAllocationForm({ ...allocationForm, fundType: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="TOP_UP">Routine Float Top-Up</option>
                <option value="INITIAL_FLOAT">Initial Site Float</option>
                <option value="EMERGENCY_REPLENISHMENT">Emergency 10% Float Replenishment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹ INR) *</label>
              <input
                type="number"
                value={allocationForm.allocatedAmount}
                onChange={(e) => setAllocationForm({ ...allocationForm, allocatedAmount: e.target.value })}
                placeholder="e.g. 50000"
                min="100"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Purpose & Justification *</label>
            <textarea
              rows={3}
              value={allocationForm.purpose}
              onChange={(e) => setAllocationForm({ ...allocationForm, purpose: e.target.value })}
              placeholder="e.g. Routine petty cash replenishment for daily wages, raw material deliveries, and vehicle diesel."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAllocationModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
            >
              {actionLoading ? 'Submitting...' : 'Submit Allocation Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Request Review (Verify / Reject) */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => {
          setIsReviewModalOpen(false)
          setSelectedRequest(null)
        }}
        title={reviewDecision === 'VERIFY' ? 'Verify & Forward Request to HQ' : 'Reject Supervisor Request'}
        subtitle={`Request ${selectedRequest?.requestId || selectedRequest?.id} for ${siteMap[selectedRequest?.siteId] || selectedRequest?.siteId}`}
      >
        <form onSubmit={handleReviewSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Requested Amount:</span>
              <strong className="text-slate-900 font-bold">{money(selectedRequest?.requestedAmount)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span className="text-slate-800 font-medium">{selectedRequest?.expenseCategory || 'Float'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reason:</span>
              <span className="text-slate-800">{selectedRequest?.reason}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {reviewDecision === 'VERIFY' ? 'Manager Recommendation & Verification Notes' : 'Rejection Reason *'}
            </label>
            <textarea
              rows={3}
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
              placeholder={
                reviewDecision === 'VERIFY'
                  ? 'e.g. Verified with supervisor site needs. Recommended for HQ approval.'
                  : 'Please enter mandatory justification for rejecting this request.'
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required={reviewDecision === 'REJECT'}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-colors ${
                reviewDecision === 'VERIFY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {actionLoading ? 'Processing...' : reviewDecision === 'VERIFY' ? 'Verify & Forward to HQ' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Disburse Funds */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isDisburseModalOpen}
        onClose={() => {
          setIsDisburseModalOpen(false)
          setDisburseRequest(null)
        }}
        title="Disburse Petty Cash Funds"
        subtitle={`Execute physical cash or transfer to ${siteMap[disburseRequest?.siteId] || disburseRequest?.siteId}`}
      >
        <form onSubmit={handleDisburseSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex justify-between items-center">
            <div>
              <span className="text-emerald-800 font-bold block">HQ Authorized Amount</span>
              <span className="text-emerald-600 text-[11px]">Approved by {disburseRequest?.authorizedByName || 'HQ Admin'}</span>
            </div>
            <strong className="text-lg font-black text-emerald-700">
              {money(disburseRequest?.approvedAmount || disburseRequest?.requestedAmount)}
            </strong>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Disbursement Method *</label>
              <select
                value={disburseMethod}
                onChange={(e) => setDisburseMethod(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="Cash">Physical Cash Handover</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI / Digital Wallet</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Disburse Amount (₹ INR) *</label>
              <input
                type="number"
                value={disburseAmount}
                onChange={(e) => setDisburseAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-bold"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Reference / Remarks</label>
            <input
              type="text"
              value={disburseRemarks}
              onChange={(e) => setDisburseRemarks(e.target.value)}
              placeholder="e.g. Cash handed to Supervisor / Cheque #492819"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDisburseModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
            >
              {actionLoading ? 'Disbursing...' : 'Confirm Funds Disbursed'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: Reject Expense Modal */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isRejectExpenseModalOpen}
        onClose={() => {
          setIsRejectExpenseModalOpen(false)
          setSelectedExpense(null)
        }}
        title="Reject Expense Voucher"
        subtitle={`Voucher: ${selectedExpense?.voucherNumber || selectedExpense?.expenseId} (${money(selectedExpense?.amount)})`}
      >
        <form onSubmit={handleRejectExpenseSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-600">
            Rejecting this expense voucher will release the reserved amount of{' '}
            <strong className="text-slate-900">{money(selectedExpense?.amount)}</strong> back to the site's spendable float.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rejection Reason *</label>
            <textarea
              rows={3}
              value={rejectExpenseReason}
              onChange={(e) => setRejectExpenseReason(e.target.value)}
              placeholder="e.g. Missing valid GST receipt / Expenditure exceeds sanctioned limit / Ineligible item"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRejectExpenseModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors"
            >
              {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: Record Field Expense */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isNewExpenseModalOpen}
        onClose={() => setIsNewExpenseModalOpen(false)}
        title="Record On-Site Petty Cash Expense"
        subtitle="Submit a voucher for immediate balance reservation and manager audit"
      >
        <form onSubmit={handleFieldExpenseSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Site *</label>
              <select
                value={expenseForm.siteId}
                onChange={(e) => setExpenseForm({ ...expenseForm, siteId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                required
              >
                <option value="">Select Site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.projectName || s.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹ INR) *</label>
              <input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="e.g. 1250"
                min="1"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                {SITE_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date *</label>
              <input
                type="date"
                value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Paid To / Vendor *</label>
              <input
                type="text"
                value={expenseForm.paidTo}
                onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })}
                placeholder="e.g. Shankar Hardware / Daily Labor"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Spent By (Custodian)</label>
              <input
                type="text"
                value={expenseForm.spentBy}
                onChange={(e) => setExpenseForm({ ...expenseForm, spentBy: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Purpose *</label>
            <input
              type="text"
              value={expenseForm.purpose}
              onChange={(e) => setExpenseForm({ ...expenseForm, purpose: e.target.value })}
              placeholder="e.g. Urgent replacement coupling for concrete mixer pump"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / Bill Image URL</label>
            <input
              type="url"
              value={expenseForm.receiptUrl}
              onChange={(e) => setExpenseForm({ ...expenseForm, receiptUrl: e.target.value })}
              placeholder="https://..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          {Number(expenseForm.amount) >= 500 && !expenseForm.receiptUrl && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
              <label className="block text-xs font-bold text-amber-900">
                Reason for Missing Receipt (Mandatory for ≥ ₹500) *
              </label>
              <input
                type="text"
                value={expenseForm.noReceiptReason}
                onChange={(e) => setExpenseForm({ ...expenseForm, noReceiptReason: e.target.value })}
                placeholder="e.g. Local roadside vendor without bill / Emergency night purchase"
                className="w-full bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-600"
                required
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsNewExpenseModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
            >
              {actionLoading ? 'Recording...' : 'Submit Expense Voucher'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 6: Physical Cash Denomination Count */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isReconModalOpen}
        onClose={() => setIsReconModalOpen(false)}
        title="Physical Cash Reconciliation Count"
        subtitle="Count physical currency in safe box and compare against system balance"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleReconciliationSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Site To Reconcile *</label>
            <select
              value={reconSiteId}
              onChange={(e) => setReconSiteId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              required
            >
              <option value="">Select Project Site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.projectName || s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Currency Denominations (Note / Coin Count)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '₹ 2,000 Notes', key: 'd2000', mul: 2000 },
                { label: '₹ 500 Notes', key: 'd500', mul: 500 },
                { label: '₹ 200 Notes', key: 'd200', mul: 200 },
                { label: '₹ 100 Notes', key: 'd100', mul: 100 },
                { label: '₹ 50 Notes', key: 'd50', mul: 50 },
                { label: '₹ 20 Notes', key: 'd20', mul: 20 },
                { label: '₹ 10 Notes', key: 'd10', mul: 10 },
                { label: 'Coins Total (₹)', key: 'coins', mul: 1 },
              ].map((d) => (
                <div key={d.key} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                  <label className="block text-[11px] font-semibold text-slate-600">{d.label}</label>
                  <input
                    type="number"
                    min="0"
                    value={denominations[d.key]}
                    onChange={(e) =>
                      setDenominations({ ...denominations, [d.key]: Math.max(0, parseInt(e.target.value || '0', 10)) })
                    }
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    = {money((Number(denominations[d.key]) || 0) * d.mul)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Real-Time Live Comparison Strip */}
          <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Counted Cash in Box</span>
              <strong className="text-xl font-black text-emerald-400">{money(countedPhysicalTotal)}</strong>
            </div>

            {reconSiteId && (
              <div className="sm:text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">System Available Ledger</span>
                <strong className="text-base font-bold text-slate-200">
                  {money(pettyCashAccounts.find((a) => a.siteId === reconSiteId)?.availableBalance || 0)}
                </strong>
                <div className="text-xs font-bold mt-0.5">
                  {(() => {
                    const sys = Number(pettyCashAccounts.find((a) => a.siteId === reconSiteId)?.availableBalance || 0)
                    const diff = countedPhysicalTotal - sys
                    if (diff === 0) return <span className="text-emerald-400">✓ Exact Match (₹0)</span>
                    if (diff > 0) return <span className="text-blue-400">Surplus: +{money(diff)}</span>
                    return <span className="text-rose-400">Shortage: -{money(Math.abs(diff))}</span>
                  })()}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reconciliation Notes</label>
            <input
              type="text"
              value={reconNotes}
              onChange={(e) => setReconNotes(e.target.value)}
              placeholder="e.g. End of fortnight cash count verified in site safe"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsReconModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
            >
              {actionLoading ? 'Saving...' : 'Submit Physical Audit Count'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 7: Cash Return Modal */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Surrender / Return Surplus Float"
        subtitle="Transfer unspent funds from site safe back to operations manager or HQ"
      >
        <form onSubmit={handleReturnSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Site *</label>
              <select
                value={returnForm.siteId}
                onChange={(e) => setReturnForm({ ...returnForm, siteId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
                required
              >
                <option value="">Select Site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.projectName || s.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Return Amount (₹ INR) *</label>
              <input
                type="number"
                value={returnForm.returnAmount}
                onChange={(e) => setReturnForm({ ...returnForm, returnAmount: e.target.value })}
                placeholder="e.g. 15000"
                min="10"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Return Reason *</label>
              <select
                value={returnForm.reason}
                onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="Site Work Phase Completed">Site Work Phase Completed</option>
                <option value="Float Reduction / Rebalancing">Float Reduction / Rebalancing</option>
                <option value="Supervisor Custodian Transfer">Supervisor Custodian Transfer</option>
                <option value="Project Closure">Project Closure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Handover Method</label>
              <select
                value={returnForm.method}
                onChange={(e) => setReturnForm({ ...returnForm, method: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="Cash">Physical Cash Handover</option>
                <option value="Bank Deposit">Direct Bank Deposit</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Handover Notes</label>
            <input
              type="text"
              value={returnForm.notes}
              onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
              placeholder="e.g. Surplus cash handed over to Manager at weekly review"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
            >
              {actionLoading ? 'Submitting...' : 'Submit Float Return'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 8: Receipt Lightbox Modal */}
      {/* ------------------------------------------------------------- */}
      {lightboxUrl && (
        <Modal
          isOpen={Boolean(lightboxUrl)}
          onClose={() => setLightboxUrl(null)}
          title={lightboxTitle || 'Voucher Receipt Document'}
          maxWidth="max-w-2xl"
        >
          <div className="p-4 bg-slate-950 flex items-center justify-center min-h-[300px]">
            <img
              src={lightboxUrl}
              alt="Receipt Preview"
              className="max-h-[70vh] w-auto object-contain rounded-lg shadow-2xl"
              onError={(e) => {
                e.target.onerror = null
                e.target.src = 'https://placehold.co/600x400?text=Receipt+Preview+Unavailable'
              }}
            />
          </div>
          <div className="p-3 bg-slate-900 text-right">
            <a
              href={lightboxUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white"
            >
              Open Full Image ↗
            </a>
          </div>
        </Modal>
      )}
    </div>
  )
}
