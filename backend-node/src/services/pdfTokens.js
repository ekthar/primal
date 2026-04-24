/**
 * Shared PDF design tokens for Primal exports.
 *
 * Phase 0 (Foundations) of the Primal OS unified visual system. These tokens
 * are the authoritative source of truth for palette, paper color, page
 * metadata, page ribbon/footer, and deterministic export filenames. They are
 * consumed by backend-node/src/services/export.service.js so that every PDF
 * (Application, Analytics, Season, Bracket, DivisionBracket) shares the same
 * federation-grade visual language.
 *
 * Paper: near-white #FAFAF7 (toner friendly, accessibility safe in grayscale)
 * Ink:   #0A0A0A (structure + body text)
 * Accent: #7A1E22 ("Primal ink-red" — authority, federation credential feel)
 * Verify: #0F7B5C (digital verification seal)
 * Gold:  #C8A96A (championship / earned badge only — never UI chrome)
 */

const { config } = require('../config');

const BASE_TOKENS = Object.freeze({
  paper: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F0EA',
  ink: '#0A0A0A',
  text: '#0A0A0A',
  textMuted: '#5B6470',
  textTertiary: '#8B8F96',
  line: '#1D1F22',
  lineSoft: '#D9D6CE',
  cardBorder: '#1D1F22',
  accent: '#7A1E22',
  accentInk: '#7A1E22',
  verify: '#0F7B5C',
  gold: '#C8A96A',
  warn: '#9A6B1C',
  danger: '#7A1E22',
});

function normalizeHex(input, fallback) {
  const value = String(input || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value) || /^#[0-9a-fA-F]{3}$/.test(value)) return value;
  return fallback;
}

/**
 * Build the unified palette used across every PDF export.
 *
 * Respects optional env overrides (PDF_BRAND_PRIMARY, PDF_BRAND_ACCENT,
 * PDF_PAPER, PDF_INK) so operators can retune without a code change, while
 * providing a federation-grade default.
 */
function createPalette(cfg = config) {
  const pdfCfg = (cfg && cfg.pdf) || {};
  const primary = normalizeHex(pdfCfg.brandPrimary, BASE_TOKENS.ink);
  const accent = normalizeHex(pdfCfg.brandAccent, BASE_TOKENS.accent);
  const paper = normalizeHex(pdfCfg.paper, BASE_TOKENS.paper);
  const ink = normalizeHex(pdfCfg.ink, BASE_TOKENS.ink);

  return Object.freeze({
    ...BASE_TOKENS,
    paper,
    ink,
    text: ink,
    primary,
    accent,
    accentInk: accent,
    cardBorder: ink,
    line: ink,
  });
}

/**
 * Human-readable display title Primal shows in the PDF viewer chrome.
 *
 * pdfkit's `displayTitle: true` flag makes reader windows use `Info.Title`
 * instead of the (uuid-heavy) filename. We always provide a sensible one.
 */
function buildPdfInfo({ title, subject, brand, keywords = [], extraAuthor } = {}) {
  const brandName = brand || (config.pdf && config.pdf.brandName) || 'Primal';
  return {
    Title: title || `${brandName} export`,
    Author: extraAuthor ? `${brandName} (${extraAuthor})` : brandName,
    Subject: subject || 'Primal fight-operations export',
    Keywords: ['Primal', 'fight-operations', ...keywords].join(', '),
    Creator: `${brandName} · primal-export`,
    Producer: `${brandName} · pdfkit`,
  };
}

/**
 * Default pdfkit constructor options to produce accessible, federation-grade
 * PDFs. Callers spread these and override size/layout/margins as needed.
 */
function baseDocumentOptions({ title, subject, brand, keywords, lang = 'en-US' } = {}) {
  return {
    tagged: true,
    displayTitle: true,
    pdfVersion: '1.7',
    lang,
    bufferPages: true,
    info: buildPdfInfo({ title, subject, brand, keywords }),
  };
}

/**
 * Slugify an arbitrary string for filesystem/Content-Disposition usage.
 */
function slug(value, fallback = 'primal') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || fallback;
}

