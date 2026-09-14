import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import logo from '../assets/logo/logo.png'
import './Login.css'

function authMessage(error) {
  if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
    return 'The email or password is incorrect.'
  }
  if (error.code === 'auth/unauthorized-role' || error.code === 'auth/subscription-inactive' || error.code === 'auth/organization-not-found' || error.code === 'auth/account-not-configured') return error.message
  return 'We could not sign you in. Please try again.'
}

export default function Login() {
  const { user, role, login, loading } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user && role) return <Navigate to={role === 'Manager' ? '/manager/dashboard' : '/organization/dashboard'} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const authenticatedRole = await login(identifier, password)
      navigate(authenticatedRole === 'Manager' ? '/manager/dashboard' : '/organization/dashboard', { replace: true })
    } catch (loginError) {
      setError(authMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-art" aria-label="eBricks field operations">
        <div className="login-brand"><img className="brand-logo" src={logo} alt="eBricks logo" /><strong>eBricks</strong></div>
        <img className="building-photo" src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=85" alt="Modern construction site" />
        <div className="art-caption"><span>EBRICKS</span><strong>Build better.<br />Operate smarter.</strong></div>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <h1>Welcome to <span>eBricks</span></h1>
          <p className="login-subtitle">We make it easy for everyone to manage<br />construction operations in one place.</p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="identifier">Username, email, phone, or organization ID<input id="identifier" type="text" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Enter your account identifier" required /></label>
            <label htmlFor="password">Password<input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
            <div className="form-options"><label className="remember"><input type="checkbox" /> <span>Remember me</span></label><button type="button" className="forgot-button">Forgot password?</button></div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-button" type="submit" disabled={submitting}>{submitting ? 'Signing in...' : 'Login'}</button>
          </form>
          <p className="login-note">Access is assigned automatically based on your account permissions.</p>
        </div>
        <footer>© 2026 eBricks <span>Privacy&nbsp;&nbsp;&nbsp; Support</span></footer>
      </section>
    </main>
  )
}
