# OrgPulse — Full Project Context

> Single source of truth for Claude Chat, Claude Code, and any new collaborator.
> Read this file before asking questions or writing code.
> Last updated: 21 June 2026

---

## What This Product Is

**OrgPulse** is a consulting tool built by Yukti Global. It connects to a client's Salesforce org via read-only OAuth, scans it across 7 domains, scores each domain 0–100, computes a weighted AI Readiness Index, and generates an interactive HTML report. The report is served to the consultant via a local URL (ngrok + Express). Supabase is used as an archive store only — it is not the delivery mechanism.

**Business purpose:** Pre-sale and discovery tool. Before a client commits to an Agentforce implementation, Yukti runs OrgPulse to identify blockers, quantify waste, and produce a professional deliverable that justifies the engagement. The report includes cost-of-inaction calculations, domain scores with industry benchmarks, a Flex Credit model, an Agentforce value projection, a prioritised roadmap, and a configurable ROI calculator.

**Who runs it:** A Yukti consultant (Nitin), from their laptop. Not a SaaS product. Not customer-facing software. No frontend beyond the report itself.

---

## Current State — Phase 7 (First Pilot Delivery)

| Phase | Status |
|-------|--------|
| Phase 1 — Infrastructure & OAuth | ✅ Complete |
| Phase 2 — Scan Tools (all 7 domains) | ✅ Complete |
| Phase 3 — Scoring Engine | ✅ Complete |
| Phase 4 — Report Generator | ✅ Complete |
| Phase 5 — Full Pipeline | ✅ Complete |
| Phase 6 — Hardening & Runbook | ✅ Complete |
| Phase 7 — First Pilot Delivery | 🔄 In progress — P7.1 next (connect client org) |
| Phase 8 — Claude Agent + BullMQ | 🔲 Not started — gated on 5 paid engagements |

**Last confirmed working state:** Full pipeline run at 62/100 on Dev Edition. 7 domains, 2 hard blockers (security, knowledge), 14 findings, signals cache written. `tsc --noEmit` clean.

---

## Tech Stack (actual versions in use)

| Layer | Library | Version |
|-------|---------|---------|
| Runtime | Node.js + TypeScript strict | Node 20, TS 5 |
| Dev runner | tsx watch | ^4.0.0 |
| HTTP server | Express.js | ^4.18.0 |
| Salesforce SDK | jsforce | **^3.0.0** (not v2 — v2 was never released stable) |
| Database | Supabase (PostgreSQL) | @supabase/supabase-js ^2.0.0 |
| AI (future) | Anthropic Claude API | @anthropic-ai/sdk ^0.24.0 (installed, not used yet) |
| Tunnelling | ngrok | CLI (new URL every session) |
| Package manager | npm | — |

---

## Repository Layout

