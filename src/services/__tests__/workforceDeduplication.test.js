import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function isRawAuthUid(str) {
  if (!str || typeof str !== 'string') return false
  const trimmed = str.trim()
  return /^[A-Za-z0-9_-]{24,36}$/.test(trimmed) && /[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed) && /[0-9]/.test(trimmed)
}

function deduplicateWorkforce(records, { orgId = 'newone', currentUid = 'YAecgs39I7YHCYJmVfTGLKbCdez1', currentUsername = 'newone' } = {}) {
  const dedupeMap = new Map()

  const findExisting = (incoming) => {
    for (const existing of dedupeMap.values()) {
      // 1. Direct ID match
      if (existing.id && incoming.id && existing.id.toLowerCase() === incoming.id.toLowerCase()) {
        return existing
      }
      // 2. Email match
      if (existing.email && incoming.email && existing.email.toLowerCase() === incoming.email.toLowerCase()) {
        return existing
      }
      // 3. Phone match
      const p1 = (existing.phone || '').replace(/\D/g, '')
      const p2 = (incoming.phone || '').replace(/\D/g, '')
      if (p1.length >= 7 && p2.length >= 7 && p1 === p2) {
        return existing
      }
      // 4. Username match
      if (existing.username && incoming.username && existing.username.toLowerCase() === incoming.username.toLowerCase()) {
        return existing
      }
      // 5. Both Organization Head
      if (existing.roleCategory === 'org_admin' && incoming.roleCategory === 'org_admin') {
        return existing
      }
      // 6. Direct match with current UID
      if (currentUid && (existing.id === currentUid || incoming.id === currentUid)) {
        if (existing.roleCategory === 'org_admin' || incoming.roleCategory === 'org_admin') {
          return existing
        }
      }
    }
    return null
  }

  const mergeInto = (existing, incoming) => {
    if (isRawAuthUid(existing.id) || existing.id === currentUid) {
      if (!isRawAuthUid(incoming.id) && incoming.id) {
        existing.id = incoming.id
      } else {
        existing.id = incoming.username || existing.username || currentUsername || orgId || 'ORG-HEAD'
      }
    } else if (!existing.id && incoming.id && !isRawAuthUid(incoming.id)) {
      existing.id = incoming.id
    }

    if (existing.roleCategory === 'org_admin' && (isRawAuthUid(existing.id) || existing.id === currentUid)) {
      existing.id = incoming.username || existing.username || currentUsername || orgId || 'ORG-HEAD'
    }

    if ((!existing.fullName || existing.fullName === 'Organization Head') && incoming.fullName) {
      existing.fullName = incoming.fullName
    }
    if (!existing.email && incoming.email) existing.email = incoming.email
    if (!existing.phone && incoming.phone) existing.phone = incoming.phone
    if (!existing.username && incoming.username) existing.username = incoming.username
  }

  records.forEach((record) => {
    let normalized = { ...record }
    if (normalized.roleCategory === 'org_admin') {
      if (isRawAuthUid(normalized.id) || normalized.id === currentUid) {
        normalized.id = currentUsername || normalized.username || orgId || 'ORG-HEAD'
      }
    }

    const existing = findExisting(normalized)
    if (existing) {
      mergeInto(existing, normalized)
    } else {
      dedupeMap.set(normalized.id || normalized.email, normalized)
    }
  })

  return Array.from(dedupeMap.values())
}

describe('Workforce Deduplication & UID Suppression Tests', () => {
  it('correctly identifies Firebase Auth UIDs and distinguishes business IDs', () => {
    assert.equal(isRawAuthUid('YAecgs39I7YHCYJmVfTGLKbCdez1'), true)
    assert.equal(isRawAuthUid('5v6yZ9q1p8ABCDEFghij12345678'), true)
    assert.equal(isRawAuthUid('newone'), false)
    assert.equal(isRawAuthUid('MGR001'), false)
    assert.equal(isRawAuthUid('SUP001'), false)
    assert.equal(isRawAuthUid('ORG-HEAD'), false)
  })

  it('deduplicates duplicate organization head records into exactly one entry', () => {
    const records = [
      {
        id: 'newone',
        fullName: 'newone',
        username: 'newone',
        email: 'newone@gmail.com',
        phone: '9807654324',
        roleCategory: 'org_admin',
        designation: 'Organization Head',
      },
      {
        id: 'YAecgs39I7YHCYJmVfTGLKbCdez1',
        fullName: 'newone',
        username: 'newone',
        email: 'newone@gmail.com',
        phone: '9807654324',
        roleCategory: 'org_admin',
        designation: 'Organization Head',
      },
    ]

    const result = deduplicateWorkforce(records)
    assert.equal(result.length, 1, 'Must collapse duplicate records to exactly 1')
    assert.equal(result[0].id, 'newone', 'Must retain clean business ID, never raw UID')
    assert.equal(result[0].fullName, 'newone')
    assert.equal(result[0].email, 'newone@gmail.com')
  })

  it('suppresses raw Firebase Auth UID even when only UID record arrives first', () => {
    const records = [
      {
        id: 'YAecgs39I7YHCYJmVfTGLKbCdez1',
        fullName: 'newone',
        username: 'newone',
        email: 'newone@gmail.com',
        phone: '9807654324',
        roleCategory: 'org_admin',
      },
    ]

    const result = deduplicateWorkforce(records, { orgId: 'newone', currentUsername: 'newone' })
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'newone', 'Must sanitize raw auth UID to username/orgId')
    assert.notEqual(result[0].id, 'YAecgs39I7YHCYJmVfTGLKbCdez1')
  })

  it('deduplicates based on email match between disparate doc IDs', () => {
    const records = [
      {
        id: 'MGR_AUTO_001',
        fullName: 'Alice Smith',
        email: 'alice@example.com',
        phone: '9123456789',
        roleCategory: 'manager',
      },
      {
        id: 'MGR001',
        fullName: 'Alice Smith',
        email: 'alice@example.com',
        phone: '9123456789',
        roleCategory: 'manager',
      },
    ]

    const result = deduplicateWorkforce(records)
    assert.equal(result.length, 1)
  })
})
