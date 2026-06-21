import type { Connection } from 'jsforce'
import type { KnowledgeSignal, CaseVolumeSignal } from './types'

interface KnowledgeArticleRecord {
  total:      number
  latestPub:  string | null
}

interface CaseReasonRecord {
  Reason: string | null
  cnt:    number
}

interface AggregateRecord {
  [key: string]: number | null
}

const STALE_MONTHS = 18

export async function scanKnowledge(conn: Connection, windowMonths: number): Promise<KnowledgeSignal> {
  const staleDate = new Date()
  staleDate.setMonth(staleDate.getMonth() - STALE_MONTHS)
  const staleDateStr = staleDate.toISOString().slice(0, 10)

  let raw = await conn.query<KnowledgeArticleRecord>(
    `SELECT COUNT(Id) total, MAX(LastPublishedDate) latestPub
     FROM KnowledgeArticleVersion
     WHERE PublishStatus = 'Online' AND Language = 'en_US'`
  )
  const articleCount = Number(raw.records[0]?.['total'] ?? 0)
  raw = null as any

  let staleRaw = await conn.query<AggregateRecord>(
    `SELECT COUNT(Id) cnt
     FROM KnowledgeArticleVersion
     WHERE PublishStatus = 'Online' AND Language = 'en_US'
       AND LastPublishedDate < ${staleDateStr}T00:00:00Z`
  )
  const staleArticleCount = Number(staleRaw.records[0]?.['cnt'] ?? 0)
  staleRaw = null as any

  let reasonRaw = await conn.query<CaseReasonRecord>(
    `SELECT Reason, COUNT(Id) cnt FROM Case
     WHERE Reason != null AND CreatedDate = LAST_N_MONTHS:${windowMonths}
     GROUP BY Reason
     ORDER BY COUNT(Id) DESC
     LIMIT 20`
  )
  // Only reason API names — never record content
  const topCaseReasons: string[] = reasonRaw.records
    .map(r => r.Reason)
    .filter((r): r is string => r !== null)
  reasonRaw = null as any

  const coverageGapCount = Math.max(0, topCaseReasons.length - Math.min(articleCount, topCaseReasons.length))

  return {
    articleCount,
    staleArticleCount,
    topCaseReasons,
    coverageGapCount,
  }
}

export async function scanCaseVolume(conn: Connection): Promise<CaseVolumeSignal> {
  let raw = await conn.query<CaseReasonRecord>(
    `SELECT Reason, COUNT(Id) cnt FROM Case
     WHERE CreatedDate = LAST_N_MONTHS:3
     GROUP BY Reason
     ORDER BY COUNT(Id) DESC
     LIMIT 20`
  )

  const totalCases = raw.records.reduce((sum, r) => sum + Number(r.cnt ?? 0), 0)
  const monthlyVolume = Math.round(totalCases / 3)

  const topReasons = raw.records.map(r => ({
    reason: r.Reason ?? 'Unknown',
    count:  Number(r.cnt ?? 0),
  }))

  raw = null as any
  return { monthlyVolume, topReasons }
}
