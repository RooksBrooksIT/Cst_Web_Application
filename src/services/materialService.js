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
// 1. SEQUENTIAL ID GENERATION & UNICITY (MCxxx, MSCxxx, MUxxx, MTxxx)
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
 * Computes next sequential material category ID (MC001, MC002...)
 */
export async function getNextMaterialCategoryId(orgId) {
  if (!orgId) return 'MC001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'materialCategories'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const cId = (data.categoryId || d.id || '').toString()
      const match = cId.match(/^MC(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `MC${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error calculating next material category ID:', err)
    return `MC001`
  }
}

/**
 * Computes next sequential material subcategory ID (MSC001, MSC002...)
 */
export async function getNextMaterialSubCategoryId(orgId) {
  if (!orgId) return 'MSC001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'materialSubCategories'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const scId = (data.subCategoryId || d.id || '').toString()
      const match = scId.match(/^MSC(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `MSC${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error calculating next material subcategory ID:', err)
    return `MSC001`
  }
}

/**
 * Computes next sequential material unit ID (MU001, MU002...)
 */
export async function getNextMaterialUnitId(orgId) {
  if (!orgId) return 'MU001'
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'materialUnits'))
    let maxNum = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      const uId = (data.unitId || d.id || '').toString()
      const match = uId.match(/^(?:MU|UNT)(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `MU${String(maxNum + 1).padStart(3, '0')}`
  } catch (err) {
    console.error('Error calculating next unit ID:', err)
    return `MU001`
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
  const mats = await fetchWithFallback(orgId, 'materials')
  return mats.map((d) => ({
    id: d.id,
    materialId: d.materialId || d.id,
    materialName: d.materialName || d.name || '',
    materialCategory: d.materialCategory || d.categoryName || d.category || '',
    materialSubCategory: d.materialSubCategory || d.subCategory || '',
    materialUnit: d.materialUnit || d.matUnit || d.unitName || d.unit || 'Bags',
    unitPrice: Number(d.unitPrice ?? d.materialPrice ?? d.standardRate) || 0,
    materialPrice: String(d.materialPrice ?? d.unitPrice ?? '0'),
    standardRate: Number(d.standardRate ?? d.unitPrice) || 0,
    minReorderLevel: Number(d.minReorderLevel) || 20,
    availableCount: Number(d.availableCount ?? d.count ?? d.currentTotalStock ?? d.currentStock) || 0,
    description: d.description || '',
    createdAt: d.createdAt || d.created_at,
    updatedAt: d.updatedAt || d.updated_at,
    ...d,
  }))
}

export function subscribeMaterials(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'materials', (rawList) => {
    const normalized = (rawList || []).map((d) => ({
      id: d.id,
      materialId: d.materialId || d.id,
      materialName: d.materialName || d.name || '',
      materialCategory: d.materialCategory || d.categoryName || d.category || '',
      materialSubCategory: d.materialSubCategory || d.subCategory || '',
      materialUnit: d.materialUnit || d.matUnit || d.unitName || d.unit || 'Bags',
      unitPrice: Number(d.unitPrice ?? d.materialPrice ?? d.standardRate) || 0,
      materialPrice: String(d.materialPrice ?? d.unitPrice ?? '0'),
      standardRate: Number(d.standardRate ?? d.unitPrice) || 0,
      minReorderLevel: Number(d.minReorderLevel) || 20,
      availableCount: Number(d.availableCount ?? d.count ?? d.currentTotalStock ?? d.currentStock) || 0,
      description: d.description || '',
      createdAt: d.createdAt || d.created_at,
      updatedAt: d.updatedAt || d.updated_at,
      ...d,
    }))
    onData(normalized)
  }, onError)
}

/**
 * Registers a new material in the master catalog and initializes central warehouse stock
 * Synthesized name formula: {CategoryName}_{SubCategoryName}
 */
export async function createMasterMaterial(orgId, data) {
  if (!orgId) throw new Error('Organization ID is required')
  
  const categoryName = (data.materialCategory || data.category || '').trim()
  const subCategoryName = (data.materialSubCategory || data.subCategory || '').trim()
  
  // Auto-synthesized material name matching mobile app format
  let targetName = (data.materialName || data.name || '').trim()
  if (!targetName && categoryName && subCategoryName) {
    targetName = `${categoryName}_${subCategoryName}`
  }
  if (!targetName) {
    throw new Error('Material name or Category + Subcategory is required')
  }

  const isDup = await isDuplicateMaterialName(orgId, targetName)
  if (isDup) {
    throw new Error(`Material "${targetName}" is already registered in the master catalog.`)
  }

  const materialId = data.materialId || (await getNextMaterialId(orgId))
  const unitPrice = Number(data.unitPrice ?? data.materialPrice ?? data.standardRate) || 0.0
  const initialStock = Number(data.availableCount ?? data.currentTotalStock ?? data.currentStock ?? data.quantity) || 0.0
  const minReorder = Number(data.minReorderLevel) || 20

  // Resolve Category DocumentReference
  let categoryRef = data.materialCategoryRef || null
  if (!categoryRef && data.categoryId) {
    categoryRef = doc(db, 'organisation', orgId, 'materialCategories', data.categoryId)
  }
  if (!categoryRef && categoryName) {
    const cats = await fetchMaterialCategories(orgId)
    const matchedCat = cats.find((c) => (c.matCategory || c.categoryName || '').toLowerCase() === categoryName.toLowerCase())
    if (matchedCat) {
      categoryRef = doc(db, 'organisation', orgId, 'materialCategories', matchedCat.id || matchedCat.categoryId)
    }
  }

  // Resolve Subcategory DocumentReference
  let subCategoryRef = data.materialSubCategoryRef || null
  if (!subCategoryRef && data.subCategoryId) {
    subCategoryRef = doc(db, 'organisation', orgId, 'materialSubCategories', data.subCategoryId)
  }
  if (!subCategoryRef && subCategoryName) {
    const subCats = await fetchMaterialSubCategories(orgId)
    const matchedSub = subCats.find((s) => (s.matSubCategory || s.subCategory || '').toLowerCase() === subCategoryName.toLowerCase())
    if (matchedSub) {
      subCategoryRef = doc(db, 'organisation', orgId, 'materialSubCategories', matchedSub.id || matchedSub.subCategoryId)
    }
  }

  // Resolve Unit DocumentReference
  let unitRef = data.materialUnitRef || null
  if (!unitRef && data.unitId) {
    unitRef = doc(db, 'organisation', orgId, 'materialUnits', data.unitId)
  }
  if (!unitRef && (data.materialUnit || data.unit)) {
    const targetUnit = (data.materialUnit || data.unit).trim().toLowerCase()
    const units = await fetchMaterialUnits(orgId)
    const matchedUnit = units.find((u) => (u.matUnit || u.unitName || '').toLowerCase() === targetUnit)
    if (matchedUnit) {
      unitRef = doc(db, 'organisation', orgId, 'materialUnits', matchedUnit.id || matchedUnit.unitId)
    }
  }

  const batch = writeBatch(db)

  // 1. Primary Master Material Document (/organisation/{orgId}/materials/{materialId})
  const materialDocRef = doc(db, 'organisation', orgId, 'materials', materialId)
  const masterPayload = {
    materialId,
    materialCategory: categoryName || 'General',
    materialCategoryRef: categoryRef,
    materialSubCategory: subCategoryName || '',
    materialSubCategoryRef: subCategoryRef,
    materialName: targetName,
    materialUnit: data.materialUnit || data.unit || 'Bags',
    materialUnitRef: unitRef,
    materialPrice: String(unitPrice),
    unitPrice,
    description: data.description || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    // Extra aliases for backwards compatibility
    name: targetName,
    category: categoryName || 'General',
    categoryName: categoryName || 'General',
    subCategory: subCategoryName || '',
    unit: data.materialUnit || data.unit || 'Bags',
    unitName: data.materialUnit || data.unit || 'Bags',
    standardRate: unitPrice,
    minReorderLevel: minReorder,
    availableCount: initialStock,
    count: initialStock,
    currentTotalStock: initialStock,
    currentStock: initialStock,
  }
  batch.set(materialDocRef, masterPayload)

  // 2. Central Warehouse Availability & Material Transfer Mirrors (/organisation/{orgId}/materialsAvailability/{cleanKey} & materialTransfer/{cleanKey})
  const cleanMat = cleanKey(targetName)
  const availDocRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
  const transferDocRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMat)
  const availPayload = {
    materialId,
    materialName: targetName,
    displayName: targetName,
    category: categoryName || 'General',
    subCategory: subCategoryName || '',
    availableCount: initialStock,
    companyAvailableCount: initialStock,
    count: initialStock,
    totalAvailableCount: initialStock,
    totalSiteCount: 0,
    siteInventories: [],
    unit: masterPayload.materialUnit,
    unitPrice,
    materialPrice: String(unitPrice),
    lastUpdated: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  batch.set(availDocRef, availPayload, { merge: true })
  batch.set(transferDocRef, availPayload, { merge: true })

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

  // Sync price/unit with materialsAvailability & materialTransfer if name is known
  const matName = updates.materialName || updates.name
  if (matName) {
    const cleanMat = cleanKey(matName)
    const availRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
    const transferRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMat)
    const syncData = {
      materialName: matName,
      unitPrice,
      materialPrice: String(unitPrice),
      unit: updates.materialUnit || updates.unit || 'Bags',
      lastUpdated: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await Promise.allSettled([
      setDoc(availRef, syncData, { merge: true }),
      setDoc(transferRef, syncData, { merge: true }),
    ])
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

  const batch = writeBatch(db)
  const docRef = doc(db, 'organisation', orgId, 'materials', materialId)
  batch.delete(docRef)

  if (materialName) {
    const cleanMat = cleanKey(materialName)
    const availRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
    const transferRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMat)
    batch.delete(availRef)
    batch.delete(transferRef)
  }

  await batch.commit()
}

// Alias for backwards compatibility
export const deleteMaterial = deleteMasterMaterial

// ------------------------------------------------------------------------------------------------
// 3. CATEGORIES, SUBCATEGORIES & UNITS MANAGEMENT (Hierarchical Taxonomy)
// ------------------------------------------------------------------------------------------------

/**
 * Fetches all categories sorted from /organisation/{orgId}/materialCategories
 */
export async function fetchMaterialCategories(orgId) {
  if (!orgId) return []
  const colRef = collection(db, 'organisation', orgId, 'materialCategories')
  const snap = await getDocs(colRef)
  return snap.docs.map((d) => {
    const data = d.data()
    const name = data.matCategory || data.categoryName || d.id
    return {
      id: d.id,
      categoryId: data.categoryId || d.id,
      matCategory: name,
      categoryName: name,
      created_at: data.created_at || data.createdAt,
      createdAt: data.createdAt || data.created_at,
      ...data,
    }
  })
}

/**
 * Creates a new material category with sequence ID MC001, MC002...
 */
export async function createMaterialCategory(orgId, categoryName) {
  if (!orgId || !categoryName?.trim()) throw new Error('Category name is required')
  const catName = categoryName.trim()

  // Duplicate check
  const existing = await fetchMaterialCategories(orgId)
  const isDup = existing.some((c) => (c.matCategory || c.categoryName || '').toLowerCase() === catName.toLowerCase())
  if (isDup) {
    throw new Error(`Category "${catName}" already exists.`)
  }

  const categoryId = await getNextMaterialCategoryId(orgId)
  const docRef = doc(db, 'organisation', orgId, 'materialCategories', categoryId)
  const payload = {
    categoryId,
    matCategory: catName,
    categoryName: catName,
    created_at: serverTimestamp(),
    createdAt: serverTimestamp(),
  }
  await setDoc(docRef, payload)
  return { id: categoryId, ...payload }
}

/**
 * Fetches subcategories optionally filtered by category
 */
export async function fetchMaterialSubCategories(orgId, categoryIdOrName = null) {
  if (!orgId) return []
  const colRef = collection(db, 'organisation', orgId, 'materialSubCategories')
  const snap = await getDocs(colRef)
  
  // Build lookup map for categories and units to resolve DocumentReferences from mobile app
  let catMap = new Map()
  let unitMap = new Map()
  try {
    const [cSnap, uSnap] = await Promise.all([
      getDocs(collection(db, 'organisation', orgId, 'materialCategories')),
      getDocs(collection(db, 'organisation', orgId, 'materialUnits')),
    ])
    cSnap.docs.forEach((cd) => {
      const cData = cd.data()
      catMap.set(cd.id.toLowerCase(), cData.matCategory || cData.categoryName || cd.id)
    })
    uSnap.docs.forEach((ud) => {
      const uData = ud.data()
      unitMap.set(ud.id.toLowerCase(), uData.matUnit || uData.unitName || ud.id)
    })
  } catch (err) {
    console.warn('Could not build category/unit lookup maps for subcategories:', err)
  }

  const list = snap.docs.map((d) => {
    const data = d.data()
    const subCat = data.matSubCategory || data.subCategory || ''
    
    // Resolve category name from DocumentReference or string
    let catId = data.categoryId || ''
    let catName = data.categoryName || ''
    if (data.matCategory) {
      if (typeof data.matCategory === 'object' && data.matCategory.id) {
        catId = data.matCategory.id
      } else if (typeof data.matCategory === 'string') {
        catName = catName || data.matCategory
      }
    }
    if (!catName && catId) {
      catName = catMap.get(catId.toLowerCase()) || catId
    }

    // Resolve unit name from DocumentReference or string
    let unitId = data.unitId || ''
    let unitName = data.unitName || ''
    if (data.matUnit) {
      if (typeof data.matUnit === 'object' && data.matUnit.id) {
        unitId = data.matUnit.id
      } else if (typeof data.matUnit === 'string') {
        unitName = unitName || data.matUnit
      }
    }
    if (!unitName && unitId) {
      unitName = unitMap.get(unitId.toLowerCase()) || unitId
    }

    return {
      id: d.id,
      subCategoryId: data.subCategoryId || d.id,
      matSubCategory: subCat,
      subCategory: subCat,
      categoryId: catId,
      categoryName: catName,
      unitId,
      unitName,
      matCategory: data.matCategory,
      matUnit: data.matUnit,
      created_at: data.created_at || data.createdAt,
      createdAt: data.createdAt || data.created_at,
      ...data,
    }
  })

  if (!categoryIdOrName || categoryIdOrName === 'ALL') return list

  const target = String(categoryIdOrName).trim().toLowerCase()
  return list.filter((s) => {
    const matchName = String(s.categoryName || '').trim().toLowerCase() === target
    const matchId = String(s.categoryId || s.id || '').trim().toLowerCase() === target
    const matchCatRef = typeof s.matCategory === 'object' && s.matCategory?.id?.toLowerCase() === target
    return matchName || matchId || matchCatRef
  })
}

/**
 * Creates a new material subcategory with sequence ID MSC001, MSC002...
 * Binds DocumentReference to active category
 */
export async function createMaterialSubCategory(orgId, subCategory, categoryIdOrName, unitIdOrName = null) {
  if (!orgId || !subCategory?.trim()) throw new Error('Subcategory name is required')
  if (!categoryIdOrName) throw new Error('Category is required for subcategory creation')

  const subCatName = subCategory.trim()
  const subCategoryId = await getNextMaterialSubCategoryId(orgId)

  // Resolve category doc ref
  let categoryRef = null
  let categoryName = String(categoryIdOrName).trim()
  if (categoryName.startsWith('MC')) {
    categoryRef = doc(db, 'organisation', orgId, 'materialCategories', categoryName)
  } else {
    // Try to find matching category by name
    const cats = await fetchMaterialCategories(orgId)
    const matched = cats.find((c) => (c.matCategory || c.categoryName || '').toLowerCase() === categoryName.toLowerCase())
    if (matched) {
      categoryRef = doc(db, 'organisation', orgId, 'materialCategories', matched.id)
      categoryName = matched.matCategory || matched.categoryName
    }
  }

  // Resolve unit doc ref if provided
  let unitRef = null
  if (unitIdOrName) {
    const unitStr = String(unitIdOrName).trim()
    if (unitStr.startsWith('MU') || unitStr.startsWith('UNT')) {
      unitRef = doc(db, 'organisation', orgId, 'materialUnits', unitStr)
    } else {
      const units = await fetchMaterialUnits(orgId)
      const matchedU = units.find((u) => (u.matUnit || u.unitName || '').toLowerCase() === unitStr.toLowerCase())
      if (matchedU) {
        unitRef = doc(db, 'organisation', orgId, 'materialUnits', matchedU.id || matchedU.unitId)
      }
    }
  }

  const docRef = doc(db, 'organisation', orgId, 'materialSubCategories', subCategoryId)
  const payload = {
    subCategoryId,
    matCategory: categoryRef,
    categoryName,
    matSubCategory: subCatName,
    subCategory: subCatName,
    matUnit: unitRef,
    created_at: serverTimestamp(),
    createdAt: serverTimestamp(),
  }

  await setDoc(docRef, payload)
  return { id: subCategoryId, ...payload }
}

/**
 * Fetches all units sorted from /organisation/{orgId}/materialUnits
 */
export async function fetchMaterialUnits(orgId) {
  if (!orgId) return []
  const colRef = collection(db, 'organisation', orgId, 'materialUnits')
  const snap = await getDocs(colRef)
  return snap.docs.map((d) => {
    const data = d.data()
    const name = data.matUnit || data.unitName || d.id
    return {
      id: d.id,
      unitId: data.unitId || d.id,
      matUnit: name,
      unitName: name,
      unitAbbreviation: data.unitAbbreviation || '',
      created_at: data.created_at || data.createdAt,
      createdAt: data.createdAt || data.created_at,
      ...data,
    }
  })
}

/**
 * Creates a new measurement unit with sequence ID MU001, MU002...
 */
export async function createMaterialUnit(orgId, unitName, unitAbbreviation = '') {
  if (!orgId || !unitName?.trim()) throw new Error('Unit name is required')
  const cleanName = unitName.trim()

  // Duplicate check
  const existing = await fetchMaterialUnits(orgId)
  const isDup = existing.some((u) => (u.matUnit || u.unitName || '').toLowerCase() === cleanName.toLowerCase())
  if (isDup) {
    throw new Error(`Unit "${cleanName}" already exists.`)
  }

  const unitId = await getNextMaterialUnitId(orgId)
  const docRef = doc(db, 'organisation', orgId, 'materialUnits', unitId)
  const payload = {
    unitId,
    matUnit: cleanName,
    unitName: cleanName,
    unitAbbreviation: unitAbbreviation.trim() || cleanName.toLowerCase(),
    created_at: serverTimestamp(),
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
  try {
    const colRef = collection(db, 'organisation', orgId, 'siteMaterialAllocations')
    const q = siteId ? query(colRef, where('siteId', '==', siteId)) : colRef
    const snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
  } catch (_e) {}

  return fetchWithFallback(orgId, 'materialAllocations')
}

export function subscribeMaterialAllocations(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'siteMaterialAllocations', onData, onError)
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
  const dateStr = payload.allocationDate || new Date().toISOString().split('T')[0]

  const allocationId = payload.allocationId || `ALLOC_${timestamp}_${Math.random().toString(36).substring(2, 6)}`
  const txnId = `TXN_MAT_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  const batch = writeBatch(db)

  // 1. Immutable record in siteMaterialAllocations (primary mobile collection) + mirror
  const allocRef = doc(db, 'organisation', orgId, 'siteMaterialAllocations', allocationId)
  const legacyAllocRef = doc(db, 'organisation', orgId, 'materialAllocations', allocationId)
  const allocData = {
    id: allocationId,
    allocationId,
    siteId: payload.siteId,
    siteName: payload.siteName || payload.siteId,
    projectName: payload.projectName || payload.siteName || '',
    materialId: payload.materialId || '',
    materialName: payload.materialName.trim(),
    displayName: payload.materialName.trim(),
    category: payload.category || 'General Material',
    subCategory: payload.subCategory || '',
    quantity: qty,
    unit: payload.unit || 'Bags',
    allocatedAmount: totalAmount,
    amount: totalAmount,
    totalValuation: totalAmount,
    unitRate,
    rate: unitRate,
    unitPrice: unitRate,
    allocationDate: dateStr,
    remarks: payload.remarks || 'Manager Site Material Allocation',
    allocatedBy: managerActor?.name || 'Operations Manager',
    managerId: managerActor?.id || 'mgr_lead',
    managerName: managerActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
  }
  batch.set(allocRef, allocData)
  batch.set(legacyAllocRef, allocData, { merge: true })

  // 2. Increment site material pool with all mobile SiteMaterialPoolItem fields
  const poolDocId = `${cleanSiteId}_${cleanMatName}`
  const poolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', poolDocId)
  batch.set(poolRef, {
    docId: poolDocId,
    id: poolDocId,
    siteId: payload.siteId,
    siteName: payload.siteName || payload.siteId,
    projectName: payload.projectName || payload.siteName || '',
    materialName: payload.materialName.trim(),
    displayName: payload.materialName.trim(),
    category: payload.category || 'General Material',
    subCategory: payload.subCategory || '',
    unit: payload.unit || 'Bags',
    totalAllocatedQty: increment(qty),
    allocatedStock: increment(qty),
    totalAllocated: increment(qty),
    totalAllocatedAmount: increment(totalAmount),
    totalValuation: increment(totalAmount),
    totalAllocatedValue: increment(totalAmount),
    consumedQty: increment(0),
    consumedStock: increment(0),
    consumedAmount: increment(0),
    remainingQty: increment(qty),
    currentBalance: increment(qty),
    availableCount: increment(qty),
    remainingAmount: increment(totalAmount),
    effectiveUnitRate: unitRate,
    unitRate,
    unitPrice: unitRate,
    lastAllocationDate: dateStr,
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 3. Decrement Central Warehouse Stock (both materialsAvailability and materialTransfer)
  if (payload.deductFromWarehouse !== false) {
    const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMatName)
    const matTransferRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMatName)
    const availUpdate = {
      materialName: payload.materialName.trim(),
      availableCount: increment(-qty),
      companyAvailableCount: increment(-qty),
      count: increment(-qty),
      unit: payload.unit || 'Bags',
      lastUpdated: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    batch.set(warehouseRef, availUpdate, { merge: true })
    batch.set(matTransferRef, availUpdate, { merge: true })
  }

  // 4. Immutable Audit Transaction in materialTransactions
  const txnRef = doc(db, 'organisation', orgId, 'materialTransactions', txnId)
  batch.set(txnRef, {
    id: txnId,
    transactionId: txnId,
    movementId: txnId,
    allocationId,
    reference: allocationId,
    siteId: payload.siteId,
    siteName: payload.siteName || payload.siteId,
    projectName: payload.projectName || payload.siteName || '',
    materialId: payload.materialId || '',
    materialName: payload.materialName.trim(),
    category: payload.category || 'General Material',
    transactionType: 'ALLOCATION',
    transferType: 'COMPANY_TO_SITE',
    quantity: qty,
    unit: payload.unit || 'Bags',
    rate: unitRate,
    unitRate,
    unitPrice: unitRate,
    amount: totalAmount,
    totalValue: totalAmount,
    date: dateStr,
    enteredBy: managerActor?.name || 'Operations Manager',
    approvedBy: managerActor?.name || 'Operations Manager',
    managerName: managerActor?.name || 'Operations Manager',
    dispatchedBy: managerActor?.name || 'Operations Manager',
    supervisorName: payload.supervisorName || '',
    vehicleNumber: payload.vehicleNumber || '',
    gatePassNumber: payload.challanNumber || `GP-${timestamp.toString().slice(-6)}`,
    from: 'Company Warehouse',
    to: payload.siteName || payload.siteId,
    receivedStatus: 'Received',
    remarks: payload.remarks || 'Manager Site Material Allocation',
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

    // 1. Decrement Central Warehouse Stock (both materialsAvailability and materialTransfer)
    const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMatName)
    const matTransferRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMatName)
    const availDec = {
      materialName: item.materialName,
      availableCount: increment(-qty),
      companyAvailableCount: increment(-qty),
      count: increment(-qty),
      unit: item.unit || 'Bags',
      lastUpdated: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    batch.set(warehouseRef, availDec, { merge: true })
    batch.set(matTransferRef, availDec, { merge: true })

    // 2. Increment Site Material Pool (both availableCount and currentBalance, totalAllocated and totalValuation)
    const poolDocId = `${cleanSiteId}_${cleanMatName}`
    const poolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', poolDocId)
    batch.set(poolRef, {
      docId: poolDocId,
      id: poolDocId,
      siteId: payload.toSiteId,
      siteCode: payload.toSiteCode || '',
      siteName: payload.toSiteName || '',
      projectName: payload.projectName || payload.toSiteName || '',
      materialName: item.materialName,
      displayName: item.materialName,
      category: item.category || 'General Material',
      subCategory: item.subCategory || '',
      totalAllocatedQty: increment(qty),
      allocatedStock: increment(qty),
      totalAllocated: increment(qty),
      totalAllocatedAmount: increment(qty * unitPrice),
      consumedQty: increment(0),
      consumedStock: increment(0),
      consumedAmount: increment(0),
      remainingQty: increment(qty),
      currentBalance: increment(qty),
      availableCount: increment(qty),
      remainingAmount: increment(qty * unitPrice),
      effectiveUnitRate: unitPrice,
      unitRate: unitPrice,
      unit: item.unit || 'Bags',
      unitPrice,
      totalValuation: increment(qty * unitPrice),
      totalAllocatedValue: increment(qty * unitPrice),
      lastAllocationDate: new Date().toISOString().split('T')[0],
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
      from: 'Company',
      fromSite: 'Company',
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
    totalAllocatedQty: increment(-qty),
    allocatedStock: increment(-qty),
    totalAllocated: increment(-qty),
    remainingQty: increment(-qty),
    currentBalance: increment(-qty),
    availableCount: increment(-qty),
    totalValuation: increment(-(qty * unitPrice)),
    remainingAmount: increment(-(qty * unitPrice)),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 2. Increment To Site Pool (both availableCount and currentBalance)
  const toPoolRef = doc(db, 'organisation', orgId, 'siteMaterialPool', `${cleanTo}_${cleanMat}`)
  batch.set(toPoolRef, {
    docId: `${cleanTo}_${cleanMat}`,
    id: `${cleanTo}_${cleanMat}`,
    siteId: payload.toSiteId,
    siteCode: payload.toSiteCode || '',
    siteName: payload.toSiteName || '',
    projectName: payload.projectName || payload.toSiteName || '',
    materialName: payload.materialName,
    displayName: payload.materialName,
    category: payload.category || 'General Material',
    subCategory: payload.subCategory || '',
    totalAllocatedQty: increment(qty),
    allocatedStock: increment(qty),
    totalAllocated: increment(qty),
    totalAllocatedAmount: increment(qty * unitPrice),
    consumedQty: increment(0),
    consumedStock: increment(0),
    consumedAmount: increment(0),
    remainingQty: increment(qty),
    currentBalance: increment(qty),
    availableCount: increment(qty),
    remainingAmount: increment(qty * unitPrice),
    effectiveUnitRate: unitPrice,
    unitRate: unitPrice,
    unit: payload.unit || 'Bags',
    unitPrice,
    totalValuation: increment(qty * unitPrice),
    totalAllocatedValue: increment(qty * unitPrice),
    lastAllocationDate: new Date().toISOString().split('T')[0],
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
    totalAllocatedQty: increment(-qty),
    allocatedStock: increment(-qty),
    totalAllocated: increment(-qty),
    remainingQty: increment(-qty),
    currentBalance: increment(-qty),
    availableCount: increment(-qty),
    totalValuation: increment(-(qty * unitPrice)),
    remainingAmount: increment(-(qty * unitPrice)),
    updatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }, { merge: true })

  // 2. Increment Central Warehouse Availability & materialTransfer
  const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
  const matTransferRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMat)
  const returnInc = {
    materialName: payload.materialName,
    availableCount: increment(qty),
    companyAvailableCount: increment(qty),
    count: increment(qty),
    unit: payload.unit || 'Bags',
    lastUpdated: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  batch.set(warehouseRef, returnInc, { merge: true })
  batch.set(matTransferRef, returnInc, { merge: true })

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
    toSiteId: 'Company',
    toSite: 'Company',
    toSiteName: 'Company',
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
 * Inward Stock Flow (Central Warehouse Stock Replenishment)
 * Complies with mobile application's MaterialInventoryService stock inward flow.
 * - Increments Central Warehouse availability in materialsAvailability/{cleanMatName}
 * - Mirrors stock update in materialTransfer/{cleanMatName}
 * - Increments master material document in materials/{materialId}
 * - Records immutable audit transaction in materialTransactions/{txnId}
 */
export async function addCompanyStock(orgId, payload, managerActor) {
  if (!orgId) throw new Error('Organization ID is required')
  if (!payload.materialName?.trim()) throw new Error('Material Name is required')

  const qty = Number(payload.quantity)
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Stock quantity to add must be a valid number greater than 0')
  }

  const materialName = payload.materialName.trim()
  const cleanMat = cleanKey(materialName)
  const unitPrice = Number(payload.unitPrice ?? payload.rate ?? payload.standardRate) || 0.0
  const totalAmount = Number(payload.totalAmount) || (qty * unitPrice)
  const dateStr = payload.date || new Date().toISOString().split('T')[0]
  const timestamp = Date.now()
  const txnId = `TXN_MAT_${timestamp}_${Math.random().toString(36).substring(2, 6)}`

  const batch = writeBatch(db)

  // 1. Central Warehouse Availability & Material Transfer Mirrors
  const warehouseRef = doc(db, 'organisation', orgId, 'materialsAvailability', cleanMat)
  const matTransferRef = doc(db, 'organisation', orgId, 'materialTransfer', cleanMat)

  const availPayload = {
    materialName,
    displayName: payload.displayName || materialName,
    category: payload.category || 'General',
    unit: payload.unit || 'Units',
    availableCount: increment(qty),
    companyAvailableCount: increment(qty),
    count: increment(qty),
    totalAvailableCount: increment(qty),
    lastUpdated: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (unitPrice > 0) {
    availPayload.unitPrice = unitPrice
    availPayload.materialPrice = String(unitPrice)
  }

  batch.set(warehouseRef, availPayload, { merge: true })
  batch.set(matTransferRef, availPayload, { merge: true })

  // 2. Primary Master Material Document Update (/organisation/{orgId}/materials/{materialId})
  let matDocId = payload.materialId
  if (!matDocId) {
    const mats = await fetchMaterials(orgId)
    const matched = mats.find((m) => (m.materialName || m.name || '').toLowerCase() === materialName.toLowerCase())
    if (matched) matDocId = matched.materialId || matched.id
  }

  if (matDocId) {
    const matRef = doc(db, 'organisation', orgId, 'materials', matDocId)
    const matUpdate = {
      availableCount: increment(qty),
      companyAvailableCount: increment(qty),
      count: increment(qty),
      currentTotalStock: increment(qty),
      currentStock: increment(qty),
      updatedAt: serverTimestamp(),
    }
    if (unitPrice > 0) {
      matUpdate.unitPrice = unitPrice
      matUpdate.materialPrice = String(unitPrice)
    }
    batch.set(matRef, matUpdate, { merge: true })
  }

  // 3. Immutable Transaction in materialTransactions
  const txnRef = doc(db, 'organisation', orgId, 'materialTransactions', txnId)
  batch.set(txnRef, {
    id: txnId,
    transactionId: txnId,
    movementId: txnId,
    referenceId: payload.invoiceNumber || payload.challanNumber || txnId,
    materialId: matDocId || payload.materialId || '',
    materialName,
    displayName: payload.displayName || materialName,
    category: payload.category || 'General',
    transactionType: 'INWARD',
    transferType: 'COMPANY_INWARD',
    type: 'INWARD',
    quantity: qty,
    unit: payload.unit || 'Units',
    rate: unitPrice,
    unitRate: unitPrice,
    unitPrice,
    amount: totalAmount,
    totalAmount,
    totalValue: totalAmount,
    from: payload.supplierName || payload.vendor || 'Supplier / Inward',
    to: 'Central Warehouse',
    siteId: 'CENTRAL_WAREHOUSE',
    siteName: 'Central Warehouse',
    supplierName: payload.supplierName || payload.vendor || '',
    invoiceNumber: payload.invoiceNumber || '',
    challanNumber: payload.challanNumber || '',
    vehicleNumber: payload.vehicleNumber || '',
    gatePassNumber: payload.challanNumber || `INW-${timestamp.toString().slice(-6)}`,
    remarks: payload.remarks || 'Stock Inward into Central Warehouse',
    date: dateStr,
    enteredBy: managerActor?.name || 'Operations Manager',
    performedBy: managerActor?.name || 'Operations Manager',
    managerName: managerActor?.name || 'Operations Manager',
    status: 'COMPLETED',
    receivedStatus: 'Received',
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  })

  await batch.commit()

  // 4. Notification trigger
  try {
    await createNotification({
      orgId,
      title: 'Warehouse Stock Inward',
      message: `Inwarded ${qty} ${payload.unit || 'Units'} of ${materialName} into Central Warehouse.`,
      type: 'INVENTORY',
      severity: 'INFO',
    })
  } catch (err) {
    console.warn('Failed to send stock inward notification:', err)
  }

  return { txnId, quantityAdded: qty }
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

