import { useEffect, useRef, useState, useCallback } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import {
  matchesRole,
  markAsRead as serviceMarkAsRead,
  markAllReadForRole,
  normalizeCanonicalRole,
  saveFcmToken,
} from '../services/notificationService'
import { handleNotificationNavigation } from '../services/notificationRouter'
import { playNotificationChime } from '../utils/notificationSound'
import { NotificationContext } from './notification-context'


export function NotificationProvider({ children }) {
  const { orgId, role, user, userData } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeBanner, setActiveBanner] = useState(null)

  // In-Memory De-duplication Cache (Section 2.3 #2)
  const processedNotifIdsRef = useRef(new Set())
  // Session start time with 2-minute rolling skew window (Section 2.3 #1 & 6.2)
  const sessionStartTimeRef = useRef(0)
  const isInitialLoadRef = useRef(true)

  // --------------------------------------------------------------------------------
  // FCM DEVICE TOKEN REGISTRATION (Section 2.2 #1 & 4.3)
  // --------------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId || !user?.uid || !role) return

    const userId = user.uid
    const userName = userData?.fullName || user.displayName || user.email || 'Web User'
    // Retrieve or create persistent web client token
    let webToken = localStorage.getItem(`cst_web_fcm_token_${userId}`)
    if (!webToken) {
      webToken = `web_token_${userId}_${Math.random().toString(36).substring(2, 10)}`
      localStorage.setItem(`cst_web_fcm_token_${userId}`, webToken)
    }

    saveFcmToken({
      orgId,
      role,
      userName,
      userId,
      token: webToken,
    }).catch((err) => {
      console.warn('Web device token registration notice:', err)
    })
  }, [orgId, role, user?.uid, userData?.fullName, user?.displayName, user?.email])

  // --------------------------------------------------------------------------------
  // BROWSER NOTIFICATION PERMISSION REQUEST
  // --------------------------------------------------------------------------------
  const requestBrowserPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          return await Notification.requestPermission()
        }
        return Notification.permission
      } catch {
        return 'denied'
      }
    }
    return 'unsupported'
  }, [])

  // --------------------------------------------------------------------------------
  // REAL-TIME NOTIFICATION BRIDGE & DEDUPLICATION ENGINE (Section 2.3)
  // --------------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId) {
      return undefined
    }

    // Initialize session baseline time with 2-minute rolling skew window
    sessionStartTimeRef.current = Date.now() - 120000
    isInitialLoadRef.current = true

    const colRef = collection(db, 'organisation', orgId, 'notifications')
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(100))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rawItems = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))

        const currentUserId = user?.uid
        const currentUserName = (userData?.fullName || user?.displayName || user?.email || '').trim().toLowerCase()
        const currentCanonicalRole = normalizeCanonicalRole(role)

        // 1. Role & Recipient Filter
        const filtered = rawItems.filter((item) => {
          return matchesRole(
            item.targetRole || item.recipientRole,
            item.targetRoles,
            currentCanonicalRole,
            currentUserId,
            item.recipientId
          )
        })

        // 2. Sort newest first
        filtered.sort((a, b) => {
          const timeA = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : new Date(a.createdAt || 0).getTime()
          const timeB = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : new Date(b.createdAt || 0).getTime()
          return timeB - timeA
        })

        // 3. Process new events for real-time foreground bridge
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newItem = { id: change.doc.id, ...change.doc.data() }
            const notifId = newItem.id || newItem.notificationId

            // Pre-seed cache on initial load without firing alert popups (Section 2.3 #2)
            if (isInitialLoadRef.current) {
              processedNotifIdsRef.current.add(notifId)
              return
            }

            // In-Memory Deduplication: skip if already processed in this session
            if (processedNotifIdsRef.current.has(notifId)) {
              return
            }
            processedNotifIdsRef.current.add(notifId)

            // Self-Action Suppression (Section 2.3 #3)
            const senderName = String(newItem.senderName || '').trim().toLowerCase()
            const senderRole = normalizeCanonicalRole(newItem.senderRole)
            const isSelfAuthor =
              (senderName === currentUserName && senderRole === currentCanonicalRole) ||
              (newItem.senderId && currentUserId && String(newItem.senderId) === String(currentUserId))

            if (isSelfAuthor) {
              return
            }

            // Role match check
            const isApplicable = matchesRole(
              newItem.targetRole || newItem.recipientRole,
              newItem.targetRoles,
              currentCanonicalRole,
              currentUserId,
              newItem.recipientId
            )
            if (!isApplicable) {
              return
            }

            // Rolling 2-minute time window check (Section 2.3 #1)
            const itemTime = newItem.createdAt?.toMillis
              ? newItem.createdAt.toMillis()
              : newItem.createdAt?.seconds
              ? newItem.createdAt.seconds * 1000
              : Date.now()

            if (itemTime < sessionStartTimeRef.current) {
              return
            }

            // --- Tier 2: Real-Time Heads-up Foreground Alert ---
            // A. Trigger synthesized audio chime
            playNotificationChime()

            // B. Enqueue In-App Heads-Up Banner (Section 2.3 #5)
            setActiveBanner(newItem)

            // C. Native Browser System Tray Notification (Tier 3 on Web)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(newItem.title || 'CST White Label', {
                  body: newItem.message || newItem.body || 'New operational update received.',
                  icon: '/vite.svg',
                  tag: notifId,
                })
              } catch {
                // Ignore background notification issues in unsupported environments
              }
            }
          }
        })

        isInitialLoadRef.current = false
        setNotifications(filtered)
        setUnreadCount(filtered.filter((n) => !n.isRead && n.status !== 'read').length)
      },
      (err) => {
        console.warn('Real-time notification bridge stream notice:', err)
        setNotifications([])
        setUnreadCount(0)
      }
    )

    return () => {
      unsubscribe()
      setNotifications([])
      setUnreadCount(0)
      setActiveBanner(null)
    }
  }, [orgId, role, user?.uid, userData?.fullName, user?.displayName, user?.email])

  // --------------------------------------------------------------------------------
  // READ ACTIONS (Section 2.2 #5)
  // --------------------------------------------------------------------------------
  const markAsRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true, status: 'read' } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))

      await serviceMarkAsRead(orgId, notificationId)
    },
    [orgId]
  )

  const markAllAsRead = useCallback(async () => {
    if (!orgId) return
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, status: 'read' })))
    setUnreadCount(0)

    await markAllReadForRole(orgId, role, user, notifications)
  }, [orgId, role, user, notifications])

  const dismissBanner = useCallback(() => {
    setActiveBanner(null)
  }, [])

  const navigateNotification = useCallback(
    (item, navigate, onClose) => {
      dismissBanner()
      handleNotificationNavigation({
        item,
        currentRole: role,
        orgId,
        navigate,
        onClose,
      })
    },
    [role, orgId, dismissBanner]
  )

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        activeBanner,
        dismissBanner,
        markAsRead,
        markAllAsRead,
        navigateNotification,
        requestBrowserPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
