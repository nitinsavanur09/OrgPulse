import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { getConnection, listConnectedOrgs } from '../src/auth/connection'
import { runAllScans } from '../src/scan/index'
import { scoreFindings } from '../src/scoring/engine'
import { buildFindings } from '../src/scoring/findings-builder'
import { buildReportData } from '../src/report/json-schema'
import { generateReport } from '../src/report/generator'
import { uploadReport } from '../src/report/storage'
import { saveResults } from '../src/db/queries'
import type { ScanConfig } from '../src/scan/config'

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

const orgIdArg   = flag('--org')
const useCaseArg = flag('--use-case')
const configPath = flag('--config')

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
  // Resolve org ID
  const orgs = listConnectedOrgs()
  if (!orgIdArg && orgs.length === 0) {
    console.error('❌ No connected orgs and no --org flag provided.')
    console.error('   Run `npm run dev` then open http://localhost:3000/auth/start to connect an org.')
    process.exit(1)
  }
  const orgId = orgIdArg ?? orgs[0]!

  // Resolve scan config override
  let configOverride: Partial<ScanConfig> | undefined
  if (configPath) {
    const resolved = path.resolve(process.cwd(), configPath)
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Config file not found: ${resolved}`)
      process.exit(1)
    }
    configOverride = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Partial<ScanConfig>
    console.log(`⚙️  Config: loaded from ${configPath}`)
  } else if (useCaseArg) {
    const validUseCases = ['service', 'sales', 'field_service', 'custom']
    if (!validUseCases.includes(useCaseArg)) {
      console.error(`❌ Invalid --use-case "${useCaseArg}". Must be one of: ${validUseCases.join(', ')}`)
      process.exit(1)
    }
    configOverride = { agentforceUseCase: useCaseArg as ScanConfig['agentforceUseCase'] }
  }

  // Step 1: Connect
  console.log(`\n🔌 Connecting to org: ${orgId}`)
  let conn: ReturnType<typeof getConnection>
  try {
    conn = getConnection(orgId)
  } catch (err) {
    console.error('❌ Connection failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // Step 2: Scan
  const useCase = configOverride?.agentforceUseCase ?? 'service'
  console.log(`⚙️  Config: ${useCase} use case`)
  console.log('🔍 Running scans...')
  const signals = await runAllScans(conn, configOverride)
  const objectCount = signals.configUsed.objects.length
  console.log(`   Scanned ${objectCount} object${objectCount !== 1 ? 's' : ''} across 7 domains`)

  // Persist signals so rebuild-report can regenerate HTML without re-scanning
  const reportsDir = path.join(process.cwd(), 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir)
  const signalsPath = path.join(reportsDir, `${orgId}-signals.json`)
  fs.writeFileSync(signalsPath, JSON.stringify({ orgId, signals }, null, 2), 'utf8')

  // Step 3: Score
  console.log('📊 Scoring domains...')
  const scores = scoreFindings(signals)
  const blockerStr = scores.hardBlockers.length > 0
    ? `  Hard blockers: ${scores.hardBlockers.join(', ')}`
    : '  No hard blockers'
  console.log(`   AI Readiness Index: ${scores.overallIndex}/100 ${blockerStr}`)

  // Step 4: Build findings (needed independently for saveResults)
  const findings = buildFindings(signals, scores)

  // Step 5: Build report data
  console.log('📄 Building report data...')
  const intakePath = path.join(process.cwd(), 'client-intake.json')
  const intake = fs.existsSync(intakePath)
    ? JSON.parse(fs.readFileSync(intakePath, 'utf8'))
    : {}
  if (!fs.existsSync(intakePath)) {
    console.log('   ⚠️  No client-intake.json found — using scan defaults. Copy client-intake.example.json to get started.')
  } else {
    console.log(`   Intake loaded (${intake.orgName || orgId})`)
  }
  const reportData = buildReportData(orgId, signals, scores, intake)

  // Step 6: Generate HTML
  console.log('🖨️  Generating HTML...')
  const html = generateReport(reportData)

  // Step 7: Save locally + upload to Supabase for archival
  const localFilename = `${orgId}-${Date.now()}.html`
  const localPath     = path.join(reportsDir, localFilename)
  fs.writeFileSync(localPath, html, 'utf8')

  // Build the report URL from the ngrok base (server must be running via `npm run dev`)
  const ngrokBase = (process.env.SF_REDIRECT_URI ?? '').replace('/auth/callback', '')
  const reportUrl = ngrokBase
    ? `${ngrokBase}/reports/${localFilename}`
    : `file://${localPath}`

  // Archive to Supabase Storage (best-effort — not used as the served URL)
  console.log('☁️  Archiving to Supabase Storage...')
  let archiveUrl = ''
  try {
    const result = await uploadReport(orgId, html)
    archiveUrl = result.signedUrl
  } catch (err) {
    console.error('   ⚠️  Archive upload failed (non-critical):', err instanceof Error ? err.message : err)
  }

  // Step 8: Save results to DB
  console.log('💾 Saving results to database...')
  await saveResults(orgId, scores, findings, reportUrl)

  // Done
  console.log(`\n✅ Done! AI Readiness Index: ${scores.overallIndex}/100`)
  console.log(`📎 Report URL: ${reportUrl}`)
  if (archiveUrl) console.log(`📦 Supabase archive: ${archiveUrl}`)
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
