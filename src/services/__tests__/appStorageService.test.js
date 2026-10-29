import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatSiteStorageFolder,
  cleanStorageFileName,
  inferMimeType,
  formatBytes,
} from '../appStorageService.js'

describe('Cloud Storage Service & Multi-Tenant Paths Unit Tests', () => {
  describe('formatSiteStorageFolder Resolution', () => {
    it('formats basic siteId and siteName cleanly as {siteId}_{siteName}', () => {
      const folder = formatSiteStorageFolder('ST001', 'Testing')
      assert.equal(folder, 'ST001_Testing')
    })

    it('removes spaces from siteName when generating storage folder', () => {
      const folder = formatSiteStorageFolder('ST001', 'Riverside Complex')
      assert.equal(folder, 'ST001_RiversideComplex')
    })

    it('preserves existing underscore format e.g. ST001_Testing', () => {
      const folder = formatSiteStorageFolder('ST001_Testing', 'Testing')
      assert.equal(folder, 'ST001_Testing')
    })

    it('strips project code prefix PR001_ from site doc ID', () => {
      const folder1 = formatSiteStorageFolder('PR001_ST001_Testing')
      assert.equal(folder1, 'ST001_Testing')

      const folder2 = formatSiteStorageFolder('PR001_ST002', 'Commercial')
      assert.equal(folder2, 'ST002_Commercial')
    })

    it('resolves site folder dynamically from sitesList when siteName is not provided', () => {
      const sitesList = [
        { id: 'ST001', siteCode: 'ST001', siteName: 'Testing' },
        { id: 'doc_123', siteId: 'ST002', siteCode: 'ST002', name: 'Downtown' },
      ]
      const folder1 = formatSiteStorageFolder('ST001', '', sitesList)
      assert.equal(folder1, 'ST001_Testing')

      const folder2 = formatSiteStorageFolder('doc_123', '', sitesList)
      assert.equal(folder2, 'ST002_Downtown')
    })

    it('falls back safely when no site ID or name is provided', () => {
      assert.equal(formatSiteStorageFolder('', ''), 'DEFAULT_SITE')
      assert.equal(formatSiteStorageFolder(null, null), 'DEFAULT_SITE')
    })
  })

  describe('cleanStorageFileName & Extension Handling', () => {
    it('sanitizes slashes, backslashes, and path traversal characters', () => {
      assert.equal(cleanStorageFileName('../../bill.pdf'), '.._.._bill.pdf')
      assert.equal(cleanStorageFileName('folder/sub/invoice.png'), 'folder_sub_invoice.png')
      assert.equal(cleanStorageFileName('invoice\\test.jpg'), 'invoice_test.jpg')
    })

    it('replaces spaces with underscores', () => {
      assert.equal(cleanStorageFileName('cement invoice march 2026.pdf'), 'cement_invoice_march_2026.pdf')
    })

    it('infers accurate MIME content types for common invoice document formats', () => {
      assert.equal(inferMimeType('invoice.pdf'), 'application/pdf')
      assert.equal(inferMimeType('bill.jpg'), 'image/jpeg')
      assert.equal(inferMimeType('receipt.jpeg'), 'image/jpeg')
      assert.equal(inferMimeType('scan.png'), 'image/png')
      assert.equal(inferMimeType('photo.webp'), 'image/webp')
      assert.equal(inferMimeType('data.bin'), 'application/octet-stream')
    })

    it('formats byte sizes into human-readable strings', () => {
      assert.equal(formatBytes(0), '0 B')
      assert.equal(formatBytes(1024), '1 KB')
      assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB')
    })
  })

  describe('Storage Path Scoping & Security Rules Parity', () => {
    it('ensures organization expense storage path matches /organisation/{orgId}/Organization_exp_bill/{siteFolder}/', () => {
      const orgId = 'cst_RBConstruction_19-09-2026'
      const siteFolder = formatSiteStorageFolder('ST001', 'Testing')
      const timestamp = 1729123456789
      const billNo = 'BILL-101'
      const fileName = 'cement_bill.pdf'
      const cleanBillNo = cleanStorageFileName(billNo)
      const cleanName = cleanStorageFileName(fileName)
      const image = `${timestamp}_${cleanBillNo}_${cleanName}`

      const storagePath = `organisation/${orgId}/Organization_exp_bill/${siteFolder}/${image}`

      assert.equal(
        storagePath,
        'organisation/cst_RBConstruction_19-09-2026/Organization_exp_bill/ST001_Testing/1729123456789_BILL-101_cement_bill.pdf'
      )
      // Must start with organisation/ to satisfy Firebase Storage security rules
      assert.ok(storagePath.startsWith(`organisation/${orgId}/`))
      assert.ok(storagePath.includes('/Organization_exp_bill/'))
      assert.ok(storagePath.includes('/ST001_Testing/'))
    })

    it('ensures manager expense storage path matches /organisation/{orgId}/Manager_exp_bill/{siteFolder}/', () => {
      const orgId = 'cst_RBConstruction_19-09-2026'
      const siteFolder = formatSiteStorageFolder('ST001', 'Testing')
      const timestamp = 1729123456789
      const billNo = 'MGR-552'
      const fileName = 'petrol_receipt.jpg'
      const cleanBillNo = cleanStorageFileName(billNo)
      const cleanName = cleanStorageFileName(fileName)
      const image = `${timestamp}_${cleanBillNo}_${cleanName}`

      const storagePath = `organisation/${orgId}/Manager_exp_bill/${siteFolder}/${image}`

      assert.equal(
        storagePath,
        'organisation/cst_RBConstruction_19-09-2026/Manager_exp_bill/ST001_Testing/1729123456789_MGR-552_petrol_receipt.jpg'
      )
      // Must start with organisation/ to satisfy Firebase Storage security rules
      assert.ok(storagePath.startsWith(`organisation/${orgId}/`))
      assert.ok(storagePath.includes('/Manager_exp_bill/'))
      assert.ok(storagePath.includes('/ST001_Testing/'))
    })

    it('incorporates billNo cleanly without duplicate tokens if already in filename', () => {
      const timestamp = 1729123456789
      const billNo = 'INV100'
      const fileName = 'INV100_vendor.jpg'
      const cleanBillNo = cleanStorageFileName(billNo)
      const cleanFileName = cleanStorageFileName(fileName)

      const image = cleanBillNo && !cleanFileName.toLowerCase().includes(cleanBillNo.toLowerCase())
        ? `${timestamp}_${cleanBillNo}_${cleanFileName}`
        : `${timestamp}_${cleanFileName}`

      assert.equal(image, '1729123456789_INV100_vendor.jpg')
    })
  })
})

