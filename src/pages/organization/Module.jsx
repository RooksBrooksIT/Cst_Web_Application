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
// 1. SITE FINANCIAL DETAILS DRILL-DOWN PAGE (SiteFinancialDetailsPage)
// ------------------------------------------------------------------------------------------------
export function SiteFinancialDetailsPage({ site, totalExpensesDoc, sitePayments = [], onBack, orgId }) {
  const [activeTab, setActiveTab] = useState('summary')
  const [granularExpenses, setGranularExpenses] = useState([])
  const [loadingExpenses, setLoadingExpenses] = useState(true)

  const siteId = site.siteId || site.siteid || site.id || site.code || ''
  const siteName = site.siteName || site.sitename || site.projectName || site.name || siteId
  const projectName = site.projectName || siteName
  const ownerName = site.ownerName || site.ownername || site.clientName || 'Direct Client'
  const ownerPhone = site.ownerPhoneNumber || site.ownerPhone || site.phone || site.clientPhone || 'No Phone'
  const category = site.projectCategory || 'House'
  const subCategory = site.projectSubCategory || '2BHK'
  const siteLocation = site.location?.address || site.siteLocation || site.location || 'Location Registered'
  const status = site.currentStatus || site.status || 'Live'
  const startDate = site.startDate?.split?.('T')?.[0] || '2026-09-01'
  const endDate = site.plannedEndDate?.split?.('T')?.[0] || site.estimatedEndDate?.split?.('T')?.[0] || '2027-03-31'

  // Calculations according to Section 3 of specification
  const budget = amountValue(site, [
    'projectBudget',
    'budget',
    'totalBudget',
    'estimatedBudget',
    'plannedBudget',
    'project_budget',
    'contractValue',
    'total_budget',
  ])

  const sitePaymentItems = sitePayments.filter((p) => matchesSite(p, site))
  const sitePaymentsSum = sitePaymentItems.reduce((sum, p) => {
    return sum + amountValue(p, [
      'amount',
      'paymentAmount',
      'paidAmount',
      'receivedAmount',
      'totalAmount',
      'amountPaid',
      'amountReceived',
      'received',
    ])
  }, 0)
  const directSiteIncome = amountValue(site, [
    'amountPaid',
    'paid',
    'amountReceived',
    'receivedAmount',
    'totalReceived',
    'received',
    'totalIncome',
    'income',
    'amount_paid',
    'amount_received',
    'paid_amount',
    'clientPayment',
    'customerPayment',
  ])
  const received = sitePaymentsSum > 0 ? Math.max(directSiteIncome, sitePaymentsSum) : directSiteIncome

  // Consolidate expenses from totalSiteExpensesPerDay or site fields
  const expDoc = totalExpensesDoc || {}
  const totalAllExp = amountValue(expDoc, ['totalAllExpenses', 'totalAllExpense', 'total_all_expenses', 'totalExpenses', 'totalExpense'])
  const supervisorExp = amountValue(expDoc, ['totalSiteExpense', 'totalSupervisorExpense', 'siteExpense', 'supervisorExpense', 'total_site_expense'])
  const mgrExp = amountValue(expDoc, ['totalMgrExpense', 'totalManagerExpense', 'managerExpense', 'mgrExpense', 'total_mgr_expense'])
  const orgExp = amountValue(expDoc, ['totalOrgExpense', 'totalOrganizationExpense', 'orgExpense', 'organizationExpense', 'total_org_expense'])
  const conExp = amountValue(expDoc, ['totalContractorExpense', 'totalContractorPayments', 'contractorExpense', 'total_contractor_expense'])
  const incExp = amountValue(expDoc, ['totalIncentiveExpenses', 'totalIncentives', 'incentiveExpenses', 'total_incentive_expenses'])
  const calculatedExpenses = supervisorExp + mgrExp + orgExp + conExp + incExp
  const directSiteExpenses = amountValue(site, [
    'amountSpent',
    'amountSpend',
    'spent',
    'spentAmount',
    'totalAllExpenses',
    'totalExpenses',
    'totalExpense',
    'actualExpense',
    'actualExpenditure',
    'actual',
    'expenditure',
    'amount_spent',
    'total_expenses',
    'total_all_expenses',
  ])

  let spent = 0
  if (totalAllExp > 0) {
    spent = totalAllExp
  } else if (calculatedExpenses > 0) {
    spent = calculatedExpenses
  } else {
    spent = directSiteExpenses
  }

  const cashInHand = received - spent
  const explicitBalance = amountValue(site, ['amountBalance', 'balance', 'remainingBalance', 'remainingBudget', 'budgetRemaining', 'amount_balance'])
  const budgetRemaining = budget > 0 ? budget - spent : explicitBalance !== 0 ? explicitBalance : cashInHand
  const usagePercent = budget > 0 ? Math.min(100, Math.max(0, Math.round((spent / budget) * 100))) : 0
  const isBudgetCritical = usagePercent >= 85

  // Petty Cash
  const pcReceived = amountValue(expDoc, ['totalPettyCashReceived', 'pettyCashReceived', 'totalPettyCashDisbursed'])
  const pcSpent = amountValue(expDoc, ['totalPettyCashExpense', 'pettyCashExpense', 'totalPettyCashSpent', 'pettyCashSpent'])
  const pcRemaining = amountValue(expDoc, ['remainingPettyCash', 'pettyCashBalance', 'floatBalance']) || (pcReceived - pcSpent)

  // Fetch granular expenses on mount
  useEffect(() => {
    let cancelled = false
    setLoadingExpenses(true)
    fetchSiteGranularExpenses(orgId, siteId, site)
      .then((items) => {
        if (!cancelled) {
          setGranularExpenses(items)
          setLoadingExpenses(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingExpenses(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId, siteId, site])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Back Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-blue-500 shadow-xs transition-colors"
          >
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{siteName}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadgeColor(status)}`}>
                {status}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Site ID: {siteId} {projectName !== siteName && `· Project: ${projectName}`}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ExportButton
            filename={`site_financial_${siteId}`}
            headers={['Metric', 'Amount (INR)']}
            data={[
              ['Estimated Budget', budget],
              ['Customer Received', received],
              ['Expenses Spent', spent],
              ['Balance from Received', cashInHand],
              ['Budget Remaining', budgetRemaining],
              ['Supervisor Expenses', supervisorExp],
              ['Manager Expenses', mgrExp],
              ['Organization Expenses', orgExp],
              ['Contractor Expenses', conExp],
              ['Petty Cash Received', pcReceived],
              ['Petty Cash Spent', pcSpent],
              ['Petty Cash Balance', pcRemaining],
            ]}
            title={`Site Financial Statement — ${siteName}`}
          />
        </div>
      </div>

      {/* Site Info Header Card (UI-D2) */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-400 block">Category & Sub-Category</span>
          <strong className="text-slate-900 block mt-0.5 text-sm">{category} • {subCategory}</strong>
        </div>
        <div>
          <span className="text-slate-400 block">Client / Owner</span>
          <strong className="text-slate-900 block mt-0.5 text-sm">{ownerName}</strong>
          <small className="text-slate-500">{ownerPhone}</small>
        </div>
        <div>
          <span className="text-slate-400 block">Location Coordinates</span>
          <strong className="text-slate-900 block mt-0.5 truncate">{siteLocation}</strong>
        </div>
        <div>
          <span className="text-slate-400 block">Contract Timeline</span>
          <strong className="text-slate-900 block mt-0.5">{startDate} → {endDate}</strong>
        </div>
      </div>

      {/* 2x2 Financial Summary Matrix (UI-D3) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs border-l-4 border-l-blue-600">
          <span className="text-xs font-semibold text-slate-500 block">1. Estimated Budget</span>
          <strong className="text-xl font-extrabold text-blue-700 mt-1 block">{money(budget)}</strong>
          <small className="text-[10px] text-slate-400">Total contractual value</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs border-l-4 border-l-emerald-600">
          <span className="text-xs font-semibold text-slate-500 block">2. Customer Received</span>
          <strong className="text-xl font-extrabold text-emerald-700 mt-1 block">{money(received)}</strong>
          <small className="text-[10px] text-slate-400">Invoiced inflows</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs border-l-4 border-l-rose-600">
          <span className="text-xs font-semibold text-slate-500 block">3. Expenses Spent</span>
          <strong className="text-xl font-extrabold text-rose-600 mt-1 block">{money(spent)}</strong>
          <small className="text-[10px] text-slate-400">Consolidated actual spend</small>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs border-l-4 border-l-purple-600">
          <span className="text-xs font-semibold text-slate-500 block">4. Balance from Received</span>
          <strong className={`text-xl font-extrabold mt-1 block ${cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
            {money(cashInHand)}
          </strong>
          <small className="text-[10px] text-slate-400">Cash in hand (Received - Spent)</small>
        </div>
      </div>

      {/* Budget Remaining Banner & Progress Bar (UI-D4 & UI-D5) */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-slate-500">Budget Remaining (Budget - Spent):</span>
            <strong className="text-lg font-extrabold text-slate-900 ml-2">{money(budgetRemaining)}</strong>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isBudgetCritical ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'}`}>
            {usagePercent}% Budget Utilized
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/80">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${isBudgetCritical ? 'bg-rose-500' : 'bg-[#0B3470]'}`}
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>
      </div>

      {/* Site Petty Cash Summary Card (UI-D6 & UI-D7) */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base">◈</span>
            <strong className="text-sm font-bold text-slate-900">Site Petty Cash Wallet</strong>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${pcRemaining < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
              {pcRemaining < 0 ? 'Overspent' : 'Active Float'}
            </span>
          </div>
          <p className="text-xs text-slate-500">Supervisor on-site spendable float tracking</p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
          <div className="p-2.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold">Disbursed</span>
            <strong className="text-xs font-bold text-slate-800">{money(pcReceived)}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold">Spent</span>
            <strong className="text-xs font-bold text-rose-600">{money(pcSpent)}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold">Remaining Float</span>
            <strong className={`text-xs font-bold ${pcRemaining >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{money(pcRemaining)}</strong>
          </div>
        </div>

        {/* Quick Action CTA Buttons (UI-D7) */}
        <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200">
          <Link
            to="/organization/petty-cash"
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            ◈ Petty Cash Hub
          </Link>
          <Link
            to="/organization/petty-cash"
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-900 transition-colors"
          >
            + Record Expense
          </Link>
        </div>
      </div>

      {/* 3 Main Tabs (UI-D8) */}
      <div className="flex border-b border-slate-200 gap-2">
        {[
          { id: 'summary', label: 'Summary Breakdown', icon: '📊' },
          { id: 'income', label: `Client Income (${sitePaymentItems.length})`, icon: '💵' },
          { id: 'expenses', label: `Itemized Expenses (${granularExpenses.length})`, icon: '🧾' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === t.id
                ? 'border-[#0B3470] text-[#0B3470] bg-blue-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Summary (UI-D9 & UI-D10) */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Category Distribution List */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Expense Category Distribution</h3>
            <div className="space-y-2.5 text-xs">
              {[
                { label: 'Site & Daily Supervisor Entries', amount: supervisorExp, color: 'text-blue-700' },
                { label: 'Site Petty Cash Expenses', amount: pcSpent, color: 'text-amber-700' },
                { label: 'Manager Expenses', amount: mgrExp, color: 'text-indigo-700' },
                { label: 'Organization Expenses', amount: orgExp, color: 'text-purple-700' },
                { label: 'Contractor Payments', amount: conExp, color: 'text-rose-700' },
                { label: 'Incentives & Extra', amount: incExp, color: 'text-emerald-700' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-700 font-medium">{item.label}</span>
                  <strong className={`font-mono text-sm ${item.color}`}>{money(item.amount)}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Performance Indicators */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Financial Performance Indicators</h3>
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Payment Realization (Client Paid vs Contract):</span>
                  <strong className="text-emerald-700">{budget > 0 ? `${((received / budget) * 100).toFixed(1)}%` : '0%'}</strong>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, budget > 0 ? (received / budget) * 100 : 0)}%` }} />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Cost Cushion Margin Remaining:</span>
                  <strong className={budgetRemaining >= 0 ? 'text-blue-700' : 'text-rose-600'}>
                    {budget > 0 ? `${(((budget - spent) / budget) * 100).toFixed(1)}%` : '0%'}
                  </strong>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-700 h-1.5 rounded-full" style={{ width: `${Math.max(0, Math.min(100, budget > 0 ? ((budget - spent) / budget) * 100 : 0))}%` }} />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-slate-600 font-medium block">Cash Flow Health</span>
                  <small className="text-slate-400">Net in-hand liquidity status</small>
                </div>
                <span className={`px-3 py-1 rounded-full font-extrabold text-xs ${cashInHand >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {cashInHand >= 0 ? `+ ${money(cashInHand)} (Positive)` : `- ${money(Math.abs(cashInHand))} (Deficit)`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Client Income (UI-D11 & UI-D12) */}
      {activeTab === 'income' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900">
            <div>
              <span className="text-xs font-semibold block">Total Invoiced Payments Realized</span>
              <strong className="text-2xl font-extrabold">{money(received)}</strong>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-600 text-white rounded-xl">
              {sitePaymentItems.length} Milestone Payments
            </span>
          </div>

          <div className="space-y-2">
            {sitePaymentItems.length === 0 ? (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs">
                No milestone income records stored for this site in SitePayment.
              </div>
            ) : (
              sitePaymentItems.map((item, idx) => (
                <div key={item.id || idx} className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between text-xs hover:border-emerald-400 transition-all">
                  <div className="space-y-1">
                    <strong className="text-slate-900 text-sm block">{item.notes || item.stageName || item.description || `Milestone Payment #${idx + 1}`}</strong>
                    <span className="text-slate-400">Recorded on {formatDate(item.paymentDate || item.date || item.createdAt)}</span>
                  </div>
                  <strong className="text-base font-extrabold text-emerald-700 font-mono">
                    + {money(amountValue(item, ['amount', 'paymentAmount']))}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Itemized Expenses (UI-D13) */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {loadingExpenses ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading itemized expense ledger...</div>
          ) : granularExpenses.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs">
              No granular expense entries found for this site.
            </div>
          ) : (
            <div className="space-y-2">
              {granularExpenses.map((exp, idx) => (
                <div key={exp.id || idx} className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between text-xs hover:border-blue-400 transition-all">
                  <div className="space-y-1 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 text-sm">{exp.title}</strong>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {exp.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      <span>📅 {formatDate(exp.date)}</span>
                      <span>🏪 {exp.vendorName}</span>
                      {exp.stage && <span>📍 Stage: {exp.stage}</span>}
                    </div>
                  </div>
                  <strong className="text-base font-extrabold text-rose-600 font-mono whitespace-nowrap">
                    - {money(exp.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// 2. MAIN ORGANIZATION FINANCE PAGE (OrgFinancePage)
// ------------------------------------------------------------------------------------------------
export function OrgFinancePage({ sites = [], totalSiteExpensesPerDay = [], sitePayments = [] }) {
  const { orgId } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('default')
  const [selectedSiteForDetails, setSelectedSiteForDetails] = useState(null)

  // Pre-calculate site financial rollups according to Section 3 of specification
  const siteFinanceRows = useMemo(() => {
    return sites.map((site) => {
      const siteId = site.siteId || site.siteid || site.id || site.code || ''
      const siteName = site.siteName || site.sitename || site.projectName || site.name || siteId
      const projectName = site.projectName || siteName
      const ownerName = site.ownerName || site.ownername || site.clientName || 'Direct Client'
      const ownerPhone = site.ownerPhoneNumber || site.ownerPhone || site.phone || site.clientPhone || ''
      const category = site.projectCategory || 'House'
      const subCategory = site.projectSubCategory || '2BHK'
      const status = site.currentStatus || site.status || 'Live'

      // 1. Budget
      const budget = amountValue(site, [
        'projectBudget',
        'budget',
        'totalBudget',
        'estimatedBudget',
        'plannedBudget',
        'project_budget',
        'contractValue',
        'total_budget',
      ])

      // 2. Find matching totalSiteExpensesPerDay doc
      const expDoc = totalSiteExpensesPerDay.find((d) => matchesSite(d, site)) || {}
      const totalAllExp = amountValue(expDoc, ['totalAllExpenses', 'totalAllExpense', 'total_all_expenses', 'totalExpenses', 'totalExpense'])
      const supervisorExp = amountValue(expDoc, ['totalSiteExpense', 'totalSupervisorExpense', 'siteExpense', 'supervisorExpense', 'total_site_expense'])
      const mgrExp = amountValue(expDoc, ['totalMgrExpense', 'totalManagerExpense', 'managerExpense', 'mgrExpense', 'total_mgr_expense'])
      const orgExp = amountValue(expDoc, ['totalOrgExpense', 'totalOrganizationExpense', 'orgExpense', 'organizationExpense', 'total_org_expense'])
      const conExp = amountValue(expDoc, ['totalContractorExpense', 'totalContractorPayments', 'contractorExpense', 'total_contractor_expense'])
      const incExp = amountValue(expDoc, ['totalIncentiveExpenses', 'totalIncentives', 'incentiveExpenses', 'total_incentive_expenses'])
      const calculatedExpenses = supervisorExp + mgrExp + orgExp + conExp + incExp

      const directSiteExpenses = amountValue(site, [
        'amountSpent',
        'amountSpend',
        'spent',
        'spentAmount',
        'totalAllExpenses',
        'totalExpenses',
        'totalExpense',
        'actualExpense',
        'actualExpenditure',
        'actual',
        'expenditure',
        'amount_spent',
        'total_expenses',
        'total_all_expenses',
      ])

      let expenses = 0
      if (totalAllExp > 0) {
        expenses = totalAllExp
      } else if (calculatedExpenses > 0) {
        expenses = calculatedExpenses
      } else {
        expenses = directSiteExpenses
      }

      // 3. Inflow income
      const directSiteIncome = amountValue(site, [
        'amountPaid',
        'paid',
        'amountReceived',
        'receivedAmount',
        'totalReceived',
        'received',
        'totalIncome',
        'income',
        'amount_paid',
        'amount_received',
        'paid_amount',
        'clientPayment',
        'customerPayment',
      ])

      const matchingPayments = sitePayments.filter((p) => matchesSite(p, site))
      const paymentsSum = matchingPayments.reduce((sum, p) => {
        return sum + amountValue(p, [
          'amount',
          'paymentAmount',
          'paidAmount',
          'receivedAmount',
          'totalAmount',
          'amountPaid',
          'amountReceived',
          'received',
        ])
      }, 0)

      const income = paymentsSum > 0 ? Math.max(directSiteIncome, paymentsSum) : directSiteIncome

      // 4. Balance
      const explicitBalance = amountValue(site, ['amountBalance', 'balance', 'remainingBalance', 'remainingBudget', 'budgetRemaining', 'amount_balance'])
      let balance = 0
      if (budget > 0) {
        balance = budget - expenses
      } else if (income > 0) {
        balance = income - expenses
      } else if (explicitBalance !== 0) {
        balance = explicitBalance
      }

      const usagePercent = budget > 0 ? Math.min(100, Math.max(0, Math.round((expenses / budget) * 100))) : 0

      return {
        site,
        expDoc,
        siteId,
        siteName,
        projectName,
        ownerName,
        ownerPhone,
        category,
        subCategory,
        status,
        budget,
        income,
        expenses,
        balance,
        usagePercent,
      }
    })
  }, [sites, totalSiteExpensesPerDay, sitePayments])

  // Global Financial Overview KPI calculations (UI-6, UI-7, UI-8)
  const globalTotalIncome = useMemo(() => siteFinanceRows.reduce((sum, s) => sum + s.income, 0), [siteFinanceRows])
  const globalTotalExpenses = useMemo(() => siteFinanceRows.reduce((sum, s) => sum + s.expenses, 0), [siteFinanceRows])

  const liveSitesCount = useMemo(
    () => siteFinanceRows.filter((s) => ['live', 'in progress', 'onprogress', 'ongoing', 'active'].includes(s.status.toLowerCase())).length,
    [siteFinanceRows]
  )
  const completedSitesCount = useMemo(
    () => siteFinanceRows.filter((s) => ['completed', 'done', 'finished'].includes(s.status.toLowerCase())).length,
    [siteFinanceRows]
  )
  const planningSitesCount = useMemo(
    () => siteFinanceRows.filter((s) => ['planning', 'draft', 'setup'].includes(s.status.toLowerCase())).length,
    [siteFinanceRows]
  )

  // Filtering & Sorting
  const filteredAndSortedSites = useMemo(() => {
    let result = siteFinanceRows.filter((item) => {
      // Search
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matches =
          item.siteName.toLowerCase().includes(q) ||
          item.projectName.toLowerCase().includes(q) ||
          item.ownerName.toLowerCase().includes(q) ||
          item.siteId.toLowerCase().includes(q)
        if (!matches) return false
      }

      // Status chip filter
      if (statusFilter !== 'All') {
        const s = item.status.toLowerCase()
        if (statusFilter === 'Live') return ['live', 'active', 'ongoing', 'onprogress'].includes(s)
        if (statusFilter === 'In Progress') return ['in progress', 'onprogress', 'ongoing'].includes(s)
        if (statusFilter === 'Planning') return ['planning', 'draft', 'setup'].includes(s)
        if (statusFilter === 'Completed') return ['completed', 'done', 'finished'].includes(s)
      }

      return true
    })

    // Sort
    if (sortBy === 'highest_income') result.sort((a, b) => b.income - a.income)
    if (sortBy === 'highest_expenses') result.sort((a, b) => b.expenses - a.expenses)
    if (sortBy === 'highest_budget') result.sort((a, b) => b.budget - a.budget)
    if (sortBy === 'name_asc') result.sort((a, b) => a.siteName.localeCompare(b.siteName))

    return result
  }, [siteFinanceRows, search, statusFilter, sortBy])

  // If a site is selected for drill-down, render the drill-down component!
  if (selectedSiteForDetails) {
    return (
      <SiteFinancialDetailsPage
        site={selectedSiteForDetails.site}
        totalExpensesDoc={selectedSiteForDetails.expDoc}
        sitePayments={sitePayments}
        onBack={() => setSelectedSiteForDetails(null)}
        orgId={orgId}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header with Sort Action (UI-1 - UI-4) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Finance</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Financial Overview</h1>
          <p className="text-xs text-slate-500 mt-1">Multi-tenant consolidated income, expenditure breakdown, and site profitability.</p>
        </div>

        {/* Sort Action Dropdown (UI-4) */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Sort By:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-semibold shadow-xs outline-none focus:border-blue-600"
          >
            <option value="default">Default Order</option>
            <option value="highest_income">Highest Income</option>
            <option value="highest_expenses">Highest Expenses</option>
            <option value="highest_budget">Highest Budget</option>
            <option value="name_asc">Site Name (A-Z)</option>
          </select>

          <ExportButton
            filename="org_financial_overview"
            headers={['Site ID', 'Site Name', 'Client', 'Budget (INR)', 'Income (INR)', 'Expenses (INR)', 'Balance (INR)', 'Status']}
            data={filteredAndSortedSites.map((s) => [
              s.siteId,
              s.siteName,
              s.ownerName,
              s.budget,
              s.income,
              s.expenses,
              s.balance,
              s.status,
            ])}
            title="Total Organization Financial Overview"
          />
        </div>
      </div>

      {/* Global Financial Overview Hero Card (UI-5 - UI-8) */}
      <div className="p-6 rounded-3xl bg-linear-to-br from-[#0B3470] via-[#0d3f85] to-[#164e96] text-white shadow-md space-y-6 relative overflow-hidden">
        {/* Card Header (UI-5) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-lg font-bold border border-white/20">
              💼
            </span>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-white">Total Organization Finance</h2>
              <span className="text-[11px] text-blue-200 font-medium">Multi-site consolidated cash flow</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Backend Data
          </div>
        </div>

        {/* Total Income & Expenses KPI Boxes (UI-6 & UI-7) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Total Income Box (Green Accent) */}
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 backdrop-blur-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-200">Total Income</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/30 text-emerald-300 border border-emerald-400/40">
                ↓ Inflow
              </span>
            </div>
            <strong className="text-2xl font-extrabold text-emerald-300 tracking-tight block font-mono">
              {money(globalTotalIncome)}
            </strong>
            <small className="text-[10px] text-emerald-200/70 block">Sum of all received client payments</small>
          </div>

          {/* Total Expenses Box (Red Accent) */}
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 backdrop-blur-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-200">Total Expenses</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/30 text-rose-300 border border-rose-400/40">
                ↑ Outflow
              </span>
            </div>
            <strong className="text-2xl font-extrabold text-rose-300 tracking-tight block font-mono">
              {money(globalTotalExpenses)}
            </strong>
            <small className="text-[10px] text-rose-200/70 block">Sum of all actual consolidated expenses</small>
          </div>
        </div>

        {/* Site Status Summary Bar (UI-8) */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10 text-center">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-xs block text-blue-200 font-semibold">🏢 Live Sites</span>
            <strong className="text-lg font-extrabold text-white mt-0.5 block">{String(liveSitesCount).padStart(2, '0')}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-xs block text-emerald-300 font-semibold">✓ Completed</span>
            <strong className="text-lg font-extrabold text-emerald-300 mt-0.5 block">{String(completedSitesCount).padStart(2, '0')}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-xs block text-purple-300 font-semibold">📐 Planning</span>
            <strong className="text-lg font-extrabold text-purple-300 mt-0.5 block">{String(planningSitesCount).padStart(2, '0')}</strong>
          </div>
        </div>
      </div>

      {/* Search & Status Filter Bar (UI-9 & UI-10) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
        {/* Search Input Box */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-3 flex items-center text-blue-600 text-xs">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site, project, or client..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Horizontal Chips (UI-10) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['All', 'Live', 'In Progress', 'Planning', 'Completed'].map((chip) => {
            const isActive = statusFilter === chip
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setStatusFilter(chip)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {chip}
              </button>
            )
          })}
        </div>
      </div>

      {/* Section Header (UI-11 & UI-12) */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-[#0B3470]" />
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Sites Financial Breakdown</h2>
        </div>
        <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
          {filteredAndSortedSites.length} {filteredAndSortedSites.length === 1 ? 'Site' : 'Sites'}
        </span>
      </div>

      {/* Site Financial Cards Grid (UI-13 - UI-18) */}
      {filteredAndSortedSites.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
          <span className="text-3xl block">👛</span>
          <h3 className="text-sm font-bold text-slate-800">No sites found</h3>
          <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setStatusFilter('All')
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAndSortedSites.map((item) => {
            const isAlertUsage = item.usagePercent >= 85
            return (
              <div
                key={item.siteId}
                onClick={() => setSelectedSiteForDetails(item)}
                className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                {/* Header (UI-13 & UI-14) */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                        {item.siteName}
                        <span className="text-slate-400 text-xs font-normal">→</span>
                      </h3>
                      {item.projectName !== item.siteName && (
                        <span className="text-[11px] font-semibold text-slate-500 block">Project: {item.projectName}</span>
                      )}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadgeColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  {/* Metadata Subtitle (UI-15) */}
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <p className="font-medium text-slate-700">{item.category} • {item.subCategory}</p>
                    <p className="text-[11px] text-slate-400">Owner: {item.ownerName} {item.ownerPhone && `(${item.ownerPhone})`}</p>
                  </div>
                </div>

                {/* 4-Column Financial Metrics Grid (UI-16) */}
                <div className="grid grid-cols-4 gap-2 pt-2 pb-1 border-t border-slate-100 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block font-semibold">Budget</span>
                    <strong className="text-blue-700 block font-mono text-xs truncate">{money(item.budget)}</strong>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block font-semibold">Income</span>
                    <strong className="text-emerald-700 block font-mono text-xs truncate">{money(item.income)}</strong>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block font-semibold">Expenses</span>
                    <strong className="text-rose-600 block font-mono text-xs truncate">{money(item.expenses)}</strong>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block font-semibold">Balance</span>
                    <strong className={`block font-mono text-xs truncate ${item.balance >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
                      {money(item.balance)}
                    </strong>
                  </div>
                </div>

                {/* Budget Usage Progress Bar (UI-17) */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Budget Consumed:</span>
                    <strong className={isAlertUsage ? 'text-rose-600' : 'text-slate-700'}>
                      {item.usagePercent}% spent
                    </strong>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/80">
                    <div
                      className={`h-2 rounded-full transition-all ${isAlertUsage ? 'bg-rose-500' : 'bg-[#0B3470]'}`}
                      style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
// ------------------------------------------------------------------------------------------------
export function PettyCashGovernance({ pettyCashAccounts = [], pettyCashExpenses = [], pettyCashRequests = [] }) {
  const { orgId } = useAuth()
  const [tab, setTab] = useState('accounts')
  const [search, setSearch] = useState('')
  const [isDisburseOpen, setIsDisburseOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [disburseAmount, setDisburseAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('bank_transfer')
  const [saving, setSaving] = useState(false)

  const totalAllocated = pettyCashAccounts.reduce((acc, a) => acc + (Number(a.totalAllocated) || 0), 0)
  const totalSpent = pettyCashExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0)
  const availableBalance = pettyCashAccounts.reduce((acc, a) => acc + (Number(a.currentBalance) || 0), 0)

  async function handleDisburseSubmit(e) {
    e.preventDefault()
    if (!orgId || !selectedRequest) return
    setSaving(true)
    try {
      await disbursePettyCashRequest(
        orgId,
        selectedRequest.id,
        selectedRequest.supervisorUid,
        Number(disburseAmount) || selectedRequest.amount,
        'Organization Finance Head',
        paymentMode
      )
      setIsDisburseOpen(false)
      alert('Petty cash float disbursed and account ledger updated!')
    } catch (err) {
      alert('Error disbursing float: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Organization / Petty Cash</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Supervisor Float Governance</h1>
          <p className="text-xs text-slate-500 mt-1">Audit field spendable balances, authorize float replenishment, and inspect receipts.</p>
        </div>
        <ExportButton
          filename="petty_cash_ledger"
          headers={['Supervisor', 'Current Balance', 'Total Allocated', 'Total Spent']}
          data={pettyCashAccounts.map((a) => [
            a.supervisorName || a.supervisorUid || 'Supervisor',
            a.currentBalance || 0,
            a.totalAllocated || 0,
            a.totalSpent || 0,
          ])}
          title="Petty Cash Accounts Master Ledger"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Total Lifetime Disbursed</span>
          <strong className="text-2xl font-extrabold text-slate-900 mt-1 block">{money(totalAllocated)}</strong>
          <small className="text-[11px] text-slate-400">Authorized corporate float</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Total Approved Site Spend</span>
          <strong className="text-2xl font-extrabold text-rose-600 mt-1 block">{money(totalSpent)}</strong>
          <small className="text-[11px] text-slate-400">Audited expense receipts</small>
        </div>
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Net Spendable Float in Field</span>
          <strong className="text-2xl font-extrabold text-emerald-700 mt-1 block">{money(availableBalance)}</strong>
          <small className="text-[11px] text-slate-400">Available supervisor balances</small>
        </div>
      </div>

      <FilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        tabs={[
          { id: 'accounts', label: 'Supervisor Wallets', count: pettyCashAccounts.length },
          { id: 'requests', label: 'Replenishment Requests', count: pettyCashRequests.filter((r) => r.status === 'pending_manager' || r.status === 'pending').length },
          { id: 'expenses', label: 'Audited Expense Ledger', count: pettyCashExpenses.length },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        placeholder="Search supervisor, site, receipt description..."
      />

      {tab === 'accounts' && (
        <DataTable
          columns={[
            {
              header: 'Supervisor Name',
              accessor: 'supervisorName',
              render: (row) => <strong className="text-slate-900">{row.supervisorName || row.supervisorUid || 'Supervisor'}</strong>,
            },
            {
              header: 'Assigned Project',
              accessor: 'projectName',
              render: (row) => row.projectName || 'All Sites',
            },
            {
              header: 'Spendable Balance',
              accessor: 'currentBalance',
              align: 'right',
              render: (row) => <span className="font-extrabold text-emerald-700">{money(row.currentBalance)}</span>,
            },
            {
              header: 'Total Disbursed',
              accessor: 'totalAllocated',
              align: 'right',
              render: (row) => <span className="font-semibold text-slate-700">{money(row.totalAllocated)}</span>,
            },
            {
              header: 'Total Spent',
              accessor: 'totalSpent',
              align: 'right',
              render: (row) => <span className="font-semibold text-rose-600">{money(row.totalSpent)}</span>,
            },
            {
              header: 'Last Top-up Date',
              accessor: 'lastDisbursementDate',
              align: 'right',
              render: (row) => formatDate(row.lastDisbursementDate),
            },
          ]}
          data={pettyCashAccounts}
          searchQuery={search}
          searchFields={['supervisorName', 'supervisorUid', 'projectName']}
          emptyMessage="No supervisor petty cash wallets active."
        />
      )}

      {tab === 'requests' && (
        <DataTable
          columns={[
            {
              header: 'Supervisor',
              accessor: 'supervisorName',
              render: (row) => <strong className="text-slate-900">{row.supervisorName || 'Supervisor'}</strong>,
            },
            {
              header: 'Site',
              accessor: 'projectName',
              render: (row) => row.projectName || 'Site',
            },
            {
              header: 'Amount Requested',
              accessor: 'amount',
              align: 'right',
              render: (row) => <span className="font-extrabold text-blue-700">{money(row.amount)}</span>,
            },
            {
              header: 'Reason / Purpose',
              accessor: 'reason',
              render: (row) => row.reason || 'Float replenishment',
            },
            {
              header: 'Status',
              accessor: 'status',
              align: 'center',
              render: (row) => <StatusBadge status={row.status || 'pending'} />,
            },
            {
              header: 'Actions',
              align: 'center',
              render: (row) =>
                row.status === 'pending_manager' || row.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequest(row)
                      setDisburseAmount(String(row.amount))
                      setIsDisburseOpen(true)
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800"
                  >
                    Disburse Float →
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Disbursed</span>
                ),
            },
          ]}
          data={pettyCashRequests}
          searchQuery={search}
          searchFields={['supervisorName', 'projectName', 'reason']}
          emptyMessage="No pending float requests."
        />
      )}

      {tab === 'expenses' && (
        <DataTable
          columns={[
            {
              header: 'Date',
              accessor: 'date',
              render: (row) => formatDate(row.date),
            },
            {
              header: 'Supervisor',
              accessor: 'supervisorName',
              render: (row) => row.supervisorName || 'Supervisor',
            },
            {
              header: 'Category',
              accessor: 'category',
              render: (row) => <StatusBadge status={row.category || 'materials_local'} />,
            },
            {
              header: 'Vendor & Description',
              accessor: 'description',
              render: (row) => (
                <div>
                  <strong className="block text-slate-900">{row.vendorName || 'Local Supplier'}</strong>
                  <small className="text-slate-500">{row.description || 'Site purchase'}</small>
                </div>
              ),
            },
            {
              header: 'Amount',
              accessor: 'amount',
              align: 'right',
              render: (row) => <span className="font-bold text-rose-700">{money(row.amount)}</span>,
            },
            {
              header: 'Status',
              accessor: 'status',
              align: 'center',
              render: (row) => <StatusBadge status={row.status || 'Approved'} />,
            },
          ]}
          data={pettyCashExpenses}
          searchQuery={search}
          searchFields={['supervisorName', 'vendorName', 'description', 'category']}
          emptyMessage="No expense receipts recorded."
        />
      )}

      <Modal isOpen={isDisburseOpen} onClose={() => setIsDisburseOpen(false)} title="Disburse Corporate Petty Cash Float">
        {selectedRequest && (
          <form onSubmit={handleDisburseSubmit} className="space-y-4 text-xs">
            <p className="text-slate-600">
              Disbursing replenishment float to <strong>{selectedRequest.supervisorName}</strong> for <strong>{selectedRequest.projectName || 'Site Operations'}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block font-medium text-slate-700">
                Approved Float Amount (INR) *
                <input
                  type="number"
                  required
                  value={disburseAmount}
                  onChange={(e) => setDisburseAmount(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 font-mono"
                />
              </label>
              <label className="block font-medium text-slate-700">
                Payment Channel
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600"
                >
                  <option value="bank_transfer">Corporate Bank Transfer (NEFT/RTGS)</option>
                  <option value="upi">Corporate UPI Handle</option>
                  <option value="cash">Direct Cash Handover</option>
                </select>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDisburseOpen(false)}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-1/2 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
              >
                {saving ? 'Disbursing...' : '✓ Confirm Disbursement'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

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
    case 'petty-cash':
      return <PettyCashGovernance pettyCashAccounts={props.pettyCashAccounts} pettyCashExpenses={props.pettyCashExpenses} pettyCashRequests={props.pettyCashRequests} />
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
