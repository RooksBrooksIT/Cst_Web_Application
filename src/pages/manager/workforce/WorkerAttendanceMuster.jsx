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
} from 'lucide-react'
import {
  fetchWorkers,
  fetchWorkerAttendance,
  recordWorkerAttendanceBatch,
} from '../../../services/workforceService.js'

export default function WorkerAttendanceMuster({ orgId, sites = [], currentUser, onNotify }) {
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [allWorkers, setAllWorkers] = useState([])
  const [attendanceHistory, setAttendanceHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Current session muster roll records: [ { workerId, workerName, trade, baseWage, otRate, status: 'P'|'HD'|'A', otHours: 0, computedWage: 950 } ]
  const [musterRecords, setMusterRecords] = useState([])

  const loadInitialData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [wrks, hist] = await Promise.all([
        fetchWorkers(orgId),
        fetchWorkerAttendance(orgId),
      ])
      setAllWorkers(wrks || [])
      setAttendanceHistory(hist || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load attendance muster', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [orgId])

  // Select first site by default if none selected
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id)
    }
  }, [sites, selectedSiteId])

  // Rebuild muster roll when site or date changes
  useEffect(() => {
    if (!selectedSiteId) return

    // Check if an existing muster doc exists for this site and date
    const existingDoc = attendanceHistory.find(
      (h) => h.siteId === selectedSiteId && h.date === attendanceDate
    )

    if (existingDoc && Array.isArray(existingDoc.records) && existingDoc.records.length > 0) {
      setMusterRecords(existingDoc.records)
    } else {
      // Find workers allocated to this site (or all workers if site has none mapped specifically)
      let siteWorkers = allWorkers.filter((w) => w.assignedSiteId === selectedSiteId)
      if (siteWorkers.length === 0) {
        siteWorkers = allWorkers // allow muster from entire roster if site mapping is empty
      }

      const initial = siteWorkers.map((w) => {
        const base = Number(w.salary || w.dailyWageRate) || 800
        const otRate = Number(w.overtimeHourlyRate) || 120
        return {
          workerId: w.id || w.workerId,
          workerName: w.name || w.workerName,
          trade: w.designation || w.trade || 'Worker',
          baseWage: base,
          otRate,
          status: 'P', // Present by default
          otHours: 0,
          computedWage: base,
        }
      })
      setMusterRecords(initial)
    }
  }, [selectedSiteId, attendanceDate, allWorkers, attendanceHistory])

  // Helper to recompute single worker wage
  const computeWage = (base, otRate, status, otHours) => {
    let wage = 0
    if (status === 'P') wage = base
    else if (status === 'HD') wage = Math.round(base / 2)
    else if (status === 'A') wage = 0

    const otAmount = (Number(otHours) || 0) * (Number(otRate) || 0)
    return wage + otAmount
  }

  const handleStatusChange = (index, newStatus) => {
    const updated = [...musterRecords]
    const r = updated[index]
    r.status = newStatus
    r.computedWage = computeWage(r.baseWage, r.otRate, newStatus, r.otHours)
    setMusterRecords(updated)
  }

  const handleOtChange = (index, newOt) => {
    const updated = [...musterRecords]
    const r = updated[index]
    const ot = Math.max(0, parseInt(newOt) || 0)
    r.otHours = ot
    r.computedWage = computeWage(r.baseWage, r.otRate, r.status, ot)
    setMusterRecords(updated)
  }

  const totalCalculatedPayroll = useMemo(() => {
    return musterRecords.reduce((acc, r) => acc + (Number(r.computedWage) || 0), 0)
  }, [musterRecords])

  const presentCount = useMemo(() => {
    return musterRecords.filter((r) => r.status === 'P').length
  }, [musterRecords])

  const halfDayCount = useMemo(() => {
    return musterRecords.filter((r) => r.status === 'HD').length
  }, [musterRecords])

  const absentCount = useMemo(() => {
    return musterRecords.filter((r) => r.status === 'A').length
  }, [musterRecords])

  const handleSaveAttendance = async () => {
    if (!orgId || !selectedSiteId || musterRecords.length === 0) return

    setSaving(true)
    try {
      const site = sites.find((s) => s.id === selectedSiteId)
      const siteName = site ? site.siteName || site.projectName : 'Project Site'

      await recordWorkerAttendanceBatch(
        orgId,
        selectedSiteId,
        siteName,
        attendanceDate,
        musterRecords,
        currentUser
      )

      onNotify?.(`Daily muster roll saved for ${siteName}! Total wages: ₹${totalCalculatedPayroll.toLocaleString('en-IN')}`, 'success')
      await loadInitialData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to save attendance muster', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              Daily Muster Roll
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Worker Attendance & Wage Payroll</h1>
          <p className="text-sm text-slate-500 mt-1">
            Mark daily site headcounts, record overtime hours, and calculate verified labour disbursements.
          </p>
        </div>

        <button
          onClick={handleSaveAttendance}
          disabled={saving || musterRecords.length === 0}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving Muster...' : 'Commit Daily Muster Roll'}</span>
        </button>
      </div>

      {/* Selectors & Tally Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName || s.projectName}
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
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-medium"
            />
          </div>
        </div>

        {/* Headcount Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200/60">
            {presentCount} Present (Full)
          </div>
          <div className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold border border-amber-200/60">
            {halfDayCount} Half Day
          </div>
          <div className="px-3 py-1.5 bg-rose-50 text-rose-800 rounded-xl text-xs font-bold border border-rose-200/60">
            {absentCount} Absent
          </div>
          <div className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold ml-1">
            Total Wages: ₹{totalCalculatedPayroll.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Muster Roll Table */}
      {loading && musterRecords.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading muster roll...</div>
      ) : musterRecords.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No personnel available for muster</p>
          <p className="text-xs text-slate-400 mt-1">
            Please register workers in the Workers Directory first to mark attendance on site.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Worker Personnel</th>
                  <th className="py-3.5 px-4">Trade</th>
                  <th className="py-3.5 px-4">Shift Attendance</th>
                  <th className="py-3.5 px-4">Overtime (Hours)</th>
                  <th className="py-3.5 px-4">Base Day Rate</th>
                  <th className="py-3.5 px-4 text-right">Computed Day Wage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {musterRecords.map((r, index) => (
                  <tr key={r.workerId || index} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 leading-snug">{r.workerName}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md">
                        {r.trade}
                      </span>
                    </td>

                    {/* Attendance Radio Pills */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(index, 'P')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            r.status === 'P' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          P
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(index, 'HD')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            r.status === 'HD' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          HD
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(index, 'A')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            r.status === 'A' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          A
                        </button>
                      </div>
                    </td>

                    {/* Overtime hours stepper */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="12"
                          value={r.otHours}
                          onChange={(e) => handleOtChange(index, e.target.value)}
                          className="w-16 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-center font-bold text-slate-800"
                        />
                        <span className="text-xs text-slate-400">hrs (@ ₹{r.otRate}/h)</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-600">
                      ₹{r.baseWage.toLocaleString('en-IN')}
                    </td>

                    <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                      ₹{(Number(r.computedWage) || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical Muster Sheets */}
      {attendanceHistory.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Recent Committed Site Musters</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {attendanceHistory.slice(0, 6).map((doc) => (
              <div
                key={doc.id || doc.docId}
                onClick={() => {
                  setSelectedSiteId(doc.siteId)
                  setAttendanceDate(doc.date)
                }}
                className="p-4 rounded-xl border border-slate-200/70 hover:border-blue-300 bg-slate-50/50 hover:bg-white transition-all cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">{doc.siteName}</span>
                  <span className="text-[11px] font-mono text-slate-400">{doc.date}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Headcount: {doc.headcount || (doc.presentCount + doc.halfDayCount)} workers</span>
                  <span className="font-bold text-emerald-700">₹{(Number(doc.totalWage) || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
