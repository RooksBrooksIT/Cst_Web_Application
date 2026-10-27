import { useState, useEffect, useRef } from 'react'
import {
  Building2,
  Mail,
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import {
  isOrgNameUnique,
  isGlobalEmailUnique,
  isGlobalPhoneUnique,
  calculatePasswordEntropy,
  validateOrganizationRegistration,
  formatDateStamp,
} from '../../../services/organizationRegistrationService'
import { isGlobalUsernameUnique, isUsernameCachedAsTaken } from '../../../services/usernameValidationService'

export default function Step1Details({
  initialData = {},
  onNext,
  onShowPendingModal,
  onBackToLogin,
}) {
  const [orgName, setOrgName] = useState(initialData.orgName || '')
  const [email, setEmail] = useState(initialData.email || '')
  const [phone, setPhone] = useState(initialData.phone || '')
  const [username, setUsername] = useState(initialData.username || '')
  const [password, setPassword] = useState(initialData.password || '')
  const [confirmPassword, setConfirmPassword] = useState(initialData.confirmPassword || '')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Field validation states: { status: 'idle' | 'validating' | 'valid' | 'invalid', message: '' }
  const [orgNameStatus, setOrgNameStatus] = useState({ status: 'idle', message: '' })
  const [emailStatus, setEmailStatus] = useState({ status: 'idle', message: '' })
  const [phoneStatus, setPhoneStatus] = useState({ status: 'idle', message: '' })
  const [usernameStatus, setUsernameStatus] = useState({ status: 'idle', message: '' })

  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState('')

  // Sequence counters to prevent out-of-order debounce responses
  const orgNameSeq = useRef(0)
  const emailSeq = useRef(0)
  const phoneSeq = useRef(0)
  const usernameSeq = useRef(0)

  // 1. Organization Name Debounce (200ms)
  useEffect(() => {
    const clean = orgName.trim()
    if (!clean) {
      setOrgNameStatus({ status: 'idle', message: '' })
      return
    }
    if (clean.length < 2) {
      setOrgNameStatus({ status: 'invalid', message: 'Min 2 characters required.' })
      return
    }

    setOrgNameStatus({ status: 'validating', message: 'Checking availability...' })
    const seq = ++orgNameSeq.current

    const timer = setTimeout(async () => {
      try {
        const res = await isOrgNameUnique(clean)
        if (seq === orgNameSeq.current) {
          if (res.isUnique) {
            setOrgNameStatus({ status: 'valid', message: res.message })
          } else {
            setOrgNameStatus({
              status: 'invalid',
              message: res.message,
              isPending: res.isPending,
              pendingData: res.pendingData,
            })
            if (res.isPending && res.pendingData) {
              onShowPendingModal && onShowPendingModal(res.pendingData)
            }
          }
        }
      } catch {
        if (seq === orgNameSeq.current) {
          setOrgNameStatus({ status: 'idle', message: '' })
        }
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [orgName])

  // 2. Corporate Email Debounce (250ms)
  useEffect(() => {
    const clean = email.trim().toLowerCase()
    if (!clean) {
      setEmailStatus({ status: 'idle', message: '' })
      return
    }

    const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/
    if (!emailRegex.test(clean)) {
      setEmailStatus({ status: 'invalid', message: 'Enter a valid corporate email format.' })
      return
    }

    setEmailStatus({ status: 'validating', message: 'Checking email...' })
    const seq = ++emailSeq.current

    const timer = setTimeout(async () => {
      try {
        const res = await isGlobalEmailUnique(clean)
        if (seq === emailSeq.current) {
          if (res.isUnique) {
            setEmailStatus({ status: 'valid', message: res.message })
          } else {
            setEmailStatus({
              status: 'invalid',
              message: res.message,
              isPending: res.isPending,
              pendingData: res.pendingData,
            })
            if (res.isPending && res.pendingData) {
              onShowPendingModal && onShowPendingModal(res.pendingData)
            }
          }
        }
      } catch {
        if (seq === emailSeq.current) {
          setEmailStatus({ status: 'idle', message: '' })
        }
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [email])

  // 3. Contact Phone Debounce (250ms)
  useEffect(() => {
    const digits = phone.replace(/\D/g, '')
    if (!digits) {
      setPhoneStatus({ status: 'idle', message: '' })
      return
    }
    if (digits.length !== 10) {
      setPhoneStatus({ status: 'invalid', message: `Must be exactly 10 digits (${digits.length}/10).` })
      return
    }

    setPhoneStatus({ status: 'validating', message: 'Checking phone...' })
    const seq = ++phoneSeq.current

    const timer = setTimeout(async () => {
      try {
        const res = await isGlobalPhoneUnique(digits)
        if (seq === phoneSeq.current) {
          if (res.isUnique) {
            setPhoneStatus({ status: 'valid', message: res.message })
          } else {
            setPhoneStatus({
              status: 'invalid',
              message: res.message,
              isPending: res.isPending,
              pendingData: res.pendingData,
            })
            if (res.isPending && res.pendingData) {
              onShowPendingModal && onShowPendingModal(res.pendingData)
            }
          }
        }
      } catch {
        if (seq === phoneSeq.current) {
          setPhoneStatus({ status: 'idle', message: '' })
        }
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [phone])

  // 4. Admin Username Debounce (200ms)
  useEffect(() => {
    const clean = username.trim().toLowerCase()
    if (!clean) {
      setUsernameStatus({ status: 'idle', message: '' })
      return
    }
    if (clean.length < 3) {
      setUsernameStatus({ status: 'invalid', message: 'Username must be at least 3 characters.' })
      return
    }

    // Fast 0ms cache check
    if (isUsernameCachedAsTaken(clean)) {
      setUsernameStatus({ status: 'invalid', message: 'Username already exists.' })
      return
    }

    setUsernameStatus({ status: 'validating', message: 'Checking username...' })
    const seq = ++usernameSeq.current

    const timer = setTimeout(async () => {
      try {
        const res = await isGlobalUsernameUnique(clean)
        if (seq === usernameSeq.current) {
          if (res.isUnique) {
            setUsernameStatus({ status: 'valid', message: res.message })
          } else {
            setUsernameStatus({ status: 'invalid', message: res.message })
          }
        }
      } catch {
        if (seq === usernameSeq.current) {
          setUsernameStatus({ status: 'idle', message: '' })
        }
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [username])

  // Entropy evaluation
  const entropy = calculatePasswordEntropy(password)

  // Handle Submit
  async function handleSubmit(e) {
    e.preventDefault()
    setGeneralError('')

    const cleanOrg = orgName.trim()
    const cleanEmail = email.trim().toLowerCase()
    const cleanPhone = phone.replace(/\D/g, '')
    const cleanUsername = username.trim().toLowerCase()

    if (!cleanOrg || cleanOrg.length < 2) {
      setGeneralError('Please enter a valid organization name (min 2 characters).')
      return
    }
    if (!cleanEmail || !/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(cleanEmail)) {
      setGeneralError('Please enter a valid corporate email address.')
      return
    }
    if (cleanPhone.length !== 10) {
      setGeneralError('Please enter a 10-digit mobile number.')
      return
    }
    if (cleanUsername.length < 3) {
      setGeneralError('Please choose a unique admin username (min 3 characters).')
      return
    }
    if (password.length < 8) {
      setGeneralError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setGeneralError('Password confirmation does not match your chosen password.')
      return
    }

    // Check if any real-time status was flagged invalid
    if (
      orgNameStatus.status === 'invalid' ||
      emailStatus.status === 'invalid' ||
      phoneStatus.status === 'invalid' ||
      usernameStatus.status === 'invalid'
    ) {
      setGeneralError('Please resolve the field validation errors highlighted above.')
      return
    }

    setSubmitting(true)

    try {
      // Simultaneous Multi-Field Atomic Validation
      const validation = await validateOrganizationRegistration({
        orgName: cleanOrg,
        email: cleanEmail,
        phone: cleanPhone,
        username: cleanUsername,
      })

      if (!validation.isValid) {
        if (validation.isPending && validation.pendingData) {
          onShowPendingModal && onShowPendingModal(validation.pendingData)
          return
        }
        setGeneralError(validation.errorMessage || 'One or more fields are already registered. Please review.')
        return
      }

      // Valid: advance to Step 2: Branding
      onNext({
        orgName: cleanOrg,
        email: cleanEmail,
        phone: cleanPhone,
        username: cleanUsername,
        password,
        confirmPassword,
        dateStr: formatDateStamp(),
      })
    } catch (err) {
      console.error('Validation error:', err)
      setGeneralError(err.message || 'An unexpected error occurred while validating details. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 sm:p-10 space-y-6">
      {/* Step Header */}
      <div className="text-left space-y-1.5 pb-2 border-b border-slate-100">
        <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
          Step 1 of 3 · Account Credentials
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Set Up Your Organization
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Create the primary master administrative account for your company.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {/* Field 1: Organization Name */}
        <div className="space-y-1.5">
          <label htmlFor="orgName" className="block text-xs font-semibold text-slate-700">
            Organization Legal Name *
          </label>
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Apex Builders Private Limited"
              required
              className="w-full pl-10 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {orgNameStatus.status === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              {orgNameStatus.status === 'valid' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {orgNameStatus.status === 'invalid' && <XCircle className="w-4 h-4 text-rose-500" />}
            </div>
          </div>
          {orgNameStatus.message && (
            <p
              className={`text-[11px] font-medium ${
                orgNameStatus.status === 'valid' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {orgNameStatus.message}
            </p>
          )}
        </div>

        {/* Field 2: Corporate Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700">
            Corporate Email Address *
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. contact@apexbuilders.com"
              required
              className="w-full pl-10 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {emailStatus.status === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              {emailStatus.status === 'valid' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {emailStatus.status === 'invalid' && <XCircle className="w-4 h-4 text-rose-500" />}
            </div>
          </div>
          {emailStatus.message && (
            <p
              className={`text-[11px] font-medium ${
                emailStatus.status === 'valid' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {emailStatus.message}
            </p>
          )}
        </div>

        {/* Field 3: Contact Phone */}
        <div className="space-y-1.5">
          <label htmlFor="phone" className="block text-xs font-semibold text-slate-700">
            Contact Number (10 Digits) *
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="phone"
              type="tel"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="e.g. 9876543210"
              required
              className="w-full pl-10 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {phoneStatus.status === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              {phoneStatus.status === 'valid' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {phoneStatus.status === 'invalid' && <XCircle className="w-4 h-4 text-rose-500" />}
            </div>
          </div>
          {phoneStatus.message && (
            <p
              className={`text-[11px] font-medium ${
                phoneStatus.status === 'valid' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {phoneStatus.message}
            </p>
          )}
        </div>

        {/* Field 4: Admin Username */}
        <div className="space-y-1.5">
          <label htmlFor="username" className="block text-xs font-semibold text-slate-700">
            Admin Username *
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
              placeholder="e.g. apexadmin"
              required
              className="w-full pl-10 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {usernameStatus.status === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              {usernameStatus.status === 'valid' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {usernameStatus.status === 'invalid' && <XCircle className="w-4 h-4 text-rose-500" />}
            </div>
          </div>
          {usernameStatus.message && (
            <p
              className={`text-[11px] font-medium ${
                usernameStatus.status === 'valid' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {usernameStatus.message}
            </p>
          )}
        </div>

        {/* Field 5: Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
            Account Password *
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password Entropy Scoring Meter */}
          {password && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500">Security Score:</span>
                <span className={`font-bold ${entropy.textClass}`}>{entropy.label}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${entropy.color}`}
                  style={{ width: entropy.percent }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Field 6: Confirm Password */}
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700">
            Confirm Password *
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
              className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-[11px] font-medium text-rose-600">Passwords do not match.</p>
          )}
        </div>

        {/* General Error Banner */}
        {generalError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2.5 animate-fade-in" role="alert">
            <span className="text-base leading-none">⚠️</span>
            <span className="leading-snug">{generalError}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 text-white animate-spin" />
              <span>Validating credentials...</span>
            </>
          ) : (
            <>
              <span>Continue to Branding</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Switch to Login Link */}
      <div className="pt-2 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Already registered your organization?{' '}
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer ml-1"
          >
            Sign In to Dashboard
          </button>
        </p>
      </div>
    </div>
  )
}

