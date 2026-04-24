import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import {
  createPalette,
  baseDocumentOptions,
  buildExportFilename,
  buildPdfInfo,
  finalizePageRibbons,
  shortSignatureId,
  slug,
} from '../src/services/pdfTokens.js';

describe('pdfTokens', () => {
  describe('createPalette', () => {
    it('returns the federation default palette when no config overrides are set', () => {
      const palette = createPalette({ pdf: {} });
      expect(palette.paper).toBe('#FAFAF7');
      expect(palette.ink).toBe('#0A0A0A');
      expect(palette.accent).toBe('#7A1E22');
      expect(palette.verify).toBe('#0F7B5C');
      expect(palette.gold).toBe('#C8A96A');
    });

    it('allows ops to re-tune brand colors via config without a code change', () => {
      const palette = createPalette({
        pdf: { brandPrimary: '#123456', brandAccent: '#abcdef', paper: '#fff', ink: '#000' },
      });
      expect(palette.primary).toBe('#123456');
      expect(palette.accent).toBe('#abcdef');
      expect(palette.paper).toBe('#fff');
      expect(palette.ink).toBe('#000');
    });

    it('ignores non-hex overrides and falls back to defaults', () => {
      const palette = createPalette({ pdf: { brandPrimary: 'not-a-color' } });
      expect(palette.primary).toBe('#0A0A0A');
    });
  });

  describe('buildExportFilename', () => {
    it('builds a slug-based, human-readable filename with ISO date', () => {
      const name = buildExportFilename({
        type: 'application',
        tournamentName: 'Spring Championship 2026',
        applicationDisplayId: 'PRM-00123',
        brand: 'Primal',
        date: '2026-04-24T12:00:00Z',
      });
      expect(name).toBe('primal_application_spring-championship-2026_prm-00123_2026-04-24.pdf');
    });

    it('omits missing identifier parts cleanly', () => {
      const name = buildExportFilename({ type: 'analytics', brand: 'Primal', date: '2026-04-24' });
      expect(name).toBe('primal_analytics_2026-04-24.pdf');
    });

    it('supports bracket-style exports with a discipline slug', () => {
      const name = buildExportFilename({
        type: 'bracket',
        tournamentName: 'Spring Championship',
        bracketId: 'brk-9',
        discipline: 'Mixed Martial Arts',
        brand: 'Primal',
        date: '2026-04-24',
      });
      expect(name).toBe('primal_bracket_spring-championship_mixed-martial-arts_brk-9_2026-04-24.pdf');
    });
  });

  describe('baseDocumentOptions', () => {
    it('provides tagged, buffered, titled pdfkit options with PDF 1.7', () => {
      const opts = baseDocumentOptions({ title: 'Primal export', brand: 'Primal' });
      expect(opts.tagged).toBe(true);
      expect(opts.displayTitle).toBe(true);
      expect(opts.bufferPages).toBe(true);
      expect(opts.pdfVersion).toBe('1.7');
      expect(opts.lang).toBe('en-US');
      expect(opts.info.Title).toBe('Primal export');
      expect(opts.info.Creator).toContain('Primal');
    });
  });

  describe('buildPdfInfo', () => {
    it('includes brand keywords and a producer line', () => {
      const info = buildPdfInfo({ title: 'T', brand: 'Primal', keywords: ['season'] });
      expect(info.Keywords).toContain('Primal');
      expect(info.Keywords).toContain('season');
      expect(info.Creator).toMatch(/primal-export/);
    });
  });

  describe('shortSignatureId', () => {
    it('returns an uppercase 10-char fingerprint stripped of non-alphanumerics', () => {
      expect(shortSignatureId({ signature: 'sha256:abc-def-123-xyz-999' })).toBe('SHA256ABCD');
      expect(shortSignatureId({ id: 'verify-12345678' })).toBe('VERIFY1234');
      expect(shortSignatureId(null)).toBe('');
      expect(shortSignatureId({})).toBe('');
    });
  });

  describe('slug', () => {
    it('handles accents, whitespace, and symbols', () => {
      expect(slug('Spring Championship — 2026 (Kerala)')).toBe('spring-championship-2026-kerala');
      expect(slug('')).toBe('primal');
    });
  });

  describe('finalizePageRibbons', () => {
    it('produces a valid multi-page tagged PDF without throwing', async () => {
      const doc = new PDFDocument({ ...baseDocumentOptions({ title: 'T', brand: 'Primal' }) });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      const ended = new Promise((resolve) => doc.on('end', resolve));

      doc.addPage();
      doc.text('Page 2 content');

      const range = doc.bufferedPageRange();
      expect(range.count).toBe(2);

      finalizePageRibbons(doc, {
        palette: createPalette({ pdf: {} }),
        fonts: { body: 'Helvetica', bodyBold: 'Helvetica-Bold' },
        brand: 'Primal',
        identifier: 'TEST-01',
        signatureShortId: 'SIG12345',
      });
      doc.end();
      await ended;

      const buf = Buffer.concat(chunks);
      // PDF magic header + EOF marker = structurally valid PDF output.
      expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
      expect(buf.slice(-8).toString('latin1')).toMatch(/%%EOF/);
    });

    it('is a no-op when the document has no buffered pages', () => {
      const doc = new PDFDocument({ ...baseDocumentOptions({ title: 'T', brand: 'Primal' }), autoFirstPage: false });
      expect(() => finalizePageRibbons(doc, {
        palette: createPalette({ pdf: {} }),
        fonts: { body: 'Helvetica', bodyBold: 'Helvetica-Bold' },
        brand: 'Primal',
      })).not.toThrow();
    });
  });
});
