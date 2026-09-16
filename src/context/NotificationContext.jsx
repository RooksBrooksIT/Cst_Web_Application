import { createContext, useContext, useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { orgId, role, user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!orgId) {
      setNotifications([])
      setUnreadCount(0)
      return undefined
    }

    const colRef = collection(db, 'organisation', orgId, 'notifications')
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      // Filter for target role or specific user
      const filtered = items.filter((item) => {
        const targetRole = String(item.targetRole || item.role || 'all').toLowerCase()
        const userRole = String(role || '').toLowerCase()
        if (targetRole === 'all') return true
        if (targetRole === userRole) return true
        if (item.recipientId && item.recipientId === user?.uid) return true
        return false
      })

      // Sort newest first
      filtered.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime()
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime()
        return timeB - timeA
      })

      setNotifications(filtered)
      setUnreadCount(filtered.filter((n) => !n.isRead && n.status !== 'read').length)
    }, () => {
      // Fallback if collection doesn't exist
      setNotifications([])
      setUnreadCount(0)
    })

    return () => unsubscribe()
  }, [orgId, role, user?.uid])

  async function markAsRead(notificationId) {
    if (!orgId || !notificationId) return
    try {
      await updateDoc(doc(db, 'organisation', orgId, 'notifications', notificationId), {
        isRead: true,
        status: 'read',
      })
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  async function markAllAsRead() {
    if (!orgId) return
    const unread = notifications.filter((n) => !n.isRead && n.status !== 'read')
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, 'organisation', orgId, 'notifications', n.id), {
          isRead: true,
          status: 'read',
        }).catch(() => {})
      )
    )
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    return { notifications: [], unreadCount: 0, markAsRead: async () => {}, markAllAsRead: async () => {} }
  }
  return context
}
