import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  orderBy,
  increment,
  onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Tools & Equipment Governance (Trackable Capital Assets & Rentals)
 * Scoped under: /organisation/{orgId}/...
 * Complies with MANAGER_MATERIALS_AND_TOOLS_COMPLETE_FLOW.txt
 */

export const TOOL_CATEGORIES = [
  'Heavy Machinery & Excavators',
  'Concrete Equipment & Mixers',
  'Power Tools & Drills',
  'Survey & Laser Instruments',
  'Safety, Ladders & Scaffolding',
  'Lifting, Hoists & Rigging',
  'Hand Tools & Accessories',
]

export function cleanKey(str) {
  return (str || '').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')
}

// ------------------------------------------------------------------------------------------------
// 1. SEQUENTIAL ID GENERATION & TOOL CODE ALGORITHM
// ------------------------------------------------------------------------------------------------

/**
 * Computes next sequential tool ID (TC001, TC002...)
 */
export async function getNextToolId(orgId) {
  if (!orgId) return 'TC001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'tools'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const tId = (data.toolId || d.id || '').toString()
      const match = tId.match(/^TC(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `TC${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error calculating next tool ID:', err)
    return 'TC001'
  }
}

/**
 * Generates canonical tool code: ${cleanName}_(${Owner})
 * Example: Concrete_Mixer_(Org)
 */
export function generateToolCode(toolName, toolOwner = 'Org') {
  const cleanName = (toolName || 'Tool').trim().replace(/\s+/g, '_')
  const ownerCode = toolOwner === 'Rental' ? 'Rental' : 'Org'
  return `${cleanName}_(${ownerCode})`
}

// ------------------------------------------------------------------------------------------------
// 2. MASTER TOOLS CATALOG & CENTRAL WAREHOUSE REGISTRATION
// ------------------------------------------------------------------------------------------------

export async function fetchTools(orgId) {
  return fetchWithFallback(orgId, 'tools')
}

export function subscribeTools(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'tools', onData, onError)
}

/**
 * Registers a new tool in the master catalog and initializes central warehouse stock
 * Writes:
 * 1. /organisation/{orgId}/tools/{toolId}_{toolCode}
 * 2. /organisation/{orgId}/toolsAtCompany/{toolCode}
 */
export async function registerMasterTool(orgId, data) {
  if (!orgId) throw new Error('Organization ID is required')
  const toolName = (data.toolName || data.name || '').trim()
  if (!toolName) throw new Error('Tool Name is required')

  const toolOwner = data.toolOwner || data.ownershipType || 'Org'
  const toolCode = data.toolCode || generateToolCode(toolName, toolOwner)
  const count = Number(data.toolCount || data.quantity) || 1

  const toolsCol = collection(db, 'organisation', orgId, 'tools')
  const dupSnap = await getDocs(query(toolsCol, where('toolCode', '==', toolCode)))
  if (!dupSnap.empty) {
    throw new Error(`Tool code "${toolCode}" is already registered in the master catalog.`)
  }

  const nextId = await getNextToolId(orgId)
  const canonicalDocId = `${nextId}_${toolCode}`

  const batch = writeBatch(db)

  // 1. Tool Master Record
  const toolRef = doc(toolsCol, canonicalDocId)
  const masterPayload = {
    toolId: nextId,
    toolCode,
    toolName,
    name: toolName,
    toolOwner,
    ownershipType: toolOwner,
    toolCount: count,
    quantity: count,
    availableCount: count,
    category: data.category || 'Power Tools & Drills',
    description: data.description || '',
    status: data.status || 'Available',
    currentStatus: data.status || 'Available',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  batch.set(toolRef, masterPayload)

  // 2. Central Depot Stock (/organisation/{orgId}/toolsAtCompany/{toolCode})
  const depotRef = doc(db, 'organisation', orgId, 'toolsAtCompany', toolCode)
  batch.set(depotRef, {
    toolCode,
    toolName,
    toolOwner,
    availableCount: increment(count),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 3. Central Multi-Site Inventory Registry (/organisation/{orgId}/toolsInventory/{toolCode})
  const invRef = doc(db, 'organisation', orgId, 'toolsInventory', toolCode)
  batch.set(invRef, {
    toolCode,
    toolName,
    availableCountAtSites: {},
    totalAtCompany: count,
    totalAtSites: 0,
    lastUpdated: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  await batch.commit()
  return { id: canonicalDocId, ...masterPayload }
}

// Alias for backwards compatibility
export const createTool = registerMasterTool

export async function updateMasterTool(orgId, toolId, updates) {
  if (!orgId || !toolId) throw new Error('orgId and toolId are required')
  const docRef = doc(db, 'organisation', orgId, 'tools', toolId)
  const payload = {
    ...updates,
    updatedAt: serverTimestamp(),
  }
  if (updates.toolName) payload.name = updates.toolName
  if (updates.toolCount !== undefined) payload.quantity = updates.toolCount
  await updateDoc(docRef, payload)
}

// Alias for backwards compatibility
export const updateTool = updateMasterTool

export async function deleteMasterTool(orgId, toolId, toolCode = '') {
  if (!orgId || !toolId) throw new Error('orgId and toolId are required')

  // Safety check: ensure not currently deployed on any site
  if (toolCode) {
    const siteToolsSnap = await getDocs(
      query(collection(db, 'organisation', orgId, 'toolsAtSite'), where('toolCode', '==', toolCode))
    )
    const isDeployed = siteToolsSnap.docs.some((d) => (Number(d.data().quantity ?? d.data().availableCount) || 0) > 0)
    if (isDeployed) {
      throw new Error(`Cannot delete "${toolCode}". It is currently deployed on active project sites.`)
    }
  }

  const docRef = doc(db, 'organisation', orgId, 'tools', toolId)
  await deleteDoc(docRef)
}

// Alias for backwards compatibility
export const deleteTool = deleteMasterTool

// ------------------------------------------------------------------------------------------------
// 3. CENTRAL WAREHOUSE & ON-SITE TELEMETRY
// ------------------------------------------------------------------------------------------------

export async function fetchToolsAtCompany(orgId) {
  return fetchWithFallback(orgId, 'toolsAtCompany')
}

export function subscribeToolsAtCompany(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'toolsAtCompany', onData, onError)
}

export async function fetchToolsInventory(orgId) {
  return fetchWithFallback(orgId, 'toolsInventory')
}

export function subscribeToolsInventory(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'toolsInventory', onData, onError)
}

export async function fetchToolsAtSite(orgId, siteId = null) {
  if (!orgId) return []
  const colRef = collection(db, 'organisation', orgId, 'toolsAtSite')
  if (siteId) {
    const q = query(colRef, where('siteId', '==', siteId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  const snap = await getDocs(colRef)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeToolsAtSite(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'toolsAtSite', onData, onError)
}

// ------------------------------------------------------------------------------------------------
// 4. TOOLS MOVEMENT & DISPATCH ENGINE
// ------------------------------------------------------------------------------------------------

export async function fetchToolMovements(orgId) {
  return fetchWithFallback(orgId, 'toolsMovement')
}

export function subscribeToolMovements(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'toolsMovement', onData, onError)
}

export async function fetchToolsReturns(orgId) {
  return fetchWithFallback(orgId, 'toolsReturn')
}

export function subscribeToolsReturns(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'toolsReturn', onData, onError)
}

/**
 * Mode 0: Central Warehouse (toolsAtCompany) -> Site (toolsAtSite)
 */
export async function dispatchToolToSite(orgId, payload) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.toolCode) throw new Error('Tool selection is required')
  if (!payload.toSiteId) throw new Error('Destination site is required')

  const batch = writeBatch(db)
  const count = Number(payload.quantity) || 1
  const cleanSite = cleanKey(payload.toSiteId)
  const siteToolDocId = `${cleanSite}_${payload.toolCode}`

  // 1. Deduct from Central Warehouse
  const depotRef = doc(db, 'organisation', orgId, 'toolsAtCompany', payload.toolCode)
  batch.set(depotRef, {
    availableCount: increment(-count),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 2. Add to Site Tools (writing both availableCount and quantity)
  const siteToolRef = doc(db, 'organisation', orgId, 'toolsAtSite', siteToolDocId)
  batch.set(siteToolRef, {
    siteId: payload.toSiteId,
    siteCode: payload.toSiteCode || '',
    siteName: payload.toSiteName || '',
    projectName: payload.projectName || payload.toSiteName || '',
    toolCode: payload.toolCode,
    toolName: payload.toolName || '',
    availableCount: increment(count),
    quantity: increment(count),
    supervisorId: payload.supervisorId || '',
    supervisorName: payload.supervisorName || 'Site Supervisor',
    deployedDate: payload.dispatchDate || new Date().toISOString().split('T')[0],
    expectedReturnDate: payload.expectedReturnDate || null,
    condition: 'Good',
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 3. Update Multi-Site Inventory Map in toolsInventory
  const invRef = doc(db, 'organisation', orgId, 'toolsInventory', payload.toolCode)
  batch.set(invRef, {
    toolCode: payload.toolCode,
    toolName: payload.toolName || '',
    [`availableCountAtSites.${payload.toSiteId}`]: increment(count),
    totalAtSites: increment(count),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 4. Movement Voucher Record in toolsMovement
  const movId = `MOV_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const movRef = doc(db, 'organisation', orgId, 'toolsMovement', movId)
  batch.set(movRef, {
    movementId: movId,
    tmId: movId,
    movementType: payload.movementType || 'CompanyToSite',
    from: payload.fromLocation || 'Central Depot',
    fromSite: payload.fromLocation || 'Central Depot',
    toSiteId: payload.toSiteId,
    toSite: payload.toSiteName || payload.toSiteId,
    toSiteName: payload.toSiteName || payload.toSiteId,
    siteId: payload.toSiteId,
    siteName: payload.toSiteName || payload.toSiteId,
    projectName: payload.projectName || payload.toSiteName || '',
    toolId: payload.toolId || '',
    toolCode: payload.toolCode,
    toolName: payload.toolName || '',
    quantity: count,
    tools: [
      {
        toolCode: payload.toolCode,
        toolName: payload.toolName || '',
        toolCount: count,
      },
    ],
    supervisorName: payload.supervisorName || 'Site Supervisor',
    dispatchedBy: payload.dispatchedBy || 'Operations Manager',
    driverName: payload.driverName || '',
    vehicleNumber: payload.vehicleNumber || '',
    date: new Date().toISOString().split('T')[0],
    dispatchDate: payload.dispatchDate ? new Date(payload.dispatchDate) : serverTimestamp(),
    expectedReturnDate: payload.expectedReturnDate ? new Date(payload.expectedReturnDate) : null,
    status: 'Dispatched',
    notes: payload.notes || 'Dispatched for site execution',
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  })

  // 5. Update master tool record status if applicable
  if (payload.toolMasterDocId) {
    const masterRef = doc(db, 'organisation', orgId, 'tools', payload.toolMasterDocId)
    batch.update(masterRef, {
      status: 'Dispatched',
      currentStatus: 'Dispatched',
      currentSiteId: payload.toSiteId,
      currentSiteName: payload.toSiteName,
      updatedAt: serverTimestamp(),
    })
  }

  await batch.commit()
  return { id: movId }
}

// Alias for backwards compatibility
export const dispatchToolMovement = dispatchToolToSite

/**
 * Mode 2: Site -> Central Warehouse Return
 */
export async function returnToolToCompany(orgId, payload) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.toolCode) throw new Error('Tool Code is required')
  if (!payload.fromSiteId) throw new Error('Source site is required')

  const batch = writeBatch(db)
  const count = Number(payload.quantity) || 1
  const cleanSite = cleanKey(payload.fromSiteId)
  const siteToolDocId = `${cleanSite}_${payload.toolCode}`
  const condition = payload.condition || 'Working'

  // 1. Deduct from Site Tools (both availableCount and quantity)
  const siteToolRef = doc(db, 'organisation', orgId, 'toolsAtSite', siteToolDocId)
  batch.set(siteToolRef, {
    availableCount: increment(-count),
    quantity: increment(-count),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 2. Decrement from toolsInventory site tracking
  const invRef = doc(db, 'organisation', orgId, 'toolsInventory', payload.toolCode)
  batch.set(invRef, {
    [`availableCountAtSites.${payload.fromSiteId}`]: increment(-count),
    totalAtSites: increment(-count),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 3. Increment Central Warehouse
  const depotRef = doc(db, 'organisation', orgId, 'toolsAtCompany', payload.toolCode)
  batch.set(depotRef, {
    availableCount: increment(count),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 4. Record Return in toolsReturn (Section 4.3.6)
  const retId = payload.returnDocId || `TR_${Date.now()}`
  const retRef = doc(db, 'organisation', orgId, 'toolsReturn', retId)
  batch.set(retRef, {
    trId: retId,
    returnId: retId,
    movementId: payload.movementId || '',
    siteId: payload.fromSiteId,
    siteName: payload.fromSiteName || payload.fromSiteId,
    toolCode: payload.toolCode,
    tools: [
      {
        toolCode: payload.toolCode,
        toolCount: count,
      },
    ],
    quantity: count,
    condition,
    status: 'Returned',
    returnDate: serverTimestamp(),
    receivedBy: payload.receivedBy || 'Operations Manager',
    supervisorName: payload.supervisorName || '',
    notes: payload.notes || '',
    createdAt: serverTimestamp(),
  })

  // 5. Update Movement Voucher Record
  if (payload.movementId) {
    const movRef = doc(db, 'organisation', orgId, 'toolsMovement', payload.movementId)
    batch.set(movRef, {
      status: 'Returned',
      returnCondition: condition,
      receivedBy: payload.receivedBy || 'Operations Manager',
      returnDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  // 6. Update master tool status if toolMasterDocId exists
  if (payload.toolMasterDocId) {
    const nextToolStatus = condition === 'Working' ? 'Available' : 'Maintenance'
    const masterRef = doc(db, 'organisation', orgId, 'tools', payload.toolMasterDocId)
    batch.update(masterRef, {
      status: nextToolStatus,
      currentStatus: nextToolStatus,
      currentSiteId: null,
      currentSiteName: 'Central Yard',
      updatedAt: serverTimestamp(),
    })
  }

  await batch.commit()
}

// Alias for backwards compatibility
export async function recordToolReturn(orgId, movementId, toolId, condition = 'Working', managerActor) {
  const movRef = doc(db, 'organisation', orgId, 'toolsMovement', movementId)
  const movSnap = await getDoc(movRef)
  const movData = movSnap.exists() ? movSnap.data() : {}

  return returnToolToCompany(orgId, {
    movementId,
    toolCode: movData.toolCode || '',
    fromSiteId: movData.toSiteId || '',
    toolMasterDocId: toolId,
    condition,
    receivedBy: managerActor?.name || 'Operations Manager',
  })
}

// ------------------------------------------------------------------------------------------------
// 5. SITE TOOLS REQUESTS & REQUISITIONS (/organisation/{orgId}/siteToolsRequest)
// ------------------------------------------------------------------------------------------------

export async function fetchToolRequests(orgId) {
  return fetchWithFallback(orgId, 'siteToolsRequest')
}

export function subscribeToolRequests(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'siteToolsRequest', onData, onError)
}

export async function createToolRequest(orgId, requestData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!requestData.toolName?.trim()) throw new Error('Tool Name is required')
  if (!requestData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const requestId = requestData.requestId || `REQ_TOOL_${timestamp}`

  const payload = {
    requestId,
    siteId: requestData.siteId,
    siteName: requestData.siteName || '',
    toolName: requestData.toolName.trim(),
    toolCode: requestData.toolCode || '',
    quantity: Number(requestData.quantity) || 1,
    startDate: requestData.startDate ? new Date(requestData.startDate) : serverTimestamp(),
    expectedDurationDays: Number(requestData.expectedDurationDays) || 7,
    supervisorId: actor?.id || requestData.supervisorId || 'sup_lead',
    supervisorName: actor?.name || requestData.supervisorName || 'Site Supervisor',
    urgency: requestData.urgency || 'Normal',
    purpose: requestData.purpose || '',
    status: requestData.status || 'pending_manager_review',
    assignedSerialId: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  await setDoc(docRef, payload)
  return { id: requestId, ...payload }
}

export async function approveToolRequest(orgId, requestId, assetSerialId, managerActor) {
  const docRef = doc(db, 'organisation', orgId, 'siteToolsRequest', requestId)
  await updateDoc(docRef, {
    status: 'approved',
    assignedSerialId: assetSerialId || 'YARD_ALLOC_01',
    managerApprovedBy: managerActor?.name || 'Operations Manager',
    managerApprovedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
