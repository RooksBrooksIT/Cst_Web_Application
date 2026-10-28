import { BrowserRouter, HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import OrganizationDashboard from './pages/organization/Dashboard'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import ManagerModule from './pages/manager/ManagerModule'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { useNotifications } from './hooks/useNotifications'
import NotificationBanner from './components/common/NotificationBanner'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import OrganizationOnboardingPage from './pages/organization/onboarding/OrganizationOnboardingPage'

const isElectron = typeof window !== 'undefined' && (
  window.location.protocol === 'file:' ||
  navigator.userAgent.includes('Electron') ||
  Boolean(window.process?.versions?.electron)
)

const AppRouter = isElectron ? HashRouter : BrowserRouter

function ProtectedRoute({ allowedRole, children }) {
  const { user, role, loading } = useAuth()

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">Checking your session...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!role) return <Navigate to="/login" replace />
  if (role !== allowedRole) return <Navigate to={role === 'Manager' ? '/manager/dashboard' : '/organization/dashboard'} replace />
  return children
}

function GlobalNotificationBanner() {
  const { activeBanner, dismissBanner, navigateNotification } = useNotifications()
  const navigate = useNavigate()

  if (!activeBanner) return null

  return (
    <NotificationBanner
      notification={activeBanner}
      onAction={(item) => navigateNotification(item, navigate)}
      onDismiss={dismissBanner}
    />
  )
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppRouter>
          <GlobalNotificationBanner />
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<Login initialView="forgot-password" />} />
            
            {/* Organization Account Creation and Onboarding Flow */}
            <Route path="/register" element={<OrganizationOnboardingPage />} />
            <Route path="/organization/register" element={<OrganizationOnboardingPage />} />
            <Route path="/orgRegistration" element={<OrganizationOnboardingPage />} />
            <Route path="/orgRegistrationForm" element={<OrganizationOnboardingPage />} />
            
            {/* Organization Routes */}
            <Route
              path="/organization/*"
              element={
                <ProtectedRoute allowedRole="Organization">
                  <OrganizationDashboard />
                </ProtectedRoute>
              }
            />

            {/* Manager Routes */}
            <Route
              path="/manager"
              element={<Navigate to="/manager/dashboard" replace />}
            />
            <Route
              path="/manager/dashboard"
              element={
                <ProtectedRoute allowedRole="Manager">
                  <ManagerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/:module"
              element={
                <ProtectedRoute allowedRole="Manager">
                  <ManagerModule />
                </ProtectedRoute>
              }
            />

            {/* Global Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AppRouter>
      </NotificationProvider>
    </AuthProvider>
  )
}

export default App
