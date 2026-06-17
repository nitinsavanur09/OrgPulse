# OrgPulse — Progress Tracker

> **How this file works:**
> - Claude Code reads this at the start of every session to know exactly where you are
> - At the end of every session, say **"update PROGRESS.md"** and Claude Code will write your current state
> - Never edit this manually — let Claude Code maintain it
> - Keep `IMPLEMENTATION.md` open alongside this for task details

---

## Current State

**Active phase:** Phase 1 — Infrastructure & OAuth
**Last session:** 16 June 2026
**Next task:** P1.1 (manual) — complete external service setup, then run end-to-end OAuth test (P1.5)

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Infrastructure & OAuth | 🔄 In progress | Code complete; awaiting P1.1 manual steps + P1.5 live test |
| Phase 2 — Scan Tools | 🔲 Not started | |
| Phase 3 — Scoring Engine | 🔲 Not started | |
| Phase 4 — Report Generator | 🔲 Not started | |
| Phase 5 — Full Pipeline | 🔲 Not started | |
| Phase 6 — Hardening | 🔲 Not started | |
| Phase 7 — First Pilot Delivery | 🔲 Not started | |

---

## Completed Tasks

### Phase 1

- [x] **P1.2** — Project scaffold: folders, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env`
- [x] **P1.3** — `src/db/supabase.ts` — Supabase client singleton using `SUPABASE_SECRET_KEY`
- [x] **P1.4** — `src/auth/oauth.ts` — jsforce OAuth2 config object
- [x] **P1.4** — `src/auth/server.ts` — Express server with `/auth/start`, `/auth/callback`, `/health`
- [x] **P1.4** — `src/auth/connection.ts` — `getConnection(orgId?)` reads from `.tokens.json`
- [x] **P1.5** — `scripts/test-connection.ts` — smoke test: `COUNT(Id) FROM User WHERE IsActive = true`
- [x] **SQL** — `scripts/setup-db.sql` — full Supabase schema (5 tables including optional `scan_configs`)
- [x] `npm install` — all dependencies installed, `tsc --noEmit` passes clean

---

## In Progress

**P1.1 — External services setup (manual steps — you must do these):**

1. **Salesforce Developer Edition** — sign up at `developer.salesforce.com/signup` (takes 5–10 min to activate)
2. **Supabase project** — create at `supabase.com/dashboard`, copy Project URL + Secret key into `.env`
   - Enable Vault: Database → Vault → Enable
   - Run `scripts/setup-db.sql` in SQL Editor
   - Create Storage bucket named `reports` — set to **Private**
3. **Salesforce Connected App** — Setup → Apps → App Manager → New Connected App
   - Enable OAuth, scopes: `api`, `refresh_token`, `offline_access`
   - Callback URL: `http://localhost:3000/auth/callback` (update to ngrok URL before testing)
   - Copy Consumer Key → `SF_CLIENT_ID` in `.env`, Consumer Secret → `SF_CLIENT_SECRET` in `.env`
4. **ngrok** — install from `ngrok.com/download`, authenticate: `ngrok config add-authtoken YOUR_TOKEN`

**P1.5 — End-to-end test (after P1.1):**

```bash
# 1. Start ngrok, copy the URL it gives you
ngrok http 3000

# 2. Update Connected App callback URL in Salesforce to:
#    https://xxx.ngrok-free.app/auth/callback
# 3. Update SF_REDIRECT_URI in .env to match

# 4. Fill in all other .env values (SUPABASE_URL, SUPABASE_SECRET_KEY, SF_CLIENT_ID, SF_CLIENT_SECRET)

# 5. Start the dev server
npm run dev
# Should print: 🚀 Server running on port 3000

# 6. Open in browser → log in → approve
open http://localhost:3000/auth/start

# 7. Run smoke test (in a new terminal)
npm run test-conn
# Should print: ✅ Active users in org: N
```

---

## Blockers & Notes

- **jsforce version:** `Implementation.md` references `^2.0.0` but jsforce never published a v2 stable. Updated to `^3.0.0` (latest stable: 3.10.16). API surface is compatible — all jsforce v3 types compile cleanly.
- **Token persistence:** Pilot stores tokens in `.tokens.json` (gitignored). This lets `npm run test-conn` work as a separate process from the dev server. Replace with Supabase Vault before multi-client use (Phase 6).

---

## Decisions Made This Session

| Decision | Rationale |
|----------|-----------|
| jsforce `^3.0.0` instead of `^2.0.0` | jsforce skipped v2 stable; v3 is current and type-compatible |
| Token persistence via `.tokens.json` | `test-conn` runs as a separate process — in-memory global not shared; Vault comes in Phase 6 |

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

_Last updated: 16 June 2026 — Phase 1 code complete; awaiting manual P1.1 setup_
