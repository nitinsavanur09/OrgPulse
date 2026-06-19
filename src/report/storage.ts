import { supabase } from '../db/supabase'

const BUCKET = 'reports'
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 90  // 90 days in seconds

export interface UploadResult {
  signedUrl: string
  filename:  string
}

export async function uploadReport(orgId: string, html: string): Promise<UploadResult> {
  const filename = `${orgId}-${Date.now()}.html`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, html, { contentType: 'text/html', upsert: false })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filename, SIGNED_URL_EXPIRY)

  if (urlError || !urlData?.signedUrl) {
    throw new Error(`Signed URL creation failed: ${urlError?.message ?? 'no URL returned'}`)
  }

  return { signedUrl: urlData.signedUrl, filename }
}
