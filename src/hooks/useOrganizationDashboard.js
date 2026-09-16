import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../services/firebase'

const initialData = { sites: [], projects: [], managers: [], approvals: [], expenses: [], inventory: [], equipment: [], pettyCash: [] }
const sources = ['sites', 'projects', 'config_users', 'approvals', 'expenses', 'inventory', 'equipment', 'petty_cash']

export function useOrganizationDashboard(orgId) {
  const [data, setData] = useState(initialData)
  const [state, setState] = useState({ loading: true, error: '' })

  useEffect(() => {
    if (!orgId) {
      return undefined
    }

    const cleanups = []
    let completed = 0
    let cancelled = false
    const nextData = { ...initialData }

    sources.forEach((source) => {
      const unsubscribe = onSnapshot(
        collection(db, 'organisation', orgId, source),
        (snapshot) => {
          if (cancelled) return
          const key = source === 'config_users' ? 'managers' : source === 'petty_cash' ? 'pettyCash' : source
          nextData[key] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
          completed += 1
          setData({ ...nextData })
          if (completed === sources.length) setState({ loading: false, error: '' })
        },
        (error) => {
          if (cancelled) return
          setState((current) => ({ loading: false, error: current.error || error.message || 'Dashboard data could not be loaded.' }))
        },
      )
      cleanups.push(unsubscribe)
    })

    return () => {
      cancelled = true
      cleanups.forEach((unsubscribe) => unsubscribe())
    }
  }, [orgId])

  return orgId ? { ...data, sites: data.projects.length ? data.projects : data.sites, ...state } : { ...data, loading: false, error: 'Your account is not linked to an organization.' }
}
