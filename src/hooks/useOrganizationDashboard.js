import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'
import { COLLECTION_ALIASES } from '../services/firestoreService'

const initialData = {
  projects: [],
  sites: [],
  materials: [],
  materialRequests: [],
  pettyCashAccounts: [],
  pettyCashRequests: [],
  pettyCashExpenses: [],
  contractors: [],
  contractorBills: [],
  contractorEntries: [],
  siteSupervisorEntries: [],
  managerExpenses: [],
  organizationEntries: [],
  siteSupervisorIncentives: [],
  workers: [],
  workerAttendance: [],
  tools: [],
  vehicles: [],
  qualityChecklists: [],
  safetyIncidents: [],
  customerInvoices: [],
  dailySiteLogs: [],
  approvals: [],
  managers: [],
  expenses: [],
  pettyCash: [],
  totalSiteExpensesPerDay: [],
  sitePayments: [],
  subscription: null,
}

const sources = [
  { key: 'projects', col: 'projects', legacy: 'sites' },
  { key: 'materials', col: 'materials', legacy: 'inventory' },
  { key: 'materialRequests', col: 'material_requests', legacy: 'indents' },
  { key: 'pettyCashAccounts', col: 'petty_cash_accounts', legacy: 'petty_cash' },
  { key: 'pettyCashRequests', col: 'petty_cash_requests', legacy: 'petty_cash_topups' },
  { key: 'pettyCashExpenses', col: 'petty_cash_expenses', legacy: 'petty_cash_vouchers' },
  { key: 'contractors', col: 'contractors', legacy: 'Contractor' },
  { key: 'contractorBills', col: 'contractor_bills', legacy: 'mb_bills' },
  { key: 'contractorEntries', col: 'contractorEntries', legacy: 'contractor_entries' },
  { key: 'siteSupervisorEntries', col: 'siteSupervisorEntries', legacy: 'supervisor_entries' },
  { key: 'managerExpenses', col: 'managerExpenses', legacy: 'manager_expenses' },
  { key: 'organizationEntries', col: 'organizationExpenses', legacy: 'organizationEntries' },
  { key: 'siteSupervisorIncentives', col: 'siteSupervisorIncentives', legacy: 'incentives' },
  { key: 'workers', col: 'workers', legacy: 'workforce' },
  { key: 'workerAttendance', col: 'worker_attendance', legacy: 'attendance' },
  { key: 'tools', col: 'tools', legacy: 'equipment' },
  { key: 'vehicles', col: 'vehicles', legacy: 'fleet' },
  { key: 'qualityChecklists', col: 'quality_checklists', legacy: 'snags' },
  { key: 'safetyIncidents', col: 'safety_incidents', legacy: 'safety_logs' },
  { key: 'customerInvoices', col: 'customer_invoices', legacy: 'invoices' },
  { key: 'dailySiteLogs', col: 'daily_site_logs', legacy: 'daily_logs' },
  { key: 'approvals', col: 'approvals', legacy: 'payment_approvals' },
  { key: 'managers', col: 'config_users', legacy: 'users' },
  { key: 'totalSiteExpensesPerDay', col: 'totalSiteExpensesPerDay', legacy: null },
  { key: 'sitePayments', col: 'SitePayment', legacy: 'customer_payments' },
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

    sources.forEach(({ key, col, legacy }) => {
      try {
        const unsubscribe = onSnapshot(
          collection(db, 'organisation', orgId, col),
          (snapshot) => {
            if (cancelled) return
            let items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))

            // If empty, try legacy alias once
            if (items.length === 0 && legacy) {
              const legacyUnsub = onSnapshot(
                collection(db, 'organisation', orgId, legacy),
                (legacySnap) => {
                  if (cancelled) return
                  const legacyItems = legacySnap.docs.map((d) => ({ id: d.id, ...d.data() }))
                  if (legacyItems.length > 0) {
                    nextData[key] = legacyItems
                    // Aliases
                    if (key === 'projects') nextData.sites = legacyItems
                    if (key === 'pettyCashAccounts' || key === 'pettyCashExpenses') nextData.pettyCash = legacyItems
                    if (key === 'pettyCashExpenses') nextData.expenses = legacyItems
                    setData({ ...nextData })
                  }
                },
                () => {}
              )
              cleanups.push(legacyUnsub)
            }

            nextData[key] = items
            if (key === 'projects') nextData.sites = items
            if (key === 'pettyCashAccounts' || key === 'pettyCashExpenses') nextData.pettyCash = items
            if (key === 'pettyCashExpenses') nextData.expenses = items

            completed += 1
            setData({ ...nextData })
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
