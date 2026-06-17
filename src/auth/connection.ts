import 'dotenv/config'
import * as jsforce from 'jsforce'
import * as fs from 'fs'
import * as path from 'path'
import { oauth2 } from './oauth'
import type { StoredTokens } from './server'

const TOKENS_FILE = path.resolve(process.cwd(), '.tokens.json')

function loadTokenStore(): Record<string, StoredTokens> {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'))
  } catch {
    throw new Error(
      `No tokens found. Complete OAuth first: open http://localhost:3000/auth/start in your browser.`
    )
  }
}

export function getConnection(orgId?: string): jsforce.Connection {
  const store = loadTokenStore()
  const ids = Object.keys(store)

  if (ids.length === 0) {
    throw new Error('No connected orgs. Complete OAuth first.')
  }

  const id = orgId ?? ids[0]!
  const tokens = store[id]

  if (!tokens) {
    throw new Error(`Org ${id} not found in token store. Re-authorise at /auth/start.`)
  }

  return new jsforce.Connection({
    oauth2,
    instanceUrl:  tokens.instanceUrl,
    accessToken:  tokens.accessToken,
    refreshToken: tokens.refreshToken,
    version:      '59.0',
  })
}

// Returns all connected org IDs from the local token store
export function listConnectedOrgs(): string[] {
  try {
    const store = loadTokenStore()
    return Object.keys(store)
  } catch {
    return []
  }
}
