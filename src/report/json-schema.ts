import type { AllSignals } from '../scan/types'
import type { ScoredResult } from '../scoring/rubric'
import { INDUSTRY_BENCHMARKS } from '../scoring/rubric'
import { buildFindings } from '../scoring/findings-builder'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OrgMeta {
  orgName?:                   string
  orgId?:                     string
  licenseCount?:              number
  clouds?:                    string | string[]
  licenseUnitCostMonthly?:    number    // $/user/month; defaults to 165 (Sales Cloud Professional list price)
  packageWaste?:              number    // $/year from stakeholder interview
  abandonedPackageCount?:     number
  handlingCostPerTransaction?:  number  // $/transaction; null = suppress value projection
  handlingCostLabel?:           string
  monthlyTransactionVolume?:    number  // override scan result (use when scan org has no real data)
  useCase?:                     'service' | 'sales' | 'fieldService' | 'general' | null
  // Narrative overrides — fill in client-intake.json after stakeholder interview
  pilotReadyDate?:    string                          // e.g. "September 2026"; default = today + 16 weeks
  executiveSummary?:  string                          // replaces auto-generated headlineFinding
  domainSummaries?:   Partial<Record<string, string>> // keyed by domain name e.g. "Data quality & completeness"
  // Investment fee overrides — fill in after negotiation; defaults are Yukti Global list prices
  negotiatedFees?: {
    optionBLow?:               number  // default 28000
    optionBHigh?:              number  // default 35000
    optionCLow?:               number  // default 15000
    optionCHigh?:              number  // default 18000
    monitoringRetainerMonthly?: number  // default 3000
  }
}

export interface ReportDataFinding {
  text:     string
  evidence: string
  dot:      string
}

export interface ReportDataDomain {
  num:            number
  name:           string
  score:          number
  weight:         number
  benchmark:      number
  benchmarkLabel: string
  status:         string
  statusLabel:    string
  color:          string
  barColor:       string
  summary:        string
  findings:       ReportDataFinding[]
  soql:           string
}

export interface RoadmapItem {
  phase:  'quick' | 'medium' | 'strategic'
  owner:  'Admin' | 'Dev' | 'Architect'
  text:   string
  effort: string
}

export interface FlexCreditScenario {
  label:            string
  rate:             number
  tag:              string
  deflectedCount:   number | null
  monthlyCreditCost: number | null
  monthlyNetSaving: number | null
}

