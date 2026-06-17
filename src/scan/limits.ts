import type { Connection } from 'jsforce'
import type { LimitsSignal } from './types'

interface LimitsApiEntry {
  Max:       number
  Remaining: number
}

export async function scanLimits(conn: Connection): Promise<LimitsSignal> {
  let raw = await (conn as any).limits() as Record<string, LimitsApiEntry>

  const pct = (key: string): number => {
    const entry = raw[key]
    if (!entry || entry.Max === 0) return 0
    return Math.round((entry.Max - entry.Remaining) / entry.Max * 100)
  }

  const signal: LimitsSignal = {
    apiUsagePct:     pct('DailyApiRequests'),
    storageUsagePct: pct('DataStorageMB'),
    fileUsagePct:    pct('FileStorageMB'),
  }

  raw = null as any
  return signal
}
