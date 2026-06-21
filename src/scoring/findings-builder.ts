import type { AllSignals } from '../scan/types'
import { HARD_BLOCKER_THRESHOLD, type ScoredResult } from './rubric'

export interface Finding {
  domain:      string
  severity:    'critical' | 'warning' | 'info'
  title:       string
  description: string  // business language with at least one specific number; no record values
  evidence:    string  // raw query result as a plain string; no record values
  effortDays:  number
  impactScore: number  // 1–10
}

function severity(score: number): 'critical' | 'warning' | 'info' {
  if (score < HARD_BLOCKER_THRESHOLD) return 'critical'
  if (score < 70) return 'warning'
  return 'info'
}

// ── Per-domain finding generators ─────────────────────────────────────────────

function dataQualityFindings(signals: AllSignals, score: number): Finding[] {
  const findings: Finding[] = []
  const sev = severity(score)

  const objectsWithData = signals.dataQuality.filter(dq => dq.totalRecords > 0)
  const totalObjects = objectsWithData.length

  // Weighted average completion rate
  let totalWeight = 0
  let weightedSum = 0
  for (const dq of objectsWithData) {
    const rates = Object.values(dq.completionRates)
    if (rates.length === 0) continue
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length
    weightedSum += avg * dq.totalRecords
    totalWeight += dq.totalRecords
  }
  const avgCompletion = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0

  if (avgCompletion < 80) {
    findings.push({
      domain:      'data_quality',
      severity:    sev,
      title:       'Field completeness gaps across key objects',
      description: `Required fields are ${avgCompletion}% complete on average across ${totalObjects} scanned object${totalObjects !== 1 ? 's' : ''} — blank fields prevent Agentforce from retrieving context during live interactions.`,
      evidence:    `Aggregate COUNT queries across ${totalObjects} object${totalObjects !== 1 ? 's' : ''}: average ${avgCompletion}% field completion rate`,
      effortDays:  10,
      impactScore: sev === 'critical' ? 9 : 6,
    })
  } else {
    findings.push({
      domain:      'data_quality',
      severity:    'info',
      title:       'Core field completion is healthy',
      description: `Required fields average ${avgCompletion}% completion across ${totalObjects} object${totalObjects !== 1 ? 's' : ''} — above the 80% threshold needed for reliable Agentforce grounding.`,
      evidence:    `Aggregate COUNT queries across ${totalObjects} objects: avg ${avgCompletion}% completion`,
      effortDays:  0,
      impactScore: 2,
    })
  }

  // Duplicate findings — one per object with significant duplication
  const significantDups = signals.duplicates.filter(d => d.duplicateRate > 5)
  if (significantDups.length > 0) {
    const worst = significantDups.reduce((a, b) => a.duplicateRate > b.duplicateRate ? a : b)
    findings.push({
      domain:      'data_quality',
      severity:    sev,
      title:       `Duplicate records detected in ${worst.objectName}`,
      description: `${worst.objectName} has a ${worst.duplicateRate.toFixed(1)}% duplication rate (${worst.duplicateCount.toLocaleString()} records created in the last ${signals.configUsed.analysisWindowMonths} months) — Agentforce agents will surface conflicting or redundant data during customer interactions.`,
      evidence:    `GROUP BY duplicate fields HAVING COUNT > 1 (last ${signals.configUsed.analysisWindowMonths} months): ${worst.duplicateCount.toLocaleString()} duplicate records in ${worst.objectName}`,
      effortDays:  5,
      impactScore: sev === 'critical' ? 8 : 5,
    })
  } else {
    findings.push({
      domain:      'data_quality',
      severity:    'info',
      title:       'Duplicate record rates within acceptable limits',
      description: `All ${signals.duplicates.length > 0 ? signals.duplicates.length : 'scanned'} object${signals.duplicates.length !== 1 ? 's' : ''} show duplicate rates below 5% in the last ${signals.configUsed.analysisWindowMonths} months — deduplication is not a blocker for Agentforce deployment.`,
      evidence:    `Duplicate scan (last ${signals.configUsed.analysisWindowMonths} months) across ${signals.duplicates.length} object${signals.duplicates.length !== 1 ? 's' : ''}: max duplicate rate ${signals.duplicates.length > 0 ? Math.max(...signals.duplicates.map(d => d.duplicateRate)).toFixed(1) : '0'}%`,
      effortDays:  0,
      impactScore: 1,
    })
  }

  return findings
}

