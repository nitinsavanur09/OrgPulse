# OrgPulse — Claude Code Implementation Instructions (v2)

These instructions replace the previous version entirely. They cover four
separate concerns in a deliberate sequence: currency conversion, data
architecture (the most important), report template refactoring, and
use-case awareness. Read all sections before touching any file.

---

## The core principle governing every change in this document

**The report must never assert a number it did not derive from either the org
scan or a client-provided intake field.** Every figure in the report falls into
exactly one of three categories. If you cannot identify which category a number
belongs to, it should not be in the report.

| Category | Source | Examples |
|---|---|---|
| **Scan-derived** | Computed from live org data via SOQL or Tooling API | Inactive user count, field completion rates, flow counts, article count, duplicate rate |
| **Calculated** | Scan count × named external constant (shown to reader) | Inactive users × license list price, transaction volume × Flex Credit rate |
| **Client-provided** | Collected via intake form before scan runs | Handling cost per transaction, planned use case, actual license unit cost if different from list |

Any number that does not fit one of these three categories — including
industry benchmark estimates, assumed handling costs, assumed transaction
volumes, and assumed deflection rates — must either be removed or presented
as an adjustable assumption with its source explicitly labeled in the UI.

---

## Pre-flight checklist

Before touching any file:

1. Confirm you are working in the project directory containing:
   - `orgpulse_sample_report.html` (V1 — update for currency only)
   - `orgpulse_sample_report_v2.html` (V2 — primary target for all changes)
   - `orgpulse_assessment_framework.html` (update for currency only)
   - `orgpulse_agent_architecture.html` (update for currency + schema)
   - `orgpulse_v2_implementation_guide.html` (internal doc — update last)

2. Create backups:
   ```bash
   for f in orgpulse_sample_report_v2.html orgpulse_sample_report.html \
             orgpulse_agent_architecture.html orgpulse_assessment_framework.html; do
     cp "$f" "${f%.html}.BACKUP.html"
     echo "Backed up $f"
   done
   ```

3. Confirm backups exist:
   ```bash
   ls *.BACKUP.html
   # Expected: four .BACKUP.html files
   ```

4. After every task: open the changed file in Chrome, check the page renders,
   open DevTools console (F12), confirm zero red JS errors.

---

## TASK 1 — Convert all pound (£) symbols to dollar ($) across all report files

Do this first, before any structural changes, so you are never editing a file
that mixes currencies mid-task.

**Rule:** Replace every `£` character with `$`. This covers display values,
JavaScript string literals, template literals, and comments.

```bash
# Run all four replacements
sed -i 's/£/$/'g orgpulse_sample_report_v2.html
sed -i 's/£/$/'g orgpulse_sample_report.html
sed -i 's/£/$/'g orgpulse_agent_architecture.html
sed -i 's/£/$/'g orgpulse_assessment_framework.html

# Verify zero remaining occurrences across all files
grep -rn "£" orgpulse_sample_report_v2.html orgpulse_sample_report.html \
           orgpulse_agent_architecture.html orgpulse_assessment_framework.html
# Expected output: (none — zero matches)
```

After running, manually confirm these specific instances were converted
correctly in `orgpulse_sample_report_v2.html`:
- Cover meta `Annual waste found` → `$18,400`
- Executive summary Box 1 → `$18,400`, Box 2 → `$6,000`
- Section 6 Option B price → `$28,000–$35,000`
- Section 6 Option C price → `$15,000–$18,000`
- Monitoring retainer → `$3,000 / month`
- JS template literals in `updateROI()` and `renderFlexModel()` → `$`

> **Do not change** the British spelling `licence` to `license` in this task.
> That is a separate decision and out of scope here.

---

## TASK 2 — Define the report data schema

**This is the foundational task. Everything else in this document depends on it.**

The report template must read all its data from `window.REPORT_DATA`. There
must be no fallback to hardcoded Acme Corp values in any section that will be
shown to a real client. The sample report is the exception — it is the only
file that may contain hardcoded data, and it must be clearly marked as a
sample so it is never accidentally sent to a client.

### Step 2a — Create the canonical JSON schema file

Create a new file `report-data-schema.json` in the project root. This file
is the single source of truth for every field the report template can render.

