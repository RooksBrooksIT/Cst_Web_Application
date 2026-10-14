/**
 * Tool Location Resolution Utility
 * Ensures clear, unambiguous location display in the Organization Inventory Hub & Tool Allocation breakdown.
 *
 * Requirements:
 * 1. Clearly distinguish Company HQ Warehouse / Central Yard from project sites.
 * 2. Display the site ID along with site name in format: "ST001 - Site Name".
 * 3. Display the actual project name and site name wherever tools are allocated to a project/site.
 * 4. Display consistent "Company HQ Warehouse" label for tools at HQ warehouse or central yard.
 * 5. Update Status / Location Tag to "Available at Company HQ Warehouse" or "Active at ST001 - Site Name".
 * 6. Provide identical labels for table display, location filter dropdown, and export functions.
 */

export const COMPANY_HQ_WAREHOUSE_LABEL = 'Company HQ Warehouse'
export const COMPANY_HQ_TAG = 'Available at Company HQ Warehouse'

/**
 * Checks if a string or identifier indicates the company central yard / warehouse
 */
export function isHqIdentifier(str) {
  if (!str) return false
  const s = String(str).trim().toLowerCase()
  return (
    s === 'hq' ||
    s === 'company_hq' ||
    s === 'company hq' ||
    s === 'warehouse' ||
    s === 'central_warehouse' ||
    s === 'central warehouse' ||
    s === 'central yard' ||
    s === 'central_yard' ||
    s === 'central yard (hq)' ||
    s === 'central warehouse (hq)' ||
    s === 'company hq warehouse' ||
    s === 'company hq central yard' ||
    s === 'central depot' ||
    s === 'company central storage' ||
    s.includes('company hq') ||
    s.includes('central yard') ||
    s.includes('central warehouse')
  )
}

/**
 * Checks if a string is generic, placeholder, or an HQ string that shouldn't be a site name
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
    s.startsWith('site_') ||
    isHqIdentifier(s)
  )
}

/**
 * Formats site location display: e.g. "ST001 - Site Name"
 */
export function formatSiteLocationDisplay(siteCode, siteName) {
  const code = (siteCode || '').trim()
  const name = (siteName || '').trim()

  if (code && name) {
    // If name starts with code, e.g. "ST001 - Testing" or "ST001: Testing" or "ST001_Testing"
    const regex = new RegExp(`^${code}[_\\s-–—:]*`, 'i')
    if (regex.test(name)) {
      const remainder = name.replace(regex, '').trim().replace(/^[-–—:]+\s*/, '')
      return remainder ? `${code} - ${remainder}` : `${code} - Site ${code}`
    }
    return `${code} - ${name}`
  }

  if (code && !name) {
    return `${code} - Site ${code}`
  }

  if (!code && name) {
    return name
  }

  return 'Project Site'
}

/**
 * Resolves full location details for a tool allocation record
 *
 * @param {string} rawSiteId - site ID from doc or allocation
 * @param {string} rawSiteName - site name from doc or allocation
 * @param {string} rawProjectName - project name from doc or allocation
 * @param {string} rawSiteCode - site code from doc or allocation
 * @param {Object} context - { allSiteRecords, toolsAtSite, toolMovements, materialTransactions, siteMaterialPool }
 * @returns {Object} { siteId, siteCode, siteName, projectName, displayLocation, locationTag, isCompanyHq }
 */
