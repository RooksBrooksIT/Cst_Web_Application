import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { saveStandardDoc, updateStandardDoc, fetchWithFallback } from './firestoreService'
import { canCreateManager, canCreateSupervisor } from './subscriptionLimitService'

/**
 * Team & User Governance Service
 * Complies with Section 3.1 & 4.2.3 of Architecture Specification
 * All operations strictly scoped within /organisation/{orgId}/ hierarchy
 */

export async function fetchOrgUsers(orgId) {
  if (!orgId) return []
  try {
    // 1. Check /organisation/{orgId}/organizationUser
    const orgUserSnap = await getDocs(collection(db, 'organisation', orgId, 'organizationUser'))
    if (!orgUserSnap.empty) {
      return orgUserSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }

    // 2. Check /organisation/{orgId}/users
    const directSnap = await getDocs(collection(db, 'organisation', orgId, 'users'))
    if (!directSnap.empty) {
      return directSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }

    // 3. Check /organisation/{orgId}/config_users or configUsers
    const subColSnap = await fetchWithFallback(orgId, 'config_users')
    if (subColSnap.length > 0) return subColSnap
  } catch (e) {
    console.error('Error fetching org users:', e)
  }
  return []
}

export async function createInvitationCode(orgId, inviteData) {
  if (!orgId) throw new Error('orgId is required')

  // Prevent limit bypass through invitation codes (Section 2 of User-Limit Enforcement)
  const targetRole = String(inviteData.role || 'manager').toLowerCase()
  if (targetRole.includes('manager')) {
    const check = await canCreateManager({ orgId })
    if (!check.isAllowed) {
      const err = new Error(check.message || 'Manager user limit reached for organization subscription.')
      err.code = check.reason
      err.limitCheck = check
      err.details = check
      throw err
    }
  } else if (targetRole.includes('supervisor')) {
    const check = await canCreateSupervisor({ orgId })
    if (!check.isAllowed) {
      const err = new Error(check.message || 'Supervisor user limit reached for organization subscription.')
      err.code = check.reason
      err.limitCheck = check
      err.details = check
      throw err
    }
  }

  const code = inviteData.code || Math.random().toString(36).substring(2, 10).toUpperCase()
  const payload = {
    code,
    referralCode: code,
    orgReferralCode: code,
    organizationId: orgId,
    orgId,
    role: inviteData.role || 'manager', // manager, supervisor, customer
    assignedProjects: Array.isArray(inviteData.assignedProjects) ? inviteData.assignedProjects : [],
    email: inviteData.email || '',
    name: inviteData.name || '',
    phone: inviteData.phone || '',
    status: 'pending', // pending, accepted, expired
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  }

  // Write inside the organization's referralCodes and invitations subcollections
  const referralRef = doc(db, 'organisation', orgId, 'referralCodes', code)
  const inviteRef = doc(db, 'organisation', orgId, 'invitations', code)
  await Promise.allSettled([
    setDoc(referralRef, payload, { merge: true }),
    setDoc(inviteRef, payload, { merge: true }),
  ])

  return payload
}

export async function fetchInvitations(orgId) {
  if (!orgId) return []
  try {
    const inviteSnap = await getDocs(collection(db, 'organisation', orgId, 'invitations'))
    if (!inviteSnap.empty) {
      return inviteSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
    const referralSnap = await getDocs(collection(db, 'organisation', orgId, 'referralCodes'))
    return referralSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    return []
  }
}

export async function updateUserRoleAndProjects(orgId, uid, updates) {
  if (!orgId || !uid) return
  const payload = {
    ...updates,
    updatedAt: serverTimestamp(),
  }

  // Update in organizationUser or users or config_users under /organisation/{orgId}/
  const candidates = ['organizationUser', 'users', 'config_users', 'configUsers']
  let updated = false
  for (const col of candidates) {
    try {
      const docRef = doc(db, 'organisation', orgId, col, uid)
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        await updateDoc(docRef, payload)
        updated = true
        break
      }
    } catch (_e) {}
  }

  if (!updated) {
    // Default to organizationUser under orgId
    try {
      const defaultRef = doc(db, 'organisation', orgId, 'organizationUser', uid)
      await setDoc(defaultRef, payload, { merge: true })
    } catch (_err) {}
  }
}
