# OrgPulse — Implementation Plan

> **Read alongside:** `CLAUDE.md` (project context + rules) and `PROGRESS.md` (current state)
> **Scope:** Scan engine + report generation only. No frontend, no agent, no job queue.
> **Stack:** Node.js + TypeScript + jsforce + Supabase + ngrok (pilot)
> **How to use:** Tell Claude Code which phase and task you are working on. After each session, say "update PROGRESS.md" and Claude Code will write your current state.

---

## Project Structure

Create this before writing any code.

```
orgpulse/
├── src/
│   ├── auth/
│   │   ├── server.ts           # Express app — OAuth routes + /health
│   │   ├── oauth.ts            # OAuth2 config and token exchange
│   │   └── connection.ts       # getConnection(orgId) — loads tokens, auto-refreshes
│   ├── scan/
│   │   ├── index.ts            # runAllScans(conn, config) — orchestrates all scan tools
│   │   ├── types.ts            # Signal interfaces — the zero-copy contract
│   │   ├── config.ts           # ScanConfig type + DEFAULT_CONFIG + loadConfig()
│   │   ├── limits.ts           # Domain 7 — Limits API
│   │   ├── security.ts         # Domain 3 — Security Health Check
│   │   ├── data-quality.ts     # Domain 1 — field completeness + duplicates (uses config)
│   │   ├── automation.ts       # Domain 2 — flows, triggers, legacy automation
│   │   ├── knowledge.ts        # Domain 4 — Knowledge articles + case coverage gap
│   │   ├── metadata.ts         # Domain 5 — unused fields, abandoned packages
│   │   └── adoption.ts         # Domain 6 — login rate, activity logging
│   ├── scoring/
│   │   ├── engine.ts           # scoreFindings() — applies rubric, weighted index
│   │   ├── rubric.ts           # Weights, thresholds, band definitions, benchmarks
│   │   └── findings-builder.ts # Human-readable finding strings from signals
│   ├── report/
│   │   ├── generator.ts        # generateReport(data) → populated HTML string
│   │   ├── storage.ts          # uploadReport() → Supabase Storage → signed URL
│   │   └── json-schema.ts      # ReportData type + buildReportData() function
│   └── db/
│       ├── supabase.ts         # Supabase client singleton
│       └── queries.ts          # saveResults() and other DB helpers
├── scripts/
│   ├── test-connection.ts      # Smoke test: COUNT(Id) FROM User → log result
│   ├── run-scan.ts             # Full pipeline: connect→scan→score→report→upload→URL
│   └── setup-db.sql            # Supabase schema — run once in SQL Editor
├── templates/
│   └── orgpulse-v2.html        # V2 report template — reads window.REPORT_DATA
├── reports/                    # Local report output — gitignored
├── .env                        # Never commit
├── .env.example                # Commit this
├── CLAUDE.md                   # Project context for Claude Code
├── IMPLEMENTATION.md           # This file
├── PROGRESS.md                 # Current progress — updated after every session
├── tsconfig.json
├── package.json
└── .gitignore
```

### package.json

```json
{
  "scripts": {
    "dev":       "tsx watch src/auth/server.ts",
    "build":     "tsc",
    "start":     "node dist/auth/server.js",
    "scan":      "tsx scripts/run-scan.ts",
    "test-conn": "tsx scripts/test-connection.ts"
  },
  "dependencies": {
    "jsforce":               "^2.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "@anthropic-ai/sdk":     "^0.24.0",
    "express":               "^4.18.0",
    "dotenv":                "^16.0.0"
  },
  "devDependencies": {
    "typescript":     "^5.0.0",
    "tsx":            "^4.0.0",
    "@types/express": "^4.17.0",
    "@types/node":    "^20.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Environment Variables

Set up `.env` before writing any code.

> **Supabase key change (May 2026):** Supabase deprecated JWT-based `anon` / `service_role` keys.
> Use the new `sb_publishable_...` and `sb_secret_...` keys instead.
> Find them at: **Supabase Dashboard → Settings → API Keys** (not the old API Settings tab).
> Legacy keys still work but new projects should use the new format.

| Variable | Where to get it | When needed |
|----------|----------------|-------------|
| `SF_CLIENT_ID` | Salesforce Setup → App Manager → Connected App → Consumer Key | Phase 1 |
| `SF_CLIENT_SECRET` | Same location | Phase 1 |
| `SF_REDIRECT_URI` | Your ngrok URL + `/auth/callback` — update every ngrok session | Phase 1 |
| `SF_LOGIN_URL` | `https://login.salesforce.com` (sandbox: `https://test.salesforce.com`) | Phase 1 |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API Keys → Project URL | Phase 1 |
| `SUPABASE_SECRET_KEY` | Supabase Dashboard → Settings → API Keys → **Secret key** (`sb_secret_...`) — backend only, never expose | Phase 1 |
| `SUPABASE_PUBLISHABLE_KEY` | Same location → **Publishable key** (`sb_publishable_...`) — safe for frontend | Phase 3 |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys — unused this phase, add now | Phase 3 |
| `NODE_ENV` | `development` or `production` | Always |

