import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase.js'

/**
 * CST Multi-Tenant Schema Resolver Service
 *
 * Implements authoritative detection of New Organizations (schemaVersion: 2, dataMode: 'canonical')
 * versus Existing Organizations (schemaVersion: 1, legacy, or unversioned).
 *
 * Guarantees 100% backward compatibility for all existing live production organizations:
 * - If schemaVersion is missing, undefined, or 1 -> Existing Organization (Legacy mode)
 * - Only explicit schemaVersion >= 2 or dataMode === 'canonical' -> New Organization (Single-collection mode)
 *
 * Employs an in-memory cache and localStorage session integration to guarantee 0 ms latency
 * and zero additional Firestore reads during normal operations.
 */

// In-memory cache: orgId -> { schemaVersion: number, dataMode: string }
const orgSchemaCache = new Map()

const SESSION_KEY = 'constructa_session'

/**
 * Reads the schema configuration from the current active session in localStorage if present.
 *
 * @param {string} orgId
 * @returns {{ schemaVersion: number, dataMode: string } | null}
 */
function getSchemaFromSession(orgId) {
  if (typeof localStorage === 'undefined' || !localStorage?.getItem) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (session && String(session.orgId) === String(orgId)) {
      if (session.schemaVersion !== undefined || session.dataMode !== undefined) {
        const v = Number(session.schemaVersion) || 1
        const mode = session.dataMode || (v >= 2 ? 'canonical' : 'legacy')
        return { schemaVersion: v, dataMode: mode }
      }
    }
  } catch (_) {}
  return null
}

/**
 * Prime or update the in-memory schema cache for an organization.
 *
 * @param {string} orgId
 * @param {number|string} schemaVersion
 * @param {string} [dataMode]
 */
export function setOrganizationSchema(orgId, schemaVersion, dataMode = null) {
  if (!orgId) return
  const versionNum = Number(schemaVersion) || 1
  const mode = dataMode || (versionNum >= 2 ? 'canonical' : 'legacy')
  orgSchemaCache.set(String(orgId), { schemaVersion: versionNum, dataMode: mode })
}

/**
 * Retrieve cached or session schema info synchronously.
 *
 * @param {string} orgId
 * @returns {{ schemaVersion: number, dataMode: string } | null}
 */
export function getOrganizationSchema(orgId) {
  if (!orgId) return null
  const key = String(orgId)
  if (orgSchemaCache.has(key)) {
    return orgSchemaCache.get(key)
  }
  const fromSession = getSchemaFromSession(orgId)
  if (fromSession) {
    orgSchemaCache.set(key, fromSession)
    return fromSession
  }
  return null
}

/**
 * Synchronous check whether an organization uses the new canonical schema.
 * Checks the in-memory cache and active localStorage session.
 *
 * Safe fallback: Defaults to false (Existing Organization) if unknown or unversioned.
 *
 * @param {string} orgId
 * @returns {boolean} true if New Organization (canonical v2), false if Existing (legacy)
 */
export function isNewOrganizationSync(orgId) {
  if (!orgId) return false
  const schema = getOrganizationSchema(orgId)
  if (schema) {
    return schema.schemaVersion >= 2 || schema.dataMode === 'canonical'
  }
  return false
}

/**
 * Asynchronous check whether an organization is a newly registered organization
 * using the canonical single-collection schema (schemaVersion >= 2 or dataMode === 'canonical').
 *
 * Resolution Order:
 * 1. In-memory cache (0 ms)
 * 2. Active browser session (0 ms)
 * 3. Firestore root document `/organisation/{orgId}` lookup
 * 4. Safe default: false (Existing Organization / legacy mode)
 *
 * @param {string} orgId
 * @returns {Promise<boolean>}
 */
export async function isNewOrganization(orgId) {
  if (!orgId) return false
  const key = String(orgId)

  // 1. In-memory cache
  if (orgSchemaCache.has(key)) {
    const info = orgSchemaCache.get(key)
    return info.schemaVersion >= 2 || info.dataMode === 'canonical'
  }

  // 2. Active session check
  const fromSession = getSchemaFromSession(orgId)
  if (fromSession) {
    orgSchemaCache.set(key, fromSession)
    return fromSession.schemaVersion >= 2 || fromSession.dataMode === 'canonical'
  }

  // 3. Firestore lookup
  try {
    const orgRef = doc(db, 'organisation', orgId)
    const snap = await getDoc(orgRef)
    if (snap.exists()) {
      const data = snap.data() || {}
      const versionNum = Number(data.schemaVersion) || 1
      const mode = data.dataMode || (versionNum >= 2 ? 'canonical' : 'legacy')
      const info = { schemaVersion: versionNum, dataMode: mode }
      orgSchemaCache.set(key, info)
      return versionNum >= 2 || mode === 'canonical'
    }
  } catch (err) {
    console.warn(`[schemaResolverService] Error checking schema for ${orgId}:`, err?.message)
  }

  // 4. Safe fallback for unversioned or unreachable tenants
  const defaultInfo = { schemaVersion: 1, dataMode: 'legacy' }
  orgSchemaCache.set(key, defaultInfo)
  return false
}

/**
 * Clears the in-memory schema cache (useful for testing and tenant switching).
 */
export function clearSchemaCache() {
  orgSchemaCache.clear()
}

