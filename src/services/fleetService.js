import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Fleet & Logistics Management Service
 * Complies with Section 3.12 of Architecture Specification
 */

export const VEHICLE_TYPES = [
  'Tipper / Dumper 10-Wheeler',
  'Tractor & Trailer',
  'Transit Concrete Mixer',
  'Pickup Truck / Bolero Maxi',
  'Supervisor Two-Wheeler',
  'Site Utility Van',
]

export async function fetchVehicles(orgId) {
  return fetchWithFallback(orgId, 'vehicles')
}

export function subscribeVehicles(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'vehicles', onData, onError)
}

export async function createVehicle(orgId, vehicleData) {
  const payload = {
    registrationNumber: vehicleData.registrationNumber || '',
    type: vehicleData.type || 'Pickup Truck / Bolero Maxi',
    driverName: vehicleData.driverName || '',
    driverPhone: vehicleData.driverPhone || '',
    currentOdometer: Number(vehicleData.currentOdometer || vehicleData.odometer) || 0,
    status: vehicleData.status || 'Active',
    assignedProjectId: vehicleData.assignedProjectId || vehicleData.siteId || '',
    assignedProjectName: vehicleData.assignedProjectName || vehicleData.siteName || 'All Sites',
    fuelLogs: Array.isArray(vehicleData.fuelLogs) ? vehicleData.fuelLogs : [],
    tripLogs: Array.isArray(vehicleData.tripLogs) ? vehicleData.tripLogs : [],
  }
  const docId = await saveStandardDoc(orgId, 'vehicles', payload)
  return { id: docId, ...payload }
}

export async function updateVehicle(orgId, vehicleId, updates) {
  await updateStandardDoc(orgId, 'vehicles', vehicleId, updates)
}

export async function deleteVehicle(orgId, vehicleId) {
  return deleteStandardDoc(orgId, 'vehicles', vehicleId)
}

export async function recordFuelLog(orgId, vehicleId, fuelData) {
  const logEntry = {
    date: fuelData.date || new Date().toISOString(),
    liters: Number(fuelData.liters) || 0,
    cost: Number(fuelData.cost) || 0,
    odometer: Number(fuelData.odometer) || 0,
    fuelBillUrl: fuelData.fuelBillUrl || '',
    filledBy: fuelData.filledBy || 'Driver',
  }

  await updateStandardDoc(orgId, 'vehicles', vehicleId, {
    currentOdometer: logEntry.odometer || 0,
    lastFuelLog: logEntry,
  })
}
