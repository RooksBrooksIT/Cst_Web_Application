import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, storage } from './firebase.js'

/**
 * CST White Label / eBricks - Cloud Storage Service
 * Handles multi-tenant storage uploads and retrievals scoped to /organisation/{orgId}/...
 * Follows existing mobile application structure:
 * Example path: /organisation/cst_RBConstruction_19-09-2026/drawings/ST001_Testing/
 */

let authInFlightPromise = null

/**
 * Ensures Firebase Auth is actively authenticated under the tenant organization context
 * so that Firebase Storage security rules (request.auth != null) are satisfied.
 * Uses the tenant's registered credentials from Firestore without weakening rules.
 *
 * @param {string} [orgId] - Organization ID
 * @returns {Promise<User|null>}
 */
export async function ensureStorageAuthenticated(orgId) {
  if (auth.currentUser) {
    return auth.currentUser
  }

  if (authInFlightPromise) {
    return authInFlightPromise
  }

  authInFlightPromise = (async () => {
    try {
      let targetOrgId = orgId
      if (!targetOrgId) {
        try {
          const stored = JSON.parse(localStorage.getItem('constructa_session') || '{}')
          targetOrgId = stored.orgId
        } catch {}
      }

      if (!targetOrgId) return null

      // Fetch organization credentials to establish tenant context in Firebase Auth
      let orgData = null
      try {
        const orgDocSnap = await getDoc(doc(db, 'organisation', targetOrgId))
        if (orgDocSnap.exists()) {
          orgData = orgDocSnap.data()
        }
      } catch (e) {
        console.warn('Could not read organisation doc for storage auth:', e?.message)
      }

      if (!orgData?.email || !orgData?.password) {
        try {
          const adminDataSnap = await getDoc(doc(db, 'organisation', targetOrgId, 'admin', 'data'))
          if (adminDataSnap.exists()) {
            orgData = { ...(orgData || {}), ...adminDataSnap.data() }
          }
        } catch (e) {
          console.warn('Could not read admin/data doc for storage auth:', e?.message)
        }
      }

      const email = orgData?.email
      const password = orgData?.password

      if (email && password) {
        try {
          const creds = await signInWithEmailAndPassword(auth, email, password)
          return creds.user
        } catch (_storageAuthErr) {
          // If Firestore password doesn't match Firebase Auth password, don't crash
          return null
        }
      }
    } catch (err) {
      console.warn('ensureStorageAuthenticated note:', err?.message)
    } finally {
      authInFlightPromise = null
    }

    return auth.currentUser || null
  })()

  return authInFlightPromise
}

export function inferMimeType(fileName = '') {
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'dwg':
      return 'application/acad'
    case 'dxf':
      return 'application/dxf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return 'application/octet-stream'
  }
}

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Resolves the site directory name for storage paths while preserving exact casing.
 * Matches mobile app: e.g. "ST001_Testing", "ST001_Rooks".
 *
 * @param {string} siteId - Raw or canonical site ID
 * @param {Array} [sitesList] - Optional array of site objects to match siteDocId
 */
export function resolveSiteStorageFolder(siteId = '', sitesList = []) {
  if (!siteId) return 'DEFAULT_SITE'
  const rawId = String(siteId).trim()

  if (Array.isArray(sitesList) && sitesList.length > 0) {
    const matched = sitesList.find((s) => {
      if (!s) return false
      return (
        s.id === rawId ||
        s.siteId === rawId ||
        s.siteCode === rawId ||
        String(s.id || '').toLowerCase() === rawId.toLowerCase() ||
        String(s.siteId || '').toLowerCase() === rawId.toLowerCase()
      )
    })

    if (matched) {
      // Standard format is SiteCode_SiteName (e.g. ST001_Testing)
      if (matched.siteCode && (matched.siteName || matched.name)) {
        const name = (matched.siteName || matched.name).trim().replace(/\s+/g, '')
        return `${matched.siteCode}_${name}`
      }
      if (matched.id && (matched.id.includes('_') || matched.id.startsWith('ST'))) {
        return matched.id.trim().replace(/[/\\]/g, '_')
      }
      if (matched.siteId && (matched.siteId.includes('_') || matched.siteId.startsWith('ST'))) {
        return matched.siteId.trim().replace(/[/\\]/g, '_')
      }
      if (matched.id) return matched.id.trim().replace(/[/\\]/g, '_')
    }
  }

  // Preserve casing (e.g. ST001_Testing, ST001_Rooks), sanitize path traversal characters
  return rawId.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
}