function isoDate(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Build a deterministic, human-readable export filename.
 *
 * Replaces `application-<uuid>.pdf` / `bracket-<uuid>.pdf` style filenames
 * with `primal_<tournament-slug>_<app-display-id>_<yyyy-mm-dd>.pdf` so that
 * bulk downloads are self-sorting in a Downloads folder.
 *
 *   buildExportFilename({
 *     type: 'application',
 *     tournamentName: 'Spring Championship',
 *     applicationDisplayId: 'PRM-00123',
 *   })
 *   // => primal_application_spring-championship_prm-00123_2026-04-24.pdf
 */
function buildExportFilename({
  type,
  tournamentName,
  tournamentId,
  applicationDisplayId,
  applicationId,
  bracketId,
  divisionId,
  discipline,
  brand,
  extra,
  date,
  extension = 'pdf',
} = {}) {
  const brandSlug = slug(brand || (config.pdf && config.pdf.brandName) || 'primal', 'primal');
  const parts = [brandSlug];
  if (type) parts.push(slug(type, 'export'));

  const tournamentSlug = slug(tournamentName || tournamentId || '', '');
  if (tournamentSlug) parts.push(tournamentSlug);

  if (discipline) parts.push(slug(discipline, ''));

  const idSlug = slug(
    applicationDisplayId || applicationId || bracketId || divisionId || '',
    '',
  );
  if (idSlug) parts.push(idSlug);

  if (extra) parts.push(slug(extra, ''));

  parts.push(isoDate(date));

  const cleaned = parts.filter(Boolean).join('_');
  return `${cleaned}.${extension}`;
}

/**
 * Append a uniform footer ribbon to every page in a buffered pdfkit document.
 *
 * Must be called once, AFTER all content has been laid out and BEFORE
 * `doc.end()`. Requires `bufferPages: true`.
 *
 * Renders:
 *   Primal · <identifier> · Page X of Y · <signature prefix> · <ISO ts>
 *
 * Using `palette.line` as a hairline separator 24pt above the bottom edge.
 */
function finalizePageRibbons(doc, {
  palette,
  fonts,
  brand,
  identifier = '',
  signatureShortId = '',
  generatedAt = new Date(),
  leftText,
  rightText,
} = {}) {
  const range = doc.bufferedPageRange();
  if (!range || !range.count) return;

  const brandName = brand || (config.pdf && config.pdf.brandName) || 'Primal';
  const ts = new Date(generatedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const fontBody = (fonts && fonts.body) || 'Helvetica';
  const fontBold = (fonts && fonts.bodyBold) || 'Helvetica-Bold';

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const y = doc.page.height - 24;

    // Subtle hairline separator
    doc.save();
    doc.lineWidth(0.5).strokeColor(palette.line).opacity(0.35);
    doc.moveTo(left, y - 6).lineTo(right, y - 6).stroke();
    doc.restore();

    doc.save();
    doc.fillColor(palette.textMuted).font(fontBody).fontSize(7);

    const center = `Page ${i - range.start + 1} of ${range.count}`;
    const leftLabel = leftText
      || [brandName, identifier].filter(Boolean).join(' · ');
    const rightLabel = rightText
      || [signatureShortId, ts].filter(Boolean).join(' · ');

    doc.text(leftLabel, left, y, { width: width / 3, align: 'left', lineBreak: false });
    doc.font(fontBold).fillColor(palette.text);
    doc.text(center, left + width / 3, y, { width: width / 3, align: 'center', lineBreak: false });
    doc.font(fontBody).fillColor(palette.textMuted);
    doc.text(rightLabel, left + (2 * width) / 3, y, { width: width / 3, align: 'right', lineBreak: false });
    doc.restore();
  }
}

/**
 * Short, human-friendly fingerprint for a PDF signature. Used on the page
 * ribbon so anyone looking at a printed artifact can cross-check provenance.
 */
function shortSignatureId(signature) {
  if (!signature) return '';
  const raw = String(signature.signature || signature.id || signature.url || '');
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned) return '';
  return cleaned.slice(0, 10).toUpperCase();
}

module.exports = {
  BASE_TOKENS,
  createPalette,
  buildPdfInfo,
  baseDocumentOptions,
  buildExportFilename,
  finalizePageRibbons,
  shortSignatureId,
  slug,
};
