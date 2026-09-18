import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

/**
 * Standard collection names mapping with legacy backward-compatibility aliases
 */
export const COLLECTION_ALIASES = {
  projects: ['projects', 'sites', 'Sites', 'Site'],
  materials: ['materials', 'inventory', 'Material', 'material_inventory'],
  material_requests: ['material_requests', 'material_indents', 'indents'],
  petty_cash_accounts: ['petty_cash_accounts', 'petty_cash', 'pettyCash'],
  petty_cash_requests: ['petty_cash_requests', 'petty_cash_topups'],
  petty_cash_expenses: ['petty_cash_expenses', 'petty_cash_vouchers', 'vouchers'],
  contractors: ['contractors', 'Contractor'],
  contractor_bills: ['contractor_bills', 'contractor_claims', 'mb_bills'],
  workers: ['workers', 'workforce', 'Labour', 'Worker'],
  worker_attendance: ['worker_attendance', 'muster_roll', 'attendance'],
  tools: ['tools', 'equipment', 'Machinery', 'Tool'],
  tool_allocations: ['tool_allocations', 'equipment_movement'],
  vehicles: ['vehicles', 'fleet', 'Vehicle'],
  vehicle_logs: ['vehicle_logs', 'fuel_logs', 'trip_logs'],
  quality_checklists: ['quality_checklists', 'qa_inspections', 'snags'],
  safety_incidents: ['safety_incidents', 'safety_logs'],
  customer_invoices: ['customer_invoices', 'invoices', 'billing'],
  customer_payments: ['customer_payments', 'payments'],
  daily_site_logs: ['daily_site_logs', 'site_logs', 'daily_logs'],
  approvals: ['approvals', 'payment_approvals'],
  notifications: ['notifications', 'alerts'],
}

/**
 * Resolves standard organization collection reference
 */
export function getOrgCollectionRef(orgId, collectionName) {
  if (!orgId) throw new Error('orgId is required for multi-tenant data access')
  return collection(db, 'organisation', orgId, collectionName)
}

/**
 * Resolves standard organization document reference
 */
export function getOrgDocRef(orgId, collectionName, docId) {
  if (!orgId || !docId) throw new Error('orgId and docId are required')
  return doc(db, 'organisation', orgId, collectionName, docId)
}

/**
 * Fetches documents from standard collection with fallback to legacy aliases
 */
export async function fetchWithFallback(orgId, primaryCollection) {
  if (!orgId) return []
  const aliases = COLLECTION_ALIASES[primaryCollection] || [primaryCollection]

  for (const colName of aliases) {
    try {
      const snap = await getDocs(collection(db, 'organisation', orgId, colName))
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      }
    } catch (e) {
      // Continue to next alias
    }
  }
  return []
}

/**
 * Real-time listener for standard collection with fallback support
 */
export function subscribeWithFallback(orgId, primaryCollection, onData, onError) {
  if (!orgId) return () => {}
  const colRef = collection(db, 'organisation', orgId, primaryCollection)

  return onSnapshot(
    colRef,
    async (snapshot) => {
      if (!snapshot.empty) {
        onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
      } else {
        // If primary is empty, check legacy aliases once
        const aliases = (COLLECTION_ALIASES[primaryCollection] || []).filter((c) => c !== primaryCollection)
        let found = false
        for (const alias of aliases) {
          try {
            const aliasSnap = await getDocs(collection(db, 'organisation', orgId, alias))
            if (!aliasSnap.empty) {
              found = true
              onData(aliasSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
              break
            }
          } catch (e) {}
        }
        if (!found) {
          onData([])
        }
      }
    },
    (err) => {
      if (onError) onError(err)
    }
  )
}

/**
 * Saves a document strictly to the primary canonical collection
 */
export async function saveStandardDoc(orgId, collectionName, docData, customDocId = null) {
  if (!orgId) throw new Error('orgId is required')
  const payload = {
    ...docData,
    organizationId: orgId,
    updatedAt: serverTimestamp(),
  }

  if (customDocId) {
    const docRef = doc(db, 'organisation', orgId, collectionName, customDocId)
    await setDoc(docRef, { ...payload, createdAt: docData.createdAt || serverTimestamp() }, { merge: true })
    return customDocId
  }

  const colRef = collection(db, 'organisation', orgId, collectionName)
  const res = await addDoc(colRef, { ...payload, createdAt: serverTimestamp() })
  return res.id
}

/**
 * Updates a document strictly in the primary canonical collection
 */
export async function updateStandardDoc(orgId, collectionName, docId, updates) {
  if (!orgId || !docId) throw new Error('orgId and docId are required')
  const docRef = doc(db, 'organisation', orgId, collectionName, docId)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Deletes a document from the primary collection
 */
export async function deleteStandardDoc(orgId, collectionName, docId) {
  if (!orgId || !docId) throw new Error('orgId and docId are required')
  const docRef = doc(db, 'organisation', orgId, collectionName, docId)
  await deleteDoc(docRef)
}
