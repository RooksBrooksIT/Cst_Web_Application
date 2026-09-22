import React, { useState, useEffect, useMemo } from 'react'
import {
  Truck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Printer,
  FileCheck,
  Building2,
  Phone,
  Calendar,
  X,
  ShieldCheck,
  Boxes,
} from 'lucide-react'
import {
  fetchMaterialMovements,
  createMaterialMovement,
  confirmMaterialMovementReceipt,
  fetchMaterials,
} from '../../../services/materialService.js'

export default function MaterialsMovements({ orgId, sites = [], currentUser, onNotify }) {
  const [movements, setMovements] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'In Transit' | 'Received'

  // Gate Pass Form Modal
  const [showModal, setShowModal] = useState(false)
  const [formFromSite, setFormFromSite] = useState('Central Yard / Main Godown')
  const [formToSite, setFormToSite] = useState('')
  const [formMaterialId, setFormMaterialId] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formTransporter, setFormTransporter] = useState('')
  const [formVehicle, setFormVehicle] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Gate Pass Preview / Print Modal
  const [printPassDoc, setPrintPassDoc] = useState(null)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [moves, mats] = await Promise.all([
        fetchMaterialMovements(orgId),
        fetchMaterials(orgId),
      ])
      setMovements(moves || [])
      setMaterials(mats || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load material dispatches', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  const handleCreateMovement = async (e) => {
    e.preventDefault()
    if (!orgId) return
    if (!formToSite || !formMaterialId || !formQty) {
      onNotify?.('Please complete required dispatch parameters', 'error')
      return
    }

    setSubmitting(true)
    try {
      const mat = materials.find((m) => (m.id || m.materialId) === formMaterialId)
      await createMaterialMovement(
        orgId,
        {
          fromSite: formFromSite,
          toSite: formToSite,
          materialId: formMaterialId,
          materialName: mat?.materialName || mat?.name || 'Construction Material',
          quantity: Number(formQty) || 1,
          unit: mat?.unitName || mat?.unit || 'Units',
          transporterName: formTransporter,
          vehicleNumber: formVehicle,
          driverPhone: formPhone,
        },
        currentUser
      )

      onNotify?.('Inter-site Gate Pass issued and material dispatched!', 'success')
      setShowModal(false)
      setFormQty('')
      setFormTransporter('')
      setFormVehicle('')
      setFormPhone('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to issue gate pass', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmReceipt = async (movementId) => {
    if (!orgId || !movementId) return
    try {
      await confirmMaterialMovementReceipt(orgId, movementId, currentUser)
      onNotify?.('Material shipment marked as safely received at destination site', 'success')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to confirm receipt', 'error')
    }
  }

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matName = (m.materialName || '').toLowerCase()
      const gp = (m.gatePassNumber || '').toLowerCase()
      const toSite = (m.toSite || '').toLowerCase()
      const matchesSearch = matName.includes(searchQuery.toLowerCase()) || gp.includes(searchQuery.toLowerCase()) || toSite.includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || m.receivedStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [movements, searchQuery, statusFilter])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
              Logistics & Transit
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inter-Site Material Gate Passes</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track material transfers across warehouses and sites with delivery challans and destination receipt sign-offs.
          </p>
        </div>

        <button
          onClick={() => {
            if (sites.length > 0 && !formToSite) setFormToSite(sites[0].siteName || sites[0].projectName)
            if (materials.length > 0 && !formMaterialId) setFormMaterialId(materials[0].id || materials[0].materialId)
            setShowModal(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0B3470] hover:bg-[#082855] text-white text-sm font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Issue Dispatch Gate Pass</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by gate pass #, material, site..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Dispatches ({movements.length})</option>
            <option value="In Transit">In Transit</option>
            <option value="Received">Received / Delivered</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      {loading && movements.length === 0 ? (
        <div className="py-20 text-center text-slate-400">Loading material dispatches...</div>
      ) : filteredMovements.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
          <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No material movements recorded</p>
          <p className="text-xs text-slate-400 mt-1">
            Click "Issue Dispatch Gate Pass" to authorize shipment between central godowns and project sites.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Gate Pass #</th>
                  <th className="py-3.5 px-4">Dispatched Material</th>
                  <th className="py-3.5 px-4">Route (From → To)</th>
                  <th className="py-3.5 px-4">Vehicle & Driver</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredMovements.map((item) => {
                  const isInTransit = item.receivedStatus === 'In Transit'
                  const dispatchDate = item.dispatchDate?.seconds
                    ? new Date(item.dispatchDate.seconds * 1000).toLocaleDateString()
                    : 'Today'

                  return (
                    <tr key={item.id || item.movementId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-900 text-xs">
                        {item.gatePassNumber || item.movementId}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <Boxes className="w-4 h-4 text-teal-600" />
                          <div>
                            <p className="font-semibold text-slate-900 leading-snug">{item.materialName}</p>
                            <p className="text-xs text-slate-500 font-bold">
                              {item.quantity} {item.unit || 'Units'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <p className="text-slate-500 font-medium">From: {item.fromSite}</p>
                        <p className="font-bold text-slate-900 mt-0.5">To: {item.toSite}</p>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800">{item.vehicleNumber || 'Site Truck'}</p>
                          <p className="text-slate-400">
                            {item.transporterName || 'Fleet'} {item.driverPhone && `• ${item.driverPhone}`}
                          </p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isInTransit
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isInTransit ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                            }`}
                          />
                          {item.receivedStatus || 'In Transit'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setPrintPassDoc(item)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Print / View Gate Pass"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {isInTransit && (
                            <button
                              onClick={() => handleConfirmReceipt(item.id || item.movementId)}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                              title="Acknowledge Delivery"
                            >
                              Confirm Receipt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issue Gate Pass Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Issue Inter-Site Gate Pass</h3>
                <p className="text-xs text-slate-500">Authorize transport dispatch from warehouse to site.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMovement} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Dispatch From *
                  </label>
                  <input
                    type="text"
                    value={formFromSite}
                    onChange={(e) => setFormFromSite(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Destination Site *
                  </label>
                  <select
                    required
                    value={formToSite}
                    onChange={(e) => setFormToSite(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select Destination Site...</option>
                    {sites.map((s) => {
                      const name = s.siteName || s.projectName
                      return (
                        <option key={s.id} value={name}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Select Material *
                  </label>
                  <select
                    required
                    value={formMaterialId}
                    onChange={(e) => setFormMaterialId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select Material...</option>
                    {materials.map((m) => (
                      <option key={m.id || m.materialId} value={m.id || m.materialId}>
                        {m.materialName || m.name} ({m.unitName || m.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={formVehicle}
                    onChange={(e) => setFormVehicle(e.target.value)}
                    placeholder="e.g. KA-01-EA-5542"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Driver Phone
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+91 98450 XXXXX"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Transporter / Logistics Carrier
                </label>
                <input
                  type="text"
                  value={formTransporter}
                  onChange={(e) => setFormTransporter(e.target.value)}
                  placeholder="e.g. Navata Road Transport / Internal Fleet"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Issuing...' : 'Issue Gate Pass & Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Delivery Gate Pass View */}
      {printPassDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-slate-300 print:m-0 print:border-none">
            {/* Gate Pass Header */}
            <div className="border-b-2 border-slate-900 pb-4 mb-5 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4" />
                  <span>CST Enterprise Logistics</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">MATERIAL DELIVERY GATE PASS</h2>
                <p className="text-xs text-slate-500 font-mono">
                  Pass No: {printPassDoc.gatePassNumber || printPassDoc.movementId}
                </p>
              </div>
              <button
                onClick={() => setPrintPassDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-600 print:hidden"
              >
                ✕
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Dispatch Origin</p>
                  <p className="font-bold text-slate-900 mt-0.5">{printPassDoc.fromSite}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Destination Site</p>
                  <p className="font-bold text-slate-900 mt-0.5">{printPassDoc.toSite}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-[11px] font-bold text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Item Description</th>
                      <th className="py-2 px-3 text-right">Quantity Dispatched</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3 px-3 font-semibold text-slate-900">{printPassDoc.materialName}</td>
                      <td className="py-3 px-3 text-right font-black text-slate-900">
                        {printPassDoc.quantity} {printPassDoc.unit}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="text-slate-400 text-[11px]">Vehicle:</span>{' '}
                  <span className="font-bold text-slate-800">{printPassDoc.vehicleNumber || 'Site Fleet'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Driver Phone:</span>{' '}
                  <span className="font-bold text-slate-800">{printPassDoc.driverPhone || 'N/A'}</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200">
                <div className="text-center border-t border-dashed border-slate-300 pt-2">
                  <p className="font-semibold text-slate-800">Dispatched By</p>
                  <p className="text-[10px] text-slate-400">{printPassDoc.dispatchedBy || 'Store Incharge'}</p>
                </div>
                <div className="text-center border-t border-dashed border-slate-300 pt-2">
                  <p className="font-semibold text-slate-800">Receiver Site Sign</p>
                  <p className="text-[10px] text-slate-400">Site Supervisor Signature</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Gate Pass</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
