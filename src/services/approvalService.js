import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * 3-Tier Payment Approval Lifecycle Service
 * Complies with Section 4.2.7 & 4.3.10 of Architecture Specification
 */

export async function fetchApprovals(orgId) {
  return fetchWithFallback(orgId, 'approvals')
}

export function subscribeApprovals(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'approvals', onData, onError)
}

export async function createApprovalRequest(orgId, claimData) {
  const payload = {
    title: claimData.title || claimData.payeeName || 'Contractor Payment Claim',
    payeeName: claimData.payeeName || claimData.contractorName || 'Contractor / Vendor',
    category: claimData.category || 'Contractor Progress Bill',
    amount: Number(claimData.amount || claimData.claimedAmount) || 0,
    claimedAmount: Number(claimData.amount || claimData.claimedAmount) || 0,
    projectId: claimData.projectId || claimData.siteId || '',
    projectName: claimData.projectName || claimData.siteName || 'Site',
    stage: claimData.stage || 'Structure',
    submittedBy: claimData.submittedBy || 'Site Lead',
    submittedAt: new Date().toISOString(),
    status: 'pending_manager_review', // pending_manager_review, pending_org_approval, pending_manager_clearance, cleared, rejected
    approvalStatus: 'pending_manager_review',
    tier1_managerReview: null,
    tier2_orgApproval: null,
    tier3_managerClearance: null,
  }

  const docId = await saveStandardDoc(orgId, 'approvals', payload)
  return { id: docId, ...payload }
}

// Tier 1: Manager Technical Verification
export async function executeTier1Review(orgId, approvalId, managerName, isApproved, notes = '') {
  const nextStatus = isApproved ? 'pending_org_approval' : 'rejected'
  await updateStandardDoc(orgId, 'approvals', approvalId, {
    status: nextStatus,
    approvalStatus: nextStatus,
    tier1_managerReview: {
      reviewedBy: managerName,
      reviewedAt: new Date().toISOString(),
      isApproved,
      notes: notes || (isApproved ? 'Physical work and measurement verified.' : 'Measurement discrepancy.'),
    },
  })
}

// Tier 2: Organization Executive Authorization
export async function executeTier2OrgApproval(orgId, approvalId, orgAdminName, isApproved, remarks = '') {
  const nextStatus = isApproved ? 'pending_manager_clearance' : 'rejected'
  await updateStandardDoc(orgId, 'approvals', approvalId, {
    status: isApproved ? 'approved' : 'rejected',
    approvalStatus: nextStatus,
    tier2_orgApproval: {
      approvedBy: orgAdminName,
      approvedAt: new Date().toISOString(),
      isApproved,
      remarks: remarks || (isApproved ? 'Corporate budget authorization granted.' : 'Rejected by finance head.'),
    },
  })
}

// Tier 3: Manager Final Banking Clearance
export async function executeTier3Clearance(orgId, approvalId, managerName, utrReference) {
  await updateStandardDoc(orgId, 'approvals', approvalId, {
    status: 'cleared',
    approvalStatus: 'cleared',
    tier3_managerClearance: {
      clearedBy: managerName,
      clearedAt: new Date().toISOString(),
      utrReference,
      isCleared: true,
    },
  })
}
