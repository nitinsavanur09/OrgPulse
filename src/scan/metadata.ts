import type { Connection } from 'jsforce'
import type { MetadataSignal } from './types'

interface PackageRecord {
  Id: string
}

interface AggregateRecord {
  [key: string]: number | null
}

export async function scanMetadata(conn: Connection): Promise<MetadataSignal> {
  // Count unmanaged custom fields as a proxy for potential metadata debt
  // Phase 3 refinement: cross-reference against flow/layout/Apex usage
  let customFieldsRaw = await conn.tooling.query<AggregateRecord>(
    `SELECT COUNT() FROM CustomField WHERE ManageableState = 'unmanaged'`
  )
  const unusedFieldCount = customFieldsRaw.totalSize
  customFieldsRaw = null as any

  // Count installed packages — Phase 2 uses total count as candidate abandoned count
  // Deeper abandonment analysis (last-used date) added in Phase 3+
  let pkgRaw = await conn.tooling.query<PackageRecord>(
    `SELECT Id FROM InstalledSubscriberPackage`
  )
  const abandonedPackageCount = pkgRaw.totalSize
  pkgRaw = null as any

  return { unusedFieldCount, abandonedPackageCount }
}
