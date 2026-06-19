# OrgPulse — Report Calculations Reference

Quick reference for every number produced by the scoring engine and report generator.
All source is in `src/scoring/engine.ts`, `src/scoring/rubric.ts`, and `src/report/json-schema.ts`.

---

## 1. AI Readiness Index (overall score)

Weighted average of the 7 domain scores. Weights must always sum to 1.0.

```
overallIndex = Σ (domainScore × domainWeight)   rounded to nearest integer
```

| Domain | Weight | Source |
|---|---|---|
| Data Quality | 25% | `src/scoring/rubric.ts` |
| Automation | 20% | |
| Security | 15% | |
| Knowledge | 15% | |
| Metadata | 10% | |
| Adoption | 10% | |
| Platform Limits | 5% | |

**Hard blocker threshold:** any domain scoring < 50 is flagged as a hard blocker.

---

## 2. Domain Scoring Formulas

All domain scores are clamped to 0–100.

### Domain 1 — Data Quality

```
avgCompletionRate = weighted average of per-object field completion rates
                   (weight = totalRecords per object)

dupPenalty = maxDuplicateRate > 15% → 30
             maxDuplicateRate > 10% → 15
             maxDuplicateRate >  5% →  5
             otherwise              →  0

score = clamp(avgCompletionRate − dupPenalty, 0, 100)
```

- `completionRate` per field = `COUNT(field) / COUNT(Id) × 100` via SOQL aggregate query
- `duplicateRate` = `duplicateCount / totalRecords × 100`
- Objects with fewer than 100 records are excluded from field completeness

### Domain 2 — Automation

```
faultPathPct  = flowsWithNoFaultPath / totalActiveFlows × 100

faultPenalty  = faultPathPct > 50% → 40
                faultPathPct > 25% → 20
                faultPathPct > 10% → 10
                otherwise          →  0

apexPenalty   = apexCoveragePct < 40% → 30
                apexCoveragePct < 60% → 15
                apexCoveragePct < 75% →  5
                otherwise             →  0

legacyPenalty = legacyAutomationCount > 10 → 25
                legacyAutomationCount >  5  → 10
                legacyAutomationCount >  0  →  5
                otherwise                   →  0

score = clamp(100 − faultPenalty − apexPenalty − legacyPenalty, 0, 100)
```

### Domain 3 — Security

```
criticalPenalty = criticalCheckCount > 5 → 20
                  criticalCheckCount > 2 → 10
                  otherwise              →  0

guestPenalty = guestUserRisk = true → 15
               otherwise            →  0

score = clamp(healthCheckScore − criticalPenalty − guestPenalty, 0, 100)
```

- `healthCheckScore` comes from `/services/data/v59.0/connect/security/health-check` REST endpoint
- Returns 0 (safe fallback) on Dev Edition — this triggers a hard blocker on Dev Edition only

### Domain 4 — Knowledge

```
staleRatio = staleArticleCount / articleCount × 100
gapRatio   = coverageGapCount / topCaseReasons.length × 100

stalePenalty = staleRatio > 50% → 40
               staleRatio > 30% → 20
               staleRatio > 15% → 10
               otherwise        →  0

gapPenalty   = gapRatio > 75% → 40
               gapRatio > 50% → 25
               gapRatio > 25% → 10
               otherwise      →  0

score = clamp(100 − stalePenalty − gapPenalty, 0, 100)

Caps applied after penalty:
  articleCount = 0       → score fixed at 15 (hard blocker — no knowledge base)
  articleCount < 10      → score capped at 30
  articleCount < 50      → score capped at 60
```

- `coverageGapCount` = number of top case reasons with no matching Knowledge article

### Domain 5 — Metadata

```
fieldPenalty = unusedFieldCount > 700 → 60
               unusedFieldCount > 400 → 35
               unusedFieldCount > 200 → 15
               otherwise              →  0

pkgPenalty   = abandonedPackageCount > 10 → 30
               abandonedPackageCount >  5  → 15
               abandonedPackageCount >  2  →  5
               otherwise                   →  0

score = clamp(100 − fieldPenalty − pkgPenalty, 0, 100)
```

### Domain 6 — Adoption

```
bonus   = avgActivitiesPerUser > 20 → 5
          avgActivitiesPerUser > 10 → 3
          avgActivitiesPerUser >  3 → 1
          otherwise                 → 0

penalty = avgActivitiesPerUser < 3  → 10
          otherwise                 →  0

score = clamp(loginRatePct + bonus − penalty, 0, 100)
```

