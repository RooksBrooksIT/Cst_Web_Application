import React, { useState, useEffect, useMemo } from 'react'
import {
  Wrench,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Building2,
  Calendar,
  X,
  UserCheck,
  AlertCircle,
  Truck,
  FileText,
  Printer,
  ShieldCheck,
  RefreshCw,
  QrCode,
  RotateCcw,
  Sliders,
  Check,
  AlertTriangle,
  ArrowRight,
  Boxes,
} from 'lucide-react'
import {
  fetchToolMovements,
  subscribeToolMovements,
  dispatchToolToSite,
  returnToolToCompany,
  recordToolReturn,
  fetchTools,
  subscribeTools,
  subscribeToolsAtCompany,
  subscribeToolsAtSite,
  generateToolCode,
} from '../../../services/toolService.js'
import { resolveSite, getNormalizedSiteOptions } from '../../../utils/siteUtils.js'

export default function ToolsMovements({ orgId, sites = [], currentUser, onNotify }) {
  const [movements, setMovements] = useState([])
  const [tools, setTools] = useState([])
  const [toolsAtCompany, setToolsAtCompany] = useState([])
  const [toolsAtSite, setToolsAtSite] = useState([])
  const [loading, setLoading] = useState(true)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'Dispatched' | 'Returned'
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL')

  // Dispatch / Movement Modal State
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [dispatchMode, setDispatchMode] = useState(0) // 0: Depot -> Site, 1: Site -> Site
  const [selectedToolCode, setSelectedToolCode] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [fromSiteId, setFromSiteId] = useState('') // for Mode 1
  const [dispatchQty, setDispatchQty] = useState('1')
  const [supervisorName, setSupervisorName] = useState('')
  const [driverName, setDriverName] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [dispatchNotes, setDispatchNotes] = useState('')
  const [submittingDispatch, setSubmittingDispatch] = useState(false)

  // Return Modal State
  const [returnMovement, setReturnMovement] = useState(null)
  const [returnCondition, setReturnCondition] = useState('Working') // 'Working' | 'Needs Service' | 'Damaged'
  const [returnNotes, setReturnNotes] = useState('')
  const [submittingReturn, setSubmittingReturn] = useState(false)

  // Gate Pass / Voucher Print Modal State
  const [selectedVoucher, setSelectedVoucher] = useState(null)

  // Live Firestore Subscriptions
  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    const unsubMoves = subscribeToolMovements(
      orgId,
      (data) => {
        setMovements(data || [])
        setLoading(false)
      },
      (err) => {
        console.error('ToolMovements error:', err)
        setLoading(false)
      }
    )

    const unsubTools = subscribeTools(
      orgId,
      (data) => setTools(data || []),
      (err) => console.error('Tools sub error:', err)
    )

    const unsubDepot = subscribeToolsAtCompany(
      orgId,
      (data) => setToolsAtCompany(data || []),
      (err) => console.error('Depot sub error:', err)
    )

    const unsubSite = subscribeToolsAtSite(
      orgId,
      (data) => setToolsAtSite(data || []),
      (err) => console.error('Site tools sub error:', err)
    )

    return () => {
      unsubMoves?.()
      unsubTools?.()
      unsubDepot?.()
      unsubSite?.()
    }
  }, [orgId])

  // Deduplicated and normalized site options
  const normalizedSites = useMemo(() => getNormalizedSiteOptions(sites), [sites])

  // Map depot availability by toolCode
  const depotStockMap = useMemo(() => {
    const map = {}
    toolsAtCompany.forEach((c) => {
      const code = c.toolCode || c.id
      map[code] = Number(c.availableCount || 0)
    })
    return map
  }, [toolsAtCompany])

  // Selected tool details for dispatch
  const selectedToolObj = useMemo(() => {
    if (!selectedToolCode) return null
    return (
      tools.find((t) => (t.toolCode || generateToolCode(t.toolName, t.toolOwner)) === selectedToolCode) ||
      toolsAtCompany.find((c) => (c.toolCode || c.id) === selectedToolCode)
    )
  }, [selectedToolCode, tools, toolsAtCompany])

  const availableInDepot = useMemo(() => {
    if (!selectedToolCode) return 0
    return depotStockMap[selectedToolCode] || 0
  }, [selectedToolCode, depotStockMap])

  // Auto fill supervisor when site is selected
  const handleSiteChange = (siteId) => {
    setSelectedSiteId(siteId)
    const siteObj = normalizedSites.find((s) => s.value === siteId) || resolveSite(siteId, '', sites)
    const sup = siteObj?.raw?.supervisorName || siteObj?.raw?.inCharge || siteObj?.raw?.supervisor
    if (sup) {
      setSupervisorName(sup)
    }
  }

  // Open Dispatch Modal
  const handleOpenDispatch = () => {
    setDispatchMode(0)
    if (toolsAtCompany.length > 0) {
      setSelectedToolCode(toolsAtCompany[0].toolCode || toolsAtCompany[0].id)
    } else if (tools.length > 0) {
      setSelectedToolCode(tools[0].toolCode || generateToolCode(tools[0].toolName, tools[0].toolOwner))
    }
    if (normalizedSites.length > 0) {
      handleSiteChange(normalizedSites[0].value)
      if (normalizedSites.length > 1) {
        setFromSiteId(normalizedSites[1].value)
      } else {
        setFromSiteId(normalizedSites[0].value)
      }
    }
    setDispatchQty('1')
    setDriverName('')
    setVehicleNumber('')
    setExpectedReturnDate('')
    setDispatchNotes('')
    setShowDispatchModal(true)
  }

  // Handle Dispatch Submit
  const handleDispatchSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!selectedToolCode) {
      onNotify?.('Please select an equipment model', 'error')
      return
    }
    if (!selectedSiteId) {
      onNotify?.('Please select a destination construction site', 'error')
      return
    }

    const qty = Number(dispatchQty) || 1
    if (dispatchMode === 0 && qty > availableInDepot) {
      onNotify?.(
        `Cannot dispatch ${qty} units. Central Yard only has ${availableInDepot} units available.`,
        'error'
      )
      return
    }

    setSubmittingDispatch(true)
    try {
      const targetSite = resolveSite(selectedSiteId, '', sites)
      const siteName = targetSite.siteName || targetSite.label || selectedSiteId
      const toolName = selectedToolObj?.toolName || selectedToolObj?.name || selectedToolCode

      let fromLoc = 'Central Yard Depot'
      let fromSiteIdVal = 'CENTRAL_DEPOT'
      let fromSiteNameVal = 'Central Yard Depot'
      let fromSiteCodeVal = 'DEPOT'

      if (dispatchMode === 1) {
        const fromSiteRes = resolveSite(fromSiteId, '', sites)
        fromLoc = fromSiteRes.label || fromSiteRes.siteName || fromSiteId
        fromSiteIdVal = fromSiteRes.siteId || fromSiteId
        fromSiteNameVal = fromSiteRes.siteName
        fromSiteCodeVal = fromSiteRes.siteCode
      }

      const payload = {
        movementType: dispatchMode === 0 ? 'CompanyToSite' : 'SiteToSite',
        fromLocation: fromLoc,
        fromSiteId: fromSiteIdVal,
        fromSiteName: fromSiteNameVal,
        fromSiteCode: fromSiteCodeVal,
        toSiteId: targetSite.siteId || selectedSiteId,
        toSiteCode: targetSite.siteCode || '',
        toSiteName: targetSite.siteName || siteName,
        projectName: targetSite.projectName || '',
        toolId: selectedToolObj?.id || selectedToolObj?.toolId || '',
        toolMasterDocId: selectedToolObj?.id || selectedToolObj?.toolId || '',
        toolCode: selectedToolCode,
        toolName,
        quantity: qty,
        supervisorName: supervisorName || targetSite.raw?.supervisorName || 'Site Supervisor',
        dispatchedBy: currentUser?.name || currentUser?.email || 'Operations Manager',
        driverName: driverName.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        expectedReturnDate: expectedReturnDate || null,
        notes: dispatchNotes.trim(),
      }

      await dispatchToolToSite(orgId, payload)

      onNotify?.(`Equipment "${toolName}" successfully dispatched to ${targetSite.label || siteName}!`, 'success')
      setShowDispatchModal(false)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to execute tool dispatch', 'error')
    } finally {
      setSubmittingDispatch(false)
    }
  }

  // Handle Return Submit
  const handleReturnSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !returnMovement) return

    setSubmittingReturn(true)
    try {
      const returnSiteRes = resolveSite(
        returnMovement.toSiteId || returnMovement.siteId || '',
        returnMovement.toSiteName || returnMovement.toSite || returnMovement.siteName || '',
        sites
      )

      await returnToolToCompany(orgId, {
        movementId: returnMovement.id || returnMovement.movementId,
        toolCode: returnMovement.toolCode || '',
        fromSiteId: returnSiteRes.siteId || returnMovement.toSiteId || '',
        fromSiteName: returnSiteRes.siteName || returnMovement.toSiteName || '',
        toolMasterDocId: returnMovement.toolId || '',
        quantity: returnMovement.quantity || 1,
        condition: returnCondition,
        receivedBy: currentUser?.name || currentUser?.email || 'Operations Manager',
        notes: returnNotes.trim(),
      })

      onNotify?.(
        `Equipment return logged! Condition marked as "${returnCondition}" and inventory replenished.`,
        'success'
      )
      setReturnMovement(null)
      setReturnNotes('')
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to log equipment return', 'error')
    } finally {
      setSubmittingReturn(false)
    }
  }

  // Filtered Movements List
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const toolName = (m.toolName || '').toLowerCase()
      const toolCode = (m.toolCode || '').toLowerCase()
      const siteName = (m.toSiteName || m.toSite || m.siteName || '').toLowerCase()
      const sup = (m.supervisorName || '').toLowerCase()
      const driver = (m.driverName || '').toLowerCase()
      const veh = (m.vehicleNumber || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch =
        !q ||
        toolName.includes(q) ||
        toolCode.includes(q) ||
        siteName.includes(q) ||
        sup.includes(q) ||
        driver.includes(q) ||
        veh.includes(q)

      const matchesStatus = statusFilter === 'ALL' || (m.status || 'Dispatched') === statusFilter
      const matchesType = movementTypeFilter === 'ALL' || (m.movementType || 'CompanyToSite') === movementTypeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [movements, searchQuery, statusFilter, movementTypeFilter])

  // Overview Metrics
  const activeDispatchesCount = useMemo(() => {
    return movements.filter((m) => (m.status || 'Dispatched') === 'Dispatched').length
  }, [movements])

  const returnedToYardCount = useMemo(() => {
    return movements.filter((m) => m.status === 'Returned').length
  }, [movements])

  const maintenanceAlertsCount = useMemo(() => {
    return movements.filter((m) => m.returnCondition === 'Needs Service' || m.returnCondition === 'Damaged').length
  }, [movements])

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/50">
              Custody Governance & Asset Movements
            </span>
            <span className="text-xs font-medium text-slate-400">• Mobile Synced Ledger</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tools Inventory Details</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain strict custody logs for machinery dispatched to site supervisors with return condition inspection audits.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenDispatch}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Dispatch Equipment to Site</span>
          </button>
        </div>
      </div>

      {/* Bento Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Field Custody</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-700 mt-2">{activeDispatchesCount}</p>
          <p className="text-[11px] text-blue-600/80 mt-0.5">Currently Operating on Sites</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Returned to Yard</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{returnedToYardCount}</p>
          <p className="text-[11px] text-emerald-600/80 mt-0.5">Successfully Re-inventoried</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Dispatch Vouchers</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{movements.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Immutable Audit Trail</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Service & Repairs</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{maintenanceAlertsCount}</p>
          <p className="text-[11px] text-amber-600/80 mt-0.5">Flagged During Return Inspection</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by equipment, site, supervisor, vehicle..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={movementTypeFilter}
            onChange={(e) => setMovementTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Movement Types</option>
            <option value="CompanyToSite">Company Depot → Site</option>
            <option value="SiteToSite">Site → Site Inter-Transfer</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="Dispatched">Currently in Field Custody</option>
            <option value="Returned">Returned to Yard</option>
          </select>

          <button
            onClick={() => {
              setSearchQuery('')
              setStatusFilter('ALL')
              setMovementTypeFilter('ALL')
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            title="Reset Filters"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Movements Table */}
      {loading && movements.length === 0 ? (
        <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          <p className="text-sm">Synchronizing equipment custody log...</p>
        </div>
      ) : filteredMovements.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <ArrowRightLeft className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No equipment movements found</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Dispatch Equipment to Site" to record handover of concrete mixers, vibrators, or power drills.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Equipment & Code</th>
                  <th className="py-3.5 px-4">Destination Site</th>
                  <th className="py-3.5 px-4">Custody In-Charge</th>
                  <th className="py-3.5 px-4">Transport Logistics</th>
                  <th className="py-3.5 px-4">Timeline</th>
                  <th className="py-3.5 px-4">Status & Inspection</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMovements.map((item) => {
                  const isDispatched = (item.status || 'Dispatched') === 'Dispatched'
                  const dispatchDate = item.dispatchDate?.seconds
                    ? new Date(item.dispatchDate.seconds * 1000).toLocaleDateString()
                    : item.date || 'Recent'

                  return (
                    <tr key={item.id || item.movementId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                            <Wrench className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{item.toolName}</p>
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              {item.toolCode || 'Asset Code'}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-2 font-semibold">Qty: {item.quantity || 1}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {(() => {
                          const toRes = resolveSite(
                            item.toSiteId || item.siteId,
                            item.toSiteName || item.toSite || item.siteName,
                            sites
                          )
                          const isFromDepot =
                            !item.fromSiteId ||
                            item.fromSiteId === 'CENTRAL_DEPOT' ||
                            item.from === 'Central Depot' ||
                            item.from === 'Central Yard Depot' ||
                            item.movementType === 'CompanyToSite'

                          const fromRes = isFromDepot
                            ? { label: 'Central Yard Depot', siteName: 'Central Yard Depot', siteCode: 'DEPOT' }
                            : resolveSite(item.fromSiteId || item.fromSite || item.from, '', sites)

                          return (
                            <div>
                              <div className="flex items-center gap-1.5 text-xs text-slate-800 font-medium">
                                <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>{toRes.siteName || 'Site'}</span>
                                {toRes.siteCode && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-100">
                                    {toRes.siteCode}
                                  </span>
                                )}
                              </div>
                              {toRes.projectName && (
                                <div className="text-[10px] text-slate-400 pl-5">
                                  Project: {toRes.projectName}
                                </div>
                              )}
                              <span className="text-[10px] text-slate-500 block mt-0.5 pl-5">
                                From: {fromRes.label || fromRes.siteName || item.from || 'Central Depot'}
                              </span>
                            </div>
                          )
                        })()}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-800">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-medium">{item.supervisorName || 'Site Supervisor'}</span>
                        </div>
                        {item.dispatchedBy && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">By: {item.dispatchedBy}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {item.vehicleNumber ? (
                          <div>
                            <div className="flex items-center gap-1 font-mono font-semibold text-slate-700">
                              <Truck className="w-3 h-3 text-slate-400" />
                              <span>{item.vehicleNumber}</span>
                            </div>
                            {item.driverName && <p className="text-[11px] text-slate-400">Driver: {item.driverName}</p>}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Self Handover</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        <p className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Out: {dispatchDate}</span>
                        </p>
                        {item.expectedReturnDate && isDispatched && (
                          <p className="text-amber-700 text-[11px] mt-0.5">
                            Due:{' '}
                            {new Date(
                              item.expectedReturnDate?.seconds
                                ? item.expectedReturnDate.seconds * 1000
                                : item.expectedReturnDate
                            ).toLocaleDateString()}
                          </p>
                        )}
                        {item.returnDate && (
                          <p className="text-emerald-700 text-[11px] font-medium mt-0.5">
                            Returned:{' '}
                            {new Date(
                              item.returnDate?.seconds ? item.returnDate.seconds * 1000 : item.returnDate
                            ).toLocaleDateString()}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isDispatched
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isDispatched ? 'bg-blue-500' : 'bg-emerald-500'
                            }`}
                          />
                          {item.status || 'Dispatched'}
                        </span>

                        {item.returnCondition && (
                          <div className="mt-1">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                item.returnCondition === 'Working'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : item.returnCondition === 'Needs Service'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-rose-50 text-rose-800'
                              }`}
                            >
                              Condition: {item.returnCondition}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedVoucher(item)}
                            className="p-1.5 text-slate-500 hover:text-[#0B3470] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Print Gate Pass / Voucher"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {isDispatched && (
                            <button
                              onClick={() => {
                                setReturnMovement(item)
                                setReturnCondition('Working')
                                setReturnNotes('')
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Log Return
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DISPATCH / MOVEMENT MODAL */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Dispatch Equipment to Site</h3>
                <p className="text-xs text-slate-500">Authorize physical custody transfer to field site supervisor.</p>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setDispatchMode(0)}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  dispatchMode === 0 ? 'bg-white text-[#0B3470] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Depot → Site Dispatch
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode(1)}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  dispatchMode === 1 ? 'bg-white text-[#0B3470] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Site → Site Inter-Transfer
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              {/* Equipment Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Select Equipment / Tool *
                  </label>
                  {dispatchMode === 0 && (
                    <span className="text-xs font-semibold text-emerald-700">
                      Yard Stock: {availableInDepot} available
                    </span>
                  )}
                </div>
                <select
                  required
                  value={selectedToolCode}
                  onChange={(e) => setSelectedToolCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select Equipment Model...</option>
                  {tools.map((t) => {
                    const code = t.toolCode || generateToolCode(t.toolName, t.toolOwner)
                    const avail = depotStockMap[code] || 0
                    return (
                      <option key={t.id || t.toolId} value={code}>
                        {t.toolName || t.name} [{code}] — Yard Available: {avail}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Quantity to Dispatch *
                </label>
                <input
                  type="number"
                  min="1"
                  max={dispatchMode === 0 ? Math.max(availableInDepot, 1) : 99}
                  required
                  value={dispatchQty}
                  onChange={(e) => setDispatchQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Source Site if Mode 1 */}
              {dispatchMode === 1 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Source Site (From) *
                  </label>
                  <select
                    required
                    value={fromSiteId}
                    onChange={(e) => setFromSiteId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select Source Site...</option>
                    {normalizedSites.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Destination Site */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Site (To) *
                </label>
                <select
                  required
                  value={selectedSiteId}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select Target Construction Site...</option>
                  {normalizedSites.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custody Supervisor & Expected Return Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Custody In-Charge
                  </label>
                  <input
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    placeholder="Supervisor Name"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Expected Return Date
                  </label>
                  <input
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* Driver & Vehicle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Driver / Operator Name
                  </label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="e.g. KA-04-TR-9988"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Dispatch Directives / Notes
                </label>
                <textarea
                  rows="2"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="e.g. Supplied with 2 spare hoses, fuel tank full, safety guards mounted."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* CTAs */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDispatch || (dispatchMode === 0 && availableInDepot <= 0)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingDispatch ? 'Dispatching...' : 'Authorize Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RETURN LOG MODAL */}
      {returnMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Log Equipment Return</h3>
                <p className="text-xs text-slate-500">Acknowledge physical receipt and inspect asset condition.</p>
              </div>
              <button
                onClick={() => setReturnMovement(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-4">
              {(() => {
                const retSiteRes = resolveSite(
                  returnMovement.toSiteId || returnMovement.siteId,
                  returnMovement.toSiteName || returnMovement.toSite || returnMovement.siteName,
                  sites
                )
                return (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <p className="font-semibold text-slate-900 text-sm">{returnMovement.toolName}</p>
                    <p className="text-slate-500 font-mono mt-0.5">{returnMovement.toolCode || 'Asset Code'}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 text-slate-600">
                      <span>Returning from: <strong className="text-slate-800">{retSiteRes.label}</strong></span>
                      <span className="font-semibold">Qty: {returnMovement.quantity || 1}</span>
                    </div>
                  </div>
                )
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Inspection Condition *
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="cond"
                      value="Working"
                      checked={returnCondition === 'Working'}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      className="text-blue-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Good / Fully Functional</span>
                      <p className="text-[11px] text-slate-500">Asset is ready for immediate redeployment from Yard.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="cond"
                      value="Needs Service"
                      checked={returnCondition === 'Needs Service'}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      className="text-amber-600"
                    />
                    <div>
                      <span className="font-semibold text-amber-800">Needs Routine Servicing / Lubrication</span>
                      <p className="text-[11px] text-slate-500">Route to maintenance bay before next dispatch.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="cond"
                      value="Damaged"
                      checked={returnCondition === 'Damaged'}
                      onChange={(e) => setReturnCondition(e.target.value)}
                      className="text-rose-600"
                    />
                    <div>
                      <span className="font-semibold text-rose-800">Damaged / Broken Part / Scrap</span>
                      <p className="text-[11px] text-slate-500">Flag for repair estimation or rental claim.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Inspection Remarks / Service Notes
                </label>
                <textarea
                  rows="2"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="e.g. Engine oil level low, spark plug cleaned, power cord intact."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturnMovement(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingReturn ? 'Logging Return...' : 'Acknowledge Yard Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GATE PASS / MOVEMENT VOUCHER PRINT MODAL */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#0B3470]">
                  Official Equipment Gate Pass
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">Machinery Movement Voucher</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B3470] text-white text-xs font-semibold rounded-lg hover:bg-[#082855] cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Gate Pass</span>
                </button>
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Voucher Body */}
            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Voucher Reference #</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">
                    {selectedVoucher.movementId || selectedVoucher.id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Movement Type</span>
                  <span className="font-semibold text-slate-800">
                    {selectedVoucher.movementType === 'CompanyToSite' ? 'Central Yard → Site Dispatch' : 'Inter-Site Transfer'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Dispatch Date</span>
                  <span className="font-semibold text-slate-800">
                    {selectedVoucher.dispatchDate?.seconds
                      ? new Date(selectedVoucher.dispatchDate.seconds * 1000).toLocaleString()
                      : selectedVoucher.date || 'Today'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Dispatched By</span>
                  <span className="font-semibold text-slate-800">
                    {selectedVoucher.dispatchedBy || 'Operations Lead'}
                  </span>
                </div>
              </div>

              {/* Equipment Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Equipment Specification</th>
                      <th className="py-2.5 px-3">Canonical Code</th>
                      <th className="py-2.5 px-3 text-center">Quantity</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3 px-3 font-semibold text-slate-900">{selectedVoucher.toolName}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{selectedVoucher.toolCode || 'Asset Code'}</td>
                      <td className="py-3 px-3 text-center font-bold text-slate-900">{selectedVoucher.quantity || 1}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded text-[11px]">
                          {selectedVoucher.status || 'Dispatched'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Logistics & Locations */}
              {(() => {
                const voucherToRes = resolveSite(
                  selectedVoucher.toSiteId || selectedVoucher.siteId,
                  selectedVoucher.toSiteName || selectedVoucher.toSite || selectedVoucher.siteName,
                  sites
                )
                const isVoucherFromDepot =
                  !selectedVoucher.fromSiteId ||
                  selectedVoucher.fromSiteId === 'CENTRAL_DEPOT' ||
                  selectedVoucher.from === 'Central Depot' ||
                  selectedVoucher.from === 'Central Yard Depot' ||
                  selectedVoucher.movementType === 'CompanyToSite'

                const voucherFromRes = isVoucherFromDepot
                  ? { label: 'Central Yard Depot' }
                  : resolveSite(selectedVoucher.fromSiteId || selectedVoucher.fromSite || selectedVoucher.from, '', sites)

                return (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                      <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                        Custody & Destination
                      </span>
                      <p><strong className="text-slate-600">To Site:</strong> {voucherToRes.label}</p>
                      {voucherToRes.projectName && (
                        <p><strong className="text-slate-600">Project:</strong> {voucherToRes.projectName}</p>
                      )}
                      <p><strong className="text-slate-600">Supervisor:</strong> {selectedVoucher.supervisorName}</p>
                      <p><strong className="text-slate-600">From Origin:</strong> {voucherFromRes.label || selectedVoucher.from || 'Central Depot'}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                      <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                        Transport Details
                      </span>
                      <p><strong className="text-slate-600">Vehicle:</strong> {selectedVoucher.vehicleNumber || 'Self Transfer'}</p>
                      <p><strong className="text-slate-600">Driver:</strong> {selectedVoucher.driverName || 'N/A'}</p>
                      <p><strong className="text-slate-600">Notes:</strong> {selectedVoucher.notes || 'None'}</p>
                    </div>
                  </div>
                )
              })()}

              {/* Sign-off Blocks */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-500">
                <div>
                  <div className="h-10 border-b border-slate-300 mb-1" />
                  <span>Dispatched By (Yard In-Charge)</span>
                </div>
                <div>
                  <div className="h-10 border-b border-slate-300 mb-1" />
                  <span>Transported By (Driver)</span>
                </div>
                <div>
                  <div className="h-10 border-b border-slate-300 mb-1" />
                  <span>Received By (Site Supervisor)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
