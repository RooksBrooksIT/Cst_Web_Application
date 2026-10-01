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
  Table,
  LayoutGrid,
  Clock,
  Tag,
} from 'lucide-react'
import {
  fetchMaterials,
  fetchMaterialsAvailability,
  subscribeMaterialsAvailability,
  fetchSiteMaterialPool,
  subscribeAllSiteMaterialPools,
  createMaterialRequest,
  allocateMaterialToSite,
} from '../../../services/materialService.js'
import { resolveSite, getNormalizedSiteOptions } from '../../../utils/siteUtils.js'

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d)
}

function cleanKey(str) {
  return (str || '').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')
}

export default function MaterialsStock({ orgId, sites = [], currentUser, onNotify }) {
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'
  const [materials, setMaterials] = useState([])
  const [warehouseStock, setWarehouseStock] = useState([])
  const [sitePools, setSitePools] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterState, setFilterState] = useState('ALL') // 'ALL' | 'LOW' | 'OUT'

  // Direct Site Material Allocation Modal (Flow 2)
  const [showAllocateModal, setShowAllocateModal] = useState(false)
  const [allocSiteId, setAllocSiteId] = useState('')
  const [allocMatName, setAllocMatName] = useState('')
  const [allocQty, setAllocQty] = useState('')
  const [allocRate, setAllocRate] = useState('')
  const [allocRemarks, setAllocRemarks] = useState('')
  const [allocDate, setAllocDate] = useState(() => new Date().toISOString().split('T')[0])
  const [submittingAlloc, setSubmittingAlloc] = useState(false)

  // Requisition Modal
  const [requisitionMaterial, setRequisitionMaterial] = useState(null)
  const [reqSiteId, setReqSiteId] = useState('')
  const [reqQty, setReqQty] = useState('')
  const [reqUrgency, setReqUrgency] = useState('Normal')
  const [submittingReq, setSubmittingReq] = useState(false)

  // Site Allocation Breakdown Modal
  const [inspectMaterial, setInspectMaterial] = useState(null)

  // Deduplicated Normalized Sites
  const normalizedSites = useMemo(() => {
    return getNormalizedSiteOptions(sites)
  }, [sites])

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

  // Combine Master Materials with Live Central Warehouse materialsAvailability stock telemetry
  const consolidatedTelemetry = useMemo(() => {
    const itemMap = new Map()

    // 1. Process master materials catalog
    materials.forEach((m) => {
      const matId = m.materialId || m.id || cleanKey(m.materialName || m.name)
      const name = m.materialName || m.name || m.displayName || ''
      const cleanName = cleanKey(name) || cleanKey(matId)

      itemMap.set(cleanName, {
        id: matId,
        materialId: matId,
        materialName: name,
        displayName: m.displayName || name,
        category: m.materialCategory || m.categoryName || m.category || 'General',
        unitStr: m.materialUnit || m.unitName || m.unit || 'Units',
        centralQty: Number(m.currentTotalStock ?? m.currentStock ?? 0),
        companyAvailableCount: Number(m.currentTotalStock ?? 0),
        siteTotalAllocated: 0,
        totalAvailableCount: Number(m.currentTotalStock ?? 0),
        minReorder: Number(m.minReorderLevel || 20),
        unitPrice: Number(m.unitPrice || m.standardRate || 0),
        siteBreakdown: [],
        siteInventories: [],
        lastupdated: m.updatedAt || m.lastupdated,
      })
    })

    // 2. Merge / Add live materialsAvailability documents (/organisation/{orgId}/materialsAvailability)
    warehouseStock.forEach((w) => {
      const matId = w.materialId || w.id
      const name = w.materialName || w.displayName || w.name || ''
      const cleanName = cleanKey(name) || cleanKey(matId)

      const existing = itemMap.get(cleanName) || {}

      const centralQty = Number(
        w.companyAvailableCount ?? w.availableCount ?? w.count ?? existing.centralQty ?? 0
      )

      // Process siteInventories array from materialsAvailability schema if present
      const siteInventories = Array.isArray(w.siteInventories) ? w.siteInventories : []

      // Match siteMaterialPool records (reading both availableCount and currentBalance)
      const matchedPools = sitePools.filter(
        (p) => (p.materialName || '').toLowerCase() === (name || existing.materialName || '').toLowerCase()
      )

      let siteTotalAllocated = 0
      if (siteInventories.length > 0) {
        siteTotalAllocated = siteInventories.reduce(
          (sum, s) => sum + (Number(s.availableCount ?? s.currentBalance ?? s.count) || 0),
          0
        )
      } else if (matchedPools.length > 0) {
        siteTotalAllocated = matchedPools.reduce(
          (acc, p) => acc + (Number(p.availableCount ?? p.currentBalance ?? p.count) || 0),
          0
        )
      }

      const totalAvailableCount = Number(
        w.totalAvailableCount ?? (centralQty + siteTotalAllocated)
      )

      const currentUnitPrice = Number(w.unitPrice ?? existing.unitPrice ?? 0)

      const mergedSiteBreakdown = siteInventories.length > 0
        ? siteInventories.map((s) => {
            const res = resolveSite(s.siteId, s.siteName, sites)
            const countVal = Number(s.availableCount ?? s.currentBalance ?? s.count ?? 0)
            return {
              siteId: res.siteId,
              siteCode: res.siteCode,
              siteName: res.siteName,
              projectName: res.projectName,
              label: res.label,
              availableCount: countVal,
              currentBalance: countVal,
              count: countVal,
              totalAllocated: Number(s.totalAllocated ?? countVal),
              totalConsumed: Number(s.totalConsumed ?? 0),
              totalValuation: countVal * currentUnitPrice,
              updatedAt: s.updatedAt || s.lastUpdated,
            }
          })
        : matchedPools.map((p) => {
            const res = resolveSite(p.siteId, p.siteName, sites)
            const countVal = Number(p.availableCount ?? p.currentBalance ?? p.count ?? 0)
            const rateVal = Number(p.unitPrice ?? currentUnitPrice)
            return {
              siteId: res.siteId,
              siteCode: res.siteCode,
              siteName: res.siteName,
              projectName: res.projectName,
              label: res.label,
              availableCount: countVal,
              currentBalance: countVal,
              count: countVal,
              totalAllocated: Number(p.totalAllocated ?? countVal),
              totalConsumed: Number(p.totalConsumed ?? 0),
              totalValuation: Number(p.totalValuation ?? (countVal * rateVal)),
              updatedAt: p.updatedAt || p.lastUpdated,
            }
          })

      itemMap.set(cleanName, {
        ...existing,
        id: matId || existing.id || cleanName,
        materialId: matId || existing.materialId || cleanName,
        materialName: name || existing.materialName || 'Material Item',
        displayName: w.displayName || existing.displayName || name || 'Material Item',
        category: w.category || existing.category || 'General',
        unitStr: w.unit || existing.unitStr || 'Units',
        centralQty: Math.max(0, centralQty),
        companyAvailableCount: Math.max(0, centralQty),
        siteTotalAllocated: Math.max(0, siteTotalAllocated),
        totalAvailableCount: Math.max(0, totalAvailableCount),
        minReorder: Number(w.minReorder || existing.minReorder || 20),
        unitPrice: currentUnitPrice,
        siteBreakdown: mergedSiteBreakdown,
        siteInventories: mergedSiteBreakdown,
        lastupdated: w.lastupdated || w.updatedAt || existing.lastupdated,
      })
    })

    return Array.from(itemMap.values())
  }, [materials, warehouseStock, sitePools, sites])

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
      const name = (m.displayName || m.materialName).toLowerCase()
      const cat = (m.category || '').toLowerCase()
      const idStr = (m.materialId || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || cat.includes(searchQuery.toLowerCase()) || idStr.includes(searchQuery.toLowerCase())

      if (filterState === 'LOW') return matchesSearch && m.centralQty <= m.minReorder && m.centralQty > 0
      if (filterState === 'OUT') return matchesSearch && m.centralQty <= 0
      return matchesSearch
    })
  }, [consolidatedTelemetry, searchQuery, filterState])

  // Direct Site Material Allocation Handlers (Flow 2)
  const handleOpenAllocateModal = (presetMaterial = null) => {
    if (normalizedSites.length > 0) {
      setAllocSiteId(normalizedSites[0].siteId || normalizedSites[0].id)
    }
    if (presetMaterial) {
      setAllocMatName(presetMaterial.displayName || presetMaterial.materialName)
      setAllocRate(String(presetMaterial.unitPrice || ''))
    } else if (consolidatedTelemetry.length > 0) {
      const firstMat = consolidatedTelemetry[0]
      setAllocMatName(firstMat.displayName || firstMat.materialName)
      setAllocRate(String(firstMat.unitPrice || ''))
    }
    setAllocQty('10')
    setAllocRemarks('Direct site allocation from Manager')
    setAllocDate(new Date().toISOString().split('T')[0])
    setShowAllocateModal(true)
  }

  const handleAllocateSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!allocSiteId) {
      onNotify?.('Please select a destination project site', 'error')
      return
    }
    if (!allocMatName) {
      onNotify?.('Please select a material', 'error')
      return
    }
    const qty = Number(allocQty)
    if (isNaN(qty) || qty <= 0) {
      onNotify?.('Quantity must be greater than 0', 'error')
      return
    }

    const selectedSite = normalizedSites.find((s) => s.siteId === allocSiteId || s.id === allocSiteId)
    const selectedMat = consolidatedTelemetry.find(
      (m) => (m.displayName || m.materialName).toLowerCase() === allocMatName.toLowerCase()
    )

    const unitRate = Number(allocRate) || selectedMat?.unitPrice || 0
    const totalAmount = qty * unitRate

    setSubmittingAlloc(true)
    try {
      await allocateMaterialToSite(
        orgId,
        {
          siteId: selectedSite?.siteId || allocSiteId,
          siteCode: selectedSite?.siteCode || '',
          siteName: selectedSite?.siteName || selectedSite?.label || allocSiteId,
          projectName: selectedSite?.projectName || selectedSite?.siteName || '',
          materialId: selectedMat?.id || selectedMat?.materialId || '',
          materialName: allocMatName,
          quantity: qty,
          unit: selectedMat?.unitStr || 'Units',
          unitRate,
          amount: totalAmount,
          allocationDate: allocDate,
          remarks: allocRemarks,
          deductFromWarehouse: true,
        },
        currentUser
      )

      onNotify?.(`Successfully allocated ${qty} ${selectedMat?.unitStr || 'Units'} to ${selectedSite?.siteName || allocSiteId}!`, 'success')
      setShowAllocateModal(false)
      loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to allocate material to site', 'error')
    } finally {
      setSubmittingAlloc(false)
    }
  }

  const handleOpenRequisition = (mat) => {
    setRequisitionMaterial(mat)
    if (normalizedSites.length > 0) setReqSiteId(normalizedSites[0].siteId || normalizedSites[0].id)
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
      const site = normalizedSites.find((s) => s.siteId === reqSiteId || s.id === reqSiteId)
      await createMaterialRequest(
        orgId,
        {
          siteId: site?.siteId || reqSiteId,
          siteCode: site?.siteCode || '',
          siteName: site?.siteName || site?.projectName || 'Primary Site',
          projectName: site?.projectName || '',
          materialId: requisitionMaterial.id || requisitionMaterial.materialId,
          materialName: requisitionMaterial.displayName || requisitionMaterial.materialName,
          category: requisitionMaterial.category || 'General',
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenAllocateModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3470] text-white hover:bg-blue-800 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Direct Site Allocation</span>
          </button>
        </div>
      </div>

      {/* KPI Alert Cards */}
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
          <p className="text-2xl font-black text-slate-900 mt-2">{consolidatedTelemetry.length} SKUs</p>
          <div className="flex items-center gap-3 text-xs text-slate-600 font-medium mt-1">
            <span>Central: <strong className="text-blue-900">{totalCentralWarehouseUnits.toLocaleString()}</strong></span>
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

      {/* Filter and View Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search material ID, display name, category..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Filter:</span>
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 font-medium"
            >
              <option value="ALL">All Items ({consolidatedTelemetry.length})</option>
              <option value="LOW">Low Stock Only ({lowStockItems.length})</option>
              <option value="OUT">Out of Stock Only ({outOfStockItems.length})</option>
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
              title="Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Stock Content Area */}
      {loading && consolidatedTelemetry.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading live stock telemetry...</div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No stock alerts in this view</p>
          <p className="text-xs text-slate-400 mt-1">All monitored inventory levels satisfy minimum site requirements.</p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE FORMAT VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Material ID & Display Name</th>
                  <th className="py-3.5 px-4">Category & Unit</th>
                  <th className="py-3.5 px-4">Central Warehouse</th>
                  <th className="py-3.5 px-4">Total Org Available</th>
                  <th className="py-3.5 px-4">Site Allocations</th>
                  <th className="py-3.5 px-4">Last Updated</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredList.map((m) => {
                  const isCritical = m.centralQty <= 0
                  const isWarning = m.centralQty > 0 && m.centralQty <= m.minReorder

                  return (
                    <tr key={m.id || m.materialId} className="hover:bg-slate-50/70 transition-colors">
                      {/* Material ID & Display Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0B3470] flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">
                            <Boxes className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <strong className="block font-bold text-slate-900 text-sm">
                                {m.displayName || m.materialName}
                              </strong>
                              {m.materialName !== m.displayName && (
                                <span className="text-[11px] text-slate-400">({m.materialName})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {m.materialId}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
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
                          </div>
                        </div>
                      </td>

                      {/* Category & Unit */}
                      <td className="py-3.5 px-4">
                        <div>
                          <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {m.category}
                          </span>
                          <p className="text-[11px] text-slate-400 mt-1 capitalize font-medium">Unit: {m.unitStr}</p>
                        </div>
                      </td>

                      {/* Central Warehouse Available */}
                      <td className="py-3.5 px-4">
                        <div>
                          <p className={`text-sm font-black ${isCritical ? 'text-rose-600' : isWarning ? 'text-amber-700' : 'text-slate-900'}`}>
                            {m.companyAvailableCount.toLocaleString()}{' '}
                            <span className="text-xs font-normal text-slate-500">{m.unitStr}</span>
                          </p>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Central Depot</span>
                        </div>
                      </td>

                      {/* Total Org Available */}
                      <td className="py-3.5 px-4">
                        <div>
                          <p className="text-sm font-black text-emerald-800">
                            {m.totalAvailableCount.toLocaleString()}{' '}
                            <span className="text-xs font-normal text-slate-500">{m.unitStr}</span>
                          </p>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Depot + Sites</span>
                        </div>
                      </td>

                      {/* Site Allocations */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setInspectMaterial(m)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                        >
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{m.siteInventories.length} Site {m.siteInventories.length === 1 ? 'Pool' : 'Pools'}</span>
                        </button>
                      </td>

                      {/* Last Updated */}
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                        {formatDate(m.lastupdated)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectMaterial(m)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 transition-colors"
                            title="Inspect Site Breakdown"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRequisition(m)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0B3470] text-white hover:bg-[#082855] transition-colors flex items-center gap-1 shadow-xs"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Requisition</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS FORMAT VIEW */
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
                        {m.category}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5 leading-snug">
                        {m.displayName || m.materialName}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{m.materialId}</p>
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
                        {m.companyAvailableCount.toLocaleString()}{' '}
                        <span className="text-xs font-normal text-slate-500">{m.unitStr}</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Total Org Available
                      </span>
                      <p className="text-lg font-black text-emerald-800 mt-0.5">
                        {m.totalAvailableCount.toLocaleString()}{' '}
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
                      <span>Last Updated: {formatDate(m.lastupdated)}</span>
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
                    <span>Site Pool ({m.siteInventories.length})</span>
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
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase font-mono">
                  {inspectMaterial.materialId}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{inspectMaterial.displayName || inspectMaterial.materialName}</h3>
                <p className="text-xs text-slate-500">Category: {inspectMaterial.category} · Unit: {inspectMaterial.unitStr}</p>
              </div>
              <button
                onClick={() => setInspectMaterial(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Central Depot Stock</span>
                <p className="text-base font-black text-[#0B3470] mt-0.5">{inspectMaterial.companyAvailableCount} {inspectMaterial.unitStr}</p>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">On-Site Allocations</span>
                <p className="text-base font-black text-emerald-800 mt-0.5">{inspectMaterial.siteTotalAllocated} {inspectMaterial.unitStr}</p>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Available</span>
                <p className="text-base font-black text-slate-900 mt-0.5">{inspectMaterial.totalAvailableCount} {inspectMaterial.unitStr}</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Site Inventories ({inspectMaterial.siteInventories.length})</span>
                <span className="text-slate-400 font-normal normal-case font-mono">Last updated: {formatDate(inspectMaterial.lastupdated)}</span>
              </h4>

              {inspectMaterial.siteInventories.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 border border-slate-200 rounded-xl bg-slate-50">
                  No active project sites currently hold inventory for this material.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Site ID & Site Name</th>
                        <th className="py-2.5 px-2 text-right">Inward Allocated</th>
                        <th className="py-2.5 px-2 text-right">Consumed</th>
                        <th className="py-2.5 px-2 text-right">Available Stock</th>
                        <th className="py-2.5 px-3 text-right">Valuation (₹)</th>
                        <th className="py-2.5 px-3 text-right">Updated At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inspectMaterial.siteInventories.map((siteItem, idx) => (
                        <tr key={siteItem.siteId || idx} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <strong className="font-semibold text-slate-900">{siteItem.siteName || siteItem.label || siteItem.siteId}</strong>
                                {siteItem.siteCode && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                                    {siteItem.siteCode}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                <span>ID: <code className="font-mono text-slate-600">{siteItem.siteId}</code></span>
                                {siteItem.projectName && siteItem.projectName !== siteItem.siteName && (
                                  <span>• Project: {siteItem.projectName}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-medium text-slate-700">
                            {(siteItem.totalAllocated || 0).toLocaleString()} {inspectMaterial.unitStr}
                          </td>
                          <td className="py-2.5 px-2 text-right font-medium text-amber-700">
                            {(siteItem.totalConsumed || 0).toLocaleString()} {inspectMaterial.unitStr}
                          </td>
                          <td className="py-2.5 px-2 text-right font-black text-emerald-800">
                            {(siteItem.availableCount ?? siteItem.currentBalance ?? 0).toLocaleString()} {inspectMaterial.unitStr}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            ₹{Number(siteItem.totalValuation || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-[11px]">
                            {formatDate(siteItem.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const targetMat = inspectMaterial
                  setInspectMaterial(null)
                  handleOpenAllocateModal(targetMat)
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer"
              >
                + Allocate Stock to Another Site
              </button>
              <button
                type="button"
                onClick={() => setInspectMaterial(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* DIRECT SITE MATERIAL ALLOCATION MODAL (Flow 2: Manager Direct Allocation) */}
      {/* ======================================================================================= */}
      {showAllocateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase font-mono">
                  Flow 2 · Direct Allocation
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">Direct Material Allocation to Site</h3>
                <p className="text-xs text-slate-500">Transfers inventory from Central Warehouse into the target Site's Material Pool.</p>
              </div>
              <button
                onClick={() => setShowAllocateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAllocateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Project Site *
                </label>
                <select
                  required
                  value={allocSiteId}
                  onChange={(e) => setAllocSiteId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-xs font-medium"
                >
                  {normalizedSites.map((s) => (
                    <option key={s.id} value={s.siteId || s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Material Item *
                </label>
                <select
                  required
                  value={allocMatName}
                  onChange={(e) => {
                    const nextName = e.target.value
                    setAllocMatName(nextName)
                    const m = consolidatedTelemetry.find(
                      (item) => (item.displayName || item.materialName).toLowerCase() === nextName.toLowerCase()
                    )
                    if (m) setAllocRate(String(m.unitPrice || ''))
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-xs font-medium"
                >
                  {consolidatedTelemetry.map((m) => (
                    <option key={m.id} value={m.displayName || m.materialName}>
                      {m.displayName || m.materialName} ({m.centralQty} {m.unitStr} available in depot)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity to Allocate *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={allocQty}
                    onChange={(e) => setAllocQty(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Standard Rate / Unit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={allocRate}
                    onChange={(e) => setAllocRate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Total Calculation Card */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Calculated Total Valuation:</span>
                <span className="text-base font-black text-emerald-800">
                  ₹{((Number(allocQty) || 0) * (Number(allocRate) || 0)).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Allocation Date
                  </label>
                  <input
                    type="date"
                    required
                    value={allocDate}
                    onChange={(e) => setAllocDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Manager Remarks
                  </label>
                  <input
                    type="text"
                    value={allocRemarks}
                    onChange={(e) => setAllocRemarks(e.target.value)}
                    placeholder="e.g. Inward for Foundation Phase 1"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-medium"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAlloc}
                  className="px-5 py-2 font-bold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingAlloc ? 'Allocating...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* REQUISITION MODAL */}
      {/* ======================================================================================= */}
      {requisitionMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Raise Material Requisition</h3>
                <p className="text-xs text-slate-500">{requisitionMaterial.displayName || requisitionMaterial.materialName}</p>
              </div>
              <button
                onClick={() => setRequisitionMaterial(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequisitionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Project Site *
                </label>
                <select
                  required
                  value={reqSiteId}
                  onChange={(e) => setReqSiteId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-xs font-medium"
                >
                  {normalizedSites.map((s) => (
                    <option key={s.id} value={s.siteId || s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity ({requisitionMaterial.unitStr}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={reqQty}
                    onChange={(e) => setReqQty(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Priority / Urgency
                  </label>
                  <select
                    value={reqUrgency}
                    onChange={(e) => setReqUrgency(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-medium"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRequisitionMaterial(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReq}
                  className="px-5 py-2 font-bold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingReq ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