function securityFindings(signals: AllSignals, score: number): Finding[] {
  const findings: Finding[] = []
  const sev = severity(score)
  const { healthCheckScore, failingCheckCount, criticalCheckCount, guestUserRisk } = signals.security

  const secNote = healthCheckScore >= 100
    ? '— org security posture is excellent; no remediation needed before Agentforce deployment.'
    : '— Agentforce requires a minimum posture of 70+ to meet enterprise security baselines.'

  findings.push({
    domain:      'security',
    severity:    sev,
    title:       `Security Health Check score: ${healthCheckScore}/100`,
    description: `Salesforce Security Health Check returned ${healthCheckScore}/100 with ${failingCheckCount} failing check${failingCheckCount !== 1 ? 's' : ''} (${criticalCheckCount} critical) ${secNote}`,
    evidence:    `GET /connect/security/health-check: score=${healthCheckScore}, failing=${failingCheckCount}, critical=${criticalCheckCount}`,
    effortDays:  healthCheckScore < 50 ? 15 : 5,
    impactScore: sev === 'critical' ? 9 : sev === 'warning' ? 6 : 2,
  })

  if (guestUserRisk) {
    findings.push({
      domain:      'security',
      severity:    'critical',
      title:       'Guest user security risks detected',
      description: `${criticalCheckCount > 0 ? criticalCheckCount : 'One or more'} security check${criticalCheckCount !== 1 ? 's' : ''} involve unauthenticated guest user access — Agentforce agents must not be deployable via guest-accessible channels until these are resolved.`,
      evidence:    `Health check risk list: ${criticalCheckCount} check${criticalCheckCount !== 1 ? 's' : ''} flagged involving guest user context`,
      effortDays:  3,
      impactScore: 10,
    })
  } else {
    findings.push({
      domain:      'security',
      severity:    'info',
      title:       'No guest user security risks identified',
      description: `0 security checks involve unauthenticated guest user access — Agentforce channels can be deployed without guest-access remediation.`,
      evidence:    'Health check risk list: 0 guest user risk flags',
      effortDays:  0,
      impactScore: 1,
    })
  }

  return findings
}

