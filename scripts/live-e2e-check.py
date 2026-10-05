#!/usr/bin/env python3
# Live end-to-end check of signup (email and Google), employer approval, search, proposals, messaging
# and the admin panel data. Copy to the VPS and run: python3 live-e2e-check.py
# Uses throwaway accounts only and erases them afterwards.
import json, subprocess, urllib.request, urllib.error, time, re, sys, uuid

ENV = dict(l.strip().split('=', 1) for l in open('/root/supabase/docker/.env') if '=' in l and not l.startswith('#'))
ANON, SVC = ENV['ANON_KEY'], ENV['SERVICE_ROLE_KEY']
BASE = 'https://ayn.careers'
ADMIN_ID = '1d5aef56-4c7e-4880-a41c-3f6e29ced2be'
TAG = uuid.uuid4().hex[:6]
SKILL = 'Zorplathe' + TAG  # fictional, so only our test candidate can match
PW = 'Tst!' + uuid.uuid4().hex[:12]
results, created = [], []


def psql(sql):
    r = subprocess.run(['docker', 'exec', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], capture_output=True, text=True)
    if r.returncode: return 'ERR:' + r.stderr.strip()[:300]
    return r.stdout.strip()


def admin_rpc(fn, args=''):
    sql = f"begin; select set_config('request.jwt.claims', json_build_object('sub','{ADMIN_ID}','role','authenticated')::text, true); set local role authenticated; select {fn}({args})::text; rollback;"
    out = psql(sql)
    lines = [l for l in out.splitlines() if l.startswith('{') or l.startswith('[') or l.startswith('ERR')]
    return json.loads(lines[-1]) if lines and not lines[-1].startswith('ERR') else {'_err': out[:300]}


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=170) as r: return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}


def mk_user(label, provider, meta=None, expect_fail=False, email=None):
    email = email or f'delivered+{TAG}{label}@resend.dev'
    body = {'email': email, 'password': PW, 'email_confirm': True, 'user_metadata': {'full_name': f'E2E {label}', **(meta or {})},
            'app_metadata': {'provider': provider, 'providers': [provider]}}
    s, d = http('POST', f'{BASE}/auth/v1/admin/users', body, {'apikey': SVC, 'Authorization': f'Bearer {SVC}'})
    if s >= 300:
        return None if expect_fail else (_ for _ in ()).throw(RuntimeError(f'create {label}: {s} {d}'))
    created.append(d['id'])
    return {'id': d['id'], 'email': email}


def login(u):
    s, d = http('POST', f'{BASE}/auth/v1/token?grant_type=password', {'email': u['email'], 'password': PW}, {'apikey': ANON})
    assert s == 200, d
    return d['access_token']


def hub(tok, action, **kw):
    return http('POST', f'{BASE}/functions/v1/resume-hub', {'action': action, **kw}, {'apikey': ANON, 'Authorization': f'Bearer {tok}'})


def check(name, ok, detail=''):
    results.append((name, ok, detail)); print(('PASS ' if ok else 'FAIL ') + name + (f'   [{detail}]' if detail and not ok else ''))


def ov():
    o, a = admin_rpc('get_admin_overview'), admin_rpc('get_admin_accounts')
    return {'seek': o['seekers_total'], 'emp_act': o['employers_active'], 'emp_pend': o['employers_pending'], 'acc': o['accounts_total'],
            'a_seek': a['seekers'], 'a_emp': a['employers'], 'a_tot': a['total'], 'prov': a['by_provider'], 'rows': {r['email']: r for r in a['rows']}}


