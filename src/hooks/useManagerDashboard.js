import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'

const initialData = {
  sites: [],
  workforce: [],
  materials: [],
  materialTransfers: [],
  tools: [],
  dailyLogs: [],
  pettyCash: [],
  vouchers: [],
  approvals: [],
  fleet: [],
  notifications: [],
}

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

    const sources = [
      { key: 'sites', collectionName: 'sites' },
      { key: 'workforce', collectionName: 'workforce' },
      { key: 'materials', collectionName: 'inventory' },
      { key: 'materialTransfers', collectionName: 'material_transfers' },
      { key: 'tools', collectionName: 'equipment' },
      { key: 'dailyLogs', collectionName: 'daily_logs' },
      { key: 'pettyCash', collectionName: 'petty_cash' },
      { key: 'vouchers', collectionName: 'petty_cash_vouchers' },
      { key: 'approvals', collectionName: 'approvals' },
      { key: 'fleet', collectionName: 'fleet' },
      { key: 'notifications', collectionName: 'notifications' },
    ]

    let completed = 0

    sources.forEach(({ key, collectionName }) => {
      try {
        const colRef = collection(db, 'organisation', orgId, collectionName)
        const unsubscribe = onSnapshot(
          colRef,
          (snapshot) => {
            if (cancelled) return
            let items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

            // If manager has specific assigned sites, filter relevant records
            if (assignedSiteIds && assignedSiteIds.length > 0 && ['sites', 'dailyLogs', 'pettyCash', 'vouchers'].includes(key)) {
              items = items.filter((item) => {
                const siteId = item.siteId || item.siteID || item.projectId || item.id
                return assignedSiteIds.includes(siteId)
              })
            }

            nextData[key] = items
            completed += 1
            setData({ ...nextData })
            if (completed >= sources.length) {
              setState({ loading: false, error: '' })
            }
          },
          (err) => {
            if (cancelled) return
            completed += 1
            // Non-critical collections may not exist yet; continue gracefully
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

  return { ...data, ...state }
}
