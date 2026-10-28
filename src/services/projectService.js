import {
  writeBatch,
  doc,
  collection,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  fetchWithFallback,
  subscribeWithFallback,
  deleteStandardDoc,
} from './firestoreService.js'
import { SubscriptionLimitService } from './subscriptionLimitService.js'

/**
 * Asserts that the caller is NOT an Organization user.
 * Organization users have view-only access to site and project information.
 */
export function verifyNotOrganizationUser(actor) {
  // 1. Explicit actor role validation
  if (actor) {
    const actorRole = String(actor.role || '').toLowerCase().trim()
    if (
      actorRole === 'organization' ||
      actorRole === 'organization admin' ||
      actorRole === 'admin' ||
      actorRole === 'org' ||
      actorRole === 'organisation' ||
      actorRole === 'enterprise'
    ) {
      const err = new Error('Organization users have view-only access to site information.')
      err.code = 'PERMISSION_DENIED'
      throw err
    }
  }

  // 2. Active stored session role validation (browser environment)
  let session = null
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      session = JSON.parse(window.localStorage.getItem('constructa_session') || '{}')
    } catch {
      session = null
    }
  } else if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    try {
      session = JSON.parse(globalThis.localStorage.getItem('constructa_session') || '{}')
    } catch {
      session = null
    }
  }

  if (session) {
    const sessionRole = String(session?.role || '').toLowerCase().trim()
    if (
      sessionRole === 'organization' ||
      sessionRole === 'organization admin' ||
      sessionRole === 'admin' ||
      sessionRole === 'org' ||
      sessionRole === 'organisation' ||
      sessionRole === 'enterprise'
    ) {
      const actorRole = String(actor?.role || '').toLowerCase().trim()
      if (!actorRole.includes('manager')) {
        const err = new Error('Organization users have view-only access to site information.')
        err.code = 'PERMISSION_DENIED'
        throw err
      }
    }
  }
}

/**
 * Projects Service - Manages /organisation/{orgId}/projects
 * End-to-end implementation of PROJECT_AND_SITE_SETUP_COMPLETE_FLOW.txt
 * and PROJECT_AND_SITE_SETUP_UPDATE_TABBAR_FLOW.txt
 */

export const DEFAULT_PROJECT_STAGES = [
  { stageId: 'stg_1', name: '1. Site Demarcation & Mobilization', order: 1, status: 'in_progress', completionPercentage: 0 },
  { stageId: 'stg_2', name: '2. Deep Excavation & Piling', order: 2, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_3', name: '3. Foundation & Footing Cast', order: 3, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_4', name: '4. Plinth Beams & Backfilling', order: 4, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_5', name: '5. Superstructure Columns & RCC Slabs', order: 5, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_6', name: '6. Masonry, Brickwork & AAC Blocks', order: 6, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_7', name: '7. Internal & External Plastering', order: 7, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_8', name: '8. Plumbing, Electrical & MEP Rough-In', order: 8, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_9', name: '9. Flooring, Tiling & Painting', order: 9, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_10', name: '10. Snag Rectification & Final Handover', order: 10, status: 'pending', completionPercentage: 0 },
]

export async function fetchProjects(orgId) {
  return fetchWithFallback(orgId, 'projects')
}

export function subscribeProjects(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'projects', onData, onError)
}

/**
 * Computes next sequential project code (e.g. PR001, PR002)
 */
export async function getNextProjectCode(orgId) {
  if (!orgId) return 'PR001'
  const snap = await getDocs(collection(db, 'organisation', orgId, 'projects'))
  let highestSeq = 0

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {}
    const pCode = (data.projectCode || docSnap.id || '').toString()
    const match = pCode.match(/^PR(\d+)/i) || docSnap.id.match(/^PR(\d+)/i)
    if (match) {
      const numVal = parseInt(match[1], 10)
      if (!isNaN(numVal) && numVal > highestSeq) {
        highestSeq = numVal
      }
    }
  })

  return `PR${String(highestSeq + 1).padStart(3, '0')}`
}

/**
 * Computes next sequential site code (e.g. ST001, ST002)
 */
export async function getNextSiteCode(orgId) {
  if (!orgId) return 'ST001'
  const snap = await getDocs(collection(db, 'organisation', orgId, 'projects'))
  let highestSeq = 0

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {}
    const sCode = (data.siteCode || docSnap.id || '').toString()
    const match = sCode.match(/ST(\d+)/i) || docSnap.id.match(/ST(\d+)/i)
    if (match) {
      const numVal = parseInt(match[1], 10)
      if (!isNaN(numVal) && numVal > highestSeq) {
        highestSeq = numVal
      }
    }
  })

  return `ST${String(highestSeq + 1).padStart(3, '0')}`
}

