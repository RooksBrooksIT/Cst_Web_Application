import React, { useState, useEffect, useMemo } from 'react'
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Building2,
  X,
  Settings,
} from 'lucide-react'
import {
  fetchTools,
  createTool,
  updateTool,
  deleteTool,
  TOOL_CATEGORIES,
} from '../../../services/toolService.js'

export default function ToolsCatalog({ orgId, currentUser, onNotify }) {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Create / Edit Modal
  const [showModal, setShowModal] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState(TOOL_CATEGORIES[0])
  const [formOwner, setFormOwner] = useState('Org') // 'Org' | 'Rental'
  const [formCount, setFormCount] = useState('1')
  const [formStatus, setFormStatus] = useState('Available')
  const [formDescription, setFormDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchTools(orgId)
      setTools(data || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load tools registry', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleOpenCreate = () => {
    setEditingTool(null)
    setFormName('')
    setFormCategory(TOOL_CATEGORIES[0])
    setFormOwner('Org')
    setFormCount('1')
    setFormStatus('Available')
    setFormDescription('')
    setShowModal(true)
  }

  const handleOpenEdit = (t) => {
    setEditingTool(t)
    setFormName(t.toolName || t.name || '')
    setFormCategory(t.category || TOOL_CATEGORIES[0])
    setFormOwner(t.toolOwner || t.ownershipType || 'Org')
    setFormCount(t.toolCount || t.quantity || '1')
    setFormStatus(t.status || 'Available')
    setFormDescription(t.description || '')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!orgId || !formName.trim()) return

    setSubmitting(true)
    try {
      if (editingTool) {
        await updateTool(orgId, editingTool.id || editingTool.toolId, {
          toolName: formName.trim(),
          name: formName.trim(),
          category: formCategory,
          toolOwner: formOwner,
          ownershipType: formOwner,
          toolCount: Number(formCount) || 1,
          quantity: Number(formCount) || 1,
          status: formStatus,
          currentStatus: formStatus,
          description: formDescription,
        })
        onNotify?.('Equipment profile updated successfully', 'success')
      } else {
        await createTool(orgId, {
          toolName: formName.trim(),
          category: formCategory,
          toolOwner: formOwner,
          toolCount: Number(formCount) || 1,
          status: formStatus,
          description: formDescription,
        })
        onNotify?.('New equipment registered into inventory', 'success')
      }

      setShowModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to save equipment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (toolId) => {
    if (!orgId || !toolId) return
    if (!window.confirm('Delete this equipment from master registry?')) return
    try {
      await deleteTool(orgId, toolId)
      onNotify?.('Equipment removed', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete tool', 'error')
    }
  }

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      const name = (t.toolName || t.name || '').toLowerCase()
      const code = (t.toolCode || '').toLowerCase()
      const matchesSearch = name.includes(searchQuery.toLowerCase()) || code.includes(searchQuery.toLowerCase())
      const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [tools, searchQuery, categoryFilter, statusFilter])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
              Plant & Machinery
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tools & Equipment Registry</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain organizational asset codes, ownership, operational condition, and custody deployments.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Tool</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools by name, asset code..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Categories</option>
            {TOOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="Available">Available (Yard)</option>
            <option value="Dispatched">Dispatched to Site</option>
            <option value="Maintenance">Under Maintenance</option>
          </select>
        </div>
      </div>

      {/* Tools Table */}
      {loading && tools.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading tools registry...</div>
      ) : filteredTools.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No machinery or tools registered</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Register New Tool" to track concrete vibrators, total stations, breakers, or power drills.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Tool Specification</th>
                  <th className="py-3.5 px-4">Asset Code</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Ownership</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredTools.map((t) => {
                  const isAvailable = t.status === 'Available'
                  const isDispatched = t.status === 'Dispatched'
                  const isMaint = t.status === 'Maintenance'

                  return (
                    <tr key={t.id || t.toolId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
                            <Wrench className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{t.toolName || t.name}</p>
                            <p className="text-xs text-slate-400">{t.description || 'General Tool'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-700">
                        {t.toolCode || t.id}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                          {t.category || 'Power Tools'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                            t.toolOwner === 'Rental'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {t.toolOwner || 'Org'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isAvailable
                              ? 'bg-emerald-50 text-emerald-700'
                              : isDispatched
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAvailable ? 'bg-emerald-500' : isDispatched ? 'bg-blue-500' : 'bg-rose-500'
                            }`}
                          />
                          {t.status || 'Available'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Tool"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id || t.toolId)}
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

      {/* Add / Edit Tool Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingTool ? 'Edit Equipment Profile' : 'Register Machinery & Tool'}
                </h3>
                <p className="text-xs text-slate-500">Asset tracking for site operations.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Equipment / Tool Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Bosch Rotary Hammer Drill 800W"
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
                    {TOOL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Ownership *
                  </label>
                  <select
                    value={formOwner}
                    onChange={(e) => setFormOwner(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Org">Company Owned</option>
                    <option value="Rental">Rental / Leased</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formCount}
                    onChange={(e) => setFormCount(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Current Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Available">Available (Yard)</option>
                    <option value="Dispatched">Dispatched to Site</option>
                    <option value="Maintenance">Maintenance / Repair</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Serial Notes
                </label>
                <textarea
                  rows="2"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Serial # BSH-99214, serviced on Q2 2026"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
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
                  {submitting ? 'Saving...' : 'Save Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