### Supabase schema — run once in SQL Editor

```sql
CREATE TABLE connected_orgs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_org_id VARCHAR(18) UNIQUE NOT NULL,
  org_name          TEXT,
  instance_url      TEXT,
  status            TEXT DEFAULT 'connected',
  connected_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scan_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES connected_orgs(id),
  status             TEXT DEFAULT 'pending',
  ai_readiness_index SMALLINT,
  has_hard_blocker   BOOLEAN,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scan_domain_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id UUID REFERENCES scan_runs(id),
  domain      TEXT NOT NULL,
  score       SMALLINT,
  is_blocker  BOOLEAN DEFAULT FALSE
);

CREATE TABLE scan_findings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id  UUID REFERENCES scan_runs(id),
  domain       TEXT,
  severity     TEXT,
  title        TEXT,
  description  TEXT,
  evidence     TEXT,
  effort_days  NUMERIC(4,1),
  impact_score SMALLINT
);

ALTER TABLE scan_runs REPLICA IDENTITY FULL;
```

---

## Configurable Object Analysis

Object selection for data quality scanning is fully configurable — never hardcoded.
Every scan reads from a `ScanConfig` object, which can be:
- The built-in `DEFAULT_CONFIG` (Tier 1 standard objects)
- A client-specific config stored in `scan_configs` Supabase table
- A JSON file passed via CLI flag: `npm run scan -- --org [id] --config ./my-config.json`

### Config structure — `src/scan/config.ts`

```typescript
export interface ObjectScanConfig {
  apiName:        string            // Salesforce object API name e.g. "Contact"
  label:          string            // Human-readable label
  fields:         string[]          // Fields to check for completeness
  checkDuplicates?: boolean         // Whether to run duplicate detection (default: false)
  duplicateFields?: string[]        // Fields to GROUP BY for duplicate check e.g. ["Name","Email"]
  minRecords?:    number            // Skip object if record count below this (default: 100)
  tier:           'tier1' | 'tier2' | 'tier3'
}

export interface ScanConfig {
  agentforceUseCase:  'service' | 'sales' | 'field_service' | 'custom'
  objects:            ObjectScanConfig[]
  maxCustomObjects:   number        // Cap on tier3 objects (default: 20)
  adoptionLookbackDays: number      // Days to look back for login/activity (default: 90)
}

// ── Default config — used when no client-specific config exists ──────────────
export const DEFAULT_CONFIG: ScanConfig = {
  agentforceUseCase: 'service',
  maxCustomObjects: 20,
  adoptionLookbackDays: 90,
  objects: [
    // Tier 1 — always scanned, every use case
    {
      tier: 'tier1', apiName: 'Contact', label: 'Contact',
      fields: ['Email', 'Phone', 'Title', 'AccountId', 'FirstName', 'LastName'],
      checkDuplicates: true, duplicateFields: ['Name', 'Email'], minRecords: 0
    },
    {
      tier: 'tier1', apiName: 'Account', label: 'Account',
      fields: ['Industry', 'Phone', 'BillingCity', 'BillingCountry', 'Website'],
      checkDuplicates: true, duplicateFields: ['Name'], minRecords: 0
    },
    {
      tier: 'tier1', apiName: 'Lead', label: 'Lead',
      fields: ['Email', 'Phone', 'Company', 'LeadSource', 'Status'],
      checkDuplicates: false, minRecords: 0
    },
    {
      tier: 'tier1', apiName: 'Opportunity', label: 'Opportunity',
      fields: ['CloseDate', 'StageName', 'Amount', 'AccountId'],
      checkDuplicates: false, minRecords: 0
    },
    {
      tier: 'tier1', apiName: 'Case', label: 'Case',
      fields: ['Reason', 'Status', 'ContactId', 'AccountId', 'Priority'],
      checkDuplicates: false, minRecords: 0
    },
    // Tier 2 — added automatically based on agentforceUseCase
    // Service use case adds:
    {
      tier: 'tier2', apiName: 'KnowledgeArticle', label: 'Knowledge',
      fields: ['Title', 'Summary'], checkDuplicates: false, minRecords: 0
    },
    // Tier 3 — custom objects, discovered at runtime from org
    // Populated by Phase 1 object discovery scan, filtered by minRecords
  ]
}

// ── Use-case presets — auto-added Tier 2 objects ─────────────────────────────
export const USE_CASE_OBJECTS: Record<ScanConfig['agentforceUseCase'], ObjectScanConfig[]> = {
  service: [
    { tier: 'tier2', apiName: 'Case',         label: 'Case',          fields: ['Reason','Status','Priority','ContactId'], checkDuplicates: false, minRecords: 100 },
    { tier: 'tier2', apiName: 'EmailMessage', label: 'Email Message', fields: ['Status','FromAddress'],                   checkDuplicates: false, minRecords: 100 },
  ],
  sales: [
    { tier: 'tier2', apiName: 'Quote',         label: 'Quote',         fields: ['Status','ExpirationDate','AccountId'],   checkDuplicates: false, minRecords: 100 },
    { tier: 'tier2', apiName: 'Contract',      label: 'Contract',      fields: ['Status','StartDate','AccountId'],        checkDuplicates: false, minRecords: 100 },
    { tier: 'tier2', apiName: 'Product2',      label: 'Product',       fields: ['IsActive','Family','ProductCode'],       checkDuplicates: false, minRecords: 100 },
  ],
  field_service: [
    { tier: 'tier2', apiName: 'WorkOrder',            label: 'Work Order',          fields: ['Status','AccountId','ContactId'], checkDuplicates: false, minRecords: 100 },
    { tier: 'tier2', apiName: 'ServiceAppointment',   label: 'Service Appointment', fields: ['Status','FSL__Scheduled_Start__c'], checkDuplicates: false, minRecords: 100 },
    { tier: 'tier2', apiName: 'Asset',                label: 'Asset',               fields: ['Status','AccountId','SerialNumber'], checkDuplicates: false, minRecords: 100 },
  ],
  custom: [] // user provides full config
}

// ── Config loader — merges default + use-case + client overrides ──────────────
export function loadConfig(overrides?: Partial<ScanConfig>): ScanConfig {
  const base = { ...DEFAULT_CONFIG }
  if (!overrides) return base

  const useCase = overrides.agentforceUseCase ?? base.agentforceUseCase
  const tier2Objects = USE_CASE_OBJECTS[useCase] ?? []

  return {
    ...base,
    ...overrides,
    objects: [
      ...base.objects.filter(o => o.tier === 'tier1'),
      ...tier2Objects,
      ...(overrides.objects?.filter(o => o.tier === 'tier3') ?? [])
    ]
  }
}
```

