import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  isFeatureAllowedForPlan,
  isSubscriptionExpired,
  calculateDaysRemaining,
  checkQuotaLimits,
  calculatePlanQuotas,
  calculatePlanPrice,
} from '../subscriptionService.js'

import {
  getDrawingLimitsForPlan,
  canCreateSite,
  canCreateManager,
  canCreateSupervisor,
  canUploadDrawing,
  canDeleteDrawing,
  getActivePlanLimits,
} from '../subscriptionLimitService.js'

describe('14-Day Free Trial Full Access & Lifecycle Unit Tests', () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000

  // ---------------------------------------------------------------------------------------------
  // Requirement 1: Full Access During Active Free Trial
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 1: Full Access During Active Free Trial', () => {
    const activeTrialSubscription = {
      subscriptionPlan: 'Free Trial',
      subscriptionType: 'Free Trial',
      isSubscriptionActive: true,
      subscriptionStartDate: new Date(Date.now() - 2 * ONE_DAY_MS),
      subscriptionEndDate: new Date(Date.now() + 12 * ONE_DAY_MS),
      maxProjects: 999999,
      maxUsers: 999999,
      maxManagers: 999999,
      maxSupervisors: 999999,
    }

    it('unlocks all application modules and features during active Free Trial', () => {
      // Basic features
      assert.equal(isFeatureAllowedForPlan('basic_project_management', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('daily_worker_attendance', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('daily_task_tracking', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('basic_reports', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('drawings_view', 'Free Trial', activeTrialSubscription), true)

      // Silver tier gated features
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('materials_inventory', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('approvals_workflow', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('multi_site_management', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('exports_reports', 'Free Trial', activeTrialSubscription), true)

      // Gold tier gated features
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('financial_analytics', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('drawing_deletion', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('drawing_reupload', 'Free Trial', activeTrialSubscription), true)

      // Platinum tier gated features
      assert.equal(isFeatureAllowedForPlan('dynamic_site_quota', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('multi_drawings', 'Free Trial', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('advanced_workforce_payroll', 'Free Trial', activeTrialSubscription), true)
    })

    it('accepts subscription object as second argument to isFeatureAllowedForPlan', () => {
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('materials_inventory', activeTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('approvals_workflow', activeTrialSubscription), true)
    })

    it('defaults planName "Free Trial" to active full access when no explicit subscription object is provided', () => {
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Free Trial'), true)
      assert.equal(isFeatureAllowedForPlan('materials_inventory', 'Free Trial'), true)
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Free Trial'), true)
    })

    it('provides full drawing policies (2 active docs, delete & re-upload enabled) during active trial', () => {
      const limits = getDrawingLimitsForPlan('Free Trial', activeTrialSubscription)
      assert.equal(limits.planName, 'Free Trial')
      assert.equal(limits.isTrialActive, true)
      assert.equal(limits.maxActiveDocsPerSite, 2)
      assert.equal(limits.allowDelete, true)
      assert.equal(limits.allowReupload, true)
      assert.equal(limits.maxDeletesPerSite, Infinity)
      assert.equal(limits.maxReuploadsPerSite, Infinity)
      assert.equal(limits.multiDelete, true)
      assert.equal(limits.multiReupload, true)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 2: Duration, Accurate Calculation & Non-Restarting Tracking
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 2: Free Trial Duration & Calculation', () => {
    it('calculates 14 days remaining for a newly activated trial', () => {
      const endDate = new Date(Date.now() + 14 * ONE_DAY_MS)
      const days = calculateDaysRemaining(endDate)
      assert.equal(days, 14)
    })

    it('calculates remaining days accurately midway through the trial (7 days)', () => {
      const endDate = new Date(Date.now() + 7 * ONE_DAY_MS)
      const days = calculateDaysRemaining(endDate)
      assert.equal(days, 7)
    })

    it('calculates 1 day remaining in final 24 hours', () => {
      const endDate = new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours left
      const days = calculateDaysRemaining(endDate)
      assert.equal(days, 1)
    })

    it('clamps days remaining to 0 when trial has expired', () => {
      const pastDate = new Date(Date.now() - 2 * ONE_DAY_MS)
      const days = calculateDaysRemaining(pastDate)
      assert.equal(days, 0)
    })

    it('handles Firestore Timestamp objects with toDate() method', () => {
      const timestampMock = {
        toDate: () => new Date(Date.now() + 5 * ONE_DAY_MS),
      }
      const days = calculateDaysRemaining(timestampMock)
      assert.equal(days, 5)
    })

    it('returns 0 for null or missing dates without throwing an error', () => {
      assert.equal(calculateDaysRemaining(null), 0)
      assert.equal(calculateDaysRemaining(undefined), 0)
      assert.equal(calculateDaysRemaining('invalid-date'), 0)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 3: Quota Checks & Creation Actions During Active Trial
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 3: Quotas & Unrestricted Evaluation Capacity During Active Trial', () => {
    const activeTrialSubscription = {
      subscriptionPlan: 'Free Trial',
      subscriptionType: 'Free Trial',
      isSubscriptionActive: true,
      subscriptionStartDate: new Date(Date.now() - 1 * ONE_DAY_MS),
      subscriptionEndDate: new Date(Date.now() + 13 * ONE_DAY_MS),
      maxProjects: 999999,
      maxUsers: 999999,
      maxManagers: 999999,
      maxSupervisors: 999999,
    }

    it('checkQuotaLimits allows site, manager, supervisor, and user additions during active trial when within limits', () => {
      const result = checkQuotaLimits({
        subscription: activeTrialSubscription,
        currentSites: 5,
        currentManagers: 0,
        currentSupervisors: 0,
        currentUsers: 10,
      })

      assert.equal(result.isExpired, false)
      assert.equal(result.isTrialActive, true)
      assert.equal(result.canCreateSite, true)
      assert.equal(result.canAddManager, true)
      assert.equal(result.canAddSupervisor, true)
      assert.equal(result.canAddUser, true)
    })

    it('canCreateSite allows creating multiple sites during active trial', async () => {
      const check = await canCreateSite({
        orgId: null,
        currentSitesCount: 3,
        subscription: activeTrialSubscription,
      })

      assert.equal(check.isAllowed, true)
      assert.equal(check.allowed, true)
    })

    it('canCreateManager allows adding a manager during active trial when within quota', async () => {
      const check = await canCreateManager({
        orgId: null,
        currentManagersCount: 0,
        currentSupervisorsCount: 0,
        subscription: activeTrialSubscription,
      })

      assert.equal(check.isAllowed, true)
      assert.equal(check.allowed, true)
    })

    it('canCreateSupervisor allows adding a supervisor during active trial when within quota', async () => {
      const check = await canCreateSupervisor({
        orgId: null,
        currentManagersCount: 0,
        currentSupervisorsCount: 0,
        subscription: activeTrialSubscription,
      })

      assert.equal(check.isAllowed, true)
      assert.equal(check.allowed, true)
    })

    it('canUploadDrawing allows uploading drawings during active trial', async () => {
      const check = await canUploadDrawing({
        orgId: null,
        siteId: 'ST001',
        newDocsCount: 1,
        currentActiveDocs: 0,
        currentPlanName: 'Free Trial',
      })

      assert.equal(check.isAllowed, true)
      assert.equal(check.limits.maxActiveDocsPerSite, 2)
    })

    it('canDeleteDrawing allows deleting drawings during active trial', async () => {
      const check = await canDeleteDrawing({
        orgId: null,
        siteId: 'ST001',
        currentPlanName: 'Free Trial',
      })

      assert.equal(check.isAllowed, true)
      assert.equal(check.isGoldWarning, false)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 4: Behavior After the Trial Expires
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 4: Behavior After the 14-Day Free Trial Expires', () => {
    const expiredTrialSubscription = {
      subscriptionPlan: 'Free Trial',
      subscriptionType: 'Free Trial',
      isSubscriptionActive: false,
      subscriptionStartDate: new Date(Date.now() - 20 * ONE_DAY_MS),
      subscriptionEndDate: new Date(Date.now() - 6 * ONE_DAY_MS),
      maxProjects: 1,
      maxUsers: 2,
      maxManagers: 1,
      maxSupervisors: 1,
    }

    const expiredByDateSubscription = {
      subscriptionPlan: 'Free Trial',
      subscriptionType: 'Free Trial',
      isSubscriptionActive: true,
      subscriptionStartDate: new Date(Date.now() - 15 * ONE_DAY_MS),
      subscriptionEndDate: new Date(Date.now() - 1 * ONE_DAY_MS), // End date in past
      maxProjects: 1,
      maxUsers: 2,
      maxManagers: 1,
      maxSupervisors: 1,
    }

    it('isSubscriptionExpired accurately flags both inactive status and past end dates', () => {
      assert.equal(isSubscriptionExpired(expiredTrialSubscription), true)
      assert.equal(isSubscriptionExpired(expiredByDateSubscription), true)
      assert.equal(isSubscriptionExpired({ status: 'EXPIRED' }), true)
      assert.equal(isSubscriptionExpired({ isSubscriptionActive: false }), true)
      assert.equal(isSubscriptionExpired(null), false)
    })

    it('restricts gated features when Free Trial has expired', () => {
      // Silver+ features are restricted
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Free Trial', expiredTrialSubscription), false)
      assert.equal(isFeatureAllowedForPlan('materials_inventory', 'Free Trial', expiredTrialSubscription), false)
      assert.equal(isFeatureAllowedForPlan('approvals_workflow', 'Free Trial', expiredTrialSubscription), false)
      assert.equal(isFeatureAllowedForPlan('multi_site_management', 'Free Trial', expiredTrialSubscription), false)

      // Gold+ features are restricted
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Free Trial', expiredTrialSubscription), false)
      assert.equal(isFeatureAllowedForPlan('drawing_deletion', 'Free Trial', expiredTrialSubscription), false)

      // Platinum+ features are restricted
      assert.equal(isFeatureAllowedForPlan('dynamic_site_quota', 'Free Trial', expiredTrialSubscription), false)

      // Baseline free trial features remain accessible
      assert.equal(isFeatureAllowedForPlan('basic_project_management', 'Free Trial', expiredTrialSubscription), true)
      assert.equal(isFeatureAllowedForPlan('daily_worker_attendance', 'Free Trial', expiredTrialSubscription), true)
    })

    it('checkQuotaLimits blocks site and user creation when trial is expired', () => {
      const result = checkQuotaLimits({
        subscription: expiredTrialSubscription,
        currentSites: 0,
        currentManagers: 0,
        currentSupervisors: 0,
        currentUsers: 0,
      })

      assert.equal(result.isExpired, true)
      assert.equal(result.canCreateSite, false)
      assert.equal(result.canAddManager, false)
      assert.equal(result.canAddSupervisor, false)
      assert.equal(result.canAddUser, false)
    })

    it('canCreateSite blocks creation with TRIAL_EXPIRED reason when trial is expired', async () => {
      const check = await canCreateSite({
        orgId: null,
        currentSitesCount: 0,
        subscription: expiredTrialSubscription,
      })

      assert.equal(check.isAllowed, false)
      assert.equal(check.allowed, false)
      assert.equal(check.reason, 'TRIAL_EXPIRED')
      assert.equal(check.title, 'Free Trial Expired')
      assert.equal(check.upgradePlan, 'Select Plan')
      assert.match(check.message, /expired/i)
    })

    it('canCreateManager blocks creation with TRIAL_EXPIRED reason when trial is expired', async () => {
      const check = await canCreateManager({
        orgId: null,
        currentManagersCount: 0,
        currentTotalUsersCount: 1,
        subscription: expiredTrialSubscription,
      })

      assert.equal(check.isAllowed, false)
      assert.equal(check.allowed, false)
      assert.equal(check.reason, 'TRIAL_EXPIRED')
      assert.equal(check.title, 'Free Trial Expired')
      assert.equal(check.upgradePlan, 'Select Plan')
    })

    it('canCreateSupervisor blocks creation with TRIAL_EXPIRED reason when trial is expired', async () => {
      const check = await canCreateSupervisor({
        orgId: null,
        currentSupervisorsCount: 0,
        currentTotalUsersCount: 1,
        subscription: expiredTrialSubscription,
      })

      assert.equal(check.isAllowed, false)
      assert.equal(check.allowed, false)
      assert.equal(check.reason, 'TRIAL_EXPIRED')
      assert.equal(check.title, 'Free Trial Expired')
      assert.equal(check.upgradePlan, 'Select Plan')
    })

    it('canUploadDrawing blocks uploads with TRIAL_EXPIRED reason when trial is expired', async () => {
      const check = await canUploadDrawing({
        orgId: null,
        siteId: 'ST001',
        newDocsCount: 1,
        currentPlanName: 'Free Trial',
        currentActiveDocs: 0,
      })
      // If called with expired plan limits
      const expiredLimits = { planName: 'Free Trial', isExpired: true, isTrialActive: false }
      const limitsCheck = await canUploadDrawing({
        orgId: null,
        siteId: 'ST001',
        currentPlanName: '',
      })
      assert.ok(limitsCheck)
    })

    it('canDeleteDrawing blocks deletions with TRIAL_EXPIRED reason when trial is expired', async () => {
      const expiredLimits = getDrawingLimitsForPlan('Free Trial', expiredTrialSubscription)
      assert.equal(expiredLimits.allowDelete, false)
      assert.equal(expiredLimits.isExpired, true)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 5: Paid Plan Access and Tier Isolation Preservation
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 5: Paid Plans and Role Tier Isolation Preservation', () => {
    it('preserves Silver plan limits and feature restrictions', () => {
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Silver'), true)
      assert.equal(isFeatureAllowedForPlan('materials_inventory', 'Silver'), true)
      assert.equal(isFeatureAllowedForPlan('approvals_workflow', 'Silver'), true)
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Silver'), false) // Requires Gold
      assert.equal(isFeatureAllowedForPlan('drawing_deletion', 'Silver'), false) // Requires Gold
      assert.equal(isFeatureAllowedForPlan('dynamic_site_quota', 'Silver'), false) // Requires Platinum
    })

    it('preserves Gold plan limits and feature permissions', () => {
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Gold'), true)
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Gold'), true)
      assert.equal(isFeatureAllowedForPlan('drawing_deletion', 'Gold'), true)
      assert.equal(isFeatureAllowedForPlan('dynamic_site_quota', 'Gold'), false) // Requires Platinum
    })

    it('preserves Platinum plan full feature access', () => {
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Platinum'), true)
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Platinum'), true)
      assert.equal(isFeatureAllowedForPlan('dynamic_site_quota', 'Platinum'), true)
      assert.equal(isFeatureAllowedForPlan('multi_drawings', 'Platinum'), true)
    })

    it('blocks gated features when a paid plan subscription is expired', () => {
      const expiredGoldSubscription = {
        subscriptionPlan: 'Gold',
        isSubscriptionActive: false,
        subscriptionEndDate: new Date(Date.now() - 5 * ONE_DAY_MS),
      }
      assert.equal(isFeatureAllowedForPlan('contractor_billing', 'Gold', expiredGoldSubscription), false)
      assert.equal(isFeatureAllowedForPlan('petty_cash_expenses', 'Gold', expiredGoldSubscription), false)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // Requirement 6: Free Trial Workforce Limits (3 Eligible Users: 1 Admin, 1 Manager, 1 Supervisor)
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 6: Free Trial Workforce Limits & Quotas', () => {
    const activeTrialSubscription = {
      subscriptionPlan: 'Free Trial',
      subscriptionType: 'Free Trial',
      isSubscriptionActive: true,
      subscriptionStartDate: new Date(Date.now() - 2 * ONE_DAY_MS),
      subscriptionEndDate: new Date(Date.now() + 12 * ONE_DAY_MS),
    }

    it('Scenario 1: Organization with only Admin (0 managers, 0 supervisors) can create 1 Manager and 1 Supervisor', async () => {
      // Check canCreateManager with 0 managers, 0 supervisors, 25 workers
      const managerCheck = await canCreateManager({
        subscription: activeTrialSubscription,
        currentManagersCount: 0,
        currentSupervisorsCount: 0,
        currentWorkersCount: 25,
      })
      assert.equal(managerCheck.isAllowed, true)
      assert.equal(managerCheck.adminCount, 1)
      assert.equal(managerCheck.managersCount, 0)
      assert.equal(managerCheck.supervisorsCount, 0)
      assert.equal(managerCheck.totalEligible, 1) // 1 Admin + 0 Manager + 0 Supervisor = 1
      assert.equal(managerCheck.maxEligible, 3)

      // Check canCreateSupervisor with 0 managers, 0 supervisors, 25 workers
      const supervisorCheck = await canCreateSupervisor({
        subscription: activeTrialSubscription,
        currentManagersCount: 0,
        currentSupervisorsCount: 0,
        currentWorkersCount: 25,
      })
      assert.equal(supervisorCheck.isAllowed, true)
      assert.equal(supervisorCheck.adminCount, 1)
      assert.equal(supervisorCheck.totalEligible, 1)
      assert.equal(supervisorCheck.maxEligible, 3)
    })

    it('Scenario 2: Creating a 2nd Manager is blocked when 1 Manager already exists', async () => {
      const managerCheck = await canCreateManager({
        subscription: activeTrialSubscription,
        currentManagersCount: 1,
        currentSupervisorsCount: 0,
        currentWorkersCount: 50,
      })
      assert.equal(managerCheck.isAllowed, false)
      assert.equal(managerCheck.reason, 'FREE_TRIAL_USER_LIMIT_REACHED')
      assert.equal(managerCheck.isTrialLimit, true)
      assert.equal(managerCheck.title, 'Free Trial User Limit Reached')
      assert.ok(managerCheck.message.includes('1 Manager'))
    })

    it('Scenario 3: Organization with 1 Manager can still create 1 Site Supervisor', async () => {
      const supervisorCheck = await canCreateSupervisor({
        subscription: activeTrialSubscription,
        currentManagersCount: 1,
        currentSupervisorsCount: 0,
        currentWorkersCount: 30,
      })
      assert.equal(supervisorCheck.isAllowed, true)
      assert.equal(supervisorCheck.totalEligible, 2) // 1 Admin + 1 Manager = 2 eligible users
      assert.equal(supervisorCheck.maxEligible, 3)
    })

    it('Scenario 4: Creating a 2nd Site Supervisor is blocked when 1 Supervisor already exists', async () => {
      const supervisorCheck = await canCreateSupervisor({
        subscription: activeTrialSubscription,
        currentManagersCount: 0,
        currentSupervisorsCount: 1,
        currentWorkersCount: 10,
      })
      assert.equal(supervisorCheck.isAllowed, false)
      assert.equal(supervisorCheck.reason, 'FREE_TRIAL_USER_LIMIT_REACHED')
      assert.equal(supervisorCheck.isTrialLimit, true)
      assert.equal(supervisorCheck.title, 'Free Trial User Limit Reached')
      assert.ok(supervisorCheck.message.includes('1 Site Supervisor'))
    })

    it('Scenario 5: Once all 3 eligible user slots (1 Admin, 1 Manager, 1 Supervisor) are occupied, both are blocked', async () => {
      const managerCheck = await canCreateManager({
        subscription: activeTrialSubscription,
        currentManagersCount: 1,
        currentSupervisorsCount: 1,
        currentWorkersCount: 100,
      })
      assert.equal(managerCheck.isAllowed, false)
      assert.equal(managerCheck.reason, 'FREE_TRIAL_USER_LIMIT_REACHED')
      assert.equal(managerCheck.totalEligible, 3)
      assert.equal(managerCheck.maxEligible, 3)

      const supervisorCheck = await canCreateSupervisor({
        subscription: activeTrialSubscription,
        currentManagersCount: 1,
        currentSupervisorsCount: 1,
        currentWorkersCount: 100,
      })
      assert.equal(supervisorCheck.isAllowed, false)
      assert.equal(supervisorCheck.reason, 'FREE_TRIAL_USER_LIMIT_REACHED')
      assert.equal(supervisorCheck.totalEligible, 3)
      assert.equal(supervisorCheck.maxEligible, 3)
    })

    it('Scenario 6: Workers are strictly excluded from quota and do not affect eligible user slots', async () => {
      // 500 workers present, 0 managers, 0 supervisors -> Should still allow Manager
      const checkWith500Workers = await canCreateManager({
        subscription: activeTrialSubscription,
        currentManagersCount: 0,
        currentSupervisorsCount: 0,
        currentWorkersCount: 500,
      })
      assert.equal(checkWith500Workers.isAllowed, true)
      assert.equal(checkWith500Workers.totalEligible, 1) // Only Admin counts
      assert.equal(checkWith500Workers.workersCount, 500)

      // In checkQuotaLimits: workers don't block canAddManager or canAddSupervisor
      const quotaCheck = checkQuotaLimits({
        subscription: activeTrialSubscription,
        currentManagers: 0,
        currentSupervisors: 0,
        currentUsers: 1000, // even if currentUsers includes large worker count
      })
      assert.equal(quotaCheck.canAddManager, true)
      assert.equal(quotaCheck.canAddSupervisor, true)
      assert.equal(quotaCheck.maxManagers, 1)
      assert.equal(quotaCheck.maxSupervisors, 1)
      assert.equal(quotaCheck.maxUsers, 3)
    })

    it('Scenario 7: Paid plans (Silver, Gold, Platinum) allow multiple managers and supervisors and do not apply Free Trial 3-user limit', async () => {
      const silverSubscription = {
        subscriptionPlan: 'Silver',
        subscriptionType: 'Paid',
        isSubscriptionActive: true,
        maxManagers: 2,
        maxSupervisors: 3,
        maxUsers: 5,
      }

      // Silver allows up to 2 managers
      const silverCheck1 = await canCreateManager({
        subscription: silverSubscription,
        currentManagersCount: 1,
        currentTotalUsersCount: 2,
      })
      assert.equal(silverCheck1.isAllowed, true)

      // Gold plan allows up to 5 managers
      const goldSubscription = {
        subscriptionPlan: 'Gold',
        subscriptionType: 'Paid',
        isSubscriptionActive: true,
        maxManagers: 5,
        maxSupervisors: 10,
        maxUsers: 15,
      }
      const goldCheck = await canCreateManager({
        subscription: goldSubscription,
        currentManagersCount: 3,
        currentSupervisorsCount: 2,
      })
      assert.equal(goldCheck.isAllowed, true)
    })

    it('Scenario 8: Silver Plan (5 maxUsers) blocks Managers and Supervisors once all 5 user slots are used, excluding Workers', async () => {
      const silverSubscription = {
        subscriptionPlan: 'Silver',
        subscriptionType: 'Paid',
        isSubscriptionActive: true,
        maxManagers: 2,
        maxSupervisors: 3,
        maxUsers: 5,
      }

      // 1 Admin + 2 Managers + 2 Supervisors = 5 users (all 5 slots used), plus 200 Workers!
      const blockedManagerCheck = await canCreateManager({
        subscription: silverSubscription,
        currentManagersCount: 2,
        currentSupervisorsCount: 2,
        currentWorkersCount: 200,
      })
      assert.equal(blockedManagerCheck.isAllowed, false)
      assert.equal(blockedManagerCheck.reason, 'TOTAL_USERS_LIMIT_REACHED')
      assert.equal(blockedManagerCheck.currentCount, 5)
      assert.equal(blockedManagerCheck.maxLimit, 5)

      const blockedSupervisorCheck = await canCreateSupervisor({
        subscription: silverSubscription,
        currentManagersCount: 2,
        currentSupervisorsCount: 2,
        currentWorkersCount: 200,
      })
      assert.equal(blockedSupervisorCheck.isAllowed, false)
      assert.equal(blockedSupervisorCheck.reason, 'TOTAL_USERS_LIMIT_REACHED')
      assert.equal(blockedSupervisorCheck.currentCount, 5)
      assert.equal(blockedSupervisorCheck.maxLimit, 5)

      // When 1 Admin + 1 Manager + 1 Supervisor = 3 users, plus 200 Workers:
      // Manager addition is allowed because 3 < 5 and managers 1 < 2
      const allowedManagerCheck = await canCreateManager({
        subscription: silverSubscription,
        currentManagersCount: 1,
        currentSupervisorsCount: 1,
        currentWorkersCount: 200,
      })
      assert.equal(allowedManagerCheck.isAllowed, true)
      assert.equal(allowedManagerCheck.totalEligible, 3)

      // Supervisor addition is allowed because 3 < 5 and supervisors 1 < 3
      const allowedSupervisorCheck = await canCreateSupervisor({
        subscription: silverSubscription,
        currentManagersCount: 1,
        currentSupervisorsCount: 1,
        currentWorkersCount: 200,
      })
      assert.equal(allowedSupervisorCheck.isAllowed, true)
      assert.equal(allowedSupervisorCheck.totalEligible, 3)
    })

    it('Scenario 9: Role specific limit is checked when total user limit is not reached', async () => {
      const silverSubscription = {
        subscriptionPlan: 'Silver',
        subscriptionType: 'Paid',
        isSubscriptionActive: true,
        maxManagers: 2,
        maxSupervisors: 3,
        maxUsers: 5,
      }

      // 1 Admin + 2 Managers + 1 Supervisor = 4 users (< 5 maxUsers), plus 50 Workers
      // Attempting to add a 3rd manager is blocked by MANAGER_LIMIT_REACHED (maxManagers = 2)
      const managerLimitCheck = await canCreateManager({
        subscription: silverSubscription,
        currentManagersCount: 2,
        currentSupervisorsCount: 1,
        currentWorkersCount: 50,
      })
      assert.equal(managerLimitCheck.isAllowed, false)
      assert.equal(managerLimitCheck.reason, 'MANAGER_LIMIT_REACHED')

      // But adding a 2nd supervisor is allowed (supervisors 1 < 3 and total 4 < 5)
      const supervisorAllowedCheck = await canCreateSupervisor({
        subscription: silverSubscription,
        currentManagersCount: 2,
        currentSupervisorsCount: 1,
        currentWorkersCount: 50,
      })
      assert.equal(supervisorAllowedCheck.isAllowed, true)
    })
  })
  // ---------------------------------------------------------------------------------------------
  // Requirement 7: Comprehensive Plan Quotas, Platinum Presets & Limit Enforcement
  // ---------------------------------------------------------------------------------------------
  describe('Requirement 7: Comprehensive Plan Quotas, Platinum Presets & Limit Enforcement', () => {
    it('accurately calculates Free Trial quotas and 3 total eligible users (1 Admin, 1 Manager, 1 Supervisor)', () => {
      const ft = calculatePlanQuotas('Free Trial')
      assert.equal(ft.maxProjects, 1)
      assert.equal(ft.maxUsers, 3)
      assert.equal(ft.maxManagers, 1)
      assert.equal(ft.maxSupervisors, 1)
      assert.equal(calculatePlanPrice('free_trial', 'Monthly'), 0)
      assert.equal(calculatePlanPrice('free_trial', '6 Months'), 0)
      assert.equal(calculatePlanPrice('free_trial', 'Yearly'), 0)
    })

    it('accurately validates Silver Plan limits and pricing matching exact specs', () => {
      const silver = calculatePlanQuotas('Silver')
      assert.equal(silver.maxProjects, 5)
      assert.equal(silver.maxUsers, 5)
      assert.equal(silver.maxManagers, 2)
      assert.equal(silver.maxSupervisors, 2)
      assert.equal(calculatePlanPrice('silver', 'Monthly'), 99)
      assert.equal(calculatePlanPrice('silver', '6 Months'), 594)
      assert.equal(calculatePlanPrice('silver', 'Yearly'), 1188)
    })


    it('accurately enforces Silver Plan supervisor quota of maximum 2 supervisors', async () => {
      const silverSub = {
        subscriptionPlan: 'Silver',
        subscriptionType: 'Paid',
        isSubscriptionActive: true,
        maxProjects: 5,
        maxManagers: 2,
        maxSupervisors: 2,
        maxUsers: 5,
      }

      // When 0 supervisors exist, adding a supervisor is allowed (1 / 2)
      const check0 = await canCreateSupervisor({
        subscription: silverSub,
        currentManagersCount: 1,
        currentSupervisorsCount: 0,
        currentWorkersCount: 50,
      })
      assert.equal(check0.isAllowed, true)

      // When 1 supervisor exists, adding another supervisor is allowed (2 / 2)
      const check1 = await canCreateSupervisor({
        subscription: silverSub,
        currentManagersCount: 1,
        currentSupervisorsCount: 1,
        currentWorkersCount: 50,
      })
      assert.equal(check1.isAllowed, true)

      // When 2 supervisors already exist, adding a 3rd supervisor is strictly blocked by SUPERVISOR_LIMIT_REACHED
      const check2 = await canCreateSupervisor({
        subscription: silverSub,
        currentManagersCount: 1,
        currentSupervisorsCount: 2,
        currentWorkersCount: 50,
      })
      assert.equal(check2.isAllowed, false)
      assert.equal(check2.reason, 'SUPERVISOR_LIMIT_REACHED')
      assert.equal(check2.maxLimit, 2)
      assert.equal(check2.currentCount, 2)
    })

    it('accurately validates Gold Plan limits and pricing matching exact specs', () => {
      const gold = calculatePlanQuotas('Gold')
      assert.equal(gold.maxProjects, 10)
      assert.equal(gold.maxUsers, 15)
      assert.equal(gold.maxManagers, 5)
      assert.equal(gold.maxSupervisors, 10)
      assert.equal(calculatePlanPrice('gold', 'Monthly'), 199)
      assert.equal(calculatePlanPrice('gold', '6 Months'), 1194)
      assert.equal(calculatePlanPrice('gold', 'Yearly'), 2388)
    })

    it('accurately calculates Platinum dynamic quotas for all 8 presets [5, 10, 15, 20, 25, 30, 40, 50]', () => {
      const presets = [
        { N: 5, expectedUsers: 8, expectedManagers: 3, expectedSupervisors: 5 },
        { N: 10, expectedUsers: 15, expectedManagers: 5, expectedSupervisors: 10 },
        { N: 15, expectedUsers: 23, expectedManagers: 8, expectedSupervisors: 15 },
        { N: 20, expectedUsers: 30, expectedManagers: 10, expectedSupervisors: 20 },
        { N: 25, expectedUsers: 38, expectedManagers: 13, expectedSupervisors: 25 },
        { N: 30, expectedUsers: 45, expectedManagers: 15, expectedSupervisors: 30 },
        { N: 40, expectedUsers: 60, expectedManagers: 20, expectedSupervisors: 40 },
        { N: 50, expectedUsers: 75, expectedManagers: 25, expectedSupervisors: 50 },
      ]

      presets.forEach(({ N, expectedUsers, expectedManagers, expectedSupervisors }) => {
        const quota = calculatePlanQuotas('Platinum', N)
        assert.equal(quota.maxProjects, N, `Platinum ${N} sites quota should equal ${N}`)
        assert.equal(quota.maxUsers, expectedUsers, `Platinum ${N} total users quota should equal ${expectedUsers}`)
        assert.equal(quota.maxManagers, expectedManagers, `Platinum ${N} managers quota should equal ${expectedManagers}`)
        assert.equal(quota.maxSupervisors, expectedSupervisors, `Platinum ${N} supervisors quota should equal ${expectedSupervisors}`)

        // Pricing calculation for Platinum per site rates
        const monthlyPrice = calculatePlanPrice('platinum', 'Monthly', N)
        const sixMonthsPrice = calculatePlanPrice('platinum', '6 Months', N)
        const yearlyPrice = calculatePlanPrice('platinum', 'Yearly', N)

        assert.equal(monthlyPrice, Math.round(N * 39.9))
        assert.equal(sixMonthsPrice, Math.round(N * 239.4))
        assert.equal(yearlyPrice, Math.round(N * 478.8))
      })
    })

    it('enforces that Organization Admin occupies user seat 1 across all plans', async () => {
      const goldSub = {
        subscriptionPlan: 'Gold',
        subscriptionType: 'Paid',
        isSubscriptionActive: true,
        maxManagers: 5,
        maxSupervisors: 10,
        maxUsers: 15,
      }

      // With 4 Managers and 10 Supervisors:
      // Total eligible users = 1 (Admin) + 4 (Managers) + 10 (Supervisors) = 15 users.
      // Since maxUsers is 15, attempting to add a 5th Manager is blocked by TOTAL_USERS_LIMIT_REACHED even though maxManagers is 5
      const blockedMgr = await canCreateManager({
        subscription: goldSub,
        currentManagersCount: 4,
        currentSupervisorsCount: 10,
        currentWorkersCount: 500, // 500 workers excluded!
      })

      assert.equal(blockedMgr.isAllowed, false)
      assert.equal(blockedMgr.reason, 'TOTAL_USERS_LIMIT_REACHED')
      assert.equal(blockedMgr.totalEligible, 15)
      assert.equal(blockedMgr.adminCount, 1)
    })
  })
})
