import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { test } from 'node:test';
import { comparePages, periods, serviceAccountAssertion, gscPerformance } from '../scripts/gsc-performance.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = { type: 'service_account', client_email: 'reader@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

test('service account assertion is signed and read-only', () => {
  const jwt = serviceAccountAssertion(account, 1000);
  const [header, payload, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString()).scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${payload}`);
  assert.ok(verify.verify(publicKey, Buffer.from(signature, 'base64url')));
});

test('compares equal 28-day finalized windows and prioritizes measured decline', () => {
  assert.deepEqual(periods(new Date('2026-10-02T12:00:00Z')), [
    { startDate: '2026-09-02', endDate: '2026-09-29' },
    { startDate: '2026-08-05', endDate: '2026-09-01' },
  ]);
  const pages = comparePages([{ keys: ['https://ayn.careers/insights/a'], impressions: 40, clicks: 1, ctr: 0.025, position: 11 }], [{ keys: ['https://ayn.careers/insights/a'], impressions: 100, clicks: 5 }]);
  assert.equal(pages[0].action, 'investigate_decline');
});

test('fetches only page-level Search Console performance', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, json: async () => String(url).includes('oauth2') ? { access_token: 'test-token' } : { rows: [] } };
  };
  const report = await gscPerformance(account, fetchImpl, new Date('2026-10-02'));
  assert.equal(report.pages.length, 0);
  assert.equal(calls.length, 3);
  assert.ok(calls[1].url.includes('https%3A%2F%2Fayn.careers%2F'));
  assert.deepEqual(JSON.parse(calls[1].opts.body).dimensions, ['page']);
});
