import React, { useState, useEffect, useMemo } from 'react'
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Calendar,
  Building2,
  Trash2,
  Download,
  IndianRupee,
  FileText,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  CreditCard,
  Table,
  LayoutGrid,
  Image as ImageIcon,
  Paperclip,
  Eye,
  UploadCloud,
  Check,
  ArrowRight,
  User,
  Shield,
  Layers,
  Info,
  AlertCircle,
  PlusCircle,
  History,
} from 'lucide-react'
import {
  fetchManagerExpenses,
  subscribeManagerExpenses,
  fetchDayManagerExpense,
  recordManagerExpense,
  deleteManagerExpense,
  generateManagerExpenseDocId,
  resolveCanonicalSiteKey,
} from '../../../services/managerExpenseService.js'
import {
  isExpenseMatchingSite,
  resolveProjectCategoryOrStage,
} from '../../../services/expenseNormalizationService.js'
import { fetchProjectDetails } from '../../../services/projectService.js'
import AppStorageService from '../../../services/appStorageService.js'
import BillImagePreviewModal from '../../../components/common/BillImagePreviewModal.jsx'

/**
 * CST White Label / eBricks - Manager Expenses
 * Implements the existing Mobile Manager Expenses flow (lib/screens/manager/manager_expenses.dart)
 * in the Web Application with dual tab architecture (Expense Entry & Expense Logs),
 * deterministic doc ID `${siteId}_${ddMMyyyy}`, bill merging, and project financial rollup sync.
 */
