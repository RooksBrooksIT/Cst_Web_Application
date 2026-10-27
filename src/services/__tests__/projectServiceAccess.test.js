import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  verifyNotOrganizationUser,
  createProject,
  updateProject,
  deleteProject,
  createProjectAndSiteAtomic,
  updateProjectAndSiteDoc,
} from '../projectService.js'

describe('Project Service Role-Based Access Control', () => {
  const originalWindow = global.window

  beforeEach(() => {
    // Reset global.window mock
    global.window = undefined
  })

  afterEach(() => {
    global.window = originalWindow
  })

  describe('verifyNotOrganizationUser function', () => {
    it('throws PERMISSION_DENIED for Organization role in actor', () => {
      assert.throws(
        () => verifyNotOrganizationUser({ role: 'Organization' }),
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('throws PERMISSION_DENIED for Organization Admin role in actor', () => {
      assert.throws(
        () => verifyNotOrganizationUser({ role: 'Organization Admin' }),
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('throws PERMISSION_DENIED for admin and org alias roles', () => {
      assert.throws(() => verifyNotOrganizationUser({ role: 'admin' }))
      assert.throws(() => verifyNotOrganizationUser({ role: 'org' }))
      assert.throws(() => verifyNotOrganizationUser({ role: 'organisation' }))
      assert.throws(() => verifyNotOrganizationUser({ role: 'enterprise' }))
    })

    it('allows Manager roles without throwing', () => {
      assert.doesNotThrow(() => verifyNotOrganizationUser({ role: 'Manager' }))
      assert.doesNotThrow(() => verifyNotOrganizationUser({ role: 'Operations Manager' }))
      assert.doesNotThrow(() => verifyNotOrganizationUser({ id: 'mgr_123', name: 'Bob', role: 'manager' }))
    })

    it('checks active localStorage session in browser environment and blocks Organization user', () => {
      global.window = {
        localStorage: {
          getItem: (key) => {
            if (key === 'constructa_session') {
              return JSON.stringify({ role: 'Organization', uid: 'org_user_1' })
            }
            return null
          },
        },
      }

      assert.throws(
        () => verifyNotOrganizationUser(),
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('permits operations when localStorage session is a Manager', () => {
      global.window = {
        localStorage: {
          getItem: (key) => {
            if (key === 'constructa_session') {
              return JSON.stringify({ role: 'Manager', uid: 'mgr_user_1' })
            }
            return null
          },
        },
      }

      assert.doesNotThrow(() => verifyNotOrganizationUser({ role: 'Manager' }))
    })
  })

  describe('createProject, updateProject, deleteProject access guards', () => {
    it('createProject rejects Organization role', async () => {
      await assert.rejects(
        async () => {
          await createProject('cst_test_org', { siteName: 'Test Site' }, { role: 'Organization' })
        },
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('createProject rejects default Organization context when called without actor', async () => {
      await assert.rejects(
        async () => {
          await createProject('cst_test_org', { siteName: 'Test Site' })
        },
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('updateProject rejects Organization role', async () => {
      await assert.rejects(
        async () => {
          await updateProject('cst_test_org', 'prj_123', { name: 'Updated Site' }, { role: 'Organization' })
        },
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('deleteProject rejects Organization role', async () => {
      await assert.rejects(
        async () => {
          await deleteProject('cst_test_org', 'prj_123', { role: 'Organization' })
        },
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })
  })

  describe('createProjectAndSiteAtomic and updateProjectAndSiteDoc access guards', () => {
    it('createProjectAndSiteAtomic rejects when actor is Organization user', async () => {
      await assert.rejects(
        async () => {
          await createProjectAndSiteAtomic('cst_test_org', { siteName: 'Alpha' }, { role: 'Organization' })
        },
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })

    it('updateProjectAndSiteDoc rejects when actor is Organization user', async () => {
      await assert.rejects(
        async () => {
          await updateProjectAndSiteDoc('cst_test_org', { selectedSiteDocId: 'site_1' }, { role: 'Organization' })
        },
        (err) => {
          assert.equal(err.message, 'Organization users have view-only access to site information.')
          assert.equal(err.code, 'PERMISSION_DENIED')
          return true
        }
      )
    })
  })
})

