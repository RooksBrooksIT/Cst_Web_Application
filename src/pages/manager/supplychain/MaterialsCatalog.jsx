import React, { useState, useEffect, useMemo } from 'react'
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
  MATERIAL_CATEGORIES as DEFAULT_CATEGORIES,
  MATERIAL_UNITS as DEFAULT_UNITS,
} from '../../../services/materialService.js'

export default function MaterialsCatalog({ orgId, currentUser, onNotify }) {
  // Tab 0: New Material | Tab 1: Update Material & Price
  const [activeTab, setActiveTab] = useState(0)
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL')

  // Dynamic Metadata Lists
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [units, setUnits] = useState([])
  const [nextIdPreview, setNextIdPreview] = useState('MT001')

  // Tab 0 Form State
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formSubCategory, setFormSubCategory] = useState('')
  const [formUnit, setFormUnit] = useState('Bags')
  const [formPrice, setFormPrice] = useState('')
  const [formInitialStock, setFormInitialStock] = useState('')
  const [formReorderLevel, setFormReorderLevel] = useState('25')
  const [formDescription, setFormDescription] = useState('')
  const [submittingCreate, setSubmittingCreate] = useState(false)

  // Tab 1 Edit Modal State
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [editPrice, setEditPrice] = useState('')
  const [editReorder, setEditReorder] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // Helper Modals State (+ Add Category / Subcategory / Unit)
  const [showAddCatModal, setShowAddCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showAddSubCatModal, setShowAddSubCatModal] = useState(false)
  const [newSubCatName, setNewSubCatName] = useState('')
  const [showAddUnitModal, setShowAddUnitModal] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitAbbr, setNewUnitAbbr] = useState('')

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

      // Categories
      const mergedCats = Array.from(
        new Set([...DEFAULT_CATEGORIES, ...(cats || []).map((c) => c.matCategory || c.categoryName).filter(Boolean)])
      )
      setCategories(mergedCats)
      if (!formCategory && mergedCats.length > 0) setFormCategory(mergedCats[0])

      // Subcategories
      setSubCategories(subCats || [])

      // Units
      const mergedUnits = Array.from(
        new Set([...DEFAULT_UNITS, ...(unts || []).map((u) => u.unitName).filter(Boolean)])
      )
      setUnits(mergedUnits)
      if (!formUnit && mergedUnits.length > 0) setFormUnit(mergedUnits[0])
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

  // Filtered subcategories based on selected category in form
  const availableSubCategories = useMemo(() => {
    if (!formCategory) return []
    return subCategories.filter((s) => !s.categoryName || s.categoryName === formCategory)
  }, [subCategories, formCategory])

  // ----------------------------------------------------------------------------------------------
  // Form Submission: Tab 0 (New Material)
  // ----------------------------------------------------------------------------------------------
  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !formName.trim()) {
      onNotify?.('Material Item Name is required', 'error')
      return
    }

    setSubmittingCreate(true)
    try {
      await createMasterMaterial(orgId, {
        materialName: formName.trim(),
        materialCategory: formCategory || 'General',
        materialSubCategory: formSubCategory || '',
        materialUnit: formUnit || 'Bags',
        unitPrice: Number(formPrice) || 0,
        availableCount: Number(formInitialStock) || 0,
        minReorderLevel: Number(formReorderLevel) || 20,
        description: formDescription.trim(),
      })

      onNotify?.(`Material "${formName.trim()}" registered into Master Catalog!`, 'success')
      setFormName('')
      setFormPrice('')
      setFormInitialStock('')
      setFormDescription('')
      setFormSubCategory('')
      await loadData()
      setActiveTab(1) // Switch to update directory
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to register material', 'error')
    } finally {
      setSubmittingCreate(false)
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Form Submission: Tab 1 Edit In-Place
  // ----------------------------------------------------------------------------------------------
  const handleOpenEdit = (m) => {
    setEditingMaterial(m)
    setEditPrice(String(m.unitPrice || m.standardRate || ''))
    setEditReorder(String(m.minReorderLevel || '25'))
    setEditDescription(m.description || '')
  }

  const handleUpdateSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !editingMaterial) return

    setSubmittingEdit(true)
    try {
      await updateMasterMaterial(orgId, editingMaterial.id || editingMaterial.materialId, {
        materialName: editingMaterial.materialName || editingMaterial.name,
        unitPrice: Number(editPrice) || 0,
        standardRate: Number(editPrice) || 0,
        minReorderLevel: Number(editReorder) || 20,
        description: editDescription.trim(),
        materialUnit: editingMaterial.materialUnit || editingMaterial.unit || 'Bags',
      })

      onNotify?.('Material benchmark price and specifications updated!', 'success')
      setEditingMaterial(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update material', 'error')
    } finally {
      setSubmittingEdit(false)
    }
  }

  const handleDelete = async (mat) => {
    if (!orgId || !mat) return
    const id = mat.id || mat.materialId
    const name = mat.materialName || mat.name || 'this material'

    if (!window.confirm(`Are you sure you want to delete "${name}" from the Master Catalog?`)) return

    try {
      await deleteMasterMaterial(orgId, id, name)
      onNotify?.(`Material "${name}" removed from catalog`, 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete material', 'error')
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Add Category / Subcategory / Unit Modals Handlers
  // ----------------------------------------------------------------------------------------------
  const handleAddCategorySubmit = async (e) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    try {
      await createMaterialCategory(orgId, newCatName.trim())
      onNotify?.(`Category "${newCatName.trim()}" added`, 'success')
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
      await createMaterialSubCategory(orgId, newSubCatName.trim(), formCategory)
      onNotify?.(`Subcategory "${newSubCatName.trim()}" added to ${formCategory}`, 'success')
      setNewSubCatName('')
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
      await createMaterialUnit(orgId, newUnitName.trim(), newUnitAbbr.trim())
      onNotify?.(`Unit "${newUnitName.trim()}" registered`, 'success')
      setNewUnitName('')
      setNewUnitAbbr('')
      setShowAddUnitModal(false)
      await loadData()
    } catch (err) {
      onNotify?.(err.message || 'Failed to add unit', 'error')
    }
  }

  // Filtered materials in Tab 1
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const name = (m.materialName || m.name || '').toLowerCase()
      const cat = (m.materialCategory || m.categoryName || m.category || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || cat.includes(searchQuery.toLowerCase())
      const matchesCat =
        selectedCategoryFilter === 'ALL' ||
        (m.materialCategory || m.categoryName || m.category) === selectedCategoryFilter
      return matchesSearch && matchesCat
    })
  }, [materials, searchQuery, selectedCategoryFilter])

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0B3470] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
              Supply Chain Registry
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Material Master</h1>
          <p className="text-sm text-slate-500 mt-1">
            Standard construction materials inventory, benchmark procurement unit rates, and replenishment thresholds.
          </p>
        </div>

        {/* 2-Tab Navigation Bar */}
        <div className="flex items-center bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab(0)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 0
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tab 0: New Material
          </button>
          <button
            onClick={() => setActiveTab(1)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 1
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tab 1: Update & Price Directory ({materials.length})
          </button>
        </div>
      </div>

      {/* ======================================================================================= */}
      {/* TAB 0: NEW MATERIAL CONFIGURATION */}
      {/* ======================================================================================= */}
      {activeTab === 0 && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Register New Master Material</h2>
              <p className="text-xs text-slate-500">
                Define specifications, classification taxonomy, and procurement rates.
              </p>
            </div>
            <span className="px-3 py-1 bg-blue-50 text-[#0B3470] font-mono text-xs font-bold rounded-lg border border-blue-200">
              Assigned ID: {nextIdPreview}
            </span>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-6">
            {/* Row 1: Material Item Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Material Item Name *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. UltraTech Super Cement OPC 53 Grade / 12mm TMT Fe550D Steel Bars"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white text-slate-900 font-medium"
              />
            </div>

            {/* Row 2: Category & Subcategory */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Master Category *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCatModal(true)}
                    className="text-[11px] text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Category
                  </button>
                </div>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Sub-Category (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddSubCatModal(true)}
                    className="text-[11px] text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Subcategory
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    list="subcat-options"
                    value={formSubCategory}
                    onChange={(e) => setFormSubCategory(e.target.value)}
                    placeholder="e.g. 53 Grade / 12mm TMT / Binding Wire"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                  />
                  <datalist id="subcat-options">
                    {availableSubCategories.map((s) => (
                      <option key={s.id || s.subCategory} value={s.subCategory} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Row 3: Unit, Price, Initial Stock, Reorder */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Standard Unit *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddUnitModal(true)}
                    className="text-[11px] text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Unit
                  </button>
                </div>
                <select
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Unit Price (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="380"
                    className="w-full pl-7 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Initial Central Stock
                </label>
                <input
                  type="number"
                  min="0"
                  value={formInitialStock}
                  onChange={(e) => setFormInitialStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Reorder Alert Level
                </label>
                <input
                  type="number"
                  min="1"
                  value={formReorderLevel}
                  onChange={(e) => setFormReorderLevel(e.target.value)}
                  placeholder="25"
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>
            </div>

            {/* Row 4: Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Technical Specifications / Grade Notes
              </label>
              <textarea
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Standard OPC 53 Grade cement for structural RCC and column casting"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={submittingCreate}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{submittingCreate ? 'Registering Material...' : 'Save Material to Master Catalog'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* TAB 1: UPDATE MATERIAL & PRICE DIRECTORY */}
      {/* ======================================================================================= */}
      {activeTab === 1 && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search materials by name or category..."
                  className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Showing {filteredMaterials.length} of {materials.length} master items
              </div>
            </div>

            {/* Category horizontal scroller */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategoryFilter === 'ALL'
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryFilter === cat
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Table */}
          {loading && materials.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading master material registry...</div>
          ) : filteredMaterials.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No materials match the filter</p>
              <p className="text-xs text-slate-400 mt-1">
                Switch to Tab 0 to register a new material into the catalog.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Material ID & Description</th>
                      <th className="py-3.5 px-4">Classification</th>
                      <th className="py-3.5 px-4">Benchmark Unit Rate</th>
                      <th className="py-3.5 px-4">Reorder Threshold</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredMaterials.map((item) => {
                      const unitPrice = Number(item.unitPrice || item.standardRate) || 0
                      const reorder = Number(item.minReorderLevel || 20)
                      const unitStr = item.materialUnit || item.unitName || item.unit || 'Unit'
                      const catStr = item.materialCategory || item.categoryName || item.category || 'General'
                      const subCatStr = item.materialSubCategory || item.subCategory

                      return (
                        <tr key={item.id || item.materialId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0B3470] flex items-center justify-center font-bold text-xs">
                                <Boxes className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                    {item.materialId || item.id}
                                  </span>
                                  <p className="font-bold text-slate-900 leading-snug">
                                    {item.materialName || item.name}
                                  </p>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Unit: <span className="font-medium text-slate-600">{unitStr}</span>
                                  {item.description && ` • ${item.description}`}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-md inline-block">
                                {catStr}
                              </span>
                              {subCatStr && (
                                <p className="text-[11px] text-slate-400 font-medium">{subCatStr}</p>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            ₹{unitPrice.toLocaleString('en-IN')}{' '}
                            <span className="text-xs font-normal text-slate-400">/ {unitStr}</span>
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-600 font-medium">
                            {reorder} {unitStr}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Update Price / Specs"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Unallocated Material"
                              >
                                <Trash2 className="w-4 h-4" />
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
      {/* EDIT MATERIAL PRICE & SPECS MODAL */}
      {/* ======================================================================================= */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Update Benchmark Price & Specs</h3>
                <p className="text-xs text-slate-500">
                  {editingMaterial.materialName || editingMaterial.name} ({editingMaterial.materialId || editingMaterial.id})
                </p>
              </div>
              <button
                onClick={() => setEditingMaterial(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Procurement Unit Rate (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Reorder Threshold Level
                </label>
                <input
                  type="number"
                  min="1"
                  value={editReorder}
                  onChange={(e) => setEditReorder(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Specification Notes
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMaterial(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingEdit ? 'Saving...' : 'Update Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* ADD CATEGORY MODAL */}
      {/* ======================================================================================= */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Add New Material Category</h3>
            <p className="text-xs text-slate-500 mb-3">Creates standard category in materialCategories collection.</p>
            <form onSubmit={handleAddCategorySubmit} className="space-y-3">
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Masonry & Plaster"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0B3470] rounded-lg shadow-xs"
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* ADD SUBCATEGORY MODAL */}
      {/* ======================================================================================= */}
      {showAddSubCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Add Subcategory for {formCategory}</h3>
            <p className="text-xs text-slate-500 mb-3">Stored in materialSubCategories.</p>
            <form onSubmit={handleAddSubCategorySubmit} className="space-y-3">
              <input
                type="text"
                required
                value={newSubCatName}
                onChange={(e) => setNewSubCatName(e.target.value)}
                placeholder="e.g. 43 Grade PPC"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSubCatModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0B3470] rounded-lg shadow-xs"
                >
                  Add Subcategory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================================= */}
      {/* ADD UNIT MODAL */}
      {/* ======================================================================================= */}
      {showAddUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Add Measurement Unit</h3>
            <p className="text-xs text-slate-500 mb-3">Stored in materialUnits with UNT sequential code.</p>
            <form onSubmit={handleAddUnitSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Unit Full Name *</label>
                <input
                  type="text"
                  required
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="e.g. Metric Tonnes"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Abbreviation (Optional)</label>
                <input
                  type="text"
                  value={newUnitAbbr}
                  onChange={(e) => setNewUnitAbbr(e.target.value)}
                  placeholder="e.g. MT"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0B3470] rounded-lg shadow-xs"
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

