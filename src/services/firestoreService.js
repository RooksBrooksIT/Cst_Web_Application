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
import { db } from './firebase.js'

/**
 * Standard collection names mapping with legacy backward-compatibility aliases
 */
export const COLLECTION_ALIASES = {
  // Mobile app primary collections
  projects: ['projects', 'Site', 'sites', 'Sites'],
  projectCategories: ['projectCategories'],
  projectSubCategories: ['projectSubCategories'],
  projectStages: ['projectStages'],
  projectContracts: ['projectContracts'],
  projectStatus: ['projectStatus', 'projectStatuses'],
  projectStatuses: ['projectStatus', 'projectStatuses'],
  supervisors: ['siteSupervisor', 'supervisor', 'supervisors'],
  siteSupervisor: ['siteSupervisor', 'supervisor', 'supervisors'],
  siteSupervisorMap: ['siteSupervisorMap', 'supervisor_mapping'],
  siteSupervisorEntries: ['siteSupervisorEntries', 'daily_site_logs', 'site_logs', 'daily_logs'],
  siteMaterialsRequest: ['siteMaterialsRequest', 'material_requests', 'material_indents', 'indents'],
  siteToolsRequest: ['siteToolsRequest', 'tool_allocations', 'equipment_movement'],
  siteSupervisorProjectStageSchedule: ['siteSupervisorProjectStageSchedule', 'project_stage_schedules'],
  materials: ['materials', 'inventory', 'Material', 'material_inventory'],
  materialsAvailability: [
    'materialsAvailability',
    'data/materialsAvailability',
    'materials_availability',
    'materialsAvailabilityData',
  ],
  materialCategories: ['materialCategories'],
  materialSubCategory: ['materialSubCategory'],
  units: ['units'],
  materialMovements: ['materialMovements', 'materialTransactions'],
  materialTransactions: ['materialTransactions', 'materialMovements'],
  materialAllocations: ['materialAllocations'],
  siteMaterialPool: ['siteMaterialPool', 'materialPool'],
  materialPool: ['siteMaterialPool', 'materialPool'],
  materialConsumption: ['materialConsumption'],
  materialRequisition: ['materialRequisition', 'siteMaterialsRequest'],
  tools: ['tools', 'toolsMaster', 'equipment', 'Machinery', 'Tool'],
  toolsInventory: ['toolsInventory'],
  toolsAtCompany: ['toolsAtCompany'],
  toolsAtSite: ['toolsAtSite'],
  toolsMovement: ['toolsMovement', 'toolMovements'],
  toolMovements: ['toolsMovement', 'toolMovements'],
  toolsReturn: ['toolsReturn'],
  toolsRequisition: ['toolsRequisition', 'siteToolsRequest'],
  contractors: ['contractors', 'Contractor'],
  contractorEntries: ['contractorEntries', 'contractor_bills', 'contractor_claims', 'mb_bills'],
  labours: ['labours', 'labour_categories'],
  workersConfig: ['workersConfig', 'workers', 'workforce', 'Labour', 'Worker'],
  workers: ['workersConfig', 'workers', 'workforce', 'Labour', 'Worker'],
  workerSiteMapping: ['workerSiteMapping', 'workerSiteMap', 'worker_site_mapping'],
  workerSiteMap: ['workerSiteMapping', 'workerSiteMap', 'worker_site_mapping'],
  workersAttendance: ['workersAttendance', 'workerAttendance', 'worker_attendance', 'muster_roll', 'attendance'],
  workerAttendance: ['workersAttendance', 'workerAttendance', 'worker_attendance', 'muster_roll', 'attendance'],
  WorkerMonthlyAttendance: ['WorkerMonthlyAttendance', 'workerMonthlyAttendance'],
  vehicleDetails: ['vehicleDetails', 'vehicles', 'fleet', 'Vehicle'],
  vehicleDrivers: ['vehicleDrivers', 'drivers'],
  vehicleLogs: ['vehicleLogs', 'vehicle_logs', 'fuel_logs', 'trip_logs'],
  layoutAndDrawings: ['layoutAndDrawings', 'drawings', 'blueprints'],
  totalSiteExpensesPerDay: ['totalSiteExpensesPerDay'],
  managerExpenses: ['managerExpenses', 'manager_expenses'],
  pettyCashAccounts: ['pettyCashAccounts', 'petty_cash_accounts', 'petty_cash', 'pettyCash'],
  pettyCashRequests: ['pettyCashRequests', 'petty_cash_requests', 'petty_cash_topups'],
  pettyCashExpenses: ['pettyCashExpenses', 'petty_cash_expenses', 'petty_cash_vouchers', 'vouchers'],
  pettyCashTransactions: ['pettyCashTransactions', 'petty_cash_transactions', 'transactions'],
  pettyCashReconciliations: ['pettyCashReconciliations', 'petty_cash_reconciliations'],
  pettyCashReturns: ['pettyCashReturns', 'petty_cash_returns'],
  pettyCashAuditLogs: ['pettyCashAuditLogs', 'petty_cash_audit_logs'],
  notifications: ['notifications', 'alerts'],

  // Backward compatibility alias mappings
  daily_site_logs: ['siteSupervisorEntries', 'daily_site_logs', 'site_logs', 'daily_logs'],
  material_requests: ['siteMaterialsRequest', 'material_requests', 'material_indents', 'indents'],
  tool_allocations: ['siteToolsRequest', 'tool_allocations', 'equipment_movement'],
  contractor_bills: ['contractorEntries', 'contractor_bills', 'contractor_claims', 'mb_bills'],
  worker_attendance: ['workerAttendance', 'worker_attendance', 'muster_roll', 'attendance'],
  vehicles: ['vehicleDetails', 'vehicles', 'fleet', 'Vehicle'],
  vehicle_logs: ['vehicleLogs', 'vehicle_logs', 'fuel_logs', 'trip_logs'],
  approvals: ['approvals', 'siteSupervisorEntries'],
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
