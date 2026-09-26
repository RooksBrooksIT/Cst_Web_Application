import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Table,
  LayoutGrid,
  Building2,
  MapPin,
  User,
  HardHat,
  Wallet,
  ExternalLink,
  Search,
  Eye,
  Edit,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'
import ProjectAlertBadge from '../../../components/common/ProjectAlertBadge'
import { evaluateAllProjectAlerts, evaluateProjectAlerts } from '../../../utils/projectAlerts'

function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime()) ? 'N/A' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

export default function SitesPortfolio({ sites = [], supervisors = [] }) {
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'
  const [statusFilter, setStatusFilter] = useState('All') // 'All' | 'Live' | 'In Progress' | 'Planning' | 'Completed' | 'On Hold'
  const [search, setSearch] = useState('')
  const [selectedSite, setSelectedSite] = useState(null)

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const currentStat = s.projectStatus || s.currentStatus || s.status || 'In Progress'
      const matchesStatus =
        statusFilter === 'All' ||
        currentStat.toLowerCase() === statusFilter.toLowerCase() ||
        (statusFilter === 'Live' && !['completed', 'cancelled', 'on hold'].includes(currentStat.toLowerCase()))

      const q = search.toLowerCase()
      const matchesQuery =
        !q ||
        (s.siteName || s.name || '').toLowerCase().includes(q) ||
        (s.siteCode || s.code || '').toLowerCase().includes(q) ||
        (s.clientName || '').toLowerCase().includes(q) ||
        (s.location || s.siteLocation || '').toLowerCase().includes(q) ||
        (s.supervisorName || '').toLowerCase().includes(q)

      return matchesStatus && matchesQuery
    })
  }, [sites, statusFilter, search])

  // Summary Metrics
  const summary = useMemo(() => {
    let totalBudget = 0
    let totalSpent = 0
    filteredSites.forEach((s) => {
      totalBudget += Number(s.projectBudget || s.budget || s.totalBudget) || 0
      totalSpent += Number(s.totalAmountSpent || s.spentAmount || s.amountSpent) || 0
    })
    const utilPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
    const alertSummary = evaluateAllProjectAlerts(filteredSites)

    return {
      count: filteredSites.length,
      totalBudget,
      totalSpent,
      utilPercent,
      alertSummary,
    }
  }, [filteredSites])

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 text-blue-800">
              Projects & Sites
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Sites Directory</h1>
          <p className="text-xs text-slate-500">Live monitoring of active project sites, sanctioned budget utilization, and field geofences</p>
        </div>

        <div className="flex items-center gap-2">
          <ExportButton
            data={filteredSites.map((s) => ({
              SiteID: s.siteId || s.id,
              SiteName: s.siteName || s.name,
              Code: s.siteCode || s.code,
              Category: s.projectCategory || 'General',
              Budget: s.projectBudget || s.budget || 0,
              TotalSpent: s.totalAmountSpent || s.spentAmount || 0,
              Status: s.projectStatus || s.status || 'In Progress',
              Stage: s.projectStage || s.currentStage || 'Demarcation',
              Supervisor: s.supervisorName || 'N/A',
              Contractor: s.contractorName || 'N/A',
              Location: s.siteLocation || s.location || 'N/A',
            }))}
            filename="sites_directory.csv"
          />
          <Link
            to="/manager/project-site-setup"
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>＋ Project & Site Setup</span>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Listed Sites</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{summary.count}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0B3470] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Sanctioned Budget</p>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{money(summary.totalBudget)}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Expenditure</p>
            <h3 className="text-xl font-bold text-blue-900 mt-1">{money(summary.totalSpent)}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Active Project Alerts</p>
            <div className="flex items-baseline gap-2 mt-1">
              <h3 className="text-2xl font-bold text-slate-900">{summary.alertSummary.totalAlerts}</h3>
              {summary.alertSummary.criticalCount > 0 && (
                <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                  {summary.alertSummary.criticalCount} Critical
                </span>
              )}
            </div>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${summary.alertSummary.criticalCount > 0 ? 'bg-rose-50 text-rose-600' : summary.alertSummary.warningCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Controls Bar: Filters, Search, and View Mode Toggle */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto w-full lg:w-auto scrollbar-none pb-1 lg:pb-0">
          {['All', 'Live', 'In Progress', 'Planning', 'Completed', 'On Hold'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search site, code, client, supervisor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          {/* View Mode Toggle Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#0B3470] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Table View"
            >
              <Table className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-[#0B3470] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Table View or Cards View */}
      {filteredSites.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
          No construction sites matching the selected filter or search.
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW FORMAT */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Site Code & Name</th>
                  <th className="py-3.5 px-4">Location & Geofence</th>
                  <th className="py-3.5 px-4">Client Details</th>
                  <th className="py-3.5 px-4">Stage & Status</th>
                  <th className="py-3.5 px-4">Assigned Personnel</th>
                  <th className="py-3.5 px-4">Budget Utilization</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredSites.map((site) => {
                  const budget = Number(site.projectBudget || site.budget || site.totalBudget) || 0
                  const spent = Number(site.totalAmountSpent || site.spentAmount || site.amountSpent) || 0
                  const percent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
                  const status = site.projectStatus || site.currentStatus || site.status || 'In Progress'

                  return (
                    <tr key={site.id || site.siteId} className="hover:bg-slate-50/70 transition-colors">
                      {/* Site Code & Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0B3470] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <strong className="block font-bold text-slate-900 text-sm">
                              {site.siteName || site.name || site.id}
                            </strong>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold border border-slate-200">
                                {site.siteCode || site.code || 'SITE'}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {site.projectCategory || 'General'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Location & Geofence */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-slate-700 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="line-clamp-1">{site.siteLocation || site.location || 'Location specified'}</span>
                          </div>
                          {Number(site.latitude) !== 0 && site.latitude && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline text-[11px] font-semibold"
                            >
                              <span>GPS Maps</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Client Details */}
                      <td className="py-3.5 px-4">
                        <div>
                          <p className="font-semibold text-slate-800">{site.clientName || 'N/A'}</p>
                          <p className="text-slate-500 text-[11px]">{site.clientPhone || 'No phone registered'}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">{site.contractType || 'Turnkey'}</p>
                        </div>
                      </td>

                      {/* Stage & Status */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={status} />
                            <ProjectAlertBadge project={site} showDetails={true} />
                          </div>
                          <p className="text-slate-600 text-[11px] font-medium">
                            <span className="text-slate-400">Stage: </span>
                            {site.projectStage || site.currentStage || 'Demarcation'}
                          </p>
                        </div>
                      </td>

                      {/* Assigned Personnel */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-slate-500">Super: </span>
                            <span className="font-medium text-slate-800">{site.supervisorName || 'Not Assigned'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HardHat className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-slate-500">Contr: </span>
                            <span className="font-medium text-slate-800">{site.contractorName || 'In-House'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Budget Utilization */}
                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">Spent: <strong className="text-slate-900">{money(spent)}</strong></span>
                            <span className="text-slate-400">Budget: {money(budget)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                percent > 90 ? 'bg-rose-600' : percent > 75 ? 'bg-amber-500' : 'bg-[#0B3470]'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>{percent}% Sanctioned</span>
                            <span className="font-medium text-emerald-700">Rem: {money(Math.max(0, budget - spent))}</span>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedSite(site)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 transition-colors"
                            title="View Site Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <Link
                            to={`/manager/project-site-setup?tab=update&siteId=${site.id || site.siteId || site.projectId}`}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-[#0B3470] hover:bg-blue-50 border border-slate-200 transition-colors"
                            title="Edit Site Setup"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS VIEW FORMAT */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSites.map((site) => {
            const budget = Number(site.projectBudget || site.budget || site.totalBudget) || 0
            const spent = Number(site.totalAmountSpent || site.spentAmount || site.amountSpent) || 0
            const percent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
            const status = site.projectStatus || site.currentStatus || site.status || 'In Progress'

            return (
              <div
                key={site.id || site.siteId}
                className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="block text-base font-bold text-slate-900">{site.siteName || site.name || site.id}</strong>
                      <span className="text-xs text-slate-400 font-mono">{site.siteCode || site.code || 'SITE'} · {site.projectCategory || 'General'}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={status} />
                      <ProjectAlertBadge project={site} showDetails={true} />
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-1">{site.siteLocation || site.location || 'Location specified'}</p>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400 text-[11px]">Current Stage:</span>
                      <strong className="text-slate-800 text-[11px]">{site.projectStage || site.currentStage || '1. Demarcation'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 text-[11px]">Supervisor:</span>
                      <span className="text-slate-700 font-medium text-[11px]">{site.supervisorName || 'Not Assigned'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 text-[11px]">Contractor:</span>
                      <span className="text-slate-700 font-medium text-[11px]">{site.contractorName || 'In-House'}</span>
                    </div>
                  </div>
                </div>

                {/* Budget Utilization Meter */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Spent: <strong className="text-slate-900">{money(spent)}</strong></span>
                    <span className="text-slate-500">Budget: <strong className="text-slate-900">{money(budget)}</strong></span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        percent > 90 ? 'bg-rose-600' : percent > 75 ? 'bg-amber-500' : 'bg-[#0B3470]'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{percent}% Sanctioned Limit</span>
                    {Number(site.latitude) !== 0 && site.latitude && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        📍 View Map ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSite(site)}
                    className="py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Details</span>
                  </button>
                  <Link
                    to={`/manager/project-site-setup?tab=update&siteId=${site.id || site.siteId || site.projectId}`}
                    className="py-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#0B3470] text-center border border-blue-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Site ↗</span>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Financial Details Modal */}
      {selectedSite && (
        <Modal
          isOpen={Boolean(selectedSite)}
          onClose={() => setSelectedSite(null)}
          title={selectedSite.siteName || selectedSite.name}
          subtitle={`Site ID: ${selectedSite.siteId || selectedSite.id} · Code: ${selectedSite.siteCode || selectedSite.code || 'N/A'}`}
        >
          <div className="p-6 space-y-4 text-xs">
            <ProjectAlertBadge project={selectedSite} layout="banner" showDetails={true} />

            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div><span className="text-slate-400 block">Category:</span><strong>{selectedSite.projectCategory || 'General'}</strong></div>
              <div><span className="text-slate-400 block">Sub-Category:</span><strong>{selectedSite.projectSubCategory || 'N/A'}</strong></div>
              <div><span className="text-slate-400 block">Client:</span><strong>{selectedSite.clientName || 'N/A'}</strong> ({selectedSite.clientPhone || 'No phone'})</div>
              <div><span className="text-slate-400 block">Contract Type:</span><strong>{selectedSite.contractType || 'Turnkey'}</strong></div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-blue-50/60 border border-blue-200">
              <div>
                <span className="text-blue-700 block text-[10px] uppercase font-bold">Sanctioned Budget</span>
                <strong className="text-base font-black text-slate-900">{money(selectedSite.projectBudget || selectedSite.budget)}</strong>
              </div>
              <div>
                <span className="text-blue-700 block text-[10px] uppercase font-bold">Total Spent</span>
                <strong className="text-base font-black text-blue-800">{money(selectedSite.totalAmountSpent || selectedSite.spentAmount || 0)}</strong>
              </div>
              <div>
                <span className="text-blue-700 block text-[10px] uppercase font-bold">Remaining Float</span>
                <strong className="text-base font-black text-emerald-700">
                  {money(Math.max(0, (Number(selectedSite.projectBudget || selectedSite.budget) || 0) - (Number(selectedSite.totalAmountSpent || selectedSite.spentAmount) || 0)))}
                </strong>
              </div>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-slate-800">Physical Site Geofence & Location:</span>
              <p className="text-slate-600">{selectedSite.siteLocation || selectedSite.location || 'Location registered'}</p>
              {Number(selectedSite.latitude) !== 0 && selectedSite.latitude && (
                <p className="font-mono text-slate-500 text-[11px]">
                  GPS: {selectedSite.latitude}, {selectedSite.longitude}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Link
                to={`/manager/project-site-setup?tab=update&siteId=${selectedSite.id || selectedSite.siteId || selectedSite.projectId}`}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-50 text-[#0B3470] hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1"
              >
                <span>Edit in Project & Site Setup ↗</span>
              </Link>
              <button
                type="button"
                onClick={() => setSelectedSite(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-blue-800"
              >
                Close Details
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