export default function ManagerExpenses({ orgId, sites = [], currentUser, onNotify }) {
  // Dual Tab Controller: 'entry' (Tab 0: Expense Entry) | 'logs' (Tab 1: Expense Logs / History)
  const [activeTab, setActiveTab] = useState('entry')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards' for logs tab
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [expandedId, setExpandedId] = useState(null)

  // Manager Identity Hydration (Section 2.1)
  const managerId = currentUser?.id || currentUser?.uid || 'mgr_lead'
  const managerName =
    currentUser?.fullName ||
    currentUser?.FullName ||
    currentUser?.name ||
    currentUser?.displayName ||
    'Operations Manager'
  const managerRole = currentUser?.userRole || currentUser?.role || 'Manager'

  // Image Preview Modal State
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    imageUrl: '',
    title: '',
    vendor: '',
    amount: '',
    billNo: '',
    date: '',
  })

  // ==============================================================================================
  // TAB 0: EXPENSE ENTRY FORM STATE (Section 2.1 - 2.4)
  // ==============================================================================================
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [formSiteId, setFormSiteId] = useState('')
  const [formProjectName, setFormProjectName] = useState('')
  const [formSupervisor, setFormSupervisor] = useState('')
  const [formStage, setFormStage] = useState('')
  const [formDate, setFormDate] = useState(todayStr)
  const [formRemarks, setFormRemarks] = useState('')

  // Ongoing Day Expense State (from managerExpenses/{siteId}_{ddMMyyyy})
  const [existingDayExpense, setExistingDayExpense] = useState(null)
  const [checkingDayExpense, setCheckingDayExpense] = useState(false)
  const [showExistingBillsList, setShowExistingBillsList] = useState(false)

  // Multi-Bill Itemization State (Section 2.3)
  const createEmptyBillForm = () => ({
    billNo: '',
    vendor: '',
    quantity: '',
    amount: '',
    description: '',
    file: null,
    fileName: '',
    billUrl: '',
    storagePath: '',
    previewUrl: '',
    isUploading: false,
  })

  const [currentBill, setCurrentBill] = useState(createEmptyBillForm())
  const [sessionBills, setSessionBills] = useState([])

  // Submission Flow & Modals State (Section 2.4 & 2.6)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedResult, setSubmittedResult] = useState(null)

  // Calculate Live Session Total
  const sessionTotal = useMemo(() => {
    return sessionBills.reduce((acc, b) => acc + (Number(b.amount || b.billAmount) || 0), 0)
  }, [sessionBills])

  // Check if existing bills are recorded for selected site & date
  const checkDayExpense = async (siteId, dateVal) => {
    if (!orgId || !siteId || !dateVal) {
      setExistingDayExpense(null)
      return
    }
    setCheckingDayExpense(true)
    try {
      const site = sites.find((s) => s.id === siteId || s.siteId === siteId)
      const existing = await fetchDayManagerExpense(orgId, siteId, dateVal, {
        siteCode: site?.siteCode,
        projectName: formProjectName || site?.projectName || site?.siteName,
        siteName: site?.siteName,
      })
      setExistingDayExpense(existing)
    } catch (err) {
      console.warn('checkDayExpense error:', err?.message)
      setExistingDayExpense(null)
    } finally {
      setCheckingDayExpense(false)
    }
  }

  // Handle Site Selection & Auto-fill from Backend (Section 2.2)
  const handleSiteSelect = async (e) => {
    const selectedId = e.target.value
    setFormSiteId(selectedId)

    if (!selectedId) {
      setFormProjectName('')
      setFormSupervisor('')
      setFormStage('')
      setExistingDayExpense(null)
      return
    }

    // 1. Resolve from local sites prop for instantaneous auto-fill
    const matchedSite = sites.find(
      (s) =>
        s.id === selectedId ||
        s.siteId === selectedId ||
        s.projectId === selectedId ||
        s.siteCode === selectedId
    )

    const initialProjectName = matchedSite?.projectName || matchedSite?.siteName || ''
    const initialSupervisor =
      matchedSite?.supervisorName ||
      matchedSite?.supervisorId ||
      matchedSite?.supervisor ||
      ''
    const initialStage = resolveProjectCategoryOrStage(matchedSite)

    setFormProjectName(initialProjectName)
    setFormSupervisor(initialSupervisor)
    setFormStage(initialStage || '')

    // 2. Fetch fresh project document directly from Firestore backend
    if (orgId) {
      try {
        const backendProject = await fetchProjectDetails(orgId, selectedId)
        if (backendProject) {
          const backendStage = resolveProjectCategoryOrStage(backendProject)
          if (backendStage) setFormStage(backendStage)
          if (backendProject.projectName) setFormProjectName(backendProject.projectName)
          if (backendProject.supervisorName || backendProject.supervisorId) {
            setFormSupervisor(backendProject.supervisorName || backendProject.supervisorId)
          }
        }
      } catch (err) {
        console.warn('Error fetching backend project details for auto-fill:', err?.message)
      }
    }

    // 3. Query existing day's manager bills from managerExpenses/{siteId}_{ddMMyyyy}
    checkDayExpense(selectedId, formDate)
  }

  // Handle Date Change & Refresh Existing Day Check
  const handleDateChange = (e) => {
    const newDate = e.target.value
    setFormDate(newDate)
    if (formSiteId) {
      checkDayExpense(formSiteId, newDate)
    }
  }

  // Reset complete entry form
  const resetEntryForm = () => {
    setFormSiteId('')
    setFormProjectName('')
    setFormSupervisor('')
    setFormStage('')
    setFormDate(todayStr)
    setFormRemarks('')
    setExistingDayExpense(null)
    setSessionBills([])
    setCurrentBill(createEmptyBillForm())
    setShowExistingBillsList(false)
  }

  // Handle File Attachment for the Current Bill Input Row
  const handleBillFileSelected = async (file) => {
    if (!file) return

    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    setCurrentBill((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      previewUrl,
      isUploading: true,
    }))

    // If site is already selected, upload immediately to Firebase Storage under tenant path
    if (orgId && formSiteId) {
      try {
        const site = sites.find((s) => s.id === formSiteId)
        const siteName = site?.siteName || site?.projectName || 'Project_Site'

        const uploadResult = await AppStorageService.uploadExpenseBillDoc({
          tenantId: orgId,
          expenseType: 'manager expenses',
          siteId: formSiteId,
          siteName,
          billNo: currentBill.billNo || '',
          fileName: file.name,
          file,
          sitesList: sites,
        })

        setCurrentBill((prev) => ({
          ...prev,
          file,
          fileName: file.name,
          billUrl: uploadResult.downloadUrl,
          storagePath: uploadResult.storagePath,
          isUploading: false,
        }))
        onNotify?.(`Bill document "${file.name}" uploaded successfully`, 'success')
      } catch (err) {
        console.error('Instant bill upload error:', err)
        setCurrentBill((prev) => ({
          ...prev,
          file: null,
          fileName: '',
          previewUrl: '',
          billUrl: '',
          storagePath: '',
          isUploading: false,
        }))
        onNotify?.(`Bill upload failed: ${err?.message || 'Storage permission or network error'}.`, 'error')
      }
    } else {
      setCurrentBill((prev) => ({
        ...prev,
        isUploading: false,
      }))
    }
  }

  // Add Bill Item to Current Session (Section 2.3 step 3)
  const handleAddBillToSession = (e) => {
    e?.preventDefault()

    const amt = Number(currentBill.amount)
    if (!amt || amt <= 0) {
      onNotify?.('Please enter a valid bill amount greater than ₹0', 'error')
      return
    }

    if (!currentBill.vendor?.trim() && !currentBill.description?.trim()) {
      onNotify?.('Please enter vendor name or purpose description for this bill', 'error')
      return
    }

    const rawBillQty = currentBill.quantity !== undefined && currentBill.quantity !== null && currentBill.quantity !== ''
      ? (Number.isFinite(Number(currentBill.quantity)) ? Number(currentBill.quantity) : currentBill.quantity)
      : null

    const billItem = {
      ...currentBill,
      billNo: currentBill.billNo?.trim() || `BILL-${sessionBills.length + 1}`,
      vendor: currentBill.vendor?.trim() || 'Vendor',
      billVendor: currentBill.vendor?.trim() || 'Vendor',
      quantity: rawBillQty,
      qty: rawBillQty,
      amount: amt,
      billAmount: amt,
      description: currentBill.description?.trim() || 'Site Disbursement',
      billDate: formDate || todayStr,
      raisedBy: managerId,
      raisedByName: managerName,
      userRole: managerRole,
      createdAt: new Date(),
    }

    setSessionBills((prev) => [...prev, billItem])
    setCurrentBill(createEmptyBillForm())
    onNotify?.('Bill item added to current session!', 'success')
  }

  // Remove a Bill Item from the Current Session
  const handleRemoveBillFromSession = (index) => {
    setSessionBills((prev) => prev.filter((_, i) => i !== index))
  }

  // Trigger Pre-Submission Confirmation Dialog (Section 2.4)
  const handleInitiateSubmit = (e) => {
    e?.preventDefault()

    if (!formSiteId) {
      onNotify?.('Please select a target construction site', 'error')
      return
    }

    if (!formStage?.trim()) {
      onNotify?.('Please verify project stage/category', 'error')
      return
    }

    if (sessionBills.length === 0) {
      onNotify?.('Please add at least one bill item to this session', 'error')
      return
    }

    if (sessionTotal <= 0) {
      onNotify?.('Total session amount must be greater than zero', 'error')
      return
    }

    // Open confirmation dialog
    setShowConfirmModal(true)
  }

  // Execute Submission to Firestore & Sync Engine (Section 2.6)
  const handleFinalSubmit = async () => {
    if (!orgId || !formSiteId || sessionBills.length === 0) return

    setSubmitting(true)
    try {
      const site = sites.find((s) => s.id === formSiteId)
      const siteName = site?.siteName || site?.projectName || 'Project Site'

      // Ensure all bill files are uploaded to Storage under tenant path
      const processedBills = await Promise.all(
        sessionBills.map(async (b) => {
          let billUrl = b.billUrl || ''
          let storagePath = b.storagePath || ''

          if (b.file && !billUrl) {
            const uploadRes = await AppStorageService.uploadExpenseBillDoc({
              tenantId: orgId,
              expenseType: 'manager expenses',
              siteId: formSiteId,
              siteName,
              billNo: b.billNo || '',
              fileName: b.fileName || b.file.name,
              file: b.file,
              sitesList: sites,
            })
            billUrl = uploadRes.downloadUrl
            storagePath = uploadRes.storagePath
          }

          return {
            billNo: b.billNo,
            vendor: b.vendor,
            billVendor: b.vendor,
            quantity: b.quantity !== undefined ? b.quantity : null,
            qty: b.quantity !== undefined ? b.quantity : null,
            amount: b.amount,
            billAmount: b.amount,
            billUrl,
            imageUrl: billUrl,
            billCopy: billUrl || 'billURL',
            storagePath,
            description: b.description,
            billDate: b.billDate || formDate,
            raisedBy: managerId,
            raisedByName: managerName,
            userRole: managerRole,
            createdAt: new Date(),
          }
        })
      )

      const totalQuantity = processedBills.some((b) => b.quantity !== null && b.quantity !== undefined && Number.isFinite(Number(b.quantity)))
        ? processedBills.reduce((acc, b) => acc + (typeof b.quantity === 'number' ? b.quantity : (Number(b.quantity) || 0)), 0)
        : null

      const result = await recordManagerExpense(
        orgId,
        {
          siteId: formSiteId,
          siteCode: selectedSite?.siteCode,
          siteName,
          projectName: formProjectName || selectedSite?.projectName || siteName,
          projectStage: formStage,
          supervisorName: formSupervisor || 'SUP_001',
          expenseDate: formDate,
          remarks: formRemarks,
          bills: processedBills,
          quantity: totalQuantity,
          totalAmount: sessionTotal,
        },
        currentUser
      )

      const expectedDocId = generateManagerExpenseDocId({
        siteId: formSiteId,
        siteCode: selectedSite?.siteCode,
        projectName: formProjectName || selectedSite?.projectName || siteName,
        siteName,
        expenseDate: formDate,
      })

      setSubmittedResult({
        siteName,
        date: formDate,
        billsCount: sessionBills.length,
        totalAmount: sessionTotal,
        docId: result?.id || expectedDocId,
      })

      setShowConfirmModal(false)
      setShowSuccessModal(true)
      onNotify?.('Manager expenses submitted and synchronized with project balances!', 'success')
      await loadData()
    } catch (err) {
      console.error('Submit expense error:', err)
      onNotify?.(err.message || 'Failed to submit expense', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ==============================================================================================
  // TAB 1: EXPENSE LOGS & REAL-TIME SUBSCRIPTION (Section 3.1)
  // ==============================================================================================
  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchManagerExpenses(orgId)
      setExpenses(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load manager expense claims', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!orgId) return
    loadData()
    const unsubscribe = subscribeManagerExpenses(
      orgId,
      (liveData) => {
        setExpenses(liveData || [])
        setLoading(false)
      },
      (err) => {
        console.warn('Real-time manager expenses error:', err?.message)
      }
    )
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [orgId])

  // Delete Voucher Action
  const handleDelete = async (expenseId, siteId) => {
    if (!orgId || !expenseId) return
    if (!window.confirm('Delete this manager expense voucher? This will automatically recalculate project spent and daily balances.')) {
      return
    }
    try {
      await deleteManagerExpense(orgId, expenseId, siteId)
      onNotify?.('Expense voucher deleted and project balances updated', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete expense', 'error')
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    if (expenses.length === 0) return
    const rows = [
      ['Voucher ID', 'Site Name', 'Stage', 'Date', 'Quantity', 'Total Amount (INR)', 'Manager', 'Remarks', 'Bills Count', 'Receipt Attached'],
      ...expenses.map((e) => {
        const dStr = e.date instanceof Date
          ? e.date.toLocaleDateString('en-IN')
          : (e.expenseDate?.seconds
              ? new Date(e.expenseDate.seconds * 1000).toLocaleDateString('en-IN')
              : (typeof e.date === 'string' ? e.date : ''))
        const billsCount = Array.isArray(e.bills) ? e.bills.length : 1
        const rawQty = e.quantity !== undefined && e.quantity !== null && e.quantity !== ''
          ? e.quantity
          : (Array.isArray(e.bills) && e.bills.some((b) => b.quantity !== null && b.quantity !== undefined)
              ? (e.bills.length === 1 ? e.bills[0].quantity : e.bills.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0) || '-')
              : '-')
        return [
          e.expenseId || e.id,
          e.siteName || e.projectName || '',
          e.projectStage || '',
          dStr,
          rawQty !== null && rawQty !== '' ? rawQty : '-',
          e.totalAmount || e.amount || 0,
          e.managerName || e.supervisorName || '',
          `"${(e.remarks || '').replace(/"/g, '""')}"`,
          billsCount,
          e.billUrl || e.bills?.some((b) => b.billUrl || b.imageUrl || (b.billCopy && b.billCopy !== 'billURL')) ? 'Yes' : 'No',
        ]
      }),
    ]
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((r) => r.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `manager_expenses_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return expenses.filter((e) => {
      const siteName = (e.siteName || '').toLowerCase()
      const projectName = (e.projectName || '').toLowerCase()
      const projectStage = (e.projectStage || '').toLowerCase()
      const remarks = (e.remarks || '').toLowerCase()
      const manager = (e.managerName || e.supervisorName || '').toLowerCase()

      const matchesSearch =
        !q ||
        siteName.includes(q) ||
        projectName.includes(q) ||
        projectStage.includes(q) ||
        remarks.includes(q) ||
        manager.includes(q) ||
        (Array.isArray(e.bills) &&
          e.bills.some((b) =>
            (b.vendor || b.billVendor || '').toLowerCase().includes(q) ||
            (b.billNo || '').toLowerCase().includes(q) ||
            (b.description || '').toLowerCase().includes(q)
          ))

      const matchesSite = isExpenseMatchingSite(e, selectedSiteFilter, sites)
      return matchesSearch && matchesSite
    })
  }, [expenses, searchQuery, selectedSiteFilter, sites])

  const totalSumSpent = useMemo(() => {
    return filteredExpenses.reduce((acc, e) => acc + (Number(e.totalAmount || e.amount) || 0), 0)
  }, [filteredExpenses])

  const selectedSite = useMemo(() => {
    return sites.find((s) => s.id === formSiteId)
  }, [sites, formSiteId])

  return (
    <div className="space-y-6">
      {/* Top Banner with Dual Navigation Tabs matching Mobile App Architecture */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">
              Operations Control
            </span>
            <span className="text-xs text-slate-400">• Out-of-Pocket Disbursements</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manager Expenses</h1>
          <p className="text-xs text-slate-500 mt-1">
            Log and reconcile site manager expenses, emergency vendor bills, testing invoices, and materials vouchers with attached bill receipts.
          </p>
        </div>

        {/* Dual Tab Controller: Tab 0 (Expense Entry) & Tab 1 (Expense Logs / History) */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'entry'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Expense Entry</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Expense Logs ({expenses.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Disbursed</p>
          <p className="text-2xl font-black text-slate-900 mt-1">₹{totalSumSpent.toLocaleString('en-IN')}</p>
          <p className="text-xs text-purple-600 font-medium mt-1">Direct project out-of-pocket</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recorded Vouchers</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{filteredExpenses.length}</p>
          <p className="text-xs text-slate-500 mt-1">Reconciled daily claims</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Coverage</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{sites.length} Active Sites</p>
          <p className="text-xs text-emerald-600 font-medium mt-1">Auto-synced to project budget</p>
        </div>
      </div>

      {/* ========================================================================================= */}
      {/* TAB 0: EXPENSE ENTRY WORKFLOW (Mobile App Flow)                                           */}
      {/* ========================================================================================= */}
      {activeTab === 'entry' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Site Selection & Bill Itemization Form */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Identity & Site Selection Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Manager & Site Setup</h2>
                    <p className="text-[11px] text-slate-400">Step 1: Authenticated Manager & Project Context</p>
                  </div>
                </div>

                {/* Manager Identity Badge (Section 2.1) */}
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-800 rounded-lg text-xs font-semibold border border-purple-100">
                    <Shield className="w-3.5 h-3.5 text-purple-600" />
                    <span>{managerName}</span>
                    <span className="text-[10px] text-purple-500 font-normal">({managerRole})</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Site Selection Dropdown */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Target Construction Site *
                  </label>
                  <select
                    value={formSiteId}
                    onChange={handleSiteSelect}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  >
                    <option value="">Select Project Site...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.siteCode ? `${s.siteCode} - ` : ''}
                        {s.siteName || s.projectName || 'Site'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Expense Date Picker */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Expense / Voucher Date *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={formDate}
                      onChange={handleDateChange}
                      className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-medium"
                    />
                  </div>
                </div>

                {/* Project Stage / Category (Auto-filled from backend) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Project Stage / Category
                  </label>
                  <div className="relative">
                    <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={formStage}
                      onChange={(e) => setFormStage(e.target.value)}
                      placeholder="Auto-filled from project setup"
                      className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Auto-resolved Context Display */}
                {formSiteId && (
                  <div className="sm:col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 font-medium">Project: </span>
                      <strong className="text-slate-800">{formProjectName || selectedSite?.siteName}</strong>
                    </div>
                    {formSupervisor && (
                      <div>
                        <span className="text-slate-400 font-medium">Supervisor: </span>
                        <strong className="text-slate-800">{formSupervisor}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ongoing Day Total Indicator (Section 2.2) */}
              {checkingDayExpense ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 animate-pulse flex items-center gap-2">
                  <Clock className="w-4 h-4 animate-spin text-purple-600" />
                  Checking existing bills recorded for this date...
                </div>
              ) : existingDayExpense ? (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-900">
                          Ongoing Daily Voucher Found for Selected Date
                        </h4>
                        <p className="text-xs text-amber-800 mt-0.5">
                          Already recorded: <strong>₹{(existingDayExpense.totalAmount || 0).toLocaleString('en-IN')}</strong> across{' '}
                          <strong>{Array.isArray(existingDayExpense.bills) ? existingDayExpense.bills.length : 1} bills</strong>.
                          New bills added below will automatically merge into this daily voucher upon submission.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowExistingBillsList(!showExistingBillsList)}
                      className="text-xs font-bold text-amber-900 underline shrink-0 cursor-pointer"
                    >
                      {showExistingBillsList ? 'Hide Existing' : 'View Existing'}
                    </button>
                  </div>

                  {showExistingBillsList && Array.isArray(existingDayExpense.bills) && (
                    <div className="mt-2 pt-2 border-t border-amber-200/60 space-y-1.5">
                      {existingDayExpense.bills.map((b, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs text-amber-950 bg-white/60 p-2 rounded-lg">
                          <span>
                            #{b.billNo || idx + 1} • {b.vendor || b.billVendor || 'Vendor'} • {b.description || 'Bill'}
                            {b.quantity !== undefined && b.quantity !== null && b.quantity !== '' && (
                              <span className="font-semibold text-amber-800 ml-1">
                                (Qty: {b.quantity})
                              </span>
                            )}
                          </span>
                          <strong className="font-bold">
                            ₹{(Number(b.amount || b.billAmount) || 0).toLocaleString('en-IN')}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Step 2: Add Bill Line Item Form (Section 2.3) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Itemize Bill / Voucher</h2>
                    <p className="text-[11px] text-slate-400">Step 2: Add individual bills to this session</p>
                  </div>
                </div>

                <span className="text-xs font-semibold text-slate-500">
                  Bills in session: <strong className="text-purple-700">{sessionBills.length}</strong>
                </span>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vendor / Supplier Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UltraTech Cement / Local Hardware"
                      value={currentBill.vendor}
                      onChange={(e) => setCurrentBill({ ...currentBill, vendor: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bill / Invoice / Receipt #
                    </label>
                    <input
                      type="text"
                      placeholder={`INV-${sessionBills.length + 1}`}
                      value={currentBill.billNo}
                      onChange={(e) => setCurrentBill({ ...currentBill, billNo: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 50"
                      min="0"
                      step="any"
                      value={currentBill.quantity}
                      onChange={(e) => setCurrentBill({ ...currentBill, quantity: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bill Amount (₹) *
                    </label>
                    <div className="relative">
                      <IndianRupee className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="number"
                        placeholder="0.00"
                        min="1"
                        step="0.01"
                        value={currentBill.amount}
                        onChange={(e) => setCurrentBill({ ...currentBill, amount: e.target.value })}
                        className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Item Description / Purpose *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 50 bags cement / electrical conduits"
                      value={currentBill.description}
                      onChange={(e) => setCurrentBill({ ...currentBill, description: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* Receipt Upload & Preview Row */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition-colors border border-slate-200">
                      <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                      <span>{currentBill.file || currentBill.billUrl ? 'Change Receipt Photo/PDF' : 'Attach Receipt Image / PDF'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleBillFileSelected(f)
                        }}
                      />
                    </label>

                    {currentBill.isUploading && (
                      <span className="text-[11px] text-purple-600 font-medium animate-pulse flex items-center gap-1">
                        <UploadCloud className="w-3.5 h-3.5 animate-bounce" />
                        Uploading to tenant cloud storage...
                      </span>
                    )}

                    {currentBill.billUrl ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Uploaded to Storage
                      </span>
                    ) : currentBill.fileName ? (
                      <span className="text-[11px] text-slate-500 truncate max-w-xs">{currentBill.fileName}</span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {(currentBill.billUrl || currentBill.previewUrl || currentBill.storagePath) && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewModal({
                            isOpen: true,
                            imageUrl: currentBill.billUrl || currentBill.previewUrl || '',
                            storagePath: currentBill.storagePath || '',
                            orgId: orgId,
                            title: currentBill.description || 'Bill Preview',
                            vendor: currentBill.vendor,
                            amount: currentBill.amount,
                            billNo: currentBill.billNo,
                            date: formDate,
                            quantity: currentBill.quantity,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Receipt</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleAddBillToSession}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Bill</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Optional Voucher Notes */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Overall Voucher Remarks / Notes
              </label>
              <textarea
                rows="2"
                value={formRemarks}
                onChange={(e) => setFormRemarks(e.target.value)}
                placeholder="e.g. Urgent site materials procured for casting slab and scaffolding setup"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
          </div>

          {/* Right Column: Session Summary & Submission Panel */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 sticky top-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-bold text-slate-900">Session Disbursement Summary</h3>
                </div>
                <span className="px-2 py-0.5 text-xs font-bold bg-purple-50 text-purple-700 rounded-full">
                  {sessionBills.length} {sessionBills.length === 1 ? 'Bill' : 'Bills'}
                </span>
              </div>

              {/* Bills List in Session */}
              {sessionBills.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl p-4">
                  <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-600">No bills added to this session yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Use the "Add Bill" form on the left to itemize your expenses.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {sessionBills.map((b, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{b.vendor}</span>
                          <span className="text-[10px] text-slate-400">#{b.billNo}</span>
                          {b.quantity !== undefined && b.quantity !== null && b.quantity !== '' && (
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                              Qty: {b.quantity}
                            </span>
                          )}
                          {(b.billUrl || b.previewUrl || b.storagePath) && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Receipt
                            </span>
                          )}
                        </div>
                        <p className="text-slate-500 truncate mt-0.5">{b.description}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(b.billUrl || b.previewUrl || b.storagePath) && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                isOpen: true,
                                imageUrl: b.billUrl || b.previewUrl || '',
                                storagePath: b.storagePath || '',
                                orgId: orgId,
                                title: b.description || 'Receipt Preview',
                                vendor: b.vendor,
                                amount: b.amount,
                                billNo: b.billNo,
                                date: formDate,
                                quantity: b.quantity,
                              })
                            }
                            className="p-1 text-purple-600 hover:bg-purple-100 rounded-lg cursor-pointer"
                            title="Preview receipt"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="font-bold text-slate-900">
                          ₹{Number(b.amount).toLocaleString('en-IN')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBillFromSession(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total Calculation Breakdown */}
              <div className="p-4 bg-purple-50/70 border border-purple-100 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Current Session Bills Total ({sessionBills.length}):</span>
                  <span className="font-semibold text-slate-800">₹{sessionTotal.toLocaleString('en-IN')}</span>
                </div>

                {existingDayExpense && (
                  <div className="flex justify-between text-amber-800 pt-1 border-t border-purple-100/60">
                    <span>Already Recorded for Today:</span>
                    <span className="font-semibold">
                      ₹{(existingDayExpense.totalAmount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-purple-950 pt-2 border-t border-purple-200/60 text-sm font-extrabold">
                  <span>
                    {existingDayExpense ? 'Combined Day Total After Submit:' : 'Total Session Amount:'}
                  </span>
                  <span>
                    ₹{((existingDayExpense?.totalAmount || 0) + sessionTotal).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleInitiateSubmit}
                  disabled={submitting || sessionBills.length === 0 || !formSiteId}
                  className="w-full py-3 px-4 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Submit All Expenses ({sessionBills.length} {sessionBills.length === 1 ? 'Bill' : 'Bills'}) • ₹
                    {sessionTotal.toLocaleString('en-IN')}
                  </span>
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={resetEntryForm}
                    className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                  >
                    Reset Form
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('logs')}
                    className="text-xs text-purple-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Expense Logs ({expenses.length})</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 1: EXPENSE LOGS & HISTORY (Mobile Tab 1)                                              */}
      {/* ========================================================================================= */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by site, vendor, bill #, or remarks..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedSiteFilter}
                  onChange={(e) => setSelectedSiteFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Project Sites ({sites.length})</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Table View"
                >
                  <Table className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="List Feed View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Feed</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                disabled={expenses.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>

          {/* Expenses Content: Table View or Cards View */}
          {loading && expenses.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading manager expense vouchers...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No manager direct expenses recorded</p>
              <p className="text-xs text-slate-400 mt-1">
                Switch to the "Expense Entry" tab to log out-of-pocket expenditures for your project sites.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('entry')}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B3470] text-white text-xs font-bold rounded-xl"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Go to Expense Entry</span>
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* EXPENSES TABLE FORMAT */
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Site & Stage</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Bills</th>
                      <th className="py-3.5 px-4">Quantity</th>
                      <th className="py-3.5 px-4">Receipt Document</th>
                      <th className="py-3.5 px-4">Total Amount</th>
                      <th className="py-3.5 px-4">Remarks / Notes</th>
                      <th className="py-3.5 px-4">Raiser Attribution</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredExpenses.map((item) => {
                      const expenseDate = item.date instanceof Date
                        ? item.date.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : (item.expenseDate?.seconds
                            ? new Date(item.expenseDate.seconds * 1000).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : (typeof item.date === 'string' ? item.date : 'Recent'))
                      const billsCount = Array.isArray(item.bills) ? item.bills.length : 1
                      const totalAmt = Number(item.totalAmount || item.amount) || 0
                      const displayQty = item.quantity !== undefined && item.quantity !== null && item.quantity !== ''
                        ? item.quantity
                        : (Array.isArray(item.bills) && item.bills.some((b) => b.quantity !== null && b.quantity !== undefined)
                            ? (item.bills.length === 1
                                ? item.bills[0].quantity
                                : item.bills.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0) || '-')
                            : '-')

                      const billWithDoc =
                        (Array.isArray(item.bills) &&
                          item.bills.find((b) => b.billUrl || b.imageUrl || b.storagePath || (b.billCopy && b.billCopy !== 'billURL'))) ||
                        (item.billUrl && item.billUrl !== 'billURL'
                          ? { billUrl: item.billUrl, storagePath: item.storagePath, description: item.remarks }
                          : (item.imageUrl && item.imageUrl !== 'billURL'
                              ? { billUrl: item.imageUrl, storagePath: item.storagePath, description: item.remarks }
                              : (item.billCopy && item.billCopy !== 'billURL'
                                  ? { billUrl: item.billCopy, storagePath: item.storagePath, description: item.remarks }
                                  : (item.storagePath ? { billUrl: '', storagePath: item.storagePath, description: item.remarks } : null))))

                      return (
                        <tr key={item.id || item.expenseId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0 border border-purple-100">
                                <Receipt className="w-4 h-4" />
                              </div>
                              <div>
                                <strong className="block font-bold text-slate-900 text-sm">
                                  {item.siteName || item.projectName}
                                </strong>
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-md inline-block mt-0.5">
                                  {item.projectStage || 'Superstructure'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-700">
                            {expenseDate}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-800 rounded-md">
                              {billsCount} {billsCount === 1 ? 'Bill' : 'Bills'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-700">
                            {displayQty}
                          </td>

                          {/* Bill Document Column with Instant Preview */}
                          <td className="py-3.5 px-4">
                            {billWithDoc ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewModal({
                                    isOpen: true,
                                    imageUrl: billWithDoc.billUrl || billWithDoc.imageUrl || (billWithDoc.billCopy && billWithDoc.billCopy !== 'billURL' ? billWithDoc.billCopy : ''),
                                    storagePath: billWithDoc.storagePath || '',
                                    orgId: orgId,
                                    title: billWithDoc.description || item.siteName || item.projectName,
                                    vendor: billWithDoc.vendor || billWithDoc.billVendor || 'Manager Direct Expense',
                                    amount: billWithDoc.amount || billWithDoc.billAmount || totalAmt,
                                    billNo: billWithDoc.billNo || '',
                                    date: expenseDate,
                                    quantity: billWithDoc.quantity || displayQty,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                                title="Click to view uploaded bill receipt"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>View Receipt</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No receipt file</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                            ₹{totalAmt.toLocaleString('en-IN')}
                          </td>

                          <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                            {item.remarks || 'No remarks'}
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                            {item.managerName || item.raisedByName || 'Manager'}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDelete(item.id || item.expenseId, item.siteId)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                              title="Delete Voucher"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* EXPENSES CARDS FEED FORMAT */
            <div className="space-y-4">
              {filteredExpenses.map((item) => {
                const isExpanded = expandedId === (item.id || item.expenseId)
                const expenseDate = item.date instanceof Date
                  ? item.date.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : (item.expenseDate?.seconds
                      ? new Date(item.expenseDate.seconds * 1000).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : (typeof item.date === 'string' ? item.date : 'Recent'))

                const billsCount = Array.isArray(item.bills) ? item.bills.length : 1
                const hasBillsWithDoc =
                  (item.billUrl && item.billUrl !== 'billURL') ||
                  (item.imageUrl && item.imageUrl !== 'billURL') ||
                  (Array.isArray(item.bills) &&
                    item.bills.some((b) => b.billUrl || b.imageUrl || (b.billCopy && b.billCopy !== 'billURL')))

                return (
                  <div
                    key={item.id || item.expenseId}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-200 transition-all overflow-hidden"
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : item.id || item.expenseId)}
                      className="p-5 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none hover:bg-slate-50/50"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900 leading-snug">
                              {item.siteName || item.projectName}
                            </h3>
                            <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-md">
                              {item.projectStage || 'Superstructure'}
                            </span>
                            <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                              {billsCount} {billsCount === 1 ? 'Bill Item' : 'Bill Items'}
                            </span>
                            {item.quantity !== undefined && item.quantity !== null && item.quantity !== '' && (
                              <span className="px-2 py-0.5 text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-md">
                                Qty: <strong>{item.quantity}</strong>
                              </span>
                            )}
                            {hasBillsWithDoc && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                                <ImageIcon className="w-3 h-3" />
                                Receipt Attached
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {expenseDate}
                            </span>
                            <span>•</span>
                            <span className="text-slate-600">
                              By: <strong>{item.managerName || item.raisedByName || 'Manager'}</strong>
                            </span>
                            {item.remarks && (
                              <>
                                <span>•</span>
                                <span className="text-slate-600 truncate max-w-sm italic">"{item.remarks}"</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Voucher</p>
                          <p className="text-lg font-bold text-slate-900">
                            ₹{(Number(item.totalAmount || item.amount) || 0).toLocaleString('en-IN')}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(item.id || item.expenseId, item.siteId)
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Delete voucher"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && Array.isArray(item.bills) && item.bills.length > 0 && (
                      <div className="p-5 bg-slate-50/70 border-t border-slate-100 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Itemized Bills Breakdown</h4>
                        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden divide-y divide-slate-100 text-xs">
                          {item.bills.map((bill, bIdx) => {
                            const billDocUrl = bill.billUrl || bill.imageUrl || (bill.billCopy && bill.billCopy !== 'billURL' ? bill.billCopy : '')
                            const billStoragePath = bill.storagePath || ''
                            const billVendorName = bill.vendor || bill.billVendor || 'Direct Vendor'
                            const billAmt = Number(bill.amount || bill.billAmount) || 0

                            return (
                              <div key={bIdx} className="p-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 truncate">{bill.description || 'Disbursement'}</p>
                                  <p className="text-slate-500 mt-0.5">
                                    Vendor: <span className="font-medium text-slate-700">{billVendorName}</span>
                                    {bill.billNo && ` • Bill #${bill.billNo}`}
                                    {bill.quantity !== undefined && bill.quantity !== null && bill.quantity !== '' && (
                                      <span className="ml-1 text-purple-700 font-semibold">
                                        • Qty: {bill.quantity}
                                      </span>
                                    )}
                                  </p>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  {(billDocUrl || billStoragePath) ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewModal({
                                          isOpen: true,
                                          imageUrl: billDocUrl,
                                          storagePath: billStoragePath,
                                          orgId: orgId,
                                          title: bill.description || 'Bill Receipt',
                                          vendor: billVendorName,
                                          amount: billAmt,
                                          billNo: bill.billNo || '',
                                          date: expenseDate,
                                          quantity: bill.quantity,
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold cursor-pointer shadow-2xs"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>View Receipt</span>
                                    </button>
                                  ) : null}

                                  <span className="text-sm font-bold text-slate-900">
                                    ₹{billAmt.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================================= */}
      {/* PRE-SUBMISSION CONFIRMATION MODAL (Section 2.4)                                           */}
      {/* ========================================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Expense Submission</h3>
                <p className="text-xs text-slate-500">Please review session details before committing</p>
              </div>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Site:</span>
                  <strong className="text-slate-900 font-bold">
                    {selectedSite?.siteCode ? `${selectedSite.siteCode} - ` : ''}
                    {selectedSite?.siteName || selectedSite?.projectName}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Project Stage:</span>
                  <strong className="text-slate-800">{formStage}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Selected Date:</span>
                  <strong className="text-slate-800 font-mono">{formDate}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Document ID:</span>
                  <strong className="text-purple-900 font-mono text-[11px]">
                    {generateManagerExpenseDocId({
                      siteId: formSiteId,
                      siteCode: selectedSite?.siteCode,
                      projectName: formProjectName || selectedSite?.projectName || selectedSite?.siteName,
                      siteName: selectedSite?.siteName,
                      expenseDate: formDate,
                    })}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bills to Commit:</span>
                  <strong className="text-purple-700 font-bold">
                    {sessionBills.length} Bill Items
                    {sessionBills.some((b) => b.quantity !== null && b.quantity !== undefined && b.quantity !== '') && (
                      <span className="ml-1 text-slate-600 font-normal">
                        (Total Qty: {sessionBills.reduce((acc, b) => acc + (Number(b.quantity) || 0), 0)})
                      </span>
                    )}
                  </strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                  <span className="font-bold text-slate-900">Session Total Amount:</span>
                  <span className="font-black text-purple-900 text-base">
                    ₹{sessionTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {existingDayExpense && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                  <p className="font-bold">Merging into Existing Daily Voucher:</p>
                  <p className="mt-0.5 text-amber-800">
                    Existing total of ₹{(existingDayExpense.totalAmount || 0).toLocaleString('en-IN')} will increase to{' '}
                    <strong>₹{((existingDayExpense.totalAmount || 0) + sessionTotal).toLocaleString('en-IN')}</strong>.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-500 italic">
                Receipts will be securely stored under tenant cloud storage and project cumulative expenditure will be atomically synchronized.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="px-5 py-2 text-xs font-bold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <UploadCloud className="w-4 h-4 animate-bounce" />
                    <span>Committing to Firestore...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm & Submit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* SUBMISSION SUCCESS MODAL (Section 2.6)                                                    */}
      {/* ========================================================================================= */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">Expenses Submitted!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Successfully recorded <strong>₹{submittedResult?.totalAmount.toLocaleString('en-IN')}</strong> across{' '}
              <strong>{submittedResult?.billsCount} bills</strong> for {submittedResult?.siteName}.
            </p>

            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Voucher ID:</span>
                <span className="font-mono text-slate-800">{submittedResult?.docId}</span>
              </div>
              <div className="flex justify-between">
                <span>Project Financial Rollup:</span>
                <span className="text-emerald-700 font-semibold">Synchronized</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false)
                  resetEntryForm()
                  setActiveTab('logs')
                }}
                className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                View Expense Logs
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false)
                  resetEntryForm()
                  setActiveTab('entry')
                }}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Record Another Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Bill Image / Document Previewer Modal */}
      <BillImagePreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ ...previewModal, isOpen: false })}
        imageUrl={previewModal.imageUrl}
        storagePath={previewModal.storagePath}
        orgId={previewModal.orgId || orgId}
        title={previewModal.title}
        vendor={previewModal.vendor}
        amount={previewModal.amount}
        billNo={previewModal.billNo}
        date={previewModal.date}
        quantity={previewModal.quantity}
      />
    </div>
  )
}
