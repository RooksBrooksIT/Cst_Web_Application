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

/**
 * Team & User Governance Service
 * Complies with Section 3.1 & 4.2.3 of Architecture Specification
 */

export async function fetchOrgUsers(orgId) {
  if (!orgId) return []
  try {
    // 1. Check root /users collection filtered by organizationId
    const q = query(collection(db, 'users'), where('organizationId', '==', orgId))
    const snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }

    // 2. Check /organisation/{orgId}/config_users or users subcollections
    const subColSnap = await fetchWithFallback(orgId, 'config_users')
    if (subColSnap.length > 0) return subColSnap

    const directSnap = await getDocs(collection(db, 'organisation', orgId, 'users'))
    if (!directSnap.empty) {
      return directSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
  } catch (e) {
    console.error('Error fetching org users:', e)
  }
  return []
}

export async function createInvitationCode(orgId, inviteData) {
  const code = inviteData.code || Math.random().toString(36).substring(2, 10).toUpperCase()
  const payload = {
    code,
    organizationId: orgId,
    role: inviteData.role || 'manager', // manager, supervisor, customer
    assignedProjects: Array.isArray(inviteData.assignedProjects) ? inviteData.assignedProjects : [],
    email: inviteData.email || '',
    name: inviteData.name || '',
    phone: inviteData.phone || '',
    status: 'pending', // pending, accepted, expired
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  }

  // Write to root /invitations/{code}
  await setDoc(doc(db, 'invitations', code), payload)
  return payload
}

export async function fetchInvitations(orgId) {
  if (!orgId) return []
  try {
    const q = query(collection(db, 'invitations'), where('organizationId', '==', orgId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    return []
  }
}

export async function updateUserRoleAndProjects(orgId, uid, updates) {
  try {
    // Update root /users/{uid}
    const userDocRef = doc(db, 'users', uid)
    await updateDoc(userDocRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    // Also try updating in subcollection if exists
    try {
      await updateStandardDoc(orgId, 'config_users', uid, updates)
    } catch (err) {}
  }
}
