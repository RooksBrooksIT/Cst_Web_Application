import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Tools & Machinery Service
 * Complies with Section 3.11 of Architecture Specification
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

export async function fetchTools(orgId) {
  return fetchWithFallback(orgId, 'tools')
}

export function subscribeTools(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'tools', onData, onError)
}

export async function createTool(orgId, toolData) {
  const assetTag = toolData.assetTag || toolData.modelSerial || `AST-${Date.now().toString().slice(-4)}`
  const payload = {
    name: toolData.name || toolData.toolName || '',
    toolName: toolData.name || toolData.toolName || '',
    modelSerial: assetTag,
    assetTag,
    category: toolData.category || 'Power Tools',
    ownershipType: toolData.ownershipType || 'owned',
    currentStatus: toolData.currentStatus || toolData.status || 'in_yard',
    status: toolData.currentStatus || toolData.status || 'Active',
    condition: toolData.condition || 'Good',
    currentProjectId: toolData.currentProjectId || toolData.siteId || '',
    currentProjectName: toolData.currentProjectName || toolData.siteName || 'Central Yard',
    assignedTo: toolData.assignedTo || 'Store Keeper',
    allocationHistory: Array.isArray(toolData.allocationHistory) ? toolData.allocationHistory : [],
  }
  const docId = await saveStandardDoc(orgId, 'tools', payload)
  return { id: docId, ...payload }
}

export async function updateTool(orgId, toolId, updates) {
  await updateStandardDoc(orgId, 'tools', toolId, updates)
}

export async function deleteTool(orgId, toolId) {
  return deleteStandardDoc(orgId, 'tools', toolId)
}

export async function allocateTool(orgId, toolId, allocationData) {
  const historyEntry = {
    allocationId: `ALC-${Date.now()}`,
    fromSiteId: allocationData.fromSiteId || 'Central Yard',
    toSiteId: allocationData.toProjectId || allocationData.siteId || '',
    toSiteName: allocationData.toProjectName || allocationData.siteName || '',
    dispatchedBy: allocationData.dispatchedBy || 'Manager',
    dispatchedDate: new Date().toISOString(),
    assignedCustodian: allocationData.assignedTo || 'Site Lead',
    conditionOnDispatch: allocationData.condition || 'Good',
  }

  await updateStandardDoc(orgId, 'tools', toolId, {
    currentProjectId: allocationData.toProjectId || allocationData.siteId || '',
    currentProjectName: allocationData.toProjectName || allocationData.siteName || '',
    currentStatus: 'allocated_to_site',
    assignedTo: allocationData.assignedTo || 'Site Lead',
    condition: allocationData.condition || 'Good',
    lastAllocation: historyEntry,
  })
}