export interface ReportData {
  // Meta
  meta: {
    orgName:              string
    orgId:                string
    licenseCount:         number
    clouds:               string[]
    scanDate:             string
    reportVersion:        string
    analysisWindowMonths: number
  }
  // Intake inputs
  intake: {
    useCase:                    string | null
    useCaseLabel:               string | null
    licenseUnitCostMonthly:     number
    handlingCostPerTransaction: number | null
    handlingCostLabel:          string | null
    deflectionBenchmark:        number
    deflectionBenchmarkSource:  string
  }
  // Scan signals as flat metrics
  scanMetrics: {
    totalUsersLicensed:                 number
    inactiveUserCount:                  number
    inactiveUserCountSource:            string
    abandonedPackageCount:              number
    abandonedPackageCost:               number | null
    contactEmailCompletionRate:         number
    contactEmailMissingCount:           number
    duplicateRate:                      number
    activeFlowCount:                    number
    flowsWithNoFaultPath:               number
    conflictingFlowObjects:             string[]
    processBuilderActiveCount:          number
    apexCoveragePercent:                number
    securityHealthCheckScore:           number | null
    knowledgeArticleCount:              number
    knowledgeDataCategoriesConfigured:  boolean
    monthlyTransactionVolume:           number | null
    monthlyTransactionVolumeObject:     string | null
    monthlyTransactionVolumeSource:     string | null
    unusedCustomFieldCount:             number
    apiDailyUsagePercent:               number
    loginRateLast90Days:                number
  }
  // Domain results
  domainScores:      ReportDataDomain[]
  aiReadinessIndex:  number
  hardBlockerCount:  number
  hardBlockerDomains: string[]
  // Template rendering helpers (computed)
  assessmentDate: string
  targetScore:    number
  verdict:        string
  verdictColor:   string
  verdictSub:     string
  fixTimeline:    string
  riskCount:      number
  goodCount:      number
  headlineFinding: string
  // Financials
  costOfInaction: {
    licenseWaste:        number
    licenseWasteFormula: string
    licenseUnitCostSource: string
    packageWaste:        number | null
    packageWasteNote:    string | null
    totalVerifiedWaste:  number
  }
  valueProjection: {
    available:                    boolean
    transactionVolume:            number | null
    transactionVolumeSource:      string | null
    handlingCostPerTransaction:   number | null
    deflectionRate:               number
    deflectionRateSource:         string
    deflectedTransactionsPerMonth: number | null
    annualCapacityValueDollars:   number | null
    currentReadinessCapture:      number | null
    flexCreditCostPerTransaction: number
    flexCreditScenarios:          FlexCreditScenario[]
  }
  // Delivery plan
  roadmap:          RoadmapItem[]
  investmentOptions: {
    pilotReadyDate: string | null
    optionA: { label: string; internalDays: number; timelineMonths: number }
    optionB: { label: string; feeRangeLow: number; feeRangeHigh: number; timelineWeeks: number }
    optionC: { label: string; feeRangeLow: number; feeRangeHigh: number; timelineWeeks: number }
    monitoringRetainerMonthly: number
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const DOT_COLOR = { critical: '#c0392b', warning: '#d4830a', info: '#1a7a4a' } as const

function buildDomainMeta(w: number): Record<string, {
  num: number
  name: string
  statusLabel: (score: number) => string
  soql: string
}> {
  return {
    data_quality: {
      num: 1, name: 'Data quality & completeness',
      statusLabel: s => s < 50 ? 'Hard blocker' : s < 70 ? 'At risk' : 'Adequate',
      soql: `-- Field completeness (all records — Agentforce reads historical data)
SELECT COUNT(Id) total, COUNT(Email) has_email,
  COUNT(Phone) has_phone, COUNT(AccountId) has_account
FROM Contact
WHERE IsDeleted = false

-- Duplicate detection (last ${w} months)
SELECT COUNT(Id) cnt FROM Contact
WHERE IsDeleted = false AND CreatedDate = LAST_N_MONTHS:${w}
GROUP BY Name, Email HAVING COUNT(Id) > 1`,
    },
    automation: {
      num: 2, name: 'Automation health & conflicts',
      statusLabel: s => s < 50 ? 'Hard blocker' : s < 70 ? 'At risk' : 'Adequate',
      soql: `SELECT TriggerObjectOrEventLabel, COUNT(Id) flow_count
FROM FlowVersionView
WHERE Status = 'Active'
GROUP BY TriggerObjectOrEventLabel
ORDER BY flow_count DESC`,
    },
    security: {
      num: 3, name: 'Security & permission model',
      statusLabel: s => s < 50 ? 'Hard blocker' : s < 70 ? 'At risk' : 'Adequate',
      soql: `GET /services/data/v59.0/connect/security/health-check
-- Returns: score (0-100), risks by severity, guest user flags`,
    },
    knowledge: {
      num: 4, name: 'Knowledge base & grounding',
      statusLabel: s => s < 50 ? 'Service blocker' : s < 70 ? 'At risk' : 'Adequate',
      soql: `-- Published articles (all — full coverage assessment)
SELECT COUNT(Id) total, MAX(LastPublishedDate) latest
FROM KnowledgeArticleVersion
WHERE PublishStatus = 'Online' AND Language = 'en_US'

-- Top case reasons (last ${w} months)
SELECT Reason, COUNT(Id) cnt FROM Case
WHERE Reason != null AND CreatedDate = LAST_N_MONTHS:${w}
GROUP BY Reason ORDER BY COUNT(Id) DESC LIMIT 20`,
    },
    metadata: {
      num: 5, name: 'Metadata & technical debt',
      statusLabel: s => s < 50 ? 'Hard blocker' : s < 70 ? 'At risk' : 'Adequate',
      soql: `SELECT COUNT(Id) unmanaged_fields
FROM CustomField
WHERE ManageableState = 'unmanaged'
-- Cross-referenced against flow, layout, Apex, report usage`,
    },
    adoption: {
      num: 6, name: 'User adoption & process alignment',
      statusLabel: s => s < 50 ? 'Hard blocker' : s < 70 ? 'Adequate' : 'Adequate',
      soql: `-- Login rate (last 90 days — measures current active users)
SELECT COUNT(Id) loginCount
FROM LoginHistory
WHERE LoginTime = LAST_N_DAYS:90`,
    },
    limits: {
      num: 7, name: 'Platform limits & API headroom',
      statusLabel: s => s < 50 ? 'Hard blocker' : s < 70 ? 'At risk' : 'Healthy',
      soql: `GET /services/data/v59.0/limits/
-- Key: DailyApiRequests, DataStorageMB, FileStorageMB`,
    },
  }
}

function domainStatus(score: number): string {
  if (score < 50) return 'blocker'
  if (score < 70) return 'risk'
  return 'good'
}

function domainColor(score: number): string {
  if (score < 50) return '#c0392b'
  if (score < 70) return '#d4830a'
  return '#1a7a4a'
}

function benchmarkLabel(domainKey: string, score: number): string {
  const median = INDUSTRY_BENCHMARKS[domainKey as keyof typeof INDUSTRY_BENCHMARKS] ?? 50
  const suffix = score > median ? ' — you score above median' : ''
  return domainKey === 'data_quality'
    ? `Industry median (150–300 user orgs, IBM IBV 2025–26)${suffix}`
    : `Industry median${suffix}`
}

function computePilotDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 112) // 16 weeks
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function scoreVerdict(score: number): { verdict: string; verdictColor: string; verdictSub: string } {
  if (score >= 80) return { verdict: 'AI Ready',             verdictColor: '#1a7a4a', verdictSub: 'Org is ready for full Agentforce deployment' }
  if (score >= 60) return { verdict: 'Ready for Pilot',      verdictColor: '#d4830a', verdictSub: 'Agentforce can be piloted with close monitoring' }
  if (score >= 40) return { verdict: 'Conditionally Ready',  verdictColor: '#d4830a', verdictSub: 'Agentforce deployable in narrow use case only' }
  return              { verdict: 'Not Ready',              verdictColor: '#c0392b', verdictSub: 'Hard blockers must be resolved before any agent deployment' }
}

function buildRoadmap(
  scores: ScoredResult,
  signals: AllSignals,
  pilotDate: string,
  licenseWaste: number,
): RoadmapItem[] {
  const items: RoadmapItem[] = []
  const scoreMap = new Map(scores.domains.map(d => [d.domain, d.score]))
  const inactiveUserPct = 100 - signals.adoption.loginRatePct

  if (inactiveUserPct > 10) {
    items.push({ phase: 'quick', owner: 'Admin',
      text: `Deactivate inactive users — recovers $${licenseWaste.toLocaleString()}/yr in licence spend immediately`,
      effort: '0.5 days · Priority 1 — ROI on day 1' })
  }
  if (signals.metadata.abandonedPackageCount > 0) {
    items.push({ phase: 'quick', owner: 'Admin',
      text: `Remove ${signals.metadata.abandonedPackageCount} abandoned AppExchange package${signals.metadata.abandonedPackageCount !== 1 ? 's' : ''} — eliminates ongoing subscription cost`,
      effort: '0.5 days · Recovers subscription spend' })
  }
  if (signals.automation.flowsWithNoFaultPath > 0) {
    items.push({ phase: 'quick', owner: 'Admin',
      text: `Add fault paths to ${signals.automation.flowsWithNoFaultPath} active flow${signals.automation.flowsWithNoFaultPath !== 1 ? 's' : ''} — prevents silent agent failures`,
      effort: '2 days · Unblocks automation domain' })
  }
  const contactDQ = signals.dataQuality.find(dq => dq.objectName === 'Contact')
  if (contactDQ) {
    items.push({ phase: 'quick', owner: 'Admin',
      text: 'Enable duplicate rules on Contact and Account — prevents new duplicates entering',
      effort: '1 day · Prerequisite for data quality fix' })
  }

  if ((scoreMap.get('data_quality') ?? 100) < 70 && contactDQ) {
    items.push({ phase: 'medium', owner: 'Dev',
      text: 'Field enrichment and required field validation on key objects — lifts Data Quality score',
      effort: '5 days · Resolves data quality blocker' })
  }
  if ((scoreMap.get('automation') ?? 100) < 70) {
    items.push({ phase: 'medium', owner: 'Dev',
      text: 'Consolidate conflicting flows into governed flows — after fault paths added in Week 1',
      effort: '4 days · Resolves Automation blocker' })
  }
  if (signals.duplicates.some(d => d.duplicateRate > 5)) {
    const worst = signals.duplicates.reduce((a, b) => a.duplicateRate > b.duplicateRate ? a : b)
    items.push({ phase: 'medium', owner: 'Admin',
      text: `Merge ${worst.duplicateCount.toLocaleString()} duplicate ${worst.objectName} records — reduces duplicate rate`,
      effort: '3 days · After duplicate rules enabled' })
  }
  if ((scoreMap.get('knowledge') ?? 100) < 70) {
    const topReasonCount = Math.min(signals.knowledge.topCaseReasons.length, 20)
    items.push({ phase: 'medium', owner: 'Dev',
      text: `Build Knowledge base — articles covering top ${topReasonCount} case reasons`,
      effort: '8 days · Prerequisite for Service agent' })
  }

  if ((scoreMap.get('security') ?? 100) < 80) {
    items.push({ phase: 'strategic', owner: 'Architect',
      text: 'Design agent user permission set — least-privilege, scoped to Service use case only',
      effort: '3 days · Resolves security blocker' })
  }
  items.push({ phase: 'strategic', owner: 'Architect',
    text: 'Configure Agentforce Topics and Actions — case deflection for top case categories',
    effort: '5 days · First pilot configuration' })
  if (signals.metadata.unusedFieldCount > 200) {
    items.push({ phase: 'strategic', owner: 'Dev',
      text: `Retire ${signals.metadata.unusedFieldCount.toLocaleString()} unused custom fields via governance process — lifts Metadata score`,
      effort: '4 days · Can run in parallel' })
  }
  items.push({ phase: 'strategic', owner: 'Architect',
    text: 'Monitored pilot — deploy Service agent to 10% of inbound case volume',
    effort: `${pilotDate} · Measure and iterate` })

  return items
}

// ─── Public: buildReportData ──────────────────────────────────────────────────

export function buildReportData(
  orgId: string,
  signals: AllSignals,
  scores: ScoredResult,
  meta: OrgMeta = {}
): ReportData {
  const {
    orgName                  = 'Your Organisation',
    licenseCount             = 0,
    licenseUnitCostMonthly   = 165,
    packageWaste             = 0,
    abandonedPackageCount    = signals.metadata.abandonedPackageCount,
    handlingCostPerTransaction = null,
    handlingCostLabel        = 'per case',
    monthlyTransactionVolume: monthlyTransactionVolumeOverride = undefined,
    useCase                  = 'service',
    pilotReadyDate:          pilotReadyDateOverride  = undefined,
    executiveSummary:        executiveSummaryOverride = undefined,
    domainSummaries:         domainSummariesOverride  = {},
    negotiatedFees           = {} as NonNullable<OrgMeta['negotiatedFees']>,
  } = meta

  const cloudsArr: string[] = meta.clouds
    ? (Array.isArray(meta.clouds) ? meta.clouds : [meta.clouds])
    : ['Salesforce']

  const { verdict, verdictColor, verdictSub } = scoreVerdict(scores.overallIndex)
  const pilotReadyDate = pilotReadyDateOverride ?? computePilotDate()
  const assessmentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const hardBlockerCount  = scores.hardBlockers.length
  const riskCount         = scores.domains.filter(d => !d.isBlocker && d.score < 70).length
  const goodCount         = scores.domains.filter(d => d.score >= 70).length
  const targetScore       = Math.min(scores.overallIndex + 35, 95)

  // ── Scan metrics ──────────────────────────────────────────────────────────
  const contactDQ               = signals.dataQuality.find(dq => dq.objectName === 'Contact')
  const emailRate               = contactDQ?.completionRates['Email'] ?? 100
  const emailCompletionRate     = emailRate / 100
  const emailMissingCount       = contactDQ
    ? Math.round(contactDQ.totalRecords * (1 - emailCompletionRate))
    : 0
  const maxDuplicateRate        = signals.duplicates.length > 0
    ? Math.max(...signals.duplicates.map(d => d.duplicateRate)) / 100
    : 0
  const monthlyVolume: number | null = monthlyTransactionVolumeOverride != null
    ? monthlyTransactionVolumeOverride
    : signals.caseVolume.monthlyVolume > 0
      ? signals.caseVolume.monthlyVolume
      : null

  // ── Waste calculations (Tier 1 — Verified) ───────────────────────────────
  const inactiveUserCount = licenseCount > 0
    ? Math.round(licenseCount * (1 - signals.adoption.loginRatePct / 100))
    : 0
  const licenseWaste      = inactiveUserCount * licenseUnitCostMonthly * 12
  const licenseWasteFormula = inactiveUserCount > 0
    ? `${inactiveUserCount} inactive users × $${licenseUnitCostMonthly}/user/month × 12 = $${licenseWaste.toLocaleString()}`
    : 'No inactive users detected'
  const totalVerifiedWaste = licenseWaste + (packageWaste || 0)

  // ── Value projection (Tier 2 — Projected) ────────────────────────────────
  const deflectionRate       = 0.40
  const deflectionRateSource = 'Salesforce State of Service 2025, p.14'
  const creditsPerTransaction = 4.5
  const creditCostUSD         = 0.10
  const flexCreditCostPerTransaction = creditsPerTransaction * creditCostUSD

  const deflectedPerMonth = (monthlyVolume != null && handlingCostPerTransaction != null)
    ? Math.round(monthlyVolume * deflectionRate)
    : null
  const annualCapacityValueDollars = (deflectedPerMonth != null && handlingCostPerTransaction != null)
    ? deflectedPerMonth * handlingCostPerTransaction * 12
    : null
  const currentReadinessCapture = scores.overallIndex >= 80 ? 0.70
    : scores.overallIndex >= 60 ? 0.40 : 0.15

  const flexCreditScenarios: FlexCreditScenario[] = (monthlyVolume != null && handlingCostPerTransaction != null)
    ? [
        { label: '30% deflection', rate: 0.30, tag: 'Conservative' },
        { label: '40% deflection', rate: 0.40, tag: 'Likely'       },
        { label: '55% deflection', rate: 0.55, tag: 'Optimistic'   },
      ].map(s => {
        const dc  = Math.round(monthlyVolume * s.rate)
        const mcc = Math.round(dc * creditsPerTransaction * creditCostUSD)
        const mns = Math.round(dc * (handlingCostPerTransaction - flexCreditCostPerTransaction))
        return { ...s, deflectedCount: dc, monthlyCreditCost: mcc, monthlyNetSaving: mns }
      })
    : []

  // ── Headline finding ──────────────────────────────────────────────────────
  const autoHeadlineFinding = `${orgName} has a Salesforce investment that is well-used at the process level. The scan found ` +
    (totalVerifiedWaste > 0 ? `<strong>$${totalVerifiedWaste.toLocaleString()} in verified annual waste</strong> and ` : '') +
    (hardBlockerCount > 0
      ? `${hardBlockerCount} domain${hardBlockerCount !== 1 ? 's' : ''} below the hard-blocker threshold`
      : 'no hard blockers') +
    (riskCount > 0 ? `, plus ${riskCount} domain${riskCount !== 1 ? 's' : ''} at risk` : '') +
    `. Every blocker on this list is fixable. Complete the roadmap in Section 5 and your index moves from ${scores.overallIndex} to ${targetScore}+ in 12–16 weeks. ` +
    `<strong>Start remediation now and a monitored pilot agent can be live by ${pilotReadyDate}.</strong>`
  const headlineFinding = executiveSummaryOverride ?? autoHeadlineFinding

  // ── Domain objects ────────────────────────────────────────────────────────
  const allFindings = buildFindings(signals, scores)
  const domainMeta = buildDomainMeta(signals.configUsed.analysisWindowMonths)
  const domainScores: ReportDataDomain[] = scores.domains.map(ds => {
    const dm = domainMeta[ds.domain]
    if (!dm) throw new Error(`Unknown domain: ${ds.domain}`)
    const median = INDUSTRY_BENCHMARKS[ds.domain as keyof typeof INDUSTRY_BENCHMARKS] ?? 50
    const domainFindings = allFindings
      .filter(f => f.domain === ds.domain)
      .slice(0, 4)
      .map(f => ({ text: f.description, evidence: f.evidence, dot: DOT_COLOR[f.severity] }))
    const topFinding = domainFindings[0]?.text ?? `${dm.name} domain has been assessed.`
    return {
      num: dm.num, name: dm.name,
      score: ds.score, weight: Math.round(ds.weight * 100),
      benchmark: median, benchmarkLabel: benchmarkLabel(ds.domain, ds.score),
      status: domainStatus(ds.score), statusLabel: dm.statusLabel(ds.score),
      color: domainColor(ds.score), barColor: domainColor(ds.score),
      summary: domainSummariesOverride[dm.name] ?? topFinding, findings: domainFindings, soql: dm.soql,
    }
  }).sort((a, b) => a.num - b.num)

  const roadmap = buildRoadmap(scores, signals, pilotReadyDate, licenseWaste)

  return {
    meta: {
      orgName,
      orgId,
      licenseCount,
      clouds: cloudsArr,
      scanDate: new Date().toISOString().slice(0, 10),
      reportVersion: 'v2',
      analysisWindowMonths: signals.configUsed.analysisWindowMonths,
    },
    intake: {
      useCase:                    useCase ?? null,
      useCaseLabel:               useCase ? `${useCase.charAt(0).toUpperCase() + useCase.slice(1)} — case deflection` : null,
      licenseUnitCostMonthly,
      handlingCostPerTransaction: handlingCostPerTransaction ?? null,
      handlingCostLabel:          handlingCostLabel ?? null,
      deflectionBenchmark:        deflectionRate,
      deflectionBenchmarkSource:  deflectionRateSource,
    },
    scanMetrics: {
      totalUsersLicensed:                licenseCount,
      inactiveUserCount,
      inactiveUserCountSource:           'LoginHistory COUNT DISTINCT UserId last 90 days vs active user count',
      abandonedPackageCount,
      abandonedPackageCost:              packageWaste > 0 ? packageWaste : null,
      contactEmailCompletionRate:        emailCompletionRate,
      contactEmailMissingCount:          emailMissingCount,
      duplicateRate:                     maxDuplicateRate,
      activeFlowCount:                   signals.automation.totalActiveFlows,
      flowsWithNoFaultPath:              signals.automation.flowsWithNoFaultPath,
      conflictingFlowObjects:            signals.automation.highRiskObjects,
      processBuilderActiveCount:         signals.automation.legacyAutomationCount,
      apexCoveragePercent:               signals.automation.apexCoveragePct,
      securityHealthCheckScore:          signals.security.healthCheckScore > 0 ? signals.security.healthCheckScore : null,
      knowledgeArticleCount:             signals.knowledge.articleCount,
      knowledgeDataCategoriesConfigured: false,
      monthlyTransactionVolume:          monthlyVolume,
      monthlyTransactionVolumeObject:    useCase === 'sales' ? 'Opportunity' : useCase === 'fieldService' ? 'WorkOrder' : 'Case',
      monthlyTransactionVolumeSource:    'Case COUNT last 90 days ÷ 3',
      unusedCustomFieldCount:            signals.metadata.unusedFieldCount,
      apiDailyUsagePercent:              signals.limits.apiUsagePct,
      loginRateLast90Days:               signals.adoption.loginRatePct / 100,
    },
    domainScores,
    aiReadinessIndex:   scores.overallIndex,
    hardBlockerCount,
    hardBlockerDomains: scores.hardBlockers,
    assessmentDate,
    targetScore,
    verdict,
    verdictColor,
    verdictSub,
    fixTimeline:        '12–16 weeks',
    riskCount,
    goodCount,
    headlineFinding,
    costOfInaction: {
      licenseWaste,
      licenseWasteFormula,
      licenseUnitCostSource: `Salesforce list price — Sales Cloud Professional Edition (default $${licenseUnitCostMonthly}/user/month)`,
      packageWaste:          packageWaste > 0 ? packageWaste : null,
      packageWasteNote:      packageWaste > 0 ? `${abandonedPackageCount} abandoned AppExchange packages — from InstalledPackage scan` : null,
      totalVerifiedWaste,
    },
    valueProjection: {
      available:                    handlingCostPerTransaction != null,
      transactionVolume:            monthlyVolume,
      transactionVolumeSource:      'Case COUNT last 90 days ÷ 3',
      handlingCostPerTransaction:   handlingCostPerTransaction ?? null,
      deflectionRate,
      deflectionRateSource,
      deflectedTransactionsPerMonth: deflectedPerMonth,
      annualCapacityValueDollars,
      currentReadinessCapture,
      flexCreditCostPerTransaction,
      flexCreditScenarios,
    },
    roadmap,
    investmentOptions: {
      pilotReadyDate,
      optionA: { label: 'Internal team',         internalDays: 35, timelineMonths: 5  },
      optionB: { label: 'Yukti Global delivers',  feeRangeLow: negotiatedFees.optionBLow  ?? 28000, feeRangeHigh: negotiatedFees.optionBHigh ?? 35000, timelineWeeks: 16 },
      optionC: { label: 'Hybrid model',           feeRangeLow: negotiatedFees.optionCLow  ?? 15000, feeRangeHigh: negotiatedFees.optionCHigh ?? 18000, timelineWeeks: 20 },
      monitoringRetainerMonthly: negotiatedFees.monitoringRetainerMonthly ?? 3000,
    },
  }
}
