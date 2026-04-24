import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import { createPalette, baseDocumentOptions, getStatusSpec, resolveStatusColor } from '../src/services/pdfTokens.js';
import {
  drawStatusBadge,
  drawIdentityBlocks,
  drawApplicationCoverPage,
  drawRunningHeader,
  drawBracketTree,
  drawBracketHeader,
  drawChampionCard,
  layoutBracket,
  deriveParentCenters,
  autoSlotHeight,
  drawReportHeader,
  drawKpiStrip,
  drawDataTable,
  drawStatusDistributionBar,
  drawSparkline,
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

  // ─── Bracket composition (Phase 2) ────────────────────────────────────────

  it('deriveParentCenters halves a list of child centers by pair-midpoint', () => {
    // Classical elimination tree: parent center is the midpoint between its
    // two child match centers. Stair-step layouts violate this by shifting
    // every round down by a fixed offset — the old bracket bug.
    expect(deriveParentCenters([10, 30, 50, 70])).toEqual([20, 60]);
    expect(deriveParentCenters([20, 60])).toEqual([40]);
    expect(deriveParentCenters([40])).toEqual([40]);
  });

  it('layoutBracket produces a balanced multi-round layout', () => {
    const rounds = [
      { matches: [{}, {}, {}, {}] },
      { matches: [{}, {}] },
      { matches: [{}] },
    ];
    const { matchLayout, matchHeight } = layoutBracket(rounds, {
      contentHeight: 400, topY: 0, slotHeight: 18, matchGap: 0,
    });
    // First round: 4 matches centered at pitch * (i + 0.5) = 50, 150, 250, 350
    expect(matchLayout[0].map((p) => p.centerY)).toEqual([50, 150, 250, 350]);
    // Second round: parents at midpoint of each pair — 100, 300
    expect(matchLayout[1].map((p) => p.centerY)).toEqual([100, 300]);
    // Final: midpoint of semi-finals — 200
    expect(matchLayout[2].map((p) => p.centerY)).toEqual([200]);
    // Match height is 2 slots + gap
    expect(matchHeight).toBe(36);
  });

  it('autoSlotHeight stays within the readable clamp [14, 24]', () => {
    // Massive vertical room, few matches — clamped at 24 so cards don't get giant.
    expect(autoSlotHeight({ contentHeight: 800, firstRoundMatches: 2 })).toBe(24);
    // Tight 64-fighter bracket — clamped at 14 so it still fits.
    expect(autoSlotHeight({ contentHeight: 400, firstRoundMatches: 32 })).toBe(14);
    // Typical 16-fighter bracket — lands somewhere in the middle.
    const mid = autoSlotHeight({ contentHeight: 400, firstRoundMatches: 8 });
    expect(mid).toBeGreaterThanOrEqual(14);
    expect(mid).toBeLessThanOrEqual(24);
  });

  it('drawBracketHeader renders without throwing', async () => {
    const buf = await renderToBuffer((doc) => {
      drawBracketHeader(doc, {
        palette: paletteDefault(), fonts: fonts(),
        brandName: 'Primal',
        tournamentName: 'Spring Championship 2026',
        categoryLabel: 'MMA · -65 kg',
        statusText: 'Status: Completed',
        seedingLabel: 'Draw: Rank-based',
        exportedAt: 'Exported 2026-04-24',
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawChampionCard renders a TBD placeholder without throwing', async () => {
    const buf = await renderToBuffer((doc) => {
      drawChampionCard(doc, {
        x: 300, y: 200, champion: null,
        palette: paletteDefault(), fonts: fonts(),
        width: 160, height: 60,
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  // ─── Analytics / Season composition (Phase 3) ────────────────────────────

  it('drawReportHeader returns a content-top Y greater than the page top margin', async () => {
    let returnedY = null;
    const buf = await renderToBuffer((doc) => {
      returnedY = drawReportHeader(doc, {
        palette: paletteDefault(), fonts: fonts(),
        brandName: 'Primal',
        title: 'Application Analytics',
        subtitle: 'Federation report',
        metaLines: ['Generated 2026-04-24', 'Discipline All'],
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
    expect(returnedY).toBeGreaterThan(72); // default page margin
    expect(returnedY).toBeLessThan(200);   // but still well above KPI strip
  });

  it('drawKpiStrip is grayscale-safe (no color-only state) and handles missing deltas', async () => {
    let extraPages = 0;
    const buf = await renderToBuffer((doc) => {
      doc.on('pageAdded', () => { extraPages += 1; });
      const nextY = drawKpiStrip(doc, {
        x: 28, y: 120, width: 780, palette: paletteDefault(), fonts: fonts(),
        kpis: [
          { label: 'Total', value: 210 },
          { label: 'Approved', value: 120, highlight: true, delta: '57% of total' },
          { label: 'Pending', value: 54 },
          { label: 'Rejected', value: 20 },
        ],
      });
      // Caller must be able to flow content below the strip
      expect(nextY).toBeGreaterThan(120);
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
    expect(extraPages).toBe(0);
  });

  it('drawStatusDistributionBar tolerates a zero-total segment list', async () => {
    const buf = await renderToBuffer((doc) => {
      drawStatusDistributionBar(doc, {
        x: 40, y: 400, width: 120, height: 8,
        palette: paletteDefault(),
        segments: [
          { tone: 'verify', count: 0 },
          { tone: 'ink', count: 0 },
          { tone: 'accent', count: 0 },
        ],
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawSparkline draws a flat baseline for all-zero values', async () => {
    const buf = await renderToBuffer((doc) => {
      drawSparkline(doc, {
        x: 40, y: 400, width: 100, height: 12,
        values: [0, 0, 0, 0, 0],
        palette: paletteDefault(),
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawDataTable uses custom column renderers and auto-scales widths', async () => {
    const p = paletteDefault();
    const rows = [
      { label: 'MMA',       statuses: { approved: 42, submitted: 8, total: 55 } },
      { label: 'BJJ',       statuses: { approved: 28, submitted: 6, total: 44 } },
    ];
    let extraPages = 0;
    const buf = await renderToBuffer((doc) => {
      doc.on('pageAdded', () => { extraPages += 1; });
      const y = drawDataTable(doc, {
        x: 40, y: 200, width: 500,
        title: 'By discipline',
        rows,
        columns: [
          { key: 'label', label: 'Discipline', width: 200 },
          { key: 'approved', label: 'Approved', width: 80, align: 'right',
            render: ({ doc: d, row, x, y: cy, width: cw }) => {
              d.save();
              d.fillColor(p.verify).font('Helvetica-Bold').fontSize(10);
              d.text(String(row.statuses.approved), x, cy + 5, {
                width: cw, align: 'right', lineBreak: false, height: 0,
              });
              d.restore();
            } },
          { key: 'distribution', label: 'Distribution', width: 220,
            render: ({ row, x, y: cy, width: cw }) => {
              drawStatusDistributionBar(doc, {
                x, y: cy + 2, width: cw, height: 8, palette: p,
                segments: [
                  { tone: 'verify', count: row.statuses.approved },
                  { tone: 'ink', count: row.statuses.submitted },
                ],
              });
            } },
        ],
        palette: p, fonts: fonts(),
      });
      expect(y).toBeGreaterThan(200);
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
    expect(extraPages).toBe(0);
  });

  it('drawDataTable renders the empty-state row when given no data', async () => {
    const buf = await renderToBuffer((doc) => {
      drawDataTable(doc, {
        x: 40, y: 200, width: 500,
        title: 'Matches', rows: [], columns: [{ key: 'a', label: 'A', width: 100 }],
        palette: paletteDefault(), fonts: fonts(),
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('drawBracketTree renders a full 4-round (16-fighter) elimination tree', async () => {
    const rounds = [
      { label: 'R16', matches: Array.from({ length: 8 }, (_, i) => ({
        sides: [
          { corner: 'blue', name: `Fighter ${i * 2 + 1}`, club: 'Club A', seedScore: i * 2 + 1 },
          { corner: 'red', name: `Fighter ${i * 2 + 2}`, club: 'Club B', seedScore: i * 2 + 2 },
        ],
        winnerIndex: 0,
      })) },
      { label: 'Quarter-final', matches: Array.from({ length: 4 }, (_, i) => ({
        sides: [
          { corner: 'blue', name: `Q${i}A`, club: 'Club A', seedScore: i * 4 + 1 },
          { corner: 'red', name: `Q${i}B`, club: 'Club B', seedScore: i * 4 + 3 },
        ],
        winnerIndex: 0,
      })) },
      { label: 'Semi-final', matches: Array.from({ length: 2 }, (_, i) => ({
        sides: [
          { corner: 'blue', name: `S${i}A`, club: 'Club A', seedScore: 1 },
          { corner: 'red', name: `S${i}B`, club: 'Club B', seedScore: 5 },
        ],
        winnerIndex: 0,
      })) },
      { label: 'Final', matches: [{
        sides: [
          { corner: 'blue', name: 'Champion A', club: 'Club A', seedScore: 1 },
          { corner: 'red', name: 'Champion B', club: 'Club B', seedScore: 5 },
        ],
        winnerIndex: 0,
      }] },
    ];
    let extraPages = 0;
    const buf = await renderToBuffer((doc) => {
      doc.on('pageAdded', () => { extraPages += 1; });
      drawBracketTree(doc, {
        rounds, x: 40, y: 100, width: 600, height: 400,
        palette: paletteDefault(), fonts: fonts(),
        slotWidth: 120,
        slotHeight: autoSlotHeight({ contentHeight: 400, firstRoundMatches: 8 }),
        matchGap: 0,
      });
    });
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF');
    // Tree rendering must never add pages — the composition is locked to the
    // caller-supplied rectangle.
    expect(extraPages).toBe(0);
  });
});
