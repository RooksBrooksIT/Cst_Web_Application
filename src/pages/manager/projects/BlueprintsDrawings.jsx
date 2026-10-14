import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  Table,
  LayoutGrid,
  ShieldAlert,
  ArrowUpRight,
  Sparkles,
  Plus,
  Edit3,
  RefreshCw,
  FolderOpen,
  Calendar,
  User,
  Check,
  FileCode,
  HardDrive,
} from 'lucide-react'
import {
  fetchDrawings,
  fetchSiteDrawings,
  saveAndUploadDrawings,
  updateDrawingDocument,
  deleteDrawingSet,
  deleteIndividualDocument,
  DRAWING_PURPOSES,
  ALLOWED_DRAWING_EXTENSIONS,
} from '../../../services/drawingService.js'
import {
  SubscriptionLimitService,
  formatCanonicalSiteId,
} from '../../../services/subscriptionLimitService.js'
import { fetchSiteSupervisorMappings } from '../../../services/supervisorService.js'
import BlueprintViewerModal from '../../../components/common/BlueprintViewerModal.jsx'
import ConstructionDocuments from '../../common/ConstructionDocuments.jsx'

/**
 * CST White Label / eBricks - Layout & Construction Drawings Management Subsystem
 * Corresponds to Flutter Mobile: lib/screens/manager/config_layout_and_drawing.dart
 * Follows LAYOUT_AND_DRAWING_WORKFLOW.txt Sections 3.1, 3.2, 4.2, 4.3, 5.1-5.4
 */

