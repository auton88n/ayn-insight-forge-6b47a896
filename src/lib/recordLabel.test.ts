import { describe, expect, it } from 'vitest';
import { recordLabel } from './recordLabel';
describe('display-only record labels', () => {
  it.each([['pending_approval', 'Awaiting approval'], ['past_due', 'Payment overdue'], ['resume_optimize', 'Resume optimization'], ['future_status', 'Future status'], [null, 'Not recorded']])('%s reads as %s', (value, expected) => expect(recordLabel(value)).toBe(expected));
});