/**
 * Cleans a file name for safe storage path usage while preserving extension
 */
export function cleanStorageFileName(fileName = '') {
  return String(fileName || '')
    .trim()
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, '_')
}

export const AppStorageService = {
  ensureStorageAuthenticated,

  /**
   * Upload or update a drawing document in Firebase Cloud Storage.
   * Path: organisation/{orgId}/drawings/{siteId}/{timestamp}_{cleanFileName}
   *
   * @param {Object} params
   * @param {string} params.orgId - Organization ID (e.g. "cst_RBConstruction_19-09-2026")
   * @param {string} params.siteId - Site ID (e.g. "ST001_Testing")
   * @param {string} params.fileName - Original file name
   * @param {File|Blob|Uint8Array} params.file - File object or binary
   * @param {Array} [params.sitesList] - Optional list of site records
   * @returns {Promise<{ downloadUrl: string, storagePath: string, fileSizeBytes: number, fileSize: string, fileType: string }>}
   */
  async uploadDrawingDoc({ orgId, siteId, fileName, file, sitesList = [] }) {
    if (!orgId) throw new Error('orgId is required for storage path')
    if (!siteId) throw new Error('siteId is required for storage path')
    if (!file) throw new Error('File binary is required for upload')

    // 1. Establish authenticated tenant context in Firebase Auth
    await ensureStorageAuthenticated(orgId)

    const cleanOrgId = String(orgId).trim().replace(/[/\\]/g, '_')
    const siteFolder = resolveSiteStorageFolder(siteId, sitesList)
    const cleanFileName = cleanStorageFileName(fileName || 'blueprint.pdf')
    const timestamp = Date.now()
    const storagePath = `organisation/${cleanOrgId}/drawings/${siteFolder}/${timestamp}_${cleanFileName}`

    const contentType = inferMimeType(cleanFileName)
    const ext = cleanFileName.split('.').pop()?.toLowerCase() || 'pdf'
    const fileSizeBytes = file.size || (file.byteLength ?? 0)

    try {
      const storageRef = ref(storage, storagePath)
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType,
        customMetadata: {
          orgId: cleanOrgId,
          siteId: siteFolder,
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
        },
      })

      const downloadUrl = await getDownloadURL(uploadResult.ref)

      return {
        downloadUrl,
        storagePath,
        fileSizeBytes,
        fileSize: formatBytes(fileSizeBytes),
        fileType: ext,
      }
    } catch (err) {
      console.error('Firebase Storage upload error:', err)
      throw err
    }
  },

  /**
   * Fetches the valid download URL from Firebase Storage for an existing stored file.
   * Strictly reads the existing stored file - does NOT upload or create a duplicate.
   * Does not assume the file is missing if getDownloadURL fails, using the stored fileUrl reference.
   *
   * @param {Object} params
   * @param {string} [params.storagePath] - Storage object path (e.g. "organisation/.../drawings/...")
   * @param {string} [params.fileUrl] - Existing download URL
   * @param {string} [params.orgId] - Organization ID
   * @param {string} [params.siteId] - Site ID
   * @param {string} [params.fileName] - Original file name
   * @returns {Promise<{ success: boolean, downloadUrl: string, storagePath: string, error?: string, isMissingFile?: boolean }>}
   */
  async getDrawingDownloadUrl({ storagePath, fileUrl, orgId, siteId, fileName }) {
    // 1. If existing fileUrl is already available from Firestore, it is the authentic
    // tokenized download URL generated upon upload. It is directly accessible.
    if (fileUrl && fileUrl.startsWith('http')) {
      return {
        success: true,
        downloadUrl: fileUrl,
        storagePath: storagePath || '',
      }
    }

    // 2. Ensure authentication before making Storage API calls
    if (orgId) {
      await ensureStorageAuthenticated(orgId).catch(() => {})
    }

    // 3. If storagePath is given, fetch fresh URL directly from Firebase Storage
    if (storagePath) {
      try {
        const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath
        const storageRef = ref(storage, cleanPath)
        const liveUrl = await getDownloadURL(storageRef)
        return {
          success: true,
          downloadUrl: liveUrl,
          storagePath: cleanPath,
        }
      } catch (err) {
        console.warn('Failed to resolve storagePath via getDownloadURL:', err?.code, err?.message)
        const isMissing = err?.code === 'storage/object-not-found'
        const isUnauth = err?.code === 'storage/unauthorized'

        // If existing fileUrl is available as fallback, never report error
        if (fileUrl && fileUrl.startsWith('http')) {
          return {
            success: true,
            downloadUrl: fileUrl,
            storagePath,
          }
        }

        return {
          success: false,
          downloadUrl: '',
          storagePath,
          error: isMissing
            ? 'The requested blueprint file was not found in Firebase Storage.'
            : isUnauth
            ? 'Permission denied while accessing file in Firebase Storage.'
            : err?.message || 'Failed to fetch stored blueprint file.',
          isMissingFile: isMissing,
        }
      }
    }

    // 4. Fallback: try constructing path if orgId, siteId, and fileName exist
    if (orgId && siteId && fileName) {
      const siteFolder = resolveSiteStorageFolder(siteId)
      const potentialPath = `organisation/${orgId}/drawings/${siteFolder}/${fileName}`
      try {
        const storageRef = ref(storage, potentialPath)
        const liveUrl = await getDownloadURL(storageRef)
        return {
          success: true,
          downloadUrl: liveUrl,
          storagePath: potentialPath,
        }
      } catch (err) {
        if (fileUrl && fileUrl.startsWith('http')) {
          return {
            success: true,
            downloadUrl: fileUrl,
            storagePath: potentialPath,
          }
        }
        return {
          success: false,
          downloadUrl: '',
          storagePath: potentialPath,
          error: 'File not found in storage at standard path.',
          isMissingFile: true,
        }
      }
    }

    return {
      success: false,
      downloadUrl: '',
      storagePath: storagePath || '',
      error: 'No storage path or URL available for this drawing.',
      isMissingFile: true,
    }
  },

  /**
   * Upload an expense bill image/document to Firebase Cloud Storage.
   *
   * Paths:
   * Manager Expenses:
   *   manager expenses/organisation/{tenantId}/manager expenses/{siteId_siteName}/{image}
   * Organization Expenses:
   *   manager expenses/organisation/{tenantId}/organization expenses/{siteId_siteName}/{image}
   *
   * @param {Object} params
   * @param {string} [params.tenantId] - Organization / Tenant ID (e.g. "cst_RBConstruction_19-09-2026")
   * @param {string} [params.orgId] - Alternate name for tenantId
   * @param {'manager expenses'|'organization expenses'} [params.expenseType='manager expenses'] - Expense category
   * @param {string} params.siteId - Target site ID (e.g. "ST001")
   * @param {string} [params.siteName] - Target site name (e.g. "name" or "Testing")
   * @param {string} params.fileName - Original file name
   * @param {File|Blob|Uint8Array} params.file - File binary
   * @param {Array} [params.sitesList] - Optional sites list
   * @returns {Promise<{ downloadUrl: string, storagePath: string, fileName: string, fileType: string, fileSizeBytes: number, fileSize: string }>}
   */
  async uploadExpenseBillDoc({
    tenantId,
    orgId,
    expenseType = 'manager expenses',
    siteId,
    siteName = '',
    fileName,
    file,
    sitesList = [],
  }) {
    const rawTenantId = tenantId || orgId
    if (!rawTenantId) throw new Error('tenantId / orgId is required for storage path')
    if (!siteId) throw new Error('siteId is required for storage path')
    if (!file) throw new Error('File binary is required for upload')

    // 1. Establish authenticated tenant context in Firebase Auth
    await ensureStorageAuthenticated(rawTenantId)

    const cleanTenantId = String(rawTenantId).trim().replace(/[/\\]/g, '_')
    const normalizedExpenseType =
      String(expenseType).toLowerCase().includes('org')
        ? 'organization expenses'
        : 'manager expenses'

    const siteFolder = formatSiteStorageFolder(siteId, siteName, sitesList)
    const cleanFileName = cleanStorageFileName(fileName || 'bill.jpg')
    const timestamp = Date.now()
    const image = `${timestamp}_${cleanFileName}`

    // Exact required folder path:
    // manager expenses/organisation/{tenantId}/{expenseType}/{siteId_siteName}/{image}
    const storagePath = `manager expenses/organisation/${cleanTenantId}/${normalizedExpenseType}/${siteFolder}/${image}`

    const contentType = inferMimeType(cleanFileName)
    const ext = cleanFileName.split('.').pop()?.toLowerCase() || 'jpg'
    const fileSizeBytes = file.size || (file.byteLength ?? 0)

    try {
      const storageRef = ref(storage, storagePath)
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType,
        customMetadata: {
          tenantId: cleanTenantId,
          expenseType: normalizedExpenseType,
          siteFolder,
          originalName: fileName || cleanFileName,
          uploadedAt: new Date().toISOString(),
        },
      })

      const downloadUrl = await getDownloadURL(uploadResult.ref)

      // In-memory cache for ultra-fast instant display
      billUrlCache.set(storagePath, downloadUrl)

      return {
        downloadUrl,
        storagePath,
        fileName: cleanFileName,
        fileType: ext,
        fileSizeBytes,
        fileSize: formatBytes(fileSizeBytes),
      }
    } catch (err) {
      console.error('Firebase Storage expense bill upload error:', err)
      throw err
    }
  },

  /**
   * Fast URL resolver for cached or live download URLs
   */
  async getExpenseBillUrl(storagePath) {
    if (!storagePath) return ''
    if (billUrlCache.has(storagePath)) {
      return billUrlCache.get(storagePath)
    }
    try {
      const storageRef = ref(storage, storagePath)
      const url = await getDownloadURL(storageRef)
      billUrlCache.set(storagePath, url)
      return url
    } catch (e) {
      console.warn('Could not resolve expense bill URL for path:', storagePath, e?.message)
      return ''
    }
  },
}

