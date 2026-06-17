import 'dotenv/config'
import { getConnection, listConnectedOrgs } from '../src/auth/connection'
import { runAllScans } from '../src/scan/index'

async function main() {
  const orgs = listConnectedOrgs()

  if (orgs.length === 0) {
    console.error('❌ No connected orgs. Run `npm run dev` then open http://localhost:3000/auth/start')
    process.exit(1)
  }

  const orgId = process.argv[2] ?? orgs[0]!
  console.log(`🔌 Connecting to org: ${orgId}\n`)

  const conn = getConnection(orgId)
  const signals = await runAllScans(conn)

  console.log('\n── Results ──────────────────────────────────────')
  console.log('Limits:     ', signals.limits)
  console.log('Security:   ', signals.security)
  console.log('Automation: ', signals.automation)
  console.log('Knowledge:  ', signals.knowledge)
  console.log('Metadata:   ', signals.metadata)
  console.log('Adoption:   ', signals.adoption)
  console.log('Case volume:', signals.caseVolume)
  console.log(`Data quality objects scanned: ${signals.dataQuality.length}`)
  console.log(`Duplicate checks run:         ${signals.duplicates.length}`)
  console.log('\n✅ Phase 2 gate: runAllScans() returned a complete AllSignals object.')
}

main().catch(err => {
  console.error('❌ Scan failed:', err)
  process.exit(1)
})
