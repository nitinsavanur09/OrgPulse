import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { getConnection, listConnectedOrgs } from '../src/auth/connection'
import type * as jsforce from 'jsforce'

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

const scenario = (flag('--scenario') ?? '').toLowerCase()
const orgIdFlag = flag('--org')
const skipScan  = args.includes('--skip-scan')

if (scenario !== 'a' && scenario !== 'b') {
  process.stderr.write(
    'Usage: npx tsx scripts/load-demo-and-scan.ts --scenario a|b [--org <orgId>] [--skip-scan]\n' +
    '  --scenario a   NovaStar Insurance Group (Service Cloud)\n' +
    '  --scenario b   PrecisionTech Manufacturing (Sales Cloud)\n'
  )
  process.exit(1)
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return []

  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return []

  function splitLine(line: string): string[] {
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = splitLine(lines[0]!)
  return lines.slice(1).map(line => {
    const vals = splitLine(line)
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => { rec[h] = vals[i] ?? '' })
    return rec
  })
}

// ─── FK resolution ────────────────────────────────────────────────────────────

function resolveFK(
  records: Record<string, string>[],
  fkColumn: string,
  sfColumn: string,
  idMap: Map<string, string>,
  ctx: string
): Record<string, string>[] {
  let skipped = 0
  const out: Record<string, string>[] = []

  for (const rec of records) {
    const extId = rec[fkColumn]
    if (!extId) {
      const r = { ...rec }
      delete r[fkColumn]
      out.push(r)
      continue
    }
    const sfId = idMap.get(extId)
    if (!sfId) { skipped++; continue }
    const r = { ...rec }
    delete r[fkColumn]
    r[sfColumn] = sfId
    out.push(r)
  }

  if (skipped > 0) {
    console.log(`    ⚠  ${skipped} ${ctx} records skipped — ${fkColumn} unresolved`)
  }
  return out
}

// ─── Batch insert ─────────────────────────────────────────────────────────────

type SFResult = { id?: string; success: boolean; errors: Array<{ message: string }> }

