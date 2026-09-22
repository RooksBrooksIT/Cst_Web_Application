import React, { useState, useEffect, useMemo } from 'react'
import {
  Compass,
  UploadCloud,
  FileText,
  Search,
  Filter,
  Eye,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  Building2,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  ExternalLink,
} from 'lucide-react'
import {
  fetchDrawings,
  uploadDrawingRecord,
  deleteDrawingRecord,
  DRAWING_PURPOSES,
} from '../../../services/drawingService.js'

export default function BlueprintsDrawings({ orgId, sites = [], currentUser, onNotify }) {
  const [drawings, setDrawings] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState('ALL')
  const [selectedPurpose, setSelectedPurpose] = useState('ALL')

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [activePreviewDoc, setActivePreviewDoc] = useState(null)
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState(null)

  // Upload form state
  const [formDocName, setFormDocName] = useState('')
  const [formSiteId, setFormSiteId] = useState('')
  const [formPurpose, setFormPurpose] = useState('Architectural')
  const [formRevision, setFormRevision] = useState('Rev 1.0')
  const [formFileUrl, setFormFileUrl] = useState('')
  const [formFileName, setFormFileName] = useState('')
  const [uploading, setUploading] = useState(false)

  // Zoom state for CAD preview modal
  const [zoomLevel, setZoomLevel] = useState(1)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await fetchDrawings(orgId)
      setDrawings(data || [])
    } catch (err) {
      console.error('Error fetching drawings:', err)
      onNotify?.('Failed to load blueprint repository', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  // Filtered drawings
  const filteredDrawings = useMemo(() => {
    return drawings.filter((doc) => {
      const matchesSearch =
        (doc.docName || doc.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.siteName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.revisionNumber || '').toLowerCase().includes(searchQuery.toLowerCase())

      const matchesSite = selectedSiteId === 'ALL' || doc.siteId === selectedSiteId
      const matchesPurpose = selectedPurpose === 'ALL' || doc.purpose === selectedPurpose

      return matchesSearch && matchesSite && matchesPurpose
    })
  }, [drawings, searchQuery, selectedSiteId, selectedPurpose])

  // Handle local file selection to simulate instant upload
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFormFileName(file.name)
    if (!formDocName) {
      setFormDocName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '))
    }
    // Create object URL for preview
    const objectUrl = URL.createObjectURL(file)
    setFormFileUrl(objectUrl)
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!formDocName.trim()) {
      onNotify?.('Drawing title is required', 'error')
      return
    }
    if (!formSiteId) {
      onNotify?.('Please select a target construction site', 'error')
      return
    }

    setUploading(true)
    try {
      const matchedSite = sites.find((s) => s.id === formSiteId)
      await uploadDrawingRecord(
        orgId,
        {
          docName: formDocName.trim(),
          siteId: formSiteId,
          siteName: matchedSite?.siteName || matchedSite?.projectName || 'Primary Site',
          purpose: formPurpose,
          revisionNumber: formRevision || 'Rev 1.0',
          fileName: formFileName || `${formDocName.trim().replace(/\s+/g, '_')}.pdf`,
          fileUrl: formFileUrl || 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80',
          fileSize: '4.2 MB',
          fileType: 'pdf',
        },
        currentUser
      )

      onNotify?.('Blueprint uploaded and published to field supervisors', 'success')
      setShowUploadModal(false)
      // Reset form
      setFormDocName('')
      setFormSiteId('')
      setFormPurpose('Architectural')
      setFormRevision('Rev 1.0')
      setFormFileUrl('')
      setFormFileName('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to publish blueprint', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmDoc || !orgId) return
    try {
      await deleteDrawingRecord(orgId, deleteConfirmDoc.id || deleteConfirmDoc.docId)
      onNotify?.('Drawing archived and removed', 'info')
      setDeleteConfirmDoc(null)
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete drawing', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
              CAD & Architectural Hub
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Layout and Drawings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Publish, revise, and inspect site drawings with version control and field supervisor access.
          </p>
        </div>
        <button
          onClick={() => {
            if (sites.length > 0 && !formSiteId) setFormSiteId(sites[0].id)
            setShowUploadModal(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Blueprint</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search blueprints by name, site, rev..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Site Filter */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Project Sites ({sites.length})</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName || s.projectName}
                </option>
              ))}
            </select>
          </div>

          {/* Purpose Filter */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPurpose}
              onChange={(e) => setSelectedPurpose(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Disciplines</option>
              {DRAWING_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {purpose}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Blueprint Grid */}
      {loading && drawings.length === 0 ? (
        <div className="py-24 text-center text-slate-400">Loading drawings catalog...</div>
      ) : filteredDrawings.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300">
          <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No blueprints found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Upload CAD drawings, MEP schematics, or structural foundation layouts for site supervisors to review on
            their mobile terminals.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrawings.map((doc) => {
            const isImage = doc.fileUrl && (doc.fileUrl.includes('unsplash') || doc.fileUrl.includes('image') || doc.fileUrl.startsWith('blob:'))
            return (
              <div
                key={doc.id || doc.docId}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden group"
              >
                {/* Visual Thumbnail */}
                <div
                  onClick={() => {
                    setZoomLevel(1)
                    setActivePreviewDoc(doc)
                  }}
                  className="h-44 bg-slate-900/90 relative overflow-hidden flex items-center justify-center cursor-pointer group-hover:opacity-95 transition-opacity"
                >
                  {isImage ? (
                    <img
                      src={doc.fileUrl}
                      alt={doc.docName}
                      className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <FileText className="w-12 h-12 text-indigo-400" />
                      <span className="text-xs font-mono uppercase tracking-widest text-slate-400">PDF / CAD DRAWING</span>
                    </div>
                  )}

                  {/* Discipline Badge */}
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-900/80 text-white backdrop-blur-xs border border-white/10">
                    {doc.purpose || 'Architectural'}
                  </span>

                  {/* Revision Pill */}
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-slate-950">
                    {doc.revisionNumber || 'Rev 1.0'}
                  </span>

                  <div className="absolute inset-0 bg-indigo-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="px-3 py-1.5 bg-white/90 text-slate-900 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Inspect Drawing
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                      {doc.docName || doc.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{doc.siteName || 'Unassigned Site'}</span>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>Uploaded: {doc.uploadDate || 'Recent'}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setZoomLevel(1)
                          setActivePreviewDoc(doc)
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="View Schematic"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmDoc(doc)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Archive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Blueprint Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Upload Site Blueprint / CAD</h3>
                <p className="text-xs text-slate-500">Publish architectural drawings for mobile field crews.</p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Target Construction Site *
                </label>
                <select
                  required
                  value={formSiteId}
                  onChange={(e) => setFormSiteId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select Project Site...</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.siteName || s.projectName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Drawing Title / Layout Name *
                </label>
                <input
                  type="text"
                  required
                  value={formDocName}
                  onChange={(e) => setFormDocName(e.target.value)}
                  placeholder="e.g. Ground Floor Column Reinforcement Layout"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Discipline / Purpose *
                  </label>
                  <select
                    value={formPurpose}
                    onChange={(e) => setFormPurpose(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  >
                    {DRAWING_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Revision Tag
                  </label>
                  <input
                    type="text"
                    value={formRevision}
                    onChange={(e) => setFormRevision(e.target.value)}
                    placeholder="e.g. Rev 2.1"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Upload Drop Area */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Schematic File (PDF / CAD / High-Res Image)
                </label>
                <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/20 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors">
                  <UploadCloud className="w-8 h-8 text-blue-600" />
                  <span className="text-xs font-medium text-slate-700">
                    {formFileName ? formFileName : 'Click to select blueprint file'}
                  </span>
                  <span className="text-[11px] text-slate-400">PDF, DWG, PNG, or JPG up to 25MB</span>
                  <input type="file" onChange={handleFileSelect} className="hidden" accept=".pdf,image/*" />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {uploading ? 'Publishing...' : 'Publish to Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Blueprint CAD Inspection / Preview Modal */}
      {activePreviewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-800">
            {/* Header */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Compass className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold truncate max-w-md">{activePreviewDoc.docName || activePreviewDoc.title}</h3>
                  <p className="text-[11px] text-slate-400">
                    {activePreviewDoc.siteName} • {activePreviewDoc.purpose} • {activePreviewDoc.revisionNumber}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
                  className="p-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-400 w-12 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
                  className="p-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="p-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                  title="Reset Zoom"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActivePreviewDoc(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Canvas / Image Container */}
            <div className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-6 relative">
              <div
                style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease-out' }}
                className="origin-center"
              >
                <img
                  src={
                    activePreviewDoc.fileUrl ||
                    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80'
                  }
                  alt={activePreviewDoc.docName}
                  className="max-h-[70vh] rounded-lg shadow-2xl border border-slate-800 object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Archive Blueprint?</h3>
            <p className="text-sm text-slate-500 mb-6">
              Remove <span className="font-semibold text-slate-800">"{deleteConfirmDoc.docName}"</span> from site
              supervisors' active mobile terminals?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
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
