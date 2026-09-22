import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase.js'

const initialData = {
  projects: [],
  sites: [],
  projectCategories: [],
  projectSubCategories: [],
  projectStages: [],
  projectContracts: [],
  projectStatuses: [],
  supervisors: [],
  siteSupervisorMap: [],
  siteSupervisorEntries: [],
  siteMaterialsRequest: [],
  siteToolsRequest: [],
  siteSupervisorProjectStageSchedule: [],
  materials: [],
  materialRequests: [],
  materialMovements: [],
  tools: [],
  toolMovements: [],
  contractors: [],
  contractorEntries: [],
  contractorBills: [],
  labours: [],
  workers: [],
  workforce: [],
  workerSiteMapping: [],
  workerAttendance: [],
  vehicleDetails: [],
  vehicles: [],
  vehicleDrivers: [],
  vehicleLogs: [],
  layoutAndDrawings: [],
  managerExpenses: [],
  pettyCashAccounts: [],
  pettyCashRequests: [],
  pettyCashExpenses: [],
  pettyCashTransactions: [],
  pettyCashReconciliations: [],
  pettyCashReturns: [],
  pettyCash: [],
  vouchers: [],
  dailySiteLogs: [],
  dailyLogs: [],
  approvals: [],
  notifications: [],
}

const sources = [
  { key: 'projects', col: 'projects', legacy: 'sites' },
  { key: 'projectCategories', col: 'projectCategories' },
  { key: 'projectSubCategories', col: 'projectSubCategories' },
  { key: 'projectStages', col: 'projectStages' },
  { key: 'projectContracts', col: 'projectContracts' },
  { key: 'projectStatuses', col: 'projectStatuses' },
  { key: 'supervisors', col: 'siteSupervisor', legacy: 'supervisor' },
  { key: 'siteSupervisorMap', col: 'siteSupervisorMap' },
  { key: 'siteSupervisorEntries', col: 'siteSupervisorEntries', legacy: 'daily_site_logs' },
  { key: 'siteMaterialsRequest', col: 'siteMaterialsRequest', legacy: 'material_requests' },
  { key: 'siteToolsRequest', col: 'siteToolsRequest', legacy: 'tool_allocations' },
  { key: 'siteSupervisorProjectStageSchedule', col: 'siteSupervisorProjectStageSchedule' },
  { key: 'materials', col: 'materials', legacy: 'inventory' },
  { key: 'materialMovements', col: 'materialMovements' },
  { key: 'tools', col: 'tools', legacy: 'equipment' },
  { key: 'toolMovements', col: 'toolMovements' },
  { key: 'contractors', col: 'contractors', legacy: 'Contractor' },
  { key: 'contractorEntries', col: 'contractorEntries', legacy: 'contractor_bills' },
  { key: 'labours', col: 'labours' },
  { key: 'workers', col: 'workers', legacy: 'workforce' },
  { key: 'workerSiteMapping', col: 'workerSiteMapping' },
  { key: 'workerAttendance', col: 'workerAttendance', legacy: 'worker_attendance' },
  { key: 'vehicleDetails', col: 'vehicleDetails', legacy: 'vehicles' },
  { key: 'vehicleDrivers', col: 'vehicleDrivers' },
  { key: 'vehicleLogs', col: 'vehicleLogs', legacy: 'vehicle_logs' },
  { key: 'layoutAndDrawings', col: 'layoutAndDrawings' },
  { key: 'managerExpenses', col: 'managerExpenses' },
  { key: 'pettyCashAccounts', col: 'pettyCashAccounts', legacy: 'petty_cash_accounts' },
  { key: 'pettyCashRequests', col: 'pettyCashRequests', legacy: 'petty_cash_requests' },
  { key: 'pettyCashExpenses', col: 'pettyCashExpenses', legacy: 'petty_cash_expenses' },
  { key: 'pettyCashTransactions', col: 'pettyCashTransactions', legacy: 'petty_cash_transactions' },
  { key: 'pettyCashReconciliations', col: 'pettyCashReconciliations', legacy: 'petty_cash_reconciliations' },
  { key: 'pettyCashReturns', col: 'pettyCashReturns', legacy: 'petty_cash_returns' },
  { key: 'notifications', col: 'notifications', legacy: 'alerts' },
]

