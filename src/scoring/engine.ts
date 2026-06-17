import type { AllSignals } from '../scan/types'
import {
  DOMAIN_WEIGHTS,
  HARD_BLOCKER_THRESHOLD,
  type DomainScore,
  type ScoredResult,
  clamp,
} from './rubric'

// ── Per-domain scorers ────────────────────────────────────────────────────────

function scoreDataQuality(signals: AllSignals): number {
  const { dataQuality, duplicates } = signals
  const objectsWithData = dataQuality.filter(dq => dq.totalRecords > 0)

  if (objectsWithData.length === 0) return 50 // no objects crossed minRecords threshold

  // Weighted average completion rate (weight = totalRecords)
  let totalWeight = 0
  let weightedSum = 0
  for (const dq of objectsWithData) {
    const rates = Object.values(dq.completionRates)
    if (rates.length === 0) continue
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
    weightedSum += avgRate * dq.totalRecords
    totalWeight += dq.totalRecords
  }
  const avgCompletionRate = totalWeight > 0 ? weightedSum / totalWeight : 50

  const maxDupRate = duplicates.length > 0
    ? Math.max(...duplicates.map(d => d.duplicateRate))
    : 0

  // Deduct for duplicate rate
  const dupPenalty = maxDupRate > 15 ? 30 : maxDupRate > 10 ? 15 : maxDupRate > 5 ? 5 : 0

  return clamp(avgCompletionRate - dupPenalty, 0, 100)
}

function scoreSecurity(signals: AllSignals): number {
  const { healthCheckScore, criticalCheckCount, guestUserRisk } = signals.security
  const criticalPenalty = criticalCheckCount > 5 ? 20 : criticalCheckCount > 2 ? 10 : 0
  const guestPenalty    = guestUserRisk ? 15 : 0
  return clamp(healthCheckScore - criticalPenalty - guestPenalty, 0, 100)
}

function scoreAutomation(signals: AllSignals): number {
  const { totalActiveFlows, flowsWithNoFaultPath, legacyAutomationCount, apexCoveragePct } = signals.automation

  const faultPathPct = totalActiveFlows > 0
    ? (flowsWithNoFaultPath / totalActiveFlows) * 100
    : 0

  const faultPenalty  = faultPathPct > 50 ? 40 : faultPathPct > 25 ? 20 : faultPathPct > 10 ? 10 : 0
  const apexPenalty   = apexCoveragePct < 40 ? 30 : apexCoveragePct < 60 ? 15 : apexCoveragePct < 75 ? 5 : 0
  const legacyPenalty = legacyAutomationCount > 10 ? 25 : legacyAutomationCount > 5 ? 10 : legacyAutomationCount > 0 ? 5 : 0

  return clamp(100 - faultPenalty - apexPenalty - legacyPenalty, 0, 100)
}

function scoreKnowledge(signals: AllSignals): number {
  const { articleCount, staleArticleCount, topCaseReasons, coverageGapCount } = signals.knowledge

  if (articleCount === 0) return 15 // hard blocker — no knowledge base

  const staleRatio = (staleArticleCount / articleCount) * 100
  const gapRatio   = topCaseReasons.length > 0
    ? (coverageGapCount / topCaseReasons.length) * 100
    : 0

  const stalePenalty = staleRatio > 50 ? 40 : staleRatio > 30 ? 20 : staleRatio > 15 ? 10 : 0
  const gapPenalty   = gapRatio > 75 ? 40 : gapRatio > 50 ? 25 : gapRatio > 25 ? 10 : 0

  let score = clamp(100 - stalePenalty - gapPenalty, 0, 100)

  // Cap for very thin knowledge base
  if (articleCount < 10) score = Math.min(score, 30)
  else if (articleCount < 50) score = Math.min(score, 60)

  return score
}

function scoreMetadata(signals: AllSignals): number {
  const { unusedFieldCount, abandonedPackageCount } = signals.metadata
  const fieldPenalty = unusedFieldCount > 700 ? 60 : unusedFieldCount > 400 ? 35 : unusedFieldCount > 200 ? 15 : 0
  const pkgPenalty   = abandonedPackageCount > 10 ? 30 : abandonedPackageCount > 5 ? 15 : abandonedPackageCount > 2 ? 5 : 0
  return clamp(100 - fieldPenalty - pkgPenalty, 0, 100)
}

function scoreAdoption(signals: AllSignals): number {
  const { loginRatePct, avgActivitiesPerUser } = signals.adoption
  const bonus   = avgActivitiesPerUser > 20 ? 5 : avgActivitiesPerUser > 10 ? 3 : avgActivitiesPerUser > 3 ? 1 : 0
  const penalty = avgActivitiesPerUser < 3 ? 10 : 0
  return clamp(loginRatePct + bonus - penalty, 0, 100)
}

