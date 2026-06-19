# OrgPulse — Progress Tracker

> **How this file works:**
> - Claude Code reads this at the start of every session to know exactly where you are
> - At the end of every session, say **"update PROGRESS.md"** and Claude Code will write your current state
> - Never edit this manually — let Claude Code maintain it
> - Keep `IMPLEMENTATION.md` open alongside this for task details

---

## Current State

**Active phase:** Phase 5 — Full Pipeline
**Last session:** 17 June 2026
**Next task:** P5.1 — `scripts/run-scan.ts` — full pipeline CLI: connect → scan → score → buildReportData → generateReport → uploadReport → saveResults → log signed URL

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Infrastructure & OAuth | ✅ Complete | OAuth live, `npm run test-conn` passes |
| Phase 2 — Scan Tools | ✅ Complete | All 7 domains pass; `runAllScans()` gate passed |
| Phase 3 — Scoring Engine | ✅ Complete | All 7 domain scorers pass; gate: 57/100 on Dev Edition, 3 expected hard blockers |
| Phase 4 — Report Generator | ✅ Complete | `reports/test.html` generated; score 57/100 from Dev Edition confirmed |
| Phase 5 — Full Pipeline | 🔲 Not started | |
| Phase 6 — Hardening | 🔲 Not started | |
| Phase 7 — First Pilot Delivery | 🔲 Not started | |

---

## Completed Tasks

### Phase 4

- [x] **P4.1** — `templates/orgpulse-v2.html` — `ACME_SAMPLE_DATA` + `REPORT_DATA` fallback; `renderReport()` populates all DOM elements; roadmap + investment options converted to JS-driven
- [x] **P4.2** — `src/report/json-schema.ts` — `ReportData` interface + `buildReportData(orgId, signals, scores, meta?)` — computes waste, flex credit, agentforce value, domain objects, auto-generates roadmap from findings
- [x] **P4.3a** — `src/report/generator.ts` — `generateReport(data)` — injects `window.REPORT_DATA` before `</head>`; template loaded once at module init
- [x] **P4.3b** — `src/report/storage.ts` — `uploadReport(orgId, html)` — Supabase Storage upload + 90-day signed URL
- [x] **P4.4** — `scripts/test-report.ts` + `npm run test-report` — generates `reports/test.html`; confirmed 57/100 from Dev Edition, real data injected, no Acme Corp in rendered output

### Phase 3

- [x] **P3.1** — `src/scoring/rubric.ts` — `DOMAIN_WEIGHTS`, `HARD_BLOCKER_THRESHOLD`, `INDUSTRY_BENCHMARKS`, `DomainScore`, `ScoredResult`, `bandScore`, `clamp`
- [x] **P3.2** — `src/scoring/engine.ts` — 7 private domain scorers + `scoreFindings()` + 7-test inline unit suite (all pass)
- [x] **P3.3** — `src/scoring/findings-builder.ts` — `Finding` interface + `buildFindings()`, ≥2 findings per domain with specific numbers
- [x] **P3.4** — `scripts/test-scoring.ts` — Phase 3 gate script; confirmed against Dev Edition: 57/100 index, 3 expected hard blockers (security/knowledge/adoption), 14 findings, all gate checks pass

### Phase 2

- [x] **P2.1** — `src/scan/config.ts` — `ScanConfig`, `ObjectScanConfig`, `DEFAULT_CONFIG`, `USE_CASE_OBJECTS`, `loadConfig()`
- [x] **P2.1** — `src/scan/types.ts` — all signal interfaces + `AllSignals`
- [x] **P2.2** — `src/scan/limits.ts` — Domain 7: Platform Limits via `conn.limits()`
- [x] **P2.3** — `src/scan/security.ts` — Domain 3: Security Health Check REST endpoint (fallback for Dev Edition)
- [x] **P2.4** — `src/scan/data-quality.ts` — Domain 1: `scanFieldCompleteness` + `scanDuplicateRate`, both config-driven
- [x] **P2.5** — `src/scan/automation.ts` — Domain 2: `FlowVersionView` (fallback to `Flow`), `ApexOrgWideCoverage`, `ProcessDefinition` (isolated try/catch)
- [x] **P2.6** — `src/scan/knowledge.ts` — Domain 4: `scanKnowledge` + `scanCaseVolume`
- [x] **P2.7** — `src/scan/metadata.ts` — Domain 5: `CustomField` count + `InstalledSubscriberPackage` count
- [x] **P2.8** — `src/scan/adoption.ts` — Domain 6: `LoginHistory` + `Task` counts
- [x] **P2.9** — `src/scan/index.ts` — Orchestrator: Phase A parallel / Phase B per-object / Phase C Tooling API
- [x] **Smoke test** — `scripts/test-scan.ts` — `runAllScans()` gate confirmed against live Dev Edition org

### Phase 1

