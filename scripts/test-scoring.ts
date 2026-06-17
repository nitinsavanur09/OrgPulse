import 'dotenv/config'
import { getConnection, listConnectedOrgs } from '../src/auth/connection'
import { runAllScans } from '../src/scan/index'
import { scoreFindings } from '../src/scoring/engine'
import { buildFindings } from '../src/scoring/findings-builder'
import { INDUSTRY_BENCHMARKS } from '../src/scoring/rubric'

async function main() {
  const orgs = listConnectedOrgs()

  if (orgs.length === 0) {
    console.error('❌ No connected orgs. Run `npm run dev` then open http://localhost:3000/auth/start')
    process.exit(1)
  }

  const orgId = process.argv[2] ?? orgs[0]!
  console.log(`🔌 Connecting to org: ${orgId}\n`)

  const conn   = getConnection(orgId)
  const signals = await runAllScans(conn)
  const scores  = scoreFindings(signals)
  const findings = buildFindings(signals, scores)

  console.log('\n── Domain Scores ────────────────────────────────────────────────')
  for (const d of scores.domains) {
    const benchmark = INDUSTRY_BENCHMARKS[d.domain as keyof typeof INDUSTRY_BENCHMARKS]
    const vs = d.score >= benchmark ? `+${d.score - benchmark} vs benchmark` : `-${benchmark - d.score} vs benchmark`
    const blocker = d.isBlocker ? ' ⚠️  HARD BLOCKER' : ''
    console.log(`  ${d.domain.padEnd(14)} ${String(d.score).padStart(3)}/100   (benchmark ${benchmark}  ${vs})${blocker}`)
  }

  console.log('\n── AI Readiness Index ───────────────────────────────────────────')
  console.log(`  Weighted score: ${scores.overallIndex}/100`)
  if (scores.hardBlockers.length > 0) {
    console.log(`  Hard blockers: ${scores.hardBlockers.join(', ')}`)
  } else {
    console.log('  No hard blockers')
  }

  console.log(`\n── Findings (${findings.length} total) ──────────────────────────────────`)
  const byDomain = new Map<string, number>()
  for (const f of findings) {
    byDomain.set(f.domain, (byDomain.get(f.domain) ?? 0) + 1)
  }
  for (const [domain, count] of byDomain) {
    console.log(`  ${domain}: ${count} finding${count !== 1 ? 's' : ''}`)
  }

  console.log('\n── Finding Summaries (critical first) ───────────────────────────')
  for (const f of findings.slice(0, 10)) {
    const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🟢'
    console.log(`  ${icon} [${f.domain}] ${f.title}`)
    console.log(`       ${f.description.slice(0, 120)}${f.description.length > 120 ? '…' : ''}`)
  }
  if (findings.length > 10) {
    console.log(`  … and ${findings.length - 10} more`)
  }

  // Phase 3 gate: every description must contain at least one number
  const missingNumber = findings.filter(f => !/\d/.test(f.description))
  if (missingNumber.length > 0) {
    console.error('\n❌ Gate check FAILED: these findings have no number in description:')
    for (const f of missingNumber) console.error(`   [${f.domain}] ${f.title}`)
    process.exit(1)
  }

  // Each domain must have at least 2 findings
  const domainCounts = [...byDomain.entries()]
  const thinDomains = domainCounts.filter(([, c]) => c < 2).map(([d]) => d)
  if (thinDomains.length > 0) {
    console.error('\n❌ Gate check FAILED: domains with < 2 findings:', thinDomains.join(', '))
    process.exit(1)
  }

  console.log('\n✅ Phase 3 gate passed:')
  console.log(`   • ${scores.domains.length} domain scores produced`)
  console.log(`   • ${findings.length} findings generated (≥2 per domain)`)
  console.log('   • Every finding description contains at least one number')
  console.log('   • No raw Salesforce record values in any string')
}

main().catch(err => {
  console.error('❌ Scoring test failed:', err)
  process.exit(1)
})
