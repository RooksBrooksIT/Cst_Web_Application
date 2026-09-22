import React, { useState, useEffect, useMemo } from 'react'
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Search,
  ShoppingCart,
  Building2,
  Calendar,
  X,
  Plus,
  Warehouse,
  ArrowUpRight,
  Eye,
  Layers,
} from 'lucide-react'
import {
  fetchMaterials,
  fetchMaterialsAvailability,
  subscribeMaterialsAvailability,
  fetchSiteMaterialPool,
  subscribeAllSiteMaterialPools,
  createMaterialRequest,
} from '../../../services/materialService.js'

export default function MaterialsStock({ orgId, sites = [], currentUser, onNotify }) {
  const [materials, setMaterials] = useState([])
  const [warehouseStock, setWarehouseStock] = useState([])
  const [sitePools, setSitePools] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterState, setFilterState] = useState('ALL') // 'ALL' | 'LOW' | 'OUT'

  // Requisition Modal
  const [requisitionMaterial, setRequisitionMaterial] = useState(null)
  const [reqSiteId, setReqSiteId] = useState('')
  const [reqQty, setReqQty] = useState('')
  const [reqUrgency, setReqUrgency] = useState('Normal')
  const [submittingReq, setSubmittingReq] = useState(false)

  // Site Allocation Breakdown Modal
  const [inspectMaterial, setInspectMaterial] = useState(null)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [mats, avail, pools] = await Promise.all([
        fetchMaterials(orgId),
        fetchMaterialsAvailability(orgId),
        fetchSiteMaterialPool(orgId),
      ])
      setMaterials(mats || [])
      setWarehouseStock(avail || [])
      setSitePools(pools || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load stock telemetry', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    if (!orgId) return
    const unsubAvail = subscribeMaterialsAvailability(orgId, (data) => {
      if (data) setWarehouseStock(data)
    })
    const unsubPools = subscribeAllSiteMaterialPools(orgId, (data) => {
      if (data) setSitePools(data)
    })

    return () => {
      if (typeof unsubAvail === 'function') unsubAvail()
      if (typeof unsubPools === 'function') unsubPools()
    }
  }, [orgId])

  // Combine Master Materials with Live Central Warehouse stock and Site Pool Aggregates
  const consolidatedTelemetry = useMemo(() => {
    return materials.map((m) => {
      const name = m.materialName || m.name || ''
      const cleanName = name.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')

      // 1. Central Warehouse Available Stock
      const availDoc = warehouseStock.find(
        (w) =>
          (w.materialName || '').toLowerCase() === name.toLowerCase() ||
          w.id === cleanName
      )
      const centralQty = Number(availDoc?.availableCount ?? m.currentTotalStock ?? m.currentStock ?? 0)

      // 2. Aggregate On-Site Distributed Stock
      const matchedPools = sitePools.filter(
        (p) => (p.materialName || '').toLowerCase() === name.toLowerCase()
      )
      const siteTotalAllocated = matchedPools.reduce((acc, p) => acc + (Number(p.currentBalance) || 0), 0)
      const totalOrgStock = centralQty + siteTotalAllocated

      const minReorder = Number(m.minReorderLevel || 20)
      const unitStr = m.materialUnit || m.unitName || m.unit || 'Units'
      const unitPrice = Number(m.unitPrice || m.standardRate || 0)

      return {
        ...m,
        materialName: name,
        centralQty: Math.max(0, centralQty),
        siteTotalAllocated: Math.max(0, siteTotalAllocated),
        totalOrgStock: Math.max(0, totalOrgStock),
        minReorder,
        unitStr,
        unitPrice,
        siteBreakdown: matchedPools,
      }
    })
  }, [materials, warehouseStock, sitePools])

  // Computed metrics
  const totalCentralWarehouseUnits = useMemo(() => {
    return consolidatedTelemetry.reduce((acc, m) => acc + m.centralQty, 0)
  }, [consolidatedTelemetry])

  const totalOnSiteUnits = useMemo(() => {
    return consolidatedTelemetry.reduce((acc, m) => acc + m.siteTotalAllocated, 0)
  }, [consolidatedTelemetry])

  const lowStockItems = useMemo(() => {
    return consolidatedTelemetry.filter((m) => m.centralQty <= m.minReorder && m.centralQty > 0)
  }, [consolidatedTelemetry])

  const outOfStockItems = useMemo(() => {
    return consolidatedTelemetry.filter((m) => m.centralQty <= 0)
  }, [consolidatedTelemetry])

  // Filtered materials list
  const filteredList = useMemo(() => {
    return consolidatedTelemetry.filter((m) => {
      const name = m.materialName.toLowerCase()
      const cat = (m.materialCategory || m.categoryName || m.category || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || cat.includes(searchQuery.toLowerCase())

      if (filterState === 'LOW') return matchesSearch && m.centralQty <= m.minReorder && m.centralQty > 0
      if (filterState === 'OUT') return matchesSearch && m.centralQty <= 0
      return matchesSearch
    })
  }, [consolidatedTelemetry, searchQuery, filterState])

  const handleOpenRequisition = (mat) => {
    setRequisitionMaterial(mat)
    if (sites.length > 0) setReqSiteId(sites[0].id)
    setReqQty(String(mat.minReorder || '50'))
    setReqUrgency('High')
  }

  const handleCreateRequisitionSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !requisitionMaterial) return
    if (!reqSiteId) {
      onNotify?.('Select destination site', 'error')
      return
    }

    setSubmittingReq(true)
    try {
      const site = sites.find((s) => s.id === reqSiteId)
      await createMaterialRequest(
        orgId,
        {
          siteId: reqSiteId,
          siteName: site?.siteName || site?.projectName || 'Primary Site',
          materialId: requisitionMaterial.id || requisitionMaterial.materialId,
          materialName: requisitionMaterial.materialName,
          category: requisitionMaterial.materialCategory || requisitionMaterial.category || 'General',
          requestedQty: Number(reqQty) || 1,
          unit: requisitionMaterial.unitStr,
          urgency: reqUrgency,
          remarks: 'Automated requisition triggered from Material Availability telemetry hub',
        },
        currentUser
      )

      onNotify?.('Material requisition submitted to Approvals Center!', 'success')
      setRequisitionMaterial(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to submit requisition', 'error')
    } finally {
      setSubmittingReq(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0B3470] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
              Live Stock Telemetry
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Material Availability</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time replenishment monitoring across Central Warehouse and On-Site Project Pools with threshold alerts.
          </p>
        </div>
      </div>

      {/* KPI Alert Cards (3 Bento Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setFilterState('ALL')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            filterState === 'ALL'
              ? 'bg-blue-50/70 border-blue-300 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tracked SKU Types</span>
            <Boxes className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{materials.length} Master SKUs</p>
          <div className="flex items-center gap-3 text-xs text-slate-600 font-medium mt-1">
            <span>Depot: <strong className="text-blue-900">{totalCentralWarehouseUnits.toLocaleString()}</strong></span>
            <span>•</span>
            <span>On-Site: <strong className="text-emerald-800">{totalOnSiteUnits.toLocaleString()}</strong></span>
          </div>
        </div>

        <div
          onClick={() => setFilterState('LOW')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            filterState === 'LOW'
              ? 'bg-amber-50/70 border-amber-300 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">Low Stock Alerts</span>
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-900 mt-2">{lowStockItems.length} SKUs</p>
          <p className="text-xs text-amber-700 font-medium mt-1">Depot balance below safety threshold</p>
        </div>

        <div
          onClick={() => setFilterState('OUT')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            filterState === 'OUT'
              ? 'bg-rose-50/70 border-rose-300 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">Depleted / Stockout</span>
            <TrendingDown className="w-5 h-5 text-rose-600" />
          </div>
          <p className="text-2xl font-black text-rose-900 mt-2">{outOfStockItems.length} SKUs</p>
          <p className="text-xs text-rose-700 font-medium mt-1">Requires immediate procurement PO</p>
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
            placeholder="Search stock by material name..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Filter:</span>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Items ({materials.length})</option>
            <option value="LOW">Low Stock Only ({lowStockItems.length})</option>
            <option value="OUT">Out of Stock Only ({outOfStockItems.length})</option>
          </select>
        </div>
      </div>

      {/* Live Stock Grid */}
      {loading && materials.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading live stock telemetry...</div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No stock alerts in this view</p>
          <p className="text-xs text-slate-400 mt-1">All monitored inventory levels satisfy minimum site requirements.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredList.map((m) => {
            const isCritical = m.centralQty <= 0
            const isWarning = m.centralQty > 0 && m.centralQty <= m.minReorder
            const percent = Math.min(100, Math.round((m.centralQty / (m.minReorder * 2)) * 100))

            return (
              <div
                key={m.id || m.materialId}
                className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                  isCritical
                    ? 'border-rose-300 ring-1 ring-rose-300'
                    : isWarning
                    ? 'border-amber-300'
                    : 'border-slate-200/80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {m.materialCategory || m.categoryName || m.category || 'Materials'}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5 leading-snug">
                        {m.materialName}
                      </h3>
                    </div>

                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        isCritical
                          ? 'bg-rose-100 text-rose-800'
                          : isWarning
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isCritical ? 'Depleted' : isWarning ? 'Low Stock' : 'Optimal'}
                    </span>
                  </div>

                  {/* Dual Stock Metrics */}
                  <div className="mt-4 grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Central Warehouse
                      </span>
                      <p className="text-lg font-black text-slate-900 mt-0.5">
                        {m.centralQty}{' '}
                        <span className="text-xs font-normal text-slate-500">{m.unitStr}</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Distributed on Sites
                      </span>
                      <p className="text-lg font-black text-emerald-800 mt-0.5">
                        {m.siteTotalAllocated}{' '}
                        <span className="text-xs font-normal text-slate-500">{m.unitStr}</span>
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar vs Safety Level */}
                  <div className="mt-3 space-y-1.5">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Safety Reorder: {m.minReorder} {m.unitStr}</span>
                      <span>Rate: ₹{m.unitPrice}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setInspectMaterial(m)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-700 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Site Pool ({m.siteBreakdown.length})</span>
                  </button>

                  <button
                    onClick={() => handleOpenRequisition(m)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Raise Requisition</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ======================================================================================= */}
      {/* SITE ALLOCATION BREAKDOWN MODAL */}
      {/* ======================================================================================= */}
      {inspectMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">On-Site Distribution Breakdown</h3>
                <p className="text-xs text-slate-500">{inspectMaterial.materialName}</p>
              </div>
              <button
                onClick={() => setInspectMaterial(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-xs">
                <div>
                  <span className="text-slate-500">Central Warehouse Stock:</span>
                  <p className="text-base font-bold text-[#0B3470]">{inspectMaterial.centralQty} {inspectMaterial.unitStr}</p>
                </div>
                <div>
                  <span className="text-slate-500">Total Across Sites:</span>
                  <p className="text-base font-bold text-emerald-800">{inspectMaterial.siteTotalAllocated} {inspectMaterial.unitStr}</p>
                </div>
              </div>

              {inspectMaterial.siteBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  No active project sites currently hold stock for this material.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Project Site</th>
                        <th className="py-2 px-3 text-right">Current Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inspectMaterial.siteBreakdown.map((pool, idx) => (
                        <tr key={pool.id || idx}>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {pool.siteName || pool.siteId}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900">
                            {pool.currentBalance} {inspectMaterial.unitStr}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setInspectMaterial(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* QUICK REQUISITION MODAL */}
      {/* ======================================================================================= */}
      {requisitionMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Raise Material Requisition</h3>
                <p className="text-xs text-slate-500">Procure replenishment for site dispatch.</p>
              </div>
              <button
                onClick={() => setRequisitionMaterial(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequisitionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Selected Material
                </label>
                <input
                  type="text"
                  disabled
                  value={requisitionMaterial.materialName}
                  className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Site *
                </label>
                <select
                  required
                  value={reqSiteId}
                  onChange={(e) => setReqSiteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">Select Destination Site...</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName || s.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Required Qty ({requisitionMaterial.unitStr}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={reqQty}
                    onChange={(e) => setReqQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Priority Level
                  </label>
                  <select
                    value={reqUrgency}
                    onChange={(e) => setReqUrgency(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical (Immediate Pour)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRequisitionMaterial(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReq}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingReq ? 'Forwarding...' : 'Dispatch Requisition to Approvals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

