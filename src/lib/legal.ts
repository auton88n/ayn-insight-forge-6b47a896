// v3.30.0 — one place for the legal document versions. The Terms page, the
// Privacy page, the signup consent record and the admin account detail view
// all read from here, so a version can never drift between what a person was
// shown and what we stored.
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config';

export const LEGAL = {
  termsVersion: '1.0',
  privacyVersion: '1.0',
  effectiveDate: '1 August 2026',
} as const;

/**
 * Record what this person agreed to: the Terms version, the Privacy Policy
 * version, the timestamp and the IP address. The IP is read server side in
 * resume-hub, because the browser cannot know it. Best effort, never blocks
 * the signup it belongs to.
 *
 * Rows are append only, so a future materially changed version can simply be
 * recorded again and an unaccepted version is visible as a missing row.
 */
export async function recordLegalConsent(source: 'signup' | 'reaccept' = 'signup'): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/resume-hub`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'legal_consent_record',
        terms_version: LEGAL.termsVersion,
        privacy_version: LEGAL.privacyVersion,
        source,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
