import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Quality Assurance (QA/QC) & Safety Incident Service
 * Complies with Section 3.13 of Architecture Specification
 */

export const INSPECTION_TYPES = [
  'Reinforcement Pre-Pour Inspection',
  'Concrete Slump & Cube Test',
  'Brickwork Plumb & Line Check',
  'Waterproofing Layer Integrity',
  'Electrical & Plumbing Concealed Conduiting',
  'Plastering Surface Smoothness & Curing',
  'Flooring & Tile Alignment Audit',
  'Door & Window Frame Fixing',
]

export async function fetchQualityChecklists(orgId) {
  return fetchWithFallback(orgId, 'quality_checklists')
}

export function subscribeQualityChecklists(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'quality_checklists', onData, onError)
}

export async function createQualityChecklist(orgId, checklistData) {
  const payload = {
    projectId: checklistData.projectId || checklistData.siteId || '',
    projectName: checklistData.projectName || checklistData.siteName || 'Site',
    stage: checklistData.stage || 'Structure',
    inspectionType: checklistData.inspectionType || 'Reinforcement Pre-Pour Inspection',
    inspectedBy: checklistData.inspectedBy || 'Quality Engineer',
    inspectionDate: checklistData.inspectionDate || new Date().toISOString(),
    items: Array.isArray(checklistData.items) ? checklistData.items : [],
    snagList: Array.isArray(checklistData.snagList) ? checklistData.snagList : [],
    status: checklistData.status || 'passed',
    remarks: checklistData.remarks || 'Inspection completed successfully.',
  }
  const docId = await saveStandardDoc(orgId, 'quality_checklists', payload)
  return { id: docId, ...payload }
}

export async function updateQualityChecklist(orgId, checklistId, updates) {
  await updateStandardDoc(orgId, 'quality_checklists', checklistId, updates)
}

// ------------------------------------------------------------------------------------------------
// Safety Incidents (/organisation/{orgId}/safety_incidents)
// ------------------------------------------------------------------------------------------------

export async function fetchSafetyIncidents(orgId) {
  return fetchWithFallback(orgId, 'safety_incidents')
}

export function subscribeSafetyIncidents(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'safety_incidents', onData, onError)
}

export async function recordSafetyIncident(orgId, incidentData) {
  const payload = {
    projectId: incidentData.projectId || incidentData.siteId || '',
    projectName: incidentData.projectName || incidentData.siteName || 'Site',
    date: incidentData.date || new Date().toISOString(),
    description: incidentData.description || '',
    severity: incidentData.severity || 'minor', // minor, major, critical
    injuredPerson: incidentData.injuredPerson || 'None',
    actionTaken: incidentData.actionTaken || '',
    reportedBy: incidentData.reportedBy || 'Safety Officer',
    status: incidentData.status || 'resolved',
  }
  const docId = await saveStandardDoc(orgId, 'safety_incidents', payload)
  return { id: docId, ...payload }
}
