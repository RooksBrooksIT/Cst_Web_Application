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
  if (!record) return false
  if (!site || site === 'all' || site?.id === 'all' || site?.siteId === 'all') return true

  const targetSiteObj = typeof site === 'string' ? { id: site, siteId: site } : site
  const targetId = String(targetSiteObj.id || targetSiteObj.siteId || targetSiteObj.siteid || targetSiteObj.siteCode || targetSiteObj.code || '').trim().toLowerCase()
  const targetName = String(targetSiteObj.projectName || targetSiteObj.siteName || targetSiteObj.name || '').trim().toLowerCase()
  const targetCode = String(targetSiteObj.siteCode || targetSiteObj.code || '').trim().toLowerCase()

  if (targetId === 'all') return true

  const recSiteId = String(record.siteId || record.rawSiteId || record.canonicalSiteKey || record.site_id || record.projectId || record.project_id || record.id || '').trim().toLowerCase()
  const recSiteName = String(record.siteName || record.site_name || record.projectName || record.project_name || record.name || '').trim().toLowerCase()
  const recSiteCode = String(record.siteCode || record.code || '').trim().toLowerCase()

  // 1. Direct exact matches
  if (targetId && (recSiteId === targetId || recSiteName === targetId)) return true
  if (targetName && (recSiteName === targetName || recSiteId === targetName)) return true
  if (targetCode && (recSiteCode === targetCode || recSiteId === targetCode)) return true

  // 2. Site code extraction (e.g. ST001)
  const extractCode = (s) => {
    const m = String(s || '').match(/st\d+/i)
    return m ? m[0].toLowerCase() : ''
  }
  const tCode = targetCode || extractCode(targetId) || extractCode(targetName)
  const rCode = recSiteCode || extractCode(recSiteId) || extractCode(recSiteName)
  if (tCode && rCode && tCode === rCode) return true

  // 3. Strip PR\d+_ prefix (e.g. PR001_ST001_Testing -> ST001_Testing)
  const stripPr = (s) => String(s || '').replace(/^pr\d+_/i, '').trim().toLowerCase()
  const strippedTarget = stripPr(targetId)
  const strippedRec = stripPr(recSiteId)
  if (strippedTarget && strippedRec && strippedTarget === strippedRec) return true

  // 4. Substring containment for compound IDs (ensure at least 4 chars to avoid false positives)
  if (strippedTarget && strippedRec && strippedTarget.length >= 4 && strippedRec.length >= 4) {
    if (strippedTarget.includes(strippedRec) || strippedRec.includes(strippedTarget)) return true
  }

  // 5. Normalized alphanumeric name match
  const normTargetName = targetName.replace(/[^a-z0-9]/g, '')
  const normRecName = recSiteName.replace(/[^a-z0-9]/g, '')
  if (normTargetName && normRecName && normTargetName === normRecName) return true

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

export function parseDateToTime(rawDate, docId = '') {
  if (!rawDate) {
    if (docId && docId.includes('_')) {
      const parts = docId.split('_')
      const lastPart = parts[parts.length - 1]
      if (/^\d{8}$/.test(lastPart)) {
        const d = parseInt(lastPart.slice(0, 2), 10)
        const m = parseInt(lastPart.slice(2, 4), 10) - 1
        const y = parseInt(lastPart.slice(4, 8), 10)
        return new Date(y, m, d).getTime()
      }
    }
    return 0
  }
  if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
    return rawDate.toDate().getTime()
  }
  if (rawDate instanceof Date) {
    return rawDate.getTime()
  }
  if (typeof rawDate === 'number') {
    return rawDate > 1e11 ? rawDate : rawDate * 1000
  }
  const parsed = new Date(rawDate)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

