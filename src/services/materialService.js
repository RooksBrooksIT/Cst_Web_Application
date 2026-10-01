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
import { createNotification } from './notificationService.js'

/**
 * CST White Label - Materials Management System (Consumables & Bulk Raw Materials)
 * Scoped under: /organisation/{orgId}/...
 * Complies with MANAGER_MATERIALS_AND_TOOLS_COMPLETE_FLOW.txt
 */

export const MATERIAL_CATEGORIES = [
  'Cement',
  'Steel & Reinforcement',
  'Aggregates & Sand',
  'Bricks & Blocks',
  'Plumbing & Sanitation',
  'Electrical & Conduits',
  'Paints & Finishing',
  'Hardware & Fasteners',
  'Timber & Formwork',
  'Safety & PPE',
]

export const MATERIAL_UNITS = [
  'Bags',
  'Tons',
  'Kilograms',
  'Cubic Meters',
  'Square Feet',
  'Liters',
  'Numbers',
  'CFT',
  'Meters',
  'Pieces',
]

export function cleanKey(str) {
  return (str || '').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')
}

// ------------------------------------------------------------------------------------------------
// 1. SEQUENTIAL ID GENERATION & UNICITY
// ------------------------------------------------------------------------------------------------

/**
 * Computes next sequential material ID (MT001, MT002...)
 */