function automationFindings(signals: AllSignals, score: number): Finding[] {
  const findings: Finding[] = []
  const sev = severity(score)
  const { totalActiveFlows, flowsWithNoFaultPath, legacyAutomationCount, apexCoveragePct, highRiskObjects } = signals.automation

  if (flowsWithNoFaultPath > 0) {
    const pct = totalActiveFlows > 0 ? Math.round(flowsWithNoFaultPath / totalActiveFlows * 100) : 0
    const objectList = highRiskObjects.length > 0 ? ` on objects: ${highRiskObjects.slice(0, 5).join(', ')}` : ''
    findings.push({
      domain:      'automation',
      severity:    sev,
      title:       `${flowsWithNoFaultPath} active flow${flowsWithNoFaultPath !== 1 ? 's' : ''} missing fault paths`,
      description: `${flowsWithNoFaultPath} of ${totalActiveFlows} active flows (${pct}%) have no fault connector${objectList} — runtime errors will silently corrupt records and cause Agentforce actions to fail without recovery.`,
      evidence:    `FlowVersionView WHERE Status = 'Active': ${flowsWithNoFaultPath}/${totalActiveFlows} flows with HasFaultConnector = false`,
      effortDays:  Math.ceil(flowsWithNoFaultPath * 0.5),
      impactScore: sev === 'critical' ? 8 : 5,
    })
  } else {
    findings.push({
      domain:      'automation',
      severity:    'info',
      title:       'All active flows have fault paths configured',
      description: `All ${totalActiveFlows} active flow${totalActiveFlows !== 1 ? 's' : ''} include fault connectors — error handling is in place for Agentforce-triggered automation.`,
      evidence:    `FlowVersionView WHERE Status = 'Active': 0 flows with HasFaultConnector = false`,
      effortDays:  0,
      impactScore: 1,
    })
  }

  if (legacyAutomationCount > 0) {
    findings.push({
      domain:      'automation',
      severity:    sev,
      title:       `${legacyAutomationCount} legacy Process Builder automation${legacyAutomationCount !== 1 ? 's' : ''} still active`,
      description: `${legacyAutomationCount} Process Builder process${legacyAutomationCount !== 1 ? 'es' : ''} remain active — legacy automation conflicts with Flow-first Agentforce architecture and increases unpredictable execution order risk.`,
      evidence:    `ProcessDefinition WHERE State = 'Active': ${legacyAutomationCount} record${legacyAutomationCount !== 1 ? 's' : ''}`,
      effortDays:  legacyAutomationCount * 2,
      impactScore: sev === 'critical' ? 7 : 4,
    })
  }

  if (apexCoveragePct < 75) {
    findings.push({
      domain:      'automation',
      severity:    apexCoveragePct < 40 ? 'critical' : 'warning',
      title:       `Apex test coverage at ${apexCoveragePct}% — below Salesforce minimum`,
      description: `Org-wide Apex coverage is ${apexCoveragePct}% against the Salesforce minimum of 75% — deployments will fail and Agentforce Apex actions cannot be safely rolled out.`,
      evidence:    `ApexOrgWideCoverage: PercentCovered = ${apexCoveragePct}`,
      effortDays:  Math.ceil((75 - apexCoveragePct) * 0.5),
      impactScore: apexCoveragePct < 40 ? 8 : 5,
    })
  } else {
    findings.push({
      domain:      'automation',
      severity:    'info',
      title:       `Apex test coverage at ${apexCoveragePct}% — above minimum threshold`,
      description: `Org-wide Apex coverage is ${apexCoveragePct}%, meeting the 75% minimum required for safe deployments and Agentforce Apex action rollouts.`,
      evidence:    `ApexOrgWideCoverage: PercentCovered = ${apexCoveragePct}`,
      effortDays:  0,
      impactScore: 1,
    })
  }

  return findings
}

function knowledgeFindings(signals: AllSignals, score: number): Finding[] {
  const findings: Finding[] = []
  const sev = severity(score)
  const { articleCount, staleArticleCount, topCaseReasons, coverageGapCount } = signals.knowledge

  if (articleCount === 0) {
    findings.push({
      domain:      'knowledge',
      severity:    'critical',
      title:       'No published Knowledge articles found',
      description: `0 Knowledge articles are published — Agentforce cannot deflect any of the ${topCaseReasons.length} identified case reason categor${topCaseReasons.length !== 1 ? 'ies' : 'y'} without a knowledge base to draw from.`,
      evidence:    `KnowledgeArticleVersion WHERE PublishStatus = 'Online': COUNT = 0`,
      effortDays:  30,
      impactScore: 10,
    })
    findings.push({
      domain:      'knowledge',
      severity:    'critical',
      title:       `${topCaseReasons.length} case reason categor${topCaseReasons.length !== 1 ? 'ies' : 'y'} with 0% article coverage`,
      description: `All ${topCaseReasons.length} top case reason${topCaseReasons.length !== 1 ? 's' : ''} from the last ${signals.configUsed.analysisWindowMonths} months have no corresponding Knowledge article — Agentforce deflection rate will be 0% at launch.`,
      evidence:    `Case GROUP BY Reason (last ${signals.configUsed.analysisWindowMonths} months): ${topCaseReasons.length} distinct reasons; KnowledgeArticleVersion count: 0`,
      effortDays:  30,
      impactScore: 10,
    })
  } else {
    const stalePct = Math.round(staleArticleCount / articleCount * 100)
    const staleSev = stalePct > 50 ? 'critical' : stalePct > 30 ? 'warning' : 'info'
    findings.push({
      domain:      'knowledge',
      severity:    staleSev,
      title:       `${staleArticleCount} of ${articleCount} articles not updated in 18+ months`,
      description: `${stalePct}% of the ${articleCount} published Knowledge article${articleCount !== 1 ? 's' : ''} (${staleArticleCount.toLocaleString()}) were last updated over 18 months ago — outdated articles will cause Agentforce to surface incorrect resolution guidance.`,
      evidence:    `KnowledgeArticleVersion WHERE LastPublishedDate < 18 months ago: ${staleArticleCount} of ${articleCount} online articles`,
      effortDays:  Math.ceil(staleArticleCount * 0.25),
      impactScore: staleSev === 'critical' ? 7 : staleSev === 'warning' ? 5 : 2,
    })

    findings.push({
      domain:      'knowledge',
      severity:    sev,
      title:       `${coverageGapCount} of ${topCaseReasons.length} top case reasons lack a Knowledge article`,
      description: `${coverageGapCount} of the top ${topCaseReasons.length} case reason${topCaseReasons.length !== 1 ? 's' : ''} (last ${signals.configUsed.analysisWindowMonths} months) have no matching published article — these case types will not benefit from Agentforce deflection until articles are created.`,
      evidence:    `Case GROUP BY Reason (last ${signals.configUsed.analysisWindowMonths} months): ${topCaseReasons.length} categories; matching articles: ${topCaseReasons.length - coverageGapCount}`,
      effortDays:  coverageGapCount * 1,
      impactScore: sev === 'critical' ? 8 : sev === 'warning' ? 5 : 2,
    })
  }

  return findings
}

