# Incentive Workflow: Mobile-to-Web Flow Mapping Specification

**Project:** Construction Management System (Ideal CST / eBricks)  
**Reference Document:** `incentive_flow.txt`  
**Purpose:** Precise architectural mapping of mobile (Flutter) screens, methods, calculations, Firestore collections, and validations to the web application (React).

---

## 1. High-Level Component Mapping

| Lifecycle Stage | Mobile Application (Flutter) | Web Application (React) | Responsibility |
|---|---|---|---|
| **Entry Point (Dashboard)** | `Organization_Dashboard.dart`<br>`insights_dashboard.dart` | `src/pages/organization/Dashboard.jsx`<br>(Nav & Governance Hub) | Navigates to `/organization/incentive-calculation` via sidebar or quick-action tile |
| **Entry Point (Approvals)** | `org_approvals_menu_page.dart` | `src/pages/organization/approvals/OrganizationApprovalsCenter.jsx` | Header action button to launch Incentive Calculation |
| **Entry Point (Reports)** | `site_summary_page.dart`<br>`projectStage_site_summary_report.dart` | `src/pages/organization/reports/DomainInventoryReportsHub.jsx`<br>`OrganizationReportsHub.jsx` | Subreport tab action: "New Incentive Calculation" |
| **Screen 1: Selection** | `IncentiveCalculation`<br>(`incentive_calculation.dart`) | `IncentiveCalculation.jsx`<br>(`src/pages/organization/incentives/IncentiveCalculation.jsx`) | Form to select Site ID, auto-resolve Supervisor Name, and select filtered Project Stage |
| **Screen 2: Sheet** | `IncentiveCalculationSheet`<br>(`incentive_calculation_sheet.dart`) | `IncentiveCalculationSheet.jsx`<br>(`src/pages/organization/incentives/IncentiveCalculationSheet.jsx`) | Comparative labor table, financial summary cards, interactive slider (0-100%), pre-save guards |
| **Backend Service** | `ExpenseService.dart`<br>`updateTotalSiteExpense(siteId)` | `src/services/expenseService.js`<br>`updateTotalSiteExpense(orgId, siteId)` | 5-category expense aggregation queries and atomic project balance rollup |
| **Incentive Service** | In-widget query helpers in mobile | `src/services/incentiveService.js` | Modular data fetch, labor normalization, and multi-document write sequence |

---

## 2. Navigation & Routing Mapping

| Mobile Flow | Web URL Route | Web Dispatcher Component | Access Role |
|---|---|---|---|
| Organization Dashboard → Incentive Calculation | `/organization/incentive-calculation` or `/organization/incentives` | `src/pages/organization/Module.jsx` | Organization Admin |
| Organization Approvals → Incentive Calculation | `/organization/incentive-calculation` | `src/pages/organization/Module.jsx` | Organization Admin |
| Operations Manager → Approvals / Finance Menu | `/manager/incentive-calculation` or `/manager/incentives` | `src/pages/manager/ManagerModule.jsx` | Operations Manager |

---

## 3. Screen 1: Site & Stage Selection Detailed Mapping

### 3.1 Initial Data Hydration (`initState`)

| Mobile Logic (`incentive_calculation.dart`) | Web Implementation (`incentiveService.js` & `IncentiveCalculation.jsx`) |
|---|---|
| Queries `siteSupervisorEntries` from Firestore | Dispatches `fetchIncentiveSiteSupervisorData(orgId)` |
| Extracts distinct `siteIds` Set | Populates `siteIds` state array |
| Builds mapping `siteId -> supervisorName` | Populates `siteSupervisors` state object |
| Builds mapping `siteId -> Set<projectStage>` | Populates `siteProjectStages` state object |
| Supplements missing sites/supervisors | Cross-references `projects` and `siteSupervisorProjectStageSchedule` collections |

### 3.2 Form Interactions & Cascade

| Action | Mobile Implementation | Web Implementation |
|---|---|---|
| **Select Site ID** | `DropdownButtonFormField(value: _selectedSiteId)` | `<select value={selectedSiteId} onChange={...}>` |
| **Auto-resolve Supervisor** | `_supervisorName = _siteSupervisors[newValue]` (Read-only `TextFormField`) | `supervisorName = siteSupervisors[newSiteId]` (Read-only `<input readOnly />`) |
| **Filter Project Stages** | `_filteredProjectStages = _siteProjectStages[newValue]` | `availableStages = siteProjectStages[selectedSiteId]` |
| **Calculate Action** | Validates form, navigates to `IncentiveCalculationSheet` | Validates `selectedSiteId` and `selectedProjectStage`, sets `activeView = 'sheet'` |
| **Reset Action** | Clears state and resets form | Resets to defaults and clears error state |
| **Cancel Action** | `Navigator.pop(context)` | `navigate(-1)` |

