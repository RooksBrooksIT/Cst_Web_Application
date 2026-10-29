import React, { useState, useEffect } from 'react'
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  Receipt,
  Maximize2,
} from 'lucide-react'
import { AppStorageService } from '../../services/appStorageService.js'

/**
 * Universal Modal for Instant Bill Image / Document Preview
 * Supports image zoom, rotation, full download, and PDF embedding
 */
export default function BillImagePreviewModal({
  isOpen,
  onClose,
  imageUrl,
  storagePath = '',
  orgId = '',
  title = 'Bill / Document Preview',
  vendor = '',
  amount = '',
  billNo = '',
  date = '',
  quantity = '',
}) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeUrl, setActiveUrl] = useState(imageUrl || '')

  useEffect(() => {
    let isMounted = true

    if (isOpen) {
      setZoom(1)
      setRotation(0)
      setLoadError(false)

      const initialUrl = imageUrl || ''
      if (initialUrl && (initialUrl.startsWith('http://') || initialUrl.startsWith('https://') || initialUrl.startsWith('blob:'))) {
        setActiveUrl(initialUrl)
        setLoading(true)
      } else if (storagePath || initialUrl) {
        // Resolve storage path to live download URL
        setLoading(true)
        const pathToResolve = storagePath || initialUrl
        AppStorageService.getExpenseBillUrl(pathToResolve, orgId)
          .then((liveUrl) => {
            if (isMounted) {
              if (liveUrl) {
                setActiveUrl(liveUrl)
              } else {
                setActiveUrl(initialUrl)
                setLoadError(true)
              }
              setLoading(false)
            }
          })
          .catch(() => {
            if (isMounted) {
              setActiveUrl(initialUrl)
              setLoadError(true)
              setLoading(false)
            }
          })
      } else {
        setActiveUrl('')
        setLoading(false)
      }
    }

    return () => {
      isMounted = false
    }
  }, [isOpen, imageUrl, storagePath, orgId])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || (!activeUrl && !imageUrl && !storagePath)) return null

  const displayUrl = activeUrl || imageUrl || ''

  const isPdf =
    String(displayUrl).toLowerCase().includes('.pdf') ||
    String(displayUrl).toLowerCase().includes('application/pdf') ||
    String(storagePath).toLowerCase().endsWith('.pdf')

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5))
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360)
  const handleReset = () => {
    setZoom(1)
    setRotation(0)
  }

  const handleImageError = () => {
    if (storagePath && activeUrl !== storagePath) {
      // Try resolving storage path fresh once if expired token
      AppStorageService.getExpenseBillUrl(storagePath, orgId).then((freshUrl) => {
        if (freshUrl && freshUrl !== activeUrl) {
          setActiveUrl(freshUrl)
        } else {
          setLoading(false)
          setLoadError(true)
        }
      }).catch(() => {
        setLoading(false)
        setLoadError(true)
      })
    } else {
      setLoading(false)
      setLoadError(true)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 border border-purple-100">
              {isPdf ? <FileText className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {title || 'Bill Document'}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                {vendor && <span className="font-medium text-slate-700">{vendor}</span>}
                {quantity !== undefined && quantity !== null && quantity !== '' && (
                  <span>• Qty: <span className="font-semibold text-slate-700">{quantity}</span></span>
                )}
                {billNo && <span>• Ref #{billNo}</span>}
                {amount && (
                  <span className="font-bold text-slate-900">
                    • ₹{Number(amount).toLocaleString('en-IN')}
                  </span>
                )}
                {date && <span>• {date}</span>}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isPdf && (
              <>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  title="Zoom In"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  title="Zoom Out"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  title="Rotate"
                  aria-label="Rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors hidden sm:inline-flex cursor-pointer"
                  title="Reset View"
                  aria-label="Reset View"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </>
            )}

            {displayUrl && (
              <>
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                  title="Open in new window"
                  aria-label="Open in new window"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                <a
                  href={displayUrl}
                  download={title || 'expense_bill'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  title="Download File"
                  aria-label="Download File"
                >
                  <Download className="w-4 h-4" />
                </a>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors ml-1 cursor-pointer"
              title="Close Preview (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer Canvas */}
        <div className="flex-1 bg-slate-900/5 relative min-h-[300px] max-h-[72vh] overflow-auto flex items-center justify-center p-4">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 z-10 text-slate-400 text-xs gap-2">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <span>Loading bill image...</span>
            </div>
          )}

          {loadError ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Unable to preview document directly</p>
              <p className="text-xs text-slate-400">
                You can still access and download the file securely.
              </p>
              {displayUrl && (
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B3470] text-white rounded-xl text-xs font-semibold hover:bg-[#082855] transition-colors mt-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Full Tab</span>
                </a>
              )}
            </div>
          ) : isPdf ? (
            <iframe
              src={displayUrl}
              title="Bill PDF Preview"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setLoadError(true)
              }}
              className="w-full h-[65vh] rounded-xl border border-slate-200 bg-white"
            />
          ) : (
            <div
              className="transition-transform duration-150 ease-out flex items-center justify-center"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={displayUrl}
                alt={title}
                decoding="async"
                onLoad={() => setLoading(false)}
                onError={handleImageError}
                className="max-h-[68vh] max-w-full object-contain rounded-lg shadow-md select-none pointer-events-auto"
              />
            </div>
          )}
        </div>

        {/* Footer info pill */}
        <div className="px-5 py-2.5 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Firebase Cloud Storage CDN Synchronized</span>
          <span>Click outside or press Esc to dismiss</span>
        </div>
      </div>
    </div>
  )
}