export function useManagerDashboard(orgId, managerUid, assignedSiteIds = []) {
  const [data, setData] = useState(initialData)
  const [state, setState] = useState({ loading: true, error: '' })

  useEffect(() => {
    if (!orgId) {
      setState({ loading: false, error: 'Account is not linked to an organization.' })
      return undefined
    }

    const cleanups = []
    let cancelled = false
    const nextData = { ...initialData }
    let completed = 0

    sources.forEach(({ key, col, legacy }) => {
      try {
        const colRef = collection(db, 'organisation', orgId, col)
        const unsubscribe = onSnapshot(
          colRef,
          (snapshot) => {
            if (cancelled) return
            let items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))

            // Fallback to legacy if primary is empty
            if (items.length === 0 && legacy) {
              const legacyUnsub = onSnapshot(
                collection(db, 'organisation', orgId, legacy),
                (legacySnap) => {
                  if (cancelled) return
                  const legacyItems = legacySnap.docs.map((d) => ({ id: d.id, ...d.data() }))
                  if (legacyItems.length > 0) {
                    let filtered = legacyItems
                    if (assignedSiteIds && assignedSiteIds.length > 0 && ['projects', 'siteSupervisorEntries', 'siteMaterialsRequest', 'siteToolsRequest', 'contractorEntries', 'workerAttendance', 'vehicleLogs', 'layoutAndDrawings', 'managerExpenses', 'pettyCashAccounts', 'pettyCashRequests', 'pettyCashExpenses'].includes(key)) {
                      filtered = legacyItems.filter((item) => {
                        const sId = item.projectId || item.siteId || item.siteID || item.id
                        return !sId || assignedSiteIds.includes(sId)
                      })
                    }
                    nextData[key] = filtered
                    if (key === 'projects') nextData.sites = filtered
                    if (key === 'siteMaterialsRequest') nextData.materialRequests = filtered
                    if (key === 'siteSupervisorEntries') {
                      nextData.dailySiteLogs = filtered
                      nextData.dailyLogs = filtered
                      nextData.approvals = filtered
                    }
                    if (key === 'contractorEntries') nextData.contractorBills = filtered
                    if (key === 'vehicleDetails') {
                      nextData.vehicles = filtered
                      nextData.fleet = filtered
                    }
                    if (key === 'pettyCashExpenses') {
                      nextData.pettyCash = filtered
                      nextData.vouchers = filtered
                    }
                    if (key === 'workers') nextData.workforce = filtered
                    setData({ ...nextData })
                  }
                },
                () => {}
              )
              cleanups.push(legacyUnsub)
            }

            // Site-based filtering for manager assigned sites
            if (assignedSiteIds && assignedSiteIds.length > 0 && ['projects', 'siteSupervisorEntries', 'siteMaterialsRequest', 'siteToolsRequest', 'contractorEntries', 'workerAttendance', 'vehicleLogs', 'layoutAndDrawings', 'managerExpenses', 'pettyCashAccounts', 'pettyCashRequests', 'pettyCashExpenses'].includes(key)) {
              items = items.filter((item) => {
                const sId = item.projectId || item.siteId || item.siteID || item.id
                return !sId || assignedSiteIds.includes(sId)
              })
            }

            nextData[key] = items
            if (key === 'projects') nextData.sites = items
            if (key === 'siteMaterialsRequest') nextData.materialRequests = items
            if (key === 'siteSupervisorEntries') {
              nextData.dailySiteLogs = items
              nextData.dailyLogs = items
              nextData.approvals = items
            }
            if (key === 'contractorEntries') nextData.contractorBills = items
            if (key === 'vehicleDetails') {
              nextData.vehicles = items
              nextData.fleet = items
            }
            if (key === 'pettyCashExpenses') {
              nextData.pettyCash = items
              nextData.vouchers = items
            }
            if (key === 'workers') nextData.workforce = items

            completed += 1
            setData({ ...nextData })
            if (completed >= sources.length) {
              setState({ loading: false, error: '' })
            }
          },
          () => {
            if (cancelled) return
            completed += 1
            if (completed >= sources.length) {
              setState({ loading: false, error: '' })
            }
          }
        )
        cleanups.push(unsubscribe)
      } catch (err) {
        completed += 1
      }
    })

    return () => {
      cancelled = true
      cleanups.forEach((unsub) => unsub())
    }
  }, [orgId, managerUid, JSON.stringify(assignedSiteIds)])

  return {
    ...data,
    sites: data.projects.length ? data.projects : data.sites,
    workforce: data.workers.length ? data.workers : data.workforce,
    dailyLogs: data.siteSupervisorEntries.length ? data.siteSupervisorEntries : data.dailySiteLogs,
    ...state,
  }
}
