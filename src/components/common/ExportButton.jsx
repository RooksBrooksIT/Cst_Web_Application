import { useState } from 'react'
import { exportToCSV, printReport } from '../../services/exportService'

export default function ExportButton({ filename = 'report', headers = [], data = [], title = 'Report' }) {
  const [open, setOpen] = useState(false)

  function handleCSV() {
    exportToCSV(filename, headers, data)
    setOpen(false)
  }

  function handlePrint() {
    let tableHtml = '<table><thead><tr>'
    headers.forEach((h) => {
      tableHtml += `<th>${h}</th>`
    })
    tableHtml += '</tr></thead><tbody>'

    data.forEach((row) => {
      tableHtml += '<tr>'
      if (Array.isArray(row)) {
        row.forEach((cell) => {
          tableHtml += `<td>${cell}</td>`
        })
      } else if (typeof row === 'object') {
        Object.values(row).forEach((cell) => {
          tableHtml += `<td>${cell}</td>`
        })
      }
      tableHtml += '</tr>'
    })
    tableHtml += '</tbody></table>'

    printReport(title, tableHtml)
    setOpen(false)
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
      >
        <span>↓ Export</span>
        <span className="text-[10px]">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-40 rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-50 animate-fade-in">
          <button
            type="button"
            onClick={handleCSV}
            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
          >
            <span>📄</span> Export to CSV / Excel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
          >
            <span>🖨</span> Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  )
}