function metadataFindings(signals: AllSignals, score: number): Finding[] {
  const sev = severity(score)
  const { unusedFieldCount, abandonedPackageCount } = signals.metadata

  return [
    {
      domain:      'metadata',
      severity:    sev,
      title:       `${unusedFieldCount.toLocaleString()} unmanaged custom fields in org schema`,
      description: `${unusedFieldCount.toLocaleString()} unmanaged custom fields exist in the org — excess schema increases the Agentforce context window surface and raises the risk of agents referencing irrelevant or stale data fields.`,
      evidence:    `CustomField WHERE ManageableState = 'unmanaged': COUNT = ${unusedFieldCount.toLocaleString()}`,
      effortDays:  Math.ceil(unusedFieldCount / 50),
      impactScore: sev === 'critical' ? 6 : sev === 'warning' ? 4 : 2,
    },
    {
      domain:      'metadata',
      severity:    abandonedPackageCount > 5 ? sev : 'info',
      title:       `${abandonedPackageCount} installed package${abandonedPackageCount !== 1 ? 's' : ''} identified`,
      description: `${abandonedPackageCount} managed package${abandonedPackageCount !== 1 ? 's' : ''} ${abandonedPackageCount !== 1 ? 'are' : 'is'} installed — each package that is no longer actively used increases attack surface and can trigger unexpected automation in Agentforce flows.`,
      evidence:    `InstalledSubscriberPackage: COUNT = ${abandonedPackageCount}`,
      effortDays:  abandonedPackageCount,
      impactScore: abandonedPackageCount > 10 ? 6 : abandonedPackageCount > 5 ? 4 : 2,
    },
  ]
}

// Industry median for task activities per user per 90 days (IBM IBV 2025-26, 150-300 user orgs)
const ACTIVITY_MEDIAN_PER_90_DAYS = 15