/**
 * Atomic Project & Site Creation Algorithm
 */
export async function createProjectAndSiteAtomic(orgId, data, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  verifyNotOrganizationUser(managerActor)
  if (!data.siteName?.trim()) throw new Error('Site Name is required')

  // Enforce Subscription Plan Limit (Section 5.1 of SUBSCRIPTION_PLAN_LIMITATIONS.txt)
  const validation = await SubscriptionLimitService.canCreateSite({ orgId })
  if (!validation.isAllowed) {
    const error = new Error(validation.message)
    error.code = validation.reason
    error.upgradePlan = validation.upgradePlan
    error.limits = validation.limits
    error.details = validation
    throw error
  }

  const cleanSiteName = data.siteName.trim().replace(/\s+/g, '')
  const siteCode = await getNextSiteCode(orgId)
  const projectCode = await getNextProjectCode(orgId)
  const siteDocId = `${siteCode}_${cleanSiteName}`
  const canonicalDocId = `${projectCode}_${siteCode}_${cleanSiteName}`

  const budget = Number(data.projectBudget ?? data.totalBudget) || 0.0
  const paid = Number(data.amountPaid ?? data.advancePaid) || 0.0
  const balance = paid // Balance on creation = paid - 0 spent

  // Format Timestamps
  const parseDateToTimestamp = (d) => {
    if (!d) return null
    if (d instanceof Timestamp) return d
    const parsed = new Date(d)
    return isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed)
  }

  const plannedStart = parseDateToTimestamp(data.plannedStartDate || data.startDate) || serverTimestamp()
  const plannedEnd = parseDateToTimestamp(data.plannedEndDate || data.targetEndDate)
  const actualStart = parseDateToTimestamp(data.actualStartDate)
  const actualEnd = parseDateToTimestamp(data.actualEndDate)

  const unifiedData = {
    projectId: canonicalDocId,
    projectCode: projectCode,
    siteId: siteDocId,
    siteCode: siteCode,
    siteName: data.siteName.trim(),
    name: data.siteName.trim(),
    projectName: (data.projectName || data.siteName).trim(),
    location: (data.location || data.siteLocation || '').trim(),
    siteLocation: (data.location || data.siteLocation || '').trim(),
    latitude: data.latitude !== undefined && data.latitude !== null && data.latitude !== '' ? Number(data.latitude) : null,
    longitude: data.longitude !== undefined && data.longitude !== null && data.longitude !== '' ? Number(data.longitude) : null,

    // Customer Credentials
    ownerName: (data.ownerName || data.clientName || '').trim(),
    clientOwnerName: (data.ownerName || data.clientName || '').trim(),
    clientName: (data.ownerName || data.clientName || '').trim(),
    ownerPhoneNumber: (data.ownerPhoneNumber || data.clientPhone || '').trim(),
    clientPhone: (data.ownerPhoneNumber || data.clientPhone || '').trim(),
    clientPhoneNumber: (data.ownerPhoneNumber || data.clientPhone || '').trim(),

    // Financials
    projectBudget: budget,
    estimatedBudget: budget,
    totalBudget: budget,
    budget: budget,
    amountPaid: paid,
    advancePaid: paid,
    amountReceived: paid,
    receivedPayments: paid,
    amountSpent: 0.0,
    amountSpend: 0.0,
    totalAmountSpent: 0.0,
    spentAmount: 0.0,
    amountBalance: balance,
    balance: balance,
    balanceAmount: budget - paid,

    // Classifications
    projectCategory: data.projectCategory || '',
    projectType: data.projectCategory || '',
    projectSubCategory: data.projectSubCategory || '',
    projectContract: data.projectContract || data.contractType || '',
    projectContractType: data.projectContract || data.contractType || '',
    projectStage: data.projectStage || data.startingStage || 'Planning',
    currentStage: data.projectStage || data.startingStage || 'Planning',
    currentStatus: data.status || data.currentStatus || data.projectStatus || 'Planning',
    status: data.status || data.currentStatus || data.projectStatus || 'Planning',
    projectStatus: data.status || data.currentStatus || data.projectStatus || 'Planning',
    projectState: data.status || data.currentStatus || data.projectStatus || 'Planning',

    // Dates
    startDate: plannedStart,
    plannedStartDate: plannedStart,
    endDate: plannedEnd,
    plannedEndDate: plannedEnd,
    targetEndDate: plannedEnd,
    actualStartDate: actualStart,
    actualStateDate: actualStart,
    actualEndDate: actualEnd,

    // Subcontractors
    isContractWork: Boolean(data.isContractWork),
    contractorName: data.isContractWork ? data.contractorName || null : null,
    contractorBudget: data.isContractWork && data.contractorBudget ? Number(data.contractorBudget) : null,

    // Staff & Governance
    supervisorId: data.supervisorId || '',
    supervisorName: data.supervisorName || '',
    managerId: managerActor?.id || 'mgr_lead',
    managerName: managerActor?.name || 'Operations Manager',

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const batch = writeBatch(db)

  // 1. Primary Canonical Document in /organisation/{orgId}/projects/{canonicalDocId}
  const projectRef = doc(db, 'organisation', orgId, 'projects', canonicalDocId)
  batch.set(projectRef, unifiedData)

  // 2. Expense Accumulator Document in /organisation/{orgId}/totalSiteExpensesPerDay/{siteDocId}
  const expenseRef = doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', siteDocId)
  batch.set(expenseRef, {
    siteId: siteDocId,
    siteCode: siteCode,
    siteName: data.siteName.trim(),
    totalMgrExpense: 0.0,
    totalOrgExpense: 0.0,
    totalSiteExpense: 0.0,
    totalContractorExpense: 0.0,
    totalIncentiveExpenses: 0.0,
    totalAllExpenses: 0.0,
    createdAt: serverTimestamp(),
  })

  // 3. Supervisor Mapping Document in /organisation/{orgId}/siteSupervisorMap/{mapDocId}
  if (data.supervisorId && data.supervisorName) {
    const cleanSup = data.supervisorName.trim().replace(/\s+/g, '')
    const mapDocId = `${siteDocId}_${cleanSup}`
    const mapRef = doc(db, 'organisation', orgId, 'siteSupervisorMap', mapDocId)
    const startDateStr = data.plannedStartDate || data.startDate || ''
    const endDateStr = data.plannedEndDate || data.targetEndDate || ''
    const joinedDateStr = data.joinedDate || ''
    const mgrName = managerActor?.name || data.managerName || 'Operations Manager'
    const mgrId = managerActor?.id || ''

    batch.set(mapRef, {
      FullName: data.supervisorName.trim(),
      'Joined On': data.joinedOn || '',
      'Supervisor ID': data.supervisorId,
      SupervisorId: data.supervisorId,
      assignedByManager: mgrName,
      endDate: endDateStr,
      joinedDate: joinedDateStr,
      location: (data.location || data.siteLocation || '').trim(),
      manager: mgrName,
      managerId: mgrId,
      managerName: mgrName,
      project: (data.projectName || data.siteName).trim(),
      projectName: (data.projectName || data.siteName).trim(),
      projectStage: data.projectStage || data.startingStage || 'Planning',
      site: siteDocId,
      siteComments: data.siteComments || data.supervisorComments || '',
      siteDocId: siteDocId,
      siteId: siteCode,
      siteName: data.siteName.trim(),
      stage: data.projectStage || data.startingStage || 'Planning',
      startDate: startDateStr,
      supervisor: data.supervisorName.trim(),
      supervisorId: data.supervisorId,
      supervisorName: data.supervisorName.trim(),
      updatedAt: serverTimestamp(),
    })
  }

  // 4. Initial Payment Voucher in /organisation/{orgId}/projectPayments/{payId}
  if (paid > 0) {
    const payId = `PAY_${Date.now()}`
    const payRef = doc(db, 'organisation', orgId, 'projectPayments', payId)
    batch.set(payRef, {
      paymentId: payId,
      siteId: siteDocId,
      projectName: (data.projectName || data.siteName).trim(),
      amount: paid,
      paymentType: 'Initial Advance',
      paymentMode: data.paymentMode || 'Advance Received',
      date: new Date().toISOString().split('T')[0],
      recordedBy: managerActor?.name || 'Operations Manager',
      createdAt: serverTimestamp(),
    })
  }

  await batch.commit()

  return { canonicalDocId, projectCode, siteCode, siteDocId, ...unifiedData }
}

