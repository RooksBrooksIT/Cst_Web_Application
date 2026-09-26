import React, { useState, useEffect, useMemo } from 'react'
import {
  CalendarCheck,
  Building2,
  Calendar,
  Save,
  Users,
  CheckCircle2,
  Clock,
  IndianRupee,
  History,
  FileSpreadsheet,
  AlertCircle,
  Plus,
  Trash2,
  UserCheck,
  Sparkles,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import {
  subscribeSiteWorkerMapping,
  subscribeWorkerAttendance,
  submitDailyAttendance,
} from '../../../services/workforceService.js'
import ManagerWorkerAttendanceReport from './ManagerWorkerAttendanceReport.jsx'

export default function WorkerAttendanceMuster({ orgId, sites = [], currentUser, onNotify, defaultView = 'muster' }) {
  const [activeView, setActiveView] = useState(defaultView) // 'muster' | 'report'
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [siteMapping, setSiteMapping] = useState(null)
  const [attendanceHistory, setAttendanceHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Current session muster roll records:
  // [ { workerId, workerName, trade, baseWage, otRate, status: 'P'|'HD'|'OT'|'A', otHours: 0, computedWage: 950 } ]
  const [musterRecords, setMusterRecords] = useState([])

  // Casual / Walk-in Extra Labour State:
  // [ { id, trade: 'Casual Helper', count: 2, wagePerWorker: 600, remarks: '' } ]
  const [extraWorkers, setExtraWorkers] = useState([])

  // Auto-select first site
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id)
    }
  }, [sites, selectedSiteId])

  // Subscribe to attendance history
  useEffect(() => {
    if (!orgId) return
    const unsub = subscribeWorkerAttendance(
      orgId,
      (data) => setAttendanceHistory(data || []),
      (err) => console.error('Attendance history sub error:', err)
    )
    return () => unsub?.()
  }, [orgId])

  // Subscribe to selected site's active workforce mapping
  useEffect(() => {
    if (!orgId || !selectedSiteId) return
    setLoading(true)

    const unsubMapping = subscribeSiteWorkerMapping(
      orgId,
      selectedSiteId,
      (mapping) => {
        setSiteMapping(mapping)
        setLoading(false)
      },
      (err) => {
        console.error('Site mapping error:', err)
        setLoading(false)
      }
    )

    return () => unsubMapping?.()
  }, [orgId, selectedSiteId])

  // Recompute single worker wage helper
  const computeWage = (base, otRate, status, otHours) => {
    let wage = 0
    if (status === 'P') wage = base
    else if (status === 'HD') wage = Math.round(base / 2)
    else if (status === 'OT') wage = base + (Number(otHours) || 0) * (Number(otRate) || Math.round(base / 6))
    else if (status === 'A') wage = 0

    return Math.max(0, wage)
  }

  // Populate muster roll when site mapping or date changes
  useEffect(() => {
    if (!selectedSiteId) return

    // 1. Check if an existing muster doc exists for this site and date in history
    const existingDoc = attendanceHistory.find(
      (h) => h.siteId === selectedSiteId && (h.date === attendanceDate || h.Day === attendanceDate)
    )

    if (existingDoc && Array.isArray(existingDoc.records) && existingDoc.records.length > 0) {
      setMusterRecords(existingDoc.records)
      if (Array.isArray(existingDoc.extraWorkers)) {
        setExtraWorkers(existingDoc.extraWorkers)
      }
    } else {
      // 2. Initialize from mapped workers in siteMapping
      const mappedList = siteMapping?.workers || []
      const initial = mappedList.map((w) => {
        const base = Number(w.workerSalary || w.salary || w.dailyWageRate) || 800
        const otRate = Math.round(base / 6)
        return {
          workerId: w.workerId || w.id,
          workerName: w.workerName || w.name,
          trade: w.workerDesignation || w.designation || w.trade || 'Worker',
          baseWage: base,
          otRate,
          status: 'P', // Present by default
          otHours: 0,
          computedWage: base,
        }
      })
      setMusterRecords(initial)
      setExtraWorkers([])
    }
  }, [selectedSiteId, attendanceDate, siteMapping, attendanceHistory])

  // Status button handler
  const handleStatusChange = (index, newStatus) => {
    setMusterRecords((prev) => {
      const updated = [...prev]
      const r = { ...updated[index] }
      r.status = newStatus
      if (newStatus !== 'OT') r.otHours = 0
      r.computedWage = computeWage(r.baseWage, r.otRate, newStatus, r.otHours)
      updated[index] = r
      return updated
    })
  }

  // OT hours handler
  const handleOtHoursChange = (index, hours) => {
    setMusterRecords((prev) => {
      const updated = [...prev]
      const r = { ...updated[index] }
      const ot = Math.max(0, parseInt(hours, 10) || 0)
      r.otHours = ot
      r.computedWage = computeWage(r.baseWage, r.otRate, r.status, ot)
      updated[index] = r
      return updated
    })
  }

  // Extra casual worker handlers
  const handleAddExtraWorker = () => {
    setExtraWorkers((prev) => [
      ...prev,
      {
        id: `EX_${Date.now()}`,
        trade: 'Casual Helper / Unloader',
        count: 1,
        wagePerWorker: 600,
        remarks: 'Direct daily hire',
      },
    ])
  }

  const handleUpdateExtraWorker = (id, field, value) => {
    setExtraWorkers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const handleRemoveExtraWorker = (id) => {
    setExtraWorkers((prev) => prev.filter((item) => item.id !== id))
  }

  // Financial and Headcount Aggregations
  const presentCount = useMemo(() => {
    return musterRecords.filter((r) => r.status === 'P' || r.status === 'OT').length
  }, [musterRecords])

  const halfDayCount = useMemo(() => {
    return musterRecords.filter((r) => r.status === 'HD').length
  }, [musterRecords])

  const absentCount = useMemo(() => {
    return musterRecords.filter((r) => r.status === 'A').length
  }, [musterRecords])

  const extraHeadcount = useMemo(() => {
    return extraWorkers.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0)
  }, [extraWorkers])

  const mappedPayrollTotal = useMemo(() => {
    return musterRecords.reduce((acc, r) => acc + (Number(r.computedWage) || 0), 0)
  }, [musterRecords])

  const extraPayrollTotal = useMemo(() => {
    return extraWorkers.reduce(
      (acc, curr) => acc + (Number(curr.count) || 0) * (Number(curr.wagePerWorker) || 0),
      0
    )
  }, [extraWorkers])

  const totalCalculatedPayroll = mappedPayrollTotal + extraPayrollTotal
  const totalWorkersOnSite = presentCount + halfDayCount + extraHeadcount

  // Selected site details
  const selectedSiteObj = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId) || null
  }, [sites, selectedSiteId])

  const currentSupervisor = useMemo(() => {
    return (
      selectedSiteObj?.assignedSupervisor ||
      selectedSiteObj?.supervisorName ||
      siteMapping?.supervisor ||
      currentUser?.name ||
      'Site Supervisor'
    )
  }, [selectedSiteObj, siteMapping, currentUser])

  // Save Attendance Muster
  const handleSaveAttendance = async () => {
    if (!orgId || !selectedSiteId) return

    if (musterRecords.length === 0 && extraWorkers.length === 0) {
      onNotify?.('No workers available in roster to mark attendance', 'error')
      return
    }

    // Validation: Every mapped worker must have an explicit status
    const unmarkedWorker = musterRecords.find((r) => !r.status)
    if (unmarkedWorker) {
      onNotify?.(`Please mark attendance status for ${unmarkedWorker.workerName}`, 'error')
      return
    }

    setSaving(true)
    try {
      const siteName = selectedSiteObj?.siteName || selectedSiteObj?.projectName || selectedSiteId

      await submitDailyAttendance(
        orgId,
        selectedSiteId,
        siteName,
        currentSupervisor,
        currentUser?.id || 'mgr_lead',
        attendanceDate,
        musterRecords,
        extraWorkers
      )

      onNotify?.(
        `Muster roll committed for ${siteName}! ${totalWorkersOnSite} workers on site. Total Day Wages: ₹${totalCalculatedPayroll.toLocaleString('en-IN')}`,
        'success'
      )
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to commit attendance muster', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (activeView === 'report') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView('muster')}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
            >
              ← Daily Shift Muster Roll
            </button>
            <button
              type="button"
              onClick={() => setActiveView('report')}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-[#0B3470] text-white shadow-xs cursor-pointer"
            >
              Worker Attendance Report
            </button>
          </div>
        </div>
        <ManagerWorkerAttendanceReport
          orgId={orgId}
          sites={sites}
          currentUser={currentUser}
          onNotify={onNotify}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/50">
              Daily Shift Muster Roll & Payroll
            </span>
            <span className="text-xs font-medium text-slate-400">• Mobile Synced Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Worker Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Verify daily on-site headcounts, capture overtime, and atomically record wage accruals into monthly payroll ledgers.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveView('muster')}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white text-[#0B3470] shadow-xs cursor-pointer"
            >
              Muster Entry
            </button>
            <button
              type="button"
              onClick={() => setActiveView('report')}
              className="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Attendance Report
            </button>
          </div>

          <button
            onClick={handleSaveAttendance}
            disabled={saving || (musterRecords.length === 0 && extraWorkers.length === 0)}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Committing Muster...' : 'Commit Daily Muster Roll'}</span>
          </button>
        </div>
      </div>

      {/* Selector & Headcount Tally Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName || s.projectName || s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            />
          </div>

          <div className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold text-slate-700">
            Supervisor: <span className="text-slate-900">{currentSupervisor}</span>
          </div>
        </div>

        {/* Live Headcount Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200/60">
            {presentCount} Present
          </div>
          <div className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold border border-amber-200/60">
            {halfDayCount} Half Day
          </div>
          <div className="px-3 py-1.5 bg-rose-50 text-rose-800 rounded-xl text-xs font-bold border border-rose-200/60">
            {absentCount} Absent
          </div>
          {extraHeadcount > 0 && (
            <div className="px-3 py-1.5 bg-purple-50 text-purple-800 rounded-xl text-xs font-bold border border-purple-200/60">
              +{extraHeadcount} Casual Extra
            </div>
          )}
          <div className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-extrabold ml-1 shadow-xs">
            Wages: ₹{totalCalculatedPayroll.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* 1. MAPPED WORKERS MUSTER ROLL TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Allocated Site Workforce Muster ({musterRecords.length})
            </h3>
            <p className="text-xs text-slate-500">
              Roster derived from Workers Site Mapping for {selectedSiteObj?.siteName || selectedSiteId}.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">Date: {attendanceDate}</span>
        </div>

        {musterRecords.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No personnel mapped to this site</p>
            <p className="text-xs text-slate-400 mt-1">
              Please allocate workers in <strong>Workers Site Mapping</strong> to generate the on-site muster roll.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Worker Personnel</th>
                  <th className="py-3 px-4">Trade</th>
                  <th className="py-3 px-4">Shift Attendance</th>
                  <th className="py-3 px-4">Overtime Hours</th>
                  <th className="py-3 px-4">Base Day Rate</th>
                  <th className="py-3 px-4 text-right">Computed Wage (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {musterRecords.map((r, index) => {
                  const isOT = r.status === 'OT'
                  return (
                    <tr key={r.workerId || index} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 leading-snug">{r.workerName}</p>
                        <span className="font-mono text-[10px] text-slate-400">{r.workerId}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md">
                          {r.trade}
                        </span>
                      </td>

                      {/* Shift Status 4-way Segmented Buttons */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-xl text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(index, 'P')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              r.status === 'P'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(index, 'HD')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              r.status === 'HD'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Half Day
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(index, 'OT')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              r.status === 'OT'
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Overtime
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(index, 'A')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              r.status === 'A'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Absent
                          </button>
                        </div>
                      </td>

                      {/* Overtime Hours Input */}
                      <td className="py-3.5 px-4">
                        {isOT ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max="12"
                              value={r.otHours || 2}
                              onChange={(e) => handleOtHoursChange(index, e.target.value)}
                              className="w-16 px-2 py-1 text-xs bg-purple-50 border border-purple-200 rounded-lg text-center font-bold text-purple-900 focus:ring-2 focus:ring-purple-500/20"
                            />
                            <span className="text-xs text-slate-400 font-medium">hrs (@ ₹{r.otRate}/hr)</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">
                        ₹{r.baseWage.toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">
                        ₹{(Number(r.computedWage) || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. CASUAL / WALK-IN EXTRA LABOUR SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 rounded-md">
                Walk-in Casual Labour
              </span>
              <h3 className="text-sm font-bold text-slate-900">Emergency & Extra Daily Labour</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Record temporary or unmapped casual workforce hired for emergency concrete unloading or site clearing.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddExtraWorker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Casual Labour Batch</span>
          </button>
        </div>

        {extraWorkers.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No casual extra labour recorded for this shift. Click "Add Casual Labour Batch" if temporary helpers were hired.
          </p>
        ) : (
          <div className="space-y-3">
            {extraWorkers.map((ex) => (
              <div
                key={ex.id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl items-center text-xs"
              >
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Trade / Job Task
                  </label>
                  <input
                    type="text"
                    value={ex.trade}
                    onChange={(e) => handleUpdateExtraWorker(ex.id, 'trade', e.target.value)}
                    placeholder="e.g. Unloading Helper"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Headcount
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={ex.count}
                    onChange={(e) => handleUpdateExtraWorker(ex.id, 'count', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Wage / Head (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={ex.wagePerWorker}
                    onChange={(e) => handleUpdateExtraWorker(ex.id, 'wagePerWorker', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Remarks / Purpose
                  </label>
                  <input
                    type="text"
                    value={ex.remarks}
                    onChange={(e) => handleUpdateExtraWorker(ex.id, 'remarks', e.target.value)}
                    placeholder="e.g. Unloading cement truck"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div className="sm:col-span-1 text-right pt-4 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => handleRemoveExtraWorker(ex.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    title="Remove Batch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. RECENT COMMITTED MUSTER SESSIONS */}
      {attendanceHistory.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Committed Site Shift Logs</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {attendanceHistory.slice(0, 6).map((doc) => (
              <div
                key={doc.id || doc.docId}
                onClick={() => {
                  if (doc.siteId) setSelectedSiteId(doc.siteId)
                  if (doc.date) setAttendanceDate(doc.date)
                }}
                className="p-4 rounded-xl border border-slate-200/70 hover:border-blue-300 bg-slate-50/50 hover:bg-white transition-all cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">{doc.siteName || doc.site}</span>
                  <span className="text-[11px] font-mono text-slate-400">{doc.date || doc.Day}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Headcount: <strong>{doc.totalWorkersOnSite || doc.totalMappedPresent || doc.headcount || 0}</strong>
                  </span>
                  <span className="font-bold text-emerald-700">
                    ₹{(Number(doc.totalWage) || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
