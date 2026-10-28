import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  canCreateSite,
  getActivePlanLimits,
} from '../subscriptionLimitService.js'

import {
  calculatePlanQuotas,
  checkQuotaLimits,
  SUBSCRIPTION_PLANS,
} from '../subscriptionService.js'

describe('Free Trial and Subscription Plan Project & Site Creation Limit Tests', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000

  // ---------------------------------------------------------------------------------------------
  // 1. Subscription Configuration & Dynamic Quota Ingestion (No Hardcoded Limits)
  // ---------------------------------------------------------------------------------------------
  describe('Subscription Quota Configuration Reading', () => {
    it('reads configured limit for Free Trial from SUBSCRIPTION_PLANS and calculatePlanQuotas', () => {
      const plansQuota = calculatePlanQuotas('Free Trial')
      assert.equal(plansQuota.maxProjects, 1)
      assert.equal(SUBSCRIPTION_PLANS.FREE_TRIAL.maxProjects, 1)
    })

    it('reads configured limits for paid subscription plans', () => {
      assert.equal(calculatePlanQuotas('Silver').maxProjects, 5)
      assert.equal(calculatePlanQuotas('Gold').maxProjects, 10)
      assert.equal(calculatePlanQuotas('Platinum', 20).maxProjects, 20)
      assert.equal(calculatePlanQuotas('Enterprise').maxProjects, 999999)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // 2. Free Trial Limits Enforcement in canCreateSite
  // ---------------------------------------------------------------------------------------------
  describe('Free Trial Site Limit Enforcement in canCreateSite', () => {
    const activeTrialSubscription = {
      subscriptionPlan: 'Free Trial',
      subscriptionType: 'Free Trial',
      isSubscriptionActive: true,
      subscriptionStartDate: new Date(Date.now() - 2 * ONE_DAY_MS),
      subscriptionEndDate: new Date(Date.now() + 12 * ONE_DAY_MS),
      maxProjects: 1,
      maxUsers: 3,
      maxManagers: 1,
      maxSupervisors: 1,
    }

    it('allows site creation when Free Trial user has 0 sites created', async () => {
      const result = await canCreateSite({
        orgId: null,
        currentSitesCount: 0,
        subscription: activeTrialSubscription,
      })

      assert.equal(result.isAllowed, true)
      assert.equal(result.allowed, true)
      assert.equal(result.maxLimit, 1)
      assert.equal(result.currentCount, 0)
    })

    it('blocks site creation when Free Trial user already has 1 site created', async () => {
      const result = await canCreateSite({
        orgId: null,
        currentSitesCount: 1,
        subscription: activeTrialSubscription,
      })

      assert.equal(result.isAllowed, false)
      assert.equal(result.allowed, false)
      assert.equal(result.reason, 'FREE_TRIAL_LIMIT_REACHED')
      assert.equal(result.title, 'Free Trial Limit Reached')
      assert.equal(result.currentCount, 1)
      assert.equal(result.maxLimit, 1)
      assert.equal(result.upgradePlan, 'Silver')
      assert.match(result.message, /limit of 1 project and site/i)
      assert.match(result.message, /upgrade to silver/i)
    })

    it('blocks site creation if existing site count exceeds limit (> 1)', async () => {
      const result = await canCreateSite({
        orgId: null,
        currentSitesCount: 2,
        subscription: activeTrialSubscription,
      })

      assert.equal(result.isAllowed, false)
      assert.equal(result.reason, 'FREE_TRIAL_LIMIT_REACHED')
    })

    it('reads effective limit from calculatePlanQuotas if subscription.maxProjects is omitted', async () => {
      const subscriptionWithoutMax = {
        subscriptionPlan: 'Free Trial',
        isSubscriptionActive: true,
        subscriptionEndDate: new Date(Date.now() + 5 * ONE_DAY_MS),
      }

      const result = await canCreateSite({
        orgId: null,
        currentSitesCount: 1,
        subscription: subscriptionWithoutMax,
      })

      assert.equal(result.isAllowed, false)
      assert.equal(result.reason, 'FREE_TRIAL_LIMIT_REACHED')
      assert.equal(result.maxLimit, 1)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // 3. Paid Plan Limits Enforcement in canCreateSite
  // ---------------------------------------------------------------------------------------------
  describe('Paid Plan Site Limit Enforcement in canCreateSite', () => {
    it('enforces Silver plan limits (limit = 5)', async () => {
      const silverSub = {
        subscriptionPlan: 'Silver',
        isSubscriptionActive: true,
        paymentStatus: 'SUCCESS',
        subscriptionEndDate: new Date(Date.now() + 30 * ONE_DAY_MS),
        maxProjects: 5,
      }

      // 4 sites -> allowed
      const allowed = await canCreateSite({
        orgId: null,
        currentSitesCount: 4,
        subscription: silverSub,
      })
      assert.equal(allowed.isAllowed, true)

      // 5 sites -> blocked
      const blocked = await canCreateSite({
        orgId: null,
        currentSitesCount: 5,
        subscription: silverSub,
      })
      assert.equal(blocked.isAllowed, false)
      assert.equal(blocked.reason, 'SITE_LIMIT_REACHED')
      assert.equal(blocked.upgradePlan, 'Gold')
      assert.equal(blocked.maxLimit, 5)
    })

    it('enforces Gold plan limits (limit = 10)', async () => {
      const goldSub = {
        subscriptionPlan: 'Gold',
        isSubscriptionActive: true,
        paymentStatus: 'SUCCESS',
        subscriptionEndDate: new Date(Date.now() + 30 * ONE_DAY_MS),
        maxProjects: 10,
      }

      // 9 sites -> allowed
      const allowed = await canCreateSite({
        orgId: null,
        currentSitesCount: 9,
        subscription: goldSub,
      })
      assert.equal(allowed.isAllowed, true)

      // 10 sites -> blocked
      const blocked = await canCreateSite({
        orgId: null,
        currentSitesCount: 10,
        subscription: goldSub,
      })
      assert.equal(blocked.isAllowed, false)
      assert.equal(blocked.reason, 'SITE_LIMIT_REACHED')
      assert.equal(blocked.upgradePlan, 'Platinum')
      assert.equal(blocked.maxLimit, 10)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // 4. checkQuotaLimits in subscriptionService.js
  // ---------------------------------------------------------------------------------------------
  describe('checkQuotaLimits enforcement for Free Trial and Paid Plans', () => {
    it('enforces maxProjects accurately for Free Trial without trial bypass', () => {
      const trialSub = {
        subscriptionPlan: 'Free Trial',
        isSubscriptionActive: true,
        subscriptionEndDate: new Date(Date.now() + 10 * ONE_DAY_MS),
        maxProjects: 1,
      }

      const underLimit = checkQuotaLimits({
        subscription: trialSub,
        currentSites: 0,
      })
      assert.equal(underLimit.canCreateSite, true)
      assert.equal(underLimit.isTrialActive, true)

      const atLimit = checkQuotaLimits({
        subscription: trialSub,
        currentSites: 1,
      })
      assert.equal(atLimit.canCreateSite, false)
    })

    it('enforces maxProjects accurately for Silver plan', () => {
      const silverSub = {
        subscriptionPlan: 'Silver',
        isSubscriptionActive: true,
        paymentStatus: 'SUCCESS',
        subscriptionEndDate: new Date(Date.now() + 30 * ONE_DAY_MS),
        maxProjects: 5,
      }

      const underLimit = checkQuotaLimits({
        subscription: silverSub,
        currentSites: 4,
      })
      assert.equal(underLimit.canCreateSite, true)

      const atLimit = checkQuotaLimits({
        subscription: silverSub,
        currentSites: 5,
      })
      assert.equal(atLimit.canCreateSite, false)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // 5. getActivePlanLimits in subscriptionLimitService.js
  // ---------------------------------------------------------------------------------------------
  describe('getActivePlanLimits effective quota extraction', () => {
    it('returns configured maxProjects for Free Trial instead of 999999', async () => {
      const trialSub = {
        subscriptionPlan: 'Free Trial',
        isSubscriptionActive: true,
        subscriptionEndDate: new Date(Date.now() + 10 * ONE_DAY_MS),
      }

      const limits = await getActivePlanLimits('cst_mock_org', trialSub)
      assert.equal(limits.planName, 'Free Trial')
      assert.equal(limits.maxProjects, 1)
      assert.equal(limits.isTrialActive, true)
    })

    it('returns configured maxProjects for Silver plan', async () => {
      const silverSub = {
        subscriptionPlan: 'Silver',
        isSubscriptionActive: true,
        paymentStatus: 'SUCCESS',
        subscriptionEndDate: new Date(Date.now() + 30 * ONE_DAY_MS),
      }

      const limits = await getActivePlanLimits('cst_mock_org', silverSub)
      assert.equal(limits.planName, 'Silver')
      assert.equal(limits.maxProjects, 5)
    })
  })
})
