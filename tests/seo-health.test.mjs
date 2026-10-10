import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audit, inspectArticle, sitemapUrls } from '../scripts/seo-health.mjs';

const base = 'https://ayn.careers';
const articleUrl = `${base}/insights/example`;
const articleHtml = `<!doctype html><html><head><link rel="canonical" href="${articleUrl}"><meta name="description" content="Real hiring data"><script type="application/ld+json">{"@type":"Article","headline":"Example","datePublished":"2026-10-02"}</script></head><body><article><h1>Example</h1><p>${'Useful evidence. '.repeat(230)}</p></article></body></html>`;

test('extracts sitemap URLs and flags a thin article', () => {
  assert.deepEqual(sitemapUrls(`<urlset><url><loc>${articleUrl}</loc></url></urlset>`), [articleUrl]);
  assert.deepEqual(inspectArticle(articleHtml, articleUrl), []);
  assert.deepEqual(inspectArticle(articleHtml.replace('Useful evidence. '.repeat(230), 'Concise catalog evidence. '.repeat(40)), articleUrl), []);
  assert.ok(inspectArticle(articleHtml.replace('Useful evidence. '.repeat(230), 'Thin.'), articleUrl).some((issue) => issue.code === 'thin_article'));
});

test('audits a healthy site and rejects external sitemap URLs without fetching them', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    const path = new URL(url).pathname;
    const body = path === '/robots.txt'
      ? ['/sitemap.xml', '/sitemap-jobs.xml', '/sitemap-insights.xml'].map((part) => `Sitemap: ${base}${part}`).join('\n')
      : path === '/sitemap-insights.xml'
        ? `<urlset><url><loc>${articleUrl}</loc></url><url><loc>https://evil.example/x</loc></url></urlset>`
        : path.startsWith('/sitemap-') || path === '/sitemap.xml' ? '<urlset></urlset>' : articleHtml;
    return { ok: true, status: 200, text: async () => body };
  };
  const result = await audit(fakeFetch);
  assert.ok(result.issues.some((issue) => issue.code === 'sitemap_external_url'));
  assert.ok(result.issues.some((issue) => issue.code === 'jobs_sitemap_empty'));
  assert.equal(result.articlesChecked, 1);
  assert.ok(!calls.some((url) => url.includes('evil.example')));
});
