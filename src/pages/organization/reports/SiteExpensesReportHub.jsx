import React, { useState, useMemo } from "react";
import {
  Utensils,
  Truck,
  Fuel,
  Users,
  Package,
  Receipt,
  Calendar,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  Printer,
  Sparkles,
} from "lucide-react";
import {
  money,
  parseAmount,
  formatDateToISO,
  formatDateDisplay,
  calculateDailySiteExpenses,
  calculateDateRangeExpenses,
  calculateSiteLifetimeSummary,
} from "../../../services/reportService";
import {
  exportToCSV,
  printReport,
  fetchOrgNameFromFirestore,
  getActiveOrgId,
} from "../../../services/exportService";
import { useAuth } from "../../../hooks/useAuth";
import {
  CONFIG_SECTIONS,
  subscribeConfigItems,
} from "../../../services/projectConfigService";
import { getNormalizedSiteOptions } from "../../../utils/siteUtils.js";
import { subscribeRoleExpenseData } from "../../../services/reportExpenseService";
import { isNewOrganizationSync } from "../../../services/schemaResolverService";

export default function SiteExpensesReportHub({
  sites = [],
  siteSupervisorEntries = [],
  managerExpenses = [],
  managerEntries = [],
  managerExpenseSummary = [],
  organizationEntries = [],
  organizationExpenses = [],
  organizationExpenseSummary = [],
  contractorEntries = [],
  totalSiteExpensesPerDay = [],
  sitePayments = [],
  siteSupervisorIncentives = [],
  dailySiteLogs = [],
  subReport = null,
  initialSiteId = null,
  initialDate = null,
  initialFromDate = null,
  initialToDate = null,
  initialStage = null,
  projectStages = null,
  orgId = null,
  role = null,
  hideHeaderFilters = false,
  orgName = null,
}) {
  const { orgId: authOrgId, role: authRole, userData } = useAuth();
  const activeOrgId = orgId || authOrgId;
  const activeRole =
    role || authRole || userData?.role || userData?.userRole || "Organization";
  const [stagesFromConfig, setStagesFromConfig] = useState([]);
  const [internalOrgName, setInternalOrgName] = useState(orgName || "");

  React.useEffect(() => {
    let isMounted = true;
    async function loadOrgName() {
      if (orgName) {
        setInternalOrgName(orgName);
        return;
      }
      const targetOrgId = activeOrgId || getActiveOrgId();
      if (targetOrgId) {
        const fetched = await fetchOrgNameFromFirestore(targetOrgId);
        if (isMounted && fetched) setInternalOrgName(fetched);
      }
    }
    loadOrgName();
    return () => {
      isMounted = false;
    };
  }, [orgName, activeOrgId]);

  const effectiveOrgName = orgName || internalOrgName;

  // Real-time synchronization for role-based Firestore collections
  const [realtimeData, setRealtimeData] = useState({
    organizationExpenses: [],
    organizationEntries: [],
    organizationExpenseSummary: [],
    managerExpenses: [],
    managerEntries: [],
    managerExpenseSummary: [],
    siteSupervisorEntries: [],
    contractorEntries: [],
  });

  React.useEffect(() => {
    if (!activeOrgId) return;
    const unsubscribe = subscribeRoleExpenseData(
      activeOrgId,
      activeRole,
      (data) => {
        setRealtimeData(data);
      },
      (err) => console.warn("Realtime expense subscription error:", err),
    );
    return () => unsubscribe();
  }, [activeOrgId, activeRole]);

  // Merge real-time subscription data with props (respecting dual-schema versioning)
  const isNewOrg = isNewOrganizationSync(orgId);
  const resolvedOrgExpenses =
    realtimeData.organizationExpenses.length > 0
      ? realtimeData.organizationExpenses
      : organizationExpenses;
  const resolvedOrgEntries = isNewOrg
    ? []
    : realtimeData.organizationEntries.length > 0
      ? realtimeData.organizationEntries
      : organizationEntries;
  const resolvedOrgSummary = isNewOrg
    ? []
    : realtimeData.organizationExpenseSummary.length > 0
      ? realtimeData.organizationExpenseSummary
      : organizationExpenseSummary;
  const resolvedMgrExpenses =
    realtimeData.managerExpenses.length > 0
      ? realtimeData.managerExpenses
      : managerExpenses;
  const resolvedMgrEntries = isNewOrg
    ? []
    : realtimeData.managerEntries.length > 0
      ? realtimeData.managerEntries
      : managerEntries;
  const resolvedMgrSummary = isNewOrg
    ? []
    : realtimeData.managerExpenseSummary.length > 0
      ? realtimeData.managerExpenseSummary
      : managerExpenseSummary;
  const resolvedSupEntries =
    realtimeData.siteSupervisorEntries.length > 0
      ? realtimeData.siteSupervisorEntries
      : siteSupervisorEntries;
  const resolvedContractorEntries =
    realtimeData.contractorEntries.length > 0
      ? realtimeData.contractorEntries
      : contractorEntries;

  React.useEffect(() => {
    if (projectStages && projectStages.length > 0) return;
    if (!activeOrgId) return;
    const unsub = subscribeConfigItems(
      activeOrgId,
      CONFIG_SECTIONS.stage,
      (list) => setStagesFromConfig(list || []),
      (err) => console.error("Error subscribing to project stages:", err),
    );
    return () => unsub();
  }, [activeOrgId, projectStages]);

  const availableStages = useMemo(() => {
    const sourceList =
      projectStages && projectStages.length > 0
        ? projectStages
        : stagesFromConfig;
    const names = (sourceList || [])
      .map((st) =>
        (typeof st === "string" ? st : st.projectStage || st.name || "").trim(),
      )
      .filter(Boolean);
    return [...new Set(names)];
  }, [projectStages, stagesFromConfig]);

  const normalizedSites = useMemo(
    () => getNormalizedSiteOptions(sites),
    [sites],
  );
  const [activeSubTab, setActiveSubTab] = useState(subReport || "daily"); // 'daily', 'range', 'summary'
  const [selectedSiteId, setSelectedSiteId] = useState(
    initialSiteId || (sites.length > 0 ? "all" : ""),
  );
  const [selectedDate, setSelectedDate] = useState(
    initialDate || new Date().toISOString().slice(0, 10),
  );
  const [selectedStage, setSelectedStage] = useState(initialStage || "all");

  // Sync with prop changes if passed from parent
  React.useEffect(() => {
    if (
      subReport &&
      (subReport === "daily" ||
        subReport === "range" ||
        subReport === "summary")
    ) {
      setActiveSubTab(subReport);
    }
  }, [subReport]);

  React.useEffect(() => {
    if (initialSiteId !== undefined && initialSiteId !== null) {
      setSelectedSiteId(initialSiteId);
    }
  }, [initialSiteId]);

  React.useEffect(() => {
    if (initialDate !== undefined && initialDate !== null) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  React.useEffect(() => {
    if (initialStage !== undefined && initialStage !== null) {
      setSelectedStage(initialStage);
    }
  }, [initialStage]);

  React.useEffect(() => {
    if (initialFromDate) setFromDate(initialFromDate);
  }, [initialFromDate]);

  React.useEffect(() => {
    if (initialToDate) setToDate(initialToDate);
  }, [initialToDate]);

  // Date Range state
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().slice(0, 10);
  }, []);
  const [fromDate, setFromDate] = useState(initialFromDate || defaultFrom);
  const [toDate, setToDate] = useState(
    initialToDate || new Date().toISOString().slice(0, 10),
  );
  const [expandedDates, setExpandedDates] = useState({});

  // Selected site object (handles 'all' sites gracefully)
  const selectedSite = useMemo(() => {
    if (!selectedSiteId || selectedSiteId === "all") {
      return {
        id: "all",
        siteId: "all",
        projectName: "All Managed Sites",
        siteName: "All Managed Sites",
        siteLocation: "All Active Portfolio Locations",
      };
    }
    return (
      sites.find(
        (s) => s.id === selectedSiteId || s.siteId === selectedSiteId,
      ) || {
        id: selectedSiteId,
        siteId: selectedSiteId,
        projectName: selectedSiteId,
      }
    );
  }, [sites, selectedSiteId]);

  // Toggle Accordion in Range Report
  const toggleDateAccordion = (dateStr) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  // ----------------------------------------------------------------------------------------------
  // 1A. DAILY SITE EXPENSES REPORT CALCULATION
  // ----------------------------------------------------------------------------------------------
  const dailyReport = useMemo(() => {
    return calculateDailySiteExpenses({
      site: selectedSite,
      selectedDate,
      selectedStage,
      siteSupervisorEntries: resolvedSupEntries,
      managerExpenses: resolvedMgrExpenses,
      managerEntries: resolvedMgrEntries,
      managerExpenseSummary: resolvedMgrSummary,
      organizationEntries: resolvedOrgEntries,
      organizationExpenses: resolvedOrgExpenses,
      organizationExpenseSummary: resolvedOrgSummary,
      contractorEntries: resolvedContractorEntries,
      totalSiteExpensesPerDay,
      dailySiteLogs,
      role: activeRole,
    });
  }, [
    selectedSite,
    selectedDate,
    selectedStage,
    resolvedSupEntries,
    resolvedMgrExpenses,
    resolvedMgrEntries,
    resolvedMgrSummary,
    resolvedOrgEntries,
    resolvedOrgExpenses,
    resolvedOrgSummary,
    resolvedContractorEntries,
    totalSiteExpensesPerDay,
    dailySiteLogs,
    activeRole,
  ]);

  // ----------------------------------------------------------------------------------------------
  // 1B. DATE RANGE EXPENSES REPORT CALCULATION
  // ----------------------------------------------------------------------------------------------
  const rangeReport = useMemo(() => {
    return calculateDateRangeExpenses({
      site: selectedSite,
      fromDate,
      toDate,
      selectedStage,
      siteSupervisorEntries: resolvedSupEntries,
      managerExpenses: resolvedMgrExpenses,
      managerEntries: resolvedMgrEntries,
      organizationExpenses: resolvedOrgExpenses,
      organizationEntries: resolvedOrgEntries,
      contractorEntries: resolvedContractorEntries,
      totalSiteExpensesPerDay,
      dailySiteLogs,
    });
  }, [
    selectedSite,
    fromDate,
    toDate,
    selectedStage,
    resolvedSupEntries,
    resolvedMgrExpenses,
    resolvedMgrEntries,
    resolvedOrgExpenses,
    resolvedOrgEntries,
    resolvedContractorEntries,
    totalSiteExpensesPerDay,
    dailySiteLogs,
  ]);

  // ----------------------------------------------------------------------------------------------
  // 1C. LIFETIME SITE SUMMARY CALCULATION
  // ----------------------------------------------------------------------------------------------
  const lifetimeSummary = useMemo(() => {
    return calculateSiteLifetimeSummary({
      site: selectedSite,
      totalSiteExpensesPerDay,
      siteSupervisorEntries: resolvedSupEntries,
      sitePayments,
      contractorEntries: resolvedContractorEntries,
      siteSupervisorIncentives,
    });
  }, [
    selectedSite,
    totalSiteExpensesPerDay,
    resolvedSupEntries,
    sitePayments,
    resolvedContractorEntries,
    siteSupervisorIncentives,
  ]);

  // Handlers for CSV & Print
  const handleExportDailyCSV = () => {
    const rows = [
      ...dailyReport.labours.map((l) => [
        "Labour",
        l.role,
        `${l.count} workers @ ${money(l.rate)}`,
        l.count,
        l.amount,
      ]),
      ...dailyReport.materials.map((m) => [
        "Material",
        m.name,
        `${m.unitPrice ? `@ ${money(m.unitPrice)}` : ""}`,
        `${m.quantity} ${m.unit}`,
        m.amount,
      ]),
      [
        "Food Allowance",
        "Supervisor Food Allowance & Refreshments",
        "Daily Food Allowance",
        "-",
        dailyReport.foodAmount,
      ],
      [
        "Transport Allowance",
        "Site Logistics & Travel",
        "Daily Transport",
        "-",
        dailyReport.transportAmount,
      ],
      [
        "Fuel Expense",
        "Vehicle & Machinery Fuel",
        "Site Fuel (Diesel / Petrol)",
        "-",
        dailyReport.fuelAmount || 0,
      ],
      ...dailyReport.bills.map((b) => [
        b.source,
        b.description,
        b.billNumber || b.billNo
          ? `${b.vendor} (Bill #${b.billNumber || b.billNo})`
          : b.vendor,
        b.quantity !== undefined && b.quantity !== null && b.quantity !== ""
          ? b.quantity
          : "-",
        b.amount,
      ]),
    ];
    exportToCSV(
      `Daily_Report_${selectedSite?.projectName || "Site"}_${selectedDate}`,
      [
        "Category",
        "Item / Description",
        "Unit / Details",
        "Quantity",
        "Amount (INR)",
      ],
      rows,
      { orgName: effectiveOrgName },
    );
  };

  const handlePrintDailyPDF = () => {
    const totalOps =
      (dailyReport.foodAmount || 0) +
      (dailyReport.transportAmount || 0) +
      (dailyReport.fuelAmount || 0);

    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Daily Site Expenses Report</h2>
        ${effectiveOrgName ? `<p style="margin: 4px 0; color: #0B3470; font-weight: bold;"><strong>Organization:</strong> ${effectiveOrgName}</p>` : ""}
        <p style="margin: 4px 0; color: #475569;"><strong>Site:</strong> ${dailyReport.siteName} (${dailyReport.siteLocation})</p>
        <p style="margin: 4px 0; color: #475569;"><strong>Date:</strong> ${formatDateDisplay(dailyReport.date)} | <strong>Stage:</strong> ${dailyReport.projectStage} | <strong>Supervisor:</strong> ${dailyReport.supervisorName}</p>
        <div style="background: #0B3470; color: white; padding: 12px; border-radius: 8px; margin-top: 12px; font-size: 16px; font-weight: bold;">
          Grand Total Daily Outflow: ${money(dailyReport.grandTotal)}
        </div>
      </div>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">1. Labour Expenses (Subtotal: ${money(dailyReport.totalLabour)})</h3>
      <table>
        <thead><tr><th>Role / Trade</th><th>Headcount</th><th>Daily Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${dailyReport.labours.length === 0 ? '<tr><td colspan="4">No labour entries logged</td></tr>' : dailyReport.labours.map((l) => `<tr><td>${l.role}</td><td>${l.count}</td><td>${money(l.rate)}</td><td>${money(l.amount)}</td></tr>`).join("")}
        </tbody>
      </table>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">2. Material Expenses (Subtotal: ${money(dailyReport.totalMaterial)})</h3>
      <table>
        <thead><tr><th>Material Name</th><th>Quantity</th><th>Unit Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${dailyReport.materials.length === 0 ? '<tr><td colspan="4">No material entries logged</td></tr>' : dailyReport.materials.map((m) => `<tr><td>${m.name}</td><td>${m.quantity} ${m.unit}</td><td>${money(m.unitPrice)}</td><td>${money(m.amount)}</td></tr>`).join("")}
        </tbody>
      </table>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">3. Food, Transport & Fuel Operations (Subtotal: ${money(totalOps)})</h3>
      <table>
        <thead><tr><th>Operational Expense Head</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Food Allowance</td><td>Supervisor Food Allowance & Daily Refreshments</td><td>${money(dailyReport.foodAmount)}</td></tr>
          <tr><td>Transport Allowance</td><td>Site Logistics, Travel & Commute</td><td>${money(dailyReport.transportAmount)}</td></tr>
          <tr><td>Fuel Expense</td><td>Vehicle, Machinery & Generator Fuel</td><td>${money(dailyReport.fuelAmount || 0)}</td></tr>
        </tbody>
      </table>

      <h3 style="color: #0f172a; margin-top: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">4. Manager & Direct Org Bills (Subtotal: ${money(dailyReport.totalBills)})</h3>
      <table>
        <thead><tr><th>Source</th><th>Description</th><th>Vendor / Party</th><th style="text-align: center;">Quantity</th><th>Amount</th></tr></thead>
        <tbody>
          ${dailyReport.bills.length === 0 ? '<tr><td colspan="5">No manager/org bills recorded for this date</td></tr>' : dailyReport.bills.map((b) => `<tr><td>${b.source}</td><td>${b.description}</td><td>${b.vendor}${b.billNumber || b.billNo ? ` (#${b.billNumber || b.billNo})` : ""}</td><td style="text-align: center;">${b.quantity !== undefined && b.quantity !== null && b.quantity !== "" ? b.quantity : "-"}</td><td>${money(b.amount)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
    printReport(`Daily Site Expenses - ${dailyReport.siteName}`, content, {
      orgName: effectiveOrgName,
    });
  };

  const handleExportRangeCSV = () => {
    const rows = rangeReport.dayCards.map((day) => [
      day.date,
      day.dayName,
      day.totalLabour,
      day.totalMaterial,
      day.foodAmount,
      day.transportAmount,
      day.fuelAmount || 0,
      day.totalBills,
      day.grandTotal,
    ]);
    exportToCSV(
      `Date_Range_Report_${selectedSite?.projectName || "Site"}_${fromDate}_to_${toDate}`,
      [
        "Date",
        "Day",
        "Labour (INR)",
        "Materials (INR)",
        "Food (INR)",
        "Transport (INR)",
        "Fuel (INR)",
        "Bills (INR)",
        "Daily Total (INR)",
      ],
      rows,
      { orgName: effectiveOrgName },
    );
  };

  const handlePrintRangePDF = () => {
    const totalFoodAndTransportFuel =
      (rangeReport.kpis.totalFood || 0) +
      (rangeReport.kpis.totalTransport || 0) +
      (rangeReport.kpis.totalFuel || 0);

    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0; color: #0B3470;">Date Range Site Expenses Statement</h2>
        ${effectiveOrgName ? `<p style="margin: 4px 0; color: #0B3470; font-weight: bold;"><strong>Organization:</strong> ${effectiveOrgName}</p>` : ""}
        <p style="margin: 4px 0; color: #475569;"><strong>Site:</strong> ${rangeReport.siteName}</p>
        <p style="margin: 4px 0; color: #475569;"><strong>Period:</strong> ${rangeReport.fromDate} to ${rangeReport.toDate} (${rangeReport.daysCount} active days)</p>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 130px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 8px;">
          <small style="color: #1e40af; font-weight: bold;">TOTAL LABOUR</small>
          <div style="font-size: 16px; font-weight: bold; color: #1e3a8a;">${money(rangeReport.kpis.totalLabour)}</div>
        </div>
        <div style="flex: 1; min-width: 130px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 8px;">
          <small style="color: #166534; font-weight: bold;">TOTAL MATERIALS</small>
          <div style="font-size: 16px; font-weight: bold; color: #14532d;">${money(rangeReport.kpis.totalMaterial)}</div>
        </div>
        <div style="flex: 1; min-width: 130px; background: #fffbeb; border: 1px solid #fde68a; padding: 10px; border-radius: 8px;">
          <small style="color: #92400e; font-weight: bold;">FOOD & LOGISTICS</small>
          <div style="font-size: 16px; font-weight: bold; color: #78350f;">${money(totalFoodAndTransportFuel)}</div>
        </div>
        <div style="flex: 1; min-width: 130px; background: #faf5ff; border: 1px solid #e9d5ff; padding: 10px; border-radius: 8px;">
          <small style="color: #6b21a8; font-weight: bold;">BILLS / VOUCHERS</small>
          <div style="font-size: 16px; font-weight: bold; color: #581c87;">${money(rangeReport.kpis.totalBills)}</div>
        </div>
        <div style="flex: 1; min-width: 150px; background: #0B3470; color: white; padding: 10px; border-radius: 8px;">
          <small style="color: #93c5fd; font-weight: bold;">GRAND TOTAL OUTFLOW</small>
          <div style="font-size: 16px; font-weight: bold;">${money(rangeReport.kpis.grandTotal)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Labour (₹)</th>
            <th>Materials (₹)</th>
            <th>Food (₹)</th>
            <th>Transport (₹)</th>
            <th>Fuel (₹)</th>
            <th>Bills / Vouchers (₹)</th>
            <th>Daily Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${
            rangeReport.dayCards.length === 0
              ? '<tr><td colspan="8">No expense records found in selected range.</td></tr>'
              : rangeReport.dayCards
                  .map(
                    (d) => `
            <tr>
              <td><strong>${formatDateDisplay(d.date)}</strong> (${d.dayName})</td>
              <td>${money(d.totalLabour)}</td>
              <td>${money(d.totalMaterial)}</td>
              <td>${money(d.foodAmount)}</td>
              <td>${money(d.transportAmount)}</td>
              <td>${money(d.fuelAmount || 0)}</td>
              <td>${money(d.totalBills)}</td>
              <td><strong>${money(d.grandTotal)}</strong></td>
            </tr>
          `,
                  )
                  .join("")
          }
        </tbody>
      </table>
    `;
    printReport(`Range Report - ${rangeReport.siteName}`, content, {
      orgName: effectiveOrgName,
    });
  };

  const handleExportSummaryCSV = () => {
    const kpis = lifetimeSummary?.kpis || {
      budget: 0,
      received: 0,
      spent: 0,
      cashInHand: 0,
      budgetRemaining: 0,
      usagePercent: 0,
    };
    const rows = [
      ["Total Approved Budget", kpis.budget],
      ["Total Milestone Inflow Received", kpis.received],
      ["Total Actual Spend to Date", kpis.spent],
      ["Net Working Cash in Hand", kpis.cashInHand],
      ["Contract Budget Remaining Cushion", kpis.budgetRemaining],
      ["Budget Utilization Rate", `${kpis.usagePercent}%`],
    ];
    exportToCSV(
      `Site_Summary_${selectedSite?.projectName || "Site"}`,
      ["Metric", "Amount (INR)"],
      rows,
      { orgName: effectiveOrgName },
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Filter & Sub-Report Switcher Card */}
      {!hideHeaderFilters && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                Expense Operations
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Site Expense Reports
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select site and audit period to view itemized vouchers, wage
                sheets, and material consumption ledgers.
              </p>
            </div>

            {/* Sub-report selector tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl self-start lg:self-auto border border-slate-200/80 flex-wrap">
              {[
                { id: "daily", label: "Daily Expense Report",},
                { id: "range", label: "Date Range Report", },
                {
                  id: "summary",
                  label: "Cumulative Expense Summary",
                  
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeSubTab === tab.id
                      ? "bg-[#0B3470] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 bg-transparent"
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Filters Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Select Site
              </label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white transition-all cursor-pointer shadow-2xs"
              >
                <option value="all">All Managed Sites</option>
                {normalizedSites.map((s, idx) => (
                  <option
                    key={`exp-site-${s.id || s.siteId || idx}-${idx}`}
                    value={s.id || s.siteId}
                  >
                    {s.label || s.projectName || s.siteName || s.name || s.id}
                  </option>
                ))}
              </select>
            </div>

            {activeSubTab === "daily" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white transition-all cursor-pointer shadow-2xs"
                />
              </div>
            )}

            {activeSubTab === "range" && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white transition-all cursor-pointer shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white transition-all cursor-pointer shadow-2xs"
                  />
                </div>
              </>
            )}

            {activeSubTab !== "summary" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Select Project Stage
                </label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white transition-all cursor-pointer shadow-2xs"
                >
                  <option value="all">All Stages</option>
                  {availableStages.map((stg) => (
                    <option key={stg} value={stg}>
                      {stg}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <button
                type="button"
                className="w-full py-2 px-4 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-[#082654] transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>⚡</span>
                <span>Generate Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------------------------- */}
      {/* DAILY SITE EXPENSES REPORT VIEW */}
      {/* ----------------------------------------------------------------------------------------- */}
      {activeSubTab === "daily" && (
        <div className="space-y-6">
          {/* Header Metadata Banner */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                Daily Expense Report
              </span>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {dailyReport.siteName}
              </h3>
              <div className="flex items-center gap-3 text-xs text-slate-500 pt-1 flex-wrap">
                <span>{formatDateDisplay(dailyReport.date)}</span>
                <span>·</span>
                <span>
                  Stage:{" "}
                  <strong className="text-slate-800">
                    {dailyReport.projectStage}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Supervisor:{" "}
                  <strong className="text-slate-800">
                    {dailyReport.supervisorName}
                  </strong>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:items-end justify-center">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                Grand Total Daily Expense
              </span>
              <strong className="text-2xl font-extrabold text-[#0B3470] font-mono mt-0.5">
                {money(dailyReport.grandTotal)}
              </strong>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={handleExportDailyCSV}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintDailyPDF}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-[#082654] transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  Print PDF
                </button>
              </div>
            </div>
          </div>

          {/* Empty State if no entries logged */}
          {dailyReport.grandTotal === 0 &&
          dailyReport.labours.length === 0 &&
          dailyReport.materials.length === 0 &&
          dailyReport.bills.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
              
              <h4 className="text-base font-bold text-slate-800">
                No Expense Entries for This Date
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No labour, material, or voucher expenses were logged for{" "}
                <strong>{dailyReport.siteName}</strong> on{" "}
                <strong>{formatDateDisplay(dailyReport.date)}</strong>. Try
                selecting another date or check the Date Range Report.
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("range")}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0B3470] text-white hover:bg-[#082654] transition-all cursor-pointer shadow-xs"
                >
                  View Date Range Report
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Card 1: Labour Expenses */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        1. Labour Expenses
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {dailyReport.labours.length} worker groups recorded
                      </span>
                    </div>
                  </div>
                  <strong className="text-base font-extrabold text-[#0B3470] font-mono">
                    {money(dailyReport.totalLabour)}
                  </strong>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="p-2.5">Role / Trade</th>
                        <th className="p-2.5 text-center">Count</th>
                        <th className="p-2.5 text-right">Daily Rate</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyReport.labours.length === 0 ? (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-6 text-center text-slate-400 italic"
                          >
                            No labour entries for this date
                          </td>
                        </tr>
                      ) : (
                        dailyReport.labours.map((l, i) => (
                          <tr
                            key={i}
                            className="hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="p-2.5 font-medium text-slate-800">
                              {l.role}
                            </td>
                            <td className="p-2.5 text-center text-slate-600">
                              {l.count}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-600">
                              {money(l.rate)}
                            </td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">
                              {money(l.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card 2: Material Expenses */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                   
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        2. Material Expenses
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {dailyReport.materials.length} material logs
                      </span>
                    </div>
                  </div>
                  <strong className="text-base font-extrabold text-emerald-700 font-mono">
                    {money(dailyReport.totalMaterial)}
                  </strong>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="p-2.5">Material</th>
                        <th className="p-2.5 text-center">Quantity</th>
                        <th className="p-2.5 text-right">Unit Price</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyReport.materials.length === 0 ? (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-6 text-center text-slate-400 italic"
                          >
                            No material purchases for this date
                          </td>
                        </tr>
                      ) : (
                        dailyReport.materials.map((m, i) => (
                          <tr
                            key={i}
                            className="hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="p-2.5 font-medium text-slate-800">
                              {m.name}
                            </td>
                            <td className="p-2.5 text-center text-slate-600">
                              {m.quantity} {m.unit}
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-600">
                              {money(m.unitPrice)}
                            </td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">
                              {money(m.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card 3, 4 & 5: Food, Transport & Fuel Operations */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 md:col-span-2">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
                      <Utensils className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        3, 4 & 5. Food, Transport & Fuel Operations
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        Supervisor daily allowances, travel logistics & machinery fuel
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Operations Subtotal
                    </span>
                    <strong className="text-base font-extrabold text-amber-700 font-mono">
                      {money(
                        (dailyReport.foodAmount || 0) +
                          (dailyReport.transportAmount || 0) +
                          (dailyReport.fuelAmount || 0),
                      )}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* 3A. Food Allowance */}
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-100/70 text-orange-700 flex items-center justify-center">
                          <Utensils className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">
                          Food Expenses
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/60">
                        Daily
                      </span>
                    </div>
                    <div className="pt-1">
                      <strong className="text-xl font-extrabold text-slate-900 font-mono block">
                        {money(dailyReport.foodAmount)}
                      </strong>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Supervisor food allowance & site refreshments
                      </span>
                    </div>
                  </div>

                  {/* 3B. Transport Allowance */}
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center">
                          <Truck className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">
                          Transport Expenses
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                        Logistics
                      </span>
                    </div>
                    <div className="pt-1">
                      <strong className="text-xl font-extrabold text-slate-900 font-mono block">
                        {money(dailyReport.transportAmount)}
                      </strong>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Site travel, courier & logistics entries
                      </span>
                    </div>
                  </div>

                  {/* 3C. Fuel Expense */}
                  <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                          <Fuel className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">
                          Fuel Expenses
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                        Fuel
                      </span>
                    </div>
                    <div className="pt-1">
                      <strong className="text-xl font-extrabold text-slate-900 font-mono block">
                        {money(dailyReport.fuelAmount || 0)}
                      </strong>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Vehicles, generators & heavy machinery diesel/petrol
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 6: Manager & Direct Bills */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3 md:col-span-2">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100">
                      <Receipt className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        6. Manager & Direct Org Bills
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {dailyReport.bills.length} corporate vouchers recorded
                      </span>
                    </div>
                  </div>
                  <strong className="text-base font-extrabold text-purple-700 font-mono">
                    {money(dailyReport.totalBills)}
                  </strong>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="p-2.5">Source</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Vendor / Payee</th>
                        <th className="p-2.5 text-center">Quantity</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyReport.bills.length === 0 ? (
                        <tr>
                          <td
                            colSpan="5"
                            className="p-6 text-center text-slate-400 italic"
                          >
                            No manager/org bills recorded for this date
                          </td>
                        </tr>
                      ) : (
                        dailyReport.bills.map((b, i) => (
                          <tr
                            key={i}
                            className="hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="p-2.5 font-bold text-blue-700">
                              {b.source}
                            </td>
                            <td className="p-2.5 text-slate-800">
                              {b.description}
                            </td>
                            <td className="p-2.5 text-slate-500">
                              <span>{b.vendor}</span>
                              {(b.billNumber || b.billNo) && (
                                <span className="block text-[10px] font-mono text-slate-400">
                                  #{b.billNumber || b.billNo}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-700">
                              {b.quantity !== undefined &&
                              b.quantity !== null &&
                              b.quantity !== ""
                                ? b.quantity
                                : "-"}
                            </td>
                            <td className="p-2.5 text-right font-bold font-mono text-slate-900">
                              {money(b.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 1B. DATE RANGE EXPENSES REPORT VIEW */}
      {/* ----------------------------------------------------------------------------------------- */}
      {activeSubTab === "range" && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                Labour Outflows
              </span>
              <strong className="text-2xl font-extrabold text-slate-900 font-mono block">
                {money(rangeReport.kpis.totalLabour)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                Across {rangeReport.daysCount} active days
              </small>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Material Outflows
              </span>
              <strong className="text-2xl font-extrabold text-emerald-700 font-mono block">
                {money(rangeReport.kpis.totalMaterial)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                Procurement invoices
              </small>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                Food & Logistics
              </span>
              <strong className="text-2xl font-extrabold text-amber-700 font-mono block">
                {money(
                  (rangeReport.kpis.totalFood || 0) +
                    (rangeReport.kpis.totalTransport || 0) +
                    (rangeReport.kpis.totalFuel || 0),
                )}
              </strong>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium pt-0.5 flex-wrap">
                <span>F: {money(rangeReport.kpis.totalFood)}</span>
                <span>·</span>
                <span>T: {money(rangeReport.kpis.totalTransport)}</span>
                <span>·</span>
                <span>Fuel: {money(rangeReport.kpis.totalFuel || 0)}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
                Bills & Vouchers
              </span>
              <strong className="text-2xl font-extrabold text-purple-700 font-mono block">
                {money(rangeReport.kpis.totalBills)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                Manager & direct org bills
              </small>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1 border-l-4 border-l-[#0B3470]">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Period Outflow
              </span>
              <strong className="text-2xl font-extrabold text-[#0B3470] font-mono block">
                {money(rangeReport.kpis.grandTotal)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                {rangeReport.fromDate} to {rangeReport.toDate}
              </small>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Showing <strong>{rangeReport.dayCards.length}</strong> active days
              with logged expenditures
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportRangeCSV}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={handlePrintRangePDF}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B3470] text-white hover:bg-[#082654] transition-colors shadow-2xs cursor-pointer"
              >
                Print PDF
              </button>
            </div>
          </div>

          {/* Day-by-Day Accordion Cards */}
          <div className="space-y-3">
            {rangeReport.dayCards.length === 0 ? (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs">
                No expense entries logged for this site during the selected date
                range.
              </div>
            ) : (
              rangeReport.dayCards.map((day) => {
                const isOpen = !!expandedDates[day.date];
                return (
                  <div
                    key={day.date}
                    className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition-all"
                  >
                    <div
                      onClick={() => toggleDateAccordion(day.date)}
                      className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                          {isOpen ? "▲" : "▼"}
                        </span>
                        <div>
                          <strong className="text-sm font-bold text-slate-900 block">
                            {formatDateDisplay(day.date)}
                          </strong>
                          <span className="text-[11px] text-slate-400">
                            {day.dayName}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2.5 text-xs flex-wrap justify-end">
                          <span className="text-slate-500">
                            Labour:{" "}
                            <strong className="font-mono text-slate-700">
                              {money(day.totalLabour)}
                            </strong>
                          </span>
                          <span className="text-slate-500">
                            Material:{" "}
                            <strong className="font-mono text-emerald-700">
                              {money(day.totalMaterial)}
                            </strong>
                          </span>
                          <span className="text-slate-500">
                            Food:{" "}
                            <strong className="font-mono text-orange-700">
                              {money(day.foodAmount)}
                            </strong>
                          </span>
                          <span className="text-slate-500">
                            Transport:{" "}
                            <strong className="font-mono text-blue-700">
                              {money(day.transportAmount)}
                            </strong>
                          </span>
                          <span className="text-slate-500">
                            Fuel:{" "}
                            <strong className="font-mono text-emerald-700">
                              {money(day.fuelAmount || 0)}
                            </strong>
                          </span>
                          <span className="text-slate-500">
                            Bills:{" "}
                            <strong className="font-mono text-purple-700">
                              {money(day.totalBills)}
                            </strong>
                          </span>
                        </div>
                        <strong className="text-base font-extrabold text-[#0B3470] font-mono whitespace-nowrap">
                          {money(day.grandTotal)}
                        </strong>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-4 text-xs animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Labour Breakdown */}
                          <div className="p-3 bg-white rounded-xl border border-slate-100 space-y-2">
                            <strong className="text-slate-900 block text-xs">
                              Labour Breakdown
                            </strong>
                            {day.labours.length === 0 ? (
                              <span className="text-slate-400 italic">
                                No labour logged
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {day.labours.map((l, i) => (
                                  <div
                                    key={i}
                                    className="flex justify-between text-[11px]"
                                  >
                                    <span>
                                      {l.role} ({l.count})
                                    </span>
                                    <strong className="font-mono">
                                      {money(l.amount)}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Material Breakdown */}
                          <div className="p-3 bg-white rounded-xl border border-slate-100 space-y-2">
                            <strong className="text-slate-900 block text-xs">
                              Materials Breakdown
                            </strong>
                            {day.materials.length === 0 ? (
                              <span className="text-slate-400 italic">
                                No materials logged
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {day.materials.map((m, i) => (
                                  <div
                                    key={i}
                                    className="flex justify-between text-[11px]"
                                  >
                                    <span>
                                      {m.name} ({m.quantity} {m.unit})
                                    </span>
                                    <strong className="font-mono text-emerald-700">
                                      {money(m.amount)}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Food, Transport & Fuel Operations */}
                          <div className="p-3 bg-white rounded-xl border border-slate-100 space-y-2 md:col-span-2">
                            <div className="flex items-center justify-between">
                              <strong className="text-slate-900 block text-xs">
                                Food, Transport & Fuel Operations
                              </strong>
                              <span className="font-mono text-xs font-bold text-amber-700">
                                {money(
                                  (day.foodAmount || 0) +
                                    (day.transportAmount || 0) +
                                    (day.fuelAmount || 0),
                                )}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
                              <div className="p-2.5 rounded-lg bg-orange-50/70 border border-orange-100/90 flex items-center justify-between">
                                <span className="text-slate-700 font-medium flex items-center gap-1.5">
                                  <Utensils className="w-3.5 h-3.5 text-orange-600" />
                                  Food Allowance:
                                </span>
                                <strong className="font-mono text-slate-900">
                                  {money(day.foodAmount)}
                                </strong>
                              </div>
                              <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-100/90 flex items-center justify-between">
                                <span className="text-slate-700 font-medium flex items-center gap-1.5">
                                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                                  Transport Allowance:
                                </span>
                                <strong className="font-mono text-slate-900">
                                  {money(day.transportAmount)}
                                </strong>
                              </div>
                              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-100/90 flex items-center justify-between">
                                <span className="text-slate-700 font-medium flex items-center gap-1.5">
                                  <Fuel className="w-3.5 h-3.5 text-emerald-600" />
                                  Fuel Expense:
                                </span>
                                <strong className="font-mono text-slate-900">
                                  {money(day.fuelAmount || 0)}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* Bills Breakdown */}
                          {day.bills && day.bills.length > 0 && (
                            <div className="p-3 bg-white rounded-xl border border-slate-100 space-y-2 md:col-span-2">
                              <div className="flex items-center justify-between">
                                <strong className="text-slate-900 block text-xs">
                                  Manager & Org Bills Breakdown
                                </strong>
                                <span className="font-mono text-xs font-bold text-purple-700">
                                  {money(day.totalBills)}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {day.bills.map((b, i) => (
                                  <div
                                    key={i}
                                    className="flex justify-between items-center text-[11px] py-0.5"
                                  >
                                    <span>
                                      <strong className="text-blue-700">
                                        {b.source}
                                      </strong>
                                      : {b.description} ({b.vendor})
                                      {b.quantity !== undefined &&
                                        b.quantity !== null &&
                                        b.quantity !== "" && (
                                          <span className="ml-1 text-slate-500 font-medium">
                                            | Qty: {b.quantity}
                                          </span>
                                        )}
                                    </span>
                                    <strong className="font-mono text-purple-700">
                                      {money(b.amount)}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------------------------- */}
      {/* 1C. LIFETIME SITE SUMMARY VIEW */}
      {/* ----------------------------------------------------------------------------------------- */}
      {activeSubTab === "summary" && (
        <div className="space-y-6">
          {/* Executive 4-Metric Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Contract Budget
              </span>
              <strong className="text-2xl font-extrabold text-slate-900 font-mono block">
                {money(lifetimeSummary?.kpis?.budget || 0)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                Total contractual baseline
              </small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Invoiced Inflow
              </span>
              <strong className="text-2xl font-extrabold text-emerald-700 font-mono block">
                {money(lifetimeSummary?.kpis?.received || 0)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                Customer payments deposited
              </small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                Consolidated Outflows
              </span>
              <strong className="text-2xl font-extrabold text-rose-600 font-mono block">
                {money(lifetimeSummary?.kpis?.spent || 0)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                All project expenses to date
              </small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
                Operating Cash in Hand
              </span>
              <strong
                className={`text-2xl font-extrabold font-mono block ${(lifetimeSummary?.kpis?.cashInHand || 0) >= 0 ? "text-purple-700" : "text-rose-600"}`}
              >
                {money(lifetimeSummary?.kpis?.cashInHand || 0)}
              </strong>
              <small className="text-slate-400 text-[11px]">
                Received minus spent
              </small>
            </div>
          </div>

          {/* Budget Utilization Progress Bar Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <strong className="text-sm font-bold text-slate-900 block">
                  Overall Budget Utilization
                </strong>
                <span className="text-xs text-slate-500">
                  Remaining Budget Cushion:{" "}
                  <strong>
                    {money(lifetimeSummary?.kpis?.budgetRemaining || 0)}
                  </strong>
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${(lifetimeSummary?.kpis?.usagePercent || 0) >= 85 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
              >
                {lifetimeSummary?.kpis?.usagePercent || 0}% Consumed
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${(lifetimeSummary?.kpis?.usagePercent || 0) >= 85 ? "bg-rose-500" : "bg-[#0B3470]"}`}
                style={{
                  width: `${Math.min(100, lifetimeSummary?.kpis?.usagePercent || 0)}%`,
                }}
              />
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleExportSummaryCSV}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3470] text-white hover:bg-[#082654] transition-colors shadow-2xs cursor-pointer"
            >
              Export Lifetime Summary Statement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
