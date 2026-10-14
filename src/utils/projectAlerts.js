/**
 * eBricks / CST White Label - Budget, Expense, Payment, & Project End-Date Alert Utility
 * Evaluates financial and timeline telemetry for projects without mutating existing schemas.
 */

function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

function formatDateString(raw) {
  if (!raw) return 'N/A'
  const d = raw?.toDate ? raw.toDate() : new Date(raw)
  return Number.isNaN(d.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(d)
}

/**
 * Evaluates all active alerts for a single project document.
 * @param {Object} project - Project / Site document
 * @returns {Array} List of active alert objects
 */
export function evaluateProjectAlerts(project) {
  if (!project) return []

  const alerts = []
  const siteName = project.siteName || project.name || project.projectName || 'Project Site'
  const siteCode = project.siteCode || project.code || 'SITE'
  const statusCandidates = [
    project.currentStatus,
    project.status,
    project.projectStatus,
    project.siteStatus,
    project.projectState,
    project.projectStage,
    project.stage,
  ].filter(Boolean).map((s) => String(s).trim().toLowerCase())

  const isCompleted =
    project.isCompleted === true ||
    project.completed === true ||
    statusCandidates.some((s) =>
      ['completed', 'complete', 'closed', 'finished', 'done', 'archived', 'cancelled', 'on hold'].includes(s) ||
      s.includes('complete') ||
      s.includes('closed')
    )

  // Financial Values
  const budget = Number(project.projectBudget ?? project.budget ?? project.totalBudget ?? project.estimatedBudget ?? 0)
  const received = Number(project.amountReceived ?? project.amountPaid ?? project.advancePaid ?? project.receivedPayments ?? 0)
  const expenses = Number(project.totalAmountSpent ?? project.spentAmount ?? project.amountSpent ?? project.amountSpend ?? 0)

  // -----------------------------------------------------------------------------------
  // 1. BUDGET EXPENSE ALERT
  // -----------------------------------------------------------------------------------
  if (expenses > 0) {
    // Expense vs Customer Amount Received
    if (received > 0) {
      const expenseToReceivedRatio = expenses / received
      if (expenses > received) {
        alerts.push({
          id: `exp_over_received_${project.id || project.siteId}`,
          type: 'EXPENSE_ALERT',
          severity: 'CRITICAL',
          title: 'Expenses Exceed Received Amount',
          badgeText: `🚨 Expenses Exceed Received`,
          message: `Expenses (${money(expenses)}) have exceeded customer amount received (${money(received)}).`,
          siteName,
          siteCode,
          color: 'bg-rose-100 text-rose-800 border-rose-200',
          dotColor: 'bg-rose-600',
        })
      } else if (expenseToReceivedRatio >= 0.8) {
        const pct = Math.round(expenseToReceivedRatio * 100)
        alerts.push({
          id: `exp_high_received_${project.id || project.siteId}`,
          type: 'EXPENSE_ALERT',
          severity: 'WARNING',
          title: 'High Expense Ratio vs Received',
          badgeText: `⚠️ High Expense (${pct}% of Received)`,
          message: `Expenses (${money(expenses)}) have reached ${pct}% of customer amount received (${money(received)}).`,
          siteName,
          siteCode,
          color: 'bg-amber-100 text-amber-900 border-amber-200',
          dotColor: 'bg-amber-600',
        })
      }
    }

    // Expense vs Planned Project Budget
    if (budget > 0) {
      const expenseToBudgetRatio = expenses / budget
      if (expenses > budget) {
        alerts.push({
          id: `exp_over_budget_${project.id || project.siteId}`,
          type: 'EXPENSE_ALERT',
          severity: 'CRITICAL',
          title: 'Budget Overrun Alert',
          badgeText: `🚨 Budget Overrun (${Math.round(expenseToBudgetRatio * 100)}%)`,
          message: `Expenses (${money(expenses)}) have exceeded planned project budget (${money(budget)}).`,
          siteName,
          siteCode,
          color: 'bg-rose-100 text-rose-800 border-rose-200',
          dotColor: 'bg-rose-600',
        })
      } else if (expenseToBudgetRatio >= 0.8) {
        const pct = Math.round(expenseToBudgetRatio * 100)
        alerts.push({
          id: `exp_high_budget_${project.id || project.siteId}`,
          type: 'EXPENSE_ALERT',
          severity: 'WARNING',
          title: 'High Budget Consumption',
          badgeText: `⚠️ High Budget Spent (${pct}%)`,
          message: `Expenses (${money(expenses)}) have reached ${pct}% of planned budget (${money(budget)}).`,
          siteName,
          siteCode,
          color: 'bg-amber-100 text-amber-900 border-amber-200',
          dotColor: 'bg-amber-600',
        })
      }
    }
  }

  // -----------------------------------------------------------------------------------
  // 2. CUSTOMER PAYMENT / BUDGET ALERT
  // -----------------------------------------------------------------------------------
  if (budget > 0 && received > 0) {
    const receivedToBudgetRatio = received / budget
    if (receivedToBudgetRatio >= 0.85) {
      const pct = Math.round(receivedToBudgetRatio * 100)
      if (received >= budget) {
        alerts.push({
          id: `payment_completed_${project.id || project.siteId}`,
          type: 'PAYMENT_ALERT',
          severity: 'INFO',
          title: 'Customer Payment Completed',
          badgeText: `💳 100% Budget Received`,
          message: `Customer amount received (${money(received)}) has fully matched planned project budget (${money(budget)}).`,
          siteName,
          siteCode,
          color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          dotColor: 'bg-emerald-600',
        })
      } else {
        alerts.push({
          id: `payment_threshold_${project.id || project.siteId}`,
          type: 'PAYMENT_ALERT',
          severity: 'WARNING',
          title: 'Payment Threshold Alert',
          badgeText: `💳 Payment Threshold (${pct}% Budget)`,
          message: `Received amount (${money(received)}) is approaching planned project budget (${money(budget)}).`,
          siteName,
          siteCode,
          color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          dotColor: 'bg-indigo-600',
        })
      }
    }
  }

  // -----------------------------------------------------------------------------------
  // 3. PLANNED PROJECT END-DATE ALERT
  // -----------------------------------------------------------------------------------
  const rawEnd = project.plannedEndDate || project.endDate || project.targetEndDate || project.actualEndDate
  if (rawEnd && !isCompleted) {
    const endDateObj = rawEnd?.toDate ? rawEnd.toDate() : new Date(rawEnd)
    if (!isNaN(endDateObj.getTime())) {
      const now = new Date()
      // Normalize to midnight for accurate date diff
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const targetMidnight = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate())

      const diffTime = targetMidnight.getTime() - todayMidnight.getTime()
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (daysRemaining > 0 && daysRemaining <= 5) {
        alerts.push({
          id: `end_date_upcoming_${project.id || project.siteId}`,
          type: 'END_DATE_ALERT',
          severity: daysRemaining <= 2 ? 'CRITICAL' : 'WARNING',
          title: 'Upcoming Project End Date',
          badgeText: `⏳ End Date in ${daysRemaining} ${daysRemaining === 1 ? 'Day' : 'Days'}`,
          message: `Your planned project end date is coming in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} (${formatDateString(endDateObj)}).`,
          siteName,
          siteCode,
          daysRemaining,
          color: daysRemaining <= 2 ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-amber-100 text-amber-900 border-amber-200',
          dotColor: daysRemaining <= 2 ? 'bg-rose-600' : 'bg-amber-600',
        })
      } else if (daysRemaining === 0) {
        alerts.push({
          id: `end_date_today_${project.id || project.siteId}`,
          type: 'END_DATE_ALERT',
          severity: 'CRITICAL',
          title: 'Project Planned End Date Today',
          badgeText: `🚨 Planned End Date Today`,
          message: `Your planned project end date is today (${formatDateString(endDateObj)}).`,
          siteName,
          siteCode,
          daysRemaining: 0,
          color: 'bg-rose-100 text-rose-800 border-rose-200',
          dotColor: 'bg-rose-600',
        })
      } else if (daysRemaining < 0) {
        const overdueDays = Math.abs(daysRemaining)
        alerts.push({
          id: `end_date_overdue_${project.id || project.siteId}`,
          type: 'END_DATE_ALERT',
          severity: 'CRITICAL',
          title: 'Project End Date Overdue',
          badgeText: `🚨 Overdue by ${overdueDays} ${overdueDays === 1 ? 'Day' : 'Days'}`,
          message: `Project is overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} past planned end date (${formatDateString(endDateObj)}).`,
          siteName,
          siteCode,
          daysRemaining,
          color: 'bg-rose-100 text-rose-800 border-rose-200',
          dotColor: 'bg-rose-600',
        })
      }
    }
  }

  return alerts
}

/**
 * Evaluates all project documents and returns aggregated alerts grouped by severity.
 * @param {Array} projects - List of all projects
 * @returns {Object} Aggregated metrics and alerts array
 */
export function evaluateAllProjectAlerts(projects = []) {
  const allAlerts = []
  projects.forEach((p) => {
    const pAlerts = evaluateProjectAlerts(p)
    allAlerts.push(...pAlerts)
  })

  const criticalCount = allAlerts.filter((a) => a.severity === 'CRITICAL').length
  const warningCount = allAlerts.filter((a) => a.severity === 'WARNING').length
  const infoCount = allAlerts.filter((a) => a.severity === 'INFO').length

  return {
    alerts: allAlerts,
    totalCount: allAlerts.length,
    criticalCount,
    warningCount,
    infoCount,
  }
}
