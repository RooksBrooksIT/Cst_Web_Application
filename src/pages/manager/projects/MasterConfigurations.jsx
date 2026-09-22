import React, { useState, useEffect, useMemo } from 'react'
import {
  Layers,
  FolderTree,
  GitCommit,
  FileSignature,
  Activity,
  Plus,
  Trash2,
  Search,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
} from 'lucide-react'
import {
  fetchProjectCategories,
  addProjectCategory,
  deleteProjectCategory,
  fetchProjectSubCategories,
  addProjectSubCategory,
  deleteProjectSubCategory,
  fetchProjectStages,
  addProjectStage,
  deleteProjectStage,
  fetchProjectContracts,
  addProjectContract,
  deleteProjectContract,
  fetchProjectStatuses,
  addProjectStatus,
  deleteProjectStatus,
  DEFAULT_CONFIGS,
} from '../../../services/projectConfigService.js'

export default function MasterConfigurations({ orgId, onNotify }) {
  const [activeTab, setActiveTab] = useState('categories')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Data states
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [stages, setStages] = useState([])
  const [contracts, setContracts] = useState([])
  const [statuses, setStatuses] = useState([])

  // Modal / Form input states
  const [newItemName, setNewItemName] = useState('')
  const [selectedParentCategory, setSelectedParentCategory] = useState('')
  const [stageOrder, setStageOrder] = useState(1)
  const [deleteModal, setDeleteModal] = useState(null)

  const tabs = [
    { id: 'categories', label: 'Categories', icon: Layers, count: categories.length },
    { id: 'subCategories', label: 'Sub-Categories', icon: FolderTree, count: subCategories.length },
    { id: 'stages', label: 'Stages & Milestones', icon: GitCommit, count: stages.length },
    { id: 'contracts', label: 'Contract Models', icon: FileSignature, count: contracts.length },
    { id: 'statuses', label: 'Project Statuses', icon: Activity, count: statuses.length },
  ]

  const loadAll = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [cat, sub, stg, cont, stat] = await Promise.all([
        fetchProjectCategories(orgId),
        fetchProjectSubCategories(orgId),
        fetchProjectStages(orgId),
        fetchProjectContracts(orgId),
        fetchProjectStatuses(orgId),
      ])
      setCategories(cat || [])
      setSubCategories(sub || [])
      setStages((stg || []).sort((a, b) => (a.order || 0) - (b.order || 0)))
      setContracts(cont || [])
      setStatuses(stat || [])
    } catch (err) {
      console.error('Error loading master configurations:', err)
      onNotify?.('Failed to load master configurations', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [orgId])

  const handleAddItem = async (e) => {
    e.preventDefault()
    if (!newItemName.trim()) return

    setLoading(true)
    try {
      if (activeTab === 'categories') {
        await addProjectCategory(orgId, newItemName)
      } else if (activeTab === 'subCategories') {
        await addProjectSubCategory(orgId, newItemName, selectedParentCategory)
      } else if (activeTab === 'stages') {
        await addProjectStage(orgId, newItemName, stageOrder)
      } else if (activeTab === 'contracts') {
        await addProjectContract(orgId, newItemName)
      } else if (activeTab === 'statuses') {
        await addProjectStatus(orgId, newItemName)
      }

      setNewItemName('')
      setSelectedParentCategory('')
      setStageOrder(stages.length + 2)
      onNotify?.(`Added "${newItemName}" successfully`, 'success')
      await loadAll()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to add item', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteItem = async () => {
    if (!deleteModal) return
    const { id, name } = deleteModal
    setLoading(true)
    try {
      if (activeTab === 'categories') await deleteProjectCategory(orgId, id)
      else if (activeTab === 'subCategories') await deleteProjectSubCategory(orgId, id)
      else if (activeTab === 'stages') await deleteProjectStage(orgId, id)
      else if (activeTab === 'contracts') await deleteProjectContract(orgId, id)
      else if (activeTab === 'statuses') await deleteProjectStatus(orgId, id)

      setDeleteModal(null)
      onNotify?.(`Deleted "${name}"`, 'info')
      await loadAll()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete item', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSeedDefaults = async () => {
    if (!orgId) return
    setSeeding(true)
    try {
      if (activeTab === 'categories') {
        for (const name of DEFAULT_CONFIGS.categories) {
          if (!categories.some((c) => (c.name || c.projectCategory) === name)) {
            await addProjectCategory(orgId, name)
          }
        }
      } else if (activeTab === 'subCategories') {
        for (const item of DEFAULT_CONFIGS.subCategories) {
          if (!subCategories.some((s) => (s.name || s.projectSubCategory) === item.name)) {
            await addProjectSubCategory(orgId, item.name, item.category)
          }
        }
      } else if (activeTab === 'stages') {
        let order = 1
        for (const name of DEFAULT_CONFIGS.stages) {
          if (!stages.some((s) => (s.name || s.projectStage) === name)) {
            await addProjectStage(orgId, name, order++)
          }
        }
      } else if (activeTab === 'contracts') {
        for (const name of DEFAULT_CONFIGS.contracts) {
          if (!contracts.some((c) => (c.name || c.projectContract) === name)) {
            await addProjectContract(orgId, name)
          }
        }
      } else if (activeTab === 'statuses') {
        for (const name of DEFAULT_CONFIGS.statuses) {
          if (!statuses.some((s) => (s.name || s.projectStatus) === name)) {
            await addProjectStatus(orgId, name)
          }
        }
      }
      onNotify?.('Standard enterprise defaults seeded successfully', 'success')
      await loadAll()
    } catch (err) {
      console.error('Seed error:', err)
      onNotify?.('Failed to seed defaults', 'error')
    } finally {
      setSeeding(false)
    }
  }

  // Active collection items
  const activeItems = useMemo(() => {
    let list = []
    if (activeTab === 'categories') list = categories
    else if (activeTab === 'subCategories') list = subCategories
    else if (activeTab === 'stages') list = stages
    else if (activeTab === 'contracts') list = contracts
    else if (activeTab === 'statuses') list = statuses

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter((item) => {
      const name = item.name || item.projectCategory || item.projectSubCategory || item.projectStage || item.projectContract || item.projectStatus || ''
      return name.toLowerCase().includes(q)
    })
  }, [activeTab, categories, subCategories, stages, contracts, statuses, searchQuery])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Project Architecture
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Master Configurations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Standardize structural categories, stage lifecycles, and contractual parameters across all enterprise sites.
          </p>
        </div>
        <button
          onClick={handleSeedDefaults}
          disabled={seeding || loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{seeding ? 'Seeding...' : 'Load Industry Defaults'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setSearchQuery('')
              }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#0B3470] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Main Grid: Create Form + Items List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Item Form Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs h-fit space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Add New {tabs.find((t) => t.id === activeTab)?.label.slice(0, -1) || 'Item'}
            </h2>
            <span className="text-xs text-slate-400">Pillar Entry</span>
          </div>

          <form onSubmit={handleAddItem} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Title / Name *
              </label>
              <input
                type="text"
                required
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={`e.g. ${
                  activeTab === 'categories'
                    ? 'Hospitality & Resorts'
                    : activeTab === 'stages'
                    ? 'Basement Waterproofing'
                    : 'Standard BOQ Model'
                }`}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Parent Category for Sub-categories */}
            {activeTab === 'subCategories' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Parent Category
                </label>
                <select
                  value={selectedParentCategory}
                  onChange={(e) => setSelectedParentCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="">-- General / Independent --</option>
                  {categories.map((c) => {
                    const name = c.name || c.projectCategory
                    return (
                      <option key={c.id || name} value={name}>
                        {name}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Order for Stages */}
            {activeTab === 'stages' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Lifecycle Sequence (Order #)
                </label>
                <input
                  type="number"
                  min="1"
                  value={stageOrder}
                  onChange={(e) => setStageOrder(parseInt(e.target.value) || 1)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !newItemName.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Master</span>
            </button>
          </form>

          <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2.5 text-xs text-blue-800">
            <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Modifications here immediately synchronize with Project Creation wizards, mobile supervisor daily logs,
              and executive milestone tracking.
            </p>
          </div>
        </div>

        {/* Collection Items Table / List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Registered {tabs.find((t) => t.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-slate-500">
                {activeItems.length} active standard records
              </p>
            </div>

            {/* Quick Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter entries..."
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* List Content */}
          {loading && activeItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-sm">Synchronizing configurations...</span>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No records found</p>
              <p className="text-xs text-slate-400 mt-1">
                Add an entry using the left form or click "Load Industry Defaults".
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeItems.map((item, index) => {
                const name =
                  item.name ||
                  item.projectCategory ||
                  item.projectSubCategory ||
                  item.projectStage ||
                  item.projectContract ||
                  item.projectStatus ||
                  'Untitled'
                return (
                  <div
                    key={item.id || index}
                    className="py-3.5 px-2 flex items-center justify-between hover:bg-slate-50/80 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-semibold text-xs flex items-center justify-center">
                        {item.order || index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{name}</p>
                        {item.projectCategory && activeTab === 'subCategories' && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md mt-0.5 inline-block">
                            {item.projectCategory}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setDeleteModal({ id: item.id, name })}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove Configuration"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Delete Configuration?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Are you sure you want to remove <span className="font-semibold text-slate-800">"{deleteModal.name}"</span>?
              Existing projects referencing this tag will keep their historical record.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteItem}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
