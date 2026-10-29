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
  ExternalLink,
} from 'lucide-react'
import {
  fetchOrganizationExpenses,
  subscribeOrganizationExpenses,
  recordOrganizationExpense,
  deleteOrganizationExpense,
  deleteOrganizationExpenseBill,
} from '../../../services/organizationExpenseService.js'
import {
  isExpenseMatchingSite,
  resolveProjectCategoryOrStage,
} from '../../../services/expenseNormalizationService.js'
import { fetchProjectDetails } from '../../../services/projectService.js'
import AppStorageService from '../../../services/appStorageService.js'
import BillImagePreviewModal from '../../../components/common/BillImagePreviewModal.jsx'

export default function OrganizationExpenses({ orgId, sites = [], currentUser, onNotify }) {
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [expandedId, setExpandedId] = useState(null)

  // Preview Modal State
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    imageUrl: '',
    title: '',
    vendor: '',
    amount: '',
    billNo: '',
    date: '',
  })

  const createEmptyBill = () => ({
    description: '',
    vendor: '',
    billNo: '',
    quantity: '',
    amount: '',
    file: null,
    fileName: '',
    billUrl: '',
    storagePath: '',
    previewUrl: '',
    isUploading: false,
  })

  // Create Modal State
  const [showModal, setShowModal] = useState(false)
  const [formSiteId, setFormSiteId] = useState('')
  const [formStage, setFormStage] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formRemarks, setFormRemarks] = useState('')
  const [bills, setBills] = useState([createEmptyBill()])
  const [submitting, setSubmitting] = useState(false)

  const resetCreateForm = () => {
    setFormSiteId('')
    setFormStage('')
    setFormRemarks('')
    setFormDate('')
    setBills([createEmptyBill()])
  }

  const handleOpenCreateModal = () => {
    resetCreateForm()
    setShowModal(true)
  }

  const handleCloseCreateModal = () => {
    setShowModal(false)
    resetCreateForm()
  }

  // Handle Site / Project Selection & Dynamic Auto-fill from Backend
  const handleSiteChange = async (e) => {
    const selectedId = e.target.value
    setFormSiteId(selectedId)

    if (!selectedId) {
      setFormStage('')
      return
    }

    // 1. Immediately look up in loaded sites prop to provide instantaneous auto-fill
    const matchedSite = sites.find(
      (s) =>
        s.id === selectedId ||
        s.siteId === selectedId ||
        s.projectId === selectedId ||
        s.siteCode === selectedId
    )
    const immediateCategoryOrStage = resolveProjectCategoryOrStage(matchedSite)
    setFormStage(immediateCategoryOrStage || '')

    // 2. Fetch fresh project document directly from Firestore backend
    if (orgId) {
      try {
        const backendProject = await fetchProjectDetails(orgId, selectedId)
        if (backendProject) {
          const backendVal = resolveProjectCategoryOrStage(backendProject)
          if (backendVal) {
            setFormStage(backendVal)
          }
        }
      } catch (err) {
        console.warn('Error fetching backend project details for auto-fill:', err?.message)
      }
    }
  }

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchOrganizationExpenses(orgId)
      setExpenses(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load organization expense claims', 'error')
    } finally {
      setLoading(false)
    }
  };

  useEffect(() => {
    if (!orgId) return
    loadData()
    const unsubscribe = subscribeOrganizationExpenses(
      orgId,
      (liveData) => {
        setExpenses(liveData || [])
        setLoading(false)
      },
      (err) => {
        console.warn('Real-time organization expenses error:', err?.message)
      }
    )
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [orgId])

  const totalCalculatedAmount = useMemo(() => {
    return bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0)
  }, [bills])

  const handleAddBill = () => {
    setBills([
      ...bills,
      createEmptyBill(),
    ])
  }

  const handleUpdateBill = (index, field, value) => {
    const updated = [...bills]
    updated[index][field] = value
    setBills(updated)
  }

  const handleRemoveBill = (index) => {
    setBills(bills.filter((_, i) => i !== index))
  }

  // Handle direct file upload for a bill row
  const handleBillFileChange = async (index, file) => {
    if (!file) return

    const updated = [...bills]
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    updated[index].file = file
    updated[index].fileName = file.name
    updated[index].previewUrl = previewUrl
    updated[index].isUploading = true
    setBills([...updated])

    // If site is already selected, upload immediately to Firebase Storage under the exact required path
    if (orgId && formSiteId) {
      try {
        const site = sites.find((s) => s.id === formSiteId)
        const siteName = site?.siteName || site?.projectName || 'Project_Site'

        const uploadResult = await AppStorageService.uploadExpenseBillDoc({
          tenantId: orgId,
          expenseType: 'organization expenses',
          siteId: formSiteId,
          siteName,
          billNo: updated[index].billNo || '',
          fileName: file.name,
          file,
          sitesList: sites,
        })

        const nextBills = [...bills]
        nextBills[index].file = file
        nextBills[index].fileName = file.name
        nextBills[index].billUrl = uploadResult.downloadUrl
        nextBills[index].storagePath = uploadResult.storagePath
        nextBills[index].isUploading = false
        setBills(nextBills)
        onNotify?.(`Bill "${file.name}" uploaded successfully`, 'success')
      } catch (err) {
        console.error('Instant bill upload error:', err)
        const nextBills = [...bills]
        nextBills[index].isUploading = false
        nextBills[index].file = null
        nextBills[index].fileName = ''
        nextBills[index].previewUrl = ''
        nextBills[index].billUrl = ''
        nextBills[index].storagePath = ''
        setBills(nextBills)
        onNotify?.(`Bill upload failed: ${err?.message || 'Storage permission or network error'}.`, 'error')
      }
    } else {
      updated[index].isUploading = false
      setBills([...updated])
    }
  }

  const handleSubmitExpense = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!formSiteId) {
      onNotify?.('Please choose target site', 'error')
      return
    }

    setSubmitting(true)
    try {
      const site = sites.find((s) => s.id === formSiteId)
      const siteName = site?.siteName || site?.projectName || 'Project_Site'

      // Ensure all bill files are uploaded under the exact required folder path:
      // /organisation/{orgId}/Organization_exp_bill/{siteId_siteName}/{image}
      const processedBills = await Promise.all(
        bills
          .filter((b) => b.description?.trim() || b.vendor?.trim() || Number(b.amount) > 0)
          .map(async (b) => {
            let billUrl = b.billUrl || ''
            let storagePath = b.storagePath || ''

            if (b.file && !billUrl) {
              const uploadRes = await AppStorageService.uploadExpenseBillDoc({
                tenantId: orgId,
                expenseType: 'organization expenses',
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

            const rawQty = b.quantity !== undefined && b.quantity !== null && b.quantity !== ''
              ? (Number.isFinite(Number(b.quantity)) ? Number(b.quantity) : b.quantity)
              : null

            return {
              description: b.description?.trim() || (b.vendor?.trim() ? `${b.vendor.trim()} Bill` : 'Bill Item'),
              vendor: b.vendor?.trim() || 'Vendor',
              billNo: b.billNo?.trim() || '',
              quantity: rawQty,
              qty: rawQty,
              amount: b.amount,
              billUrl,
              imageUrl: billUrl,
              storagePath,
              fileName: b.fileName || '',
            }
          })
      )

      const totalQuantity = processedBills.some((b) => b.quantity !== null && b.quantity !== undefined && Number.isFinite(Number(b.quantity)))
        ? processedBills.reduce((acc, b) => acc + (typeof b.quantity === 'number' ? b.quantity : (Number(b.quantity) || 0)), 0)
        : null

      await recordOrganizationExpense(
        orgId,
        {
          siteId: formSiteId,
          siteCode: site?.siteCode || site?.code || '',
          siteName: site?.siteName || site?.projectName || 'Project Site',
          projectName: site?.projectName || site?.siteName || 'Project Site',
          projectStage: formStage,
          projectCategory: formStage,
          expenseDate: formDate || new Date().toISOString().split('T')[0],
          remarks: formRemarks,
          bills: processedBills,
          quantity: totalQuantity,
          totalAmount: totalCalculatedAmount,
        },
        currentUser
      )

      onNotify?.('Organization expense recorded and synced to project accounts!', 'success')
      handleCloseCreateModal()
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to record organization expense', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (entry) => {
    if (!orgId || !entry) return
    const billDesc = entry.billNo ? `Bill #${entry.billNo}` : 'this bill entry'
    if (!window.confirm(`Delete ${billDesc} (${entry.vendor || 'Expense'})?`)) return
    try {
      if (entry.isItemizedBill && entry.totalBillsInDoc > 1) {
        await deleteOrganizationExpenseBill(orgId, entry.parentExpenseId, entry.billIndex)
      } else {
        await deleteOrganizationExpense(orgId, entry.parentExpenseId || entry.id)
      }
      onNotify?.(`${billDesc} deleted successfully`, 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete expense', 'error')
    }
  }

  // Flatten Firestore documents into individual bill entries
  const billEntries = useMemo(() => {
    if (!Array.isArray(expenses)) return []
    const list = []

    expenses.forEach((item) => {
      const rawBills = Array.isArray(item.bills) && item.bills.length > 0 ? item.bills : null

      if (rawBills) {
        rawBills.forEach((b, idx) => {
          const billAmt = Number(b.amount !== undefined ? b.amount : b.billAmount) || 0
          const billNo = b.billNo || (idx + 1).toString().padStart(3, '0')
          const vendor = b.vendor || b.billVendor || item.vendor || item.billVendor || 'Vendor'
          const billDoc = b.billUrl || b.imageUrl || (b.billCopy && b.billCopy !== 'billURL' ? b.billCopy : '')
          const remarks = b.description || b.remarks || b.purpose || item.remarks || ''
          const billDate = b.date || b.billDate || item.date || item.expenseDate
          const billQty = b.quantity !== undefined && b.quantity !== null && b.quantity !== ''
            ? b.quantity
            : (b.qty !== undefined && b.qty !== null && b.qty !== '' ? b.qty : (item.quantity !== undefined && rawBills.length === 1 ? item.quantity : null))

          list.push({
            id: `${item.id || item.expenseId}_bill_${b.id || b.billNo || idx}`,
            parentExpenseId: item.id || item.expenseId,
            billIndex: idx,
            billId: b.id || `bill_${idx}`,
            siteId: item.siteId,
            siteCode: item.siteCode,
            siteName: item.siteName || item.projectName || 'Project Site',
            projectName: item.projectName || item.siteName || 'Project Site',
            projectStage: item.projectStage || 'Central',
            projectCategory: item.projectCategory || item.projectStage || 'Central',
            date: billDate,
            expenseDate: item.expenseDate,
            billNo,
            vendor,
            billVendor: vendor,
            quantity: billQty,
            qty: billQty,
            amount: billAmt,
            billAmount: billAmt,
            totalAmount: billAmt,
            billUrl: billDoc,
            imageUrl: billDoc,
            billCopy: billDoc,
            storagePath: b.storagePath || '',
            description: b.description || remarks,
            remarks: remarks,
            rawExpense: item,
            rawBill: b,
            isItemizedBill: true,
            totalBillsInDoc: rawBills.length,
          })
        })
      } else {
        // Document has no itemized bills array (legacy entry or recorded without bills array)
        const amt = Number(item.totalAmount !== undefined ? item.totalAmount : item.amount) || 0
        const billDoc = item.billUrl || item.imageUrl || (item.billCopy && item.billCopy !== 'billURL' ? item.billCopy : '')
        const billNo = item.billNo || '001'
        const vendor = item.vendor || item.billVendor || 'Organization Expense'
        const remarks = item.remarks || item.description || ''
        const docQty = item.quantity !== undefined && item.quantity !== null && item.quantity !== ''
          ? item.quantity
          : (item.qty !== undefined && item.qty !== null && item.qty !== '' ? item.qty : null)

        list.push({
          id: item.id || item.expenseId,
          parentExpenseId: item.id || item.expenseId,
          billIndex: 0,
          billId: item.id || item.expenseId,
          siteId: item.siteId,
          siteCode: item.siteCode,
          siteName: item.siteName || item.projectName || 'Project Site',
          projectName: item.projectName || item.siteName || 'Project Site',
          projectStage: item.projectStage || 'Central',
          projectCategory: item.projectCategory || item.projectStage || 'Central',
          date: item.date || item.expenseDate,
          expenseDate: item.expenseDate,
          billNo,
          vendor,
          billVendor: vendor,
          quantity: docQty,
          qty: docQty,
          amount: amt,
          billAmount: amt,
          totalAmount: amt,
          billUrl: billDoc,
          imageUrl: billDoc,
          billCopy: billDoc,
          storagePath: item.storagePath || '',
          description: item.description || remarks,
          remarks: remarks,
          rawExpense: item,
          rawBill: null,
          isItemizedBill: false,
          totalBillsInDoc: 1,
        })
      }
    })

    // Sort by date descending
    return list.sort((a, b) => {
      const getTimestamp = (e) => {
        if (e.date instanceof Date && !isNaN(e.date.getTime())) return e.date.getTime()
        if (e.date?.seconds) return e.date.seconds * 1000
        if (e.date?.toDate && typeof e.date.toDate === 'function') return e.date.toDate().getTime()
        if (e.expenseDate?.seconds) return e.expenseDate.seconds * 1000
        if (typeof e.date === 'string' && e.date.trim()) {
          const t = new Date(e.date).getTime()
          if (!isNaN(t)) return t
        }
        return 0
      }
      return getTimestamp(b) - getTimestamp(a)
    })
  }, [expenses])

  const formatEntryDate = (entry) => {
    let d = null
    const dateVal = entry.date || entry.billDate
    const fallbackVal = entry.expenseDate || entry.rawExpense?.date || entry.rawExpense?.expenseDate

    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      d = dateVal
    } else if (dateVal?.toDate && typeof dateVal.toDate === 'function') {
      d = dateVal.toDate()
    } else if (dateVal?.seconds) {
      d = new Date(dateVal.seconds * 1000)
    } else if (typeof dateVal === 'string' && dateVal.trim()) {
      d = new Date(dateVal)
    }

    if ((!d || isNaN(d.getTime())) && fallbackVal) {
      if (fallbackVal instanceof Date && !isNaN(fallbackVal.getTime())) {
        d = fallbackVal
      } else if (fallbackVal?.toDate && typeof fallbackVal.toDate === 'function') {
        d = fallbackVal.toDate()
      } else if (fallbackVal?.seconds) {
        d = new Date(fallbackVal.seconds * 1000)
      } else if (typeof fallbackVal === 'string' && fallbackVal.trim()) {
        d = new Date(fallbackVal)
      }
    }

    if (!d || isNaN(d.getTime())) return 'Recent'

    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  // Filtered bill entries
  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return billEntries.filter((e) => {
      const siteName = (e.siteName || '').toLowerCase()
      const projectName = (e.projectName || '').toLowerCase()
      const projectStage = (e.projectStage || '').toLowerCase()
      const remarks = (e.remarks || e.description || '').toLowerCase()
      const vendor = (e.vendor || e.billVendor || '').toLowerCase()
      const billNo = (e.billNo || '').toLowerCase()
      const raiser = (e.rawExpense?.raiserName || e.rawExpense?.supervisorName || '').toLowerCase()

      const matchesSearch =
        !q ||
        siteName.includes(q) ||
        projectName.includes(q) ||
        projectStage.includes(q) ||
        remarks.includes(q) ||
        vendor.includes(q) ||
        billNo.includes(q) ||
        raiser.includes(q)

      const matchesSite = isExpenseMatchingSite(e.rawExpense || e, selectedSiteFilter, sites)
      return matchesSearch && matchesSite
    })
  }, [billEntries, searchQuery, selectedSiteFilter, sites])

  const totalSumSpent = useMemo(() => {
    return filteredEntries.reduce(
      (acc, e) => acc + (Number(e.amount) || 0),
      0
    )
  }, [filteredEntries])

  // Export CSV
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return
    const rows = [
      ['Expense ID', 'Bill No', 'Site Name', 'Stage', 'Date', 'Vendor', 'Quantity', 'Amount', 'Description / Remarks', 'Bill Attached'],
      ...filteredEntries.map((e) => {
        const dStr = formatEntryDate(e)
        return [
          e.parentExpenseId || e.id,
          `"${e.billNo || ''}"`,
          `"${(e.siteName || e.projectName || '').replace(/"/g, '""')}"`,
          `"${(e.projectStage || '').replace(/"/g, '""')}"`,
          `"${dStr}"`,
          `"${(e.vendor || '').replace(/"/g, '""')}"`,
          e.quantity !== undefined && e.quantity !== null && e.quantity !== '' ? e.quantity : '-',
          e.amount || 0,
          `"${(e.remarks || e.description || '').replace(/"/g, '""')}"`,
          e.billUrl ? 'Yes' : 'No',
        ]
      }),
    ]
    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((r) => r.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `organization_bills_${new Date().toISOString().split('T')[0]}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Enterprise Governance
            </span>
            <span className="text-xs text-slate-400">• Corporate Central Bills</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Organization Expenses
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Record, track, and inspect central corporate overhead, consultant bills, and site expenditures with stored bill receipts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredEntries.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Organization Bill</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Organization Disbursed
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            ₹{totalSumSpent.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-blue-600 font-medium mt-1">
            Central & site-allocated bills
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Bill Entries Recorded
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {filteredEntries.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Itemized bill records</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active Project Sites
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {sites.length} Sites
          </p>
          <p className="text-xs text-emerald-600 font-medium mt-1">
            Real-time project expenditure synchronization
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bills by vendor, bill #, site or remarks..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Expenses Content: Table View or Cards View */}
      {loading && expenses.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          Loading organization expense claims...
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">
            No organization bill entries found
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Record Organization Bill" to log and attach bills for your projects.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* EXPENSES TABLE FORMAT - EACH ROW IS AN INDIVIDUAL BILL */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Site & Stage</th>
                  <th className="py-3.5 px-4">Bill Date</th>
                  <th className="py-3.5 px-4">Bill No.</th>
                  <th className="py-3.5 px-4">Vendor</th>
                  <th className="py-3.5 px-4">Quantity</th>
                  <th className="py-3.5 px-4">Receipt</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Description / Remarks</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEntries.map((entry) => {
                  const entryDateStr = formatEntryDate(entry)
                  const billAmt = Number(entry.amount) || 0

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <strong className="block font-bold text-slate-900 text-sm">
                              {entry.siteName || entry.projectName}
                            </strong>
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-md inline-block mt-0.5">
                              {entry.projectStage || 'Central'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {entryDateStr}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-slate-100 text-slate-800 rounded-md">
                          #{entry.billNo}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900">
                          {entry.vendor || '—'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {entry.quantity !== undefined && entry.quantity !== null && entry.quantity !== '' ? entry.quantity : '-'}
                      </td>

                      {/* Bill Document Column with Instant Preview */}
                      <td className="py-3.5 px-4">
                        {(entry.billUrl || entry.storagePath) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                isOpen: true,
                                imageUrl: entry.billUrl || '',
                                storagePath: entry.storagePath || '',
                                orgId: orgId,
                                title: entry.description || entry.remarks || `${entry.vendor} Bill`,
                                vendor: entry.vendor,
                                amount: billAmt,
                                billNo: entry.billNo,
                                date: entryDateStr,
                                quantity: entry.quantity,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                            title="Click to view uploaded bill receipt"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>View Bill</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No file</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-black text-slate-900 text-sm whitespace-nowrap">
                        ₹{billAmt.toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={entry.description || entry.remarks}>
                        {entry.description || entry.remarks || 'No remarks'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDelete(entry)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                          title="Delete Bill Entry"
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
        /* EXPENSES CARDS FEED FORMAT - EACH CARD IS AN INDIVIDUAL BILL */
        <div className="space-y-4">
          {filteredEntries.map((entry) => {
            const entryDateStr = formatEntryDate(entry)
            const billAmt = Number(entry.amount) || 0

            return (
              <div
                key={entry.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-200 transition-all p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {entry.siteName || entry.projectName}
                      </h3>
                      <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-md">
                        {entry.projectStage || 'Central'}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                        Bill #{entry.billNo}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-md">
                        Vendor: <span className="font-bold text-slate-900">{entry.vendor}</span>
                      </span>
                      {entry.quantity !== undefined && entry.quantity !== null && entry.quantity !== '' && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
                          Qty: <strong>{entry.quantity}</strong>
                        </span>
                      )}
                      {(entry.billUrl || entry.storagePath) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                          <ImageIcon className="w-3 h-3" />
                          Receipt Attached
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap pt-0.5">
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {entryDateStr}
                      </span>
                      {(entry.description || entry.remarks) && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600 truncate max-w-sm italic">
                            "{entry.description || entry.remarks}"
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-5 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0">
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                      Bill Amount
                    </p>
                    <p className="text-lg font-black text-slate-900">
                      ₹{billAmt.toLocaleString('en-IN')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {(entry.billUrl || entry.storagePath) && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewModal({
                            isOpen: true,
                            imageUrl: entry.billUrl || '',
                            storagePath: entry.storagePath || '',
                            orgId: orgId,
                            title: entry.description || entry.remarks || `${entry.vendor} Bill`,
                            vendor: entry.vendor,
                            amount: billAmt,
                            billNo: entry.billNo,
                            date: entryDateStr,
                            quantity: entry.quantity,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold cursor-pointer transition-all shadow-2xs"
                        title="View uploaded bill receipt"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <span>View Receipt</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors border border-slate-200"
                      title="Delete bill entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Record Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Record Organization Expense & Bill
                </h3>
                <p className="text-xs text-slate-500">
                  Store bill document in Firebase Cloud Storage under respective tenant.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitExpense}
              className="space-y-4 max-h-[75vh] overflow-y-auto pr-1"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Target Construction Site *
                  </label>
                  <select
                    required
                    value={formSiteId}
                    onChange={handleSiteChange}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select Site...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.siteName || s.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Project Stage / Category
                  </label>
                  <input
                    type="text"
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    placeholder="Auto-filled from project details"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Expense / Invoice Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Itemized Bills & Document Attachments */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Bills, Invoices & Uploads
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Uploads store directly to Cloud Storage under respective tenant folder.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBill}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Bill
                  </button>
                </div>

                {bills.map((b, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs"
                  >
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Item description *"
                        value={b.description}
                        onChange={(e) =>
                          handleUpdateBill(idx, 'description', e.target.value)
                        }
                        className="col-span-12 sm:col-span-3 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Vendor / Payee"
                        value={b.vendor}
                        onChange={(e) =>
                          handleUpdateBill(idx, 'vendor', e.target.value)
                        }
                        className="col-span-6 sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Bill / Ref #"
                        value={b.billNo}
                        onChange={(e) =>
                          handleUpdateBill(idx, 'billNo', e.target.value)
                        }
                        className="col-span-6 sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        min="0"
                        step="any"
                        value={b.quantity}
                        onChange={(e) =>
                          handleUpdateBill(idx, 'quantity', e.target.value)
                        }
                        className="col-span-4 sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                      />
                      <input
                        type="number"
                        placeholder="Amount (₹) *"
                        value={b.amount}
                        onChange={(e) =>
                          handleUpdateBill(idx, 'amount', e.target.value)
                        }
                        className="col-span-6 sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveBill(idx)}
                        className="col-span-2 sm:col-span-1 text-slate-400 hover:text-rose-600 text-center cursor-pointer"
                        title="Remove Bill"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Document Upload Control */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                          <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {b.file || b.billUrl
                              ? 'Change Bill Document'
                              : 'Upload Bill Image / PDF'}
                          </span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleBillFileChange(idx, f)
                            }}
                          />
                        </label>

                        {b.isUploading && (
                          <span className="text-[11px] text-blue-600 font-medium animate-pulse flex items-center gap-1">
                            <UploadCloud className="w-3.5 h-3.5 animate-bounce" />
                            Uploading...
                          </span>
                        )}

                        {b.billUrl ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Uploaded
                          </span>
                        ) : b.fileName ? (
                          <span className="text-[11px] text-slate-500 truncate max-w-xs">
                            {b.fileName}
                          </span>
                        ) : null}
                      </div>

                      {(b.billUrl || b.previewUrl || b.storagePath) && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewModal({
                              isOpen: true,
                              imageUrl: b.billUrl || b.previewUrl || '',
                              storagePath: b.storagePath || '',
                              orgId: orgId,
                              title: b.description || 'Bill Preview',
                              vendor: b.vendor,
                              amount: b.amount,
                              billNo: b.billNo,
                              date: formDate,
                              quantity: b.quantity,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview Attachment</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Organization Remarks / Notes
                </label>
                <textarea
                  rows="2"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. Authorized central invoice payment for statutory survey"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Total Calculation */}
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950">
                  Total Expense Amount:
                </span>
                <span className="text-base font-extrabold text-blue-900">
                  ₹{totalCalculatedAmount.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || totalCalculatedAmount <= 0}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Recording & Uploading...' : 'Record Bill & Synchronize'}
                </button>
              </div>
            </form>
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
