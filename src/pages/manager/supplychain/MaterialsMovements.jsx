import React, { useState, useEffect, useMemo } from 'react'
import {
  Truck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Printer,
  FileCheck,
  Building2,
  Phone,
  Calendar,
  X,
  ShieldCheck,
  Boxes,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Warehouse,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import {
  fetchMaterialTransactions,
  subscribeMaterialTransactions,
  fetchMaterials,
  fetchMaterialsAvailability,
  fetchSiteMaterialPool,
  dispatchMaterialsToSite,
  transferMaterialSiteToSite,
  returnMaterialSiteToCompany,
  confirmMaterialMovementReceipt,
} from '../../../services/materialService.js'
import { resolveSite, getNormalizedSiteOptions, isSameSite } from '../../../utils/siteUtils.js'

export default function MaterialsMovements({ orgId, sites = [], currentUser, onNotify }) {
  const [movements, setMovements] = useState([])
  const [materials, setMaterials] = useState([])
  const [warehouseStock, setWarehouseStock] = useState([])
  const [sitePools, setSitePools] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL') // 'ALL' | 'CompanyToSite' | 'SiteToSite' | 'SiteToCompany'

  // Deduplicated Normalized Sites
  const normalizedSites = useMemo(() => {
    return getNormalizedSiteOptions(sites)
  }, [sites])

  // Dispatch Engine Modal State
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  // Mode: 0 = Company to Site | 1 = Site to Site | 2 = Site to Company
  const [dispatchMode, setDispatchMode] = useState(0)

  // Mode 0 & Mode 1 / 2 Form Fields
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [fromSiteId, setFromSiteId] = useState('')
  const [toSiteId, setToSiteId] = useState('')
  const [challanNumber, setChallanNumber] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [transporterName, setTransporterName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [supervisorName, setSupervisorName] = useState('')

  // Multi-Item Queue for Mode 0
  const [queueItems, setQueueItems] = useState([])
  const [queueMatId, setQueueMatId] = useState('')
  const [queueQty, setQueueQty] = useState('')
  const [submittingDispatch, setSubmittingDispatch] = useState(false)

  // Single Item for Mode 1 & Mode 2
  const [singleMatName, setSingleMatName] = useState('')
  const [singleQty, setSingleQty] = useState('')

  // Gate Pass Preview / Print Modal
  const [printPassDoc, setPrintPassDoc] = useState(null)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [moves, mats, avail, pools] = await Promise.all([
        fetchMaterialTransactions(orgId),
        fetchMaterials(orgId),
        fetchMaterialsAvailability(orgId),
        fetchSiteMaterialPool(orgId),
      ])
      setMovements(moves || [])
      setMaterials(mats || [])
      setWarehouseStock(avail || [])
      setSitePools(pools || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load material movements', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    if (!orgId) return
    const unsub = subscribeMaterialTransactions(orgId, (data) => {
      if (data) setMovements(data)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [orgId])

  // Central warehouse availability lookup map
  const warehouseAvailMap = useMemo(() => {
    const map = {}
    warehouseStock.forEach((w) => {
      const name = (w.materialName || '').toLowerCase()
      map[name] = Number(w.companyAvailableCount ?? w.availableCount) || 0
    })
    return map
  }, [warehouseStock])

  // Currently selected item stock in warehouse (for Mode 0 queue addition)
  const currentSelectedMatAvailable = useMemo(() => {
    if (!queueMatId) return 0
    const mat = materials.find((m) => (m.id || m.materialId) === queueMatId)
    if (!mat) return 0
    const name = (mat.materialName || mat.name || '').toLowerCase()
    return warehouseAvailMap[name] ?? Number(mat.currentTotalStock ?? 0)
  }, [queueMatId, materials, warehouseAvailMap])

  // Site pool stock lookup (for Mode 1 & 2) - checking isSameSite and reading dual fields
  const fromSiteAvailableStock = useMemo(() => {
    if (!fromSiteId || !singleMatName) return 0
    const pool = sitePools.find((p) => {
      const isMat = (p.materialName || '').trim().toLowerCase() === singleMatName.trim().toLowerCase()
      if (!isMat) return false
      return isSameSite(p.siteId || p.id, fromSiteId, sites)
    })
    return Number(pool?.availableCount ?? pool?.currentBalance ?? pool?.count ?? 0)
  }, [fromSiteId, singleMatName, sitePools, sites])

  const handleOpenDispatchModal = () => {
    if (normalizedSites.length > 0) {
      const firstId = normalizedSites[0].siteId || normalizedSites[0].id
      setSelectedSiteId(firstId)
      setFromSiteId(firstId)
      if (normalizedSites.length > 1) {
        setToSiteId(normalizedSites[1].siteId || normalizedSites[1].id)
      }
    }
    if (materials.length > 0) {
      setQueueMatId(materials[0].id || materials[0].materialId)
      setSingleMatName(materials[0].materialName || materials[0].name)
    }
    setQueueItems([])
    setQueueQty('')
    setSingleQty('')
    setChallanNumber(`DC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`)
    setVehicleNumber('')
    setTransporterName('')
    setDriverPhone('')
    setShowDispatchModal(true)
  }

  // Add Item to Mode 0 Queue
  const handleAddToQueue = () => {
    if (!queueMatId || !queueQty) return
    const mat = materials.find((m) => (m.id || m.materialId) === queueMatId)
    if (!mat) return

    const qty = Number(queueQty)
    if (qty <= 0) {
      onNotify?.('Quantity must be greater than 0', 'error')
      return
    }

    if (qty > currentSelectedMatAvailable) {
      onNotify?.(
        `Cannot dispatch ${qty} units. Central Warehouse only has ${currentSelectedMatAvailable} available.`,
        'error'
      )
      return
    }

    // Check if already in queue
    const existingIndex = queueItems.findIndex((item) => item.materialId === (mat.id || mat.materialId))
    if (existingIndex >= 0) {
      const updated = [...queueItems]
      updated[existingIndex].quantity += qty
      setQueueItems(updated)
    } else {
      setQueueItems([
        ...queueItems,
        {
          materialId: mat.id || mat.materialId,
          materialName: mat.materialName || mat.name,
          quantity: qty,
          unit: mat.materialUnit || mat.unitName || mat.unit || 'Units',
          unitPrice: Number(mat.unitPrice || mat.standardRate || 0),
        },
      ])
    }

    setQueueQty('')
  }

  const handleRemoveFromQueue = (index) => {
    setQueueItems(queueItems.filter((_, i) => i !== index))
  }

  // Submit Dispatch Engine Actions
  const handleExecuteDispatch = async (e) => {
    e.preventDefault()
    if (!orgId) return

    setSubmittingDispatch(true)
    try {
      const managerName = currentUser?.name || currentUser?.fullName || 'Operations Manager'

      if (dispatchMode === 0) {
        // Mode 0: Central Warehouse -> Site
        if (queueItems.length === 0) {
          onNotify?.('Add at least one material to the dispatch queue', 'error')
          setSubmittingDispatch(false)
          return
        }

        const targetSite = normalizedSites.find((s) => s.siteId === selectedSiteId || s.id === selectedSiteId)
        await dispatchMaterialsToSite(orgId, {
          toSiteId: targetSite?.siteId || selectedSiteId,
          toSiteCode: targetSite?.siteCode || '',
          toSiteName: targetSite?.siteName || targetSite?.label || selectedSiteId,
          projectName: targetSite?.projectName || targetSite?.siteName || '',
          managerName,
          supervisorName: supervisorName || 'Site Supervisor',
          vehicleNumber,
          transporterName,
          driverPhone,
          challanNumber,
          items: queueItems,
        })

        onNotify?.('Material dispatch successfully executed and stock updated!', 'success')
      } else if (dispatchMode === 1) {
        // Mode 1: Site -> Site Inter-Site Transfer
        if (!fromSiteId || !toSiteId) {
          onNotify?.('Select both source and target sites', 'error')
          setSubmittingDispatch(false)
          return
        }
        if (fromSiteId === toSiteId) {
          onNotify?.('Source and Destination sites must be different', 'error')
          setSubmittingDispatch(false)
          return
        }

        const qty = Number(singleQty)
        if (qty <= 0) {
          onNotify?.('Quantity must be greater than 0', 'error')
          setSubmittingDispatch(false)
          return
        }
        if (qty > fromSiteAvailableStock) {
          onNotify?.(`Source site only has ${fromSiteAvailableStock} units available.`, 'error')
          setSubmittingDispatch(false)
          return
        }

        const fromSite = normalizedSites.find((s) => s.siteId === fromSiteId || s.id === fromSiteId)
        const toSite = normalizedSites.find((s) => s.siteId === toSiteId || s.id === toSiteId)
        const mat = materials.find((m) => (m.materialName || m.name) === singleMatName)

        await transferMaterialSiteToSite(orgId, {
          fromSiteId: fromSite?.siteId || fromSiteId,
          fromSiteName: fromSite?.siteName || fromSite?.label || fromSiteId,
          toSiteId: toSite?.siteId || toSiteId,
          toSiteCode: toSite?.siteCode || '',
          toSiteName: toSite?.siteName || toSite?.label || toSiteId,
          projectName: toSite?.projectName || toSite?.siteName || '',
          materialName: singleMatName,
          quantity: qty,
          unit: mat?.materialUnit || mat?.unitName || mat?.unit || 'Bags',
          unitPrice: Number(mat?.unitPrice || mat?.standardRate || 0),
          managerName,
          vehicleNumber,
          challanNumber,
        })

        onNotify?.('Inter-site material transfer completed successfully!', 'success')
      } else if (dispatchMode === 2) {
        // Mode 2: Site -> Company Warehouse Return
        const qty = Number(singleQty)
        if (qty <= 0) {
          onNotify?.('Quantity must be greater than 0', 'error')
          setSubmittingDispatch(false)
          return
        }
        if (qty > fromSiteAvailableStock) {
          onNotify?.(`Site only has ${fromSiteAvailableStock} units available to return.`, 'error')
          setSubmittingDispatch(false)
          return
        }

        const fromSite = normalizedSites.find((s) => s.siteId === fromSiteId || s.id === fromSiteId)
        const mat = materials.find((m) => (m.materialName || m.name) === singleMatName)

        await returnMaterialSiteToCompany(orgId, {
          fromSiteId: fromSite?.siteId || fromSiteId,
          fromSiteName: fromSite?.siteName || fromSite?.label || fromSiteId,
          materialName: singleMatName,
          quantity: qty,
          unit: mat?.materialUnit || mat?.unitName || mat?.unit || 'Bags',
          unitPrice: Number(mat?.unitPrice || mat?.standardRate || 0),
          managerName,
          vehicleNumber,
          challanNumber,
        })

        onNotify?.('Surplus material returned to Central Warehouse stock!', 'success')
      }

      setShowDispatchModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Dispatch execution failed', 'error')
    } finally {
      setSubmittingDispatch(false)
    }
  }

  const handleConfirmReceipt = async (movementId) => {
    if (!orgId || !movementId) return
    try {
      await confirmMaterialMovementReceipt(orgId, movementId, currentUser)
      onNotify?.('Delivery challan acknowledged and marked as received!', 'success')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to confirm receipt', 'error')
    }
  }

  // Filtered transactions
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matName = (m.materialName || '').toLowerCase()
      const gp = (m.gatePassNumber || m.challanNumber || m.transactionId || '').toLowerCase()
      const toSite = (m.toSiteName || m.toSite || '').toLowerCase()
      const fromSite = (m.fromSite || m.from || '').toLowerCase()

      const matchesSearch =
        matName.includes(searchQuery.toLowerCase()) ||
        gp.includes(searchQuery.toLowerCase()) ||
        toSite.includes(searchQuery.toLowerCase()) ||
        fromSite.includes(searchQuery.toLowerCase())

      const matchesType = typeFilter === 'ALL' || m.transactionType === typeFilter
      return matchesSearch && matchesType
    })
  }, [movements, searchQuery, typeFilter])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0B3470] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
              Logistics & Movements Engine
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Material Information</h1>
          <p className="text-sm text-slate-500 mt-1">
            Multi-mode dispatch engine for Warehouse-to-Site transfers, Inter-Site transfers, and Central Depot returns.
          </p>
        </div>

        <button
          onClick={handleOpenDispatchModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Launch Dispatch Engine</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by challan #, material, site..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Transfer Mode:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Dispatches ({movements.length})</option>
            <option value="CompanyToSite">Company → Site Dispatch</option>
            <option value="SiteToSite">Site → Site Transfer</option>
            <option value="SiteToCompany">Site → Company Return</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      {loading && movements.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading material dispatches...</div>
      ) : filteredMovements.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No material transactions recorded</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Launch Dispatch Engine" to authorize shipment between central godowns and project sites.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Challan / GP #</th>
                  <th className="py-3.5 px-4">Dispatched Material</th>
                  <th className="py-3.5 px-4">Route & Mode</th>
                  <th className="py-3.5 px-4">Transit Logistics</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMovements.map((item) => {
                  const isInTransit = item.receivedStatus === 'In Transit'
                  const modeType = item.transactionType || 'CompanyToSite'

                  return (
                    <tr key={item.id || item.transactionId || item.movementId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-blue-900 text-xs bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {item.gatePassNumber || item.challanNumber || item.transactionId}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">{item.date || 'Today'}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <Boxes className="w-4 h-4 text-teal-600" />
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{item.materialName}</p>
                            <p className="text-xs text-slate-600 font-bold">
                              {item.quantity} {item.unit || 'Units'}{' '}
                              {item.totalValue ? (
                                <span className="text-slate-400 font-normal">
                                  (₹{Number(item.totalValue).toLocaleString('en-IN')})
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-0.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              modeType === 'CompanyToSite'
                                ? 'bg-blue-100 text-blue-800'
                                : modeType === 'SiteToSite'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {modeType === 'CompanyToSite'
                              ? 'Warehouse → Site'
                              : modeType === 'SiteToSite'
                              ? 'Site → Site'
                              : 'Site → Warehouse'}
                          </span>
                          {(() => {
                            const resFrom = resolveSite(item.fromSiteId || item.fromSite || item.from, item.fromSite || item.from, sites)
                            const resTo = resolveSite(item.toSiteId || item.toSite, item.toSiteName || item.toSite, sites)
                            return (
                              <>
                                <p className="text-slate-500 font-medium mt-0.5">
                                  From: <span className="font-semibold text-slate-800">{resFrom.label}</span>
                                  {resFrom.siteCode && (
                                    <span className="ml-1 px-1 py-0.2 rounded text-[10px] bg-slate-100 font-mono text-slate-600">
                                      {resFrom.siteCode}
                                    </span>
                                  )}
                                </p>
                                <p className="font-bold text-slate-900">
                                  To: <span>{resTo.label}</span>
                                  {resTo.siteCode && (
                                    <span className="ml-1 px-1 py-0.2 rounded text-[10px] bg-blue-50 text-blue-700 font-mono">
                                      {resTo.siteCode}
                                    </span>
                                  )}
                                </p>
                              </>
                            )
                          })()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800">{item.vehicleNumber || 'Site Fleet'}</p>
                          <p className="text-slate-400">
                            {item.transporterName || 'Internal Fleet'} {item.driverPhone && `• ${item.driverPhone}`}
                          </p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isInTransit
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isInTransit ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                            }`}
                          />
                          {item.receivedStatus || 'Delivered'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setPrintPassDoc(item)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Print / View Delivery Challan"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {isInTransit && (
                            <button
                              onClick={() => handleConfirmReceipt(item.id || item.transactionId || item.movementId)}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                              title="Acknowledge Delivery Receipt"
                            >
                              Confirm Receipt
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

      {/* ======================================================================================= */}
      {/* MULTI-MODE DISPATCH ENGINE MODAL */}
      {/* ======================================================================================= */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Material Dispatch & Logistics Engine</h3>
                <p className="text-xs text-slate-500">
                  Select transfer pathway, allocate stock, and issue delivery challan.
                </p>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs (Mode 0 / 1 / 2) */}
            <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDispatchMode(0)}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  dispatchMode === 0 ? 'bg-white text-[#0B3470] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mode 0: Depot → Site
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode(1)}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  dispatchMode === 1 ? 'bg-white text-[#0B3470] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mode 1: Site → Site
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode(2)}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  dispatchMode === 2 ? 'bg-white text-[#0B3470] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mode 2: Site → Depot
              </button>
            </div>

            <form onSubmit={handleExecuteDispatch} className="space-y-4">
              {/* MODE 0: COMPANY WAREHOUSE -> SITE (Multi-Item Queue) */}
              {dispatchMode === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Dispatch Origin
                      </label>
                      <input
                        type="text"
                        disabled
                        value="Central Warehouse / Main Depot"
                        className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Destination Site *
                      </label>
                      <select
                        required
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold"
                      >
                        {normalizedSites.map((s) => (
                          <option key={s.id} value={s.siteId || s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Multi-Item Queue Adder */}
                  <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Add Materials to Dispatch Queue
                      </span>
                      <span className="text-xs text-blue-900 font-medium">
                        Depot Available:{' '}
                        <strong className="text-blue-900">{currentSelectedMatAvailable} units</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-7">
                        <select
                          value={queueMatId}
                          onChange={(e) => setQueueMatId(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                        >
                          {materials.map((m) => (
                            <option key={m.id || m.materialId} value={m.id || m.materialId}>
                              {m.materialName || m.name} ({m.materialUnit || m.unit || 'Units'})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min="1"
                          value={queueQty}
                          onChange={(e) => setQueueQty(e.target.value)}
                          placeholder="Qty"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold"
                        />
                      </div>

                      <div className="col-span-2">
                        <button
                          type="button"
                          onClick={handleAddToQueue}
                          className="w-full py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                        >
                          + Queue
                        </button>
                      </div>
                    </div>

                    {/* Active Queue Table */}
                    {queueItems.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mt-2">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600">
                            <tr>
                              <th className="py-2 px-3">Item</th>
                              <th className="py-2 px-3">Quantity</th>
                              <th className="py-2 px-3">Est. Value</th>
                              <th className="py-2 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {queueItems.map((item, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3 font-semibold text-slate-900">{item.materialName}</td>
                                <td className="py-2 px-3 font-bold text-slate-900">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  ₹{(item.quantity * item.unitPrice).toLocaleString('en-IN')}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromQueue(idx)}
                                    className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MODE 1: SITE TO SITE TRANSFER */}
              {dispatchMode === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
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
                        {normalizedSites.map((s) => (
                          <option key={s.id} value={s.siteId || s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Destination Site (To) *
                      </label>
                      <select
                        required
                        value={toSiteId}
                        onChange={(e) => setToSiteId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        {normalizedSites.map((s) => (
                          <option key={s.id} value={s.siteId || s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Material Item *
                      </label>
                      <select
                        value={singleMatName}
                        onChange={(e) => setSingleMatName(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        {materials.map((m) => (
                          <option key={m.id || m.materialId} value={m.materialName || m.name}>
                            {m.materialName || m.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Available at Source Site: <strong>{fromSiteAvailableStock} units</strong>
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Transfer Quantity *
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={singleQty}
                        onChange={(e) => setSingleQty(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 2: SITE TO COMPANY RETURN */}
              {dispatchMode === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Surplus Source Site *
                      </label>
                      <select
                        required
                        value={fromSiteId}
                        onChange={(e) => setFromSiteId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        {normalizedSites.map((s) => (
                          <option key={s.id} value={s.siteId || s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Return Destination
                      </label>
                      <input
                        type="text"
                        disabled
                        value="Central Warehouse / Main Godown"
                        className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Material Item *
                      </label>
                      <select
                        value={singleMatName}
                        onChange={(e) => setSingleMatName(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        {materials.map((m) => (
                          <option key={m.id || m.materialId} value={m.materialName || m.name}>
                            {m.materialName || m.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Available at Site: <strong>{fromSiteAvailableStock} units</strong>
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Return Quantity *
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={singleQty}
                        onChange={(e) => setSingleQty(e.target.value)}
                        placeholder="e.g. 20"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Common Logistics Details */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Challan / Gate Pass #
                  </label>
                  <input
                    type="text"
                    value={challanNumber}
                    onChange={(e) => setChallanNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono"
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
                    placeholder="KA-04-AB-1234"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl uppercase font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Driver Contact
                  </label>
                  <input
                    type="tel"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="+91 98450 XXXXX"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDispatch}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingDispatch ? 'Authorizing & Updating Stock...' : 'Authorize Dispatch & Print Challan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* PRINTABLE DELIVERY GATE PASS / CHALLAN MODAL */}
      {/* ======================================================================================= */}
      {printPassDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-slate-300 print:m-0 print:border-none">
            {/* Gate Pass Header */}
            <div className="border-b-2 border-slate-900 pb-4 mb-5 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4" />
                  <span>eBricks Enterprise Logistics</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">MATERIAL DELIVERY CHALLAN</h2>
                <p className="text-xs text-slate-500 font-mono">
                  Pass No: {printPassDoc.gatePassNumber || printPassDoc.challanNumber || printPassDoc.transactionId}
                </p>
              </div>
              <button
                onClick={() => setPrintPassDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-600 print:hidden cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Dispatch Origin</p>
                  <p className="font-bold text-slate-900 mt-0.5">{printPassDoc.from || printPassDoc.fromSite}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Destination Site</p>
                  <p className="font-bold text-slate-900 mt-0.5">{printPassDoc.toSiteName || printPassDoc.toSite}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-[11px] font-bold text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Item Description</th>
                      <th className="py-2 px-3 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3 px-3 font-semibold text-slate-900">{printPassDoc.materialName}</td>
                      <td className="py-3 px-3 text-right font-black text-slate-900">
                        {printPassDoc.quantity} {printPassDoc.unit}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="text-slate-400 text-[11px]">Vehicle:</span>{' '}
                  <span className="font-bold text-slate-800">{printPassDoc.vehicleNumber || 'Site Fleet'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Driver Phone:</span>{' '}
                  <span className="font-bold text-slate-800">{printPassDoc.driverPhone || 'N/A'}</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200">
                <div className="text-center border-t border-dashed border-slate-300 pt-2">
                  <p className="font-semibold text-slate-800">Dispatched By</p>
                  <p className="text-[10px] text-slate-400">{printPassDoc.managerName || 'Store Incharge'}</p>
                </div>
                <div className="text-center border-t border-dashed border-slate-300 pt-2">
                  <p className="font-semibold text-slate-800">Receiver Site Sign</p>
                  <p className="text-[10px] text-slate-400">Site Supervisor Signature</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B3470] text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Delivery Challan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
