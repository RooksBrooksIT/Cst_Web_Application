import React, { useState, useEffect, useMemo } from 'react'
import {
  Layers,
  FolderTree,
  GitCommit,
  FileSignature,
  Activity,
  Plus,
  Trash2,
  Edit3,
  Search,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  X,
  ShieldAlert,
  Info,
  ChevronRight,
  Hash,
} from 'lucide-react'
import {
  CONFIG_SECTIONS,
  subscribeConfigItems,
  createConfigItem,
  updateConfigItem,
  deleteConfigItem,
  checkConfigUsage,
} from '../../../services/projectConfigService.js'

export default function MasterConfigurations({ orgId, onNotify }) {
  const [activeTab, setActiveTab] = useState('category')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingMap, setLoadingMap] = useState({})
  const [actionLoading, setActionLoading] = useState(false)

  // Realtime Data States for 5 Pillars
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [stages, setStages] = useState([])
  const [contracts, setContracts] = useState([])
  const [statuses, setStatuses] = useState([])

  // Create Form Inputs
  const [inputNames, setInputNames] = useState({
    category: '',
    subCategory: '',
    stage: '',
    contract: '',
    status: '',
  })
  const [parentCategorySelect, setParentCategorySelect] = useState('')
  const [stageOrderInput, setStageOrderInput] = useState(1)

  // Modals
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [checkingUsage, setCheckingUsage] = useState(false)

  // 5 Pillars List
  const sectionList = useMemo(
    () => [
      { key: 'category', meta: CONFIG_SECTIONS.category, icon: Layers, data: categories },
      { key: 'subCategory', meta: CONFIG_SECTIONS.subCategory, icon: FolderTree, data: subCategories },
      { key: 'stage', meta: CONFIG_SECTIONS.stage, icon: GitCommit, data: stages },
      { key: 'contract', meta: CONFIG_SECTIONS.contract, icon: FileSignature, data: contracts },
      { key: 'status', meta: CONFIG_SECTIONS.status, icon: Activity, data: statuses },
    ],
    [categories, subCategories, stages, contracts, statuses]
  )

  // Realtime subscriptions for each of the 5 collections
  useEffect(() => {
    if (!orgId) return

    setLoadingMap({
      category: true,
      subCategory: true,
      stage: true,
      contract: true,
      status: true,
    })

    const unsubCategories = subscribeConfigItems(
      orgId,
      CONFIG_SECTIONS.category,
      (list) => {
        setCategories(list)
        setLoadingMap((prev) => ({ ...prev, category: false }))
      },
      () => setLoadingMap((prev) => ({ ...prev, category: false }))
    )

    const unsubSubCategories = subscribeConfigItems(
      orgId,
      CONFIG_SECTIONS.subCategory,
      (list) => {
        setSubCategories(list)
        setLoadingMap((prev) => ({ ...prev, subCategory: false }))
      },
      () => setLoadingMap((prev) => ({ ...prev, subCategory: false }))
    )

    const unsubStages = subscribeConfigItems(
      orgId,
      CONFIG_SECTIONS.stage,
      (list) => {
        setStages(list)
        setLoadingMap((prev) => ({ ...prev, stage: false }))
        setStageOrderInput(list.length + 1)
      },
      () => setLoadingMap((prev) => ({ ...prev, stage: false }))
    )

    const unsubContracts = subscribeConfigItems(
      orgId,
      CONFIG_SECTIONS.contract,
      (list) => {
        setContracts(list)
        setLoadingMap((prev) => ({ ...prev, contract: false }))
      },
      () => setLoadingMap((prev) => ({ ...prev, contract: false }))
    )

    const unsubStatus = subscribeConfigItems(
      orgId,
      CONFIG_SECTIONS.status,
      (list) => {
        setStatuses(list)
        setLoadingMap((prev) => ({ ...prev, status: false }))
      },
      () => setLoadingMap((prev) => ({ ...prev, status: false }))
    )

    return () => {
      unsubCategories()
      unsubSubCategories()
      unsubStages()
      unsubContracts()
      unsubStatus()
    }
  }, [orgId])

  // Handle Add Item
  const handleAdd = async (sectionKey) => {
    const meta = CONFIG_SECTIONS[sectionKey]
    const name = (inputNames[sectionKey] || '').trim()
    if (!name) {
      onNotify?.(`Please enter a valid ${meta.title} name`, 'warning')
      return
    }

    setActionLoading(true)
    try {
      let payload = { name }
      if (sectionKey === 'subCategory') {
        payload.projectCategory = parentCategorySelect.trim()
      } else if (sectionKey === 'stage') {
        payload.order = Number(stageOrderInput) || stages.length + 1
      }

      const created = await createConfigItem(orgId, meta, payload)
      onNotify?.(`Added "${created.name}" successfully`, 'success')

      setInputNames((prev) => ({ ...prev, [sectionKey]: '' }))
      if (sectionKey === 'subCategory') setParentCategorySelect('')
      if (sectionKey === 'stage') setStageOrderInput(stages.length + 2)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to add item', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Open Edit Modal
  const openEditModal = (meta, item) => {
    setEditModal({
      meta,
      item,
      name: item.name || '',
      parentCategory: item.projectCategory || '',
      order: item.order || 1,
    })
  }

  // Submit In-Place Update (Preserves Document ID)
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editModal) return

    const { meta, item, name, parentCategory, order } = editModal
    const cleanName = name.trim()
    if (!cleanName) {
      onNotify?.('Name cannot be empty', 'warning')
      return
    }

    setActionLoading(true)
    try {
      let updates = { name: cleanName }
      if (meta.type === 'subCategory') {
        updates.projectCategory = parentCategory.trim()
      } else if (meta.type === 'stage') {
        updates.order = Number(order) || 1
      }

      await updateConfigItem(orgId, meta, item.id, updates)
      onNotify?.(`Updated "${cleanName}" successfully`, 'success')
      setEditModal(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update configuration', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Open Delete Modal with Cascading Safeguard Check
  const openDeleteModal = async (meta, item) => {
    setDeleteModal({ meta, item, usage: [] })
    setCheckingUsage(true)
    try {
      const usageList = await checkConfigUsage(orgId, meta, item.name)
      setDeleteModal((prev) => (prev && prev.item.id === item.id ? { ...prev, usage: usageList } : prev))
    } catch (err) {
      console.error('Error checking usage:', err)
    } finally {
      setCheckingUsage(false)
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteModal) return
    const { meta, item } = deleteModal
    setActionLoading(true)
    try {
      await deleteConfigItem(orgId, meta, item.id)
      onNotify?.(`Deleted "${item.name}"`, 'info')
      setDeleteModal(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to delete configuration', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Active Section Data
  const activeSection = useMemo(() => {
    return sectionList.find((s) => s.key === activeTab) || sectionList[0]
  }, [sectionList, activeTab])

  // Active Section Filtered Items
  const filteredList = useMemo(() => {
    const data = activeSection.data || []
    if (!searchQuery.trim()) return data
    const q = searchQuery.toLowerCase()
    return data.filter((item) => {
      const title = (item.name || '').toLowerCase()
      const id = (item.id || '').toLowerCase()
      const parent = (item.projectCategory || '').toLowerCase()
      return title.includes(q) || id.includes(q) || parent.includes(q)
    })
  }, [activeSection.data, searchQuery])

  const isLoading = loadingMap[activeSection.key]
  const currentName = inputNames[activeSection.key] || ''

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Project Architecture
            </span>
            <span className="text-xs text-slate-400">• Master Scope</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project Configuration</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Standardize structural categories, stage lifecycles, and contractual parameters across all enterprise sites.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-[#0B3470] text-xs font-semibold rounded-xl border border-blue-200/80 transition-all cursor-pointer shadow-2xs"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <span>How Configuration Works</span>
          </button>
        </div>
      </div>

      {/* Two-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Vertical Configuration Tabs                                 */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3">
            <div className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-normal flex items-center justify-between border-b border-slate-100 mb-2">
              <span>Configuration Pillars</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-normal px-2 py-0.5 rounded-full">
                {sectionList.length} Tabs
              </span>
            </div>

            <div className="space-y-1.5">
              {sectionList.map((s) => {
                const Icon = s.icon
                const isActive = activeTab === s.key
                const count = s.data.length

                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(s.key)
                      setSearchQuery('')
                    }}
                    className={`group w-full flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#0B3470] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          isActive
                            ? 'bg-white/15 text-white'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-[#0B3470]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 truncate">
                        <div
                          className={`text-xs truncate ${
                            isActive ? 'font-medium text-white' : 'font-normal text-slate-800'
                          }`}
                        >
                          {s.meta.title}
                        </div>
                        <div
                          className={`text-[11px] font-normal ${
                            isActive ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          Prefix: {s.meta.idPrefix}###
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-normal transition-all ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/80'
                        }`}
                      >
                        {count}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 transition-all ${
                          isActive ? 'text-white' : 'text-slate-300 group-hover:text-slate-500'
                        }`}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configuration Hint Card */}
          <div className="bg-blue-50/50 border border-blue-100/80 rounded-2xl p-4 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-medium text-[#0B3470]">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Standardized Master Scope</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Modifications made here reflect instantly across all enterprise project workflows, stage tracking, and contract assignments.
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Configuration Details, Table & Add Form                    */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
            {/* Right Card Header: Active Pillar Details + Search */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-[#0B3470] flex items-center justify-center shrink-0 shadow-xs">
                  {React.createElement(activeSection.icon, { className: 'w-5 h-5' })}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">
                      {activeSection.meta.title}
                    </h2>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/70">
                      {activeSection.meta.idPrefix}###
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#0B3470] border border-blue-200/60">
                      {activeSection.data.length} {activeSection.data.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{activeSection.meta.placeholder}</p>
                </div>
              </div>

              {/* Search input bar */}
              <div className="relative w-full md:w-64 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeSection.meta.title}...`}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 hover:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#0B3470] focus:ring-2 focus:ring-blue-500/20 font-medium transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Top Input Bar: Add New Entry */}
            <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-100">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleAdd(activeSection.key)
                }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-700">
                    Add New {activeSection.meta.title}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Auto-assigns next ID ({activeSection.meta.idPrefix}###)
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={currentName}
                    onChange={(e) =>
                      setInputNames((prev) => ({ ...prev, [activeSection.key]: e.target.value }))
                    }
                    placeholder={activeSection.meta.placeholder}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-[#0B3470] focus:ring-2 focus:ring-blue-500/20 font-medium transition-all"
                  />

               

                  {/* Stage Order Sequence */}
                  {activeSection.key === 'stage' && (
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
                      <span className="text-[11px] font-semibold text-slate-500">Order:</span>
                      <input
                        type="number"
                        min="1"
                        value={stageOrderInput}
                        onChange={(e) => setStageOrderInput(e.target.value)}
                        placeholder="#"
                        title="Stage Sequence Number"
                        className="w-12 text-center text-xs font-bold text-slate-900 outline-none"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={actionLoading || !currentName.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add {activeSection.meta.title.replace('Project ', '')}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Structured Table / List of Configuration Values */}
            <div className="overflow-x-auto min-h-[220px]">
              {isLoading && activeSection.data.length === 0 ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#0B3470]" />
                  <span className="text-xs font-medium">Connecting to Firestore...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="p-8 m-6 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                  <p className="text-sm font-bold text-slate-700">
                    {searchQuery
                      ? 'No matching entries found'
                      : `No ${activeSection.meta.title} values configured yet`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    {searchQuery
                      ? `No results match "${searchQuery}". Try clearing the search filter.`
                      : 'Enter a name in the form above and click the Add button to create your first standard entry.'}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-[#0B3470] bg-blue-50 hover:bg-blue-100 rounded-lg transition-all cursor-pointer"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 w-16 text-center">#</th>
                      <th className="py-3 px-4">Configuration Name</th>
                      <th className="py-3 px-4 w-36">Identifier (ID)</th>
                      {activeSection.key === 'subCategory' && (
                        <th className="py-3 px-4 w-48">Parent Category</th>
                      )}
                      {activeSection.key === 'stage' && (
                        <th className="py-3 px-4 w-32 text-center">Lifecycle Order</th>
                      )}
                      <th className="py-3 px-4 w-28 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredList.map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* Sequence Number */}
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                            {activeSection.key === 'stage' ? item.order || idx + 1 : idx + 1}
                          </span>
                        </td>

                        {/* Name / Title */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{item.name}</div>
                        </td>

                        {/* Identifier */}
                        <td className="py-3 px-4">
                          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/70 inline-block">
                            {item.id}
                          </span>
                        </td>

                        {/* Hierarchy Details for SubCategory */}
                        {activeSection.key === 'subCategory' && (
                          <td className="py-3 px-4">
                            {item.projectCategory ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#0B3470] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md font-medium">
                                {item.projectCategory}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Independent</span>
                            )}
                          </td>
                        )}

                        {/* Lifecycle Order for Stage */}
                        {activeSection.key === 'stage' && (
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md">
                              Stage #{item.order || idx + 1}
                            </span>
                          </td>
                        )}

                        {/* Actions: Edit & Delete */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(activeSection.meta, item)}
                              className="p-1.5 text-slate-400 hover:text-[#0B3470] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit configuration (In-place update)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(activeSection.meta, item)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete configuration"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EDIT MODAL: In-place Firestore Update (Preserves Document ID)             */}
      {/* ========================================================================= */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 text-[#0B3470] flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit {editModal.meta.title}</h3>
                  <span className="text-[10px] font-mono text-slate-500">Document ID: {editModal.item.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Name / Title *
                </label>
                <input
                  type="text"
                  required
                  value={editModal.name}
                  onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                  placeholder={editModal.meta.placeholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-[#0B3470] focus:bg-white font-semibold"
                />
              </div>

              {editModal.meta.type === 'subCategory' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Parent Category
                  </label>
                  <select
                    value={editModal.parentCategory}
                    onChange={(e) => setEditModal({ ...editModal, parentCategory: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-[#0B3470] focus:bg-white"
                  >
                    <option value="">-- Independent --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {editModal.meta.type === 'stage' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Stage Lifecycle Order (#)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editModal.order}
                    onChange={(e) => setEditModal({ ...editModal, order: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-[#0B3470] focus:bg-white font-mono"
                  />
                </div>
              )}

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 flex items-start gap-2 text-xs text-blue-900">
                <Info className="w-4 h-4 text-[#0B3470] shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-600">
                  This updates the existing Firestore document in-place. The document ID (
                  <span className="font-mono font-bold text-slate-800">{editModal.item.id}</span>) remains unchanged.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !editModal.name.trim()}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE MODAL: Confirmation with Project Usage Safeguard Check             */}
      {/* ========================================================================= */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 mb-1">
              Delete {deleteModal.meta.title}?
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              Are you sure you want to delete{' '}
              <span className="font-bold text-slate-900">"{deleteModal.item.name}"</span> (
              <span className="font-mono text-slate-500">{deleteModal.item.id}</span>)? This action cannot be undone.
            </p>

            {checkingUsage && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 text-xs text-slate-500 mb-4">
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                <span>Checking if active construction projects reference this entry...</span>
              </div>
            )}

            {!checkingUsage && deleteModal.usage && deleteModal.usage.length > 0 && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 mb-4 space-y-2 text-xs text-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Referenced by {deleteModal.usage.length} Active Project(s)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  The following projects currently reference this configuration:
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1 font-semibold text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                  {deleteModal.usage.map((p) => (
                    <div key={p.projectId || p.id} className="truncate text-slate-800">
                      • {p.projectName || p.siteName || p.id}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  Deleting will remove this option from new project creation, while existing project records retain their historical text.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HELP MODAL: "How Configuration Works"                                     */}
      {/* ========================================================================= */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 text-[#0B3470] flex items-center justify-center">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">How Project Configuration Works</h3>
                  <p className="text-xs text-slate-500">eBricks Architecture & Lifecycle Flow</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs text-slate-600">
              <p>
                In the eBricks ecosystem, configuration operates at two distinct layers:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block mb-1">
                    Layer 1: Master Scope
                  </span>
                  <span className="text-xs font-bold text-slate-900 block mb-1">Master Configurations</span>
                  <p className="text-[11px] text-slate-500">
                    Defines standard reusable dictionaries for the entire organization (Categories, Stages, Contracts, etc.).
                    Stored under <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">/organisation/{'{orgId}'}/*</code>.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block mb-1">
                    Layer 2: Project Scope
                  </span>
                  <span className="text-xs font-bold text-slate-900 block mb-1">Site / Project Instance</span>
                  <p className="text-[11px] text-slate-500">
                    Applies chosen master configurations to a live construction project, budget, and supervisor team in Project & Site Setup.
                  </p>
                </div>
              </div>

              <h4 className="font-bold text-slate-900 pt-2 border-t border-slate-100">
                The 5 Construction Pillars
              </h4>

              <div className="space-y-2.5">
                {[
                  {
                    step: 1,
                    title: '1. Project Category (Prefix: PC)',
                    desc: 'Defines the overarching business sector (e.g. Residential, Commercial, Infrastructure, Industrial).',
                  },
                  {
                    step: 2,
                    title: '2. Project Sub-Category (Prefix: PSC)',
                    desc: 'Granular project typology (e.g. 2BHK Apartment, Gated Villa, Corporate Tech Park, Retail Mall).',
                  },
                  {
                    step: 3,
                    title: '3. Project Stage (Prefix: PST)',
                    desc: 'Ordered construction milestone sequence (e.g. Foundation, Plinth Beams, Brick Works, Finishing).',
                  },
                  {
                    step: 4,
                    title: '4. Project Contract (Prefix: CT)',
                    desc: 'Contractual execution model (e.g. Turnkey Fixed Price, Item Rate BOQ, Labour Only).',
                  },
                  {
                    step: 5,
                    title: '5. Project Status (Prefix: PSTU)',
                    desc: 'Live execution state (e.g. Planning Phase, In Progress, Snagging Inspection, Completed).',
                  },
                ].map((item) => (
                  <div key={item.step} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center shrink-0">
                      {item.step}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900 block">{item.title}</span>
                      <span className="text-[11px] text-slate-500">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-[11px] text-slate-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  All changes made here are instantly accessible across the mobile app and web portal.
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
