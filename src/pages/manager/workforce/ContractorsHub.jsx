import React, { useState, useEffect, useMemo } from 'react'
import {
  Briefcase,
  Users,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Download,
  Building2,
  Phone,
  FileSpreadsheet,
  IndianRupee,
  X,
} from 'lucide-react'
import {
  fetchContractors,
  createContractor,
  updateContractor,
  deleteContractor,
  fetchContractorEntries,
  createContractorEntry,
  updateContractorEntryStatus,
  CONTRACTOR_TRADES,
} from '../../../services/contractorService.js'

export default function ContractorsHub({ orgId, sites = [], currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState('registry') // 'registry' | 'entries'
  const [contractors, setContractors] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Contractor Modal
  const [showContractorModal, setShowContractorModal] = useState(false)
  const [editingContractor, setEditingContractor] = useState(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formTrade, setFormTrade] = useState(CONTRACTOR_TRADES[0])
  const [formPanGst, setFormPanGst] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formAdvance, setFormAdvance] = useState('')
  const [submittingContractor, setSubmittingContractor] = useState(false)

  // Daily Work Entry Modal
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryContractorId, setEntryContractorId] = useState('')
  const [entrySiteId, setEntrySiteId] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [entryWorkDesc, setEntryWorkDesc] = useState('')
  const [entryMeasurement, setEntryMeasurement] = useState('')
  const [entryAmount, setEntryAmount] = useState('')
  const [submittingEntry, setSubmittingEntry] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [conts, ents] = await Promise.all([
        fetchContractors(orgId),
        fetchContractorEntries(orgId),
      ])
      setContractors(conts || [])
      setEntries(ents || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load contractor data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleOpenCreateContractor = () => {
    setEditingContractor(null)
    setFormName('')
    setFormPhone('')
    setFormTrade(CONTRACTOR_TRADES[0])
    setFormPanGst('')
    setFormValue('')
    setFormAdvance('')
    setShowContractorModal(true)
  }

  const handleOpenEditContractor = (c) => {
    setEditingContractor(c)
    setFormName(c.contractorName || c.name || '')
    setFormPhone(c.phone || c.contractorNumber || '')
    setFormTrade(c.projectField || c.trade || CONTRACTOR_TRADES[0])
    setFormPanGst(c.panGst || '')
    setFormValue(c.contractValue || '')
    setFormAdvance(c.advancePaid || '')
    setShowContractorModal(true)
  }

  const handleSubmitContractor = async (e) => {
    e.preventDefault()
    if (!orgId || !formName.trim()) return

    setSubmittingContractor(true)
    try {
      if (editingContractor) {
        await updateContractor(orgId, editingContractor.id || editingContractor.contractorId, {
          contractorName: formName.trim(),
          name: formName.trim(),
          phone: formPhone.trim(),
          projectField: formTrade,
          trade: formTrade,
          panGst: formPanGst.trim(),
          contractValue: Number(formValue) || 0,
          advancePaid: Number(formAdvance) || 0,
        })
        onNotify?.('Contractor details updated', 'success')
      } else {
        await createContractor(orgId, {
          contractorName: formName.trim(),
          phone: formPhone.trim(),
          trade: formTrade,
          panGst: formPanGst.trim(),
          contractValue: Number(formValue) || 0,
          advancePaid: Number(formAdvance) || 0,
        })
        onNotify?.('Contractor onboarded into registry', 'success')
      }
      setShowContractorModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to save contractor', 'error')
    } finally {
      setSubmittingContractor(false)
    }
  }

  const handleDeleteContractor = async (id) => {
    if (!orgId || !id) return
    if (!window.confirm('Delete this contractor profile?')) return
    try {
      await deleteContractor(orgId, id)
      onNotify?.('Contractor removed', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete contractor', 'error')
    }
  }

  const handleSubmitEntry = async (e) => {
    e.preventDefault()
    if (!orgId || !entryContractorId || !entrySiteId) {
      onNotify?.('Contractor and Site are required', 'error')
      return
    }

    setSubmittingEntry(true)
    try {
      const cont = contractors.find((c) => (c.id || c.contractorId) === entryContractorId)
      const site = sites.find((s) => s.id === entrySiteId)

      await createContractorEntry(orgId, {
        contractorId: entryContractorId,
        contractorName: cont?.contractorName || cont?.name || 'Contractor',
        siteId: entrySiteId,
        siteName: site?.siteName || site?.projectName || 'Project Site',
        date: entryDate,
        workDescription: entryWorkDesc,
        measurement: entryMeasurement,
        amount: Number(entryAmount) || 0,
        status: 'pending',
      })

      onNotify?.('Daily contractor measurement entry recorded!', 'success')
      setShowEntryModal(false)
      setEntryWorkDesc('')
      setEntryMeasurement('')
      setEntryAmount('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to record entry', 'error')
    } finally {
      setSubmittingEntry(false)
    }
  }

  const handleUpdateEntryStatus = async (entryId, status) => {
    if (!orgId || !entryId) return
    try {
      await updateContractorEntryStatus(orgId, entryId, status)
      onNotify?.(`Contractor measurement entry marked as ${status}`, 'success')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to update status', 'error')
    }
  }

  const handleExportCSV = () => {
    if (entries.length === 0) return
    const rows = [
      ['Entry ID', 'Contractor', 'Site', 'Date', 'Work Description', 'Measurement', 'Claimed Amount (INR)', 'Status'],
      ...entries.map((e) => [
        e.entryId || e.id,
        `"${(e.contractorName || '').replace(/"/g, '""')}"`,
        `"${(e.siteName || '').replace(/"/g, '""')}"`,
        e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString() : '',
        `"${(e.workDescription || '').replace(/"/g, '""')}"`,
        `"${(e.measurement || '').replace(/"/g, '""')}"`,
        e.amount || 0,
        e.status || 'pending',
      ]),
    ]
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((r) => r.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `contractor_entries_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredContractors = useMemo(() => {
    return contractors.filter((c) => {
      const name = (c.contractorName || c.name || '').toLowerCase()
      const trade = (c.projectField || c.trade || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      return (
        name.includes(searchQuery.toLowerCase()) ||
        trade.includes(searchQuery.toLowerCase()) ||
        phone.includes(searchQuery.toLowerCase())
      )
    })
  }, [contractors, searchQuery])

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const name = (e.contractorName || '').toLowerCase()
      const site = (e.siteName || '').toLowerCase()
      const desc = (e.workDescription || '').toLowerCase()
      return (
        name.includes(searchQuery.toLowerCase()) ||
        site.includes(searchQuery.toLowerCase()) ||
        desc.includes(searchQuery.toLowerCase())
      )
    })
  }, [entries, searchQuery])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Workforce Sub-Contracts
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contractors Directory</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage sub-contractor agreements, track daily field measurements, and authorize verification claims.
          </p>
        </div>

        {/* Action Toggle */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('registry')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'registry' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Briefcase className={`w-4 h-4 ${activeTab === 'registry' ? 'text-white' : 'text-slate-500'}`} />
            <span>Contractors Master ({contractors.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'entries' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 ${activeTab === 'entries' ? 'text-white' : 'text-slate-500'}`} />
            <span>Work Measurements ({entries.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 0: CONTRACTORS MASTER REGISTRY */}
      {activeTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contractor, trade, phone..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              onClick={handleOpenCreateContractor}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Onboard Sub-Contractor</span>
            </button>
          </div>

          {loading && contractors.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading contractors directory...</div>
          ) : filteredContractors.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No sub-contractors registered</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "Onboard Sub-Contractor" to register civil, MEP, or finishing contractors.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredContractors.map((c) => (
                <div
                  key={c.id || c.contractorId}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
                          {c.projectField || c.trade || 'General'}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5 leading-snug">
                          {c.contractorName || c.name}
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                        Active
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{c.phone || c.contractorNumber || 'No phone'}</span>
                      </div>
                      {c.panGst && <p className="text-slate-400 font-mono">GSTIN/PAN: {c.panGst}</p>}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Contract Value</span>
                        <span className="font-bold text-slate-900">
                          ₹{(Number(c.contractValue) || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Advance Paid</span>
                        <span className="font-bold text-blue-700">
                          ₹{(Number(c.advancePaid) || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleOpenEditContractor(c)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Edit Profile"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteContractor(c.id || c.contractorId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: WORK MEASUREMENTS & BILLING ENTRIES */}
      {activeTab === 'entries' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search measurement, contractor..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                disabled={entries.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => {
                  if (contractors.length > 0 && !entryContractorId) setEntryContractorId(contractors[0].id || contractors[0].contractorId)
                  if (sites.length > 0 && !entrySiteId) setEntrySiteId(sites[0].id)
                  setShowEntryModal(true)
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Log Measurement</span>
              </button>
            </div>
          </div>

          {loading && entries.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading work measurements...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No measurement entries logged</p>
              <p className="text-xs text-slate-400 mt-1">
                Record site civil measurements (sq.ft, cu.m, brass) to generate verifiable contractor billing claims.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Contractor & Site</th>
                      <th className="py-3.5 px-4">Work Description</th>
                      <th className="py-3.5 px-4">Measurement</th>
                      <th className="py-3.5 px-4">Claimed Amount</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredEntries.map((e) => {
                      const isApproved = e.status === 'approved'
                      const isPending = e.status === 'pending' || !e.status
                      const isPaid = e.status === 'paid'

                      return (
                        <tr key={e.id || e.entryId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div>
                              <p className="font-semibold text-slate-900">{e.contractorName}</p>
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                {e.siteName}
                              </p>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-700 max-w-xs">
                            <p className="line-clamp-2">{e.workDescription}</p>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-800">
                            {e.measurement || '—'}
                          </td>

                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            ₹{(Number(e.amount) || 0).toLocaleString('en-IN')}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                isApproved
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : isPaid
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {e.status || 'pending'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            {isPending && (
                              <button
                                onClick={() => handleUpdateEntryStatus(e.id || e.entryId, 'approved')}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                              >
                                Approve Work
                              </button>
                            )}
                            {isApproved && (
                              <button
                                onClick={() => handleUpdateEntryStatus(e.id || e.entryId, 'paid')}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onboard Contractor Modal */}
      {showContractorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingContractor ? 'Edit Contractor Profile' : 'Onboard Sub-Contractor'}
                </h3>
                <p className="text-xs text-slate-500">Corporate & contractual credentials.</p>
              </div>
              <button onClick={() => setShowContractorModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitContractor} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Contractor / Firm Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. S.K. Structural Engineers"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Specialty Trade *
                  </label>
                  <select
                    value={formTrade}
                    onChange={(e) => setFormTrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {CONTRACTOR_TRADES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+91 98450 XXXXX"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  PAN / GSTIN (Tax ID)
                </label>
                <input
                  type="text"
                  value={formPanGst}
                  onChange={(e) => setFormPanGst(e.target.value)}
                  placeholder="e.g. 29AAAAA0000A1Z5"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Total Contract Value (₹)
                  </label>
                  <input
                    type="number"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Advance Paid (₹)
                  </label>
                  <input
                    type="number"
                    value={formAdvance}
                    onChange={(e) => setFormAdvance(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowContractorModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingContractor}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingContractor ? 'Saving...' : 'Save Contractor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Measurement Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Record Work Measurement</h3>
                <p className="text-xs text-slate-500">Log verified quantities executed by sub-contractor.</p>
              </div>
              <button onClick={() => setShowEntryModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Sub-Contractor *
                </label>
                <select
                  required
                  value={entryContractorId}
                  onChange={(e) => setEntryContractorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select Contractor...</option>
                  {contractors.map((c) => (
                    <option key={c.id || c.contractorId} value={c.id || c.contractorId}>
                      {c.contractorName || c.name} ({c.projectField || c.trade})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Construction Site *
                </label>
                <select
                  required
                  value={entrySiteId}
                  onChange={(e) => setEntrySiteId(e.target.value)}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Measurement (e.g. 1450 Sq.Ft)
                  </label>
                  <input
                    type="text"
                    required
                    value={entryMeasurement}
                    onChange={(e) => setEntryMeasurement(e.target.value)}
                    placeholder="e.g. 450 Cu.M"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Claim Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    placeholder="e.g. 28000"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Work Description / Stage Notes
                </label>
                <textarea
                  rows="2"
                  value={entryWorkDesc}
                  onChange={(e) => setEntryWorkDesc(e.target.value)}
                  placeholder="e.g. Second floor brickwork completed with 1:4 cement mortar as per elevation drawing"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEntryModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEntry}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingEntry ? 'Saving...' : 'Record Measurement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
