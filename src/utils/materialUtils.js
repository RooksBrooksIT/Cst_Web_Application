/**
 * Utility helpers to resolve Material Item and Requested Qty across varying backend/mobile schemas.
 */

/**
 * Resolves the display name of the material item(s) from a material request document.
 * Handles top-level fields, nested `materials` arrays, `items` arrays, and dictionary maps.
 *
 * @param {Object} req - The material request document.
 * @returns {string} - Formatted material name(s).
 */
export function getMaterialItemDisplay(req) {
  if (!req) return ''

  // 1. Array of materials or items
  const rawList = req.materials || req.items || req.materialList || req.materialItems
  if (Array.isArray(rawList) && rawList.length > 0) {
    const names = rawList
      .map((m) => {
        if (!m) return ''
        if (typeof m === 'string') return m.trim()
        return (
          m.materialName ||
          m.material ||
          m.materialItem ||
          m.itemName ||
          m.item ||
          m.name ||
          m.matName ||
          ''
        ).trim()
      })
      .filter(Boolean)
    if (names.length > 0) {
      return names.join(', ')
    }
  }

  // 2. Object map of materials (e.g. Firebase Map)
  if (rawList && typeof rawList === 'object' && !Array.isArray(rawList)) {
    const values = Object.values(rawList)
    const names = values
      .map((m) => {
        if (!m) return ''
        if (typeof m === 'string') return m.trim()
        return (
          m.materialName ||
          m.material ||
          m.materialItem ||
          m.itemName ||
          m.item ||
          m.name ||
          m.matName ||
          ''
        ).trim()
      })
      .filter(Boolean)
    if (names.length > 0) {
      return names.join(', ')
    }
  }

  // 3. Direct top-level fields
  const direct =
    req.materialName ||
    req.material ||
    req.materialItem ||
    req.itemName ||
    req.item ||
    req.name ||
    req.matName ||
    req.rawMaterial ||
    req.materialType

  if (direct && typeof direct === 'string' && direct.trim()) {
    return direct.trim()
  }

  return 'Raw Material'
}

/**
 * Resolves the measurement unit for the request.
 *
 * @param {Object} req - The material request document.
 * @returns {string} - Unit string (e.g. 'Bags', 'MT', 'Units') or empty string.
 */
export function getMaterialUnitDisplay(req) {
  if (!req) return ''

  const directUnit = req.unit || req.materialUnit || req.uom || req.units || req.measurementUnit
  if (directUnit && typeof directUnit === 'string' && directUnit.trim()) {
    return directUnit.trim()
  }

  const rawList = req.materials || req.items || req.materialList || req.materialItems
  const list = Array.isArray(rawList)
    ? rawList
    : rawList && typeof rawList === 'object'
    ? Object.values(rawList)
    : null

  if (list && list.length > 0) {
    for (const m of list) {
      if (m && typeof m === 'object') {
        const u = m.materialUnit || m.unit || m.uom || m.units || m.measurementUnit
        if (u && typeof u === 'string' && u.trim()) {
          return u.trim()
        }
      }
    }
  }

  return ''
}

/**
 * Resolves the raw numeric or string requested quantity without unit.
 * Useful for modal input pre-population.
 *
 * @param {Object} req - The material request document.
 * @returns {string|number} - Raw quantity or empty string.
 */
export function getMaterialQtyValue(req) {
  if (!req) return ''

  const directQ =
    req.requestedQty ??
    req.quantity ??
    req.materialQty ??
    req.qty ??
    req.requestedQuantity ??
    req.reqQty

  if (directQ !== undefined && directQ !== null && directQ !== '') {
    return directQ
  }

  const rawList = req.materials || req.items || req.materialList || req.materialItems
  const list = Array.isArray(rawList)
    ? rawList
    : rawList && typeof rawList === 'object'
    ? Object.values(rawList)
    : null

  if (list && list.length > 0) {
    for (const m of list) {
      if (m && typeof m === 'object') {
        const q =
          m.materialQty ??
          m.requestedQty ??
          m.quantity ??
          m.qty ??
          m.requestedQuantity ??
          m.reqQty
        if (q !== undefined && q !== null && q !== '') {
          return q
        }
      } else if (typeof m === 'number' || (typeof m === 'string' && !isNaN(Number(m)))) {
        return m
      }
    }
  }

  return ''
}

