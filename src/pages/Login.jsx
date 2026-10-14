import { useState } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import logo from '../assets/logo/FinalLogo.jpg'
import OrganizationForgotPassword from '../components/auth/OrganizationForgotPassword'

function authMessage(error) {
  if (
    error.code === 'auth/invalid-credential' ||
    error.code === 'auth/invalid-email'
  ) {
    return 'The username, email, or password entered is incorrect. Please check your credentials.'
  }
  if (error.code === 'auth/wrong-password') {
    return 'The password entered is incorrect. Please verify your password and try again.'
  }
  if (error.code === 'auth/user-not-found') {
    return error.message || 'No account found with these credentials for the selected login type.'
  }
  if (
    error.code === 'auth/unauthorized-role' ||
    error.code === 'auth/subscription-inactive' ||
    error.code === 'auth/organization-not-found' ||
    error.code === 'auth/account-not-configured' ||
    error.code === 'auth/account-inactive'
  ) {
    return error.message
  }
  return error.message || 'We could not sign you in. Please check your credentials and try again.'
}

export default function Login({ initialView = 'login' }) {
  const { user, role, login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [loginType, setLoginType] = useState('Organization') // 'Organization' | 'Manager'
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [successBanner, setSuccessBanner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(
    initialView === 'forgot-password' || location.pathname === '/forgot-password'
  )

  if (!loading && user && role) {
    return <Navigate to={role === 'Manager' ? '/manager/dashboard' : '/organization/dashboard'} replace />
  }

  function handleTypeChange(type) {
    if (type === loginType) return
    setLoginType(type)
    setError('')
    setSuccessBanner('')
    setShowForgotPassword(false)
  }

  function handleOpenForgotPassword() {
    setError('')
    setSuccessBanner('')
    setShowForgotPassword(true)
  }

  function handleBackToLogin(email) {
    setShowForgotPassword(false)
    if (location.pathname === '/forgot-password') {
      navigate('/login', { replace: true })
    }
    if (email && typeof email === 'string') {
      setIdentifier(email)
    }
    setError('')
  }

  function handleResetSuccess(email) {
    setShowForgotPassword(false)
    if (location.pathname === '/forgot-password') {
      navigate('/login', { replace: true })
    }
    if (email && typeof email === 'string') {
      setIdentifier(email)
    }
    setPassword('')
    setError('')
    setSuccessBanner('Password updated successfully! You can now sign in with your new password.')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccessBanner('')
    setSubmitting(true)
    try {
      const authenticatedRole = await login(identifier, password, loginType)
      navigate(authenticatedRole === 'Manager' ? '/manager/dashboard' : '/organization/dashboard', { replace: true })
    } catch (loginError) {
      setError(authMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }


  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#F8FAFC] font-sans text-slate-900">
      {/* ----------------------------------------------------------------------------------------- */}
      {/* LEFT SIDE: Visual Art, Construction Branding & Operations Overview */}
      {/* ----------------------------------------------------------------------------------------- */}
      <section className="relative hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-10 xl:p-14 overflow-hidden bg-[#0B3470]">
        {/* Background Image with #0B3470 Gradient Overlay */}
        <img
          className="absolute inset-0 w-full h-full object-cover object-center opacity-30 mix-blend-overlay scale-105 transition-transform duration-1000"
          src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1600&q=80"
          alt="Modern Construction Management"
        />
        <div className="absolute inset-0 bg-linear-to-br from-[#0B3470]/95 via-[#0B3470]/85 to-[#082654]/95 z-10 pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-20 flex items-center gap-3.5">
          <img
            className="h-11 w-auto rounded-xl object-contain bg-white p-1.5 shadow-md border border-white/20"
            src={logo}
            alt="eBricks"
          />
          <div>
            <strong className="text-xl font-extrabold tracking-wide text-white block">eBricks</strong>
            <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase block">Construction Operations Platform</span>
          </div>
        </div>

        {/* Central Value Proposition */}
        <div className="relative z-20 space-y-6 max-w-xl my-auto py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-blue-200 text-xs font-semibold backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Enterprise Construction ERP & Site Hub
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Powering Smart Construction Operations.
            </h1>
            <p className="text-sm xl:text-base text-blue-100/90 leading-relaxed">
              Unified command center for multi-site construction execution, real-time workforce attendance, material inventory (GRN), tools tracking, and multi-tier payment approvals.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs text-left space-y-1">
              <span className="text-lg">🏗️</span>
              <h2 className="text-xs font-bold text-white">Live Site Projects</h2>
              <p className="text-[11px] text-blue-100/75">Stage milestones, budget pacing & health</p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs text-left space-y-1">
              <span className="text-lg">👷</span>
              <h2 className="text-xs font-bold text-white">Workforce Hub</h2>
              <p className="text-[11px] text-blue-100/75">Daily attendance, shifts & contractor logs</p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs text-left space-y-1">
              <span className="text-lg">📦</span>
              <h2 className="text-xs font-bold text-white">Materials & GRN</h2>
              <p className="text-[11px] text-blue-100/75">Goods received notes & inventory stock</p>
            </div>
            <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 backdrop-blur-xs text-left space-y-1">
              <span className="text-lg">✓</span>
              <h2 className="text-xs font-bold text-white">3-Tier Approvals</h2>
              <p className="text-[11px] text-blue-100/75">Technical verification & financial clearance</p>
            </div>
          </div>
        </div>

        {/* Footer Guarantee */}
        <div className="relative z-20 flex items-center justify-between text-xs text-blue-200/80 pt-4 border-t border-white/10">
          <span>Interoperable with eBricks Mobile App</span>
          <span>Enterprise Cloud Security</span>
        </div>
      </section>

      {/* ----------------------------------------------------------------------------------------- */}
      {/* RIGHT SIDE: Clean, Standard Enterprise Login Form */}
      {/* ----------------------------------------------------------------------------------------- */}
      <section className="flex flex-col justify-between p-6 sm:p-10 lg:col-span-6 xl:col-span-5 min-h-screen bg-[#F8FAFC]">
        {/* Mobile Header */}
        <div className="flex lg:hidden items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <img className="h-9 w-auto rounded-xl object-contain bg-white p-1 border border-slate-200 shadow-xs" src={logo} alt="eBricks" />
            <div>
              <strong className="text-base font-extrabold text-[#0B3470]">eBricks</strong>
              <span className="text-[10px] text-slate-500 block font-semibold">Construction Platform</span>
            </div>
          </div>
        </div>

        {/* Form Container Card or Forgot Password Component */}
        {showForgotPassword ? (
          <OrganizationForgotPassword
            initialEmail={identifier}
            onBackToLogin={handleBackToLogin}
            onSuccess={handleResetSuccess}
          />
        ) : (
          <div className="w-full max-w-md mx-auto my-auto py-8">
            <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl p-8 sm:p-10 space-y-6">
              {/* Header Text */}
              <div className="text-left space-y-1.5">
                <div className="hidden lg:inline-flex p-2 rounded-xl bg-[#0B3470]/5 border border-[#0B3470]/10 mb-2">
                  <img className="h-9 w-auto rounded-lg object-contain" src={logo} alt="eBricks" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Welcome to eBricks
                </h2>
                <p className="text-xs text-slate-500">
                  Select your portal and sign in to your operational account.
                </p>
              </div>

              {/* Login Type Segmented Selector */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Select Login Type
                </label>
                <div className="p-1 bg-slate-100 rounded-2xl border border-slate-200 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('Organization')}
                    className={`py-2.5 px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                      loginType === 'Organization'
                        ? 'bg-[#0B3470] text-white shadow-sm font-bold'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">🏢</span>
                      <span className="text-xs sm:text-sm font-bold">Organization</span>
                    </div>
                    <span className={`text-[10px] leading-tight ${loginType === 'Organization' ? 'text-blue-200 font-medium' : 'text-slate-400'}`}>
                      Admin Portal
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('Manager')}
                    className={`py-2.5 px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                      loginType === 'Manager'
                        ? 'bg-[#0B3470] text-white shadow-sm font-bold'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">👷</span>
                      <span className="text-xs sm:text-sm font-bold">Manager</span>
                    </div>
                    <span className={`text-[10px] leading-tight ${loginType === 'Manager' ? 'text-blue-200 font-medium' : 'text-slate-400'}`}>
                      Site Operations
                    </span>
                  </button>
                </div>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                {/* Success Alert Banner (e.g. from password reset) */}
                {successBanner && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2.5 animate-fade-in" role="status">
                    <span className="text-base leading-none">✅</span>
                    <span className="leading-snug">{successBanner}</span>
                  </div>
                )}

                {/* Identifier Field */}
                <div className="space-y-1.5">
                  <label htmlFor="identifier" className="block text-xs font-semibold text-slate-700">
                    {loginType === 'Organization' ? 'Organization Email or Username *' : 'Manager Email, Username, or ID *'}
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder={
                      loginType === 'Organization'
                        ? 'Enter your organization email or username'
                        : 'Enter your manager username, email, or ID'
                    }
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                      Password *
                    </label>
                    {loginType === 'Organization' && (
                      <button
                        type="button"
                        onClick={handleOpenForgotPassword}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your account password"
                      required
                      className="w-full px-4 py-3 pr-12 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold select-none cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-slate-300 text-[#0B3470] focus:ring-0"
                    />
                    <span>Remember my session</span>
                  </label>
                </div>

                {/* Error Alert Box */}
                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2.5 animate-fade-in" role="alert">
                    <span className="text-base leading-none">⚠️</span>
                    <span className="leading-snug">{error}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-[#0B3470] hover:bg-[#082654] text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying {loginType.toLowerCase()} credentials...</span>
                    </>
                  ) : (
                    <span>Sign In to {loginType} Portal</span>
                  )}
                </button>
              </form>

              {/* Role Notice */}
              <div className="pt-2 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {loginType === 'Organization' ? (
                    <>Logging in as <strong>Organization Administrator</strong>. Validates against organization registration and administration records.</>
                  ) : (
                    <>Logging in as <strong>Site Operations Manager</strong>. Validates active manager credentials and site assignments.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="w-full max-w-md mx-auto pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-200/80">
          <span>© 2026 eBricks Application</span>
          <div className="flex gap-3 text-slate-400">
            <span className="hover:text-slate-600 cursor-pointer">Privacy Policy</span>
            <span>·</span>
            <span className="hover:text-slate-600 cursor-pointer">Terms of Service</span>
          </div>
        </footer>
      </section>
    </div>
  )
}