- [x] **P1.2** — Project scaffold: folders, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env`
- [x] **P1.3** — `src/db/supabase.ts` — Supabase client singleton using `SUPABASE_SECRET_KEY`
- [x] **P1.4** — `src/auth/oauth.ts` — jsforce OAuth2 config object
- [x] **P1.4** — `src/auth/server.ts` — Express server with `/auth/start`, `/auth/callback`, `/health`
- [x] **P1.4** — `src/auth/connection.ts` — `getConnection(orgId?)` reads from `.tokens.json`
- [x] **P1.5** — `scripts/test-connection.ts` — smoke test: `COUNT(Id) FROM User WHERE IsActive = true`
- [x] **SQL** — `scripts/setup-db.sql` — full Supabase schema (5 tables including optional `scan_configs`)
- [x] `npm install` — all dependencies installed, `tsc --noEmit` passes clean
- [x] **P1.1 (partial)** — Supabase project created; URL + Secret key in `.env`
- [x] **P1.1 (partial)** — Salesforce External Client App created (Dev Edition uses External Client Apps, not Connected Apps)
  - Scopes added: "Manage user data via APIs" (`api`) + "Perform requests at any time" (`refresh_token, offline_access`)
  - Note: "Access the Salesforce API Platform" (`sfap_api`) intentionally NOT added — that is for Agentforce AI Platform APIs (Phase 8 only)

---

## In Progress

**Phase 5 next: `scripts/run-scan.ts`**

Wire the full pipeline: `getConnection → runAllScans → scoreFindings → buildReportData → generateReport → uploadReport → saveResults → log URL`. Then P5.2 `src/db/queries.ts` (saveResults), P5.3 error resilience, P5.4 three-run validation.

---

## Blockers & Notes

- **jsforce version:** `Implementation.md` references `^2.0.0` but jsforce never published a v2 stable. Updated to `^3.0.0` (latest stable: 3.10.16). API surface is compatible — all jsforce v3 types compile cleanly.
- **Token persistence:** Pilot stores tokens in `.tokens.json` (gitignored). This lets `npm run test-conn` work as a separate process from the dev server. Replace with Supabase Vault before multi-client use (Phase 6).
- **External Client Apps:** Salesforce Dev Edition (Summer '25+) uses External Client Apps instead of Connected Apps. The OAuth 2.0 flow is identical — jsforce config unchanged. Scope labels differ: `api` = "Manage user data via APIs", `refresh_token` = "Perform requests at any time". Do NOT add `sfap_api` ("Access the Salesforce API Platform") — that is for Agentforce AI APIs only.
- **Security Health Check endpoint:** `/services/data/v59.0/connect/security/health-check` is not available in Dev Edition — returns 404. Safe fallback (zeros) in place. Will return real data on a client org.
- **ProcessDefinition (Tooling API):** Not supported in Dev Edition. Wrapped in inner try/catch — `legacyAutomationCount` stays 0. Will work on client orgs.
- **LoginHistory.Status filter:** SOQL does not allow filtering `LoginHistory` on the `Status` field. Removed filter — query counts all login events in last 90 days instead.
- **KnowledgeArticle excluded from field completeness:** `KnowledgeArticle` object has no `Title`/`Summary` accessible via aggregate SOQL. Removed from `DEFAULT_CONFIG.objects` — Knowledge domain is handled entirely by `src/scan/knowledge.ts`.

---

## Decisions Made This Session

| Decision | Rationale |
|----------|-----------|
| jsforce `^3.0.0` instead of `^2.0.0` | jsforce skipped v2 stable; v3 is current and type-compatible |
| Token persistence via `.tokens.json` | `test-conn` runs as a separate process — in-memory global not shared; Vault comes in Phase 6 |
| External Client App instead of Connected App | Salesforce Dev Edition (Summer '25+) replaced Connected Apps with External Client Apps in the UI; OAuth flow is unchanged |
| `sfap_api` scope excluded | "Access the Salesforce API Platform" is for Agentforce AI Platform APIs (Phase 8), not standard REST/SOQL access |
| `FlowVersionView` with `Flow` fallback | `FlowVersionView` has fault-path columns; basic `Flow` object used as fallback with fault-path signals zeroed |
| `ProcessDefinition` inner try/catch | Not supported in all editions — isolated so it can't bring down the whole automation domain |
| `KnowledgeArticle` removed from objects config | Not queryable via aggregate SOQL field completeness; handled exclusively by `knowledge.ts` |
| `LoginHistory` no Status filter | SOQL doesn't allow filtering on `Status` — counts all logins then approximates unique users via ÷3 heuristic |
| Arithmetic deduction model (not band interpolation) | `bandScore` helper is in `rubric.ts` but engine uses start-at-100 deductions per domain — simpler to tune per-domain in field |
| `ACTIVITY_MEDIAN_PER_90_DAYS = 15` hardcoded in findings-builder | `INDUSTRY_BENCHMARKS.adoption` is a domain score (68/100), not an activity count — using separate constant avoids misleading copy |
| Security score 0 on Dev Edition is expected | Health check endpoint returns 404; fallback zeros all security signals; score 0 is a hard blocker on Dev Edition only — client orgs return real data |

---

## "What I Rebuilt Manually" Log

_Populated during Phase 7 delivery. Each item becomes a Phase 8 product backlog item._

---

## How to Start a New Session

Tell Claude Code:

> *"Read CLAUDE.md, IMPLEMENTATION.md, and PROGRESS.md. My current state is Phase 1 in progress — P1.1 manual steps done (or pending). Help me complete [specific task]."*

Claude Code will orient itself and pick up exactly where you left off.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| 🔲 | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| 🚧 | Blocked |

---

_Last updated: 19 June 2026 — Phase 4 complete + v2 schema refactor complete. `client-intake.json` workflow live — no code edits needed per client. `Documents/Calculations.html` and `Documents/Calculations.md` updated: license cost $800/yr → $165/mo × 12, `annualWaste` → `totalVerifiedWaste`, Flex Credit table now shows pre-computed `monthlyCreditCost` and `monthlyNetSaving` per scenario, "Most Likely" tag → "Likely", ROI default fee $30k → $28k, inputs table reflects current `client-intake.json` field names and defaults. Starting Phase 5 next._
