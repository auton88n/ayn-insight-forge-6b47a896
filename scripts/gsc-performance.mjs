// Optional private Search Console measurement. Uses a property-scoped service
// account; never publishes credentials, search queries, or user-level data.
import { createSign } from 'node:crypto';

export const SITE_URL = 'https://ayn.careers/';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const ANALYTICS_URL = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;

function base64url(value) { return Buffer.from(value).toString('base64url'); }

export function serviceAccountAssertion(account, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (account.type !== 'service_account' || typeof account.client_email !== 'string' || typeof account.private_key !== 'string') {
    throw new Error('Invalid Search Console service-account credential');
  }
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(account.private_key).toString('base64url')}`;
}

export function periods(today = new Date()) {
  const date = (offset) => {
    const copy = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    copy.setUTCDate(copy.getUTCDate() - offset);
    return copy.toISOString().slice(0, 10);
  };
  return [
    { startDate: date(30), endDate: date(3) },
    { startDate: date(58), endDate: date(31) },
  ];
}

export function comparePages(currentRows, previousRows) {
  const previous = new Map(previousRows.map((row) => [row.keys?.[0], row]));
  return currentRows
    .filter((row) => typeof row.keys?.[0] === 'string' && row.keys[0].startsWith(SITE_URL))
    .map((row) => {
      const page = row.keys[0];
      const old = previous.get(page);
      const impressions = Number(row.impressions || 0);
      const previousImpressions = Number(old?.impressions || 0);
      return {
        page,
        clicks: Number(row.clicks || 0),
        impressions,
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0),
        previousClicks: Number(old?.clicks || 0),
        previousImpressions,
        impressionChange: impressions - previousImpressions,
        // Prioritize pages with actual demand, rather than publishing yet
        // another article because a topic happens to exist in the catalog.
        action: previousImpressions >= 50 && impressions < previousImpressions * 0.7
          ? 'investigate_decline'
          : impressions >= 50 && Number(row.position) <= 15 && Number(row.ctr) < 0.02
            ? 'review_title_and_intent'
            : 'monitor',
      };
    })
    .sort((a, b) => (a.action === 'monitor') - (b.action === 'monitor') || b.impressions - a.impressions)
    .slice(0, 30);
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Google API returned HTTP ${response.status}`);
  return response.json();
}

export async function gscPerformance(account, fetchImpl = fetch, today = new Date()) {
  const assertion = serviceAccountAssertion(account);
  const token = await requestJson(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (typeof token.access_token !== 'string') throw new Error('Google token response missing access token');
  const windows = periods(today);
  const rows = [];
  for (const window of windows) {
    const data = await requestJson(fetchImpl, ANALYTICS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...window, dimensions: ['page'], type: 'web', dataState: 'final', rowLimit: 2000 }),
    });
    rows.push(data.rows || []);
  }
  return { property: SITE_URL, current: windows[0], previous: windows[1], pages: comparePages(rows[0], rows[1]) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.log(JSON.stringify({ configured: false, reason: 'GSC_SERVICE_ACCOUNT_JSON is not configured' }));
    process.exit(0);
  }
  // Never log the source credential or the Google access token.
  console.log(JSON.stringify(await gscPerformance(JSON.parse(raw)), null, 2));
}
