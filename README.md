# OrgPulse — Scan Configuration Guide

OrgPulse scans a Salesforce org across 7 domains, scores them 0–100, and generates an interactive HTML report served via ngrok (Supabase kept as archive). This guide covers every configuration option.

---

## Contents

- [Quick Start](#quick-start)
- [Two Separate Configs](#two-separate-configs)
- [1. client-intake.json — Business Context](#1-client-intakejson--business-context)
  - [Field Reference](#field-reference)
  - [Narrative Fields](#narrative-fields)
  - [Negotiated Fees](#negotiated-fees)
  - [Rebuild Report Without Re-scanning](#rebuild-report-without-re-scanning)
  - [Use Case Examples](#use-case-examples)
  - [licenseUnitCostMonthly — Common Values](#licenseunitcostmonthly--common-values)
  - [clouds — Common Values](#clouds--common-values)
  - [useCase Field](#usecase-field)
- [2. Scan Use Case Presets — --use-case Flag](#2-scan-use-case-presets----use-case-flag)
- [3. Custom Object Config — --config Flag](#3-custom-object-config----config-flag)
- [4. Combining Flags](#4-combining-flags)
- [5. Complete Workflow Per Engagement](#5-complete-workflow-per-engagement)
- [6. Score Domains Reference](#6-score-domains-reference)
- [Pre-delivery Checklist](#pre-delivery-checklist)
- [QC Checklist](#qc-checklist)
- [Common Issues](#common-issues)

---

## Quick Start

```bash
# 1. Connect your Salesforce org (one-time per org)
npm run dev
# Open http://localhost:3000/auth/start in your browser

# 2. Run a scan
npm run scan -- --org <orgId>

# 3. After the stakeholder interview, update narrative fields and rebuild
npm run rebuild-report -- --org <orgId>
```

---

## Two Separate Configs

There are two independent configuration files with different purposes:

| File | Controls | Per client? |
|------|----------|------------|
| `client-intake.json` | Business context — org name, license count, cost inputs, narrative, fees | Yes — one per client |
| `--config ./custom.json` | Which Salesforce objects and fields to scan | Only if non-standard objects needed |

Most engagements only need `client-intake.json`. The `--config` flag is for clients with custom objects.

---

## 1. client-intake.json — Business Context

Copy `client-intake.example.json` to `client-intake.json` and fill in before every scan. This file is gitignored — it contains client-specific commercial data that must not be committed.

```json
{
  "orgName":                    "Acme Corp",
  "licenseCount":               180,
  "clouds":                     ["Sales Cloud", "Service Cloud"],

  "licenseUnitCostMonthly":     165,
  "packageWaste":               6000,
  "abandonedPackageCount":      4,

  "useCase":                    "service",
  "handlingCostPerTransaction": 18,
  "handlingCostLabel":          "per case",
  "monthlyTransactionVolume":   null
}
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `orgName` | string | `"Your Organisation"` | Client org name — appears on every page of the report |
| `licenseCount` | number | `0` | Total licensed users — drives inactive user waste calculation |
| `clouds` | string[] | `["Salesforce"]` | Salesforce clouds in use — shown on cover page |
| `licenseUnitCostMonthly` | number | `165` | $/user/month — defaults to Sales Cloud Professional list price |
| `packageWaste` | number | `0` | Annual $ cost of abandoned AppExchange packages (from stakeholder interview) |
| `abandonedPackageCount` | number | scan result | Number of abandoned packages — overrides scan if set |
| `useCase` | string | `"service"` | Report framing: `"service"`, `"sales"`, `"fieldService"`, or `"general"` |
| `handlingCostPerTransaction` | number \| null | `null` | $/transaction — unlocks the value projection and Flex Credit sections |
| `handlingCostLabel` | string | `"per case"` | Label shown next to the cost figure in the report |
| `monthlyTransactionVolume` | number \| null | `null` | Override the scanned case volume (use when the org has no real transaction data) |

---

### Narrative Fields

Fill these in **after the stakeholder interview**, then run `npm run rebuild-report` — no re-scan needed.

| Field | Type | Description |
|-------|------|-------------|
| `pilotReadyDate` | string | Named month shown in the roadmap footer e.g. `"October 2026"`. Auto-computes to today + 16 weeks if not set. |
| `executiveSummary` | string \| null | Replaces the auto-generated headline paragraph on the cover. Write 1–2 sentences capturing the client's specific situation and verdict. |
| `domainSummaries` | object | Per-domain narrative overrides. Each value replaces the auto-generated top finding in that domain card. Keys must match the domain display names exactly. |

**`domainSummaries` key reference:**

```json
"domainSummaries": {
  "Data quality & completeness":       "Your narrative here.",
  "Automation health & conflicts":     null,
  "Security & permission model":       null,
  "Knowledge base & grounding":        null,
  "Metadata & technical debt":         null,
  "User adoption & process alignment": null,
  "Platform limits & API headroom":    null
}
```

Set a key to `null` to use the auto-generated finding from the scan. Set it to a string to override with your own text from the interview.

---

### Negotiated Fees

Fill these in **after commercial agreement**. Defaults are Yukti Global list prices. Set `low` = `high` for a fixed fee. Leave as `null` to show the default range.

| Field | Default | Description |
|-------|---------|-------------|
| `negotiatedFees.optionBLow` | `28000` | Option B (Yukti Global delivers) lower fee bound |
| `negotiatedFees.optionBHigh` | `35000` | Option B upper fee bound — set equal to `optionBLow` for a fixed fee |
| `negotiatedFees.optionCLow` | `15000` | Option C (Hybrid model) lower fee bound |
| `negotiatedFees.optionCHigh` | `18000` | Option C upper fee bound — set equal to `optionCLow` for a fixed fee |
| `negotiatedFees.monitoringRetainerMonthly` | `3000` | Monthly monitoring retainer shown in investment options |

```json
"negotiatedFees": {
  "optionBLow":                30000,
  "optionBHigh":               30000,
  "optionCLow":                16000,
  "optionCHigh":               16000,
  "monitoringRetainerMonthly": 2500
}
```

---

### Rebuild Report Without Re-scanning

After the stakeholder interview, you can regenerate the report from cached signals without re-running the full scan (which queries the live org):

```bash
npm run rebuild-report -- --org <orgId>
```

Signals are cached to `reports/{orgId}-signals.json` after every scan. `rebuild-report` reads that cache plus the current `client-intake.json` and regenerates the HTML and URL.

**Use `rebuild-report` to:**
- Add `executiveSummary` and `domainSummaries` after the interview call
- Enter `negotiatedFees` after the commercial conversation
- Adjust `pilotReadyDate` to a specific named month
- Fix any wording in the report without waiting for a re-scan

**Use `npm run scan` when:**
- The client has made changes to their org since the last scan
- You need fresh signals (e.g. after they've fixed data quality issues)

---

### Use Case Examples

Copy the block that matches your client's primary Agentforce use case.

#### Service Cloud — Case Deflection

```json
{
  "orgName":                    "Acme Corp",
  "licenseCount":               180,
  "clouds":                     ["Service Cloud"],

  "licenseUnitCostMonthly":     165,
  "packageWaste":               0,
  "abandonedPackageCount":      0,

  "useCase":                    "service",
  "handlingCostPerTransaction": 18,
  "handlingCostLabel":          "per case",
  "monthlyTransactionVolume":   null
}
```

> `handlingCostPerTransaction` — average fully-loaded cost to handle one support case (agent time + overhead). Industry range: $12–$35. Get this from the client's CS ops or finance team. `monthlyTransactionVolume` can stay `null` — the scan pulls it from live Case counts.

---

#### Sales Cloud — Deal Acceleration

```json
{
  "orgName":                    "Acme Corp",
  "licenseCount":               120,
  "clouds":                     ["Sales Cloud"],

  "licenseUnitCostMonthly":     165,
  "packageWaste":               0,
  "abandonedPackageCount":      0,

  "useCase":                    "sales",
  "handlingCostPerTransaction": 150,
  "handlingCostLabel":          "per qualified opportunity",
  "monthlyTransactionVolume":   null
}
```

> `handlingCostPerTransaction` — cost of an SDR or AE handling one qualified opportunity manually (research, outreach, qualification calls). Industry range: $80–$300. `monthlyTransactionVolume` stays `null` — scan pulls it from live Opportunity counts.

---

#### Field Service — Work Order Resolution

```json
{
  "orgName":                    "Acme Corp",
  "licenseCount":               90,
  "clouds":                     ["Field Service", "Service Cloud"],

  "licenseUnitCostMonthly":     165,
  "packageWaste":               0,
  "abandonedPackageCount":      0,

  "useCase":                    "fieldService",
  "handlingCostPerTransaction": 220,
  "handlingCostLabel":          "per work order",
  "monthlyTransactionVolume":   null
}
```

> `handlingCostPerTransaction` — average cost to dispatch and resolve one work order (technician time + travel + overhead). Industry range: $150–$500 depending on field. Get from operations or finance. Scan pulls live WorkOrder counts if the object exists in the org.

---

#### No Value Projection (suppress Flex Credit section)

Use this when you don't yet have cost-per-transaction data from the client. The report renders without the value projection and Flex Credit sections — all other sections are unaffected.

```json
{
  "orgName":                    "Acme Corp",
  "licenseCount":               200,
  "clouds":                     ["Sales Cloud", "Service Cloud"],

  "licenseUnitCostMonthly":     165,
  "packageWaste":               0,
  "abandonedPackageCount":      0,

  "useCase":                    "service",
  "handlingCostPerTransaction": null,
  "handlingCostLabel":          null,
  "monthlyTransactionVolume":   null
}
```

---

### `licenseUnitCostMonthly` — Common Values

| Edition | $/user/month (list price) |
|---------|--------------------------|
| Sales Cloud Starter | $25 |
| Sales Cloud Professional | $80 |
| Sales Cloud Enterprise | $165 |
| Sales Cloud Unlimited | $330 |
| Service Cloud Enterprise | $165 |
| Service Cloud Unlimited | $330 |
| Field Service (add-on) | $50 |

Use the client's actual contract price if known — it's almost always lower than list price. Ask the admin or procurement team.

---

### `clouds` — Common Values

```json
["Sales Cloud"]
["Service Cloud"]
["Field Service", "Service Cloud"]
["Sales Cloud", "Service Cloud"]
["Sales Cloud", "Service Cloud", "Experience Cloud"]
["Marketing Cloud", "Sales Cloud"]
["Revenue Cloud", "Sales Cloud"]
```

This field is display-only — it appears on the report cover page and does not affect scanning or scoring.

---

### `useCase` Field

Controls the value projection language in the report. Does **not** change which objects are scanned — use `--use-case` CLI flag for that.

| Value | Report framing | `handlingCostLabel` suggestion |
|-------|---------------|-------------------------------|
| `"service"` | Case deflection via Agentforce Service agent | `"per case"` |
| `"sales"` | Deal acceleration via Agentforce Sales agent | `"per qualified opportunity"` |
| `"fieldService"` | Work order resolution via Field Service agent | `"per work order"` |
| `"general"` | General productivity uplift | `"per transaction"` |

---

## 2. Scan Use Case Presets — `--use-case` Flag

Controls which **Salesforce objects are scanned** for data quality. Pass at runtime — no file needed.

```bash
npm run scan -- --org <id> --use-case service       # default
npm run scan -- --org <id> --use-case sales
npm run scan -- --org <id> --use-case field_service
```

### service (default)

Scans 7 objects: the 5 Tier 1 standard objects plus Case (extended fields) and EmailMessage.

| Object | Fields checked |
|--------|---------------|
| Contact | Email, Phone, Title, AccountId, FirstName, LastName |
| Account | Industry, Phone, BillingCity, BillingCountry, Website |
| Lead | Email, Phone, Company, LeadSource, Status |
| Opportunity | CloseDate, StageName, Amount, AccountId |
| Case | Reason, Status, ContactId, AccountId, Priority |
| Case *(Tier 2)* | Reason, Status, Priority, ContactId |
| EmailMessage *(Tier 2)* | Status, FromAddress |

### sales

Scans 8 objects: the 5 Tier 1 objects plus Quote, Contract, and Product2.

| Object | Fields checked |
|--------|---------------|
| Contact | Email, Phone, Title, AccountId, FirstName, LastName |
| Account | Industry, Phone, BillingCity, BillingCountry, Website |
| Lead | Email, Phone, Company, LeadSource, Status |
| Opportunity | CloseDate, StageName, Amount, AccountId |
| Case | Reason, Status, ContactId, AccountId, Priority |
| Quote *(Tier 2)* | Status, ExpirationDate, AccountId |
| Contract *(Tier 2)* | Status, StartDate, AccountId |
| Product2 *(Tier 2)* | Family, ProductCode |

### field_service

Scans 8 objects: the 5 Tier 1 objects plus WorkOrder, ServiceAppointment, and Asset.

| Object | Fields checked |
|--------|---------------|
| Contact | Email, Phone, Title, AccountId, FirstName, LastName |
| Account | Industry, Phone, BillingCity, BillingCountry, Website |
| Lead | Email, Phone, Company, LeadSource, Status |
| Opportunity | CloseDate, StageName, Amount, AccountId |
| Case | Reason, Status, ContactId, AccountId, Priority |
| WorkOrder *(Tier 2)* | Status, AccountId, ContactId |
| ServiceAppointment *(Tier 2)* | Status, FSL__Scheduled_Start__c |
| Asset *(Tier 2)* | Status, AccountId, SerialNumber |

---

## 3. Custom Object Config — `--config` Flag

For clients with custom objects or non-standard field requirements. Create a JSON file and pass it at runtime.

```bash
npm run scan -- --org <id> --config ./configs/acme-corp.json
```

The JSON merges with the standard Tier 1 objects. You only need to specify what's different:

```json
{
  "agentforceUseCase": "service",
  "analysisWindowMonths": 12,
  "objects": [
    {
      "tier": "tier3",
      "apiName": "Customer_Feedback__c",
      "label": "Customer Feedback",
      "fields": ["Status__c", "Rating__c", "Contact__c"],
      "minRecords": 100
    },
    {
      "tier": "tier3",
      "apiName": "Support_Ticket__c",
      "label": "Support Ticket",
      "fields": ["Priority__c", "Resolution__c", "Account__c"],
      "checkDuplicates": false,
      "minRecords": 500
    }
  ]
}
```

### Object Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tier` | `"tier3"` | Yes | Always `"tier3"` for custom objects in this file |
| `apiName` | string | Yes | Salesforce API name e.g. `"Customer_Feedback__c"` |
| `label` | string | Yes | Human-readable name shown in findings |
| `fields` | string[] | Yes | Fields to check for completeness — only non-boolean fields |
| `checkDuplicates` | boolean | No | Whether to run duplicate detection (default: `false`) |
| `duplicateFields` | string[] | No | Fields to GROUP BY for duplicate check e.g. `["Name", "Email__c"]` |
| `minRecords` | number | No | Skip this object if record count is below this threshold (default: `100`) |

> **Constraint:** Only fields that support `COUNT()` in SOQL aggregate queries can be listed — standard text, lookup, picklist, and date fields work. Boolean fields (`IsActive`, `IsDeleted`) do not.

### `analysisWindowMonths`

Top-level field in the config JSON that controls the date window for GROUP BY queries (duplicate detection and case reason analysis). Default: `12` months.

```json
{
  "analysisWindowMonths": 6,
  "agentforceUseCase": "service",
  "objects": [...]
}
```

Set lower (e.g. `6`) for engagements where only very recent data is relevant. Field completeness and adoption metrics are not affected — completeness scans all records, adoption uses a fixed 90-day window.

---

## 4. Combining Flags

All three flags can be combined:

```bash
# Sales use case + custom objects + specific org
npm run scan -- --org 00DHs000001234 --use-case sales --config ./configs/acme.json
```

When `--config` is provided, the `agentforceUseCase` inside the JSON file takes precedence over `--use-case`.

---

## 5. Complete Workflow Per Engagement

```bash
# Step 1 — Copy and fill in client intake (business fields only)
cp client-intake.example.json client-intake.json
# Edit: orgName, licenseCount, clouds, licenseUnitCostMonthly,
#       useCase, handlingCostPerTransaction, packageWaste

# Step 2 — Connect the client org (requires ngrok + npm run dev)
ngrok http 3000
# Update SF External Client App callback URL + SF_REDIRECT_URI in .env
npm run dev
# Send http://<ngrok-url>/auth/start to client

# Step 3 — Confirm connection
npm run test-conn

# Step 4 — Run the scan
npm run scan -- --org <orgId>                           # service (default)
npm run scan -- --org <orgId> --use-case sales          # sales
npm run scan -- --org <orgId> --use-case field_service  # field service
npm run scan -- --org <orgId> --config ./acme.json      # custom objects

# Step 5 — Review domain scores in terminal; open report URL in browser

# Step 5.5 — After the stakeholder interview:
# Fill in client-intake.json: executiveSummary, domainSummaries,
#                             pilotReadyDate, negotiatedFees
npm run rebuild-report -- --org <orgId>
# No re-scan — regenerates HTML from cached signals + updated intake

# Step 6 — Open the report URL in incognito and run QC checklist
# Step 7 — Send URL to client
```

---

## 6. Score Domains Reference

All use cases score the same 7 domains regardless of which objects are scanned:

| Domain | Weight | Hard Blocker Below | Industry Median |
|--------|--------|--------------------|----------------|
| Data Quality & Completeness | 25% | 50 | 54 |
| Automation Health & Conflicts | 20% | 50 | 58 |
| Security & Permission Model | 15% | 50 | 69 |
| Knowledge Base & Grounding | 15% | 50 | 38 |
| Metadata & Technical Debt | 10% | 50 | 55 |
| User Adoption & Process Alignment | 10% | 50 | 68 |
| Platform Limits & API Headroom | 5% | 50 | 77 |

*Source: IBM IBV 2025–26, 150–300 user orgs*

---

## Pre-delivery Checklist

Run this before every client delivery — top to bottom, no shortcuts.

1. `ngrok http 3000` — copy the new public URL
2. Update the External Client App callback URL in Salesforce Setup → Apps → App Manager — wait 2 min for propagation
3. Update `SF_REDIRECT_URI` in `.env` to match the new ngrok URL
4. `npm run dev` — confirm "Server running on port 3000" in terminal
5. Send `http://<ngrok-url>/auth/start` to the client with 3-sentence brief (see below)
6. Client authorises — confirm token written to `.tokens.json` in terminal output
7. `npm run test-conn` — must return a live user count without errors
8. Copy `client-intake.example.json` → `client-intake.json`, fill in all business fields for this client
9. `npm run scan -- --org <clientOrgId>` — wait for completion (target: under 4 minutes)
10. Review all 7 domain scores in the terminal — can you explain every number?
11. After the stakeholder interview: fill in `executiveSummary`, `domainSummaries`, `pilotReadyDate`, and `negotiatedFees` in `client-intake.json`, then run `npm run rebuild-report -- --org <clientOrgId>` — no re-scan needed
12. Open the report URL in an **incognito window** and run the QC checklist below
13. Send the report URL to the client

**Auth link brief (send to client):**
> *"Click this link and log in with your Salesforce admin credentials. This grants read-only access — we cannot change anything in your org. Once you see a confirmation message, you're done. Takes 60 seconds."*

---

## QC Checklist

Run this on the report in incognito before sending to client. All 10 must pass.

- [ ] Cover page: org name, score ring, and pilot-ready date are all present and correct
- [ ] Section 1 (Cost of Inaction): 3 COI boxes show calculated figures, not zero or placeholder
- [ ] Section 2 (Domain Scores): all 7 domains render with score bars and benchmark markers
- [ ] Section 3 (Flex Credit): grid calculates from real case volume OR is cleanly suppressed when `handlingCostPerTransaction` is null
- [ ] Section 4 (Agentforce Value): projection uses real data OR section is cleanly hidden
- [ ] Section 5 (Roadmap): all roadmap items have an owner badge and effort label
- [ ] Section 6 (ROI Calculator): sliders work and totals update live; investment option fees show negotiated prices if set
- [ ] Appendix: all 7 SOQL queries are displayed with correct analysis window labels
- [ ] No "Acme Corp" or "Your Organisation" placeholder text visible anywhere
- [ ] No JavaScript errors in browser DevTools console (F12 → Console tab)

---

## Common Issues

### Security Health Check returns 0 in Dev Edition

The `/connect/security/health-check` endpoint returns HTTP 404 on Salesforce Developer Edition orgs. The scan catches this gracefully via the `safe()` wrapper and scores Security at 0 (hard blocker). This is expected on Dev Edition — client orgs on Enterprise or Unlimited editions return real data.

### ProcessDefinition not available in Dev Edition

The Tooling API `ProcessDefinition` object (used to count legacy Process Builder automations) is not accessible in Developer Edition. The `legacyAutomationCount` signal stays at 0. Client orgs return real counts.

### LoginHistory — no Status filter

SOQL does not support filtering `LoginHistory` on the `Status` field. The scan counts all login events in the last 90 days and approximates unique user count by dividing by the number of months in the window (heuristic: ~1 login event per active user per month). The resulting `loginRatePct` is an estimate. For precise counts, a Salesforce admin can pull this from the Setup audit trail.

### Duplicate detection and case reasons use a 12-month analysis window

Both GROUP BY queries (duplicate detection and top case reasons) are scoped to `CreatedDate = LAST_N_MONTHS:12` by default. This prevents timeouts on large legacy orgs with millions of historical records and focuses the analysis on recently created data. The window is configurable via `analysisWindowMonths` in the scan config JSON. Field completeness scans all records regardless of this setting — Agentforce will encounter historical data, so completeness is always measured across the full dataset.

### Supabase Storage bucket missing

If `uploadReport` logs "Bucket not found", the `reports` bucket has not been created. Go to Supabase Dashboard → Storage → New bucket → name it `reports` → set to Private. Reports are always saved locally in `reports/` and served via the ngrok URL — the Supabase upload is an archive copy only and does not affect report delivery.
