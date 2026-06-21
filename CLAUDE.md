# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Start Protocol

Read these files at the start of every session, in order:
1. This file — coding rules and hard constraints
2. `Documents/PROJECT_CONTEXT.md` — complete project context: architecture, pipeline, signal types, config system, known workarounds
3. `Documents/Implementation.md` — full build plan and canonical code patterns per phase
4. `Documents/Progress.md` — current phase, last task, and any blockers

The user will tell you which phase and task to work on. At the end of every session, update `Documents/Progress.md` with the current state.

---

## Project Overview

Salesforce org health + Agentforce AI readiness assessment platform. Scans a client's Salesforce org across 7 domains, scores each domain 0–100, computes a weighted AI Readiness Index, and generates an interactive HTML report. The report is served locally via ngrok + Express. Supabase is used as an archive store only — not the delivery mechanism.

**Stage:** Phase 7 (First Pilot Delivery) in progress. Phases 1–6 complete. See `Documents/Progress.md`.

---

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode), compiled with `tsc`, run in dev with `tsx`
- **Backend:** Express.js — OAuth routes, scan pipeline trigger, `/reports` static file serving
- **Database:** PostgreSQL via Supabase — Auth, Vault, Storage
- **Salesforce SDK:** jsforce **v3** (`^3.0.0`) — OAuth, REST API, Tooling API, SOQL
- **AI (Phase 8+):** Anthropic Claude API — not used until after 5 paid engagements
- **Local tunnelling (pilot):** ngrok — exposes `localhost:3000` for OAuth callback + report serving
- **Package manager:** npm

---

## Project Structure

```
src/
  auth/
    server.ts         — Express: /auth/start, /auth/callback, /health, /reports static route
    oauth.ts          — jsforce OAuth2 config
    connection.ts     — getConnection(orgId?) reads .tokens.json, auto-refreshes
  scan/
    types.ts          — All signal interfaces + AllSignals
    config.ts         — ScanConfig, ObjectScanConfig, DEFAULT_CONFIG, USE_CASE_OBJECTS, loadConfig()
    index.ts          — runAllScans(conn, config): Phase A parallel / Phase B per-object / Phase C Tooling
    limits.ts         — Domain 7: Limits API
    security.ts       — Domain 3: Security Health Check REST endpoint
    data-quality.ts   — Domain 1: scanFieldCompleteness + scanDuplicateRate (config-driven, windowed)
    automation.ts     — Domain 2: FlowVersionView (Flow fallback), ApexOrgWideCoverage, ProcessDefinition
    knowledge.ts      — Domain 4: Knowledge articles + case coverage gap (windowed)
    metadata.ts       — Domain 5: CustomField + InstalledSubscriberPackage counts
    adoption.ts       — Domain 6: LoginHistory + Task counts
  scoring/
    rubric.ts         — DOMAIN_WEIGHTS, HARD_BLOCKER_THRESHOLD, INDUSTRY_BENCHMARKS, bandScore, clamp
    engine.ts         — scoreFindings(): 7 domain scorers → ScoredResult
    findings-builder.ts — buildFindings(): human-readable finding strings from AllSignals
  report/
    json-schema.ts    — OrgMeta, ReportData interfaces + buildReportData() + buildDomainMeta(w)
    generator.ts      — generateReport(data): injects window.REPORT_DATA before </head>
    storage.ts        — uploadReport(orgId, html): Supabase Storage upload (archive only)
  db/
    supabase.ts       — Supabase client singleton
    queries.ts        — saveResults(): inserts scan_runs, scan_domain_scores, scan_findings

scripts/
  run-scan.ts         — Full pipeline CLI: connect → scan → score → report → upload → URL
  rebuild-report.ts   — Loads cached signals + client-intake.json → regenerates HTML (no re-scan)
  test-connection.ts  — Smoke test: COUNT(Id) FROM User
  test-scan.ts        — Gate: runAllScans() against live org
  test-scoring.ts     — Gate: scoreFindings() confirmation
  test-report.ts      — Gate: writes reports/test.html
  setup-db.sql        — Supabase schema DDL (run once in SQL Editor)

templates/
  orgpulse-v2.html    — Report template. Reads window.REPORT_DATA. DO NOT modify structure.

reports/              — gitignored. Output: {orgId}.html + {orgId}-signals.json
client-intake.json         — gitignored. Per-client business context.
client-intake.example.json — Committed template with realistic example values.
Documents/
  PROJECT_CONTEXT.md  — Full project context (architecture, pipeline, all known issues)
  Implementation.md   — Build plan + canonical code patterns
  Progress.md         — Phase status + task log
```

---

## Important Commands

