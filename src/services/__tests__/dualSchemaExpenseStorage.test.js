import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  setOrganizationSchema,
  getOrganizationSchema,
  isNewOrganizationSync,
  clearSchemaCache,
} from '../schemaResolverService.js'

import {
  resolveCanonicalSiteKey,
  generateOrganizationExpenseDocId,
} from '../organizationExpenseService.js'

import {
  generateManagerExpenseDocId,
} from '../managerExpenseService.js'

import { processRawGranularExpenseDocs } from '../financeService.js'
import { calculateDailySiteExpenses, calculateDateRangeExpenses } from '../reportService.js'

describe('Dual Firestore Expense Storage & Schema Resolver Tests', () => {
  beforeEach(() => {
    clearSchemaCache()
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  describe('1. Schema Resolver & Tenant Classification', () => {
    it('defaults unversioned, null, or undefined organization to existing (legacy) organization', () => {
      assert.equal(isNewOrganizationSync('cst_LegacyOrg_28-10-2026'), false)
      assert.equal(isNewOrganizationSync(''), false)
      assert.equal(isNewOrganizationSync(null), false)
      assert.equal(isNewOrganizationSync(undefined), false)
    })

    it('identifies schemaVersion: 1 as existing organization', () => {
      setOrganizationSchema('cst_ExistingClient_01-01-2026', 1, 'legacy')
      assert.equal(isNewOrganizationSync('cst_ExistingClient_01-01-2026'), false)
      const schema = getOrganizationSchema('cst_ExistingClient_01-01-2026')
      assert.equal(schema.schemaVersion, 1)
      assert.equal(schema.dataMode, 'legacy')
    })

    it('identifies schemaVersion: 2 as newly registered organization (canonical single-collection)', () => {
      setOrganizationSchema('cst_NewEnterprise_31-10-2026', 2, 'canonical')
      assert.equal(isNewOrganizationSync('cst_NewEnterprise_31-10-2026'), true)
      const schema = getOrganizationSchema('cst_NewEnterprise_31-10-2026')
      assert.equal(schema.schemaVersion, 2)
      assert.equal(schema.dataMode, 'canonical')
    })

    it('identifies dataMode: "canonical" as new organization even if version is unspecified', () => {
      setOrganizationSchema('cst_CanonicalTenant_2026', 2, 'canonical')
      assert.equal(isNewOrganizationSync('cst_CanonicalTenant_2026'), true)
    })

    it('resolves schema from active session in localStorage if not in memory cache', () => {
      const mockSession = {
        orgId: 'cst_SessionTenant_2026',
        schemaVersion: 2,
        dataMode: 'canonical',
      }
      globalThis.localStorage = {
        store: { constructa_session: JSON.stringify(mockSession) },
        getItem(key) {
          return this.store[key] || null
        },
        setItem(key, val) {
          this.store[key] = String(val)
        },
        clear() {
          this.store = {}
        },
      }

      assert.equal(isNewOrganizationSync('cst_SessionTenant_2026'), true)
    })
  })

  describe('2. Deterministic Expense Document ID Strategy', () => {
    it('generates consistent canonical site key without project ID prefixes', () => {
      assert.equal(resolveCanonicalSiteKey('PR001_ST001_SkylineTower'), 'ST001_SkylineTower')
      assert.equal(resolveCanonicalSiteKey('ST001_SkylineTower'), 'ST001_SkylineTower')
      assert.equal(
        resolveCanonicalSiteKey({ siteId: 'ST002', siteCode: 'ST002', projectName: 'Highway Bridge' }),
        'ST002_HighwayBridge'
      )
    })

    it('generates deterministic organization expense document ID in format: {siteKey}_{ddMMyyyy}', () => {
      const docId = generateOrganizationExpenseDocId({
        siteId: 'ST001_MetroStation',
        expenseDate: new Date('2026-10-31T10:00:00.000Z'),
      })
      assert.equal(docId, 'ST001_MetroStation_31102026')
      assert.equal(docId.includes('OEXP_'), false)
      assert.equal(docId.includes('PR001_'), false)
    })

    it('generates deterministic manager expense document ID in format: {siteKey}_{ddMMyyyy}', () => {
      const docId = generateManagerExpenseDocId({
        siteId: 'ST003_CommercialMall',
        expenseDate: new Date('2026-10-31T10:00:00.000Z'),
      })
      assert.equal(docId, 'ST003_CommercialMall_31102026')
      assert.equal(docId.includes('PR001_'), false)
    })
  })

  describe('3. Finance Ledger Data Isolation & Deduplication', () => {
    const siteObj = {
      id: 'ST001',
      siteId: 'ST001',
      siteCode: 'ST001',
      siteName: 'Metro Hub',
      projectName: 'Metro Hub',
    }

    it('processes single-collection expenses cleanly for new organizations without needing legacy collections', () => {
      const sourcesWithDocs = [
        {
          col: 'organizationExpenses',
          category: 'Organization Expense',
          docs: [
            {
              id: 'ST001_MetroHub_31102026',
              data: {
                siteId: 'ST001_MetroHub',
                totalAmount: 45000,
                amount: 45000,
                bills: [
                  { billNo: 'INV-401', vendor: 'ACC Cement', amount: 45000, quantity: 150 },
                ],
              },
            },
          ],
        },
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [
            {
              id: 'ST001_MetroHub_30102026',
              data: {
                siteId: 'ST001_MetroHub',
                totalAmount: 18000,
                amount: 18000,
                bills: [
                  { billNo: 'MGR-102', vendor: 'Safety Gear Corp', amount: 18000, quantity: 30 },
                ],
              },
            },
          ],
        },
      ]

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs,
        siteId: 'ST001',
        siteObj,
      })

      assert.equal(results.length, 2)
      assert.equal(results[0].amount, 45000)
      assert.equal(results[0].billNo, 'INV-401')
      assert.equal(results[0].category, 'Organization Expense')
      assert.equal(results[1].amount, 18000)
      assert.equal(results[1].billNo, 'MGR-102')
      assert.equal(results[1].category, 'Manager Direct Expense')
    })

    it('preserves backward compatibility and deduplicates mirrored documents for existing organizations', () => {
      const sharedDocId = 'ST001_MetroHub_29102026'
      const payload = {
        siteId: 'ST001_MetroHub',
        totalAmount: 25000,
        amount: 25000,
        bills: [{ billNo: 'LEG-881', vendor: 'Jindal TMT', amount: 25000, quantity: 5 }],
      }

      const sourcesWithDocs = [
        {
          col: 'managerExpenses',
          category: 'Manager Direct Expense',
          docs: [{ id: sharedDocId, data: payload }],
        },
        {
          col: 'managerEntries',
          category: 'Manager Approved',
          docs: [{ id: sharedDocId, data: payload }],
        },
      ]

      const results = processRawGranularExpenseDocs({
        sourcesWithDocs,
        siteId: 'ST001',
        siteObj,
      })

      // Exactly 1 entry returned, not 2
      assert.equal(results.length, 1)
      assert.equal(results[0].id, sharedDocId)
      assert.equal(results[0].amount, 25000)
      assert.equal(results[0].billNo, 'LEG-881')
    })
  })

  describe('4. Reporting & Calculations Dual-Mode Parity', () => {
    const site = {
      id: 'ST001',
      siteId: 'ST001',
      siteName: 'Riverside Towers',
      projectName: 'Riverside Towers',
    }

    it('calculates daily site expenses accurately using only canonical collections for new orgs', () => {
      const dailyExpenses = calculateDailySiteExpenses({
        site,
        selectedDate: '2026-10-31',
        organizationExpenses: [
          {
            id: 'ST001_RiversideTowers_31102026',
            siteId: 'ST001',
            date: '2026-10-31',
            bills: [{ billNo: 'B1', amount: 5000, vendor: 'Local Timber', description: 'Formwork' }],
          },
        ],
        managerExpenses: [
          {
            id: 'ST001_RiversideTowers_31102026_MGR',
            siteId: 'ST001',
            date: '2026-10-31',
            bills: [{ billNo: 'M1', amount: 2000, vendor: 'Electrical Supplies', description: 'Cables' }],
          },
        ],
        organizationEntries: [], // Clean empty in new organizations
        managerEntries: [],      // Clean empty in new organizations
      })

      assert.equal(dailyExpenses.totalBills, 7000)
      assert.equal(dailyExpenses.bills.length, 2)
    })

    it('calculates date range expenses accurately without duplicate counting', () => {
      const rangeResult = calculateDateRangeExpenses({
        site,
        fromDate: '2026-10-30',
        toDate: '2026-10-31',
        organizationExpenses: [
          {
            id: 'ST001_RiversideTowers_30102026',
            siteId: 'ST001',
            date: '2026-10-30',
            bills: [{ billNo: 'B-30', amount: 3000, vendor: 'Hardware Depot' }],
          },
          {
            id: 'ST001_RiversideTowers_31102026',
            siteId: 'ST001',
            date: '2026-10-31',
            bills: [{ billNo: 'B-31', amount: 4000, vendor: 'Hardware Depot' }],
          },
        ],
        managerExpenses: [],
        organizationEntries: [],
        managerEntries: [],
      })

      assert.equal(rangeResult.kpis.grandTotal, 7000)
      assert.equal(rangeResult.kpis.totalBills, 7000)
      assert.equal(rangeResult.dayCards.length, 2)
    })
  })
})