### Supabase schema addition — client-specific configs

Add this table to `setup-db.sql`:

```sql
-- Optional: store client-specific scan configs
CREATE TABLE scan_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES connected_orgs(id),
  config_json  JSONB NOT NULL,    -- serialised ScanConfig — no org data, just config
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  is_active    BOOLEAN DEFAULT TRUE
);
```

### CLI usage examples

```bash
# Default config (Tier 1 + service use case Tier 2)
npm run scan -- --org abc123

# Sales use case
npm run scan -- --org abc123 --use-case sales

# Custom config from JSON file (for complex orgs)
npm run scan -- --org abc123 --config ./configs/acme-corp.json

# Example acme-corp.json — add custom objects to standard scan
{
  "agentforceUseCase": "service",
  "objects": [
    { "tier": "tier3", "apiName": "Customer_Feedback__c", "label": "Customer Feedback",
      "fields": ["Status__c", "Rating__c", "Contact__c"], "minRecords": 100 }
  ]
}
```

---

These are enforced by TypeScript return types and must never be bypassed.

- **Never SELECT field values in SOQL** — aggregate queries only (`COUNT`, `SUM`, `GROUP BY`)
- **Always null raw API responses** immediately after extracting signals, before returning
- **Signal return types only:** `number`, `boolean`, `string` API names, `Record<string, number>`
- **Never return raw records** from any scan function
- **Never store raw org data in Supabase** — no JSONB blobs, no record content
- **Never add write OAuth scopes** — `api`, `refresh_token`, `offline_access` only
- **Never store OAuth tokens in plain text** — Supabase Vault only

---

## Phase 1 — Infrastructure & OAuth

**Goal:** Salesforce org is connected. `npm run test-conn` returns the active user count.
**Gate to Phase 2:** Running `npm run test-conn` logs a live user count from your Dev Edition org without errors.

### P1.1 — External services setup

- [ ] Sign up for **Salesforce Developer Edition** — `developer.salesforce.com/signup`
  - Do this first — takes 5–10 min to activate. Do everything else while waiting.
- [ ] Create **Supabase project** — `supabase.com/dashboard`
  - Save: Project URL, service role key, anon key to `.env`
  - Enable Vault: Database → Vault → Enable
  - Run `scripts/setup-db.sql` in SQL Editor
- [ ] Create Supabase Storage bucket named `reports` — set to **Private**
- [ ] Register **Connected App** in your Dev Edition org
  - Setup → Apps → App Manager → New Connected App
  - Enable OAuth Settings
  - Scopes: `api`, `refresh_token`, `offline_access`
  - Callback URL: `http://localhost:3000/auth/callback` (update to ngrok URL later)
  - Save Consumer Key and Consumer Secret to `.env`
- [ ] Install **ngrok** — `ngrok.com/download`
  - Create account, authenticate: `ngrok config add-authtoken YOUR_TOKEN`

### P1.2 — Project scaffold

