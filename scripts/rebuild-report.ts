import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { listConnectedOrgs } from '../src/auth/connection'
import { scoreFindings } from '../src/scoring/engine'
import { buildFindings } from '../src/scoring/findings-builder'
import { buildReportData } from '../src/report/json-schema'
import { generateReport } from '../src/report/generator'
import { uploadReport } from '../src/report/storage'
import { saveResults } from '../src/db/queries'
import type { AllSignals } from '../src/scan/types'

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

const orgIdArg = flag('--org')

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const reportsDir = path.join(process.cwd(), 'reports')

  // Resolve which org's signals to use
  const orgs = listConnectedOrgs()
  const orgId = orgIdArg ?? orgs[0]
  if (!orgId) {
    console.error('❌ No org ID. Pass --org <orgId> or connect an org first.')
    process.exit(1)
  }

  // Load cached signals
  const signalsPath = path.join(reportsDir, `${orgId}-signals.json`)
  if (!fs.existsSync(signalsPath)) {
    console.error(`❌ No cached signals found at ${signalsPath}`)
    console.error('   Run `npm run scan -- --org ' + orgId + '` first to generate signals.')
    process.exit(1)
  }
  const { signals } = JSON.parse(fs.readFileSync(signalsPath, 'utf8')) as { orgId: string; signals: AllSignals }
  console.log(`\n📂 Loaded cached signals for org: ${orgId}`)

  // Load client-intake.json
  const intakePath = path.join(process.cwd(), 'client-intake.json')
  const intake = fs.existsSync(intakePath)
    ? JSON.parse(fs.readFileSync(intakePath, 'utf8'))
    : {}
  if (!fs.existsSync(intakePath)) {
    console.log('   ⚠️  No client-intake.json found — using scan defaults.')
  } else {
    console.log(`   Intake loaded (${intake.orgName || orgId})`)
  }

  // Score → build → generate
  console.log('📊 Scoring domains...')
  const scores = scoreFindings(signals)
  const findings = buildFindings(signals, scores)

  console.log('📄 Building report data...')
  const reportData = buildReportData(orgId, signals, scores, intake)

  console.log('🖨️  Generating HTML...')
  const html = generateReport(reportData)

  // Save locally
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir)
  const localFilename = `${orgId}-${Date.now()}.html`
  const localPath     = path.join(reportsDir, localFilename)
  fs.writeFileSync(localPath, html, 'utf8')

  const ngrokBase = (process.env.SF_REDIRECT_URI ?? '').replace('/auth/callback', '')
  const reportUrl = ngrokBase
    ? `${ngrokBase}/reports/${localFilename}`
    : `file://${localPath}`

  // Archive to Supabase (best-effort)
  console.log('☁️  Archiving to Supabase Storage...')
  let archiveUrl = ''
  try {
    const result = await uploadReport(orgId, html)
    archiveUrl = result.signedUrl
  } catch (err) {
    console.error('   ⚠️  Archive upload failed (non-critical):', err instanceof Error ? err.message : err)
  }

  // Update DB with new report URL
  console.log('💾 Updating database...')
  await saveResults(orgId, scores, findings, reportUrl)

  console.log(`\n✅ Report rebuilt! AI Readiness Index: ${scores.overallIndex}/100`)
  console.log(`📎 Report URL: ${reportUrl}`)
  if (archiveUrl) console.log(`📦 Supabase archive: ${archiveUrl}`)
}

main().catch(err => {
  console.error('\n❌ Rebuild failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