```
src/
  auth/
    server.ts         — Express: /auth/start, /auth/callback, /health, /reports (static)
    oauth.ts          — jsforce OAuth2 config object
    connection.ts     — getConnection(orgId?) reads .tokens.json, auto-refreshes
  scan/
    types.ts          — ALL signal interfaces + AllSignals (the zero-copy contract)
    config.ts         — ScanConfig, ObjectScanConfig, DEFAULT_CONFIG, USE_CASE_OBJECTS, loadConfig()
    index.ts          — runAllScans(conn, config): Phase A parallel / Phase B per-object / Phase C Tooling
    limits.ts         — Domain 7: conn.limits() → LimitsSignal
    security.ts       — Domain 3: REST /connect/security/health-check → SecuritySignal
    data-quality.ts   — Domain 1: scanFieldCompleteness + scanDuplicateRate (config-driven)
    automation.ts     — Domain 2: FlowVersionView (Flow fallback), ApexOrgWideCoverage, ProcessDefinition
    knowledge.ts      — Domain 4: Knowledge articles + case coverage gap
    metadata.ts       — Domain 5: CustomField count + InstalledSubscriberPackage count
    adoption.ts       — Domain 6: LoginHistory + Task counts
  scoring/
    rubric.ts         — DOMAIN_WEIGHTS, HARD_BLOCKER_THRESHOLD, INDUSTRY_BENCHMARKS, bandScore, clamp
    engine.ts         — scoreFindings(): 7 private domain scorers → ScoredResult
    findings-builder.ts — buildFindings(): human-readable finding strings from AllSignals
  report/
    json-schema.ts    — OrgMeta, ReportData interfaces + buildReportData(orgId, signals, scores, meta?)
    generator.ts      — generateReport(data): injects window.REPORT_DATA before </head>
    storage.ts        — uploadReport(orgId, html): Supabase Storage upload (archive only)
  db/
    supabase.ts       — Supabase client singleton (import this, never re-instantiate)
    queries.ts        — saveResults(): inserts scan_runs, scan_domain_scores, scan_findings

scripts/
  run-scan.ts         — Full pipeline CLI: connect → scan → score → report → upload → local URL
  rebuild-report.ts   — Loads cached signals + client-intake.json → regenerates HTML (no re-scan)
  test-connection.ts  — Smoke test: COUNT(Id) FROM User WHERE IsActive = true
  test-scan.ts        — Gate: runs all scans, logs AllSignals
  test-scoring.ts     — Gate: logs ScoredResult, confirms hard blockers
  test-report.ts      — Gate: writes reports/test.html
  setup-db.sql        — Supabase schema DDL (run once in SQL Editor)

templates/
  orgpulse-v2.html    — The report. Reads window.REPORT_DATA. DO NOT modify structure.

reports/              — gitignored. Output: {orgId}.html + {orgId}-signals.json
Documents/
  Implementation.md   — Full build plan + canonical code patterns per phase
  Progress.md         — Phase status, completed tasks, blockers, decisions log
  PROJECT_CONTEXT.md  — This file

client-intake.json         — gitignored. Per-client business context filled before each scan.
client-intake.example.json — Committed template with realistic example values.
```

---

## NPM Scripts

```bash
npm run dev             # tsx watch src/auth/server.ts — port 3000
npm run build           # tsc → dist/
npm run start           # node dist/auth/server.js
npm run scan            # tsx scripts/run-scan.ts
npm run rebuild-report  # tsx scripts/rebuild-report.ts
npm run test-conn       # tsx scripts/test-connection.ts
npm run lint            # tsc --noEmit
```

**CLI flags for scan:**
```bash
npm run scan -- --org <orgId>                          # default (service use case)
npm run scan -- --org <orgId> --use-case sales
npm run scan -- --org <orgId> --use-case field_service
npm run scan -- --org <orgId> --config ./custom.json   # custom objects

npm run rebuild-report -- --org <orgId>                # regenerate from cached signals
```

---

## Pipeline Flow (end to end)

```
ngrok http 3000
  → browser opens /auth/start
  → jsforce redirects to Salesforce login
  → callback writes tokens to .tokens.json

npm run scan -- --org <orgId>
  → getConnection(orgId) loads .tokens.json
  → runAllScans(conn, config) → AllSignals
      Phase A (parallel): limits, security, knowledge, metadata, adoption
      Phase B (per-object): scanFieldCompleteness + scanDuplicateRate for each object in config
      Phase C (Tooling API): automation (FlowVersionView, ApexOrgWideCoverage, ProcessDefinition)
  → signals written to reports/{orgId}-signals.json
  → buildFindings(signals) → Finding[]
  → scoreFindings(signals, findings) → ScoredResult
  → saveResults(orgId, signals, scored) → Supabase (scan_runs, scan_domain_scores, scan_findings)
  → buildReportData(orgId, signals, scored, meta) → ReportData
  → generateReport(data) → HTML string
  → write reports/{orgId}.html
  → uploadReport(orgId, html) → Supabase Storage (archive)
  → log local URL: http://<ngrok-base>/reports/{orgId}.html

npm run rebuild-report -- --org <orgId>
  → read reports/{orgId}-signals.json
  → read client-intake.json
  → buildReportData + generateReport (same as above, no Salesforce call)
  → overwrite reports/{orgId}.html
  → log local URL
```

---

## Signal Types (zero-copy contract)