export async function getNextMaterialId(orgId) {
  if (!orgId) return 'MT001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'materials'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const mId = (data.materialId || d.id || '').toString()
      const match = mId.match(/^MT(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `MT${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error calculating next material ID:', err)
    return `MT001`
  }
}

/**
 * Computes next sequential material unit ID (UNT001, UNT002...)
 */
export async function getNextMaterialUnitId(orgId) {
  if (!orgId) return 'UNT001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'materialUnits'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const uId = (d.data().unitId || d.id || '').toString()
      const match = uId.match(/^UNT(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `UNT${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error calculating next unit ID:', err)
    return `UNT001`
  }
}

/**
 * Checks for duplicate material name within the organization (case-insensitive)
 */
export async function isDuplicateMaterialName(orgId, materialName, excludeId = null) {
  if (!orgId || !materialName?.trim()) return false
  const target = materialName.trim().toLowerCase()
  const snap = await getDocs(collection(db, 'organisation', orgId, 'materials'))
  return snap.docs.some((d) => {
    if (excludeId && (d.id === excludeId || d.data().materialId === excludeId)) return false
    const existing = (d.data().materialName || d.data().name || '').trim().toLowerCase()
    return existing === target
  })
}

// ------------------------------------------------------------------------------------------------
// 2. MASTER MATERIAL CATALOG (/organisation/{orgId}/materials)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterials(orgId) {
  return fetchWithFallback(orgId, 'materials')
}

export function subscribeMaterials(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materials', onData, onError)
}

/**
 * Registers a new material in the master catalog and initializes central warehouse stock
 */
export async function createMasterMaterial(orgId, data) {
  if (!orgId) throw new Error('Organization ID is required')
  const targetName = (data.materialName || data.name || '').trim()
  if (!targetName) throw new Error('Material name is required')

  const isDup = await isDuplicateMaterialName(orgId, targetName)
  if (isDup) {
    throw new Error(`Material "${targetName}" is already registered in the master catalog.`)
  }

  const materialId = await getNextMaterialId(orgId)
  const unitPrice = Number(data.unitPrice || data.materialPrice || data.standardRate) || 0.0
  const initialStock = Number(data.availableCount || data.currentTotalStock || data.currentStock || data.quantity) || 0.0
  const minReorder = Number(data.minReorderLevel) || 20

  const batch = writeBatch(db)

  // 1. Master Material Document
  const materialDocRef = doc(db, 'organisation', orgId, 'materials', materialId)
  const masterPayload = {
    materialId,
    materialName: targetName,
    name: targetName,
    materialCategory: data.materialCategory || data.category || 'General',
    category: data.materialCategory || data.category || 'General',
    categoryName: data.materialCategory || data.category || 'General',
    materialSubCategory: data.materialSubCategory || data.subCategory || '',
    subCategory: data.materialSubCategory || data.subCategory || '',
    materialUnit: data.materialUnit || data.unit || 'Bags',
    unit: data.materialUnit || data.unit || 'Bags',
    unitName: data.materialUnit || data.unit || 'Bags',
    unitPrice,
    materialPrice: String(unitPrice),
    standardRate: unitPrice,
    description: data.description || '',
    minReorderLevel: minReorder,
    currentTotalStock: initialStock,
    currentStock: initialStock,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  batch.set(materialDocRef, masterPayload)

  // 2. Central Warehouse Availability
  const cleanMat = cleanKey(targetName)
  const availDocRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
  batch.set(availDocRef, {
    materialName: targetName,
    availableCount: initialStock,
    unit: masterPayload.materialUnit,
    unitPrice,
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  await batch.commit()
  return { id: materialId, ...masterPayload }
}

// Alias for backwards compatibility
export const createMaterial = createMasterMaterial

/**
 * Updates an existing master material in-place
 */
export async function updateMasterMaterial(orgId, materialId, updates) {
  if (!orgId || !materialId) throw new Error('orgId and materialId are required')

  const docRef = doc(db, 'organisation', orgId, 'materials', materialId)
  const unitPrice = Number(updates.unitPrice ?? updates.materialPrice ?? updates.standardRate) || 0.0

  const updateData = {
    ...updates,
    unitPrice,
    materialPrice: String(unitPrice),
    standardRate: unitPrice,
    updatedAt: serverTimestamp(),
  }

  if (updates.materialName) {
    updateData.name = updates.materialName
  }

  await updateDoc(docRef, updateData)

  // Sync price/unit with materialsAvailability if name is known
  const matName = updates.materialName || updates.name
  if (matName) {
    const cleanMat = cleanKey(matName)
    const availRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
    await setDoc(availRef, {
      materialName: matName,
      unitPrice,
      unit: updates.materialUnit || updates.unit || 'Bags',
      lastUpdated: serverTimestamp(),
    }, { merge: true })
  }
}

// Alias for backwards compatibility
export const updateMaterial = updateMasterMaterial

/**
 * Deletes an unallocated material from the master catalog
 * Safeguard: Rejects if material exists with positive quantity in any siteMaterialPool
 */
export async function deleteMasterMaterial(orgId, materialId, materialName = '') {
  if (!orgId || !materialId) throw new Error('orgId and materialId are required')

  // Check if allocated in any siteMaterialPool
  if (materialName) {
    const poolSnap = await getDocs(
      query(collection(db, 'organisation', orgId, 'siteMaterialPool'), where('materialName', '==', materialName))
    )
    const hasActiveAllocation = poolSnap.docs.some((d) => (Number(d.data().currentBalance) || 0) > 0)
    if (hasActiveAllocation) {
      throw new Error(`Cannot delete "${materialName}". It has active stock allocated to project sites.`)
    }
  }

  const docRef = doc(db, 'organisation', orgId, 'materials', materialId)
  await deleteDoc(docRef)
}

// Alias for backwards compatibility
export const deleteMaterial = deleteMasterMaterial

// ------------------------------------------------------------------------------------------------
// 3. CATEGORIES, SUBCATEGORIES & UNITS MANAGEMENT
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialCategories(orgId) {
  return fetchWithFallback(orgId, 'materialCategories')
}

export async function createMaterialCategory(orgId, categoryName) {
  if (!orgId || !categoryName?.trim()) throw new Error('Category name is required')
  const catName = categoryName.trim()
  const docRef = doc(collection(db, 'organisation', orgId, 'materialCategories'))
  await setDoc(docRef, {
    matCategory: catName,
    categoryName: catName,
    createdAt: serverTimestamp(),
  })
  return { id: docRef.id, matCategory: catName }
}

export async function fetchMaterialSubCategories(orgId, categoryName = null) {
  const colRef = collection(db, 'organisation', orgId, 'materialSubCategories')
  if (categoryName) {
    const q = query(colRef, where('categoryName', '==', categoryName))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  const snap = await getDocs(colRef)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createMaterialSubCategory(orgId, subCategory, categoryName) {
  if (!orgId || !subCategory?.trim()) throw new Error('Sub-category is required')
  const docRef = doc(collection(db, 'organisation', orgId, 'materialSubCategories'))
  await setDoc(docRef, {
    subCategory: subCategory.trim(),
    categoryName: categoryName || 'General',
    createdAt: serverTimestamp(),
  })
  return { id: docRef.id, subCategory: subCategory.trim(), categoryName }
}

export async function fetchMaterialUnits(orgId) {
  return fetchWithFallback(orgId, 'materialUnits')
}

export async function createMaterialUnit(orgId, unitName, unitAbbreviation = '') {
  if (!orgId || !unitName?.trim()) throw new Error('Unit name is required')
  const unitId = await getNextMaterialUnitId(orgId)
  const docRef = doc(db, 'organisation', orgId, 'materialUnits', unitId)
  const payload = {
    unitId,
    unitName: unitName.trim(),
    unitAbbreviation: unitAbbreviation.trim() || unitName.trim().toLowerCase(),
    createdAt: serverTimestamp(),
  }
  await setDoc(docRef, payload)
  return { id: unitId, ...payload }
}

// ------------------------------------------------------------------------------------------------
// 4. CENTRAL WAREHOUSE STOCK & SITE POOL TELEMETRY
// ------------------------------------------------------------------------------------------------

/**
 * Fetches real-time available stock in Central Warehouse (/organisation/{orgId}/materialsAvailability)
 */
export async function fetchMaterialsAvailability(orgId) {
  return fetchWithFallback(orgId, 'materialsAvailability')
}

export function subscribeMaterialsAvailability(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materialsAvailability', onData, onError)
}

/**
 * Fetches active on-site material pool allocations (/organisation/{orgId}/siteMaterialPool)
 */
export async function fetchSiteMaterialPool(orgId, siteId = null) {
  if (!orgId) return []
  const colRef = collection(db, 'organisation', orgId, 'siteMaterialPool')
  if (siteId) {
    const q = query(colRef, where('siteId', '==', siteId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  const snap = await getDocs(colRef)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeAllSiteMaterialPools(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'siteMaterialPool', onData, onError)
}

// ------------------------------------------------------------------------------------------------
// 5. MATERIAL MOVEMENTS & DISPATCH ENGINE (Multi-Mode Operations)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialTransactions(orgId) {
  return fetchWithFallback(orgId, 'materialTransactions')
}

export function subscribeMaterialTransactions(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materialTransactions', onData, onError)
}

// Alias for backwards compatibility
export const fetchMaterialMovements = fetchMaterialTransactions
export const subscribeMaterialMovements = subscribeMaterialTransactions

/**
 * Mode 0: Company Warehouse -> Site Dispatch
 * Wrapped inside an atomic WriteBatch:
 * 1. Decrements /materialsAvailability/{cleanMatName}
 * 2. Increments /siteMaterialPool/{siteId}_{cleanMatName}
 * 3. Creates immutable /materialTransactions/{TXN_MAT_{timestamp}}
 */
// ------------------------------------------------------------------------------------------------
// 4B. MATERIAL ALLOCATIONS (Direct Flow 2: Manager -> Site Allocation)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialAllocations(orgId, siteId = null) {
  if (!orgId) return []
  const colRef = collection(db, 'organisation', orgId, 'materialAllocations')
  if (siteId) {
    const q = query(colRef, where('siteId', '==', siteId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  const snap = await getDocs(colRef)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function subscribeMaterialAllocations(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materialAllocations', onData, onError)
}

/**
 * Flow 2: Manager Direct Material Allocation to Site
 * Source: MANAGER_MATERIALS_AND_TOOLS_ARCHITECTURE_AND_FLOW.txt Section 2.3 & 5.2
 */
export async function allocateMaterialToSite(orgId, payload, managerActor) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.siteId) throw new Error('Destination site is required')
  if (!payload.materialName?.trim()) throw new Error('Material selection is required')
  const qty = Number(payload.quantity) || 0
  if (qty <= 0) throw new Error('Allocation quantity must be greater than zero')

  const unitRate = Number(payload.unitRate ?? payload.unitPrice) || 0
  const totalAmount = Number(payload.amount ?? (qty * unitRate)) || 0
  const cleanMatName = cleanKey(payload.materialName)
  const cleanSiteId = cleanKey(payload.siteId)
  const timestamp = Date.now()

  const allocationId = payload.allocationId || `ALLOC_${timestamp}_${Math.random().toString(36).substring(2, 6)}`
  const txnId = `TXN_MAT_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  const batch = writeBatch(db)

  // 1. Immutable record in materialAllocations
  const allocRef = doc(db, 'organisation', orgId, 'materialAllocations', allocationId)
  batch.set(allocRef, {
    allocationId,
    siteId: payload.siteId,
    siteCode: payload.siteCode || '',
    siteName: payload.siteName || '',
    projectName: payload.projectName || payload.siteName || '',
    materialId: payload.materialId || '',
    materialName: payload.materialName.trim(),
    quantity: qty,
    unit: payload.unit || 'Bags',
    unitRate,
    unitPrice: unitRate,
    amount: totalAmount,
    totalValuation: totalAmount,
    allocatedBy: managerActor?.name || 'Operations Manager',
    managerId: managerActor?.id || 'mgr_lead',
    managerName: managerActor?.name || 'Operations Manager',
    allocationDate: payload.allocationDate ? new Date(payload.allocationDate) : serverTimestamp(),
    remarks: payload.remarks || 'Direct site material allocation from manager',
    createdAt: serverTimestamp(),
  })

  // 2. Increment site material pool (dual write availableCount and currentBalance, totalAllocated and totalValuation)
  const poolDocId = `${cleanSiteId}_${cleanMatName}`
  const poolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', poolDocId)
  batch.set(poolRef, {
    siteId: payload.siteId,
    siteCode: payload.siteCode || '',
    siteName: payload.siteName || '',
    projectName: payload.projectName || payload.siteName || '',
    materialName: payload.materialName.trim(),
    totalAllocated: increment(qty),
    availableCount: increment(qty),
    currentBalance: increment(qty),
    unit: payload.unit || 'Bags',
    unitPrice: unitRate,
    totalValuation: increment(totalAmount),
    totalAllocatedValue: increment(totalAmount),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 3. Decrement Central Warehouse Stock
  if (payload.deductFromWarehouse !== false) {
    const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMatName)
    batch.set(warehouseRef, {
      materialName: payload.materialName.trim(),
      availableCount: increment(-qty),
      companyAvailableCount: increment(-qty),
      unit: payload.unit || 'Bags',
      lastUpdated: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  // 4. Immutable Audit Transaction in materialTransactions
  const txnRef = doc(db, 'organisation', orgId, 'materialTransactions', txnId)
  batch.set(txnRef, {
    transactionId: txnId,
    movementId: txnId,
    allocationId,
    gatePassNumber: payload.challanNumber || `GP-${timestamp.toString().slice(-6)}`,
    transferType: 'COMPANY_TO_SITE',
    transactionType: 'CompanyToSite',
    from: 'Company Warehouse',
    fromSite: 'Company Warehouse',
    to: payload.siteName || payload.siteId,
    toSiteId: payload.siteId,
    toSite: payload.siteName || payload.siteId,
    toSiteName: payload.siteName || payload.siteId,
    siteId: payload.siteId,
    siteName: payload.siteName || '',
    projectName: payload.projectName || payload.siteName || '',
    materialId: payload.materialId || '',
    materialName: payload.materialName.trim(),
    quantity: qty,
    unit: payload.unit || 'Bags',
    unitPrice: unitRate,
    unitRate,
    totalValue: totalAmount,
    amount: totalAmount,
    managerName: managerActor?.name || 'Operations Manager',
    dispatchedBy: managerActor?.name || 'Operations Manager',
    supervisorName: payload.supervisorName || '',
    vehicleNumber: payload.vehicleNumber || '',
    receivedStatus: 'Received',
    date: new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  })

  await batch.commit()

  // 5. Trigger notification
  try {
    await createNotification({
      orgId,
      type: 'materialAllocation',
      title: '📦 New Material Allocated to Site',
      message: `${qty} ${payload.unit || 'Units'} of ${payload.materialName} allocated to ${payload.siteName || payload.siteId}.`,
      siteId: payload.siteId,
      siteName: payload.siteName || '',
      senderRole: 'Manager',
      senderName: managerActor?.name || 'Operations Manager',
      actionRoute: '/manager/materials-stock',
    })
  } catch (notifErr) {
    console.warn('Material allocation notification warning:', notifErr)
  }

  return { allocationId, txnId }
}

/**
 * Mode 0: Company Warehouse -> Site Dispatch
 * Wrapped inside an atomic WriteBatch:
 * 1. Decrements /materialsAvailability/{cleanMatName}
 * 2. Increments /siteMaterialPool/{siteId}_{cleanMatName}
 * 3. Creates immutable /materialTransactions/{TXN_MAT_{timestamp}}
 */
export async function dispatchMaterialsToSite(orgId, payload) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.toSiteId) throw new Error('Destination site is required')
  if (!payload.items || payload.items.length === 0) throw new Error('At least one material must be selected')

  const batch = writeBatch(db)
  const cleanSiteId = cleanKey(payload.toSiteId)
  const timestamp = Date.now()

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i]
    const cleanMatName = cleanKey(item.materialName)
    const qty = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0.0

    if (qty <= 0) continue

    // 1. Decrement Central Warehouse Stock (both availableCount and companyAvailableCount)
    const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMatName)
    batch.set(warehouseRef, {
      materialName: item.materialName,
      availableCount: increment(-qty),
      companyAvailableCount: increment(-qty),
      unit: item.unit || 'Bags',
      lastUpdated: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })

    // 2. Increment Site Material Pool (both availableCount and currentBalance, totalAllocated and totalValuation)
    const poolDocId = `${cleanSiteId}_${cleanMatName}`
    const poolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', poolDocId)
    batch.set(poolRef, {
      siteId: payload.toSiteId,
      siteCode: payload.toSiteCode || '',
      siteName: payload.toSiteName || '',
      projectName: payload.projectName || payload.toSiteName || '',
      materialName: item.materialName,
      totalAllocated: increment(qty),
      availableCount: increment(qty),
      currentBalance: increment(qty),
      unit: item.unit || 'Bags',
      unitPrice,
      totalValuation: increment(qty * unitPrice),
      totalAllocatedValue: increment(qty * unitPrice),
      updatedAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    }, { merge: true })

    // 3. Create Immutable Transaction Record
    const txnId = `TXN_MAT_${timestamp}_${i}_${Math.random().toString(36).substring(2, 6)}`
    const txnRef = doc(db, 'organisation', orgId, 'materialTransactions', txnId)
    batch.set(txnRef, {
      transactionId: txnId,
      movementId: txnId,
      gatePassNumber: payload.challanNumber || `GP-${timestamp.toString().slice(-6)}`,
      transferType: 'COMPANY_TO_SITE',
      transactionType: 'CompanyToSite',
      from: 'Central Warehouse',
      fromSite: 'Central Warehouse',
      toSiteId: payload.toSiteId,
      toSite: payload.toSiteName || payload.toSiteId,
      toSiteName: payload.toSiteName || payload.toSiteId,
      siteId: payload.toSiteId,
      siteName: payload.toSiteName || payload.toSiteId,
      projectName: payload.projectName || payload.toSiteName || '',
      materialId: item.materialId || '',
      materialName: item.materialName,
      quantity: qty,
      unit: item.unit || 'Bags',
      unitPrice,
      totalValue: qty * unitPrice,
      managerName: payload.managerName || 'Operations Manager',
      dispatchedBy: payload.managerName || 'Operations Manager',
      supervisorName: payload.supervisorName || 'Site Supervisor',
      vehicleNumber: payload.vehicleNumber || '',
      transporterName: payload.transporterName || '',
      driverPhone: payload.driverPhone || '',
      challanNumber: payload.challanNumber || '',
      receivedStatus: 'In Transit',
      date: new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp(),
      timestamp: serverTimestamp(),
    })
  }

  await batch.commit()
}

/**
 * Mode 1: Site -> Site Inter-Site Transfer
 */
export async function transferMaterialSiteToSite(orgId, payload) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.fromSiteId || !payload.toSiteId) throw new Error('Source and Destination sites are required')

  const batch = writeBatch(db)
  const cleanFrom = cleanKey(payload.fromSiteId)
  const cleanTo = cleanKey(payload.toSiteId)
  const cleanMat = cleanKey(payload.materialName)
  const qty = Number(payload.quantity) || 0
  const unitPrice = Number(payload.unitPrice) || 0.0

  // 1. Decrement From Site Pool (both availableCount and currentBalance)
  const fromPoolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', `${cleanFrom}_${cleanMat}`)
  batch.set(fromPoolRef, {
    availableCount: increment(-qty),
    currentBalance: increment(-qty),
    totalValuation: increment(-(qty * unitPrice)),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 2. Increment To Site Pool (both availableCount and currentBalance)
  const toPoolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', `${cleanTo}_${cleanMat}`)
  batch.set(toPoolRef, {
    siteId: payload.toSiteId,
    siteCode: payload.toSiteCode || '',
    siteName: payload.toSiteName || '',
    projectName: payload.projectName || payload.toSiteName || '',
    materialName: payload.materialName,
    totalAllocated: increment(qty),
    availableCount: increment(qty),
    currentBalance: increment(qty),
    unit: payload.unit || 'Bags',
    unitPrice,
    totalValuation: increment(qty * unitPrice),
    totalAllocatedValue: increment(qty * unitPrice),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 3. Transaction Log
  const txnId = `TXN_MAT_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const txnRef = doc(db, 'organisation', orgId, 'materialTransactions', txnId)
  batch.set(txnRef, {
    transactionId: txnId,
    movementId: txnId,
    gatePassNumber: payload.challanNumber || `GP-${Date.now().toString().slice(-6)}`,
    transferType: 'SITE_TO_SITE',
    transactionType: 'SiteToSite',
    from: payload.fromSiteName || payload.fromSiteId,
    fromSite: payload.fromSiteName || payload.fromSiteId,
    fromSiteId: payload.fromSiteId,
    toSiteId: payload.toSiteId,
    toSite: payload.toSiteName || payload.toSiteId,
    toSiteName: payload.toSiteName || payload.toSiteId,
    siteId: payload.toSiteId,
    siteName: payload.toSiteName || payload.toSiteId,
    materialName: payload.materialName,
    quantity: qty,
    unit: payload.unit || 'Bags',
    unitPrice,
    totalValue: qty * unitPrice,
    managerName: payload.managerName || 'Operations Manager',
    dispatchedBy: payload.managerName || 'Operations Manager',
    supervisorName: payload.supervisorName || '',
    vehicleNumber: payload.vehicleNumber || '',
    receivedStatus: 'In Transit',
    date: new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  })

  await batch.commit()
}

/**
 * Mode 2: Site -> Company Warehouse Return
 */
export async function returnMaterialSiteToCompany(orgId, payload) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.fromSiteId) throw new Error('Source site is required')

  const batch = writeBatch(db)
  const cleanFrom = cleanKey(payload.fromSiteId)
  const cleanMat = cleanKey(payload.materialName)
  const qty = Number(payload.quantity) || 0
  const unitPrice = Number(payload.unitPrice) || 0.0

  // 1. Decrement From Site Pool
  const fromPoolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', `${cleanFrom}_${cleanMat}`)
  batch.set(fromPoolRef, {
    availableCount: increment(-qty),
    currentBalance: increment(-qty),
    totalValuation: increment(-(qty * unitPrice)),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 2. Increment Central Warehouse Availability (both availableCount and companyAvailableCount)
  const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
  batch.set(warehouseRef, {
    materialName: payload.materialName,
    availableCount: increment(qty),
    companyAvailableCount: increment(qty),
    unit: payload.unit || 'Bags',
    lastUpdated: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  // 3. Transaction Log
  const txnId = `TXN_MAT_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const txnRef = doc(db, 'organisation', orgId, 'materialTransactions', txnId)
  batch.set(txnRef, {
    transactionId: txnId,
    movementId: txnId,
    gatePassNumber: payload.challanNumber || `GP-${Date.now().toString().slice(-6)}`,
    transferType: 'SITE_TO_COMPANY',
    transactionType: 'SiteToCompany',
    from: payload.fromSiteName || payload.fromSiteId,
    fromSite: payload.fromSiteName || payload.fromSiteId,
    fromSiteId: payload.fromSiteId,
    toSiteId: 'Central Warehouse',
    toSite: 'Central Warehouse',
    toSiteName: 'Central Warehouse',
    siteId: payload.fromSiteId,
    siteName: payload.fromSiteName || payload.fromSiteId,
    materialName: payload.materialName,
    quantity: qty,
    unit: payload.unit || 'Bags',
    unitPrice,
    totalValue: qty * unitPrice,
    managerName: payload.managerName || 'Operations Manager',
    dispatchedBy: payload.managerName || 'Operations Manager',
    supervisorName: payload.supervisorName || '',
    vehicleNumber: payload.vehicleNumber || '',
    receivedStatus: 'Received',
    date: new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  })

  await batch.commit()
}

/**
 * Backwards-compatible createMaterialMovement helper
 */
export async function createMaterialMovement(orgId, movementData, managerActor) {
  return dispatchMaterialsToSite(orgId, {
    toSiteId: movementData.toSiteId || movementData.toSite,
    toSiteName: movementData.toSite || movementData.toSiteName,
    projectName: movementData.toSite || '',
    managerName: managerActor?.name || 'Operations Manager',
    supervisorName: movementData.supervisorName || '',
    vehicleNumber: movementData.vehicleNumber || '',
    transporterName: movementData.transporterName || '',
    driverPhone: movementData.driverPhone || '',
    challanNumber: movementData.gatePassNumber || '',
    items: [
      {
        materialId: movementData.materialId,
        materialName: movementData.materialName,
        quantity: movementData.quantity,
        unit: movementData.unit,
        unitPrice: movementData.unitPrice || 0,
      },
    ],
  })
}

export async function confirmMaterialMovementReceipt(orgId, movementId, receiverActor) {
  if (!orgId || !movementId) throw new Error('orgId and movementId required')
  const docRef = doc(db, 'organisation', orgId, 'materialTransactions', movementId)
  await updateDoc(docRef, {
    receivedStatus: 'Received',
    receivedBy: receiverActor?.name || 'Site Supervisor',
    receivedDate: serverTimestamp(),
  })
}

// ------------------------------------------------------------------------------------------------
// 6. SITE MATERIAL REQUESTS & REQUISITIONS (/organisation/{orgId}/siteMaterialsRequest)
// ------------------------------------------------------------------------------------------------

export async function fetchMaterialRequests(orgId) {
  return fetchWithFallback(orgId, 'siteMaterialsRequest')
}

export function subscribeMaterialRequests(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'siteMaterialsRequest', onData, onError)
}

export async function createMaterialRequest(orgId, requestData, actor) {
  if (!orgId) throw new Error('orgId is required')
  if (!requestData.materialName?.trim()) throw new Error('Material name is required')
  if (!requestData.siteId) throw new Error('Site selection is required')

  const timestamp = Date.now()
  const requestId = requestData.requestId || `REQ_MAT_${timestamp}`

  const payload = {
    requestId,
    siteId: requestData.siteId,
    siteName: requestData.siteName || '',
    materialId: requestData.materialId || '',
    materialName: requestData.materialName.trim(),
    category: requestData.category || 'General',
    requestedQty: Number(requestData.requestedQty || requestData.quantity) || 1,
    approvedQty: Number(requestData.approvedQty) || 0,
    unit: requestData.unit || 'Bags',
    urgency: requestData.urgency || 'Normal',
    neededByDate: requestData.neededByDate ? new Date(requestData.neededByDate) : null,
    preferredVendor: requestData.preferredVendor || '',
    estimatedCost: Number(requestData.estimatedCost) || 0,
    supervisorId: actor?.id || requestData.supervisorId || 'sup_lead',
    supervisorName: actor?.name || requestData.supervisorName || 'Site Supervisor',
    remarks: requestData.remarks || '',
    status: requestData.status || 'pending_manager_review',
    managerRemarks: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await setDoc(docRef, payload)
  return { id: requestId, ...payload }
}

export async function approveMaterialRequest(orgId, requestId, managerData, poNumber, supplierName) {
  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await updateDoc(docRef, {
    status: 'approved',
    poNumber: poNumber || `PO-${Date.now().toString().slice(-5)}`,
    preferredVendor: supplierName || 'Approved Vendor',
    managerReviewedBy: managerData?.name || 'Operations Manager',
    managerReviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function recordGrnReceipt(orgId, requestId, grnData) {
  const docRef = doc(db, 'organisation', orgId, 'siteMaterialsRequest', requestId)
  await updateDoc(docRef, {
    status: 'received',
    grnNumber: grnData.challanNo || `GRN-${Date.now()}`,
    receivedDate: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