```json
{
  "_comment": "OrgPulse report data schema. Every field the V2 template reads must exist here. Null fields suppress the relevant section — never default to invented values.",

  "meta": {
    "orgName": "string — from Salesforce identity API",
    "orgId": "string — 18-char Salesforce org ID",
    "instanceUrl": "string — e.g. https://company.my.salesforce.com",
    "licenseCount": "number — total licensed users",
    "clouds": "string[] — e.g. ['Sales Cloud', 'Service Cloud']",
    "scanDate": "string — ISO date",
    "reportVersion": "string — e.g. 'v2'"
  },

  "intake": {
    "useCase": "string — 'service' | 'sales' | 'fieldService' | 'general' | null",
    "useCaseLabel": "string — human label, e.g. 'Service Cloud — case deflection'",
    "licenseUnitCostMonthly": "number | null — actual cost per user/month if known; null = use list price",
    "handlingCostPerTransaction": "number | null — $ per case/opportunity/work order handled manually; null = suppress value projection",
    "handlingCostLabel": "string | null — e.g. 'per case' | 'per opportunity' | 'per work order'",
    "deflectionBenchmark": "number — decimal, e.g. 0.40; always sourced, never invented",
    "deflectionBenchmarkSource": "string — e.g. 'Salesforce State of Service 2025, p.14'"
  },

  "scanMetrics": {
    "totalUsersLicensed": "number — from User COUNT query",
    "inactiveUserCount": "number — users with zero logins in last 90 days",
    "inactiveUserCountSource": "string — SOQL query description",
    "abandonedPackageCount": "number — packages with no activity in 18+ months",
    "abandonedPackageCost": "number | null — $ annual if determinable from scan; null if not",
    "contactEmailCompletionRate": "number — decimal, e.g. 0.66",
    "contactEmailMissingCount": "number — absolute count",
    "duplicateRate": "number — decimal",
    "activeFlowCount": "number",
    "flowsWithNoFaultPath": "number",
    "conflictingFlowObjects": "string[] — object API names with conflicting flows",
    "processBuilderActiveCount": "number",
    "apexCoveragePercent": "number",
    "securityHealthCheckScore": "number | null",
    "knowledgeArticleCount": "number",
    "knowledgeDataCategoriesConfigured": "boolean",
    "monthlyTransactionVolume": "number | null — COUNT of primary transactional object in last 90 days ÷ 3; null if use case not set",
    "monthlyTransactionVolumeObject": "string | null — e.g. 'Case' | 'Opportunity' | 'WorkOrder'",
    "monthlyTransactionVolumeSource": "string | null — SOQL description used to derive it",
    "unusedCustomFieldCount": "number",
    "apiDailyUsagePercent": "number",
    "loginRateLast90Days": "number — decimal"
  },

  "domainScores": [
    {
      "num": "number 1–7",
      "name": "string",
      "score": "number 0–100",
      "weight": "number — percent weight in overall index",
      "status": "string — 'blocker' | 'risk' | 'good'",
      "statusLabel": "string",
      "benchmark": "number | null — industry median score for this domain",
      "benchmarkLabel": "string | null — source citation",
      "summary": "string — written by agent, references scan metrics, no invented numbers",
      "findings": [
        {
          "text": "string — finding in business language",
          "evidence": "string — SOQL or API call that produced it",
          "dot": "string — hex color"
        }
      ],
      "soql": "string — verification query"
    }
  ],

  "aiReadinessIndex": "number 0–100 — weighted average of domain scores",
  "hardBlockerCount": "number",
  "hardBlockerDomains": "string[]",

  "costOfInaction": {
    "licenseWaste": "number — inactiveUserCount × licenseUnitCostMonthly × 12",
    "licenseWasteFormula": "string — e.g. '23 users × $165/mo × 12 = $45,540'",
    "licenseUnitCostSource": "string — 'client-provided' | 'Salesforce list price [edition] [date]'",
    "packageWaste": "number | null — abandonedPackageCost if available",
    "packageWasteNote": "string | null — how it was determined",
    "totalVerifiedWaste": "number — sum of all verified waste items only"
  },

  "valueProjection": {
    "available": "boolean — false if handlingCostPerTransaction is null; suppresses entire section",
    "transactionVolume": "number | null — from scanMetrics.monthlyTransactionVolume",
    "transactionVolumeSource": "string | null",
    "handlingCostPerTransaction": "number | null — from intake",
    "deflectionRate": "number — from intake.deflectionBenchmark",
    "deflectionRateSource": "string — from intake.deflectionBenchmarkSource",
    "deflectedTransactionsPerMonth": "number | null — calculated",
    "annualCapacityValueDollars": "number | null — calculated",
    "currentReadinessCapture": "number | null — what % of value org could capture today at current score",
    "flexCreditCostPerTransaction": "number — credits per transaction × $0.10",
    "flexCreditScenarios": [
      {
        "label": "string — e.g. '30% deflection'",
        "rate": "number",
        "tag": "string — 'Conservative' | 'Likely' | 'Optimistic'",
        "deflectedCount": "number | null — calculated",
        "monthlyCreditCost": "number | null — calculated",
        "monthlyNetSaving": "number | null — calculated"
      }
    ]
  },

  "roadmap": {
    "quickWins": "object[] — effort < 1 day, zero external cost",
    "mediumFixes": "object[] — 1–5 days",
    "strategic": "object[] — 5+ days or architectural"
  },

  "investmentOptions": {
    "pilotReadyDate": "string | null — named month, e.g. 'September 2026'; null if not confirmed",
    "optionA": {
      "label": "Internal team",
      "internalDays": "number — estimated from roadmap",
      "timelineMonths": "number"
    },
    "optionB": {
      "label": "OrgPulse delivers",
      "feeRangeLow": "number",
      "feeRangeHigh": "number",
      "timelineWeeks": "number"
    },
    "optionC": {
      "label": "Hybrid model",
      "feeRangeLow": "number",
      "feeRangeHigh": "number",
      "timelineWeeks": "number"
    },
    "monitoringRetainerMonthly": "number"
  }
}
```

