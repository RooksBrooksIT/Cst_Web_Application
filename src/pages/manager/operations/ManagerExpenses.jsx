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
} from 'lucide-react'
import {
  fetchManagerExpenses,
  recordManagerExpense,
  deleteManagerExpense,
} from '../../../services/managerExpenseService.js'
import AppStorageService from '../../../services/appStorageService.js'
import BillImagePreviewModal from '../../../components/common/BillImagePreviewModal.jsx'

export default function ManagerExpenses({ orgId, sites = [], currentUser, onNotify }) {
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

  // Create Modal State
  const [showModal, setShowModal] = useState(false)
  const [formSiteId, setFormSiteId] = useState('')
  const [formStage, setFormStage] = useState('Superstructure & RCC Slabs')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formRemarks, setFormRemarks] = useState('')
  const [bills, setBills] = useState([
    {
      description: 'Structural Testing Lab Fee',
      vendor: 'Apex QC Labs',
      billNo: 'INV-883',
      amount: '4500',
      file: null,
      fileName: '',
      billUrl: '',
      storagePath: '',
      previewUrl: '',
      isUploading: false,
    },
  ])
  const [submitting, setSubmitting] = useState(false)

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
    loadData()
  }, [orgId])

  const totalCalculatedAmount = useMemo(() => {
    return bills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0)
  }, [bills])

  const handleAddBill = () => {
    setBills([
      ...bills,
      {
        description: '',
        vendor: '',
        billNo: '',
        amount: '',
        file: null,
        fileName: '',
        billUrl: '',
        storagePath: '',
        previewUrl: '',
        isUploading: false,
      },
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

  // Handle direct file upload for a bill item row
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
          expenseType: 'manager expenses',
          siteId: formSiteId,
          siteName,
          fileName: file.name,
          file,
          sitesList: sites,
        })

        const nextBills = [...bills]
        nextBills[index].billUrl = uploadResult.downloadUrl
        nextBills[index].storagePath = uploadResult.storagePath
        nextBills[index].isUploading = false
        setBills(nextBills)
        onNotify?.(`Bill "${file.name}" uploaded successfully`, 'success')
      } catch (err) {
        console.error('Instant bill upload error:', err)
        const nextBills = [...bills]
        nextBills[index].isUploading = false
        setBills(nextBills)
        onNotify?.(`Upload note: ${err.message}. Will upload on submit.`, 'warning')
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
      // manager expenses/organisation/{tenantId}/manager expenses/{siteId_siteName}/{image}
      const processedBills = await Promise.all(
        bills
          .filter((b) => b.description?.trim())
          .map(async (b) => {
            let billUrl = b.billUrl || ''
            let storagePath = b.storagePath || ''

            if (b.file && !billUrl) {
              const uploadRes = await AppStorageService.uploadExpenseBillDoc({
                tenantId: orgId,
                expenseType: 'manager expenses',
                siteId: formSiteId,
                siteName,
                fileName: b.fileName || b.file.name,
                file: b.file,
                sitesList: sites,
              })
              billUrl = uploadRes.downloadUrl
              storagePath = uploadRes.storagePath
            }

            return {
              description: b.description,
              vendor: b.vendor,
              billNo: b.billNo,
              amount: b.amount,
              billUrl,
              imageUrl: billUrl,
              storagePath,
              fileName: b.fileName || '',
            }
          })
      )

      await recordManagerExpense(
        orgId,
        {
          siteId: formSiteId,
          siteName: site?.siteName || site?.projectName || 'Project Site',
          projectStage: formStage,
          expenseDate: formDate,
          remarks: formRemarks,
          bills: processedBills,
          totalAmount: totalCalculatedAmount,
        },
        currentUser
      )

      onNotify?.('Manager expense claim recorded and synched to project total!', 'success')
      setShowModal(false)
      setFormRemarks('')
      setBills([
        {
          description: '',
          vendor: '',
          billNo: '',
          amount: '',
          file: null,
          fileName: '',
          billUrl: '',
          storagePath: '',
          previewUrl: '',
          isUploading: false,
        },
      ])
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to record expense', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (expenseId) => {
    if (!orgId || !expenseId) return
    if (!window.confirm('Delete this manager expense claim record?')) return
    try {
      await deleteManagerExpense(orgId, expenseId)
      onNotify?.('Expense claim deleted', 'info')
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
      ['Expense ID', 'Site Name', 'Stage', 'Date', 'Total Amount', 'Manager', 'Remarks', 'Bill Attached'],
      ...expenses.map((e) => [
        e.expenseId || e.id,
        e.siteName || '',
        e.projectStage || '',
        e.expenseDate?.seconds ? new Date(e.expenseDate.seconds * 1000).toLocaleDateString() : '',
        e.totalAmount || 0,
        e.managerName || '',
        `"${(e.remarks || '').replace(/"/g, '""')}"`,
        e.billUrl || e.bills?.some((b) => b.billUrl) ? 'Yes' : 'No',
      ]),
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

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const siteName = (e.siteName || '').toLowerCase()
      const remarks = (e.remarks || '').toLowerCase()
      const matchesSearch = siteName.includes(searchQuery.toLowerCase()) || remarks.includes(searchQuery.toLowerCase())
      const matchesSite = selectedSiteFilter === 'ALL' || e.siteId === selectedSiteFilter
      return matchesSearch && matchesSite
    })
  }, [expenses, searchQuery, selectedSiteFilter])

  const totalSumSpent = useMemo(() => {
    return filteredExpenses.reduce((acc, e) => acc + (Number(e.totalAmount) || 0), 0)
  }, [filteredExpenses])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={expenses.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (sites.length > 0 && !formSiteId) setFormSiteId(sites[0].id)
              setShowModal(true)
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Direct Expense</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Disbursed</p>
          <p className="text-2xl font-black text-slate-900 mt-1">₹{totalSumSpent.toLocaleString('en-IN')}</p>
          <p className="text-xs text-purple-600 font-medium mt-1">Direct project out-of-pocket</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expense Vouchers</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{filteredExpenses.length}</p>
          <p className="text-xs text-slate-500 mt-1">Recorded ledger claims</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Coverage</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{sites.length} Active Sites</p>
          <p className="text-xs text-emerald-600 font-medium mt-1">Auto-synced to site accounts</p>
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
            placeholder="Search expense by site or notes..."
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
        <div className="py-20 text-center text-slate-400">Loading expense claims...</div>
      ) : filteredExpenses.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No manager direct expenses recorded</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Record Direct Expense" to log out-of-pocket expenditures for your projects.
          </p>
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
                  <th className="py-3.5 px-4">Bill Items</th>
                  <th className="py-3.5 px-4">Bill Document</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Remarks / Notes</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredExpenses.map((item) => {
                  const expenseDate = item.expenseDate?.seconds
                    ? new Date(item.expenseDate.seconds * 1000).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Recent'
                  const billsCount = Array.isArray(item.bills) ? item.bills.length : 1
                  const totalAmt = Number(item.totalAmount) || 0

                  const billWithDoc =
                    (Array.isArray(item.bills) && item.bills.find((b) => b.billUrl || b.imageUrl)) ||
                    (item.billUrl ? { billUrl: item.billUrl, description: item.remarks } : null)

                  return (
                    <tr key={item.id || item.expenseId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0 border border-purple-100">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <strong className="block font-bold text-slate-900 text-sm">{item.siteName}</strong>
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

                      {/* Bill Document Column with Instant Preview */}
                      <td className="py-3.5 px-4">
                        {billWithDoc ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                isOpen: true,
                                imageUrl: billWithDoc.billUrl || billWithDoc.imageUrl,
                                title: billWithDoc.description || item.siteName,
                                vendor: billWithDoc.vendor || 'Manager Direct Expense',
                                amount: billWithDoc.amount || totalAmt,
                                billNo: billWithDoc.billNo || '',
                                date: expenseDate,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                            title="Click to view uploaded bill image"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>View Bill</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No file</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                        ₹{totalAmt.toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                        {item.remarks || 'No remarks'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleDelete(item.id || item.expenseId)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                          title="Delete Claim"
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
            const expenseDate = item.expenseDate?.seconds
              ? new Date(item.expenseDate.seconds * 1000).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Recent'

            const billsCount = Array.isArray(item.bills) ? item.bills.length : 1
            const hasBillsWithDoc =
              item.billUrl || (Array.isArray(item.bills) && item.bills.some((b) => b.billUrl || b.imageUrl))

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
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{item.siteName}</h3>
                        <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-md">
                          {item.projectStage || 'Superstructure'}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                          {billsCount} {billsCount === 1 ? 'Bill Item' : 'Bill Items'}
                        </span>
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
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Claim Amount</p>
                      <p className="text-lg font-bold text-slate-900">
                        ₹{(Number(item.totalAmount) || 0).toLocaleString('en-IN')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(item.id || item.expenseId)
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
                      {item.bills.map((bill, bIdx) => (
                        <div key={bIdx} className="p-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{bill.description || 'Disbursement'}</p>
                            <p className="text-slate-500 mt-0.5">
                              Vendor: <span className="font-medium text-slate-700">{bill.vendor || 'Direct Cash'}</span>
                              {bill.billNo && ` • Bill #${bill.billNo}`}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {bill.billUrl || bill.imageUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewModal({
                                    isOpen: true,
                                    imageUrl: bill.billUrl || bill.imageUrl,
                                    title: bill.description || 'Bill Receipt',
                                    vendor: bill.vendor || '',
                                    amount: bill.amount || '',
                                    billNo: bill.billNo || '',
                                    date: expenseDate,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold cursor-pointer shadow-2xs"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                                <span>View Receipt</span>
                              </button>
                            ) : null}

                            <span className="text-sm font-bold text-slate-900">
                              ₹{(Number(bill.amount) || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                <h3 className="text-base font-bold text-slate-900">Record Direct Site Expense</h3>
                <p className="text-xs text-slate-500">
                  Disbursed by Manager on behalf of site operations. Store receipts in Cloud Storage under tenant folder.
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Target Construction Site *
                  </label>
                  <select
                    required
                    value={formSiteId}
                    onChange={(e) => setFormSiteId(e.target.value)}
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
                    Project Stage
                  </label>
                  <input
                    type="text"
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Expense / Payment Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Itemized Bills & Document Uploads */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Bills, Invoices & Uploads</span>
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
                  <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Item description *"
                        value={b.description}
                        onChange={(e) => handleUpdateBill(idx, 'description', e.target.value)}
                        className="col-span-12 sm:col-span-4 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Vendor name"
                        value={b.vendor}
                        onChange={(e) => handleUpdateBill(idx, 'vendor', e.target.value)}
                        className="col-span-6 sm:col-span-3 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Bill / Ref #"
                        value={b.billNo}
                        onChange={(e) => handleUpdateBill(idx, 'billNo', e.target.value)}
                        className="col-span-6 sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        placeholder="Amount (₹) *"
                        value={b.amount}
                        onChange={(e) => handleUpdateBill(idx, 'amount', e.target.value)}
                        className="col-span-10 sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
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
                            {b.file || b.billUrl ? 'Change Bill Document' : 'Upload Bill Image / PDF'}
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
                          <span className="text-[11px] text-purple-600 font-medium animate-pulse flex items-center gap-1">
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
                          <span className="text-[11px] text-slate-500 truncate max-w-xs">{b.fileName}</span>
                        ) : null}
                      </div>

                      {(b.billUrl || b.previewUrl) && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewModal({
                              isOpen: true,
                              imageUrl: b.billUrl || b.previewUrl,
                              title: b.description || 'Bill Preview',
                              vendor: b.vendor,
                              amount: b.amount,
                              billNo: b.billNo,
                              date: formDate,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs text-purple-600 font-semibold hover:underline cursor-pointer"
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
                  Manager Remarks / Notes
                </label>
                <textarea
                  rows="2"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. Urgent safety gear purchase from local vendor for slab pour"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Total Calculation */}
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-purple-950">Total Expense Amount:</span>
                <span className="text-base font-extrabold text-purple-900">
                  ₹{totalCalculatedAmount.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || totalCalculatedAmount <= 0}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Recording & Uploading...' : 'Record Voucher & Sync Spent'}
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
        title={previewModal.title}
        vendor={previewModal.vendor}
        amount={previewModal.amount}
        billNo={previewModal.billNo}
        date={previewModal.date}
      />
    </div>
  )
}
