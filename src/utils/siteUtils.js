/**
 * Site ID & Name Resolution Utility
 * Ensures consistent site resolution across Materials, Tools, Requisitions, and Inventory.
 * Aligns Web Frontend with Flutter Mobile App data structures and field conventions.
 */

export function cleanKey(str) {
  return (str || '').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_')
}

/**
 * Checks if a string is a placeholder/generic name
 */
export function isGenericSiteName(str) {
  if (!str) return true
  const s = String(str).trim().toLowerCase()
  return (
    s === 'project site' ||
    s === 'site' ||
    s === 'unknown' ||
    s === 'primary site' ||
    s === 'n/a' ||
    s === 'null' ||
    s === 'undefined' ||
    s.startsWith('site_')
  )
}

/**
 * Humanizes a raw site ID or slug (e.g., "st001_alpha_commercial" -> "Alpha Commercial")
 */
export function humanizeSiteId(rawId) {
  if (!rawId) return 'Project Site'
  const str = String(rawId).trim()
  if (['hq', 'company_hq', 'warehouse', 'central_warehouse', 'company'].includes(str.toLowerCase())) {
    return 'Company'
  }

  // Remove common prefixes like PR001_, ST001_, SITE_
  const cleaned = str
    .replace(/^PR\d+_/i, '')
    .replace(/^ST\d+_/i, '')
    .replace(/^SITE_?/i, '')
    .replace(/_/g, ' ')
    .trim()

  if (!cleaned) return str

  return cleaned
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
}

/**
 * Resolves comprehensive site details from any ID/reference and an optional site list.
 *
 * @param {string} siteIdentifier - can be id, siteId, siteCode, or clean key
 * @param {string} docSiteName - optional siteName already present on the document
 * @param {Array} sitesList - array of site/project documents
 * @returns {Object} { siteId, siteCode, siteName, projectName, label, isWarehouse }
 */
export function resolveSite(siteIdentifier, docSiteName = '', sitesList = []) {
  const rawId = String(siteIdentifier || '').trim()
  const rawDocName = String(docSiteName || '').trim()

  // Central Depot / Warehouse / Company
  const isWarehouse =
    rawId.toLowerCase().includes('warehouse') ||
    rawId.toLowerCase().includes('yard') ||
    rawId.toLowerCase() === 'hq' ||
    rawId.toLowerCase() === 'company_hq' ||
    rawId.toLowerCase() === 'company' ||
    rawDocName.toLowerCase().includes('warehouse') ||
    rawDocName.toLowerCase().includes('yard') ||
    rawDocName.toLowerCase() === 'company'

  if (isWarehouse && (!rawId || ['hq', 'company', 'central warehouse', 'warehouse', 'company_hq'].includes(rawId.toLowerCase()))) {
    return {
      siteId: 'Company',
      siteCode: 'HQ',
      siteName: 'Company',
      projectName: 'Company HQ',
      label: 'Company',
      isWarehouse: true,
      raw: null,
    }
  }

  const cleanTarget = cleanKey(rawId)

  // Find match in sitesList
  let matched = null
  if (Array.isArray(sitesList) && sitesList.length > 0 && rawId) {
    matched = sitesList.find((s) => {
      if (!s) return false
      const sId = String(s.id || '').trim()
      const sSiteId = String(s.siteId || '').trim()
      const sCode = String(s.siteCode || '').trim()
      const sProjId = String(s.projectId || '').trim()

      if (sId && sId === rawId) return true
      if (sSiteId && sSiteId === rawId) return true
      if (sCode && sCode.toLowerCase() === rawId.toLowerCase()) return true
      if (sProjId && sProjId === rawId) return true

      const cId = cleanKey(sId)
      const cSiteId = cleanKey(sSiteId)
      const cCode = cleanKey(sCode)

      if (cId && cId === cleanTarget) return true
      if (cSiteId && cSiteId === cleanTarget) return true
      if (cCode && cCode === cleanTarget) return true

      // Handle compound IDs like PR001_ST001_AlphaSite matching ST001_AlphaSite
      if (sId && sSiteId && sId.includes(sSiteId) && (rawId === sSiteId || rawId === sId)) return true
      if (cleanTarget && cSiteId && cleanTarget.includes(cSiteId)) return true
      if (cId && cleanTarget && cId.includes(cleanTarget)) return true

      // Match siteName directly if id was stored as siteName
      const sName = cleanKey(s.siteName || s.name || '')
      if (sName && sName === cleanTarget) return true

      return false
    })
  }

  // Derive canonical values
  const siteCode = matched?.siteCode || (rawId.match(/ST\d+/i) ? rawId.match(/ST\d+/i)[0].toUpperCase() : '')
  const siteId = matched?.siteId || matched?.id || rawId || 'SITE_UNKNOWN'

  let siteName = ''
  if (matched?.siteName && !isGenericSiteName(matched.siteName)) {
    siteName = matched.siteName.trim()
  } else if (matched?.name && !isGenericSiteName(matched.name)) {
    siteName = matched.name.trim()
  } else if (rawDocName && !isGenericSiteName(rawDocName) && rawDocName !== rawId) {
    siteName = rawDocName
  } else if (matched?.projectName && !isGenericSiteName(matched.projectName)) {
    siteName = matched.projectName.trim()
  } else {
    siteName = humanizeSiteId(rawId)
  }

  const projectName =
    matched?.projectName?.trim() ||
    matched?.projectTitle?.trim() ||
    (siteName !== 'Project Site' ? siteName : '')

  const label = siteCode && !siteName.includes(siteCode)
    ? `${siteName} (${siteCode})`
    : siteName

  return {
    siteId,
    siteCode,
    siteName,
    projectName,
    label,
    isWarehouse: false,
    raw: matched || null,
  }
}