function adoptionFindings(signals: AllSignals, score: number): Finding[] {
  const sev = severity(score)
  const { loginRatePct, avgActivitiesPerUser } = signals.adoption

  const inactivePct = 100 - loginRatePct
  const inactiveNote = inactivePct > 0
    ? ` — ${inactivePct}% of seats are inactive, representing wasted licence spend and indicating that Agentforce will serve a smaller active user base than the org is licensed for`
    : ' — all licensed users are active; the full licence base is available for Agentforce rollout'

  return [
    {
      domain:      'adoption',
      severity:    sev,
      title:       `${loginRatePct}% of users active in the last 90 days`,
      description: `${loginRatePct}% of licensed Salesforce users logged in during the past 90 days${inactiveNote}.`,
      evidence:    `LoginHistory WHERE LoginTime = LAST_N_DAYS:90: estimated ${loginRatePct}% unique user activity rate`,
      effortDays:  3,
      impactScore: sev === 'critical' ? 7 : sev === 'warning' ? 4 : 2,
    },
    {
      domain:      'adoption',
      severity:    avgActivitiesPerUser < 3 ? sev : 'info',
      title:       `Average ${avgActivitiesPerUser} task activities per user in 90 days`,
      description: `Users logged an average of ${avgActivitiesPerUser} task${avgActivitiesPerUser !== 1 ? 's' : ''} over the past 90 days, compared to an industry median of ${ACTIVITY_MEDIAN_PER_90_DAYS} for similarly-sized orgs — low activity logging means Agentforce context from prior interactions will be sparse.`,
      evidence:    `Task WHERE CreatedDate = LAST_N_DAYS:90: total activity count ÷ active user count = ${avgActivitiesPerUser} avg per user`,
      effortDays:  5,
      impactScore: avgActivitiesPerUser < 3 ? 6 : 3,
    },
  ]
}