export default function BlueprintsDrawings({
  orgId,
  sites = [],
  currentUser,
  onNotify,
}) {
  // Primary Tabs: 0: 'Upload & Configure', 1: 'Drawings Directory', 2: 'Field View'
  const [activeTab, setActiveTab] = useState(0)

  // Master Drawings Data & Loading
  const [drawings, setDrawings] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Plan limits & site usage state
  const [planLimits, setPlanLimits] = useState({
    planName: 'Free Trial',
    maxActiveDocsPerSite: 1,
    allowDelete: false,
    allowReupload: false,
    maxDeletesPerSite: 0,
    maxReuploadsPerSite: 0,
  })
  const [siteUsage, setSiteUsage] = useState({
    totalUploadCount: 0,
    reuploadCount: 0,
    deleteCount: 0,
  })
  const [activeDocsCountForSite, setActiveDocsCountForSite] = useState(0)

  // Supervisor mappings for auto-fill
  const [supervisorMappings, setSupervisorMappings] = useState({})

  // Form State (Tab 0: Upload & Configure)
  const [formSiteId, setFormSiteId] = useState('')
  const [formProjectName, setFormProjectName] = useState('')
  const [formSupervisorName, setFormSupervisorName] = useState('')
  const [formProjectStage, setFormProjectStage] = useState('Superstructure Columns & RCC Slabs')

  // Document entry inputs
  const [docName, setDocName] = useState('')
  const [docPurpose, setDocPurpose] = useState('Architectural Layout')
  const [attachedFile, setAttachedFile] = useState(null)
  const [attachedFileName, setAttachedFileName] = useState('')
  const [attachedFileSize, setAttachedFileSize] = useState('')
  const [attachedFileType, setAttachedFileType] = useState('pdf')

  // Staged documents queue (in-memory)
  const [stagedDocuments, setStagedDocuments] = useState([])

  // Directory Tab State (Tab 1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState('ALL')
  const [directoryViewMode, setDirectoryViewMode] = useState('cards') // 'cards' | 'table'

  // Modals & Action States
  const [activePreviewDoc, setActivePreviewDoc] = useState(null)
  const [upgradeModalInfo, setUpgradeModalInfo] = useState(null)
  const [deleteSetConfirm, setDeleteSetConfirm] = useState(null)
  const [deleteSingleConfirm, setDeleteSingleConfirm] = useState(null)
  const [editDocModal, setEditDocModal] = useState(null)
  const [editDocName, setEditDocName] = useState('')
  const [editDocPurpose, setEditDocPurpose] = useState('Architectural Layout')
  const [editReplacementFile, setEditReplacementFile] = useState(null)
  const [editReplacementFileName, setEditReplacementFileName] = useState('')
  const [editReplacementFileSize, setEditReplacementFileSize] = useState('')
  const [editUpdating, setEditUpdating] = useState(false)

  const fileInputRef = useRef(null)
  const editFileInputRef = useRef(null)

  // 1. Initial Load: Plan Limits, Supervisor Mappings, and Drawings Ledger
  const loadMasterData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [limits, drawingList, mappings] = await Promise.all([
        SubscriptionLimitService.getActivePlanLimits(orgId),
        fetchDrawings(orgId),
        fetchSiteSupervisorMappings(orgId).catch(() => []),
      ])

      setPlanLimits(limits)
      setDrawings(drawingList || [])

      const map = {}
      ;(mappings || []).forEach((m) => {
        const key = formatCanonicalSiteId(m.siteId || m.siteID)
        map[key] = m
      })
      setSupervisorMappings(map)
    } catch (err) {
      console.error('Error loading drawings master data:', err)
      onNotify?.('Failed to load drawing catalog and plan limits', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMasterData()
  }, [orgId])

  // Set default site when sites load
  useEffect(() => {
    if (!formSiteId && sites.length > 0) {
      handleSiteSelect(sites[0].id || sites[0].siteId)
    }
  }, [sites])

  // 2. Site Selection & Auto-fill Handler
  const handleSiteSelect = async (siteId) => {
    setFormSiteId(siteId)
    setStagedDocuments([]) // Reset staging queue on site switch

    const cleanSiteId = formatCanonicalSiteId(siteId)
    const matchedSite = sites.find(
      (s) =>
        s.id === siteId ||
        s.siteId === siteId ||
        formatCanonicalSiteId(s.siteId || s.id) === cleanSiteId
    )

    const mapping = supervisorMappings[cleanSiteId]

    // Auto-fill project metadata
    const resolvedProject =
      matchedSite?.projectName ||
      matchedSite?.siteName ||
      matchedSite?.name ||
      mapping?.projectName ||
      'Construction Project'

    const resolvedSupervisor =
      mapping?.supervisorName ||
      matchedSite?.supervisorName ||
      'Site Supervisor'

    const resolvedStage =
      mapping?.projectStage ||
      matchedSite?.projectStage ||
      matchedSite?.stage ||
      'Foundation & Framing'

    setFormProjectName(resolvedProject)
    setFormSupervisorName(resolvedSupervisor)
    setFormProjectStage(resolvedStage)

    // Fetch site quota usage & active documents count
    if (orgId && cleanSiteId) {
      try {
        const [usage, activeCount] = await Promise.all([
          SubscriptionLimitService.getSiteDrawingUsage(orgId, cleanSiteId),
          SubscriptionLimitService.getActiveDrawingsCountForSite(orgId, cleanSiteId),
        ])
        setSiteUsage(usage)
        setActiveDocsCountForSite(activeCount)
      } catch (e) {
        console.warn('Could not read site quota metrics:', e)
      }
    }
  }

  // Live computation of whether upload is locked for current site
  const isUploadLocked = useMemo(() => {
    if (!planLimits) return false
    // If active docs + currently staged already reach max
    const totalPotential = activeDocsCountForSite + stagedDocuments.length
    if (totalPotential >= planLimits.maxActiveDocsPerSite) return true

    // Re-upload restriction check
    if (siteUsage.totalUploadCount > 0) {
      if (!planLimits.allowReupload) return true
      if (
        planLimits.maxReuploadsPerSite !== Infinity &&
        siteUsage.reuploadCount >= planLimits.maxReuploadsPerSite
      ) {
        return true
      }
    }

    return false
  }, [activeDocsCountForSite, stagedDocuments.length, planLimits, siteUsage])

  // 3. Staged Document File Selection
  const handleFileAttach = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Pre-check lock
    if (isUploadLocked) {
      setUpgradeModalInfo({
        title: 'Site Drawing Quota Reached',
        message: `Your current subscription plan (${planLimits.planName}) allows up to ${planLimits.maxActiveDocsPerSite} active drawing(s) per site. Upgrade to Platinum to expand drawing capacity.`,
        plan: 'Platinum',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_DRAWING_EXTENSIONS.includes(ext)) {
      onNotify?.(
        `File format .${ext} is not supported. Allowed formats: ${ALLOWED_DRAWING_EXTENSIONS.join(', ')}`,
        'error'
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Format human-readable file size
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1)
    const formattedSize = file.size > 1024 * 1024 ? `${sizeInMb} MB` : `${Math.round(file.size / 1024)} KB`

    setAttachedFile(file)
    setAttachedFileName(file.name)
    setAttachedFileSize(formattedSize)
    setAttachedFileType(ext)

    // Auto-fill document title if empty
    if (!docName.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
      setDocName(cleanName)
    }
  }

  // 4. Add to Staging List
  const handleAddToStaging = (e) => {
    e.preventDefault()

    if (!docName.trim()) {
      onNotify?.('Please provide a Document Name', 'error')
      return
    }
    if (!attachedFile) {
      onNotify?.('Please attach a blueprint file (PDF, DWG, DXF, PNG, JPG)', 'error')
      return
    }

    // Capacity validation check
    const currentActive = activeDocsCountForSite + stagedDocuments.length
    if (currentActive + 1 > planLimits.maxActiveDocsPerSite) {
      setUpgradeModalInfo({
        title: 'Plan Capacity Limit Exceeded',
        message: `You cannot stage more than ${planLimits.maxActiveDocsPerSite} active blueprint(s) for Site ${formSiteId} on the ${planLimits.planName} plan. Upgrade to Platinum to upload up to 2 active drawings.`,
        plan: 'Platinum',
      })
      return
    }

    // Re-upload restriction check
    if (siteUsage.totalUploadCount > 0 && !planLimits.allowReupload) {
      setUpgradeModalInfo({
        title: 'Re-uploading Restricted',
        message: 'Re-uploading and replacing blueprints is not permitted on the Silver/Free Trial plan. Upgrade to Gold or Platinum.',
        plan: 'Gold',
      })
      return
    }

    const newStagedItem = {
      docId: `DOC_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      docName: docName.trim(),
      purpose: docPurpose,
      fileName: attachedFileName,
      fileSize: attachedFileSize,
      fileType: attachedFileType,
      fileSizeBytes: attachedFile.size,
      file: attachedFile,
      isCloudUploaded: false,
    }

    setStagedDocuments((prev) => [...prev, newStagedItem])
    onNotify?.(`Added "${newStagedItem.docName}" to staging list`, 'success')

    // Reset entry inputs
    setDocName('')
    setAttachedFile(null)
    setAttachedFileName('')
    setAttachedFileSize('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveStagedItem = (index) => {
    setStagedDocuments((prev) => prev.filter((_, i) => i !== index))
  }

  // 5. Cloud Upload & Database Commit
  const handleSaveAndUpload = async () => {
    if (!orgId) return
    if (!formSiteId) {
      onNotify?.('Please select a target construction site', 'error')
      return
    }
    if (stagedDocuments.length === 0) {
      onNotify?.('Please stage at least one blueprint document before saving', 'error')
      return
    }

    setSaving(true)
    try {
      const result = await saveAndUploadDrawings({
        orgId,
        siteId: formSiteId,
        projectName: formProjectName,
        supervisorName: formSupervisorName,
        projectPhase: formProjectStage,
        stagedDocuments,
        currentPlanName: planLimits.planName,
        sitesList: sites,
      })

      onNotify?.(
        `Successfully uploaded ${result.totalUploaded} blueprint(s) for ${formProjectName}!`,
        'success'
      )

      // Clear staged list and reload
      setStagedDocuments([])
      await loadMasterData()
      handleSiteSelect(formSiteId)

      // Switch to Directory Tab
      setActiveTab(1)
    } catch (err) {
      console.error('Save & Upload error:', err)
      if (err.code || err.upgradePlan) {
        setUpgradeModalInfo({
          title: 'Subscription Limit Reached',
          message: err.message,
          plan: err.upgradePlan || 'Platinum',
        })
      } else {
        onNotify?.(err.message || 'Failed to complete cloud blueprint upload', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  // 6. Delete Handlers (with Governance & Gold Warning Dialog)
  const confirmDeleteSet = async () => {
    if (!deleteSetConfirm || !orgId) return
    try {
      await deleteDrawingSet({
        orgId,
        docId: deleteSetConfirm.id || deleteSetConfirm.docId,
        siteId: deleteSetConfirm.siteId,
        currentPlanName: planLimits.planName,
        totalDocuments: deleteSetConfirm.totalDocuments || deleteSetConfirm.siteDocs?.length || 1,
      })

      onNotify?.('Drawing set deleted and quota updated', 'info')
      setDeleteSetConfirm(null)
      await loadMasterData()
      if (formSiteId) handleSiteSelect(formSiteId)
    } catch (err) {
      console.error(err)
      if (err.upgradePlan) {
        setUpgradeModalInfo({
          title: 'Deletion Restricted',
          message: err.message,
          plan: err.upgradePlan,
        })
      } else {
        onNotify?.(err.message || 'Failed to delete drawing set', 'error')
      }
      setDeleteSetConfirm(null)
    }
  }

  const confirmDeleteIndividual = async () => {
    if (!deleteSingleConfirm || !orgId) return
    try {
      await deleteIndividualDocument({
        orgId,
        parentDocId: deleteSingleConfirm.parentDocId,
        docIdToDelete: deleteSingleConfirm.docId,
        siteId: deleteSingleConfirm.siteId,
        currentPlanName: planLimits.planName,
      })

      onNotify?.(`Blueprint "${deleteSingleConfirm.docName}" removed`, 'info')
      setDeleteSingleConfirm(null)
      await loadMasterData()
      if (formSiteId) handleSiteSelect(formSiteId)
    } catch (err) {
      console.error(err)
      if (err.upgradePlan) {
        setUpgradeModalInfo({
          title: 'Deletion Restricted',
          message: err.message,
          plan: err.upgradePlan,
        })
      } else {
        onNotify?.(err.message || 'Failed to delete blueprint', 'error')
      }
      setDeleteSingleConfirm(null)
    }
  }

  // Blueprint Edit / Update Handlers
  const handleOpenEditModal = (parentDocId, siteId, docItem) => {
    setEditDocModal({
      parentDocId,
      siteId,
      docItem,
    })
    setEditDocName(docItem.docName || '')
    setEditDocPurpose(docItem.purpose || 'Architectural Layout')
    setEditReplacementFile(null)
    setEditReplacementFileName('')
    setEditReplacementFileSize('')
    if (editFileInputRef.current) editFileInputRef.current.value = ''
  }

  const handleEditFileAttach = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_DRAWING_EXTENSIONS.includes(ext)) {
      onNotify?.(
        `File format .${ext} is not supported. Allowed formats: ${ALLOWED_DRAWING_EXTENSIONS.join(', ')}`,
        'error'
      )
      if (editFileInputRef.current) editFileInputRef.current.value = ''
      return
    }

    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1)
    const formattedSize = file.size > 1024 * 1024 ? `${sizeInMb} MB` : `${Math.round(file.size / 1024)} KB`

    setEditReplacementFile(file)
    setEditReplacementFileName(file.name)
    setEditReplacementFileSize(formattedSize)
  }

  const handleSaveEditedDoc = async (e) => {
    e.preventDefault()
    if (!editDocModal || !orgId) return
    if (!editDocName.trim()) {
      onNotify?.('Document Name is required', 'error')
      return
    }

    setEditUpdating(true)
    try {
      await updateDrawingDocument({
        orgId,
        parentDocId: editDocModal.parentDocId,
        docId: editDocModal.docItem.docId || editDocModal.docItem.id,
        siteId: editDocModal.siteId,
        docName: editDocName.trim(),
        purpose: editDocPurpose,
        newFile: editReplacementFile,
        currentPlanName: planLimits.planName,
        sitesList: sites,
      })

      onNotify?.(
        editReplacementFile
          ? `Blueprint updated and replacement file saved to storage for "${editDocName}"`
          : `Blueprint details updated for "${editDocName}"`,
        'success'
      )
      setEditDocModal(null)
      await loadMasterData()
      if (formSiteId) handleSiteSelect(formSiteId)
    } catch (err) {
      console.error('Error updating blueprint:', err)
      if (err.upgradePlan) {
        setUpgradeModalInfo({
          title: 'Update / Re-upload Limit Exceeded',
          message: err.message,
          plan: err.upgradePlan,
        })
      } else {
        onNotify?.(err.message || 'Failed to update blueprint', 'error')
      }
    } finally {
      setEditUpdating(false)
    }
  }

  // Load saved config back into Tab 0 (Editor)
  const handleLoadInEditor = (drawingSet) => {
    handleSiteSelect(drawingSet.siteId)
    setActiveTab(0)
    onNotify?.(`Loaded "${drawingSet.projectName}" into editor`, 'info')
  }

  // Filtered drawings for Directory Tab
  const filteredDirectorySets = useMemo(() => {
    return drawings.filter((set) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        (set.siteId || '').toLowerCase().includes(q) ||
        (set.projectName || '').toLowerCase().includes(q) ||
        (set.supervisorName || '').toLowerCase().includes(q) ||
        (set.siteDocs || []).some(
          (d) =>
            (d.docName || '').toLowerCase().includes(q) ||
            (d.purpose || '').toLowerCase().includes(q) ||
            (d.fileName || '').toLowerCase().includes(q)
        )

      const matchesSite =
        selectedSiteFilter === 'ALL' ||
        formatCanonicalSiteId(set.siteId) === formatCanonicalSiteId(selectedSiteFilter)

      const matchesPurpose =
        selectedPurposeFilter === 'ALL' ||
        (set.siteDocs || []).some((d) => d.purpose === selectedPurposeFilter)

      return matchesSearch && matchesSite && matchesPurpose
    })
  }, [drawings, searchQuery, selectedSiteFilter, selectedPurposeFilter])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Blueprint Preview Modal */}
      {activePreviewDoc && (
        <BlueprintViewerModal
          document={activePreviewDoc}
          onClose={() => setActivePreviewDoc(null)}
        />
      )}

      {/* Subscription Upgrade / Limit Reached Modal */}
      {upgradeModalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                Subscription Quota Notice
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-2">{upgradeModalInfo.title}</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {upgradeModalInfo.message}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Plan:</span>
                <strong className="text-slate-800">{planLimits.planName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Quota:</span>
                <span className="font-semibold">{planLimits.maxActiveDocsPerSite} doc(s) / site</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recommended Tier:</span>
                <strong className="text-blue-700">{upgradeModalInfo.plan || 'Platinum'}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUpgradeModalInfo(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
              <a
                href="/organization/subscription"
                className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>View Plans</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Delete Drawing Set Confirmation Dialog */}
      {deleteSetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Delete Drawing Set for {deleteSetConfirm.projectName}?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                This will remove all {deleteSetConfirm.totalDocuments || deleteSetConfirm.siteDocs?.length || 1} active
                drawings associated with site {deleteSetConfirm.siteId}.
              </p>
            </div>

            {planLimits.planName === 'Gold' && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Gold Plan Notice:</strong> Deleting this drawing set will consume your{' '}
                  <strong>1 of 1 permitted deletions</strong> for this site.
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteSetConfirm(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSet}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Individual Document Confirmation Dialog */}
      {deleteSingleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Delete Blueprint: {deleteSingleConfirm.docName}?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove this document from the site drawing configuration?
              </p>
            </div>

            {planLimits.planName === 'Gold' && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Gold Plan Notice:</strong> Deleting this individual document will consume your{' '}
                  <strong>1 permitted deletion</strong> for Site {deleteSingleConfirm.siteId}.
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteSingleConfirm(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteIndividual}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Delete Blueprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Blueprint Document Modal */}
      {editDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Update Blueprint Document</h3>
                  <span className="text-[11px] text-slate-500 font-mono">Site ID: {editDocModal.siteId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditDocModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedDoc} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Document Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  placeholder="e.g. Ground Floor Structural Layout"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Discipline / Purpose <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editDocPurpose}
                  onChange={(e) => setEditDocPurpose(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                >
                  {DRAWING_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Stored File Details */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Current Stored File in Firebase:
                </span>
                <div className="flex items-center justify-between text-slate-700 font-medium">
                  <span className="font-mono truncate max-w-xs">{editDocModal.docItem.fileName}</span>
                  <span className="text-slate-500">{editDocModal.docItem.fileSize || 'Standard'}</span>
                </div>
                {editDocModal.docItem.storagePath && (
                  <span className="font-mono text-[10px] text-slate-400 truncate block">
                    {editDocModal.docItem.storagePath}
                  </span>
                )}
              </div>

              {/* Replace File Option */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Replace File in Storage <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.dwg,.dxf"
                    onChange={handleEditFileAttach}
                    className="hidden"
                    id="replace-blueprint-file"
                  />
                  <label
                    htmlFor="replace-blueprint-file"
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all truncate"
                  >
                    <UploadCloud className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate">
                      {editReplacementFileName ? editReplacementFileName : 'Choose replacement file to upload'}
                    </span>
                  </label>
                  {editReplacementFileName && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditReplacementFile(null)
                        setEditReplacementFileName('')
                        setEditReplacementFileSize('')
                        if (editFileInputRef.current) editFileInputRef.current.value = ''
                      }}
                      className="p-2 text-rose-500 hover:text-rose-700 cursor-pointer"
                      title="Clear replacement"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {editReplacementFileName
                    ? `New file selected (${editReplacementFileSize}). Saving will upload to /organisation/${orgId}/drawings/${editDocModal.siteId}/.`
                    : 'Leave empty to preserve the existing stored file without re-uploading or duplicating.'}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditDocModal(null)}
                  disabled={editUpdating}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editUpdating}
                  className="flex-1 py-2.5 px-4 bg-[#0B3470] hover:bg-[#082855] text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {editUpdating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Updates...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Banner & Module Navigation Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/60">
              Multi-Tenant Drawing Subsystem
            </span>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              Plan: <strong className="text-slate-800 font-bold">{planLimits.planName}</strong>
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Compass className="w-7 h-7 text-[#0B3470]" />
            <span>Layout & Construction Drawings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Upload, version-control, inspect, and distribute architectural blueprints, structural rebar layouts, and MEP
            schematics directly to mobile field crews.
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab(0)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 0
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload & Configure</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(1)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 1
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Drawings Directory</span>
            <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-md text-[10px]">
              {drawings.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(2)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 2
                ? 'bg-[#0B3470] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Field View</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: UPLOAD & CONFIGURATION FLOW */}
      {/* ========================================================================= */}
      {activeTab === 0 && (
        <div className="space-y-6">
          {/* Site Quota & Subscription Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Subscription Tier */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/60 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Subscription Tier
                </span>
                <strong className="text-sm font-extrabold text-slate-900">{planLimits.planName}</strong>
                <span className="text-[11px] text-slate-500 block truncate max-w-44">
                  {planLimits.description}
                </span>
              </div>
            </div>

            {/* Card 2: Active Capacity */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200/60 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Site Active Blueprints
                </span>
                <strong className="text-sm font-extrabold text-slate-900">
                  {activeDocsCountForSite} / {planLimits.maxActiveDocsPerSite} Allowed
                </strong>
                <span className="text-[11px] text-slate-500 block">
                  {Math.max(0, planLimits.maxActiveDocsPerSite - activeDocsCountForSite)} remaining capacity
                </span>
              </div>
            </div>

            {/* Card 3: Re-upload Usage */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Re-upload Allowance
                </span>
                <strong className="text-sm font-extrabold text-slate-900">
                  {!planLimits.allowReupload
                    ? 'None (View Only)'
                    : planLimits.maxReuploadsPerSite === Infinity
                    ? 'Unlimited'
                    : `${siteUsage.reuploadCount} / ${planLimits.maxReuploadsPerSite} Used`}
                </strong>
                <span className="text-[11px] text-slate-500 block">
                  Total uploads: {siteUsage.totalUploadCount || 0}
                </span>
              </div>
            </div>

            {/* Card 4: Deletion Allowance */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Delete Allowance
                </span>
                <strong className="text-sm font-extrabold text-slate-900">
                  {!planLimits.allowDelete
                    ? 'Restricted'
                    : planLimits.maxDeletesPerSite === Infinity
                    ? 'Unlimited'
                    : `${siteUsage.deleteCount} / ${planLimits.maxDeletesPerSite} Used`}
                </strong>
                <span className="text-[11px] text-slate-500 block">
                  {planLimits.allowDelete ? 'Replacements enabled' : 'Silver view-only'}
                </span>
              </div>
            </div>
          </div>

          {/* Locked Notice Banner */}
          {isUploadLocked && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-xs text-amber-900">
                  <strong>Upload capacity locked for {formProjectName}:</strong> You have reached your limit of{' '}
                  {planLimits.maxActiveDocsPerSite} active blueprint(s) under the {planLimits.planName} tier.
                </div>
              </div>
              <a
                href="/organization/subscription"
                className="px-3.5 py-1.5 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-bold rounded-xl shrink-0 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Upgrade Plan</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Configuration Form Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">Step 1: Target Site Selection & Auto-Fill</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select the target project site. Supervisor in-charge and current project phase will automatically
                populate.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Site Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Construction Site <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formSiteId}
                  onChange={(e) => handleSiteSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
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

              {/* Project Name (Auto-filled) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  value={formProjectName}
                  onChange={(e) => setFormProjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  placeholder="e.g. Prestige Tech Park"
                />
              </div>

              {/* Supervisor Name (Auto-filled) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supervisor Assigned</label>
                <input
                  type="text"
                  value={formSupervisorName}
                  onChange={(e) => setFormSupervisorName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>

              {/* Project Phase / Stage */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Project Stage / Phase</label>
                <input
                  type="text"
                  value={formProjectStage}
                  onChange={(e) => setFormProjectStage(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  placeholder="e.g. Foundation & Framing"
                />
              </div>
            </div>

            {/* Document Staging Entry Box */}
            <div className="pt-4 border-t border-slate-100">
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900">Step 2: Attach Blueprint File & Add to Staging</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter drawing details, attach PDF, CAD (DWG/DXF), or blueprint images, then add to the upload queue.
                </p>
              </div>

              <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Document Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Document Title / Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="e.g. Ground Floor Structural Layout"
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                    />
                  </div>

                  {/* Discipline / Purpose */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Discipline / Purpose <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={docPurpose}
                      onChange={(e) => setDocPurpose(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                    >
                      {DRAWING_PURPOSES.map((purpose) => (
                        <option key={purpose} value={purpose}>
                          {purpose}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* File Attachment Control */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Attach Blueprint File <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.dwg,.dxf"
                        onChange={handleFileAttach}
                        className="hidden"
                        id="blueprint-file-picker"
                      />
                      <label
                        htmlFor="blueprint-file-picker"
                        className="flex-1 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all truncate"
                      >
                        <UploadCloud className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate">
                          {attachedFileName ? attachedFileName : 'Choose File (PDF, DWG, PNG...)'}
                        </span>
                      </label>

                      {attachedFileName && (
                        <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-200 px-2 py-2 rounded-xl shrink-0">
                          {attachedFileSize}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleAddToStaging}
                    disabled={isUploadLocked}
                    className="px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>ADD TO STAGING LIST</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Staging Queue List */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Step 3: Staged Queue ({stagedDocuments.length} document{stagedDocuments.length === 1 ? '' : 's'})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review blueprints staged in memory before committing to Firebase Storage and Firestore ledger.
                  </p>
                </div>

                {stagedDocuments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveAndUpload}
                    disabled={saving}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md flex items-center gap-2 transition-all cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>UPLOADING TO STORAGE...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>SAVE & UPLOAD DRAWINGS</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {stagedDocuments.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                  <FolderOpen className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-medium">Staging list is currently empty.</p>
                  <span className="text-[11px] text-slate-400">
                    Attach blueprint files above and tap "ADD TO STAGING LIST" to prepare your upload set.
                  </span>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Document Title</th>
                        <th className="py-3 px-4">Discipline</th>
                        <th className="py-3 px-4">File Name</th>
                        <th className="py-3 px-4">Size</th>
                        <th className="py-3 px-4">Format</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stagedDocuments.map((item, index) => (
                        <tr key={item.docId} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-800">{item.docName}</td>
                          <td className="py-3 px-4 text-slate-600">{item.purpose}</td>
                          <td className="py-3 px-4 font-mono text-slate-500 truncate max-w-48">
                            {item.fileName}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{item.fileSize}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-blue-100 text-blue-800">
                              {item.fileType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveStagedItem(index)}
                              title="Remove from staging"
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DRAWINGS DIRECTORY & MANAGEMENT FLOW */}
      {/* ========================================================================= */}
      {activeTab === 1 && (
        <div className="space-y-6">
          {/* Search and Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by site, project, document..."
                className="w-full pl-10 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Site Filter */}
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedSiteFilter}
                  onChange={(e) => setSelectedSiteFilter(e.target.value)}
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

              {/* Purpose Discipline Filter */}
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedPurposeFilter}
                  onChange={(e) => setSelectedPurposeFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Disciplines</option>
                  {DRAWING_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setDirectoryViewMode('cards')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    directoryViewMode === 'cards'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Cards View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryViewMode('table')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    directoryViewMode === 'table'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Table View"
                >
                  <Table className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Directory Content */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center">
              <RefreshCw className="w-8 h-8 text-[#0B3470] animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">Loading drawings catalog...</p>
            </div>
          ) : filteredDirectorySets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
              <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No drawing configurations found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No site drawings match the selected filters. Switch to "Upload & Configure" to publish blueprints.
              </p>
            </div>
          ) : directoryViewMode === 'cards' ? (
            /* CARDS FORMAT: Set Cards with Expanded Sub-Documents */
            <div className="space-y-6">
              {filteredDirectorySets.map((drawingSet) => {
                const subDocs = Array.isArray(drawingSet.siteDocs) ? drawingSet.siteDocs : []

                return (
                  <div
                    key={drawingSet.id || drawingSet.docId}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
                  >
                    {/* Set Card Header */}
                    <div className="p-5 bg-gradient-to-r from-slate-50 via-slate-50/80 to-white border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
                            Site ID: {drawingSet.siteId}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            Set Date: {drawingSet.date || drawingSet.formattedDate || 'N/A'}
                          </span>
                        </div>
                        <h3 className="text-base font-extrabold text-slate-900">
                          {drawingSet.projectName}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                          <span>Supervisor: {drawingSet.supervisorName}</span>
                          <span>•</span>
                          <span>Phase: {drawingSet.projectPhase}</span>
                          <span>•</span>
                          <span>
                            Total Documents:{' '}
                            <strong className="text-slate-800 font-bold">{subDocs.length}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadInEditor(drawingSet)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Load in Editor</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteSetConfirm(drawingSet)}
                          title="Delete Drawing Set"
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Set</span>
                        </button>
                      </div>
                    </div>

                    {/* Sub-Documents List */}
                    <div className="p-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {subDocs.map((item, sIdx) => {
                          const ext = (item.fileType || item.fileName?.split('.').pop() || 'pdf').toLowerCase()
                          const isCad = ['dwg', 'dxf'].includes(ext)

                          return (
                            <div
                              key={item.docId || sIdx}
                              className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-xs transition-all flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
                                    {item.purpose || 'Architectural'}
                                  </span>
                                  <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                    {ext}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-slate-900 line-clamp-2">
                                  {item.docName}
                                </h4>
                                <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                                  <div className="truncate font-mono">{item.fileName}</div>
                                  <div>Size: {item.fileSize || 'Standard'}</div>
                                </div>
                              </div>

                              {/* Document Action Buttons */}
                              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setActivePreviewDoc({ ...item, orgId, siteId: drawingSet.siteId })}
                                  className="flex-1 py-1.5 px-2 bg-[#0B3470] hover:bg-[#082855] text-white rounded-lg text-[11px] font-bold shadow-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                                  title="Preview existing stored blueprint"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Preview</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(drawingSet.id || drawingSet.docId, drawingSet.siteId, item)}
                                  className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold shadow-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                                  title="Update title, discipline, or replace stored file"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Update</span>
                                </button>
                                <a
                                  href={item.fileUrl || item.docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={item.fileName}
                                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-[11px] font-semibold flex items-center justify-center transition-all cursor-pointer"
                                  title="Download blueprint"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteSingleConfirm({
                                      parentDocId: drawingSet.id || drawingSet.docId,
                                      docId: item.docId,
                                      docName: item.docName,
                                      siteId: drawingSet.siteId,
                                    })
                                  }
                                  title="Delete individual blueprint"
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* TABLE FORMAT VIEW */
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Site ID</th>
                      <th className="py-3 px-4">Project Name</th>
                      <th className="py-3 px-4">Supervisor</th>
                      <th className="py-3 px-4">Total Docs</th>
                      <th className="py-3 px-4">Upload Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDirectorySets.map((set) => (
                      <tr key={set.id || set.docId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-bold text-slate-800">{set.siteId}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{set.projectName}</td>
                        <td className="py-3 px-4 text-slate-600">{set.supervisorName}</td>
                        <td className="py-3 px-4 font-bold text-blue-700">
                          {set.totalDocuments || set.siteDocs?.length || 0}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{set.date || set.formattedDate}</td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {set.siteDocs?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setActivePreviewDoc({ ...set.siteDocs[0], orgId, siteId: set.siteId })}
                              className="px-2.5 py-1 bg-[#0B3470] hover:bg-[#082855] text-white rounded-lg font-semibold text-[11px] cursor-pointer"
                              title="Preview first blueprint"
                            >
                              Preview
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleLoadInEditor(set)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-[11px] cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteSetConfirm(set)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold text-[11px]"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FIELD SUPERVISOR VIEWER (CONSTRUCTION DOCUMENTS) */}
      {/* ========================================================================= */}
      {activeTab === 2 && (
        <ConstructionDocuments
          orgId={orgId}
          sites={sites}
          currentUser={currentUser}
          onNotify={onNotify}
          initialSiteId={formSiteId}
        />
      )}
    </div>
  )
}
