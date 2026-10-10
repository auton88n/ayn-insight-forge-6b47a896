import { describe, expect, it } from 'vitest';
import { buildErrorAlertEmail, buildSecurityAlertEmail } from '../../supabase/functions/_shared/adminAlertCopy';

describe('plain-English admin alerts', () => {
  it('groups the screenshot’s job-page loading failures without exposing diagnostic codes', () => {
    const events = ['a', 'b', 'c', 'd'].map(id => ({
      endpoint: `/jobs/${id}`, severity: 'error', created_at: '2026-10-10T21:37:51Z',
      error_message: 'Failed to fetch dynamically imported module: https://ayn.careers/assets/PublicJobs-qLKuTawI.js',
    }));
    const { subject, html } = buildErrorAlertEmail(events);
    expect(subject).toBe('AYN: Job pages could not open');
    expect(html.match(/What happened:/g)).toHaveLength(1);
    expect(html).toContain('11 October 2026');
    expect(html).toContain('1:37 am');
    expect(html).toContain('Dubai time');
    expect(html).toContain('What to do:');
    expect(html).toContain('not a live health check');
    expect(html).not.toMatch(/PublicJobs|qLKuTawI|dynamically imported|4 errors|\/jobs\/a/);
  });
  it('places critical problems first and retains distinct affected areas', () => {
    const { subject, html } = buildErrorAlertEmail([
      { endpoint: '/jobs/123', error_message: 'Failed to fetch' },
      { endpoint: '/checkout', severity: 'critical', error_message: 'Timed out' },
    ]);
    expect(subject).toContain('urgent review needed — Payments took too long');
    expect(html.indexOf('Payments took too long')).toBeLessThan(html.indexOf('Job pages could not connect'));
    expect(html).toContain('check whether its result or payment already completed');
  });
  it('does not echo unknown messages, paths, secrets, or attacker-supplied HTML', () => {
    const { html, subject } = buildErrorAlertEmail([{
      endpoint: '/<script>secret-token</script>?email=private@example.com',
      error_message: '<img src=x onerror=alert(1)> sensitive-record', created_at: 'bad-date',
    }]);
    expect(html + subject).not.toMatch(/secret-token|private@example|sensitive-record|onerror/);
    expect(html).toContain('cannot reliably explain its cause');
    expect(html).toContain('recording time is unavailable');
    expect(html).toContain('System → Errors');
  });
  it('keeps the real AYN brand and a fixed admin destination', () => {
    const { html } = buildErrorAlertEmail([]);
    expect(html).toContain('https://ayn.careers/ayn-email-logo.png');
    expect(html).toContain('href="https://ayn.careers/manage-bae76e99d97e188b"');
    expect(html).toContain('Open AYN admin');
  });
  it('explains denied admin access without claiming a breach or complete protection', () => {
    const { subject, html } = buildSecurityAlertEmail([{ action: 'admin_action_denied', severity: 'critical' }]);
    expect(subject).toContain('urgent review needed — An admin action was refused');
    expect(html).toContain('without the required permission');
    expect(html).toContain('not proof that AYN was hacked');
    expect(html).toContain('Do not assume');
    expect(html).not.toContain('admin_action_denied');
  });
  it('explains repeated unknown security activity without echoing internal data', () => {
    const { html, subject } = buildSecurityAlertEmail([{ action: '<script>unknown_action</script>' }], true);
    expect(subject).toContain('Repeated security activity needs review');
    expect(html).toContain('same account or connection');
    expect(html).toContain('does not confirm that the activity has stopped');
    expect(html + subject).not.toContain('unknown_action');
  });
});
