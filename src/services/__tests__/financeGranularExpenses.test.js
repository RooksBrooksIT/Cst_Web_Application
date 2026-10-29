import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { processRawGranularExpenseDocs } from '../financeService.js'

describe('Finance Itemized Expense Ledger & Granular Expenses Unit Tests', () => {
  const targetSite = {
    id: 'ST001',
    siteId: 'ST001',
    siteCode: 'ST001',
    siteName: 'Testing Site',
    projectName: 'Testing Site',
  }

  describe('Deduplication of Mirrored Collections', () => {
    it('prevents duplicate entries when managerExpenses and managerEntries mirror the exact same document ID', () => {
      const mirroredDocId = 'ST001_Testing_28102026'
      const payload = {
        siteId: 'ST001',
        siteName: 'Testing Site',
        totalAmount: 12000,
        amount: 12000,
        remarks: 'Structural steel delivery',
        expenseDate: '2026-10-28',
        bills: [
          { billNo: 'ST-001', vendor: 'Jindal Steel', amount: 12000, quantity: 4 },
        ],
      }

      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [{ id: mirroredDocId, data: payload }],
        },
        {
          col: 'managerEntries',
          category: 'Manager Approved',
          docs: [{ id: mirroredDocId, data: payload }],
        },
      ]

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs,
        siteId: 'ST001',
        siteObj: targetSite,
      })

      // Must produce exactly 1 ledger entry, not 2
      assert.equal(results.length, 1)
      assert.equal(results[0].id, mirroredDocId)
      assert.equal(results[0].amount, 12000)
      assert.equal(results[0].category, 'Manager Direct Expense')
      assert.equal(results[0].billNo, 'ST-001')
    })

    it('prevents duplicate entries when organizationExpenses and organizationEntries mirror the same expenseId', () => {
      const orgDocId = 'EXP_ORG_9981'
      const payload = {
        siteId: 'ST001',
        siteName: 'Testing Site',
        expenseId: 'EXP_ORG_9981',
        totalAmount: 4500,
        vendor: 'UltraTech Cement',
        billNo: 'INV-4410',
        expenseDate: '2026-10-25',
      }

      const sourcesWithDocs = [
        {
          col: 'organizationExpenses',
          category: 'Organization Expense',
          docs: [{ id: orgDocId, data: payload }],
        },
        {
          col: 'organizationEntries',
          category: 'Organization Bill',
          docs: [{ id: orgDocId, data: payload }],
        },
      ]

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs,
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results.length, 1)
      assert.equal(results[0].id, orgDocId)
      assert.equal(results[0].amount, 4500)
      assert.equal(results[0].category, 'Organization Expense')
      assert.equal(results[0].billNo, 'INV-4410')
    })

    it('prevents duplicates between pettyCashTransactions and petty_cash_expenses with identical voucher/transaction IDs', () => {
      const voucherId = 'PC_VOU_005'
      const payload = {
        siteId: 'ST001',
        siteName: 'Testing Site',
        voucherId,
        amount: 850,
        description: 'Site tea and biscuits',
        date: '2026-10-20',
      }

      const sourcesWithDocs = [
        {
          col: 'pettyCashTransactions',
          category: 'Petty Cash',
          docs: [{ id: voucherId, data: payload }],
        },
        {
          col: 'petty_cash_expenses',
          category: 'Petty Cash Voucher',
          docs: [{ id: voucherId, data: payload }],
        },
      ]

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs,
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results.length, 1)
      assert.equal(results[0].amount, 850)
    })
  })

  describe('Preservation of Genuinely Different Manager Entries', () => {
    it('displays Manager Direct Expense and Manager Approved entries separately when they represent genuinely different expense records', () => {
      const mgrDirectDoc = {
        id: 'MGR_DIRECT_101',
        data: {
          siteId: 'ST001',
          totalAmount: 6000,
          description: 'Emergency generator diesel',
          vendor: 'Bharat Petroleum',
          billNo: 'BP-102',
          date: '2026-10-21',
        },
      }

      const mgrApprovedDoc = {
        id: 'MGR_APPROVED_202',
        data: {
          siteId: 'ST001',
          totalAmount: 9500,
          description: 'Approved electrical wiring contractor payment',
          vendor: 'PowerTech Electricals',
          billNo: 'PT-889',
          date: '2026-10-22',
        },
      }

      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [mgrDirectDoc],
        },
        {
          col: 'managerEntries',
          category: 'Manager Approved',
          docs: [mgrApprovedDoc],
        },
      ]

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs,
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results.length, 2, 'Both genuine records must be displayed')
      const directEntry = results.find((r) => r.id === 'MGR_DIRECT_101')
      const approvedEntry = results.find((r) => r.id === 'MGR_APPROVED_202')

      assert.ok(directEntry, 'Direct entry must be present')
      assert.equal(directEntry.category, 'Manager Direct Expense')
      assert.equal(directEntry.amount, 6000)
      assert.equal(directEntry.billNo, 'BP-102')

      assert.ok(approvedEntry, 'Approved entry must be present')
      assert.equal(approvedEntry.category, 'Manager Approved')
      assert.equal(approvedEntry.amount, 9500)
      assert.equal(approvedEntry.billNo, 'PT-889')

      const totalAmount = results.reduce((sum, r) => sum + r.amount, 0)
      assert.equal(totalAmount, 15500, 'Total must equal sum of distinct genuine records')
    })
  })

  describe('Bill Number Resolution Parity', () => {
    it('retrieves bill number from bills array when present', () => {
      const doc = {
        id: 'EXP_BILL_01',
        data: {
          siteId: 'ST001',
          totalAmount: 3000,
          bills: [
            { billNo: 'BILL-883', amount: 3000, vendor: 'Plumbing Supply' },
          ],
        },
      }

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs: [{ col: 'organizationExpenses', category: 'Organization Expense', docs: [doc] }],
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results[0].billNo, 'BILL-883')
    })

    it('retrieves bill number from document-level billNo / invoiceNo', () => {
      const doc = {
        id: 'EXP_BILL_02',
        data: {
          siteId: 'ST001',
          amount: 5000,
          invoiceNo: 'INV-2026-X',
          vendorName: 'Hardware Store',
        },
      }

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs: [{ col: 'organizationExpenses', category: 'Organization Expense', docs: [doc] }],
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results[0].billNo, 'INV-2026-X')
    })

    it('displays N/A rather than generating a dummy value when no bill number exists', () => {
      const doc = {
        id: 'EXP_NO_BILL',
        data: {
          siteId: 'ST001',
          amount: 2500,
          description: 'Local labour cash voucher',
        },
      }

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs: [{ col: 'organizationExpenses', category: 'Organization Expense', docs: [doc] }],
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results[0].billNo, 'N/A')
      assert.notEqual(results[0].billNo, '001')
      assert.notEqual(results[0].billNo, 'BILL-1')
    })
  })

  describe('Itemized Bills Expansion & Totals Parity', () => {
    it('expands multi-bill documents into individual ledger rows with exact amounts and bill numbers', () => {
      const parentDocId = 'ST001_Testing_29102026'
      const doc = {
        id: parentDocId,
        data: {
          siteId: 'ST001',
          totalAmount: 8000,
          projectStage: 'Superstructure',
          bills: [
            {
              id: 'b1',
              billNo: 'INV-101',
              amount: 5000,
              vendor: 'Ultratech Cement',
              description: 'Cement 50 Bags',
              quantity: 50,
            },
            {
              id: 'b2',
              billNo: 'INV-102',
              amount: 3000,
              vendor: 'River Sand Suppliers',
              description: 'River Sand 2 Loads',
              quantity: 2,
            },
          ],
        },
      }

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs: [{ col: 'organizationExpenses', category: 'Organization Expense', docs: [doc] }],
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results.length, 2, 'Should create 2 itemized ledger rows')

      const row1 = results[0]
      const row2 = results[1]

      assert.equal(row1.billNo, 'INV-101')
      assert.equal(row1.amount, 5000)
      assert.equal(row1.vendorName, 'Ultratech Cement')
      assert.equal(row1.quantity, 50)
      assert.equal(row1.refId, `${parentDocId} (#1)`)

      assert.equal(row2.billNo, 'INV-102')
      assert.equal(row2.amount, 3000)
      assert.equal(row2.vendorName, 'River Sand Suppliers')
      assert.equal(row2.quantity, 2)
      assert.equal(row2.refId, `${parentDocId} (#2)`)

      const sumAmount = results.reduce((acc, r) => acc + r.amount, 0)
      assert.equal(sumAmount, 8000, 'Sum of itemized entries must exactly match parent document total')
    })
  })

  describe('Strict Site Matching Isolation', () => {
    it('excludes records belonging to a different site', () => {
      const otherSiteDoc = {
        id: 'OTHER_SITE_01',
        data: {
          siteId: 'ST999_OtherSite',
          siteName: 'Other Commercial Site',
          totalAmount: 50000,
          description: 'Crane rental',
        },
      }

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs: [{ col: 'organizationExpenses', category: 'Organization Expense', docs: [otherSiteDoc] }],
        siteId: 'ST001',
        siteObj: targetSite,
      })

      assert.equal(results.length, 0, 'Must not include records for other sites')
    })
  })
})