All scan functions return only computed values. Raw API responses are `null`ed before return. No Salesforce record content ever leaves a scan function.

```typescript
AllSignals {
  limits:      LimitsSignal       // apiUsagePct, storageUsagePct, fileUsagePct
  security:    SecuritySignal     // healthCheckScore, failingCheckCount, criticalCheckCount, guestUserRisk
  dataQuality: FieldCompletenessSignal[]  // per-object: objectName, totalRecords, completionRates
  duplicates:  DuplicateSignal[]          // per-object: objectName, duplicateCount, duplicateRate
  automation:  AutomationSignal   // totalActiveFlows, flowsWithNoFaultPath, legacyAutomationCount, apexCoveragePct, highRiskObjects
  knowledge:   KnowledgeSignal    // articleCount, staleArticleCount, topCaseReasons, coverageGapCount
  metadata:    MetadataSignal     // unusedFieldCount, abandonedPackageCount
  adoption:    AdoptionSignal     // loginRatePct, avgActivitiesPerUser
  caseVolume:  CaseVolumeSignal   // monthlyVolume, topReasons[]
  configUsed:  ScanConfig         // the resolved config used for this scan
}
```

Signal return types are restricted to: `number`, `boolean`, `string` (API names only), `Record<string, number>`. Never Salesforce record objects or field values.

---

## Scan Config System

Every scan reads from a `ScanConfig` object — nothing is hardcoded.

```typescript
interface ScanConfig {
  agentforceUseCase:    'service' | 'sales' | 'field_service' | 'custom'
  objects:              ObjectScanConfig[]   // tier1 always + tier2 for use case + tier3 from --config
  maxCustomObjects:     number               // default 20
  adoptionLookbackDays: number               // default 90 (fixed — do not change to 12 months)
  analysisWindowMonths: number               // default 12 — controls GROUP BY query date window only
}
```

`adoptionLookbackDays` and `analysisWindowMonths` are intentionally separate:
- `adoptionLookbackDays: 90` — measures current active users. 12 months would over-count inactive orgs.
- `analysisWindowMonths: 12` — scopes duplicate detection + case reason GROUP BY queries to prevent timeouts on large legacy orgs (millions of records). Field completeness is always unbounded.

Config resolution in `loadConfig()`:
1. Start with `DEFAULT_CONFIG` (5 Tier 1 objects)
2. Merge Tier 2 objects for the use case from `USE_CASE_OBJECTS`
3. Append Tier 3 custom objects from `--config` file (if provided)
4. Objects with fewer than `minRecords` records are skipped at scan time

---

## Scoring System

**Domain weights (must sum to 1.0):**
```
data_quality  25%   automation  20%   security  15%   knowledge  15%
metadata      10%   adoption    10%   limits     5%
```

**Hard blocker threshold:** score < 50 on any domain = hard blocker. Report prominently flags these.

**Industry benchmarks (IBM IBV 2025–26, 150–300 user orgs):**
```
data_quality: 54   automation: 58   security: 69   knowledge: 38
metadata:     55   adoption:   68   limits:   77
```

Scoring model: start-at-100 arithmetic deductions per domain (not band interpolation). Each domain scorer in `engine.ts` independently deducts points based on signal thresholds. `bandScore()` in `rubric.ts` exists as a utility but is not used in the main scoring path.

---

## client-intake.json

Per-client configuration file — gitignored. Filled before each scan. Two-phase workflow:

**Before the scan (business fields):**
- `orgName`, `licenseCount`, `clouds`, `licenseUnitCostMonthly`
- `useCase`, `handlingCostPerTransaction`, `handlingCostLabel`, `packageWaste`
- `monthlyTransactionVolume` — override scanned case volume if org has no real data

**After the stakeholder interview (narrative fields → then run `rebuild-report`):**
- `pilotReadyDate` — named month e.g. `"October 2026"` (auto-computes today + 16 weeks if null)
- `executiveSummary` — replaces auto-generated headline paragraph on cover page
- `domainSummaries` — per-domain text keyed by display name, e.g. `"Data quality & completeness"`
- `negotiatedFees` — overrides Yukti list prices: `optionBLow/High`, `optionCLow/High`, `monitoringRetainerMonthly`

