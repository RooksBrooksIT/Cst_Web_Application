import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Blueprints & Architectural Drawings Service
 * Scoped under: /organisation/{orgId}/layoutAndDrawings
 * Complies with Section 3.5 & Section 5.11 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const DRAWING_PURPOSES = [
  'Architectural',
  'Structural',
  'Plumbing & Sanitation',
  'Electrical & Conduiting',
  'HVAC & Ventilation',
  'Elevation & Façade',
  'Cross Section & Detailing',
  'Landscaping & External',
]

export async function fetchDrawings(orgId) {
  if (!orgId) return []
  return fetchWithFallback(orgId, 'layoutAndDrawings')
}

export function subscribeDrawings(orgId, onData, onError) {
  if (!orgId) return () => {}
  return subscribeWithFallback(orgId, 'layoutAndDrawings', onData, onError)
}

export async function uploadDrawingRecord(orgId, drawingData, uploaderActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!drawingData.docName?.trim()) throw new Error('Drawing Title is required')
  if (!drawingData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const docId = drawingData.docId || `DWG_${timestamp}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`

  const payload = {
    docId,
    docName: drawingData.docName.trim(),
    title: drawingData.docName.trim(),
    siteId: drawingData.siteId,
    siteName: drawingData.siteName || '',
    projectId: drawingData.projectId || drawingData.siteId,
    purpose: drawingData.purpose || 'Architectural',
    revisionNumber: drawingData.revisionNumber || 'Rev 1',
    fileName: drawingData.fileName || `${drawingData.docName.trim().replace(/\s+/g, '_')}.pdf`,
    fileUrl: drawingData.fileUrl || '',
    fileType: drawingData.fileType || 'pdf',
    fileSize: drawingData.fileSize || '3.5 MB',
    uploadDate: new Date().toLocaleDateString('en-IN'),
    isCloudUploaded: Boolean(drawingData.fileUrl),
    uploadedBy: uploaderActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'layoutAndDrawings', docId)
  await setDoc(docRef, payload)

  return { id: docId, ...payload }
}

export async function deleteDrawingRecord(orgId, docId) {
  if (!orgId || !docId) throw new Error('orgId and docId are required')
  const docRef = doc(db, 'organisation', orgId, 'layoutAndDrawings', docId)
  await deleteDoc(docRef)
}
