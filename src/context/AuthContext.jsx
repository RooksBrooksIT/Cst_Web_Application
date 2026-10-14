import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../services/firebase'
import { clearStoredSession, fetchCurrentUserProfile, loginUser, normalizeRole, readStoredSession } from '../services/authService'
import { ensureStorageAuthenticated } from '../services/appStorageService'
import { deleteFcmToken } from '../services/notificationService'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ user: null, role: null, orgId: null, userData: null, loading: true })

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const stored = readStoredSession()
      if (stored && stored.isLoggedIn) {
        if (stored.orgId) {
          ensureStorageAuthenticated(stored.orgId).catch(() => {})
        }
        setSession({ user: { uid: stored.uid, email: stored.email, displayName: stored.userData?.fullName }, role: stored.role, orgId: stored.orgId, userData: stored.userData, loading: false })
        return
      }
      clearStoredSession()
      setSession({ user: null, role: null, orgId: null, userData: null, loading: false })
      return
    }

    try {
      const token = await user.getIdTokenResult()
      const tokenRole = token.claims.role || token.claims.userRole
      const stored = readStoredSession()
      const role = normalizeRole(tokenRole) || (stored?.uid === user.uid ? stored.role : stored?.role || null)
      setSession({ user, role, orgId: token.claims.orgId || stored?.orgId || null, userData: stored?.userData || null, loading: false })
    } catch {
      const stored = readStoredSession()
      if (stored && stored.isLoggedIn) {
        setSession({ user, role: stored.role, orgId: stored.orgId, userData: stored.userData, loading: false })
      } else {
        clearStoredSession()
        await signOut(auth)
        setSession({ user: null, role: null, orgId: null, userData: null, loading: false })
      }
    }
  }), [])

  async function login(identifier, password, selectedRole = null) {
    const nextSession = await loginUser(identifier, password, selectedRole)
    setSession({
      user: auth.currentUser || { uid: nextSession.uid, email: nextSession.email, displayName: nextSession.userData?.fullName },
      role: nextSession.role,
      orgId: nextSession.orgId,
      userData: nextSession.userData,
      loading: false,
    })
    return nextSession.role
  }

  async function logout() {
    if (session.orgId && session.user?.uid) {
      deleteFcmToken({
        orgId: session.orgId,
        role: session.role,
        userId: session.user.uid,
      }).catch(() => {})
    }
    await signOut(auth).catch(() => {})
    clearStoredSession()
    setSession({ user: null, role: null, orgId: null, userData: null, loading: false })
  }

  async function refreshUserProfile() {
    if (!session.user || !session.orgId) return session.userData
    const profile = await fetchCurrentUserProfile(session.orgId, session.user.uid)
    if (!profile) return session.userData
    setSession((current) => ({ ...current, userData: profile }))
    localStorage.setItem('constructa_session', JSON.stringify({ ...readStoredSession(), userData: profile }))
    return profile
  }

  return <AuthContext.Provider value={{ ...session, login, logout, refreshUserProfile }}>{children}</AuthContext.Provider>
}