---

## 4. Screen 2: Calculation & Approval Sheet Detailed Mapping

### 4.1 Data Fetching Queries

| Query Target | Mobile Implementation | Web Implementation (`incentiveService.js`) |
|---|---|---|
| **Schedule Document** | `siteSupervisorProjectStageSchedule.where('siteId', isEqualTo: siteId).where('projectStage', isEqualTo: projectStage).limit(1)` | `fetchStageScheduleAndActual(orgId, siteId, projectStage)` executes Firestore query on `siteSupervisorProjectStageSchedule` |
| **Actual Document** | `siteSupervisorProjectStageActual.where('siteId', isEqualTo: siteId).where('projectStage', isEqualTo: projectStage).limit(1)` | `fetchStageScheduleAndActual(orgId, siteId, projectStage)` executes Firestore query on `siteSupervisorProjectStageActual` with composite ID fallback |

### 4.2 Guard Checks & Edge Case Handling

| Condition | Mobile Handling | Web Handling |
|---|---|---|
| `reqDays == 0 \|\| appDays == 0 \|\| actDays == 0` | Replaces screen with message: *"Request is not available for this site."* | Evaluates `isStageRequestAvailable(...)`. If false, renders prerequisite warning card with diagnostic day metrics and back button. |
| `actualTotal >= approvedTotal` (Cost Overrun) | `math.max(approvedTotal - actualTotal, 0)` clamps savings to ₹ 0. | `calculateSavings(approvedTotal, actualTotal)` clamps savings to ₹ 0. Disables slider and shows warning. |
| `amountToAdd <= 0` (Zero Incentive) | Halts save, shows SnackBar: *"Incentive amount must be greater than 0"* | Halts save, displays alert: *"Incentive amount must be greater than 0"*, disables save button. |
| Unsaved Slider Adjustment | `WillPopScope` / `PopScope` intercepts back navigation | Back button prompts `Modal`: *"Discard Unsaved Incentive?"* |

### 4.3 Mathematical Calculation Engine

| Metric | Mathematical Formula | Mobile Implementation | Web Implementation (`expenseService.js`) |
|---|---|---|---|
| **Actual Total** | $\text{actDays} \times \text{actPayment}$ | `actDays * actPayment` | `calculateLabourActualTotal(actDays, actPayment)` |
| **Budget Savings** | $\max(\text{approvedTotal} - \text{actualTotal}, 0)$ | `math.max(approvedTotal - actualTotal, 0)` | `calculateSavings(approvedTotal, actualTotal)` |
| **Supervisor Incentive** | $\text{savedAmount} \times \left(\frac{\text{percentage}}{100}\right)$ | `savedAmount * (percentage / 100)` | `calculateIncentive(savedAmount, incentivePercentage)` |
| **Total All Expenses** | $\sum(\text{sup} + \text{mgr} + \text{org} + \text{con} + \text{inc})$ | `supervisorTotal + managerTotal + orgTotal + contractorTotal + incentiveTotal` | `calculateAllExpensesTotals({...})` |
| **Project Balance** | $\text{amountPaid} - \text{totalAllExpenses}$ | `amountPaid - totalAllExpenses` | `calculateProjectBalance(amountPaid, totalAllExpenses)` |

---

## 5. Firestore Persistence & Transaction Sequence

### Write 1: Detailed Audit Record
- **Mobile Target:** `FirebaseFirestore.instance.collection('siteSupervisorIncentives').doc('${siteId}_${supervisor}_${projectStage}')`
- **Web Target:** `doc(db, 'organisation', orgId, 'siteSupervisorIncentives', `${siteId}_${supervisor}_${projectStage}`)`
- **Payload:**
  ```javascript
  {
    siteId: siteId,
    projectName: projectName || siteId,
    projectStage: projectStage,
    supervisorName: supervisor,
    actualAmount: actualTotal,
    approvedAmount: approvedTotal,
    estimatedAmount: requestedTotal,
    savedAmount: savedAmount,
    incentivePercentage: Math.round(incentivePercentage),
    incentiveAmount: amountToAdd,
    updatedAt: serverTimestamp(),
  }
  ```
