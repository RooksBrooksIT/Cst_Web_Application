import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../../../components/common/StatusBadge'
import Modal from '../../../components/common/Modal'
import ExportButton from '../../../components/common/ExportButton'

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
  const [statusFilter, setStatusFilter] = useState('All') // 'All' | 'In Progress' | 'Planning' | 'Completed' | 'On Hold'
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
              Category: s.projectCategory,
              Budget: s.projectBudget || s.budget,
              TotalSpent: s.totalAmountSpent || s.spentAmount || 0,
              Status: s.projectStatus || s.status,
              Supervisor: s.supervisorName || 'N/A',
              Contractor: s.contractorName || 'N/A',
              Location: s.siteLocation || s.location,
            }))}
            filename="sites_portfolio.csv"
          />
          <Link
            to="/manager/project-site-setup"
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs transition-colors"
          >
            ＋ Project & Site Setup
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-none">
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

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search site, code, client, supervisor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* Sites Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSites.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
            No construction sites matching the selected filter.
          </div>
        ) : (
          filteredSites.map((site) => {
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
                  <div className="flex items-start justify-between">
                    <div>
                      <strong className="block text-base font-bold text-slate-900">{site.siteName || site.name || site.id}</strong>
                      <span className="text-xs text-slate-400 font-mono">{site.siteCode || site.code || 'SITE'} · {site.projectCategory || 'General'}</span>
                    </div>
                    <StatusBadge status={status} />
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
                    {Number(site.latitude) !== 0 && (
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
                    className="py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
                  >
                    View Details
                  </button>
                  <Link
                    to={`/manager/project-site-setup?tab=update&siteId=${site.id || site.siteId || site.projectId}`}
                    className="py-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#0B3470] text-center border border-blue-200 transition-colors"
                  >
                    Edit Site ↗
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Financial Details Modal */}
      {selectedSite && (
        <Modal
          isOpen={Boolean(selectedSite)}
          onClose={() => setSelectedSite(null)}
          title={selectedSite.siteName || selectedSite.name}
          subtitle={`Site ID: ${selectedSite.siteId || selectedSite.id} · Code: ${selectedSite.siteCode || selectedSite.code || 'N/A'}`}
        >
          <div className="p-6 space-y-4 text-xs">
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
              {Number(selectedSite.latitude) !== 0 && (
                <p className="font-mono text-slate-500 text-[11px]">
                  GPS: {selectedSite.latitude}, {selectedSite.longitude}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Link
                to={`/manager/project-site-setup?tab=update&siteId=${selectedSite.id || selectedSite.siteId || selectedSite.projectId}`}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-50 text-[#0B3470] hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                Edit in Project & Site Setup ↗
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