/**
 * Updates an existing Project & Site document in place without creating duplicates
 * Fully complies with Section 6.1 of PROJECT_AND_SITE_SETUP_UPDATE_TABBAR_FLOW.txt
 */
export async function updateProjectAndSiteDoc(orgId, payload, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  verifyNotOrganizationUser(managerActor)
  if (!payload.selectedSiteDocId) throw new Error('selectedSiteDocId is required')

  const batch = writeBatch(db)
  const projectsCol = collection(db, 'organisation', orgId, 'projects')

  // Parse Date to Timestamp
  const parseDateToTimestamp = (d) => {
    if (!d) return null
    if (d instanceof Timestamp) return d
    const parsed = new Date(d)
    return isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed)
  }

  // Compute final amount paid & balance
  const addedPayment = payload.newPayment ? Number(payload.newPayment.amount) || 0.0 : 0.0
  const totalAmountPaid = (Number(payload.currentAmountPaid) || 0.0) + addedPayment
  const totalAmountSpent = Number(payload.amountSpent) || 0.0
  const amountBalance = totalAmountPaid - totalAmountSpent
  const projectBudget = Number(payload.projectBudget) || 0.0

  const updateData = {
    // Editable Status & Stage
    currentStatus: payload.status || 'Planning',
    status: payload.status || 'Planning',
    projectStatus: payload.status || 'Planning',
    projectState: payload.status || 'Planning',
    projectStage: payload.projectStage || 'Planning',
    currentStage: payload.projectStage || 'Planning',

    // Editable Actual Dates
    actualStartDate: parseDateToTimestamp(payload.actualStartDate),
    actualStateDate: parseDateToTimestamp(payload.actualStartDate),
    actualEndDate: parseDateToTimestamp(payload.actualEndDate),

    // Financials
    amountPaid: totalAmountPaid,
    advancePaid: totalAmountPaid,
    amountReceived: totalAmountPaid,
    receivedPayments: totalAmountPaid,
    amountSpent: totalAmountSpent,
    amountSpend: totalAmountSpent,
    totalAmountSpent: totalAmountSpent,
    spentAmount: totalAmountSpent,
    amountBalance: amountBalance,
    balance: amountBalance,
    balanceAmount: projectBudget - totalAmountPaid,
    projectBudget: projectBudget,
    estimatedBudget: projectBudget,
    totalBudget: projectBudget,
    budget: projectBudget,

    // Read-only Preserved Values & Aliases
    siteName: (payload.siteName || '').trim(),
    name: (payload.siteName || '').trim(),
    projectName: (payload.projectName || payload.siteName || '').trim(),
    location: (payload.location || '').trim(),
    siteLocation: (payload.location || '').trim(),
    latitude: payload.latitude !== undefined && payload.latitude !== null && payload.latitude !== '' ? Number(payload.latitude) : null,
    longitude: payload.longitude !== undefined && payload.longitude !== null && payload.longitude !== '' ? Number(payload.longitude) : null,
    ownerName: (payload.ownerName || '').trim(),
    clientOwnerName: (payload.ownerName || '').trim(),
    clientName: (payload.ownerName || '').trim(),
    ownerPhoneNumber: (payload.ownerPhoneNumber || '').trim(),
    clientPhone: (payload.ownerPhoneNumber || '').trim(),
    clientPhoneNumber: (payload.ownerPhoneNumber || '').trim(),
    isContractWork: Boolean(payload.isContractWork),
    contractorName: payload.isContractWork ? payload.contractorName || null : null,
    contractorBudget: payload.isContractWork && payload.contractorBudget ? Number(payload.contractorBudget) : null,

    updatedAt: serverTimestamp(),
  }

  // Optional Classifications
  if (payload.projectCategory) {
    updateData.projectCategory = payload.projectCategory
    updateData.projectType = payload.projectCategory
  }
  if (payload.projectSubCategory) {
    updateData.projectSubCategory = payload.projectSubCategory
  }
  if (payload.projectContract) {
    updateData.projectContract = payload.projectContract
    updateData.projectContractType = payload.projectContract
  }
  if (payload.plannedStartDate) {
    updateData.plannedStartDate = parseDateToTimestamp(payload.plannedStartDate)
    updateData.startDate = parseDateToTimestamp(payload.plannedStartDate)
  }
  if (payload.plannedEndDate) {
    updateData.plannedEndDate = parseDateToTimestamp(payload.plannedEndDate)
    updateData.endDate = parseDateToTimestamp(payload.plannedEndDate)
    updateData.targetEndDate = parseDateToTimestamp(payload.plannedEndDate)
  }

  // 1. Merge into target project documents
  const targetDocIds = new Set([payload.selectedSiteDocId])
  if (payload.selectedProjectId) targetDocIds.add(payload.selectedProjectId)

  targetDocIds.forEach((docId) => {
    const docRef = doc(projectsCol, docId)
    batch.set(docRef, updateData, { merge: true })
  })

  // 2. Commit new payment voucher if recorded in modal
  if (payload.newPayment && addedPayment > 0) {
    const paymentId = `PAY_${Date.now()}`
    const paymentRef = doc(db, 'organisation', orgId, 'projectPayments', paymentId)
    batch.set(paymentRef, {
      paymentId,
      siteId: payload.selectedSiteDocId,
      projectId: payload.selectedProjectId || payload.selectedSiteDocId,
      projectName: payload.projectName || payload.siteName,
      amount: addedPayment,
      paymentType: payload.newPayment.paymentType || 'Client Progress Payment',
      paymentMode: payload.newPayment.paymentMode || 'Bank Transfer / RTGS',
      transactionRef: payload.newPayment.transactionRef || '',
      remarks: payload.newPayment.remarks || '',
      date: payload.newPayment.date || new Date().toISOString().split('T')[0],
      recordedBy: payload.newPayment.recordedBy || managerActor?.name || 'Operations Manager',
      createdAt: serverTimestamp(),
    })
  }

  await batch.commit()
  return { id: payload.selectedSiteDocId, ...updateData }
}

