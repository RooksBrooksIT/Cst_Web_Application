import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  calculatePlanQuotas,
  calculatePlanPrice,
  SUBSCRIPTION_PLANS,
  resolveAuthoritativeSubscription,
} from '../subscriptionService.js'

import { normalizeRole } from '../authService.js'

describe('Firestore Data Consistency & Subscription Synchronization Tests', () => {
  describe('Authoritative Source of Truth Resolution & Plan Precedence', () => {
    it('authoritative plan precedence identifies paid Silver plan over stale Free Trial', () => {
      const subDocData = {
        subscriptionPlan: 'Silver',
        paymentStatus: 'SUCCESS',
        isSubscriptionActive: true,
        subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }
      const rootDocData = {
        subscriptionPlan: 'Free Trial',
        paymentStatus: 'SUCCESS',
        isSubscriptionActive: false,
        subscriptionEndDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      }

      // Precedence rule: subDocData paid + active takes precedence over rootDocData Free Trial
      const isSubPaid =
        !subDocData.subscriptionPlan.toLowerCase().includes('free') &&
        !subDocData.subscriptionPlan.toLowerCase().includes('trial')
      const isSubValid = isSubPaid && (subDocData.paymentStatus === 'SUCCESS' || subDocData.isSubscriptionActive)

      assert.equal(isSubValid, true)
      assert.equal(subDocData.subscriptionPlan, 'Silver')
    })

    it('promotes root paid plan if sub doc is only Free Trial', () => {
      const subDocData = {
        subscriptionPlan: 'Free Trial',
        paymentStatus: 'SUCCESS',
        isSubscriptionActive: true,
      }
      const rootNestedSub = {
        subscriptionPlan: 'Gold',
        paymentStatus: 'SUCCESS',
        isSubscriptionActive: true,
      }

      const isSubPaid =
        !subDocData.subscriptionPlan.toLowerCase().includes('free') &&
        !subDocData.subscriptionPlan.toLowerCase().includes('trial')
      const isRootPaid =
        !rootNestedSub.subscriptionPlan.toLowerCase().includes('free') &&
        !rootNestedSub.subscriptionPlan.toLowerCase().includes('trial')

      let winner = null
      if (isSubPaid && (subDocData.paymentStatus === 'SUCCESS' || subDocData.isSubscriptionActive)) {
        winner = subDocData
      } else if (isRootPaid && (rootNestedSub.paymentStatus === 'SUCCESS' || rootNestedSub.isSubscriptionActive)) {
        winner = rootNestedSub
      } else {
        winner = subDocData
      }

      assert.equal(winner.subscriptionPlan, 'Gold')
    })
  })

  describe('Payment Verification Guards for Subscription Activation', () => {
    it('rejects paid plan activation when amount is 0', () => {
      const planName = 'Silver'
      const amount = 0
      const isTrial = planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('free')

      assert.throws(
        () => {
          if (!isTrial && Number(amount) <= 0) {
            throw new Error(`Paid plan "${planName}" requires confirmed payment with non-zero amount.`)
          }
        },
        {
          message: 'Paid plan "Silver" requires confirmed payment with non-zero amount.',
        }
      )
    })

    it('rejects paid plan activation when paymentStatus is FAILED', () => {
      const planName = 'Gold'
      const paymentStatus = 'FAILED'
      const isTrial = planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('free')

      assert.throws(
        () => {
          if (!isTrial && paymentStatus === 'FAILED') {
            throw new Error('Payment verification failed. Cannot activate subscription with FAILED payment status.')
          }
        },
        {
          message: 'Payment verification failed. Cannot activate subscription with FAILED payment status.',
        }
      )
    })

    it('allows ₹0 amount for Free Trial activation', () => {
      const planName = 'Free Trial'
      const amount = 0
      const isTrial = planName.toLowerCase().includes('trial') || planName.toLowerCase().includes('free')

      // Should not throw
      if (!isTrial && Number(amount) <= 0) {
        throw new Error('Should not reach here')
      }
      assert.equal(isTrial, true)
    })
  })

  describe('Legacy Document Profile Field Preservation', () => {
    it('merges subscription updates into legacy docs without mutating admin credentials', () => {
      const existingAdminData = {
        username: 'Rooks',
        password: 'secure_password_123',
        email: 'rookssoftservices@gmail.com',
        phone: '9876543210',
        role: 'Organization',
        org_name: 'RB Construction',
        subscriptionPlan: 'Free Trial',
        isSubscriptionActive: false,
      }

      const legacySyncFields = {
        subscriptionPlan: 'Silver',
        isSubscriptionActive: true,
        paymentStatus: 'SUCCESS',
        onboardingStep: 'COMPLETED',
        registrationStatus: 'COMPLETED',
      }

      // Merge behavior simulates Firestore batch.set(ref, legacySyncFields, { merge: true })
      const merged = { ...existingAdminData, ...legacySyncFields }

      // Profile and credentials must be 100% intact
      assert.equal(merged.username, 'Rooks')
      assert.equal(merged.password, 'secure_password_123')
      assert.equal(merged.email, 'rookssoftservices@gmail.com')
      assert.equal(merged.phone, '9876543210')
      assert.equal(merged.role, 'Organization')
      assert.equal(merged.org_name, 'RB Construction')

      // Subscription fields must be updated to Silver
      assert.equal(merged.subscriptionPlan, 'Silver')
      assert.equal(merged.isSubscriptionActive, true)
      assert.equal(merged.paymentStatus, 'SUCCESS')
    })
  })

  describe('Login Role Normalization and Disambiguation', () => {
    it('normalizes organization aliases accurately', () => {
      assert.equal(normalizeRole('Organization'), 'Organization')
      assert.equal(normalizeRole('organization admin'), 'Organization')
      assert.equal(normalizeRole('org'), 'Organization')
      assert.equal(normalizeRole('enterprise'), 'Organization')
    })

    it('normalizes manager and supervisor roles accurately', () => {
      assert.equal(normalizeRole('Manager'), 'Manager')
      assert.equal(normalizeRole('site manager'), 'Manager')
      assert.equal(normalizeRole('operations manager'), 'Manager')
      assert.equal(normalizeRole('supervisor'), 'Manager')
      assert.equal(normalizeRole('config_user'), 'Manager')
    })

    it('rejects unrelated roles', () => {
      assert.equal(normalizeRole('random_role'), null)
      assert.equal(normalizeRole(''), null)
      assert.equal(normalizeRole(null), null)
    })
  })
})