- **Options:** `{ merge: true }`

### Write 2: Site Expense Accumulator Update
- **Mobile Target:** `FirebaseFirestore.instance.collection('totalSiteExpensesPerDay').doc(siteId)`
- **Web Target:** `doc(db, 'organisation', orgId, 'totalSiteExpensesPerDay', siteId)`
- **Payload:**
  ```javascript
  {
    totalIncentiveExpenses: amountToAdd,
    updatedAt: serverTimestamp(),
  }
  ```
- **Options:** `{ merge: true }`

### Write 3: ExpenseService Aggregation & Atomic Transaction
- **Mobile Execution:** `await ExpenseService.updateTotalSiteExpense(siteId)`
- **Web Execution:** `await ExpenseService.updateTotalSiteExpense(orgId, siteId)` (in `src/services/expenseService.js`)
- **Rollup Steps:**
  1. `_sumSupervisorExpenses`: queries `siteSupervisorEntries` where `siteId == siteId`
  2. `_sumManagerExpenses`: queries `managerExpenses` where `siteId == siteId`
  3. `_sumOrganizationExpenses`: queries `organizationExpenses` where `siteId == siteId`
  4. `_sumContractorExpenses`: queries `contractorEntries` where `siteId == siteId`
  5. `_sumIncentiveExpenses`: queries `siteSupervisorIncentives` where `siteId == siteId`
  6. `runTransaction(db, ...)`:
     - Atomically writes `totalSiteExpensesPerDay/{siteId}` with subtotals and `totalAllExpenses`
     - Queries `projects` for matching `siteId`, reads `amountPaid`
     - Computes `amountBalance = amountPaid - totalAllExpenses`
     - Atomically updates `projects` document: `amountSpent = totalAllExpenses`, `amountBalance = amountBalance`

---

## 6. Shared Database Compatibility Matrix

| Collection Name | Document ID Convention | Mobile Usage | Web Usage | Schema Change? |
|---|---|---|---|---|
| `siteSupervisorProjectStageSchedule` | Auto-ID or Custom ID | Read stage budget ceiling & requested days | Read stage budget ceiling & requested days | **No** (100% Shared) |
| `siteSupervisorProjectStageActual` | `${siteCode}_${supervisor}_${stage}` | Read actual days taken & daily rate | Read actual days taken & daily rate | **No** (100% Shared) |
| `siteSupervisorIncentives` | `${siteId}_${supervisor}_${projectStage}` | Write audit record; read for reports | Write audit record; read for reports & ledger | **No** (100% Shared) |
| `totalSiteExpensesPerDay` | `${siteId}` | Site expense roll-up document | Site expense roll-up document | **No** (100% Shared) |
| `projects` | Auto-ID / `${siteId}` | Ledger for `amountPaid`, `amountSpent`, `amountBalance` | Ledger for `amountPaid`, `amountSpent`, `amountBalance` | **No** (100% Shared) |
| `siteSupervisorEntries` | `${entryId}` | Source of active sites, supervisors & stages | Source of active sites, supervisors & stages | **No** (100% Shared) |

---

## 7. Verification & Automated Test Coverage

The test suite at `src/services/__tests__/incentive.test.js` contains 29 unit tests covering:
- **Actual Total Formula**: standard multiplication, 0 days, 0 rate, decimal rounding, negative clamping.
- **Savings Formula**: normal under-budget savings, exact budget match, cost overrun clamping to 0, string parsing.
- **Incentive Formula**: 15% spec example (₹ 20,000 × 15% = ₹ 3,000), 10% default, 0% rate, 100% rate, 0 savings, percentage clamping [0, 100].
- **Prerequisite Guard**: zero-days guard validation for `reqDays`, `appDays`, `actDays`.
- **5-Category Roll-up**: exact multi-category summation matching ₹ 5,03,000 numerical spec example.
- **Project Balance**: remaining balance ($10,00,000 - 5,03,000 = 4,97,000$), budget deficit / negative balance handling.
- **Labour Grid Normalization**: handling diverse trade keys and merging requested/approved/actual counts.
- **Composite Key Generation**: composite doc ID format validation `${siteId}_${supervisor}_${projectStage}`.

Run tests anytime with:
```bash
npm test
```
