/**
 * Role-Based Expense Report Service
 * Fetches and synchronizes expense data from Firestore collections according to user role:
 * 
 * - Organization Module / Role:
 *     - organizationEntries
 *     - organizationExpenseSummary
 *     - organizationExpenses
 *     (plus siteSupervisorEntries, managerExpenses, managerEntries, managerExpenseSummary for complete site expense view)
 * 
 * - Manager Module / Role:
 *     - managerEntries
 *     - managerExpenseSummary
 *     - managerExpenses
 *     (plus siteSupervisorEntries)
 * 
 * - Supervisor Module / Role:
 *     - siteSupervisorEntries
 * 
 * Handles real-time Firestore onSnapshot listeners and deduplication.
 */

import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './firebase.js'

/**
 * Normalizes user role string into canonical role: 'Organization', 'Manager', or 'Supervisor'.
 */
export function normalizeReportRole(rawRole) {
  if (!rawRole) return 'Organization'
  const r = String(rawRole).trim().toLowerCase()
  if (r.includes('supervisor')) return 'Supervisor'
  if (r.includes('manager')) return 'Manager'
  if (r.includes('org') || r.includes('admin') || r.includes('enterprise')) return 'Organization'
  return 'Organization'
}

/**
 * Subscribes to the appropriate Firestore collections in real time based on user role.
 *
 * @param {string} orgId - Organization ID
 * @param {string} role - User role ('Organization', 'Manager', 'Supervisor')
 * @param {function} onData - Callback when data updates: receives { [collectionKey]: Array }
 * @param {function} onError - Optional error callback
 * @returns {function} Unsubscribe function that cleans up all active Firestore listeners
 */
export function subscribeRoleExpenseData(orgId, role, onData, onError) {
  if (!orgId) {
    if (onError) onError(new Error('Missing organization ID for report subscription.'))
    return () => {}
  }

  const canonicalRole = normalizeReportRole(role)
  const cleanups = []
  let cancelled = false

  // Store data per collection key
  const state = {
    organizationExpenses: [],
    organizationEntries: [],
    organizationExpenseSummary: [],
    managerExpenses: [],
    managerEntries: [],
    managerExpenseSummary: [],
    siteSupervisorEntries: [],
    contractorEntries: [],
  }

  // Define collections to listen to based on role
  let collectionsToListen = []

  if (canonicalRole === 'Supervisor') {
    collectionsToListen = [
      { key: 'siteSupervisorEntries', col: 'siteSupervisorEntries' },
    ]
  } else if (canonicalRole === 'Manager') {
    collectionsToListen = [
      { key: 'managerExpenses', col: 'managerExpenses' },
      { key: 'managerEntries', col: 'managerEntries' },
      { key: 'managerExpenseSummary', col: 'managerExpenseSummary' },
      { key: 'siteSupervisorEntries', col: 'siteSupervisorEntries' },
      { key: 'contractorEntries', col: 'contractorEntries' },
    ]
  } else {
    // Organization (default)
    collectionsToListen = [
      { key: 'organizationExpenses', col: 'organizationExpenses' },
      { key: 'organizationEntries', col: 'organizationEntries' },
      { key: 'organizationExpenseSummary', col: 'organizationExpenseSummary' },
      { key: 'managerExpenses', col: 'managerExpenses' },
      { key: 'managerEntries', col: 'managerEntries' },
      { key: 'managerExpenseSummary', col: 'managerExpenseSummary' },
      { key: 'siteSupervisorEntries', col: 'siteSupervisorEntries' },
      { key: 'contractorEntries', col: 'contractorEntries' },
    ]
  }

  const emit = () => {
    if (cancelled) return
    onData({ ...state, role: canonicalRole })
  }

  collectionsToListen.forEach(({ key, col }) => {
    try {
      const colRef = collection(db, 'organisation', orgId, col)
      const unsub = onSnapshot(
        colRef,
        (snapshot) => {
          if (cancelled) return
          const items = []
          const seenIds = new Set()
          for (const d of snapshot.docs) {
            if (!seenIds.has(d.id)) {
              seenIds.add(d.id)
              items.push({ id: d.id, ...d.data() })
            }
          }
          state[key] = items
          emit()
        },
        (err) => {
          console.warn(`[subscribeRoleExpenseData] Listener error on ${col}:`, err?.message)
          if (onError) onError(err)
        }
      )
      cleanups.push(unsub)
    } catch (err) {
      console.warn(`[subscribeRoleExpenseData] Could not attach listener on ${col}:`, err?.message)
    }
  })

  return () => {
    cancelled = true
    cleanups.forEach((unsub) => {
      try {
        unsub()
      } catch {}
    })
  }
}
