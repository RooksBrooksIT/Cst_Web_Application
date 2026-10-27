import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import logo from '../../../assets/logo/FinalLogo.jpg'
import StepIndicator from './StepIndicator'
import Step1Details from './Step1Details'
import Step2Branding from './Step2Branding'
import Step3Pricing from './Step3Pricing'
import PendingResumeModal from './PendingResumeModal'
import {
  getPendingRegistrationDraft,
  clearPendingRegistrationDraft,
  savePendingRegistrationDraft,
} from '../../../services/organizationRegistrationService'
import { createSession } from '../../../services/authService'

export default function OrganizationOnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, role, loading, setDirectSession, login } = useAuth()

  // Step: 1 = Details, 2 = Branding, 3 = Pricing
  const [currentStep, setCurrentStep] = useState(1)

  // Registration Data
  const [registrationData, setRegistrationData] = useState({
    orgName: '',
    email: '',
    phone: '',
    username: '',
    password: '',
    confirmPassword: '',
    appName: '',
    themeColor: '#00A86B',
    dateStr: '',
    orgId: '',
    referralCode: '',
  })

  // Pending resume dialog state
  const [pendingModalData, setPendingModalData] = useState(null)
  const [showPendingModal, setShowPendingModal] = useState(false)

  // Check for saved recovery draft on initial load
  useEffect(() => {
    const draft = getPendingRegistrationDraft()
    if (draft && draft.orgId) {
      setRegistrationData((prev) => ({
        ...prev,
        ...draft,
        orgName: draft.orgName || prev.orgName,
        email: draft.email || prev.email,
        phone: draft.phone || prev.phone,
        username: draft.username || prev.username,
        password: draft.password || prev.password,
        appName: draft.appName || prev.appName,
        themeColor: draft.themeColor || prev.themeColor,
        dateStr: draft.dateStr || prev.dateStr,
        orgId: draft.orgId || prev.orgId,
      }))

      // If draft was already saved at Step 2 (has orgId), offer resumption or default to Step 3
      setPendingModalData(draft)
      setShowPendingModal(true)
    }
  }, [])

  // If already logged in with active Organization role, redirect to dashboard
  useEffect(() => {
    if (!loading && user && role === 'Organization') {
      // Don't auto redirect if we are actively registering
    }
  }, [loading, user, role])

  // Step 1 -> Step 2
  function handleStep1Next(details) {
    setRegistrationData((prev) => {
      const updated = {
        ...prev,
        ...details,
        appName: prev.appName || details.orgName,
      }
      savePendingRegistrationDraft(updated)
      return updated
    })
    setCurrentStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Step 2 -> Step 3
  function handleStep2Next(brandingData) {
    setRegistrationData((prev) => {
      const updated = {
        ...prev,
        ...brandingData,
      }
      savePendingRegistrationDraft(updated)
      return updated
    })
    setCurrentStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Step 2 -> Step 1 (Back)
  function handleStep2Back() {
    setCurrentStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Step 3 -> Step 2 (Back)
  function handleStep3Back() {
    setCurrentStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Complete Onboarding -> Log in & Dashboard
  async function handleOnboardingComplete(activationResult) {
    const orgId = activationResult.orgId || registrationData.orgId
    const email = registrationData.email
    const username = registrationData.username || orgId
    const password = registrationData.password
    const orgName = registrationData.orgName

    try {
      // Create session payload
      const session = createSession(
        orgId,
        email,
        orgId,
        'Organization',
        {
          org_name: orgName,
          app_name: registrationData.appName || orgName,
          theme_color: registrationData.themeColor || '#00A86B',
          role: 'Organization',
          email,
          phone: registrationData.phone,
          username,
          isSubscriptionActive: true,
          subscriptionPlan: activationResult.planName || 'Free Trial',
        }
      )

      if (setDirectSession) {
        setDirectSession(session)
      } else if (login && password) {
        await login(username || email, password, 'Organization').catch(() => null)
      }

      // Clean draft
      clearPendingRegistrationDraft()

      // Navigate to organization dashboard
      navigate('/organization/dashboard', { replace: true })
    } catch (err) {
      console.warn('Session setup notice:', err)
      clearPendingRegistrationDraft()
      navigate('/organization/dashboard', { replace: true })
    }
  }

  // Resume Pending Registration
  function handleResumePendingRegistration(pending) {
    setShowPendingModal(false)
    setRegistrationData((prev) => ({
      ...prev,
      orgId: pending.id || pending.orgId,
      orgName: pending.org_name || pending.orgName || prev.orgName,
      appName: pending.app_name || pending.appName || prev.appName || pending.org_name,
      themeColor: pending.theme_color || pending.primaryColor || prev.themeColor,
      email: pending.email || prev.email,
      phone: pending.phone || prev.phone,
      username: pending.username || prev.username,
      password: pending.password || prev.password,
      dateStr: pending.dateStr || prev.dateStr,
    }))

    // Directly jump to Step 3: Pricing
    setCurrentStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleBackToLogin() {
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between font-sans text-slate-900">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-slate-200/90 py-4 px-6 sm:px-10 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div
            onClick={() => navigate('/login')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img
              className="h-10 w-auto rounded-xl object-contain bg-white p-1 border border-slate-200 shadow-xs group-hover:scale-105 transition-transform"
              src={logo}
              alt="eBricks"
            />
            <div>
              <strong className="text-lg font-extrabold text-[#0B3470] tracking-wide block">
                eBricks
              </strong>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Organization Registration
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="text-slate-500 hidden sm:inline">Already registered?</span>
            <button
              type="button"
              onClick={handleBackToLogin}
              className="py-2 px-3.5 rounded-xl border border-slate-300 hover:border-[#0B3470] hover:text-[#0B3470] text-slate-700 transition-all font-bold cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Step Indicator */}
          <StepIndicator
            currentStep={currentStep}
            brandColor={registrationData.themeColor || '#0B3470'}
          />

          {/* Step 1: Details */}
          {currentStep === 1 && (
            <Step1Details
              initialData={registrationData}
              onNext={handleStep1Next}
              onShowPendingModal={(data) => {
                setPendingModalData(data)
                setShowPendingModal(true)
              }}
              onBackToLogin={handleBackToLogin}
            />
          )}

          {/* Step 2: Branding */}
          {currentStep === 2 && (
            <Step2Branding
              registrationData={registrationData}
              onNext={handleStep2Next}
              onBack={handleStep2Back}
            />
          )}

          {/* Step 3: Pricing */}
          {currentStep === 3 && (
            <Step3Pricing
              registrationData={registrationData}
              onBack={handleStep3Back}
              onComplete={handleOnboardingComplete}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-5 px-6 sm:px-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© 2026 eBricks Platform. Multi-Tenant Enterprise Construction ERP.</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Interoperable with eBricks Mobile App</span>
            <span>·</span>
            <span>PayU Indian Gateway Hosted Checkout</span>
          </div>
        </div>
      </footer>

      {/* Pending Registration Recovery Modal */}
      {showPendingModal && pendingModalData && (
        <PendingResumeModal
          isOpen={showPendingModal}
          onClose={() => setShowPendingModal(false)}
          onResume={handleResumePendingRegistration}
          pendingData={pendingModalData}
        />
      )}
    </div>
  )
}