- [ ] `mkdir orgpulse && cd orgpulse && npm init -y`
- [ ] Install all dependencies (see package.json above)
- [ ] Create `tsconfig.json` (see above)
- [ ] Create `.env` from variables table. Add `.env` to `.gitignore` immediately.
- [ ] Create all folders: `mkdir -p src/auth src/scan src/scoring src/report src/db scripts templates reports`
- [ ] Create `.env.example` with all variable names but no values — commit this

### P1.3 — Supabase client

- [ ] **`src/db/supabase.ts`**
  - Export a single `createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)` instance
  - Use `SUPABASE_SECRET_KEY` (`sb_secret_...`) — this is the backend-only key that bypasses RLS
  - Never use `SUPABASE_PUBLISHABLE_KEY` in backend code — that is for the frontend only
  - Never instantiate in multiple places — import this singleton everywhere

```typescript
import { createClient } from '@supabase/supabase-js'

// sb_secret_... key — bypasses RLS, backend only, never expose to client
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
```

### P1.4 — OAuth server

- [ ] **`src/auth/oauth.ts`**
  - Export `oauth2 = new jsforce.OAuth2({ clientId, clientSecret, redirectUri })`
- [ ] **`src/auth/server.ts`** — Express app with three routes:
  - `GET /auth/start` → redirect to `oauth2.getAuthorizationUrl({ scope: 'api refresh_token offline_access' })`
  - `GET /auth/callback` → exchange code for tokens via jsforce → upsert `connected_orgs` → store tokens in `global.orgTokens` (pilot only — no Vault yet)
  - `GET /health` → `res.json({ status: 'ok' })` — for UptimeRobot later
- [ ] **`src/auth/connection.ts`** — `getConnection(orgId): Connection`
  - Loads tokens from `global.orgTokens`
  - Returns a `jsforce.Connection` — jsforce auto-refreshes expired tokens

### P1.5 — Smoke test

- [ ] **`scripts/test-connection.ts`**
  - Calls `getConnection()` → runs `SELECT COUNT(Id) cnt FROM User WHERE IsActive = true` → logs count
- [ ] **End-to-end test:**
  1. `ngrok http 3000` — copy the public URL
  2. Update Connected App callback URL in Salesforce to `https://xxx.ngrok-free.app/auth/callback`
  3. Update `SF_REDIRECT_URI` in `.env` to match
  4. `npm run dev` — confirm "Server running on port 3000"
  5. Open `http://localhost:3000/auth/start` in browser → Salesforce login → approve
  6. `npm run test-conn` → must log a user count

**Phase 1 complete when:** `npm run test-conn` logs a live user count without errors.

---

## Phase 2 — Scan Tools

**Goal:** All 7 domain scan functions built. `runAllScans(conn)` completes without errors against your Dev Edition org.
**Gate to Phase 3:** `runAllScans(conn)` returns a complete `AllSignals` object. No raw data in any log output.

### Zero-copy pattern — apply to every scan function

```typescript
// CORRECT pattern for every scan function
export async function scanXxx(conn: Connection): Promise<XxxSignal> {
  let raw = await conn.query(`SELECT COUNT(Id) total FROM ...`)

  // Extract only numbers/booleans/counts
  const signal = { total: (raw.records[0] as any).total }

  raw = null as any  // ← discard raw data before returning

  return signal      // ← only computed values leave this function
}
```

### P2.1 — Signal type contract + scan config

- [ ] **`src/scan/config.ts`** — full file as shown in the Configurable Object Analysis section above
  - `ScanConfig`, `ObjectScanConfig`, `DEFAULT_CONFIG`, `USE_CASE_OBJECTS`, `loadConfig()`
  - Test: `loadConfig()` returns 5 Tier 1 objects. `loadConfig({ agentforceUseCase: 'sales' })` returns 5 + 3 Tier 2 objects.
- [ ] **`src/scan/types.ts`** — all signal interfaces before writing any scan function
  ```typescript
  interface LimitsSignal     { apiUsagePct: number; storageUsagePct: number; fileUsagePct: number }
  interface SecuritySignal   { healthCheckScore: number; failingCheckCount: number; criticalCheckCount: number; guestUserRisk: boolean }
  interface FieldCompletenessSignal { objectName: string; totalRecords: number; completionRates: Record<string, number> }
  interface DuplicateSignal  { objectName: string; duplicateCount: number; duplicateRate: number }
  interface AutomationSignal { totalActiveFlows: number; flowsWithNoFaultPath: number; legacyAutomationCount: number; apexCoveragePct: number; highRiskObjects: string[] }
  interface KnowledgeSignal  { articleCount: number; staleArticleCount: number; topCaseReasons: string[]; coverageGapCount: number }
  interface MetadataSignal   { unusedFieldCount: number; abandonedPackageCount: number }
  interface AdoptionSignal   { loginRatePct: number; avgActivitiesPerUser: number }
  interface CaseVolumeSignal { monthlyVolume: number; topReasons: Array<{ reason: string; count: number }> }

  interface AllSignals {
    limits:      LimitsSignal
    security:    SecuritySignal
    dataQuality: FieldCompletenessSignal[]   // one entry per object in config
    duplicates:  DuplicateSignal[]           // one entry per object with checkDuplicates: true
    automation:  AutomationSignal
    knowledge:   KnowledgeSignal
    metadata:    MetadataSignal
    adoption:    AdoptionSignal
    caseVolume:  CaseVolumeSignal
    configUsed:  ScanConfig                  // store which config was used — for report
  }
  ```

