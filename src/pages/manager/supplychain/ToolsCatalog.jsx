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
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Boxes,
  Truck,
  FileText,
  Sliders,
  Check,
  Hash,
} from 'lucide-react'
import {
  fetchTools,
  subscribeTools,
  registerMasterTool,
  updateMasterTool,
  deleteMasterTool,
  getNextToolId,
  generateToolCode,
  subscribeToolsAtCompany,
  subscribeToolsAtSite,
  TOOL_CATEGORIES,
} from '../../../services/toolService.js'

export default function ToolsCatalog({ orgId, sites = [], currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState('register') // 'register' | 'directory'
  const [tools, setTools] = useState([])
  const [toolsAtCompany, setToolsAtCompany] = useState([])
  const [toolsAtSite, setToolsAtSite] = useState([])
  const [loading, setLoading] = useState(true)
  const [nextToolId, setNextToolId] = useState('TC001')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [ownershipFilter, setOwnershipFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Tab 0: New Tool Registration Form
  const [toolName, setToolName] = useState('')
  const [toolOwner, setToolOwner] = useState('Org') // 'Org' | 'Rental'
  const [toolCategory, setToolCategory] = useState(TOOL_CATEGORIES[0])
  const [toolCount, setToolCount] = useState('1')
  const [toolStatus, setToolStatus] = useState('Available')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Tab 1: Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState(TOOL_CATEGORIES[0])
  const [editOwner, setEditOwner] = useState('Org')
  const [editCount, setEditCount] = useState('1')
  const [editStatus, setEditStatus] = useState('Available')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Live computed tool code preview
  const previewToolCode = useMemo(() => {
    return generateToolCode(toolName, toolOwner)
  }, [toolName, toolOwner])

  // Refresh next ID
  const refreshNextId = async () => {
    if (!orgId) return
    try {
      const id = await getNextToolId(orgId)
      setNextToolId(id)
    } catch (e) {
      console.error(e)
    }
  }

  // Real-time Firestore Subscriptions
  useEffect(() => {
    if (!orgId) return
    setLoading(true)

    refreshNextId()

    const unsubTools = subscribeTools(
      orgId,
      (data) => {
        setTools(data || [])
        setLoading(false)
      },
      (err) => {
        console.error('Tools subscription error:', err)
        setLoading(false)
      }
    )

    const unsubCompany = subscribeToolsAtCompany(
      orgId,
      (data) => setToolsAtCompany(data || []),
      (err) => console.error('ToolsAtCompany subscription error:', err)
    )

    const unsubSite = subscribeToolsAtSite(
      orgId,
      (data) => setToolsAtSite(data || []),
      (err) => console.error('ToolsAtSite subscription error:', err)
    )

    return () => {
      unsubTools?.()
      unsubCompany?.()
      unsubSite?.()
    }
  }, [orgId])

  // Handle Tab 0 Tool Registration
  const handleRegisterTool = async (e) => {
    e.preventDefault()
    if (!orgId) {
      onNotify?.('Organization session not ready', 'error')
      return
    }
    if (!toolName.trim()) {
      onNotify?.('Please enter a valid Equipment / Tool Name', 'error')
      return
    }

    const qty = Number(toolCount)
    if (isNaN(qty) || qty <= 0) {
      onNotify?.('Quantity must be greater than 0', 'error')
      return
    }

    setSubmitting(true)
    try {
      await registerMasterTool(orgId, {
        toolName: toolName.trim(),
        toolOwner,
        toolCode: previewToolCode,
        category: toolCategory,
        toolCount: qty,
        status: toolStatus,
        description: description.trim(),
      })

      onNotify?.(
        `Equipment "${toolName.trim()}" (${previewToolCode}) registered and initialized in Central Yard!`,
        'success'
      )

      // Reset Form
      setToolName('')
      setToolOwner('Org')
      setToolCategory(TOOL_CATEGORIES[0])
      setToolCount('1')
      setToolStatus('Available')
      setDescription('')

      await refreshNextId()
      setActiveTab('directory')
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to register equipment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Edit Open
  const handleOpenEdit = (tool) => {
    setEditingTool(tool)
    setEditName(tool.toolName || tool.name || '')
    setEditCategory(tool.category || TOOL_CATEGORIES[0])
    setEditOwner(tool.toolOwner || tool.ownershipType || 'Org')
    setEditCount(String(tool.toolCount || tool.quantity || '1'))
    setEditStatus(tool.status || 'Available')
    setEditDescription(tool.description || '')
    setShowEditModal(true)
  }

  // Handle Edit Submit
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!orgId || !editingTool) return

    setSavingEdit(true)
    try {
      await updateMasterTool(orgId, editingTool.id || editingTool.toolId, {
        toolName: editName.trim(),
        category: editCategory,
        toolOwner: editOwner,
        ownershipType: editOwner,
        toolCount: Number(editCount) || 1,
        quantity: Number(editCount) || 1,
        status: editStatus,
        currentStatus: editStatus,
        description: editDescription.trim(),
      })

      onNotify?.('Equipment specification updated successfully!', 'success')
      setShowEditModal(false)
      setEditingTool(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update equipment', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  // Handle Delete with Safety Check
  const handleDeleteTool = async (tool) => {
    if (!orgId || !tool) return
    const toolId = tool.id || tool.toolId
    const toolCode = tool.toolCode || generateToolCode(tool.toolName, tool.toolOwner)

    if (!window.confirm(`Are you sure you want to delete "${tool.toolName || toolCode}" from Master Registry?`)) {
      return
    }

    try {
      await deleteMasterTool(orgId, toolId, toolCode)
      onNotify?.(`Tool "${tool.toolName || toolCode}" removed from catalog`, 'info')
      await refreshNextId()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete tool', 'error')
    }
  }

  // Compute live warehouse & site deployed counts
  const toolStatsMap = useMemo(() => {
    const map = {}
    // Depot stock from toolsAtCompany
    toolsAtCompany.forEach((c) => {
      const code = c.toolCode || c.id
      if (!map[code]) map[code] = { depotAvailable: 0, siteDeployed: 0 }
      map[code].depotAvailable = Number(c.availableCount || 0)
    })
    // Site deployed stock from toolsAtSite
    toolsAtSite.forEach((s) => {
      const code = s.toolCode
      if (code) {
        if (!map[code]) map[code] = { depotAvailable: 0, siteDeployed: 0 }
        map[code].siteDeployed += Number(s.quantity || 0)
      }
    })
    return map
  }, [toolsAtCompany, toolsAtSite])

  // Filtered Tools for Tab 1 Directory
  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      const name = (t.toolName || t.name || '').toLowerCase()
      const code = (t.toolCode || t.id || '').toLowerCase()
      const cat = (t.category || '').toLowerCase()
      const desc = (t.description || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !q || name.includes(q) || code.includes(q) || cat.includes(q) || desc.includes(q)
      const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter
      const matchesOwner = ownershipFilter === 'ALL' || (t.toolOwner || t.ownershipType || 'Org') === ownershipFilter
      const matchesStatus = statusFilter === 'ALL' || (t.status || 'Available') === statusFilter

      return matchesSearch && matchesCategory && matchesOwner && matchesStatus
    })
  }, [tools, searchQuery, categoryFilter, ownershipFilter, statusFilter])

  // Overview metrics
  const totalFleetCount = useMemo(() => {
    return tools.reduce((acc, t) => acc + (Number(t.toolCount || t.quantity) || 1), 0)
  }, [tools])

  const totalDepotStock = useMemo(() => {
    return toolsAtCompany.reduce((acc, c) => acc + (Number(c.availableCount) || 0), 0)
  }, [toolsAtCompany])

  const totalDeployedStock = useMemo(() => {
    return toolsAtSite.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  }, [toolsAtSite])

  const totalRentalUnits = useMemo(() => {
    return tools.filter((t) => (t.toolOwner || t.ownershipType) === 'Rental').length
  }, [tools])

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/50">
              Plant & Machinery Governance
            </span>
            <span className="text-xs font-medium text-slate-400">• Mobile Synced Master</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tools Master</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain machinery asset codes, ownership profiles, operational status, and yard stock balances.
          </p>
        </div>

        {/* Tab Navigation Switch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('register')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-[#0B3470] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tab 0: Register Tool</span>
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'directory'
                ? 'bg-white text-[#0B3470] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Tab 1: Stock Directory ({tools.length})</span>
          </button>
        </div>
      </div>

      {/* Metric Bento Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Fleet Assets</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Wrench className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalFleetCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{tools.length} Unique Master Models</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Central Yard Reserve</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{totalDepotStock}</p>
          <p className="text-[11px] text-emerald-600/80 mt-0.5">Ready for Immediate Site Dispatch</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Deployed On Sites</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{totalDeployedStock}</p>
          <p className="text-[11px] text-amber-600/80 mt-0.5">In Field Custody</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rental / Hired Assets</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Sliders className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-700 mt-2">{totalRentalUnits}</p>
          <p className="text-[11px] text-purple-600/80 mt-0.5">Third-Party Leased Equipment</p>
        </div>
      </div>

      {/* TAB 0: REGISTER TOOL WORKFLOW */}
      {activeTab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Registration Form */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">New Tool / Plant Registration</h2>
                <p className="text-xs text-slate-500">
                  Register capital equipment or hired machinery into master catalog & central yard inventory.
                </p>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full font-mono text-xs font-bold">
                Next ID: {nextToolId}
              </span>
            </div>

            <form onSubmit={handleRegisterTool} className="space-y-5">
              {/* Tool Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Equipment / Tool Name *
                </label>
                <input
                  type="text"
                  required
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  placeholder="e.g. Concrete Mixer 10/7 Diesel, Bosch Rotary Hammer Drill 800W"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Ownership & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Ownership Classification *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setToolOwner('Org')}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        toolOwner === 'Org'
                          ? 'bg-blue-50 text-blue-800 border-blue-300 ring-2 ring-blue-500/20'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Org (Company Owned)
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolOwner('Rental')}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        toolOwner === 'Rental'
                          ? 'bg-purple-50 text-purple-800 border-purple-300 ring-2 ring-purple-500/20'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Rental (Hired Asset)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Equipment Category *
                  </label>
                  <select
                    value={toolCategory}
                    onChange={(e) => setToolCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {TOOL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantity & Operational Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Initial Fleet Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={toolCount}
                    onChange={(e) => setToolCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Units to initialize in Central Yard warehouse.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Operational Condition
                  </label>
                  <select
                    value={toolStatus}
                    onChange={(e) => setToolStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="Available">Available (Operational & Ready)</option>
                    <option value="Maintenance">Under Maintenance / Calibration</option>
                  </select>
                </div>
              </div>

              {/* Description & Technical Specs */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Technical Specifications / Serial / Warranty Notes
                </label>
                <textarea
                  rows="3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 10/7 CFT capacity, 6HP Kirloskar diesel engine, 12-month AMC with vendor."
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Submit CTA */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setToolName('')
                    setDescription('')
                    setToolCount('1')
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  disabled={submitting || !toolName.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Registering...' : 'Register Equipment'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Architecture & Code Preview Box */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">Deterministic Tool Identity</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Generated Canonical Tool Code:</span>
                  <div className="p-2.5 bg-slate-800/90 rounded-lg font-mono text-emerald-400 font-semibold border border-slate-700/60 break-all">
                    {previewToolCode || 'Tool_Name_(Org)'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Firestore Canonical Master Doc ID:</span>
                  <div className="p-2.5 bg-slate-800/90 rounded-lg font-mono text-blue-400 font-semibold border border-slate-700/60 break-all">
                    {nextToolId}_{previewToolCode || 'Tool_Name_(Org)'}
                  </div>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700 text-[11px] text-slate-300 space-y-1.5 mt-4">
                  <p className="font-semibold text-amber-300">Dual-Write Guarantee:</p>
                  <p>1. Catalog entry created in <code className="text-slate-100">/organisation/{orgId}/tools</code></p>
                  <p>2. Central Yard inventory initialized in <code className="text-slate-100">/organisation/{orgId}/toolsAtCompany</code></p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl text-xs text-amber-900">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Rental vs Org Capital Assets</p>
                  <p className="mt-1 text-amber-800/90 leading-relaxed text-[11px]">
                    Tagged rental equipment enforces return dates and rental vendor billing reconciliations in cross-module financial audits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: UPDATE & TOOL STOCK DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools by name, asset code, specs..."
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
                value={ownershipFilter}
                onChange={(e) => setOwnershipFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="ALL">All Ownership</option>
                <option value="Org">Org (Company Owned)</option>
                <option value="Rental">Rental / Leased</option>
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

              <button
                onClick={() => {
                  setSearchQuery('')
                  setCategoryFilter('ALL')
                  setOwnershipFilter('ALL')
                  setStatusFilter('ALL')
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                title="Reset Filters"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Directory Table */}
          {loading && tools.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <p className="text-sm">Synchronizing live equipment registry...</p>
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No machinery or tools found</p>
              <p className="text-xs text-slate-400 mt-1">
                Adjust search criteria or click "Tab 0: Register Tool" to enroll new assets.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Equipment Specification</th>
                      <th className="py-3.5 px-4">Canonical Code</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Ownership</th>
                      <th className="py-3.5 px-4 text-center">Central Yard</th>
                      <th className="py-3.5 px-4 text-center">On Sites</th>
                      <th className="py-3.5 px-4 text-center">Total Fleet</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredTools.map((t) => {
                      const code = t.toolCode || generateToolCode(t.toolName, t.toolOwner)
                      const stats = toolStatsMap[code] || { depotAvailable: t.availableCount || 0, siteDeployed: 0 }
                      const totalCount = Number(t.toolCount || t.quantity) || 1
                      const isRental = (t.toolOwner || t.ownershipType) === 'Rental'

                      return (
                        <tr key={t.id || t.toolId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                                  isRental ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                <Wrench className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 leading-snug">{t.toolName || t.name}</p>
                                <p className="text-xs text-slate-400 max-w-xs truncate">{t.description || 'Standard asset'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-700">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">{code}</span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                              {t.category || 'General Tools'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                isRental
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              {isRental ? 'Rental Asset' : 'Company (Org)'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="font-bold text-emerald-700 text-sm">{stats.depotAvailable}</span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="font-bold text-amber-700 text-sm">{stats.siteDeployed}</span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="font-bold text-slate-900 text-sm">{totalCount}</span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                t.status === 'Available' || !t.status
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : t.status === 'Dispatched'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  t.status === 'Available' || !t.status
                                    ? 'bg-emerald-500'
                                    : t.status === 'Dispatched'
                                    ? 'bg-blue-500'
                                    : 'bg-rose-500'
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
                                title="Edit Specification"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTool(t)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Asset"
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

      {/* EDIT TOOL MODAL */}
      {showEditModal && editingTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Equipment Profile</h3>
                <p className="text-xs text-slate-500 font-mono">{editingTool.toolCode || editingTool.id}</p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingTool(null)
                }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Equipment / Tool Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
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
                    Ownership
                  </label>
                  <select
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Org">Company Owned</option>
                    <option value="Rental">Rental Asset</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Total Fleet Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editCount}
                    onChange={(e) => setEditCount(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Available">Available (Ready)</option>
                    <option value="Dispatched">Dispatched to Site</option>
                    <option value="Maintenance">Under Maintenance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Technical Specifications / Notes
                </label>
                <textarea
                  rows="2"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingTool(null)
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