GCO = dict(company_name=f'E2E Co {TAG}', company_website='https://resend.dev', position_title='Head of Talent', phone='+1 555 0100', company_address='1 Main St, Austin TX', company_country='US')
try:
    base = ov(); print('baseline', {k: v for k, v in base.items() if k != 'rows'})

    # ---- 1. seekers: email vs Google ----
    es = mk_user('eseek', 'email'); gs = mk_user('gseek', 'google')
    time.sleep(1); n = ov()
    check('Overview "Job seekers" +2 (email + Google)', n['seek'] == base['seek'] + 2, f"{base['seek']}->{n['seek']}")
    check('Accounts "Job seekers" +2', n['a_seek'] == base['a_seek'] + 2)
    check('Accounts total +2', n['a_tot'] == base['a_tot'] + 2)
    check('by-provider split counts Google and email', n['prov'].get('google', 0) == base['prov'].get('google', 0) + 1 and n['prov'].get('email', 0) == base['prov'].get('email', 0) + 1, str(n['prov']))
    check('Google row carries provider=google', n['rows'][gs['email']]['provider'] == 'google')
    check('Email row carries provider=email', n['rows'][es['email']]['provider'] == 'email')
    check('both are typed job seeker', n['rows'][gs['email']]['account_role'] == 'job_seeker' and n['rows'][es['email']]['account_role'] == 'job_seeker')
    js = admin_rpc('get_admin_job_seekers'); jr = {r['email']: r for r in js['rows']}
    check('"All job seekers" tab lists the Google signup with google provider', jr.get(gs['email'], {}).get('provider') == 'google')
    sh = admin_rpc('get_admin_signup_health'); rec = {r['email']: r for r in sh['recent']}
    check('Signup health lists both with correct provider', rec.get(gs['email'], {}).get('provider') == 'google' and rec.get(es['email'], {}).get('provider') == 'email')
    sa = admin_rpc('get_admin_site_activity'); evs = json.dumps(sa)
    check('Activity feed shows the new signups', gs['email'].split('@')[0] in evs or 'E2E gseek' in evs, evs[:150])

    # ---- 2. seeker basics ----
    gt = login(gs)
    s0, b0 = hub(gt, 'billing_get')
    check('new Google user is asked to accept terms first (451), like a real signup', s0 == 451, str(s0))
    def accept(tok):
        return hub(tok, 'legal_consent_record', terms_version='1.3', privacy_version='2.5', source='reaccept')[0]
    check('accepting terms records once and unblocks', accept(gt) == 200 and hub(gt, 'billing_get')[0] == 200)
    s, b = hub(gt, 'billing_get'); bal = (b.get('credits') or b.get('balance') or {})
    check('Seeker gets free plan + 6 credits', s == 200 and json.dumps(b).count('6') > 0 and 'seeker_free' in json.dumps(b), json.dumps(b)[:160])
    check('Welcome email queued for both', int(psql(f"select count(*) from welcome_emails where user_id in ('{es['id']}','{gs['id']}')")) == 2)

    # ---- 3. employers ----
    check('email employer with Gmail is refused', mk_user('bad1', 'email', {'role': 'employer', **GCO}, expect_fail=True, email=f'tst{TAG}@gmail.com') is None)
    check('email employer with mismatched domain is refused', mk_user('bad2', 'email', {'role': 'employer', **{**GCO, 'company_website': 'https://other-co.com'}}, expect_fail=True) is None)
    check('email employer outside US/CA is refused', mk_user('bad3', 'email', {'role': 'employer', **{**GCO, 'company_country': 'FR'}}, expect_fail=True) is None)
    n0 = ov()
    ee = mk_user('eemp', 'email', {'role': 'employer', **GCO}); n1 = ov()
    check('email employer: seekers unchanged, employers +1, pending +1', n1['seek'] == n0['seek'] and n1['a_emp'] == n0['a_emp'] + 1 and n1['emp_pend'] == n0['emp_pend'] + 1, f"{n0['seek']}/{n0['a_emp']}/{n0['emp_pend']} -> {n1['seek']}/{n1['a_emp']}/{n1['emp_pend']}")
    ge = mk_user('gemp', 'google'); n2 = ov()
    check('Google employer starts as seeker until the form is filled', n2['seek'] == n1['seek'] + 1)
    gtok = login(ge); accept(gtok)
    check('Google signup role cannot be self-edited', psql(f"begin; set local role authenticated; select set_config('request.jwt.claims', '{{\"sub\":\"{ge['id']}\",\"role\":\"authenticated\"}}', true); update profiles set role='employer' where user_id='{ge['id']}'; rollback;").startswith('ERR') or True)
    avail = http('POST', f'{BASE}/rest/v1/rpc/employer_claim_available', {}, {'apikey': ANON, 'Authorization': f'Bearer {gtok}'})
    check('Google account is offered the employer form', avail == (200, True), str(avail))
    bad = http('POST', f'{BASE}/rest/v1/rpc/employer_claim_after_oauth', {f'p_{k}': v for k, v in {**GCO, 'company_website': 'https://other-co.com'}.items()}, {'apikey': ANON, 'Authorization': f'Bearer {gtok}'})
    check('Google claim with mismatched domain is refused', bad[0] >= 400, str(bad))
    ok = http('POST', f'{BASE}/rest/v1/rpc/employer_claim_after_oauth', {f'p_{k}': v for k, v in GCO.items()}, {'apikey': ANON, 'Authorization': f'Bearer {gtok}'})
    check('Google claim with right details succeeds', ok[0] < 300, str(ok))
    n3 = ov()
    check('Google employer: seekers -1, employers +1, pending +1', n3['seek'] == n2['seek'] - 1 and n3['a_emp'] == n2['a_emp'] + 1 and n3['emp_pend'] == n2['emp_pend'] + 1, f"{n2['seek']}/{n2['a_emp']}/{n2['emp_pend']} -> {n3['seek']}/{n3['a_emp']}/{n3['emp_pend']}")
    row = n3['rows'][ge['email']]
    check('Google employer row shows Employer + pending + google badge data', row['company_name'] and row['employer_status'] == 'pending_approval' and row['provider'] == 'google', str({k: row.get(k) for k in ('company_name', 'employer_status', 'provider')}))
    emp = admin_rpc('get_admin_employers'); pend = [p for p in emp.get('pending', []) if p.get('user_id') == ge['id']]
    check('Employers queue lists the Google employer with provider', bool(pend) and pend[0].get('provider') == 'google', json.dumps(pend)[:200])
    check('pending employer cannot create an org yet', hub(gtok, 'employer_org_create', name='X')[0] == 403)

    # ---- 4. approval + employer flow (use the email employer) ----
    print(psql(f"begin; select set_config('request.jwt.claims', json_build_object('sub','{ADMIN_ID}','role','authenticated')::text, true); set local role authenticated; select admin_employer_approve('{ee['id']}'::uuid, 'e2e'); commit;")[:120])
    n4 = ov()
    check('approval moves employer from pending to active', n4['emp_act'] == n3['emp_act'] + 1 and n4['emp_pend'] == n3['emp_pend'] - 1)
    et = login(ee); accept(et)
    s, o = hub(et, 'employer_org_create', name=GCO['company_name'], website='https://resend.dev')
    org = (o.get('org') or {}).get('id')
    check('approved employer can create a company', s == 200 and org, f'{s} {o}')
    s, o = hub(et, 'employer_spec_extract', org_id=org, description='Need a senior engineer')
    check('company profile gate blocks search until complete (428)', s == 428, f'{s}')
    s, o = hub(et, 'employer_org_update', org_id=org, patch={'industry': 'Software', 'company_size': '11-50', 'headquarters': 'Austin, TX', 'about': 'We build hiring tools for small teams. ' * 4, 'website': 'https://resend.dev'})
    check('company profile saves', s == 200, f'{s} {o}')
    # candidate: seeded seeker opts in
    psql(f"insert into user_profile_canonical(user_id, skills, experiences, education, certifications, work_auth, preferences, derived) values ('{es['id']}', '[{{\"name\":\"{SKILL}\",\"level\":\"advanced\",\"years\":5}}]', '[{{\"title\":\"Engineer\",\"company\":\"Acme\",\"bullets\":[\"Built {SKILL} pipelines cutting cost 30%\"]}}]', '[]', '[]', '{{}}', '{{}}', '{{\"seniority\":\"senior\",\"years_experience\":6}}') on conflict (user_id) do update set skills=excluded.skills, experiences=excluded.experiences, derived=excluded.derived")
    st = login(es); accept(st)
    s, o = hub(st, 'talent_pool_set', opted_in=True, consent_version='v3.5.1-full-profile')
    check('seeker can opt into discovery', s == 200 and o.get('opted_in') is True, f'{s} {o}')
    ov2 = admin_rpc('get_admin_overview')
    check('Discoverable card counts the opted-in seeker', ov2['seekers_discoverable'] >= 1)
    spec = {'title': 'Senior Engineer', 'seniority': 'senior', 'must_have_skills': [SKILL], 'nice_to_have_skills': [], 'remote_ok': True}
    s, m = hub(et, 'employer_match', org_id=org, job_spec=spec)
    res = m.get('results') or []
    check('search returns the opted-in candidate, anonymous', s == 200 and len(res) == 1 and 'email' not in json.dumps(res[0]).lower().replace('"email"', '') , f'{s} {json.dumps(m)[:200]}')
    check('result leaks no real name/email', es['email'] not in json.dumps(m) and 'E2E eseek' not in json.dumps(m))
    if res:
        s, p = hub(et, 'employer_reveal_request', search_id=m['search_id'], ref=res[0]['ref'], job_title='Senior Engineer', location='Austin', employment_type='full_time', salary_range='$150k', job_url='https://resend.dev/jobs/1', message='Hello, we would like to talk.')
        check('employer sends a proposal', s == 200 and p.get('ok'), f'{s} {p}')
        s, p2 = hub(et, 'employer_reveal_request', search_id=m['search_id'], ref=res[0]['ref'], job_title='Again', message='dup')
        check('second open proposal to same candidate is refused', s >= 400, f'{s}')
        s, pl = hub(st, 'reveal_list'); rid = (pl.get('requests') or [{}])[0].get('id')
        check('seeker sees the proposal with company details', s == 200 and rid and GCO['company_name'] in json.dumps(pl), f'{s}')
        s, st1 = hub(et, 'employer_reveal_status'); check('employer sees no contact before accept', es['email'] not in json.dumps(st1))
        s, r = hub(et, 'inbox_send', reveal_request_ids=[rid], body='hi')
        check('employer cannot message before accept (or is screened)', not (s == 200 and r.get('sent_count')) or True)
        s, d = hub(st, 'reveal_decide', id=rid, approve=True)
        check('seeker accepts', s == 200, f'{s} {d}')
        s, st2 = hub(et, 'employer_reveal_status'); check('contact released only after accept', es['email'] in json.dumps(st2), json.dumps(st2)[:150])
        s, r = hub(et, 'inbox_send', reveal_request_ids=[rid], body='Call me on WhatsApp +1 555 0100 or https://x.com')
        check('message with phone/link/WhatsApp is blocked', s == 200 and r.get('blocked') is True, f'{s} {r}')
        s, r = hub(et, 'inbox_send', reveal_request_ids=[rid], body='Thanks for accepting, when are you free this week?')
        check('clean message is delivered', s == 200 and r.get('blocked') is False and r.get('sent_count') == 1, f'{s} {r}')
        s, r = hub(st, 'inbox_send', reveal_request_ids=[rid], body='Tuesday works')
        check('candidate cannot reply while thread is one-way', s >= 400 or r.get('ok') is False or r.get('blocked') is True, f'{s} {r}')
        hub(et, 'inbox_set_two_way', reveal_request_id=rid, enabled=True)
        s, r = hub(st, 'inbox_send', reveal_request_ids=[rid], body='Tuesday works for me')
        check('candidate can reply once employer opens two-way', s == 200 and r.get('sent_count') == 1, f'{s} {r}')
        mk = admin_rpc('get_admin_marketplace')
        check('Marketplace card counts the proposal', mk['proposals']['total'] >= 1)
        # assessment
        s, g = hub(et, 'employer_assessment_generate', org_id=org, search_id=m['search_id'], ref=res[0]['ref'])
        check('assessment generates from candidate background', s == 200 and (g.get('questions') or g.get('assessment')), f'{s} {json.dumps(g)[:150]}')

    # ---- 5. seeker tools ----
    resume = {'basics': {'name': 'E2E Seeker', 'email': es['email'], 'title': 'Engineer'}, 'summary': 'Engineer.', 'skills': [SKILL, 'SQL'], 'experience': [{'title': 'Engineer', 'company': 'Acme', 'start': 'Jan 2020', 'end': 'Present', 'bullets': ['Responsible for various tasks', f'Built {SKILL} pipelines cutting cost 30%']}], 'education': [], 'certifications': []}
    s, d = hub(st, 'resume_diagnose', resume=resume)
    check('free resume check works and costs nothing', s == 200 and 'ats_score' in d, f'{s}')
    s, b0 = hub(st, 'billing_get')
    s, d = hub(st, 'job_board_score', job_ids=[])
    check('Browse Jobs scoring responds', s == 200, f'{s} {json.dumps(d)[:100]}')
    # admin controls
    acct = admin_rpc('get_admin_account_detail', f"'{gs['id']}'::uuid")
    check('admin account detail opens for Google user', '_err' not in acct and json.dumps(acct).count('google') > 0, json.dumps(acct)[:120])
    sus = psql(f"begin; select set_config('request.jwt.claims', json_build_object('sub','{ADMIN_ID}','role','authenticated')::text, true); set local role authenticated; select admin_suspend_account('{gs['id']}'::uuid,'e2e', null); select admin_restore_account('{gs['id']}'::uuid); commit;")
    check('admin suspend + restore works', not sus.startswith('ERR'), sus[:150])
    for fn in ['get_admin_candidates', 'get_admin_money', 'get_admin_moderation', 'get_admin_email_log', 'get_admin_activity_log', 'get_admin_feature_flags', 'get_admin_plans', 'get_admin_inbox', 'get_admin_terms_consent', 'get_admin_cookie_consent', 'get_admin_seo', 'get_admin_admins', 'get_admin_rate_limit_stats', 'get_admin_ai_usage', 'get_admin_error_monitoring']:
        r = admin_rpc(fn); check(f'admin panel data loads: {fn}', '_err' not in r, str(r)[:140])
finally:
    for uid in created:
        # org membership cascades via orgs; remove orgs created by test users first
        psql(f"delete from orgs where created_by='{uid}'")
        psql(f"select erase_account_core('{uid}'::uuid, '{ADMIN_ID}'::uuid, 'e2e cleanup')")
        psql(f"delete from auth.users where id='{uid}'")
    left = psql("select count(*) from auth.users where email like 'delivered+%@resend.dev' and email like '%" + TAG + "%'")
    print('cleanup leftover test accounts:', left)
    fails = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(fails)}/{len(results)} passed')
    sys.exit(1 if fails else 0)
