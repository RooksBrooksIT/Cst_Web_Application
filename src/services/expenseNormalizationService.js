/**
 * CST White Label / eBricks - Expense Normalization & Synchronization Engine
 * Bridges mobile application and web application expense data structures.
 * 
 * Complies with Section 3 Group 4 of MANAGER_MODULES_FLOW_AND_DATA_STRUCTURE.txt
 * and ORGANIZATION_FINANCE_PAGE_SPECIFICATION.txt.
 */

/**
 * Universal date parser that handles:
 * - Firestore Timestamps (with .toDate() or { seconds, nanoseconds })
 * - ISO Strings (2026-10-28T11:14:39.508)
 * - Epoch timestamps (milliseconds or seconds)
 * - Date string patterns (dd/MM/yyyy, dd-MM-yyyy, yyyy-MM-dd)
 * - Compact 8-digit date strings from doc IDs (e.g. ST001_Testing_09102026 -> 09-10-2026)
 */
export function parseExpenseDate(input, fallbackDocId = '') {
  if (input === null || input === undefined) {
    if (fallbackDocId && fallbackDocId.includes('_')) {
      const lastPart = fallbackDocId.split('_').pop()
      if (/^\d{8}$/.test(lastPart)) {
        const d = parseInt(lastPart.substring(0, 2), 10)
        const m = parseInt(lastPart.substring(2, 4), 10) - 1
        const y = parseInt(lastPart.substring(4, 8), 10)
        if (y >= 2000 && y <= 2100 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
          return new Date(y, m, d)
        }
      }
    }
    return new Date()
  }

  if (input instanceof Date && !isNaN(input.getTime())) return input

  if (typeof input?.toDate === 'function') {
    try {
      const d = input.toDate()
      if (d instanceof Date && !isNaN(d.getTime())) return d
    } catch (_) {}
  }

  if (typeof input === 'object' && input.seconds !== undefined) {
    const d = new Date(input.seconds * 1000)
    if (!isNaN(d.getTime())) return d
  }

  if (typeof input === 'number') {
    const d = new Date(input > 100000000000 ? input : input * 1000)
    if (!isNaN(d.getTime())) return d
  }

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null') return new Date()

    // ISO 8601
    const isoParsed = new Date(trimmed)
    if (!isNaN(isoParsed.getTime())) return isoParsed

    // dd/MM/yyyy or dd-MM-yyyy
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10)
      const month = parseInt(dmyMatch[2], 10) - 1
      const year = parseInt(dmyMatch[3], 10)
      const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0
      const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0
      const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0
      const d = new Date(year, month, day, hour, minute, second)
      if (!isNaN(d.getTime())) return d
    }
  }

  return new Date()
}

/**
 * Parses numeric currency amount safely from numbers, strings with currency symbols, or null
 */
export function parseExpenseAmount(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]+/g, '').trim()
    if (!cleaned) return 0
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Normalizes a raw Firestore document (from organizationExpenses, organizationEntries,
 * managerExpenses, managerEntries, etc.) into the canonical web expense model.
 * 
 * Guarantees 100% field parity with both mobile-entered and web-entered records.
 */