### P2.2 — Domain 7: Platform limits (start here — proves connection works)

- [ ] **`src/scan/limits.ts`**
  - `conn.limits()` → extract `apiUsagePct`, `storageUsagePct`, `fileUsagePct`
  - Formula: `Math.round((Max - Remaining) / Max * 100)`
  - Null raw result. Return `LimitsSignal`.
  - **Test:** call directly and log — should show percentages only

### P2.3 — Domain 3: Security

- [ ] **`src/scan/security.ts`**
  - `conn.request('/services/data/v59.0/connect/security/health-check')`
  - Extract: `score`, count of `risks` by severity, check if any risk involves guest user
  - Null raw. Return `SecuritySignal`.

### P2.4 — Domain 1: Data quality (config-driven)

- [ ] **`src/scan/data-quality.ts`** — two functions, both receive config:
  - `scanFieldCompleteness(conn, objConfig: ObjectScanConfig)` — one aggregate `COUNT` SOQL per object
    - Builds field list dynamically from `objConfig.fields` — never hardcoded
    - SOQL: `SELECT COUNT(Id) total, COUNT(Email) Email_ct, COUNT(Phone) Phone_ct, ... FROM ${objConfig.apiName} WHERE IsDeleted = false`
    - Returns `FieldCompletenessSignal` — completion % per field, never field values
    - Skips object if `totalRecords < (objConfig.minRecords ?? 100)`
  - `scanDuplicateRate(conn, objConfig: ObjectScanConfig)` — only called if `objConfig.checkDuplicates === true`
    - Uses `objConfig.duplicateFields` for GROUP BY — never hardcoded to Name/Email
    - Returns `DuplicateSignal` — count and rate only
  - Called from `runAllScans` iterating over `config.objects` — not hardcoded list

### P2.5 — Domain 2: Automation

- [ ] **`src/scan/automation.ts`**
  - Tooling API `FlowDefinition`: active flows, count per object, count with `HasFaultConnector = false`
  - Tooling API `ApexOrgWideCoverage`: overall test coverage %
  - `ProcessDefinition` query: legacy automation still active (Process Builder / Workflow Rules)
  - Return `AutomationSignal` — counts and object name strings only, no flow XML

### P2.6 — Domain 4: Knowledge

- [ ] **`src/scan/knowledge.ts`**
  - `KnowledgeArticleVersion COUNT` + `MAX(LastPublishedDate)` for recency
  - Case reason frequency: `SELECT Reason, COUNT(Id) FROM Case GROUP BY Reason ORDER BY COUNT DESC LIMIT 20`
  - Compare top reasons against article count for coverage gap
  - Return `KnowledgeSignal` — counts and reason name strings only, no article content

### P2.7 — Domain 5: Metadata debt

- [ ] **`src/scan/metadata.ts`**
  - Tooling API `FieldDefinition` cross-referenced against layout/flow/Apex for unused field count
  - `InstalledPackage` query for installed packages with last activity > 18 months
  - Return `MetadataSignal` — counts only

### P2.8 — Domain 6: User adoption

- [ ] **`src/scan/adoption.ts`**
  - `LoginHistory` SOQL: `GROUP BY UserId HAVING COUNT(Id) >= 3` over last 90 days → login rate %
  - `Task` SOQL: activity count per user over last 90 days → average
  - Return `AdoptionSignal` — percentages and averages only, no user names or IDs

### P2.9 — Orchestrator

- [ ] **`src/scan/index.ts`** — `runAllScans(conn, config?: Partial<ScanConfig>): Promise<AllSignals>`
  - Call `loadConfig(config)` at the top — merge defaults with any overrides passed in
  - Phase A (parallel): `Promise.all([limits, security, adoption, knowledge, caseVolume])`
  - Phase B (sequential): iterate `resolvedConfig.objects` — call `scanFieldCompleteness` and conditionally `scanDuplicateRate` per object config
  - Phase C (sequential): automation, metadata
  - Wrap each call in `try/catch` — on failure log error and return safe default signal, never crash
  - Return complete `AllSignals` object including `configUsed: resolvedConfig`

**Phase 2 complete when:** `runAllScans(conn)` returns a complete typed object. No raw data, no record values in any log output.

---

## Phase 3 — Scoring Engine

**Goal:** `scoreFindings(signals)` produces domain scores (0–100), hard blocker flags, weighted AI Readiness Index, and human-readable finding strings.
**Gate to Phase 4:** Dev Edition org produces a score you can explain and defend to a client.

### P3.1 — Rubric

