import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { fetchWithFallback } from './firestoreService.js'

/**
 * CST White Label - Project Master Configurations Service (5 Pillars)
 * Scoped strictly under:
 *   /organisation/{orgId}/projectCategories     (Prefix: PC)
 *   /organisation/{orgId}/projectSubCategories  (Prefix: PSC)
 *   /organisation/{orgId}/projectStages         (Prefix: PST)
 *   /organisation/{orgId}/projectContracts      (Prefix: CT)
 *   /organisation/{orgId}/projectStatus         (Prefix: PSTU)
 *
 * Complies 100% with PROJECT_CONFIGURATION_SPEC_AND_FLOW.txt
 * All hardcoded and default values are removed; values are loaded directly from Firestore.
 */

export const CONFIG_SECTIONS = {
  category: {
    type: 'category',
    title: 'Project Category',
    collectionName: 'projectCategories',
    idField: 'projectCategoryId',
    nameField: 'projectCategory',
    idPrefix: 'PC',
    placeholder: 'Enter category name (e.g. Residential, Commercial)',
  },
  subCategory: {
    type: 'subCategory',
    title: 'Project Sub Category',
    collectionName: 'projectSubCategories',
    idField: 'subCategoryId',
    nameField: 'projectSubCategory',
    idPrefix: 'PSC',
    placeholder: 'Enter sub-category name (e.g. 2BHK, Villa, Duplex)',
  },
  stage: {
    type: 'stage',
    title: 'Project Stage',
    collectionName: 'projectStages',
    idField: 'projectStageId',
    nameField: 'projectStage',
    idPrefix: 'PST',
    placeholder: 'Enter stage name (e.g. Foundation, Brick Works, Handover)',
  },
  contract: {
    type: 'contract',
    title: 'Project Contract',
    collectionName: 'projectContracts',
    idField: 'contractId',
    nameField: 'projectContract',
    idPrefix: 'CT',
    placeholder: 'Enter contract type (e.g. Turnkey with Material, Item Rate)',
  },
  status: {
    type: 'status',
    title: 'Project Status',
    collectionName: 'projectStatus',
    idField: 'projectStatusId',
    nameField: 'projectStatus',
    idPrefix: 'PSTU',
    placeholder: 'Enter status state (e.g. Planning Phase, In Progress, Completed)',
  },
}

/**
 * Resolves section metadata from an object, key, or collection name.
 */
export function resolveConfigMeta(input) {
  if (!input) return null
  if (typeof input === 'object' && input.collectionName) return input
  if (typeof input === 'string') {
    if (CONFIG_SECTIONS[input]) return CONFIG_SECTIONS[input]
    const foundByCol = Object.values(CONFIG_SECTIONS).find((s) => s.collectionName === input)
    if (foundByCol) return foundByCol
    const foundByType = Object.values(CONFIG_SECTIONS).find((s) => s.type === input)
    if (foundByType) return foundByType
    return {
      type: input,
      title: input,
      collectionName: input,
      idField: 'id',
      nameField: 'name',
      idPrefix: 'CFG',
    }
  }
  return typeof input === 'object' ? input : null
}

/**
 * Resolves the Firestore collection reference scoped to the active organization.
 */
export function getOrgCollectionRef(orgId, collectionNameOrMeta) {
  if (!orgId) throw new Error('Organization ID is required.')
  const meta = resolveConfigMeta(collectionNameOrMeta)
  const colName = meta?.collectionName || (typeof collectionNameOrMeta === 'string' ? collectionNameOrMeta : '')
  if (!colName) throw new Error('Valid collection name or section meta is required.')
  return collection(db, 'organisation', orgId, colName)
}

/**
 * Generates the next sequential ID matching the mobile app convention (e.g. PC001, PC002).
 * Extracts numeric characters from every document ID, computes max + 1.
 */
export async function generateNextConfigId(orgId, metaInput) {
  const meta = resolveConfigMeta(metaInput)
  const colRef = getOrgCollectionRef(orgId, meta)
  const snap = await getDocs(colRef)
  let maxNum = 0

  snap.docs.forEach((d) => {
    const numPart = parseInt(d.id.replace(/\D/g, ''), 10)
    if (!isNaN(numPart) && numPart > maxNum) {
      maxNum = numPart
    }
  })

  const nextNum = maxNum + 1
  return `${meta.idPrefix}${String(nextNum).padStart(3, '0')}`
}

/**
 * Checks for duplicate entries (case-insensitive) across standard and legacy field names.
 */
export async function isDuplicateConfigName(orgId, metaInput, name, excludeDocId = null) {
  const meta = resolveConfigMeta(metaInput)
  const colRef = getOrgCollectionRef(orgId, meta)
  const snap = await getDocs(colRef)
  const target = name.trim().toLowerCase()

  for (const docSnap of snap.docs) {
    if (excludeDocId && docSnap.id === excludeDocId) continue
    const data = docSnap.data()
    const existing = (data[meta.nameField] || data.projectState || data.name || '')
      .toString()
      .trim()
      .toLowerCase()
    if (existing === target) return true
  }
  return false
}

/**
 * Creates a new master configuration item matching the exact mobile data structure.
 */
