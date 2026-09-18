import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'

const initialData = {
  projects: [],
  sites: [],
  materials: [],
  materialRequests: [],
  pettyCashAccounts: [],
  pettyCashRequests: [],
  pettyCashExpenses: [],
  pettyCash: [],
  vouchers: [],
  workers: [],
  workforce: [],
  workerAttendance: [],
  contractors: [],
  contractorBills: [],
  tools: [],
  vehicles: [],
  fleet: [],
  qualityChecklists: [],
  safetyIncidents: [],
  customerInvoices: [],
  dailySiteLogs: [],
  dailyLogs: [],
  approvals: [],
  notifications: [],
}

const sources = [
  { key: 'projects', col: 'projects', legacy: 'sites' },
  { key: 'materials', col: 'materials', legacy: 'inventory' },
  { key: 'materialRequests', col: 'material_requests', legacy: 'indents' },
  { key: 'pettyCashAccounts', col: 'petty_cash_accounts', legacy: 'petty_cash' },
  { key: 'pettyCashRequests', col: 'petty_cash_requests', legacy: 'petty_cash_topups' },
  { key: 'pettyCashExpenses', col: 'petty_cash_expenses', legacy: 'petty_cash_vouchers' },
  { key: 'workers', col: 'workers', legacy: 'workforce' },
  { key: 'workerAttendance', col: 'worker_attendance', legacy: 'attendance' },
  { key: 'contractors', col: 'contractors', legacy: 'Contractor' },
  { key: 'contractorBills', col: 'contractor_bills', legacy: 'mb_bills' },
  { key: 'tools', col: 'tools', legacy: 'equipment' },
  { key: 'vehicles', col: 'vehicles', legacy: 'fleet' },
  { key: 'qualityChecklists', col: 'quality_checklists', legacy: 'snags' },
  { key: 'safetyIncidents', col: 'safety_incidents', legacy: 'safety_logs' },
  { key: 'customerInvoices', col: 'customer_invoices', legacy: 'invoices' },
  { key: 'dailySiteLogs', col: 'daily_site_logs', legacy: 'daily_logs' },
  { key: 'approvals', col: 'approvals', legacy: 'payment_approvals' },
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
            let items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

            // If primary is empty and legacy exists, check legacy
            if (items.length === 0 && legacy) {
              const legacyUnsub = onSnapshot(
                collection(db, 'organisation', orgId, legacy),
                (legacySnap) => {
                  if (cancelled) return
                  const legacyItems = legacySnap.docs.map((d) => ({ id: d.id, ...d.data() }))
                  if (legacyItems.length > 0) {
                    let filtered = legacyItems
                    if (assignedSiteIds && assignedSiteIds.length > 0) {
                      filtered = legacyItems.filter((item) => {
                        const sId = item.projectId || item.siteId || item.siteID || item.id
                        return !sId || assignedSiteIds.includes(sId)
                      })
                    }
                    nextData[key] = filtered
                    if (key === 'projects') nextData.sites = filtered
                    if (key === 'pettyCashAccounts' || key === 'pettyCashExpenses') {
                      nextData.pettyCash = filtered
                      nextData.vouchers = filtered
                    }
                    if (key === 'workers' || key === 'workerAttendance') nextData.workforce = filtered
                    if (key === 'vehicles') nextData.fleet = filtered
                    if (key === 'dailySiteLogs') nextData.dailyLogs = filtered
                    setData({ ...nextData })
                  }
                },
                () => {}
              )
              cleanups.push(legacyUnsub)
            }

            // Filter by assigned sites if applicable
            if (assignedSiteIds && assignedSiteIds.length > 0) {
              items = items.filter((item) => {
                const sId = item.projectId || item.siteId || item.siteID || item.id
                return !sId || assignedSiteIds.includes(sId)
              })
            }

            nextData[key] = items
            if (key === 'projects') nextData.sites = items
            if (key === 'pettyCashAccounts' || key === 'pettyCashExpenses') {
              nextData.pettyCash = items
              nextData.vouchers = items
            }
            if (key === 'workers' || key === 'workerAttendance') nextData.workforce = items
            if (key === 'vehicles') nextData.fleet = items
            if (key === 'dailySiteLogs') nextData.dailyLogs = items

            completed += 1
            setData({ ...nextData })
            if (completed >= sources.length) {
              setState({ loading: false, error: '' })
            }
          },
          (err) => {
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
    workforce: data.workerAttendance.length ? data.workerAttendance : data.workforce,
    dailyLogs: data.dailySiteLogs.length ? data.dailySiteLogs : data.dailyLogs,
    ...state,
  }
}
