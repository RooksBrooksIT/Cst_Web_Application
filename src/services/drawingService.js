import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { AppStorageService } from './appStorageService.js'
import {
  SubscriptionLimitService,
  formatCanonicalSiteId,
} from './subscriptionLimitService.js'

/**
 * CST White Label / eBricks - Layout & Construction Drawings Management Subsystem
 * Follows LAYOUT_AND_DRAWING_WORKFLOW.txt specification exactly.
 * Collections:
 * - siteDrawings (Master Document Ledger)
 * - siteDrawingsUsage (Site Usage & Quota Ledger)
 * - Cloud Storage: organisation/{orgId}/drawings/{cleanSiteId}/{timestamp}_{cleanFileName}
 */

export const DRAWING_PURPOSES = [
  'Architectural Layout',
  'Structural & Rebar Detailing',
  'Plumbing & Sanitation (MEP)',
  'Electrical & Conduiting (MEP)',
  'HVAC & Ventilation Systems',
  'Elevation & External Façade',
  'Cross Section & Foundation',
  'Landscaping & Civil Works',
]

export const ALLOWED_DRAWING_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'png',
  'jpg',
  'jpeg',
  'dwg',
  'dxf',
]

/**
 * Format a Date object to "yyyyMMdd" (e.g., "20261006")
 */
export function formatDateYyyyMmDd(dateObj = new Date()) {
  const d = new Date(dateObj)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

/**
 * Format a Date object to "dd/MM/yyyy" (e.g., "06/10/2026")
 */
export function formatDateDdMmYyyy(dateObj = new Date()) {
  const d = new Date(dateObj)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/**
 * Format a Date object to "dd-MM-yyyy" (e.g., "06-10-2026")
 */
export function formatDateHyphen(dateObj = new Date()) {
  const d = new Date(dateObj)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/**
 * Standardized Deterministic Doc ID format: DRAWING_{cleanSiteId}_{yyyyMMdd}
 */
export function generateDeterministicDrawingDocId(siteId, dateObj = new Date()) {
  const cleanSiteId = formatCanonicalSiteId(siteId)
  const dateStr = formatDateYyyyMmDd(dateObj)
  return `DRAWING_${cleanSiteId}_${dateStr}`
}

/**
 * Fetch all drawing configurations for an organization.
 * Queries primary multi-tenant collection `siteDrawings` and falls back to legacy `layoutAndDrawings`.
 */
export async function fetchDrawings(orgId) {
  if (!orgId) return []

  const results = []
  const seenIds = new Set()

  try {
    // 1. Primary multi-tenant path: /organisation/{orgId}/siteDrawings
    const orgColRef = collection(db, 'organisation', orgId, 'siteDrawings')
    const orgSnap = await getDocs(orgColRef)
    orgSnap.forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id)
        results.push({ id: d.id, ...d.data() })
      }
    })

    // Fallback root path if org path is empty
    if (results.length === 0) {
      try {
        const rootSnap = await getDocs(collection(db, 'siteDrawings'))
        rootSnap.forEach((d) => {
          const data = d.data()
          if (!seenIds.has(d.id) && (!data.orgId || data.orgId === orgId)) {
            seenIds.add(d.id)
            results.push({ id: d.id, ...data })
          }
        })
      } catch (e) {}
    }

    // Also check legacy layoutAndDrawings if present and normalize
    try {
      const legacySnap = await getDocs(collection(db, 'organisation', orgId, 'layoutAndDrawings'))
      legacySnap.forEach((d) => {
        if (!seenIds.has(d.id)) {
          const data = d.data()
          seenIds.add(d.id)
          // If legacy document is a single drawing record, wrap as compatible siteDrawings schema
          if (!Array.isArray(data.siteDocs)) {
            const singleDoc = {
              docId: data.docId || d.id,
              docName: data.docName || data.title || 'Architectural Blueprint',
              purpose: data.purpose || 'Architectural',
              fileName: data.fileName || `${(data.docName || 'document').replace(/\s+/g, '_')}.pdf`,
              docUrl: data.fileUrl || data.docUrl || '',
              fileUrl: data.fileUrl || data.docUrl || '',
              storagePath: data.storagePath || '',
              fileType: data.fileType || 'pdf',
              fileSizeBytes: data.fileSizeBytes || 4194304,
              fileSize: data.fileSize || '4.0 MB',
              uploadDate: data.uploadDate || formatDateDdMmYyyy(),
              uploadedAt: data.uploadedAt || new Date().toISOString(),
              isCloudUploaded: Boolean(data.fileUrl || data.isCloudUploaded),
            }
            results.push({
              id: d.id,
              docId: d.id,
              siteId: formatCanonicalSiteId(data.siteId),
              projectName: data.siteName || data.projectName || 'Construction Site',
              supervisorName: data.supervisorName || data.uploadedBy || 'Site Supervisor',
              projectPhase: data.projectPhase || data.revisionNumber || 'Active Construction',
              date: data.uploadDate || formatDateDdMmYyyy(),
              formattedDate: formatDateHyphen(),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              createdDateIso: new Date().toISOString(),
              status: data.status || 'Active',
              totalDocuments: 1,
              siteDocs: [singleDoc],
            })
          } else {
            results.push({ id: d.id, ...data })
          }
        }
      })
    } catch (e) {}
  } catch (err) {
    console.error('Error fetching site drawings:', err)
  }

  return results
}

