import 'dotenv/config'
import express from 'express'
import * as jsforce from 'jsforce'
import * as fs from 'fs'
import * as path from 'path'
import { oauth2 } from './oauth'
import { supabase } from '../db/supabase'

const app = express()
const PORT = process.env.PORT ?? 3000

// Pilot token store — persisted to .tokens.json so test-conn runs in a separate process
const TOKENS_FILE = path.resolve(process.cwd(), '.tokens.json')

export interface StoredTokens {
  accessToken:  string
  refreshToken: string
  instanceUrl:  string
  orgId:        string
}

function loadTokenStore(): Record<string, StoredTokens> {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveTokenStore(store: Record<string, StoredTokens>): void {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2))
}

// GET /auth/start — redirect browser to Salesforce login
app.get('/auth/start', (_req, res) => {
  const url = oauth2.getAuthorizationUrl({ scope: 'api refresh_token offline_access' })
  res.redirect(url)
})

// GET /auth/callback — exchange code for tokens, upsert org record
app.get('/auth/callback', async (req, res) => {
  const code = req.query['code']
  if (typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' })
    return
  }

  try {
    const conn = new jsforce.Connection({ oauth2, version: '59.0' })
    const userInfo = await conn.authorize(code)
    const orgId = userInfo.organizationId

    // Persist tokens to disk — pilot only, replace with Vault before multi-client use
    const store = loadTokenStore()
    store[orgId] = {
      accessToken:  conn.accessToken!,
      refreshToken: conn.refreshToken!,
      instanceUrl:  conn.instanceUrl!,
      orgId,
    }
    saveTokenStore(store)

    // Upsert org record — no token values stored in DB
    await supabase.from('connected_orgs').upsert(
      { salesforce_org_id: orgId, instance_url: conn.instanceUrl, status: 'connected' },
      { onConflict: 'salesforce_org_id' }
    )

    console.log(`✅ Connected org: ${orgId}`)
    res.json({ status: 'connected', orgId })
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).json({ error: 'OAuth exchange failed', detail: String(err) })
  }
})

// GET /health — for UptimeRobot / load balancer probes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`   Auth start: http://localhost:${PORT}/auth/start`)
})
