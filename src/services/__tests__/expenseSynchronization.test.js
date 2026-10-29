import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseExpenseAmount,
  parseExpenseDate,
  normalizeExpenseRecord,
  isExpenseMatchingSite,
  resolveProjectCategoryOrStage,
} from '../expenseNormalizationService.js'

describe('Expense Synchronization & Normalization Tests', () => {
  describe('parseExpenseAmount', () => {
    it('parses numeric values, formatted strings, and currency signs accurately', () => {
      assert.equal(parseExpenseAmount(1500), 1500)
      assert.equal(parseExpenseAmount('1500'), 1500)
      assert.equal(parseExpenseAmount('1,500.50'), 1500.5)
      assert.equal(parseExpenseAmount('₹ 2,450.00'), 2450)
      assert.equal(parseExpenseAmount(null), 0)
      assert.equal(parseExpenseAmount(undefined), 0)
      assert.equal(parseExpenseAmount('invalid'), 0)
    })
  })

  describe('parseExpenseDate', () => {
    it('parses Firestore timestamp objects with seconds', () => {
      const ts = { seconds: 1760034600 }
      const parsed = parseExpenseDate(ts)
      assert.ok(parsed instanceof Date)
      assert.equal(parsed.getTime(), 1760034600 * 1000)
    })

    it('parses ISO date strings and Date instances', () => {
      const now = new Date()
      assert.equal(parseExpenseDate(now).getTime(), now.getTime())
      const isoStr = '2026-10-09T00:00:00.000Z'
      assert.equal(parseExpenseDate(isoStr).toISOString(), isoStr)
    })

    it('extracts date from document ID ending in ddMMyyyy (e.g. ST001_Testing_09102026)', () => {
      const parsed = parseExpenseDate(null, 'ST001_Testing_09102026')
      assert.ok(parsed instanceof Date)
      assert.equal(parsed.getFullYear(), 2026)
      assert.equal(parsed.getMonth(), 9) // October (0-indexed: 9)
      assert.equal(parsed.getDate(), 9)
    })
  })

  describe('normalizeExpenseRecord - Mobile Organization Expense', () => {
    it('accurately maps mobile organization entry to web schema while preserving raw values', () => {
      const rawMobileDoc = {
        totalAmount: 1500,
        entryDate: { seconds: 1760034600 },
        projectStage: 'Ground',
        projectName: 'Testing',
        siteId: 'ST001_Testing',
        supervisorName: 'Murugan',
        bills: [
          {
            billAmount: 1500,
            billVendor: 'sharan',
            billNo: '001',
            billCopy: 'https://firebasestorage.googleapis.com/test-receipt.jpg',
            billDate: { seconds: 1760034600 },
          },
        ],
      }

      const normalized = normalizeExpenseRecord('ST001_Testing_09102026', rawMobileDoc, 'Organization')

      // Key IDs and identity
      assert.equal(normalized.id, 'ST001_Testing_09102026')
      assert.equal(normalized.expenseId, 'ST001_Testing_09102026')

      // Amounts match exactly
      assert.equal(normalized.totalAmount, 1500)
      assert.equal(normalized.amount, 1500)

      // Project & Site naming
      assert.equal(normalized.siteId, 'ST001_Testing')
      assert.equal(normalized.siteName, 'Testing')
      assert.equal(normalized.projectName, 'Testing')
      assert.equal(normalized.projectStage, 'Ground')

      // Dates
      assert.ok(normalized.date instanceof Date)
      assert.equal(parseExpenseDate(normalized.entryDate).getTime(), normalized.date.getTime())

      // Raiser context
      assert.equal(normalized.supervisorName, 'Murugan')
      assert.equal(normalized.raiserName, 'Murugan')

      // Bills itemization & receipts
      assert.equal(normalized.bills.length, 1)
      const b = normalized.bills[0]
      assert.equal(b.amount, 1500)
      assert.equal(b.billAmount, 1500)
      assert.equal(b.vendor, 'sharan')
      assert.equal(b.billVendor, 'sharan')
      assert.equal(b.billNo, '001')
      assert.equal(b.billUrl, 'https://firebasestorage.googleapis.com/test-receipt.jpg')
      assert.equal(b.billCopy, 'https://firebasestorage.googleapis.com/test-receipt.jpg')
      assert.equal(b.imageUrl, 'https://firebasestorage.googleapis.com/test-receipt.jpg')
    })
  })

  describe('normalizeExpenseRecord - Mobile Manager Expense', () => {
    it('accurately maps mobile manager entry with all manager and vendor details', () => {
      const rawManagerDoc = {
        totalAmount: '4500',
        entryDate: { seconds: 1760034600 },
        projectStage: 'Superstructure & RCC Slabs',
        projectName: 'Riverside Tower',
        siteId: 'PR001_ST001_Riverside',
        managerId: 'MGR_001',
        managerName: 'Karthik',
        userRole: 'Manager',
        bills: [
          {
            billAmount: '4500',
            billVendor: 'Apex QC Labs',
            billNo: 'INV-883',
            billCopy: 'https://firebasestorage.googleapis.com/apex-qc.png',
            description: 'Structural Testing Lab Fee',
          },
        ],
      }

      const normalized = normalizeExpenseRecord('MGR_EXP_001', rawManagerDoc, 'Manager')

      assert.equal(normalized.totalAmount, 4500)
      assert.equal(normalized.managerName, 'Karthik')
      assert.equal(normalized.managerId, 'MGR_001')
      assert.equal(normalized.bills[0].amount, 4500)
      assert.equal(normalized.bills[0].vendor, 'Apex QC Labs')
      assert.equal(normalized.bills[0].billUrl, 'https://firebasestorage.googleapis.com/apex-qc.png')
    })
  })

  describe('isExpenseMatchingSite', () => {
    const sites = [
      {
        id: 'PR001_ST001_Testing',
        siteName: 'Testing Site',
        projectName: 'Testing',
        siteCode: 'ST001',
      },
      {
        id: 'PR002_ST002_Riverside',
        siteName: 'Riverside Block',
        projectName: 'Riverside',
        siteCode: 'ST002',
      },
    ]

    it('matches when filter is "ALL"', () => {
      const expense = { siteId: 'ST001_Testing' }
      assert.equal(isExpenseMatchingSite(expense, 'ALL', sites), true)
      assert.equal(isExpenseMatchingSite(expense, '', sites), true)
    })

    it('matches compound web siteId filter with simple mobile siteId', () => {
      const mobileExpense = { siteId: 'ST001_Testing' }
      assert.equal(isExpenseMatchingSite(mobileExpense, 'PR001_ST001_Testing', sites), true)
    })

    it('matches simple filter with compound expense siteId', () => {
      const webExpense = { siteId: 'PR001_ST001_Testing' }
      assert.equal(isExpenseMatchingSite(webExpense, 'ST001_Testing', sites), true)
    })

    it('matches by site code or site name', () => {
      const expense = { siteId: 'ST001', siteName: 'Testing Site' }
      assert.equal(isExpenseMatchingSite(expense, 'PR001_ST001_Testing', sites), true)
    })

    it('returns false when site does not match', () => {
      const expense = { siteId: 'ST002_Riverside' }
      assert.equal(isExpenseMatchingSite(expense, 'PR001_ST001_Testing', sites), false)
    })
  })

  describe('resolveProjectCategoryOrStage - Auto-Fill Backend Category/Stage', () => {
    it('accurately resolves projectCategory from real backend document data', () => {
      const projectDoc = {
        siteName: 'Testing',
        projectName: 'Testing',
        projectCategory: 'House',
        projectType: 'House',
        projectStage: 'Ground',
        currentStage: 'Ground',
      }
      assert.equal(resolveProjectCategoryOrStage(projectDoc), 'House')
    })

    it('accurately resolves Office category for commercial sites', () => {
      const projectDoc = {
        siteName: 'Rooks And Brooks',
        projectName: 'Rooks And Brooks',
        projectCategory: 'Office',
        projectStage: 'Foundation',
      }
      assert.equal(resolveProjectCategoryOrStage(projectDoc), 'Office')
    })

    it('falls back to projectStage or currentStage when projectCategory is not set', () => {
      const stageOnlyDoc = {
        siteName: 'Substation Site',
        projectStage: 'Deep Excavation',
      }
      assert.equal(resolveProjectCategoryOrStage(stageOnlyDoc), 'Deep Excavation')
    })

    it('returns empty string when site is null, undefined, or empty object', () => {
      assert.equal(resolveProjectCategoryOrStage(null), '')
      assert.equal(resolveProjectCategoryOrStage(undefined), '')
      assert.equal(resolveProjectCategoryOrStage({}), '')
    })
  })

  describe('Manager Expenses Mobile Parity & Deterministic ID', () => {
    it('formatToDDMMYYYY accurately formats Date objects and ISO strings to ddMMyyyy', async () => {
      const { formatToDDMMYYYY } = await import('../managerExpenseService.js')
      
      // Date string YYYY-MM-DD
      assert.equal(formatToDDMMYYYY('2026-10-28'), '28102026')
      assert.equal(formatToDDMMYYYY('2026-05-09'), '09052026')
      
      // Date instance
      const d = new Date(2026, 9, 28) // 28 Oct 2026
      assert.equal(formatToDDMMYYYY(d), '28102026')
      
      // Firestore timestamp object
      const ts = { seconds: 1793145600 } // timestamp
      const res = formatToDDMMYYYY(ts)
      assert.ok(res.length === 8)
    })

    it('generates deterministic Document ID matching ST001_newProject_28102026 format', async () => {
      const { generateManagerExpenseDocId, resolveCanonicalSiteKey } = await import('../managerExpenseService.js')
      
      // 1. From short siteCode and projectName
      const docId1 = generateManagerExpenseDocId({
        siteId: 'ST001',
        projectName: 'newProject',
        expenseDate: '2026-10-28',
      })
      assert.equal(docId1, 'ST001_newProject_28102026')

      // 2. From compound project ID (must strip PR001_ prefix)
      const docId2 = generateManagerExpenseDocId({
        siteId: 'PR001_ST001_newProject',
        expenseDate: '2026-10-28',
      })
      assert.equal(docId2, 'ST001_newProject_28102026')
      assert.ok(!docId2.startsWith('PR001_'), 'Document ID must NOT include PR001_ project prefix')

      // 3. From already canonical siteDocId ST001_newProject
      const docId3 = generateManagerExpenseDocId({
        siteId: 'ST001_newProject',
        expenseDate: '2026-10-28',
      })
      assert.equal(docId3, 'ST001_newProject_28102026')

      // 4. Verify canonicalSiteKey for totalSiteExpensesPerDay remains exactly ST001_newProject (no date appended)
      const totalSiteExpensesDocId = resolveCanonicalSiteKey({
        siteId: 'PR001_ST001_newProject',
        siteCode: 'ST001',
        projectName: 'newProject',
      })
      assert.equal(totalSiteExpensesDocId, 'ST001_newProject', 'totalSiteExpensesPerDay docId must remain ST001_newProject')
      assert.ok(!totalSiteExpensesDocId.includes('28102026'), 'totalSiteExpensesPerDay docId must NOT contain date stamp')
      assert.ok(!totalSiteExpensesDocId.startsWith('PR001_'), 'totalSiteExpensesPerDay docId must NOT start with PR001_')
    })

    it('normalizes mobile manager expense document with itemized bills to web schema', () => {
      const rawMobileManagerDoc = {
        siteId: 'ST001_Testing',
        projectName: 'Testing Site',
        projectStage: 'Superstructure',
        supervisorName: 'SUP_001',
        managerId: 'MGR_001',
        managerName: 'John Doe',
        raisedBy: 'MGR_001',
        raisedByName: 'John Doe',
        userRole: 'Manager',
        entryDate: { seconds: 1761652800 },
        totalAmount: 18500,
        remarks: 'Emergency steel reinforcement delivery',
        bills: [
          {
            billNo: 'INV-101',
            billVendor: 'Tata Steel Hub',
            vendor: 'Tata Steel Hub',
            billAmount: 12500,
            amount: 12500,
            billCopy: 'https://firebasestorage.googleapis.com/bill1.jpg',
            billUrl: 'https://firebasestorage.googleapis.com/bill1.jpg',
            description: 'TMT Bars 12mm',
            raisedBy: 'MGR_001',
            raisedByName: 'John Doe',
            userRole: 'Manager',
          },
          {
            billNo: 'INV-102',
            billVendor: 'Local Freight Logistics',
            vendor: 'Local Freight Logistics',
            billAmount: 6000,
            amount: 6000,
            billCopy: 'https://firebasestorage.googleapis.com/bill2.jpg',
            billUrl: 'https://firebasestorage.googleapis.com/bill2.jpg',
            description: 'Transport & crane unloading',
            raisedBy: 'MGR_001',
            raisedByName: 'John Doe',
            userRole: 'Manager',
          },
        ],
      }

      const normalized = normalizeExpenseRecord('ST001_Testing_28102026', rawMobileManagerDoc, 'Manager')

      assert.equal(normalized.id, 'ST001_Testing_28102026')
      assert.equal(normalized.siteId, 'ST001_Testing')
      assert.equal(normalized.totalAmount, 18500)
      assert.equal(normalized.bills.length, 2)
      assert.equal(normalized.bills[0].billNo, 'INV-101')
      assert.equal(normalized.bills[0].billAmount, 12500)
      assert.equal(normalized.bills[1].billNo, 'INV-102')
      assert.equal(normalized.bills[1].billAmount, 6000)
      assert.equal(normalized.managerName, 'John Doe')
      assert.equal(normalized.remarks, 'Emergency steel reinforcement delivery')
    })

    it('generates deterministic Organization Expenses Document ID matching ST001_newProject_28102026 format', async () => {
      const {
        generateOrganizationExpenseDocId,
        resolveCanonicalSiteKey,
      } = await import('../organizationExpenseService.js')

      // 1. From short siteCode and projectName
      const docId1 = generateOrganizationExpenseDocId({
        siteId: 'ST001',
        projectName: 'newProject',
        expenseDate: '2026-10-28',
      })
      assert.equal(docId1, 'ST001_newProject_28102026')
      assert.ok(!docId1.startsWith('OEXP_'), 'Must NOT start with OEXP_')
      assert.ok(!docId1.includes('undefined'), 'Must not have undefined')

      // 2. From compound project ID (must strip PR001_ prefix)
      const docId2 = generateOrganizationExpenseDocId({
        siteId: 'PR001_ST001_newProject',
        expenseDate: '2026-10-28',
      })
      assert.equal(docId2, 'ST001_newProject_28102026')
      assert.ok(!docId2.startsWith('PR001_'), 'Document ID must NOT include PR001_ project prefix')
      assert.ok(!docId2.startsWith('OEXP_'), 'Document ID must NOT include OEXP_ prefix')

      // 3. From already canonical siteDocId ST001_newProject
      const docId3 = generateOrganizationExpenseDocId({
        siteId: 'ST001_newProject',
        expenseDate: '2026-10-28',
      })
      assert.equal(docId3, 'ST001_newProject_28102026')

      // 4. Verify canonicalSiteKey for totalSiteExpensesPerDay remains exactly ST001_newProject (no date appended)
      const totalSiteExpensesDocId = resolveCanonicalSiteKey({
        siteId: 'PR001_ST001_newProject',
        siteCode: 'ST001',
        projectName: 'newProject',
      })
      assert.equal(totalSiteExpensesDocId, 'ST001_newProject', 'totalSiteExpensesPerDay docId must remain ST001_newProject')
      assert.ok(!totalSiteExpensesDocId.includes('28102026'), 'totalSiteExpensesPerDay docId must NOT contain date stamp')
      assert.ok(!totalSiteExpensesDocId.startsWith('PR001_'), 'totalSiteExpensesPerDay docId must NOT start with PR001_')
    })

    it('normalizes organization expense document with ST001_newProject_28102026 ID format to web schema', () => {
      const rawOrgDoc = {
        siteId: 'ST001_newProject',
        projectName: 'newProject',
        projectStage: 'Structure Work',
        raiserId: 'org_admin',
        raiserName: 'Organization Admin',
        userRole: 'Organization',
        expenseDate: { seconds: 1761652800 },
        totalAmount: 25000,
        remarks: 'Direct cement order',
        bills: [
          {
            billNo: 'BILL-001',
            billVendor: 'ACC Cement Depot',
            vendor: 'ACC Cement Depot',
            billAmount: 25000,
            amount: 25000,
            billCopy: 'https://firebasestorage.googleapis.com/org_bill1.jpg',
            billUrl: 'https://firebasestorage.googleapis.com/org_bill1.jpg',
            description: '100 Bags Cement',
          },
        ],
      }

      const normalized = normalizeExpenseRecord('ST001_newProject_28102026', rawOrgDoc, 'Organization')

      assert.equal(normalized.id, 'ST001_newProject_28102026')
      assert.equal(normalized.siteId, 'ST001_newProject')
      assert.equal(normalized.totalAmount, 25000)
      assert.equal(normalized.bills.length, 1)
      assert.equal(normalized.bills[0].billNo, 'BILL-001')
      assert.equal(normalized.bills[0].billAmount, 25000)
      assert.equal(normalized.remarks, 'Direct cement order')
    })

    it('correctly handles multi-bill organization documents with individual bill details and no double counting', () => {
      // Document matching user example: dated 2026-10-28, two bills (002 for 1000, 001 for 100), total 1100
      const rawOrgDoc = {
        siteId: 'ST001_newProject',
        siteName: 'Riverside Commercial Complex',
        projectName: 'newProject',
        projectStage: 'Structure Work',
        expenseDate: '2026-10-28',
        totalAmount: 1100,
        remarks: 'Daily centralized materials',
        bills: [
          {
            billNo: '002',
            vendor: 'hgghh',
            billVendor: 'hgghh',
            amount: 1000,
            billAmount: 1000,
            billUrl: 'https://storage/bill002.jpg',
            description: 'hgghh material supply',
          },
          {
            billNo: '001',
            vendor: 'were',
            billVendor: 'were',
            amount: 100,
            billAmount: 100,
            billUrl: 'https://storage/bill001.jpg',
            description: 'were testing tools',
          },
        ],
      }

      const normalized = normalizeExpenseRecord('ST001_newProject_28102026', rawOrgDoc, 'Organization')
      assert.equal(normalized.totalAmount, 1100)
      assert.equal(normalized.bills.length, 2)

      // Simulate the UI bill flattening
      const billEntries = []
      normalized.bills.forEach((b, idx) => {
        billEntries.push({
          id: `${normalized.id}_bill_${b.id || b.billNo || idx}`,
          parentExpenseId: normalized.id,
          billNo: b.billNo,
          vendor: b.vendor,
          amount: b.amount,
          billUrl: b.billUrl,
          description: b.description,
        })
      })

      assert.equal(billEntries.length, 2, 'Must produce two separate bill entries for the log')
      assert.equal(billEntries[0].billNo, '002')
      assert.equal(billEntries[0].vendor, 'hgghh')
      assert.equal(billEntries[0].amount, 1000)
      assert.equal(billEntries[1].billNo, '001')
      assert.equal(billEntries[1].vendor, 'were')
      assert.equal(billEntries[1].amount, 100)

      // Total sum spent aggregated from individual bills without double counting
      const aggregatedTotal = billEntries.reduce((sum, e) => sum + e.amount, 0)
      assert.equal(aggregatedTotal, 1100, 'Sum of individual bills must equal 1100 without double counting')
    })

    it('preserves and normalizes Quantity field across bill items with backward compatibility', () => {
      const expenseWithQuantity = {
        siteId: 'ST001',
        siteName: 'Testing Site',
        date: '2026-10-29',
        category: 'Materials',
        bills: [
          {
            billNo: 'B-01',
            vendor: 'Cement Mart',
            amount: 5000,
            quantity: 50,
            unit: 'bags',
          },
          {
            billNo: 'B-02',
            vendor: 'Steel Supply',
            amount: 12000,
            quantity: '120.5',
          },
          {
            // Legacy bill without quantity
            billNo: 'B-03',
            vendor: 'Hardware Shop',
            amount: 1500,
          },
        ],
      }

      const normalized = normalizeExpenseRecord('EXP_WITH_QTY', expenseWithQuantity, 'Manager')
      assert.equal(normalized.totalAmount, 18500)
      assert.equal(normalized.bills.length, 3)

      // First bill has integer quantity 50
      assert.equal(normalized.bills[0].quantity, 50)
      assert.equal(normalized.bills[0].qty, 50)

      // Second bill has string decimal quantity parsed to 120.5
      assert.equal(normalized.bills[1].quantity, 120.5)
      assert.equal(normalized.bills[1].qty, 120.5)

      // Third legacy bill has null quantity without breaking or defaulting to 0
      assert.equal(normalized.bills[2].quantity, null)
      assert.equal(normalized.bills[2].qty, null)

      // Top-level quantity should sum valid quantities: 50 + 120.5 = 170.5
      assert.equal(normalized.quantity, 170.5)
    })

    it('handles legacy single-record expenses without quantity gracefully', () => {
      const legacyExpense = {
        siteId: 'ST001',
        date: '2026-10-25',
        totalAmount: 3500,
        amount: 3500,
        vendor: 'Old Vendor',
      }

      const normalized = normalizeExpenseRecord('LEGACY_001', legacyExpense, 'Manager')
      assert.equal(normalized.totalAmount, 3500)
      assert.equal(normalized.quantity, null)
      assert.equal(normalized.bills.length, 0)
    })
  })
})

