import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import { COLLECTION_ALIASES } from '../services/firestoreService'
import { normalizeExpenseRecord } from '../services/expenseNormalizationService'

const initialData = {
  projects: [],
  sites: [],
  materials: [],
  materialRequests: [],
  siteMaterialsRequest: [],
  siteToolsRequest: [],
  siteSupervisorProjectStageSchedule: [],
  vehicleMovements: [],
  pettyCashAccounts: [],
  pettyCashRequests: [],
  pettyCashExpenses: [],
  pettyCashTransactions: [],
  pettyCashReconciliations: [],
  pettyCashReturns: [],
  pettyCashAuditLogs: [],
  contractors: [],
  contractorBills: [],
  contractorEntries: [],
  siteSupervisorEntries: [],
  managerExpenses: [],
  organizationEntries: [],
  siteSupervisorIncentives: [],
  workers: [],
  workersConfig: [],
  workerSiteMapping: [],
  workerAttendance: [],
  tools: [],
  vehicles: [],
  qualityChecklists: [],
  safetyIncidents: [],
  customerInvoices: [],
  dailySiteLogs: [],
  approvals: [],
  supervisors: [],
  managers: [],
  expenses: [],
  pettyCash: [],
  totalSiteExpensesPerDay: [],
  sitePayments: [],
  projectStages: [],
  materialsAvailability: [],
  siteMaterialPool: [],
  materialAllocations: [],
  subscription: null,
}

const sources = [
  { key: 'projects', col: 'projects', legacy: 'sites' },
  { key: 'materials', col: 'materials', legacy: 'inventory' },
  { key: 'materialRequests', col: 'siteMaterialsRequest', legacy: 'material_requests' },
  { key: 'siteMaterialsRequest', col: 'siteMaterialsRequest', legacy: 'material_requests' },
  { key: 'siteToolsRequest', col: 'siteToolsRequest', legacy: 'tool_allocations' },
  { key: 'siteSupervisorProjectStageSchedule', col: 'siteSupervisorProjectStageSchedule', legacy: 'project_stage_schedules' },
  { key: 'vehicleMovements', col: 'vehicleMovements', legacy: 'vehicle_movements' },
  { key: 'pettyCashAccounts', col: 'pettyCashAccounts', legacy: 'petty_cash_accounts' },
  { key: 'pettyCashRequests', col: 'pettyCashRequests', legacy: 'petty_cash_requests' },
  { key: 'pettyCashExpenses', col: 'pettyCashExpenses', legacy: 'petty_cash_expenses' },
  { key: 'pettyCashTransactions', col: 'pettyCashTransactions', legacy: 'petty_cash_transactions' },
  { key: 'pettyCashReconciliations', col: 'pettyCashReconciliations', legacy: 'petty_cash_reconciliations' },
  { key: 'pettyCashReturns', col: 'pettyCashReturns', legacy: 'petty_cash_returns' },
  { key: 'pettyCashAuditLogs', col: 'pettyCashAuditLogs', legacy: 'petty_cash_audit_logs' },
  { key: 'contractors', col: 'contractors', legacy: 'Contractor' },
  { key: 'contractorBills', col: 'contractor_bills', legacy: 'mb_bills' },
  { key: 'contractorEntries', col: 'contractorEntries', legacy: 'contractor_entries' },
  { key: 'siteSupervisorEntries', col: 'siteSupervisorEntries', legacy: 'supervisor_entries' },
  { key: 'managerExpenses', col: 'managerExpenses', legacy: 'managerEntries' },
  { key: 'organizationEntries', col: 'organizationExpenses', legacy: 'organizationEntries' },
  { key: 'siteSupervisorIncentives', col: 'siteSupervisorIncentives', legacy: 'incentives' },
  { key: 'workersConfig', col: 'workersConfig', legacy: 'workers' },
  { key: 'workers', col: 'workersConfig', legacy: 'workers' },
  { key: 'workerSiteMapping', col: 'workerSiteMapping', legacy: 'workerSiteMap' },
  { key: 'workerAttendance', col: 'workersAttendance', legacy: 'worker_attendance' },
  { key: 'tools', col: 'tools', legacy: 'equipment' },
  { key: 'vehicles', col: 'vehicles', legacy: 'fleet' },
  { key: 'qualityChecklists', col: 'quality_checklists', legacy: 'snags' },
  { key: 'safetyIncidents', col: 'safety_incidents', legacy: 'safety_logs' },
  { key: 'customerInvoices', col: 'customer_invoices', legacy: 'invoices' },
  { key: 'dailySiteLogs', col: 'daily_site_logs', legacy: 'daily_logs' },
  { key: 'approvals', col: 'siteSupervisorEntries', legacy: 'approvals' },
  { key: 'supervisors', col: 'supervisor', legacy: 'siteSupervisor' },
  { key: 'managers', col: 'config_users', legacy: 'users' },
  { key: 'expenses', col: 'expenses', legacy: 'site_expenses' },
  { key: 'totalSiteExpensesPerDay', col: 'totalSiteExpensesPerDay', legacy: null },
  { key: 'sitePayments', col: 'SitePayment', legacy: 'customer_payments' },
  { key: 'projectStages', col: 'projectStages' },
  { key: 'materialsAvailability', col: 'materialsAvailability' },
  { key: 'siteMaterialPool', col: 'siteMaterialPool' },
  { key: 'materialAllocations', col: 'materialAllocations' },
]

