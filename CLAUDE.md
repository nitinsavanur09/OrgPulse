# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Start Protocol

Read these three files at the start of every session, in order:
1. This file — coding rules and constraints
2. `Documents/Implementation.md` — full build plan, phase tasks, and canonical code patterns
3. `Documents/Progress.md` — current phase, last task, and any blockers

The user will tell you which phase and task to work on. At the end of every session, update `Documents/Progress.md` with the current state.

---

## Project Overview

Salesforce org health + Agentforce AI readiness assessment platform. Scans a client's Salesforce org across 7 domains, scores each domain 0–100, computes a weighted AI Readiness Index, and generates an interactive HTML report delivered via a 90-day Supabase signed URL.

**Stage:** Pre-code. Phase 1 not yet started. See `Documents/Progress.md`.

---

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode), compiled with `tsc`, run in dev with `tsx`
- **Backend:** Express.js — OAuth routes + scan pipeline trigger
- **Database:** PostgreSQL via Supabase — Auth, Vault, Realtime
- **Salesforce SDK:** jsforce v2 — OAuth, REST API, Tooling API, SOQL
- **AI (Phase 8+):** Anthropic Claude API — not used until after 5 paid engagements
- **Local tunnelling (pilot):** ngrok — exposes `localhost:3000` for OAuth callback
- **Package manager:** npm

---

## Project Structure

The planned layout (nothing built yet):

```
src/
  auth/         # OAuth server, token exchange, connection loader
  scan/         # 7 domain scan tools, config, signal types, orchestrator
  scoring/      # Rubric, scoring engine, findings builder
  report/       # HTML generator, Supabase Storage upload, ReportData schema
  db/           # Supabase client singleton, query helpers
scripts/
  test-connection.ts   # Smoke test: COUNT(Id) FROM User
  run-scan.ts          # Full pipeline CLI: connect → scan → score → report → URL
  setup-db.sql         # Supabase schema — run once in SQL Editor
templates/
  orgpulse-v2.html     # V2 report — reads window.REPORT_DATA; do not modify structure
```

---

## Important Commands

```bash
# Dev (hot reload)
npm run dev           # tsx watch src/auth/server.ts — port 3000

# Production
npm run build         # tsc → dist/
npm run start         # node dist/auth/server.js

# Pipeline
npm run scan -- --org <orgId>                    # default config (service use case)
npm run scan -- --org <orgId> --use-case sales   # sales preset
npm run scan -- --org <orgId> --config ./x.json  # custom config file

# Smoke test (after OAuth)
npm run test-conn     # tsx scripts/test-connection.ts

# Lint
npm run lint

# ngrok (pilot only — new URL every session)
ngrok http 3000       # copy URL → update SF Connected App callback + SF_REDIRECT_URI in .env
```

**Supabase key names (May 2026 change):** use `sb_publishable_...` (frontend) and `sb_secret_...` (backend) — not the old JWT `anon`/`service_role` keys.

---

## Coding Conventions

- TypeScript strict mode throughout — no `any` in scan function return types
- File naming: `kebab-case` files, `camelCase` functions/variables, `PascalCase` interfaces/types
- All env vars via `dotenv` — never hardcoded
- Supabase client: one singleton in `src/db/supabase.ts` — import it, never re-instantiate
- Use `SUPABASE_SECRET_KEY` (`sb_secret_...`) in backend — never `SUPABASE_PUBLISHABLE_KEY`

---

## Zero-Copy Contract (apply to every scan function)

Raw API responses must be nulled immediately after signal extraction, before returning. This is the pattern for every scan function:

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

Object selection is fully configurable — never hardcoded. Every scan reads from a `ScanConfig` object (see `src/scan/config.ts` in `Documents/Implementation.md` for the full type and `DEFAULT_CONFIG`). Config can be:
- `DEFAULT_CONFIG` (Tier 1 standard objects, service use case Tier 2)
- A use-case preset (`sales`, `field_service`)
- A custom JSON file passed via `--config` CLI flag

Tier 3 custom objects are discovered at runtime. Objects with fewer than 100 records are skipped. Max 20 custom objects per scan.

---

## Audit Middleware

`auditMessagesBeforeAPICall()` runs before every Claude API call (Phase 8+). It throws if any tool result exceeds 500 characters or matches PII patterns (email, phone, name). If this throws, fix the tool function — never weaken the middleware.

---

## Scoring Rubric

Domain weights (must sum to 1.0):
- `data_quality` 25%, `automation` 20%, `security` 15%, `knowledge` 15%, `metadata` 10%, `adoption` 10%, `limits` 5%
- Hard blocker threshold: domain score < 50
- Industry benchmarks are in `src/scoring/rubric.ts` — source: IBM IBV 2025–26

---

## Things Claude Code Must Never Do

- **Never return raw Salesforce records from a scan function** — only computed signals
- **Never store raw org data in Supabase** — no `JSONB` blobs, no record content in any column
- **Never send record-level data in Claude API messages** — fix the tool, not the middleware
- **Never add `write` OAuth scopes** — read-only only: `api`, `refresh_token`, `offline_access`
- **Never store OAuth tokens in plain text** — Supabase Vault only; never in a DB column, env var, or log
- **Never SELECT field values in SOQL** — aggregate queries only (`COUNT`, `SUM`, `GROUP BY`)
- **Never skip the null-after-use pattern** — raw API responses must be nulled before returning
- **Never modify `templates/orgpulse-v2.html` structure** — only the `window.REPORT_DATA` injection point changes per client
- **Never build Phase 8 code (Claude agent, BullMQ, frontend) before 5 paid engagements**

---

## Supabase Schema

Tables: `connected_orgs`, `scan_runs`, `scan_domain_scores`, `scan_findings`. Full DDL is in `scripts/setup-db.sql` (to be created). The `scan_configs` table (for client-specific configs) is optional — schema in `Documents/Implementation.md`.

DB stores only: integers, percentages, ENUM values, human-written finding strings. No raw org data.

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| No BullMQ this phase | Scans run synchronously. Add at client 3+ for concurrent scans. |
| No frontend / Next.js | Client gets a signed URL; you run scans from terminal. |
| No Claude agent yet | Narrative written as templates in `findings-builder.ts`. Agent added after engagement 5. |
| ngrok instead of Render | Laptop is the server for pilot — zero deployment overhead. |
| `tsx` for dev, `tsc` for prod | Fast iteration vs. compiled output for Render. |
| `window.REPORT_DATA` injection | One template works for both sample and live reports — no templating engine. |
| Anthropic DPA required | Must sign DPA + enable Zero Data Retention before any EU client engagement. |
| Security Health Check 404 on Dev Edition | `/connect/security/health-check` returns 404 on Developer Edition — `safe()` catches it, Security scores 0. Client orgs on Enterprise/Unlimited return real data. |
| LoginHistory no Status filter | SOQL doesn't support filtering `LoginHistory` on `Status`. Scan counts all events in 90 days and divides by 3 as a unique-user heuristic. |
| Token persistence via `.tokens.json` | Pilot is single-client — `.tokens.json` (gitignored) lets `test-conn` run as a separate process from the dev server. Upgrade to Supabase Vault when managing multiple simultaneous client tokens. |

## Last Updated
19 June 2026
