import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService.js'

/**
 * CST White Label - Vehicle Fleet & Driver Management Service
 * Scoped under:
 *   /organisation/{orgId}/vehicleDetails
 *   /organisation/{orgId}/vehicleDrivers
 *   /organisation/{orgId}/vehicleLogs
 * Complies with Section 3 Group 7 & Section 5.10 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 */

export const VEHICLE_TYPES = [
  'Tipper',
  'Transit Mixer',
  'Pickup',
  'Tractor',
  'JCB / Backhoe Loader',
  'Passenger / Utility Van',
]

// ------------------------------------------------------------------------------------------------
// 1. VEHICLE FLEET REGISTRY (/organisation/{orgId}/vehicleDetails)
// ------------------------------------------------------------------------------------------------

export async function fetchVehicles(orgId) {
  return fetchWithFallback(orgId, 'vehicleDetails')
}

export function subscribeVehicles(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'vehicleDetails', onData, onError)
}

export async function createVehicle(orgId, vehicleData) {
  if (!orgId) throw new Error('orgId is required')
  if (!vehicleData.numberPlate?.trim() && !vehicleData.registrationNumber?.trim()) {
    throw new Error('Number Plate is required')
  }

  const plate = (vehicleData.numberPlate || vehicleData.registrationNumber || '').trim().toUpperCase()
  const vehicleId = vehicleData.vehicleId || `VEH_${plate.replace(/[^A-Z0-9]/g, '_')}`

  const payload = {
    vehicleId,
    modelName: vehicleData.modelName || 'Tata Tipper',
    numberPlate: plate,
    registrationNumber: plate,
    vehicleType: vehicleData.vehicleType || 'Tipper',
    status: vehicleData.status || 'Active', // 'Active', 'Idle', 'Maintenance'
    assignedDriverName: vehicleData.assignedDriverName || '',
    insuranceExpiryDate: vehicleData.insuranceExpiryDate ? new Date(vehicleData.insuranceExpiryDate) : null,
    fcExpiryDate: vehicleData.fcExpiryDate ? new Date(vehicleData.fcExpiryDate) : null,
    currentOdometer: Number(vehicleData.currentOdometer) || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'vehicleDetails', vehicleId)
  await setDoc(docRef, payload)

  return { id: vehicleId, ...payload }
}

export async function updateVehicle(orgId, vehicleId, updates) {
  if (!orgId || !vehicleId) throw new Error('orgId and vehicleId are required')
  const docRef = doc(db, 'organisation', orgId, 'vehicleDetails', vehicleId)
  await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteVehicle(orgId, vehicleId) {
  if (!orgId || !vehicleId) throw new Error('orgId and vehicleId are required')
  const docRef = doc(db, 'organisation', orgId, 'vehicleDetails', vehicleId)
  await deleteDoc(docRef)
}

// ------------------------------------------------------------------------------------------------
// 2. DRIVER ROSTER & LICENSING (/organisation/{orgId}/vehicleDrivers)
// ------------------------------------------------------------------------------------------------

export async function fetchDrivers(orgId) {
  return fetchWithFallback(orgId, 'vehicleDrivers')
}

export function subscribeDrivers(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'vehicleDrivers', onData, onError)
}

export async function createDriver(orgId, driverData) {
  if (!orgId || !driverData.driverName?.trim()) throw new Error('Driver name is required')

  const timestamp = Date.now()
  const driverId = driverData.driverId || `DRV_${timestamp.toString().slice(-4)}`

  const payload = {
    driverId,
    driverName: driverData.driverName.trim(),
    name: driverData.driverName.trim(),
    phone: driverData.phone?.trim() || '',
    licenseNumber: driverData.licenseNumber?.trim() || '',
    licenseExpiryDate: driverData.licenseExpiryDate ? new Date(driverData.licenseExpiryDate) : null,
    assignedVehicleNumber: driverData.assignedVehicleNumber || '',
    status: 'Active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'vehicleDrivers', driverId)
  await setDoc(docRef, payload)

  return { id: driverId, ...payload }
}

export async function deleteDriver(orgId, driverId) {
  if (!orgId || !driverId) throw new Error('orgId and driverId are required')
  const docRef = doc(db, 'organisation', orgId, 'vehicleDrivers', driverId)
  await deleteDoc(docRef)
}

// ------------------------------------------------------------------------------------------------
// 3. VEHICLE TRIP & DIESEL LOGS (/organisation/{orgId}/vehicleLogs)
// ------------------------------------------------------------------------------------------------

export async function fetchVehicleLogs(orgId) {
  return fetchWithFallback(orgId, 'vehicleLogs')
}

export function subscribeVehicleLogs(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'vehicleLogs', onData, onError)
}

export async function recordVehicleTripLog(orgId, logData, recorderActor) {
  if (!orgId || !logData.vehicleNumber) throw new Error('Vehicle selection is required')

  const timestamp = Date.now()
  const logId = `VLOG_${timestamp}`

  const startKm = Number(logData.startingOdometer) || 0
  const endKm = Number(logData.endingOdometer) || startKm
  const totalKm = Math.max(0, endKm - startKm)
  const dieselLiters = Number(logData.dieselLiters) || 0
  const dieselCost = Number(logData.dieselCost) || 0

  const payload = {
    logId,
    date: logData.date ? new Date(logData.date) : serverTimestamp(),
    vehicleNumber: logData.vehicleNumber,
    numberPlate: logData.vehicleNumber,
    driverName: logData.driverName || '',
    startingOdometer: startKm,
    endingOdometer: endKm,
    totalKm,
    dieselLiters,
    dieselCost,
    materialsTransported: logData.materialsTransported || '',
    fromSite: logData.fromSite || '',
    toSite: logData.toSite || '',
    recordedBy: recorderActor?.name || 'Operations Manager',
    createdAt: serverTimestamp(),
  }

  const docRef = doc(db, 'organisation', orgId, 'vehicleLogs', logId)
  await setDoc(docRef, payload)

  // Update odometer on vehicle doc
  try {
    const vehRef = doc(db, 'organisation', orgId, 'vehicleDetails', logData.vehicleNumber)
    await updateDoc(vehRef, { currentOdometer: endKm, updatedAt: serverTimestamp() })
  } catch (err) {}

  return { id: logId, ...payload }
}

export async function recordFuelLog(orgId, vehicleId, fuelData) {
  return recordVehicleTripLog(orgId, {
    vehicleNumber: vehicleId,
    dieselLiters: fuelData.liters,
    dieselCost: fuelData.cost,
    date: fuelData.date,
  })
}
