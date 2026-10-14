import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  completePasswordReset,
  evaluatePasswordStrength,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
} from '../../services/passwordResetService'

export default function OrganizationForgotPassword({ initialEmail = '', onBackToLogin, onSuccess }) {
  // Steps: 'email' | 'otp' | 'newPassword' | 'success'
  const [step, setStep] = useState('email')

  // Form inputs
  const [email, setEmail] = useState(initialEmail.trim())
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Session & timers state
  const [sessionId, setSessionId] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [expiresIn, setExpiresIn] = useState(300) // 5 minutes
  const [resendCooldown, setResendCooldown] = useState(60) // 60 seconds
  const [resendCount, setResendCount] = useState(0)
  const [maxResends, setMaxResends] = useState(5)
  const [resetToken, setResetToken] = useState('')
  const [remainingAttempts, setRemainingAttempts] = useState(null)
  const [sessionLocked, setSessionLocked] = useState(false)

  // Status & feedback
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

  // Refs for 6-digit OTP inputs
  const otpInputRefs = useRef([])

  // Expiry countdown timer (Step: otp)
  useEffect(() => {
    if (step !== 'otp' || expiresIn <= 0) return

    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step, expiresIn])

  // Resend cooldown timer (Step: otp)
  useEffect(() => {
    if (step !== 'otp' || resendCooldown <= 0) return

    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step, resendCooldown])

  // Focus management on step change
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus()
      }, 100)
    }
  }, [step])

  // Format seconds to mm:ss
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Request Password Reset OTP
  // ---------------------------------------------------------------------------
  async function handleRequestOtp(e) {
    if (e) e.preventDefault()
    setError('')
    setInfoMessage('')
    setLoading(true)

    try {
      const res = await requestPasswordResetOtp(email, false)
      setSessionId(res.sessionId)
      setMaskedEmail(res.maskedEmail)
      setExpiresIn(res.expiresInSeconds || 300)
      setResendCooldown(res.resendCooldownSeconds || 60)
      setResendCount(res.resendCount || 0)
      setMaxResends(res.maxResends || 5)
      setOtpDigits(['', '', '', '', '', ''])
      setRemainingAttempts(null)
      setSessionLocked(false)
      setStep('otp')
    } catch (err) {
      setError(err.message || 'Failed to send verification code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Resend OTP
  // ---------------------------------------------------------------------------
  async function handleResendOtp() {
    if (resendCooldown > 0 || resendCount >= maxResends || loading) return
    setError('')
    setInfoMessage('')
    setLoading(true)

    try {
      const res = await requestPasswordResetOtp(email, true)
      setSessionId(res.sessionId)
      setExpiresIn(res.expiresInSeconds || 300)
      setResendCooldown(res.resendCooldownSeconds || 60)
      setResendCount((prev) => prev + 1)
      setOtpDigits(['', '', '', '', '', ''])
      setRemainingAttempts(null)
      setSessionLocked(false)
      setInfoMessage('A new 6-digit verification code has been sent to your email.')
      setTimeout(() => {
        otpInputRefs.current[0]?.focus()
      }, 100)
    } catch (err) {
      setError(err.message || 'Failed to resend verification code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: OTP Input Handlers (6-digit individual boxes)
  // ---------------------------------------------------------------------------
  function handleOtpChange(index, value) {
    if (sessionLocked || expiresIn <= 0) return
    const cleaned = value.replace(/\D/g, '')

    // Handle single digit input
    const newDigits = [...otpDigits]
    if (cleaned.length === 0) {
      newDigits[index] = ''
      setOtpDigits(newDigits)
      return
    }

    // Take the last entered character if multiple characters arrived
    newDigits[index] = cleaned[cleaned.length - 1]
    setOtpDigits(newDigits)

    // Auto-advance to next box
    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }

    // Auto-verify if all 6 digits are now filled
    const fullCode = newDigits.join('')
    if (fullCode.length === 6) {
      triggerOtpVerification(fullCode)
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        // Move back to previous box on backspace if current is empty
        otpInputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      otpInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault()
      otpInputRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault()
    if (sessionLocked || expiresIn <= 0) return

    const pasteData = e.clipboardData.getData('text')
    const digitsOnly = pasteData.replace(/\D/g, '').slice(0, 6)
    if (!digitsOnly) return

    const newDigits = [...otpDigits]
    for (let i = 0; i < 6; i++) {
      newDigits[i] = digitsOnly[i] || ''
    }
    setOtpDigits(newDigits)

    // Focus the box after the last pasted digit
    const nextIndex = Math.min(digitsOnly.length, 5)
    otpInputRefs.current[nextIndex]?.focus()

    // Auto verify if 6 digits were pasted
    if (digitsOnly.length === 6) {
      triggerOtpVerification(digitsOnly)
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Verify OTP
  // ---------------------------------------------------------------------------
  async function triggerOtpVerification(code) {
    const otpToVerify = code || otpDigits.join('')
    if (otpToVerify.length !== 6) {
      setError('Please enter the complete 6-digit verification code.')
      return
    }

    if (expiresIn <= 0) {
      setError('Verification code has expired. Please click "Resend Code" to get a new code.')
      return
    }

    setError('')
    setInfoMessage('')
    setLoading(true)

    try {
      const res = await verifyPasswordResetOtp(email, otpToVerify, sessionId)
      setResetToken(res.resetToken)
      setStep('newPassword')
    } catch (err) {
      setError(err.message || 'Incorrect verification code. Please try again.')
      if (err.remainingAttempts !== undefined) {
        setRemainingAttempts(err.remainingAttempts)
        if (err.remainingAttempts <= 0) {
          setSessionLocked(true)
        }
      }
      // Re-focus first empty or first box
      otpInputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Complete Password Reset
  // ---------------------------------------------------------------------------
  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')
    setInfoMessage('')

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.')
      return
    }

    setLoading(true)
    try {
      await completePasswordReset(email, resetToken, sessionId, newPassword)
      setStep('success')
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Password strength evaluation
  const strength = evaluatePasswordStrength(newPassword)
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  return (
    <div className="w-full max-w-md mx-auto my-auto py-8 animate-fade-in">
      <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl p-8 sm:p-10 space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onBackToLogin?.(email)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5 text-slate-400 group-hover:text-slate-700" />
            <span>Back to Login</span>
          </button>

          {/* Role Pill */}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10px] font-bold text-[#0B3470] uppercase tracking-wider">
            🏢 Organization
          </span>
        </div>

        {/* Step Progress Stepper (Hidden on final success screen) */}
        {step !== 'success' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span className={step === 'email' ? 'text-[#0B3470] font-bold' : ''}>1. Email</span>
              <span className={step === 'otp' ? 'text-[#0B3470] font-bold' : ''}>2. Verify Code</span>
              <span className={step === 'newPassword' ? 'text-[#0B3470] font-bold' : ''}>3. New Password</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 h-1.5">
              <div className="rounded-full bg-[#0B3470]" />
              <div className={`rounded-full transition-colors duration-300 ${step === 'otp' || step === 'newPassword' ? 'bg-[#0B3470]' : 'bg-slate-200'}`} />
              <div className={`rounded-full transition-colors duration-300 ${step === 'newPassword' ? 'bg-[#0B3470]' : 'bg-slate-200'}`} />
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2.5 animate-fade-in" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Global Info Banner */}
        {infoMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="leading-snug">{infoMessage}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1: EMAIL ENTRY */}
        {/* ========================================================================= */}
        {step === 'email' && (
          <div className="space-y-6">
            <div className="text-left space-y-1.5">
              <div className="inline-flex p-2.5 rounded-2xl bg-[#0B3470]/5 border border-[#0B3470]/10 text-[#0B3470] mb-1">
                <Mail className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Reset Organization Password
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your registered organization email address. We will verify your account and send a 6-digit verification code.
              </p>
            </div>

            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label htmlFor="reset-email" className="block text-xs font-semibold text-slate-700">
                  Registered Organization Email *
                </label>
                <div className="relative">
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourcompany.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying email & sending code...</span>
                  </>
                ) : (
                  <span>Send Verification Code</span>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-500 leading-relaxed flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Protected by single-use 6-digit encrypted email verification.</span>
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
        {/* ========================================================================= */}
        {step === 'otp' && (
          <div className="space-y-6">
            <div className="text-left space-y-1.5">
              <div className="inline-flex p-2.5 rounded-2xl bg-[#0B3470]/5 border border-[#0B3470]/10 text-[#0B3470] mb-1">
                <KeyRound className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Enter Verification Code
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                We sent a 6-digit code to{' '}
                <strong className="text-slate-800 font-semibold">{maskedEmail || email}</strong>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setInfoMessage('')
                  setStep('email')
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer inline-block"
              >
                Change email address
              </button>
            </div>

            {/* 6 OTP Input Boxes */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 text-left">
                6-Digit Security Code *
              </label>
              <div className="flex items-center justify-between gap-1.5 sm:gap-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={loading || sessionLocked || expiresIn <= 0}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className={`w-11 h-13 sm:w-13 sm:h-14 text-center text-xl sm:text-2xl font-extrabold rounded-xl border bg-white outline-none transition-all ${
                      sessionLocked || expiresIn <= 0
                        ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                        : digit
                        ? 'border-[#0B3470] ring-2 ring-[#0B3470]/15 text-[#0B3470]'
                        : 'border-slate-300 text-slate-900 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15'
                    }`}
                  />
                ))}
              </div>

              {/* Remaining attempts indicator if wrong OTP entered */}
              {remainingAttempts !== null && remainingAttempts > 0 && !sessionLocked && (
                <p className="text-xs text-amber-700 text-left flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{remainingAttempts} incorrect attempt{remainingAttempts > 1 ? 's' : ''} remaining before code invalidation.</span>
                </p>
              )}

              {sessionLocked && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left space-y-1">
                  <p className="font-bold">Session Locked</p>
                  <p>Too many incorrect attempts. This OTP has been invalidated for security.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email')
                      setError('')
                      setSessionLocked(false)
                    }}
                    className="font-bold text-rose-800 underline hover:text-rose-900 cursor-pointer pt-1 block"
                  >
                    Start over with a new OTP
                  </button>
                </div>
              )}
            </div>

            {/* Timers Row: Code Expiry & Resend Cooldown */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              {/* Expiry Countdown */}
              <div className="flex items-center gap-1.5 text-slate-600">
                <Clock className={`w-4 h-4 ${expiresIn <= 60 ? 'text-rose-600 animate-pulse' : 'text-slate-500'}`} />
                <span>
                  {expiresIn > 0 ? (
                    <>
                      Expires in <strong className={expiresIn <= 60 ? 'text-rose-600' : 'text-slate-900'}>{formatTime(expiresIn)}</strong>
                    </>
                  ) : (
                    <strong className="text-rose-600">Code expired</strong>
                  )}
                </span>
              </div>

              {/* Resend Link / Button */}
              <div>
                {resendCooldown > 0 ? (
                  <span className="text-slate-400 font-medium">
                    Resend in <strong className="text-slate-600">{resendCooldown}s</strong>
                  </span>
                ) : resendCount >= maxResends ? (
                  <span className="text-slate-400 font-medium">Max resends reached</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 font-bold text-blue-600 hover:text-blue-800 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Resend Code</span>
                    {resendCount > 0 && <span className="text-slate-400 text-[10px]">({resendCount}/{maxResends})</span>}
                  </button>
                )}
              </div>
            </div>

            {/* Verification Button */}
            <button
              type="button"
              disabled={loading || sessionLocked || expiresIn <= 0 || otpDigits.join('').length !== 6}
              onClick={() => triggerOtpVerification()}
              className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying code...</span>
                </>
              ) : (
                <span>Verify Code</span>
              )}
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: SET NEW PASSWORD */}
        {/* ========================================================================= */}
        {step === 'newPassword' && (
          <div className="space-y-6">
            <div className="text-left space-y-1.5">
              <div className="inline-flex p-2.5 rounded-2xl bg-[#0B3470]/5 border border-[#0B3470]/10 text-[#0B3470] mb-1">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Create New Password
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Set a secure password for your Organization account. You will use this new password to sign in.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 text-left">
              {/* New Password */}
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Strength Meter */}
              {newPassword.length > 0 && (
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600">Password Strength:</span>
                    <span className={strength.textColor}>{strength.label}</span>
                  </div>
                  {/* Strength Bar */}
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map((idx) => (
                      <div
                        key={idx}
                        className={`h-full rounded-full transition-all duration-300 ${
                          idx <= strength.score ? strength.color : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  {/* Requirements Checklist */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      {strength.criteria.minLength6 ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span className={strength.criteria.minLength6 ? 'text-slate-700 font-medium' : ''}>
                        At least 6 chars
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {strength.criteria.minLength8 ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span className={strength.criteria.minLength8 ? 'text-slate-700 font-medium' : ''}>
                        8+ chars (recommended)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {strength.criteria.hasLettersAndNumbers ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span className={strength.criteria.hasLettersAndNumbers ? 'text-slate-700 font-medium' : ''}>
                        Letters & numbers
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {strength.criteria.hasSpecialChar ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span className={strength.criteria.hasSpecialChar ? 'text-slate-700 font-medium' : ''}>
                        Special character
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    className={`w-full pl-10 pr-12 py-3 bg-white border rounded-xl text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all shadow-2xs ${
                      passwordsMatch
                        ? 'border-emerald-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/15'
                        : passwordsMismatch
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                        : 'border-slate-300 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15'
                    }`}
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordsMatch && (
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Passwords match perfectly.</span>
                  </p>
                )}
                {passwordsMismatch && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Passwords do not match yet.</span>
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <span>Reset Password</span>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: SUCCESS CONFIRMATION */}
        {/* ========================================================================= */}
        {step === 'success' && (
          <div className="space-y-6 text-center py-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm animate-scale-in">
              <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Password Reset Successfully!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                Your organization administrator password has been updated. You can now log in to the Organization Portal using your new password.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onSuccess) onSuccess(email)
                  else if (onBackToLogin) onBackToLogin(email)
                }}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Back to Organization Login</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
