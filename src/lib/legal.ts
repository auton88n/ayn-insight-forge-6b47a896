// v3.33.0 — one source of version truth, and it is the markdown itself.
//
// Each legal document carries its version and effective date at the top of
// src/content/legal/<slug>.md. This module reads them from there, so the
// version shown next to the signup checkbox and the version stored against the
// account can never drift from the document the person was actually shown.
//
// The consent row itself is written server side, inside the same transaction
// as the account, by the handle_new_user trigger. It reads terms_version,
// privacy_version and legal_accepted out of the signup metadata that
// AuthModal supplies. If that insert fails, the signup fails, which is the
// point: no account may exist without a record of what it agreed to.
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config';
import { rawMarkdown, parseDocMeta } from '@/lib/legalDocs';

function docMeta(slug: string) {
  const raw = rawMarkdown(slug);
  return raw ? parseDocMeta(raw) : null;
}

const terms = docMeta('terms');
const privacy = docMeta('privacy');

export const LEGAL = {
  termsVersion: terms?.version ?? null,
  privacyVersion: privacy?.version ?? null,
  /** The effective date of the Terms, which is what the checkbox names. */
  effectiveDate: terms?.effective ?? terms?.updated ?? null,
} as const;

/**
 * The metadata the signup call carries so the trigger can record consent.
 * Returns null when a document states no version, in which case the signup
 * must not proceed: we would have nothing honest to store.
 */
export function consentSignupMetadata(): {
  terms_version: string;
  privacy_version: string;
  legal_accepted: true;
  consent_user_agent: string;
} | null {
  if (!LEGAL.termsVersion || !LEGAL.privacyVersion) return null;
  return {
    terms_version: LEGAL.termsVersion,
    privacy_version: LEGAL.privacyVersion,
    legal_accepted: true,
    consent_user_agent: navigator.userAgent.slice(0, 500),
  };
}

/**
 * Attaches the IP address to the consent row written at signup. Only the
 * server can see the IP, and the browser has no session until the account is
 * confirmed, so this runs on the first authenticated call rather than during
 * signup. The record already exists either way; this only completes it.
 */
export async function attachConsentIp(source: 'signup' | 'reaccept' = 'signup'): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !LEGAL.termsVersion || !LEGAL.privacyVersion) return false;
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
