import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { getConnection, listConnectedOrgs } from '../src/auth/connection'
import { runAllScans } from '../src/scan/index'
import { scoreFindings } from '../src/scoring/engine'
import { buildReportData } from '../src/report/json-schema'
import { generateReport } from '../src/report/generator'
import { uploadReport } from '../src/report/storage'

async function main() {
  const orgs = listConnectedOrgs()
  if (orgs.length === 0) {
    console.error('❌ No connected orgs. Run `npm run dev` then open http://localhost:3000/auth/start')
    process.exit(1)
  }

  const orgId = process.argv[2] ?? orgs[0]!
  console.log(`🔌 Connecting to org: ${orgId}`)

  const conn = getConnection(orgId)

  console.log('🔍 Running scans...')
  const signals = await runAllScans(conn)

  console.log('📊 Scoring...')
  const scores = scoreFindings(signals)
  console.log(`   AI Readiness Index: ${scores.overallIndex}/100  Hard blockers: ${scores.hardBlockers.length}`)

  console.log('📄 Building report data...')
  const intakePath = path.join(__dirname, '../client-intake.json')
  const intake = fs.existsSync(intakePath)
    ? JSON.parse(fs.readFileSync(intakePath, 'utf8'))
    : {}
  if (fs.existsSync(intakePath)) {
    console.log(`   Intake loaded from client-intake.json (${intake.orgName || 'unnamed org'})`)
  } else {
    console.log('   ⚠️  No client-intake.json found — using scan defaults. Copy client-intake.example.json to get started.')
  }
  const reportData = buildReportData(orgId, signals, scores, intake)

  console.log('🖨️  Generating HTML...')
  const html = generateReport(reportData)

  // Write local copy
  const reportsDir = path.join(__dirname, '../reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir)
  const localPath = path.join(reportsDir, 'test.html')
  fs.writeFileSync(localPath, html, 'utf8')
  console.log(`\n✅ Report written to: ${localPath}`)
  console.log('   Open in Chrome and run QC checklist before uploading.\n')

  // Ask before uploading
  if (process.argv.includes('--upload')) {
    console.log('☁️  Uploading to Supabase Storage...')
    try {
      const { signedUrl, filename } = await uploadReport(orgId, html)
      console.log(`\n✅ Upload complete: ${filename}`)
      console.log(`📎 Signed URL (90 days): ${signedUrl}`)
    } catch (err) {
      console.error('❌ Upload failed:', err)
      console.log(`   Report saved locally at ${localPath} — upload manually or re-run with --upload`)
      process.exit(1)
    }
  } else {
    console.log('   Add --upload flag to push to Supabase Storage once QC passes.')
  }
}

main().catch(err => {
  console.error('❌ Report test failed:', err)
  process.exit(1)
})