### Step 2b — Create the sample data file

Create `report-data-sample.json` in the project root. This contains the Acme
Corp sample values and is the only place hardcoded client numbers should live.
The report template never hardcodes these values inline.

Populate it by extracting every hardcoded number from
`orgpulse_sample_report_v2.html` and placing it in the correct schema field.
Key values to extract:

```json
{
  "meta": {
    "orgName": "Acme Corp",
    "licenseCount": 180,
    "clouds": ["Sales Cloud", "Service Cloud"],
    "scanDate": "2026-05-20"
  },
  "intake": {
    "useCase": "service",
    "useCaseLabel": "Service Cloud — case deflection",
    "licenseUnitCostMonthly": 165,
    "handlingCostPerTransaction": 18,
    "handlingCostLabel": "per case",
    "deflectionBenchmark": 0.40,
    "deflectionBenchmarkSource": "Salesforce State of Service 2025, p.14"
  },
  "scanMetrics": {
    "totalUsersLicensed": 180,
    "inactiveUserCount": 23,
    "inactiveUserCountSource": "UserLogin COUNT where logins = 0 in last 90 days",
    "abandonedPackageCount": 4,
    "abandonedPackageCost": 6000,
    "contactEmailCompletionRate": 0.66,
    "contactEmailMissingCount": 142844,
    "duplicateRate": 0.11,
    "activeFlowCount": 34,
    "flowsWithNoFaultPath": 14,
    "conflictingFlowObjects": ["Account"],
    "processBuilderActiveCount": 2,
    "apexCoveragePercent": 68,
    "securityHealthCheckScore": 72,
    "knowledgeArticleCount": 12,
    "knowledgeDataCategoriesConfigured": false,
    "monthlyTransactionVolume": 2840,
    "monthlyTransactionVolumeObject": "Case",
    "monthlyTransactionVolumeSource": "Case COUNT GROUP BY CALENDAR_MONTH(CreatedDate) last 90 days ÷ 3",
    "unusedCustomFieldCount": 487,
    "apiDailyUsagePercent": 38,
    "loginRateLast90Days": 0.79
  },
  "aiReadinessIndex": 47,
  "hardBlockerCount": 2,
  "costOfInaction": {
    "licenseWaste": 45540,
    "licenseWasteFormula": "23 inactive users × $165/user/month × 12 = $45,540",
    "licenseUnitCostSource": "Salesforce list price — Sales Cloud Professional Edition, June 2026",
    "packageWaste": 6000,
    "packageWasteNote": "4 abandoned AppExchange packages — verified from InstalledPackage metadata",
    "totalVerifiedWaste": 51540
  },
  "valueProjection": {
    "available": true,
    "transactionVolume": 2840,
    "transactionVolumeSource": "Case COUNT last 90 days ÷ 3",
    "handlingCostPerTransaction": 18,
    "deflectionRate": 0.40,
    "deflectionRateSource": "Salesforce State of Service 2025, p.14",
    "deflectedTransactionsPerMonth": 1136,
    "annualCapacityValueDollars": 245376,
    "currentReadinessCapture": 0.15,
    "flexCreditCostPerTransaction": 0.45,
    "flexCreditScenarios": [
      { "label": "30% deflection", "rate": 0.30, "tag": "Conservative",
        "deflectedCount": 852, "monthlyCreditCost": 383, "monthlyNetSaving": 15953 },
      { "label": "40% deflection", "rate": 0.40, "tag": "Likely",
        "deflectedCount": 1136, "monthlyCreditCost": 511, "monthlyNetSaving": 20937 },
      { "label": "55% deflection", "rate": 0.55, "tag": "Optimistic",
        "deflectedCount": 1562, "monthlyCreditCost": 703, "monthlyNetSaving": 28413 }
    ]
  },
  "investmentOptions": {
    "pilotReadyDate": "September 2026",
    "optionA": { "label": "Internal team", "internalDays": 35, "timelineMonths": 5 },
    "optionB": { "label": "OrgPulse delivers", "feeRangeLow": 28000, "feeRangeHigh": 35000, "timelineWeeks": 16 },
    "optionC": { "label": "Hybrid model", "feeRangeLow": 15000, "feeRangeHigh": 18000, "timelineWeeks": 20 },
    "monitoringRetainerMonthly": 3000
  }
}
```

> **Note on the waste figure:** The previous report showed $18,400 waste
> (23 users × $800/yr). The schema now derives this as 23 × $165/mo × 12 =
> $45,540 using the correct Salesforce list price for Sales Cloud Professional.
> $800/yr ($67/mo) was significantly below actual list pricing and must not be
> used as a default. Update the sample data and report accordingly. If the
> client's actual license cost differs from list price, `licenseUnitCostMonthly`
> in the intake form overrides the default.

---

## TASK 3 — Refactor the V2 report template to read entirely from window.REPORT_DATA

**Target file:** `orgpulse_sample_report_v2.html`