/**
 * Fetch drawings for a specific site using the hierarchical query engine
 * Section 3.3 Step 2 of LAYOUT_AND_DRAWING_WORKFLOW.txt
 */
export async function fetchSiteDrawings(orgId, siteIdentifier) {
  if (!orgId || !siteIdentifier) return null

  const cleanSiteId = formatCanonicalSiteId(siteIdentifier)
  const rawId = String(siteIdentifier).trim()

  const allDrawings = await fetchDrawings(orgId)

  // Step 1: Match by siteId == cleanSiteId or rawId
  let matched = allDrawings.find(
    (d) =>
      formatCanonicalSiteId(d.siteId) === cleanSiteId ||
      String(d.siteId || '').toLowerCase() === rawId.toLowerCase()
  )

  // Step 2: Direct document ID lookup
  if (!matched) {
    matched = allDrawings.find(
      (d) =>
        d.id === `DRAWING_${cleanSiteId}` ||
        d.id.startsWith(`DRAWING_${cleanSiteId}_`) ||
        d.id === `DRAWING_${rawId}` ||
        d.id === rawId
    )
  }

  // Step 3: Substring match
  if (!matched) {
    matched = allDrawings.find((d) => {
      const s = formatCanonicalSiteId(d.siteId)
      return s.includes(cleanSiteId) || cleanSiteId.includes(s)
    })
  }

  return matched || null
}

/**
 * Save and Upload Drawings Pipeline
 * Follows Section 3.1 Step 5 & Section 4.2
 *
 * @param {Object} params
 * @param {string} params.orgId
 * @param {string} params.siteId
 * @param {string} params.projectName
 * @param {string} params.supervisorName
 * @param {string} params.projectPhase
 * @param {Array} params.stagedDocuments - Array of DrawingDocItem objects
 * @param {string} [params.currentPlanName]
 * @returns {Promise<{ docId: string, totalUploaded: number, siteDocs: Array }>}
 */