/**
 * Fetches historical payment vouchers for a specific site
 */
export async function fetchSitePaymentHistory(orgId, siteId) {
  if (!orgId || !siteId) return []
  try {
    const snap = await getDocs(collection(db, 'organisation', orgId, 'projectPayments'))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.siteId === siteId || p.projectId === siteId)
      .sort((a, b) => {
        const tA = a.createdAt?.seconds ? a.createdAt.seconds : 0
        const tB = b.createdAt?.seconds ? b.createdAt.seconds : 0
        return tB - tA
      })
  } catch (err) {
    console.error('Error fetching payments:', err)
    return []
  }
}

// Backward compatibility wrappers
export async function updateProjectAndSite(orgId, docId, updates, managerActor) {
  verifyNotOrganizationUser(managerActor)
  return updateProjectAndSiteDoc(orgId, { selectedSiteDocId: docId, ...updates }, managerActor)
}

export async function createCompleteProjectSetup(orgId, setupData, managerActor) {
  verifyNotOrganizationUser(managerActor)
  return createProjectAndSiteAtomic(orgId, setupData, managerActor)
}

export async function createProject(orgId, projectData, actor) {
  verifyNotOrganizationUser(actor || { role: 'Organization' })
  return createProjectAndSiteAtomic(orgId, projectData, actor || { name: projectData.managerName })
}