This is the largest structural change. The goal: every dynamic value in the
report reads from the injected data object. No section renders invented
numbers when data is absent — it renders a null-safe placeholder instead.

### Step 3a — Replace the data initialisation block at the top of the script

Find the opening of the `<script>` block near the bottom of the file. It will
contain something like `const domains = [...]` with hardcoded Acme Corp data.

Replace the entire data initialisation section with:

```javascript
// ── Data source ───────────────────────────────────────────────────────────
// window.REPORT_DATA is injected by the report generator before this script
// runs. For the sample report only, fall back to SAMPLE_DATA defined in
// report-data-sample.js (never inline hardcoded values here).
const R = window.REPORT_DATA || window.SAMPLE_DATA;

if (!R) {
  document.body.innerHTML =
    '<div style="padding:40px;font-family:sans-serif;color:#c0392b">' +
    'No report data found. This template requires window.REPORT_DATA to be ' +
    'injected before rendering. See report-data-schema.json for the required shape.' +
    '</div>';
  throw new Error('window.REPORT_DATA not defined');
}

// ── Null-safe helpers ─────────────────────────────────────────────────────
const fmt = {
  // Format a dollar amount — returns em-dash if null
  dollar: (n, decimals = 0) =>
    n == null ? '—' : '$' + Number(n).toLocaleString('en-US',
      { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),

  // Format a percentage — returns em-dash if null
  pct: (n, decimals = 0) =>
    n == null ? '—' : (n * 100).toFixed(decimals) + '%',

  // Format a plain number with commas — returns em-dash if null
  num: (n) => n == null ? '—' : Number(n).toLocaleString('en-US'),

  // Format a month count
  months: (n) => n == null ? '—' : n + ' months',

  // Format a week count
  weeks: (n) => n == null ? '—' : n + ' weeks',
};

// ── Derived calculations (all from R fields — no invented values) ─────────
const calc = {
  licenseWaste: R.costOfInaction.licenseWaste,
  packageWaste: R.costOfInaction.packageWaste || 0,
  totalVerifiedWaste: R.costOfInaction.totalVerifiedWaste,
  quarterlyWaste: R.costOfInaction.totalVerifiedWaste != null
    ? Math.round(R.costOfInaction.totalVerifiedWaste / 4)
    : null,
};
```

### Step 3b — Refactor the cover page meta row

Find the cover meta section. It currently has four hardcoded `cm-val` divs.
Replace the inner content with template-literal references to `R`:

```javascript
// Render cover meta dynamically after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const metaFields = [
    { label: 'Hard blockers',    value: R.hardBlockerCount + ' domains',
      color: R.hardBlockerCount > 0 ? 'var(--red)' : 'var(--green)' },
    { label: 'Verified waste',   value: fmt.dollar(calc.totalVerifiedWaste),
      color: 'var(--amber)' },
    { label: 'Fix to reach 80+', value: R.investmentOptions?.optionB?.timelineWeeks + ' weeks' },
    { label: 'Pilot agent live by',
      value: R.investmentOptions?.pilotReadyDate || 'TBC',
      color: R.investmentOptions?.pilotReadyDate ? 'var(--green)' : 'var(--muted)' },
  ];
  const metaEl = document.querySelector('.cover-meta');
  if (metaEl) {
    metaEl.innerHTML = metaFields.map(f => `
      <div>
        <div class="cm-label">${f.label}</div>
        <div class="cm-val" style="color:${f.color || 'rgba(255,255,255,0.7)'}">${f.value}</div>
      </div>`).join('');
  }

  // Org name and client label
  const clientEl = document.querySelector('.cover-client');
  if (clientEl) {
    clientEl.textContent =
      `Prepared for ${R.meta.orgName} · ${R.meta.licenseCount} Salesforce licenses · ${R.meta.clouds.join(' + ')}`;
  }
});
```

### Step 3c — Refactor the executive summary cost of inaction grid

Find the three `.coi-box` elements in Section 1. Replace their hardcoded
content with JS-rendered equivalents. After the section's container div,
add a script block that renders them:

```javascript
function renderCostOfInaction() {
  const grid = document.getElementById('coi-grid-exec');
  if (!grid) return;
  const items = [
    {
      value: fmt.dollar(calc.licenseWaste),
      label: `Annual wasted license spend — ${fmt.num(R.scanMetrics.inactiveUserCount)} inactive users on full ${R.meta.clouds[0]} licenses`,
      sub: R.costOfInaction.licenseWasteFormula,
      color: 'var(--red)',
      cls: 'coi-red',
    },
    {
      value: fmt.dollar(calc.packageWaste),
      label: R.costOfInaction.packageWasteNote ||
             `${fmt.num(R.scanMetrics.abandonedPackageCount)} abandoned AppExchange packages still installed`,
      sub: calc.packageWaste ? 'VERIFIED FROM INSTALLED PACKAGES SCAN' : 'PACKAGE COST NOT YET DETERMINED',
      color: 'var(--amber)',
      cls: 'coi-amber',
    },
    {
      value: fmt.pct(R.scanMetrics.contactEmailCompletionRate
                     ? 1 - R.scanMetrics.contactEmailCompletionRate : null),
      label: `Of Contact records missing email addresses — the primary field Agentforce agents use to identify customers`,
      sub: `${fmt.num(R.scanMetrics.contactEmailMissingCount)} UNREACHABLE CONTACTS`,
      color: 'var(--blue)',
      cls: 'coi-blue',
    },
  ];
  grid.innerHTML = items.map(i => `
    <div class="coi-box ${i.cls}">
      <div class="coi-num" style="color:${i.color}">${i.value}</div>
      <div class="coi-label">${i.label}</div>
      <div class="coi-sub">${i.sub}</div>
    </div>`).join('');
}
renderCostOfInaction();
```