function limitsFindings(signals: AllSignals, score: number): Finding[] {
  const sev = severity(score)
  const { apiUsagePct, storageUsagePct, fileUsagePct } = signals.limits
  const maxUsagePct = Math.max(apiUsagePct, storageUsagePct, fileUsagePct)

  const highestLabel =
    apiUsagePct >= storageUsagePct && apiUsagePct >= fileUsagePct ? 'API requests'
    : storageUsagePct >= fileUsagePct ? 'data storage'
    : 'file storage'

  const findings: Finding[] = [
    {
      domain:      'limits',
      severity:    sev,
      title:       `Peak governor limit utilisation at ${maxUsagePct}%`,
      description: `Highest platform limit usage is ${maxUsagePct}% (${highestLabel}) — API requests: ${apiUsagePct}%, data storage: ${storageUsagePct}%, file storage: ${fileUsagePct}%. Agentforce agents generate additional API and storage load; limits above 70% require review before deployment.`,
      evidence:    `Limits API: DailyApiRequests=${apiUsagePct}%, DataStorageMB=${storageUsagePct}%, FileStorageMB=${fileUsagePct}%`,
      effortDays:  maxUsagePct > 70 ? 5 : 0,
      impactScore: sev === 'critical' ? 7 : sev === 'warning' ? 4 : 1,
    },
  ]

  if (maxUsagePct < 20) {
    findings.push({
      domain:      'limits',
      severity:    'info',
      title:       'All platform limits healthy — capacity available for Agentforce',
      description: `All governor limits are below 20% utilisation — the org has sufficient headroom to absorb the additional API and storage load introduced by Agentforce agents at full deployment scale.`,
      evidence:    `Limits API: max utilisation = ${maxUsagePct}% across all limit categories`,
      effortDays:  0,
      impactScore: 1,
    })
  }

  return findings
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildDomainSummaries(signals: AllSignals, _scores: ScoredResult): Record<string, string> {
  // ── Data quality ───────────────────────────────────────────────────────────
  const dqObjects = signals.dataQuality.filter(dq => dq.totalRecords > 0)
  let dqSummary: string
  if (dqObjects.length === 0) {
    dqSummary = 'No data quality signals were collected — ensure the org has records in the configured objects.'
  } else {
    let totalWeight = 0, weightedSum = 0
    for (const dq of dqObjects) {
      const rates = Object.values(dq.completionRates)
      if (!rates.length) continue
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length
      weightedSum += avg * dq.totalRecords
      totalWeight += dq.totalRecords
    }
    const avgCompletion = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0

    const primary = dqObjects.find(o => o.objectName === 'Contact') ?? dqObjects[0]!
    let worstField = '', worstRate = 101
    for (const [field, rate] of Object.entries(primary.completionRates)) {
      if (rate < worstRate && rate < 100) { worstRate = rate; worstField = field }
    }

    const maxDup = signals.duplicates.length > 0
      ? signals.duplicates.reduce((a, b) => a.duplicateRate > b.duplicateRate ? a : b)
      : null

    dqSummary = `Field completion averages ${avgCompletion}% across ${dqObjects.length} scanned object${dqObjects.length !== 1 ? 's' : ''}.`
    if (worstField && worstRate < 90) {
      dqSummary += ` ${primary.objectName} ${worstField} has the widest gap at ${worstRate}% — blank fields limit Agentforce's ability to personalise responses.`
    }
    if (maxDup) {
      dqSummary += maxDup.duplicateRate > 10
        ? ` ${maxDup.objectName} duplicate rate is ${maxDup.duplicateRate.toFixed(1)}% — exceeds the 10% penalty threshold.`
        : ` Duplicate rates are within acceptable range — ${maxDup.objectName} at ${maxDup.duplicateRate.toFixed(1)}%.`
    }
  }

  // ── Automation ─────────────────────────────────────────────────────────────
  const { totalActiveFlows, flowsWithNoFaultPath, legacyAutomationCount, apexCoveragePct } = signals.automation
  const faultPct = totalActiveFlows > 0 ? Math.round(flowsWithNoFaultPath / totalActiveFlows * 100) : 0
  let autoSummary = `${totalActiveFlows} active flow${totalActiveFlows !== 1 ? 's' : ''} in the org`
  autoSummary += flowsWithNoFaultPath > 0
    ? `, ${flowsWithNoFaultPath} (${faultPct}%) missing fault connectors.`
    : ' — all have fault connectors configured.'
  if (legacyAutomationCount > 0) {
    autoSummary += ` ${legacyAutomationCount} Process Builder automation${legacyAutomationCount !== 1 ? 's' : ''} remain active and need migration to Flow before Agentforce deployment.`
  }
  autoSummary += ` Apex test coverage is ${apexCoveragePct}%${apexCoveragePct < 75 ? ' — below the 75% minimum required for safe deployments' : ' — above the 75% deployment threshold'}.`

  // ── Security ───────────────────────────────────────────────────────────────
  const { healthCheckScore, failingCheckCount, criticalCheckCount, guestUserRisk } = signals.security
  let secSummary: string
  if (healthCheckScore === 0) {
    secSummary = 'Security Health Check data was not available for this org edition — review the security posture manually before Agentforce deployment.'
  } else {
    secSummary = `Security Health Check scored ${healthCheckScore}/100 with ${failingCheckCount} failing check${failingCheckCount !== 1 ? 's' : ''}`
    if (criticalCheckCount > 0) secSummary += `, including ${criticalCheckCount} critical`
    secSummary += '.'
    secSummary += guestUserRisk
      ? ' Guest user security risks detected — resolve before enabling Agentforce on any public-facing channel.'
      : ' No guest user risks identified — public channel deployment is unblocked from a security perspective.'
  }

  // ── Knowledge ──────────────────────────────────────────────────────────────
  const { articleCount, staleArticleCount, topCaseReasons, coverageGapCount } = signals.knowledge
  const w = signals.configUsed.analysisWindowMonths
  let kbSummary: string
  if (articleCount === 0) {
    kbSummary = `No published Knowledge articles found. ${topCaseReasons.length} case reason categor${topCaseReasons.length !== 1 ? 'ies' : 'y'} identified from the last ${w} months — Agentforce deflection rate will be 0% without articles to draw from. This is a hard blocker.`
  } else {
    const covered = topCaseReasons.length - coverageGapCount
    kbSummary = `${articleCount} published article${articleCount !== 1 ? 's' : ''} cover${articleCount === 1 ? 's' : ''} ${covered} of ${topCaseReasons.length} top case reason${topCaseReasons.length !== 1 ? 's' : ''} — ${coverageGapCount} categor${coverageGapCount !== 1 ? 'ies' : 'y'} have no coverage.`
    if (staleArticleCount > 0) {
      const stalePct = Math.round(staleArticleCount / articleCount * 100)
      kbSummary += ` ${staleArticleCount} article${staleArticleCount !== 1 ? 's' : ''} (${stalePct}%) were last updated over 18 months ago and may surface outdated guidance.`
    }
  }

  // ── Metadata ───────────────────────────────────────────────────────────────
  const { unusedFieldCount, abandonedPackageCount } = signals.metadata
  const fieldThresholdMsg = unusedFieldCount > 200
    ? `${unusedFieldCount.toLocaleString()} unmanaged custom fields — exceeds the 200-field ceiling where schema complexity begins to affect Agentforce context window efficiency.`
    : `${unusedFieldCount.toLocaleString()} unmanaged custom fields — within the 200-field recommended ceiling.`
  const pkgMsg = abandonedPackageCount === 0
    ? 'No installed packages flagged.'
    : `${abandonedPackageCount} managed package${abandonedPackageCount !== 1 ? 's' : ''} installed — each adds automation surface and potential conflict risk.`
  const metaSummary = `${fieldThresholdMsg} ${pkgMsg}`

  // ── Adoption ───────────────────────────────────────────────────────────────
  const { loginRatePct, avgActivitiesPerUser } = signals.adoption
  const inactivePct = 100 - loginRatePct
  let adoptionSummary = `${loginRatePct}% of licensed users were active in the last 90 days`
  adoptionSummary += inactivePct > 0 ? ` — ${inactivePct}% of seats unused.` : '.'
  adoptionSummary += ` Average task activity is ${avgActivitiesPerUser} per user vs the ${ACTIVITY_MEDIAN_PER_90_DAYS}-activity industry median`
  adoptionSummary += avgActivitiesPerUser >= ACTIVITY_MEDIAN_PER_90_DAYS
    ? ' — Agentforce context from prior interactions will be well-populated.'
    : ' — sparse activity logs will limit Agentforce contextual recall.'

  // ── Limits ─────────────────────────────────────────────────────────────────
  const { apiUsagePct, storageUsagePct, fileUsagePct } = signals.limits
  const maxPct = Math.max(apiUsagePct, storageUsagePct, fileUsagePct)
  let limitsSummary = `API usage: ${apiUsagePct}%, data storage: ${storageUsagePct}%, file storage: ${fileUsagePct}%.`
  if (maxPct >= 70) {
    limitsSummary += ` Peak utilisation at ${maxPct}% — review capacity before Agentforce rollout adds additional API and storage load.`
  } else if (maxPct >= 40) {
    limitsSummary += ' Headroom is adequate but should be monitored as Agentforce agent traffic increases.'
  } else {
    limitsSummary += ' All limits well within range — sufficient headroom for Agentforce at full deployment scale.'
  }

  return {
    'Data quality & completeness':      dqSummary,
    'Automation health & conflicts':     autoSummary,
    'Security & permission model':       secSummary,
    'Knowledge base & grounding':        kbSummary,
    'Metadata & technical debt':         metaSummary,
    'User adoption & process alignment': adoptionSummary,
    'Platform limits & API headroom':    limitsSummary,
  }
}

export function buildFindings(signals: AllSignals, scores: ScoredResult): Finding[] {
  const scoreMap = new Map(scores.domains.map(d => [d.domain, d.score]))

  const allFindings: Finding[] = [
    ...dataQualityFindings(signals, scoreMap.get('data_quality') ?? 50),
    ...securityFindings(signals, scoreMap.get('security') ?? 50),
    ...automationFindings(signals, scoreMap.get('automation') ?? 50),
    ...knowledgeFindings(signals, scoreMap.get('knowledge') ?? 50),
    ...metadataFindings(signals, scoreMap.get('metadata') ?? 50),
    ...adoptionFindings(signals, scoreMap.get('adoption') ?? 50),
    ...limitsFindings(signals, scoreMap.get('limits') ?? 50),
  ]

  // Sort: critical first, then by impactScore descending
  return allFindings.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 }
    const sevDiff  = sevOrder[a.severity] - sevOrder[b.severity]
    if (sevDiff !== 0) return sevDiff
    return b.impactScore - a.impactScore
  })
}
