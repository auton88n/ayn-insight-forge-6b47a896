// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseJobDescription } from './jobPostingFormat';

const SUMMARY = 'Stampli is building the leading AP automation platform for finance teams around the world.';
const RESP = ['Own the product roadmap for the payments surface', 'Partner with design and engineering every week'];

describe('parseJobDescription duplicate handling', () => {
  it('shows a description that was pasted twice only once', () => {
    const once = `About the role\n${SUMMARY}\n\nResponsibilities\n- ${RESP[0]}\n- ${RESP[1]}`;
    const twice = `${once}\n\n${once}`;
    expect(parseJobDescription(twice)).toEqual(parseJobDescription(once));
  });
  it('drops a long paragraph repeated later in the text, keeps short repeats', () => {
    const text = `${SUMMARY}\n\nWhat you will do\n- ${RESP[0]}\n\n${SUMMARY}\n\nApply now\n\nApply now`;
    const blocks = parseJobDescription(text);
    expect(blocks.filter((b) => b.kind === 'para' && b.text === SUMMARY)).toHaveLength(1);
    expect(blocks.filter((b) => b.kind === 'para' && b.text === 'Apply now').length).toBeGreaterThan(0);
  });
  it('leaves normal descriptions untouched', () => {
    const text = `Requirements\n- 5 years of product management experience\n- Strong written communication\n\nBenefits\n- Health cover for you and your family`;
    expect(parseJobDescription(text)).toEqual([
      { kind: 'heading', text: 'Requirements' },
      { kind: 'bullets', items: ['5 years of product management experience', 'Strong written communication'] },
      { kind: 'heading', text: 'Benefits' },
      { kind: 'bullets', items: ['Health cover for you and your family'] },
    ]);
  });
});