Add `id="coi-grid-exec"` to the wrapping `.coi-grid` div in Section 1 HTML.

### Step 3d — Refactor the domain scores grid

The `domains` array is currently hardcoded. Replace it with:

```javascript
const domains = R.domainScores;
```

The rendering logic that loops over `domains` to build the domain grid and
appendix can remain unchanged — it already reads from the array dynamically.
Only the data source changes.

### Step 3e — Refactor Section 4 — value projection

This section is the most important null-safety case. If `handlingCostPerTransaction`
was not provided at intake, the section must not render projected numbers.

Replace the Section 4 hardcoded grid with a rendered block:

```javascript
function renderValueProjection() {
  const container = document.getElementById('value-projection-section');
  if (!container) return;
  const vp = R.valueProjection;

  if (!vp.available || vp.handlingCostPerTransaction == null) {
    container.innerHTML = `
      <div class="card" style="border-color:var(--amber-border);background:var(--amber-dim)">
        <div class="ct" style="color:var(--amber)">Value projection not yet available</div>
        <div class="cb">
          We scanned ${fmt.num(vp.transactionVolume)} ${R.scanMetrics.monthlyTransactionVolumeObject || 'transactions'}
          per month from your org data. To calculate the value Agentforce could deliver,
          we need one additional input: your average cost to handle each
          ${R.intake.handlingCostLabel || 'transaction'} manually (staff time + tooling).
          Add this figure to your intake form and re-run the report — all calculations
          will be generated from your actual data.
        </div>
      </div>`;
    return;
  }

  // Use case label — adapt metric language based on use case
  const useCaseMetricLabel = {
    service:      { unit: 'cases', action: 'deflected', metric: 'case deflection' },
    sales:        { unit: 'opportunities', action: 'assisted', metric: 'pipeline coverage' },
    fieldService: { unit: 'work orders', action: 'resolved faster', metric: 'job completion rate' },
    general:      { unit: 'transactions', action: 'handled by agent', metric: 'agent coverage' },
  }[R.intake.useCase || 'general'];

  container.innerHTML = `
    <div class="section-sub">
      Calculated from your actual ${useCaseMetricLabel.unit} volume and handling cost —
      not industry averages. Every number below is derived from your Salesforce org
      or confirmed in your intake form.
    </div>
    <div class="coi-grid" style="margin-bottom:20px">
      <div class="coi-box" style="border-top:3px solid var(--green)">
        <div class="coi-num" style="color:var(--green)">${fmt.num(vp.deflectedTransactionsPerMonth)}</div>
        <div class="coi-label">
          <strong>${useCaseMetricLabel.unit.charAt(0).toUpperCase() + useCaseMetricLabel.unit.slice(1)} ${useCaseMetricLabel.action} per month</strong>
          — at ${fmt.pct(vp.deflectionRate)} deflection rate applied to your
          actual ${fmt.num(vp.transactionVolume)} ${useCaseMetricLabel.unit}/month
        </div>
        <div class="coi-sub">YOUR DATA · NOT AN INDUSTRY AVERAGE</div>
      </div>
      <div class="coi-box" style="border-top:3px solid var(--green)">
        <div class="coi-num" style="color:var(--green)">${fmt.dollar(vp.annualCapacityValueDollars)}</div>
        <div class="coi-label">
          <strong>Annual capacity value</strong> —
          ${fmt.num(vp.deflectedTransactionsPerMonth)} ${useCaseMetricLabel.unit} ×
          ${fmt.dollar(vp.handlingCostPerTransaction)} average handling cost × 12 months
        </div>
        <div class="coi-sub">CALCULATED FROM YOUR DATA · ${vp.deflectionRateSource.toUpperCase()}</div>
      </div>
      <div class="coi-box" style="border-top:3px solid var(--amber)">
        <div class="coi-num" style="color:var(--amber)">${fmt.pct(vp.currentReadinessCapture)}</div>
        <div class="coi-label">
          What you would capture <strong>today at score ${R.aiReadinessIndex}</strong> —
          agent failures from data quality gaps and automation conflicts limit
          real-world effectiveness
        </div>
        <div class="coi-sub">THE COST OF DEPLOYING BEFORE FIXING</div>
      </div>
    </div>`;
}
renderValueProjection();
```

Add `id="value-projection-section"` to the Section 4 container div in the HTML.

### Step 3f — Refactor the Flex Credit model (Section 3)

Replace the hardcoded `flexData` object with:

```javascript
function renderFlexModel() {
  const container = document.getElementById('flex-credit-model');
  if (!container) return;
  const vp = R.valueProjection;

  if (!vp.available || !vp.flexCreditScenarios?.length) {
    container.innerHTML = `<div class="card"><div class="cb">
      Flex Credit projections require transaction volume and handling cost
      from your intake form. Add these to see monthly running cost at three
      deflection scenarios.
    </div></div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px';

  vp.flexCreditScenarios.forEach(s => {
    const box = document.createElement('div');
    box.className = 'coi-box';
    box.style.borderTop = '3px solid ' + (s.rate < 0.4 ? 'var(--amber)' : 'var(--green)');
    const color = s.rate < 0.4 ? 'var(--amber)' : 'var(--green)';
    box.innerHTML = `
      <div class="coi-num" style="color:${color}">${fmt.dollar(s.monthlyCreditCost)}/mo</div>
      <div class="coi-label">
        <strong>${s.label} (${fmt.num(s.deflectedCount)} ${R.intake.handlingCostLabel || 'transactions'})</strong><br>
        Flex Credits at $0.10/credit<br>
        Saves ${fmt.dollar(s.monthlyNetSaving)}/mo vs manual handling
      </div>
      <div class="coi-sub">${s.tag.toUpperCase()} SCENARIO</div>`;
    grid.appendChild(box);
  });
  container.appendChild(grid);

  const note = document.createElement('div');
  note.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--dim);padding:10px 14px;background:var(--bg3);border-radius:6px;line-height:1.6';
  note.textContent =
    `FLEX CREDIT RATE: $0.10/credit (Salesforce list, June 2026) · ` +
    `HANDLING COST: ${fmt.dollar(vp.handlingCostPerTransaction)} ${R.intake.handlingCostLabel || 'per transaction'} (client-provided) · ` +
    `DEFLECTION BENCHMARK: ${fmt.pct(vp.deflectionBenchmark)} — ${vp.deflectionRateSource}`;
  container.appendChild(note);
}
renderFlexModel();
```

### Step 3g — Refactor the ROI calculator (Section 6)

Replace the hardcoded `updateROI` function. The slider defaults must come from
`R`, and the output must label what is verified vs. projected:

```javascript
function updateROI() {
  const fee = parseInt(document.getElementById('fee-slider').value);
  const projectedAnnualValue = R.valueProjection.available
    ? R.valueProjection.annualCapacityValueDollars
    : 0;
  const verifiedAnnualWaste = calc.totalVerifiedWaste;

  document.getElementById('fee-val').textContent = fmt.dollar(fee);
  document.getElementById('val-val').textContent =
    R.valueProjection.available ? fmt.dollar(projectedAnnualValue) : 'N/A';

  const totalAnnualValue = verifiedAnnualWaste + (projectedAnnualValue || 0);
  const paybackMo = totalAnnualValue > 0
    ? Math.ceil(fee / (totalAnnualValue / 12))
    : null;
  const yr1Net = totalAnnualValue - fee;
  const roi3yr = fee > 0
    ? Math.round(((totalAnnualValue * 3 - fee) / fee) * 100)
    : null;

  const out = document.getElementById('roi-output');
  out.innerHTML = `
    <div class="coi-box" style="border-top:3px solid var(--green)">
      <div class="coi-num" style="color:var(--text);font-size:24px">${fmt.dollar(fee)}</div>
      <div class="coi-label">Engagement fee<br><span style="font-size:11px">Adjust slider above</span></div>
    </div>
    <div class="coi-box" style="border-top:3px solid var(--green)">
      <div class="coi-num" style="color:var(--green);font-size:24px">${paybackMo ? paybackMo + ' mo' : '—'}</div>
      <div class="coi-label">Payback period<br><span style="font-size:11px">Verified waste + projected agent value</span></div>
    </div>
    <div class="coi-box" style="border-top:3px solid var(--green)">
      <div class="coi-num" style="color:var(--green);font-size:24px">${fmt.dollar(yr1Net)}</div>
      <div class="coi-label">Year 1 net benefit<br><span style="font-size:11px">After engagement fee</span></div>
    </div>
    <div class="coi-box" style="border-top:3px solid var(--green)">
      <div class="coi-num" style="color:var(--green);font-size:24px">${roi3yr != null ? roi3yr + '%' : '—'}</div>
      <div class="coi-label">3-year ROI</div>
    </div>`;

  // Disclaimer — clearly separates verified from projected
  const disclaimer = document.getElementById('roi-disclaimer');
  if (disclaimer) {
    disclaimer.textContent =
      `VERIFIED SAVINGS: ${fmt.dollar(verifiedAnnualWaste)}/yr — from scan data (${R.costOfInaction.licenseWasteFormula}).` +
      (R.valueProjection.available
        ? ` PROJECTED AGENT VALUE: ${fmt.dollar(projectedAnnualValue)}/yr — ${R.valueProjection.deflectionRateSource}.`
        : ' PROJECTED AGENT VALUE: not available — provide handling cost in intake form.');
  }
}

