import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isHqIdentifier,
  isGenericSiteName,
  formatSiteLocationDisplay,
  resolveToolLocationDetails,
  COMPANY_HQ_WAREHOUSE_LABEL,
  COMPANY_HQ_TAG,
} from '../../utils/toolLocationUtils.js'

describe('Tool Location Telemetry & Resolution Unit Tests', () => {
  describe('isHqIdentifier', () => {
    it('identifies company HQ and warehouse labels accurately', () => {
      assert.strictEqual(isHqIdentifier('COMPANY_HQ'), true)
      assert.strictEqual(isHqIdentifier('HQ'), true)
      assert.strictEqual(isHqIdentifier('Company HQ Warehouse'), true)
      assert.strictEqual(isHqIdentifier('Central Yard (HQ)'), true)
      assert.strictEqual(isHqIdentifier('central_yard'), true)
      assert.strictEqual(isHqIdentifier('Central Warehouse'), true)
      assert.strictEqual(isHqIdentifier('central depot'), true)
    })

    it('rejects actual project site codes and names', () => {
      assert.strictEqual(isHqIdentifier('ST001'), false)
      assert.strictEqual(isHqIdentifier('ST002_Testing'), false)
      assert.strictEqual(isHqIdentifier('Riverside Commercial Complex'), false)
    })
  })

  describe('formatSiteLocationDisplay', () => {
    it('formats site code and site name cleanly as "ST001 - Site Name"', () => {
      assert.strictEqual(formatSiteLocationDisplay('ST001', 'Riverside Complex'), 'ST001 - Riverside Complex')
    })

    it('avoids duplicating site code when already prefixed in site name', () => {
      assert.strictEqual(formatSiteLocationDisplay('ST001', 'ST001 - Riverside Complex'), 'ST001 - Riverside Complex')
      assert.strictEqual(formatSiteLocationDisplay('ST001', 'ST001: Riverside Complex'), 'ST001 - Riverside Complex')
      assert.strictEqual(formatSiteLocationDisplay('ST001', 'ST001_Riverside Complex'), 'ST001 - Riverside Complex')
    })

    it('provides clean fallback when site name is missing or identical to code', () => {
      assert.strictEqual(formatSiteLocationDisplay('ST001', ''), 'ST001 - Site ST001')
      assert.strictEqual(formatSiteLocationDisplay('ST001', 'ST001'), 'ST001 - Site ST001')
    })

    it('handles missing site code gracefully', () => {
      assert.strictEqual(formatSiteLocationDisplay('', 'Green Valley Site'), 'Green Valley Site')
    })
  })

  describe('resolveToolLocationDetails', () => {
    const mockContext = {
      allSiteRecords: [
        {
          id: 'PR001_ST001_Riverside',
          siteId: 'ST001',
          siteCode: 'ST001',
          siteName: 'Riverside Commercial Complex',
          projectId: 'PR001',
          projectName: 'Riverside Luxury Towers',
        },
        {
          id: 'ST002',
          siteId: 'ST002',
          siteCode: 'ST002',
          name: 'Metro Line Station 4',
          projectTitle: 'Metro Phase II Extension',
        },
      ],
      toolMovements: [],
      materialTransactions: [],
      siteMaterialPool: [],
    }

    it('resolves site allocation matching siteId "ST001" with site code, name, and project name', () => {
      const res = resolveToolLocationDetails('ST001', '', '', '', mockContext)
      assert.strictEqual(res.isCompanyHq, false)
      assert.strictEqual(res.siteCode, 'ST001')
      assert.strictEqual(res.siteName, 'Riverside Commercial Complex')
      assert.strictEqual(res.projectName, 'Riverside Luxury Towers')
      assert.strictEqual(res.displayLocation, 'ST001 - Riverside Commercial Complex')
      assert.strictEqual(res.locationTag, 'Active at ST001 - Riverside Commercial Complex')
    })

    it('overrides legacy "Central Yard (HQ)" when tool is allocated to "ST001"', () => {
      const res = resolveToolLocationDetails('ST001', 'Central Yard (HQ)', '', '', mockContext)
      assert.strictEqual(res.isCompanyHq, false)
      assert.strictEqual(res.siteCode, 'ST001')
      assert.strictEqual(res.siteName, 'Riverside Commercial Complex')
      assert.strictEqual(res.displayLocation, 'ST001 - Riverside Commercial Complex')
      assert.strictEqual(res.locationTag, 'Active at ST001 - Riverside Commercial Complex')
    })

    it('resolves compound doc id "PR001_ST001_Riverside" correctly to "ST001 - Riverside Commercial Complex"', () => {
      const res = resolveToolLocationDetails('PR001_ST001_Riverside', '', '', '', mockContext)
      assert.strictEqual(res.isCompanyHq, false)
      assert.strictEqual(res.siteCode, 'ST001')
      assert.strictEqual(res.siteName, 'Riverside Commercial Complex')
      assert.strictEqual(res.displayLocation, 'ST001 - Riverside Commercial Complex')
    })

    it('resolves Company HQ Warehouse when siteId is "COMPANY_HQ" or "HQ"', () => {
      const resHq = resolveToolLocationDetails('COMPANY_HQ', '', '', '', mockContext)
      assert.strictEqual(resHq.isCompanyHq, true)
      assert.strictEqual(resHq.displayLocation, COMPANY_HQ_WAREHOUSE_LABEL)
      assert.strictEqual(resHq.locationTag, COMPANY_HQ_TAG)

      const resCentralYard = resolveToolLocationDetails('central_yard', '', '', '', mockContext)
      assert.strictEqual(resCentralYard.isCompanyHq, true)
      assert.strictEqual(resCentralYard.displayLocation, COMPANY_HQ_WAREHOUSE_LABEL)
      assert.strictEqual(resCentralYard.locationTag, COMPANY_HQ_TAG)
    })

    it('falls back humanely when siteId is uncatalogued e.g. "ST999_New_Highway"', () => {
      const res = resolveToolLocationDetails('ST999_New_Highway', '', '', '', mockContext)
      assert.strictEqual(res.isCompanyHq, false)
      assert.strictEqual(res.siteCode, 'ST999')
      assert.strictEqual(res.siteName, 'New Highway')
      assert.strictEqual(res.displayLocation, 'ST999 - New Highway')
      assert.strictEqual(res.locationTag, 'Active at ST999 - New Highway')
    })
  })
})