export function normalizeExpenseRecord(docId, rawData = {}, defaultRole = 'Organization') {
  if (!rawData && !docId) return null
  const data = { ...(rawData || {}) }

  // 1. Identifiers
  const id = docId || data.expenseId || data.id || `EXP_${Date.now()}`
  const expenseId = data.expenseId || data.id || id

  // 2. Site & Project Identifiers
  let siteId = (data.siteId || data.site || data.siteCode || '').toString().trim()
  if (!siteId && id.includes('_')) {
    const parts = id.split('_')
    if (parts.length >= 2) {
      siteId = parts.slice(0, -1).join('_')
    }
  }

  const projectName = (data.projectName || data.project || data.siteName || '').toString().trim()
  let siteName = (data.siteName || projectName).toString().trim()
  if (!siteName && siteId.includes('_')) {
    const parts = siteId.split('_').filter(Boolean)
    if (parts.length > 1) {
      siteName = parts.slice(1).join(' ')
    } else {
      siteName = siteId
    }
  }
  if (!siteName) siteName = siteId || 'Project Site'

  // 3. Project Stage
  const projectStage = (
    data.projectStage ||
    data.stage ||
    data.category ||
    'General'
  ).toString().trim()

  // 4. Date Normalization
  const rawDate = data.expenseDate || data.entryDate || data.date || data.createdAt || data.timestamp
  const parsedDate = parseExpenseDate(rawDate, id)
  const seconds = Math.floor(parsedDate.getTime() / 1000)

  const expenseDateTimestamp = {
    seconds,
    nanoseconds: 0,
    toDate: () => parsedDate,
  }

  // 5. Itemized Bills Normalization
  const rawBills = Array.isArray(data.bills) ? data.bills : []
  let calculatedBillsTotal = 0
  const normalizedBills = rawBills.map((b, idx) => {
    const amt = parseExpenseAmount(b.billAmount !== undefined ? b.billAmount : b.amount)
    calculatedBillsTotal += amt

    const billVendor = (b.billVendor || b.vendor || b.vendorName || '').toString().trim()
    const billNo = (b.billNo || b.billNumber || b.invoiceNo || '').toString().trim()
    const billCopy = (b.billCopy || b.billUrl || b.imageUrl || '').toString().trim()
    const validUrl = billCopy && billCopy !== 'billURL' && (billCopy.startsWith('http') || billCopy.startsWith('blob:') || billCopy.startsWith('data:')) ? billCopy : ''

    const bRawDate = b.billDate || b.date
    const bDate = bRawDate ? parseExpenseDate(bRawDate) : parsedDate

    const rawBillQty = b.quantity !== undefined ? b.quantity : (b.qty !== undefined ? b.qty : (b.billQuantity !== undefined ? b.billQuantity : null))
    const parsedBillQty = rawBillQty !== null && rawBillQty !== undefined && rawBillQty !== ''
      ? (Number.isFinite(Number(rawBillQty)) ? Number(rawBillQty) : rawBillQty)
      : null

    return {
      id: b.id || `bill_${idx}`,
      billNo: billNo || (idx + 1).toString().padStart(3, '0'),
      vendor: billVendor || 'Vendor',
      billVendor: billVendor || 'Vendor',
      quantity: parsedBillQty,
      qty: parsedBillQty,
      amount: amt,
      billAmount: amt,
      billCopy: billCopy || '',
      billUrl: validUrl || (billCopy !== 'billURL' ? billCopy : ''),
      imageUrl: validUrl || (billCopy !== 'billURL' ? billCopy : ''),
      storagePath: b.storagePath || '',
      description: b.description || b.purpose || b.remarks || (billVendor ? `${billVendor} Bill` : `Bill #${billNo || idx + 1}`),
      date: bDate,
      billDate: bDate,
    }
  })

  // 6. Total Amount Calculation & Fallbacks
  const rawTotal = data.totalAmount !== undefined
    ? data.totalAmount
    : (data.amount !== undefined
        ? data.amount
        : (data.orgExpenseTotalAmount !== undefined
            ? data.orgExpenseTotalAmount
            : (data.managerExpenseTotalAmount !== undefined ? data.managerExpenseTotalAmount : 0)))

  const parsedDirectTotal = parseExpenseAmount(rawTotal)
  const finalTotal = normalizedBills.length > 0 && calculatedBillsTotal > 0
    ? calculatedBillsTotal
    : parsedDirectTotal

  // 7. Primary Bill Document Preview URL
  const billWithValidDoc = normalizedBills.find(b => b.billUrl && b.billUrl !== 'billURL')
  const rawDirectUrl = data.billUrl || data.imageUrl || (data.billCopy && data.billCopy !== 'billURL' ? data.billCopy : '')
  const primaryBillUrl = rawDirectUrl || (billWithValidDoc ? billWithValidDoc.billUrl : (normalizedBills[0]?.billCopy && normalizedBills[0]?.billCopy !== 'billURL' ? normalizedBills[0].billCopy : ''))

  // 8. Actor Information
  const isManager = defaultRole.toLowerCase().includes('manager')
  const raiserId = (
    data.managerId ||
    data.raiserId ||
    data.supervisorId ||
    data.raisedBy ||
    data.userId ||
    (isManager ? 'mgr_lead' : 'org_admin')
  ).toString().trim()

  const raiserName = (
    data.managerName ||
    data.raiserName ||
    data.raisedByName ||
    data.supervisorName ||
    data.fullName ||
    data.name ||
    (isManager ? 'Operations Manager' : 'Organization Admin')
  ).toString().trim()

  const raiserRole = (data.userRole || data.raiserRole || data.role || defaultRole).toString().trim()
  const remarks = (
    data.remarks ||
    data.description ||
    data.notes ||
    (data.supervisorName ? `Logged by ${data.supervisorName}` : '')
  ).toString().trim()

  // 9. Quantity Normalization
  const rawDocQty = data.quantity !== undefined ? data.quantity : (data.qty !== undefined ? data.qty : null)
  const parsedDocQty = rawDocQty !== null && rawDocQty !== undefined && rawDocQty !== ''
    ? (Number.isFinite(Number(rawDocQty)) ? Number(rawDocQty) : rawDocQty)
    : null
  const hasBillQty = normalizedBills.some((b) => b.quantity !== null && b.quantity !== undefined)
  const billsNumericQtySum = normalizedBills.reduce((acc, b) => acc + (typeof b.quantity === 'number' ? b.quantity : 0), 0)
  const finalQuantity = parsedDocQty !== null
    ? parsedDocQty
    : (hasBillQty ? (billsNumericQtySum > 0 ? billsNumericQtySum : (normalizedBills.find((b) => b.quantity !== null)?.quantity ?? null)) : null)

  return {
    ...data,
    id,
    expenseId,
    siteId,
    siteName,
    projectName,
    projectStage,
    projectCategory: (data.projectCategory || data.category || data.projectType || projectStage || '').toString().trim(),
    expenseDate: expenseDateTimestamp,
    entryDate: expenseDateTimestamp,
    date: parsedDate,
    bills: normalizedBills,
    quantity: finalQuantity,
    qty: finalQuantity,
    totalAmount: finalTotal,
    amount: finalTotal,
    billUrl: primaryBillUrl || null,
    imageUrl: primaryBillUrl || null,
    storagePath: data.storagePath || normalizedBills.find(b => b.storagePath)?.storagePath || null,
    remarks,
    raiserId,
    raiserName,
    managerName: raiserName,
    managerId: raiserId,
    supervisorName: data.supervisorName || '',
    raiserRole,
    userRole: raiserRole,
    status: data.status || 'recorded',
  }
}