Setting `negotiatedFees.optionBLow === optionBHigh` expresses a fixed fee (not a range).

---

## OrgMeta → ReportData Flow

`client-intake.json` is loaded as `OrgMeta` and passed to `buildReportData(orgId, signals, scored, meta?)`.

`buildReportData()` computes:
- **COI (Cost of Inaction):** inactive user waste, package waste, field completion cost
- **Flex Credit scenarios:** 3 deflection rates × handling cost × monthly volume
- **Agentforce value projection:** 3-year NPV model
- **Investment options:** Option A (self-build), Option B (Yukti delivers, uses negotiatedFees), Option C (Hybrid)
- **Domain objects:** scores + benchmark + findings + SOQL display strings (appendix)
- **Roadmap:** auto-generated from findings (priority tagged: `quick`/`medium`/`strategic`)
- **Headline finding:** from `findings-builder.ts`, overridden by `executiveSummary` if provided

`buildDomainMeta(w)` is a function (not a const) — takes `analysisWindowMonths` and embeds it in the SOQL display strings shown in the report appendix, so the appendix always reflects the actual window used.

---

## Report Delivery

Reports are served locally via Express static route:
- `src/auth/server.ts` mounts `/reports` → `reports/` directory with `text/html` content-type
- `run-scan.ts` derives the base URL from `SF_REDIRECT_URI` (the ngrok URL in `.env`)
- Local URL format: `http://<ngrok-base>/reports/{orgId}.html`

Supabase Storage (`reports` bucket) receives the HTML as an archive copy — it is NOT the primary delivery mechanism. Supabase blocked inline HTML rendering (returned `text/plain` + CSP sandbox). The local Express route was the fix.

**ngrok caveat:** New URL every session. Each new session requires:
1. `ngrok http 3000` → copy new URL
2. Update External Client App callback URL in Salesforce Setup (wait 2 min)
3. Update `SF_REDIRECT_URI` in `.env`

---

## Supabase

**Key naming (post May 2026 change):** Use `sb_publishable_...` (frontend) and `sb_secret_...` (backend), not the old JWT `anon`/`service_role` keys.

Backend always uses `SUPABASE_SECRET_KEY`. Never use `SUPABASE_PUBLISHABLE_KEY` in `src/`.

**Tables:**
- `connected_orgs` — org ID, instance URL, display name
- `scan_runs` — one row per scan: org ID, timestamp, overall score, hard blockers
- `scan_domain_scores` — 7 rows per scan: domain, score, weight, benchmark
- `scan_findings` — all findings: domain, text, evidence, severity
- `scan_configs` (optional) — client-specific JSON configs

DB stores only: integers, percentages, ENUM values, human-written finding strings. No raw org data, no JSONB blobs, no record content.

---

## Salesforce OAuth Setup

