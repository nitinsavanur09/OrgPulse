import type { Connection } from 'jsforce'
import type { SecuritySignal } from './types'

interface HealthCheckRisk {
  riskType:    string
  severity:    string
  description: string
}

interface HealthCheckResponse {
  score: number
  risks: HealthCheckRisk[]
}

export async function scanSecurity(conn: Connection): Promise<SecuritySignal> {
  let raw = await conn.request<HealthCheckResponse>(
    '/services/data/v59.0/connect/security/health-check'
  )

  const signal: SecuritySignal = {
    healthCheckScore:   Math.round(raw.score ?? 0),
    failingCheckCount:  raw.risks?.length ?? 0,
    criticalCheckCount: raw.risks?.filter(r => r.severity === 'HIGH_RISK').length ?? 0,
    guestUserRisk:      raw.risks?.some(r => r.riskType.toLowerCase().includes('guest')) ?? false,
  }

  raw = null as any
  return signal
}