export async function createConfigItem(orgId, metaInput, input) {
  const meta = resolveConfigMeta(metaInput)
  const name = typeof input === 'string' ? input : input?.name || ''
  const cleanName = name.trim()
  if (!cleanName) throw new Error(`Please enter a valid ${meta.title} name`)

  const isDup = await isDuplicateConfigName(orgId, meta, cleanName)
  if (isDup) throw new Error(`"${cleanName}" already exists in ${meta.title}`)

  const id = await generateNextConfigId(orgId, meta)
  const docRef = doc(db, 'organisation', orgId, meta.collectionName, id)

  const payload = {
    [meta.idField]: id,
    [meta.nameField]: cleanName,
    name: cleanName,
    createdAt: serverTimestamp(),
  }

  // Extra attributes based on section type
  if (meta.type === 'subCategory') {
    const parent = typeof input === 'object' ? input.projectCategory || input.parentCategory || '' : ''
    if (parent) {
      payload.projectCategory = parent.trim()
    }
  } else if (meta.type === 'stage') {
    const order = typeof input === 'object' && input.order !== undefined ? Number(input.order) : null
    payload.order = order !== null && !isNaN(order) ? order : 1
  } else if (meta.type === 'status') {
    // Both projectStatus and legacy projectState mirror field
    payload.projectStatus = cleanName
    payload.projectState = cleanName
  }

  await setDoc(docRef, payload)
  return { id, ...payload }
}

/**
 * Updates an existing configuration item in-place without creating a duplicate document.
 */
export async function updateConfigItem(orgId, metaInput, docId, updatesInput) {
  if (!orgId || !docId) throw new Error('Organization ID and Document ID are required for update')
  const meta = resolveConfigMeta(metaInput)

  const name = typeof updatesInput === 'string' ? updatesInput : updatesInput?.name || updatesInput?.[meta.nameField] || ''
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Name cannot be empty')

  const isDup = await isDuplicateConfigName(orgId, meta, cleanName, docId)
  if (isDup) throw new Error(`"${cleanName}" already exists in ${meta.title}`)

  const docRef = doc(db, 'organisation', orgId, meta.collectionName, docId)
  const updates = {
    [meta.nameField]: cleanName,
    name: cleanName,
    updatedAt: serverTimestamp(),
  }

  if (meta.type === 'subCategory') {
    const parent = typeof updatesInput === 'object' ? updatesInput.projectCategory || updatesInput.parentCategory || '' : ''
    if (parent) updates.projectCategory = parent.trim()
  } else if (meta.type === 'stage') {
    if (typeof updatesInput === 'object' && updatesInput.order !== undefined) {
      const ord = Number(updatesInput.order)
      if (!isNaN(ord)) updates.order = ord
    }
  } else if (meta.type === 'status') {
    updates.projectStatus = cleanName
    updates.projectState = cleanName
  }

  await updateDoc(docRef, updates)
  return { id: docId, ...updates }
}

/**
 * Deletes a configuration item document.
 */
export async function deleteConfigItem(orgId, metaInput, docId) {
  if (!orgId || !docId) throw new Error('Organization ID and Document ID are required')
  const meta = resolveConfigMeta(metaInput)
  const docRef = doc(db, 'organisation', orgId, meta.collectionName, docId)
  await deleteDoc(docRef)
  return { id: docId, deleted: true }
}

/**
 * Inspects all active projects in the organization to check if a configuration item is currently in use.
 */
export async function checkConfigUsage(orgId, metaInput, itemName) {
  if (!orgId || !itemName) return []
  const meta = resolveConfigMeta(metaInput)
  try {
    const projects = await fetchWithFallback(orgId, 'projects')
    const target = itemName.trim().toLowerCase()

    return projects.filter((p) => {
      if (meta.type === 'category') {
        const cat = (p.projectCategory || p.projectType || p.category || '').toLowerCase()
        return cat === target
      }
      if (meta.type === 'subCategory') {
        const sub = (p.projectSubCategory || p.subCategory || '').toLowerCase()
        return sub === target
      }
      if (meta.type === 'stage') {
        const stg = (p.projectStage || p.currentStage || p.stage || '').toLowerCase()
        return stg === target
      }
      if (meta.type === 'contract') {
        const cnt = (p.projectContract || p.contractType || '').toLowerCase()
        return cnt === target
      }
      if (meta.type === 'status') {
        const st = (p.projectStatus || p.currentStatus || p.status || p.projectState || '').toLowerCase()
        return st === target
      }
      return false
    })
  } catch (err) {
    console.error('Error checking config usage:', err)
    return []
  }
}

/**
 * Realtime subscription to a configuration section collection.
 */
export function subscribeConfigItems(orgId, metaInput, callback, onError) {
  if (!orgId) return () => {}
  const meta = resolveConfigMeta(metaInput)
  const colRef = getOrgCollectionRef(orgId, meta)

  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data()
        const nameField = meta?.nameField || 'name'
        const name = (data[nameField] || data.projectCategory || data.projectSubCategory || data.projectStage || data.projectContract || data.projectStatus || data.projectState || data.name || '').toString().trim()
        return {
          id: d.id,
          name,
          ...data,
        }
      })

      if (meta?.type === 'stage') {
        list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      } else {
        list.sort((a, b) => a.id.localeCompare(b.id))
      }

      callback(list)
    },
    (err) => {
      console.error(`Error subscribing to ${meta?.collectionName || metaInput}:`, err)
      onError?.(err)
    }
  )
}
