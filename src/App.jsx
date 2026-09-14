import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import OrganizationDashboard from './pages/organization/Dashboard'
import OrganizationModule from './pages/organization/Module'
import ManagerDashboard from './pages/manager/Dashboard'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'

function ProtectedRoute({ allowedRole, children }) {
  const { user, role, loading } = useAuth()

  if (loading) return <div className="app-loading">Checking your session...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!role) return <Navigate to="/login" replace />
  if (role !== allowedRole) return <Navigate to={role === 'Manager' ? '/manager/dashboard' : '/organization/dashboard'} replace />
  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/organization/dashboard" element={<ProtectedRoute allowedRole="Organization"><OrganizationDashboard /></ProtectedRoute>} />
          <Route path="/organization/:module" element={<ProtectedRoute allowedRole="Organization"><OrganizationModule /></ProtectedRoute>} />
          <Route path="/manager/dashboard" element={<ProtectedRoute allowedRole="Manager"><ManagerDashboard role="Manager" /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
