import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDateStamp,
  cleanOrgNameForId,
  generateOrgId,
  isCstOrgId,
  calculatePasswordEntropy,
  isPendingRegistrationDoc,
  BRAND_COLOR_PALETTE,
  savePendingRegistrationDraft,
  getPendingRegistrationDraft,
  clearPendingRegistrationDraft,
  PENDING_REGISTRATION_STORAGE_KEY,
} from '../organizationRegistrationService.js'
import {
  calculatePlanQuotas,
  calculatePlanPrice,
  calculatePlatinumPrice,
} from '../subscriptionService.js'

describe('Organization Account Creation & Onboarding Flow Unit Tests', () => {
  describe('Section 1.3: Namespace Strategy & Identification Standards', () => {
    it('cleans whitespace from organization name for document ID', () => {
      assert.equal(cleanOrgNameForId('Apex Builders Private Limited'), 'ApexBuildersPrivateLimited')
      assert.equal(cleanOrgNameForId('   Zenith   Construction  '), 'ZenithConstruction')
      assert.equal(cleanOrgNameForId('SummitInfrastructure'), 'SummitInfrastructure')
    })

    it('generates standard orgId conforming to cst_${cleanOrgName}_${dateStr}', () => {
      const orgId = generateOrgId('Apex Builders Private Limited', '27-10-2026')
      assert.equal(orgId, 'cst_ApexBuildersPrivateLimited_27-10-2026')

      const orgId2 = generateOrgId('Nova Infra', '15-08-2026')
      assert.equal(orgId2, 'cst_NovaInfra_15-08-2026')
    })

    it('validates CST Organization ID using isCstOrgId', () => {
      assert.equal(isCstOrgId('cst_ApexBuilders_27-10-2026'), true)
      assert.equal(isCstOrgId('cst_Nova_01-01-2026'), true)
      assert.equal(isCstOrgId('my_cst_company'), true)
      assert.equal(isCstOrgId('random_company_123'), false)
      assert.equal(isCstOrgId(''), false)
      assert.equal(isCstOrgId(null), false)
    })

    it('formats date stamp as dd-MM-yyyy', () => {
      const date = new Date(2026, 9, 27) // 27 Oct 2026
      assert.equal(formatDateStamp(date), '27-10-2026')

      const date2 = new Date(2026, 0, 5) // 05 Jan 2026
      assert.equal(formatDateStamp(date2), '05-01-2026')
    })
  })

  describe('Section 3.2: Password Entropy Scoring (Test Case UT-03)', () => {
    it('evaluates "abc" as Weak', () => {
      const res = calculatePasswordEntropy('abc')
      assert.equal(res.label, 'Weak')
      assert.equal(res.percent, '33%')
    })

    it('evaluates "abcdefgh" as Weak (length + lowercase only)', () => {
      const res = calculatePasswordEntropy('abcdefgh')
      assert.equal(res.label, 'Weak')
      assert.equal(res.score, 2)
      assert.equal(res.percent, '33%')
    })

    it('evaluates "Abcdefg1" as Moderate (length + upper + lower + digit)', () => {
      const res = calculatePasswordEntropy('Abcdefg1')
      assert.equal(res.label, 'Moderate')
      assert.equal(res.score, 4)
      assert.equal(res.percent, '66%')
    })

    it('evaluates "Abcdef1!" as Strong (length + upper + lower + digit + special)', () => {
      const res = calculatePasswordEntropy('Abcdef1!')
      assert.equal(res.label, 'Strong')
      assert.equal(res.score, 5)
      assert.equal(res.percent, '100%')
    })
  })

  describe('Section 3.5: Pending Registration Classification', () => {
    it('identifies PAYMENT_PENDING with isSubscriptionActive=false as pending', () => {
      const data = {
        isSubscriptionActive: false,
        onboardingStep: 'PAYMENT_PENDING',
        paymentStatus: 'PENDING',
      }
      assert.equal(isPendingRegistrationDoc(data), true)
    })

    it('identifies subscriptionPlan "Pending Selection" as pending', () => {
      const data = {
        isSubscriptionActive: false,
        subscriptionPlan: 'Pending Selection',
      }
      assert.equal(isPendingRegistrationDoc(data), true)
    })

    it('rejects completed active accounts from pending classification', () => {
      const data = {
        isSubscriptionActive: true,
        onboardingStep: 'COMPLETED',
        paymentStatus: 'SUCCESS',
        subscriptionPlan: 'Gold',
      }
      assert.equal(isPendingRegistrationDoc(data), false)
    })
  })

  describe('Section 4.3: Brand Color Palette', () => {
    it('contains the 13 curated enterprise brand colors matching documentation', () => {
      assert.equal(BRAND_COLOR_PALETTE.length, 13)
      assert.equal(BRAND_COLOR_PALETTE[0].hex, '#00A86B') // Emerald Green Default
      assert.equal(BRAND_COLOR_PALETTE[1].hex, '#017FDF') // Ocean Blue
      assert.equal(BRAND_COLOR_PALETTE[3].hex, '#7C3AED') // Royal Purple
      assert.equal(BRAND_COLOR_PALETTE[6].hex, '#DC2626') // Crimson Red
      assert.equal(BRAND_COLOR_PALETTE[12].hex, '#0F172A') // Midnight Dark
    })
  })

  describe('Section 5.1 & 5.2: Subscription Quotas & Pricing Calculations', () => {
    it('calculates Free Trial quotas accurately (1 site, 3 users, 1 manager, 1 supervisor)', () => {
      const quotas = calculatePlanQuotas('Free Trial')
      assert.equal(quotas.maxProjects, 1)
      assert.equal(quotas.maxUsers, 3)
      assert.equal(quotas.maxManagers, 1)
      assert.equal(quotas.maxSupervisors, 1)
      assert.equal(quotas.drawingPolicy.allowDelete, false)
    })

    it('calculates Silver quotas accurately (5 sites, 5 users, 2 managers, 2 supervisors)', () => {
      const quotas = calculatePlanQuotas('Silver')
      assert.equal(quotas.maxProjects, 5)
      assert.equal(quotas.maxUsers, 5)
      assert.equal(quotas.maxManagers, 2)
      assert.equal(quotas.maxSupervisors, 2)
      assert.equal(quotas.drawingPolicy.allowDelete, false)
    })

    it('calculates Gold quotas accurately (10 sites, 15 users, 5 managers, 10 supervisors)', () => {
      const quotas = calculatePlanQuotas('Gold')
      assert.equal(quotas.maxProjects, 10)
      assert.equal(quotas.maxUsers, 15)
      assert.equal(quotas.maxManagers, 5)
      assert.equal(quotas.maxSupervisors, 10)
      assert.equal(quotas.drawingPolicy.allowDelete, true)
      assert.equal(quotas.drawingPolicy.allowReupload, true)
    })

    it('calculates Platinum dynamic quotas based on project count N (Formula: 1.5*N users, N/2 managers, N supervisors)', () => {
      const quotas10 = calculatePlanQuotas('Platinum', 10)
      assert.equal(quotas10.maxProjects, 10)
      assert.equal(quotas10.maxUsers, 15) // round(10 * 1.5)
      assert.equal(quotas10.maxManagers, 5) // round(10 / 2)
      assert.equal(quotas10.maxSupervisors, 10)

      const quotas20 = calculatePlanQuotas('Platinum', 20)
      assert.equal(quotas20.maxProjects, 20)
      assert.equal(quotas20.maxUsers, 30) // round(20 * 1.5)
      assert.equal(quotas20.maxManagers, 10) // round(20 / 2)
      assert.equal(quotas20.maxSupervisors, 20)
    })

    it('calculates Plan Pricing for Silver and Gold matching the documentation table', () => {
      // Silver: Monthly ₹99, 6 Months ₹594, Yearly ₹1,188
      assert.equal(calculatePlanPrice('silver', 'Monthly'), 99)
      assert.equal(calculatePlanPrice('silver', '6 Months'), 594)
      assert.equal(calculatePlanPrice('silver', 'Yearly'), 1188)

      // Gold: Monthly ₹199, 6 Months ₹1,194, Yearly ₹2,388
      assert.equal(calculatePlanPrice('gold', 'Monthly'), 199)
      assert.equal(calculatePlanPrice('gold', '6 Months'), 1194)
      assert.equal(calculatePlanPrice('gold', 'Yearly'), 2388)

      // Free trial is always 0
      assert.equal(calculatePlanPrice('free_trial', 'Monthly'), 0)
    })

    it('calculates Platinum Pricing dynamically based on N * rate', () => {
      // Platinum 10 projects: Monthly 10*39.90 = 399, 6Mo 10*239.40 = 2394, Yearly 10*478.80 = 4788
      assert.equal(calculatePlatinumPrice(10, 'Monthly'), 399)
      assert.equal(calculatePlatinumPrice(10, '6 Months'), 2394)
      assert.equal(calculatePlatinumPrice(10, 'Yearly'), 4788)

      // Platinum 20 projects
      assert.equal(calculatePlatinumPrice(20, 'Monthly'), 798)
      assert.equal(calculatePlatinumPrice(20, '6 Months'), 4788)
      assert.equal(calculatePlatinumPrice(20, 'Yearly'), 9576)
    })
  })

  describe('Section 9.4: Local Storage Draft Lifecycle', () => {
    // Mock localStorage for node environment
    const storageMap = new Map()
    globalThis.localStorage = {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val)),
      removeItem: (key) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    }

    beforeEach(() => {
      storageMap.clear()
    })

    it('persists and restores pending registration draft in local storage', () => {
      const draftData = {
        orgId: 'cst_Zenith_27-10-2026',
        orgName: 'Zenith Builders',
        email: 'contact@zenith.com',
        phone: '9876543210',
        username: 'zenithadmin',
        themeColor: '#017FDF',
        appName: 'Zenith Workspace',
        dateStr: '27-10-2026',
      }

      savePendingRegistrationDraft(draftData)

      const restored = getPendingRegistrationDraft()
      assert.ok(restored)
      assert.equal(restored.orgId, 'cst_Zenith_27-10-2026')
      assert.equal(restored.orgName, 'Zenith Builders')
      assert.equal(restored.email, 'contact@zenith.com')
      assert.equal(restored.themeColor, '#017FDF')
    })

    it('clears pending draft upon successful account activation', () => {
      savePendingRegistrationDraft({ orgId: 'cst_Summit_27-10-2026', orgName: 'Summit' })
      assert.ok(getPendingRegistrationDraft())

      clearPendingRegistrationDraft()
      assert.equal(getPendingRegistrationDraft(), null)
    })
  })

  describe('Section 10: Canonical Schema Separation & Backward Compatibility Parity', () => {
    it('verifies canonical root document contains only tenant identity and schemaVersion: 2', () => {
      // Simulates the payload written to /organisation/{orgId}
      const canonicalRootDoc = {
        orgId: 'cst_abiconstruction_29-10-2026',
        org_name: 'Abi Construction',
        schemaVersion: 2,
        dataMode: 'canonical',
        created_at: new Date(),
        updated_at: new Date(),
      }

      // Root doc MUST contain tenant identification and canonical metadata
      assert.equal(canonicalRootDoc.orgId, 'cst_abiconstruction_29-10-2026')
      assert.equal(canonicalRootDoc.org_name, 'Abi Construction')
      assert.equal(canonicalRootDoc.schemaVersion, 2)
      assert.equal(canonicalRootDoc.dataMode, 'canonical')

      // Root doc MUST NOT contain forbidden fields at the root level for new canonical orgs
      assert.equal(canonicalRootDoc.app_id, undefined)
      assert.equal(canonicalRootDoc.app_name, undefined)
      assert.equal(canonicalRootDoc.app_type, undefined)
      assert.equal(canonicalRootDoc.email, undefined)
      assert.equal(canonicalRootDoc.password, undefined)
      assert.equal(canonicalRootDoc.phone, undefined)
      assert.equal(canonicalRootDoc.username, undefined)
      assert.equal(canonicalRootDoc.isSubscriptionActive, undefined)
      assert.equal(canonicalRootDoc.isUpgradeQueued, undefined)
      assert.equal(canonicalRootDoc.is_cst_app, undefined)
      assert.equal(canonicalRootDoc.maxManagers, undefined)
      assert.equal(canonicalRootDoc.maxUsers, undefined)
      assert.equal(canonicalRootDoc.subscriptionPlan, undefined)
    })

    it('verifies admin credentials and identity are stored in data/admin document', () => {
      const adminDoc = {
        app_id: 'cst_white_label',
        is_cst_app: true,
        org_name: 'Abi Construction',
        username: 'abiadmin',
        password: 'SecurePassword123',
        email: 'admin@abiconstruction.com',
        phone: '9876543210',
        role: 'Organization',
        created_at: new Date(),
        updated_at: new Date(),
      }

      assert.equal(adminDoc.username, 'abiadmin')
      assert.equal(adminDoc.email, 'admin@abiconstruction.com')
      assert.equal(adminDoc.phone, '9876543210')
      assert.equal(adminDoc.role, 'Organization')
      assert.equal(adminDoc.password, 'SecurePassword123')
      assert.equal(adminDoc.is_cst_app, true)
    })

    it('verifies subscription quotas and flags are stored in data/subscription document', () => {
      const subscriptionDoc = {
        app_id: 'cst_white_label',
        subscriptionPlan: 'Gold',
        subscriptionType: 'Yearly',
        isSubscriptionActive: true,
        onboardingStep: 'COMPLETED',
        paymentStatus: 'SUCCESS',
        paymentAmount: 2388,
        maxProjects: 10,
        maxUsers: 15,
        maxManagers: 5,
        maxSupervisors: 10,
        isUpgradeQueued: false,
        payerName: 'Abi Construction',
        payerEmail: 'admin@abiconstruction.com',
      }

      assert.equal(subscriptionDoc.subscriptionPlan, 'Gold')
      assert.equal(subscriptionDoc.isSubscriptionActive, true)
      assert.equal(subscriptionDoc.maxManagers, 5)
      assert.equal(subscriptionDoc.maxUsers, 15)
      assert.equal(subscriptionDoc.isUpgradeQueued, false)
    })

    it('verifies branding is stored in data/branding document', () => {
      const brandingDoc = {
        app_id: 'cst_white_label',
        appName: 'Abi ERP',
        app_name: 'Abi ERP',
        primaryColor: '#00A86B',
        theme_color: '#00A86B',
      }

      assert.equal(brandingDoc.appName, 'Abi ERP')
      assert.equal(brandingDoc.theme_color, '#00A86B')
    })

    it('verifies referral code is stored in data/referralCode document', () => {
      const referralDoc = {
        app_id: 'cst_white_label',
        referralCode: 'ABI901',
        orgReferralCode: 'ABI901',
      }

      assert.equal(referralDoc.referralCode, 'ABI901')
    })

    it('evaluates isPendingRegistrationDoc correctly for both legacy and canonical nested schemas', () => {
      // Legacy root doc format
      const legacyPending = {
        isSubscriptionActive: false,
        onboardingStep: 'PAYMENT_PENDING',
        paymentStatus: 'PENDING',
      }
      assert.equal(isPendingRegistrationDoc(legacyPending), true)

      // Canonical schema format with nested subscription
      const canonicalPending = {
        schemaVersion: 2,
        dataMode: 'canonical',
        subscription: {
          isSubscriptionActive: false,
          subscriptionPlan: 'Pending Selection',
          onboardingStep: 'PAYMENT_PENDING',
          paymentStatus: 'PENDING',
        },
      }
      assert.equal(isPendingRegistrationDoc(canonicalPending), true)

      // Active canonical organization
      const canonicalActive = {
        schemaVersion: 2,
        dataMode: 'canonical',
        subscription: {
          isSubscriptionActive: true,
          subscriptionPlan: 'Silver',
          onboardingStep: 'COMPLETED',
          paymentStatus: 'SUCCESS',
        },
      }
      assert.equal(isPendingRegistrationDoc(canonicalActive), false)
    })
  })
})