- [ ] **`src/scoring/rubric.ts`**

```typescript
export const DOMAIN_WEIGHTS = {
  data_quality: 0.25,
  automation:   0.20,
  security:     0.15,
  knowledge:    0.15,
  metadata:     0.10,
  adoption:     0.10,
  limits:       0.05,
} as const

export const HARD_BLOCKER_THRESHOLD = 50

export const INDUSTRY_BENCHMARKS = {
  data_quality: 54,
  automation:   58,
  security:     69,
  knowledge:    38,
  metadata:     55,
  adoption:     68,
  limits:       77,
} // Source: IBM IBV 2025-26, 150-300 user orgs

// Scoring bands — apply per domain
// data_quality example:
// 80-100: core field completion >80%, duplicate rate <5%
// 65-79:  core field completion 70-80%, duplicate rate <10%
// 40-64:  core field completion 50-70% OR duplicate rate >10%
// 0-39:   core field completion <50% OR duplicate rate >15% → HARD BLOCKER
```

### P3.2 — Scoring engine

- [ ] **`src/scoring/engine.ts`** — `scoreFindings(signals: AllSignals): ScoredResult`
  - For each domain: apply rubric band thresholds → produce 0–100 integer score
  - Weighted index: `Math.round(Σ(domain_score × weight))`
  - Hard blockers: array of domain names where `score < HARD_BLOCKER_THRESHOLD`
  - Return `{ domains: DomainScore[], overallIndex: number, hardBlockers: string[] }`
- [ ] Unit test with synthetic inputs:
  - All scores 50 → index ~50
  - All scores 80 → index ~80
  - One domain at 30 → appears in `hardBlockers`
  - Verify weights sum to exactly `1.0`

### P3.3 — Findings builder

- [ ] **`src/scoring/findings-builder.ts`** — `buildFindings(signals, scores): Finding[]`
  - Each `Finding`: `{ domain, severity, title, description, evidence, effortDays, impactScore }`
  - `description` — business language, must reference at least one specific number from signals
    - Good: `"Email field is blank on 34% of Contact records — agents cannot identify 142,844 customers"`
    - Bad: `"Email completion rate is below threshold"`
  - `evidence` — the query result as a plain string: `"COUNT query: 142,844 / 420,130 contacts missing Email"`
  - `severity` — `'critical'` if in blocker band, `'warning'` if in risk band, `'info'` otherwise
  - Minimum 2 findings per domain. Never include field values, names, or emails in any string.

### P3.4 — Validate on Dev Edition

- [ ] Run full scan + scoring against your Dev Edition org
- [ ] Log all 7 domain scores and the weighted index
- [ ] Adjust rubric band thresholds if scores don't feel right for what you know about the org — expected on first run
- [ ] Verify every finding description contains a specific number

**Phase 3 complete when:** Dev Edition produces a score and finding set you can explain and defend.

---

## Phase 4 — Report Generator

**Goal:** `generateReport(data)` produces a populated V2 HTML report. Supabase Storage upload returns a working signed URL.
**Gate to Phase 5:** Signed URL opens correctly in an incognito window with all sections displaying real data.

### P4.1 — Update V2 HTML template

- [ ] Open `templates/orgpulse-v2.html`
- [ ] At the very top of the `<script>` block, add:
  ```javascript
  const REPORT_DATA = window.REPORT_DATA || ACME_SAMPLE_DATA
  ```
- [ ] Replace all hardcoded `Acme Corp` values throughout the JS with `REPORT_DATA.field` references
- [ ] Test: open in browser with `ACME_SAMPLE_DATA` active — all sections render, no JS errors

### P4.2 — ReportData schema

- [ ] **`src/report/json-schema.ts`** — `ReportData` TypeScript interface
  - Must cover every field the V2 template reads from `REPORT_DATA`
  - Key fields: `reportMeta`, `orgProfile`, `index`, `costOfInaction`, `flexCredit`, `domains[]`, `roadmap[]`, `investmentOptions[]`
- [ ] **`buildReportData(orgId, signals, scores): ReportData`** in same file
  - Maps `ScoredResult + AllSignals → ReportData`
  - Computes waste figures:
    - Inactive user waste: `inactiveUserCount × 800` (£/year default license cost)
    - Abandoned package waste: flag count (exact cost added manually from interview)
  - Sets `flexCredit` from `signals.caseVolume`
  - Sets `pilotReadyDate` = today + 16 weeks as a named month string

### P4.3 — Generator and storage

- [ ] **`src/report/generator.ts`** — `generateReport(data: ReportData): string`
  - Load `templates/orgpulse-v2.html` once at module init (not per call)
  - Inject before `</head>`:
    ```typescript
    const script = `<script>window.REPORT_DATA=${JSON.stringify(data)}<\/script>`
    return template.replace('</head>', script + '</head>')
    ```
  - Return complete HTML string