```bash
# Dev (hot reload)
npm run dev              # tsx watch src/auth/server.ts — port 3000

# Production
npm run build            # tsc → dist/
npm run start            # node dist/auth/server.js

# Pipeline
npm run scan -- --org <orgId>                    # default (service use case)
npm run scan -- --org <orgId> --use-case sales   # sales preset
npm run scan -- --org <orgId> --use-case field_service
npm run scan -- --org <orgId> --config ./x.json  # custom objects

# Rebuild report from cached signals (no re-scan)
npm run rebuild-report -- --org <orgId>

# Smoke test (after OAuth)
npm run test-conn

# Lint / type check
npm run lint             # tsc --noEmit

# ngrok (pilot only — new URL every session)
ngrok http 3000          # copy URL → update SF callback + SF_REDIRECT_URI in .env
```

**Supabase key naming (May 2026 change):** use `sb_publishable_...` (frontend) and `sb_secret_...` (backend) — not the old JWT `anon`/`service_role` keys.

---

## Coding Conventions

- TypeScript strict mode throughout — no `any` in scan function return types
- File naming: `kebab-case` files, `camelCase` functions/variables, `PascalCase` interfaces/types
- All env vars via `dotenv` — never hardcoded
- Supabase client: one singleton in `src/db/supabase.ts` — import it, never re-instantiate
- Use `SUPABASE_SECRET_KEY` (`sb_secret_...`) in all backend code — never `SUPABASE_PUBLISHABLE_KEY`
- No comments explaining what code does — only comments explaining non-obvious WHY

---

## Zero-Copy Contract (apply to every scan function)

Raw API responses must be nulled immediately after signal extraction, before returning:

```typescript
export async function scanXxx(conn: Connection): Promise<XxxSignal> {
  let raw = await conn.query(`SELECT COUNT(Id) total FROM ...`)
  const signal = { total: (raw.records[0] as any).total }
  raw = null as any   // discard raw data before returning
  return signal       // only computed values leave this function
}
```

Signal return types are restricted to: `number`, `boolean`, `string` (API names only — never record values), `Record<string, number>`. No objects containing Salesforce record data.

---

## Scan Config

Object selection is fully configurable — never hardcoded. Every scan reads from a `ScanConfig`:

```typescript
interface ScanConfig {
  agentforceUseCase:    'service' | 'sales' | 'field_service' | 'custom'
  objects:              ObjectScanConfig[]
  maxCustomObjects:     number               // default 20
  adoptionLookbackDays: number               // default 90 — FIXED, do not change to 12 months
  analysisWindowMonths: number               // default 12 — GROUP BY query window only
}
```

`adoptionLookbackDays` and `analysisWindowMonths` are intentionally different values:
- **90 days** for adoption — measures current active users; 12 months would miscount inactive orgs
- **12 months** for GROUP BY — prevents timeouts on large legacy orgs; field completeness is always unbounded

Config resolved by `loadConfig()`: Tier 1 (always) + Tier 2 (use-case preset) + Tier 3 (--config file). Objects below `minRecords` threshold are skipped. Max 20 custom objects.

---

## client-intake.json Fields

Two-phase fill-in workflow:

**Before scan:** `orgName`, `licenseCount`, `clouds`, `licenseUnitCostMonthly`, `useCase`, `handlingCostPerTransaction`, `handlingCostLabel`, `packageWaste`, `monthlyTransactionVolume`

**After stakeholder interview → then run `rebuild-report`:**
- `pilotReadyDate` — named month e.g. `"October 2026"` (auto: today + 16 weeks)
- `executiveSummary` — overrides auto-generated headline on cover page
- `domainSummaries` — per-domain text keyed by display name (e.g. `"Data quality & completeness"`)
- `negotiatedFees.optionBLow/High` — Option B fees (default 28000–35000)
- `negotiatedFees.optionCLow/High` — Option C fees (default 15000–18000)
- `negotiatedFees.monitoringRetainerMonthly` — default 3000
- Set low = high for a fixed fee rather than a range

---

## rebuild-report

`scripts/rebuild-report.ts` regenerates the HTML report from cached signals without re-scanning:
- Reads `reports/{orgId}-signals.json` (written by `run-scan.ts` after every scan)
- Reads current `client-intake.json`
- Calls `buildReportData()` → `generateReport()` → overwrites `reports/{orgId}.html`
- Does NOT call Salesforce, does NOT re-run DB writes, does NOT re-upload to Supabase

Use this after the stakeholder interview to add narrative fields and negotiated fees.

---

## Report Serving

Reports are served locally via Express static route — Supabase Storage is archive only:
- `src/auth/server.ts` mounts `GET /reports/:file` → `reports/` directory with `text/html` content-type
- `run-scan.ts` derives the URL base from `SF_REDIRECT_URI` (strips `/auth/callback`)
- URL format: `http://<ngrok-base>/reports/{orgId}.html`

