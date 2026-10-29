import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { readStoredSession } from './authService.js'

let cachedOrgName = ''
let cachedOrgId = ''

/**
 * Resolve the current active organization ID
 */
export function getActiveOrgId() {
  try {
    const session = readStoredSession()
    if (session?.orgId && session.orgId !== 'default_org') return session.orgId
    if (typeof localStorage !== 'undefined') {
      const pendingOrgId = localStorage.getItem('pending_org_id')
      if (pendingOrgId) return pendingOrgId
      const currentOrgId = localStorage.getItem('current_org_id') || localStorage.getItem('orgId')
      if (currentOrgId) return currentOrgId
    }
    if (session?.orgId) return session.orgId
  } catch (_e) {}
  return ''
}

/**
 * Manually set or update the cached organization name
 */
export function setCachedOrgName(orgName, orgId = '') {
  if (orgName) {
    cachedOrgName = String(orgName).trim()
    if (orgId) cachedOrgId = String(orgId).trim()
  }
}

/**
 * Get synchronously cached organization name or read from stored session
 */
export function getCachedOrgName() {
  if (cachedOrgName) return cachedOrgName
  try {
    const session = readStoredSession()
    const name = session?.userData?.orgName || session?.userData?.org_name || session?.userData?.companyName
    if (name) {
      cachedOrgName = String(name).trim()
      return cachedOrgName
    }
  } catch (_e) {}
  return ''
}

/**
 * Dynamically fetch orgName from Firestore document at /organisation/{orgId}/data/admin
 */
export async function fetchOrgNameFromFirestore(orgId = null) {
  const resolvedOrgId = orgId || getActiveOrgId()
  if (!resolvedOrgId) return getCachedOrgName()

  if (cachedOrgId === resolvedOrgId && cachedOrgName) {
    return cachedOrgName
  }

  try {
    if (db) {
      const adminRef = doc(db, 'organisation', resolvedOrgId, 'data', 'admin')
      const snap = await getDoc(adminRef)
      if (snap && typeof snap.exists === 'function' && snap.exists()) {
        const data = snap.data() || {}
        const fetchedName = data.orgName || data.org_name || data.companyName || data.organizationName || ''
        if (fetchedName) {
          cachedOrgName = String(fetchedName).trim()
          cachedOrgId = resolvedOrgId
          return cachedOrgName
        }
      }
    }
  } catch (err) {
    console.warn(`[exportService] Failed to fetch orgName from /organisation/${resolvedOrgId}/data/admin:`, err)
  }

  return getCachedOrgName()
}

/**
 * Export table data to CSV / Excel file, displaying the organization name in header metadata
 */
export function exportToCSV(filename, headers, rows, options = {}) {
  const sanitize = (val) => {
    if (val === null || val === undefined) return '""'
    const stringVal = String(val).replace(/"/g, '""')
    return `"${stringVal}"`
  }

  const resolvedOrgName = (typeof options === 'string' ? options : options?.orgName) || getCachedOrgName()

  const csvRows = []
  if (resolvedOrgName) {
    csvRows.push([`"Organization"`, `"${String(resolvedOrgName).replace(/"/g, '""')}"`].join(','))
    csvRows.push([`"Report"`, `"${String(filename || 'Report').replace(/"/g, '""')}"`].join(','))
    csvRows.push([`"Generated Date"`, `"${new Date().toLocaleString('en-IN')}"`].join(','))
    csvRows.push('') // Empty row separating metadata header from table data
  }

  if (headers && headers.length > 0) {
    csvRows.push(headers.map(sanitize).join(','))
  }

  rows.forEach((row) => {
    if (Array.isArray(row)) {
      csvRows.push(row.map(sanitize).join(','))
    } else if (typeof row === 'object') {
      csvRows.push(Object.values(row).map(sanitize).join(','))
    }
  })

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\r\n'))
  const downloadAnchor = document.createElement('a')
  downloadAnchor.setAttribute('href', csvContent)
  downloadAnchor.setAttribute('download', `${filename || 'ebricks_export'}_${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  document.body.removeChild(downloadAnchor)
}

/**
 * Trigger browser print dialog for an element with dynamic organization branding
 */
export function printReport(title, htmlContent, options = {}) {
  const resolvedOrgName = (typeof options === 'string' ? options : options?.orgName) || getCachedOrgName()
  const printWindow = window.open('', '_blank', 'width=900,height=650')
  if (!printWindow) return

  const escape = (str) => {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escape(title || 'eBricks Report')}${resolvedOrgName ? ` - ${escape(resolvedOrgName)}` : ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a; }
          .report-header-banner { border-bottom: 2px solid #0B3470; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .report-org-title { font-size: 20px; font-weight: 800; color: #0B3470; letter-spacing: -0.01em; margin: 0 0 4px 0; }
          .report-doc-title { color: #1e293b; font-size: 16px; margin: 0; font-weight: 700; }
          .report-meta { color: #64748b; font-size: 11px; margin-top: 4px; margin-bottom: 0; }
          .org-badge { display: inline-block; padding: 3px 9px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th { background: #f8fafc; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #e2e8f0; }
          td { padding: 8px 12px; border: 1px solid #e2e8f0; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; background: #e0f2fe; color: #0369a1; }
          .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; }
        </style>
      </head>
      <body>
        <div class="report-header-banner">
          <div>
            ${resolvedOrgName ? `<h2 class="report-org-title">${escape(resolvedOrgName)}</h2>` : ''}
            <h1 class="report-doc-title">${escape(title || 'eBricks Construction Suite Report')}</h1>
            <p class="report-meta">
              ${resolvedOrgName ? `<strong>Organization:</strong> ${escape(resolvedOrgName)} &nbsp;|&nbsp; ` : ''}
              Generated on ${new Date().toLocaleString('en-IN')}
            </p>
          </div>
          <div style="text-align: right;">
            ${resolvedOrgName ? `<div class="org-badge">${escape(resolvedOrgName)}</div>` : ''}
            <p class="report-meta" style="margin-top: 4px;">Verified Multi-Tenant Enterprise Audit</p>
          </div>
        </div>
        ${htmlContent}
        <div class="footer">
          <span>${resolvedOrgName ? `<strong>${escape(resolvedOrgName)}</strong> &bull; ` : ''}eBricks Construction Management System &copy; ${new Date().getFullYear()}</span>
          <span>Confidential Corporate Statement</span>
        </div>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 300)
}