- `loginRatePct` = `COUNT(DISTINCT UserId in last 90 days) / activeUserCount × 100`
- `avgActivitiesPerUser` = `COUNT(Task in last 90 days) / activeUserCount`

### Domain 7 — Platform Limits

```
maxUsage = MAX(apiUsagePct, storageUsagePct, fileUsagePct)

score = clamp(100 − maxUsage, 0, 100)
```

- Usage percentages from `/services/data/v59.0/limits/` REST endpoint
- Key signals: `DailyApiRequests`, `DataStorageMB`, `FileStorageMB`

---

## 3. Score Verdict

| Index | Verdict | Colour |
|---|---|---|
| ≥ 80 | AI Ready | Green |
| 60–79 | Ready for Pilot | Amber |
| 40–59 | Conditionally Ready | Amber |
| < 40 | Not Ready | Red |

---

## 4. Target Score

```
targetScore = MIN(overallIndex + 35, 95)
```

Represents the expected score after completing the remediation roadmap.
Capped at 95 — never promises perfection.

---

## 5. Pilot Ready Date

```
pilotReadyDate = today + 112 days (16 weeks), formatted as "Month YYYY"
```

---

## 6. Waste Calculations (Tier 1 — Verified)

All inputs from scan data or `OrgMeta` supplied at assessment time.

### Inactive user count

```
inactiveUserCount = ROUND(licenseCount × (1 − loginRatePct / 100))
```

- `licenseCount` — from stakeholder interview (total licensed seats, not from scan)
- `loginRatePct` — from Domain 6 scan (adoption)
- Returns 0 if `licenseCount` not provided

### Annual licence waste

```
licenseWaste       = inactiveUserCount × licenseUnitCostMonthly × 12
totalVerifiedWaste = licenseWaste + packageWaste
```

- `licenseUnitCostMonthly` — default $165/user/month (Salesforce Sales Cloud Professional list price, June 2026); override from client contract in `client-intake.json`
- `packageWaste` — from stakeholder interview; AppExchange subscriptions on abandoned packages ($/year)
- Example: 23 inactive users × $165/month × 12 = $45,540 licenseWaste

### Email gap

```
emailGapPct             = ROUND(100 − emailCompletionRate)   [Contact object]
unreachableContactCount = ROUND(contactTotalRecords × emailGapPct / 100)
```

- `emailCompletionRate` = `COUNT(Email) / COUNT(Id) × 100` on Contact object

### Quarterly waste (used in cost-of-inaction section)

```
quarterlyWaste = ROUND(totalVerifiedWaste / 4)
```

---

## 7. Agentforce Value (Tier 2 — Projected)

These numbers are modelled — they use scan data for volume but apply published benchmarks for rates.

### Case deflection value

```
monthlyVolume                 = totalCasesLast3Months / 3    [from scan]
                             || monthlyTransactionVolume      [intake override if scan returns 0]

deflectionRate                = 0.40                          [Salesforce State of Service 2025, p.14]
deflectedTransactionsPerMonth = ROUND(monthlyVolume × deflectionRate)
annualCapacityValueDollars    = deflectedTransactionsPerMonth × handlingCostPerTransaction × 12
```

- `handlingCostPerTransaction` — from `client-intake.json`; **null = Section 4 and Flex Credit are suppressed entirely**
- `monthlyTransactionVolume` in intake — override only; leave `null` for real client orgs (scan provides real volume)
- Example: 2,840 cases/mo × 40% = 1,136 deflected × $18 × 12 = $245,376/yr

### Current org effectiveness

```
currentEffectivenessPct = overallIndex ≥ 80 → 70%
                          overallIndex ≥ 60 → 40%
                          otherwise         → 15%
```

Used in the "Agentforce value" narrative section only — not in ROI.

---

## 8. Flex Credit Model

Agentforce uses Flex Credits for consumption-based billing. Three scenarios pre-computed in `buildReportData()` and stored in `valueProjection.flexCreditScenarios[]`.

```
creditsPerTransaction        = 4.5      [avg turns per service case conversation]
creditCostUSD                = $0.10    [Salesforce Flex Credit list price]
flexCreditCostPerTransaction = 4.5 × $0.10 = $0.45 per deflected case

For each scenario:
  deflectedCount    = ROUND(monthlyVolume × scenarioRate)
  monthlyCreditCost = ROUND(deflectedCount × creditsPerTransaction × creditCostUSD)
  monthlyNetSaving  = ROUND(deflectedCount × (handlingCostPerTransaction − flexCreditCostPerTransaction))
```