// Set slider defaults from data
document.addEventListener('DOMContentLoaded', () => {
  const feeSlider = document.getElementById('fee-slider');
  if (feeSlider && R.investmentOptions?.optionB) {
    feeSlider.min = R.investmentOptions.optionB.feeRangeLow;
    feeSlider.max = R.investmentOptions.optionB.feeRangeHigh;
    feeSlider.value = R.investmentOptions.optionB.feeRangeLow;
  }
  updateROI();
});
```

Add `id="roi-disclaimer"` to the disclaimer div below the roi-output div.

### Step 3h — Refactor the investment options grid

Replace the three hardcoded option cards with a rendered block:

```javascript
function renderInvestmentOptions() {
  const grid = document.getElementById('investment-options-grid');
  if (!grid || !R.investmentOptions) return;
  const io = R.investmentOptions;
  const opts = [
    {
      label: 'Option A', sublabel: null,
      name: io.optionA.label,
      price: `~${io.optionA.internalDays} internal days`,
      body: `Your admin and developer handle all remediation using this roadmap. OrgPulse provides a monthly monitoring retainer to track progress. Timeline: ${io.optionA.timelineMonths}–${io.optionA.timelineMonths + 1} months to pilot.`,
      highlight: false,
    },
    {
      label: 'Option B', sublabel: 'Recommended',
      name: io.optionB.label,
      price: `${fmt.dollar(io.optionB.feeRangeLow)}–${fmt.dollar(io.optionB.feeRangeHigh)} fixed fee`,
      body: `Full remediation + Agentforce pilot. Fixed price, fixed timeline. ${io.pilotReadyDate ? 'Pilot live by ' + io.pilotReadyDate + '.' : ''} License savings cover payback within months.`,
      highlight: true,
    },
    {
      label: 'Option C', sublabel: null,
      name: io.optionC.label,
      price: `${fmt.dollar(io.optionC.feeRangeLow)}–${fmt.dollar(io.optionC.feeRangeHigh)}`,
      body: `OrgPulse leads architecture and Agentforce configuration. Your admin executes remediation under our guidance. Reduced cost, longer timeline: ${io.optionC.timelineWeeks} weeks.`,
      highlight: false,
    },
  ];
  grid.innerHTML = opts.map(o => `
    <div class="card" ${o.highlight ? 'style="border-color:var(--border2);background:linear-gradient(135deg,#fff 0%,var(--bg3) 100%)"' : ''}>
      <div style="font-family:var(--mono);font-size:10px;color:${o.highlight ? 'var(--green)' : 'var(--dim)'};letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">
        ${o.label}${o.sublabel ? ' · ' + o.sublabel : ''}
      </div>
      <div style="font-family:var(--display);font-size:18px;font-weight:300;letter-spacing:-.02em;margin-bottom:4px">${o.name}</div>
      <div style="font-family:var(--mono);font-size:14px;color:var(--muted);margin-bottom:12px">${o.price}</div>
      <div class="cb" style="font-size:12px">${o.body}</div>
    </div>`).join('');
}
renderInvestmentOptions();
```

Add `id="investment-options-grid"` to the wrapping grid div in Section 6.

---

## TASK 4 — Remove the "competitive reality" card

**Target file:** `orgpulse_sample_report_v2.html`

```bash
grep -n "competitive reality\|The competitive reality" orgpulse_sample_report_v2.html
```

If found: delete the entire `<div class="card">...</div>` block containing it.
Replace with the cost-of-delay card, which uses only scan-derived numbers:

```javascript
function renderCostOfDelay() {
  const container = document.getElementById('cost-of-delay-card');
  if (!container) return;
  container.innerHTML = `
    <div class="card" style="border-color:var(--amber-border);background:var(--amber-dim)">
      <div class="ct" style="color:var(--amber)">The cost of waiting — calculated from your own numbers</div>
      <div class="cb">
        At your current verified waste rate of ${fmt.dollar(calc.totalVerifiedWaste)}/year,
        every quarter of inaction costs approximately
        <strong>${fmt.dollar(calc.quarterlyWaste)}</strong> in license and package
        waste alone — before accounting for Agentforce value you are not yet capturing.
        ${R.scanMetrics.conflictingFlowObjects?.length
          ? `Automation debt also compounds: the conflicting flows identified on
             ${R.scanMetrics.conflictingFlowObjects.join(', ')} become harder and
             more expensive to consolidate with each new change added on top.`
          : ''}
        The remediation work flagged in this report is cheaper to address now
        than in 6 months.
      </div>
    </div>`;
}
renderCostOfDelay();
```

Add `<div id="cost-of-delay-card"></div>` in the HTML where the competitive
reality card currently sits.

---

## TASK 5 — Update the agent architecture prompt to reflect the new schema

**Target file:** `orgpulse_agent_architecture.html`

### Step 5a — Update the WASTE CALCULATION RULES section

Find:
```
→ Use £800/user/year as default if not provided
```

Replace with:
```
→ Use $165/user/month (Sales Cloud Professional list price, June 2026)
  as the default if licenseUnitCostMonthly was not provided at intake.
  Always state the source. Never invent a license cost.