/**
 * Compares two site references to see if they refer to the exact same site.
 */
export function isSameSite(siteRefA, siteRefB, sitesList = []) {
  if (!siteRefA || !siteRefB) return false
  if (siteRefA === siteRefB) return true

  const resA = resolveSite(siteRefA, '', sitesList)
  const resB = resolveSite(siteRefB, '', sitesList)

  if (resA.siteId && resB.siteId && resA.siteId === resB.siteId) return true
  if (resA.siteCode && resB.siteCode && resA.siteCode === resB.siteCode) return true
  if (resA.raw?.id && resB.raw?.id && resA.raw.id === resB.raw.id) return true

  const keyA = cleanKey(resA.siteName)
  const keyB = cleanKey(resB.siteName)
  return Boolean(keyA && keyB && keyA === keyB)
}

/**
 * Transforms raw sites array into deduplicated, clean dropdown options.
 */
export function getNormalizedSiteOptions(sitesList = []) {
  if (!Array.isArray(sitesList)) return []
  const seen = new Set()
  const options = []

  sitesList.forEach((s) => {
    if (!s) return
    const resolved = resolveSite(s.siteId || s.id, s.siteName || s.name, sitesList)
    const uniqueKey = resolved.siteCode || resolved.siteId || resolved.siteName

    if (!uniqueKey || seen.has(uniqueKey.toLowerCase())) return
    seen.add(uniqueKey.toLowerCase())

    options.push({
      id: s.id || resolved.siteId,
      siteId: resolved.siteId,
      siteCode: resolved.siteCode,
      siteName: resolved.siteName,
      projectName: resolved.projectName,
      label: resolved.label,
      raw: s,
    })
  })

  return options
}

/**
 * Formats a site transfer location display.
 * When transferring to a project site, formats dynamically as: `${siteId}_${projectName}` (e.g. "ST001_Project1").
 * When transferring to/from company/warehouse, formats as: "Company".
 */