function scoreLimits(signals: AllSignals): number {
  const { apiUsagePct, storageUsagePct, fileUsagePct } = signals.limits
  const maxUsage = Math.max(apiUsagePct, storageUsagePct, fileUsagePct)
  return clamp(100 - maxUsage, 0, 100)
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

type DomainKey = keyof typeof DOMAIN_WEIGHTS

const DOMAIN_SCORERS: Array<[DomainKey, (s: AllSignals) => number]> = [
  ['data_quality', scoreDataQuality],
  ['automation',   scoreAutomation],
  ['security',     scoreSecurity],
  ['knowledge',    scoreKnowledge],
  ['metadata',     scoreMetadata],
  ['adoption',     scoreAdoption],
  ['limits',       scoreLimits],
]

export function scoreFindings(signals: AllSignals): ScoredResult {
  const domains: DomainScore[] = DOMAIN_SCORERS.map(([domain, fn]) => {
    const score = Math.round(fn(signals))
    return {
      domain,
      score,
      isBlocker: score < HARD_BLOCKER_THRESHOLD,
      weight:    DOMAIN_WEIGHTS[domain],
    }
  })

  const overallIndex = Math.round(
    domains.reduce((sum, d) => sum + d.score * d.weight, 0)
  )

  const hardBlockers = domains.filter(d => d.isBlocker).map(d => d.domain)

  return { domains, overallIndex, hardBlockers }
}

// ── Inline unit tests (run directly: npx tsx src/scoring/engine.ts) ───────────

if (require.main === module) {
  const { DEFAULT_CONFIG } = require('../scan/config')

  const pass = (label: string, condition: boolean) => {
    const icon = condition ? '✓' : '✗'
    console.log(`  ${icon} ${label}`)
    if (!condition) process.exitCode = 1
  }

  console.log('\n── Unit tests: scoreFindings ──')

  // Weights must sum to 1.0
  const weightSum = Object.values(DOMAIN_WEIGHTS).reduce((a, b) => a + b, 0)
  pass('DOMAIN_WEIGHTS sums to 1.0', Math.abs(weightSum - 1) < 0.0001)

  // Max signals → high index
  const maxSignals: AllSignals = {
    limits:      { apiUsagePct: 5, storageUsagePct: 5, fileUsagePct: 5 },
    security:    { healthCheckScore: 95, failingCheckCount: 0, criticalCheckCount: 0, guestUserRisk: false },
    dataQuality: [{ objectName: 'Contact', totalRecords: 1000, completionRates: { Email: 95, Phone: 90 } }],
    duplicates:  [{ objectName: 'Contact', duplicateCount: 5, duplicateRate: 0.5 }],
    automation:  { totalActiveFlows: 10, flowsWithNoFaultPath: 0, legacyAutomationCount: 0, apexCoveragePct: 90, highRiskObjects: [] },
    knowledge:   { articleCount: 200, staleArticleCount: 10, topCaseReasons: ['Billing', 'Tech'], coverageGapCount: 0 },
    metadata:    { unusedFieldCount: 50, abandonedPackageCount: 1 },
    adoption:    { loginRatePct: 90, avgActivitiesPerUser: 25 },
    caseVolume:  { monthlyVolume: 500, topReasons: [] },
    configUsed:  DEFAULT_CONFIG,
  }
  const maxResult = scoreFindings(maxSignals)
  pass('Max signals → overallIndex >= 80', maxResult.overallIndex >= 80)
  pass('Max signals → no hard blockers', maxResult.hardBlockers.length === 0)

  // Min signals → hard blockers
  const minSignals: AllSignals = {
    limits:      { apiUsagePct: 95, storageUsagePct: 95, fileUsagePct: 95 },
    security:    { healthCheckScore: 0, failingCheckCount: 50, criticalCheckCount: 10, guestUserRisk: true },
    dataQuality: [{ objectName: 'Contact', totalRecords: 1000, completionRates: { Email: 20, Phone: 15 } }],
    duplicates:  [{ objectName: 'Contact', duplicateCount: 300, duplicateRate: 30 }],
    automation:  { totalActiveFlows: 20, flowsWithNoFaultPath: 18, legacyAutomationCount: 15, apexCoveragePct: 20, highRiskObjects: [] },
    knowledge:   { articleCount: 0, staleArticleCount: 0, topCaseReasons: ['Billing'], coverageGapCount: 1 },
    metadata:    { unusedFieldCount: 900, abandonedPackageCount: 15 },
    adoption:    { loginRatePct: 20, avgActivitiesPerUser: 1 },
    caseVolume:  { monthlyVolume: 50, topReasons: [] },
    configUsed:  DEFAULT_CONFIG,
  }
  const minResult = scoreFindings(minSignals)
  pass('Min signals → overallIndex < 50', minResult.overallIndex < 50)
  pass('Min signals → all 7 domains are hard blockers', minResult.hardBlockers.length === 7)

  // One domain at 30 → appears in hardBlockers
  const partialSignals: AllSignals = { ...maxSignals, knowledge: minSignals.knowledge }
  const partialResult = scoreFindings(partialSignals)
  pass('knowledge at min → appears in hardBlockers', partialResult.hardBlockers.includes('knowledge'))
  pass('knowledge at min → other domains not blocked', partialResult.hardBlockers.length === 1)

  console.log(`\n  Overall: ${partialResult.overallIndex}/100 with hardBlockers: [${partialResult.hardBlockers.join(', ')}]\n`)
}
