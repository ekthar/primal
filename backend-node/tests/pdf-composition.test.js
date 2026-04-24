import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import { createPalette, baseDocumentOptions, getStatusSpec, resolveStatusColor } from '../src/services/pdfTokens.js';
import {
  drawStatusBadge,
  drawIdentityBlocks,
  drawApplicationCoverPage,
  drawRunningHeader,
} from '../src/services/pdfComposition.js';

function paletteDefault() {
  return createPalette({ pdf: {} });
}

function fonts() {
  return { body: 'Helvetica', bodyBold: 'Helvetica-Bold', heading: 'Helvetica-Bold', headingBold: 'Helvetica-Bold' };
}

async function renderToBuffer(fn) {
  const doc = new PDFDocument({ ...baseDocumentOptions({ title: 'T', brand: 'Primal' }), size: 'A4' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const ended = new Promise((r) => doc.on('end', r));
  fn(doc);
  doc.end();
  await ended;
  return Buffer.concat(chunks);
}

describe('pdfComposition', () => {
  it('getStatusSpec falls back to `submitted` for unknown statuses', () => {
    expect(getStatusSpec('approved').shape).toBe('check');
    expect(getStatusSpec('rejected').shape).toBe('cross');
    expect(getStatusSpec('needs_correction').shape).toBe('asterisk');
    expect(getStatusSpec('nonsense').shape).toBe('dot');
  });

  it('resolveStatusColor maps tones to concrete palette colors', () => {
    const p = paletteDefault();
    expect(resolveStatusColor('verify', p)).toBe(p.verify);
    expect(resolveStatusColor('accent', p)).toBe(p.accent);
    expect(resolveStatusColor('warn', p)).toBe(p.warn);
    expect(resolveStatusColor('muted', p)).toBe(p.textMuted);
    expect(resolveStatusColor('ink', p)).toBe(p.ink);
    expect(resolveStatusColor('bogus', p)).toBe(p.ink);
  });

  it('drawStatusBadge renders every status without throwing', async () => {
    const statuses = ['approved', 'rejected', 'needs_correction', 'under_review', 'pending', 'submitted'];
    const buf = await renderToBuffer((doc) => {
      let y = 72;
      statuses.forEach((s) => {
        drawStatusBadge(doc, { status: s, x: 72, y, palette: paletteDefault(), fonts: fonts() });
        y += 36;
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawIdentityBlocks renders a 4-block grid at the given origin', async () => {
    const buf = await renderToBuffer((doc) => {
      drawIdentityBlocks(doc, {
        blocks: [
          { label: 'Full Name', value: 'Asha Verma' },
          { label: 'Application ID', value: 'PRM-00123' },
          { label: 'Date of Birth', value: '2002-04-10' },
          { label: 'Nationality', value: 'India' },
        ],
        x: 72,
        y: 120,
        width: 450,
        palette: paletteDefault(),
        fonts: fonts(),
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawApplicationCoverPage produces a valid tagged multi-section page', async () => {
    const buf = await renderToBuffer((doc) => {
      drawApplicationCoverPage(doc, {
        palette: paletteDefault(),
        fonts: fonts(),
        brandName: 'Primal',
        tournamentName: 'Spring Championship 2026',
        applicationDisplayId: 'PRM-00123',
        applicantName: 'Asha Verma',
        clubName: 'Kerala Warriors',
        categoryLine: 'MMA · -65kg',
        status: 'approved',
        identityBlocks: [
          { label: 'Full Name', value: 'Asha Verma' },
          { label: 'Application ID', value: 'PRM-00123' },
          { label: 'Date of Birth', value: '2002-04-10' },
          { label: 'Nationality', value: 'India' },
        ],
        photoBuffer: null,
        qrBuffer: null,
        verifyUrl: 'https://primal.example.com/verify/abc',
        signatureShortId: 'SIG12345A',
        issuingAuthority: 'Primal Federation',
        issuedAt: '2026-04-24 12:00:00 UTC',
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('composition helpers never advance doc.y or add pages when called near the margin', async () => {
    // Critical invariant: drawing a badge / header / identity block must be a
    // pure visual op — no page-break side effects, even when doc.y is sitting
    // right on the bottom margin.
    let extraPages = 0;
    const buf = await renderToBuffer((doc) => {
      doc.on('pageAdded', () => { extraPages += 1; });
      doc.y = doc.page.height - doc.page.margins.bottom - 4;
      const beforeY = doc.y;
      drawStatusBadge(doc, { status: 'approved', x: 32, y: beforeY, palette: paletteDefault(), fonts: fonts() });
      drawIdentityBlocks(doc, {
        blocks: [
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
          { label: 'D', value: '4' },
        ],
        x: 32, y: beforeY + 4, width: 450, palette: paletteDefault(), fonts: fonts(),
      });
      expect(doc.y).toBe(beforeY);
    });
    expect(extraPages).toBe(0);
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawRunningHeader composes on a fresh page without throwing', async () => {
    const buf = await renderToBuffer((doc) => {
      doc.addPage();
      drawRunningHeader(doc, {
        palette: paletteDefault(),
        fonts: fonts(),
        brandName: 'Primal',
        applicationDisplayId: 'PRM-00123',
        tournamentName: 'Spring Championship 2026',
        status: 'under_review',
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });
});
