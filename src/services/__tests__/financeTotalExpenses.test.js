import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSiteTotalExpenses,
  calculateSiteFinancialMetrics,
  parseAmount,
  processRawGranularExpenseDocs,
} from '../financeService.js'
import { matchesSite } from '../../pages/organization/finance/financeUtils.js'

describe('Finance Total Expenses & Related Financial Metrics Unit Tests', () => {
  const targetSite = {
    id: 'PR001_ST001_Testing',
    siteId: 'ST001',
    siteCode: 'ST001',
    siteName: 'Testing Site',
    projectName: 'Testing Site',
    projectBudget: 500000,
  }

  // ---------------------------------------------------------------------------------------------
  // Requirement 1 & 2: Correct Expense Calculation & Multi-Source Verification
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 1 & 2: Correct Expense Calculation across all streams', () => {
    it('calculates the actual sum of all valid expense transactions across Manager, Org, Supervisor, and Petty Cash', () => {
      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [
            {
              id: 'ST001_Testing_29102026',
              data: {
                siteId: 'ST001',
                bills: [
                  { billNo: 'M001', amount: 15000, vendor: 'Steel Supplier' },
                  { billNo: 'M002', amount: 5000, vendor: 'Cement Depot' },
                ],
              },
            },
          ],
        },
        {
          col: 'organizationExpenses',
          category: 'Organization Expense',
          docs: [
            {
              id: 'ORG_EXP_ST001_01',
              data: {
                siteId: 'ST001',
                totalAmount: 12000,
                vendorName: 'Architectural Consultant',
                billNo: 'INV-909',
              },
            },
          ],
        },
        {
          col: 'siteSupervisorEntries',
          category: 'Supervisor Entry',
          docs: [
            {
              id: 'SUP_ENTRY_001',
              data: {
                siteId: 'ST001',
                totalAmount: 4500,
                vendorName: 'Sand Truck',
              },
            },
          ],
        },
        {
          col: 'pettyCashTransactions',
          category: 'Petty Cash',
          docs: [
            {
              id: 'PC_TX_001',
              data: {
                siteId: 'ST001',
                amount: 1500,
                description: 'Emergency Electrical Repair',
              },
            },
          ],
        },
      ]

      const result = calculateSiteTotalExpenses({
        site: targetSite,
        sourcesWithDocs,
      })

      // 15,000 + 5,000 + 12,000 + 4,500 + 1,500 = 38,000
      assert.equal(result.totalExpenses, 38000)
      assert.equal(result.isFromGranular, true)
      assert.equal(result.categoryBreakdown.manager, 20000)
      assert.equal(result.categoryBreakdown.organization, 12000)
      assert.equal(result.categoryBreakdown.supervisor, 4500)
      assert.equal(result.categoryBreakdown.pettyCash, 1500)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 3: Prevent Duplicate Counting
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 3: Prevent Duplicate Counting across mirrored collections', () => {
    it('does not double count when managerExpenses and managerEntries mirror the exact same document ID', () => {
      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [
            {
              id: 'ST001_Testing_28102026',
              data: {
                siteId: 'ST001',
                totalAmount: 25000,
                bills: [{ billNo: 'BILL-01', amount: 25000, vendor: 'Timber Works' }],
              },
            },
          ],
        },
        {
          col: 'managerEntries',
          category: 'Manager Approved',
          docs: [
            {
              id: 'ST001_Testing_28102026', // Mirrored identical document ID
              data: {
                siteId: 'ST001',
                totalAmount: 25000,
                bills: [{ billNo: 'BILL-01', amount: 25000, vendor: 'Timber Works' }],
              },
            },
          ],
        },
      ]

      const result = calculateSiteTotalExpenses({
        site: targetSite,
        sourcesWithDocs,
      })

      // Must be 25,000, NOT 50,000
      assert.equal(result.totalExpenses, 25000)
    })

    it('does not double count when organizationExpenses and organizationEntries mirror the same expenseId', () => {
      const sourcesWithDocs = [
        {
          col: 'organizationExpenses',
          category: 'Organization Expense',
          docs: [
            {
              id: 'ORG_EXP_A',
              data: {
                expenseId: 'EXP_UNIQUE_999',
                siteId: 'ST001',
                totalAmount: 18000,
              },
            },
          ],
        },
        {
          col: 'organizationEntries',
          category: 'Organization Bill',
          docs: [
            {
              id: 'ORG_EXP_B',
              data: {
                expenseId: 'EXP_UNIQUE_999', // Mirrored transaction ID
                siteId: 'ST001',
                totalAmount: 18000,
              },
            },
          ],
        },
      ]

      const result = calculateSiteTotalExpenses({
        site: targetSite,
        sourcesWithDocs,
      })

      assert.equal(result.totalExpenses, 18000)
    })

    it('counts genuinely different transactions with different document IDs separately', () => {
      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [
            {
              id: 'MGR_EXP_DAY_1',
              data: { siteId: 'ST001', totalAmount: 10000 },
            },
          ],
        },
        {
          col: 'managerEntries',
          category: 'Manager Approved',
          docs: [
            {
              id: 'MGR_EXP_DAY_2', // Genuinely distinct transaction on day 2
              data: { siteId: 'ST001', totalAmount: 15000 },
            },
          ],
        },
      ]

      const result = calculateSiteTotalExpenses({
        site: targetSite,
        sourcesWithDocs,
      })

      assert.equal(result.totalExpenses, 25000)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 4: Validate Financial Values (amountSpend vs amountSpent)
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 4: Validate Financial Values & Field Precedence', () => {
    it('uses amountSpent without double counting amountSpend on project documents', () => {
      const legacyProject = {
        id: 'PR001_ST001_Testing',
        siteId: 'ST001',
        amountSpent: 75000,
        amountSpend: 75000, // Legacy mirrored field
        totalAmountSpent: 75000,
      }

      const result = calculateSiteTotalExpenses({
        site: legacyProject,
        granularExpenses: [],
        sourcesWithDocs: [],
        totalExpensesDoc: null,
      })

      // Must be 75,000, never 75,000 + 75,000 = 150,000
      assert.equal(result.totalExpenses, 75000)
    })

    it('safely falls back to amountSpend when amountSpent is missing or null', () => {
      const legacyProject = {
        id: 'PR001_ST001_Testing',
        siteId: 'ST001',
        amountSpent: null,
        amountSpend: 42000,
      }

      const result = calculateSiteTotalExpenses({
        site: legacyProject,
        granularExpenses: [],
        sourcesWithDocs: [],
        totalExpensesDoc: null,
      })

      assert.equal(result.totalExpenses, 42000)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 5: Update Related Financial Metrics
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 5: Update Related Financial Metrics Consistently', () => {
    it('accurately computes Net Cash in Hand, Budget Cushion, and Budget Utilization', () => {
      const budget = 1000000 // 10 Lakhs
      const income = 600000  // 6 Lakhs received from client
      const expenses = 400000 // 4 Lakhs total expenses

      const metrics = calculateSiteFinancialMetrics({
        budget,
        income,
        expenses,
      })

      // Total Expenses
      assert.equal(metrics.expenses, 400000)

      // Net Cash in Hand = Income - Expenses = 600,000 - 400,000 = 200,000 (Surplus)
      assert.equal(metrics.cashInHand, 200000)

      // Budget Cushion & Consumption = Budget - Expenses = 1,000,000 - 400,000 = 600,000
      assert.equal(metrics.budgetRemaining, 600000)

      // Budget Utilization = (400,000 / 1,000,000) * 100 = 40%
      assert.equal(metrics.usagePercent, 40)

      // Realization = (600,000 / 1,000,000) * 100 = 60%
      assert.equal(metrics.realizationPercent, 60)
      assert.equal(metrics.isBudgetCritical, false)
      assert.equal(metrics.isBudgetWarning, false)
    })

    it('identifies deficit cash in hand and critical budget utilization (>85%) accurately', () => {
      const budget = 100000
      const income = 80000
      const expenses = 92000

      const metrics = calculateSiteFinancialMetrics({
        budget,
        income,
        expenses,
      })

      // Cash in Hand is negative deficit: 80,000 - 92,000 = -12,000
      assert.equal(metrics.cashInHand, -12000)

      // Remaining Cushion: 100,000 - 92,000 = 8,000
      assert.equal(metrics.budgetRemaining, 8000)

      // Budget Utilization = (92,000 / 100,000) * 100 = 92%
      assert.equal(metrics.usagePercent, 92)
      assert.equal(metrics.isBudgetCritical, true)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 7: Safe Handling of Missing and Non-numeric Values
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 7: Handle Missing Values Safely without NaN', () => {
    it('parses null, undefined, and non-numeric amounts safely as 0', () => {
      assert.equal(parseAmount(null), 0)
      assert.equal(parseAmount(undefined), 0)
      assert.equal(parseAmount(''), 0)
      assert.equal(parseAmount('invalid_amount'), 0)
      assert.equal(parseAmount(NaN), 0)
      assert.equal(parseAmount('₹ 1,500.50'), 1500.5)
      assert.equal(parseAmount(12500), 12500)
    })

    it('calculates site expenses without producing NaN when docs contain null or corrupt amounts', () => {
      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [
            {
              id: 'MGR_CORRUPT_01',
              data: {
                siteId: 'ST001',
                totalAmount: null,
                bills: [
                  { billNo: 'B1', amount: undefined },
                  { billNo: 'B2', amount: 'not_a_number' },
                  { billNo: 'B3', amount: 8000 },
                ],
              },
            },
          ],
        },
      ]

      const result = calculateSiteTotalExpenses({
        site: targetSite,
        sourcesWithDocs,
      })

      assert.equal(result.totalExpenses, 8000)
      assert.ok(!Number.isNaN(result.totalExpenses))
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Compound Site Matching Logic in financeUtils.js
  // ---------------------------------------------------------------------------------------------
  describe('Compound Site Key Identification in matchesSite', () => {
    it('matches site canonical keys e.g. ST001_Testing with siteId ST001', () => {
      const site = { id: 'PR001_ST001_Testing', siteId: 'ST001', siteName: 'Testing' }
      const record = { id: 'ST001_Testing', siteId: 'ST001_Testing' }
      assert.equal(matchesSite(record, site), true)
    })

    it('matches site when record siteId has prefix stripped PR001_ST001_Testing', () => {
      const site = { id: 'PR001_ST001_Testing', siteId: 'ST001' }
      const record = { siteId: 'PR001_ST001_Testing' }
      assert.equal(matchesSite(record, site), true)
    })

    it('rejects records belonging to a different site code e.g. ST002', () => {
      const site = { id: 'PR001_ST001_Testing', siteId: 'ST001' }
      const record = { siteId: 'ST002', siteName: 'Other Site' }
      assert.equal(matchesSite(record, site), false)
    })
  })
})

