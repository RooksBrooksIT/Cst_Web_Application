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
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Tools, Machinery & Equipment Service
 * Scoped under: /organisation/{orgId}/tools and /organisation/{orgId}/toolMovements
 * Complies with Section 3 Group 5 & Section 5.9 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const TOOL_CATEGORIES = [
  'Heavy Machinery',
  'Concrete Equipment',
  'Power Tools',
  'Survey Instruments',
  'Safety & Scaffolding',
  'Lifting & Rigging',
  'Hand Tools',
]

// 1. Tools Master
export async function fetchTools(orgId) {
  return fetchWithFallback(orgId, 'tools')
}

export function subscribeTools(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'tools', onData, onError)
}

export async function createTool(orgId, toolData) {
  if (!orgId || !toolData.toolName?.trim()) throw new Error('Tool Name is required')

  const timestamp = Date.now()
  const toolId = toolData.toolId || `TOOL_${timestamp.toString().slice(-4)}`
  const cleanCode = toolData.toolName.trim().replace(/\s+/g, '_')
  const toolCode = toolData.toolCode || `${cleanCode}_(${toolData.toolOwner || 'Org'})`

  const payload = {
    toolId,
    toolName: toolData.toolName.trim(),
    name: toolData.toolName.trim(),
    toolCode,
    toolOwner: toolData.toolOwner || 'Org', // 'Org' | 'Rental'
    ownershipType: toolData.toolOwner || 'Org',
    toolCount: Number(toolData.toolCount || toolData.quantity) || 1,
    quantity: Number(toolData.toolCount || toolData.quantity) || 1,
    description: toolData.description || '',
    status: toolData.status || 'Available', // 'Available', 'Dispatched', 'Maintenance'
    currentStatus: toolData.status || 'Available',
    category: toolData.category || 'Power Tools',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'tools', toolId)
  await setDoc(docRef, payload)

  return { id: toolId, ...payload }
}

export async function updateTool(orgId, toolId, updates) {
  if (!orgId || !toolId) throw new Error('orgId and toolId are required')
  const docRef = doc(db, 'organisation', orgId, 'tools', toolId)
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteTool(orgId, toolId) {
  if (!orgId || !toolId) throw new Error('orgId and toolId are required')
  const docRef = doc(db, 'organisation', orgId, 'tools', toolId)
  await deleteDoc(docRef)
}

// 2. Tools Movement & Custody Handover (/organisation/{orgId}/toolMovements)
export async function fetchToolMovements(orgId) {
  return fetchWithFallback(orgId, 'toolMovements')
}

export function subscribeToolMovements(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'toolMovements', onData, onError)
}

export async function dispatchToolMovement(orgId, movementData, managerActor) {
  if (!orgId || !movementData.toolId || !movementData.siteId) throw new Error('toolId and siteId are required')

  const timestamp = Date.now()
  const movementId = `TMOV_${timestamp}`

  const payload = {
    movementId,
    toolId: movementData.toolId,
    toolName: movementData.toolName || '',
    toolCode: movementData.toolCode || '',
    siteId: movementData.siteId,
    siteName: movementData.siteName || '',
    supervisorId: movementData.supervisorId || '',
    supervisorName: movementData.supervisorName || 'Site Supervisor',
    dispatchedBy: managerActor?.name || 'Operations Manager',
    dispatchDate: movementData.dispatchDate ? new Date(movementData.dispatchDate) : serverTimestamp(),
    expectedReturnDate: movementData.expectedReturnDate ? new Date(movementData.expectedReturnDate) : null,
    returnDate: null,
    status: 'Dispatched',
    returnCondition: null, // 'Working' | 'Damaged' | 'Needs Service'
    notes: movementData.notes || 'Dispatched for site civil execution',
    createdAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'toolMovements', movementId)
  await setDoc(docRef, payload)

  // Update tool status
  await updateTool(orgId, movementData.toolId, {
    status: 'Dispatched',
    currentStatus: 'Dispatched',
    currentSiteId: movementData.siteId,
    currentSiteName: movementData.siteName,
  })

  return { id: movementId, ...payload }
}

export async function recordToolReturn(orgId, movementId, toolId, condition = 'Working', managerActor) {
  if (!orgId || !movementId) throw new Error('orgId and movementId are required')

  const moveRef = doc(db, 'organisation', orgId, 'toolMovements', movementId)
  await updateDoc(moveRef, {
    status: 'Returned',
    returnCondition: condition,
    receivedBy: managerActor?.name || 'Operations Manager',
    returnDate: serverTimestamp(),
  })

  if (toolId) {
    const nextToolStatus = condition === 'Working' ? 'Available' : 'Maintenance'
    await updateTool(orgId, toolId, {
      status: nextToolStatus,
      currentStatus: nextToolStatus,
      currentSiteId: null,
      currentSiteName: 'Central Yard',
    })
  }
}

export async function allocateTool(orgId, toolId, allocationData) {
  return dispatchToolMovement(orgId, {
    toolId,
    siteId: allocationData.toProjectId || allocationData.siteId,
    siteName: allocationData.toProjectName || allocationData.siteName,
    supervisorName: allocationData.assignedTo,
    notes: allocationData.notes,
  }, { name: allocationData.dispatchedBy })
}
