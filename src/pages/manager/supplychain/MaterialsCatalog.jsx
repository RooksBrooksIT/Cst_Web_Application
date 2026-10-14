import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Boxes,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  PackageCheck,
  AlertTriangle,
  Layers,
  IndianRupee,
  X,
  Sparkles,
  Tag,
  Scale,
  FolderPlus,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Info,
  ArrowRight,
  ShieldCheck,
  Building2,
} from 'lucide-react'
import {
  fetchMaterials,
  createMasterMaterial,
  updateMasterMaterial,
  deleteMasterMaterial,
  fetchMaterialCategories,
  createMaterialCategory,
  fetchMaterialSubCategories,
  createMaterialSubCategory,
  fetchMaterialUnits,
  createMaterialUnit,
  getNextMaterialId,
  isDuplicateMaterialName,
  MATERIAL_UNITS as DEFAULT_UNITS,
} from '../../../services/materialService.js'

export default function MaterialsCatalog({ orgId, currentUser, onNotify }) {
  // Tab 0: "CONFIGURE MATERIAL" | Tab 1: "SEARCH & UPDATE"
  const [activeTab, setActiveTab] = useState(0)
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL')

  // Dynamic Taxonomy Lists
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [units, setUnits] = useState([])
  const [nextIdPreview, setNextIdPreview] = useState('MT001')

  // Tab 0 (CONFIGURE MATERIAL) Form State
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSubCategory, setSelectedSubCategory] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('Bags')
  const [customMaterialName, setCustomMaterialName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formInitialStock, setFormInitialStock] = useState('')
  const [formReorderLevel, setFormReorderLevel] = useState('25')
  const [formDescription, setFormDescription] = useState('')
  const [submittingCreate, setSubmittingCreate] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState('')

  // Tab 1 (SEARCH & UPDATE) Selection & Quick Price State
  const [selectedMaterialRow, setSelectedMaterialRow] = useState(null)
  const [quickPriceValue, setQuickPriceValue] = useState('')
  const [submittingQuickPrice, setSubmittingQuickPrice] = useState(false)

  // Tab 1 Edit Modal State
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [editPrice, setEditPrice] = useState('')
  const [editUnit, setEditUnit] = useState('Bags')
  const [editReorder, setEditReorder] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // Helper Modals State (+ Add Category / Subcategory / Unit)
  const [showAddCatModal, setShowAddCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showAddSubCatModal, setShowAddSubCatModal] = useState(false)
  const [newSubCatName, setNewSubCatName] = useState('')
  const [newSubCatUnit, setNewSubCatUnit] = useState('')
  const [showAddUnitModal, setShowAddUnitModal] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitAbbr, setNewUnitAbbr] = useState('')

  // ----------------------------------------------------------------------------------------------
  // DATA LOADING & SYNCHRONIZATION
  // ----------------------------------------------------------------------------------------------
  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [mats, cats, subCats, unts, nextId] = await Promise.all([
        fetchMaterials(orgId),
        fetchMaterialCategories(orgId),
        fetchMaterialSubCategories(orgId),
        fetchMaterialUnits(orgId),
        getNextMaterialId(orgId),
      ])

      setMaterials(mats || [])
      setNextIdPreview(nextId || 'MT001')

      // Categories: display only the configured categories from the application
      const firestoreCats = (cats || []).map((c) => ({
        id: c.id || c.categoryId,
        name: c.matCategory || c.categoryName,
      })).filter((c) => Boolean(c.name))

      const uniqueCats = []
      const existingNames = new Set()
      for (const cat of firestoreCats) {
        const lower = cat.name.toLowerCase()
        if (!existingNames.has(lower)) {
          existingNames.add(lower)
          uniqueCats.push(cat)
        }
      }
      setCategories(uniqueCats)

      // Subcategories
      setSubCategories(subCats || [])

      // Units: merge Firestore records with defaults
      const firestoreUnits = (unts || []).map((u) => ({
        id: u.id || u.unitId,
        name: u.matUnit || u.unitName,
        abbr: u.unitAbbreviation || '',
      })).filter((u) => Boolean(u.name))

      const existingUnitNames = new Set(firestoreUnits.map((u) => u.name.toLowerCase()))
      const fullUnits = [...firestoreUnits]
      for (const defU of DEFAULT_UNITS) {
        if (!existingUnitNames.has(defU.toLowerCase())) {
          fullUnits.push({ id: `def_${defU}`, name: defU, abbr: defU })
        }
      }
      setUnits(fullUnits)
      if (!selectedUnit && fullUnits.length > 0) {
        setSelectedUnit(fullUnits[0].name)
      }
    } catch (err) {
      console.error('Error loading materials catalog:', err)
      onNotify?.('Failed to load materials catalog', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  // Filtered subcategories based on selectedCategory in Tab 0
  const availableSubCategories = useMemo(() => {
    if (!selectedCategory) return []
    const targetCat = selectedCategory.trim().toLowerCase()
    const foundCatObj = categories.find(
      (c) => (c.name || c.matCategory || '').toLowerCase() === targetCat || (c.id || '').toLowerCase() === targetCat
    )
    const targetCatId = (foundCatObj?.id || '').toLowerCase()

    return subCategories.filter((s) => {
      const matchName = String(s.categoryName || '').trim().toLowerCase() === targetCat
      const subCatRefId = String(s.matCategory?.id || s.categoryId || '').trim().toLowerCase()
      const matchCatId = targetCatId && subCatRefId === targetCatId
      const matchCat = subCatRefId === targetCat
      return matchName || matchCat || matchCatId
    })
  }, [subCategories, selectedCategory, categories])

  // Auto-Synthesized Material Name: {Category}_{SubCategory}
  const autoSynthesizedName = useMemo(() => {
    const cat = (selectedCategory || '').trim()
    const sub = (selectedSubCategory || '').trim()
    if (cat && sub) return `${cat}_${sub}`
    if (cat) return `${cat}_`
    return ''
  }, [selectedCategory, selectedSubCategory])

  // Effective material name (custom override or auto-synthesized)
  const effectiveMaterialName = customMaterialName.trim() || autoSynthesizedName

  // Real-time duplicate check when category or subcategory changes
  useEffect(() => {
    if (!orgId || !effectiveMaterialName) {
      setDuplicateWarning('')
      return
    }
    const target = effectiveMaterialName.toLowerCase()
    const match = materials.some((m) => (m.materialName || m.name || '').toLowerCase() === target)
    if (match) {
      setDuplicateWarning(`A material named "${effectiveMaterialName}" is already registered in the master catalog.`)
    } else {
      setDuplicateWarning('')
    }
  }, [effectiveMaterialName, materials, orgId])

  // When subcategory changes, auto-select associated unit if configured
  const handleSubCategorySelect = (subName) => {
    setSelectedSubCategory(subName)
    const found = availableSubCategories.find(
      (s) => (s.matSubCategory || s.subCategory || '').toLowerCase() === subName.toLowerCase()
    )
    if (found?.matUnit) {
      const unitObj = units.find((u) => u.id === found.matUnit?.id || u.name === found.matUnit)
      if (unitObj) setSelectedUnit(unitObj.name)
    }
  }

  // Real-time decimal price formatter (up to 2 decimals)
  const handlePriceChange = (val, setter) => {
    const clean = val.replace(/[^0-9.]/g, '')
    if (clean === '' || /^\d*\.?\d{0,2}$/.test(clean)) {
      setter(clean)
    }
  }

  // ----------------------------------------------------------------------------------------------
  // TAB 0: CREATE MASTER MATERIAL
  // ----------------------------------------------------------------------------------------------
  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return

    if (!selectedCategory) {
      onNotify?.('Please select a Material Category', 'error')
      return
    }
    if (!selectedSubCategory.trim()) {
      onNotify?.('Please select or enter a Material Subcategory', 'error')
      return
    }

    const finalName = effectiveMaterialName
    if (!finalName) {
      onNotify?.('Material Item Name could not be generated', 'error')
      return
    }

    // Duplicate check
    const isDup = await isDuplicateMaterialName(orgId, finalName)
    if (isDup) {
      onNotify?.(`Material "${finalName}" already exists in the master catalog.`, 'error')
      return
    }

    setSubmittingCreate(true)
    try {
      // Find category and subcategory IDs if available
      const catObj = categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase())
      const subCatObj = availableSubCategories.find(
        (s) => (s.matSubCategory || s.subCategory || '').toLowerCase() === selectedSubCategory.toLowerCase()
      )
      const unitObj = units.find((u) => u.name.toLowerCase() === selectedUnit.toLowerCase())

      await createMasterMaterial(orgId, {
        materialId: nextIdPreview,
        materialName: finalName,
        materialCategory: selectedCategory,
        categoryId: catObj?.id?.startsWith('MC') ? catObj.id : null,
        materialSubCategory: selectedSubCategory.trim(),
        subCategoryId: subCatObj?.id?.startsWith('MSC') ? subCatObj.id : null,
        materialUnit: selectedUnit || 'Bags',
        unitId: unitObj?.id?.startsWith('MU') ? unitObj.id : null,
        unitPrice: Number(formPrice) || 0,
        availableCount: Number(formInitialStock) || 0,
        minReorderLevel: Number(formReorderLevel) || 20,
        description: formDescription.trim(),
      })

      onNotify?.(`Material "${finalName}" (${nextIdPreview}) successfully saved to Master Catalog!`, 'success')
      
      // Reset form
      setSelectedSubCategory('')
      setCustomMaterialName('')
      setFormPrice('')
      setFormInitialStock('')
      setFormDescription('')
      
      await loadData()
      setActiveTab(1) // Transition to Search & Update directory
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to register master material', 'error')
    } finally {
      setSubmittingCreate(false)
    }
  }

  // ----------------------------------------------------------------------------------------------
  // TAB 1: QUICK INLINE PRICE UPDATE
  // ----------------------------------------------------------------------------------------------
  const handleSelectRow = (mat) => {
    setSelectedMaterialRow(mat)
    setQuickPriceValue(String(mat.unitPrice ?? mat.materialPrice ?? mat.standardRate ?? ''))
  }

  const handleSaveQuickPrice = async (e) => {
    e?.preventDefault()
    if (!orgId || !selectedMaterialRow) return
    const newPriceNum = Number(quickPriceValue)
    if (isNaN(newPriceNum) || newPriceNum < 0) {
      onNotify?.('Please enter a valid numeric price', 'error')
      return
    }

    setSubmittingQuickPrice(true)
    try {
      const id = selectedMaterialRow.materialId || selectedMaterialRow.id
      await updateMasterMaterial(orgId, id, {
        materialName: selectedMaterialRow.materialName || selectedMaterialRow.name,
        unitPrice: newPriceNum,
        materialPrice: String(newPriceNum),
        standardRate: newPriceNum,
        materialUnit: selectedMaterialRow.materialUnit || selectedMaterialRow.unit || 'Bags',
      })

      onNotify?.(`Price for "${selectedMaterialRow.materialName}" updated to ₹${newPriceNum}!`, 'success')
      setSelectedMaterialRow((prev) => (prev ? { ...prev, unitPrice: newPriceNum, materialPrice: String(newPriceNum) } : null))
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update price', 'error')
    } finally {
      setSubmittingQuickPrice(false)
    }
  }

  // ----------------------------------------------------------------------------------------------
  // TAB 1: FULL EDIT MODAL
  // ----------------------------------------------------------------------------------------------
  const handleOpenEditModal = (m, e) => {
    e?.stopPropagation()
    setEditingMaterial(m)
    setEditPrice(String(m.unitPrice ?? m.materialPrice ?? m.standardRate ?? ''))
    setEditUnit(m.materialUnit || m.unit || 'Bags')
    setEditReorder(String(m.minReorderLevel ?? '25'))
    setEditDescription(m.description || '')
  }

  const handleUpdateModalSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !editingMaterial) return

    setSubmittingEdit(true)
    try {
      const id = editingMaterial.materialId || editingMaterial.id
      const priceNum = Number(editPrice) || 0
      await updateMasterMaterial(orgId, id, {
        materialName: editingMaterial.materialName || editingMaterial.name,
        unitPrice: priceNum,
        materialPrice: String(priceNum),
        standardRate: priceNum,
        materialUnit: editUnit,
        minReorderLevel: Number(editReorder) || 20,
        description: editDescription.trim(),
      })

      onNotify?.(`Material specifications updated for "${editingMaterial.materialName}"!`, 'success')
      setEditingMaterial(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update material', 'error')
    } finally {
      setSubmittingEdit(false)
    }
  }

  // ----------------------------------------------------------------------------------------------
  // TAB 1: DELETE MATERIAL
  // ----------------------------------------------------------------------------------------------
  const handleDeleteMaterial = async (mat, e) => {
    e?.stopPropagation()
    if (!orgId || !mat) return
    const id = mat.materialId || mat.id
    const name = mat.materialName || mat.name || 'this material'

    if (!window.confirm(`Are you sure you want to permanently delete "${name}" (${id}) from the Master Catalog?`)) {
      return
    }

    try {
      await deleteMasterMaterial(orgId, id, name)
      onNotify?.(`Material "${name}" removed from catalog`, 'info')
      if (selectedMaterialRow?.id === mat.id || selectedMaterialRow?.materialId === mat.materialId) {
        setSelectedMaterialRow(null)
      }
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete material', 'error')
    }
  }

  // ----------------------------------------------------------------------------------------------
  // TAXONOMY MODALS: ADD CATEGORY, SUBCATEGORY, UNIT
  // ----------------------------------------------------------------------------------------------
  const handleAddCategorySubmit = async (e) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    try {
      const res = await createMaterialCategory(orgId, newCatName.trim())
      onNotify?.(`Category "${newCatName.trim()}" (${res.id}) registered successfully!`, 'success')
      setSelectedCategory(res.categoryName || newCatName.trim())
      setNewCatName('')
      setShowAddCatModal(false)
      await loadData()
    } catch (err) {
      onNotify?.(err.message || 'Failed to add category', 'error')
    }
  }

  const handleAddSubCategorySubmit = async (e) => {
    e.preventDefault()
    if (!newSubCatName.trim()) return
    try {
      const res = await createMaterialSubCategory(
        orgId,
        newSubCatName.trim(),
        selectedCategory,
        newSubCatUnit || null
      )
      onNotify?.(`Subcategory "${newSubCatName.trim()}" (${res.id}) bound to ${selectedCategory}!`, 'success')
      setSelectedSubCategory(res.matSubCategory || newSubCatName.trim())
      if (newSubCatUnit) setSelectedUnit(newSubCatUnit)
      setNewSubCatName('')
      setNewSubCatUnit('')
      setShowAddSubCatModal(false)
      await loadData()
    } catch (err) {
      onNotify?.(err.message || 'Failed to add subcategory', 'error')
    }
  }

  const handleAddUnitSubmit = async (e) => {
    e.preventDefault()
    if (!newUnitName.trim()) return
    try {
      const res = await createMaterialUnit(orgId, newUnitName.trim(), newUnitAbbr.trim())
      onNotify?.(`Measurement Unit "${newUnitName.trim()}" (${res.id}) created!`, 'success')
      setSelectedUnit(res.matUnit || newUnitName.trim())
      setNewUnitName('')
      setNewUnitAbbr('')
      setShowAddUnitModal(false)
      await loadData()
    } catch (err) {
      onNotify?.(err.message || 'Failed to add unit', 'error')
    }
  }

  // ----------------------------------------------------------------------------------------------
  // SEARCH & FILTERED DIRECTORY
  // ----------------------------------------------------------------------------------------------
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const name = (m.materialName || m.name || '').toLowerCase()
      const id = (m.materialId || m.id || '').toLowerCase()
      const cat = (m.materialCategory || m.categoryName || m.category || '').toLowerCase()
      const sub = (m.materialSubCategory || m.subCategory || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !q || name.includes(q) || id.includes(q) || cat.includes(q) || sub.includes(q)
      const matchesCat =
        selectedCategoryFilter === 'ALL' ||
        (m.materialCategory || m.categoryName || m.category)?.toLowerCase() === selectedCategoryFilter.toLowerCase()

      return matchesSearch && matchesCat
    })
  }, [materials, searchQuery, selectedCategoryFilter])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* --------------------------------------------------------------------------------------- */}
      {/* HEADER & TOP TABS */}
      {/* --------------------------------------------------------------------------------------- */}
      <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B3470] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
              <Boxes className="w-3.5 h-3.5 text-[#0B3470]" />
              Material Master Catalog
            </span>
            <span className="text-xs font-semibold text-slate-400">·</span>
            <span className="text-xs font-semibold text-slate-500">SSOT Procurement Registry</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Material Master Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Configure 4-tier standardized construction materials (Category, Subcategory, Unit, Master Item), benchmark procurement unit rates, and real-time inventory directory.
          </p>
        </div>

        {/* 2 Tabs: CONFIGURE MATERIAL / SEARCH & UPDATE */}
        <div className="flex items-center bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab(0)}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 0
                ? 'bg-[#0B3470] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>CONFIGURE MATERIAL</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(1)}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 1
                ? 'bg-[#0B3470] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>SEARCH & UPDATE ({materials.length})</span>
          </button>
        </div>
      </div>

      {/* ======================================================================================= */}
      {/* TAB 0: CONFIGURE MATERIAL FORM */}
      {/* ======================================================================================= */}
      {activeTab === 0 && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm max-w-4xl mx-auto space-y-6">
          {/* Top Form Header with Auto ID preview */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Configure New Master Material</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically synthesizes standard nomenclature, binds hierarchical references, and registers into the company catalog.
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Next Sequence ID</span>
              <span className="inline-block px-3 py-1 bg-blue-50 text-[#0B3470] font-mono text-xs font-extrabold rounded-lg border border-blue-200 shadow-2xs">
                {nextIdPreview}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            {/* Auto-Synthesized Name Banner */}
            <div className="p-4 rounded-2xl bg-linear-to-r from-blue-50/80 via-slate-50 to-blue-50/80 border border-blue-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-[#0B3470] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Auto-Synthesized Material Name (SSOT Standard)
                </label>
                <span className="text-[10px] text-slate-400 font-semibold">Formula: &#123;Category&#125;_&#123;SubCategory&#125;</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 font-mono text-base font-extrabold text-slate-900 bg-white px-4 py-2.5 rounded-xl border border-blue-200/70 shadow-2xs">
                  {effectiveMaterialName ? (
                    <span className="text-[#0B3470]">{effectiveMaterialName}</span>
                  ) : (
                    <span className="text-slate-400 italic font-normal text-sm">
                      Select Category and enter Subcategory to preview name...
                    </span>
                  )}
                </div>
              </div>
              {duplicateWarning && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{duplicateWarning}</span>
                </div>
              )}
            </div>

            {/* Row 1: Category & Subcategory Selectors with (+) Modals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Category */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Material Category *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCatModal(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Category</span>
                  </button>
                </div>
                <select
                  required
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value)
                    setSelectedSubCategory('')
                  }}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 font-medium outline-none transition-all shadow-2xs"
                >
                  <option value="">Select category...</option>
                  {categories.length === 0 ? (
                    <option value="" disabled>No categories configured yet. Click "+ Add Category" to create one.</option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Subcategory */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Material Subcategory *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddSubCatModal(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Subcategory</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    list="subcat-options"
                    value={selectedSubCategory}
                    onChange={(e) => handleSubCategorySelect(e.target.value)}
                    placeholder="e.g. OPC 53 Grade / 12mm TMT / Binding Wire"
                    className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 font-medium outline-none transition-all shadow-2xs"
                  />
                  <datalist id="subcat-options">
                    {availableSubCategories.map((s) => (
                      <option key={s.id || s.subCategoryId || s.subCategory} value={s.matSubCategory || s.subCategory} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Row 2: Standard Unit & Unit Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Unit of Measurement */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Unit of Measurement (UOM) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddUnitModal(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Unit</span>
                  </button>
                </div>
                <select
                  required
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 font-medium outline-none transition-all shadow-2xs"
                >
                  {units.map((u) => (
                    <option key={u.id || u.name} value={u.name}>
                      {u.name} {u.abbr && u.abbr !== u.name ? `(${u.abbr})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Standard Price */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Standard Unit Price (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-sm">₹</span>
                  <input
                    type="text"
                    required
                    inputMode="decimal"
                    value={formPrice}
                    onChange={(e) => handlePriceChange(e.target.value, setFormPrice)}
                    placeholder="380.00"
                    className="w-full pl-9 pr-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 font-bold outline-none transition-all shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Initial Warehouse Stock & Reorder Alert Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Initial Central Stock (Optional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formInitialStock}
                  onChange={(e) => setFormInitialStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 outline-none transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Minimum Reorder Alert Level
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formReorderLevel}
                  onChange={(e) => setFormReorderLevel(e.target.value)}
                  placeholder="25"
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 outline-none transition-all shadow-2xs"
                />
              </div>
            </div>

            {/* Row 4: Technical Specifications & Notes */}
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Technical Specifications & Notes
              </label>
              <textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Standard 53 Grade Portland cement for structural RCC columns and slab works."
                className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 text-slate-900 outline-none transition-all shadow-2xs"
              />
            </div>

            {/* Submit Action Button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Validated against duplicate entries and standard taxonomy.</span>
              </p>

              <button
                type="submit"
                disabled={submittingCreate || Boolean(duplicateWarning)}
                className="py-3 px-6 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {submittingCreate ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving to Master Catalog...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Save Material</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* TAB 1: SEARCH & UPDATE (MATERIAL DIRECTORY) */}
      {/* ======================================================================================= */}
      {activeTab === 1 && (
        <div className="space-y-5">
          {/* Quick Price Update Inline Card (When a row is selected) */}
          {selectedMaterialRow && (
            <div className="p-5 rounded-3xl bg-linear-to-r from-blue-50 via-indigo-50/50 to-blue-50 border border-blue-200/80 shadow-md animate-fade-in flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                    {selectedMaterialRow.materialId || selectedMaterialRow.id}
                  </span>
                  <strong className="text-base font-extrabold text-slate-900">
                    {selectedMaterialRow.materialName || selectedMaterialRow.name}
                  </strong>
                  <span className="text-xs text-slate-500 font-medium">
                    ({selectedMaterialRow.materialCategory || selectedMaterialRow.category})
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Current Benchmark Rate:{' '}
                  <strong className="text-slate-900 font-extrabold">
                    ₹{Number(selectedMaterialRow.unitPrice ?? selectedMaterialRow.materialPrice ?? 0).toLocaleString('en-IN')}
                  </strong>{' '}
                  / {selectedMaterialRow.materialUnit || selectedMaterialRow.unit || 'Unit'}
                </p>
              </div>

              {/* Inline Quick Price Editor */}
              <form onSubmit={handleSaveQuickPrice} className="flex items-center gap-2 self-stretch md:self-auto">
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quickPriceValue}
                    onChange={(e) => handlePriceChange(e.target.value, setQuickPriceValue)}
                    placeholder="New Price"
                    className="w-full pl-7 pr-3 py-2 text-xs font-bold bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 shadow-2xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingQuickPrice || !quickPriceValue}
                  className="px-4 py-2 text-xs font-bold bg-[#0B3470] hover:bg-[#082654] text-white rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {submittingQuickPrice ? 'Saving...' : 'Update Price'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMaterialRow(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-white/60 cursor-pointer"
                  title="Close quick price updater"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* Search Bar & Category Filter Chips */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Search input */}
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, name, category, or subcategory..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all text-slate-900"
                />
              </div>

              {/* Counter Badge */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-slate-500 font-medium">
                  Showing <strong className="text-slate-900">{filteredMaterials.length}</strong> of{' '}
                  <strong className="text-slate-900">{materials.length}</strong> master materials
                </span>
                <button
                  type="button"
                  onClick={loadData}
                  className="p-1.5 text-slate-400 hover:text-[#0B3470] rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Refresh list"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0B3470]' : ''}`} />
                </button>
              </div>
            </div>

            {/* Category horizontal filter bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('ALL')}
                className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategoryFilter === 'ALL'
                    ? 'bg-[#0B3470] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Categories ({materials.length})
              </button>
              {categories.map((cat) => {
                const count = materials.filter(
                  (m) => (m.materialCategory || m.categoryName || m.category)?.toLowerCase() === cat.name.toLowerCase()
                ).length
                return (
                  <button
                    key={cat.id || cat.name}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.name)}
                    className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategoryFilter.toLowerCase() === cat.name.toLowerCase()
                        ? 'bg-[#0B3470] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Directory Table */}
          {loading && materials.length === 0 ? (
            <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0B3470]" />
              <span className="text-xs font-semibold">Loading material catalog from Firestore...</span>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="bg-white p-16 text-center rounded-3xl border border-dashed border-slate-300 space-y-3">
              <Boxes className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">No master materials found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery || selectedCategoryFilter !== 'ALL'
                  ? 'No materials matched your search and filter criteria.'
                  : 'Your organization has not registered any materials yet. Switch to Tab 1 to configure your first material.'}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab(0)}
                className="px-4 py-2 bg-[#0B3470] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure New Material</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-4 px-5">Material Item & Sequence</th>
                      <th className="py-4 px-4">Category / Classification</th>
                      <th className="py-4 px-4">Standard Rate (₹)</th>
                      <th className="py-4 px-4">Warehouse Stock</th>
                      <th className="py-4 px-4">Reorder Level</th>
                      <th className="py-4 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredMaterials.map((item) => {
                      const isSelected =
                        selectedMaterialRow?.materialId === item.materialId ||
                        selectedMaterialRow?.id === item.id
                      const unitPrice = Number(item.unitPrice ?? item.materialPrice ?? item.standardRate) || 0
                      const reorder = Number(item.minReorderLevel || 20)
                      const unitStr = item.materialUnit || item.matUnit || item.unitName || item.unit || 'Bags'
                      const catStr = item.materialCategory || item.categoryName || item.category || 'General'
                      const subCatStr = item.materialSubCategory || item.subCategory || ''
                      const stockCount = Number(item.availableCount ?? item.count ?? item.currentTotalStock) || 0

                      return (
                        <tr
                          key={item.id || item.materialId}
                          onClick={() => handleSelectRow(item)}
                          className={`transition-colors cursor-pointer select-none ${
                            isSelected ? 'bg-blue-50/70 border-l-4 border-l-[#0B3470]' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          {/* Name & ID */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#0B3470] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                <Boxes className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-extrabold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    {item.materialId || item.id}
                                  </span>
                                  <strong className="font-bold text-slate-900 text-sm">
                                    {item.materialName || item.name}
                                  </strong>
                                </div>
                                {item.description && (
                                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 max-w-xs">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Classification */}
                          <td className="py-4 px-4">
                            <div className="space-y-0.5">
                              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg inline-block text-[11px]">
                                {catStr}
                              </span>
                              {subCatStr && (
                                <p className="text-[11px] text-slate-500 font-medium pl-1">
                                  ↳ {subCatStr}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Rate */}
                          <td className="py-4 px-4 font-extrabold text-slate-900 text-sm">
                            ₹{unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-[11px] font-normal text-slate-400">/ {unitStr}</span>
                          </td>

                          {/* Stock */}
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-1 font-bold ${
                              stockCount <= reorder ? 'text-amber-600' : 'text-slate-700'
                            }`}>
                              {stockCount.toLocaleString('en-IN')} {unitStr}
                              {stockCount <= reorder && stockCount > 0 && (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Low stock alert" />
                              )}
                            </span>
                          </td>

                          {/* Reorder */}
                          <td className="py-4 px-4 text-slate-600 font-medium">
                            {reorder} {unitStr}
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-5 text-right">
                            <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => handleOpenEditModal(item, e)}
                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                                title="Edit Material Specifications"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteMaterial(item, e)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Delete from Master Catalog"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          )}
        </div>
      )}

      {/* ======================================================================================= */}
      {/* EDIT MATERIAL DETAILS MODAL */}
      {/* ======================================================================================= */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Edit Material Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingMaterial.materialName || editingMaterial.name} ({editingMaterial.materialId || editingMaterial.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMaterial(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateModalSubmit} className="space-y-4 text-left">
              {/* Benchmark Unit Rate */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Benchmark Unit Rate (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="text"
                    required
                    inputMode="decimal"
                    value={editPrice}
                    onChange={(e) => handlePriceChange(e.target.value, setEditPrice)}
                    className="w-full pl-8 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-xl font-bold text-slate-900 outline-none focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15"
                  />
                </div>
              </div>

              {/* Unit of Measurement */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Unit of Measurement *
                </label>
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 font-medium outline-none focus:border-[#0B3470]"
                >
                  {units.map((u) => (
                    <option key={u.id || u.name} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reorder Threshold */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Reorder Threshold Level
                </label>
                <input
                  type="number"
                  min="1"
                  value={editReorder}
                  onChange={(e) => setEditReorder(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-[#0B3470]"
                />
              </div>

              {/* Technical Description */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Description / Specification Notes
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 outline-none focus:border-[#0B3470]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B3470] hover:bg-[#082654] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingEdit ? 'Saving Updates...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* ADD CATEGORY MODAL (Creates MCxxx) */}
      {/* ======================================================================================= */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Add Material Category</h3>
              <p className="text-xs text-slate-500 mt-0.5">Creates sequential MCxxx document in materialCategories collection.</p>
            </div>
            <form onSubmit={handleAddCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Masonry & Plaster"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B3470] hover:bg-[#082654] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* ADD SUBCATEGORY MODAL (Creates MSCxxx) */}
      {/* ======================================================================================= */}
      {showAddSubCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Add Subcategory</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Binds new MSCxxx record to active category <strong className="text-slate-800">{selectedCategory}</strong>.
              </p>
            </div>
            <form onSubmit={handleAddSubCategorySubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subcategory Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newSubCatName}
                  onChange={(e) => setNewSubCatName(e.target.value)}
                  placeholder="e.g. Fe550D 16mm TMT / PPC 43 Grade"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Default Unit (Optional)</label>
                <select
                  value={newSubCatUnit}
                  onChange={(e) => setNewSubCatUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 outline-none"
                >
                  <option value="">No default unit</option>
                  {units.map((u) => (
                    <option key={u.id || u.name} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddSubCatModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSubCatName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B3470] hover:bg-[#082654] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  Add Subcategory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* ADD UNIT MODAL (Creates MUxxx) */}
      {/* ======================================================================================= */}
      {showAddUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Add Unit of Measurement</h3>
              <p className="text-xs text-slate-500 mt-0.5">Creates sequential MUxxx document in materialUnits collection.</p>
            </div>
            <form onSubmit={handleAddUnitSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="e.g. Metric Tonnes / Sq.Ft."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit Abbreviation (Optional)</label>
                <input
                  type="text"
                  value={newUnitAbbr}
                  onChange={(e) => setNewUnitAbbr(e.target.value)}
                  placeholder="e.g. MT / sft"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:border-[#0B3470] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newUnitName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B3470] hover:bg-[#082654] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  Save Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