Example at 2,840 cases/month, $18/case handling cost:

| Scenario | Rate | deflectedCount | monthlyCreditCost | monthlyNetSaving |
|---|---|---|---|---|
| Conservative | 30% | 852 | $383 | $14,953 |
| Likely | 40% | 1,136 | $511 | $19,937 |
| Optimistic | 55% | 1,562 | $703 | $27,412 |

All values are pre-computed server-side — no calculations happen in the browser template.

---

## 9. ROI Calculator

Two independent sliders. Output is a blended view.

```
engagementFee      = fee-slider value    [default: Option B feeRangeLow = $28,000]
agentforceValue    = val-slider value    [default: annualCapacityValueDollars from scan]

Tier 1 annual savings = totalVerifiedWaste          [scan-derived, fixed]
Tier 2 annual savings = agentforceValue             [slider, adjustable; hidden if handlingCost null]
totalAnnualBenefit    = Tier 1 + Tier 2

paybackMonths         = CEIL(engagementFee / (totalAnnualBenefit / 12))
year1NetBenefit       = totalAnnualBenefit − engagementFee
roi3yr                = ROUND(((totalAnnualBenefit × 3 − engagementFee) / engagementFee) × 100)%
```

- Payback label: "Verified savings + projected value"
- Year 1 label: "After engagement fee"
- Default fee slider: $28,000 (Option B `feeRangeLow`)
- Default value slider: `annualCapacityValueDollars` from scan; Tier 2 row hidden if `handlingCostPerTransaction` is null

---

## 10. Industry Benchmarks

Source: IBM IBV 2025–26, 150–300 user orgs. Used for domain comparison bars in the report.

| Domain | Benchmark |
|---|---|
| Data Quality | 54 |
| Automation | 58 |
| Security | 69 |
| Knowledge | 38 |
| Metadata | 55 |
| Adoption | 68 |
| Platform Limits | 77 |

---

## 11. Domain Status Labels

| Score | Status | Label (varies by domain) |
|---|---|---|
| < 50 | `blocker` | Hard blocker / Service blocker |
| 50–69 | `risk` | At risk / Adequate |
| ≥ 70 | `good` | Adequate / Healthy |

---

## Inputs Summary — What Comes From Scan vs. client-intake.json

All client-provided values live in `client-intake.json` (copy from `client-intake.example.json`). Two fields are always required; the rest have safe defaults.

| Input | Source | Default |
|---|---|---|
| `loginRatePct`, `avgActivitiesPerUser` | Scan — LoginHistory, Task | — |
| `totalActiveFlows`, `flowsWithNoFaultPath` | Scan — FlowVersionView | — |
| `apexCoveragePct` | Scan — ApexOrgWideCoverage | — |
| `legacyAutomationCount` | Scan — ProcessDefinition (Tooling API) | — |
| `healthCheckScore`, `criticalCheckCount` | Scan — Security Health Check endpoint | — |
| `articleCount`, `staleArticleCount`, `coverageGapCount` | Scan — KnowledgeArticleVersion | — |
| `monthlyVolume` | Scan — Case COUNT last 90 days ÷ 3 | — |
| `unusedFieldCount` | Scan — CustomField | — |
| `abandonedPackageCount` | Scan — InstalledSubscriberPackage | — |
| `completionRates`, `duplicateRate` | Scan — per-object SOQL aggregates | — |
| `apiUsagePct`, `storageUsagePct`, `fileUsagePct` | Scan — Limits API | — |
| `orgName` | client-intake.json | `'Your Organisation'` |
| `licenseCount` | client-intake.json | `0` (waste = $0) |
| `clouds` | client-intake.json | `['Salesforce']` |
| `licenseUnitCostMonthly` | client-intake.json | `165` (SF list price June 2026) |
| `handlingCostPerTransaction` | client-intake.json | `null` — **suppresses Section 4 & Flex Credit** |
| `packageWaste` | client-intake.json | `0` |
| `monthlyTransactionVolume` | client-intake.json | `null` — use scan value; set only for Dev Edition testing |
| `useCase` | client-intake.json | `'service'` |

---

*Last updated: 19 June 2026*
