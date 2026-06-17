import 'dotenv/config'
import { getConnection, listConnectedOrgs } from '../src/auth/connection'

async function main() {
  const orgs = listConnectedOrgs()

  if (orgs.length === 0) {
    console.error('❌ No connected orgs found.')
    console.error('   Run `npm run dev` then open http://localhost:3000/auth/start to connect.')
    process.exit(1)
  }

  // Use the org ID passed as CLI arg, or the first one in the store
  const orgId = process.argv[2] ?? orgs[0]!
  console.log(`🔌 Testing connection for org: ${orgId}`)

  const conn = getConnection(orgId)

  type CountResult = { cnt: number }
  let raw = await conn.query<CountResult>(
    `SELECT COUNT(Id) cnt FROM User WHERE IsActive = true`
  )

  const activeUserCount = raw.records[0]?.cnt ?? 0
  raw = null as unknown as typeof raw  // zero-copy: discard raw before using value

  console.log(`✅ Active users in org: ${activeUserCount}`)
  console.log('   Phase 1 gate passed — connection is live.')
}

main().catch(err => {
  console.error('❌ Connection test failed:', err)
  process.exit(1)
})
