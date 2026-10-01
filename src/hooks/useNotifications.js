import { useContext } from 'react'
import { NotificationContext } from '../context/notification-context'

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    return {
      notifications: [],
      unreadCount: 0,
      activeBanner: null,
      dismissBanner: () => {},
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      navigateNotification: () => {},
      requestBrowserPermission: async () => 'unsupported',
    }
  }
  return context
}
