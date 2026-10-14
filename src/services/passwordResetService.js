import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-cst-whitelabel-app.cloudfunctions.net'

/**
 * Fallback direct HTTP caller in case of any callable wrapper issues.
 */
async function callCloudFunctionHttp(endpoint, data) {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  })

  if (!response.ok) {
    let errMessage = `Server returned error (${response.status})`
    try {
      const errJson = await response.json()
      if (errJson?.error?.message) errMessage = errJson.error.message
      else if (errJson?.result?.error) errMessage = errJson.result.error
    } catch {
      // response wasn't json
    }
    throw new Error(errMessage)
  }

  const json = await response.json()
  return json?.result || json?.data || json
}

/**
 * Unified caller: tries Firebase SDK httpsCallable first, falls back to direct HTTP POST.
 */
async function invokeFunction(functionName, payload) {
  try {
    const callable = httpsCallable(functions, functionName)
    const result = await callable(payload)
    return result.data
  } catch (callableError) {
    // If callable threw an HttpsError or network issue, attempt fallback
    console.warn(`httpsCallable(${functionName}) failed, attempting HTTP fallback:`, callableError)
    try {
      return await callCloudFunctionHttp(functionName, payload)
    } catch (httpError) {
      // If both fail, throw the most informative error
      const message = callableError?.message || httpError?.message || 'Failed to communicate with authentication service.'
      throw new Error(message)
    }
  }
}

/**
 * Step 1: Request Password Reset OTP
 * @param {string} email
 * @param {boolean} isResend
 */
export async function requestPasswordResetOtp(email, isResend = false) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail) {
    throw new Error('Please enter your registered email address.')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Please enter a valid email address (e.g. name@company.com).')
  }

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const data = await invokeFunction('requestPasswordResetOtp', {
    email: cleanEmail,
    isResend: Boolean(isResend),
    requestId,
  })

  if (data?.success === false) {
    throw new Error(data.error || 'Failed to send verification code. Please check your email and try again.')
  }

  return {
    success: true,
    message: data?.message || 'OTP sent successfully to your registered email address.',
    sessionId: data?.sessionId,
    maskedEmail: data?.maskedEmail || cleanEmail,
    expiresInSeconds: data?.expiresInSeconds ?? 300,
    resendCooldownSeconds: data?.resendCooldownSeconds ?? 60,
    resendCount: data?.resendCount ?? 0,
    maxResends: data?.maxResends ?? 5,
  }
}

/**
 * Step 2: Verify 6-digit OTP
 * @param {string} email
 * @param {string} otp
 * @param {string} sessionId
 */
export async function verifyPasswordResetOtp(email, otp, sessionId) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanOtp = String(otp || '').trim()

  if (!cleanEmail) {
    throw new Error('Email address is missing.')
  }
  if (!cleanOtp || cleanOtp.length !== 6) {
    throw new Error('Please enter the complete 6-digit verification code.')
  }
  if (!sessionId) {
    throw new Error('Session expired or invalid. Please request a new verification code.')
  }

  const data = await invokeFunction('verifyPasswordResetOtp', {
    email: cleanEmail,
    otp: cleanOtp,
    sessionId,
  })

  if (data?.success === false) {
    const error = new Error(data.error || 'Invalid verification code.')
    error.remainingAttempts = data.remainingAttempts
    throw error
  }

  return {
    success: true,
    message: data?.message || 'OTP verified successfully.',
    resetToken: data?.resetToken,
    sessionId: data?.sessionId || sessionId,
  }
}

/**
 * Step 3: Complete Password Reset
 * @param {string} email
 * @param {string} resetToken
 * @param {string} sessionId
 * @param {string} newPassword
 */
export async function completePasswordReset(email, resetToken, sessionId, newPassword) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPassword = String(newPassword || '').trim()

  if (!cleanEmail) {
    throw new Error('Email address is missing.')
  }
  if (!resetToken || !sessionId) {
    throw new Error('Reset authorization expired. Please restart the password reset process.')
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.')
  }

  const data = await invokeFunction('completePasswordReset', {
    email: cleanEmail,
    resetToken,
    sessionId,
    newPassword: cleanPassword,
  })

  if (data?.success === false) {
    throw new Error(data.error || 'Failed to update password. Please try again.')
  }

  return {
    success: true,
    message: data?.message || 'Password has been successfully updated. You can now log in with your new password.',
    authUpdated: Boolean(data?.authUpdated),
    firestoreUpdated: Boolean(data?.firestoreUpdated),
    updatedDocs: data?.updatedDocs ?? 0,
  }
}

/**
 * Evaluates password strength against security criteria matching mobile app guidelines
 * @param {string} password
 */
export function evaluatePasswordStrength(password = '') {
  const criteria = {
    minLength6: password.length >= 6,
    minLength8: password.length >= 8,
    hasLettersAndNumbers: /[a-zA-Z]/.test(password) && /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  }

  let score = 0
  if (criteria.minLength6) score += 1
  if (criteria.minLength8) score += 1
  if (criteria.hasLettersAndNumbers) score += 1
  if (criteria.hasSpecialChar) score += 1

  let label = 'Too Short'
  let color = 'bg-slate-200'
  let textColor = 'text-slate-400'

  if (password.length > 0) {
    if (score <= 1) {
      label = 'Weak'
      color = 'bg-rose-500'
      textColor = 'text-rose-600'
    } else if (score === 2 || score === 3) {
      label = 'Medium'
      color = 'bg-amber-500'
      textColor = 'text-amber-600'
    } else if (score >= 4) {
      label = 'Strong'
      color = 'bg-emerald-500'
      textColor = 'text-emerald-600'
    }
  }

  return {
    score,
    maxScore: 4,
    label,
    color,
    textColor,
    criteria,
    isValid: criteria.minLength6,
  }
}