- [ ] **`src/report/storage.ts`** — `uploadReport(orgId, html): Promise<{ signedUrl: string; filename: string }>`
  - Filename pattern: `${orgId}-${Date.now()}.html`
  - `supabase.storage.from('reports').upload(filename, html, { contentType: 'text/html' })`
  - `createSignedUrl(filename, 60 * 60 * 24 * 90)` — 90-day expiry
  - Return `{ signedUrl, filename }`

### P4.4 — Test report generation

- [ ] Write quick test script: `runAllScans → scoreFindings → buildReportData → generateReport → write to reports/test.html`
- [ ] Open `reports/test.html` in Chrome. Run full QC checklist:
  - [ ] Cover page: org name, score ring, pilot date present
  - [ ] Section 1: 3 COI boxes show calculated figures (not Acme Corp sample)
  - [ ] Section 2: all 7 domain scores render with benchmark bars
  - [ ] Section 3: Flex Credit grid calculates from real case volume
  - [ ] Section 4: Agentforce value projection uses real data
  - [ ] Section 5: roadmap items have owner + effort labels
  - [ ] Section 6: ROI calculator sliders work and update live
  - [ ] Appendix: all 7 SOQL queries displayed
  - [ ] No "Acme Corp" text remaining anywhere in the document
  - [ ] No JS errors in DevTools console
- [ ] Test `uploadReport` → open signed URL in incognito → all sections load correctly

**Phase 4 complete when:** Signed URL opens in incognito with real data in all sections and no errors.

---

## Phase 5 — Full Pipeline

**Goal:** One command runs the entire flow end-to-end and logs a shareable signed URL.
**Gate to Phase 6:** Three consecutive clean pipeline runs from terminal. No manual steps between connect and signed URL.

### P5.1 — Pipeline script

- [ ] **`scripts/run-scan.ts`** — usage examples:

```bash
npm run scan -- --org abc123                          # default config (service use case)
npm run scan -- --org abc123 --use-case sales         # sales use case preset
npm run scan -- --org abc123 --config ./acme.json     # full custom config from file
```

Parse CLI args and call `runAllScans(conn, config)`:

```
connect          → 🔌 Connecting to org...
loadConfig       → ⚙️  Config: service use case, 7 objects in scope
runAllScans      → 🔍 Running scans... (logs each domain as it completes)
scoreFindings    → 📊 Scoring domains... (logs index + blocker count)
buildReportData  → 📄 Building report data...
generateReport   → 🖨️  Generating HTML...
uploadReport     → ☁️  Uploading to Supabase Storage...
saveResults      → 💾 Saving results to database...
                 → ✅ Done! AI Readiness Index: 47/100
                 → 📎 Report URL (90 days): https://...
```

### P5.2 — Save results

- [ ] **`src/db/queries.ts`** — `saveResults(orgId, scores, reportData)`
  - Insert `scan_runs` row with `status = 'complete'`, `ai_readiness_index`, `has_hard_blocker`
  - Insert 7 `scan_domain_scores` rows — one per domain
  - Insert all `scan_findings` rows from `buildFindings()`
  - If any step fails: update `scan_runs.status = 'failed'`, log error, do not crash

### P5.3 — Error resilience

- [ ] Each scan function already has `try/catch` (Phase 2) — confirm defaults are sensible
- [ ] `buildReportData` fills any missing signal fields with safe zero-values before generating
- [ ] If `uploadReport` fails: save report to `reports/` locally and log the local path as fallback

### P5.4 — Pipeline validation

- [ ] Run `npm run scan -- --org [devEditionOrgId]` — target: completes in under 4 minutes
- [ ] Verify Supabase rows created: `connected_orgs` (1), `scan_runs` (1, status=complete), `scan_domain_scores` (7), `scan_findings` (multiple)
- [ ] Open signed URL in incognito — full QC checklist passes
- [ ] Run the pipeline 3 more times — consistent output, no crashes

**Phase 5 complete when:** Three consecutive clean runs, each producing a valid signed URL.

---

## Phase 6 — Hardening

**Goal:** Pipeline handles edge cases gracefully. Ready to use on a real client org.
**Gate to Phase 7:** Five clean pipeline runs across different org profiles. QC checklist passes every time.

### P6.1 — Edge case testing

Test each scenario against a real or simulated org:

- [ ] **Zero Knowledge articles** — Knowledge domain should score as hard blocker. Report Knowledge section renders with zero-article state, not blank or crashed.
- [ ] **All users active (adoption > 85%)** — adoption domain scores in "good" band. Benchmark bar renders correctly when score exceeds median.
- [ ] **Security Health Check at 100** — security section shows "Healthy". No broken renders, no missing data.
- [ ] **SOQL permission failure** — temporarily revoke `api` scope from Connected App. Pipeline should log the error per domain and produce a partial report rather than crash.
- [ ] **Org with no custom objects** — object discovery returns empty, pipeline continues with Tier 1 objects only.
- [ ] **Large org (>500 fields on one object)** — metadata scan completes without timeout.

### P6.2 — Pre-delivery runbook

