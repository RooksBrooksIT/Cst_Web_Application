export default function StatusBadge({ status, type = 'status' }) {
  const norm = String(status || '').toLowerCase().replace(/[-_]/g, ' ').trim()

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200'

  if (['active', 'approved', 'cleared', 'completed', 'good', 'in progress', 'live', 'paid', 'in stock', 'settled and closed', 'received', 'float replenished'].includes(norm)) {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  } else if (['pending', 'planning', 'in transit', 'requested', 'maintenance required', 'pending manager review', 'pending manager approval', 'pending org approval', 'pending organization approval', 'pending manager clearance', 'dispatched', 'revision requested', 'revision required'].includes(norm)) {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200'
  } else if (['rejected', 'delayed', 'damaged', 'cancelled', 'on hold', 'hold', 'broken', 'rejected by manager', 'rejected by organization'].includes(norm)) {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200'
  } else if (['tier 1', 'tier 2', 'tier 3', 'superstructure', 'finishing', 'foundation', 'masons', 'carpenters', 'bar benders', 'awaiting disbursement', 'disbursed', 'awaiting receipt confirmation'].includes(norm)) {
    colorClasses = 'bg-blue-50 text-blue-700 border-blue-200'
  }

  const label = status ? String(status).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'N/A'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${colorClasses}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  )
}