export async function saveAndUploadDrawings({
  orgId,
  siteId,
  projectName = '',
  supervisorName = '',
  projectPhase = '',
  stagedDocuments = [],
  currentPlanName = '',
  sitesList = [],
}) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!siteId) throw new Error('Site selection is required')
  if (!stagedDocuments || stagedDocuments.length === 0) {
    throw new Error('At least one document must be staged for upload')
  }

  const cleanSiteId = formatCanonicalSiteId(siteId)

  // 1. Subscription Guard Pre-Validation
  const validation = await SubscriptionLimitService.canUploadDrawing({
    orgId,
    siteId: cleanSiteId,
    newDocsCount: stagedDocuments.length,
    currentPlanName,
  })

  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    throw error
  }

  // 2. Upload un-uploaded files to Firebase Cloud Storage
  const preparedDocs = []
  const now = new Date()
  const uploadDateStr = formatDateDdMmYyyy(now)
  const uploadIsoStr = now.toISOString()

  for (const item of stagedDocuments) {
    let fileUrl = item.fileUrl || item.docUrl || ''
    let storagePath = item.storagePath || ''
    let fileSizeBytes = item.fileSizeBytes || 0
    let fileSize = item.fileSize || '1.0 MB'
    let fileType = item.fileType || 'pdf'

    // If file object is attached and hasn't been uploaded to Cloud Storage yet
    if (item.file && (!item.isCloudUploaded || !fileUrl.startsWith('https://'))) {
      const storageResult = await AppStorageService.uploadDrawingDoc({
        orgId,
        siteId,
        fileName: item.fileName || `${item.docName || 'blueprint'}.pdf`,
        file: item.file,
        sitesList,
      })
      fileUrl = storageResult.downloadUrl
      storagePath = storageResult.storagePath
      fileSizeBytes = storageResult.fileSizeBytes
      fileSize = storageResult.fileSize
      fileType = storageResult.fileType
    }

    const docItem = {
      docId: item.docId || `DOC_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      docName: item.docName.trim(),
      purpose: item.purpose || 'Architectural Layout',
      fileName: item.fileName || `${item.docName.trim().replace(/\s+/g, '_')}.${fileType}`,
      docUrl: fileUrl,
      fileUrl: fileUrl,
      storagePath: storagePath,
      fileType: fileType.toLowerCase(),
      fileSizeBytes: Number(fileSizeBytes) || 0,
      fileSize: fileSize,
      uploadDate: uploadDateStr,
      uploadedAt: uploadIsoStr,
      isCloudUploaded: true,
      orgId,
      siteId: cleanSiteId,
    }

    preparedDocs.push(docItem)
  }

  // 3. Prepare Standardized Document ID: DRAWING_{cleanSiteId}_{yyyyMMdd}
  const deterministicDocId = generateDeterministicDrawingDocId(cleanSiteId, now)
  const docRef = doc(db, 'organisation', orgId, 'siteDrawings', deterministicDocId)

  // 4. Check for existing document on the same day to merge & deduplicate siteDocs
  let existingDocs = []
  try {
    const existingSnap = await getDoc(docRef)
    if (existingSnap.exists()) {
      const existingData = existingSnap.data()
      if (Array.isArray(existingData.siteDocs)) {
        existingDocs = existingData.siteDocs
      }
    } else {
      // Also check any previous active document for this site to maintain historical chain
      const q = query(
        collection(db, 'organisation', orgId, 'siteDrawings'),
        where('siteId', '==', cleanSiteId),
        where('status', '==', 'Active')
      )
      const prevSnap = await getDocs(q)
      prevSnap.forEach((d) => {
        const dData = d.data()
        if (Array.isArray(dData.siteDocs)) {
          existingDocs.push(...dData.siteDocs)
        }
      })
    }
  } catch (e) {
    console.warn('Existing drawing doc check failed, proceeding with fresh save:', e)
  }

  // Deduplicate by docId or docName + fileName
  const mergedDocsMap = new Map()
  for (const doc of existingDocs) {
    const key = doc.docId || `${doc.docName}_${doc.fileName}`
    mergedDocsMap.set(key, doc)
  }
  for (const doc of preparedDocs) {
    const key = doc.docId || `${doc.docName}_${doc.fileName}`
    mergedDocsMap.set(key, doc)
  }
  const mergedSiteDocs = Array.from(mergedDocsMap.values())

  const payload = {
    docId: deterministicDocId,
    siteId: cleanSiteId,
    projectName: projectName || 'Construction Project',
    supervisorName: supervisorName || 'Site Supervisor',
    projectPhase: projectPhase || 'Active Execution',
    date: uploadDateStr,
    formattedDate: formatDateHyphen(now),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdDateIso: uploadIsoStr,
    status: 'Active',
    totalDocuments: mergedSiteDocs.length,
    siteDocs: mergedSiteDocs,
  }

  // Commit to Firestore siteDrawings
  await setDoc(docRef, payload, { merge: true })

  // Mirror to fallback root collection if needed
  try {
    const rootRef = doc(db, 'siteDrawings', deterministicDocId)
    await setDoc(rootRef, payload, { merge: true })
  } catch (e) {}

  // 5. Increment Usage Metrics in siteDrawingsUsage
  await SubscriptionLimitService.recordDrawingUpload(orgId, cleanSiteId, preparedDocs.length)

  return {
    docId: deterministicDocId,
    totalUploaded: preparedDocs.length,
    siteDocs: mergedSiteDocs,
    payload,
  }
}

/**
 * Delete an entire drawing set
 * Section 3.2: Deleting Entire Set (_deleteDrawingSet)
 */
export async function deleteDrawingSet({
  orgId,
  docId,
  siteId,
  currentPlanName = '',
  totalDocuments = 1,
}) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!docId) throw new Error('Document ID is required')

  const cleanSiteId = formatCanonicalSiteId(siteId)

  // 1. Quota validation
  const validation = await SubscriptionLimitService.canDeleteDrawing({
    orgId,
    siteId: cleanSiteId,
    currentPlanName,
  })

  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    throw error
  }

  // 2. Delete parent Firestore document
  const docRef = doc(db, 'organisation', orgId, 'siteDrawings', docId)
  await deleteDoc(docRef)

  // Try root collection fallback
  try {
    await deleteDoc(doc(db, 'siteDrawings', docId))
  } catch (e) {}

  // 3. Record delete operation in siteDrawingsUsage
  const count = Math.max(1, Number(totalDocuments) || 1)
  await SubscriptionLimitService.recordDrawingDelete(orgId, cleanSiteId, count)

  return { success: true, count }
}

/**
 * Delete an individual blueprint from a drawing set
 * Section 3.2: Deleting Single Document (_deleteIndividualDocument)
 */
export async function deleteIndividualDocument({
  orgId,
  parentDocId,
  docIdToDelete,
  siteId,
  currentPlanName = '',
}) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!parentDocId) throw new Error('Parent document ID is required')
  if (!docIdToDelete) throw new Error('Document item ID is required')

  const cleanSiteId = formatCanonicalSiteId(siteId)

  // 1. Quota validation
  const validation = await SubscriptionLimitService.canDeleteDrawing({
    orgId,
    siteId: cleanSiteId,
    currentPlanName,
  })

  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    throw error
  }

  // 2. Fetch current parent document
  const docRef = doc(db, 'organisation', orgId, 'siteDrawings', parentDocId)
  const snap = await getDoc(docRef)
  if (!snap.exists()) {
    throw new Error('Drawing configuration record not found')
  }

  const data = snap.data()
  const siteDocs = Array.isArray(data.siteDocs) ? data.siteDocs : []
  const updatedDocs = siteDocs.filter(
    (d) => d.docId !== docIdToDelete && d.id !== docIdToDelete
  )

  // 3. If siteDocs becomes empty, delete or mark Inactive; otherwise update
  if (updatedDocs.length === 0) {
    await deleteDoc(docRef)
    try {
      await deleteDoc(doc(db, 'siteDrawings', parentDocId))
    } catch (e) {}
  } else {
    await updateDoc(docRef, {
      siteDocs: updatedDocs,
      totalDocuments: updatedDocs.length,
      updatedAt: serverTimestamp(),
    })
    try {
      await updateDoc(doc(db, 'siteDrawings', parentDocId), {
        siteDocs: updatedDocs,
        totalDocuments: updatedDocs.length,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {}
  }

  // 4. Record delete in siteDrawingsUsage
  await SubscriptionLimitService.recordDrawingDelete(orgId, cleanSiteId, 1)

  return { success: true, remainingDocs: updatedDocs.length }
}

/**
 * Update an existing blueprint document in a drawing set.
 * If a new file is attached, uploads it to /organisation/{orgId}/drawings/{siteId}/ and replaces the file reference.
 * If no file is attached, updates metadata (docName, purpose) preserving the existing stored file.
 * The existing stored file is never duplicated.
 */
export async function updateDrawingDocument({
  orgId,
  parentDocId,
  docId,
  siteId,
  docName,
  purpose,
  newFile = null,
  currentPlanName = '',
  sitesList = [],
}) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!parentDocId) throw new Error('Parent document ID is required')
  if (!docId) throw new Error('Document ID is required')

  const docRef = doc(db, 'organisation', orgId, 'siteDrawings', parentDocId)
  const snap = await getDoc(docRef)
  if (!snap.exists()) {
    throw new Error('Drawing configuration record not found')
  }

  const data = snap.data()
  const siteDocs = Array.isArray(data.siteDocs) ? [...data.siteDocs] : []
  const docIndex = siteDocs.findIndex((d) => d.docId === docId || d.id === docId)
  if (docIndex === -1) {
    throw new Error(`Blueprint ${docId} not found in drawing set`)
  }

  const targetSiteId = siteId || data.siteId
  const cleanSiteId = formatCanonicalSiteId(targetSiteId)
  const existingItem = siteDocs[docIndex]
  let updatedItem = { ...existingItem }

  if (docName?.trim()) {
    updatedItem.docName = docName.trim()
  }
  if (purpose) {
    updatedItem.purpose = purpose
  }

  // If a replacement file was attached
  if (newFile) {
    // 1. Quota check for re-upload
    const validation = await SubscriptionLimitService.canUploadDrawing({
      orgId,
      siteId: cleanSiteId,
      newDocsCount: 1,
      currentPlanName,
    })
    if (!validation.isAllowed && validation.reason?.includes('REUPLOAD')) {
      const err = new Error(validation.message)
      err.upgradePlan = validation.upgradePlan
      throw err
    }

    // 2. Upload replacement file to existing storage structure: /organisation/{orgId}/drawings/{siteId}/...
    const uploadResult = await AppStorageService.uploadDrawingDoc({
      orgId,
      siteId: targetSiteId,
      fileName: newFile.name,
      file: newFile,
      sitesList,
    })

    updatedItem = {
      ...updatedItem,
      fileName: newFile.name,
      fileUrl: uploadResult.downloadUrl,
      docUrl: uploadResult.downloadUrl,
      storagePath: uploadResult.storagePath,
      fileSizeBytes: uploadResult.fileSizeBytes,
      fileSize: uploadResult.fileSize,
      fileType: uploadResult.fileType,
      uploadedAt: new Date().toISOString(),
      uploadDate: formatDateDdMmYyyy(new Date()),
      isCloudUploaded: true,
    }

    // 3. Record upload / re-upload in siteDrawingsUsage
    await SubscriptionLimitService.recordDrawingUpload(orgId, cleanSiteId, 1)
  }

  siteDocs[docIndex] = updatedItem

  await updateDoc(docRef, {
    siteDocs,
    totalDocuments: siteDocs.length,
    updatedAt: serverTimestamp(),
  })

  try {
    await updateDoc(doc(db, 'siteDrawings', parentDocId), {
      siteDocs,
      totalDocuments: siteDocs.length,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {}

  return updatedItem
}

export const DrawingService = {
  fetchDrawings,
  fetchSiteDrawings,
  saveAndUploadDrawings,
  updateDrawingDocument,
  deleteDrawingSet,
  deleteIndividualDocument,
  formatCanonicalSiteId,
  generateDeterministicDrawingDocId,
  DRAWING_PURPOSES,
  ALLOWED_DRAWING_EXTENSIONS,
}

export default DrawingService
