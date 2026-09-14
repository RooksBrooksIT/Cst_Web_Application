import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../services/firebase'
import { clearStoredSession, loginUser, normalizeRole, readStoredSession } from '../services/authService'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ user: null, role: null, orgId: null, userData: null, loading: true })

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      clearStoredSession()
      setSession({ user: null, role: null, orgId: null, userData: null, loading: false })
      return
    }

    try {
      const token = await user.getIdTokenResult()
      const tokenRole = token.claims.role || token.claims.userRole
      const stored = readStoredSession()
      const role = normalizeRole(tokenRole) || (stored?.uid === user.uid ? stored.role : null)
      setSession({ user, role, orgId: token.claims.orgId || stored?.orgId || null, userData: stored?.userData || null, loading: false })
    } catch {
      clearStoredSession()
      await signOut(auth)
      setSession({ user: null, role: null, orgId: null, userData: null, loading: false })
    }
  }), [])

  async function login(identifier, password) {
    const nextSession = await loginUser(identifier, password)
    setSession({ user: auth.currentUser, role: nextSession.role, orgId: nextSession.orgId, userData: nextSession.userData, loading: false })
    return nextSession.role
  }

  async function logout() {
    await signOut(auth)
    clearStoredSession()
    setSession({ user: null, role: null, orgId: null, userData: null, loading: false })
  }

  return <AuthContext.Provider value={{ ...session, login, logout }}>{children}</AuthContext.Provider>
}
