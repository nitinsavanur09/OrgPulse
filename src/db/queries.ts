import { supabase } from './supabase'
import type { ScoredResult } from '../scoring/rubric'
import type { Finding } from '../scoring/findings-builder'

export async function saveResults(
  salesforceOrgId: string,
  scores: ScoredResult,
  findings: Finding[],
  signedUrl: string
): Promise<void> {
  try {
    // Ensure the org row exists (OAuth callback creates it, but guard for edge cases)
    await supabase
      .from('connected_orgs')
      .upsert(
        { salesforce_org_id: salesforceOrgId },
        { onConflict: 'salesforce_org_id', ignoreDuplicates: true }
      )
  } catch (err) {
    console.error('[db] Failed to upsert connected_orgs:', err instanceof Error ? err.message : err)
  }

  let orgUuid: string | null = null
  try {
    const { data: org, error } = await supabase
      .from('connected_orgs')
      .select('id')
      .eq('salesforce_org_id', salesforceOrgId)
      .single()
    if (error || !org) throw error ?? new Error('org row not found')
    orgUuid = org.id as string
  } catch (err) {
    console.error('[db] Could not resolve org UUID — skipping DB save:', err instanceof Error ? err.message : err)
    return
  }

  let scanRunId: string | null = null
  try {
    const { data: run, error } = await supabase
      .from('scan_runs')
      .insert({
        org_id:             orgUuid,
        status:             'complete',
        ai_readiness_index: scores.overallIndex,
        has_hard_blocker:   scores.hardBlockers.length > 0,
        completed_at:       new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !run) throw error ?? new Error('insert scan_runs returned no row')
    scanRunId = run.id as string
  } catch (err) {
    console.error('[db] Failed to insert scan_runs:', err instanceof Error ? err.message : err)
    return
  }

  try {
    const { error } = await supabase.from('scan_domain_scores').insert(
      scores.domains.map(d => ({
        scan_run_id: scanRunId,
        domain:      d.domain,
        score:       d.score,
        is_blocker:  d.isBlocker,
      }))
    )
    if (error) throw error
  } catch (err) {
    console.error('[db] Failed to insert scan_domain_scores:', err instanceof Error ? err.message : err)
  }

  try {
    const { error } = await supabase.from('scan_findings').insert(
      findings.map(f => ({
        scan_run_id:  scanRunId,
        domain:       f.domain,
        severity:     f.severity,
        title:        f.title,
        description:  f.description,
        evidence:     f.evidence,
        effort_days:  f.effortDays,
        impact_score: f.impactScore,
      }))
    )
    if (error) throw error
  } catch (err) {
    console.error('[db] Failed to insert scan_findings:', err instanceof Error ? err.message : err)
  }

  console.log(`[db] Saved: scan_run ${scanRunId} — ${scores.domains.length} domains, ${findings.length} findings, index ${scores.overallIndex}`)
}