async function batchInsert(
  conn: jsforce.Connection,
  sobject: string,
  records: Record<string, string>[],
  step: string,
  idMap?: Map<string, string>  // ExternalId → SF Id, populated if provided
): Promise<void> {
  const label = sobject.padEnd(12)

  if (records.length === 0) {
    console.log(`${step} ${label}  skipped (no records or CSV missing)`)
    return
  }

  // Collect ExternalId values before stripping (needed to build idMap)
  const extIds = records.map(r => r['ExternalId'] ?? '')

  // Strip ExternalId and any leftover *_ExternalId__c columns before sending to SF
  const cleaned = records.map(r => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k === 'ExternalId' || k.endsWith('_ExternalId__c')) continue
      if (v !== '') out[k] = v
    }
    return out
  })

  const CHUNK = 200
  let inserted = 0
  let failed   = 0
  let firstErr = ''

  for (let offset = 0; offset < cleaned.length; offset += CHUNK) {
    const chunk    = cleaned.slice(offset, offset + CHUNK)
    const chunkIds = extIds.slice(offset, offset + CHUNK)

    try {
      // jsforce v3: sobject.create(array) → RecordResult[]
      const raw = await (conn.sobject(sobject) as unknown as {
        create(r: unknown[]): Promise<SFResult | SFResult[]>
      }).create(chunk)

      const results: SFResult[] = Array.isArray(raw) ? raw : [raw]

      results.forEach((r, i) => {
        if (r.success && r.id) {
          inserted++
          if (idMap && chunkIds[i]) idMap.set(chunkIds[i]!, r.id)
        } else {
          failed++
          if (!firstErr && r.errors?.[0]) firstErr = r.errors[0].message
        }
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!firstErr) firstErr = msg
      failed += chunk.length
    }
  }

  const total   = records.length
  const failMsg = failed > 0 ? `   (${failed} failed${firstErr ? ` — ${firstErr.slice(0, 60)}` : ''})` : ''
  console.log(`${step} ${label}  ✓ ${inserted.toLocaleString()} / ${total.toLocaleString()} inserted${failMsg}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const root = process.cwd()
  const scenarioDir = scenario === 'a'
    ? path.join(root, 'data', 'demo', 'scenario-a-novastar')
    : path.join(root, 'data', 'demo', 'scenario-b-precisiontech')

  const scenarioName = scenario === 'a' ? 'NovaStar Insurance Group' : 'PrecisionTech Manufacturing'
  const useCase      = scenario === 'a' ? 'service' : 'sales'
  const csvDir       = path.join(scenarioDir, 'csv')

  if (!fs.existsSync(csvDir)) {
    console.error(`CSV directory not found: ${csvDir}`)
    console.error('Run `npm run generate-demo` to generate CSV files first.')
    process.exit(1)
  }

  const orgs = listConnectedOrgs()
  if (orgs.length === 0 && !orgIdFlag) {
    console.error('No connected orgs. Open http://localhost:3000/auth/start to authenticate.')
    process.exit(1)
  }

  const orgId = orgIdFlag ?? orgs[0]!
  const conn  = getConnection(orgId)

  try {
    const info = await conn.identity()
    console.log(`\nLoading demo data — Scenario ${scenario.toUpperCase()}: ${scenarioName}`)
    console.log(`Target org: ${orgId}`)
    console.log(`Logged in as: ${info.username}\n`)
  } catch (err: unknown) {
    console.error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`)
    console.error('Re-authenticate at http://localhost:3000/auth/start')
    process.exit(1)
  }

  // ─── ID maps (ExternalId → Salesforce record ID) ──────────────────────────
  const accMap = new Map<string, string>()
  const conMap = new Map<string, string>()

  const t0 = Date.now()

  const csv = (name: string) => parseCSV(path.join(csvDir, name))

  if (scenario === 'a') {
    // ── NovaStar: Account → Contact → Lead → Opp → Case → Task ──────────────

    await batchInsert(conn, 'Account',     csv('accounts.csv'),     '[1/6]', accMap)

    const contacts = resolveFK(csv('contacts.csv'), 'Account_ExternalId__c', 'AccountId', accMap, 'Contact')
    await batchInsert(conn, 'Contact',     contacts,                '[2/6]', conMap)

    await batchInsert(conn, 'Lead',        csv('leads.csv'),        '[3/6]')

    const opps = resolveFK(csv('opportunities.csv'), 'Account_ExternalId__c', 'AccountId', accMap, 'Opportunity')
    await batchInsert(conn, 'Opportunity', opps,                    '[4/6]')

    const casesAcc = resolveFK(csv('cases.csv'),   'Account_ExternalId__c', 'AccountId', accMap, 'Case(Account)')
    const cases    = resolveFK(casesAcc,            'Contact_ExternalId__c', 'ContactId', conMap, 'Case(Contact)')
    await batchInsert(conn, 'Case',        cases,                   '[5/6]')

    await batchInsert(conn, 'Task',        csv('tasks.csv'),        '[6/6]')

    // EmailMessage skipped — REST insert requires active CaseId and email thread context

  } else {
    // ── PrecisionTech: Account → Contact → Lead → Product2 → Opp → Quote → Contract → Case → Task ──

    await batchInsert(conn, 'Account',     csv('accounts.csv'),     '[1/9]', accMap)

    const contacts = resolveFK(csv('contacts.csv'), 'Account_ExternalId__c', 'AccountId', accMap, 'Contact')
    await batchInsert(conn, 'Contact',     contacts,                '[2/9]', conMap)

    await batchInsert(conn, 'Lead',        csv('leads.csv'),        '[3/9]')

    await batchInsert(conn, 'Product2',    csv('products.csv'),     '[4/9]')

    const opps = resolveFK(csv('opportunities.csv'), 'Account_ExternalId__c', 'AccountId', accMap, 'Opportunity')
    await batchInsert(conn, 'Opportunity', opps,                    '[5/9]')

    const quotes = resolveFK(csv('quotes.csv'), 'Account_ExternalId__c', 'AccountId', accMap, 'Quote')
    await batchInsert(conn, 'Quote',       quotes,                  '[6/9]')

    const contracts = resolveFK(csv('contracts.csv'), 'Account_ExternalId__c', 'AccountId', accMap, 'Contract')
    await batchInsert(conn, 'Contract',    contracts,               '[7/9]')

    const casesAcc = resolveFK(csv('cases.csv'),   'Account_ExternalId__c', 'AccountId', accMap, 'Case(Account)')
    const cases    = resolveFK(casesAcc,            'Contact_ExternalId__c', 'ContactId', conMap, 'Case(Contact)')
    await batchInsert(conn, 'Case',        cases,                   '[8/9]')

    await batchInsert(conn, 'Task',        csv('tasks.csv'),        '[9/9]')
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\nDemo data loaded in ${elapsed}s.`)

  if (skipScan) {
    console.log('Skipping scan (--skip-scan). Done.')
    return
  }

  console.log(`\nStarting OrgPulse scan — org: ${orgId}, use-case: ${useCase}...\n`)

  const result = spawnSync(
    'npm', ['run', 'scan', '--', '--org', orgId, '--use-case', useCase],
    { stdio: 'inherit', shell: true, cwd: root }
  )

  process.exit(result.status ?? 0)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
