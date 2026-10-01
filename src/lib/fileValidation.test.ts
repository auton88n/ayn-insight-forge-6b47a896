import { describe, expect, it } from 'vitest';
import { sanitizeFileName, validateFile, validateFileExtension, validateMagicBytes } from './fileValidation';

describe('file validation', () => {
  it('rejects executable and double-extension filenames', () => {
    expect(validateFileExtension('resume.pdf.exe').isValid).toBe(false);
    expect(validateFileExtension('resume.PS1').isValid).toBe(false);
  });

  it('removes path traversal and filesystem separators from stored names', () => {
    expect(sanitizeFileName('../../private\\resume?.pdf')).toBe('privateresume.pdf');
  });

  it('rejects a declared PDF whose bytes are not a PDF', async () => {
    const file = new File(['not a PDF'], 'resume.pdf', { type: 'application/pdf' });
    await expect(validateMagicBytes(file)).resolves.toMatchObject({ isValid: false });
  });

  it('rejects active PDF content even when the magic bytes are valid', async () => {
    const file = new File(['%PDF-1.7\n/OpenAction /JavaScript'], 'resume.pdf', { type: 'application/pdf' });
    await expect(validateFile(file)).resolves.toMatchObject({ isValid: false });
  });

  it('rejects executable SVG content', async () => {
    const file = new File(['<svg><script>alert(1)</script></svg>'], 'avatar.svg', { type: 'image/svg+xml' });
    await expect(validateFile(file)).resolves.toMatchObject({ isValid: false });
  });

  it('permits a plain text document without suspicious content', async () => {
    const file = new File(['Plain text resume'], 'resume.txt', { type: 'text/plain' });
    await expect(validateFile(file)).resolves.toEqual({ isValid: true, warnings: undefined });
  });
});