**Why not Supabase Storage as primary?** Supabase returns `text/plain` + CSP sandbox header for HTML files, which blocks inline rendering. The Express static route was the fix.

---

## Audit Middleware (Phase 8+)

`auditMessagesBeforeAPICall()` runs before every Claude API call. It throws if any tool result exceeds 500 characters or matches PII patterns (email, phone, name). If this throws, fix the tool function — never weaken the middleware. Anthropic DPA + Zero Data Retention required before any EU client engagement.

---

## Scoring Rubric

Domain weights (must sum to 1.0):
- `data_quality` 25%, `automation` 20%, `security` 15%, `knowledge` 15%, `metadata` 10%, `adoption` 10%, `limits` 5%
- Hard blocker threshold: domain score < 50
- Industry benchmarks in `src/scoring/rubric.ts` — source: IBM IBV 2025–26

---

## Things Claude Code Must Never Do

- **Never return raw Salesforce records from a scan function** — only computed signals
- **Never store raw org data in Supabase** — no JSONB blobs, no record content in any column
- **Never send record-level data in Claude API messages** — fix the tool, not the middleware
- **Never add `write` OAuth scopes** — read-only only: `api`, `refresh_token`, `offline_access`
- **Never store OAuth tokens in plain text** — `.tokens.json` is pilot-only; upgrade to Supabase Vault before multi-client
- **Never SELECT field values in SOQL** — aggregate queries only (`COUNT`, `SUM`, `GROUP BY`)
- **Never skip the null-after-use pattern** — raw API responses must be nulled before returning
- **Never modify `templates/orgpulse-v2.html` structure** — only the `window.REPORT_DATA` injection point changes per client
- **Never build Phase 8 code** (Claude agent, BullMQ, frontend) before 5 paid engagements

---

## Supabase Schema

Tables: `connected_orgs`, `scan_runs`, `scan_domain_scores`, `scan_findings`. Full DDL in `scripts/setup-db.sql`. The `scan_configs` table is optional — schema in `Documents/Implementation.md`.

DB stores only: integers, percentages, ENUM values, human-written finding strings. No raw org data.

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| No BullMQ this phase | Scans run synchronously. Add at client 3+ for concurrent scans. |
| No frontend / Next.js | Consultant runs scans from terminal; client gets a served URL. |
| No Claude agent yet | Findings written as templates in `findings-builder.ts`. Agent after engagement 5. |
| ngrok instead of Render | Laptop is the server for pilot — zero deployment overhead. |
| `tsx` for dev, `tsc` for prod | Fast iteration vs. compiled output for Render. |
| `window.REPORT_DATA` injection | One template works for sample and live reports — no templating engine. |
| Express static route for reports | Supabase Storage returns text/plain + CSP sandbox for HTML — blocks inline rendering. |
| Signal caching to `{orgId}-signals.json` | Allows `rebuild-report` to regenerate from narrative edits without re-scanning the org. |
| `domainSummaries` keyed by display name | Template renders `d.name` (display name) — intake JSON should match what a human sees. |
| `analysisWindowMonths` separate from `adoptionLookbackDays` | Adoption needs 90 days (current users); GROUP BY needs 12-month cap (large org timeout prevention). |
| `buildDomainMeta(w)` function not const | SOQL display strings in report appendix embed the actual configured window value dynamically. |
| `negotiatedFees` in client-intake.json | Actual deal pricing flows into the report's investment options section; defaults are list prices. |
| Anthropic DPA required | Must sign DPA + enable Zero Data Retention before any EU client engagement. |
| Security Health Check 404 on Dev Edition | `safe()` catches it, Security scores 0. Client orgs on Enterprise/Unlimited return real data. |
| LoginHistory no Status filter | SOQL doesn't support it. Scan counts all 90-day events, divides by 3 as unique-user heuristic. |
| Token persistence via `.tokens.json` | Pilot is single-client. Upgrade to Supabase Vault for multi-client. |
| `FlowVersionView` with `Flow` fallback | `FlowVersionView` has fault-path columns; `Flow` used as fallback with fault-path signals zeroed. |
| `ProcessDefinition` inner try/catch | Not supported in all editions — isolated so it can't bring down the whole automation domain scan. |
| jsforce `^3.0.0` | jsforce skipped v2 stable; v3 (3.10.16) is current and type-compatible. |
| External Client App not Connected App | Salesforce Dev Edition (Summer '25+) uses External Client Apps in UI; OAuth flow is identical. |
| `sfap_api` scope excluded | "Access the Salesforce API Platform" is for Agentforce AI APIs (Phase 8) only. |

---

## Last Updated

21 June 2026