→ If the client's actual license cost differs, it will be in
  intake.licenseUnitCostMonthly — use that value instead.
```

### Step 5b — Update the OUTPUT FORMAT section

Find the example `report_data.json` block in the agent prompt. Replace the
`costOfInaction` example to match the new schema:

```
"costOfInaction": {
  "licenseWaste": 45540,  // 23 × $165/mo × 12
  "licenseWasteFormula": "23 inactive users × $165/user/month × 12 = $45,540",
  "licenseUnitCostSource": "Salesforce list price — Sales Cloud Professional, June 2026",
  "packageWaste": 6000,
  "packageWasteNote": "4 abandoned packages — InstalledPackage metadata",
  "totalVerifiedWaste": 51540
}
```

### Step 5c — Add a VALUE PROJECTION RULES section to the agent prompt

Find the WASTE CALCULATION RULES section and add immediately after it:

```
## VALUE PROJECTION RULES
Value projection (Section 4) depends on client-provided inputs.
Apply these rules exactly:

1. monthlyTransactionVolume: ALWAYS derive from scan data.
   - Service use case: COUNT of Cases created in last 90 days ÷ 3
   - Sales use case: COUNT of Opportunities created in last 90 days ÷ 3
   - Field Service: COUNT of WorkOrders created in last 90 days ÷ 3
   - General: COUNT of the highest-volume transactional object ÷ 3
   Never estimate this. If the object has no records, set to null.

2. handlingCostPerTransaction: ONLY use the value from intake.
   If null, set valueProjection.available = false and do NOT
   calculate or show any value projection numbers.

3. deflectionBenchmark: Use intake.deflectionBenchmark.
   Always include deflectionBenchmarkSource. Never use 35–45%
   as a range — pick a single conservative number (0.35) only
   if the client did not provide one, and flag it as an assumption.

4. flexCreditScenarios: Calculate all three from real data.
   Do NOT hardcode scenario output values. Calculate them as:
   deflectedCount = monthlyTransactionVolume × scenario.rate
   monthlyCreditCost = deflectedCount × creditsPerTransaction × 0.10
   monthlyNetSaving = (deflectedCount × handlingCostPerTransaction) - monthlyCreditCost
```

---

## TASK 6 — Final verification pass

All checks must pass before any file is considered done.

### Check 1 — Zero pound symbols
```bash
grep -rn "£" orgpulse_sample_report_v2.html orgpulse_sample_report.html \
           orgpulse_agent_architecture.html orgpulse_assessment_framework.html
# Expected: no output
```

### Check 2 — No hardcoded Acme Corp values in the template script block
```bash
grep -n "Acme Corp\|2840\|18400\|45540\|142844\|18,400\|45,540" \
     orgpulse_sample_report_v2.html
# Expected: zero matches
# (These values should only exist in report-data-sample.json)
```

### Check 3 — window.REPORT_DATA guard present
```bash
grep -c "window.REPORT_DATA" orgpulse_sample_report_v2.html
# Expected: at least 2 (assignment line + guard check)
```

### Check 4 — Null-safe helpers present
```bash
grep -c "const fmt" orgpulse_sample_report_v2.html
# Expected: 1
```

### Check 5 — Competitive reality card removed
```bash
grep -c "competitive reality" orgpulse_sample_report_v2.html
# Expected: 0
```

### Check 6 — Schema file exists
```bash
ls -la report-data-schema.json report-data-sample.json
# Expected: both files present
```

### Check 7 — Browser render test
Open `orgpulse_sample_report_v2.html` in Chrome. In the browser console, run:
```javascript
window.REPORT_DATA = null;
window.SAMPLE_DATA = null;
location.reload();
```
The page should display the "No report data found" error message, not a blank
page or JavaScript exception that exposes internal code. This confirms the guard
is working.

Then reload normally (SAMPLE_DATA should be loaded) and verify every section
renders with real numbers from `report-data-sample.json`.

---

## Scope boundaries — what is NOT in these instructions

- **`licence` → `license` spelling** — out of scope; separate decision
- **Domain 8 (integration/middleware)** — requires framework change, separate session
- **`orgpulse_v2_implementation_guide.html`** — internal doc; update after all
  report files are signed off
- **Intake form UI** — the form that collects `useCase`, `handlingCostPerTransaction`,
  and `licenseUnitCostMonthly` before the scan runs is a separate product feature.
  These instructions assume the intake data arrives in `R.intake` already populated.
- **Backend TypeScript changes** — the `report-generator.ts` populates
  `window.REPORT_DATA` from the scan JSON. That file does not need changes for
  currency conversion. It will need updating when the intake schema is added to
  the scan pipeline — that is a separate task.

---

## Recovery

If any file fails to render after an edit:

```bash
# Restore from backup
cp orgpulse_sample_report_v2.BACKUP.html orgpulse_sample_report_v2.html
```

Re-read the relevant task step, make the change in a text editor rather than
in bulk, and re-run that task's verification check before proceeding.

---

*OrgPulse Claude Code Instructions v2 — June 2026*