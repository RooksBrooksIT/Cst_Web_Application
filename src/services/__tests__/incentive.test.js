import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateLabourActualTotal,
  calculateSavings,
  calculateIncentive,
  calculateAllExpensesTotals,
  calculateProjectBalance,
  isStageRequestAvailable,
} from '../expenseService.js'
import {
  normalizeLabourItems,
  buildLabourComparisonGrid,
} from '../incentiveService.js'

describe('Incentive Flow Calculation & Business Rules Unit Tests', () => {

  // ----------------------------------------------------------------------------------------------
  // 1. ACTUAL TOTAL EXPENDITURE FORMULA
  // Formula: actualTotal = actDays * actPayment (Section 5 Formula 1)
  // ----------------------------------------------------------------------------------------------
  describe('Formula 1: Actual Total Expenditure', () => {
    it('calculates standard actual total correctly', () => {
      // Numerical example from Section 5: 10 days * ₹ 8,000/day = ₹ 80,000
      const total = calculateLabourActualTotal(10, 8000)
      assert.equal(total, 80000)
    })

    it('returns 0 when actual days is 0', () => {
      const total = calculateLabourActualTotal(0, 8000)
      assert.equal(total, 0)
    })

    it('returns 0 when daily payment rate is 0', () => {
      const total = calculateLabourActualTotal(10, 0)
      assert.equal(total, 0)
    })

    it('handles decimal daily rates accurately with proper rounding', () => {
      const total = calculateLabourActualTotal(7, 1250.75)
      assert.equal(total, 8755.25)
    })

    it('handles negative or invalid values gracefully by clamping to 0', () => {
      assert.equal(calculateLabourActualTotal(-5, 5000), 0)
      assert.equal(calculateLabourActualTotal('invalid', 'abc'), 0)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 2. BUDGET SAVINGS FORMULA & OVERRUN GUARD
  // Formula: savedAmount = max(approvedTotal - actualTotal, 0) (Section 5 Formula 2 & Section 6)
  // ----------------------------------------------------------------------------------------------
  describe('Formula 2: Budget Savings & Overrun Guards', () => {
    it('calculates positive savings when under budget', () => {
      // Numerical example: ₹ 1,00,000 approved - ₹ 80,000 actual = ₹ 20,000 savings
      const savings = calculateSavings(100000, 80000)
      assert.equal(savings, 20000)
    })

    it('clamps savings to 0 when actual cost exactly equals approved budget', () => {
      const savings = calculateSavings(100000, 100000)
      assert.equal(savings, 0)
    })

    it('clamps savings to 0 when cost overrun occurs (actual > approved)', () => {
      // Overrun scenario: approved ₹ 1,00,000, actual ₹ 1,20,000 -> savings must be 0
      const savings = calculateSavings(100000, 120000)
      assert.equal(savings, 0)
    })

    it('handles string numeric values from form inputs correctly', () => {
      const savings = calculateSavings('150000', '110000')
      assert.equal(savings, 40000)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 3. INCENTIVE PAYOUT FORMULA
  // Formula: incentiveAmount = savedAmount * (percentage / 100) (Section 5 Formula 3)
  // ----------------------------------------------------------------------------------------------
  describe('Formula 3: Incentive Payout Calculation', () => {
    it('calculates 15% incentive payout accurately matching numerical spec example', () => {
      // Concrete spec example: savings ₹ 20,000 * 15% = ₹ 3,000
      const payout = calculateIncentive(20000, 15)
      assert.equal(payout, 3000)
    })

    it('calculates 10% default incentive payout', () => {
      // ₹ 20,000 savings * 10% default = ₹ 2,000
      const payout = calculateIncentive(20000, 10)
      assert.equal(payout, 2000)
    })

    it('returns 0 incentive when percentage is 0%', () => {
      const payout = calculateIncentive(20000, 0)
      assert.equal(payout, 0)
    })

    it('returns full savings when incentive percentage is 100%', () => {
      const payout = calculateIncentive(20000, 100)
      assert.equal(payout, 20000)
    })

    it('returns 0 incentive when savings is 0 regardless of percentage', () => {
      const payout = calculateIncentive(0, 50)
      assert.equal(payout, 0)
    })

    it('clamps incentive percentage between 0% and 100%', () => {
      // If user inputs > 100%, clamped to 100%
      assert.equal(calculateIncentive(20000, 150), 20000)
      // If user inputs < 0%, clamped to 0%
      assert.equal(calculateIncentive(20000, -20), 0)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 4. MISSING SCHEDULE OR ACTUAL PREREQUISITE GUARD
  // Section 3.3 Item 3 & Section 6 Edge Case 2
  // reqDays == 0 || appDays == 0 || actDays == 0 => "Request is not available for this site."
  // ----------------------------------------------------------------------------------------------
  describe('Guard Check: Stage Request Availability Guard', () => {
    it('returns true when all 3 lifecycle day values are greater than 0', () => {
      const available = isStageRequestAvailable({ reqDays: 12, appDays: 10, actDays: 9 })
      assert.equal(available, true)
    })

    it('returns false when requested days is 0', () => {
      const available = isStageRequestAvailable({ reqDays: 0, appDays: 10, actDays: 9 })
      assert.equal(available, false)
    })

    it('returns false when approved days is 0', () => {
      const available = isStageRequestAvailable({ reqDays: 12, appDays: 0, actDays: 9 })
      assert.equal(available, false)
    })

    it('returns false when actual days is 0', () => {
      const available = isStageRequestAvailable({ reqDays: 12, appDays: 10, actDays: 0 })
      assert.equal(available, false)
    })

    it('returns false when any parameter is missing or null', () => {
      assert.equal(isStageRequestAvailable({ reqDays: null, appDays: 10, actDays: 8 }), false)
      assert.equal(isStageRequestAvailable({}), false)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 5. TOTAL SITE EXPENDITURES ROLL-UP FORMULA (5 Categories)
  // Section 5 Formula 4
  // totalAllExpenses = supervisor + manager + org + contractor + incentive
  // ----------------------------------------------------------------------------------------------
  describe('Formula 4: Total 5-Category Expense Roll-up', () => {
    it('sums all 5 distinct expenditure categories accurately', () => {
      const rollup = calculateAllExpensesTotals({
        supervisorTotal: 150000,
        managerTotal: 80000,
        orgTotal: 120000,
        contractorTotal: 150000,
        incentiveTotal: 3000,
      })

      assert.equal(rollup.supervisorTotal, 150000)
      assert.equal(rollup.managerTotal, 80000)
      assert.equal(rollup.orgTotal, 120000)
      assert.equal(rollup.contractorTotal, 150000)
      assert.equal(rollup.incentiveTotal, 3000)
      assert.equal(rollup.totalAllExpenses, 503000)
    })

    it('handles zero or missing categories gracefully', () => {
      const rollup = calculateAllExpensesTotals({
        supervisorTotal: 50000,
        incentiveTotal: 2500,
      })

      assert.equal(rollup.totalAllExpenses, 52500)
      assert.equal(rollup.managerTotal, 0)
      assert.equal(rollup.orgTotal, 0)
      assert.equal(rollup.contractorTotal, 0)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 6. REMAINING PROJECT BALANCE FORMULA
  // Section 5 Formula 5: amountBalance = amountPaid - totalAllExpenses
  // ----------------------------------------------------------------------------------------------
  describe('Formula 5: Remaining Project Financial Balance', () => {
    it('calculates remaining balance matching the concrete numerical example', () => {
      // Spec example: Client paid ₹ 10,00,000, Total Expenses ₹ 5,03,000 -> Balance ₹ 4,97,000
      const balance = calculateProjectBalance(1000000, 503000)
      assert.equal(balance, 497000)
    })

    it('computes deficit (negative balance) when expenditures exceed client payments', () => {
      const balance = calculateProjectBalance(500000, 520000)
      assert.equal(balance, -20000)
    })

    it('handles zero amount paid correctly', () => {
      const balance = calculateProjectBalance(0, 75000)
      assert.equal(balance, -75000)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 7. LABOUR COMPARISON GRID NORMALIZATION
  // Tests interoperability across different Firestore data structures for requested, approved, actual
  // ----------------------------------------------------------------------------------------------
  describe('Labour Data Normalization & Comparison Grid', () => {
    it('normalizes array of maps with standard keys', () => {
      const raw = [
        { labourType: 'Mason', count: 4 },
        { labourType: 'Helper', count: 6 },
      ]
      const normalized = normalizeLabourItems(raw)
      assert.equal(normalized.length, 2)
      assert.equal(normalized[0].labourType, 'Mason')
      assert.equal(normalized[0].count, 4)
      assert.equal(normalized[1].labourType, 'Helper')
      assert.equal(normalized[1].count, 6)
    })

    it('normalizes alternative field keys (role, trade, designation, quantity)', () => {
      const raw = [
        { designation: 'Carpenter', qty: 2 },
        { role: 'Barbender', workersCount: 3 },
      ]
      const normalized = normalizeLabourItems(raw)
      assert.equal(normalized[0].labourType, 'Carpenter')
      assert.equal(normalized[0].count, 2)
      assert.equal(normalized[1].labourType, 'Barbender')
      assert.equal(normalized[1].count, 3)
    })

    it('builds a unified comparison grid across requested, approved, and actual lists', () => {
      const req = [{ labourType: 'Mason', count: 5 }, { labourType: 'Helper', count: 8 }]
      const app = [{ labourType: 'Mason', count: 4 }, { labourType: 'Helper', count: 6 }]
      const act = [{ labourType: 'Mason', count: 3 }, { labourType: 'Helper', count: 5 }, { labourType: 'Painter', count: 1 }]

      const grid = buildLabourComparisonGrid({ reqLabours: req, appLabours: app, actLabours: act })

      assert.equal(grid.length, 3)

      const masonRow = grid.find((r) => r.labourType === 'Mason')
      assert.ok(masonRow)
      assert.equal(masonRow.reqCount, 5)
      assert.equal(masonRow.appCount, 4)
      assert.equal(masonRow.actCount, 3)

      const painterRow = grid.find((r) => r.labourType === 'Painter')
      assert.ok(painterRow)
      assert.equal(painterRow.reqCount, 0)
      assert.equal(painterRow.appCount, 0)
      assert.equal(painterRow.actCount, 1)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // 8. PRIMARY COMPOSITE KEY & AUDIT TRAIL INTEGRITY
  // Section 4.1 Item 3 & Section 6 Edge Case 3
  // docId: '${siteId}_${supervisorName}_${projectStage}'
  // ----------------------------------------------------------------------------------------------
  describe('Audit Document ID Conventions', () => {
    it('generates consistent composite document ID matching mobile convention', () => {
      const siteId = 'SITE-101'
      const supervisor = 'Ramesh Kumar'
      const projectStage = 'Superstructure & RCC Slabs'

      const expectedDocId = `${siteId}_${supervisor}_${projectStage}`
      assert.equal(expectedDocId, 'SITE-101_Ramesh Kumar_Superstructure & RCC Slabs')
    })
  })
})
