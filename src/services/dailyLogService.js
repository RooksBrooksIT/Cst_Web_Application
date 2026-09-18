import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Daily Site Progress Logs Service
 * Complies with Section 3.15 of Architecture Specification
 */

export const WEATHER_TYPES = ['Sunny / Clear Sky', 'Cloudy / Overcast', 'Rainy / Wet Conditions', 'High Winds / Storm']

export async function fetchDailySiteLogs(orgId) {
  return fetchWithFallback(orgId, 'daily_site_logs')
}

export function subscribeDailySiteLogs(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'daily_site_logs', onData, onError)
}

export async function createDailySiteLog(orgId, logData) {
  const payload = {
    projectId: logData.projectId || logData.siteId || '',
    projectName: logData.projectName || logData.siteName || 'Site',
    date: logData.date || new Date().toISOString().split('T')[0],
    supervisorUid: logData.supervisorUid || logData.userId || '',
    supervisorName: logData.supervisorName || logData.userName || 'Site Supervisor',
    weather: logData.weather || 'Sunny / Clear Sky',
    workDoneSummary: logData.workDoneSummary || logData.summary || 'Daily structural work ongoing.',
    workforceCount: logData.workforceCount || {
      masons: Number(logData.masons) || 4,
      helpers: Number(logData.helpers) || 8,
      carpenters: Number(logData.carpenters) || 2,
      electricians: Number(logData.electricians) || 1,
      total: (Number(logData.masons) || 4) + (Number(logData.helpers) || 8) + (Number(logData.carpenters) || 2) + (Number(logData.electricians) || 1),
    },
    equipmentOnSite: Array.isArray(logData.equipmentOnSite) ? logData.equipmentOnSite : ['Concrete Mixer', 'Vibrator Needle'],
    hindrances: logData.hindrances || 'No major bottlenecks encountered.',
    sitePhotos: Array.isArray(logData.sitePhotos) ? logData.sitePhotos : [],
    managerReviewed: Boolean(logData.managerReviewed),
    reviewNotes: logData.reviewNotes || '',
  }

  const docId = await saveStandardDoc(orgId, 'daily_site_logs', payload)
  return { id: docId, ...payload }
}

export async function reviewDailySiteLog(orgId, logId, managerName, reviewNotes = '') {
  await updateStandardDoc(orgId, 'daily_site_logs', logId, {
    managerReviewed: true,
    reviewedBy: managerName,
    reviewedAt: new Date().toISOString(),
    reviewNotes,
  })
}
