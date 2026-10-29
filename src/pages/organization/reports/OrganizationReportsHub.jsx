import React, { useState, useMemo, useEffect, Component, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  TrendingUp,
  Receipt,
  ReceiptText,
  Wallet,
  Layers,
  Users,
  Boxes,
  Calendar,
  Filter,
  Download,
  Printer,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Activity,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react'

import SiteExpensesReportHub from './SiteExpensesReportHub'
import ProjectStageReportsHub from './ProjectStageReportsHub'
import SiteStatusReportHub from './SiteStatusReportHub'
import FinancialStatusReportHub from './FinancialStatusReportHub'
import PettyCashInsightsReportHub from './PettyCashInsightsReportHub'
import DomainInventoryReportsHub from './DomainInventoryReportsHub'
import WorkerAttendanceReport from './WorkerAttendanceReport'
import { money, parseAmount } from '../../../services/reportService'
import { exportToCSV, printReport, fetchOrgNameFromFirestore, getActiveOrgId } from '../../../services/exportService'
import { useAuth } from '../../../hooks/useAuth'
import { CONFIG_SECTIONS, subscribeConfigItems } from '../../../services/projectConfigService'
import {
  subscribeMaterialsAvailability,
  subscribeAllSiteMaterialPools,
} from '../../../services/materialService'
import { subscribeWithFallback } from '../../../services/firestoreService'
import { getNormalizedSiteOptions } from '../../../utils/siteUtils.js'

class ReportErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Report render error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
            ⚠️
          </div>
          <h3 className="text-sm font-bold text-slate-800">Unable to load report content</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {this.state.error?.message || 'An unexpected rendering error occurred while generating this report view.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 transition-colors cursor-pointer"
          >
            Retry Report
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function OrganizationReportsHub(props) {
  const {
    sites = [],
    projects = [],
    siteSupervisorEntries = [],
    managerExpenses = [],
    managerEntries = [],
    managerExpenseSummary = [],
    organizationEntries = [],
    organizationExpenses = [],
    organizationExpenseSummary = [],
    contractorEntries = [],
    contractors = [],
    contractorBills = [],
    materials = [],
    tools = [],
    workers = [],
    workerAttendance = [],
    vehicles = [],
    siteSupervisorIncentives = [],
    pettyCashAccounts = [],
    pettyCashExpenses = [],
    pettyCashRequests = [],
    totalSiteExpensesPerDay = [],
    sitePayments = [],
    dailySiteLogs = [],
    orgId,
    role,
    projectStages = [],
    materialsAvailability: propMaterialsAvailability = [],
    siteMaterialPool: propSiteMaterialPool = [],
    materialAllocations: propMaterialAllocations = [],
  } = props

  const { orgId: authOrgId, role: authRole } = useAuth()
  const activeOrgId = orgId || authOrgId
  const activeRole = role || authRole || 'Organization'
  const location = useLocation()
  const navigate = useNavigate()

  const [orgName, setOrgName] = useState(props.orgName || '')

  useEffect(() => {
    let isMounted = true
    async function resolveOrgName() {
      const resolvedOrgId = activeOrgId || getActiveOrgId()
      if (resolvedOrgId) {
        const name = await fetchOrgNameFromFirestore(resolvedOrgId)
        if (isMounted && name) {
          setOrgName(name)
        }
      }
    }
    resolveOrgName()
    return () => {
      isMounted = false
    }
  }, [activeOrgId])

  const [stagesFromConfig, setStagesFromConfig] = useState([])
  const [internalMaterialsAvailability, setInternalMaterialsAvailability] = useState([])
  const [internalSiteMaterialPool, setInternalSiteMaterialPool] = useState([])
  const [internalMaterialAllocations, setInternalMaterialAllocations] = useState([])
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)

  // Close export menu on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Subscriptions for inventory assets
  useEffect(() => {
    if (!activeOrgId) return
    let unsub1 = () => {}
    let unsub2 = () => {}
    let unsub3 = () => {}

    if (!propMaterialsAvailability || propMaterialsAvailability.length === 0) {
      unsub1 = subscribeMaterialsAvailability(
        activeOrgId,
        (data) => setInternalMaterialsAvailability(data || []),
        (err) => console.error('Error subscribing to materialsAvailability:', err)
      )
    }

    if (!propSiteMaterialPool || propSiteMaterialPool.length === 0) {
      unsub2 = subscribeAllSiteMaterialPools(
        activeOrgId,
        (data) => setInternalSiteMaterialPool(data || []),
        (err) => console.error('Error subscribing to siteMaterialPool:', err)
      )
    }

    if (!propMaterialAllocations || propMaterialAllocations.length === 0) {
      unsub3 = subscribeWithFallback(
        activeOrgId,
        'materialAllocations',
        (data) => setInternalMaterialAllocations(data || []),
        (err) => console.error('Error subscribing to materialAllocations:', err)
      )
    }

    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [activeOrgId, propMaterialsAvailability, propSiteMaterialPool, propMaterialAllocations])

  const resolvedMaterialsAvailability =
    propMaterialsAvailability && propMaterialsAvailability.length > 0
      ? propMaterialsAvailability
      : internalMaterialsAvailability

  const resolvedSiteMaterialPool =
    propSiteMaterialPool && propSiteMaterialPool.length > 0
      ? propSiteMaterialPool
      : internalSiteMaterialPool

  const resolvedMaterialAllocations =
    propMaterialAllocations && propMaterialAllocations.length > 0
      ? propMaterialAllocations
      : internalMaterialAllocations

  // Subscriptions for project stages
  useEffect(() => {
    if (projectStages && projectStages.length > 0) return
    if (!activeOrgId) return
    const unsub = subscribeConfigItems(
      activeOrgId,
      CONFIG_SECTIONS.stage,
      (list) => setStagesFromConfig(list || []),
      (err) => console.error('Error subscribing to project stages:', err)
    )
    return () => unsub()
  }, [activeOrgId, projectStages])

  const configuredStageNames = useMemo(() => {
    const list = projectStages && projectStages.length > 0 ? projectStages : stagesFromConfig
    const names = (list || []).map((s) => (typeof s === 'string' ? s : s.projectStage || s.name || '').trim()).filter(Boolean)
    return [...new Set(names)]
  }, [projectStages, stagesFromConfig])

  // Normalized deduplicated sites
  const allSites = useMemo(() => {
    const raw = sites.length > 0 ? sites : projects
    const seen = new Set()
    return (raw || []).filter((s) => {
      const code = (s.siteId || s.id || '').toString().match(/ST\d+/i)?.[0]?.toUpperCase()
      const name = (s.siteName || s.name || s.projectName || '').trim().toLowerCase()
      const key = code || name || s.id
      if (!key) return true
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [sites, projects])

  const normalizedAllSites = useMemo(() => getNormalizedSiteOptions(allSites), [allSites])

  // Single-Tier Primary Report Suites Definition
  const reportSuites = useMemo(() => [
    {
      id: 'site_expenses',
      label: 'Site Expenses',
      desc: 'Daily ledger & cumulative vouchers',
      icon: ReceiptText,
      subReports: [
        { id: 'daily', label: 'Daily Expense Ledger', hint: 'Daily itemized transactions' },
        { id: 'range', label: 'Date Range Spend', hint: 'Audit period aggregations' },
        { id: 'summary', label: 'Cumulative Spend Summary', hint: 'Lifetime site expenditure' },
      ],
    },
    {
      id: 'financial_reports',
      label: 'Financials & Cash Flow',
      desc: 'Balance sheets & cash flow audit',
      icon: TrendingUp,
      subReports: [
        { id: 'statement', label: 'Financial Statement', hint: 'Budget vs received vs spent' },
        { id: 'cash_flow', label: 'Cash Flow Analysis', hint: 'Weekly inflow & outflow velocity' },
        { id: 'petty_cash', label: 'Petty Cash Float', hint: 'Supervisor float audit' },
      ],
    },
    {
      id: 'project_reports',
      label: 'Milestones & Projects',
      desc: 'Stage burn & execution timelines',
      icon: Layers,
      subReports: [
        { id: 'progress', label: 'Milestone Progress', hint: 'Foundation to finishing' },
        { id: 'status', label: 'Site Status & Timelines', hint: 'Schedule delays & forecasts' },
      ],
    },
    {
      id: 'workforce_reports',
      label: 'Workforce & Labor',
      desc: 'Muster roll & wage liabilities',
      icon: Users,
      subReports: [
        { id: 'muster', label: 'Attendance Muster Roll', hint: 'Daily worker status grid' },
        { id: 'incentives', label: 'Supervisor Incentives', hint: 'Target achievement bonuses' },
      ],
    },
    {
      id: 'inventory_reports',
      label: 'Inventory & Assets',
      desc: 'Materials stock & equipment',
      icon: Boxes,
      subReports: [
        { id: 'materials', label: 'Material Stock & Ledger', hint: 'Dispatches & field consumption' },
        { id: 'tools', label: 'Tools & Equipment', hint: 'Machinery inventory & status' },
        { id: 'summary', label: 'Contractor Ledger', hint: 'Trade contractor bills & payouts' },
      ],
    },
  ], [])

  const [activeSuiteId, setActiveSuiteId] = useState('site_expenses')
  const [activeSubReports, setActiveSubReports] = useState({
    site_expenses: 'daily',
    financial_reports: 'statement',
    project_reports: 'progress',
    workforce_reports: 'muster',
    inventory_reports: 'materials',
  })

  // URL sync: Read on mount / location change
  useEffect(() => {
    if (!location?.search) return
    try {
      const params = new URLSearchParams(location.search)
      const cat = params.get('category') || params.get('tab') || params.get('type')
      const sub = params.get('sub') || params.get('subReport') || params.get('report')

      if (cat) {
        const found = reportSuites.find((s) => s.id === cat || s.label.toLowerCase().includes(cat.toLowerCase()))
        if (found) {
          setActiveSuiteId(found.id)
          if (sub) {
            setActiveSubReports((prev) => ({ ...prev, [found.id]: sub }))
          }
        } else if (cat.includes('project')) {
          setActiveSuiteId('project_reports')
          if (sub) {
            setActiveSubReports((prev) => ({ ...prev, project_reports: sub }))
          }
        }
      }
    } catch (e) {
      console.warn('Could not parse reports URL params:', e)
    }
  }, [location?.search, reportSuites])

  // Sync back to URL when suite or subreport changes
  const updateUrlParams = (suiteId, subId) => {
    try {
      const search = new URLSearchParams(location.search)
      search.set('category', suiteId)
      search.set('sub', subId)
      navigate({ search: search.toString() }, { replace: true })
    } catch {
      // fallback
    }
  }

  const handleSuiteChange = (suiteId) => {
    setActiveSuiteId(suiteId)
    const currentSub = activeSubReports[suiteId] || reportSuites.find((s) => s.id === suiteId)?.subReports[0]?.id || 'daily'
    updateUrlParams(suiteId, currentSub)
  }

  const handleSubReportChange = (subId) => {
    setActiveSubReports((prev) => ({
      ...prev,
      [activeSuiteId]: subId,
    }))
    updateUrlParams(activeSuiteId, subId)
  }

  const activeSuiteObj = reportSuites.find((s) => s.id === activeSuiteId) || reportSuites[0]
  const currentSubReport = activeSubReports[activeSuiteId] || activeSuiteObj.subReports[0]?.id

  // Unified Filter State
  const todayStr = new Date().toISOString().split('T')[0]
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const currentMonthStr = todayStr.slice(0, 7)

  const [filterSiteId, setFilterSiteId] = useState('all')
  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterFromDate, setFilterFromDate] = useState(thirtyDaysAgoStr)
  const [filterToDate, setFilterToDate] = useState(todayStr)
  const [filterStage, setFilterStage] = useState('all')

  const handleResetFilters = () => {
    setFilterSiteId('all')
    setFilterDate(todayStr)
    setFilterFromDate(thirtyDaysAgoStr)
    setFilterToDate(todayStr)
    setFilterStage('all')
  }

  // Quick Date Range Presets
  const setDatePreset = (preset) => {
    const now = new Date()
    if (preset === 'today') {
      const t = now.toISOString().split('T')[0]
      setFilterDate(t)
      setFilterFromDate(t)
      setFilterToDate(t)
    } else if (preset === '7d') {
      const past = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      setFilterFromDate(past)
      setFilterToDate(now.toISOString().split('T')[0])
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      setFilterFromDate(firstDay)
      setFilterToDate(now.toISOString().split('T')[0])
      setFilterDate(now.toISOString().split('T')[0])
    } else if (preset === 'all') {
      setFilterFromDate('2020-01-01')
      setFilterToDate(now.toISOString().split('T')[0])
    }
  }

  // Real-time Executive KPI Calculations
  const totalBudget = useMemo(() => {
    return allSites.reduce((sum, s) => sum + parseAmount(s.projectBudget || s.budget || 0), 0)
  }, [allSites])

  const totalReceived = useMemo(() => {
    const paymentsSum = sitePayments.reduce(
      (sum, p) => sum + parseAmount(p.amountPaid || p.amount || p.totalAmount || 0),
      0
    )
    const sitesPaidSum = allSites.reduce((sum, s) => sum + parseAmount(s.amountPaid || 0), 0)
    return paymentsSum > 0 ? paymentsSum : sitesPaidSum
  }, [sitePayments, allSites])

  const totalSpent = useMemo(() => {
    const rollupsSum = totalSiteExpensesPerDay.reduce(
      (sum, r) => sum + parseAmount(r.totalAllExpenses || r.totalAmount || 0),
      0
    )
    const sitesSpentSum = allSites.reduce((sum, s) => sum + parseAmount(s.amountSpent || s.spentAmount || 0), 0)
    return rollupsSum > 0 ? rollupsSum : sitesSpentSum
  }, [allSites, totalSiteExpensesPerDay])

  const cashInHand = totalReceived - totalSpent
  const collectionRate = totalBudget > 0 ? Math.min(100, Math.round((totalReceived / totalBudget) * 100)) : 0
  const burnRate = totalReceived > 0 ? Math.min(100, Math.round((totalSpent / totalReceived) * 100)) : 0

  // Export handlers
  const handleExportPortfolioSummary = () => {
    exportToCSV('Portfolio_Executive_Summary', ['Metric', 'Value (INR / Count)'], [
      ['Total Portfolio Sites', allSites.length],
      ['Total Approved Contract Budget', totalBudget],
      ['Cumulative Inflow Received', totalReceived],
      ['Consolidated Actual Outflows', totalSpent],
      ['Operating Liquidity Balance', cashInHand],
      ['Budget Collection Rate', `${collectionRate}%`],
      ['Capital Burn Rate', `${burnRate}%`],
    ], { orgName })
    setShowExportMenu(false)
  }

  const handlePrintExecutivePDF = () => {
    const content = `
      <div style="margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #0B3470;">
        <h2 style="margin: 0; color: #0B3470; font-size: 20px;">Executive Portfolio Statement</h2>
        ${orgName ? `<p style="margin: 3px 0 6px 0; color: #0B3470; font-weight: bold; font-size: 14px;">Organization: ${orgName}</p>` : ''}
        <p style="margin: 4px 0; color: #64748b; font-size: 12px;">Verified real-time multi-site financial telemetry</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">Active Sites</span>
          <div style="font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 4px;">${allSites.length} Sites</div>
        </div>
        <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">Total Inflows</span>
          <div style="font-size: 18px; font-weight: bold; color: #047857; margin-top: 4px;">${money(totalReceived)}</div>
          <small style="color: #64748b; font-size: 10px;">${collectionRate}% of Budget</small>
        </div>
        <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">Consolidated Outflow</span>
          <div style="font-size: 18px; font-weight: bold; color: #e11d48; margin-top: 4px;">${money(totalSpent)}</div>
          <small style="color: #64748b; font-size: 10px;">${burnRate}% Burn Rate</small>
        </div>
        <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <span style="font-size: 11px; color: #64748b; text-transform: uppercase;">Operating Liquidity</span>
          <div style="font-size: 18px; font-weight: bold; color: ${cashInHand >= 0 ? '#6b21a8' : '#e11d48'}; margin-top: 4px;">${money(cashInHand)}</div>
          <small style="color: #64748b; font-size: 10px;">${cashInHand >= 0 ? 'Surplus Balance' : 'Liquidity Deficit'}</small>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Site Name / Code</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left;">Current Stage</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: right;">Contract Budget</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: right;">Received</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: right;">Total Spent</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: right;">Net Balance</th>
          </tr>
        </thead>
        <tbody>
          ${allSites.map((s) => {
            const b = parseAmount(s.projectBudget || s.budget || 0)
            const r = parseAmount(s.amountPaid || 0)
            const sp = parseAmount(s.amountSpent || s.spentAmount || 0)
            const net = r - sp
            return `
              <tr>
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0;">
                  <strong>${s.projectName || s.siteName || s.name || s.id}</strong>
                  ${s.siteId ? `<br/><small style="color:#64748b;">${s.siteId}</small>` : ''}
                </td>
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0;">${s.projectStage || s.stage || 'General'}</td>
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">${money(b)}</td>
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #047857;">${money(r)}</td>
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #e11d48;">${money(sp)}</td>
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: bold; color: ${net >= 0 ? '#6b21a8' : '#e11d48'};">${money(net)}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    `
    printReport('Executive Portfolio Financial Statement', content, { orgName })
    setShowExportMenu(false)
  }

  return (
    <div className="space-y-6 text-slate-800 animate-fade-in pb-16">
      {/* ----------------------------------------------------------------------------------------- */}
      {/* 1. EXECUTIVE WORKSPACE HEADER */}
      {/* ----------------------------------------------------------------------------------------- */}
      <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 lg:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70">
                <Sparkles className="w-3 h-3 text-blue-600" />
                Executive Analytics Workspace
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-time Live Telemetry
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Organization Reports & Financial Intelligence
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-3xl leading-relaxed">
              Consolidated multi-site expenditure ledgers, client realization rates, workforce payroll records, and milestone timeline forecasts.
            </p>
          </div>

          {/* Quick Date Range Shortcuts & Export Dropdown */}
          <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
            {/* Date Preset Buttons */}
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-[11px] font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setDatePreset('today')}
                className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('7d')}
                className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all cursor-pointer"
              >
                Last 7D
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('month')}
                className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all cursor-pointer"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('all')}
                className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all cursor-pointer"
              >
                All Time
              </button>
            </div>

            {/* Export Dropdown Menu */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Statement</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 animate-fade-in space-y-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Select Export Format
                  </div>
                  <button
                    type="button"
                    onClick={handleExportPortfolioSummary}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-bold text-slate-800">Export Summary (CSV)</div>
                      <div className="text-[10px] text-slate-400">Download tabular KPI portfolio data</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintExecutivePDF}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-blue-600" />
                    <div>
                      <div className="font-bold text-slate-800">Print Statement (PDF)</div>
                      <div className="text-[10px] text-slate-400">Official printable portfolio audit statement</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 2. EXECUTIVE 4-KPI STRIP WITH VISUAL PROGRESS GAUGES */}
      {/* ----------------------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Portfolio Sites */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Portfolio Footprint
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl lg:text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
                  {allSites.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">Active Sites</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 group-hover:scale-105 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Contract Baseline</span>
            <span className="font-semibold text-slate-800 font-mono">{money(totalBudget)}</span>
          </div>
        </div>

        {/* KPI 2: Total Inflow Received */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Inflow Realized
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl lg:text-3xl font-extrabold text-emerald-700 font-mono tracking-tight">
                  {money(totalReceived)}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">Budget Realized</span>
              <span className="font-bold text-emerald-700 font-mono">{collectionRate}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(3, collectionRate))}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Consolidated Outflow */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">
                Consolidated Outflows
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl lg:text-3xl font-extrabold text-rose-600 font-mono tracking-tight">
                  {money(totalSpent)}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 group-hover:scale-105 transition-transform">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">Fund Burn Rate</span>
              <span className="font-bold text-rose-600 font-mono">{burnRate}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-rose-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(3, burnRate))}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 4: Operating Liquidity */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
                Operating Liquidity
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-2xl lg:text-3xl font-extrabold font-mono tracking-tight ${cashInHand >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
                  {money(cashInHand)}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100 group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Liquidity State</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                cashInHand >= 0
                  ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                  : 'bg-rose-50 text-rose-600 border border-rose-200/60'
              }`}
            >
              {cashInHand >= 0 ? 'Surplus Float' : 'Liquidity Deficit'}
            </span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 3. EXECUTIVE SINGLE-TIER SUITE NAVIGATION & CONTEXTUAL SUB-PILLS */}
      {/* ----------------------------------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3 sm:p-4 space-y-3.5">
        {/* Primary Suite Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-100">
          {reportSuites.map((suite) => {
            const Icon = suite.icon
            const isActive = activeSuiteId === suite.id
            return (
              <button
                key={suite.id}
                type="button"
                onClick={() => handleSuiteChange(suite.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{suite.label}</span>
              </button>
            )
          })}
        </div>

        {/* Contextual Sub-Report Selector Pills */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 whitespace-nowrap">
              Active Module:
            </span>
            {activeSuiteObj.subReports.map((sub) => {
              const isSubActive = currentSubReport === sub.id
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleSubReportChange(sub.id)}
                  title={sub.hint}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isSubActive
                      ? 'bg-blue-50 text-blue-800 border border-blue-200/90 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  {sub.label}
                </button>
              )
            })}
          </div>

          <div className="text-[11px] font-medium text-slate-400 italic hidden md:block">
            {activeSuiteObj.desc}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 4. UNIFIED STICKY CONTROL & FILTER CENTER */}
      {/* ----------------------------------------------------------------------------------------- */}
      <div className="sticky top-2 z-30 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-sm p-3.5 transition-all">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Site Selector (Span 4) */}
          <div className="lg:col-span-4">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" />
                Target Project / Site
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                {filterSiteId === 'all' ? `${allSites.length} Sites` : 'Filtered'}
              </span>
            </label>
            <select
              value={filterSiteId}
              onChange={(e) => setFilterSiteId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
            >
              <option value="all">All Managed Sites ({allSites.length})</option>
              {normalizedAllSites.map((s, idx) => (
                <option key={`hub-site-${s.id || s.siteId || idx}-${idx}`} value={s.id || s.siteId}>
                  {s.label || s.projectName || s.siteName || s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          {/* Contextual Date Controls (Span 4 or 5) */}
          {currentSubReport === 'daily' ? (
            <div className="lg:col-span-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                Audit Record Date
              </label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
              />
            </div>
          ) : currentSubReport === 'muster' ? (
            <div className="lg:col-span-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                Audit Month Period
              </label>
              <input
                type="month"
                value={filterDate ? filterDate.slice(0, 7) : currentMonthStr}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
              />
            </div>
          ) : (
            <div className="lg:col-span-5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Date Range Window
                </span>
                <span className="text-[10px] text-slate-400 font-medium">From — To</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
                />
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
                />
              </div>
            </div>
          )}

          {/* Construction Stage Selector */}
          <div className={currentSubReport === 'range' || currentSubReport === 'summary' || currentSubReport === 'statement' || currentSubReport === 'cash_flow' ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" />
              Stage Filter
            </label>
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all cursor-pointer shadow-2xs"
            >
              <option value="all">All Stages</option>
              {configuredStageNames.map((stg) => (
                <option key={stg} value={stg}>
                  {stg}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters Shortcut Button */}
          <div className="lg:col-span-1 flex items-center">
            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset all filters to defaults"
              className="w-full py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-slate-200 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline lg:hidden">Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 5. ACTIVE REPORT CANVAS VIEW (CLEAN DATA PRESENTATION) */}
      {/* ----------------------------------------------------------------------------------------- */}
      <ReportErrorBoundary>
        <div className="space-y-6">
          {/* Site Expenses Hub */}
          {activeSuiteId === 'site_expenses' && (
            <SiteExpensesReportHub
              sites={allSites}
              siteSupervisorEntries={siteSupervisorEntries}
              managerExpenses={managerExpenses}
              managerEntries={managerEntries}
              managerExpenseSummary={managerExpenseSummary}
              organizationEntries={organizationEntries}
              organizationExpenses={organizationExpenses}
              organizationExpenseSummary={organizationExpenseSummary}
              contractorEntries={contractorEntries}
              totalSiteExpensesPerDay={totalSiteExpensesPerDay}
              sitePayments={sitePayments}
              siteSupervisorIncentives={siteSupervisorIncentives}
              dailySiteLogs={dailySiteLogs}
              subReport={currentSubReport}
              initialSiteId={filterSiteId}
              initialDate={filterDate}
              initialFromDate={filterFromDate}
              initialToDate={filterToDate}
              initialStage={filterStage}
              projectStages={configuredStageNames}
              hideHeaderFilters={true}
              orgId={activeOrgId}
              role={activeRole}
              orgName={orgName}
            />
          )}

          {/* Financial Status Hub */}
          {activeSuiteId === 'financial_reports' && (
            <>
              {(currentSubReport === 'statement' || currentSubReport === 'cash_flow') && (
                <FinancialStatusReportHub
                  sites={allSites}
                  sitePayments={sitePayments}
                  totalSiteExpensesPerDay={totalSiteExpensesPerDay}
                  siteSupervisorEntries={siteSupervisorEntries}
                  subReport={currentSubReport}
                  initialSiteId={filterSiteId}
                  hideHeaderFilters={true}
                  orgName={orgName}
                />
              )}
              {currentSubReport === 'petty_cash' && (
                <PettyCashInsightsReportHub
                  sites={allSites}
                  pettyCashAccounts={pettyCashAccounts}
                  pettyCashExpenses={pettyCashExpenses}
                  pettyCashRequests={pettyCashRequests}
                  subReport="audit"
                  initialSiteId={filterSiteId}
                  hideHeaderFilters={true}
                  orgName={orgName}
                />
              )}
            </>
          )}

          {/* Project Milestones Hub */}
          {activeSuiteId === 'project_reports' && (
            <>
              {currentSubReport === 'status' ? (
                <SiteStatusReportHub
                  sites={allSites}
                  initialSiteId={filterSiteId}
                  initialStage={filterStage}
                  hideHeaderFilters={true}
                  orgName={orgName}
                />
              ) : (
                <ProjectStageReportsHub
                  sites={allSites}
                  siteSupervisorEntries={siteSupervisorEntries}
                  managerExpenses={managerExpenses}
                  organizationEntries={organizationEntries}
                  contractorEntries={contractorEntries}
                  subReport={currentSubReport}
                  initialStage={filterStage}
                  projectStages={configuredStageNames}
                  hideHeaderFilters={true}
                  orgName={orgName}
                />
              )}
            </>
          )}

          {/* Workforce Hub */}
          {activeSuiteId === 'workforce_reports' && (
            <>
              {currentSubReport === 'muster' && (
                <WorkerAttendanceReport
                  orgId={orgId}
                  sites={allSites}
                  initialMonth={filterDate ? filterDate.slice(0, 7) : currentMonthStr}
                  initialSiteId={filterSiteId}
                  hideHeaderFilters={true}
                  orgName={orgName}
                />
              )}
              {currentSubReport === 'incentives' && (
                <DomainInventoryReportsHub
                  contractors={contractors}
                  contractorBills={contractorBills}
                  contractorEntries={contractorEntries}
                  materials={materials}
                  tools={tools}
                  workers={workers}
                  workerAttendance={workerAttendance}
                  vehicles={vehicles}
                  siteSupervisorIncentives={siteSupervisorIncentives}
                  siteMaterialPool={resolvedSiteMaterialPool}
                  materialsAvailability={resolvedMaterialsAvailability}
                  materialAllocations={resolvedMaterialAllocations}
                  siteSupervisorEntries={siteSupervisorEntries}
                  sites={allSites}
                  subReport="incentives"
                  initialSiteId={filterSiteId}
                  initialFromDate={filterFromDate}
                  initialToDate={filterToDate}
                  initialStage={filterStage}
                  projectStages={configuredStageNames}
                  hideHeaderFilters={true}
                  orgName={orgName}
                />
              )}
            </>
          )}

          {/* Inventory & Assets Hub */}
          {activeSuiteId === 'inventory_reports' && (
            <DomainInventoryReportsHub
              contractors={contractors}
              contractorBills={contractorBills}
              contractorEntries={contractorEntries}
              materials={materials}
              tools={tools}
              workers={workers}
              workerAttendance={workerAttendance}
              vehicles={vehicles}
              siteSupervisorIncentives={siteSupervisorIncentives}
              siteMaterialPool={resolvedSiteMaterialPool}
              materialsAvailability={resolvedMaterialsAvailability}
              materialAllocations={resolvedMaterialAllocations}
              siteSupervisorEntries={siteSupervisorEntries}
              sites={allSites}
              subReport={currentSubReport}
              initialSiteId={filterSiteId}
              initialFromDate={filterFromDate}
              initialToDate={filterToDate}
              initialStage={filterStage}
              projectStages={configuredStageNames}
              hideHeaderFilters={true}
              orgName={orgName}
            />
          )}
        </div>
      </ReportErrorBoundary>
    </div>
  )
}