export async function updateProject(orgId, projectId, updates, actor) {
  verifyNotOrganizationUser(actor || { role: 'Organization' })
  return updateProjectAndSite(orgId, projectId, updates, actor)
}

export async function deleteProject(orgId, projectId, actor) {
  verifyNotOrganizationUser(actor || { role: 'Organization' })
  return deleteStandardDoc(orgId, 'projects', projectId)
}

export { resolveProjectCategoryOrStage } from './expenseNormalizationService.js'

/**
 * Fetches a single project document from backend (/organisation/{orgId}/projects/{siteId})
 */
export async function fetchProjectDetails(orgId, projectIdOrSiteId) {
  if (!orgId || !projectIdOrSiteId) return null
  try {
    const docRef = doc(db, 'organisation', orgId, 'projects', projectIdOrSiteId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() }
    }

    // Try query by siteId
    const q1 = query(
      collection(db, 'organisation', orgId, 'projects'),
      where('siteId', '==', projectIdOrSiteId)
    )
    const snap1 = await getDocs(q1)
    if (!snap1.empty) {
      return { id: snap1.docs[0].id, ...snap1.docs[0].data() }
    }

    // Try query by projectId
    const q2 = query(
      collection(db, 'organisation', orgId, 'projects'),
      where('projectId', '==', projectIdOrSiteId)
    )
    const snap2 = await getDocs(q2)
    if (!snap2.empty) {
      return { id: snap2.docs[0].id, ...snap2.docs[0].data() }
    }

    // Fallback: legacy sites collection
    const sDocRef = doc(db, 'organisation', orgId, 'sites', projectIdOrSiteId)
    const sSnap = await getDoc(sDocRef)
    if (sSnap.exists()) {
      return { id: sSnap.id, ...sSnap.data() }
    }
  } catch (err) {
    console.warn('[fetchProjectDetails] Error fetching project:', err?.message)
  }
  return null
}
