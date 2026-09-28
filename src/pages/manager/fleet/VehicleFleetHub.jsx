import React, { useState, useEffect, useMemo } from 'react'
import {
  Truck,
  UserCheck,
  Fuel,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Calendar,
  Gauge,
  FileText,
  AlertTriangle,
  Building2,
  Phone,
  CreditCard,
  X,
  Sparkles,
  Table,
  LayoutGrid,
} from 'lucide-react'
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchDrivers,
  createDriver,
  deleteDriver,
  fetchVehicleLogs,
  recordVehicleTripLog,
  VEHICLE_TYPES,
} from '../../../services/fleetService.js'

export default function VehicleFleetHub({ orgId, sites = [], currentUser, onNotify }) {
  const [activeTab, setActiveTab] = useState('vehicles') // 'vehicles' | 'drivers' | 'logs'
  const [viewMode, setViewMode] = useState('table') // 'table' | 'cards'
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Vehicle Modal State
  const [showVehicleModal, setShowVehicleModal] = useState(false)
  const [formPlate, setFormPlate] = useState('')
  const [formModel, setFormModel] = useState('')
  const [formType, setFormType] = useState(VEHICLE_TYPES[0])
  const [formStatus, setFormStatus] = useState('Active')
  const [formOdo, setFormOdo] = useState('')
  const [formAssignedDriver, setFormAssignedDriver] = useState('')
  const [submittingVehicle, setSubmittingVehicle] = useState(false)

  // Driver Modal State
  const [showDriverModal, setShowDriverModal] = useState(false)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [driverLicense, setDriverLicense] = useState('')
  const [driverAssignedPlate, setDriverAssignedPlate] = useState('')
  const [submittingDriver, setSubmittingDriver] = useState(false)

  // Trip & Fuel Log Modal State
  const [showLogModal, setShowLogModal] = useState(false)
  const [logVehicle, setLogVehicle] = useState('')
  const [logDriver, setLogDriver] = useState('')
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [logStartKm, setLogStartKm] = useState('')
  const [logEndKm, setLogEndKm] = useState('')
  const [logDieselLiters, setLogDieselLiters] = useState('')
  const [logDieselCost, setLogDieselCost] = useState('')
  const [logRouteFrom, setLogRouteFrom] = useState('')
  const [logRouteTo, setLogRouteTo] = useState('')
  const [logMaterials, setLogMaterials] = useState('')
  const [submittingLog, setSubmittingLog] = useState(false)

  const loadData = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [vehs, drvs, lgs] = await Promise.all([
        fetchVehicles(orgId),
        fetchDrivers(orgId),
        fetchVehicleLogs(orgId),
      ])
      setVehicles(vehs || [])
      setDrivers(drvs || [])
      setLogs(lgs || [])
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load fleet data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [orgId])

  // Vehicle Submit
  const handleSubmitVehicle = async (e) => {
    e.preventDefault()
    if (!orgId || !formPlate.trim()) return

    setSubmittingVehicle(true)
    try {
      await createVehicle(orgId, {
        numberPlate: formPlate.trim().toUpperCase(),
        modelName: formModel.trim(),
        vehicleType: formType,
        status: formStatus,
        currentOdometer: Number(formOdo) || 0,
        assignedDriverName: formAssignedDriver,
      })

      onNotify?.('Vehicle registered to fleet!', 'success')
      setShowVehicleModal(false)
      setFormPlate('')
      setFormModel('')
      setFormOdo('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to add vehicle', 'error')
    } finally {
      setSubmittingVehicle(false)
    }
  }

  const handleDeleteVehicle = async (id) => {
    if (!orgId || !id) return
    if (!window.confirm('Delete vehicle from fleet?')) return
    try {
      await deleteVehicle(orgId, id)
      onNotify?.('Vehicle deleted', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete vehicle', 'error')
    }
  }

  // Driver Submit
  const handleSubmitDriver = async (e) => {
    e.preventDefault()
    if (!orgId || !driverName.trim()) return

    setSubmittingDriver(true)
    try {
      await createDriver(orgId, {
        driverName: driverName.trim(),
        phone: driverPhone.trim(),
        licenseNumber: driverLicense.trim().toUpperCase(),
        assignedVehicleNumber: driverAssignedPlate,
      })

      onNotify?.('Driver added to fleet roster!', 'success')
      setShowDriverModal(false)
      setDriverName('')
      setDriverPhone('')
      setDriverLicense('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to add driver', 'error')
    } finally {
      setSubmittingDriver(false)
    }
  }

  const handleDeleteDriver = async (id) => {
    if (!orgId || !id) return
    if (!window.confirm('Remove driver from fleet?')) return
    try {
      await deleteDriver(orgId, id)
      onNotify?.('Driver removed', 'info')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to delete driver', 'error')
    }
  }

  // Log Submit
  const handleSubmitLog = async (e) => {
    e.preventDefault()
    if (!orgId || !logVehicle) return

    setSubmittingLog(true)
    try {
      await recordVehicleTripLog(
        orgId,
        {
          vehicleNumber: logVehicle,
          driverName: logDriver,
          date: logDate,
          startingOdometer: Number(logStartKm) || 0,
          endingOdometer: Number(logEndKm) || 0,
          dieselLiters: Number(logDieselLiters) || 0,
          dieselCost: Number(logDieselCost) || 0,
          fromSite: logRouteFrom,
          toSite: logRouteTo,
          materialsTransported: logMaterials,
        },
        currentUser
      )

      onNotify?.('Trip & Fuel log recorded and odometer updated!', 'success')
      setShowLogModal(false)
      setLogStartKm('')
      setLogEndKm('')
      setLogDieselLiters('')
      setLogDieselCost('')
      setLogMaterials('')
      await loadData()
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to log trip', 'error')
    } finally {
      setSubmittingLog(false)
    }
  }

  const totalDieselExpense = useMemo(() => {
    return logs.reduce((acc, l) => acc + (Number(l.dieselCost) || 0), 0)
  }, [logs])

  const totalDieselLiters = useMemo(() => {
    return logs.reduce((acc, l) => acc + (Number(l.dieselLiters) || 0), 0)
  }, [logs])

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
              Fleet Logistics
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vehicle Fleet</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage heavy vehicles, tippers, transit mixers, licensed drivers, and diesel consumption trip logs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'vehicles' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className={`w-4 h-4 ${activeTab === 'vehicles' ? 'text-white' : 'text-slate-500'}`} />
            <span>Vehicles ({vehicles.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('drivers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'drivers' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className={`w-4 h-4 ${activeTab === 'drivers' ? 'text-white' : 'text-slate-500'}`} />
            <span>Drivers ({drivers.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'logs' ? 'bg-[#0B3470] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Fuel className={`w-4 h-4 ${activeTab === 'logs' ? 'text-white' : 'text-slate-500'}`} />
            <span>Trip & Fuel Logs ({logs.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fleet Strength</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{vehicles.length} Vehicles</p>
          <p className="text-xs text-blue-600 font-medium mt-1">
            {vehicles.filter((v) => v.status === 'Active').length} Active on site
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Diesel Consumed</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalDieselLiters.toLocaleString()} L</p>
          <p className="text-xs text-amber-700 font-medium mt-1">₹{totalDieselExpense.toLocaleString('en-IN')} total spent</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Drivers on Duty</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{drivers.length} Licensed Drivers</p>
          <p className="text-xs text-emerald-600 font-medium mt-1">Verified heavy commercial licenses</p>
        </div>
      </div>

      {/* TAB 0: VEHICLES FLEET */}
      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap justify-between items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">Fleet Inventory</span>
            
            <div className="flex items-center gap-3">
              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Table View"
                >
                  <Table className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Cards View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>

              <button
                onClick={() => {
                  if (drivers.length > 0 && !formAssignedDriver) setFormAssignedDriver(drivers[0].driverName || drivers[0].name)
                  setShowVehicleModal(true)
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register Vehicle</span>
              </button>
            </div>
          </div>

          {loading && vehicles.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading fleet...</div>
          ) : vehicles.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Truck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No vehicles registered</p>
              <p className="text-xs text-slate-400 mt-1">Click "Register Vehicle" to add tippers, mixers, or pickup trucks.</p>
            </div>
          ) : viewMode === 'table' ? (
            /* VEHICLES TABLE FORMAT */
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Registration & Vehicle</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Assigned Driver</th>
                      <th className="py-3.5 px-4">Current Odometer</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {vehicles.map((v) => (
                      <tr key={v.id || v.vehicleId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
                              <Truck className="w-4 h-4" />
                            </div>
                            <div>
                              <strong className="block font-bold text-slate-900 text-sm">
                                {v.numberPlate || v.registrationNumber}
                              </strong>
                              <span className="text-[11px] text-slate-400">{v.modelName || 'Commercial Vehicle'}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 uppercase tracking-wider">
                            {v.vehicleType || 'Truck'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-800 font-semibold">
                          {v.assignedDriverName || 'Unassigned'}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {v.currentOdometer || 0} KM
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                            {v.status || 'Active'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteVehicle(v.id || v.vehicleId)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {vehicles.map((v) => (
                <div
                  key={v.id || v.vehicleId}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
                          {v.vehicleType || 'Truck'}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5 leading-snug">
                          {v.numberPlate || v.registrationNumber}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{v.modelName || 'Commercial Vehicle'}</p>
                      </div>
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                        {v.status || 'Active'}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Assigned Driver:</span>
                        <span className="font-semibold text-slate-800">{v.assignedDriverName || 'Unassigned'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Current Odometer:</span>
                        <span className="font-mono font-bold text-slate-900">{v.currentOdometer || 0} KM</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleDeleteVehicle(v.id || v.vehicleId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: DRIVERS ROSTER */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap justify-between items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">Driver Licensing Directory</span>

            <div className="flex items-center gap-3">
              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Table View"
                >
                  <Table className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Cards View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>

              <button
                onClick={() => setShowDriverModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Driver</span>
              </button>
            </div>
          </div>

          {loading && drivers.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading drivers...</div>
          ) : drivers.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No drivers onboarded</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Driver" to register fleet drivers and licenses.</p>
            </div>
          ) : viewMode === 'table' ? (
            /* DRIVERS TABLE FORMAT */
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Driver Name & License</th>
                      <th className="py-3.5 px-4">Contact Phone</th>
                      <th className="py-3.5 px-4">Assigned Vehicle</th>
                      <th className="py-3.5 px-4">Verification Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {drivers.map((d) => (
                      <tr key={d.id || d.driverId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">
                              {(d.driverName || d.name || 'D').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">{d.driverName || d.name}</h4>
                              <p className="text-xs font-mono text-slate-400 mt-0.5">License: {d.licenseNumber || 'Verified'}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {d.phone || 'No direct phone'}
                        </td>

                        <td className="py-3.5 px-4">
                          {d.assignedVehicleNumber ? (
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-200 font-mono">
                              {d.assignedVehicleNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md">
                            Verified License
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteDriver(d.id || d.driverId)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {drivers.map((d) => (
                <div
                  key={d.id || d.driverId}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
                        {(d.driverName || d.name || 'D').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 leading-snug">{d.driverName || d.name}</h3>
                        <p className="text-xs font-mono text-slate-400">License: {d.licenseNumber || 'Verified'}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{d.phone || 'No direct phone'}</span>
                      </div>
                      {d.assignedVehicleNumber && (
                        <div className="flex items-center gap-2">
                          <Truck className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-bold text-slate-800">{d.assignedVehicleNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleDeleteDriver(d.id || d.driverId)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRIP & FUEL LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-700">Trip & Diesel Fill Logs</span>
            <button
              onClick={() => {
                if (vehicles.length > 0 && !logVehicle) setLogVehicle(vehicles[0].numberPlate || vehicles[0].registrationNumber)
                if (drivers.length > 0 && !logDriver) setLogDriver(drivers[0].driverName || drivers[0].name)
                setShowLogModal(true)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B3470] hover:bg-[#082855] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Trip & Fuel</span>
            </button>
          </div>

          {loading && logs.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Loading trip logs...</div>
          ) : logs.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Fuel className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No trip or diesel logs recorded</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "Log Trip & Fuel" to track vehicle movements, starting/ending kilometers, and diesel costs.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Vehicle & Driver</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4">Distance (Odometer)</th>
                      <th className="py-3.5 px-4">Diesel Dispensed</th>
                      <th className="py-3.5 px-4">Route & Cargo</th>
                      <th className="py-3.5 px-4 text-right">Fuel Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {logs.map((l) => (
                      <tr key={l.id || l.logId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900">{l.vehicleNumber || l.numberPlate}</p>
                          <p className="text-xs text-slate-500">{l.driverName || 'Driver'}</p>
                        </td>

                        <td className="py-3.5 px-4 text-xs text-slate-500">
                          {l.date?.seconds ? new Date(l.date.seconds * 1000).toLocaleDateString() : 'Today'}
                        </td>

                        <td className="py-3.5 px-4 text-xs">
                          <p className="font-bold text-slate-900">{l.totalKm || 0} KM</p>
                          <p className="text-slate-400 text-[10px]">
                            {l.startingOdometer} → {l.endingOdometer} KM
                          </p>
                        </td>

                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-800">
                          {l.dieselLiters || 0} Litres
                        </td>

                        <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs">
                          {l.fromSite && l.toSite ? `${l.fromSite} → ${l.toSite}` : 'Site Transit'}
                          {l.materialsTransported && (
                            <span className="block text-[10px] text-slate-400">{l.materialsTransported}</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                          ₹{(Number(l.dieselCost) || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Register Vehicle</h3>
              <button onClick={() => setShowVehicleModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitVehicle} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Number Plate / Registration *
                </label>
                <input
                  type="text"
                  required
                  value={formPlate}
                  onChange={(e) => setFormPlate(e.target.value)}
                  placeholder="e.g. KA-04-MB-8821"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Vehicle Type *
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Model / Maker
                  </label>
                  <input
                    type="text"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder="e.g. Tata Signa 2823"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Initial Odometer (KM)
                  </label>
                  <input
                    type="number"
                    value={formOdo}
                    onChange={(e) => setFormOdo(e.target.value)}
                    placeholder="e.g. 12500"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Assigned Driver
                  </label>
                  <select
                    value={formAssignedDriver}
                    onChange={(e) => setFormAssignedDriver(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Unassigned</option>
                    {drivers.map((d) => (
                      <option key={d.id || d.driverId} value={d.driverName || d.name}>
                        {d.driverName || d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingVehicle}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingVehicle ? 'Saving...' : 'Register Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {showDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Add Fleet Driver</h3>
              <button onClick={() => setShowDriverModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDriver} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Driver Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Rajesh Yadav"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="+91 98450 XXXXX"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Heavy Commercial Driving License #
                </label>
                <input
                  type="text"
                  value={driverLicense}
                  onChange={(e) => setDriverLicense(e.target.value)}
                  placeholder="e.g. DL-0420110012345"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl uppercase"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDriverModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDriver}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingDriver ? 'Saving...' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Trip & Fuel Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Record Trip & Fuel Log</h3>
              <button onClick={() => setShowLogModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitLog} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Select Vehicle *
                  </label>
                  <select
                    required
                    value={logVehicle}
                    onChange={(e) => setLogVehicle(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select...</option>
                    {vehicles.map((v) => {
                      const plate = v.numberPlate || v.registrationNumber
                      return (
                        <option key={v.id || v.vehicleId} value={plate}>
                          {plate} ({v.vehicleType})
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Driver
                  </label>
                  <select
                    value={logDriver}
                    onChange={(e) => setLogDriver(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">Select...</option>
                    {drivers.map((d) => (
                      <option key={d.id || d.driverId} value={d.driverName || d.name}>
                        {d.driverName || d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Starting Odometer
                  </label>
                  <input
                    type="number"
                    value={logStartKm}
                    onChange={(e) => setLogStartKm(e.target.value)}
                    placeholder="e.g. 14200"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Ending Odometer
                  </label>
                  <input
                    type="number"
                    value={logEndKm}
                    onChange={(e) => setLogEndKm(e.target.value)}
                    placeholder="e.g. 14310"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Diesel Dispensed (Liters)
                  </label>
                  <input
                    type="number"
                    value={logDieselLiters}
                    onChange={(e) => setLogDieselLiters(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Diesel Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={logDieselCost}
                    onChange={(e) => setLogDieselCost(e.target.value)}
                    placeholder="e.g. 4200"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLog}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3470] hover:bg-[#082855] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingLog ? 'Recording...' : 'Commit Trip & Fuel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
