import { createContext, useContext } from 'react'

export const NotificationContext = createContext(null)

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
