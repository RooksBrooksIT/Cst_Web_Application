import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseAmount,
  matchesSite,
  calculateDailySiteExpenses,
  calculateSiteLifetimeSummary,
  calculateProjectStageReport,
  calculateSiteStatusReport,
  calculateFinancialStatusReport,
  calculatePettyCashInsights,
  calculateDomainReports,
} from '../reportService.js'

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
})