/**
 * Resolves the category or stage from a project/site record.
 * Prioritizes actual stored projectCategory/category/projectType,
 * falling back to projectStage/currentStage/stage.
 */
export function resolveProjectCategoryOrStage(projectObj) {
  if (!projectObj || typeof projectObj !== 'object') return ''
  return (
    projectObj.projectCategory ||
    projectObj.category ||
    projectObj.projectType ||
    projectObj.projectStage ||
    projectObj.currentStage ||
    projectObj.stage ||
    ''
  ).toString().trim()
}

/**
 * Checks whether an expense record matches a selected site identifier, taking into
 * account canonical compound IDs (PR001_ST001_Testing), short site codes (ST001),
 * mobile site IDs (ST001_Testing), and site names.
 */
export function isExpenseMatchingSite(expense, siteFilter, sitesList = []) {
  if (!expense) return false
  if (!siteFilter || siteFilter === 'ALL') return true

  const filterClean = String(siteFilter).trim().toLowerCase()
  const matchedSiteObj = sitesList.find((s) => String(s.id).toLowerCase() === filterClean || String(s.siteId).toLowerCase() === filterClean)

  const candidateKeys = new Set([
    filterClean,
    ...(matchedSiteObj ? [
      matchedSiteObj.id,
      matchedSiteObj.siteId,
      matchedSiteObj.siteCode,
      matchedSiteObj.code,
      matchedSiteObj.projectId,
      matchedSiteObj.siteName,
      matchedSiteObj.projectName,
    ].filter(Boolean).map(x => String(x).toLowerCase().trim()) : [])
  ])

  const expKeys = [
    expense.siteId,
    expense.siteName,
    expense.projectName,
    expense.id,
    expense.expenseId,
  ].filter(Boolean).map(x => String(x).toLowerCase().trim())

  for (const ek of expKeys) {
    if (candidateKeys.has(ek)) return true
    for (const ck of candidateKeys) {
      if (ck && (ek === ck || ek.includes(ck) || ck.includes(ek))) {
        return true
      }
    }
  }

  return false
}
