#!/usr/bin/env python3
"""Independent Google collectors. Private SQL on stdout; sanitized errors on stderr.
Use pipefail and psql ON_ERROR_STOP. Exit 1 on partial failure, retaining good data.
"""
import datetime
import json
import os
import secrets
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

SITE = 'https://ayn.careers/'


class CollectionError(Exception):
    pass


def request_json(url, body=None, token=None, timeout=30):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                result = json.load(response)
            if not isinstance(result, dict) or 'error' in result:
                raise CollectionError('invalid_api_response')
            return result
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            if code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise CollectionError('http_' + str(code)) from None
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise CollectionError('network_timeout_or_unavailable') from None
        except (ValueError, TypeError):
            raise CollectionError('invalid_api_response') from None
        time.sleep(2 ** attempt)


def google_token():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    filename = os.path.expanduser(os.environ.get('SEO_MCP_GOOGLE_TOKEN', '~/.config/seo-monster/token.json'))
    creds = Credentials.from_authorized_user_file(filename)
    if not creds.valid:
        creds.refresh(Request())
        fd, temporary = tempfile.mkstemp(dir=os.path.dirname(filename))
        try:
            with os.fdopen(fd, 'w') as output:
                output.write(creds.to_json())
            os.replace(temporary, filename)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return creds.token


def collect_gsc(call):
    end = datetime.date.today() - datetime.timedelta(days=3)
    start = end - datetime.timedelta(days=27)
    base = 'https://www.googleapis.com/webmasters/v3/sites/' + urllib.parse.quote(SITE, safe='')
    query = {'startDate': str(start), 'endDate': str(end), 'dataState': 'final'}
    def rows(dimension):
        result = call(base + '/searchAnalytics/query', {**query, 'dimensions': [dimension], 'rowLimit': 10})
        return [{'key': r['keys'][0], 'clicks': r['clicks'], 'impressions': r['impressions'], 'position': round(r['position'], 1)} for r in result.get('rows', [])]
    total = call(base + '/searchAnalytics/query', query)
    row = (total.get('rows') or [{}])[0]
    maps = call(base + '/sitemaps').get('sitemap', [])
    indexing = []
    for route in ['', 'jobs', 'salary-guide', 'insights', 'pricing', 'check-resume']:
        result = call('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {'inspectionUrl': SITE + route, 'siteUrl': SITE})
        status = result['inspectionResult']['indexStatusResult']
        indexing.append({'url': SITE + route, 'verdict': status.get('verdict', 'UNKNOWN'), 'coverage': status.get('coverageState', 'Unknown'), 'last_crawl': status.get('lastCrawlTime')})
    return {
        'range_days': 28, 'start': str(start), 'end': str(end),
        'clicks': row.get('clicks', 0), 'impressions': row.get('impressions', 0),
        'ctr': round(row.get('ctr', 0) * 100, 2), 'position': round(row.get('position', 0), 1),
        'queries': rows('query'), 'pages': rows('page'), 'indexing': indexing,
        'sitemaps': [{'path': m['path'], 'submitted': sum(int(c.get('submitted', 0)) for c in m.get('contents', [])), 'errors': int(m.get('errors', 0)), 'warnings': int(m.get('warnings', 0)), 'last_downloaded': m.get('lastDownloaded')} for m in maps],
    }


def collect_psi(key, call=request_json):
    pages = []
    for route in ['', 'jobs', 'insights']:
        url = SITE + route
        result = call('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' + urllib.parse.urlencode({'url': url, 'strategy': 'mobile', 'category': 'performance', 'key': key}), timeout=60)
        lighthouse = result['lighthouseResult']
        audits = lighthouse['audits']
        pages.append({'url': url, 'score': round(lighthouse['categories']['performance']['score'] * 100), **{short: audits[name]['displayValue'] for short, name in [('fcp', 'first-contentful-paint'), ('lcp', 'largest-contentful-paint'), ('tbt', 'total-blocking-time'), ('cls', 'cumulative-layout-shift')]}})
    return {'strategy': 'mobile', 'pages': pages}


def insert_sql(source, payload, status='ok', error=None):
    if source not in ('search_console', 'pagespeed') or status not in ('ok', 'error'):
        raise ValueError('invalid snapshot type')
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    data = dict(payload, collection_status=status, attempted_at=now, collection_error=error)
    if status == 'ok':
        data['collected_at'] = now
    tag = 'j' + secrets.token_hex(12)
    body = json.dumps(data, allow_nan=False)
    if '$' + tag + '$' in body:
        raise ValueError('SQL quote collision')
    literal = '$' + tag + '$' + body + '$' + tag + '$::jsonb'
    if status != 'ok':
        literal = "coalesce((select data || jsonb_build_object('collected_at', coalesce(data->>'collected_at', case when data->>'collection_status' is distinct from 'error' then taken_at::text end)) from public.seo_snapshots where source = '%s' order by taken_at desc limit 1), '{}'::jsonb) || " % source + literal
    return "insert into public.seo_snapshots (source, data) values ('%s', %s);" % (source, literal)


def emit_source(source, collect, emit=print):
    try:
        payload = collect()
        sql = insert_sql(source, payload)
    except Exception as error:
        reason = str(error) if isinstance(error, CollectionError) else type(error).__name__
        emit(insert_sql(source, {}, 'error', reason), flush=True)
        print(source + ': collection failed (' + reason + ')', file=sys.stderr)
        return False
    emit(sql, flush=True)
    return True


def main():
    def gsc():
        token = google_token()
        return collect_gsc(lambda url, body=None: request_json(url, body, token))
    ok = emit_source('search_console', gsc)
    def psi():
        key = os.environ.get('PSI_API_KEY')
        if not key and os.environ.get('SEO_PSI_KEY_FILE'):
            with open(os.environ['SEO_PSI_KEY_FILE']) as source:
                key = source.read().strip()
        if not key:
            raise CollectionError('pagespeed_key_not_configured')
        return collect_psi(key)
    ok = emit_source('pagespeed', psi) and ok
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
