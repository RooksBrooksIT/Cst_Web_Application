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
  orgAuthorizeRequest,
  confirmCashReturn,
  approveReconciliation,
  submitPettyCashRequest,
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

export default function PettyCashGovernance({
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
  const orgActor = {
    id: user?.uid || 'org_admin',
    name: userData?.fullName || userData?.name || 'Organization Finance Lead',
    role: 'Organization',
  }

  const [activeTab, setActiveTab] = useState('accounts') // accounts, approvals, expenses, ledger, reconciliations, audit
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'

  // Modals state
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [approvedAmount, setApprovedAmount] = useState('')
  const [authRemarks, setAuthRemarks] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Receipt Lightbox
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState(null)
  const [previewReceiptTitle, setPreviewReceiptTitle] = useState('')

  // New Request Modal
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false)
  const [newRequestForm, setNewRequestForm] = useState({
    siteId: '',
    requestedAmount: '',
    reason: '',
    expenseCategory: 'Site Operational Float',
  })

  // Calculations
  const totalAllocated = useMemo(() => {
    return pettyCashAccounts.reduce((acc, a) => acc + (Number(a.totalAllocated) || 0), 0)
  }, [pettyCashAccounts])

  const totalReceived = useMemo(() => {
    return pettyCashAccounts.reduce((acc, a) => acc + (Number(a.totalReceived || a.totalAllocated) || 0), 0)
  }, [pettyCashAccounts])

  const totalSpent = useMemo(() => {
    return pettyCashAccounts.reduce((acc, a) => acc + (Number(a.totalSpent || a.totalUsed) || 0), 0)
  }, [pettyCashAccounts])

  const availableBalance = useMemo(() => {
    return pettyCashAccounts.reduce((acc, a) => acc + (Number(a.availableBalance) || 0), 0)
  }, [pettyCashAccounts])

  const reservedBalance = useMemo(() => {
    return pettyCashAccounts.reduce((acc, a) => acc + (Number(a.reservedBalance) || 0), 0)
  }, [pettyCashAccounts])

  const lowBalanceAccounts = useMemo(() => {
    return pettyCashAccounts.filter((a) => {
      const base = Number(a.fundLimit) > 0 ? Number(a.fundLimit) : Number(a.currentCycleAllocated || a.totalAllocated) || 0
      const threshold = Number(a.configuredMinimumBalance) > 0 ? Number(a.configuredMinimumBalance) : base * 0.1
      return (Number(a.availableBalance) || 0) <= threshold && base > 0
    })
  }, [pettyCashAccounts])

  // Filtered Lists
  const pendingOrgApprovals = useMemo(() => {
    return pettyCashRequests.filter(
      (r) =>
        r.status === PETTY_CASH_REQUEST_STATUS.PENDING_ORGANIZATION_APPROVAL ||
        r.status === 'pending_org_approval' ||
        r.currentStep === 2
    )
  }, [pettyCashRequests])

  const filteredAccounts = useMemo(() => {
    return pettyCashAccounts.filter((a) => {
      const matchesSite = siteFilter === 'all' || a.siteId === siteFilter
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        a.siteName?.toLowerCase().includes(q) ||
        a.supervisorName?.toLowerCase().includes(q)
      return matchesSite && matchesSearch
    })
  }, [pettyCashAccounts, siteFilter, search])

  const filteredExpenses = useMemo(() => {
    return pettyCashExpenses.filter((e) => {
      const matchesSite = siteFilter === 'all' || e.siteId === siteFilter
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        e.siteName?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.vendorName?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      return matchesSite && matchesSearch
    })
  }, [pettyCashExpenses, siteFilter, search])

  const filteredLedger = useMemo(() => {
    return [...pettyCashTransactions]
      .filter((t) => {
        const matchesSite = siteFilter === 'all' || t.siteId === siteFilter
        const q = search.trim().toLowerCase()
        const matchesSearch =
          !q ||
          t.description?.toLowerCase().includes(q) ||
          t.siteName?.toLowerCase().includes(q) ||
          t.transactionType?.toLowerCase().includes(q)
        return matchesSite && matchesSearch
      })
      .sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime()
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime()
        return tB - tA
      })
  }, [pettyCashTransactions, siteFilter, search])

  // Handler: Authorize Request
  async function handleAuthorize(decision) {
    if (!orgId || !selectedRequest) return
    setActionLoading(true)
    try {
      await orgAuthorizeRequest(
        orgId,
        selectedRequest.id || selectedRequest.requestId,
        decision,
        approvedAmount,
        authRemarks,
        orgActor
      )
      setIsAuthModalOpen(false)
      setSelectedRequest(null)
      alert(decision === 'authorize' ? 'Request authorized successfully! Forwarded to manager for disbursement.' : 'Request rejected.')
    } catch (err) {
      alert('Error updating authorization: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Handler: Confirm Cash Return
  async function handleConfirmReturn(returnItem) {
    if (!orgId || !returnItem) return
    if (!window.confirm(`Confirm receipt of ₹${returnItem.returnAmount} surrendered physical cash?`)) return
    try {
      await confirmCashReturn(orgId, returnItem.id || returnItem.returnId, 'Confirmed by Organization HQ', orgActor)
      alert('Physical cash return confirmed! Account balance and ledger updated.')
    } catch (err) {
      alert('Error confirming return: ' + err.message)
    }
  }

  // Handler: Approve Reconciliation
  async function handleApproveRecon(reconItem) {
    if (!orgId || !reconItem) return
    try {
      await approveReconciliation(orgId, reconItem.id || reconItem.reconciliationId, 'Approved by HQ', orgActor)
      alert('Reconciliation tally approved!')
    } catch (err) {
      alert('Error approving reconciliation: ' + err.message)
    }
  }

  // Handler: Submit Direct Org Request
  async function handleCreateNewRequest(e) {
    e.preventDefault()
    if (!orgId) return
    setActionLoading(true)
    try {
      const selectedSite = sites.find((s) => s.id === newRequestForm.siteId)
      await submitPettyCashRequest(
        orgId,
        {
          siteId: newRequestForm.siteId,
          siteName: selectedSite?.projectName || selectedSite?.name || 'Site',
          requestedAmount: Number(newRequestForm.requestedAmount),
          reason: newRequestForm.reason,
          expenseCategory: newRequestForm.expenseCategory,
        },
        orgActor
      )
      setIsNewRequestOpen(false)
      setNewRequestForm({ siteId: '', requestedAmount: '', reason: '', expenseCategory: 'Site Operational Float' })
      alert('Petty cash request created successfully!')
    } catch (err) {
      alert('Error creating request: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6 text-slate-800 animate-fade-in pb-12">
      {/* 1. Executive Topbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
            <span>Organization</span>
            <span>/</span>
            <span>Finance & Audit</span>
            <span>/</span>
            <span>Petty Cash Governance</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Enterprise Petty Cash Command Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Float Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Dual-stage authorization, site-by-site float balances, receipt verification, and real-time immutable ledger.
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsNewRequestOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white transition-all shadow-xs cursor-pointer flex items-center gap-2"
          >
            <span>＋</span>
            <span>New Float Request</span>
          </button>
          <ExportButton
            filename="petty_cash_portfolio_ledger"
            headers={['Site Name', 'Custodian', 'Allocated (INR)', 'Received (INR)', 'Spent (INR)', 'Available (INR)', 'Reserved (INR)', 'Status']}
            data={pettyCashAccounts.map((a) => [
              a.siteName || a.projectName || 'Site',
              a.supervisorName || a.custodianSupervisorName || 'Supervisor',
              a.totalAllocated || 0,
              a.totalReceived || 0,
              a.totalSpent || 0,
              a.availableBalance || 0,
              a.reservedBalance || 0,
              a.status || 'ACTIVE',
            ])}
            title="Export Float Ledger"
          />
        </div>
      </div>

      {/* Low Balance Warning Banner */}
      {lowBalanceAccounts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
              ⚠️
            </span>
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Low Balance Warning: {lowBalanceAccounts.length} Site Float{lowBalanceAccounts.length > 1 ? 's' : ''} Under 10% Reserve
              </h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {lowBalanceAccounts.map((a) => a.siteName || 'Site').join(', ')} require replenishment to prevent field work stoppages.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('accounts')
              setSearch('')
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer"
          >
            View Low Float Sites
          </button>
        </div>
      )}

      {/* 2. Executive 5-Card Bento KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Allocated</span>
          <strong className="text-xl font-extrabold text-slate-900 font-mono block">{money(totalAllocated)}</strong>
          <small className="text-slate-400 text-[10px]">Corporate fund grants</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Received in Field</span>
          <strong className="text-xl font-extrabold text-blue-700 font-mono block">{money(totalReceived)}</strong>
          <small className="text-slate-400 text-[10px]">Confirmed by supervisors</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Audited Spend</span>
          <strong className="text-xl font-extrabold text-rose-600 font-mono block">{money(totalSpent)}</strong>
          <small className="text-slate-400 text-[10px]">Approved vouchers posted</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-emerald-600">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Net Available Float</span>
          <strong className="text-xl font-extrabold text-emerald-700 font-mono block">{money(availableBalance)}</strong>
          <small className="text-slate-400 text-[10px]">Active field liquidity</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Reserved in Review</span>
          <strong className="text-xl font-extrabold text-amber-700 font-mono block">{money(reservedBalance)}</strong>
          <small className="text-slate-400 text-[10px]">Pending expense review</small>
        </div>
      </div>

      {/* 3. Unified Navigation Tabs & Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'accounts', label: 'Site Wallets', icon: '🏢', count: pettyCashAccounts.length },
              { id: 'approvals', label: 'HQ Authorization Queue', icon: '⚡', badge: pendingOrgApprovals.length },
              { id: 'expenses', label: 'Audited Expenses', icon: '🧾', count: pettyCashExpenses.length },
              { id: 'ledger', label: 'Master Ledger', icon: '📖', count: pettyCashTransactions.length },
              { id: 'reconciliations', label: 'Reconciliations & Returns', icon: '⚖️', count: pettyCashReconciliations.length + pettyCashReturns.length },
              { id: 'audit', label: 'Audit Trail', icon: '🔍', count: pettyCashAuditLogs.length },
            ].map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 bg-transparent'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 shadow-xs">
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Site Filter Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[11px] font-semibold text-slate-400 uppercase">Site:</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
            >
              <option value="all">All Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.projectName || s.siteName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search & Mode Bar */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search site, supervisor, voucher description..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-2xs"
            />
          </div>

          {activeTab === 'accounts' && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cards' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ▦ Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ☰ Table
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Tab 1: Site Wallets & Accounts */}
      {activeTab === 'accounts' && (
        <section className="space-y-4">
          {filteredAccounts.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2">
              <span className="text-3xl">🏢</span>
              <h4 className="text-sm font-bold text-slate-800">No Site Float Accounts Found</h4>
              <p className="text-xs text-slate-400">Initialize a float request to activate petty cash for this site.</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAccounts.map((a) => {
                const total = Number(a.totalAllocated) || 0
                const spent = Number(a.totalSpent || a.totalUsed) || 0
                const available = Number(a.availableBalance) || 0
                const reserved = Number(a.reservedBalance) || 0
                const spendable = Math.max(0, available - reserved)
                const percent = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
                const isLow = a.lowBalanceTriggered || (total > 0 && available <= total * 0.1)

                return (
                  <div
                    key={a.id || a.accountId}
                    className={`p-5 rounded-2xl bg-white border transition-all shadow-xs space-y-3 relative overflow-hidden ${
                      isLow ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200/90 hover:shadow-md'
                    }`}
                  >
                    {isLow && (
                      <span className="absolute top-0 right-0 px-3 py-0.5 rounded-bl-xl text-[10px] font-extrabold bg-amber-500 text-white">
                        LOW FLOAT ALERT
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between pr-12">
                        <h3 className="font-extrabold text-slate-900 text-base">{a.siteName || a.projectName || 'Site'}</h3>
                      </div>
                      <span className="text-xs text-slate-500 block">
                        👤 Custodian: <strong>{a.supervisorName || a.custodianSupervisorName || 'Site Supervisor'}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Available Float</span>
                        <strong className="text-lg font-mono font-extrabold text-emerald-700">{money(available)}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Spendable</span>
                        <strong className="text-lg font-mono font-extrabold text-slate-900">{money(spendable)}</strong>
                        {reserved > 0 && (
                          <small className="text-[10px] text-amber-600 block">₹{reserved} reserved</small>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
                        <span>Spent: {money(spent)}</span>
                        <span>{percent}% utilized</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            percent >= 85 ? 'bg-rose-500' : percent >= 65 ? 'bg-amber-500' : 'bg-[#0B3470]'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Allocated: {money(total)}</span>
                        <span>Min Reserve: {money(a.configuredMinimumBalance || total * 0.1)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <StatusBadge status={a.status || 'ACTIVE'} />
                      <button
                        type="button"
                        onClick={() => {
                          setSiteFilter(a.siteId)
                          setActiveTab('ledger')
                        }}
                        className="text-blue-700 hover:text-blue-900 font-bold cursor-pointer"
                      >
                        View Ledger →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Site Name</th>
                      <th className="p-3.5">Custodian Supervisor</th>
                      <th className="p-3.5 text-right">Total Allocated</th>
                      <th className="p-3.5 text-right">Total Spent</th>
                      <th className="p-3.5 text-right">Available Float</th>
                      <th className="p-3.5 text-right">Reserved Float</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.map((a) => (
                      <tr key={a.id || a.accountId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900">{a.siteName || a.projectName || 'Site'}</td>
                        <td className="p-3.5 text-slate-600">{a.supervisorName || a.custodianSupervisorName || 'Supervisor'}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900">{money(a.totalAllocated)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-rose-600">-{money(a.totalSpent || a.totalUsed)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-700">{money(a.availableBalance)}</td>
                        <td className="p-3.5 text-right font-mono text-amber-700">{money(a.reservedBalance)}</td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <StatusBadge status={a.status || 'ACTIVE'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5. Tab 2: HQ Authorization Queue */}
      {activeTab === 'approvals' && (
        <section className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  HQ Petty Cash Authorization Queue
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify supervisor requests forwarded by operations managers and authorize float disbursals.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {pendingOrgApprovals.length} Pending Clearances
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Request ID</th>
                      <th className="p-3.5">Site / Supervisor</th>
                      <th className="p-3.5">Manager Notes</th>
                      <th className="p-3.5 text-right">Requested</th>
                      <th className="p-3.5 text-center">Current Status</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingOrgApprovals.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                          No pending petty cash requests awaiting HQ authorization.
                        </td>
                      </tr>
                    ) : (
                      pendingOrgApprovals.map((req) => (
                        <tr key={req.id || req.requestId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 font-mono font-bold text-slate-900">{req.requestId || req.id}</td>
                          <td className="p-3.5">
                            <strong className="block text-slate-900">{req.siteName || req.projectName || 'Site'}</strong>
                            <span className="text-[11px] text-slate-400">By {req.supervisorName || 'Supervisor'}</span>
                          </td>
                          <td className="p-3.5 text-slate-600 max-w-xs">
                            <div className="truncate">{req.managerReviewRemarks || req.reason || 'Verified.'}</div>
                            <small className="text-[10px] text-slate-400">Mgr: {req.managerReviewedBy || req.managerName || 'Manager'}</small>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-blue-700 text-sm">
                            {money(req.requestedAmount)}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              HQ Clearance Pending
                            </span>
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRequest(req)
                                setApprovedAmount(req.requestedAmount)
                                setAuthRemarks(req.managerReviewRemarks || '')
                                setIsAuthModalOpen(true)
                              }}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white transition-colors cursor-pointer shadow-2xs"
                            >
                              Review & Authorize
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 6. Tab 3: Audited Expenses */}
      {activeTab === 'expenses' && (
        <section className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Site / Submitter</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Description & Vendor</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5 text-center">Receipt Image</th>
                  <th className="p-3.5 text-center">Review Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-xs">
                      No expense records found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id || exp.expenseId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">{formatDate(exp.transactionDate || exp.createdAt)}</td>
                      <td className="p-3.5">
                        <strong className="block text-slate-900">{exp.siteName || 'Site'}</strong>
                        <span className="text-[11px] text-slate-400">{exp.submittedByName || 'Supervisor'}</span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {exp.category || exp.expenseCategory || 'General'}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-700">
                        <div className="font-medium">{exp.description}</div>
                        {exp.vendorName && <small className="text-slate-400">Vendor: {exp.vendorName}</small>}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-rose-600 text-sm whitespace-nowrap">
                        -{money(exp.amount)}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {exp.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewReceiptUrl(exp.receiptUrl)
                              setPreviewReceiptTitle(`${exp.description} - ${money(exp.amount)}`)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            <span>📎</span> View Receipt
                          </button>
                        ) : exp.noReceiptReason ? (
                          <span className="text-[10px] text-slate-400 italic" title={exp.noReceiptReason}>
                            Reason: {exp.noReceiptReason}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <StatusBadge status={exp.status || 'EXPENSE_APPROVED'} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 7. Tab 4: Immutable Master Ledger */}
      {activeTab === 'ledger' && (
        <section className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Transaction Date</th>
                  <th className="p-3.5">Txn ID</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Site & Description</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5 text-right">Previous Balance</th>
                  <th className="p-3.5 text-right">New Balance</th>
                  <th className="p-3.5">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400 text-xs">
                      No posted ledger transactions recorded.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((txn) => {
                    const isInflow = ['INITIAL_FUND', 'REPLENISHMENT'].includes(txn.transactionType)
                    return (
                      <tr key={txn.id || txn.transactionId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 text-slate-500 whitespace-nowrap">{formatDate(txn.transactionDate || txn.createdAt)}</td>
                        <td className="p-3.5 font-mono font-semibold text-slate-700">{txn.transactionId || txn.id}</td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              isInflow
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {txn.transactionType}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <strong className="block text-slate-900">{txn.siteName || 'Site'}</strong>
                          <span className="text-[11px] text-slate-500">{txn.description}</span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-sm whitespace-nowrap">
                          <span className={isInflow ? 'text-emerald-700' : 'text-rose-600'}>
                            {isInflow ? `+${money(txn.amount)}` : `-${money(txn.amount)}`}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono text-slate-500 whitespace-nowrap">{money(txn.previousBalance)}</td>
                        <td className="p-3.5 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">{money(txn.newBalance)}</td>
                        <td className="p-3.5 text-slate-600">
                          <div>{txn.createdBy || 'System'}</div>
                          <small className="text-slate-400">{txn.createdRole || 'Role'}</small>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 8. Tab 5: Reconciliations & Returns */}
      {activeTab === 'reconciliations' && (
        <section className="space-y-6">
          {/* Physical Cash Reconciliations */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
              Physical Cash Count Reconciliations
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Site / Custodian</th>
                      <th className="p-3 text-right">Expected Cash</th>
                      <th className="p-3 text-right">Physical Cash</th>
                      <th className="p-3 text-right">Discrepancy</th>
                      <th className="p-3">Reason / Attachment</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pettyCashReconciliations.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-slate-400 text-xs">No reconciliations submitted.</td></tr>
                    ) : (
                      pettyCashReconciliations.map((rec) => (
                        <tr key={rec.id || rec.reconciliationId}>
                          <td className="p-3 text-slate-500">{formatDate(rec.createdAt)}</td>
                          <td className="p-3"><strong>{rec.siteName}</strong><br/><small className="text-slate-400">{rec.submittedByName}</small></td>
                          <td className="p-3 text-right font-mono">{money(rec.expectedCash)}</td>
                          <td className="p-3 text-right font-mono font-bold">{money(rec.physicalCash)}</td>
                          <td className="p-3 text-right font-mono font-bold">
                            <span className={Math.abs(rec.difference) > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                              {rec.difference > 0 ? `+${money(rec.difference)}` : money(rec.difference)}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{rec.differenceReason || 'Exact match'}</td>
                          <td className="p-3 text-center"><StatusBadge status={rec.status} /></td>
                          <td className="p-3 text-right">
                            {rec.status !== PETTY_CASH_RECONCILIATION_STATUS.RECONCILIATION_APPROVED && (
                              <button
                                type="button"
                                onClick={() => handleApproveRecon(rec)}
                                className="px-2.5 py-1 bg-[#0B3470] text-white font-bold rounded-lg text-xs cursor-pointer"
                              >
                                Approve
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Surrendered Cash Returns */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
              Surrendered Physical Cash Returns
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Site / Custodian</th>
                      <th className="p-3 text-right">Return Amount</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pettyCashReturns.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-xs">No physical cash returns logged.</td></tr>
                    ) : (
                      pettyCashReturns.map((ret) => (
                        <tr key={ret.id || ret.returnId}>
                          <td className="p-3 text-slate-500">{formatDate(ret.createdAt)}</td>
                          <td className="p-3"><strong>{ret.siteName}</strong><br/><small className="text-slate-400">{ret.returnedByName}</small></td>
                          <td className="p-3 text-right font-mono font-bold text-sm text-emerald-700">{money(ret.returnAmount)}</td>
                          <td className="p-3 text-slate-600">{ret.reason}</td>
                          <td className="p-3 text-center"><StatusBadge status={ret.status} /></td>
                          <td className="p-3 text-right">
                            {ret.status === PETTY_CASH_RETURN_STATUS.PENDING_RETURN_CONFIRMATION && (
                              <button
                                type="button"
                                onClick={() => handleConfirmReturn(ret)}
                                className="px-3 py-1 bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs"
                              >
                                Confirm Receipt
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 9. Tab 6: Audit Trail */}
      {activeTab === 'audit' && (
        <section className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Entity</th>
                  <th className="p-3.5">Actor</th>
                  <th className="p-3.5">State Change / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pettyCashAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 text-xs">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  pettyCashAuditLogs.map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-700 font-mono text-[11px]">{log.entityId}</td>
                      <td className="p-3.5">
                        <strong className="block text-slate-900">{log.actorName}</strong>
                        <small className="text-slate-400">{log.actorRole}</small>
                      </td>
                      <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                        {JSON.stringify(log.newState || log.metadata || {})}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: HQ Authorization with 5-Step Stepper */}
      {isAuthModalOpen && selectedRequest && (
        <Modal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          title="Petty Cash HQ Authorization"
        >
          <div className="space-y-4 text-xs">
            {/* 5-Step Visual Stepper */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                5-Stage Request Lifecycle
              </span>
              <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">1. Submitter ✓</div>
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">2. Mgr Review ✓</div>
                <div className="p-1.5 rounded-lg bg-blue-600 text-white animate-pulse">3. HQ Clearance</div>
                <div className="p-1.5 rounded-lg bg-slate-200 text-slate-500">4. Disburse</div>
                <div className="p-1.5 rounded-lg bg-slate-200 text-slate-500">5. Receipt</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
              <div>Site: <strong className="text-slate-900">{selectedRequest.siteName}</strong></div>
              <div>Supervisor: <strong>{selectedRequest.supervisorName}</strong></div>
              <div>Reason: <em>"{selectedRequest.reason}"</em></div>
              {selectedRequest.managerReviewRemarks && (
                <div className="pt-1 text-blue-700">Manager Note: {selectedRequest.managerReviewRemarks}</div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Authorized Amount (₹):</label>
              <input
                type="number"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Authorization Remarks / Conditions:</label>
              <textarea
                rows={2}
                value={authRemarks}
                onChange={(e) => setAuthRemarks(e.target.value)}
                placeholder="Enter approval notes or disbursement instructions..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleAuthorize('authorize')}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-[#0B3470] text-white hover:bg-[#082654] cursor-pointer disabled:opacity-50"
              >
                ✓ Authorize & Forward for Disbursement
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleAuthorize('reject')}
                className="px-4 py-2.5 rounded-xl font-bold text-xs bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
              >
                ✕ Reject Request
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: New Float Request */}
      {isNewRequestOpen && (
        <Modal
          isOpen={isNewRequestOpen}
          onClose={() => setIsNewRequestOpen(false)}
          title="Create New Petty Cash Float Request"
        >
          <form onSubmit={handleCreateNewRequest} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Select Project Site:</label>
              <select
                required
                value={newRequestForm.siteId}
                onChange={(e) => setNewRequestForm({ ...newRequestForm, siteId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600"
              >
                <option value="">Choose Site...</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.projectName || s.siteName || s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Float Amount (₹):</label>
              <input
                type="number"
                required
                min="100"
                value={newRequestForm.requestedAmount}
                onChange={(e) => setNewRequestForm({ ...newRequestForm, requestedAmount: e.target.value })}
                placeholder="e.g. 50000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 font-semibold block">Justification & Purpose:</label>
              <textarea
                required
                rows={3}
                value={newRequestForm.reason}
                onChange={(e) => setNewRequestForm({ ...newRequestForm, reason: e.target.value })}
                placeholder="Detail site operations requiring petty cash float..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewRequestOpen(false)}
                className="px-4 py-2 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl font-bold bg-[#0B3470] hover:bg-[#082654] text-white disabled:opacity-50 cursor-pointer"
              >
                Submit Float Request
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Receipt Lightbox */}
      {previewReceiptUrl && (
        <Modal
          isOpen={Boolean(previewReceiptUrl)}
          onClose={() => setPreviewReceiptUrl(null)}
          title={previewReceiptTitle || 'Receipt Image Preview'}
        >
          <div className="space-y-3">
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-950/5 rounded-xl p-2 border border-slate-200">
              <img
                src={previewReceiptUrl}
                alt="Receipt Voucher"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <a
                href={previewReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800"
              >
                Open Original ↗
              </a>
              <button
                type="button"
                onClick={() => setPreviewReceiptUrl(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] text-white"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
