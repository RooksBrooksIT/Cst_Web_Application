import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Approval Logs Telemetry & Filtering Unit Tests', () => {
  const sampleRequisitions = [
    {
      id: 'REQ_MAT_101',
      stream: 'MATERIALS',
      category: 'Material Request',
      title: 'Material Request: Cement (50 Bags)',
      siteId: 'ST001',
      siteName: 'Riverside Commercial Complex',
      requester: 'Supervisor John',
      verifier: 'Manager Alex',
      status: 'pending_manager_clearance',
      approvalStatus: 'pending_manager_clearance',
      currentStep: 3,
      orgApproved: true,
      orgApprovedBy: 'Organization Admin',
      orgApprovedAt: '2026-10-10T09:00:00Z',
      orgApprovalRemarks: 'Approved as per sanctioned site budget.',
      approvalHistory: [
        { step: '1. Supervisor Submission', actorName: 'Supervisor John', action: 'Submitted' },
        { step: '2. Manager Verification', actorName: 'Manager Alex', action: 'Verified' },
        { step: '3. Organization Authorization', actorName: 'Organization Admin', action: 'Approved by Organization HQ', remarks: 'Approved as per sanctioned site budget.' },
      ],
    },
    {
      id: 'REQ_TOOL_202',
      stream: 'TOOLS',
      category: 'Tool & Equipment',
      title: 'Tool Request: Concrete Mixer',
      siteId: 'ST002',
      siteName: 'Metro Extension Line',
      requester: 'Supervisor Dave',
      verifier: 'Manager Alex',
      status: 'pending_org_approval',
      approvalStatus: 'pending_org_approval',
      currentStep: 2,
      orgApproved: false,
    },
    {
      id: 'REQ_PETTY_303',
      stream: 'PETTY_CASH',
      category: 'Petty Cash Request',
      title: 'Petty Cash Request: ₹15,000',
      siteId: 'ST001',
      siteName: 'Riverside Commercial Complex',
      requester: 'Supervisor John',
      verifier: 'Manager Alex',
      status: 'AWAITING_DISBURSEMENT',
      approvalStatus: 'approved',
      currentStep: 3,
      orgApproved: true,
      orgApprovedBy: 'HQ Finance Officer',
      orgApprovedAt: '2026-10-10T10:00:00Z',
      orgApprovalRemarks: 'Authorize urgent cash disbursement.',
      approvalHistory: [
        { step: '3. Organization Authorization', actorName: 'HQ Finance Officer', action: 'Authorized by HQ (₹15,000)' },
      ],
    },
    {
      id: 'REQ_REJ_404',
      stream: 'MATERIALS',
      category: 'Material Request',
      title: 'Material Request: Steel Rods',
      siteId: 'ST001',
      siteName: 'Riverside Commercial Complex',
      requester: 'Supervisor John',
      status: 'rejected_by_org',
      approvalStatus: 'rejected_by_org',
      currentStep: -1,
      orgApproved: false,
      rejectedBy: 'Organization Admin',
      rejectionReason: 'Exceeds monthly material ceiling.',
    },
  ]

  function isAuthorizedAndForwarded(item) {
    if (!item) return false
    const st = String(item.status || item.approvalStatus || '').toLowerCase()
    if (item.orgApproved === true) return true
    if (['pending_manager_clearance', 'awaiting_disbursement'].includes(st)) return true
    if (['approved', 'cleared', 'disbursed', 'received'].includes(st) && (item.currentStep >= 3 || item.orgApprovedAt || item.orgApprovedBy)) return true
    if (Array.isArray(item.approvalHistory) && item.approvalHistory.some((h) =>
      (String(h.step).includes('3') || String(h.actorRole).toLowerCase() === 'organization') &&
      !String(h.action).toLowerCase().includes('reject') &&
      !String(h.action).toLowerCase().includes('decline')
    )) {
      return true
    }
    return false
  }

  function isDeclinedByHq(item) {
    if (!item) return false
    const st = String(item.status || item.approvalStatus || '').toLowerCase()
    if (['rejected_by_org', 'rejected_by_organization'].includes(st)) return true
    if (item.orgApproved === false && (item.rejectedBy || item.rejectionReason || item.orgRejectedBy)) return true
    if (Array.isArray(item.approvalHistory) && item.approvalHistory.some((h) =>
      (String(h.step).includes('3') || String(h.actorRole).toLowerCase() === 'organization') &&
      (String(h.action).toLowerCase().includes('reject') || String(h.action).toLowerCase().includes('decline'))
    )) {
      return true
    }
    return false
  }

  describe('Classification of Approval Records', () => {
    it('identifies authorized and forwarded requests across Materials and Petty Cash', () => {
      const authorized = sampleRequisitions.filter(isAuthorizedAndForwarded)
      assert.strictEqual(authorized.length, 2)
      assert.deepStrictEqual(authorized.map((i) => i.id), ['REQ_MAT_101', 'REQ_PETTY_303'])
    })

    it('identifies declined requests accurately', () => {
      const declined = sampleRequisitions.filter(isDeclinedByHq)
      assert.strictEqual(declined.length, 1)
      assert.strictEqual(declined[0].id, 'REQ_REJ_404')
    })

    it('excludes pending requests awaiting HQ action from authorized logs', () => {
      const authorized = sampleRequisitions.filter(isAuthorizedAndForwarded)
      assert.strictEqual(authorized.some((i) => i.id === 'REQ_TOOL_202'), false)
    })
  })

  describe('Filter & Search Operations on Approval Logs', () => {
    const authorized = sampleRequisitions.filter(isAuthorizedAndForwarded)

    it('filters approval logs by siteId', () => {
      const siteFiltered = authorized.filter((i) => i.siteId === 'ST001')
      assert.strictEqual(siteFiltered.length, 2)
    })

    it('filters approval logs by category / stream', () => {
      const materialsOnly = authorized.filter((i) => i.stream === 'MATERIALS')
      assert.strictEqual(materialsOnly.length, 1)
      assert.strictEqual(materialsOnly[0].id, 'REQ_MAT_101')

      const pettyCashOnly = authorized.filter((i) => i.stream === 'PETTY_CASH')
      assert.strictEqual(pettyCashOnly.length, 1)
      assert.strictEqual(pettyCashOnly[0].id, 'REQ_PETTY_303')
    })

    it('searches by request ID, supervisor, approver, or remarks', () => {
      const q1 = 'cement'.toLowerCase()
      const search1 = authorized.filter((i) =>
        i.title.toLowerCase().includes(q1) || i.orgApprovalRemarks?.toLowerCase().includes(q1)
      )
      assert.strictEqual(search1.length, 1)
      assert.strictEqual(search1[0].id, 'REQ_MAT_101')

      const q2 = 'finance'.toLowerCase()
      const search2 = authorized.filter((i) =>
        i.orgApprovedBy?.toLowerCase().includes(q2)
      )
      assert.strictEqual(search2.length, 1)
      assert.strictEqual(search2[0].id, 'REQ_PETTY_303')
    })
  })
})