Uses **External Client App** (not Connected App — Salesforce Dev Edition Summer '25+ changed the UI; OAuth flow is identical).

**Scopes:**
- `api` ("Manage user data via APIs")
- `refresh_token, offline_access` ("Perform requests at any time")
- `sfap_api` ("Access the Salesforce API Platform") — **intentionally excluded** — this is for Agentforce AI Platform APIs (Phase 8 only)

Tokens stored in `.tokens.json` (gitignored). Single-client pilot. Upgrade to Supabase Vault before managing multiple simultaneous client tokens.

---

## Known Edge Cases & Workarounds

| Issue | Cause | Fix in place |
|-------|-------|-------------|
| Security score 0 on Dev Edition | `/connect/security/health-check` returns 404 | `safe()` wrapper catches 404, returns zero SecuritySignal |
| ProcessDefinition unavailable on Dev Edition | Tooling API object not accessible | Inner `try/catch` in `automation.ts` — `legacyAutomationCount` stays 0 |
| LoginHistory no Status filter | SOQL doesn't support filtering on Status | Counts all 90-day logins, divides by 3 as unique-user heuristic |
| KnowledgeArticle not in field completeness | Not queryable via aggregate SOQL | Handled exclusively by `knowledge.ts` scan |
| Product2.IsActive not COUNT-able | Boolean fields can't use COUNT() aggregate | Changed to `['Family', 'ProductCode']` in sales Tier 2 config |
| GROUP BY timeout on large orgs | Millions of historical records | `analysisWindowMonths: 12` scopes GROUP BY queries to `LAST_N_MONTHS:12` |
| Supabase blocks HTML rendering | Returns text/plain + CSP sandbox for Storage objects | Express static route serves reports locally; Supabase is archive only |
| jsforce "v2" | jsforce skipped v2 stable | Using `^3.0.0` (3.10.16) — API surface identical |

---

## Hard Constraints (never violate)

These are non-negotiable data privacy and security rules:

1. **Never return raw Salesforce records from a scan function** — only computed signals
2. **Never store raw org data in Supabase** — no JSONB blobs, no record content in any column
3. **Never send record-level data in Claude API messages** — fix the tool, not the middleware
4. **Never add `write` OAuth scopes** — read-only only: `api`, `refresh_token`, `offline_access`
5. **Never store OAuth tokens in plain text** — `.tokens.json` is pilot-only; upgrade to Supabase Vault before multi-client
6. **Never SELECT field values in SOQL** — aggregate queries only (`COUNT`, `SUM`, `GROUP BY`)
7. **Never skip the null-after-use pattern** — raw API responses must be `null`ed before returning
8. **Never modify `templates/orgpulse-v2.html` structure** — only the `window.REPORT_DATA` injection point changes per client
9. **Never build Phase 8 code** (Claude agent, BullMQ, frontend) before 5 paid engagements

---

## Zero-Copy Pattern (every scan function must follow this)

```typescript
export async function scanXxx(conn: Connection): Promise<XxxSignal> {
  let raw = await conn.query(`SELECT COUNT(Id) total FROM ...`)
  const signal = { total: (raw.records[0] as any).total }
  raw = null as any   // discard raw data before returning
  return signal       // only computed values leave this function
}
```

---

## Coding Conventions

- TypeScript strict mode — no `any` in scan function return types
- File naming: `kebab-case` files, `camelCase` functions/variables, `PascalCase` interfaces/types
- All env vars via `dotenv` — never hardcoded
- Supabase client: one singleton in `src/db/supabase.ts` — import it, never re-instantiate
- No comments explaining what code does — only comments explaining why (hidden constraints, workarounds)
- No error handling for scenarios that can't happen — only validate at system boundaries

---

## What Phase 8 Will Add (not yet built)

- **Claude agent** in `src/agent/` — replaces template-driven findings with AI narrative. Gated on 5 paid engagements.
- **BullMQ job queue** — concurrent multi-client scans. Add at client 3+.
- **`auditMessagesBeforeAPICall()` middleware** — runs before every Claude API call. Throws if any tool result exceeds 500 characters or matches PII patterns (email, phone, name). If this throws, fix the tool — never weaken the middleware. Anthropic DPA + Zero Data Retention required before any EU client.

---

## Environment Variables Required

```
SF_CLIENT_ID=        # External Client App consumer key
SF_CLIENT_SECRET=    # External Client App consumer secret
SF_REDIRECT_URI=     # Current ngrok URL + /auth/callback e.g. https://xxxx.ngrok.io/auth/callback

SUPABASE_URL=        # https://xxxx.supabase.co
SUPABASE_SECRET_KEY= # sb_secret_... (never the publishable key)
```

---

## Session Start Checklist (for Claude Code)

Read in order at the start of every session:
1. `CLAUDE.md` — coding rules and constraints
2. `Documents/Implementation.md` — full build plan + canonical code patterns
3. `Documents/Progress.md` — current phase, last task, blockers

At the end of every session: update `Documents/Progress.md` with the current state.

---

## Contacts

**Owner / consultant:** Nitin Savanur — Yukti Global
**Salesforce test org:** Developer Edition (scores are artificially low — Security 0, Knowledge 0 are expected on Dev Edition)
**Client orgs:** Enterprise or Unlimited Edition — all scan functions return real data