/**
 * Resolves the display string for Requested Qty along with its unit (e.g. "20 Bags").
 *
 * @param {Object} req - The material request document.
 * @returns {string} - Formatted quantity string (e.g. "20 Bags" or "20 Bags, 10 MT").
 */
export function getRequestedQtyDisplay(req) {
  if (!req) return '—'

  const fallbackUnit = getMaterialUnitDisplay(req)

  const formatSingle = (q, u) => {
    if (q === undefined || q === null || q === '') return null
    const qtyStr = String(q).trim()
    const unitStr = u ? String(u).trim() : fallbackUnit
    return unitStr ? `${qtyStr} ${unitStr}` : qtyStr
  }

  // 1. Array of materials or items
  const rawList = req.materials || req.items || req.materialList || req.materialItems
  if (Array.isArray(rawList) && rawList.length > 0) {
    const formatted = rawList
      .map((m) => {
        if (!m) return null
        if (typeof m === 'number' || (typeof m === 'string' && !isNaN(Number(m)))) {
          return formatSingle(m, fallbackUnit)
        }
        const q =
          m.materialQty ??
          m.requestedQty ??
          m.quantity ??
          m.qty ??
          m.requestedQuantity ??
          m.reqQty
        const u = m.materialUnit || m.unit || m.uom || m.units || m.measurementUnit || fallbackUnit
        return formatSingle(q, u)
      })
      .filter(Boolean)

    if (formatted.length > 0) {
      return formatted.join(', ')
    }
  }

  // 2. Object map of materials
  if (rawList && typeof rawList === 'object' && !Array.isArray(rawList)) {
    const values = Object.values(rawList)
    const formatted = values
      .map((m) => {
        if (!m) return null
        const q =
          m.materialQty ??
          m.requestedQty ??
          m.quantity ??
          m.qty ??
          m.requestedQuantity ??
          m.reqQty
        const u = m.materialUnit || m.unit || m.uom || m.units || m.measurementUnit || fallbackUnit
        return formatSingle(q, u)
      })
      .filter(Boolean)

    if (formatted.length > 0) {
      return formatted.join(', ')
    }
  }

  // 3. Direct top-level fields
  const directQ =
    req.requestedQty ??
    req.quantity ??
    req.materialQty ??
    req.qty ??
    req.requestedQuantity ??
    req.reqQty

  const res = formatSingle(directQ, fallbackUnit)
  if (res) return res

  return '—'
}

/**
 * Resolves the display string for Approved Qty with unit.
 *
 * @param {Object} req - The material request document.
 * @returns {string} - Formatted approved quantity string or '—'.
 */
export function getApprovedQtyDisplay(req) {
  if (!req) return '—'
  const appQ = req.approvedQty ?? req.sanctionedQty ?? req.clearedQty
  if (appQ !== undefined && appQ !== null && appQ !== '' && Number(appQ) > 0) {
    const unit = getMaterialUnitDisplay(req)
    return unit ? `${appQ} ${unit}` : String(appQ)
  }
  return '—'
}

/**
 * Resolves the display string for Category.
 *
 * @param {Object} req - The material request document.
 * @returns {string} - Category string.
 */
export function getMaterialCategoryDisplay(req) {
  if (!req) return 'General Civil'
  if (req.category && typeof req.category === 'string' && req.category.trim()) {
    return req.category.trim()
  }
  if (req.materialCategory && typeof req.materialCategory === 'string' && req.materialCategory.trim()) {
    return req.materialCategory.trim()
  }
  const rawList = req.materials || req.items || req.materialList
  const list = Array.isArray(rawList)
    ? rawList
    : rawList && typeof rawList === 'object'
    ? Object.values(rawList)
    : null

  if (list && list.length > 0) {
    for (const m of list) {
      if (m && typeof m === 'object' && (m.category || m.materialCategory)) {
        return (m.category || m.materialCategory).trim()
      }
    }
  }
  return 'General Civil'
}
