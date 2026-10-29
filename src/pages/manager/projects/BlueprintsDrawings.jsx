import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Compass,
  UploadCloud,
  FileText,
  Search,
  Eye,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  Building2,
  Layers,
  X,
  Table,
  LayoutGrid,
  ShieldAlert,
  ArrowUpRight,
  Plus,
  Edit3,
  RefreshCw,
  FolderOpen,
  Check,
} from 'lucide-react'
import {
  fetchDrawings,
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

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'

const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-700'

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B3470] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#082855] disabled:cursor-not-allowed disabled:opacity-50'

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

const dangerButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700'

function ModalShell({ title, children, onClose, closeDisabled = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-6">{children}</div>
      </div>
    </div>
  )
}

export default function BlueprintsDrawings({
  orgId,
  sites = [],
  currentUser,
  onNotify,
}) {
  // Two primary tabs:
  // 0: Upload Section
  // 1: Uploaded Files
  const [activeTab, setActiveTab] = useState(0)

  // Existing field-view workflow remains inside Uploaded Files.
  const [showFieldView, setShowFieldView] = useState(false)

  const [drawings, setDrawings] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
  const [supervisorMappings, setSupervisorMappings] = useState({})

  const [formSiteId, setFormSiteId] = useState('')
  const [formProjectName, setFormProjectName] = useState('')
  const [formSupervisorName, setFormSupervisorName] = useState('')
  const [formProjectStage, setFormProjectStage] = useState(
    'Superstructure Columns & RCC Slabs'
  )

  const [docName, setDocName] = useState('')
  const [docPurpose, setDocPurpose] = useState('Architectural Layout')
  const [attachedFile, setAttachedFile] = useState(null)
  const [attachedFileName, setAttachedFileName] = useState('')
  const [attachedFileSize, setAttachedFileSize] = useState('')
  const [attachedFileType, setAttachedFileType] = useState('pdf')
  const [stagedDocuments, setStagedDocuments] = useState([])

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL')
  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState('ALL')
  const [directoryViewMode, setDirectoryViewMode] = useState('cards')

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

  // Existing data-loading workflow.
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

  useEffect(() => {
    if (!formSiteId && sites.length > 0) {
      handleSiteSelect(sites[0].id || sites[0].siteId)
    }
  }, [sites])

  const handleSiteSelect = async (siteId) => {
    setFormSiteId(siteId)
    setStagedDocuments([])

    const cleanSiteId = formatCanonicalSiteId(siteId)
    const matchedSite = sites.find(
      (s) =>
        s.id === siteId ||
        s.siteId === siteId ||
        formatCanonicalSiteId(s.siteId || s.id) === cleanSiteId
    )

    const mapping = supervisorMappings[cleanSiteId]

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

    if (orgId && cleanSiteId) {
      try {
        const [usage, activeCount] = await Promise.all([
          SubscriptionLimitService.getSiteDrawingUsage(orgId, cleanSiteId),
          SubscriptionLimitService.getActiveDrawingsCountForSite(
            orgId,
            cleanSiteId
          ),
        ])

        setSiteUsage(usage)
        setActiveDocsCountForSite(activeCount)
      } catch (e) {
        console.warn('Could not read site quota metrics:', e)
      }
    }
  }

  const isUploadLocked = useMemo(() => {
    if (!planLimits) return false

    const totalPotential = activeDocsCountForSite + stagedDocuments.length

    if (totalPotential >= planLimits.maxActiveDocsPerSite) return true

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
  }, [
    activeDocsCountForSite,
    stagedDocuments.length,
    planLimits,
    siteUsage,
  ])

  const handleFileAttach = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

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

    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1)
    const formattedSize =
      file.size > 1024 * 1024
        ? `${sizeInMb} MB`
        : `${Math.round(file.size / 1024)} KB`

    setAttachedFile(file)
    setAttachedFileName(file.name)
    setAttachedFileSize(formattedSize)
    setAttachedFileType(ext)

    if (!docName.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())

      setDocName(cleanName)
    }
  }

  const handleAddToStaging = (e) => {
    e.preventDefault()

    if (!docName.trim()) {
      onNotify?.('Please provide a Document Name', 'error')
      return
    }

    if (!attachedFile) {
      onNotify?.(
        'Please attach a blueprint file (PDF, DWG, DXF, PNG, JPG)',
        'error'
      )
      return
    }

    const currentActive = activeDocsCountForSite + stagedDocuments.length

    if (currentActive + 1 > planLimits.maxActiveDocsPerSite) {
      setUpgradeModalInfo({
        title: 'Plan Capacity Limit Exceeded',
        message: `You cannot stage more than ${planLimits.maxActiveDocsPerSite} active blueprint(s) for Site ${formSiteId} on the ${planLimits.planName} plan. Upgrade to Platinum to upload up to 2 active drawings.`,
        plan: 'Platinum',
      })
      return
    }

    if (siteUsage.totalUploadCount > 0 && !planLimits.allowReupload) {
      setUpgradeModalInfo({
        title: 'Re-uploading Restricted',
        message:
          'Re-uploading and replacing blueprints is not permitted on the Silver/Free Trial plan. Upgrade to Gold or Platinum.',
        plan: 'Gold',
      })
      return
    }

    const newStagedItem = {
      docId: `DOC_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`,
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

    setDocName('')
    setAttachedFile(null)
    setAttachedFileName('')
    setAttachedFileSize('')

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveStagedItem = (index) => {
    setStagedDocuments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveAndUpload = async () => {
    if (!orgId) return

    if (!formSiteId) {
      onNotify?.('Please select a target construction site', 'error')
      return
    }

    if (stagedDocuments.length === 0) {
      onNotify?.(
        'Please stage at least one blueprint document before saving',
        'error'
      )
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

      setStagedDocuments([])
      await loadMasterData()
      handleSiteSelect(formSiteId)

      // Open the uploaded-files directory after a successful upload.
      setShowFieldView(false)
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
        onNotify?.(
          err.message || 'Failed to complete cloud blueprint upload',
          'error'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteSet = async () => {
    if (!deleteSetConfirm || !orgId) return

    try {
      await deleteDrawingSet({
        orgId,
        docId: deleteSetConfirm.id || deleteSetConfirm.docId,
        siteId: deleteSetConfirm.siteId,
        currentPlanName: planLimits.planName,
        totalDocuments:
          deleteSetConfirm.totalDocuments ||
          deleteSetConfirm.siteDocs?.length ||
          1,
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

      onNotify?.(
        `Blueprint "${deleteSingleConfirm.docName}" removed`,
        'info'
      )

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

  const handleOpenEditModal = (parentDocId, siteId, docItem) => {
    setEditDocModal({ parentDocId, siteId, docItem })
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
    const formattedSize =
      file.size > 1024 * 1024
        ? `${sizeInMb} MB`
        : `${Math.round(file.size / 1024)} KB`

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

  const handleLoadInEditor = (drawingSet) => {
    handleSiteSelect(drawingSet.siteId)
    setActiveTab(0)
    onNotify?.(`Loaded "${drawingSet.projectName}" into editor`, 'info')
  }

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
        formatCanonicalSiteId(set.siteId) ===
          formatCanonicalSiteId(selectedSiteFilter)

      const matchesPurpose =
        selectedPurposeFilter === 'ALL' ||
        (set.siteDocs || []).some(
          (d) => d.purpose === selectedPurposeFilter
        )

      return matchesSearch && matchesSite && matchesPurpose
    })
  }, [
    drawings,
    searchQuery,
    selectedSiteFilter,
    selectedPurposeFilter,
  ])

  return (
    <div className="space-y-6 pb-12">
      {/* Blueprint preview */}
      {activePreviewDoc && (
        <BlueprintViewerModal
          document={activePreviewDoc}
          onClose={() => setActivePreviewDoc(null)}
        />
      )}

      {/* Subscription notice */}
      {upgradeModalInfo && (
        <ModalShell
          title={upgradeModalInfo.title}
          onClose={() => setUpgradeModalInfo(null)}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              {upgradeModalInfo.message}
            </p>
          </div>

          <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Current plan</dt>
              <dd className="font-semibold text-slate-800">
                {planLimits.planName}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Active quota</dt>
              <dd className="font-semibold text-slate-800">
                {planLimits.maxActiveDocsPerSite} doc(s) / site
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Recommended tier</dt>
              <dd className="font-semibold text-blue-700">
                {upgradeModalInfo.plan || 'Platinum'}
              </dd>
            </div>
          </dl>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setUpgradeModalInfo(null)}
              className={`${secondaryButtonClass} flex-1`}
            >
              Close
            </button>
            <a
              href="/organization/subscription"
              className={`${primaryButtonClass} flex-1`}
            >
              View Plans
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </ModalShell>
      )}

      {/* Delete drawing set */}
      {deleteSetConfirm && (
        <ModalShell
          title="Delete Drawing Set"
          onClose={() => setDeleteSetConfirm(null)}
        >
          <p className="text-sm leading-relaxed text-slate-600">
            Delete the drawing set for{' '}
            <strong className="text-slate-900">
              {deleteSetConfirm.projectName}
            </strong>
            ? This will remove all{' '}
            {deleteSetConfirm.totalDocuments ||
              deleteSetConfirm.siteDocs?.length ||
              1}{' '}
            active drawings associated with site {deleteSetConfirm.siteId}.
          </p>

          {planLimits.planName === 'Gold' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Gold Plan Notice:</strong> Deleting this drawing
                set will consume your{' '}
                <strong>1 of 1 permitted deletions</strong> for this site.
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteSetConfirm(null)}
              className={`${secondaryButtonClass} flex-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteSet}
              className={`${dangerButtonClass} flex-1`}
            >
              Confirm Delete
            </button>
          </div>
        </ModalShell>
      )}

      {/* Delete individual document */}
      {deleteSingleConfirm && (
        <ModalShell
          title="Delete Blueprint"
          onClose={() => setDeleteSingleConfirm(null)}
        >
          <p className="text-sm leading-relaxed text-slate-600">
            Remove{' '}
            <strong className="text-slate-900">
              {deleteSingleConfirm.docName}
            </strong>{' '}
            from the site drawing configuration?
          </p>

          {planLimits.planName === 'Gold' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Gold Plan Notice:</strong> Deleting this document
                will consume your <strong>1 permitted deletion</strong>{' '}
                for Site {deleteSingleConfirm.siteId}.
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteSingleConfirm(null)}
              className={`${secondaryButtonClass} flex-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteIndividual}
              className={`${dangerButtonClass} flex-1`}
            >
              Delete Blueprint
            </button>
          </div>
        </ModalShell>
      )}

      {/* Update document */}
      {editDocModal && (
        <ModalShell
          title="Update Blueprint Document"
          onClose={() => setEditDocModal(null)}
          closeDisabled={editUpdating}
        >
          <p className="text-xs text-slate-500">
            Site ID: {editDocModal.siteId}
          </p>

          <form onSubmit={handleSaveEditedDoc} className="space-y-4">
            <div>
              <label htmlFor="edit-document-title" className={labelClass}>
                Document Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-document-title"
                type="text"
                value={editDocName}
                onChange={(e) => setEditDocName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Ground Floor Structural Layout"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-document-purpose" className={labelClass}>
                Discipline / Purpose
              </label>
              <select
                id="edit-document-purpose"
                value={editDocPurpose}
                onChange={(e) => setEditDocPurpose(e.target.value)}
                className={inputClass}
              >
                {DRAWING_PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">
                Current stored file
              </p>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-medium text-slate-700">
                  {editDocModal.docItem.fileName}
                </span>
                <span className="shrink-0 text-slate-500">
                  {editDocModal.docItem.fileSize || 'Standard'}
                </span>
              </div>

              {editDocModal.docItem.storagePath && (
                <p className="truncate font-mono text-[10px] text-slate-400">
                  {editDocModal.docItem.storagePath}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="replace-blueprint-file"
                className={labelClass}
              >
                Replace File{' '}
                <span className="font-normal text-slate-400">
                  (optional)
                </span>
              </label>

              <div className="flex items-center gap-2">
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.dwg,.dxf"
                  onChange={handleEditFileAttach}
                  className="sr-only"
                  id="replace-blueprint-file"
                />
                <label
                  htmlFor="replace-blueprint-file"
                  className={`${secondaryButtonClass} min-w-0 flex-1 cursor-pointer`}
                >
                  <UploadCloud className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {editReplacementFileName || 'Choose replacement file'}
                  </span>
                </label>

                {editReplacementFileName && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditReplacementFile(null)
                      setEditReplacementFileName('')
                      setEditReplacementFileSize('')
                      if (editFileInputRef.current) {
                        editFileInputRef.current.value = ''
                      }
                    }}
                    className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                    aria-label="Clear replacement file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {editReplacementFileName
                  ? `New file selected (${editReplacementFileSize}). Saving will upload to /organisation/${orgId}/drawings/${editDocModal.siteId}/.`
                  : 'Leave empty to keep the existing file without re-uploading or duplicating.'}
              </p>
            </div>

            <div className="flex gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditDocModal(null)}
                disabled={editUpdating}
                className={`${secondaryButtonClass} flex-1`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editUpdating}
                className={`${primaryButtonClass} flex-1`}
              >
                {editUpdating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {editUpdating ? 'Saving Updates...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Page header and two primary tabs */}
      <header className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Layout & Construction Drawings
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Upload site drawings and manage your existing files.
            </p>
          </div>

          <span className="inline-flex self-start rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:self-auto">
            Plan: {planLimits.planName}
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Drawing management"
          className="flex gap-2 border-t border-slate-100 px-4 sm:px-6"
        >
          {[
            { id: 0, label: 'Upload Section', Icon: UploadCloud },
            { id: 1, label: 'Uploaded Files', Icon: FolderOpen },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              id={`drawings-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`drawings-panel-${id}`}
              onClick={() => {
                setActiveTab(id)
                setShowFieldView(false)
              }}
              className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:flex-none sm:px-5 ${
                activeTab === id
                  ? 'border-[#0B3470] text-[#0B3470]'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* TAB 0: UPLOAD SECTION */}
      {activeTab === 0 && (
        <section
          id="drawings-panel-0"
          role="tabpanel"
          aria-labelledby="drawings-tab-0"
          className="space-y-5"
        >
          {/* Compact quota summary */}
          <div className="grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-4">
              <p className="text-xs font-medium text-slate-500">
                Active drawings
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeDocsCountForSite} / {planLimits.maxActiveDocsPerSite}{' '}
                allowed
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {Math.max(
                  0,
                  planLimits.maxActiveDocsPerSite - activeDocsCountForSite
                )}{' '}
                remaining capacity
              </p>
            </div>

            <div className="p-4">
              <p className="text-xs font-medium text-slate-500">
                Re-upload allowance
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {!planLimits.allowReupload
                  ? 'None (View Only)'
                  : planLimits.maxReuploadsPerSite === Infinity
                    ? 'Unlimited'
                    : `${siteUsage.reuploadCount} / ${planLimits.maxReuploadsPerSite} used`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Total uploads: {siteUsage.totalUploadCount || 0}
              </p>
            </div>

            <div className="p-4">
              <p className="text-xs font-medium text-slate-500">
                Delete allowance
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {!planLimits.allowDelete
                  ? 'Restricted'
                  : planLimits.maxDeletesPerSite === Infinity
                    ? 'Unlimited'
                    : `${siteUsage.deleteCount} / ${planLimits.maxDeletesPerSite} used`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {planLimits.allowDelete
                  ? 'Replacements enabled'
                  : 'Silver view-only'}
              </p>
            </div>
          </div>

          {isUploadLocked && (
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs leading-relaxed text-amber-900">
                  <strong>Adding more files is currently restricted.</strong>{' '}
                  The active-document or re-upload allowance for{' '}
                  {formProjectName} has been reached under your{' '}
                  {planLimits.planName} plan.
                </p>
              </div>
              <a
                href="/organization/subscription"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-900 hover:underline"
              >
                View Plans
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Site configuration */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-base font-bold text-slate-900">
                Site Details
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Select a site and confirm the project information.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor="drawing-site" className={labelClass}>
                  Construction Site <span className="text-rose-500">*</span>
                </label>
                <select
                  id="drawing-site"
                  value={formSiteId}
                  onChange={(e) => handleSiteSelect(e.target.value)}
                  className={inputClass}
                >
                  {sites.map((s) => {
                    const sId = s.id || s.siteId
                    const sName =
                      s.siteName || s.projectName || s.name || sId

                    return (
                      <option key={sId} value={sId}>
                        {sName} ({formatCanonicalSiteId(s.siteId || s.id)})
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label htmlFor="drawing-project" className={labelClass}>
                  Project Name
                </label>
                <input
                  id="drawing-project"
                  type="text"
                  value={formProjectName}
                  onChange={(e) => setFormProjectName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Prestige Tech Park"
                />
              </div>

              <div>
                <label htmlFor="drawing-supervisor" className={labelClass}>
                  Supervisor Assigned
                </label>
                <input
                  id="drawing-supervisor"
                  type="text"
                  value={formSupervisorName}
                  onChange={(e) => setFormSupervisorName(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>

              <div>
                <label htmlFor="drawing-stage" className={labelClass}>
                  Project Stage / Phase
                </label>
                <input
                  id="drawing-stage"
                  type="text"
                  value={formProjectStage}
                  onChange={(e) => setFormProjectStage(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Foundation & Framing"
                />
              </div>
            </div>
          </div>

          {/* Document entry */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-base font-bold text-slate-900">
                Add Drawing
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Enter the document details and attach a file to the upload
                queue.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <label htmlFor="drawing-title" className={labelClass}>
                  Document Title <span className="text-rose-500">*</span>
                </label>
                <input
                  id="drawing-title"
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g. Ground Floor Structural Layout"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="drawing-purpose" className={labelClass}>
                  Discipline / Purpose
                </label>
                <select
                  id="drawing-purpose"
                  value={docPurpose}
                  onChange={(e) => setDocPurpose(e.target.value)}
                  className={inputClass}
                >
                  {DRAWING_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="blueprint-file-picker"
                  className={labelClass}
                >
                  Blueprint File <span className="text-rose-500">*</span>
                </label>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.dwg,.dxf"
                    onChange={handleFileAttach}
                    className="sr-only"
                    id="blueprint-file-picker"
                  />
                  <label
                    htmlFor="blueprint-file-picker"
                    className={`${secondaryButtonClass} min-w-0 flex-1 cursor-pointer`}
                  >
                    <UploadCloud className="h-4 w-4 shrink-0 text-blue-700" />
                    <span className="truncate">
                      {attachedFileName || 'Choose File'}
                    </span>
                  </label>

                  {attachedFileName && (
                    <span className="shrink-0 text-xs text-slate-500">
                      {attachedFileSize}
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-[11px] text-slate-400">
                  PDF, CAD drawings, documents, and images.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleAddToStaging}
                disabled={isUploadLocked}
                className={primaryButtonClass}
              >
                <Plus className="h-4 w-4" />
                Add to Upload Queue
              </button>
            </div>
          </div>

          {/* Upload queue */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Upload Queue
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {stagedDocuments.length}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Review your files before saving and uploading.
                </p>
              </div>

              {stagedDocuments.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAndUpload}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {saving ? 'Uploading...' : 'Save & Upload Drawings'}
                </button>
              )}
            </div>

            {stagedDocuments.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <UploadCloud className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  No files in the upload queue
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Attach a file and select “Add to Upload Queue”.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Document</th>
                      <th className="px-4 py-3 font-semibold">Discipline</th>
                      <th className="px-4 py-3 font-semibold">File Name</th>
                      <th className="px-4 py-3 font-semibold">Size</th>
                      <th className="px-4 py-3 font-semibold">Format</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stagedDocuments.map((item, index) => (
                      <tr key={item.docId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {item.docName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {item.purpose}
                        </td>
                        <td className="max-w-48 truncate px-4 py-3 text-slate-500">
                          {item.fileName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {item.fileSize}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                            {item.fileType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveStagedItem(index)}
                            aria-label={`Remove ${item.docName} from queue`}
                            title="Remove from upload queue"
                            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 1: UPLOADED FILES */}
      {activeTab === 1 && (
        <section
          id="drawings-panel-1"
          role="tabpanel"
          aria-labelledby="drawings-tab-1"
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Uploaded Files
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Find, preview, update, and manage your site drawings.
              </p>
            </div>

            <button
              type="button"
              aria-pressed={showFieldView}
              onClick={() => setShowFieldView((previous) => !previous)}
              className={secondaryButtonClass}
            >
              {showFieldView ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {showFieldView ? 'Back to Files' : 'Field View'}
            </button>
          </div>

          {showFieldView ? (
            <ConstructionDocuments
              orgId={orgId}
              sites={sites}
              currentUser={currentUser}
              onNotify={onNotify}
              initialSiteId={formSiteId}
            />
          ) : (
            <>
              {/* Search and filters */}
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center">
                <div className="relative w-full xl:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search uploaded drawings"
                    placeholder="Search site, project, or document..."
                    className={`${inputClass} pl-10`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <select
                      value={selectedSiteFilter}
                      onChange={(e) => setSelectedSiteFilter(e.target.value)}
                      aria-label="Filter by construction site"
                      className={`${inputClass} sm:max-w-56`}
                    >
                      <option value="ALL">
                        All Project Sites ({sites.length})
                      </option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.siteName || s.projectName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                    <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                    <select
                      value={selectedPurposeFilter}
                      onChange={(e) =>
                        setSelectedPurposeFilter(e.target.value)
                      }
                      aria-label="Filter by discipline"
                      className={`${inputClass} sm:max-w-56`}
                    >
                      <option value="ALL">All Disciplines</option>
                      {DRAWING_PURPOSES.map((purpose) => (
                        <option key={purpose} value={purpose}>
                          {purpose}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex shrink-0 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setDirectoryViewMode('cards')}
                      aria-label="Cards view"
                      aria-pressed={directoryViewMode === 'cards'}
                      title="Cards view"
                      className={`rounded-md p-2 transition-colors ${
                        directoryViewMode === 'cards'
                          ? 'bg-white text-[#0B3470] shadow-sm'
                          : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectoryViewMode('table')}
                      aria-label="Table view"
                      aria-pressed={directoryViewMode === 'table'}
                      title="Table view"
                      className={`rounded-md p-2 transition-colors ${
                        directoryViewMode === 'table'
                          ? 'bg-white text-[#0B3470] shadow-sm'
                          : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <Table className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-16 text-center">
                  <RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-[#0B3470]" />
                  <p className="text-sm font-medium text-slate-600">
                    Loading uploaded files...
                  </p>
                </div>
              ) : filteredDirectorySets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
                  <Compass className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <h3 className="text-sm font-semibold text-slate-800">
                    No drawing configurations found
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
                    No site drawings match the selected filters. Switch to
                    “Upload Section” to publish blueprints.
                  </p>
                </div>
              ) : directoryViewMode === 'cards' ? (
                <div className="space-y-5">
                  {filteredDirectorySets.map((drawingSet) => {
                    const subDocs = Array.isArray(drawingSet.siteDocs)
                      ? drawingSet.siteDocs
                      : []

                    return (
                      <article
                        key={drawingSet.id || drawingSet.docId}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/60 p-5 lg:flex-row lg:items-center">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>Site: {drawingSet.siteId}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {drawingSet.date ||
                                  drawingSet.formattedDate ||
                                  'N/A'}
                              </span>
                            </div>

                            <h3 className="text-base font-bold text-slate-900">
                              {drawingSet.projectName}
                            </h3>

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>
                                Supervisor: {drawingSet.supervisorName}
                              </span>
                              <span>Phase: {drawingSet.projectPhase}</span>
                              <span>{subDocs.length} documents</span>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleLoadInEditor(drawingSet)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Load in Editor
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteSetConfirm(drawingSet)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Set
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                          {subDocs.map((item, sIdx) => {
                            const ext = (
                              item.fileType ||
                              item.fileName?.split('.').pop() ||
                              'pdf'
                            ).toLowerCase()

                            return (
                              <div
                                key={item.docId || sIdx}
                                className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300"
                              >
                                <div>
                                  <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                                      <FileText className="h-5 w-5" />
                                    </div>
                                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
                                      {ext}
                                    </span>
                                  </div>

                                  <h4 className="break-words text-sm font-semibold text-slate-900">
                                    {item.docName}
                                  </h4>
                                  <p className="mt-1 text-xs text-blue-700">
                                    {item.purpose || 'Architectural'}
                                  </p>

                                  <p
                                    title={item.fileName}
                                    className="mt-3 truncate text-xs text-slate-500"
                                  >
                                    {item.fileName}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    {item.fileSize || 'Standard'}
                                  </p>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePreviewDoc({
                                        ...item,
                                        orgId,
                                        siteId: drawingSet.siteId,
                                      })
                                    }
                                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0B3470] px-3 py-2 text-xs font-semibold text-white hover:bg-[#082855]"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    Preview
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenEditModal(
                                        drawingSet.id || drawingSet.docId,
                                        drawingSet.siteId,
                                        item
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    title="Update details or replace file"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                    Update
                                  </button>

                                  <a
                                    href={item.fileUrl || item.docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={item.fileName}
                                    title="Download blueprint"
                                    aria-label={`Download ${item.docName}`}
                                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteSingleConfirm({
                                        parentDocId:
                                          drawingSet.id || drawingSet.docId,
                                        docId: item.docId,
                                        docName: item.docName,
                                        siteId: drawingSet.siteId,
                                      })
                                    }
                                    title="Delete blueprint"
                                    aria-label={`Delete ${item.docName}`}
                                    className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Site ID</th>
                          <th className="px-4 py-3 font-semibold">
                            Project Name
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            Supervisor
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            Total Docs
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            Upload Date
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Actions
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {filteredDirectorySets.map((set) => (
                          <tr
                            key={set.id || set.docId}
                            className="hover:bg-slate-50/60"
                          >
                            <td className="px-4 py-4 font-semibold text-slate-800">
                              {set.siteId}
                            </td>
                            <td className="px-4 py-4 font-semibold text-slate-900">
                              {set.projectName}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {set.supervisorName}
                            </td>
                            <td className="px-4 py-4 font-semibold text-blue-700">
                              {set.totalDocuments ||
                                set.siteDocs?.length ||
                                0}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                              {set.date || set.formattedDate}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                {set.siteDocs?.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePreviewDoc({
                                        ...set.siteDocs[0],
                                        orgId,
                                        siteId: set.siteId,
                                      })
                                    }
                                    className="rounded-lg bg-[#0B3470] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#082855]"
                                    title="Preview first blueprint"
                                  >
                                    Preview
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleLoadInEditor(set)}
                                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDeleteSetConfirm(set)}
                                  className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
