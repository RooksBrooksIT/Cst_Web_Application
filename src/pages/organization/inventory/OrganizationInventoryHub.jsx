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
  X,
  ArrowRight,
  Filter,
  Table,
  List,
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

export default function OrganizationInventoryHub({ sites = [], projects = [], module }) {
  const { orgId } = useAuth()

  // Default tab based on route / module prop
  const [activeTab, setActiveTab] = useState(() => {
    if (['tools', 'assets', 'equipment'].includes(module)) return 'tools'
    if (['materials', 'inventory'].includes(module)) return 'materials'
    return 'materials'
  })

  // Synchronize active tab if module prop changes
  useEffect(() => {
    if (['tools', 'assets', 'equipment'].includes(module)) {
      setActiveTab('tools')
    } else if (['materials', 'inventory'].includes(module)) {
      setActiveTab('materials')
    }
  }, [module])

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

  // Filters for Materials (Tab 1: Inventory Table)
  const [matSearch, setMatSearch] = useState('')
  const [matCategory, setMatCategory] = useState('all')
  const [matStockFilter, setMatStockFilter] = useState('all') // 'all' | 'low_stock' | 'in_stock'

  // Filters for Machinery & Equipment (Tab 2: Assets Tables)
  const [assetViewMode, setAssetViewMode] = useState('allocations') // 'allocations' | 'fleet'
  const [toolSearch, setToolSearch] = useState('')
  const [toolCategory, setToolCategory] = useState('all')
  const [toolStatusFilter, setToolStatusFilter] = useState('all')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('all')

  // Filters for Site Stock Matrix (Tab 3: Site Matrix Tables)
  const [matrixViewMode, setMatrixViewMode] = useState('detailed') // 'detailed' | 'summary'
  const [siteMatrixSearch, setSiteMatrixSearch] = useState('')
  const [matrixSiteFilter, setMatrixSiteFilter] = useState('all')
  const [matrixTypeFilter, setMatrixTypeFilter] = useState('all') // 'all' | 'materials' | 'tools'

  // Filters for Movement & Audit (Tab 4: Audit Table)
  const [auditSearch, setAuditSearch] = useState('')
  const [auditTypeFilter, setAuditTypeFilter] = useState('all')

  // Real-time subscriptions
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
      if (matStockFilter === 'low_stock' && !m.isLowStock) return false
      if (matStockFilter === 'in_stock' && m.isLowStock) return false
      if (matSearch.trim()) {
        const q = matSearch.trim().toLowerCase()
        const name = (m.materialName || '').toLowerCase()
        const cat = (m.category || '').toLowerCase()
        const hsn = (m.hsnCode || '').toLowerCase()
        if (!name.includes(q) && !cat.includes(q) && !hsn.includes(q)) return false
      }
      return true
    })
  }, [materialMatrix, matCategory, matStockFilter, matSearch])

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

    // 1. Process Tools Allocated to Sites
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

  // Unique location options for dropdown selection
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

    // Process materialsAvailability siteAllocations fallback
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

  // Filtered Site Matrix (by Site selection and search)
  const filteredSiteMatrix = useMemo(() => {
    return siteWiseCombinedMatrix.filter((s) => {
      if (matrixSiteFilter !== 'all' && s.siteId !== matrixSiteFilter) {
        return false
      }
      if (siteMatrixSearch.trim()) {
        const q = siteMatrixSearch.trim().toLowerCase()
        const matchName = (s.siteName || '').toLowerCase().includes(q)
        const matchId = (s.siteId || '').toLowerCase().includes(q)
        const matchMat = s.materials.some((m) => (m.materialName || '').toLowerCase().includes(q))
        const matchTool = s.tools.some((t) => (t.toolName || '').toLowerCase().includes(q) || (t.toolCode || '').toLowerCase().includes(q))
        if (!matchName && !matchId && !matchMat && !matchTool) return false
      }
      return true
    })
  }, [siteWiseCombinedMatrix, matrixSiteFilter, siteMatrixSearch])

  // Flattened Structured Inventory Rows for Tab 3 (Site Stock Matrix Table)
  const flattenedSiteInventory = useMemo(() => {
    const rows = []
    filteredSiteMatrix.forEach((site) => {
      // Materials
      if (matrixTypeFilter === 'all' || matrixTypeFilter === 'materials') {
        site.materials.forEach((m, idx) => {
          const matMatch = materialMatrix.find((mat) => cleanKey(mat.materialName) === cleanKey(m.materialName))
          const unitPrice = matMatch?.unitPrice || 0
          const totalValue = (m.quantity || 0) * unitPrice

          rows.push({
            id: `${site.siteId}_mat_${idx}_${cleanKey(m.materialName)}`,
            siteId: site.siteId,
            siteName: site.siteName,
            type: 'Material',
            itemName: m.materialName,
            itemCode: matMatch?.hsnCode ? `HSN: ${matMatch.hsnCode}` : 'MAT-STOCK',
            category: matMatch?.category || 'General',
            quantity: m.quantity,
            unit: m.unit || 'Units',
            unitPrice,
            totalValue,
            status: 'Allocated at Site',
          })
        })
      }

      // Tools
      if (matrixTypeFilter === 'all' || matrixTypeFilter === 'tools') {
        site.tools.forEach((t, idx) => {
          const qty = Number(t.quantity || t.quantityAvailable || 1)
          rows.push({
            id: `${site.siteId}_tool_${idx}_${cleanKey(t.toolName)}`,
            siteId: site.siteId,
            siteName: site.siteName,
            type: 'Equipment',
            itemName: t.toolName,
            itemCode: t.toolCode || 'EQ-TOOL',
            category: 'Machinery & Tools',
            quantity: qty,
            unit: qty === 1 ? 'Unit' : 'Units',
            unitPrice: 0,
            totalValue: 0,
            status: 'Deployed on Site',
          })
        })
      }
    })

    return rows
  }, [filteredSiteMatrix, matrixTypeFilter, materialMatrix])

  // Site Rollup Summary for Tab 3 (Site Summary Table Mode)
  const siteRollupSummaries = useMemo(() => {
    return filteredSiteMatrix.map((site) => {
      const materialCount = site.materials.length
      const toolUnits = site.tools.reduce((acc, curr) => acc + (Number(curr.quantity ?? curr.quantityAvailable) || 0), 0)
      const totalEstimatedValue = site.materials.reduce((acc, curr) => {
        const matMatch = materialMatrix.find((mat) => cleanKey(mat.materialName) === cleanKey(curr.materialName))
        const rate = matMatch?.unitPrice || 0
        return acc + (Number(curr.quantity) || 0) * rate
      }, 0)

      return {
        siteId: site.siteId,
        siteName: site.siteName,
        materialTypes: materialCount,
        toolUnits,
        totalEstimatedValue,
        status: 'Active Site',
      }
    })
  }, [filteredSiteMatrix, materialMatrix])

  // Filtered Transactions for Tab 4 (Movement & Audit Table)
  const filteredTransactions = useMemo(() => {
    return materialTransactions.filter((t) => {
      if (auditTypeFilter !== 'all') {
        const type = (t.transactionType || 'TRANSFER').toUpperCase()
        if (type !== auditTypeFilter.toUpperCase()) return false
      }
      if (auditSearch.trim()) {
        const q = auditSearch.trim().toLowerCase()
        const name = (t.materialName || t.toolName || '').toLowerCase()
        const from = (t.from || '').toLowerCase()
        const to = resolveSiteName(t.toSiteId, t.toSiteName || t.toSite).toLowerCase()
        const by = (t.dispatchedBy || t.managerName || '').toLowerCase()
        const type = (t.transactionType || '').toLowerCase()
        if (!name.includes(q) && !from.includes(q) && !to.includes(q) && !by.includes(q) && !type.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [materialTransactions, auditTypeFilter, auditSearch, resolveSiteName])

  return (
    <div className="space-y-6">
      {/* ===================================================================================== */}
      {/* 1. PROFESSIONAL EXECUTIVE HEADER */}
      {/* ===================================================================================== */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-50 text-[#0B3470] border border-blue-200/80">
              Supply Chain & Asset Governance
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-medium">Central Enterprise Hub</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Inventory & Enterprise Assets
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Real-time tracking of company warehouse stock, materials allocated across project sites, machinery deployment, and audit movement logs.
          </p>
        </div>

        {/* Quick Enterprise Stat Badges */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <Boxes className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Materials Catalog</span>
              <strong className="text-sm font-extrabold text-slate-900 font-mono">{materialMetrics.totalItems} Items</strong>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">HQ Warehouse Tools</span>
              <strong className="text-sm font-extrabold text-slate-900 font-mono">{totalCompanyToolsCount} Units</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* 2. UNIFIED TAB NAVIGATION */}
      {/* ===================================================================================== */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-1.5 overflow-x-auto touch-pan-x scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('materials')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'materials'
              ? 'bg-[#0B3470] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Materials & Stock</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'materials' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {materialMetrics.totalItems}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'tools'
              ? 'bg-[#0B3470] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Machinery & Assets</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'tools' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {toolMetrics.totalAssets}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('site_matrix')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'site_matrix'
              ? 'bg-[#0B3470] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Site Stock Matrix</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'site_matrix' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {siteWiseCombinedMatrix.length} Sites
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-[#0B3470] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Movement Audit Log</span>
          {materialTransactions.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'audit' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {materialTransactions.length}
            </span>
          )}
        </button>
      </div>

      {/* ===================================================================================== */}
      {/* TAB 1: MATERIALS & STOCK (STRUCTURED INVENTORY TABLE) */}
      {/* ===================================================================================== */}
      {activeTab === 'materials' && (
        <section className="space-y-6 animate-fade-in">
          {/* Summary Metric Strip (Interactive Quick Filters) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <button
              type="button"
              onClick={() => setMatStockFilter('all')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                matStockFilter === 'all'
                  ? 'bg-white border-blue-500/40 shadow-xs ring-2 ring-blue-500/10'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Master Materials
                </span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                  <Boxes className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                {materialMetrics.totalItems} Items
              </div>
              <div className="text-[11px] mt-1 text-slate-400">Total Catalog Specifications</div>
            </button>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  HQ Stock Value
                </span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
                {money(materialMetrics.totalHqValue)}
              </div>
              <div className="text-[11px] mt-1 text-slate-400">Company Warehouse Reserve</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Site Stock Value
                </span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-indigo-700 font-mono">
                {money(materialMetrics.totalSiteValue)}
              </div>
              <div className="text-[11px] mt-1 text-slate-400">Active Deployed at Sites</div>
            </div>

            <button
              type="button"
              onClick={() => setMatStockFilter(matStockFilter === 'low_stock' ? 'all' : 'low_stock')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                matStockFilter === 'low_stock'
                  ? 'bg-amber-50/70 border-amber-500 shadow-xs ring-2 ring-amber-500/20'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Low Stock Alerts
                </span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-700 font-mono">
                {materialMetrics.lowStockCount} Items
              </div>
              <div className="text-[11px] mt-1 text-amber-800 font-medium">
                {matStockFilter === 'low_stock' ? 'Filtered: Low Stock Only' : 'Below Safety Threshold'}
              </div>
            </button>
          </div>

          {/* Table Container with Integrated Toolbar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={matSearch}
                    onChange={(e) => setMatSearch(e.target.value)}
                    placeholder="Search material name, category, HSN..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all placeholder:text-slate-400"
                  />
                  {matSearch && (
                    <button
                      type="button"
                      onClick={() => setMatSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                <select
                  value={matCategory}
                  onChange={(e) => setMatCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {MATERIAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Stock Level Filter */}
                <select
                  value={matStockFilter}
                  onChange={(e) => setMatStockFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Stock Levels</option>
                  <option value="low_stock">⚠️ Low Stock Alerts</option>
                  <option value="in_stock">✓ Sufficient Stock</option>
                </select>
              </div>

              <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                <span className="text-xs text-slate-400 font-medium font-mono">
                  {filteredMaterials.length} of {materialMatrix.length} items
                </span>
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
            </div>

            {/* Material Stock Overview Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="p-3 whitespace-nowrap">Material Specification</th>
                    <th className="p-3 whitespace-nowrap">Category</th>
                    <th className="p-3 text-center whitespace-nowrap">Unit</th>
                    <th className="p-3 text-right whitespace-nowrap">Company HQ Stock</th>
                    <th className="p-3 text-right whitespace-nowrap">Total Site Stock</th>
                    <th className="p-3 text-right whitespace-nowrap">Enterprise Total</th>
                    <th className="p-3 text-right whitespace-nowrap">Benchmark Rate</th>
                    <th className="p-3 text-right whitespace-nowrap">Total Valuation</th>
                    <th className="p-3 text-center whitespace-nowrap">Stock Status</th>
                    <th className="p-3 whitespace-nowrap">Site Allocation Details</th>
                    <th className="p-3 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400 bg-slate-50/50">
                        No materials found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <strong className="text-slate-900 block font-bold">{m.materialName}</strong>
                          <span className="text-slate-400 font-mono text-[11px]">HSN: {m.hsnCode || '2523'}</span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {m.category}
                          </span>
                        </td>
                        <td className="p-3 text-center font-medium text-slate-600 whitespace-nowrap">{m.unit}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                          {m.hqStock} <span className="text-slate-400 font-normal">{m.unit}</span>
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-blue-700 whitespace-nowrap">
                          {m.totalSiteStock} <span className="text-slate-400 font-normal">{m.unit}</span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                          <span className="bg-emerald-50/70 px-2 py-0.5 rounded border border-emerald-100">
                            {m.totalEnterpriseStock} {m.unit}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-800 font-mono whitespace-nowrap">
                          {money(m.unitPrice)}
                        </td>
                        <td className="p-3 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                          {money(m.totalValue)}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {m.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Low Stock ({m.minReorderLevel})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Sufficient
                            </span>
                          )}
                        </td>
                        <td className="p-3 min-w-[200px]">
                          {m.siteBreakdown.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic">No Site Allocation</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5 max-w-[280px]">
                              {m.siteBreakdown.slice(0, 2).map((sb, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                                  title={`${sb.siteName}: ${sb.quantity} ${sb.unit}`}
                                >
                                  <span className="truncate max-w-[110px] font-semibold text-slate-800">{sb.siteName}</span>
                                  <span className="font-mono font-bold text-emerald-700">{sb.quantity}</span>
                                </span>
                              ))}
                              {m.siteBreakdown.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedMaterialDetail(m)}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                                  title="View all site allocations"
                                >
                                  +{m.siteBreakdown.length - 2} more
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedMaterialDetail(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#0B3470] hover:bg-blue-50 border border-blue-200/80 transition-colors cursor-pointer"
                            title="View material telemetry breakdown"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Details</span>
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
      {/* TAB 2: MACHINERY & EQUIPMENT (STRUCTURED ASSET TABLES) */}
      {/* ===================================================================================== */}
      {activeTab === 'tools' && (
        <section className="space-y-6 animate-fade-in">
          {/* Tool Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  HQ Warehouse Stock
                </span>
                <div className="p-2 rounded-xl bg-blue-50 text-[#0B3470]">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                {totalCompanyToolsCount} Available
              </div>
              <div className="text-[11px] mt-1 text-slate-400">Central Depot Ready</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Site Deployed Tools
                </span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
                {totalSiteAllocatedToolsCount} Deployed
              </div>
              <div className="text-[11px] mt-1 text-slate-400">Active across Project Sites</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Master Equipment Fleet
                </span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                  <Wrench className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-indigo-700 font-mono">
                {toolMetrics.totalAssets} Asset Types
              </div>
              <div className="text-[11px] mt-1 text-slate-400">Total Registered Machinery</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">
                  Maintenance & Repair
                </span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <ShieldAlert className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-600 font-mono">
                {toolMetrics.maintenanceCount} Servicing
              </div>
              <div className="text-[11px] mt-1 text-rose-700 font-medium">Under Maintenance or Repair</div>
            </div>
          </div>

          {/* Sub-View Navigation Switcher (Structured Tables) */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => setAssetViewMode('allocations')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                assetViewMode === 'allocations'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Location Allocation Table</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                assetViewMode === 'allocations' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {filteredSiteTools.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAssetViewMode('fleet')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                assetViewMode === 'fleet'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Master Equipment Fleet Table</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                assetViewMode === 'fleet' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {filteredTools.length}
              </span>
            </button>
          </div>

          {/* SUB-VIEW A: SITE-WISE TOOLS ALLOCATION BREAKDOWN TABLE */}
          {assetViewMode === 'allocations' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={toolSearch}
                      onChange={(e) => setToolSearch(e.target.value)}
                      placeholder="Search tool name, code, site, project..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all placeholder:text-slate-400"
                    />
                    {toolSearch && (
                      <button
                        type="button"
                        onClick={() => setToolSearch('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Location Filter */}
                  <select
                    value={selectedSiteFilter}
                    onChange={(e) => setSelectedSiteFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                  >
                    <option value="all">All Locations (Sites & HQ)</option>
                    <option value="COMPANY_HQ">Company HQ Warehouse</option>
                    {uniqueLocationOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.displayLocation}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                  <span className="text-xs text-slate-400 font-medium font-mono">
                    {filteredSiteTools.length} allocation records
                  </span>
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

              {/* Allocation Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="p-3 whitespace-nowrap">Site / Project Location</th>
                      <th className="p-3 text-center whitespace-nowrap">Site Code</th>
                      <th className="p-3 whitespace-nowrap">Equipment Specification</th>
                      <th className="p-3 text-right whitespace-nowrap">Available at Site</th>
                      <th className="p-3 text-right whitespace-nowrap">Total Allocated</th>
                      <th className="p-3 whitespace-nowrap">Site Custodian / Supervisor</th>
                      <th className="p-3 whitespace-nowrap">Deployment Date</th>
                      <th className="p-3 text-center whitespace-nowrap">Location Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSiteTools.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 bg-slate-50/50">
                          No tool allocations found matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredSiteTools.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 font-medium text-slate-900">
                            <div className="flex items-start gap-2">
                              {st.isCompanyHq ? (
                                <Building2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                              ) : (
                                <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                              )}
                              <div>
                                <strong className="font-bold text-slate-900 block">{st.displayLocation}</strong>
                                {st.isCompanyHq ? (
                                  <span className="text-[11px] text-slate-400">Central Warehouse Depot</span>
                                ) : st.projectName && st.projectName !== st.siteName ? (
                                  <span className="text-[11px] text-slate-400">Project: {st.projectName}</span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-semibold">
                              {st.isCompanyHq ? 'HQ' : st.siteCode || st.siteId || 'SITE'}
                            </span>
                          </td>
                          <td className="p-3">
                            <strong className="text-slate-900 block font-bold">{st.toolName}</strong>
                            <span className="text-[11px] font-mono text-slate-500">ID: {st.toolCode}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            {st.quantityAvailable} <span className="font-normal text-slate-400">{st.quantityAvailable === 1 ? 'Unit' : 'Units'}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {st.totalAllocated} <span className="font-normal text-slate-400">{st.totalAllocated === 1 ? 'Unit' : 'Units'}</span>
                          </td>
                          <td className="p-3 text-slate-700 font-medium whitespace-nowrap">
                            {st.supervisorName}
                          </td>
                          <td className="p-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                            {st.deployedDate}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              st.isCompanyHq
                                ? 'bg-blue-50 text-[#0B3470] border border-blue-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
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
          )}

          {/* SUB-VIEW B: MASTER EQUIPMENT FLEET TABLE */}
          {assetViewMode === 'fleet' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={toolSearch}
                      onChange={(e) => setToolSearch(e.target.value)}
                      placeholder="Search equipment by name, tag ID, serial..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all placeholder:text-slate-400"
                    />
                    {toolSearch && (
                      <button
                        type="button"
                        onClick={() => setToolSearch('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Filter */}
                  <select
                    value={toolCategory}
                    onChange={(e) => setToolCategory(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                  >
                    <option value="all">All Categories</option>
                    {TOOL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Status Filter */}
                  <select
                    value={toolStatusFilter}
                    onChange={(e) => setToolStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                  >
                    <option value="all">All Fleet Statuses</option>
                    <option value="warehouse">Company HQ Warehouse</option>
                    <option value="site">Active on Site</option>
                    <option value="maintenance">Under Repair / Maintenance</option>
                  </select>
                </div>

                <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                  <span className="text-xs text-slate-400 font-medium font-mono">
                    {filteredTools.length} fleet records
                  </span>
                  <ExportButton
                    filename="ebricks_equipment_fleet_register"
                    headers={['Tool Name', 'Asset Tag ID', 'Category', 'Current Location', 'Ownership', 'Condition', 'Status', 'Available HQ Units']}
                    data={filteredTools.map((t) => [
                      t.toolName || t.name,
                      t.assetTagId || t.toolCode || 'N/A',
                      t.category || 'Equipment',
                      resolveSiteName(t.currentSiteId || t.siteId, t.currentSiteName) || COMPANY_HQ_WAREHOUSE_LABEL,
                      t.ownershipType || t.toolOwner || 'OWNED',
                      t.condition || 'OPERATIONAL',
                      t.status || t.currentStatus || 'Available',
                      t.availableCount ?? t.toolCount ?? 1,
                    ])}
                    title="Export Equipment Fleet"
                  />
                </div>
              </div>

              {/* Master Equipment Fleet Structured Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="p-3 whitespace-nowrap">Equipment Specification</th>
                      <th className="p-3 text-center whitespace-nowrap">Asset Tag / Code</th>
                      <th className="p-3 whitespace-nowrap">Category</th>
                      <th className="p-3 whitespace-nowrap">Current Location</th>
                      <th className="p-3 text-center whitespace-nowrap">Ownership</th>
                      <th className="p-3 text-center whitespace-nowrap">Condition</th>
                      <th className="p-3 text-center whitespace-nowrap">Fleet Status</th>
                      <th className="p-3 text-right whitespace-nowrap">Available at HQ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredTools.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 bg-slate-50/50">
                          No equipment fleet items found matching filters.
                        </td>
                      </tr>
                    ) : (
                      filteredTools.map((t) => {
                        const isSite = ['active_on_site', 'dispatched'].includes(String(t.status || t.currentStatus).toLowerCase())
                        const isRepair = ['under_maintenance', 'damaged'].includes(String(t.status || t.currentStatus).toLowerCase())
                        const location = resolveSiteName(t.currentSiteId || t.siteId, t.currentSiteName) || COMPANY_HQ_WAREHOUSE_LABEL

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3">
                              <strong className="text-slate-900 block font-bold">{t.toolName || t.name}</strong>
                              {t.serialNumber && (
                                <span className="text-[11px] font-mono text-slate-400">SN: {t.serialNumber}</span>
                              )}
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {t.assetTagId || t.toolCode || 'N/A'}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {t.category || 'Equipment'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                {isSite ? (
                                  <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                ) : (
                                  <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                )}
                                <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={location}>
                                  {location}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {t.ownershipType || t.toolOwner || 'OWNED'}
                              </span>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {t.condition || 'OPERATIONAL'}
                              </span>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isSite
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : isRepair
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : 'bg-blue-50 text-[#0B3470] border border-blue-200'
                              }`}>
                                {isSite ? 'Active on Site' : isRepair ? 'Under Repair' : 'HQ Warehouse'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                              {t.availableCount ?? t.toolCount ?? 1} <span className="font-normal text-slate-400">Units</span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===================================================================================== */}
      {/* TAB 3: SITE STOCK MATRIX (STRUCTURED SITE MATRIX TABLES) */}
      {/* ===================================================================================== */}
      {activeTab === 'site_matrix' && (
        <section className="space-y-6 animate-fade-in">
          {/* Executive Company vs Site Stock Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5">
              <div className="p-3 bg-blue-50 text-[#0B3470] rounded-xl border border-blue-100 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Company HQ Central Stock</span>
                <span className="text-sm font-extrabold text-slate-900 block font-mono">
                  {materialMetrics.totalItems} Materials ({money(materialMetrics.totalHqValue)})
                </span>
                <span className="text-xs font-semibold text-blue-700 font-mono">
                  {totalCompanyToolsCount} Tool Units in HQ Reserve
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5">
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Site Allocated Outflow</span>
                <span className="text-sm font-extrabold text-slate-900 block font-mono">
                  {money(materialMetrics.totalSiteValue)} Site Materials
                </span>
                <span className="text-xs font-semibold text-emerald-700 font-mono">
                  {totalSiteAllocatedToolsCount} Tool Units Deployed at Sites
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5 sm:col-span-2 lg:col-span-1">
              <div className="p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Monitored Sites</span>
                <span className="text-sm font-extrabold text-slate-900 block font-mono">
                  {siteWiseCombinedMatrix.length} Projects with Inventory
                </span>
                <span className="text-xs font-medium text-slate-500">Live Telemetry Synchronized</span>
              </div>
            </div>
          </div>

          {/* Site Matrix Content Container */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={siteMatrixSearch}
                    onChange={(e) => setSiteMatrixSearch(e.target.value)}
                    placeholder="Search project sites or allocated items..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all placeholder:text-slate-400"
                  />
                  {siteMatrixSearch && (
                    <button
                      type="button"
                      onClick={() => setSiteMatrixSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter by Site */}
                <select
                  value={matrixSiteFilter}
                  onChange={(e) => setMatrixSiteFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Project Sites ({siteWiseCombinedMatrix.length})</option>
                  {siteWiseCombinedMatrix.map((s) => (
                    <option key={s.siteId} value={s.siteId}>
                      {s.siteName}
                    </option>
                  ))}
                </select>

                {/* Filter by Item Type */}
                <select
                  value={matrixTypeFilter}
                  onChange={(e) => setMatrixTypeFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Inventory Types</option>
                  <option value="materials">Materials Only</option>
                  <option value="tools">Machinery & Tools Only</option>
                </select>
              </div>

              {/* View Switcher & Export */}
              <div className="flex items-center gap-2.5 justify-between lg:justify-end">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setMatrixViewMode('detailed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      matrixViewMode === 'detailed'
                        ? 'bg-[#0B3470] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Item Ledger</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMatrixViewMode('summary')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      matrixViewMode === 'summary'
                        ? 'bg-[#0B3470] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Site Summary</span>
                  </button>
                </div>

                <ExportButton
                  filename="ebricks_site_wise_inventory_matrix"
                  headers={['Project / Site Name', 'Site ID', 'Inventory Type', 'Item Name', 'Item Code / Tag', 'Category', 'Quantity', 'Unit', 'Est. Value (INR)', 'Status']}
                  data={flattenedSiteInventory.map((r) => [
                    r.siteName,
                    r.siteId,
                    r.type,
                    r.itemName,
                    r.itemCode,
                    r.category,
                    r.quantity,
                    r.unit,
                    r.totalValue || 'N/A',
                    r.status,
                  ])}
                  title="Export Site Matrix"
                />
              </div>
            </div>

            {/* VIEW MODE 1: STRUCTURED DETAILED ITEM ALLOCATION TABLE */}
            {matrixViewMode === 'detailed' && (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="p-3 whitespace-nowrap">Project / Site Location</th>
                      <th className="p-3 text-center whitespace-nowrap">Site Code</th>
                      <th className="p-3 text-center whitespace-nowrap">Inventory Type</th>
                      <th className="p-3 whitespace-nowrap">Item Specification</th>
                      <th className="p-3 whitespace-nowrap">Category</th>
                      <th className="p-3 text-right whitespace-nowrap">Allocated Quantity</th>
                      <th className="p-3 text-center whitespace-nowrap">Unit</th>
                      <th className="p-3 text-right whitespace-nowrap">Benchmark Rate</th>
                      <th className="p-3 text-right whitespace-nowrap">Estimated Value</th>
                      <th className="p-3 text-center whitespace-nowrap">Deployment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {flattenedSiteInventory.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400 bg-slate-50/50">
                          No allocated inventory items found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      flattenedSiteInventory.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 font-medium text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <strong className="font-bold text-slate-900 truncate max-w-[200px]" title={row.siteName}>
                                {row.siteName}
                              </strong>
                            </div>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-semibold">
                              {row.siteId}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              row.type === 'Material'
                                ? 'bg-blue-50 text-[#0B3470] border border-blue-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              {row.type === 'Material' ? (
                                <Boxes className="w-3 h-3 text-blue-600" />
                              ) : (
                                <Wrench className="w-3 h-3 text-amber-600" />
                              )}
                              {row.type}
                            </span>
                          </td>
                          <td className="p-3">
                            <strong className="text-slate-900 block font-bold">{row.itemName}</strong>
                            <span className="text-[11px] font-mono text-slate-400">{row.itemCode}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap text-slate-600">
                            {row.category}
                          </td>
                          <td className="p-3 text-right font-mono font-black whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded border ${
                              row.type === 'Material'
                                ? 'text-emerald-700 bg-emerald-50/70 border-emerald-100'
                                : 'text-indigo-700 bg-indigo-50/70 border-indigo-100'
                            }`}>
                              {row.quantity}
                            </span>
                          </td>
                          <td className="p-3 text-center font-medium text-slate-600 whitespace-nowrap">
                            {row.unit}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {row.unitPrice ? money(row.unitPrice) : '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                            {row.totalValue ? money(row.totalValue) : '—'}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW MODE 2: STRUCTURED SITE SUMMARY TABLE */}
            {matrixViewMode === 'summary' && (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="p-3 whitespace-nowrap">Project / Site Name</th>
                      <th className="p-3 text-center whitespace-nowrap">Site Code / ID</th>
                      <th className="p-3 text-right whitespace-nowrap">Material Types Allocated</th>
                      <th className="p-3 text-right whitespace-nowrap">Total Machinery Units</th>
                      <th className="p-3 text-right whitespace-nowrap">Estimated Material Outflow</th>
                      <th className="p-3 text-center whitespace-nowrap">Operational Status</th>
                      <th className="p-3 text-center whitespace-nowrap">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {siteRollupSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 bg-slate-50/50">
                          No project sites recorded.
                        </td>
                      </tr>
                    ) : (
                      siteRollupSummaries.map((s) => (
                        <tr key={s.siteId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                              <strong className="font-bold text-slate-900">{s.siteName}</strong>
                            </div>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-semibold">
                              {s.siteId}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-blue-700 whitespace-nowrap">
                            {s.materialTypes} <span className="font-normal text-slate-400">{s.materialTypes === 1 ? 'Type' : 'Types'}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                            {s.toolUnits} <span className="font-normal text-slate-400">{s.toolUnits === 1 ? 'Unit' : 'Units'}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            {money(s.totalEstimatedValue)}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {s.status}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setMatrixSiteFilter(s.siteId)
                                setMatrixViewMode('detailed')
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#0B3470] hover:bg-blue-50 border border-blue-200/80 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Site Items</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================================================================================== */}
      {/* TAB 4: MOVEMENT & AUDIT HISTORY (STRUCTURED AUDIT TABLE) */}
      {/* ===================================================================================== */}
      {activeTab === 'audit' && (
        <section className="space-y-6 animate-fade-in">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search item, route, dispatcher, or status..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-600 transition-all placeholder:text-slate-400"
                  />
                  {auditSearch && (
                    <button
                      type="button"
                      onClick={() => setAuditSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Transaction Type Filter */}
                <select
                  value={auditTypeFilter}
                  onChange={(e) => setAuditTypeFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Movement Types</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="DISPATCH">Dispatch</option>
                  <option value="RETURN">Return</option>
                  <option value="INDENT">Indent</option>
                </select>
              </div>

              <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                <span className="text-xs text-slate-400 font-medium font-mono">
                  {filteredTransactions.length} movement records
                </span>
                <ExportButton
                  filename="ebricks_inventory_movement_audit_ledger"
                  headers={['Timestamp', 'Movement Type', 'Item Name', 'Quantity', 'Unit', 'Source Location', 'Destination Site', 'Dispatched By', 'Status']}
                  data={filteredTransactions.map((t) => [
                    t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleString('en-IN') : t.date || 'N/A',
                    t.transactionType || 'TRANSFER',
                    t.materialName || t.toolName,
                    t.quantity,
                    t.unit || '',
                    t.from || 'Company HQ',
                    resolveSiteName(t.toSiteId, t.toSiteName || t.toSite),
                    t.dispatchedBy || t.managerName || 'Operations Manager',
                    t.receivedStatus || t.status || 'Completed',
                  ])}
                  title="Export Audit Ledger"
                />
              </div>
            </div>

            {/* Audit Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="p-3 whitespace-nowrap">Timestamp / Date</th>
                    <th className="p-3 text-center whitespace-nowrap">Movement Type</th>
                    <th className="p-3 whitespace-nowrap">Item Details</th>
                    <th className="p-3 text-right whitespace-nowrap">Quantity</th>
                    <th className="p-3 text-center whitespace-nowrap">Unit</th>
                    <th className="p-3 whitespace-nowrap">Source Location</th>
                    <th className="p-3 whitespace-nowrap">Destination Site</th>
                    <th className="p-3 whitespace-nowrap">Authorized / Dispatched By</th>
                    <th className="p-3 text-center whitespace-nowrap">Transfer Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 bg-slate-50/50">
                        No inventory movement records found.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.slice(0, 50).map((t, idx) => (
                      <tr key={t.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                          {t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleString('en-IN') : t.date || 'N/A'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {t.transactionType || 'TRANSFER'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-900">{t.materialName || t.toolName}</td>
                        <td className="p-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                          {t.quantity}
                        </td>
                        <td className="p-3 text-center font-medium text-slate-500 whitespace-nowrap">
                          {t.unit || 'Units'}
                        </td>
                        <td className="p-3 font-medium text-slate-600 whitespace-nowrap">
                          {t.from || 'Company HQ'}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">→</span>
                            <strong className="text-[#0B3470] font-bold">
                              {resolveSiteName(t.toSiteId, t.toSiteName || t.toSite)}
                            </strong>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 font-medium whitespace-nowrap">
                          {t.dispatchedBy || t.managerName || 'Operations Manager'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
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
      {/* 5. TELEMETRY MODAL CARD FOR SELECTED MATERIAL */}
      {/* ===================================================================================== */}
      {selectedMaterialDetail && (
        <Modal
          isOpen={!!selectedMaterialDetail}
          onClose={() => setSelectedMaterialDetail(null)}
          title={`Material Inventory Telemetry — ${selectedMaterialDetail.materialName}`}
        >
          <div className="space-y-4 text-xs">
            {/* Specification Card */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  Material Specification
                </span>
                <span className="font-black text-[#0B3470] text-sm">{selectedMaterialDetail.materialName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-semibold text-slate-900">{selectedMaterialDetail.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Primary Unit:</span>
                  <span className="font-semibold text-slate-900">{selectedMaterialDetail.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">HSN Code:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedMaterialDetail.hsnCode || '2523'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Benchmark Rate:</span>
                  <span className="font-mono font-bold text-slate-900">{money(selectedMaterialDetail.unitPrice)}</span>
                </div>
              </div>
            </div>

            {/* 3-Column Stock Distribution */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Company HQ</span>
                <strong className="text-sm font-black text-slate-900 font-mono mt-0.5 block">
                  {selectedMaterialDetail.hqStock} {selectedMaterialDetail.unit}
                </strong>
              </div>
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
                <span className="text-[10px] text-blue-700 font-bold uppercase block">Site Allocated</span>
                <strong className="text-sm font-black text-blue-900 font-mono mt-0.5 block">
                  {selectedMaterialDetail.totalSiteStock} {selectedMaterialDetail.unit}
                </strong>
              </div>
              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                <span className="text-[10px] text-emerald-700 font-bold uppercase block">Enterprise Total</span>
                <strong className="text-sm font-black text-emerald-900 font-mono mt-0.5 block">
                  {selectedMaterialDetail.totalEnterpriseStock} {selectedMaterialDetail.unit}
                </strong>
              </div>
            </div>

            {/* Structured Table for Site Allocation Distribution */}
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">Site Allocation Breakdown</span>
                <span className="text-[10px] font-mono text-slate-400 font-medium">
                  {selectedMaterialDetail.siteBreakdown.length} active sites
                </span>
              </div>

              {selectedMaterialDetail.siteBreakdown.length === 0 ? (
                <p className="text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-dashed border-slate-200">
                  No site allocations currently recorded for this material.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 max-h-56">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2.5">Project / Site Name</th>
                        <th className="p-2.5 text-right">Allocated Quantity</th>
                        <th className="p-2.5 text-right">Estimated Valuation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {selectedMaterialDetail.siteBreakdown.map((sb, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="p-2.5 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{sb.siteName}</span>
                            </div>
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            {sb.quantity} {sb.unit}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {money(sb.quantity * selectedMaterialDetail.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMaterialDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
