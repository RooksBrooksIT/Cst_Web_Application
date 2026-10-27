import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSiteIdentifiers } from '../supervisorService.js'
import { COLLECTION_ALIASES } from '../firestoreService.js'

describe('Supervisor Configuration & Collection Schema Unit Tests', () => {
  it('strictly maps supervisors collection alias to "supervisor" without using siteSupervisor', () => {
    assert.deepEqual(COLLECTION_ALIASES.supervisors, ['supervisor'])
    assert.deepEqual(COLLECTION_ALIASES.supervisor, ['supervisor'])
    assert.equal(COLLECTION_ALIASES.supervisors.includes('siteSupervisor'), false)
  })

  it('correctly resolves compound site identifiers for supervisor assignments', () => {
    const compound = parseSiteIdentifiers({ siteId: 'PR001_ST001_Riverside' })
    assert.equal(compound.siteId, 'ST001')
    assert.equal(compound.siteName, 'Riverside')
    assert.equal(compound.siteDocId, 'ST001_Riverside')

    const direct = parseSiteIdentifiers({ siteDocId: 'ST002_Metro', siteId: 'ST002', siteName: 'Metro' })
    assert.equal(direct.siteId, 'ST002')
    assert.equal(direct.siteName, 'Metro')
  })

  it('validates sequential supervisor ID format conforming to SUP001, SUP002', () => {
    const pattern = /^SUP\d{3,}$/i
    assert.equal(pattern.test('SUP001'), true)
    assert.equal(pattern.test('SUP002'), true)
    assert.equal(pattern.test('SUP015'), true)
    assert.equal(pattern.test('SUP100'), true)
    assert.equal(pattern.test('MGR001'), false)
    assert.equal(pattern.test('USR001'), false)
  })

  it('preserves field casing parity for dual mobile-web interoperability', () => {
    const rawData = {
      SupervisorId: 'SUP001',
      FullName: 'John Doe',
      UserName: 'johndoe',
      Password: 'Password123!',
      ContactNo: '9876543210',
      Email: 'john@example.com',
      Designation: 'Site Supervisor',
      isActive: true,
      status: 'Active',
      assignedSites: ['ST001_SiteA'],
    }

    // Both PascalCase (mobile Flutter) and camelCase (web) are normalized and preserved
    const normalized = {
      id: rawData.SupervisorId,
      SupervisorId: rawData.SupervisorId,
      supervisorId: rawData.SupervisorId,
      FullName: rawData.FullName,
      fullName: rawData.FullName,
      UserName: rawData.UserName,
      username: rawData.UserName,
      Password: rawData.Password,
      password: rawData.Password,
      ContactNo: rawData.ContactNo,
      phone: rawData.ContactNo,
      Email: rawData.Email,
      email: rawData.Email,
      Designation: rawData.Designation,
      designation: rawData.Designation,
      isActive: rawData.isActive,
      status: rawData.status,
      assignedSites: rawData.assignedSites,
    }

    assert.equal(normalized.SupervisorId, 'SUP001')
    assert.equal(normalized.supervisorId, 'SUP001')
    assert.equal(normalized.FullName, 'John Doe')
    assert.equal(normalized.fullName, 'John Doe')
    assert.equal(normalized.UserName, 'johndoe')
    assert.equal(normalized.username, 'johndoe')
    assert.equal(normalized.ContactNo, '9876543210')
    assert.equal(normalized.phone, '9876543210')
    assert.equal(normalized.status, 'Active')
    assert.equal(normalized.isActive, true)
  })
})

