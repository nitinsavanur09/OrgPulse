import type { Connection } from 'jsforce'
import type { FieldCompletenessSignal, DuplicateSignal } from './types'
import type { ObjectScanConfig } from './config'

interface AggregateRecord {
  [key: string]: number | null
}

export async function scanFieldCompleteness(
  conn: Connection,
  objConfig: ObjectScanConfig
): Promise<FieldCompletenessSignal> {
  const minRecords = objConfig.minRecords ?? 100

  // Build COUNT aliases — SOQL aliases cannot contain dots, use underscore suffix
  const fieldAliasPairs = objConfig.fields.map(f => `COUNT(${f}) ${f}_ct`)
  const soql = `SELECT COUNT(Id) total, ${fieldAliasPairs.join(', ')} FROM ${objConfig.apiName} WHERE IsDeleted = false`

  let raw = await conn.query<AggregateRecord>(soql)
  const row = raw.records[0]
  const total = Number(row?.['total'] ?? 0)

  if (total < minRecords) {
    raw = null as any
    return { objectName: objConfig.apiName, totalRecords: 0, completionRates: {} }
  }

  const completionRates: Record<string, number> = {}
  for (const field of objConfig.fields) {
    const count = Number(row?.[`${field}_ct`] ?? 0)
    completionRates[field] = total > 0 ? Math.round(count / total * 100) : 0
  }

  raw = null as any
  return { objectName: objConfig.apiName, totalRecords: total, completionRates }
}

export async function scanDuplicateRate(
  conn: Connection,
  objConfig: ObjectScanConfig,
  windowMonths: number
): Promise<DuplicateSignal> {
  const dupFields = objConfig.duplicateFields ?? []
  const groupBy = dupFields.join(', ')

  const soql = `SELECT COUNT(Id) cnt FROM ${objConfig.apiName} WHERE IsDeleted = false AND CreatedDate = LAST_N_MONTHS:${windowMonths} GROUP BY ${groupBy} HAVING COUNT(Id) > 1`

  // Also fetch total for rate calculation — same window so the rate % is accurate within scope
  let totalRaw = await conn.query<AggregateRecord>(`SELECT COUNT(Id) total FROM ${objConfig.apiName} WHERE IsDeleted = false AND CreatedDate = LAST_N_MONTHS:${windowMonths}`)
  const total = Number(totalRaw.records[0]?.['total'] ?? 0)
  totalRaw = null as any

  let dupRaw = await conn.query<AggregateRecord>(soql)
  const duplicateCount = dupRaw.records.reduce((sum, r) => sum + Number(r['cnt'] ?? 0), 0)
  dupRaw = null as any

  const duplicateRate = total > 0 ? Math.round(duplicateCount / total * 1000) / 10 : 0

  return {
    objectName:     objConfig.apiName,
    duplicateCount,
    duplicateRate,
  }
}