export function useOrganizationDashboard(orgId) {
  const [data, setData] = useState(initialData)
  const [state, setState] = useState({ loading: true, error: '' })

  useEffect(() => {
    if (!orgId) {
      setState({ loading: false, error: 'Your account is not linked to an organization.' })
      return undefined
    }

    const cleanups = []
    let cancelled = false
    const nextData = { ...initialData }
    let completed = 0

    // Store primary and legacy results per source key to avoid listener leaks and race conditions
    const store = {}
    sources.forEach(({ key }) => {
      store[key] = { primary: [], legacy: [] }
    })

    const updateSourceData = (key) => {
      if (cancelled) return
      const isExpenseKey = key === 'organizationEntries' || key === 'managerExpenses'
      let items = []

      if (isExpenseKey) {
        const mergedMap = new Map()
        ;(store[key].primary || []).forEach((item) => mergedMap.set(item.id, item))
        ;(store[key].legacy || []).forEach((item) => {
          if (!mergedMap.has(item.id)) mergedMap.set(item.id, item)
        })
        items = Array.from(mergedMap.values())
      } else {
        const primaryItems = store[key].primary || []
        const legacyItems = store[key].legacy || []
        items = primaryItems.length > 0 ? primaryItems : legacyItems
      }

      if (key === 'projectStages') {
        items.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      }

      nextData[key] = items
      if (key === 'projects') nextData.sites = items
      if (key === 'pettyCashAccounts' || key === 'pettyCashExpenses') nextData.pettyCash = items
      if (key === 'pettyCashExpenses') nextData.expenses = items

      setData({ ...nextData })
    }

    sources.forEach(({ key, col, legacy }) => {
      const isExpenseKey = key === 'organizationEntries' || key === 'managerExpenses'

      // Primary listener
      try {
        const unsubscribe = onSnapshot(
          collection(db, 'organisation', orgId, col),
          (snapshot) => {
            if (cancelled) return
            const seenIds = new Set()
            const uniqueDocs = []
            for (const d of snapshot.docs) {
              if (!seenIds.has(d.id)) {
                seenIds.add(d.id)
                uniqueDocs.push({ ...d.data(), id: d.id })
              }
            }
            let items = uniqueDocs
            if (isExpenseKey) {
              items = items.map((d) =>
                normalizeExpenseRecord(d.id, d, key === 'managerExpenses' ? 'Manager' : 'Organization')
              )
            }
            store[key].primary = items
            updateSourceData(key)

            completed += 1
            if (completed >= sources.length) setState({ loading: false, error: '' })
          },
          (err) => {
            if (cancelled) return
            completed += 1
            if (completed >= sources.length) setState({ loading: false, error: '' })
          }
        )
        cleanups.push(unsubscribe)
      } catch (err) {
        completed += 1
      }

      // Legacy listener registered once at top-level if legacy collection exists
      if (legacy) {
        try {
          const legacyUnsub = onSnapshot(
            collection(db, 'organisation', orgId, legacy),
            (legacySnap) => {
              if (cancelled) return
              const legacySeen = new Set()
              const uniqueLegacyDocs = []
              for (const d of legacySnap.docs) {
                if (!legacySeen.has(d.id)) {
                  legacySeen.add(d.id)
                  const rawDoc = { ...d.data(), id: d.id }
                  const normalized = isExpenseKey
                    ? normalizeExpenseRecord(d.id, rawDoc, key === 'managerExpenses' ? 'Manager' : 'Organization')
                    : rawDoc
                  uniqueLegacyDocs.push(normalized)
                }
              }
              store[key].legacy = uniqueLegacyDocs
              updateSourceData(key)
            },
            () => {}
          )
          cleanups.push(legacyUnsub)
        } catch (err) {}
      }
    })

    // Subscription doc listener
    try {
      const subUnsub = onSnapshot(
        doc(db, 'organisation', orgId, 'data', 'subscription'),
        (snap) => {
          if (cancelled) return
          if (snap.exists()) {
            nextData.subscription = { id: snap.id, ...snap.data() }
          } else {
            nextData.subscription = null
          }
          setData({ ...nextData })
        },
        () => {}
      )
      cleanups.push(subUnsub)
    } catch (e) {}

    return () => {
      cancelled = true
      cleanups.forEach((unsub) => unsub())
    }
  }, [orgId])

  return {
    ...data,
    sites: data.projects.length ? data.projects : data.sites,
    ...state,
  }
}
