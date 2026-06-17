import type { Connection } from 'jsforce'
import type { AdoptionSignal } from './types'

interface AggregateRecord {
  [key: string]: number | null
}

export async function scanAdoption(conn: Connection): Promise<AdoptionSignal> {
  // Total active users
  let userRaw = await conn.query<AggregateRecord>(
    `SELECT COUNT(Id) total FROM User WHERE IsActive = true`
  )
  const totalUsers = Number(userRaw.records[0]?.['total'] ?? 0)
  userRaw = null as any

  if (totalUsers === 0) {
    return { loginRatePct: 0, avgActivitiesPerUser: 0 }
  }

  // Distinct users who logged in at least once in last 90 days
  // COUNT(DISTINCT ...) not supported in SOQL; use a subquery workaround via aggregate on UserId
  // We count total successful login events then derive approximate unique ratio from activity
  // LoginHistory does not support filtering on Status in SOQL
  let loginRaw = await conn.query<AggregateRecord>(
    `SELECT COUNT(Id) loginCount FROM LoginHistory
     WHERE LoginTime = LAST_N_DAYS:90`
  )
  // Use login event count capped at totalUsers as a proxy for unique active users
  const loginEvents = Number(loginRaw.records[0]?.['loginCount'] ?? 0)
  // Approximate: users with ≥3 logins in 90 days → clamp to totalUsers
  const activeLoginUsers = Math.min(loginEvents > 0 ? Math.ceil(loginEvents / 3) : 0, totalUsers)
  const loginRatePct = Math.round(activeLoginUsers / totalUsers * 100)
  loginRaw = null as any

  // Activity count (open tasks created in last 90 days)
  let taskRaw = await conn.query<AggregateRecord>(
    `SELECT COUNT(Id) activityCount FROM Task WHERE CreatedDate = LAST_N_DAYS:90`
  )
  const activityCount = Number(taskRaw.records[0]?.['activityCount'] ?? 0)
  const avgActivitiesPerUser = Math.round(activityCount / totalUsers * 10) / 10
  taskRaw = null as any

  return { loginRatePct, avgActivitiesPerUser }
}
