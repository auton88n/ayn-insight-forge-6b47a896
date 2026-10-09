import { describe, expect, it } from 'vitest';
import { applySalaryFloor, hasEnoughPayData, invalidFigures, MIN_SALARY_SAMPLE } from '../../supabase/functions/content-engine/grounding';

describe('article figure grounding', () => {
  const data = { generated_at: '2026-10-02', open_roles: 120, median_salary: 160000, salary_sample_size: 20 };

  it('accepts whole source figures with ordinary currency formatting', () => {
    expect(invalidFigures('In 2026, 120 roles had a $160,000 median from 20 salary samples.', data)).toEqual([]);
  });

  it('rejects a number that appears only inside a larger source number', () => {
    expect(invalidFigures('There were 12 roles.', { open_roles: 120 })).toEqual(['12']);
  });

  it('rejects a made-up percentage even when its bare count appears', () => {
    expect(invalidFigures('20% of roles were remote.', data)).toEqual(['20%']);
  });

  it('checks single-digit counts too', () => {
    expect(invalidFigures('3 companies account for the market.', data)).toEqual(['3']);
  });

  it('rejects a made-up year', () => {
    expect(invalidFigures('The 2027 outlook is strong.', data)).toEqual(['2027']);
  });

  it('drops pay figures built from a handful of salaries', () => {
    const thin = applySalaryFloor({ open_roles: 135, median_salary: 55000, p25_salary: 55000, p75_salary: 55000, salary_sample_size: 1 });
    expect(thin).not.toHaveProperty('median_salary');
    expect(thin).not.toHaveProperty('salary_sample_size');
    expect(thin.open_roles).toBe(135);
    expect(thin.salary_note).toContain(String(MIN_SALARY_SAMPLE));
    expect(hasEnoughPayData({ salary_sample_size: 1 })).toBe(false);
  });

  it('keeps pay figures from an adequate sample and states the currency basis', () => {
    const ok = applySalaryFloor({ median_salary: 160000, salary_sample_size: MIN_SALARY_SAMPLE });
    expect(ok.median_salary).toBe(160000);
    expect(ok.salary_basis).toMatch(/US dollars/);
    expect(hasEnoughPayData({ salary_sample_size: MIN_SALARY_SAMPLE })).toBe(true);
  });
});
