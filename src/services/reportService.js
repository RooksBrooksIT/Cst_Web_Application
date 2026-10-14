/**
 * Comprehensive Reports & Analytics Service
 * Complies with ORGANIZATION_REPORTS_SECTION_AND_BACKEND_FLOW_SPECIFICATION.txt
 * Handles canonical site resolution, composite keys ({siteId}_{ddMMyyyy}),
 * multi-collection aggregation pipelines, and calculation models for all 10 reports across 6 hubs.
 */

import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'

// ------------------------------------------------------------------------------------------------
// UTILITIES: Currency, Numbers, Dates, Canonical Matching
// ------------------------------------------------------------------------------------------------

export function parseAmount(val) {
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

export function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

export function formatDateToKey(dateObj) {
  if (!dateObj) return ''
  const d = new Date(dateObj)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}${mm}${yyyy}`
}

export function formatDateToISO(dateObj) {
  if (!dateObj) return ''
  if (typeof dateObj?.toDate === 'function') {
    const d = dateObj.toDate()
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  }
  if (typeof dateObj === 'number') {
    const d = new Date(dateObj)
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  }
  if (dateObj instanceof Date) {
    return isNaN(dateObj.getTime()) ? '' : dateObj.toISOString().slice(0, 10)
  }
  if (typeof dateObj === 'string') {
    const s = dateObj.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
    if (match) {
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
    }
    if (/^\d{8}$/.test(s)) {
      return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return ''
}

export function formatDateDisplay(dateInput) {
  if (!dateInput) return 'N/A'
  // Handle ddMMyyyy
  if (typeof dateInput === 'string' && /^\d{8}$/.test(dateInput)) {
    const day = dateInput.slice(0, 2)
    const month = parseInt(dateInput.slice(2, 4), 10) - 1
    const year = dateInput.slice(4, 8)
    const d = new Date(year, month, day)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return String(dateInput)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function getDayName(dateInput) {
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { weekday: 'short' })
}

/**
 * Checks if a record matches a given site identifier across multiple potential fields.
 */
export function matchesSite(record, site) {
  if (!record || !site) return false
  const targetId = String(site.id || site.siteId || site.siteCode || '').trim().toLowerCase()
  const targetName = String(site.projectName || site.siteName || site.name || '').trim().toLowerCase()
  const targetCode = String(site.siteCode || site.code || '').trim().toLowerCase()

  const recSiteId = String(record.siteId || record.site_id || record.projectId || record.project_id || record.id || '').trim().toLowerCase()
  const recSiteName = String(record.siteName || record.site_name || record.projectName || record.project_name || record.name || '').trim().toLowerCase()
  const recSiteCode = String(record.siteCode || record.code || '').trim().toLowerCase()

  if (targetId && (recSiteId === targetId || recSiteName === targetId)) return true
  if (targetName && (recSiteName === targetName || recSiteId === targetName)) return true
  if (targetCode && (recSiteCode === targetCode || recSiteId === targetCode)) return true

  return false
}

// ------------------------------------------------------------------------------------------------
// 1. SITE / PROJECT EXPENSES REPORT HUB
// ------------------------------------------------------------------------------------------------

/**
 * Sub-Report 1A: Daily Site Expenses Calculation
 * Gathers 5 breakdown cards: Labour, Material, Food, Transport/Fuel, Manager & Org Bills
 */
export function calculateDailySiteExpenses({
  site,
  selectedDate,
  selectedStage,
  siteSupervisorEntries = [],
  managerExpenses = [],
  organizationEntries = [],
  contractorEntries = [],
  totalSiteExpensesPerDay = [],
  dailySiteLogs = [],
}) {
  const targetDateKey = formatDateToKey(selectedDate)
  const targetDateISO = formatDateToISO(selectedDate)

  // Find matching daily records for this site and date
  const supervisorEntry = siteSupervisorEntries.find((entry) => {
    const isThisSite = site ? matchesSite(entry, site) : true
    const entryDateKey = entry.dateKey || formatDateToKey(entry.date || entry.createdAt)
    const entryDateISO = formatDateToISO(entry.date || entry.createdAt)
    const matchesDate = entryDateKey === targetDateKey || entryDateISO === targetDateISO || entry.id?.endsWith?.(targetDateKey)
    const matchesStage = !selectedStage || selectedStage === 'all' || (entry.projectStage || entry.stage) === selectedStage
    return isThisSite && matchesDate && matchesStage
  })

  // Find daily log / manager entry
  const managerEntry = managerExpenses.find((entry) => {
    const isThisSite = site ? matchesSite(entry, site) : true
    const entryDateKey = entry.dateKey || formatDateToKey(entry.date || entry.createdAt)
    const entryDateISO = formatDateToISO(entry.date || entry.createdAt)
    return isThisSite && (entryDateKey === targetDateKey || entryDateISO === targetDateISO || entry.id?.endsWith?.(targetDateKey))
  })

  // Find direct org expenses
  const orgBillsForDay = organizationEntries.filter((entry) => {
    const isThisSite = site ? matchesSite(entry, site) : true
    const entryDateISO = formatDateToISO(entry.date || entry.createdAt)
    return isThisSite && entryDateISO === targetDateISO
  })

  // Find contractor payouts for this day
  const contractorBillsForDay = contractorEntries.filter((entry) => {
    const isThisSite = site ? matchesSite(entry, site) : true
    const entryDateISO = formatDateToISO(entry.date || entry.createdAt)
    return isThisSite && entryDateISO === targetDateISO
  })

  // 1. Labour breakdown
  const labours = Array.isArray(supervisorEntry?.labours)
    ? supervisorEntry.labours.map((item) => ({
        role: item.role || item.trade || item.name || 'Worker',
        count: parseAmount(item.count || item.headcount || 1),
        rate: parseAmount(item.rate || item.unitRate || item.dailyWage || 0),
        amount: parseAmount(item.totalAmount || item.amount || (parseAmount(item.count || 1) * parseAmount(item.rate || item.dailyWage || 0))),
      }))
    : []
  const totalLabour = labours.reduce((acc, curr) => acc + curr.amount, parseAmount(supervisorEntry?.totalLabourAmount || supervisorEntry?.labourTotal || 0))

  // 2. Material breakdown
  const materials = Array.isArray(supervisorEntry?.materials)
    ? supervisorEntry.materials.map((item) => ({
        name: item.materialName || item.name || 'Material Item',
        quantity: parseAmount(item.quantity || item.qty || 0),
        unit: item.unit || 'Units',
        unitPrice: parseAmount(item.unitPrice || item.rate || item.price || 0),
        amount: parseAmount(item.totalAmount || item.amount || (parseAmount(item.quantity || 0) * parseAmount(item.unitPrice || 0))),
      }))
    : []
  const totalMaterial = materials.reduce((acc, curr) => acc + curr.amount, parseAmount(supervisorEntry?.totalMaterialAmount || supervisorEntry?.materialTotal || 0))

  // 3. Food allowance
  const foodAmount = parseAmount(supervisorEntry?.foodAllowance || supervisorEntry?.foodExpense || supervisorEntry?.food || 0)

  // 4. Transport & Fuel
  const transportAmount = parseAmount(supervisorEntry?.transportAmount || supervisorEntry?.fuelExpense || supervisorEntry?.transport || 0)

  // 5. Manager & Org Bills
  const bills = []
  if (managerEntry) {
    if (Array.isArray(managerEntry.bills)) {
      managerEntry.bills.forEach((b) => {
        bills.push({
          source: 'Manager Voucher',
          description: b.description || b.category || 'Manager Approved Expense',
          amount: parseAmount(b.amount || b.totalAmount),
          vendor: b.vendor || b.vendorName || 'Voucher',
        })
      })
    } else if (managerEntry.amount || managerEntry.totalAmount) {
      bills.push({
        source: 'Manager Voucher',
        description: managerEntry.description || 'Manager Expense Entry',
        amount: parseAmount(managerEntry.amount || managerEntry.totalAmount),
        vendor: managerEntry.vendorName || 'Manager Approved',
      })
    }
  }

  orgBillsForDay.forEach((b) => {
    bills.push({
      source: 'Direct Org Bill',
      description: b.description || b.title || 'Central Office Expense',
      amount: parseAmount(b.amount || b.totalAmount),
      vendor: b.vendorName || b.partyName || 'Direct Bill',
    })
  })

  contractorBillsForDay.forEach((b) => {
    bills.push({
      source: 'Contractor Payout',
      description: `${b.contractorName || 'Contractor'} - ${b.category || b.workDescription || 'Contract Works'}`,
      amount: parseAmount(b.totalAmount || b.amount || b.paidAmount),
      vendor: b.contractorName || 'Contractor',
    })
  })

  const totalBills = bills.reduce((acc, curr) => acc + curr.amount, 0)
  const grandTotal = totalLabour + totalMaterial + foodAmount + transportAmount + totalBills

  return {
    siteName: site?.projectName || site?.siteName || site?.name || 'Selected Site',
    siteLocation: site?.siteLocation || site?.location || 'Registered Site Location',
    supervisorName: supervisorEntry?.supervisorName || site?.supervisor || site?.managerName || 'Assigned Supervisor',
    projectStage: supervisorEntry?.projectStage || site?.projectStage || selectedStage || 'Foundation',
    date: selectedDate,
    labours,
    totalLabour,
    materials,
    totalMaterial,
    foodAmount,
    transportAmount,
    bills,
    totalBills,
    grandTotal,
    hasData: grandTotal > 0 || labours.length > 0 || materials.length > 0,
  }
}

/**
 * Sub-Report 1B: Date Range Expenses Calculation
 * Computes day-by-day chronological entries and KPI summary grid
 */
export function calculateDateRangeExpenses({
  site,
  fromDate,
  toDate,
  selectedStage,
  siteSupervisorEntries = [],
  managerExpenses = [],
  organizationEntries = [],
  contractorEntries = [],
  totalSiteExpensesPerDay = [],
}) {
  const start = new Date(fromDate)
  const end = new Date(toDate)
  const dayCards = []

  let totalRangeLabour = 0
  let totalRangeMaterial = 0
  let totalRangeFood = 0
  let totalRangeTransport = 0
  let totalRangeBills = 0
  let grandRangeTotal = 0

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
    const cur = new Date(start)
    while (cur <= end) {
      const curISO = formatDateToISO(cur)
      const dayData = calculateDailySiteExpenses({
        site,
        selectedDate: curISO,
        selectedStage,
        siteSupervisorEntries,
        managerExpenses,
        organizationEntries,
        contractorEntries,
        totalSiteExpensesPerDay,
      })

      if (dayData.hasData || dayData.grandTotal > 0) {
        dayCards.push({
          date: curISO,
          dayName: getDayName(curISO),
          ...dayData,
        })
        totalRangeLabour += dayData.totalLabour
        totalRangeMaterial += dayData.totalMaterial
        totalRangeFood += dayData.foodAmount
        totalRangeTransport += dayData.transportAmount
        totalRangeBills += dayData.totalBills
        grandRangeTotal += dayData.grandTotal
      }

      cur.setDate(cur.getDate() + 1)
    }
  }

  const activeSitesSet = new Set()
  dayCards.forEach((d) => {
    if (d.siteName) activeSitesSet.add(d.siteName)
  })

  const daysCount = dayCards.length
  const avgDailySpend = daysCount > 0 ? grandRangeTotal / daysCount : 0
  const activeSitesCount = activeSitesSet.size || (site ? 1 : 0)

  return {
    siteName: site ? (site.projectName || site.siteName || site.name) : 'All Portfolio Sites',
    fromDate: formatDateDisplay(fromDate),
    toDate: formatDateDisplay(toDate),
    daysCount,
    dayCards,
    kpis: {
      totalLabour: totalRangeLabour,
      totalMaterial: totalRangeMaterial,
      totalFood: totalRangeFood,
      totalTransport: totalRangeTransport,
      totalBills: totalRangeBills,
      grandTotal: grandRangeTotal,
      avgDailySpend,
      activeSitesCount,
    },
  }
}

/**
 * Sub-Report 1C: Lifetime Site Summary
 */
export function calculateSiteLifetimeSummary({
  site,
  totalSiteExpensesPerDay = [],
  siteSupervisorEntries = [],
  sitePayments = [],
  contractorEntries = [],
  siteSupervisorIncentives = [],
}) {
  const emptyKpis = {
    budget: 0,
    received: 0,
    spent: 0,
    cashInHand: 0,
    budgetRemaining: 0,
    usagePercent: 0,
  }

  if (!site) {
    return {
      siteId: '',
      siteName: 'No Site Selected',
      siteLocation: 'N/A',
      currentStage: 'N/A',
      supervisorName: 'N/A',
      budget: 0,
      totalReceived: 0,
      totalSpent: 0,
      cashInHand: 0,
      budgetRemaining: 0,
      utilizationRate: 0,
      kpis: emptyKpis,
      breakdown: {
        labour: 0,
        material: 0,
        foodTransport: 0,
        bills: 0,
        incentives: 0,
      },
    }
  }

  const budget = parseAmount(site.projectBudget || site.budget || site.estimatedBudget || 0)
  
  // Received payments
  const matchingPayments = sitePayments.filter((p) => matchesSite(p, site))
  const totalReceived = matchingPayments.reduce((acc, p) => acc + parseAmount(p.amountPaid || p.amount || p.totalAmount || 0), parseAmount(site.amountPaid || site.receivedAmount || 0))

  // Calculate spent from totalSiteExpensesPerDay or rolled-up entries
  const matchingDayRollups = totalSiteExpensesPerDay.filter((r) => matchesSite(r, site))
  let totalLabour = 0
  let totalMaterial = 0
  let totalFoodTransport = 0
  let totalBills = 0
  let totalIncentives = 0

  if (matchingDayRollups.length > 0) {
    matchingDayRollups.forEach((r) => {
      totalLabour += parseAmount(r.totalLabour || r.labourAmount || 0)
      totalMaterial += parseAmount(r.totalMaterial || r.materialAmount || 0)
      totalFoodTransport += parseAmount(r.totalFood || r.foodExpense || 0) + parseAmount(r.totalTransport || r.transportExpense || 0)
      totalBills += parseAmount(r.totalBills || r.billsAmount || 0)
    })
  } else {
    // Fallback to entries
    const supEntries = siteSupervisorEntries.filter((e) => matchesSite(e, site))
    supEntries.forEach((e) => {
      totalLabour += parseAmount(e.totalLabourAmount || e.labourTotal || 0)
      totalMaterial += parseAmount(e.totalMaterialAmount || e.materialTotal || 0)
      totalFoodTransport += parseAmount(e.foodAllowance || 0) + parseAmount(e.transportAmount || 0)
    })
  }

  const matchingIncentives = siteSupervisorIncentives.filter((inc) => matchesSite(inc, site))
  totalIncentives = matchingIncentives.reduce((acc, inc) => acc + parseAmount(inc.incentiveAmount || inc.amount || 0), 0)

  const totalSpent = parseAmount(site.amountSpent || site.spentAmount) || (totalLabour + totalMaterial + totalFoodTransport + totalBills + totalIncentives)
  const cashInHand = totalReceived - totalSpent
  const budgetRemaining = budget - totalSpent
  const utilizationRate = budget > 0 ? parseFloat(((totalSpent / budget) * 100).toFixed(1)) : 0

  const kpis = {
    budget,
    received: totalReceived,
    spent: totalSpent,
    cashInHand,
    budgetRemaining,
    usagePercent: utilizationRate,
  }

  return {
    siteId: site.id,
    siteName: site.projectName || site.siteName || site.name || 'Site',
    siteLocation: site.siteLocation || site.location || 'Location',
    currentStage: site.projectStage || site.stage || 'Foundation',
    supervisorName: site.supervisor || site.managerName || 'Assigned Supervisor',
    budget,
    totalReceived,
    totalSpent,
    cashInHand,
    budgetRemaining,
    utilizationRate,
    kpis,
    breakdown: {
      labour: totalLabour,
      material: totalMaterial,
      foodTransport: totalFoodTransport,
      bills: totalBills,
      incentives: totalIncentives,
    },
  }
}

// ------------------------------------------------------------------------------------------------
// 2. PROJECT STAGE EXPENSES REPORT HUB
// ------------------------------------------------------------------------------------------------

export const PROJECT_STAGES = []

export function calculateProjectStageReport({
  selectedStage,
  sites = [],
  siteSupervisorEntries = [],
  managerExpenses = [],
  organizationEntries = [],
  contractorEntries = [],
  siteSupervisorProjectStageSchedule = [],
}) {
  const targetStage = selectedStage || ''

  const stageMatches = (rawStage, target) => {
    if (!rawStage || !target) return false
    const s1 = String(rawStage).trim().toLowerCase()
    const s2 = String(target).trim().toLowerCase()
    if (s1 === s2) return true
    const c1 = s1.replace(/^\d+[\.\s\-]+/, '').trim()
    const c2 = s2.replace(/^\d+[\.\s\-]+/, '').trim()
    return c1 === c2 || s1.includes(s2) || s2.includes(s1) || (c1 && c2 && (c1.includes(c2) || c2.includes(c1)))
  }

  // Filter sites currently in this stage
  const sitesInStage = targetStage
    ? sites.filter((s) => {
        return stageMatches(s.projectStage || s.stage, targetStage)
      })
    : []

  // Filter all entries tagged with this stage across all sites
  const stageEntries = targetStage
    ? siteSupervisorEntries.filter((e) => {
        return stageMatches(e.projectStage || e.stage || e.workStage, targetStage)
      })
    : []

  let stageTotalLabour = 0
  let stageTotalMaterial = 0
  let stageTotalFoodTransport = 0
  let stageTotalBills = 0

  stageEntries.forEach((e) => {
    stageTotalLabour += parseAmount(e.totalLabourAmount || e.labourTotal || 0)
    stageTotalMaterial += parseAmount(e.totalMaterialAmount || e.materialTotal || 0)
    stageTotalFoodTransport += parseAmount(e.foodAllowance || 0) + parseAmount(e.transportAmount || 0)
  })

  const grandStageSpend = stageTotalLabour + stageTotalMaterial + stageTotalFoodTransport + stageTotalBills

  // Match stage schedule budget if available
  const matchingSchedules = siteSupervisorProjectStageSchedule.filter((sch) =>
    stageMatches(sch.projectStage || sch.stage, targetStage)
  )
  const stageEstimatedBudget = matchingSchedules.reduce(
    (sum, sch) => sum + parseAmount(sch.estimatedStageBudget || sch.stageBudget || sch.budget || 0),
    sitesInStage.reduce((sum, s) => sum + parseAmount(s.projectBudget || s.budget || 0) * 0.15, 0)
  )

  const stageVariance = stageEstimatedBudget - grandStageSpend
  const stageCompletionPct = stageEstimatedBudget > 0 ? Math.min(100, Math.round((grandStageSpend / stageEstimatedBudget) * 100)) : 0

  let scheduleAlert = 'On Schedule'
  let alertTone = 'green'
  if (stageVariance < 0) {
    scheduleAlert = `Overdue / Budget Exceeded by ${money(Math.abs(stageVariance))}`
    alertTone = 'red'
  } else if (stageCompletionPct >= 80) {
    scheduleAlert = 'Near Completion'
    alertTone = 'blue'
  }

  const stageSiteSummary = sites.map((s) => {
    const isCurrentlyInStage = stageMatches(s.projectStage || s.stage, targetStage)
    const entriesForSiteAndStage = siteSupervisorEntries.filter((e) => matchesSite(e, s) && stageMatches(e.projectStage || e.stage || e.workStage, targetStage))
    
    let spentInStage = 0
    entriesForSiteAndStage.forEach((e) => {
      spentInStage += parseAmount(e.totalAmount || (parseAmount(e.totalLabourAmount || 0) + parseAmount(e.totalMaterialAmount || 0) + parseAmount(e.foodAllowance || 0) + parseAmount(e.transportAmount || 0)))
    })

    return {
      siteId: s.id,
      siteName: s.projectName || s.siteName || s.name || 'Site',
      location: s.siteLocation || s.location || 'Location',
      currentStage: s.projectStage || s.stage || 'Foundation',
      isCurrentlyInStage,
      entriesCount: entriesForSiteAndStage.length,
      spentInStage,
      siteBudget: parseAmount(s.projectBudget || s.budget || 0),
    }
  })

  return {
    selectedStage: targetStage,
    sitesCountInStage: sitesInStage.length,
    stageEstimatedBudget,
    grandStageSpend,
    stageVariance,
    stageCompletionPct,
    scheduleAlert,
    alertTone,
    stageTotalLabour,
    stageTotalMaterial,
    stageTotalFoodTransport,
    stageTotalBills,
    stageSiteSummary,
    detailedEntries: stageEntries.slice(0, 50),
  }
}

// ------------------------------------------------------------------------------------------------
// 3. SITE STATUS & TIMELINE REPORT
// ------------------------------------------------------------------------------------------------

export function calculateSiteStatusReport(sites = []) {
  const statusCounts = {
    live: 0,
    in_progress: 0,
    planning: 0,
    completed: 0,
    on_hold: 0,
    other: 0,
  }

  const today = new Date()
  let totalBudgetAllocated = 0
  let totalSpent = 0

  const siteList = sites.map((s) => {
    const statusRaw = String(s.currentStatus || s.status || s.projectStatus || 'in_progress').toLowerCase().replace(/\s+/g, '_')
    if (statusCounts[statusRaw] !== undefined) {
      statusCounts[statusRaw] += 1
    } else {
      statusCounts.other += 1
    }

    const progress = parseAmount(s.percentageCompleted || s.progress || s.progressPercentage || 0)
    const plannedStart = s.plannedStartDate || s.startDate || null
    const plannedEnd = s.plannedEndDate || s.targetCompletionDate || s.endDate || null
    const actualStart = s.actualStartDate || null
    const actualEnd = s.actualEndDate || s.completionDate || null

    const siteBudget = parseAmount(s.projectBudget || s.budget || s.estimatedBudget || 0)
    const siteSpent = parseAmount(s.amountSpent || s.spentAmount || 0)

    totalBudgetAllocated += siteBudget
    totalSpent += siteSpent

    const spentRatio = siteBudget > 0 ? siteSpent / siteBudget : 0
    let expenseStatus = 'on_budget' // 'on_budget', 'high_expense', 'budget_exceeded'
    if (spentRatio >= 1.0) {
      expenseStatus = 'budget_exceeded'
    } else if (spentRatio >= 0.8) {
      expenseStatus = 'high_expense'
    }

    let delayStatus = 'on_track' // 'on_track', 'approaching_deadline', 'delayed'
    let delayDays = 0

    if (plannedEnd) {
      const targetDate = new Date(plannedEnd)
      if (!isNaN(targetDate.getTime())) {
        const diffMs = targetDate.getTime() - today.getTime()
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        if (diffDays < 0 && progress < 100) {
          delayStatus = 'delayed'
          delayDays = Math.abs(diffDays)
        } else if (diffDays <= 14 && progress < 80) {
          delayStatus = 'approaching_deadline'
          delayDays = diffDays
        }
      }
    }

    return {
      siteId: s.id,
      siteName: s.projectName || s.siteName || s.name || 'Site',
      location: s.siteLocation || s.location || 'Site Location',
      manager: s.managerName || s.manager || s.supervisor || 'Assigned Manager',
      stage: s.projectStage || s.stage || 'Foundation',
      status: s.currentStatus || s.status || 'In Progress',
      progress,
      plannedStart: formatDateDisplay(plannedStart),
      plannedEnd: formatDateDisplay(plannedEnd),
      actualStart: formatDateDisplay(actualStart),
      actualEnd: formatDateDisplay(actualEnd),
      delayStatus,
      delayDays,
      siteBudget,
      siteSpent,
      expenseStatus,
      spentRatio: Math.round(spentRatio * 100),
    }
  })

  const totalActiveSites = statusCounts.live + statusCounts.in_progress
  const totalCompletedSites = statusCounts.completed
  const totalDelayedSites = siteList.filter((s) => s.delayStatus === 'delayed').length
  const overallSpendingPct = totalBudgetAllocated > 0 ? Math.round((totalSpent / totalBudgetAllocated) * 100) : 0

  return {
    totalSites: sites.length,
    totalActiveSites,
    totalCompletedSites,
    totalDelayedSites,
    totalBudgetAllocated,
    totalSpent,
    overallSpendingPct,
    statusCounts,
    siteList,
  }
}

// ------------------------------------------------------------------------------------------------
// 4. FINANCIAL STATUS & CASH FLOW REPORT
// ------------------------------------------------------------------------------------------------

export function calculateFinancialStatusReport({ sites = [], sitePayments = [], totalSiteExpensesPerDay = [] }) {
  let totalContractBudget = 0
  let totalClientReceived = 0
  let totalActualSpent = 0

  const statements = sites.map((s) => {
    const budget = parseAmount(s.projectBudget || s.budget || s.estimatedBudget || 0)
    
    // Payments received for site
    const matchingPayments = sitePayments.filter((p) => matchesSite(p, s))
    const received = matchingPayments.reduce((acc, p) => acc + parseAmount(p.amountPaid || p.amount || p.totalAmount || 0), parseAmount(s.amountPaid || s.receivedAmount || 0))

    // Real-time spent
    const matchingDayRollups = totalSiteExpensesPerDay.filter((r) => matchesSite(r, s))
    let spent = parseAmount(s.amountSpent || s.spentAmount || 0)
    if (matchingDayRollups.length > 0) {
      spent = matchingDayRollups.reduce((acc, r) => acc + parseAmount(r.totalAllExpenses || r.totalAmount || r.totalSpend || 0), 0)
    }

    const cashInHand = received - spent
    const budgetRemaining = budget - spent
    const utilizationRate = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0

    totalContractBudget += budget
    totalClientReceived += received
    totalActualSpent += spent

    return {
      siteId: s.id,
      siteName: s.projectName || s.siteName || s.name || 'Site',
      location: s.siteLocation || s.location || 'Location',
      stage: s.projectStage || s.stage || 'Foundation',
      budget,
      received,
      spent,
      cashInHand,
      budgetRemaining,
      utilizationRate,
      health: utilizationRate > 95 ? 'Critical' : utilizationRate > 80 ? 'Warning' : 'Healthy',
    }
  })

  const totalCashInHand = totalClientReceived - totalActualSpent
  const totalBudgetRemaining = totalContractBudget - totalActualSpent
  const overallUtilization = totalContractBudget > 0 ? ((totalActualSpent / totalContractBudget) * 100).toFixed(1) : '0.0'
  const pendingCustomerAmount = Math.max(0, totalContractBudget - totalClientReceived)

  return {
    kpis: {
      totalContractBudget,
      totalClientReceived,
      totalActualSpent,
      totalCashInHand,
      totalBudgetRemaining,
      overallUtilization,
      pendingCustomerAmount,
    },
    statements,
  }
}

// ------------------------------------------------------------------------------------------------
// 5. PETTY CASH INSIGHTS & AUDIT REPORT
// ------------------------------------------------------------------------------------------------

export function calculatePettyCashInsights({
  sites = [],
  pettyCashAccounts = [],
  pettyCashExpenses = [],
  pettyCashRequests = [],
}) {
  let totalDisbursed = 0
  let totalSpent = 0

  // Filter approved/completed requests
  const approvedRequests = pettyCashRequests.filter((r) => {
    const st = String(r.status || '').toUpperCase()
    return st === 'APPROVED' || st === 'COMPLETED'
  })
  const totalApproved = approvedRequests.reduce((sum, r) => sum + parseAmount(r.amount || r.totalAmount || 0), 0)

  // Category breakdown totals
  const categories = {
    materials: 0,
    fuel: 0,
    labour_food: 0,
    admin: 0,
  }

  // Site Audit List
  const siteAuditList = sites.map((s) => {
    const acc = pettyCashAccounts.find((a) => matchesSite(a, s))
    const matchingExpenses = pettyCashExpenses.filter((e) => matchesSite(e, s))
    
    const disbursed = parseAmount(acc?.totalDisbursed || acc?.openingBalance || acc?.totalPettyCashReceived || 0)
    const spent = matchingExpenses.reduce((sum, e) => sum + parseAmount(e.amount || e.totalAmount || 0), parseAmount(acc?.pettyCashSpent || acc?.totalSpent || 0))
    const floatBalance = parseAmount(acc?.remainingPettyCash || acc?.balance || (disbursed - spent))

    totalDisbursed += disbursed
    totalSpent += spent

    return {
      siteId: s.id,
      siteName: s.projectName || s.siteName || s.name || 'Site',
      supervisor: s.supervisor || s.managerName || acc?.supervisorName || 'Site Supervisor',
      disbursed,
      spent,
      balance: floatBalance,
      isOverspent: spent > disbursed && disbursed > 0,
      status: spent > disbursed ? 'Overspent' : 'Healthy',
      expensesCount: matchingExpenses.length,
    }
  })

  // If there are accounts without sites
  pettyCashAccounts.forEach((acc) => {
    const alreadyIncluded = siteAuditList.some((item) => item.siteId === acc.id || item.siteName === acc.projectName)
    if (!alreadyIncluded) {
      const disbursed = parseAmount(acc.totalDisbursed || acc.openingBalance || acc.totalPettyCashReceived || 0)
      const spent = parseAmount(acc.pettyCashSpent || acc.totalSpent || 0)
      const balance = parseAmount(acc.remainingPettyCash || acc.balance || (disbursed - spent))
      totalDisbursed += disbursed
      totalSpent += spent
      siteAuditList.push({
        siteId: acc.id,
        siteName: acc.projectName || acc.siteName || acc.id,
        supervisor: acc.supervisorName || 'Supervisor',
        disbursed,
        spent,
        balance,
        isOverspent: spent > disbursed,
        status: spent > disbursed ? 'Overspent' : 'Healthy',
        expensesCount: 0,
      })
    }
  })

  // Categorize expenses
  pettyCashExpenses.forEach((exp) => {
    const cat = String(exp.category || '').toLowerCase()
    const amt = parseAmount(exp.amount || exp.totalAmount || 0)
    if (cat.includes('material') || cat.includes('cement') || cat.includes('steel') || cat.includes('brick') || cat.includes('sand')) {
      categories.materials += amt
    } else if (cat.includes('fuel') || cat.includes('vehicle') || cat.includes('transport') || cat.includes('logistics')) {
      categories.fuel += amt
    } else if (cat.includes('labour') || cat.includes('food') || cat.includes('refreshment') || cat.includes('wages')) {
      categories.labour_food += amt
    } else {
      categories.admin += amt
    }
  })

  const netFloatInHand = (totalApproved || totalDisbursed) - totalSpent

  // Itemized transactions list
  const itemizedLedger = pettyCashExpenses.map((exp) => ({
    id: exp.id,
    date: formatDateDisplay(exp.date || exp.createdAt),
    rawDate: exp.date || exp.createdAt,
    siteName: exp.projectName || exp.siteName || exp.siteId || 'Site',
    supervisor: exp.supervisorName || exp.supervisorUid || 'Supervisor',
    vendor: exp.vendorName || exp.vendor || 'Local Vendor',
    category: exp.category || 'General Site Expense',
    description: exp.description || 'Petty cash purchase',
    amount: parseAmount(exp.amount || exp.totalAmount || 0),
    status: exp.status || 'Approved',
  }))

  return {
    kpis: {
      totalApproved: totalApproved || totalDisbursed,
      totalDisbursed,
      totalSpent,
      netFloatInHand,
      remainingPettyCash: (totalApproved || totalDisbursed) - totalSpent,
    },
    categoryBreakdown: [
      { name: 'Material Expenses', amount: categories.materials, desc: 'Cement, steel, bricks, sand' },
      { name: 'Fuel & Vehicle Rentals', amount: categories.fuel, desc: 'Site fuel, logistics, equipment' },
      { name: 'Site Labour & Food Expenses', amount: categories.labour_food, desc: 'Daily worker refreshments, food' },
      { name: 'Admin & Miscellaneous', amount: categories.admin, desc: 'Stationery, site admin, utilities' },
    ],
    siteAuditList,
    itemizedLedger,
  }
}

// ------------------------------------------------------------------------------------------------
// 6. DOMAIN & INVENTORY REPORTS
// ------------------------------------------------------------------------------------------------

export function calculateDomainReports({
  type,
  contractors = [],
  contractorBills = [],
  contractorEntries = [],
  materials = [],
  tools = [],
  workers = [],
  workerAttendance = [],
  vehicles = [],
  siteSupervisorIncentives = [],
  siteSupervisorEntries = [],
  siteMaterialPool = [],
  materialsAvailability = [],
  materialAllocations = [],
  sites = [],
  siteId = 'all',
  fromDate = null,
  toDate = null,
  stage = 'all',
}) {
  switch (type) {
    case 'contractors': {
      const rawList = contractorEntries.length > 0 ? contractorEntries : contractorBills
      const list = rawList.map((entry) => {
        const billAmount = parseAmount(entry.billAmount || entry.totalAmount || entry.amount || entry.grossAmount || 0)
        const paidAmount = parseAmount(entry.paidAmount || entry.amountPaid || entry.totalPaid || 0)
        const balanceAmount = parseAmount(entry.balanceAmount || entry.pendingBalance || (billAmount - paidAmount))
        return {
          contractorName: entry.contractorName || entry.name || 'Contractor',
          siteName: entry.siteName || entry.projectName || entry.siteId || 'Site',
          trade: entry.category || entry.trade || entry.workType || 'General Civil',
          description: entry.workDescription || entry.description || entry.title || 'Subcontracted Work',
          date: formatDateDisplay(entry.date || entry.createdAt),
          billAmount,
          paidAmount,
          balanceAmount,
          amount: billAmount,
          status: entry.status || 'Approved',
        }
      })

      const uniqueContractors = new Set(list.map((c) => c.contractorName)).size || contractors.length
      const totalBillValue = list.reduce((sum, item) => sum + item.billAmount, 0)
      const totalPaidAmount = list.reduce((sum, item) => sum + item.paidAmount, 0)
      const totalPendingBalance = list.reduce((sum, item) => sum + item.balanceAmount, 0)

      return {
        type: 'contractors',
        title: 'Contractor Payouts & Subcontractor MB Report',
        totalRegisteredContractors: uniqueContractors,
        totalBillValue,
        totalPaidAmount,
        totalPendingBalance,
        totalPayout: totalBillValue,
        records: list,
      }
    }

    case 'materials': {
      const cleanKey = (str) => (str || '').trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '')

      // Site matching helper
      const isTargetSite = (record) => {
        if (!siteId || siteId === 'all') return true
        const target = String(siteId).trim().toLowerCase()
        const recSiteId = String(record?.siteId || record?.projectId || record?.id || '').trim().toLowerCase()
        const recSiteCode = String(record?.siteCode || '').trim().toLowerCase()
        const recSiteName = String(record?.siteName || record?.projectName || record?.name || '').trim().toLowerCase()
        if (recSiteId === target || recSiteCode === target || recSiteName === target) return true

        const matchedSite = sites.find((s) => s.id === siteId)
        if (matchedSite) {
          const sName = String(matchedSite.projectName || matchedSite.siteName || matchedSite.name || '').trim().toLowerCase()
          const sCode = String(matchedSite.siteCode || '').trim().toLowerCase()
          if (sName && (recSiteName === sName || recSiteId === sName)) return true
          if (sCode && (recSiteCode === sCode || recSiteId === sCode)) return true
        }
        return false
      }

      // Date range matching helper
      const isTargetDate = (d) => {
        if (!fromDate && !toDate) return true
        if (!d) return true
        const dateStr = formatDateToISO(d)
        if (!dateStr) return true
        if (fromDate && dateStr < fromDate) return false
        if (toDate && dateStr > toDate) return false
        return true
      }

      // Project stage matching helper
      const isTargetStage = (record) => {
        if (!stage || stage === 'all') return true
        const target = String(stage).trim().toLowerCase()
        const recStage = String(record?.projectStage || record?.stage || record?.currentStage || record?.stageName || '').trim().toLowerCase()
        return recStage === target
      }

      // Map to hold aggregated material information
      const matMap = new Map()

      // 1. Process master materials catalog
      materials.forEach((m) => {
        const name = (m.materialName || m.name || m.displayName || m.item || '').trim()
        if (!name) return
        const key = cleanKey(name) || m.id
        const unitRate = parseAmount(m.unitPrice ?? m.unitRate ?? m.standardRate ?? m.materialPrice ?? m.rate ?? m.price ?? m.cost ?? 0)
        const centralStock = parseAmount(m.currentTotalStock ?? m.currentStock ?? m.availableCount ?? m.quantity ?? 0)
        const minReorder = parseAmount(m.minReorderLevel ?? m.minReorder ?? 10)
        const rawVal = parseAmount(m.totalValuation ?? m.valuation ?? 0)

        matMap.set(key, {
          materialName: name,
          category: m.materialCategory || m.category || m.categoryName || 'Construction Materials',
          unit: m.materialUnit || m.unit || m.unitName || 'Units',
          unitRate,
          centralStock,
          allocated: parseAmount(m.allocatedStock ?? m.allocated ?? 0),
          consumed: parseAmount(m.totalConsumed ?? m.consumed ?? 0),
          minReorder,
          rawValuation: rawVal,
        })
      })

      // 2. Process central warehouse availability (materialsAvailability)
      materialsAvailability.forEach((w) => {
        const name = (w.materialName || w.name || '').trim()
        if (!name) return
        const key = cleanKey(name) || w.id
        const rate = parseAmount(w.unitPrice ?? w.unitRate ?? w.materialPrice ?? w.standardRate ?? w.rate ?? w.price ?? 0)
        const count = parseAmount(w.availableCount ?? w.companyAvailableCount ?? w.currentStock ?? w.quantity ?? 0)
        const existing = matMap.get(key)
        if (existing) {
          if (count > 0 || existing.centralStock === 0) existing.centralStock = count
          if (rate > 0 && existing.unitRate === 0) existing.unitRate = rate
          if (w.unit && (!existing.unit || existing.unit === 'Units')) existing.unit = w.unit
          if (w.category && (!existing.category || existing.category === 'Construction Materials')) existing.category = w.category
        } else {
          matMap.set(key, {
            materialName: name,
            category: w.category || w.materialCategory || 'Construction Materials',
            unit: w.unit || w.materialUnit || 'Units',
            unitRate: rate,
            centralStock: count,
            allocated: 0,
            consumed: 0,
            minReorder: 10,
            rawValuation: 0,
          })
        }
      })

      // 3. Process siteMaterialPool
      const matchingPools = siteMaterialPool.filter((p) => isTargetSite(p))
      matchingPools.forEach((p) => {
        const name = (p.materialName || p.name || '').trim()
        if (!name) return
        const key = cleanKey(name) || p.id
        const rate = parseAmount(p.unitPrice ?? p.unitRate ?? p.materialPrice ?? p.standardRate ?? p.rate ?? 0)
        const existing = matMap.get(key)
        if (existing) {
          if (rate > 0 && existing.unitRate === 0) existing.unitRate = rate
          if (p.unit && (!existing.unit || existing.unit === 'Units')) existing.unit = p.unit
          if (p.category && (!existing.category || existing.category === 'Construction Materials')) existing.category = p.category
        } else {
          matMap.set(key, {
            materialName: name,
            category: p.category || p.materialCategory || 'Construction Materials',
            unit: p.unit || p.materialUnit || 'Units',
            unitRate: rate,
            centralStock: 0,
            allocated: 0,
            consumed: 0,
            minReorder: 10,
            rawValuation: 0,
          })
        }
      })

      // 4. Process materialAllocations
      const matchingAllocations = materialAllocations.filter((a) => {
        if (!isTargetSite(a)) return false
        const aDate = a.allocationDate || a.date || a.createdAt
        if (!isTargetDate(aDate)) return false
        if (a.projectStage || a.stage) {
          if (!isTargetStage(a)) return false
        }
        return true
      })
      matchingAllocations.forEach((a) => {
        const name = (a.materialName || a.name || '').trim()
        if (!name) return
        const key = cleanKey(name) || a.id
        const rate = parseAmount(a.unitRate ?? a.unitPrice ?? a.rate ?? (a.quantity ? parseAmount(a.amount || 0) / parseAmount(a.quantity) : 0))
        const existing = matMap.get(key)
        if (existing) {
          if (rate > 0 && existing.unitRate === 0) existing.unitRate = rate
          if (a.unit && (!existing.unit || existing.unit === 'Units')) existing.unit = a.unit
        } else {
          matMap.set(key, {
            materialName: name,
            category: a.category || 'Construction Materials',
            unit: a.unit || 'Units',
            unitRate: rate,
            centralStock: 0,
            allocated: 0,
            consumed: 0,
            minReorder: 10,
            rawValuation: 0,
          })
        }
      })

      // 5. Process siteSupervisorEntries (Daily site consumption)
      const matchingEntries = siteSupervisorEntries.filter((e) => {
        if (!isTargetSite(e)) return false
        const eDate = e.date || e.createdAt
        if (!isTargetDate(eDate)) return false
        if (!isTargetStage(e)) return false
        return true
      })
      matchingEntries.forEach((e) => {
        const matList = Array.isArray(e.materials) ? e.materials : (Array.isArray(e.materialsConsumed) ? e.materialsConsumed : [])
        matList.forEach((mItem) => {
          const name = (mItem.materialName || mItem.name || mItem.type || '').trim()
          if (!name) return
          const key = cleanKey(name)
          const rate = parseAmount(mItem.unitPrice ?? mItem.price ?? mItem.rate ?? (mItem.quantity ? parseAmount(mItem.amount || mItem.total || 0) / parseAmount(mItem.quantity) : 0))
          const existing = matMap.get(key)
          if (existing) {
            if (rate > 0 && existing.unitRate === 0) existing.unitRate = rate
            if (mItem.unit && (!existing.unit || existing.unit === 'Units')) existing.unit = mItem.unit
          } else {
            matMap.set(key, {
              materialName: name,
              category: mItem.category || 'Construction Materials',
              unit: mItem.unit || 'Units',
              unitRate: rate,
              centralStock: 0,
              allocated: 0,
              consumed: 0,
              minReorder: 10,
              rawValuation: 0,
            })
          }
        })
      })

      // Now compute per-material values
      const isSpecificSite = Boolean(siteId && siteId !== 'all')
      const hasDateFilter = Boolean(fromDate || toDate)
      const hasStageFilter = Boolean(stage && stage !== 'all')

      let list = Array.from(matMap.entries()).map(([key, item]) => {
        const matchesMat = (record) => {
          const recName = (record?.materialName || record?.name || record?.type || '').trim()
          return cleanKey(recName) === key || recName.toLowerCase() === item.materialName.toLowerCase()
        }

        // Pools for this material
        const matPools = matchingPools.filter(matchesMat)

        // Allocations for this material
        const matAllocs = matchingAllocations.filter(matchesMat)
        const allocFromRecords = matAllocs.reduce((sum, a) => sum + parseAmount(a.quantity ?? a.qty ?? a.allocatedCount ?? 0), 0)
        const allocFromPools = matPools.reduce((sum, p) => sum + parseAmount(p.totalAllocated ?? p.availableCount ?? 0), 0)
        
        let allocated = 0
        if (hasDateFilter) {
          allocated = allocFromRecords
        } else {
          allocated = allocFromRecords > 0 ? allocFromRecords : (allocFromPools > 0 ? allocFromPools : item.allocated)
        }

        // Consumptions from matching supervisor entries
        let consumedFromEntries = 0
        let entryRate = 0
        matchingEntries.forEach((e) => {
          const matList = Array.isArray(e.materials) ? e.materials : (Array.isArray(e.materialsConsumed) ? e.materialsConsumed : [])
          matList.forEach((mItem) => {
            if (matchesMat(mItem)) {
              consumedFromEntries += parseAmount(mItem.quantity ?? mItem.qty ?? mItem.count ?? 0)
              const r = parseAmount(mItem.unitPrice ?? mItem.price ?? mItem.rate ?? 0)
              if (r > 0) entryRate = r
            }
          })
        })

        const consumedFromPools = matPools.reduce((sum, p) => sum + parseAmount(p.totalConsumed ?? p.consumedCount ?? 0), 0)
        
        let consumed = 0
        if (hasDateFilter || hasStageFilter) {
          consumed = consumedFromEntries
        } else {
          consumed = consumedFromEntries > 0 ? consumedFromEntries : (consumedFromPools > 0 ? consumedFromPools : item.consumed)
        }

        // Current Stock:
        let currentStock = 0
        const sitePoolBalance = matPools.reduce((sum, p) => sum + parseAmount(p.currentBalance ?? p.availableCount ?? 0), 0)

        if (isSpecificSite) {
          currentStock = sitePoolBalance > 0
            ? sitePoolBalance
            : Math.max(0, allocated - consumed)
        } else {
          const totalOnSiteStock = siteMaterialPool.filter(matchesMat).reduce((sum, p) => sum + parseAmount(p.currentBalance ?? p.availableCount ?? 0), 0)
          currentStock = (item.centralStock > 0 || totalOnSiteStock > 0)
            ? (item.centralStock + totalOnSiteStock)
            : (item.centralStock || Math.max(0, allocated - consumed))
        }

        // Unit rate resolution:
        let unitRate = item.unitRate
        if (unitRate === 0 && entryRate > 0) unitRate = entryRate
        if (unitRate === 0 && matAllocs.length > 0) {
          const allocR = parseAmount(matAllocs[0].unitRate ?? matAllocs[0].unitPrice ?? matAllocs[0].rate ?? 0)
          if (allocR > 0) unitRate = allocR
        }
        if (unitRate === 0 && matPools.length > 0) {
          const poolR = parseAmount(matPools[0].unitPrice ?? matPools[0].unitRate ?? matPools[0].materialPrice ?? matPools[0].rate ?? 0)
          if (poolR > 0) unitRate = poolR
        }

        // Valuation:
        let valuation = 0
        if (currentStock > 0 && unitRate > 0) {
          valuation = currentStock * unitRate
        } else if (allocated > 0 && unitRate > 0 && isSpecificSite) {
          valuation = allocated * unitRate
        } else if (item.rawValuation > 0) {
          valuation = item.rawValuation
        } else if (consumed > 0 && unitRate > 0) {
          valuation = consumed * unitRate
        }

        // Status:
        let status = 'Adequate'
        if (currentStock <= 0) {
          status = 'Out of Stock'
        } else if (currentStock <= item.minReorder) {
          status = 'Reorder Warning'
        } else {
          status = 'Adequate'
        }

        return {
          materialName: item.materialName,
          category: item.category,
          unit: item.unit,
          currentStock,
          allocated,
          consumed,
          unitRate,
          valuation,
          status,
          _hasSiteAffinity: matPools.length > 0 || matAllocs.length > 0 || consumedFromEntries > 0 || currentStock > 0 || allocated > 0 || consumed > 0,
        }
      })

      // If a specific site is selected, filter to materials with activity or presence on that site
      if (isSpecificSite) {
        const siteSpecificRows = list.filter((r) => r._hasSiteAffinity)
        if (siteSpecificRows.length > 0) {
          list = siteSpecificRows
        }
      }

      // Clean up internal metadata helper
      list = list.map(({ _hasSiteAffinity, ...rest }) => rest)

      // Sort by Material Name ascending
      list.sort((a, b) => a.materialName.localeCompare(b.materialName))

      const totalValuation = list.reduce((sum, item) => sum + item.valuation, 0)
      const totalStock = list.reduce((sum, item) => sum + item.currentStock, 0)
      const totalAllocated = list.reduce((sum, item) => sum + item.allocated, 0)
      const totalConsumed = list.reduce((sum, item) => sum + item.consumed, 0)

      return {
        type: 'materials',
        title: 'Material Stock, Allocation & Consumption Report',
        totalValuation,
        totalStock,
        totalAllocated,
        totalConsumed,
        summary: {
          totalValuation,
          totalStock,
          totalAllocated,
          totalConsumed,
          totalMaterials: list.length,
        },
        records: list,
      }
    }

    case 'tools': {
      const list = tools.map((t) => ({
        toolName: t.name || t.toolName || 'Tool Asset',
        assetTag: t.assetTag || t.serialNo || t.id,
        category: t.category || 'Power Tools',
        location: t.currentProjectName || t.currentProjectId || t.location || 'Central Yard',
        custodian: t.assignedTo || t.custodian || 'Storekeeper',
        condition: t.condition || 'Good',
        status: t.status || t.currentStatus || 'Deployed',
      }))
      return { type: 'tools', title: 'Tools & Machinery Asset Allocation Register', totalTools: list.length, records: list }
    }

    case 'workers': {
      const list = (workerAttendance.length > 0 ? workerAttendance : workers).map((w) => ({
        workerName: w.name || w.workerName || 'Worker',
        trade: w.roleCategory || w.trade || w.skillType || 'Mason',
        siteName: w.projectName || w.siteName || w.siteId || 'Site',
        date: formatDateDisplay(w.date || new Date()),
        status: w.status || w.attendanceStatus || 'Present',
        wageRate: parseAmount(w.dailyWageRate || w.dailyWage || w.rate || 0),
        hours: parseAmount(w.shiftHours || w.hours || 8),
        overtimeHours: parseAmount(w.otHours || w.overtime || 0),
        totalPayable: parseAmount(w.totalWage || w.totalPayable || (parseAmount(w.dailyWageRate || 0))),
      }))
      const totalWageLiability = list.reduce((sum, item) => sum + item.totalPayable, 0)
      return { type: 'workers', title: 'Workforce Attendance Muster Roll & Wage Sheet', totalWageLiability, records: list }
    }

    case 'vehicles': {
      const list = vehicles.map((v) => ({
        vehicleName: v.name || v.vehicleName || v.model || 'Commercial Vehicle',
        regNumber: v.registrationNumber || v.regNo || v.plateNumber || 'Reg Pending',
        assignedSite: v.assignedSite || v.projectName || 'Central Fleet',
        driver: v.driverName || v.driver || 'Assigned Driver',
        fuelType: v.fuelType || 'Diesel',
        status: v.status || 'Active',
      }))
      return { type: 'vehicles', title: 'Fleet & Heavy Transport Inventory Report', totalVehicles: list.length, records: list }
    }

    case 'incentives': {
      const list = siteSupervisorIncentives.map((inc) => ({
        supervisorName: inc.supervisorName || inc.name || 'Supervisor',
        siteName: inc.siteName || inc.projectName || inc.siteId || 'Site',
        stage: inc.milestoneStage || inc.stage || 'Milestone Completed',
        date: formatDateDisplay(inc.date || inc.createdAt),
        incentiveAmount: parseAmount(inc.incentiveAmount || inc.amount || 0),
        status: inc.status || 'Approved',
      }))
      const totalIncentives = list.reduce((sum, item) => sum + item.incentiveAmount, 0)
      return { type: 'incentives', title: 'Supervisor Milestone & Performance Incentive Sheet', totalIncentives, records: list }
    }

    default:
      return { type, records: [] }
  }
}

// ------------------------------------------------------------------------------------------------
// LEGACY & CROSS-MODULE COMPATIBILITY EXPORTS
// ------------------------------------------------------------------------------------------------

export const AVAILABLE_REPORTS = [
  { id: 'budget_vs_actual', title: 'Project Budget vs Actual Expenditure Report', category: 'Financials' },
  { id: 'material_consumption', title: 'Material Stock & Procurement Consumption Report', category: 'Procurement' },
  { id: 'petty_cash_audit', title: 'Petty Cash Disbursements & Expense Audit Ledger', category: 'Financials' },
  { id: 'contractor_mb', title: 'Contractor Measurement Sheet (MB) & Retention Statement', category: 'Contracts' },
  { id: 'labour_muster_roll', title: 'Workforce Daily Muster Roll & Wage Liability Report', category: 'Workforce' },
  { id: 'equipment_utilization', title: 'Tools & Heavy Machinery Asset Utilization Report', category: 'Assets' },
  { id: 'quality_snags', title: 'QA/QC Inspection Pass Rate & Snag Resolution Audit', category: 'Quality' },
  { id: 'safety_incidents', title: 'Site Safety Compliance & OSHA Incident Log', category: 'Safety' },
  { id: 'customer_cashflow', title: 'Customer Milestone Invoicing & Receivables Statement', category: 'Financials' },
  { id: 'daily_progress_digest', title: 'Consolidated Daily Site Progress Digest', category: 'Operations' },
]

export function generateReportData(reportId, rawData) {
  const {
    projects = [],
    materials = [],
    pettyCashExpenses = [],
    contractorBills = [],
    workerAttendance = [],
    tools = [],
    qualityChecklists = [],
    safetyIncidents = [],
    customerInvoices = [],
    dailySiteLogs = [],
  } = rawData || {}

  switch (reportId) {
    case 'budget_vs_actual':
      return projects.map((p) => {
        const budget = parseAmount(p.totalBudget || p.budget || p.estimatedBudget)
        const spent = parseAmount(p.spentAmount || p.amountSpent)
        const variance = budget - spent
        const burnRate = budget > 0 ? ((spent / budget) * 100).toFixed(1) : '0.0'
        return {
          'Project Code': p.code || p.siteCode || p.id,
          'Project Name': p.name || p.projectName || 'Site',
          'Current Stage': p.currentStage || p.stage || 'Foundation',
          'Total Budget (INR)': budget,
          'Actual Spent (INR)': spent,
          'Budget Variance (INR)': variance,
          'Burn Rate (%)': `${burnRate}%`,
          'Status': p.status || p.currentStatus || 'Active',
        }
      })

    case 'material_consumption':
      return materials.map((m) => {
        const stock = parseAmount(m.currentTotalStock || m.currentStock || m.quantity)
        const rate = parseAmount(m.standardRate || m.rate)
        const valuation = stock * rate
        return {
          'Material Name': m.name || m.materialName || '',
          'Category': m.category || 'General',
          'Unit': m.unit || 'Bags',
          'Current Stock': stock,
          'Standard Unit Rate (INR)': rate,
          'Stock Valuation (INR)': valuation,
          'Min Safety Threshold': parseAmount(m.minReorderLevel) || 10,
          'Stock Health': stock < (parseAmount(m.minReorderLevel) || 10) ? 'Reorder Needed' : 'Adequate',
        }
      })

    case 'petty_cash_audit':
      return pettyCashExpenses.map((exp) => ({
        'Date': formatDateDisplay(exp.date || exp.createdAt),
        'Supervisor': exp.supervisorName || exp.supervisorUid || 'Supervisor',
        'Site': exp.projectName || exp.projectId || 'Site',
        'Category': exp.category || 'Local Materials',
        'Vendor': exp.vendorName || 'Local Supplier',
        'Description': exp.description || 'Site purchase',
        'Amount (INR)': parseAmount(exp.amount),
        'Status': exp.status || 'Approved',
        'Approved By': exp.approvedBy || 'Manager',
      }))

    case 'contractor_mb':
      return contractorBills.map((b) => ({
        'Bill Ref #': b.billNumber || b.id,
        'Contractor Name': b.contractorName || 'Contractor',
        'Site / Project': b.projectName || b.projectId || 'Site',
        'Measured Quantity': parseAmount(b.measuredQty),
        'Agreed Rate': parseAmount(b.rate),
        'Gross Amount (INR)': parseAmount(b.grossAmount),
        'TDS Deduction (INR)': parseAmount(b.tdsDeduction),
        'Retention 5% (INR)': parseAmount(b.retentionDeduction),
        'Net Payable (INR)': parseAmount(b.netPayable),
        'Billing Status': b.status || 'submitted',
      }))

    case 'labour_muster_roll':
      return workerAttendance.map((att) => ({
        'Date': formatDateDisplay(att.date),
        'Site Name': att.projectName || att.projectId || 'Site',
        'Trade Category': att.roleCategory || att.skillType || 'Masons',
        'Headcount': parseAmount(att.headcount || 1),
        'Shift Hours': parseAmount(att.shiftHours || 8),
        'Overtime (Hrs)': parseAmount(att.otHours),
        'Daily Rate (INR)': parseAmount(att.dailyWageRate),
        'Total Wage Liability (INR)': parseAmount(att.totalWage),
        'Supervisor Recorded': att.supervisorName || 'Supervisor',
      }))

    case 'equipment_utilization':
      return tools.map((t) => ({
        'Asset Tag': t.assetTag || t.modelSerial || t.id,
        'Equipment Name': t.name || t.toolName || '',
        'Category': t.category || 'Power Tools',
        'Ownership': t.ownershipType || 'owned',
        'Current Location': t.currentProjectName || t.currentProjectId || 'Central Yard',
        'Custodian': t.assignedTo || 'Storekeeper',
        'Physical Condition': t.condition || 'Good',
        'Asset Status': t.currentStatus || t.status || 'Active',
      }))

    case 'quality_snags':
      return qualityChecklists.map((qc) => ({
        'Date': formatDateDisplay(qc.inspectionDate),
        'Site': qc.projectName || qc.projectId || 'Site',
        'Inspection Type': qc.inspectionType || 'Reinforcement Inspection',
        'Inspector': qc.inspectedBy || 'Quality Engineer',
        'Checklist Status': qc.status || 'passed',
        'Open Snags Count': Array.isArray(qc.snagList) ? qc.snagList.length : 0,
        'Remarks': qc.remarks || 'No issues',
      }))

    case 'safety_incidents':
      return safetyIncidents.map((s) => ({
        'Incident Date': formatDateDisplay(s.date),
        'Site': s.projectName || s.projectId || 'Site',
        'Severity Level': (s.severity || 'minor').toUpperCase(),
        'Description': s.description || 'Minor incident',
        'Injuries': s.injuredPerson || 'None',
        'Action Taken': s.actionTaken || 'First aid administered',
        'Reported By': s.reportedBy || 'Safety Officer',
      }))

    case 'customer_cashflow':
      return customerInvoices.map((inv) => ({
        'Invoice #': inv.invoiceNumber || inv.id,
        'Customer Name': inv.customerName || 'Client',
        'Site': inv.projectName || inv.projectId || 'Site',
        'Milestone Stage': inv.stageName || inv.stageId || 'Milestone',
        'Base Amount (INR)': parseAmount(inv.baseAmount),
        'GST Tax (INR)': parseAmount(inv.taxGstAmount),
        'Total Demand (INR)': parseAmount(inv.totalPayable || inv.amount),
        'Due Date': formatDateDisplay(inv.dueDate),
        'Payment Status': inv.status || 'issued',
      }))

    case 'daily_progress_digest':
      return dailySiteLogs.map((log) => ({
        'Date': formatDateDisplay(log.date),
        'Site Name': log.projectName || log.projectId || 'Site',
        'Weather': log.weather || 'Sunny',
        'Workforce Count': log.workforceCount?.total || 15,
        'Work Progress Summary': log.workDoneSummary || 'Work ongoing',
        'Bottlenecks / Hindrances': log.hindrances || 'None',
        'Manager Reviewed': log.managerReviewed ? 'Reviewed ✓' : 'Pending Review',
      }))

    default:
      return []
  }
}