/**
 * In-memory cache for download URLs to avoid redundant calls to Firebase Storage
 */
export const billUrlCache = new Map()

/**
 * Resolves the site directory name as {siteId_siteName}
 * Matches requirement: e.g. "ST001_name" or "ST001_Testing"
 */
export function formatSiteStorageFolder(siteId = '', siteName = '', sitesList = []) {
  let cleanId = String(siteId || '').trim()
  let cleanName = String(siteName || '').trim()

  if ((!cleanName || cleanName === cleanId) && Array.isArray(sitesList) && sitesList.length > 0) {
    const matched = sitesList.find((s) => {
      if (!s) return false
      return (
        s.id === cleanId ||
        s.siteId === cleanId ||
        s.siteCode === cleanId ||
        String(s.id || '').toLowerCase() === cleanId.toLowerCase() ||
        String(s.siteId || '').toLowerCase() === cleanId.toLowerCase()
      )
    })
    if (matched) {
      cleanId = matched.siteCode || matched.siteId || matched.id || cleanId
      cleanName = matched.siteName || matched.name || matched.projectName || ''
    }
  }

  // If cleanId already has an underscore format like ST001_name, preserve it
  if (cleanId.includes('_')) {
    return cleanId.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
  }

  const sId = cleanId.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
  const sName = cleanName.replace(/[/\\]/g, '_').replace(/\s+/g, '_')

  if (sId && sName) {
    return `${sId}_${sName}`
  }
  return sId || sName || 'DEFAULT_SITE'
}

export default AppStorageService

