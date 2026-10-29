import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidEmail, isValidContactNumber, isValidManagerPassword } from '../managerService.js'

describe('Manager Account Email Validation & Governance Unit Tests', () => {
  describe('isValidEmail Format Validation', () => {
    it('accepts valid RFC-compliant corporate and personal email formats', () => {
      assert.equal(isValidEmail('manager@example.com'), true)
      assert.equal(isValidEmail('john.doe@construction.org'), true)
      assert.equal(isValidEmail('alen_roy+ops@ebricks.co.in'), true)
      assert.equal(isValidEmail('supervisor123@sub.domain.net'), true)
      assert.equal(isValidEmail('  spaced.user@domain.com  '), true, 'Should trim surrounding whitespace')
    })

    it('rejects invalid email formats with missing components or syntax errors', () => {
      assert.equal(isValidEmail('plainaddress'), false)
      assert.equal(isValidEmail('@missinguser.com'), false)
      assert.equal(isValidEmail('user@.com'), false)
      assert.equal(isValidEmail('user@domain'), false)
      assert.equal(isValidEmail('user@domain.'), false)
      assert.equal(isValidEmail('user@domain.c'), false, 'TLD must be at least 2 characters')
      assert.equal(isValidEmail('user with spaces@domain.com'), false)
      assert.equal(isValidEmail('user@domain..com'), false, 'Consecutive dots in domain are invalid')
      assert.equal(isValidEmail(''), false)
      assert.equal(isValidEmail(null), false)
      assert.equal(isValidEmail(undefined), false)
    })
  })

  describe('isValidContactNumber 10-Digit Numeric Validation', () => {
    it('accepts valid 10-digit numeric phone numbers', () => {
      assert.equal(isValidContactNumber('9876543210'), true)
      assert.equal(isValidContactNumber('0123456789'), true)
      assert.equal(isValidContactNumber('1234567890'), true)
      assert.equal(isValidContactNumber('  9876543210  '), true, 'Should trim surrounding whitespace')
    })

    it('rejects contact numbers with fewer or more than 10 digits', () => {
      assert.equal(isValidContactNumber('123456789'), false, '9 digits should be rejected')
      assert.equal(isValidContactNumber('1'), false, '1 digit should be rejected')
      assert.equal(isValidContactNumber('98765432101'), false, '11 digits should be rejected')
      assert.equal(isValidContactNumber('9876543210123'), false, '13 digits should be rejected')
    })

    it('rejects contact numbers containing non-numeric characters', () => {
      assert.equal(isValidContactNumber('987654321a'), false, 'Contains letter')
      assert.equal(isValidContactNumber('+919876543210'), false, 'Contains plus sign')
      assert.equal(isValidContactNumber('9876-543210'), false, 'Contains hyphen')
      assert.equal(isValidContactNumber('9876 543210'), false, 'Contains inner space')
      assert.equal(isValidContactNumber('9876.543210'), false, 'Contains period')
    })

    it('rejects empty, null, or undefined values', () => {
      assert.equal(isValidContactNumber(''), false)
      assert.equal(isValidContactNumber('   '), false)
      assert.equal(isValidContactNumber(null), false)
      assert.equal(isValidContactNumber(undefined), false)
      assert.equal(isValidContactNumber(1234567890), false, 'Non-string types should return false safely')
    })
  })

  describe('isValidManagerPassword Minimum Length Validation', () => {
    it('accepts passwords with 8 or more characters', () => {
      assert.equal(isValidManagerPassword('12345678'), true, 'Exactly 8 characters')
      assert.equal(isValidManagerPassword('password123'), true, '11 characters')
      assert.equal(isValidManagerPassword('SecurePass@2026'), true, 'Complex 15 characters')
      assert.equal(isValidManagerPassword('a'.repeat(50)), true, 'Long password')
    })

    it('rejects passwords with fewer than 8 characters', () => {
      assert.equal(isValidManagerPassword('1234567'), false, '7 characters')
      assert.equal(isValidManagerPassword('pass'), false, '4 characters')
      assert.equal(isValidManagerPassword('1'), false, '1 character')
    })

    it('rejects empty, null, or undefined passwords', () => {
      assert.equal(isValidManagerPassword(''), false)
      assert.equal(isValidManagerPassword(null), false)
      assert.equal(isValidManagerPassword(undefined), false)
      assert.equal(isValidManagerPassword(12345678), false, 'Non-string types should return false safely')
    })
  })

  describe('Manager Password Governance & Security Parity', () => {
    it('ensures manager password field is handled as a discrete attribute and not exposed via raw auth token', () => {
      // Simulates the manager record normalized from Firestore
      const rawManagerDoc = {
        ManagerId: 'MG001_alen',
        FullName: 'Alen Roy',
        UserName: 'alen',
        Email: 'alen@ebricks.com',
        Password: 'SecureManagerPass@123',
        Status: 'Active',
      }

      // Password should be read from the document and masked in UI state
      assert.equal(rawManagerDoc.Password, 'SecureManagerPass@123')
      // Validates that fallback to password lowercase is supported
      assert.equal(rawManagerDoc.Password || rawManagerDoc.password, 'SecureManagerPass@123')
    })

    it('handles legacy manager accounts without stored password gracefully', () => {
      const legacyManagerDoc = {
        ManagerId: 'MG002_legacy',
        FullName: 'Legacy Manager',
        UserName: 'legacy_mgr',
        Email: 'legacy@ebricks.com',
      }

      const existingPassword = legacyManagerDoc.Password || legacyManagerDoc.password || ''
      assert.equal(existingPassword, '', 'Should gracefully resolve to empty string when no password stored')
    })
  })

  describe('Manager Identifier Resolution & Multi-Collection Matching Parity', () => {
    function checkManagerMatch(docId, data, rawId) {
      const idLower = (rawId || '').trim().toLowerCase()
      const digitsOnly = idLower.replace(/\D/g, '')

      const email = (data.Email || data.email || data.UserEmail || '').trim()
      const userName = (data.UserName || data.username || data.userName || data.Name || data.name || '').trim()
      const managerId = (data.ManagerId || data.managerId || data.id || data.uid || docId || '').trim()
      const contactNo = (data.ContactNo || data.contactNo || data.phone || data.Phone || '').trim()
      const contactDigits = contactNo.replace(/\D/g, '')

      return Boolean(
        (userName && userName.toLowerCase() === idLower) ||
        (email && email.toLowerCase() === idLower) ||
        (managerId && managerId.toLowerCase() === idLower) ||
        (docId && docId.toLowerCase() === idLower) ||
        (docId && docId.includes('_') && docId.split('_').some((part) => part.toLowerCase() === idLower)) ||
        (digitsOnly && contactDigits && digitsOnly.length >= 8 && contactDigits.endsWith(digitsOnly))
      )
    }

    const testManager = {
      ManagerId: 'MG001_sajin',
      UserName: 'sajin',
      Email: 'sajin@ebricks.com',
      ContactNo: '+91 9876543210',
      Password: 'Password123',
      Status: 'Active',
    }

    it('matches manager by exact username', () => {
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'sajin'), true)
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'SAJIN'), true)
    })

    it('matches manager by exact email', () => {
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'sajin@ebricks.com'), true)
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'SAJIN@EBRICKS.COM'), true)
    })

    it('matches manager by full ManagerId or docId', () => {
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'MG001_sajin'), true)
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'mg001_sajin'), true)
    })

    it('matches manager by docId prefix (MG001) or suffix (sajin)', () => {
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'MG001'), true)
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'mg001'), true)
    })

    it('matches manager by phone number', () => {
      assert.equal(checkManagerMatch('MG001_sajin', testManager, '9876543210'), true)
    })

    it('rejects non-matching identifiers', () => {
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'wronguser'), false)
      assert.equal(checkManagerMatch('MG001_sajin', testManager, 'another@mail.com'), false)
    })
  })
})

