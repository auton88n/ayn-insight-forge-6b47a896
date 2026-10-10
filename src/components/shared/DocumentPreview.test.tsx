import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResumeDocumentPreview, LetterDocumentPreview } from './DocumentPreview';
import { buildResumeBlocks } from '@/lib/resumeBlocks';

describe('document reading layouts', () => {
  const resume = {
    basics: { name: 'Example Candidate', summary: 'Builds reliable tools.' },
    skillGroups: [{ category: 'Backend', skills: ['SQL'] }], skills: ['SQL', 'Python'],
    work: [{ title: 'Engineer', company: 'Example', start: '2024', end: '2025', location: 'Dubai', bullets: ['Shipped a tool.', '<script>bad()</script>'] }],
    projects: [{ name: 'Portfolio', url: 'https://example.com', description: 'A working example.' }],
    certifications: ['License'], education: [{ degree: 'BSc', school: 'Example School', start: '2020', end: '2024' }],
  };
  it('renders real sections, bullets and dates, including ungrouped skills and projects', () => {
    const { container } = render(<ResumeDocumentPreview content={resume} />);
    expect(screen.getByRole('heading', { name: 'Example Candidate' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Python')).toBeVisible();
    expect(screen.getByText('Portfolio | https://example.com')).toBeVisible();
    expect(container.textContent).toContain('2024 to 2025');
    expect(container.querySelector('pre, script')).toBeNull();
    const text = container.textContent!;
    expect(text.indexOf('CERTIFICATIONS & LICENSES')).toBeLessThan(text.indexOf('EDUCATION'));
    expect(buildResumeBlocks(resume).map(b => b.text)).toContain('Python');
  });
  it('preserves the cover letter as escaped paragraphs, not a code block', () => {
    const { container } = render(<LetterDocumentPreview text={'Dear team,\n\nI built a tool.\nIt works.\n\n<script>bad()</script>'} />);
    expect(container.querySelectorAll('p')).toHaveLength(3);
    expect(container.textContent).toContain('<script>bad()</script>');
    expect(container.querySelector('script, pre')).toBeNull();
  });
});
