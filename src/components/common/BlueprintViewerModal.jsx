import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Download,
  ExternalLink,
  FileText,
  Compass,
  AlertCircle,
  FileCode,
  Layers,
  Calendar,
  HardDrive,
  RefreshCw,
  CloudOff,
  ShieldCheck,
} from 'lucide-react'
import { AppStorageService } from '../../services/appStorageService.js'

/**
 * CST White Label / eBricks - Interactive Blueprint & Document Viewer Modal
 * Supports:
 * 1. High-Resolution Blueprint Images (PNG, JPG, JPEG, WEBP) with Pan (drag) & Pinch/Wheel Zoom (0.5x - 5.0x)
 * 2. PDF Documents with Google Docs Viewer embed & native preview
 * 3. CAD & Vector Files (DWG, DXF, DOC, DOCX) with specialized viewer card and external handoff
 *
 * Strict Preview Requirement:
 * - Fetches the existing stored file from Firebase Storage.
 * - Does NOT create or upload any duplicate files during preview.
 * - Gracefully handles loading, missing-file (object-not-found), and fetch errors.
 */

export default function BlueprintViewerModal({ document: doc, onClose }) {
  if (!doc) return null

  const fileType = (doc.fileType || doc.fileName?.split('.').pop() || 'pdf').toLowerCase()
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(fileType)
  const isPdf = fileType === 'pdf'
  const isCad = ['dwg', 'dxf'].includes(fileType)

  const fileName = doc.fileName || doc.docName || 'blueprint'
  const docTitle = doc.docName || doc.title || 'Construction Blueprint'
  const purpose = doc.purpose || 'Architectural Layout'
  const fileSize = doc.fileSize || 'Standard Size'
  const storagePath = doc.storagePath || ''

  const existingStoredUrl =
    doc.fileUrl && String(doc.fileUrl).startsWith('http')
      ? doc.fileUrl
      : doc.docUrl && String(doc.docUrl).startsWith('http')
      ? doc.docUrl
      : ''

  // Storage fetch state: initialize directly with existing stored URL if present
  const [liveFileUrl, setLiveFileUrl] = useState(existingStoredUrl)
  const [loadingFile, setLoadingFile] = useState(!existingStoredUrl)
  const [fetchError, setFetchError] = useState(null)
  const [isMissingFile, setIsMissingFile] = useState(false)

  // Image zoom and pan state
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // PDF Viewer mode: 'gview' or 'native'
  const [pdfViewerMode, setPdfViewerMode] = useState('gview')

  const containerRef = useRef(null)

  // Fetch or refresh the existing stored file from Firebase Storage
  const fetchStoredFile = useCallback(() => {
    let cancelled = false
    const fallbackUrl = existingStoredUrl || (doc.fileUrl && String(doc.fileUrl).startsWith('http') ? doc.fileUrl : '') || (doc.docUrl && String(doc.docUrl).startsWith('http') ? doc.docUrl : '')

    if (!fallbackUrl) {
      setLoadingFile(true)
    }
    setFetchError(null)
    setIsMissingFile(false)

    AppStorageService.getDrawingDownloadUrl({
      storagePath: doc.storagePath,
      fileUrl: doc.fileUrl || doc.docUrl,
      orgId: doc.orgId,
      siteId: doc.siteId,
      fileName: doc.fileName,
    })
      .then((res) => {
        if (cancelled) return
        if (res.success && res.downloadUrl) {
          setLiveFileUrl(res.downloadUrl)
          setLoadingFile(false)
          setFetchError(null)
          setIsMissingFile(false)
        } else if (fallbackUrl) {
          // Stored reference URL is present and valid
          setLiveFileUrl(fallbackUrl)
          setLoadingFile(false)
          setFetchError(null)
          setIsMissingFile(false)
        } else {
          setFetchError(res.error || 'Blueprint file could not be retrieved from Firebase Storage.')
          setIsMissingFile(Boolean(res.isMissingFile))
          setLoadingFile(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Storage preview fetch notice:', err)
        if (fallbackUrl) {
          setLiveFileUrl(fallbackUrl)
          setLoadingFile(false)
          setFetchError(null)
          setIsMissingFile(false)
        } else {
          setFetchError(err.message || 'Failed to fetch stored blueprint file.')
          setIsMissingFile(err.code === 'storage/object-not-found')
          setLoadingFile(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [doc, existingStoredUrl])

  useEffect(() => {
    const cleanup = fetchStoredFile()
    return () => {
      if (cleanup) cleanup()
    }
  }, [fetchStoredFile])

  // Reset transform
  const handleResetZoom = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
  }, [])

  const handleZoomIn = () => {
    setScale((prev) => Math.min(5.0, prev + 0.3))
  }

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.3))
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  // Mouse wheel zoom for images
  const handleWheel = (e) => {
    if (!isImage) return
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 0.2 : -0.2
    setScale((prev) => {
      const next = prev + zoomFactor
      return Math.min(5.0, Math.max(0.5, next))
    })
  }

  // Drag-to-pan handlers
  const handleMouseDown = (e) => {
    if (!isImage) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !isImage) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (isImage) {
        if (e.key === '+' || e.key === '=') handleZoomIn()
        if (e.key === '-') handleZoomOut()
        if (e.key === '0') handleResetZoom()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isImage, handleResetZoom])

  // Direct download trigger (using live fetched URL)
  const handleDownload = () => {
    const targetUrl = liveFileUrl || doc.fileUrl || doc.docUrl
    if (!targetUrl) return
    const link = document.createElement('a')
    link.href = targetUrl
    link.download = fileName
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenExternal = () => {
    const targetUrl = liveFileUrl || doc.fileUrl || doc.docUrl
    if (!targetUrl) return
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  // Google Docs Viewer embed URL for PDFs
  const googleDocsViewerUrl = liveFileUrl
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(liveFileUrl)}`
    : ''

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md animate-fade-in select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 border-b border-slate-800 text-white shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B3470] flex items-center justify-center text-blue-200 border border-blue-500/30 shadow-xs">
            {isCad ? (
              <FileCode className="w-5 h-5" />
            ) : isPdf ? (
              <FileText className="w-5 h-5" />
            ) : (
              <Compass className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 max-w-md truncate">{docTitle}</h2>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/80">
                {fileType.toUpperCase()}
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/50 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Existing Stored File</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
              <span>{purpose}</span>
              <span>•</span>
              <span>{fileSize}</span>
              {doc.uploadDate && (
                <>
                  <span>•</span>
                  <span>Uploaded: {doc.uploadDate}</span>
                </>
              )}
              {storagePath && (
                <>
                  <span>•</span>
                  <span className="font-mono text-[10px] text-slate-500 truncate max-w-xs" title={storagePath}>
                    {storagePath}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {isImage && !loadingFile && liveFileUrl && (
            <div className="flex items-center bg-slate-800/90 rounded-xl p-1 border border-slate-700/80 mr-2">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                title="Zoom Out (-)"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono font-bold text-slate-200 min-w-14 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 5.0}
                title="Zoom In (+)"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom (0)"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-all ml-1 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                title="Rotate 90°"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {isPdf && !loadingFile && liveFileUrl && (
            <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 mr-2 text-xs">
              <button
                type="button"
                onClick={() => setPdfViewerMode('gview')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  pdfViewerMode === 'gview'
                    ? 'bg-[#0B3470] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Docs View
              </button>
              <button
                type="button"
                onClick={() => setPdfViewerMode('native')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  pdfViewerMode === 'native'
                    ? 'bg-[#0B3470] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Native View
              </button>
            </div>
          )}

          {liveFileUrl && (
            <>
              <button
                type="button"
                onClick={handleOpenExternal}
                title="Open in new window"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open Link</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                title="Download blueprint file"
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close viewer (Esc)"
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all ml-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport Content */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-4"
      >
        {/* 1. LOADING STATE */}
        {loadingFile && (
          <div className="flex flex-col items-center justify-center text-slate-300 gap-3 animate-pulse">
            <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold">Retrieving blueprint from Firebase Storage...</span>
            <span className="text-xs text-slate-500">Checking existing stored file reference</span>
          </div>
        )}

        {/* 2. MISSING FILE OR FETCH ERROR STATE */}
        {!loadingFile && (!liveFileUrl || (fetchError && !liveFileUrl)) && (
          <div className="text-center p-8 bg-slate-900 rounded-3xl border border-slate-800 max-w-lg shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
              <CloudOff className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400 bg-rose-950 px-2.5 py-0.5 rounded-full border border-rose-800/80">
                {isMissingFile ? 'Storage Object Missing' : 'Storage Fetch Error'}
              </span>
              <h3 className="text-base font-bold text-slate-100 mt-2">
                {isMissingFile
                  ? 'Blueprint File Not Found in Firebase Storage'
                  : 'Unable to Load Blueprint from Storage'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                {fetchError ||
                  'The requested blueprint file is not available in Firebase Storage. It may have been moved or the path has changed.'}
              </p>
            </div>

            {storagePath && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left text-xs space-y-1">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Storage Path Reference:</span>
                <span className="font-mono text-slate-300 break-all text-[11px] block">{storagePath}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={fetchStoredFile}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Fetch</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        )}

        {/* 3. HIGH-RESOLUTION BLUEPRINT IMAGE VIEWER */}
        {!loadingFile && liveFileUrl && isImage && (
          <div
            className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleMouseDown}
          >
            {!imgLoaded && !imgError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium">Rendering high-resolution blueprint...</span>
              </div>
            )}

            {imgError ? (
              <div className="text-center p-8 bg-slate-900 rounded-2xl border border-slate-800 max-w-md">
                <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-200">Image Rendering Error</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  The image file could not be displayed directly. You can download the file or open it externally.
                </p>
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-all"
                >
                  Open External Link
                </button>
              </div>
            ) : (
              <img
                src={liveFileUrl}
                alt={docTitle}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
                draggable={false}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                  maxWidth: '90%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                }}
                className="rounded-lg shadow-2xl pointer-events-auto"
              />
            )}
          </div>
        )}

        {/* 4. PDF VIEWER */}
        {!loadingFile && liveFileUrl && isPdf && (
          <div className="w-full h-full max-w-6xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 flex flex-col">
            {pdfViewerMode === 'gview' ? (
              <iframe
                title={docTitle}
                src={googleDocsViewerUrl}
                className="w-full h-full border-0 bg-white"
                allowFullScreen
              />
            ) : (
              <iframe
                title={docTitle}
                src={liveFileUrl}
                className="w-full h-full border-0 bg-white"
              />
            )}
          </div>
        )}

        {/* 5. CAD (DWG / DXF) & VECTOR FILE HANDLER */}
        {!loadingFile && liveFileUrl && isCad && (
          <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl max-w-lg w-full text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-[#0B3470]/40 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400 shadow-inner">
              <FileCode className="w-10 h-10" />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-400 bg-blue-950/80 px-3 py-1 rounded-full border border-blue-800/80">
                AutoCAD {fileType.toUpperCase()} Vector Blueprint
              </span>
              <h3 className="text-lg font-extrabold text-white mt-3 tracking-tight">{docTitle}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                CAD drawings contain multi-layer vector geometry, BIM coordinate tags, and CAD blocks.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-left text-xs space-y-2">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">File Name:</span>
                <span className="font-mono truncate max-w-56">{fileName}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Discipline:</span>
                <span>{purpose}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">File Size:</span>
                <span>{fileSize}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-950/40 rounded-xl border border-blue-900/50 text-[11px] text-blue-300 text-left flex items-start gap-2.5">
              <Compass className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                To inspect precision layers, open this blueprint using AutoCAD Mobile, DWG FastView, or desktop CAD software.
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleOpenExternal}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in App</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 py-3 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download CAD</span>
              </button>
            </div>
          </div>
        )}

        {/* 6. OTHER GENERIC FORMATS (DOC, DOCX, ETC.) */}
        {!loadingFile && liveFileUrl && !isImage && !isPdf && !isCad && (
          <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl max-w-md w-full text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-950 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{docTitle}</h3>
              <p className="text-xs text-slate-400 mt-1">{fileName}</p>
            </div>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              This document format ({fileType.toUpperCase()}) is ready for download or external viewing.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleOpenExternal}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open External</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info / Shortcut Hint */}
      {!loadingFile && liveFileUrl && isImage && (
        <div className="px-6 py-2 bg-slate-950 text-slate-400 text-[11px] flex items-center justify-between border-t border-slate-900 shrink-0">
          <div className="flex items-center gap-4">
            <span>Scroll wheel or (+/-) to Zoom</span>
            <span>•</span>
            <span>Click & Drag to Pan</span>
            <span>•</span>
            <span>Press (0) to Reset</span>
          </div>
          <span className="text-slate-500 font-mono truncate max-w-md">{fileName}</span>
        </div>
      )}
    </div>
  )
}
