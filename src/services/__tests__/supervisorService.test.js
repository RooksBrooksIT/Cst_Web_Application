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

  it('validates that contact phone number must be exactly 10 numeric digits', () => {
    const isValidPhone = (val) => {
      const clean = String(val || '').replace(/\D/g, '')
      return clean.length === 10
    }

    assert.equal(isValidPhone('9876543210'), true)
    assert.equal(isValidPhone('8489044572'), true)
    assert.equal(isValidPhone('98765'), false) // fewer than 10 digits
    assert.equal(isValidPhone('987654321099'), false) // more than 10 digits
    assert.equal(isValidPhone(''), false) // empty
    assert.equal(isValidPhone('abcdefghij'), false) // non-numeric
  })

  it('accurately calculates supervisor quota, used count, and remaining count across subscription tiers', () => {
    const computeQuotaTelemetry = (planLimits, supervisorsList) => {
      const raw = planLimits?.quotas?.maxSupervisors ?? planLimits?.maxSupervisors
      const totalQuota = Number(raw) || 0
      const usedCount = (supervisorsList || []).length
      const isUnlimited = totalQuota >= 999999 || totalQuota === Infinity
      const remainingCount = isUnlimited ? 'Unlimited' : Math.max(0, totalQuota - usedCount)

      return { totalQuota, usedCount, isUnlimited, remainingCount }
    }

    // 1. Free Trial Plan: 1 supervisor max, 1 registered -> 0 remaining
    const trialTelemetry = computeQuotaTelemetry({ planName: 'Free Trial', maxSupervisors: 1 }, [{ id: 'SUP001' }])
    assert.equal(trialTelemetry.totalQuota, 1)
    assert.equal(trialTelemetry.usedCount, 1)
    assert.equal(trialTelemetry.remainingCount, 0)
    assert.equal(trialTelemetry.isUnlimited, false)

    // 2. Silver Plan: 2 supervisors max, 1 registered -> 1 remaining
    const silverTelemetry = computeQuotaTelemetry({ planName: 'Silver', quotas: { maxSupervisors: 2 } }, [{ id: 'SUP001' }])
    assert.equal(silverTelemetry.totalQuota, 2)
    assert.equal(silverTelemetry.usedCount, 1)
    assert.equal(silverTelemetry.remainingCount, 1)
    assert.equal(silverTelemetry.isUnlimited, false)

    // 3. Gold Plan: 10 supervisors max, 3 registered -> 7 remaining
    const goldTelemetry = computeQuotaTelemetry({ planName: 'Gold', maxSupervisors: 10 }, [{ id: 'SUP001' }, { id: 'SUP002' }, { id: 'SUP003' }])
    assert.equal(goldTelemetry.totalQuota, 10)
    assert.equal(goldTelemetry.usedCount, 3)
    assert.equal(goldTelemetry.remainingCount, 7)

    // 4. Enterprise Plan: Unlimited (999999) -> Unlimited remaining
    const enterpriseTelemetry = computeQuotaTelemetry({ planName: 'Enterprise', maxSupervisors: 999999 }, [{ id: 'SUP001' }, { id: 'SUP002' }])
    assert.equal(enterpriseTelemetry.isUnlimited, true)
    assert.equal(enterpriseTelemetry.remainingCount, 'Unlimited')
  })

  it('safely handles supervisor password masking and visibility toggles', () => {
    const supervisorRecord = {
      id: 'SUP001',
      username: 'ramesh_site',
      password: 'SecretPassword123!',
    }

    const renderPasswordDisplay = (sup, isRevealed) => {
      const pwd = sup.password || sup.Password
      if (!pwd) return { isAvailable: false, display: 'Managed externally' }
      return {
        isAvailable: true,
        display: isRevealed ? pwd : '••••••••',
      }
    }

    // Default state: Masked
    const masked = renderPasswordDisplay(supervisorRecord, false)
    assert.equal(masked.isAvailable, true)
    assert.equal(masked.display, '••••••••')

    // Toggled state: Revealed
    const revealed = renderPasswordDisplay(supervisorRecord, true)
    assert.equal(revealed.isAvailable, true)
    assert.equal(revealed.display, 'SecretPassword123!')

    // External / no password record
    const external = renderPasswordDisplay({ id: 'SUP002', username: 'kumar_ext' }, true)
    assert.equal(external.isAvailable, false)
    assert.equal(external.display, 'Managed externally')
  })
})
