# OrgPulse Demo Guide

Two scenarios. Two delivery paths. Pick the one that fits your situation.

---

## Scenarios

| | Scenario A | Scenario B |
|--|------------|------------|
| **Client** | NovaStar Insurance Group | PrecisionTech Manufacturing |
| **Use case** | Service Cloud | Sales Cloud |
| **Licenses** | 320 | 180 |
| **Index** | 69/100 | 49/100 |
| **Hard blockers** | 1 (Knowledge) | 3 (DQ + Automation + Knowledge) |
| **Story** | Strong adoption, thin KB — one clear fix | Red org, ERP migration debt — urgent scope |

Use **Scenario A** for prospects who are "mostly there" — shows a clear path and bounded consulting scope.
Use **Scenario B** for prospects with legacy debt — creates urgency and justifies a broader engagement.

---

## Fast Path — Instant Demo (No Salesforce Org Needed)

Generates a full report in ~10 seconds from the pre-computed signals.

### Scenario A — NovaStar

```bash
cp data/demo/scenario-a-novastar/signals.json reports/demo-novastar-signals.json
cp data/demo/scenario-a-novastar/client-intake.json client-intake.json
npm run rebuild-report -- --org demo-novastar
```

Open `reports/demo-novastar.html` in a browser.

**What to look for:**
- Cover: 69/100 · "Ready for Pilot" · 1 hard blocker
- Knowledge domain: red Hard Blocker badge · 8 articles vs 20 case categories
- ROI: 2,400 cases/month × $22 = $244,800/yr projected Agentforce value
- Adoption: 88/100 — highlight this as the positive signal, platform is well-used
- Automation: 60/100 — 18 flows without fault paths is the talking point

### Scenario B — PrecisionTech

```bash
cp data/demo/scenario-b-precisiontech/signals.json reports/demo-precisiontech-signals.json
cp data/demo/scenario-b-precisiontech/client-intake.json client-intake.json
npm run rebuild-report -- --org demo-precisiontech
```

Open `reports/demo-precisiontech.html`.

**What to look for:**
- Cover: 49/100 · "Conditionally Ready" · 3 hard blockers
- Data Quality: 49/100 — 11.2% Contact duplicate rate from 2022 ERP migration
- Automation: 40/100 — 14 active Process Builder flows never migrated
- Knowledge: 15/100 — zero published articles
- Package waste: $14,000/yr — CPQ subscription on decommissioned implementation
- ROI calculator: $45/opportunity × 420/month Agentforce value story

---

## Full Path — Authentic Org Scan

For when you have a Salesforce sandbox and want a live end-to-end demo.

### Step 1: Import CSV files

Import in this order (each object depends on the previous):

**Both scenarios:**
1. `accounts.csv` — import as Account; map `ExternalId` → Account External ID field
2. `contacts.csv` — import as Contact; map `Account_ExternalId__c` → Account External ID lookup
3. `leads.csv` — import as Lead
4. `opportunities.csv` — import as Opportunity; map `Account_ExternalId__c` → Account
5. `cases.csv` — import as Case; map both `Account_ExternalId__c` and `Contact_ExternalId__c`
6. `tasks.csv` — import as Task (Activity)

**Scenario A only (Service):**
7. `email_messages.csv` — import as EmailMessage (requires Cases to exist first)

**Scenario B only (Sales):**
7. `products.csv` — import as Product2
8. `quotes.csv` — import as Quote
9. `contracts.csv` — import as Contract

**Recommended tool:** Salesforce Data Loader (handles volumes > 50k and supports external ID lookups).

### Step 2: Configure non-CSV signals (manual setup)

These signals cannot come from CSV import — configure them in the sandbox org:

| Signal | Where to configure in Salesforce |
|--------|----------------------------------|
| Flows + fault paths | Setup > Process Automation > Flows — create sample flows, some with fault connectors omitted |
| Apex test coverage | Developer Console > Run All Tests — coverage % will be reported automatically |
| Process Builder count | Setup > Process Automation > Process Builder — create a few legacy automations |
| Security Health Check | Setup > Security > Health Check — adjust password policy to generate some risks |
| Knowledge articles | Setup > Knowledge > Articles — publish a few articles (8 for NovaStar, 0 for PrecisionTech) |
| Custom field count | Setup > Object Manager — the existing fields from your sandbox count automatically |
| Installed packages | Setup > Apps > Packaging > Installed Packages — leave as-is |

### Step 3: Run scan

```bash
# NovaStar (after OAuth for the sandbox org)
npm run scan -- --org [sandboxOrgId] --use-case service

# PrecisionTech
npm run scan -- --org [sandboxOrgId] --use-case sales
```

Then fill in `client-intake.json` from the scenario folder and run `npm run rebuild-report -- --org [orgId]` to add the narrative.

> **Note:** Domain scores from a live scan will differ from the fast-path mock because CSV volumes are smaller (3k contacts vs 25k in signals.json). The fast-path signals.json represents a realistic full-size org; the sandbox scan shows what you'd get with the imported test volumes. Both work for demo purposes — use fast path for presenting, full path for technical credibility.

---

## Switching Between Demos

When switching scenarios, remember to swap `client-intake.json`:

```bash
# Switch to Scenario A
cp data/demo/scenario-a-novastar/client-intake.json client-intake.json

# Switch to Scenario B
cp data/demo/scenario-b-precisiontech/client-intake.json client-intake.json
```

The signals.json file does not need to be the live `client-intake.json` — it only matters for the `rebuild-report` path.

---

## Regenerating CSVs

If you need to regenerate all CSV files (e.g., after changing quality profiles in the script):

```bash
npm run generate-demo
```

This recreates all 16 files under `data/demo/*/csv/` with no external dependencies.

---

## Key Demo Talking Points

### NovaStar (69/100 — 1 blocker)
- "Your platform is performing well — 88% adoption is above industry median"
- "The one thing standing between you and Agentforce is the knowledge base — 8 articles for 20 case categories"
- "This is fixable in a single 8-week sprint. We build the articles, your team reviews them. Pilot goes live in November"
- "Every month you wait costs you 2,400 cases × $22 = $52,800 of agent handling that Agentforce would deflect"

### PrecisionTech (49/100 — 3 blockers)
- "The ERP migration in 2022 left three problems that we need to fix before Agentforce can work reliably"
- "The good news: none of these are architectural — they're cleanup tasks. We've seen orgs go from three blockers to zero in 14 weeks"
- "The 14 Process Builder automations are actually the quickest win — we migrate them to Flow in Week 1"
- "Your $14,000/year CPQ package is still active and doing nothing — that's money we recover on day one"
