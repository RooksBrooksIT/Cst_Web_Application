import React, { useState } from 'react'
import {
  HelpCircle,
  MessageSquare,
  Phone,
  Mail,
  FileQuestion,
  ExternalLink,
  Send,
  CheckCircle2,
  BookOpen,
  Headphones,
} from 'lucide-react'

export default function ManagerSupportHub({ orgId, currentUser, onNotify }) {
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('Technical Issue')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ticketSent, setTicketSent] = useState(false)

  const handleSubmitTicket = (e) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return

    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setTicketSent(true)
      onNotify?.('Helpdesk ticket logged. Dedicated support engineer assigned.', 'success')
      setSubject('')
      setMessage('')
    }, 600)
  }

  const faqs = [
    {
      q: 'How do I approve mobile supervisor daily log expense claims?',
      a: 'Navigate to "Approvals Center" in the sidebar. Switch to the "Supervisor Daily Entries" tab. You can review the attached materials, labour counts, and site sundries before approving or requesting revision.',
    },
    {
      q: 'How does cumulative site expenditure update?',
      a: 'Whenever an Operations Manager posts a direct expense, or approves a site supervisor daily entry, our system automatically recalculates the total spent amount and synchronizes it directly with the project master document in Firestore.',
    },
    {
      q: 'Can supervisors view each other’s projects?',
      a: 'No. Supervisors are restricted by the Site-Supervisor mapping module. They only have read and write permissions for the project sites mapped directly to their supervisor ID.',
    },
    {
      q: 'How do inter-site material gate passes work?',
      a: 'When transferring cement, steel, or aggregate between sites or from the central yard, issue a Dispatch Gate Pass under "Supply Chain → Gate Passes". The destination site supervisor can then acknowledge safe receipt directly from their terminal.',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
              Enterprise Assistance
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manager Support</h1>
          <p className="text-sm text-slate-500 mt-1">
            Access CST construction workflows documentation, standard operating procedures, and 24/7 technical help.
          </p>
        </div>
      </div>

      {/* Quick Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Emergency Field Hotline</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">+91 8000 123 456</p>
            <p className="text-[11px] text-emerald-600 font-medium">Available 24/7 for active pours</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Enterprise Email Desk</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">support@cstcivil.com</p>
            <p className="text-[11px] text-slate-500">Response within 2 hours</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase">Field Operations Manual</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">SOP v4.2 Document</p>
            <p className="text-[11px] text-blue-600 font-medium">Download PDF Guide</p>
          </div>
        </div>
      </div>

      {/* Grid: Support Form + FAQs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Support Ticket Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <MessageSquare className="w-4 h-4 text-[#0B3470]" />
            <h2 className="text-base font-bold text-slate-900">Submit Technical Support Ticket</h2>
          </div>

          {ticketSent && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-800 font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Ticket successfully registered!</p>
                <p className="mt-0.5">Reference ID #TK-{Date.now().toString().slice(-6)}. Our support engineers are inspecting the issue.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmitTicket} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Issue Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="Technical Issue">Technical / Sync Error</option>
                <option value="Daily Log Revision">Daily Entry / Financial Reversal</option>
                <option value="Mobile App Access">Supervisor Mobile Terminal Setup</option>
                <option value="Billing & Milestone">Contractor Measurement Dispute</option>
                <option value="General Query">General Enterprise Inquiry</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Subject / Issue Summary *
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Cannot map supervisor to Green Valley Site"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Detailed Description *
              </label>
              <textarea
                rows="4"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Provide steps to reproduce, site name, error codes, or screenshots..."
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Submitting...' : 'Dispatch Ticket to HQ'}</span>
            </button>
          </form>
        </div>

        {/* FAQs */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileQuestion className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Frequently Answered Protocols</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                <h3 className="text-xs font-bold text-slate-900">{faq.q}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
