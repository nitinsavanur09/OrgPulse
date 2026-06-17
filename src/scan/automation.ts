import type { Connection } from 'jsforce'
import type { AutomationSignal } from './types'

interface FlowRecord {
  ProcessType:                  string
  TriggerType:                  string | null
  HasFaultConnector:            boolean
  TriggerObjectOrEventApiName:  string | null
}

interface CoverageRecord {
  PercentCovered: number
}

interface AggregateRecord {
  [key: string]: number | null
}

export async function scanAutomation(conn: Connection): Promise<AutomationSignal> {
  // Active flows via FlowVersionView (falls back to Flow if unavailable)
  let totalActiveFlows     = 0
  let flowsWithNoFaultPath = 0
  let highRiskObjects: string[] = []

  try {
    // FlowVersionView has fault-path and trigger columns — preferred
    let flowsRaw = await conn.tooling.query<FlowRecord>(
      `SELECT ProcessType, TriggerType, HasFaultConnector, TriggerObjectOrEventApiName
       FROM FlowVersionView
       WHERE Status = 'Active'`
    )
    totalActiveFlows = flowsRaw.totalSize
    const noFault = flowsRaw.records.filter(f => !f.HasFaultConnector)
    flowsWithNoFaultPath = noFault.length
    highRiskObjects = [
      ...new Set(
        noFault
          .map(f => f.TriggerObjectOrEventApiName)
          .filter((n): n is string => n !== null && n !== '')
      ),
    ].slice(0, 10)
    flowsRaw = null as any
  } catch {
    // Fall back to basic Flow object — fault-path detail unavailable
    let flowsRaw = await conn.tooling.query<{ ProcessType: string }>(
      `SELECT ProcessType FROM Flow WHERE Status = 'Active'`
    )
    totalActiveFlows = flowsRaw.totalSize
    flowsRaw = null as any
  }

  // Apex test coverage
  let coverageRaw = await conn.tooling.query<CoverageRecord>(
    `SELECT PercentCovered FROM ApexOrgWideCoverage`
  )
  const apexCoveragePct = Number(coverageRaw.records[0]?.PercentCovered ?? 0)
  coverageRaw = null as any

  // Legacy automation — Process Builder (not available in all org editions)
  let legacyAutomationCount = 0
  try {
    let legacyRaw = await conn.tooling.query<AggregateRecord>(
      `SELECT COUNT() FROM ProcessDefinition WHERE State = 'Active'`
    )
    legacyAutomationCount = legacyRaw.totalSize
    legacyRaw = null as any
  } catch {
    // ProcessDefinition not supported in this edition — count stays 0
  }

  return {
    totalActiveFlows,
    flowsWithNoFaultPath,
    legacyAutomationCount,
    apexCoveragePct,
    highRiskObjects,
  }
}
