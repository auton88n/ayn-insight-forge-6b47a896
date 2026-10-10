// Read-only SEO/AEO smoke monitor. No Search Console credentials or content writes.
// Run daily in CI and locally with `npm run seo:health`.
const BASE = 'https://ayn.careers';
const SITEMAPS = ['/sitemap.xml', '/sitemap-jobs.xml', '/sitemap-insights.xml'];

export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim().replaceAll('&amp;', '&'));
}

export function inspectArticle(html, url) {
  const issues = [];
  const canonical = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
    ?? html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1];
  if (canonical !== url) issues.push({ severity: 'critical', code: 'canonical', url, detail: canonical || 'missing' });
  if (!/<meta\s+[^>]*name=["']description["'][^>]*content=["'][^"']+/i.test(html)) {
    issues.push({ severity: 'warning', code: 'description', url });
  }
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (!article) {
    issues.push({ severity: 'critical', code: 'article_html_missing', url });
    return issues;
  }
  if (!/<h1\b[^>]*>[^<]+<\/h1>/i.test(article)) issues.push({ severity: 'warning', code: 'h1_missing', url });
  const words = article.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').split(/\s+/).filter(Boolean).length;
  // Detect near-empty bodies, not enforce artificial 450-word SEO padding.
  // This warning is a review prompt, not a Google ranking/quality verdict.
  if (words < 80) issues.push({ severity: 'warning', code: 'thin_article', url, detail: `${words} visible words; review for missing report content` });
  const scripts = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/gi)];
  const schemas = [];
  for (const script of scripts) {
    try { schemas.push(JSON.parse(script[1])); }
    catch { issues.push({ severity: 'warning', code: 'invalid_json_ld', url }); }
  }
  if (!schemas.some((schema) => schema['@type'] === 'Article' && schema.headline && schema.datePublished)) {
    issues.push({ severity: 'warning', code: 'article_schema_missing', url });
  }
  return issues;
}

function sameOriginUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === BASE && !url.username && !url.password;
  } catch { return false; }
}

async function get(path, fetchImpl) {
  const response = await fetchImpl(new URL(path, BASE), {
    headers: { 'User-Agent': 'AYN-SEO-Health/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await response.text() };
}

export async function audit(fetchImpl = fetch) {
  const issues = [];
  const summary = { checkedAt: new Date().toISOString(), sitemaps: {}, articlesChecked: 0, issues };
  let robots = '';
  try {
    const result = await get('/robots.txt', fetchImpl);
    if (!result.response.ok) issues.push({ severity: 'critical', code: 'robots_http', detail: String(result.response.status) });
    robots = result.body;
  } catch (error) { issues.push({ severity: 'critical', code: 'robots_unreachable', detail: String(error) }); }
  const allArticleUrls = [];
  for (const sitemap of SITEMAPS) {
    if (!robots.includes(`Sitemap: ${BASE}${sitemap}`)) issues.push({ severity: 'warning', code: 'sitemap_not_in_robots', url: sitemap });
    try {
      const { response, body } = await get(sitemap, fetchImpl);
      if (!response.ok || !/<urlset\b/.test(body)) {
        issues.push({ severity: 'critical', code: 'sitemap_invalid', url: sitemap, detail: String(response.status) });
        continue;
      }
      const urls = sitemapUrls(body);
      summary.sitemaps[sitemap] = urls.length;
      if (!urls.every(sameOriginUrl)) issues.push({ severity: 'critical', code: 'sitemap_external_url', url: sitemap });
      if (sitemap === '/sitemap-jobs.xml' && urls.length === 0) issues.push({ severity: 'critical', code: 'jobs_sitemap_empty', url: sitemap });
      if (sitemap === '/sitemap-insights.xml') allArticleUrls.push(...urls.filter(sameOriginUrl));
      if (sitemap === '/sitemap-insights.xml' && urls.length === 0) issues.push({ severity: 'warning', code: 'no_articles_in_sitemap', url: sitemap });
    } catch (error) { issues.push({ severity: 'critical', code: 'sitemap_unreachable', url: sitemap, detail: String(error) }); }
  }
  // Bound traffic and avoid storing article bodies or any visitor information.
  for (const url of allArticleUrls.slice(0, 10)) {
    try {
      const { response, body } = await get(url, fetchImpl);
      summary.articlesChecked++;
      if (!response.ok) issues.push({ severity: 'critical', code: 'article_http', url, detail: String(response.status) });
      else issues.push(...inspectArticle(body, url));
    } catch (error) { issues.push({ severity: 'critical', code: 'article_unreachable', url, detail: String(error) }); }
  }
  return summary;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = await audit();
  console.log(JSON.stringify(result, null, 2));
  if (result.issues.some((issue) => issue.severity === 'critical')) process.exitCode = 1;
}
