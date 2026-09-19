/**
 * Shared financial calculation utilities and formatting functions
 * Complies with ORGANIZATION_FINANCE_PAGE_SPECIFICATION.txt
 */

export function parseAmount(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]+/g, '').trim()
    if (!cleaned) return 0
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function amountValue(record, fields) {
  if (!record || !fields) return 0
  for (const field of fields) {
    const val = record[field]
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseAmount(val)
      if (parsed !== 0 || val === 0 || val === '0') {
        return parsed
      }
    }
  }
  return 0
}

export function matchesSite(record, site) {
  if (!record || !site) return false
  const siteKeys = [
    site.id,
    site.siteId,
    site.siteid,
    site.code,
    site.siteCode,
    site.projectId,
  ]
    .filter(Boolean)
    .map((k) => String(k).trim().toLowerCase())

  const siteNames = [
    site.siteName,
    site.sitename,
    site.projectName,
    site.name,
  ]
    .filter(Boolean)
    .map((n) => String(n).trim().toLowerCase())

  const recKeys = [
    record.id,
    record.siteId,
    record.siteid,
    record.code,
    record.siteCode,
    record.projectId,
    record.projectID,
  ]
    .filter(Boolean)
    .map((k) => String(k).trim().toLowerCase())

  const recNames = [
    record.siteName,
    record.sitename,
    record.projectName,
    record.name,
  ]
    .filter(Boolean)
    .map((n) => String(n).trim().toLowerCase())

  for (const sKey of siteKeys) {
    if (recKeys.includes(sKey)) return true
  }

  for (const sName of siteNames) {
    if (recNames.includes(sName)) return true
  }

  return false
}

export function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

export function compactMoney(amount) {
  if (!amount && amount !== 0) return '₹0'
  const val = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (val >= 10000000) {
    return `${sign}₹${(val / 10000000).toFixed(2)} Cr`
  }
  if (val >= 100000) {
    return `${sign}₹${(val / 100000).toFixed(2)} L`
  }
  if (val >= 1000) {
    return `${sign}₹${(val / 1000).toFixed(1)} K`
  }
  return money(amount)
}

export function formatDate(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

export function statusBadgeColor(status) {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'completed' || s === 'done' || s === 'finished') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (s === 'planning' || s === 'draft' || s === 'setup') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  if (s === 'hold' || s === 'paused' || s === 'pending' || s === 'on hold') {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (s === 'delay' || s === 'delayed' || s === 'overdue' || s === 'rejected') {
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }
  return 'bg-sky-50 text-sky-700 border-sky-200' // Live / In Progress
}
