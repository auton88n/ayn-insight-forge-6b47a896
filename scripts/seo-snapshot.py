#!/usr/bin/env python3
"""Collect a Search Console and a PageSpeed reading and print SQL that stores
them in public.seo_snapshots (shown in Admin > SEO).

Needs the SEOMonster Google token on this machine:
  SEO_MCP_GOOGLE_TOKEN (default ~/.config/seo-monster/token.json)
  PSI_API_KEY          (optional, enables the PageSpeed reading)

Run with SEOMonster's own Python so google-auth is available:
  uv tool run --no-build --python 3.12 --from seo-monster python scripts/seo-snapshot.py \
    | ssh root@2.25.109.213 "docker exec -i supabase-db psql -U postgres -d postgres"
"""
import json, os, sys, datetime, urllib.request, urllib.parse
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

SITE = 'https://ayn.careers/'
tok = os.path.expanduser(os.environ.get('SEO_MCP_GOOGLE_TOKEN', '~/.config/seo-monster/token.json'))
creds = Credentials.from_authorized_user_info(json.load(open(tok)))
creds.refresh(Request())

def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + creds.token, 'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=90))
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'detail': e.read().decode()[:200]}

end = datetime.date.today() - datetime.timedelta(days=2)
start = end - datetime.timedelta(days=27)
sa = 'https://www.googleapis.com/webmasters/v3/sites/%s/searchAnalytics/query' % urllib.parse.quote(SITE, safe='')
def q(dim, n):
    r = call(sa, {'startDate': str(start), 'endDate': str(end), 'dimensions': [dim], 'rowLimit': n})
    return [{'key': x['keys'][0], 'clicks': x['clicks'], 'impressions': x['impressions'], 'position': round(x['position'], 1)} for x in r.get('rows', [])]
tot = call(sa, {'startDate': str(start), 'endDate': str(end)})
row = (tot.get('rows') or [{}])[0]
sitemaps = call('https://www.googleapis.com/webmasters/v3/sites/%s/sitemaps' % urllib.parse.quote(SITE, safe='')).get('sitemap', [])
inspect_urls = [SITE, SITE + 'jobs', SITE + 'salary-guide', SITE + 'insights', SITE + 'insights/hiring-ml-ai', SITE + 'pricing', SITE + 'check-resume']
indexing = []
for u in inspect_urls:
    r = call('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {'inspectionUrl': u, 'siteUrl': SITE})
    s = r.get('inspectionResult', {}).get('indexStatusResult', {})
    indexing.append({'url': u, 'verdict': s.get('verdict', 'UNKNOWN'), 'coverage': s.get('coverageState', r.get('detail', 'unknown')), 'last_crawl': s.get('lastCrawlTime')})
gsc = {
    'range_days': 28, 'start': str(start), 'end': str(end),
    'clicks': row.get('clicks', 0), 'impressions': row.get('impressions', 0),
    'ctr': round(row.get('ctr', 0) * 100, 2), 'position': round(row.get('position', 0), 1),
    'queries': q('query', 10), 'pages': q('page', 10),
    'sitemaps': [{'path': m['path'], 'submitted': sum(int(c.get('submitted', 0)) for c in m.get('contents', [])),
                  'errors': int(m.get('errors', 0)), 'warnings': int(m.get('warnings', 0)), 'last_downloaded': m.get('lastDownloaded')} for m in sitemaps],
    'indexing': indexing,
}
out = ["insert into public.seo_snapshots (source, data) values ('search_console', $j$%s$j$::jsonb);" % json.dumps(gsc)]

key = os.environ.get('PSI_API_KEY')
if not key:
    cfg = json.load(open(os.path.expanduser('~/.claude.json')))
    key = cfg.get('mcpServers', {}).get('seomonster', {}).get('env', {}).get('PSI_API_KEY')
if key:
    pages = []
    for path in ['', 'jobs', 'insights']:
        u = SITE + path
        r = json.load(urllib.request.urlopen(
            'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' + urllib.parse.urlencode(
                {'url': u, 'strategy': 'mobile', 'category': 'performance', 'key': key}), timeout=120))
        lh = r['lighthouseResult']; a = lh['audits']
        pages.append({'url': u, 'score': round(lh['categories']['performance']['score'] * 100),
                      'fcp': a['first-contentful-paint']['displayValue'], 'lcp': a['largest-contentful-paint']['displayValue'],
                      'tbt': a['total-blocking-time']['displayValue'], 'cls': a['cumulative-layout-shift']['displayValue']})
    out.append("insert into public.seo_snapshots (source, data) values ('pagespeed', $j$%s$j$::jsonb);" % json.dumps({'strategy': 'mobile', 'pages': pages}))
print('\n'.join(out))
