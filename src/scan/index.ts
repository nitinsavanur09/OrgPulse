import type { Connection } from 'jsforce'
import {
  type AllSignals,
  type LimitsSignal,
  type SecuritySignal,
  type AutomationSignal,
  type KnowledgeSignal,
  type MetadataSignal,
  type AdoptionSignal,
  type CaseVolumeSignal,
  type FieldCompletenessSignal,
  type DuplicateSignal,
} from './types'
import { loadConfig, type ScanConfig } from './config'
import { scanLimits } from './limits'
import { scanSecurity } from './security'
import { scanFieldCompleteness, scanDuplicateRate } from './data-quality'
import { scanAutomation } from './automation'
import { scanKnowledge, scanCaseVolume } from './knowledge'
import { scanMetadata } from './metadata'
import { scanAdoption } from './adoption'

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.error(`[scan:${label}] failed:`, e instanceof Error ? e.message : e)
    return fallback
  }
}

function defaultLimits(): LimitsSignal {
  return { apiUsagePct: 0, storageUsagePct: 0, fileUsagePct: 0 }
}

function defaultSecurity(): SecuritySignal {
  return { healthCheckScore: 0, failingCheckCount: 0, criticalCheckCount: 0, guestUserRisk: false }
}

function defaultAutomation(): AutomationSignal {
  return { totalActiveFlows: 0, flowsWithNoFaultPath: 0, legacyAutomationCount: 0, apexCoveragePct: 0, highRiskObjects: [] }
}

function defaultKnowledge(): KnowledgeSignal {
  return { articleCount: 0, staleArticleCount: 0, topCaseReasons: [], coverageGapCount: 0 }
}

function defaultMetadata(): MetadataSignal {
  return { unusedFieldCount: 0, abandonedPackageCount: 0 }
}

function defaultAdoption(): AdoptionSignal {
  return { loginRatePct: 0, avgActivitiesPerUser: 0 }
}

function defaultCaseVolume(): CaseVolumeSignal {
  return { monthlyVolume: 0, topReasons: [] }
}

export async function runAllScans(
  conn: Connection,
  config?: Partial<ScanConfig>
): Promise<AllSignals> {
  const resolvedConfig = loadConfig(config)

  // Phase A — parallel: independent domains with no shared state
  console.log('[scan] Phase A: running limits, security, adoption, knowledge, case volume in parallel...')
  const [limits, security, adoption, knowledge, caseVolume] = await Promise.all([
    safe('limits',      () => scanLimits(conn),      defaultLimits()),
    safe('security',    () => scanSecurity(conn),     defaultSecurity()),
    safe('adoption',    () => scanAdoption(conn),     defaultAdoption()),
    safe('knowledge',   () => scanKnowledge(conn, resolvedConfig.analysisWindowMonths),    defaultKnowledge()),
    safe('caseVolume',  () => scanCaseVolume(conn),   defaultCaseVolume()),
  ])

  // Phase B — sequential: per-object data quality (avoids SOQL governor limit bursts)
  console.log(`[scan] Phase B: scanning ${resolvedConfig.objects.length} objects for data quality...`)
  const dataQuality: FieldCompletenessSignal[] = []
  const duplicates: DuplicateSignal[] = []

  for (const objConfig of resolvedConfig.objects) {
    const dq = await safe(
      `dataQuality:${objConfig.apiName}`,
      () => scanFieldCompleteness(conn, objConfig),
      null
    )
    if (dq) dataQuality.push(dq)

    if (objConfig.checkDuplicates && objConfig.duplicateFields?.length) {
      const dup = await safe(
        `duplicates:${objConfig.apiName}`,
        () => scanDuplicateRate(conn, objConfig, resolvedConfig.analysisWindowMonths),
        null
      )
      if (dup) duplicates.push(dup)
    }
  }

  // Phase C — sequential: Tooling API scans share the same API budget
  console.log('[scan] Phase C: running automation and metadata scans...')
  const automation = await safe('automation', () => scanAutomation(conn), defaultAutomation())
  const metadata   = await safe('metadata',   () => scanMetadata(conn),   defaultMetadata())

  console.log('[scan] All domains complete.')

  return {
    limits,
    security,
    dataQuality,
    duplicates,
    automation,
    knowledge,
    metadata,
    adoption,
    caseVolume,
    configUsed: resolvedConfig,
  }
}
