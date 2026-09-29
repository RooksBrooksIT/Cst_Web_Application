import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  Edit3,
  CheckCircle2,
  AlertCircle,
  History,
  RotateCcw,
  Trash2,
  ArrowRight,
  MapPin,
  Briefcase,
  Check,
} from 'lucide-react'
import {
  fetchDailySiteEntries,
  createDailySiteEntry,
  updateDailySiteEntry,
  subscribeDailySiteEntries,
  formatDDMMYYYY,
  WEATHER_TYPES,
} from '../../../services/dailyLogService.js'
import { fetchMaterials, subscribeMaterials } from '../../../services/materialService.js'
import { fetchLabourTrades, subscribeLabourTrades } from '../../../services/workforceService.js'

export default function DailySiteEntry({ orgId, sites = [], currentUser, onNotify }) {
  // Master lists
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [catalogMaterials, setCatalogMaterials] = useState([])
  const [catalogLabourTrades, setCatalogLabourTrades] = useState([])

  // Search & Filter for History Feed
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [selectedDateFilter, setSelectedDateFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // --------------------------------------------------------------------------
  // FORM / WORKSPACE STATE (Aligned with eBricks Manager Daily Site Entry)
  // --------------------------------------------------------------------------
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [formStage, setFormStage] = useState('Foundation Stage')
  const [formWeather, setFormWeather] = useState('Sunny / Clear Sky')
  const [morningStatus, setMorningStatus] = useState('')
  const [afternoonStatus, setAfternoonStatus] = useState('')

  // Multi-item materials consumed: [{ type, materialName, quantity, qty, unit, category, unitPrice, price, amount, total }]
  const [materials, setMaterials] = useState([])

  // Multi-item labour muster: [{ type, trade, category, count, qty, salary, unitSalary, wage, amount, total }]
  const [labours, setLabours] = useState([])

  // Sundries / Other Expenses (Default 0 as per mobile app & requirement)
  const [foodCost, setFoodCost] = useState('0')
  const [transportCost, setTransportCost] = useState('0')
  const [fuelCost, setFuelCost] = useState('0')

  // UPDATE MODE CONTROLS
  const [isUpdateMode, setIsUpdateMode] = useState(false)
  const [updateDocId, setUpdateDocId] = useState(null)
  const [selectedUpdateDate, setSelectedUpdateDate] = useState('')
  const [existingEntryOriginalData, setExistingEntryOriginalData] = useState(null)

  // Modals & UI States
  const [showHistorySelectorModal, setShowHistorySelectorModal] = useState(false)
  const [showDuplicateWarningModal, setShowDuplicateWarningModal] = useState(false)
  const [duplicateWarningData, setDuplicateWarningData] = useState(null)
  const [editingItemModalData, setEditingItemModalData] = useState(null) // { item, type: 'material'|'labour', index }
  const [isSaving, setIsSaving] = useState(false)

  // Inputs for adding new item to list (All numeric fields default to '0')
  const [selectedCatalogMatId, setSelectedCatalogMatId] = useState('')
  const [newMatQty, setNewMatQty] = useState('0')
  const [newMatPrice, setNewMatPrice] = useState('0')
  const [newMatUnit, setNewMatUnit] = useState('Bags')
  const [showCustomMatInputs, setShowCustomMatInputs] = useState(false)
  const [customMatName, setCustomMatName] = useState('')
  const [customMatCategory, setCustomMatCategory] = useState('General')

  const [selectedCatalogLabourId, setSelectedCatalogLabourId] = useState('')
  const [newLabourCount, setNewLabourCount] = useState('0')
  const [newLabourSalary, setNewLabourSalary] = useState('0')
  const [showCustomLabourInputs, setShowCustomLabourInputs] = useState(false)
  const [customLabourName, setCustomLabourName] = useState('')

  const editorWorkspaceRef = useRef(null)

  // --------------------------------------------------------------------------
  // INITIAL DATA & REALTIME SYNC
  // --------------------------------------------------------------------------
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

  // Real-time synchronization for siteSupervisorEntries
  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    const unsubscribe = subscribeDailySiteEntries(
      orgId,
      (data) => {
        setEntries(data || [])
        setLoading(false)
      },
      (err) => {
        console.error(err)
        onNotify?.('Failed to sync daily site diary entries', 'error')
        setLoading(false)
      }
    )

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [orgId])

  // Real-time synchronization for configured master catalog materials and labour trades
  // Automatically loads newly configured items and removes deleted items
  useEffect(() => {
    if (!orgId) return

    fetchMaterials(orgId)
      .then((mats) => setCatalogMaterials(mats || []))
      .catch((err) => console.error('Error fetching materials:', err))

    fetchLabourTrades(orgId)
      .then((trades) => setCatalogLabourTrades(trades || []))
      .catch((err) => console.error('Error fetching labour trades:', err))

    const unsubMaterials = subscribeMaterials(
      orgId,
      (mats) => setCatalogMaterials(mats || []),
      (err) => console.error('Materials subscription error:', err)
    )

    const unsubLabour = subscribeLabourTrades(
      orgId,
      (trades) => setCatalogLabourTrades(trades || []),
      (err) => console.error('Labour trades subscription error:', err)
    )

    return () => {
      if (typeof unsubMaterials === 'function') unsubMaterials()
      if (typeof unsubLabour === 'function') unsubLabour()
    }
  }, [orgId])

  // Initialize selected site if none selected
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id)
      setFormStage(sites[0].projectStage || sites[0].stage || 'Foundation Stage')
    }
  }, [sites, selectedSiteId])

  // --------------------------------------------------------------------------
  // DERIVED SITE METADATA
  // --------------------------------------------------------------------------
  const currentSite = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId) || null
  }, [sites, selectedSiteId])

  // Helper to extract YYYY-MM-DD from any date format
  const getEntryDateISO = (dateVal) => {
    if (!dateVal) return ''
    if (dateVal.seconds) {
      return new Date(dateVal.seconds * 1000).toISOString().split('T')[0]
    }
    if (dateVal instanceof Date) {
      return dateVal.toISOString().split('T')[0]
    }
    if (typeof dateVal === 'string') {
      if (dateVal.includes('T')) return dateVal.split('T')[0]
      const d = new Date(dateVal)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
      return dateVal
    }
    return ''
  }

  // --------------------------------------------------------------------------
  // AUTO-DETECTOR HOOK (eBricks Specification Phase 2 Flow B)
  // --------------------------------------------------------------------------
  const existingEntryForCurrentDate = useMemo(() => {
    if (isUpdateMode || !selectedSiteId || !selectedDate) return null
    return (
      entries.find((e) => {
        const matchesSite =
          e.siteId === selectedSiteId ||
          e.siteCode === currentSite?.siteCode ||
          e.id?.startsWith(currentSite?.siteCode || '___')
        const entryDate = getEntryDateISO(e.date)
        return matchesSite && entryDate === selectedDate
      }) || null
    )
  }, [isUpdateMode, selectedSiteId, selectedDate, entries, currentSite])

  // --------------------------------------------------------------------------
  // SAFE NUMBER PARSER & COMPUTED FINANCIAL TOTALS
  // Empty, null, or undefined numeric values are treated strictly as 0.
  // Dynamic recalculation occurs on every individual change without duplicate totals.
  // --------------------------------------------------------------------------
  const parseSafeNumber = (val) => {
    if (val === null || val === undefined) return 0
    if (typeof val === 'string') {
      const trimmed = val.trim()
      if (trimmed === '') return 0
      const num = Number(trimmed)
      return isNaN(num) ? 0 : num
    }
    const num = Number(val)
    return isNaN(num) ? 0 : num
  }

  const materialsSubtotal = useMemo(() => {
    return materials.reduce((acc, m) => {
      const q = parseSafeNumber(m.quantity ?? m.qty)
      const p = parseSafeNumber(m.unitPrice ?? m.price)
      const rowTotal =
        m.amount !== undefined && m.amount !== null
          ? parseSafeNumber(m.amount)
          : m.total !== undefined && m.total !== null
          ? parseSafeNumber(m.total)
          : q * p
      return acc + rowTotal
    }, 0)
  }, [materials])

  const labourSubtotal = useMemo(() => {
    return labours.reduce((acc, l) => {
      const c = parseSafeNumber(l.count ?? l.qty)
      const w = parseSafeNumber(l.salary ?? l.unitSalary ?? l.wage)
      const rowTotal =
        l.amount !== undefined && l.amount !== null
          ? parseSafeNumber(l.amount)
          : l.total !== undefined && l.total !== null
          ? parseSafeNumber(l.total)
          : c * w
      return acc + rowTotal
    }, 0)
  }, [labours])

  const otherExpensesSubtotal = useMemo(() => {
    return parseSafeNumber(foodCost) + parseSafeNumber(transportCost) + parseSafeNumber(fuelCost)
  }, [foodCost, transportCost, fuelCost])

  const grandTotalExpenditure = useMemo(() => {
    return materialsSubtotal + labourSubtotal + otherExpensesSubtotal
  }, [materialsSubtotal, labourSubtotal, otherExpensesSubtotal])

  // --------------------------------------------------------------------------
  // WORKFLOW ACTION: LOAD ENTRY FOR IN-PLACE UPDATE (Phase 3)
  // --------------------------------------------------------------------------
  const handleLoadEntryForUpdate = (entry) => {
    if (!entry) return
    setIsUpdateMode(true)
    setUpdateDocId(entry.id || entry.entryId)
    setExistingEntryOriginalData({ ...entry })

    // Match Site
    if (entry.siteId) {
      setSelectedSiteId(entry.siteId)
    } else if (entry.siteCode) {
      const match = sites.find((s) => s.siteCode === entry.siteCode || s.id === entry.siteCode)
      if (match) setSelectedSiteId(match.id)
    }

    // Date
    const entryDateStr = getEntryDateISO(entry.date) || new Date().toISOString().split('T')[0]
    setSelectedDate(entryDateStr)
    setSelectedUpdateDate(entryDateStr)

    // Stage & Weather
    setFormStage(entry.projectStage || entry.stage || 'Foundation Stage')
    setFormWeather(entry.weather || 'Sunny / Clear Sky')

    // Notes
    setMorningStatus(entry.morningStatus || '')
    setAfternoonStatus(entry.afternoonStatus || '')

    // Parse Materials
    if (Array.isArray(entry.materials) && entry.materials.length > 0) {
      setMaterials(
        entry.materials.map((m) => {
          const qty = Number(m.quantity ?? m.qty ?? 0)
          const price = Number(m.unitPrice ?? m.price ?? 0)
          const amount = Number(m.amount ?? m.total ?? (qty * price)) || 0
          const name = m.materialName || m.type || m.name || 'Material'
          return {
            type: name,
            materialName: name,
            name,
            quantity: qty,
            qty,
            unit: m.unit || 'Units',
            category: m.category || 'General',
            unitPrice: price,
            price,
            amount,
            total: amount,
          }
        })
      )
    } else {
      setMaterials([])
    }

    // Parse Labour
    const labourSource = Array.isArray(entry.labours)
      ? entry.labours
      : Array.isArray(entry.labour)
      ? entry.labour
      : []

    if (labourSource.length > 0) {
      setLabours(
        labourSource.map((l) => {
          const count = Number(l.count ?? l.qty ?? 0)
          const salary = Number(l.salary ?? l.unitSalary ?? l.wage ?? 0)
          const amount = Number(l.amount ?? l.total ?? (count * salary)) || 0
          const trade = l.trade || l.type || l.category || 'Worker'
          return {
            type: trade,
            trade,
            category: trade,
            count,
            qty: count,
            salary,
            unitSalary: salary,
            wage: salary,
            amount,
            total: amount,
          }
        })
      )
    } else {
      setLabours([])
    }

    // Expenses
    const food = entry.food ?? entry.foodCost ?? entry.expenses?.foodCost ?? 0
    const transport = entry.transport ?? entry.transportCost ?? entry.expenses?.transportCost ?? 0
    const fuel = entry.fuel ?? entry.fuelCost ?? entry.expenses?.fuelCost ?? 0

    setFoodCost(String(food))
    setTransportCost(String(transport))
    setFuelCost(String(fuel))

    // Close modals
    setShowHistorySelectorModal(false)
    setShowDuplicateWarningModal(false)

    // Smooth scroll to editor
    editorWorkspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onNotify?.(`Loaded entry for ${entryDateStr} into Manager Update Mode`, 'info')
  }

  // --------------------------------------------------------------------------
  // WORKFLOW ACTION: EXIT UPDATE MODE / RESET FORM
  // --------------------------------------------------------------------------
  const handleExitUpdateMode = () => {
    setIsUpdateMode(false)
    setUpdateDocId(null)
    setSelectedUpdateDate('')
    setExistingEntryOriginalData(null)

    // Reset default form state with 0 values
    setSelectedDate(new Date().toISOString().split('T')[0])
    setFormWeather('Sunny / Clear Sky')
    setMorningStatus('')
    setAfternoonStatus('')
    setMaterials([])
    setLabours([])
    setFoodCost('0')
    setTransportCost('0')
    setFuelCost('0')
    setNewMatQty('0')
    setNewMatPrice('0')
    setNewLabourCount('0')
    setNewLabourSalary('0')
    onNotify?.('Exited Update Mode. Returned to standard view.', 'info')
  }

  // --------------------------------------------------------------------------
  // LIST ITEM ACTIONS (Add, Edit, Delete)
  // --------------------------------------------------------------------------
  const handleAddMaterialItem = () => {
    let name = ''
    let category = 'General'
    let unit = newMatUnit || 'Units'
    let price = parseSafeNumber(newMatPrice)

    if (showCustomMatInputs && customMatName.trim()) {
      name = customMatName.trim()
      category = customMatCategory.trim() || 'General'
    } else {
      const selected = catalogMaterials.find((m) => (m.id || m.materialId) === selectedCatalogMatId)
      if (selected) {
        name = selected.materialName || selected.name
        category = selected.materialCategory || selected.category || 'General'
        unit = selected.materialUnit || selected.unit || selected.unitName || unit
        if (price === 0) {
          price = parseSafeNumber(
            selected.unitPrice ?? selected.materialPrice ?? selected.price ?? selected.standardRate
          )
        }
      }
    }

    if (!name) {
      onNotify?.('Please select a configured material from the dropdown', 'error')
      return
    }

    const qty = parseSafeNumber(newMatQty)
    const amount = qty * price

    const newItem = {
      type: name,
      materialName: name,
      name,
      quantity: qty,
      qty,
      unit,
      category,
      unitPrice: price,
      price,
      amount,
      total: amount,
    }

    setMaterials([...materials, newItem])
    setNewMatQty('0')
    setNewMatPrice('0')
    setCustomMatName('')
    setShowCustomMatInputs(false)
    onNotify?.(`Added ${name} to materials list`, 'success')
  }

  const handleAddLabourItem = () => {
    let trade = ''
    let salary = parseSafeNumber(newLabourSalary)

    if (showCustomLabourInputs && customLabourName.trim()) {
      trade = customLabourName.trim()
    } else {
      const selected = catalogLabourTrades.find((l) => (l.id || l.tradeId) === selectedCatalogLabourId)
      if (selected) {
        trade = selected.designation || selected.trade || selected.name
        if (salary === 0) {
          salary = parseSafeNumber(selected.dailyWage ?? selected.salary)
        }
      }
    }

    if (!trade) {
      onNotify?.('Please select a configured labour trade from the dropdown', 'error')
      return
    }

    const count = parseSafeNumber(newLabourCount)
    const amount = count * salary

    const newItem = {
      type: trade,
      trade,
      category: trade,
      count,
      qty: count,
      salary,
      unitSalary: salary,
      wage: salary,
      amount,
      total: amount,
    }

    setLabours([...labours, newItem])
    setNewLabourCount('0')
    setNewLabourSalary('0')
    setCustomLabourName('')
    setShowCustomLabourInputs(false)
    onNotify?.(`Added ${trade} to labour list`, 'success')
  }

  const handleDeleteMaterialItem = (index) => {
    setMaterials(materials.filter((_, i) => i !== index))
  }

  const handleDeleteLabourItem = (index) => {
    setLabours(labours.filter((_, i) => i !== index))
  }

  const handleSaveItemEditModal = (updatedQty, updatedRate) => {
    if (!editingItemModalData) return
    const { type, index } = editingItemModalData

    const qty = parseSafeNumber(updatedQty)
    const rate = parseSafeNumber(updatedRate)
    const total = qty * rate

    if (type === 'material') {
      const updated = [...materials]
      updated[index] = {
        ...updated[index],
        quantity: qty,
        qty,
        unitPrice: rate,
        price: rate,
        amount: total,
        total,
      }
      setMaterials(updated)
    } else if (type === 'labour') {
      const updated = [...labours]
      updated[index] = {
        ...updated[index],
        count: qty,
        qty,
        salary: rate,
        unitSalary: rate,
        wage: rate,
        amount: total,
        total,
      }
      setLabours(updated)
    }

    setEditingItemModalData(null)
    onNotify?.('Item updated successfully', 'success')
  }

  // --------------------------------------------------------------------------
  // WORKFLOW ACTION: SAVE OR UPDATE SUBMISSION (Phase 5 & Phase 7)
  // --------------------------------------------------------------------------
  const handleSubmitMainAction = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    if (!orgId) return

    if (!selectedSiteId) {
      onNotify?.('Please select a project site', 'error')
      return
    }

    // In NORMAL mode: Perform duplicate check for `${siteCode}_${ddMMyyyy}`
    if (!isUpdateMode) {
      const existingEntry = entries.find((entry) => {
        const matchesSite =
          entry.siteId === selectedSiteId ||
          entry.siteCode === currentSite?.siteCode ||
          entry.id?.startsWith(currentSite?.siteCode || '___')
        const entryDate = getEntryDateISO(entry.date)
        return matchesSite && entryDate === selectedDate
      })

      if (existingEntry) {
        setDuplicateWarningData(existingEntry)
        setShowDuplicateWarningModal(true)
        return
      }
    }

    setIsSaving(true)
    try {
      const payload = {
        siteId: selectedSiteId,
        siteCode: currentSite?.siteCode || '',
        siteLocation: currentSite?.siteLocation || currentSite?.location || '',
        location: currentSite?.location || currentSite?.siteLocation || '',
        projectName: currentSite?.projectName || currentSite?.siteName || '',
        siteName: currentSite?.siteName || currentSite?.projectName || '',
        projectStage: formStage,
        stage: formStage,
        supervisorId:
          existingEntryOriginalData?.supervisorId ||
          currentSite?.supervisorId ||
          currentUser?.id ||
          'SUP_DEFAULT',
        supervisorName:
          existingEntryOriginalData?.supervisorName ||
          existingEntryOriginalData?.supervisor ||
          currentSite?.supervisorName ||
          currentUser?.name ||
          'Site Supervisor',
        supervisor:
          existingEntryOriginalData?.supervisor ||
          existingEntryOriginalData?.supervisorName ||
          currentSite?.supervisorName ||
          currentUser?.name ||
          'Site Supervisor',
        date: selectedDate,
        weather: formWeather,
        morningStatus,
        afternoonStatus,
        workDoneSummary: `${morningStatus} ${afternoonStatus}`.trim() || 'Daily site progress logged.',
        materials,
        labours,
        food: parseSafeNumber(foodCost),
        transport: parseSafeNumber(transportCost),
        fuel: parseSafeNumber(fuelCost),
        foodCost: parseSafeNumber(foodCost),
        transportCost: parseSafeNumber(transportCost),
        fuelCost: parseSafeNumber(fuelCost),
        expenses: {
          foodCost: parseSafeNumber(foodCost),
          transportCost: parseSafeNumber(transportCost),
          fuelCost: parseSafeNumber(fuelCost),
          totalExpense: otherExpensesSubtotal,
        },
        materialsCost: materialsSubtotal,
        labourCost: labourSubtotal,
        totalAmount: grandTotalExpenditure,
      }

      if (isUpdateMode && updateDocId) {
        // Execute atomic in-place backend record update (eBricks Phase 5)
        const updatedRecord = await updateDailySiteEntry(
          orgId,
          updateDocId,
          payload,
          currentUser,
          existingEntryOriginalData || {}
        )

        // Immediately update state in UI
        setEntries((prev) =>
          prev.map((item) =>
            item.id === updateDocId || item.entryId === updateDocId
              ? { ...item, ...updatedRecord }
              : item
          )
        )
        onNotify?.('Site entry updated successfully in-place!', 'success')
        handleExitUpdateMode()
      } else {
        // Save new supervisor daily site entry (eBricks Phase 1)
        const createdRecord = await createDailySiteEntry(orgId, payload, currentUser)
        setEntries((prev) => [createdRecord, ...prev])
        onNotify?.('Daily site progress & expenditures recorded successfully!', 'success')
        handleExitUpdateMode()
      }

      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to submit daily site entry', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // --------------------------------------------------------------------------
  // FILTERED ENTRIES FOR BOTTOM FEED
  // --------------------------------------------------------------------------
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
        matchesDate = getEntryDateISO(entry.date) === selectedDateFilter
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
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & QUICK ACTION BAR                                          */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/60">
              Field Operations Diary
            </span>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/60">
              eBricks White Label Architecture
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Manager Daily Site Entry</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Review, audit, verify, and correct Supervisor Daily Site Entries. Edits update the existing backend
            document in-place without generating duplicates or separate collections.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Select Existing Entry Button (eBricks Phase 2 Flow A) */}
          <button
            type="button"
            onClick={() => setShowHistorySelectorModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer border border-slate-200 shadow-2xs"
            title="Browse past supervisor submissions to review or edit"
          >
            <History className="w-4 h-4 text-slate-600" />
            <span>Select Existing Entry</span>
          </button>

          {/* Reset / New Mode button */}
          {isUpdateMode ? (
            <button
              type="button"
              onClick={handleExitUpdateMode}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold rounded-xl transition-all border border-rose-200 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Exit Update</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExitUpdateMode}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs sm:text-sm font-semibold rounded-xl transition-all border border-blue-200 cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Form</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ACTIVE UPDATE MODE / SMART DETECTOR BANNERS                             */}
      {/* ========================================================================= */}
      <div ref={editorWorkspaceRef}>
        {/* Active Update Mode Banner (eBricks Phase 3 & 4) */}
        {isUpdateMode && (
          <div className="mb-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-2 border-emerald-500/30 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                    Active In-Place Update Mode
                  </span>
                  <span className="font-mono text-xs text-slate-500">Doc: {updateDocId}</span>
                </div>
                <p className="text-sm font-bold text-slate-900 mt-1">
                  Editing Entry: {selectedUpdateDate} — Supervisor:{' '}
                  <span className="text-emerald-700">
                    {existingEntryOriginalData?.supervisorName || 'Site Supervisor'}
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Modifying values here will update this exact backend record directly. Supervisor metadata and
                  creation history will be strictly preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={() => setShowHistorySelectorModal(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Change Entry
              </button>
              <button
                type="button"
                onClick={handleExitUpdateMode}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 cursor-pointer shadow-2xs"
              >
                Exit Update
              </button>
            </div>
          </div>
        )}

        {/* Smart Date-Match Auto Detector Banner (eBricks Phase 2 Flow B) */}
        {!isUpdateMode && existingEntryForCurrentDate && (
          <div className="mb-4 bg-amber-50 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Supervisor Entry Already Exists For This Date
                </p>
                <p className="text-sm font-semibold text-amber-950 mt-0.5">
                  Supervisor <strong>{existingEntryForCurrentDate.supervisorName || 'Supervisor'}</strong> has already
                  submitted an entry for <strong>{selectedDate}</strong> (Total: ₹
                  {Number(existingEntryForCurrentDate.totalAmount || 0).toLocaleString('en-IN')}).
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  As per system rules, each site has only one entry per day. Review and update this existing record to
                  avoid duplicate documents.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleLoadEntryForUpdate(existingEntryForCurrentDate)}
              className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>Review & Edit Entry</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE / EDITOR CARDS (eBricks Specification Section 2)        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Inputs: Site, Materials, Labour, Expenses) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card A: Site & Date Information */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Site & Calendar Date</span>
              </h2>
              {currentSite && (
                <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                  Code: {currentSite.siteCode || 'N/A'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Site Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Project Site *</label>
                <select
                  value={selectedSiteId}
                  onChange={(e) => {
                    setSelectedSiteId(e.target.value)
                    const s = sites.find((x) => x.id === e.target.value)
                    if (s) setFormStage(s.projectStage || s.stage || 'Foundation Stage')
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName} ({s.siteCode || 'ST'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Calendar Date *</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Site Metadata Information Chips */}
            {currentSite && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Project</span>
                  <strong className="text-slate-800 truncate block">
                    {currentSite.projectName || currentSite.siteName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Location</span>
                  <strong className="text-slate-800 truncate block">
                    {currentSite.siteLocation || currentSite.location || 'Site Location'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Supervisor</span>
                  <strong className="text-slate-800 truncate block">
                    {currentSite.supervisorName || currentSite.supervisor || 'Assigned Lead'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Current Stage</span>
                  <strong className="text-blue-700 truncate block">{formStage}</strong>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Stage</label>
                <input
                  type="text"
                  value={formStage}
                  onChange={(e) => setFormStage(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Superstructure Columns & RCC Slabs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Weather Condition</label>
                <select
                  value={formWeather}
                  onChange={(e) => setFormWeather(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                >
                  {WEATHER_TYPES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Card B: Material Details Card (eBricks Section 2.B.4) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Material Details</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomMatInputs(!showCustomMatInputs)}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {showCustomMatInputs ? '− Select from Catalog' : '+ Add Custom Material'}
              </button>
            </div>

            {/* Material Addition Form */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              {showCustomMatInputs ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Custom Material Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. River Sand / Red Bricks"
                      value={customMatName}
                      onChange={(e) => setCustomMatName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                    <input
                      type="text"
                      placeholder="e.g. Masonry / Aggregates"
                      value={customMatCategory}
                      onChange={(e) => setCustomMatCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Select Material from Catalog
                  </label>
                  <select
                    value={selectedCatalogMatId}
                    onChange={(e) => {
                      const selId = e.target.value
                      setSelectedCatalogMatId(selId)
                      const mat = catalogMaterials.find((m) => (m.id || m.materialId) === selId)
                      if (mat) {
                        const price = mat.unitPrice ?? mat.materialPrice ?? mat.price ?? mat.standardRate ?? 0
                        const unit = mat.materialUnit || mat.unit || mat.unitName || 'Units'
                        setNewMatPrice(String(price))
                        setNewMatUnit(unit)
                      } else {
                        setNewMatPrice('0')
                        setNewMatUnit('Units')
                      }
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="">
                      {catalogMaterials.length === 0
                        ? 'No configured materials found'
                        : 'Choose Configured Material...'}
                    </option>
                    {catalogMaterials.map((m) => {
                      const name = m.materialName || m.name
                      const unit = m.materialUnit || m.unit || m.unitName || 'Units'
                      const price = m.unitPrice ?? m.materialPrice ?? m.price ?? m.standardRate ?? 0
                      return (
                        <option key={m.id || m.materialId} value={m.id || m.materialId}>
                          {name} ({unit}) — ₹{Number(price).toLocaleString('en-IN')}
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newMatQty}
                    onChange={(e) => setNewMatQty(e.target.value)}
                    onFocus={(e) => {
                      if (e.target.value === '0') e.target.select()
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) setNewMatQty('0')
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                  />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newMatUnit}
                    onChange={(e) => setNewMatUnit(e.target.value)}
                    placeholder="Bags/Kg"
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                  />
                </div>
                <div className="col-span-4 sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newMatPrice}
                    onChange={(e) => setNewMatPrice(e.target.value)}
                    onFocus={(e) => {
                      if (e.target.value === '0') e.target.select()
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) setNewMatPrice('0')
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                  />
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleAddMaterialItem}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Material</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card C: Labour Details Card (eBricks Section 2.B.5) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Labour Muster Details</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomLabourInputs(!showCustomLabourInputs)}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {showCustomLabourInputs ? '− Select from Trade Catalog' : '+ Add Custom Trade'}
              </button>
            </div>

            {/* Labour Addition Form */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              {showCustomLabourInputs ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Custom Designation / Role *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tile Layer / Scaffolding Specialist"
                    value={customLabourName}
                    onChange={(e) => setCustomLabourName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select Labour Trade</label>
                  <select
                    value={selectedCatalogLabourId}
                    onChange={(e) => {
                      const selId = e.target.value
                      setSelectedCatalogLabourId(selId)
                      const trade = catalogLabourTrades.find((l) => (l.id || l.tradeId) === selId)
                      if (trade) {
                        const wage = trade.dailyWage ?? trade.salary ?? 0
                        setNewLabourSalary(String(wage))
                      } else {
                        setNewLabourSalary('0')
                      }
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="">
                      {catalogLabourTrades.length === 0
                        ? 'No configured labour trades found'
                        : 'Choose Configured Labour Trade...'}
                    </option>
                    {catalogLabourTrades.map((t) => {
                      const designation = t.designation || t.trade || t.name
                      const wage = t.dailyWage ?? t.salary ?? 0
                      return (
                        <option key={t.id || t.tradeId} value={t.id || t.tradeId}>
                          {designation} — ₹{Number(wage).toLocaleString('en-IN')}/day
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6 sm:col-span-4">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Headcount (Workers)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newLabourCount}
                    onChange={(e) => setNewLabourCount(e.target.value)}
                    onFocus={(e) => {
                      if (e.target.value === '0') e.target.select()
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) setNewLabourCount('0')
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                  />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Daily Wage (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newLabourSalary}
                    onChange={(e) => setNewLabourSalary(e.target.value)}
                    onFocus={(e) => {
                      if (e.target.value === '0') e.target.select()
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) setNewLabourSalary('0')
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-center"
                  />
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <button
                    type="button"
                    onClick={handleAddLabourItem}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Labour</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card D: Other Expenses Card (eBricks Section 2.B.6) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Site Sundries & Fuel</h2>
              </div>
              <span className="text-xs font-bold text-slate-700">
                Total Expenses: ₹{otherExpensesSubtotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Coffee className="w-3 h-3 text-slate-400" /> Food & Tea (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={foodCost}
                  onChange={(e) => setFoodCost(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select()
                  }}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) setFoodCost('0')
                  }}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-slate-400" /> Transport / Auto (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={transportCost}
                  onChange={(e) => setTransportCost(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select()
                  }}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) setTransportCost('0')
                  }}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Fuel className="w-3 h-3 text-slate-400" /> Fuel / Genset (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={fuelCost}
                  onChange={(e) => setFuelCost(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select()
                  }}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) setFuelCost('0')
                  }}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Card E: Progress Diary Notes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Site Diary Notes (Morning & Afternoon Shifts)</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-amber-800 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600" /> Morning Operations (08:00 - 13:00)
                </label>
                <textarea
                  rows="3"
                  value={morningStatus}
                  onChange={(e) => setMorningStatus(e.target.value)}
                  placeholder="Morning shift work summary (e.g. Column bar bending, shuttering inspection...)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-blue-800 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-600" /> Afternoon Operations (13:00 - 18:00)
                </label>
                <textarea
                  rows="3"
                  value={afternoonStatus}
                  onChange={(e) => setAfternoonStatus(e.target.value)}
                  placeholder="Afternoon shift work summary (e.g. Concrete pouring with transit mixer #4...)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Today's Summary Card & Interactive DataTable (eBricks Section 2.B.7) */}
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 sticky top-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                Real-Time Calculation
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1">Today's Summary & Rollup</h2>
              <p className="text-xs text-slate-500">Live breakdown of materials, labour wages, and site sundries.</p>
            </div>

            {/* Financial Overview Card */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#0B3470] to-[#082855] text-white space-y-3 shadow-md">
              <div className="flex justify-between items-center text-xs opacity-90 border-b border-white/10 pb-2">
                <span>Calculated Total Spent</span>
                <span className="font-mono text-emerald-300 font-semibold">{selectedDate}</span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight">₹{grandTotalExpenditure.toLocaleString('en-IN')}</div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/10 text-[11px]">
                <div>
                  <span className="opacity-70 block text-[9px] uppercase">Materials</span>
                  <strong className="text-white">₹{materialsSubtotal.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span className="opacity-70 block text-[9px] uppercase">Labour</span>
                  <strong className="text-white">₹{labourSubtotal.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span className="opacity-70 block text-[9px] uppercase">Sundries</span>
                  <strong className="text-white">₹{otherExpensesSubtotal.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            {/* Interactive Data Table (eBricks Section 2.B.7) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Line Items ({materials.length + labours.length})</span>
                <span className="text-[10px] font-normal text-slate-400">Click blue edit to modify inline</span>
              </div>

              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100 text-xs">
                {/* Materials List */}
                {materials.map((m, idx) => {
                  const mQty = parseSafeNumber(m.quantity ?? m.qty)
                  const mPrice = parseSafeNumber(m.unitPrice ?? m.price)
                  const mRowTotal =
                    m.amount !== undefined && m.amount !== null
                      ? parseSafeNumber(m.amount)
                      : m.total !== undefined && m.total !== null
                      ? parseSafeNumber(m.total)
                      : mQty * mPrice
                  return (
                    <div key={`mat-${idx}`} className="pt-2 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <strong className="text-slate-800 truncate block">{m.materialName || m.type}</strong>
                        </div>
                        <span className="text-[11px] text-slate-500 block pl-3">
                          {mQty} {m.unit || 'units'} × ₹{mPrice}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-slate-900">₹{mRowTotal.toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItemModalData({
                              type: 'material',
                              index: idx,
                              name: m.materialName || m.type,
                              qty: String(mQty),
                              rate: String(mPrice),
                            })
                          }
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                          title="Edit quantity and unit price"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMaterialItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Delete material item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Labour List */}
                {labours.map((l, idx) => {
                  const lCount = parseSafeNumber(l.count ?? l.qty)
                  const lWage = parseSafeNumber(l.salary ?? l.unitSalary ?? l.wage)
                  const lRowTotal =
                    l.amount !== undefined && l.amount !== null
                      ? parseSafeNumber(l.amount)
                      : l.total !== undefined && l.total !== null
                      ? parseSafeNumber(l.total)
                      : lCount * lWage
                  return (
                    <div key={`lab-${idx}`} className="pt-2 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          <strong className="text-slate-800 truncate block">{l.trade || l.type}</strong>
                        </div>
                        <span className="text-[11px] text-slate-500 block pl-3">
                          {lCount} workers × ₹{lWage}/day
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-slate-900">₹{lRowTotal.toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItemModalData({
                              type: 'labour',
                              index: idx,
                              name: l.trade || l.type,
                              qty: String(lCount),
                              rate: String(lWage),
                            })
                          }
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                          title="Edit worker count and wage"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLabourItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Delete labour item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {materials.length === 0 && labours.length === 0 && (
                  <div className="py-8 text-center text-slate-400 italic">No materials or labour items logged yet.</div>
                )}
              </div>
            </div>

            {/* Bottom Action Bar (eBricks Section 2.B.8) */}
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSubmitMainAction}
                disabled={isSaving}
                className={`w-full py-3 px-4 text-sm font-bold text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  isUpdateMode
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-[#0B3470] hover:bg-[#082855]'
                } disabled:opacity-50`}
              >
                {isSaving ? (
                  <span>Processing Backend Operation...</span>
                ) : isUpdateMode ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>UPDATE (Save In-Place Changes)</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>SAVE (Post Daily Site Entry)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleExitUpdateMode}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                {isUpdateMode ? 'Cancel & Exit Update' : 'Clear Form Inputs'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. HISTORICAL ENTRIES FEED (SEARCH, FILTER & DIRECT EDIT ACCESS)          */}
      {/* ========================================================================= */}
      <div className="pt-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Recent Daily Site Entries Feed</h2>
            <p className="text-xs text-slate-500">
              Browse supervisor submissions and manager audits across all sites. Click "Edit Entry" to load any
              record directly into the editor above.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">
              Showing {filteredEntries.length} of {entries.length} entries
            </span>
          </div>
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

        {/* Entries Feed Cards */}
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
              const food = entry.food ?? entry.foodCost ?? entry.expenses?.foodCost ?? 0
              const transport = entry.transport ?? entry.transportCost ?? entry.expenses?.transportCost ?? 0
              const fuel = entry.fuel ?? entry.fuelCost ?? entry.expenses?.fuelCost ?? 0
              const sundries = Number(food) + Number(transport) + Number(fuel)
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
                            {entry.projectStage || entry.stage || 'Active Phase'}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
                            {getWeatherIcon(entry.weather)}
                            <span>{entry.weather || 'Clear'}</span>
                          </span>
                          {entry.managerEdited && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Manager Updated</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {entryDate}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            {entry.supervisorName || entry.supervisor || 'Site Supervisor'}
                          </span>
                          {entry.managerEdited && entry.lastUpdatedBy && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-medium">
                                Audited by {entry.lastUpdatedBy}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Financial, Edit & Toggle */}
                    <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      <div className="text-left md:text-right">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Day Expenditure</p>
                        <p className="text-lg font-bold text-slate-900">₹{total.toLocaleString('en-IN')}</p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLoadEntryForUpdate(entry)
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-xl transition-all cursor-pointer shadow-2xs"
                        title="Edit mismatched or incorrect values for this entry"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Entry</span>
                      </button>

                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
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
                                    {m.materialName || m.type || m.name} ({m.quantity ?? m.qty} {m.unit || 'units'})
                                  </span>
                                  <span className="font-semibold text-slate-800">
                                    ₹{Number(m.amount ?? m.total ?? 0).toLocaleString('en-IN')}
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
                            {Array.isArray(entry.labours || entry.labour) && (entry.labours || entry.labour).length > 0 ? (
                              (entry.labours || entry.labour).map((l, idx) => (
                                <div key={idx} className="py-1.5 flex justify-between">
                                  <span>
                                    {l.trade || l.type || l.category} ({l.count ?? l.qty} workers)
                                  </span>
                                  <span className="font-semibold text-slate-800">
                                    ₹{Number(l.amount ?? l.total ?? 0).toLocaleString('en-IN')}
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
                              <span className="font-semibold">₹{Number(food).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100">
                              <span className="flex items-center gap-1">
                                <Truck className="w-3 h-3 text-slate-400" /> Transport / Auto
                              </span>
                              <span className="font-semibold">₹{Number(transport).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="flex items-center gap-1">
                                <Fuel className="w-3 h-3 text-slate-400" /> Fuel / Genset
                              </span>
                              <span className="font-semibold">₹{Number(fuel).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Action Bar & Audit Trail */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/70">
                        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                          <span>
                            Original Supervisor:{' '}
                            <strong className="text-slate-700">
                              {entry.supervisorName || entry.supervisor || 'Site Supervisor'}
                            </strong>
                          </span>
                          {entry.managerEdited && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Audited by {entry.lastUpdatedBy || entry.editedByManagerName || 'Manager'}
                                {entry.updatedAt?.seconds
                                  ? ` on ${new Date(entry.updatedAt.seconds * 1000).toLocaleString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}`
                                  : ''}
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLoadEntryForUpdate(entry)}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Load Entry into Workspace Editor</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. MODAL A: HISTORICAL ENTRY SELECTOR (eBricks Phase 2 Flow A)             */}
      {/* ========================================================================= */}
      {showHistorySelectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Select Existing Supervisor Entry</h3>
                  <p className="text-xs text-slate-500">
                    Choose a previously submitted daily entry to review and audit in-place.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistorySelectorModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter by Site in Modal */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Filter Site:</span>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg flex-1"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName || s.projectName} ({s.siteCode || 'ST'})
                  </option>
                ))}
              </select>
            </div>

            {/* Entries List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 space-y-2 pr-1">
              {entries.filter((e) => e.siteId === selectedSiteId || e.siteCode === currentSite?.siteCode).length ===
              0 ? (
                <div className="py-12 text-center text-slate-400 text-xs italic">
                  No existing daily entries found for this site.
                </div>
              ) : (
                entries
                  .filter((e) => e.siteId === selectedSiteId || e.siteCode === currentSite?.siteCode)
                  .sort((a, b) => {
                    const da = a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime()
                    const db = b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime()
                    return db - da
                  })
                  .map((entry) => {
                    const dateStr = getEntryDateISO(entry.date)
                    const total = Number(entry.totalAmount || 0)
                    return (
                      <div
                        key={entry.id || entry.entryId}
                        className="p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">{dateStr}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                              {entry.projectStage || entry.stage || 'Foundation'}
                            </span>
                            {entry.managerEdited && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Audited
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 mt-1">
                            Supervisor: {entry.supervisorName || entry.supervisor || 'Site Supervisor'} • Day Spent: ₹
                            {total.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLoadEntryForUpdate(entry)}
                          className="px-3.5 py-1.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
                        >
                          Review & Edit
                        </button>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL B: IN-PLACE ITEM EDIT (eBricks Section 2.B.7 & Phase 4)          */}
      {/* ========================================================================= */}
      {editingItemModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">
                Edit {editingItemModalData.type === 'material' ? 'Material' : 'Labour Trade'} Item
              </h3>
              <button
                type="button"
                onClick={() => setEditingItemModalData(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 font-semibold">{editingItemModalData.name}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {editingItemModalData.type === 'material' ? 'Quantity' : 'Worker Count (Heads)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editingItemModalData.qty}
                  onChange={(e) =>
                    setEditingItemModalData({ ...editingItemModalData, qty: e.target.value })
                  }
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select()
                  }}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) {
                      setEditingItemModalData({ ...editingItemModalData, qty: '0' })
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {editingItemModalData.type === 'material' ? 'Unit Price (₹)' : 'Daily Wage (₹)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editingItemModalData.rate}
                  onChange={(e) =>
                    setEditingItemModalData({ ...editingItemModalData, rate: e.target.value })
                  }
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select()
                  }}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) {
                      setEditingItemModalData({ ...editingItemModalData, rate: '0' })
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl flex justify-between text-xs font-bold text-blue-900">
                <span>Updated Amount:</span>
                <span>
                  ₹
                  {(
                    parseSafeNumber(editingItemModalData.qty) * parseSafeNumber(editingItemModalData.rate)
                  ).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingItemModalData(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSaveItemEditModal(editingItemModalData.qty, editingItemModalData.rate)
                }
                className="px-4 py-1.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
              >
                Save Item Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL C: DUPLICATE PREVENTION WARNING DIALOG (eBricks Phase 7)         */}
      {/* ========================================================================= */}
      {showDuplicateWarningModal && duplicateWarningData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Duplicate Entry Detected</h3>
                <p className="text-xs text-slate-600 mt-1">
                  A daily site entry for site <strong>{currentSite?.siteCode || currentSite?.siteName}</strong> on{' '}
                  <strong>{selectedDate}</strong> already exists in the backend.
                </p>
                <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200/80 mt-2">
                  To avoid data fragmentation and duplicate collections, please review and update the existing record
                  instead of creating a new one.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDuplicateWarningModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleLoadEntryForUpdate(duplicateWarningData)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Load Existing Entry for Update</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
