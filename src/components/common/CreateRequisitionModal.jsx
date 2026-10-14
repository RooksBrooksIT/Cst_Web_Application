import { useState, useMemo } from 'react'
import Modal from './Modal'
import {
  createMaterialRequisition,
  createToolRequisition,
  createSitePaymentRequisition,
} from '../../services/approvalService'
import { Package, Wrench, DollarSign, Send } from 'lucide-react'
import { getNormalizedSiteOptions } from '../../utils/siteUtils.js'

export default function CreateRequisitionModal({
  isOpen,
  onClose,
  orgId,
  currentUser,
  sites = [],
  onSuccess,
}) {
  const [requestType, setRequestType] = useState('material') // 'material' | 'tool' | 'payment'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const siteOptions = useMemo(() => getNormalizedSiteOptions(sites), [sites])

  // Form Fields
  const [siteId, setSiteId] = useState(siteOptions[0]?.id || sites[0]?.id || '')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('Bags')
  const [category, setCategory] = useState('')
  const [urgency, setUrgency] = useState('Normal')
  const [amount, setAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [neededDate, setNeededDate] = useState('')
  const [preferredVendor, setPreferredVendor] = useState('')

  if (!isOpen) return null

  const selectedSite = siteOptions.find((s) => s.id === siteId || s.siteId === siteId) || sites.find((s) => s.id === siteId) || siteOptions[0] || sites[0]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const effectiveSiteId = siteId || selectedSite?.id
    if (!effectiveSiteId) {
      setError('Please select a project site.')
      return
    }

    if (requestType === 'material') {
      if (!name.trim()) {
        setError('Please enter material name.')
        return
      }
      if (Number(quantity) <= 0) {
        setError('Please enter a valid quantity greater than 0.')
        return
      }
    } else if (requestType === 'tool') {
      if (!name.trim()) {
        setError('Please enter equipment / tool name.')
        return
      }
      if (Number(quantity) <= 0) {
        setError('Please enter a valid quantity greater than 0.')
        return
      }
    } else if (requestType === 'payment') {
      if (!amount || Number(amount) <= 0) {
        setError('Please enter a valid claim amount.')
        return
      }
    }

    setSubmitting(true)
    try {
      const actor = {
        uid: currentUser?.uid || 'web_user',
        id: currentUser?.uid || 'web_user',
        name: currentUser?.displayName || currentUser?.fullName || currentUser?.name || 'Operations Lead',
        role: currentUser?.role || 'Manager',
      }

      if (requestType === 'material') {
        await createMaterialRequisition(
          orgId,
          {
            siteId: effectiveSiteId,
            siteName: selectedSite?.name || selectedSite?.projectName || 'Site',
            siteCode: selectedSite?.siteCode || '',
            materialName: name.trim(),
            category: category || 'General Civil',
            requestedQty: Number(quantity) || 1,
            unit: unit || 'Units',
            urgency,
            neededByDate: neededDate ? new Date(neededDate) : null,
            preferredVendor,
            remarks: remarks.trim(),
          },
          actor
        )
      } else if (requestType === 'tool') {
        await createToolRequisition(
          orgId,
          {
            siteId: effectiveSiteId,
            siteName: selectedSite?.name || selectedSite?.projectName || 'Site',
            toolName: name.trim(),
            category: category || 'Equipment',
            quantity: Number(quantity) || 1,
            urgency,
            purpose: remarks.trim(),
          },
          actor
        )
      } else if (requestType === 'payment') {
        await createSitePaymentRequisition(
          orgId,
          {
            siteId: effectiveSiteId,
            siteName: selectedSite?.name || selectedSite?.projectName || 'Site',
            totalAmount: Number(amount),
            category: category || 'Site Operational Expense',
            remarks: remarks.trim(),
            description: name.trim() || remarks.trim(),
          },
          actor
        )
      }

      onSuccess?.('Request created successfully! Live tracking initiated.')
      onClose()
      // Reset
      setName('')
      setQuantity('1')
      setAmount('')
      setRemarks('')
    } catch (err) {
      setError(err.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Request">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Stream Selector */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setRequestType('material')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              requestType === 'material' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Material Indent</span>
          </button>
          <button
            type="button"
            onClick={() => setRequestType('tool')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              requestType === 'tool' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Equipment / Tool</span>
          </button>
          <button
            type="button"
            onClick={() => setRequestType('payment')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              requestType === 'payment' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Expense Claim</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
            ⚠️ {error}
          </div>
        )}

        {/* Site Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Target Construction Site *</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            required
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
          >
            {siteOptions.map((s, idx) => (
              <option key={`req-site-${s.id || s.siteId || idx}-${idx}`} value={s.id || s.siteId}>
                {s.label || s.siteName || s.projectName || s.name || s.id}
              </option>
            ))}
          </select>
        </div>

        {/* Material & Tool Fields */}
        {(requestType === 'material' || requestType === 'tool') && (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {requestType === 'material' ? 'Material Description *' : 'Equipment / Tool Name *'}
              </label>
              <input
                type="text"
                placeholder={requestType === 'material' ? 'e.g. OPC Cement Grade 53' : 'e.g. Hydraulic Concrete Mixer'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Quantity Requested *</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {requestType === 'material' ? 'Unit' : 'Urgency'}
                </label>
                {requestType === 'material' ? (
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                  >
                    <option value="Bags">Bags</option>
                    <option value="Tons">Tons</option>
                    <option value="Cubic Meters">Cubic Meters (m³)</option>
                    <option value="Kilograms">Kilograms (kg)</option>
                    <option value="Units">Units / Pcs</option>
                    <option value="Litres">Litres</option>
                  </select>
                ) : (
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                  >
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Critical">Critical</option>
                  </select>
                )}
              </div>
            </div>

            {requestType === 'material' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Needed By Date</label>
                    <input
                      type="date"
                      value={neededDate}
                      onChange={(e) => setNeededDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Urgency</label>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                    >
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <input
                      type="text"
                      placeholder="e.g. Civil / Masonry / Steel"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Vendor</label>
                    <input
                      type="text"
                      placeholder="e.g. Ultratech / Tata Steel"
                      value={preferredVendor}
                      onChange={(e) => setPreferredVendor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Payment Fields */}
        {requestType === 'payment' && (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expense Title / Vendor *</label>
              <input
                type="text"
                placeholder="e.g. Generator Diesel & Fuel Reimbursement"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Total Claim Amount (₹) *</label>
              <input
                type="number"
                min="1"
                placeholder="Amount in INR"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white font-mono"
              />
            </div>
          </>
        )}

        {/* Remarks / Justification */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Site Requirement Remarks</label>
          <textarea
            rows="2"
            placeholder="Operational purpose or justification for request..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? 'Submitting...' : 'Submit Request'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}

export { CreateRequisitionModal as CreateRequestModal }

