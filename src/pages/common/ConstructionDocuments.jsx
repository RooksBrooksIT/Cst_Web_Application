import React, { useState, useEffect, useMemo } from 'react'
import {
  Compass,
  Building2,
  User,
  Calendar,
  Layers,
  Search,
  Eye,
  Download,
  FileText,
  FileCode,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
} from 'lucide-react'
import { fetchSiteDrawings, fetchDrawings } from '../../services/drawingService.js'
import { fetchSiteSupervisorMappings } from '../../services/supervisorService.js'
import { formatCanonicalSiteId } from '../../services/subscriptionLimitService.js'
import BlueprintViewerModal from '../../components/common/BlueprintViewerModal.jsx'

/**
 * CST White Label / eBricks - Field Document Viewer (Construction Documents)
 * Corresponds to Flutter Mobile: lib/screens/common/construction_documents.dart
 * Follows Section 3.3 & Section 6.2 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 *
 * Designed for Site Supervisors, Site Engineers, and Field Inspectors.
 * Read-only field access with high-res document viewer and file downloads.
 */

export default function ConstructionDocuments({
  orgId,
  sites = [],
  currentUser,
  onNotify,
  initialSiteId = '',
}) {
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId || '')
  const [activeDrawingSet, setActiveDrawingSet] = useState(null)
  const [supervisorMap, setSupervisorMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activePreviewDoc, setActivePreviewDoc] = useState(null)

  // Initialize selected site
  useEffect(() => {
    if (!selectedSiteId && sites.length > 0) {
      setSelectedSiteId(sites[0].id || sites[0].siteId)
    }
  }, [sites, selectedSiteId])

  // Fetch supervisor mappings for fallback metadata
  useEffect(() => {
    if (!orgId) return
    fetchSiteSupervisorMappings(orgId)
      .then((mappings) => {
        const map = {}
        ;(mappings || []).forEach((m) => {
          const key = formatCanonicalSiteId(m.siteId || m.siteID)
          map[key] = m
        })
        setSupervisorMap(map)
      })
      .catch((err) => console.warn('Could not load supervisor mappings:', err))
  }, [orgId])

  // Load site drawing configuration using hierarchical lookup
  const loadSiteDrawings = async (siteId) => {
    if (!orgId || !siteId) return
    setLoading(true)
    try {
      const result = await fetchSiteDrawings(orgId, siteId)
      setActiveDrawingSet(result)
    } catch (err) {
      console.error('Error fetching site construction documents:', err)
      onNotify?.('Failed to fetch construction blueprints for this site', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedSiteId) {
      loadSiteDrawings(selectedSiteId)
    }
  }, [orgId, selectedSiteId])

  // Find site details
  const currentSiteObj = useMemo(() => {
    return sites.find(
      (s) =>
        s.id === selectedSiteId ||
        s.siteId === selectedSiteId ||
        formatCanonicalSiteId(s.siteId || s.id) === formatCanonicalSiteId(selectedSiteId)
    )
  }, [sites, selectedSiteId])

  // Resolve metadata: active drawing set or fallback to supervisor mapping / site object
  const cleanId = formatCanonicalSiteId(selectedSiteId)
  const mappingFallback = supervisorMap[cleanId]

  const projectName =
    activeDrawingSet?.projectName ||
    currentSiteObj?.projectName ||
    currentSiteObj?.siteName ||
    mappingFallback?.projectName ||
    'Project Site'

  const supervisorName =
    activeDrawingSet?.supervisorName ||
    mappingFallback?.supervisorName ||
    currentSiteObj?.supervisorName ||
    'Assigned Supervisor'

  const projectPhase =
    activeDrawingSet?.projectPhase ||
    mappingFallback?.projectStage ||
    currentSiteObj?.projectPhase ||
    'Superstructure & Finishes'

  const lastUpdatedDate =
    activeDrawingSet?.date ||
    activeDrawingSet?.formattedDate ||
    'Current Active Revision'

  // Filtered sub-documents
  const filteredDocs = useMemo(() => {
    const docs = Array.isArray(activeDrawingSet?.siteDocs) ? activeDrawingSet.siteDocs : []
    if (!searchQuery.trim()) return docs
    const q = searchQuery.toLowerCase().trim()
    return docs.filter(
      (d) =>
        (d.docName || '').toLowerCase().includes(q) ||
        (d.purpose || '').toLowerCase().includes(q) ||
        (d.fileName || '').toLowerCase().includes(q) ||
        (d.fileType || '').toLowerCase().includes(q)
    )
  }, [activeDrawingSet, searchQuery])

  // Download handler
  const handleDownload = (docItem) => {
    const url = docItem.fileUrl || docItem.docUrl
    if (!url) {
      onNotify?.('Download link unavailable for this blueprint', 'error')
      return
    }
    const link = document.createElement('a')
    link.href = url
    link.download = docItem.fileName || `${docItem.docName}.pdf`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    onNotify?.(`Downloading ${docItem.docName}...`, 'info')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Blueprint Viewer Modal */}
      {activePreviewDoc && (
        <BlueprintViewerModal
          document={activePreviewDoc}
          onClose={() => setActivePreviewDoc(null)}
        />
      )}

      {/* Screen Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/60">
              Field Document Viewer
            </span>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              Read-Only Blueprint Terminal
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Compass className="w-7 h-7 text-[#0B3470]" />
            <span>Construction Documents & Blueprints</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Real-time access to approved architectural plans, structural MEP drawings, and CAD schematics for field personnel.
          </p>
        </div>

        {/* Site Selector Dropdown */}
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 shrink-0">
          <Building2 className="w-5 h-5 text-slate-400 ml-1" />
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Active Construction Site
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-4"
            >
              {sites.map((s) => {
                const sId = s.id || s.siteId
                const sName = s.siteName || s.projectName || s.name || sId
                return (
                  <option key={sId} value={sId}>
                    {sName} ({formatCanonicalSiteId(s.siteId || s.id)})
                  </option>
                )
              })}
            </select>
          </div>
          <button
            type="button"
            onClick={() => loadSiteDrawings(selectedSiteId)}
            title="Refresh blueprints"
            className="p-2 text-slate-500 hover:text-blue-700 hover:bg-white rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Selected Site Meta Card */}
      <div className="bg-gradient-to-r from-[#0B3470] to-[#1E4D8C] text-white p-6 rounded-2xl shadow-md border border-blue-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-200">
              Site ID: {cleanId}
            </span>
            <h2 className="text-xl font-black mt-0.5">{projectName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white/10 rounded-xl text-xs font-semibold backdrop-blur-xs flex items-center gap-1.5 border border-white/15">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span>Verified Drawing Ledger</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-blue-200" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-200 block">Supervisor In-Charge</span>
              <span className="font-semibold">{supervisorName}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-blue-200" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-200 block">Project Phase</span>
              <span className="font-semibold">{projectPhase}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-blue-200" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-200 block">Drawing Set Date</span>
              <span className="font-semibold">{lastUpdatedDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Counter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search blueprints by name, discipline, or format..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FolderOpen className="w-4 h-4 text-slate-400" />
          <span>
            Active Blueprints:{' '}
            <strong className="text-slate-900 font-bold">{filteredDocs.length}</strong>
          </span>
        </div>
      </div>

      {/* Blueprint Documents List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-xs">
          <div className="w-10 h-10 border-3 border-[#0B3470] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Loading site drawings ledger...</p>
          <span className="text-xs text-slate-400 mt-1 block">Retrieving authenticated cloud assets</span>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center shadow-xs">
          <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            No construction drawings uploaded for this site yet
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Once project managers upload architectural layouts, structural designs, or MEP schematics in the manager
            portal, they will automatically appear here for field reference.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((docItem, idx) => {
            const ext = (docItem.fileType || docItem.fileName?.split('.').pop() || 'pdf').toLowerCase()
            const isCad = ['dwg', 'dxf'].includes(ext)
            const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext)

            return (
              <div
                key={docItem.docId || idx}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200/60">
                      {docItem.purpose || 'Architectural'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                        isCad
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : isImage
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {ext}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-blue-700 transition-colors">
                    {docItem.docName}
                  </h3>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
                    <div className="flex justify-between">
                      <span className="text-slate-400">File Name:</span>
                      <span className="font-mono text-slate-700 truncate max-w-44">
                        {docItem.fileName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">File Size:</span>
                      <span className="text-slate-700 font-semibold">{docItem.fileSize || 'Standard'}</span>
                    </div>
                    {docItem.uploadDate && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Uploaded:</span>
                        <span className="text-slate-700">{docItem.uploadDate}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePreviewDoc({ ...docItem, orgId, siteId: selectedSiteId })}
                    className="flex-1 py-2 px-3 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(docItem)}
                    title="Download file"
                    className="py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-xs flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
