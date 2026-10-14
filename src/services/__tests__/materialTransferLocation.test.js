import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatTransferLocation, resolveSite } from '../../utils/siteUtils.js'

describe('Material Transfer Location and Warehouse Display Tests', () => {
  const mockSites = [
    {
      id: 'PR001_ST001_Project1',
      siteId: 'ST001',
      siteCode: 'ST001',
      siteName: 'Project1',
      projectName: 'Project1',
      label: 'Project1 (ST001)',
    },
    {
      id: 'PR002_ST002_SkylineTowers',
      siteId: 'ST002',
      siteCode: 'ST002',
      siteName: 'Skyline Towers',
      projectName: 'Skyline Towers',
      label: 'Skyline Towers (ST002)',
    },
  ]

  describe('Warehouse Renaming to Company', () => {
    it('renames Warehouse and Central Warehouse variations to Company', () => {
      assert.strictEqual(formatTransferLocation('Central Warehouse', '', mockSites), 'Company')
      assert.strictEqual(formatTransferLocation('Warehouse', '', mockSites), 'Company')
      assert.strictEqual(formatTransferLocation('central_warehouse', '', mockSites), 'Company')
      assert.strictEqual(formatTransferLocation('HQ', '', mockSites), 'Company')
      assert.strictEqual(formatTransferLocation('Company', '', mockSites), 'Company')
      assert.strictEqual(formatTransferLocation('Central Warehouse / Main Depot', '', mockSites), 'Company')
      assert.strictEqual(formatTransferLocation('Central Warehouse / Main Godown', '', mockSites), 'Company')
    })

    it('resolves resolveSite warehouse label to Company', () => {
      const res = resolveSite('Central Warehouse', '', mockSites)
      assert.strictEqual(res.isWarehouse, true)
      assert.strictEqual(res.label, 'Company')
      assert.strictEqual(res.siteName, 'Company')
    })
  })

  describe('Dynamic Site Destination Formatting (${siteCode}_${projectName})', () => {
    it('formats destination as ST001_Project1 when given siteId ST001 and generic "Project Site"', () => {
      const formatted = formatTransferLocation('ST001', 'Project Site', mockSites)
      assert.strictEqual(formatted, 'ST001_Project1')
    })

    it('replaces generic "To: Project Site" with actual site ID and project name', () => {
      const formatted = formatTransferLocation('ST001', 'Project Site', mockSites, 'Project1')
      assert.strictEqual(formatted, 'ST001_Project1')
    })

    it('formats site when given matched site without project in doc', () => {
      const formatted = formatTransferLocation('ST001', '', mockSites)
      assert.strictEqual(formatted, 'ST001_Project1')
    })

    it('formats compound site ID correctly', () => {
      const formatted = formatTransferLocation('PR001_ST001_Project1', '', mockSites)
      assert.strictEqual(formatted, 'ST001_Project1')
    })

    it('formats site with multi-word project name cleanly', () => {
      const formatted = formatTransferLocation('ST002', 'Project Site', mockSites)
      assert.strictEqual(formatted, 'ST002_Skyline Towers')
    })

    it('handles already-formatted ST001_Project1 without duplication', () => {
      const formatted = formatTransferLocation('ST001', 'ST001_Project1', mockSites)
      assert.strictEqual(formatted, 'ST001_Project1')
    })

    it('fallbacks to ST001_Project1 if rawDocName is generic and only site code ST001 is provided', () => {
      const formatted = formatTransferLocation('ST001', 'Project Site', [])
      assert.strictEqual(formatted, 'ST001_Project1')
    })
  })
})
