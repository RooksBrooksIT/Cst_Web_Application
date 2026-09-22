import {
  writeBatch,
  doc,
  collection,
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
 * Projects Service - Manages /organisation/{orgId}/projects
 * Complies with Section 3.1, 3.2, 3.3 & Section 5.1 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
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
 * Atomic 3-Step Project & Site Onboarding Wizard
 * Writes to:
 *   1. /organisation/{orgId}/projects/{siteId}
 *   2. /organisation/{orgId}/siteSupervisorMap/{mappingId}
 *   3. /organisation/{orgId}/siteSupervisorProjectStageSchedule/{scheduleId}
 */
export async function createCompleteProjectSetup(orgId, setupData, managerActor) {
  if (!orgId) throw new Error('orgId is required')
  if (!setupData.siteName?.trim()) throw new Error('Site Name is required')

  const timestamp = Date.now()
  const cleanName = setupData.siteName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
  const siteId = setupData.siteId || `site_${cleanName}_${timestamp.toString().slice(-4)}`
  const siteCode = setupData.siteCode || `SITE-${timestamp.toString().slice(-4)}`
  const projectId = setupData.projectId || `proj_${cleanName}`

  const batch = writeBatch(db)

  // 1. Project Document
  const projectRef = doc(db, 'organisation', orgId, 'projects', siteId)
  const projectPayload = {
    siteId,
    siteName: setupData.siteName.trim(),
    name: setupData.siteName.trim(),
    siteCode,
    code: siteCode,
    projectId,
    projectName: setupData.projectName?.trim() || setupData.siteName.trim(),
    projectCategory: setupData.projectCategory || 'Residential',
    projectSubCategory: setupData.projectSubCategory || 'Villa',
    projectStage: setupData.startingStage || '1. Site Demarcation & Mobilization',
    currentStage: setupData.startingStage || '1. Site Demarcation & Mobilization',
    projectStatus: setupData.projectStatus || 'In Progress',
    status: setupData.projectStatus || 'In Progress',
    currentStatus: setupData.projectStatus || 'In Progress',
    projectBudget: Number(setupData.totalBudget || setupData.projectBudget) || 0,
    totalBudget: Number(setupData.totalBudget || setupData.projectBudget) || 0,
    budget: Number(setupData.totalBudget || setupData.projectBudget) || 0,
    advancePaid: Number(setupData.advancePaid) || 0,
    totalAmountSpent: 0,
    spentAmount: 0,
    amountSpent: 0,
    clientName: setupData.clientName || '',
    clientPhone: setupData.clientPhone || '',
    location: setupData.siteLocation || setupData.location || '',
    siteLocation: setupData.siteLocation || setupData.location || '',
    latitude: Number(setupData.latitude) || 0,
    longitude: Number(setupData.longitude) || 0,
    startDate: setupData.startDate ? new Date(setupData.startDate) : serverTimestamp(),
    targetEndDate: setupData.targetEndDate ? new Date(setupData.targetEndDate) : null,
    contractType: setupData.contractType || 'Turnkey with Material',
    contractorName: setupData.contractorName || '',
    contractorBudget: Number(setupData.contractorBudget) || 0,
    supervisorId: setupData.supervisorId || '',
    supervisorName: setupData.supervisorName || '',
    managerId: managerActor?.id || 'mgr_lead',
    managerName: managerActor?.name || 'Operations Manager',
    progress: 0,
    stages: Array.isArray(setupData.stages) && setupData.stages.length > 0 ? setupData.stages : DEFAULT_PROJECT_STAGES,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  batch.set(projectRef, projectPayload)

  // 2. Site Supervisor Map Document (if supervisor selected)
  if (setupData.supervisorId) {
    const mapId = `MAP_${siteId}_${setupData.supervisorId}`
    const mapRef = doc(db, 'organisation', orgId, 'siteSupervisorMap', mapId)
    const mapPayload = {
      siteId,
      siteName: setupData.siteName.trim(),
      siteCode,
      projectId,
      projectName: setupData.projectName || setupData.siteName.trim(),
      supervisorId: setupData.supervisorId,
      'Supervisor ID': setupData.supervisorId,
      supervisorName: setupData.supervisorName || '',
      supervisor: setupData.supervisorName || '',
      projectStage: setupData.startingStage || '1. Site Demarcation & Mobilization',
      location: setupData.siteLocation || '',
      joinedDate: setupData.joinedDate ? new Date(setupData.joinedDate) : serverTimestamp(),
      startDate: setupData.startDate ? new Date(setupData.startDate) : serverTimestamp(),
      comments: setupData.supervisorComments || 'Assigned via Project Setup Wizard',
      managerId: managerActor?.id || 'mgr_lead',
      managerName: managerActor?.name || 'Operations Manager',
      createdAt: serverTimestamp(),
    }
    batch.set(mapRef, mapPayload)
  }

  // 3. Initial Project Stage Schedule
  const stagesToInit = Array.isArray(setupData.stages) && setupData.stages.length > 0 ? setupData.stages : DEFAULT_PROJECT_STAGES
  stagesToInit.forEach((stg, index) => {
    const schedId = `SCHED_${siteId}_${index + 1}`
    const schedRef = doc(db, 'organisation', orgId, 'siteSupervisorProjectStageSchedule', schedId)
    batch.set(schedRef, {
      scheduleId: schedId,
      siteId,
      siteName: setupData.siteName.trim(),
      stageName: stg.name || stg,
      stageOrder: index + 1,
      status: index === 0 ? 'in_progress' : 'pending',
      completionPercentage: index === 0 ? 0 : 0,
      createdAt: serverTimestamp(),
    })
  })

  // Commit batch atomically
  await batch.commit()

  return { id: siteId, ...projectPayload }
}

export async function createProject(orgId, projectData) {
  return createCompleteProjectSetup(orgId, projectData, { name: projectData.managerName })
}

export async function updateProject(orgId, projectId, updates) {
  const payload = { ...updates, updatedAt: serverTimestamp() }
  if (updates.name) {
    payload.projectName = updates.name
    payload.siteName = updates.name
  }
  if (updates.totalBudget !== undefined) {
    payload.projectBudget = Number(updates.totalBudget)
    payload.budget = Number(updates.totalBudget)
    payload.estimatedBudget = Number(updates.totalBudget)
  }
  if (updates.status) {
    payload.currentStatus = updates.status
    payload.projectStatus = updates.status
  }
  if (updates.currentStage) {
    payload.projectStage = updates.currentStage
  }
  await updateStandardDoc(orgId, 'projects', projectId, payload)
}

export async function deleteProject(orgId, projectId) {
  return deleteStandardDoc(orgId, 'projects', projectId)
}