export function formatTransferLocation(siteIdentifier, docSiteName = '', sitesList = [], docProjectName = '') {
  const rawId = String(siteIdentifier || '').trim()
  const rawDocName = String(docSiteName || '').trim()
  const rawProject = String(docProjectName || '').trim()

  // 1. Check if Company / Warehouse / HQ
  const isHq =
    rawId.toLowerCase().includes('warehouse') ||
    rawId.toLowerCase().includes('godown') ||
    rawId.toLowerCase().includes('depot') ||
    rawId.toLowerCase().includes('yard') ||
    rawId.toLowerCase() === 'hq' ||
    rawId.toLowerCase() === 'company_hq' ||
    rawId.toLowerCase() === 'company' ||
    rawDocName.toLowerCase().includes('warehouse') ||
    rawDocName.toLowerCase().includes('godown') ||
    rawDocName.toLowerCase().includes('depot') ||
    rawDocName.toLowerCase().includes('yard') ||
    rawDocName.toLowerCase() === 'company'

  if (isHq && (!rawId || ['hq', 'central warehouse', 'warehouse', 'company', 'company_hq', 'central warehouse (hq)', 'central warehouse / main depot', 'central warehouse / main godown'].includes(rawId.toLowerCase()) || isGenericSiteName(rawId))) {
    return 'Company'
  }

  // 2. Resolve matching site from sitesList
  const resolved = resolveSite(rawId, rawDocName, sitesList)
  if (resolved.isWarehouse) {
    return 'Company'
  }

  const matched = resolved.raw

  // 3. Extract site code / ID (e.g. ST001)
  let siteCode =
    matched?.siteCode ||
    matched?.code ||
    (rawId.match(/ST\d+/i) ? rawId.match(/ST\d+/i)[0].toUpperCase() : '') ||
    (matched?.id && matched.id.match(/ST\d+/i) ? matched.id.match(/ST\d+/i)[0].toUpperCase() : '') ||
    (matched?.siteId && matched.siteId.match(/ST\d+/i) ? matched.siteId.match(/ST\d+/i)[0].toUpperCase() : '') ||
    matched?.siteId ||
    matched?.id

  if (siteCode && typeof siteCode === 'string' && siteCode.includes('_')) {
    const stMatch = siteCode.match(/ST\d+/i)
    if (stMatch) siteCode = stMatch[0].toUpperCase()
  }

  // 4. Extract project name
  let projectName =
    matched?.projectName?.trim() ||
    matched?.projectTitle?.trim() ||
    (rawProject && !isGenericSiteName(rawProject) ? rawProject.trim() : '') ||
    (matched?.siteName && !isGenericSiteName(matched.siteName) ? matched.siteName.trim() : '') ||
    (matched?.name && !isGenericSiteName(matched.name) ? matched.name.trim() : '') ||
    (rawDocName && !isGenericSiteName(rawDocName) ? rawDocName.trim() : '')

  if (isGenericSiteName(projectName)) {
    projectName = ''
  }

  if (!projectName && matched?.label && !isGenericSiteName(matched.label)) {
    projectName = matched.label.trim()
  }

  // If still no projectName, check if any site in sitesList with this siteCode has projectName
  if (!projectName && siteCode && Array.isArray(sitesList)) {
    const fallbackMatch = sitesList.find(
      (s) =>
        (s.siteCode && s.siteCode.toUpperCase() === siteCode.toUpperCase()) ||
        (s.siteId && s.siteId.toUpperCase() === siteCode.toUpperCase()) ||
        (s.id && s.id.toUpperCase() === siteCode.toUpperCase())
    )
    if (fallbackMatch) {
      projectName =
        fallbackMatch.projectName?.trim() ||
        fallbackMatch.projectTitle?.trim() ||
        (fallbackMatch.siteName && !isGenericSiteName(fallbackMatch.siteName) ? fallbackMatch.siteName.trim() : '') ||
        (fallbackMatch.name && !isGenericSiteName(fallbackMatch.name) ? fallbackMatch.name.trim() : '')
    }
  }

  if (isGenericSiteName(projectName)) {
    projectName = ''
  }

  if (isGenericSiteName(siteCode)) {
    siteCode = ''
  }

  // 5. Combine as ${siteId}_${projectName} (e.g. ST001_Project1)
  if (siteCode && projectName) {
    if (projectName.startsWith(`${siteCode}_`)) {
      return projectName
    }
    let cleanProj = projectName
      .replace(new RegExp(`^${siteCode}[_\\s-:]*`, 'i'), '')
      .trim()

    if (/^project\s+(\d+)$/i.test(cleanProj)) {
      cleanProj = cleanProj.replace(/\s+/g, '')
    }

    return `${siteCode}_${cleanProj || projectName}`
  }

  if (siteCode) {
    if (isGenericSiteName(rawDocName) || !rawDocName) {
      return `${siteCode}_Project1`
    }
    if (rawId.startsWith(`${siteCode}_`)) return rawId
    return `${siteCode}_${rawDocName.replace(/\s+/g, '')}`
  }

  if (projectName) {
    return projectName
  }

  if (resolved.label && !isGenericSiteName(resolved.label)) {
    return resolved.label
  }

  return rawDocName && !isGenericSiteName(rawDocName) ? rawDocName : (rawId && !isGenericSiteName(rawId) ? rawId : 'ST001_Project1')
}

