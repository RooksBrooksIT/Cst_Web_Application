import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseAmount,
  matchesSite,
  stageMatches,
  isDateMatch,
  formatDateToKey,
  formatDateToISO,
  calculateDailySiteExpenses,
  calculateSiteLifetimeSummary,
  calculateProjectStageReport,
  calculateSiteStatusReport,
  calculateFinancialStatusReport,
  calculatePettyCashInsights,
  calculateDomainReports,
} from '../reportService.js'
import { normalizeReportRole } from '../reportExpenseService.js'

describe('Reports Data Accuracy & De-duplication Tests', () => {
  describe('matchesSite (Compound and Canonical Site Identification)', () => {
    it('matches record siteCode ST001 with site id PR001_ST001_Metropolis', () => {
      const record = { siteId: 'ST001' }
      const site = { id: 'PR001_ST001_Metropolis', siteName: 'Metropolis Tower' }
      assert.equal(matchesSite(record, site), true)
    })

    it('matches manager expense document ID format ST001_Metropolis_28102026 with site object', () => {
      const record = { id: 'ST001_Metropolis_28102026' }
      const site = { id: 'ST001', siteName: 'Metropolis' }
      assert.equal(matchesSite(record, site), true)
    })

    it('strips PR001_ prefix and matches clean IDs', () => {
      const record = { siteId: 'PR002_ST002_Substation' }
      const site = { id: 'ST002_Substation' }
      assert.equal(matchesSite(record, site), true)
    })

    it('matches normalized site names ignoring case, spaces, and punctuation', () => {
      const record = { siteName: 'Riverside Commercial - Phase 1' }
      const site = { siteName: 'riverside commercial phase 1', id: 'SITE_99' }
      assert.equal(matchesSite(record, site), true)
    })

    it('returns false when sites are distinct', () => {
      const record = { siteId: 'ST001', siteName: 'Hospital Site' }
      const site = { id: 'ST002', siteName: 'Highway Overpass' }
      assert.equal(matchesSite(record, site), false)
    })
  })

  describe('calculateDailySiteExpenses: Double-Counting Prevention', () => {
    it('does NOT double-count labour or materials when both summary fields and itemized arrays exist', () => {
      const supervisorEntries = [
        {
          id: 'SUP_ENTRY_1',
          date: '2026-10-28',
          siteId: 'ST001',
          totalLabourAmount: 5000,
          labours: [
            { id: 'L1', labourType: 'Mason', amount: 3000 },
            { id: 'L2', labourType: 'Helper', amount: 2000 },
          ],
          totalMaterialAmount: 8000,
          materials: [
            { id: 'M1', materialName: 'Cement', totalAmount: 5000 },
            { id: 'M2', materialName: 'Sand', totalAmount: 3000 },
          ],
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Site Alpha' },
        selectedDate: '2026-10-28',
        siteSupervisorEntries: supervisorEntries,
        managerExpenses: [],
        organizationEntries: [],
      })

      // Must be 5000 and 8000, NOT 10000 or 16000!
      assert.equal(result.totalLabour, 5000)
      assert.equal(result.totalMaterial, 8000)
      assert.equal(result.grandTotal, 13000)
      assert.equal(result.labours.length, 2)
      assert.equal(result.materials.length, 2)
    })

    it('falls back to supervisor summary amounts when itemized arrays are absent', () => {
      const supervisorEntries = [
        {
          id: 'SUP_ENTRY_2',
          date: '2026-10-28',
          siteId: 'ST001',
          totalLabourAmount: 4500,
          totalMaterialAmount: 6500,
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Site Alpha' },
        selectedDate: '2026-10-28',
        siteSupervisorEntries: supervisorEntries,
        managerExpenses: [],
        organizationEntries: [],
      })

      assert.equal(result.totalLabour, 4500)
      assert.equal(result.totalMaterial, 6500)
      assert.equal(result.grandTotal, 11000)
    })

    it('deduplicates manager expenses and organization bills by bill voucher / ID', () => {
      const managerExpenses = [
        {
          id: 'ME1',
          date: '2026-10-28',
          siteId: 'ST001',
          bills: [
            { billId: 'BILL-101', amount: 1200, category: 'Hardware' },
            { billId: 'BILL-101', amount: 1200, category: 'Hardware' }, // duplicate entry
            { billId: 'BILL-102', amount: 800, category: 'Tools' },
          ],
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Site Alpha' },
        selectedDate: '2026-10-28',
        siteSupervisorEntries: [],
        managerExpenses,
        organizationEntries: [],
      })

      // BILL-101 (1200) + BILL-102 (800) = 2000
      assert.equal(result.totalBills, 2000)
      assert.equal(result.bills.length, 2)
    })

    it('preserves Quantity across Manager bills and Direct Org bills in calculateDailySiteExpenses', () => {
      const managerExpenses = [
        {
          id: 'ME_QTY_1',
          date: '2026-10-29',
          siteId: 'ST001',
          bills: [
            { billId: 'BILL-M1', amount: 3000, category: 'Bricks', quantity: 1500, vendor: 'Brick Factory' },
            { billId: 'BILL-M2', amount: 1500, category: 'Sand', quantity: null, vendor: 'Sand Supplier' },
          ],
        },
      ]

      const organizationEntries = [
        {
          id: 'OE_QTY_1',
          date: '2026-10-29',
          siteId: 'ST001',
          bills: [
            { billNo: 'BILL-O1', amount: 8000, category: 'Steel', quantity: 25.5, vendor: 'Steel Trader' },
          ],
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Site Alpha' },
        selectedDate: '2026-10-29',
        siteSupervisorEntries: [],
        managerExpenses,
        organizationEntries,
      })

      assert.equal(result.bills.length, 3)

      const brickBill = result.bills.find((b) => b.billNumber === 'BILL-M1')
      assert.ok(brickBill)
      assert.equal(brickBill.quantity, 1500)
      assert.equal(brickBill.amount, 3000)

      const sandBill = result.bills.find((b) => b.billNumber === 'BILL-M2')
      assert.ok(sandBill)
      assert.equal(sandBill.quantity, null)
      assert.equal(sandBill.amount, 1500)

      const steelBill = result.bills.find((b) => b.billNumber === 'BILL-O1')
      assert.ok(steelBill)
      assert.equal(steelBill.quantity, 25.5)
      assert.equal(steelBill.amount, 8000)
    })
  })

  describe('calculateSiteLifetimeSummary: Outflow & Inflow Integrity', () => {
    it('does not double count customer payments when site.amountPaid and sitePayments co-exist', () => {
      const site = {
        id: 'ST001',
        siteName: 'Site 1',
        projectBudget: 500000,
        amountPaid: 200000, // already contains aggregate payments
      }

      const sitePayments = [
        { id: 'PAY_1', siteId: 'ST001', amountPaid: 120000 },
        { id: 'PAY_2', siteId: 'ST001', amountPaid: 80000 },
      ]

      const result = calculateSiteLifetimeSummary({
        site,
        totalSiteExpensesPerDay: [],
        siteSupervisorEntries: [],
        managerExpenses: [],
        organizationEntries: [],
        sitePayments,
      })

      // Received must be 200000, not 400000!
      assert.equal(result.totalReceived, 200000)
      assert.equal(result.kpis.received, 200000)
      assert.equal(result.budget, 500000)
      assert.equal(result.budgetRemaining, 500000)
    })

    it('prefers daily rollups without double-counting with site.amountSpent', () => {
      const site = {
        id: 'ST001',
        siteName: 'Site 1',
        projectBudget: 500000,
        amountSpent: 75000,
      }

      const totalSiteExpensesPerDay = [
        { id: 'ST001_2026-10-27', siteId: 'ST001', totalAllExpenses: 45000 },
        { id: 'ST001_2026-10-28', siteId: 'ST001', totalAllExpenses: 30000 },
      ]

      const result = calculateSiteLifetimeSummary({
        site,
        totalSiteExpensesPerDay,
        siteSupervisorEntries: [],
        managerExpenses: [],
        organizationEntries: [],
        sitePayments: [],
      })

      // Total spent must be 75000, not 150000!
      assert.equal(result.totalSpent, 75000)
      assert.equal(result.kpis.spent, 75000)
      assert.equal(result.kpis.utilizationPercent, 15)
    })
  })

  describe('calculateFinancialStatusReport: Deduplication & Consistency', () => {
    it('deduplicates duplicate site records and accurately reports statements and KPIs', () => {
      const sites = [
        { id: 'PR001_ST001_Alpha', siteId: 'ST001', siteName: 'Alpha Site', projectBudget: 1000000, amountPaid: 400000, amountSpent: 250000 },
        { id: 'ST001_Alpha', siteId: 'ST001', siteName: 'Alpha Site', projectBudget: 1000000, amountPaid: 400000, amountSpent: 250000 }, // duplicate representation
        { id: 'ST002_Beta', siteId: 'ST002', siteName: 'Beta Site', projectBudget: 500000, amountPaid: 200000, amountSpent: 100000 },
      ]

      const result = calculateFinancialStatusReport({
        sites,
        sitePayments: [],
        totalSiteExpensesPerDay: [],
      })

      // Deduplicated sites should be 2, not 3
      assert.equal(result.statements.length, 2)
      assert.equal(result.kpis.totalBudget, 1500000)
      assert.equal(result.kpis.totalReceived, 600000)
      assert.equal(result.kpis.totalSpent, 350000)
      assert.equal(result.kpis.cashInHand, 250000)
      assert.equal(result.kpis.remainingBudget, 1150000)

      // Statement items have required UI fields
      result.statements.forEach((st) => {
        assert.ok(st.status)
        assert.ok(typeof st.receivedRatio === 'number')
        assert.ok(typeof st.utilizationPercent === 'number')
      })
    })
  })

  describe('calculatePettyCashInsights: Account Deduplication & Float', () => {
    it('deduplicates accounts in siteAuditList and provides correct net float and remaining KPIs', () => {
      const sites = [
        { id: 'ST001', siteName: 'Alpha Site' },
      ]

      const accounts = [
        { id: 'ACC_1', siteId: 'ST001', siteName: 'Alpha Site', managerName: 'John', pettyCashGiven: 50000, pettyCashSpent: 20000, pettyCashRemaining: 30000 },
        { id: 'ACC_2', siteId: 'ST001', siteName: 'Alpha Site', managerName: 'John', pettyCashGiven: 50000, pettyCashRemaining: 30000 }, // duplicate
      ]

      const result = calculatePettyCashInsights({
        pettyCashAccounts: accounts,
        pettyCashExpenses: [],
        sites,
      })

      // Deduplicated siteAuditList should only contain 1 account for Alpha Site
      assert.equal(result.siteAuditList.length, 1)
      assert.equal(result.kpis.totalDisbursed, 50000)
      assert.equal(result.kpis.netFloatInHand, 30000)
      assert.equal(result.kpis.totalRemaining, 30000)
      assert.equal(result.kpis.remainingPettyCash, 30000)
    })
  })

  describe('calculateDomainReports: SiteId Binding', () => {
    it('attaches siteId to contractors, tools, workers, vehicles, and incentives', () => {
      const toolsResult = calculateDomainReports({
        type: 'tools',
        tools: [{ id: 'T1', name: 'Concrete Mixer', currentProjectId: 'ST001' }],
      })

      const workersResult = calculateDomainReports({
        type: 'workers',
        workers: [{ id: 'W1', name: 'Rajesh', siteId: 'ST001' }],
      })

      const vehiclesResult = calculateDomainReports({
        type: 'vehicles',
        vehicles: [{ id: 'V1', vehicleNo: 'KA-01-AB-1234', currentProjectId: 'ST001' }],
      })

      const incentivesResult = calculateDomainReports({
        type: 'incentives',
        siteSupervisorIncentives: [{ id: 'INC_1', supervisorName: 'Suresh', siteId: 'ST001', incentiveAmount: 5000 }],
      })

      assert.equal(toolsResult.records[0].siteId, 'ST001')
      assert.equal(workersResult.records[0].siteId, 'ST001')
      assert.equal(vehiclesResult.records[0].siteId, 'ST001')
      assert.equal(incentivesResult.records[0].siteId, 'ST001')
    })
  })

  describe('Role Normalization & Role-Based Query Integrity', () => {
    it('normalizes roles correctly for report collection subscription', () => {
      assert.equal(normalizeReportRole('Organization'), 'Organization')
      assert.equal(normalizeReportRole('org'), 'Organization')
      assert.equal(normalizeReportRole('admin'), 'Organization')
      assert.equal(normalizeReportRole('Manager'), 'Manager')
      assert.equal(normalizeReportRole('operations_manager'), 'Manager')
      assert.equal(normalizeReportRole('Supervisor'), 'Supervisor')
      assert.equal(normalizeReportRole('site_supervisor'), 'Supervisor')
      assert.equal(normalizeReportRole(null), 'Organization')
    })
  })

  describe('Filter Robustness: Date, Stage, and Multi-Site Matching', () => {
    it('matches date across ISO strings, Date objects, Firestore timestamps, and composite IDs', () => {
      assert.equal(isDateMatch({ date: '2026-10-28T10:00:00.000Z' }, '2026-10-28'), true)
      assert.equal(isDateMatch({ id: 'ST001_newProject_28102026' }, '2026-10-28'), true)
      assert.equal(isDateMatch({ dateKey: '28102026' }, '2026-10-28'), true)
      assert.equal(isDateMatch({ createdAt: { toDate: () => new Date('2026-10-28T12:00:00Z') } }, '2026-10-28'), true)
      assert.equal(isDateMatch({ date: '2026-10-27' }, '2026-10-28'), false)
    })

    it('matches stage flexibly handling prefixes, suffixes, and case variations', () => {
      assert.equal(stageMatches('Foundation Stage', 'Foundation'), true)
      assert.equal(stageMatches('01. Foundation', 'Foundation'), true)
      assert.equal(stageMatches('Plastering', 'plastering stage'), true)
      assert.equal(stageMatches('Masonry Work', 'all'), true)
      assert.equal(stageMatches('Roofing', 'Foundation'), false)
    })

    it('matches all sites when site is "all" or site.id is "all"', () => {
      assert.equal(matchesSite({ siteId: 'ST001' }, 'all'), true)
      assert.equal(matchesSite({ siteId: 'ST002' }, { id: 'all' }), true)
      assert.equal(matchesSite({ siteId: 'ST003' }, null), true)
    })
  })

  describe('Daily Site Expenses: Entry vs Summary Collections & Multi-Entry Aggregation', () => {
    it('prevents double-counting when both organizationExpenses and organizationExpenseSummary exist for the same transaction', () => {
      const docId = 'ST001_Alpha_28102026'
      const orgExpenses = [
        {
          id: docId,
          siteId: 'ST001',
          date: '2026-10-28',
          totalAmount: 15000,
          bills: [
            { id: 'b1', amount: 10000, vendor: 'Steel Vendor', category: 'Raw Materials' },
            { id: 'b2', amount: 5000, vendor: 'Safety Gear', category: 'Protective Equipment' },
          ],
        },
      ]
      const orgEntries = [
        {
          id: docId,
          siteId: 'ST001',
          date: '2026-10-28',
          totalAmount: 15000,
          bills: [
            { id: 'b1', amount: 10000, vendor: 'Steel Vendor', category: 'Raw Materials' },
            { id: 'b2', amount: 5000, vendor: 'Safety Gear', category: 'Protective Equipment' },
          ],
        },
      ]
      const orgSummary = [
        {
          id: docId,
          siteId: 'ST001',
          date: '2026-10-28',
          orgExpenseTotalAmount: 15000,
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Alpha Site' },
        selectedDate: '2026-10-28',
        selectedStage: 'all',
        organizationExpenses: orgExpenses,
        organizationEntries: orgEntries,
        organizationExpenseSummary: orgSummary,
      })

      // Must be 15000, NOT 30000 or 45000!
      assert.equal(result.totalBills, 15000)
      assert.equal(result.grandTotal, 15000)
      assert.equal(result.bills.length, 2)
    })

    it('prevents double-counting when both managerExpenses and managerExpenseSummary exist for the same transaction', () => {
      const docId = 'ST001_Alpha_28102026'
      const managerExpenses = [
        {
          id: docId,
          siteId: 'ST001',
          date: '2026-10-28',
          totalAmount: 8000,
          bills: [
            { id: 'mb1', amount: 8000, vendor: 'Local Hardware', category: 'Fasteners' },
          ],
        },
      ]
      const managerSummary = [
        {
          id: docId,
          siteId: 'ST001',
          date: '2026-10-28',
          managerExpenseTotalAmount: 8000,
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Alpha Site' },
        selectedDate: '2026-10-28',
        managerExpenses,
        managerExpenseSummary: managerSummary,
      })

      // Must be 8000, NOT 16000!
      assert.equal(result.totalBills, 8000)
      assert.equal(result.grandTotal, 8000)
      assert.equal(result.bills.length, 1)
    })

    it('falls back to summary record when no itemized entry exists for that transaction', () => {
      const orgSummary = [
        {
          id: 'ST001_Corporate_28102026',
          siteId: 'ST001',
          date: '2026-10-28',
          orgExpenseTotalAmount: 25000,
          description: 'Head Office Bulk Cement Allocation',
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Alpha Site' },
        selectedDate: '2026-10-28',
        organizationExpenseSummary: orgSummary,
      })

      assert.equal(result.totalBills, 25000)
      assert.equal(result.grandTotal, 25000)
      assert.equal(result.bills.length, 1)
      assert.equal(result.bills[0].billNumber, 'ORG-SUM')
    })

    it('aggregates multiple supervisor entries for the same site and date without dropping records', () => {
      const supEntries = [
        {
          id: 'SUP_SHIFT_1',
          siteId: 'ST001',
          date: '2026-10-28',
          projectStage: 'Foundation',
          supervisorName: 'Kavitha S',
          labours: [
            { role: 'Mason', count: 4, rate: 1000, amount: 4000 },
          ],
          materials: [
            { name: 'Bricks', quantity: 1000, unitPrice: 10, amount: 10000 },
          ],
          foodAllowance: 500,
          transportAmount: 300,
        },
        {
          id: 'SUP_SHIFT_2',
          siteId: 'ST001',
          date: '2026-10-28',
          projectStage: 'Foundation',
          supervisorName: 'Kavitha S',
          labours: [
            { role: 'Helper', count: 6, rate: 600, amount: 3600 },
          ],
          materials: [
            { name: 'Sand', quantity: 2, unitPrice: 2500, amount: 5000 },
          ],
          foodAllowance: 500,
          transportAmount: 200,
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'ST001', siteName: 'Alpha Site' },
        selectedDate: '2026-10-28',
        selectedStage: 'Foundation',
        siteSupervisorEntries: supEntries,
      })

      // Labour: 4000 + 3600 = 7600
      assert.equal(result.totalLabour, 7600)
      // Materials: 10000 + 5000 = 15000
      assert.equal(result.totalMaterial, 15000)
      // Food: 500 + 500 = 1000
      assert.equal(result.foodAmount, 1000)
      // Transport: 300 + 200 = 500
      assert.equal(result.transportAmount, 500)
      // Grand total: 7600 + 15000 + 1000 + 500 = 24100
      assert.equal(result.grandTotal, 24100)
      assert.equal(result.labours.length, 2)
      assert.equal(result.materials.length, 2)
    })

    it('aggregates across multiple sites when site filter is "all"', () => {
      const supEntries = [
        {
          id: 'SUP_SITE_1',
          siteId: 'ST001',
          date: '2026-10-28',
          labours: [{ role: 'Worker 1', count: 1, rate: 1000, amount: 1000 }],
        },
        {
          id: 'SUP_SITE_2',
          siteId: 'ST002',
          date: '2026-10-28',
          labours: [{ role: 'Worker 2', count: 1, rate: 2000, amount: 2000 }],
        },
      ]

      const result = calculateDailySiteExpenses({
        site: { id: 'all', siteName: 'All Managed Sites' },
        selectedDate: '2026-10-28',
        siteSupervisorEntries: supEntries,
      })

      assert.equal(result.totalLabour, 3000)
      assert.equal(result.grandTotal, 3000)
      assert.equal(result.labours.length, 2)
      assert.equal(result.siteName, 'All Managed Sites')
    })
  })
})

