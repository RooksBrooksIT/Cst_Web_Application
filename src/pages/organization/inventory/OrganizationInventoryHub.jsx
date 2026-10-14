import React, { useState, useEffect, useMemo } from 'react'
import {
  Boxes,
  Package,
  Wrench,
  Truck,
  History,
  Search,
  Building2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldAlert,
  Eye,
  MapPin,
  Layers,
  BarChart3,
  Clock,
  Check,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import {
  subscribeMaterials,
  subscribeMaterialsAvailability,
  subscribeAllSiteMaterialPools,
  subscribeMaterialTransactions,
  cleanKey,
  MATERIAL_CATEGORIES,
} from '../../../services/materialService'
import {
  subscribeTools,
  subscribeToolsAtCompany,
  subscribeToolsAtSite,
  subscribeToolMovements,
  TOOL_CATEGORIES,
} from '../../../services/toolService'
import { subscribeWithFallback } from '../../../services/firestoreService'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import StatusBadge from '../../../components/common/StatusBadge'
import {
  resolveToolLocationDetails,
  formatSiteLocationDisplay,
  COMPANY_HQ_WAREHOUSE_LABEL,
  COMPANY_HQ_TAG,
  isHqIdentifier,
} from '../../../utils/toolLocationUtils'

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

export default function OrganizationInventoryHub({ sites = [], projects = [] }) {
  const { orgId } = useAuth()
  const [activeTab, setActiveTab] = useState('site_matrix') // site_matrix | materials | tools | audit

  // Data Collections
  const [materials, setMaterials] = useState([])
  const [materialsAvailability, setMaterialsAvailability] = useState([])
  const [siteMaterialPool, setSiteMaterialPool] = useState([])
  const [materialTransactions, setMaterialTransactions] = useState([])

  const [tools, setTools] = useState([])
  const [toolsAtCompany, setToolsAtCompany] = useState([])
  const [toolsAtSite, setToolsAtSite] = useState([])
  const [toolMovements, setToolMovements] = useState([])

  const [fetchedSites, setFetchedSites] = useState([])
  const [fetchedProjects, setFetchedProjects] = useState([])

  const [selectedMaterialDetail, setSelectedMaterialDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [matSearch, setMatSearch] = useState('')
  const [matCategory, setMatCategory] = useState('all')

  const [toolSearch, setToolSearch] = useState('')
  const [toolCategory, setToolCategory] = useState('all')
  const [toolStatusFilter, setToolStatusFilter] = useState('all')

  const [selectedSiteFilter, setSelectedSiteFilter] = useState('all')

  // Real-time subscriptions (Read-only observation)
  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    const unsubs = [
      subscribeMaterials(orgId, (data) => setMaterials(data || []), () => {}),
      subscribeMaterialsAvailability(orgId, (data) => setMaterialsAvailability(data || []), () => {}),
      subscribeAllSiteMaterialPools(orgId, (data) => setSiteMaterialPool(data || []), () => {}),
      subscribeMaterialTransactions(orgId, (data) => setMaterialTransactions(data || []), () => {}),
      subscribeTools(orgId, (data) => setTools(data || []), () => {}),
      subscribeToolsAtCompany(orgId, (data) => setToolsAtCompany(data || []), () => {}),
      subscribeToolsAtSite(orgId, (data) => setToolsAtSite(data || []), () => {}),
      subscribeToolMovements(orgId, (data) => setToolMovements(data || []), () => {}),
      subscribeWithFallback(orgId, 'sites', (data) => setFetchedSites(data || []), () => {}),
      subscribeWithFallback(orgId, 'projects', (data) => setFetchedProjects(data || []), () => {}),
    ]

    setLoading(false)
    return () => unsubs.forEach((u) => u && u())
  }, [orgId])

  // Consolidated site and project list for name resolution (deduplicated by site/project ID)
  const allSiteRecords = useMemo(() => {
    const raw = [...sites, ...projects, ...fetchedSites, ...fetchedProjects]
    const map = new Map()
    raw.forEach((s) => {
      if (!s) return
      const sId = s.id || s.siteId || s.projectId
      if (sId && !map.has(sId)) {
        map.set(sId, s)
      }
    })
    return Array.from(map.values())
  }, [sites, projects, fetchedSites, fetchedProjects])

  // Resolve actual Project / Site Name from siteId or doc metadata across all collections
  const resolveSiteName = useMemo(() => {
    return (siteId, siteNameFromDoc = '', projectNameFromDoc = '', siteCodeFromDoc = '') => {
      const details = resolveToolLocationDetails(
        siteId,
        siteNameFromDoc,
        projectNameFromDoc,
        siteCodeFromDoc,
        {
          allSiteRecords,
          toolsAtSite,
          toolMovements,
          materialTransactions,
          siteMaterialPool,
        }
      )
      return details.displayLocation
    }
  }, [allSiteRecords, toolsAtSite, toolMovements, materialTransactions, siteMaterialPool])

  // -----------------------------------------------------------------------------------
  // MATERIALS DATA PROCESSING & MATRIX
  // -----------------------------------------------------------------------------------
  // Union of all materials from catalog, availability stock, and site pools
  const masterMaterialsUnion = useMemo(() => {
    const map = new Map()

    // 1. Master materials catalog
    materials.forEach((m) => {
      const name = (m.materialName || m.name || '').trim()
      if (name) {
        const key = cleanKey(name)
        map.set(key, { ...m, materialName: name })
      }
    })

    // 2. Materials availability collection
    materialsAvailability.forEach((a) => {
      const name = (a.materialName || a.name || a.id || '').trim()
      if (name) {
        const key = cleanKey(name)
        if (!map.has(key)) {
          map.set(key, {
            id: a.id || key,
            materialName: name,
            category: a.category || a.materialCategory || 'General',
            unit: a.unit || a.materialUnit || 'Bags',
            unitPrice: Number(a.unitPrice || a.materialPrice || a.standardRate) || 0,
            minReorderLevel: 20,
            currentTotalStock: Number(a.availableCount ?? a.availableQuantity ?? a.currentStock ?? 0),
          })
        }
      }
    })

    // 3. Site material pool allocations
    siteMaterialPool.forEach((p) => {
      const name = (p.materialName || p.name || '').trim()
      if (name) {
        const key = cleanKey(name)
        if (!map.has(key)) {
          map.set(key, {
            id: p.id || key,
            materialName: name,
            category: p.category || p.materialCategory || 'General',
            unit: p.unit || p.materialUnit || 'Bags',
            unitPrice: Number(p.unitPrice || p.materialPrice || p.standardRate) || 0,
            minReorderLevel: 20,
            currentTotalStock: 0,
          })
        }
      }
    })

    return Array.from(map.values())
  }, [materials, materialsAvailability, siteMaterialPool])

  const materialMatrix = useMemo(() => {
    return masterMaterialsUnion.map((m) => {
      const matName = m.materialName || m.name || ''
      const cleanMat = cleanKey(matName)

      // Find HQ availability doc
      const hqDoc = materialsAvailability.find(
        (a) => cleanKey(a.materialName || a.name || a.id) === cleanMat
      )
      const rawHqStock = hqDoc
        ? Number(hqDoc.availableCount ?? hqDoc.availableQuantity ?? hqDoc.currentStock ?? hqDoc.quantity ?? 0)
        : Number(m.currentTotalStock ?? m.availableCount ?? m.currentStock ?? m.quantity ?? 0)

      const hqStock = Math.max(0, rawHqStock)

      // Calculate aggregated site pool allocations
      const poolItems = siteMaterialPool.filter(
        (p) => cleanKey(p.materialName || p.name) === cleanMat
      )

      const siteBreakdown = poolItems
        .filter((p) => Number(p.currentBalance ?? p.availableQuantity ?? p.quantity ?? 0) > 0)
        .map((p) => {
          const resolvedName = resolveSiteName(p.siteId, p.siteName || p.projectName)
          const qty = Number(p.currentBalance ?? p.availableQuantity ?? p.quantity ?? 0)
          return {
            siteId: p.siteId,
            siteName: resolvedName,
            quantity: qty,
            unit: p.unit || m.unit || 'Bags',
          }
        })

      const totalSiteStock = siteBreakdown.reduce((acc, curr) => acc + curr.quantity, 0)
      const totalEnterpriseStock = hqStock + totalSiteStock
      const rate = Number(m.unitPrice ?? m.standardRate ?? m.materialPrice) || 0
      const category = m.category || m.materialCategory || m.categoryName || 'General'
      const unit = m.unit || m.materialUnit || m.unitName || 'Bags'
      const minReorder = Number(m.minReorderLevel) || 20
      const isLowStock = totalEnterpriseStock <= minReorder

      return {
        ...m,
        materialName: matName,
        category,
        unit,
        hqStock,
        totalSiteStock,
        totalEnterpriseStock,
        unitPrice: rate,
        minReorderLevel: minReorder,
        isLowStock,
        totalValue: totalEnterpriseStock * rate,
        siteBreakdown,
      }
    })
  }, [masterMaterialsUnion, materialsAvailability, siteMaterialPool, resolveSiteName])

  // Filtered Materials
  const filteredMaterials = useMemo(() => {
    return materialMatrix.filter((m) => {
      if (matCategory !== 'all' && m.category !== matCategory) return false
      if (matSearch.trim()) {
        const q = matSearch.trim().toLowerCase()
        const name = (m.materialName || '').toLowerCase()
        const cat = (m.category || '').toLowerCase()
        const hsn = (m.hsnCode || '').toLowerCase()
        if (!name.includes(q) && !cat.includes(q) && !hsn.includes(q)) return false
      }
      return true
    })
  }, [materialMatrix, matCategory, matSearch])

  // Material Stock Metrics
  const materialMetrics = useMemo(() => {
    const totalItems = materialMatrix.length
    const totalHqValue = materialMatrix.reduce((acc, curr) => acc + curr.hqStock * curr.unitPrice, 0)
    const totalSiteValue = materialMatrix.reduce((acc, curr) => acc + curr.totalSiteStock * curr.unitPrice, 0)
    const lowStockCount = materialMatrix.filter((m) => m.isLowStock).length
    return { totalItems, totalHqValue, totalSiteValue, lowStockCount }
  }, [materialMatrix])

  // -----------------------------------------------------------------------------------
  // TOOLS DATA PROCESSING & SITE ALLOCATION BREAKDOWN
  // -----------------------------------------------------------------------------------
  const totalCompanyToolsCount = useMemo(() => {
    if (toolsAtCompany.length > 0) {
      return toolsAtCompany.reduce((acc, curr) => acc + (Number(curr.availableCount ?? curr.quantity) || 0), 0)
    }
    return tools.reduce((acc, curr) => {
      const st = String(curr.status || curr.currentStatus || '').toLowerCase()
      if (st === 'at_company_warehouse' || st === 'available') {
        return acc + (Number(curr.availableCount ?? curr.toolCount ?? curr.quantity) || 1)
      }
      return acc
    }, 0)
  }, [toolsAtCompany, tools])

  const totalSiteAllocatedToolsCount = useMemo(() => {
    return toolsAtSite.reduce((acc, curr) => acc + (Number(curr.quantity ?? curr.availableCount) || 0), 0)
  }, [toolsAtSite])

  const siteToolsBreakdown = useMemo(() => {
    const list = []
    const lookupContext = {
      allSiteRecords,
      toolsAtSite,
      toolMovements,
      materialTransactions,
      siteMaterialPool,
    }

    // 1. Process Tools Allocated to Sites (from toolsAtSite collection)
    toolsAtSite.forEach((ts) => {
      const loc = resolveToolLocationDetails(
        ts.siteId,
        ts.siteName,
        ts.projectName,
        ts.siteCode,
        lookupContext
      )
      const qtyAvailable = Number(ts.quantity ?? ts.availableCount ?? 0)
      const qtyAllocated = Number(ts.totalAllocated ?? ts.quantity ?? qtyAvailable)
      list.push({
        id: ts.id || `${ts.siteId}_${ts.toolCode}`,
        siteId: loc.siteId,
        siteCode: loc.siteCode,
        siteName: loc.siteName,
        projectName: loc.projectName,
        displayLocation: loc.displayLocation,
        locationTag: loc.locationTag,
        toolCode: ts.toolCode || ts.toolId || 'EQ-ASSET',
        toolName: ts.toolName || ts.name || 'Equipment Item',
        quantityAvailable: qtyAvailable,
        totalAllocated: qtyAllocated,
        supervisorName: ts.supervisorName || 'Site Team',
        deployedDate: ts.deployedDate || 'Active',
        isCompanyHq: loc.isCompanyHq,
      })
    })

    // 2. Process Tools Available at Company HQ Warehouse
    if (toolsAtCompany.length > 0) {
      toolsAtCompany.forEach((tc) => {
        const qtyAvailable = Number(tc.availableCount ?? tc.quantity ?? 0)
        if (qtyAvailable > 0) {
          list.push({
            id: `hq_${tc.toolCode}`,
            siteId: 'COMPANY_HQ',
            siteCode: 'HQ',
            siteName: COMPANY_HQ_WAREHOUSE_LABEL,
            projectName: 'Company HQ',
            displayLocation: COMPANY_HQ_WAREHOUSE_LABEL,
            locationTag: COMPANY_HQ_TAG,
            toolCode: tc.toolCode || 'EQ-ASSET',
            toolName: tc.toolName || tc.name || 'Equipment Item',
            quantityAvailable: qtyAvailable,
            totalAllocated: qtyAvailable,
            supervisorName: 'HQ Warehouse Manager',
            deployedDate: 'In Stock',
            isCompanyHq: true,
          })
        }
      })
    } else {
      // Fallback to tools master catalog if toolsAtCompany subscription is empty
      tools.forEach((t) => {
        const st = String(t.status || t.currentStatus || '').toLowerCase()
        const availCount = Number(t.availableCount ?? t.toolCount ?? t.quantity ?? 0)
        if ((st === 'at_company_warehouse' || st === 'available') && availCount > 0) {
          const code = t.toolCode || t.assetTagId
          if (code && !list.some((item) => item.isCompanyHq && item.toolCode === code)) {
            list.push({
              id: `hq_${t.id || code}`,
              siteId: 'COMPANY_HQ',
              siteCode: 'HQ',
              siteName: COMPANY_HQ_WAREHOUSE_LABEL,
              projectName: 'Company HQ',
              displayLocation: COMPANY_HQ_WAREHOUSE_LABEL,
              locationTag: COMPANY_HQ_TAG,
              toolCode: code || 'EQ-ASSET',
              toolName: t.toolName || t.name || 'Equipment Item',
              quantityAvailable: availCount,
              totalAllocated: availCount,
              supervisorName: 'HQ Warehouse Manager',
              deployedDate: 'In Stock',
              isCompanyHq: true,
            })
          }
        }
      })
    }

    return list
  }, [toolsAtSite, toolsAtCompany, tools, allSiteRecords, toolMovements, materialTransactions, siteMaterialPool])

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      if (toolCategory !== 'all' && t.category !== toolCategory) return false
      if (toolStatusFilter !== 'all') {
        const st = (t.status || t.currentStatus || '').toLowerCase()
        if (toolStatusFilter === 'warehouse' && st !== 'at_company_warehouse' && st !== 'available') return false
        if (toolStatusFilter === 'site' && st !== 'active_on_site' && st !== 'dispatched') return false
        if (toolStatusFilter === 'maintenance' && st !== 'under_maintenance' && st !== 'damaged') return false
      }
      if (toolSearch.trim()) {
        const q = toolSearch.trim().toLowerCase()
        const name = (t.toolName || t.name || '').toLowerCase()
        const tag = (t.assetTagId || t.toolCode || '').toLowerCase()
        const serial = (t.serialNumber || '').toLowerCase()
        if (!name.includes(q) && !tag.includes(q) && !serial.includes(q)) return false
      }
      return true
    })
  }, [tools, toolCategory, toolStatusFilter, toolSearch])

  // Unique location options for dropdown selection (deduplicated by resolved display location)
  const uniqueLocationOptions = useMemo(() => {
    const seenDisplayLocations = new Set()
    const options = []
    const lookupContext = {
      allSiteRecords,
      toolsAtSite,
      toolMovements,
      materialTransactions,
      siteMaterialPool,
    }

    const processCandidate = (sId, rawName, rawProject, rawCode) => {
      if (!sId || isHqIdentifier(sId)) return
      const loc = resolveToolLocationDetails(sId, rawName, rawProject, rawCode, lookupContext)
      if (loc.isCompanyHq || !loc.displayLocation) return

      const locKey = loc.displayLocation.trim().toLowerCase()
      if (!seenDisplayLocations.has(locKey)) {
        seenDisplayLocations.add(locKey)
        options.push({
          id: sId,
          displayLocation: loc.displayLocation,
          siteCode: loc.siteCode,
          siteName: loc.siteName,
          projectName: loc.projectName,
          matchingIds: [sId],
          matchingCodes: loc.siteCode ? [loc.siteCode.toLowerCase()] : [],
          matchingLabels: [locKey],
        })
      } else {
        const existing = options.find((opt) => opt.displayLocation.trim().toLowerCase() === locKey)
        if (existing) {
          if (!existing.matchingIds.includes(sId)) {
            existing.matchingIds.push(sId)
          }
          if (loc.siteCode && !existing.matchingCodes.includes(loc.siteCode.toLowerCase())) {
            existing.matchingCodes.push(loc.siteCode.toLowerCase())
          }
        }
      }
    }

    allSiteRecords.forEach((s) => {
      const sId = s.id || s.siteId || s.projectId
      const rawName = s.siteName || s.name || s.title
      const rawProject = s.projectName || s.projectTitle
      const rawCode = s.siteCode || s.code
      processCandidate(sId, rawName, rawProject, rawCode)
    })

    toolsAtSite.forEach((ts) => {
      processCandidate(ts.siteId, ts.siteName, ts.projectName, ts.siteCode)
    })

    return options.sort((a, b) => a.displayLocation.localeCompare(b.displayLocation))
  }, [allSiteRecords, toolsAtSite, toolMovements, materialTransactions, siteMaterialPool])

  const filteredSiteTools = useMemo(() => {
    const selectedLocObj = uniqueLocationOptions.find((loc) => loc.id === selectedSiteFilter)

    return siteToolsBreakdown.filter((st) => {
      if (selectedSiteFilter !== 'all') {
        if (selectedSiteFilter === 'COMPANY_HQ') {
          if (!st.isCompanyHq) return false
        } else if (selectedLocObj) {
          const matchesId = selectedLocObj.matchingIds.includes(st.siteId)
          const matchesCode = st.siteCode && selectedLocObj.matchingCodes.includes(st.siteCode.toLowerCase())
          const matchesLabel = selectedLocObj.matchingLabels.includes(st.displayLocation.toLowerCase())
          if (!matchesId && !matchesCode && !matchesLabel) return false
        } else {
          if (
            st.siteId !== selectedSiteFilter &&
            st.displayLocation.toLowerCase() !== selectedSiteFilter.toLowerCase()
          ) {
            return false
          }
        }
      }
      if (toolSearch.trim()) {
        const q = toolSearch.trim().toLowerCase()
        const name = (st.toolName || '').toLowerCase()
        const code = (st.toolCode || '').toLowerCase()
        const loc = (st.displayLocation || '').toLowerCase()
        const pName = (st.projectName || '').toLowerCase()
        if (!name.includes(q) && !code.includes(q) && !loc.includes(q) && !pName.includes(q)) return false
      }
      return true
    })
  }, [siteToolsBreakdown, selectedSiteFilter, toolSearch, uniqueLocationOptions])

  const toolMetrics = useMemo(() => {
    const totalAssets = tools.length
    const activeOnSite = tools.filter((t) => ['active_on_site', 'dispatched'].includes(String(t.status || t.currentStatus).toLowerCase())).length
    const inWarehouse = tools.filter((t) => ['at_company_warehouse', 'available'].includes(String(t.status || t.currentStatus).toLowerCase())).length
    const maintenanceCount = tools.filter((t) => ['under_maintenance', 'damaged'].includes(String(t.status || t.currentStatus).toLowerCase())).length
    return { totalAssets, activeOnSite, inWarehouse, maintenanceCount }
  }, [tools])

  // -----------------------------------------------------------------------------------
  // SITE-WISE COMBINED MATRIX DATA
  // -----------------------------------------------------------------------------------
  const siteWiseCombinedMatrix = useMemo(() => {
    const map = {}

    const getSiteObj = (sId, nameHint = '') => {
      if (!map[sId]) {
        const sName = resolveSiteName(sId, nameHint)
        map[sId] = {
          siteId: sId,
          siteName: sName,
          materials: [],
          tools: [],
        }
      }
      return map[sId]
    }

    // Initialize map with known sites & projects
    allSiteRecords.forEach((s) => {
      const sId = s.id || s.siteId || s.projectId
      if (sId && sId !== 'HQ' && sId !== 'COMPANY_HQ') {
        getSiteObj(sId, s.projectName || s.siteName || s.name || s.projectTitle)
      }
    })

    // Process siteMaterialPool
    siteMaterialPool.forEach((p) => {
      const sId = p.siteId
      if (!sId || sId === 'HQ' || sId === 'COMPANY_HQ') return
      const sObj = getSiteObj(sId, p.siteName || p.projectName)
      const qty = Number(p.currentBalance ?? p.availableQuantity ?? p.quantity ?? 0)
      if (qty > 0) {
        const matName = p.materialName || p.name || 'Material Item'
        const existing = sObj.materials.find((m) => m.materialName.toLowerCase() === matName.toLowerCase())
        if (existing) {
          existing.quantity += qty
        } else {
          sObj.materials.push({
            materialName: matName,
            quantity: qty,
            unit: p.unit || 'Units',
          })
        }
      }
    })

    // Process materialsAvailability siteAllocations if siteMaterialPool is missing items
    materialsAvailability.forEach((ma) => {
      const matName = ma.materialName || ma.name || ma.id || 'Material'
      const unit = ma.unit || 'Units'
      const siteAlloc = ma.siteAllocations || ma.siteBreakdown || {}
      Object.entries(siteAlloc).forEach(([sId, qty]) => {
        if (!sId || sId === 'HQ' || sId === 'COMPANY_HQ') return
        const numQty = Number(qty) || 0
        if (numQty > 0) {
          const sObj = getSiteObj(sId)
          const existing = sObj.materials.find((m) => m.materialName.toLowerCase() === matName.toLowerCase())
          if (!existing) {
            sObj.materials.push({
              materialName: matName,
              quantity: numQty,
              unit,
            })
          }
        }
      })
    })

    // Process siteToolsBreakdown
    siteToolsBreakdown.forEach((st) => {
      const sId = st.siteId
      if (!sId || sId === 'HQ' || sId === 'COMPANY_HQ') return
      const sObj = getSiteObj(sId, st.siteName)
      const qty = Number(st.quantityAvailable ?? st.totalAllocated ?? 0)
      if (qty > 0) {
        const existing = sObj.tools.find((t) => t.toolName.toLowerCase() === st.toolName.toLowerCase())
        if (existing) {
          existing.quantity += qty
        } else {
          sObj.tools.push({
            toolName: st.toolName,
            toolCode: st.toolCode,
            quantity: qty,
          })
        }
      }
    })

    return Object.values(map).filter((s) => s.materials.length > 0 || s.tools.length > 0)
  }, [allSiteRecords, siteMaterialPool, materialsAvailability, siteToolsBreakdown, resolveSiteName])

  return (
    <div className="space-y-6">
      {/* Read-Only Executive Banner */}
      <div className="bg-[#0B3470] text-white p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-blue-400/20 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 font-extrabold text-[10px] uppercase tracking-widest border border-blue-400/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                READ-ONLY MONITORING HUB
              </span>
              <span className="text-xs text-blue-200 font-medium">Organization Asset Telemetry</span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">Organization Inventory Overview</h1>
            <p className="text-xs text-blue-100/80 max-w-3xl mt-0.5">
              Monitor real-time company warehouse stock levels, active site tool allocations, equipment location telemetry, and audit movement logs.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-blue-900/40 p-2.5 rounded-xl border border-blue-400/30 text-xs">
            <Building2 className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-[10px] text-blue-200 font-bold uppercase block">Company Tools Stock</span>
              <strong className="text-sm font-extrabold text-white font-mono">{totalCompanyToolsCount} Units Available</strong>
            </div>
          </div>
        </div>

        {/* 4 Overview Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('materials')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'materials'
                ? 'bg-white text-[#0B3470] shadow-md font-extrabold'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Materials Inventory</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-[#0B3470] font-black">
              {materialMetrics.totalItems}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'tools'
                ? 'bg-white text-[#0B3470] shadow-md font-extrabold'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Tools & Equipment Telemetry</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-[#0B3470] font-black">
              {toolMetrics.totalAssets}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('site_matrix')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'site_matrix'
                ? 'bg-white text-[#0B3470] shadow-md font-extrabold'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Site-Wise Stock Breakdown</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-400 text-slate-950 font-black">
              {siteWiseCombinedMatrix.length} Sites
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-white text-[#0B3470] shadow-md font-extrabold'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Movement & Audit History</span>
          </button>
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* TAB 1: MATERIALS INVENTORY OVERVIEW */}
      {/* ===================================================================================== */}
      {activeTab === 'materials' && (
        <section className="space-y-6 animate-fade-in">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Master Material Catalog</span>
                <strong className="text-xl font-extrabold text-slate-900 block font-mono mt-0.5">{materialMetrics.totalItems} Items</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-[#0B3470]">
                <Boxes className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Company HQ Stock Value</span>
                <strong className="text-xl font-extrabold text-emerald-700 block font-mono mt-0.5">{money(materialMetrics.totalHqValue)}</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                <Building2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Site Allocated Stock Value</span>
                <strong className="text-xl font-extrabold text-indigo-700 block font-mono mt-0.5">{money(materialMetrics.totalSiteValue)}</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
                <Package className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Low Stock Reorder Alerts</span>
                <strong className="text-xl font-extrabold text-amber-600 block font-mono mt-0.5">{materialMetrics.lowStockCount} Items</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 max-w-lg">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={matSearch}
                    onChange={(e) => setMatSearch(e.target.value)}
                    placeholder="Search materials by name, category, HSN..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all"
                  />
                </div>

                <select
                  value={matCategory}
                  onChange={(e) => setMatCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white"
                >
                  <option value="all">All Categories</option>
                  {MATERIAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <ExportButton
                filename="ebricks_materials_inventory_overview"
                headers={['Material Name', 'Category', 'Unit', 'Company HQ Stock', 'Total Site Stock', 'Total Enterprise Stock', 'Unit Rate (INR)', 'Total Value (INR)', 'Status']}
                data={filteredMaterials.map((m) => [
                  m.materialName,
                  m.category || 'General',
                  m.unit || 'Bags',
                  m.hqStock,
                  m.totalSiteStock,
                  m.totalEnterpriseStock,
                  m.unitPrice,
                  m.totalValue,
                  m.isLowStock ? 'Low Stock' : 'Sufficient',
                ])}
                title="Export Materials Report"
              />
            </div>

            {/* Material Stock Overview Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Material Specification</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-center">Unit</th>
                    <th className="p-3 text-right">Company HQ Stock</th>
                    <th className="p-3 text-right">Total Site Stock</th>
                    <th className="p-3 text-right">Total Enterprise Stock</th>
                    <th className="p-3 text-right">Benchmark Rate</th>
                    <th className="p-3 text-center">Stock Level Status</th>
                    <th className="p-3">Site Allocation Details</th>
                    <th className="p-3 text-center">Telemetry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">
                        No materials recorded in backend database.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <strong className="text-slate-900 block font-bold">{m.materialName}</strong>
                          <small className="text-slate-400 font-mono">HSN: {m.hsnCode || '2523'}</small>
                        </td>
                        <td className="p-3">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {m.category}
                          </span>
                        </td>
                        <td className="p-3 text-center font-medium">{m.unit}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{m.hqStock} {m.unit}</td>
                        <td className="p-3 text-right font-mono font-semibold text-blue-700">{m.totalSiteStock} {m.unit}</td>
                        <td className="p-3 text-right font-mono font-extrabold text-emerald-700">{m.totalEnterpriseStock} {m.unit}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{money(m.unitPrice)}</td>
                        <td className="p-3 text-center">
                          {m.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                              <AlertTriangle className="w-3 h-3" /> Reorder Alert ({m.minReorderLevel})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Sufficient
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700 min-w-[220px]">
                          {m.siteBreakdown.length === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              No Site Allocation
                            </span>
                          ) : (
                            <div className="space-y-1 text-xs">
                              {m.siteBreakdown.map((sb, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 font-medium text-slate-800">
                                  <span className="text-blue-600 font-extrabold">•</span>
                                  <span className="font-bold text-slate-900">{sb.siteName}</span>
                                  <span className="text-slate-400 font-mono">—</span>
                                  <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 whitespace-nowrap">
                                    {sb.quantity} {sb.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedMaterialDetail(m)}
                            className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-50 border border-blue-200 transition-all cursor-pointer"
                            title="View Material Telemetry Card"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================================== */}
      {/* TAB 2: TOOLS & EQUIPMENT OVERVIEW */}
      {/* ===================================================================================== */}
      {activeTab === 'tools' && (
        <section className="space-y-6 animate-fade-in">
          {/* Tool Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Company/HQ Tools Stock</span>
                <strong className="text-xl font-extrabold text-blue-900 block font-mono mt-0.5">{totalCompanyToolsCount} Available</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-[#0B3470]">
                <Building2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Site Allocated Tools</span>
                <strong className="text-xl font-extrabold text-emerald-700 block font-mono mt-0.5">{totalSiteAllocatedToolsCount} Deployed</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                <Truck className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Fleet Equipment</span>
                <strong className="text-xl font-extrabold text-indigo-700 block font-mono mt-0.5">{toolMetrics.totalAssets} Asset Types</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
                <Wrench className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Maintenance & Repair</span>
                <strong className="text-xl font-extrabold text-rose-600 block font-mono mt-0.5">{toolMetrics.maintenanceCount} Servicing</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* SECTION A: SITE-WISE TOOLS ALLOCATION BREAKDOWN TABLE */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">CURRENT LOCATION TELEMETRY</span>
                <h2 className="text-base font-bold text-slate-900">Site-Wise Tool Allocation Breakdown</h2>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedSiteFilter}
                  onChange={(e) => setSelectedSiteFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white"
                >
                  <option value="all">All Locations (Sites & Company HQ)</option>
                  <option value="COMPANY_HQ">Company HQ Warehouse</option>
                  {uniqueLocationOptions.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.displayLocation}
                    </option>
                  ))}
                </select>

                <ExportButton
                  filename="ebricks_site_tools_allocation_breakdown"
                  headers={[
                    'Site / Project Location',
                    'Site ID / Code',
                    'Project Name',
                    'Tool Name & Code / ID',
                    'Quantity Available at Site',
                    'Total Quantity Allocated',
                    'Site Custodian / Supervisor',
                    'Status / Location Tag',
                    'Deployment Date',
                  ]}
                  data={filteredSiteTools.map((st) => [
                    st.displayLocation,
                    st.isCompanyHq ? 'HQ' : st.siteCode || st.siteId,
                    st.isCompanyHq ? 'Company HQ' : st.projectName || st.siteName,
                    `${st.toolName} (${st.toolCode})`,
                    st.quantityAvailable,
                    st.totalAllocated,
                    st.supervisorName,
                    st.locationTag,
                    st.deployedDate,
                  ])}
                  title="Export Site Allocations"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Site / Project Location</th>
                    <th className="p-3">Tool Name & Code / ID</th>
                    <th className="p-3 text-right">Quantity Available at Site</th>
                    <th className="p-3 text-right">Total Quantity Allocated</th>
                    <th className="p-3">Site Custodian / Supervisor</th>
                    <th className="p-3 text-center">Status / Location Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSiteTools.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No active site or warehouse tool allocations recorded in backend.
                      </td>
                    </tr>
                  ) : (
                    filteredSiteTools.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-blue-900">
                          <div className="flex items-start gap-1.5">
                            {st.isCompanyHq ? (
                              <Building2 className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                            )}
                            <div>
                              <span className="font-bold text-slate-900 block">{st.displayLocation}</span>
                              {st.isCompanyHq ? (
                                <span className="text-[11px] font-medium text-slate-500 block">
                                  Central Storage & Depot
                                </span>
                              ) : st.projectName && st.projectName !== st.siteName ? (
                                <span className="text-[11px] font-medium text-slate-500 block">
                                  Project: {st.projectName}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <strong className="text-slate-900 block">{st.toolName}</strong>
                          <span className="text-[11px] font-mono text-slate-500">ID: {st.toolCode}</span>
                        </td>
                        <td className="p-3 text-right font-mono font-extrabold text-emerald-700">
                          {st.quantityAvailable} {st.quantityAvailable === 1 ? 'Unit' : 'Units'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800">
                          {st.totalAllocated} {st.totalAllocated === 1 ? 'Unit' : 'Units'}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">
                          {st.supervisorName}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            st.isCompanyHq
                              ? 'bg-blue-100 text-[#0B3470] border border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {st.locationTag}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION B: COMPANY MASTER TOOLS FLEET REGISTER */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">ENTERPRISE MACHINERY CATALOG</span>
                <h2 className="text-base font-bold text-slate-900">Company Master Equipment Fleet Register</h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    placeholder="Search equipment by name, tag ID, serial..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all"
                  />
                </div>

                <select
                  value={toolStatusFilter}
                  onChange={(e) => setToolStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="warehouse">Company HQ Warehouse</option>
                  <option value="site">Active on Site</option>
                  <option value="maintenance">Under Repair</option>
                </select>
              </div>
            </div>

            {/* Equipment Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTools.length === 0 ? (
                <div className="col-span-full p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No equipment records matching filter.
                </div>
              ) : (
                filteredTools.map((t) => {
                  const isSite = ['active_on_site', 'dispatched'].includes(String(t.status || t.currentStatus).toLowerCase())
                  const isRepair = ['under_maintenance', 'damaged'].includes(String(t.status || t.currentStatus).toLowerCase())

                  return (
                    <div key={t.id} className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3 hover:border-blue-300 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">{t.category || 'Equipment'}</span>
                          <h3 className="text-sm font-extrabold text-slate-900 line-clamp-1">{t.toolName || t.name}</h3>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          isSite ? 'bg-emerald-100 text-emerald-800' : isRepair ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-[#0B3470]'
                        }`}>
                          {isSite ? 'Deployed on Site' : isRepair ? 'Under Repair' : 'Company HQ'}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600 border-t border-b border-slate-200/60 py-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Asset Tag Code / ID:</span>
                          <span className="font-mono font-bold text-slate-800">{t.assetTagId || t.toolCode || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Current Location:</span>
                          <span className="font-bold text-slate-800">{resolveSiteName(t.currentSiteId || t.siteId, t.currentSiteName) || COMPANY_HQ_WAREHOUSE_LABEL}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Ownership:</span>
                          <span className="font-semibold text-slate-700">{t.ownershipType || t.toolOwner || 'OWNED'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Condition:</span>
                          <span className="font-semibold text-emerald-700">{t.condition || 'OPERATIONAL'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px] font-bold text-slate-500">
                        <span>Available at Company HQ:</span>
                        <span className="font-mono font-extrabold text-slate-900">{t.availableCount ?? t.toolCount ?? 1} Units</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================================== */}
      {/* TAB: SITE-WISE INVENTORY OVERVIEW */}
      {/* ===================================================================================== */}
      {activeTab === 'site_matrix' && (
        <section className="space-y-6 animate-fade-in">
          {/* Executive Company vs Site Stock Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-[#0B3470] rounded-xl border border-blue-100">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Company HQ Stock</span>
                <span className="text-sm font-extrabold text-slate-900 block font-mono">
                  {materialMetrics.totalItems} Materials ({materialMetrics.totalHqValue ? money(materialMetrics.totalHqValue) : 'In Stock'})
                </span>
                <span className="text-xs font-semibold text-blue-700 font-mono">
                  {totalCompanyToolsCount} Tool Units at HQ
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Site Allocated Stock</span>
                <span className="text-sm font-extrabold text-slate-900 block font-mono">
                  {materialMetrics.totalSiteValue ? money(materialMetrics.totalSiteValue) : 'Active Site Materials'}
                </span>
                <span className="text-xs font-semibold text-emerald-700 font-mono">
                  {totalSiteAllocatedToolsCount} Tool Units Deployed across Sites
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 sm:col-span-2 lg:col-span-1">
              <div className="p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Monitored Sites</span>
                <span className="text-sm font-extrabold text-slate-900 block font-mono">
                  {siteWiseCombinedMatrix.length} Projects with Inventory
                </span>
                <span className="text-xs font-medium text-slate-500">Read-Only Telemetry View</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">SITE-WISE INVENTORY OVERVIEW</span>
                <h2 className="text-base font-bold text-slate-900">Project / Site Inventory Details</h2>
              </div>

              <ExportButton
                filename="ebricks_site_wise_inventory_matrix"
                headers={['Site Name', 'Type', 'Item Name', 'Quantity', 'Unit']}
                data={siteWiseCombinedMatrix.flatMap((s) => [
                  ...s.materials.map((m) => [s.siteName, 'Material', m.materialName, m.quantity, m.unit]),
                  ...s.tools.map((t) => [s.siteName, 'Tool / Equipment', t.toolName, t.quantity || t.quantityAvailable || 1, 'Units']),
                ])}
                title="Export Matrix"
              />
            </div>

            {siteWiseCombinedMatrix.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No active project sites with allocated materials or tools found.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {siteWiseCombinedMatrix.map((site) => {
                  const totalMaterialTypes = site.materials.length
                  const totalToolUnits = site.tools.reduce((acc, curr) => acc + (Number(curr.quantity ?? curr.quantityAvailable) || 0), 0)

                  return (
                    <div key={site.siteId} className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-slate-50/50 shadow-xs hover:border-slate-300 transition-all">
                      {/* Site Title Header */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3 bg-white -mx-5 -mt-5 p-4 rounded-t-2xl border-t-0">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-blue-50 text-[#0B3470] rounded-xl border border-blue-100">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest block">Project / Site</span>
                            <h3 className="text-base font-extrabold text-slate-900">{site.siteName}</h3>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 font-bold">
                          Site ID: {site.siteId}
                        </span>
                      </div>

                      <div className="space-y-4 pt-1">
                        {/* Materials Section */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/90 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Boxes className="w-4 h-4 text-blue-600" />
                              <span>Materials</span>
                            </h4>
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-mono">
                              Total Materials: {totalMaterialTypes} {totalMaterialTypes === 1 ? 'Type' : 'Types'}
                            </span>
                          </div>

                          {site.materials.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-1">No materials currently allocated to this site</p>
                          ) : (
                            <div className="space-y-1.5 text-xs">
                              {site.materials.map((m, idx) => (
                                <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
                                  <span className="font-semibold text-slate-700">{m.materialName}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">→</span>
                                    <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                      {m.quantity} {m.unit}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Tools Section */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200/90 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Wrench className="w-4 h-4 text-amber-600" />
                              <span>Tools</span>
                            </h4>
                            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md font-mono">
                              Total Tools: {totalToolUnits} {totalToolUnits === 1 ? 'Unit' : 'Units'}
                            </span>
                          </div>

                          {site.tools.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-1">No tools currently allocated to this site</p>
                          ) : (
                            <div className="space-y-1.5 text-xs">
                              {site.tools.map((t, idx) => (
                                <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
                                  <div>
                                    <span className="font-semibold text-slate-700 block">{t.toolName}</span>
                                    {t.toolCode && <span className="text-[10px] text-slate-400 font-mono">Code: {t.toolCode}</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">→</span>
                                    <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                      {t.quantity || t.quantityAvailable || 1} {t.quantity === 1 ? 'Unit' : 'Units'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================================================================================== */}
      {/* TAB 4: AUDIT HISTORY & MOVEMENT LEDGER (READ-ONLY) */}
      {/* ===================================================================================== */}
      {activeTab === 'audit' && (
        <section className="space-y-6 animate-fade-in">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">REAL-TIME TRANSACTION LEDGER</p>
                <h2 className="text-base font-bold text-slate-900">Inventory Movement & Gate Pass Audit History</h2>
              </div>
              <ExportButton
                filename="ebricks_inventory_movement_audit_ledger"
                headers={['Timestamp', 'Movement Type', 'Item Name', 'Quantity', 'Source Location', 'Destination Site', 'Dispatched By']}
                data={materialTransactions.map((t) => [
                  t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleString('en-IN') : t.date || 'N/A',
                  t.transactionType || 'TRANSFER',
                  t.materialName || t.toolName,
                  `${t.quantity} ${t.unit || ''}`,
                  t.from || 'Company HQ',
                  resolveSiteName(t.toSiteId, t.toSiteName || t.toSite),
                  t.dispatchedBy || t.managerName || 'Operations Manager',
                ])}
                title="Export Audit Ledger"
              />
            </div>

            {/* Audit Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3">Timestamp / Ref</th>
                    <th className="p-3">Movement Type</th>
                    <th className="p-3">Item Details</th>
                    <th className="p-3 text-right">Quantity</th>
                    <th className="p-3">Source → Destination</th>
                    <th className="p-3">Dispatched By</th>
                    <th className="p-3 text-center">Transfer Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {materialTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No movement audit records found in backend database.
                      </td>
                    </tr>
                  ) : (
                    materialTransactions.slice(0, 50).map((t, idx) => (
                      <tr key={t.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-500">
                          {t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleString('en-IN') : t.date || 'N/A'}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {t.transactionType || 'TRANSFER'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-900">{t.materialName || t.toolName}</td>
                        <td className="p-3 text-right font-mono font-extrabold text-slate-900">{t.quantity} {t.unit || ''}</td>
                        <td className="p-3 font-medium text-slate-700">
                          {t.from || 'Company HQ'} → <span className="text-blue-700 font-bold">{resolveSiteName(t.toSiteId, t.toSiteName || t.toSite)}</span>
                        </td>
                        <td className="p-3 text-slate-600">{t.dispatchedBy || t.managerName || 'HQ Admin'}</td>
                        <td className="p-3 text-center">
                          <StatusBadge status={t.receivedStatus || t.status || 'Completed'} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================================== */}
      {/* TELEMETRY MODAL CARD FOR SELECTED MATERIAL */}
      {/* ===================================================================================== */}
      {selectedMaterialDetail && (
        <Modal
          isOpen={!!selectedMaterialDetail}
          onClose={() => setSelectedMaterialDetail(null)}
          title={`Material Inventory Telemetry — ${selectedMaterialDetail.materialName}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-1.5">
              <div className="flex justify-between items-center border-b border-blue-200/50 pb-1.5">
                <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Material Specification</span>
                <span className="font-extrabold text-[#0B3470] text-sm">{selectedMaterialDetail.materialName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-semibold text-slate-800">{selectedMaterialDetail.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Primary Unit:</span>
                <span className="font-semibold text-slate-800">{selectedMaterialDetail.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Benchmark Rate:</span>
                <span className="font-bold text-slate-900">{money(selectedMaterialDetail.unitPrice)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Company HQ Stock</span>
                <strong className="text-sm font-extrabold text-slate-900 font-mono mt-0.5 block">
                  {selectedMaterialDetail.hqStock} {selectedMaterialDetail.unit}
                </strong>
              </div>
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                <span className="text-[10px] text-blue-600 font-bold uppercase block">Total Site Stock</span>
                <strong className="text-sm font-extrabold text-blue-900 font-mono mt-0.5 block">
                  {selectedMaterialDetail.totalSiteStock} {selectedMaterialDetail.unit}
                </strong>
              </div>
              <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                <span className="text-[10px] text-emerald-600 font-bold uppercase block">Enterprise Total Stock</span>
                <strong className="text-sm font-extrabold text-emerald-900 font-mono mt-0.5 block">
                  {selectedMaterialDetail.totalEnterpriseStock} {selectedMaterialDetail.unit}
                </strong>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <h4 className="font-bold text-slate-900 text-xs flex items-center justify-between">
                <span>Site Allocation Details</span>
                <span className="text-[10px] font-mono text-slate-400">
                  {selectedMaterialDetail.siteBreakdown.length} Project Sites
                </span>
              </h4>

              {selectedMaterialDetail.siteBreakdown.length === 0 ? (
                <p className="text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center border border-dashed border-slate-200">
                  No Site Allocation
                </p>
              ) : (
                <ul className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  {selectedMaterialDetail.siteBreakdown.map((sb, idx) => (
                    <li key={idx} className="flex items-center justify-between border-b border-slate-200/60 pb-1.5 last:border-0 last:pb-0">
                      <span className="flex items-center gap-2 font-bold text-slate-900">
                        <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                        {sb.siteName}
                      </span>
                      <span className="font-mono font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 shadow-2xs">
                        {sb.quantity} {sb.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMaterialDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 transition-all cursor-pointer"
              >
                Close Telemetry
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

