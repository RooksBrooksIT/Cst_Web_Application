import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Projects Service - Manages /organisation/{orgId}/projects
 * Complies with Section 3.3 of Architecture & Technical Flow Specification
 */

export const DEFAULT_PROJECT_STAGES = [
  { stageId: 'stg_1', name: 'Foundation & Earthwork', order: 1, status: 'in_progress', completionPercentage: 0 },
  { stageId: 'stg_2', name: 'Plinth & Column Starter', order: 2, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_3', name: 'Superstructure & RCC Slabs', order: 3, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_4', name: 'Brickwork & Plastering', order: 4, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_5', name: 'Finishing, Flooring & MEP', order: 5, status: 'pending', completionPercentage: 0 },
  { stageId: 'stg_6', name: 'Snagging & Handover', order: 6, status: 'pending', completionPercentage: 0 },
]

export async function fetchProjects(orgId) {
  return fetchWithFallback(orgId, 'projects')
}

export function subscribeProjects(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'projects', onData, onError)
}

export async function createProject(orgId, projectData) {
  const code = projectData.code || `PRJ-${Date.now().toString().slice(-6)}`
  const payload = {
    name: projectData.name || projectData.projectName || 'New Construction Project',
    projectName: projectData.name || projectData.projectName || 'New Construction Project',
    code,
    siteCode: code,
    clientName: projectData.clientName || '',
    clientPhone: projectData.clientPhone || '',
    clientEmail: projectData.clientEmail || '',
    customerId: projectData.customerId || '',
    managerId: projectData.managerId || '',
    managerName: projectData.managerName || '',
    supervisorIds: Array.isArray(projectData.supervisorIds) ? projectData.supervisorIds : [],
    location: projectData.location || {
      address: projectData.siteLocation || projectData.address || '',
      city: projectData.city || '',
      state: projectData.state || '',
      pinCode: projectData.pinCode || '',
      radiusMeters: Number(projectData.radiusMeters) || 500,
    },
    siteLocation: projectData.siteLocation || projectData.location?.address || '',
    startDate: projectData.startDate || new Date().toISOString(),
    estimatedEndDate: projectData.estimatedEndDate || '',
    actualEndDate: projectData.actualEndDate || '',
    totalBudget: Number(projectData.totalBudget || projectData.budget || projectData.estimatedBudget) || 0,
    budget: Number(projectData.totalBudget || projectData.budget || projectData.estimatedBudget) || 0,
    estimatedBudget: Number(projectData.totalBudget || projectData.budget || projectData.estimatedBudget) || 0,
    spentAmount: Number(projectData.spentAmount || projectData.amountSpent) || 0,
    amountSpent: Number(projectData.spentAmount || projectData.amountSpent) || 0,
    receivedAmount: Number(projectData.receivedAmount) || 0,
    status: projectData.status || 'in_progress',
    currentStatus: projectData.status || 'In Progress',
    currentStage: projectData.currentStage || 'Foundation & Earthwork',
    projectStage: projectData.currentStage || 'Foundation & Earthwork',
    progress: Number(projectData.progress) || 0,
    stages: Array.isArray(projectData.stages) && projectData.stages.length > 0 ? projectData.stages : DEFAULT_PROJECT_STAGES,
    drawings: Array.isArray(projectData.drawings) ? projectData.drawings : [],
  }

  const docId = await saveStandardDoc(orgId, 'projects', payload)
  return { id: docId, ...payload }
}

export async function updateProject(orgId, projectId, updates) {
  const payload = { ...updates }
  if (updates.name) payload.projectName = updates.name
  if (updates.totalBudget !== undefined) {
    payload.budget = Number(updates.totalBudget)
    payload.estimatedBudget = Number(updates.totalBudget)
  }
  if (updates.status) payload.currentStatus = updates.status
  if (updates.currentStage) payload.projectStage = updates.currentStage
  await updateStandardDoc(orgId, 'projects', projectId, payload)
}

export async function deleteProject(orgId, projectId) {
  return deleteStandardDoc(orgId, 'projects', projectId)
}
