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
} from 'lucide-react'
import {
  fetchMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
} from '../../../services/materialService.js'

export default function MaterialsCatalog({ orgId, currentUser, onNotify }) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')

  // Create / Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState(MATERIAL_CATEGORIES[0])
  const [formUnit, setFormUnit] = useState('Bags')
  const [formPrice, setFormPrice] = useState('')
  const [formStock, setFormStock] = useState('')
  const [formReorder, setFormReorder] = useState('25')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchMaterials(orgId)
      setMaterials(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load materials catalog', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleOpenCreate = () => {
    setEditingMaterial(null)
    setFormName('')
    setFormCategory(MATERIAL_CATEGORIES[0])
    setFormUnit('Bags')
    setFormPrice('')
    setFormStock('')
    setFormReorder('25')
    setShowModal(true)
  }

  const handleOpenEdit = (m) => {
    setEditingMaterial(m)
    setFormName(m.materialName || m.name || '')
    setFormCategory(m.categoryName || m.category || MATERIAL_CATEGORIES[0])
    setFormUnit(m.unitName || m.unit || 'Bags')
    setFormPrice(m.unitPrice || m.standardRate || '')
    setFormStock(m.currentTotalStock || m.currentStock || '')
    setFormReorder(m.minReorderLevel || '25')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !formName.trim()) return

    setSubmitting(true)
    try {
      if (editingMaterial) {
        await updateMaterial(orgId, editingMaterial.id || editingMaterial.materialId, {
          materialName: formName.trim(),
          name: formName.trim(),
          category: formCategory,
          categoryName: formCategory,
          unit: formUnit,
          unitName: formUnit,
          unitPrice: Number(formPrice) || 0,
          standardRate: Number(formPrice) || 0,
          currentTotalStock: Number(formStock) || 0,
          currentStock: Number(formStock) || 0,
          minReorderLevel: Number(formReorder) || 20,
        })
        onNotify?.('Material updated successfully', 'success')
      } else {
        await createMaterial(orgId, {
          materialName: formName.trim(),
          category: formCategory,
          unit: formUnit,
          unitPrice: Number(formPrice) || 0,
          currentTotalStock: Number(formStock) || 0,
          minReorderLevel: Number(formReorder) || 20,
        })
        onNotify?.('Material added to master catalog', 'success')
      }
      setShowModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to save material', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (matId) => {
    if (!orgId || !matId) return
    if (!window.confirm('Delete this material from master catalog?')) return
    try {
      await deleteMaterial(orgId, matId)
      onNotify?.('Material removed', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete material', 'error')
    }
  }

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const name = (m.materialName || m.name || '').toLowerCase()
      const cat = (m.categoryName || m.category || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || cat.includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === 'ALL' || (m.categoryName || m.category) === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [materials, searchQuery, selectedCategory])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 bg-teal-50 px-2.5 py-0.5 rounded-full">
              Supply Chain Registry
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Materials Master Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">
            Standard construction materials inventory, benchmark procurement unit rates, and replenishment thresholds.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Material to Master</span>
        </button>
      </div>

      {/* Category Pills & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search materials by name..."
              className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredMaterials.length} of {materials.length} items
          </div>
        </div>

        {/* Category horizontal scroller */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {MATERIAL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Materials Table */}
      {loading && materials.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading materials catalog...</div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No materials found</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Add Material to Master" to register steel, cement, aggregates, or MEP consumables.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Material Specification</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Standard Unit Rate</th>
                  <th className="py-3.5 px-4">Central Stock</th>
                  <th className="py-3.5 px-4">Reorder Threshold</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMaterials.map((item) => {
                  const stock = Number(item.currentTotalStock || item.currentStock || 0)
                  const reorder = Number(item.minReorderLevel || 20)
                  const isLow = stock <= reorder

                  return (
                    <tr key={item.id || item.materialId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                            <Boxes className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">
                              {item.materialName || item.name}
                            </p>
                            <p className="text-xs text-slate-400">Unit: {item.unitName || item.unit || 'Units'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                          {item.categoryName || item.category || 'General'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        ₹{(Number(item.unitPrice || item.standardRate) || 0).toLocaleString('en-IN')} /{' '}
                        {item.unitName || item.unit || 'Unit'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              isLow ? 'text-rose-600' : 'text-slate-800'
                            }`}
                          >
                            {stock} {item.unitName || item.unit || ''}
                          </span>
                          {isLow && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md">
                              <AlertTriangle className="w-3 h-3" /> Low
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {reorder} {item.unitName || item.unit || ''}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Material"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id || item.materialId)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingMaterial ? 'Edit Material Spec' : 'Add Material to Master'}
                </h3>
                <p className="text-xs text-slate-500">Benchmark unit rates and inventory specifications.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Material Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. UltraTech Super Cement OPC 53"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {MATERIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Standard Unit *
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {MATERIAL_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Standard Rate (₹)</label>
                  <input
                    type="number"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="420"
                    className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Stock On Hand</label>
                  <input
                    type="number"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="100"
                    className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Reorder Level</label>
                  <input
                    type="number"
                    value={formReorder}
                    onChange={(e) => setFormReorder(e.target.value)}
                    placeholder="25"
                    className="w-full px-2.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
