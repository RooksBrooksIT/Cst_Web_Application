/**
 * PayU Payment Gateway Integration & Cryptographic Hashing Service
 * Complies with SUBSCRIPTION_PLANS_AND_PAYMENT_FLOW_SPECIFICATION.txt
 */

export const PAYU_CONFIG = {
  environment: import.meta.env.VITE_PAYU_ENV || 'sandbox',
  testPayUrl: 'https://test.payu.in/_payment',
  prodPayUrl: 'https://secure.payu.in/_payment',
  testMerchantId: '9193759',
  testKey: 'GZrAha',
  testSalt: 'xpfwrDGBXY4sR5Y8O4xU8OB0seurgJMi',
  prodMerchantId: '13573851',
  prodKey: 'a912BZ',
  prodSalt: 'jgo9fpvFX8DO2QtQDaWJHvz4JByS8ytC',
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
