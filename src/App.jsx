import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import OrganizationDashboard from './pages/organization/Dashboard'
import ManagerDashboard from './pages/manager/ManagerDashboard'
import ManagerModule from './pages/manager/ManagerModule'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'

function ProtectedRoute({ allowedRole, children }) {
  const { user, role, loading } = useAuth()

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">Checking your session...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!role) return <Navigate to="/login" replace />
  if (role !== allowedRole) return <Navigate to={role === 'Manager' ? '/manager/dashboard' : '/organization/dashboard'} replace />
  return children
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            
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
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  )
}

export default App
