import Modal from '../../../components/common/Modal'
import { useState } from 'react'

export function ContactSupportModal({ isOpen, onClose, orgName, orgEmail }) {
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    name: orgName || '',
    email: orgEmail || '',
    phone: '',
    estimatedSites: '50+',
    message: 'We are interested in a dedicated enterprise deployment with custom SLA and white-label branding.',
  })

  function handleSubmit(e) {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      onClose()
    }, 2500)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contact Enterprise Sales & Support">
      {submitted ? (
        <div className="p-8 text-center space-y-3 animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
            ✓
          </div>
          <h3 className="text-base font-bold text-slate-900">Inquiry Received</h3>
          <p className="text-xs text-slate-500">
            Our Enterprise Solutions Director will contact you at <span className="font-semibold text-slate-700">{formData.email}</span> within 2 hours.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <p className="text-slate-500 leading-relaxed">
            Need customized project capacity, on-premise cloud infrastructure, white-label branding, or 24/7 dedicated support SLA?
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Contact Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Corporate Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Estimated Sites Capacity</label>
              <select
                value={formData.estimatedSites}
                onChange={(e) => setFormData({ ...formData, estimatedSites: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-blue-600 font-semibold"
              >
                <option value="25-50">25 to 50 Sites</option>
                <option value="50-100">50 to 100 Sites</option>
                <option value="100+">100+ Sites (Full Enterprise)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-semibold mb-1">Deployment Requirements</label>
            <textarea
              rows={3}
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none focus:border-blue-600"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-white font-bold bg-[#0B3470] hover:bg-blue-900 shadow-xs"
            >
              Submit Enterprise Request
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
