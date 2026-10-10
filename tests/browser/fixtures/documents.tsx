// Regression fixture only, not a customer route or production demo.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResumeDocumentPreview, LetterDocumentPreview } from '../../../src/components/shared/DocumentPreview';
import '../../../src/index.css';

const resume = {
  basics: { name: 'Example Candidate', title: 'Software Engineer', location: 'Dubai, UAE', email: 'example@example.com', summary: 'Builds reliable reporting tools and practical workflows for small teams.' },
  skillGroups: [{ category: 'Engineering', skills: ['Python', 'SQL'] }], skills: ['Python', 'SQL', 'Git'],
  work: [{ title: 'Software Engineer', company: 'Example Company', start: '2023', end: '2025', bullets: ['Built reporting tools used by the operations team.', 'Worked with colleagues to document and test releases.'] }],
  projects: [{ name: 'Reporting toolkit', description: 'A small collection of reusable reporting scripts.' }],
  certifications: ['Example certification'], education: [{ degree: 'BSc', school: 'Example University', end: '2023' }],
};
createRoot(document.getElementById('root')!).render(<main style={{ background: '#faf8f3', padding: '24px', minHeight: '100vh' }}>
  <header style={{ maxWidth: '48rem', margin: '0 auto 24px', display: 'flex', alignItems: 'center', gap: 16 }}><img src="/ayn-mark.svg" alt="AYN" width="40" height="40" /><div><h1 style={{ fontSize: 22, fontWeight: 600 }}>Document reading layouts</h1><p>Test content · not a real candidate</p></div></header>
  <ResumeDocumentPreview content={resume} />
  <div style={{ marginTop: 24 }}><LetterDocumentPreview text={'Dear hiring team,\n\nI build reporting tools that make everyday operations easier. Your role interests me because it combines practical engineering with close work across teams.\n\nAt Example Company, I built reports and helped colleagues document and test releases. I would welcome the chance to discuss how that experience fits your team.\n\nKind regards,\nExample Candidate'} /></div>
</main>);