Write this in `README.md` — your repeatable checklist before every client delivery:

```
Pre-delivery checklist:
1. ngrok http 3000                          → copy new URL
2. Update SF Connected App callback URL     → wait 2 min
3. Update SF_REDIRECT_URI in .env
4. npm run dev                              → confirm server running
5. Send auth link to client
6. Client authorises                        → confirm in terminal
7. npm run test-conn                        → confirm user count
8. npm run scan -- --org [clientOrgId]      → wait for completion
9. Add stakeholder interview context        → edit executiveSummary + domain summaries
10. Set pilotReadyDate                      → specific named month
11. Re-run generateReport + uploadReport    → if you edited reportData after scan
12. Open signed URL in incognito            → run QC checklist
13. Send signed URL to client
```

### P6.3 — Update project files

- [ ] Update `CLAUDE.md` with any rubric adjustments or edge case patterns discovered during build
- [ ] Update `PROGRESS.md` with Phase 6 completion and any notes for future sessions

**Phase 6 complete when:** Five clean pipeline runs across varied org profiles. QC checklist passes every time.

---

## Phase 7 — First Pilot Delivery

**Goal:** Real client org scanned, report delivered, readout call completed, feedback collected.
**Gate to Phase 8:** Client has received the signed URL, readout call completed, feedback form returned.

### P7.1 — Connect client org

- [ ] Start ngrok fresh — copy URL, update Connected App callback URL and `.env`
- [ ] Send auth link to client with 3-sentence brief:
  > *"Click this link and log in with your Salesforce admin credentials. This grants read-only access — we cannot change anything in your org. Once you see a confirmation message, you're done. Takes 60 seconds."*
- [ ] Confirm connection: `npm run test-conn` against their org

### P7.2 — Run scan and build report

- [ ] `npm run scan -- --org [clientOrgId]`
- [ ] Review all 7 domain scores and findings — are they defensible? Can you explain every number?
- [ ] Open `reportData` JSON. Edit:
  - `executiveSummary` — add qualitative context from stakeholder interviews
  - Domain `summaries` — reference specific things the admin or CTO said
  - `pilotReadyDate` — set a specific named month
- [ ] Re-generate and re-upload if you edited the JSON after the scan
- [ ] Run full QC checklist — must pass all 10 points

### P7.3 — Deliver report

- [ ] Send pre-readout email with signed URL — 24 hours before the call
  - Subject: `Your OrgPulse AI Readiness Report — [score]/100`
  - Body: one sentence on the verdict + headline waste figure + confirm readout time
- [ ] **Readout call — 60 minutes:**
  - `0–5 min` — open with score: *"Your org scores X/100. Did anything surprise you?"* — listen
  - `5–20 min` — walk cost of inaction section together, confirm each figure with the client
  - `20–35 min` — hard blockers only: explain the specific Agentforce failure each causes
  - `35–45 min` — ROI calculator live on screen, drag sliders to their chosen option
  - `45–60 min` — close: *"Does Option B or Option C make more sense to explore first?"* — then silence. Do not fill the silence.
- [ ] Send follow-up email within 2 hours: summary of what was agreed, next step, specific date
- [ ] Send 5-question feedback form: score surprise / most useful section / least useful / would pay / what price

### P7.4 — Log learnings

- [ ] Start `what-i-rebuilt-manually.md` — every manual step in this delivery goes on the list
- [ ] Update `PROGRESS.md` to mark Phase 7 complete and note key learnings

**Phase 7 complete when:** Client has the signed URL, readout done, feedback form returned, "what I rebuilt manually" log started.

---

## Phase 8 Triggers — Do Not Build Yet

Start Phase 8 only after ALL of the following are true:

- [ ] 5 paid engagements closed and delivered
- [ ] £30,000+ revenue recognised
- [ ] `what-i-rebuilt-manually.md` has 10+ items
- [ ] At least 1 client referral or repeat engagement

**Phase 8 scope (in order):** Render deployment → BullMQ job queue → Claude agent narrative generation → client dashboard frontend.

---

## Key Decisions Reference

| Decision | Rationale |
|----------|-----------|
| No BullMQ / queue in this phase | Scans run synchronously. Fine for single pilot client. Add at client 3+ when concurrent scans needed. |
| No frontend / Next.js | Client gets a signed URL. You run scans from terminal. Frontend added only when clients need self-serve access. |
| No Claude agent | Narrative written as templates in `findings-builder.ts`. Agent added after engagement 5 when patterns are validated from real client orgs. |
| ngrok instead of Render | Laptop is the server for pilot. Zero deployment overhead. Switch to Render when always-on is needed for multiple clients. |
| `tsx` for dev, `tsc` for prod | Fast iteration in dev. Compiled output for Render deployment. |
| `window.REPORT_DATA` injection | One template works for both sample display and live reports. No templating engine needed. |
| Anthropic DPA before agent | Not blocking this phase. Must be signed before using Claude API with any EU client data. Contact enterprise@anthropic.com. |