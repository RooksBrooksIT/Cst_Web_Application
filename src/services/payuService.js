/**
 * PayU Payment Gateway Integration & Cryptographic Hashing Service
 * Complies with SUBSCRIPTION_PLANS_AND_PAYMENT_FLOW_SPECIFICATION.txt
 */

export const PAYU_CONFIG = {
  environment:
    import.meta.env.VITE_PAYU_ENV ||
    import.meta.env.VITE_PAYU_ENVIRONMENT ||
    import.meta.env.PAYU_ENVIRONMENT ||
    'production',
  testPayUrl: import.meta.env.VITE_PAYU_TEST_PAY_URL || import.meta.env.PAYU_TEST_PAY_URL || 'https://test.payu.in/_payment',
  prodPayUrl: import.meta.env.VITE_PAYU_PROD_PAY_URL || import.meta.env.VITE_PAYU_PAY_URL || import.meta.env.PAYU_PROD_PAY_URL || 'https://secure.payu.in/_payment',
  testMerchantId: import.meta.env.VITE_PAYU_TEST_MERCHANT_ID || import.meta.env.PAYU_TEST_MERCHANT_ID || '9193759',
  testKey: import.meta.env.VITE_PAYU_TEST_KEY || import.meta.env.PAYU_TEST_KEY || 'GZrAha',
  testSalt: import.meta.env.VITE_PAYU_TEST_SALT || import.meta.env.PAYU_TEST_SALT || 'xpfwrDGBXY4sR5Y8O4xU8OB0seurgJMi',
  prodMerchantId: import.meta.env.VITE_PAYU_PROD_MERCHANT_ID || import.meta.env.VITE_PAYU_MERCHANT_ID || import.meta.env.PAYU_PROD_MERCHANT_ID || import.meta.env.PAYU_MERCHANT_ID || '13573851',
  prodKey: import.meta.env.VITE_PAYU_PROD_KEY || import.meta.env.VITE_PAYU_KEY || import.meta.env.PAYU_PROD_KEY || import.meta.env.PAYU_KEY || 'a912BZ',
  prodSalt: import.meta.env.VITE_PAYU_PROD_SALT || import.meta.env.VITE_PAYU_SALT || import.meta.env.PAYU_PROD_SALT || import.meta.env.PAYU_SALT || 'jgo9fpvFX8DO2QtQDaWJHvz4JByS8ytC',
  surl: import.meta.env.VITE_PAYU_SURL || import.meta.env.PAYU_SURL || 'https://us-central1-cst-whitelabel-app.cloudfunctions.net/payuWebhook',
  furl: import.meta.env.VITE_PAYU_FURL || import.meta.env.PAYU_FURL || 'https://us-central1-cst-whitelabel-app.cloudfunctions.net/payuWebhook',
}

/**
 * Generate native SHA-512 hash using Web Crypto API
 */
export async function sha512(str) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-512', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate PayU Request Hash
 * Formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
 */
export async function generatePayURequestHash({
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = 'ebricks',
  udf5 = 'ebricks_subscription',
  isProd = false,
}) {
  const key = isProd ? PAYU_CONFIG.prodKey : PAYU_CONFIG.testKey
  const salt = isProd ? PAYU_CONFIG.prodSalt : PAYU_CONFIG.testSalt
  const formattedAmount = Number(amount).toFixed(2)

  const hashString = `${key}|${txnid}|${formattedAmount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`
  const hash = await sha512(hashString)
  return { hash, key, hashString }
}

/**
 * Verify PayU Response Hash
 * Formula: sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export async function verifyPayUResponseHash({
  status,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = 'ebricks',
  udf5 = 'ebricks_subscription',
  responseHash,
  isProd = false,
}) {
  const key = isProd ? PAYU_CONFIG.prodKey : PAYU_CONFIG.testKey
  const salt = isProd ? PAYU_CONFIG.prodSalt : PAYU_CONFIG.testSalt
  const formattedAmount = Number(amount).toFixed(2)

  const verifyString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${formattedAmount}|${txnid}|${key}`
  const calculatedHash = await sha512(verifyString)
  return calculatedHash.toLowerCase() === String(responseHash || '').toLowerCase()
}

/**
 * Generate unique transaction ID
 */
export function generateTxnId(prefix = 'TXN') {
  return `${prefix}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`
}

/**
 * Dynamically load PayU Bolt Web SDK
 */
export function loadPayUBoltScript(isProd = true) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.bolt && typeof window.bolt.launch === 'function') {
      return resolve(window.bolt)
    }

    const scriptId = 'payu-bolt-sdk'
    const existing = document.getElementById(scriptId)
    if (existing) {
      if (window.bolt && typeof window.bolt.launch === 'function') {
        return resolve(window.bolt)
      }
      existing.remove()
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.type = 'text/javascript'
    script.src = isProd
      ? 'https://jssdk.payu.in/bolt/bolt.min.js'
      : 'https://jssdk-uat.payu.in/bolt/bolt.min.js'
    script.async = true
    script.onload = () => {
      if (window.bolt && typeof window.bolt.launch === 'function') {
        resolve(window.bolt)
      } else {
        setTimeout(() => {
          if (window.bolt && typeof window.bolt.launch === 'function') {
            resolve(window.bolt)
          } else {
            reject(new Error('PayU Bolt SDK loaded but bolt.launch is unavailable'))
          }
        }, 150)
      }
    }
    script.onerror = (err) => {
      reject(new Error('Failed to load PayU Bolt script: ' + (err?.message || 'Network error')))
    }
    document.body.appendChild(script)
  })
}

/**
 * Launch PayU in-page payment gateway modal
 */
export async function launchPayUBoltPayment({
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  phone = '9999999999',
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = 'ebricks',
  udf5 = 'ebricks_subscription',
  surl = '',
  furl = '',
  isProd = true,
  onSuccess,
  onCancel,
  onError,
}) {
  const bolt = await loadPayUBoltScript(isProd)

  const { hash, key } = await generatePayURequestHash({
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    isProd,
  })

  const formattedAmount = Number(amount).toFixed(2)
  const defaultSurl = surl || PAYU_CONFIG.surl || `${window.location.origin}/organization/subscription`
  const defaultFurl = furl || PAYU_CONFIG.furl || `${window.location.origin}/organization/subscription`

  const boltData = {
    key,
    txnid,
    hash,
    amount: formattedAmount,
    firstname: (firstname || 'Admin').trim(),
    email: (email || 'admin@construction.com').trim(),
    phone: (phone || '9999999999').trim(),
    productinfo: (productinfo || 'eBricks Plan').trim(),
    surl: defaultSurl,
    furl: defaultFurl,
    mode: 'dropout',
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
  }

  bolt.launch(boltData, {
    responseHandler: (response) => {
      const res = response?.response || response || {}
      const txnStatus = (res.txnStatus || res.status || '').toUpperCase()

      if (txnStatus === 'SUCCESS') {
        onSuccess && onSuccess(res)
      } else if (txnStatus === 'CANCEL') {
        onCancel && onCancel(res)
      } else {
        onError && onError(new Error(res.error_Message || res.errorMessage || 'Transaction was not completed'))
      }
    },
    catchException: (exception) => {
      const msg = exception?.message || 'Error communicating with PayU payment gateway'
      onError && onError(new Error(msg))
    },
  })
}

