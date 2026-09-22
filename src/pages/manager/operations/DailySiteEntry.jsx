import React, { useState, useEffect, useMemo } from 'react'
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Calendar,
  Building2,
  Sun,
  CloudRain,
  Cloud,
  Wind,
  Layers,
  Users,
  PackageCheck,
  IndianRupee,
  Coffee,
  Truck,
  Fuel,
  ChevronDown,
  ChevronUp,
  Clock,
  UserCheck,
  FileText,
  X,
  Sparkles,
} from 'lucide-react'
import {
  fetchDailySiteEntries,
  createDailySiteEntry,
  WEATHER_TYPES,
} from '../../../services/dailyLogService.js'

export default function DailySiteEntry({ orgId, sites = [], currentUser, onNotify }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [selectedDateFilter, setSelectedDateFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // New Log Entry Modal
  const [showLogModal, setShowLogModal] = useState(false)
  const [formSiteId, setFormSiteId] = useState('')
  const [formStage, setFormStage] = useState('Superstructure Columns & RCC Slabs')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formWeather, setFormWeather] = useState('Sunny / Clear Sky')
  const [formMorning, setFormMorning] = useState('')
  const [formAfternoon, setFormAfternoon] = useState('')

  // Multi-item materials consumed
  const [materialsList, setMaterialsList] = useState([
    { materialName: 'OPC 53 Cement', qty: '20', unit: 'Bags', price: '420', total: 8400 },
  ])
  // Multi-item labour muster
  const [labourList, setLabourList] = useState([
    { trade: 'Masons', qty: '4', salary: '950', total: 3800 },
    { trade: 'Helpers / Coolie', qty: '8', salary: '650', total: 5200 },
  ])
  // Sundries
  const [foodCost, setFoodCost] = useState(650)
  const [transportCost, setTransportCost] = useState(400)
  const [fuelCost, setFuelCost] = useState(1200)

  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchDailySiteEntries(orgId)
      setEntries(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load daily site diary entries', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  // Computed Totals for Form
  const materialsSubtotal = useMemo(() => {
    return materialsList.reduce((acc, m) => acc + (Number(m.total) || 0), 0)
  }, [materialsList])

  const labourSubtotal = useMemo(() => {
    return labourList.reduce((acc, l) => acc + (Number(l.total) || 0), 0)
  }, [labourList])

  const grandTotalExpenditure = useMemo(() => {
    return (
      materialsSubtotal +
      labourSubtotal +
      (Number(foodCost) || 0) +
      (Number(transportCost) || 0) +
      (Number(fuelCost) || 0)
    )
  }, [materialsSubtotal, labourSubtotal, foodCost, transportCost, fuelCost])

  const handleAddMaterialRow = () => {
    setMaterialsList([...materialsList, { materialName: '', qty: '', unit: 'Units', price: '', total: 0 }])
  }

  const handleUpdateMaterialRow = (index, field, value) => {
    const updated = [...materialsList]
    updated[index][field] = value
    const qty = Number(updated[index].qty) || 0
    const price = Number(updated[index].price) || 0
    updated[index].total = qty * price
    setMaterialsList(updated)
  }

  const handleRemoveMaterialRow = (index) => {
    setMaterialsList(materialsList.filter((_, i) => i !== index))
  }

  const handleAddLabourRow = () => {
    setLabourList([...labourList, { trade: '', qty: '', salary: '', total: 0 }])
  }

  const handleUpdateLabourRow = (index, field, value) => {
    const updated = [...labourList]
    updated[index][field] = value
    const qty = Number(updated[index].qty) || 0
    const salary = Number(updated[index].salary) || 0
    updated[index].total = qty * salary
    setLabourList(updated)
  }

  const handleRemoveLabourRow = (index) => {
    setLabourList(labourList.filter((_, i) => i !== index))
  }

  const handleSubmitEntry = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!formSiteId) {
      onNotify?.('Please select a project site', 'error')
      return
    }

    setSubmitting(true)
    try {
      const site = sites.find((s) => s.id === formSiteId)
      await createDailySiteEntry(
        orgId,
        {
          siteId: formSiteId,
          siteName: site?.siteName || site?.projectName || 'Construction Site',
          siteCode: site?.siteCode || '',
          projectStage: formStage,
          date: formDate,
          weather: formWeather,
          morningStatus: formMorning,
          afternoonStatus: formAfternoon,
          materials: materialsList.filter((m) => m.materialName?.trim()),
          labours: labourList.filter((l) => l.trade?.trim()),
          foodCost: Number(foodCost) || 0,
          transportCost: Number(transportCost) || 0,
          fuelCost: Number(fuelCost) || 0,
        },
        currentUser
      )

      onNotify?.('Daily site progress & expenditures recorded successfully!', 'success')
      setShowLogModal(false)
      // Reset form
      setFormMorning('')
      setFormAfternoon('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to submit daily log', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered Entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const siteName = (entry.siteName || entry.projectName || '').toLowerCase()
      const supName = (entry.supervisorName || '').toLowerCase()
      const summary = (entry.workDoneSummary || entry.morningStatus || '').toLowerCase()
      const matchesSearch =
        siteName.includes(searchQuery.toLowerCase()) ||
        supName.includes(searchQuery.toLowerCase()) ||
        summary.includes(searchQuery.toLowerCase())

      const matchesSite = selectedSiteFilter === 'ALL' || entry.siteId === selectedSiteFilter

      let matchesDate = true
      if (selectedDateFilter) {
        const rawDate = entry.date?.seconds ? new Date(entry.date.seconds * 1000) : new Date(entry.date)
        if (!isNaN(rawDate.getTime())) {
          matchesDate = rawDate.toISOString().split('T')[0] === selectedDateFilter
        }
      }

      return matchesSearch && matchesSite && matchesDate
    })
  }, [entries, searchQuery, selectedSiteFilter, selectedDateFilter])

  const getWeatherIcon = (weather) => {
    if (!weather) return <Sun className="w-4 h-4 text-amber-500" />
    if (weather.includes('Rain')) return <CloudRain className="w-4 h-4 text-blue-500" />
    if (weather.includes('Cloud')) return <Cloud className="w-4 h-4 text-slate-500" />
    if (weather.includes('Wind')) return <Wind className="w-4 h-4 text-teal-500" />
    return <Sun className="w-4 h-4 text-amber-500" />
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
              Field Operations Diary
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manager Daily Site Entry</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time feed of daily site diary entries, materials consumed, labour muster roll, and day expenses.
          </p>
        </div>
        <button
          onClick={() => {
            if (sites.length > 0 && !formSiteId) setFormSiteId(sites[0].id)
            setShowLogModal(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Post Daily Site Entry</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries by site, supervisor, notes..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Site Filter */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
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

          {/* Date Filter */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
            />
            {selectedDateFilter && (
              <button
                onClick={() => setSelectedDateFilter('')}
                className="text-[11px] text-blue-600 hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Entries Feed */}
      {loading && entries.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading daily log feed...</div>
      ) : filteredEntries.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No daily site logs found</p>
          <p className="text-xs text-slate-400 mt-1">
            Field supervisors publish entries from their mobile app, or you can record an entry above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => {
            const isExpanded = expandedId === (entry.id || entry.entryId)
            const entryDate = entry.date?.seconds
              ? new Date(entry.date.seconds * 1000).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Recent'

            const matCost = Number(entry.materialsCost || 0)
            const labCost = Number(entry.labourCost || 0)
            const sundries =
              (Number(entry.foodCost) || 0) + (Number(entry.transportCost) || 0) + (Number(entry.fuelCost) || 0)
            const total = Number(entry.totalAmount || 0)

            return (
              <div
                key={entry.id || entry.entryId}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-200 transition-all overflow-hidden"
              >
                {/* Summary Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id || entry.entryId)}
                  className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 select-none hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {entry.siteName || entry.projectName}
                        </h3>
                        <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-md">
                          {entry.projectStage || 'Active Phase'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
                          {getWeatherIcon(entry.weather)}
                          <span>{entry.weather || 'Clear'}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {entryDate}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          {entry.supervisorName || 'Site Supervisor'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financial & Toggle */}
                  <div className="flex items-center justify-between md:justify-end gap-6 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <div className="text-left md:text-right">
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Day Expenditure</p>
                      <p className="text-lg font-bold text-slate-900">₹{total.toLocaleString('en-IN')}</p>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-5 bg-slate-50/70 border-t border-slate-100 space-y-5 text-sm">
                    {/* Work Progress Diary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200/70">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Morning Operations (08:00 - 13:00)
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-line">
                          {entry.morningStatus || 'No morning diary entered.'}
                        </p>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200/70">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          Afternoon Operations (13:00 - 18:00)
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-line">
                          {entry.afternoonStatus || 'No afternoon diary entered.'}
                        </p>
                      </div>
                    </div>

                    {/* Cost Breakdown Columns */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Materials */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <PackageCheck className="w-4 h-4 text-emerald-600" />
                            Materials Consumed
                          </span>
                          <span className="text-xs font-bold text-slate-900">₹{matCost.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="divide-y divide-slate-100 text-xs text-slate-600 max-h-36 overflow-y-auto">
                          {Array.isArray(entry.materials) && entry.materials.length > 0 ? (
                            entry.materials.map((m, idx) => (
                              <div key={idx} className="py-1.5 flex justify-between">
                                <span>
                                  {m.materialName} ({m.qty} {m.unit || 'units'})
                                </span>
                                <span className="font-semibold text-slate-800">
                                  ₹{Number(m.total || m.price * m.qty || 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="py-2 text-slate-400 italic">No materials logged</p>
                          )}
                        </div>
                      </div>

                      {/* Labour Muster */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-blue-600" />
                            Labour Wages
                          </span>
                          <span className="text-xs font-bold text-slate-900">₹{labCost.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="divide-y divide-slate-100 text-xs text-slate-600 max-h-36 overflow-y-auto">
                          {Array.isArray(entry.labours) && entry.labours.length > 0 ? (
                            entry.labours.map((l, idx) => (
                              <div key={idx} className="py-1.5 flex justify-between">
                                <span>
                                  {l.trade || l.category} ({l.qty} workers)
                                </span>
                                <span className="font-semibold text-slate-800">
                                  ₹{Number(l.total || l.salary * l.qty || 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="py-2 text-slate-400 italic">No labour muster logged</p>
                          )}
                        </div>
                      </div>

                      {/* Sundries */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Coffee className="w-4 h-4 text-amber-600" />
                            Site Sundries & Fuel
                          </span>
                          <span className="text-xs font-bold text-slate-900">₹{sundries.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="space-y-1 text-xs text-slate-600">
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="flex items-center gap-1">
                              <Coffee className="w-3 h-3 text-slate-400" /> Food & Tea
                            </span>
                            <span className="font-semibold">₹{(Number(entry.foodCost) || 0).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3 text-slate-400" /> Transport / Auto
                            </span>
                            <span className="font-semibold">
                              ₹{(Number(entry.transportCost) || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="flex items-center gap-1">
                              <Fuel className="w-3 h-3 text-slate-400" /> Fuel / Genset
                            </span>
                            <span className="font-semibold">₹{(Number(entry.fuelCost) || 0).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Post Daily Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Post Daily Site Entry</h3>
                <p className="text-xs text-slate-500">Record site daily progress, materials consumed, and expenditures.</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEntry} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Project Site *
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Entry Date
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Weather Condition
                  </label>
                  <select
                    value={formWeather}
                    onChange={(e) => setFormWeather(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {WEATHER_TYPES.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress Diary Notes */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Site Diary Notes
                </label>
                <textarea
                  rows="2"
                  value={formMorning}
                  onChange={(e) => setFormMorning(e.target.value)}
                  placeholder="Morning shift summary (e.g. Column bar bending, shuttering inspection...)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
                <textarea
                  rows="2"
                  value={formAfternoon}
                  onChange={(e) => setFormAfternoon(e.target.value)}
                  placeholder="Afternoon shift summary (e.g. Concrete pouring with transit mixer #4...)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Materials Consumed Section */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Materials Consumed</span>
                  <button
                    type="button"
                    onClick={handleAddMaterialRow}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
                {materialsList.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Material"
                      value={m.materialName}
                      onChange={(e) => handleUpdateMaterialRow(idx, 'materialName', e.target.value)}
                      className="col-span-5 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={m.qty}
                      onChange={(e) => handleUpdateMaterialRow(idx, 'qty', e.target.value)}
                      className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Price"
                      value={m.price}
                      onChange={(e) => handleUpdateMaterialRow(idx, 'price', e.target.value)}
                      className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <div className="col-span-2 text-right text-xs font-bold text-slate-800">
                      ₹{m.total || 0}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMaterialRow(idx)}
                      className="col-span-1 text-slate-400 hover:text-rose-600 text-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Labour Muster Section */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Labour Muster</span>
                  <button
                    type="button"
                    onClick={handleAddLabourRow}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Trade
                  </button>
                </div>
                {labourList.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Trade (e.g. Mason)"
                      value={l.trade}
                      onChange={(e) => handleUpdateLabourRow(idx, 'trade', e.target.value)}
                      className="col-span-5 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Heads"
                      value={l.qty}
                      onChange={(e) => handleUpdateLabourRow(idx, 'qty', e.target.value)}
                      className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Wage"
                      value={l.salary}
                      onChange={(e) => handleUpdateLabourRow(idx, 'salary', e.target.value)}
                      className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <div className="col-span-2 text-right text-xs font-bold text-slate-800">
                      ₹{l.total || 0}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLabourRow(idx)}
                      className="col-span-1 text-slate-400 hover:text-rose-600 text-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Sundries Inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Food / Tea (₹)</label>
                  <input
                    type="number"
                    value={foodCost}
                    onChange={(e) => setFoodCost(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Transport (₹)</label>
                  <input
                    type="number"
                    value={transportCost}
                    onChange={(e) => setTransportCost(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Fuel / Genset (₹)</label>
                  <input
                    type="number"
                    value={fuelCost}
                    onChange={(e) => setFuelCost(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Total Summary Footer */}
              <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950">Calculated Total Day Spent:</span>
                <span className="text-base font-extrabold text-blue-900">
                  ₹{grandTotalExpenditure.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Recording Log...' : 'Commit Daily Log & Update Spent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
