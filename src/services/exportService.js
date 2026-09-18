/**
 * Export table data to CSV file
 */
export function exportToCSV(filename, headers, rows) {
  const sanitize = (val) => {
    if (val === null || val === undefined) return '""'
    const stringVal = String(val).replace(/"/g, '""')
    return `"${stringVal}"`
  }

  const csvRows = []
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
 * Trigger browser print dialog for an element
 */
export function printReport(title, htmlContent) {
  const printWindow = window.open('', '_blank', 'width=900,height=650')
  if (!printWindow) return

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title || 'eBricks Report'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { color: #0B3470; font-size: 20px; margin-bottom: 4px; }
          p.meta { color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th { background: #f8fafc; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #e2e8f0; }
          td { padding: 8px 12px; border: 1px solid #e2e8f0; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; background: #e0f2fe; color: #0369a1; }
          .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <h1>${title || 'eBricks Construction Suite Report'}</h1>
        <p class="meta">Generated on ${new Date().toLocaleString('en-IN')} | Verified Multi-Tenant Enterprise Audit</p>
        ${htmlContent}
        <div class="footer">
          eBricks Construction Management System &copy; ${new Date().getFullYear()} — Confidential Corporate Statement
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