export function resolveToolLocationDetails(
  rawSiteId = '',
  rawSiteName = '',
  rawProjectName = '',
  rawSiteCode = '',
  context = {}
) {
  const {
    allSiteRecords = [],
    toolMovements = [],
    materialTransactions = [],
    siteMaterialPool = [],
  } = context

  const siteIdStr = String(rawSiteId || '').trim()
  const siteCodeStr = String(rawSiteCode || '').trim()
  const siteNameStr = String(rawSiteName || '').trim()
  const projectNameStr = String(rawProjectName || '').trim()

  // 1. Company HQ Warehouse check
  if (
    isHqIdentifier(siteIdStr) ||
    (!siteIdStr && isHqIdentifier(siteNameStr)) ||
    siteIdStr.toLowerCase() === 'company_hq' ||
    siteIdStr.toLowerCase() === 'hq'
  ) {
    return {
      siteId: 'COMPANY_HQ',
      siteCode: 'HQ',
      siteName: COMPANY_HQ_WAREHOUSE_LABEL,
      projectName: 'Company HQ',
      displayLocation: COMPANY_HQ_WAREHOUSE_LABEL,
      locationTag: COMPANY_HQ_TAG,
      isCompanyHq: true,
    }
  }

  // 2. Reject HQ strings if attached to a site allocation
  const cleanDocSiteName = isHqIdentifier(siteNameStr) ? '' : siteNameStr
  const cleanDocProjectName = isHqIdentifier(projectNameStr) ? '' : projectNameStr

  // 3. Extract site code candidate
  let derivedSiteCode = siteCodeStr
  if (!derivedSiteCode && siteIdStr) {
    const match = siteIdStr.match(/\b(ST\d+)\b/i) || siteIdStr.match(/^(ST\d+)/i) || siteIdStr.match(/^(SITE[-_]?\d+)/i)
    if (match) {
      derivedSiteCode = match[1].toUpperCase()
    }
  }

  const cleanTargetId = siteIdStr.toLowerCase()
  const cleanTargetCode = (derivedSiteCode || siteCodeStr).toLowerCase()

  // 4. Search in allSiteRecords (sites, projects, fetchedSites, fetchedProjects)
  let matched = allSiteRecords.find((s) => {
    if (!s) return false
    const sId = String(s.id || '').trim().toLowerCase()
    const sSiteId = String(s.siteId || '').trim().toLowerCase()
    const sSiteCode = String(s.siteCode || s.code || '').trim().toLowerCase()
    const sProjId = String(s.projectId || '').trim().toLowerCase()

    if (cleanTargetId && (sId === cleanTargetId || sSiteId === cleanTargetId || sSiteCode === cleanTargetId || sProjId === cleanTargetId)) {
      return true
    }
    if (cleanTargetCode && (sSiteCode === cleanTargetCode || sSiteId === cleanTargetCode || sId === cleanTargetCode)) {
      return true
    }
    // Compound ID matches (e.g. "PR001_ST001_SiteName" matching "ST001")
    if (cleanTargetId && (sId.includes(cleanTargetId) || sSiteId.includes(cleanTargetId))) {
      return true
    }
    if (cleanTargetCode && (sId.includes(cleanTargetCode) || sSiteId.includes(cleanTargetCode))) {
      return true
    }
    return false
  })

  // 5. Search in movements, transactions, and site pools if not found in master site records
  if (!matched && (cleanTargetId || cleanTargetCode)) {
    const movMatch = toolMovements.find((tm) => {
      const toId = String(tm.toSiteId || tm.toSite || '').trim().toLowerCase()
      const toCode = String(tm.toSiteCode || '').trim().toLowerCase()
      const isTarget = (toId && toId === cleanTargetId) || (toCode && toCode === cleanTargetCode)
      return isTarget && tm.toSiteName && !isGenericSiteName(tm.toSiteName)
    })
    if (movMatch) {
      matched = {
        siteId: movMatch.toSiteId || siteIdStr,
        siteCode: movMatch.toSiteCode || derivedSiteCode,
        siteName: movMatch.toSiteName,
        projectName: movMatch.projectName || movMatch.toProjectName,
      }
    }
  }

  if (!matched && cleanTargetId) {
    const txnMatch = materialTransactions.find((t) => {
      const toId = String(t.toSiteId || t.siteId || '').trim().toLowerCase()
      const isTarget = toId === cleanTargetId
      return isTarget && (t.toSiteName || t.projectName) && !isGenericSiteName(t.toSiteName || t.projectName)
    })
    if (txnMatch) {
      matched = {
        siteId: txnMatch.toSiteId || siteIdStr,
        siteName: txnMatch.toSiteName,
        projectName: txnMatch.projectName,
      }
    }
  }

  if (!matched && cleanTargetId) {
    const poolMatch = siteMaterialPool.find((p) => {
      const pId = String(p.siteId || '').trim().toLowerCase()
      return pId === cleanTargetId && (p.siteName || p.projectName) && !isGenericSiteName(p.siteName || p.projectName)
    })
    if (poolMatch) {
      matched = {
        siteId: poolMatch.siteId || siteIdStr,
        siteName: poolMatch.siteName,
        projectName: poolMatch.projectName,
      }
    }
  }

  // 6. Resolve final siteCode
  let finalSiteCode =
    matched?.siteCode ||
    matched?.code ||
    derivedSiteCode ||
    siteCodeStr ||
    (matched?.id?.match(/\b(ST\d+)\b/i) ? matched.id.match(/\b(ST\d+)\b/i)[1].toUpperCase() : '') ||
    (siteIdStr.match(/\b(ST\d+)\b/i) ? siteIdStr.match(/\b(ST\d+)\b/i)[1].toUpperCase() : '')

  // 7. Resolve final siteName
  let finalSiteName = ''
  if (matched?.siteName && !isGenericSiteName(matched.siteName)) {
    finalSiteName = matched.siteName.trim()
  } else if (matched?.name && !isGenericSiteName(matched.name)) {
    finalSiteName = matched.name.trim()
  } else if (matched?.title && !isGenericSiteName(matched.title)) {
    finalSiteName = matched.title.trim()
  } else if (cleanDocSiteName && !isGenericSiteName(cleanDocSiteName) && cleanDocSiteName !== siteIdStr) {
    finalSiteName = cleanDocSiteName
  } else if (matched?.projectName && !isGenericSiteName(matched.projectName)) {
    finalSiteName = matched.projectName.trim()
  } else if (siteIdStr) {
    // Format human-friendly name from slug (e.g. "ST001_Green_Valley" -> "Green Valley")
    const cleanedSlug = siteIdStr
      .replace(/^(PR\d+_|PRJ\d+_)/i, '')
      .replace(/^(ST\d+_|SITE[-_]?\d*_?)/i, '')
      .replace(/_/g, ' ')
      .trim()
    if (cleanedSlug && !isGenericSiteName(cleanedSlug)) {
      finalSiteName = cleanedSlug
        .split(' ')
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
        .join(' ')
    } else if (finalSiteCode) {
      finalSiteName = `Site ${finalSiteCode}`
    } else {
      finalSiteName = siteIdStr
    }
  } else {
    finalSiteName = 'Project Site'
  }

  // 8. Resolve final projectName
  let finalProjectName = ''
  if (matched?.projectName && !isGenericSiteName(matched.projectName)) {
    finalProjectName = matched.projectName.trim()
  } else if (matched?.projectTitle && !isGenericSiteName(matched.projectTitle)) {
    finalProjectName = matched.projectTitle.trim()
  } else if (matched?.projectId) {
    const parentProj = allSiteRecords.find((p) => {
      const pId = String(p.id || p.projectId || '').trim().toLowerCase()
      return pId === String(matched.projectId).trim().toLowerCase()
    })
    if (parentProj) {
      finalProjectName = parentProj.projectName || parentProj.name || parentProj.title || ''
    }
  }
  if (!finalProjectName && cleanDocProjectName && !isGenericSiteName(cleanDocProjectName)) {
    finalProjectName = cleanDocProjectName
  }
  if (!finalProjectName) {
    finalProjectName = finalSiteName
  }

  // 9. Format displayLocation and locationTag
  const displayLocation = formatSiteLocationDisplay(finalSiteCode, finalSiteName)
  const locationTag = `Active at ${displayLocation}`

  return {
    siteId: siteIdStr || finalSiteCode || 'SITE_UNKNOWN',
    siteCode: finalSiteCode,
    siteName: finalSiteName,
    projectName: finalProjectName,
    displayLocation,
    locationTag,
    isCompanyHq: false,
  }
}
