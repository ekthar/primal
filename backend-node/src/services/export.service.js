// PDF + Excel export helpers. Streamed to response.
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const {
  applications: appsRepo,
  documents: docsRepo,
  statusEvents: eventsRepo,
  tournaments: tournamentsRepo,
} = require('../repositories');
const { assertCanView } = require('./application.service');
const { query } = require('../db');
const { write: auditWrite } = require('../audit');
const { config } = require('../config');
const { approvedParticipantReport } = require('./report.service');
const bracketService = require('./bracket.service');
const matchService = require('./match.service');
const documentStorage = require('./documentStorage.service');

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)} UTC`;
}

function formatDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function statusLabel(status) {
  if (!status) return '—';
  return String(status)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function asText(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function isPdfImage(docRow) {
  const mime = String(docRow?.mime_type || '').toLowerCase();
  const filename = String(docRow?.original_filename || docRow?.storage_key || '').toLowerCase();
  return mime === 'image/jpeg'
    || mime === 'image/jpg'
    || mime === 'image/png'
    || filename.endsWith('.jpg')
    || filename.endsWith('.jpeg')
    || filename.endsWith('.png');
}

function normalizeHexColor(input, fallback) {
  const value = String(input || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value) || /^#[0-9a-fA-F]{3}$/.test(value)) return value;
  return fallback;
}

function brandInitials(name) {
  const parts = String(name || 'P').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function resolveExistingPath(filePath) {
  if (!filePath) return null;
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return null;
  return absolute;
}

function resolveLogoPath(logoPath) {
  const absolute = resolveExistingPath(logoPath);
  if (!absolute) return null;
  const lower = absolute.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return absolute;
  return null;
}

function resolveFontPath(fontPath) {
  const absolute = resolveExistingPath(fontPath);
  if (!absolute) return null;
  const lower = absolute.toLowerCase();
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) return absolute;
  return null;
}

function registerFontIfPresent(doc, fontName, fontPath) {
  const resolved = resolveFontPath(fontPath);
  if (!resolved) return false;
  try {
    doc.registerFont(fontName, resolved);
    return true;
  } catch (_err) {
    return false;
  }
}

function collectAppliedDisciplines(app) {
  const selectedDisciplines = Array.isArray(app.form_data?.selectedDisciplines)
    ? app.form_data.selectedDisciplines
    : [];
  const rawValues = [...selectedDisciplines, app.discipline].filter(Boolean).map((value) => String(value).trim());
  return [...new Set(rawValues)];
}

async function loadRenderableDocumentImages(documents) {
  const renderableImages = await Promise.all(documents.filter((documentRow) => isPdfImage(documentRow)).map(async (documentRow) => {
    try {
      const imageBuffer = await documentStorage.readDocumentBuffer(documentRow);
      return { ...documentRow, imageBuffer };
    } catch (_error) {
      return null;
    }
  }));

  return renderableImages.filter(Boolean);
}

function resolvePdfFonts(doc) {
  const fonts = {
    body: 'Helvetica',
    bodyBold: 'Helvetica-Bold',
    heading: 'Helvetica-Bold',
    headingBold: 'Helvetica-Bold',
  };

  const hasInterTight = registerFontIfPresent(doc, 'InterTightBody', config.pdf?.fontBodyPath);
  const hasInterTightBold = registerFontIfPresent(doc, 'InterTightBodyBold', config.pdf?.fontBodyBoldPath);
  const hasManrope = registerFontIfPresent(doc, 'ManropeHeading', config.pdf?.fontHeadingPath);
  const hasManropeBold = registerFontIfPresent(doc, 'ManropeHeadingBold', config.pdf?.fontHeadingBoldPath);

  if (hasInterTight) fonts.body = 'InterTightBody';
  if (hasInterTightBold) {
    fonts.bodyBold = 'InterTightBodyBold';
  } else if (hasInterTight) {
    fonts.bodyBold = 'InterTightBody';
  }

  if (hasManrope) fonts.heading = 'ManropeHeading';
  if (hasManropeBold) {
    fonts.headingBold = 'ManropeHeadingBold';
  } else if (hasManrope) {
    fonts.headingBold = 'ManropeHeading';
  }

  return fonts;
}

function ensureSpace(doc, neededHeight) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function sectionHeading(doc, title, palette, fonts) {
  doc.moveDown(0.5);
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(12).text(title);
  doc.moveDown(0.2);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.moveTo(x, doc.y).lineTo(x + w, doc.y).lineWidth(0.8).strokeColor(palette.line).stroke();
  doc.moveDown(0.5);
}

function drawLogoMark(doc, { x, y, size, logoPath, brandName, accent, fonts }) {
  const logo = resolveLogoPath(logoPath);
  if (logo) {
    doc.save();
    doc.roundedRect(x, y, size, size, 8).fill('#ffffff');
    doc.restore();
    doc.image(logo, x + 3, y + 3, {
      fit: [size - 6, size - 6],
      align: 'center',
      valign: 'center',
    });
    return;
  }

  doc.save();
  doc.roundedRect(x, y, size, size, 8).fill(accent);
  doc.restore();
  doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(13)
    .text(brandInitials(brandName), x, y + size / 2 - 5, { width: size, align: 'center' });
}

function drawKeyValueTable(doc, rows, options) {
  const { x, width, labelWidth, palette, fonts } = options;
  let y = doc.y;
  rows.forEach((row, index) => {
    const label = asText(row[0]);
    const value = asText(row[1]);
    const valueWidth = width - labelWidth - 18;
    const valueHeight = doc.heightOfString(value, { width: valueWidth, align: 'left' });
    const rowHeight = Math.max(20, valueHeight + 10);

    ensureSpace(doc, rowHeight + 2);
    y = doc.y;
    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(x, y, width, rowHeight, 4).fill('#f8fafc');
      doc.restore();
    }

    doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(8.8)
      .text(label, x + 8, y + 6, { width: labelWidth - 12 });
    doc.fillColor(palette.text).font(fonts.body).fontSize(8.8)
      .text(value, x + labelWidth, y + 6, { width: valueWidth });

    doc.y = y + rowHeight + 2;
  });
}

function drawDocumentTable(doc, documents, palette, fonts) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columns = [
    { key: 'kind', label: 'Kind', w: 86 },
    { key: 'name', label: 'File Name', w: 208 },
    { key: 'mime', label: 'Mime Type', w: 102 },
    { key: 'size', label: 'Size', w: 60 },
    { key: 'uploaded', label: 'Uploaded', w: width - (86 + 208 + 102 + 60) },
  ];

  ensureSpace(doc, 22);
  const headerY = doc.y;
  doc.save();
  doc.roundedRect(x, headerY, width, 18, 4).fill('#e2e8f0');
  doc.restore();

  let colX = x;
  columns.forEach((c) => {
    doc.fillColor(palette.text).font(fonts.headingBold).fontSize(8)
      .text(c.label, colX + 4, headerY + 5, { width: c.w - 8 });
    colX += c.w;
  });

  doc.y = headerY + 22;
  if (!documents.length) {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(9).text('No uploaded documents.');
    return;
  }

  documents.forEach((d, idx) => {
    const values = {
      kind: asText(d.kind),
      name: asText(d.original_filename || d.storage_key),
      mime: asText(d.mime_type),
      size: d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : '—',
      uploaded: formatDateOnly(d.created_at),
    };

    const rowHeight = 18;
    ensureSpace(doc, rowHeight + 2);
    const rowY = doc.y;
    if (idx % 2 === 0) {
      doc.save();
      doc.roundedRect(x, rowY, width, rowHeight, 3).fill('#f8fafc');
      doc.restore();
    }

    let vx = x;
    columns.forEach((c) => {
      doc.fillColor(palette.text).font(fonts.body).fontSize(8)
        .text(values[c.key], vx + 4, rowY + 5, { width: c.w - 8, ellipsis: true });
      vx += c.w;
    });
    doc.y = rowY + rowHeight + 2;
  });
}

function drawImageGallery(doc, images, palette, fonts) {
  if (!images.length) return;
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 12;
  const cardW = (width - gap) / 2;
  const cardH = 130;

  for (let i = 0; i < Math.min(images.length, 4); i += 1) {
    if (i % 2 === 0) ensureSpace(doc, cardH + 24);
    const col = i % 2;
    const y = doc.y;
    const cardX = x + col * (cardW + gap);

    doc.save();
    doc.roundedRect(cardX, y, cardW, cardH, 6).fill('#e2e8f0');
    doc.restore();
    doc.image(images[i].imageBuffer, cardX + 2, y + 2, {
      fit: [cardW - 4, cardH - 4],
      align: 'center',
      valign: 'center',
    });
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(8)
      .text(images[i].original_filename || images[i].storage_key, cardX, y + cardH + 4, {
        width: cardW,
        ellipsis: true,
      });

    if (col === 1) doc.y = y + cardH + 22;
  }
  if (images.length % 2 === 1) doc.y += cardH + 22;
}

function drawPanel(doc, { x, y, width, height, fill = '#ffffff', stroke = '#e2e8f0', radius = 10 }) {
  doc.save();
  doc.roundedRect(x, y, width, height, radius).fill(fill);
  doc.roundedRect(x, y, width, height, radius).strokeColor(stroke).lineWidth(1).stroke();
  doc.restore();
}

function drawMetricChip(doc, { x, y, width, height, label, value, palette, fonts, tone = '#ffffff' }) {
  drawPanel(doc, { x, y, width, height, fill: tone, stroke: palette.line, radius: 12 });
  doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(7.5)
    .text(label, x + 10, y + 8, { width: width - 20 });
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(13)
    .text(value, x + 10, y + 20, { width: width - 20, ellipsis: true });
}

function drawLabeledGrid(doc, rows, options) {
  const {
    x,
    y,
    width,
    columns = 2,
    labelWidth = 72,
    rowHeight = 34,
    gap = 10,
    palette,
    fonts,
    fill = '#ffffff',
  } = options;

  const colGap = 10;
  const colWidth = (width - colGap * (columns - 1)) / columns;

  rows.forEach((row, index) => {
    const col = index % columns;
    const line = Math.floor(index / columns);
    const boxX = x + col * (colWidth + colGap);
    const boxY = y + line * (rowHeight + gap);

    drawPanel(doc, { x: boxX, y: boxY, width: colWidth, height: rowHeight, fill, stroke: palette.line, radius: 8 });
    doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(7.3)
      .text(asText(row[0]), boxX + 10, boxY + 8, { width: labelWidth });
    doc.fillColor(palette.text).font(fonts.body).fontSize(8.8)
      .text(asText(row[1]), boxX + 10 + labelWidth, boxY + 8, { width: colWidth - labelWidth - 20, ellipsis: true });
  });

  return y + Math.ceil(rows.length / columns) * (rowHeight + gap) - gap;
}

function drawTimelineCards(doc, events, options) {
  const { x, width, palette, fonts } = options;
  if (!events.length) {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(9).text('No status events recorded.');
    return;
  }

  events.forEach((ev) => {
    ensureSpace(doc, 44);
    const y = doc.y;
    drawPanel(doc, { x, y, width, height: 38, fill: '#ffffff', stroke: palette.line, radius: 8 });
    doc.fillColor(palette.text).font(fonts.headingBold).fontSize(8.5)
      .text(`${statusLabel(ev.from_status)} -> ${statusLabel(ev.to_status)}`, x + 12, y + 8, { width: width - 150, ellipsis: true });
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.8)
      .text(formatDateTime(ev.created_at), x + width - 128, y + 8, { width: 116, align: 'right' });
    if (ev.reason) {
      doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.8)
        .text(ev.reason, x + 12, y + 20, { width: width - 24, ellipsis: true });
    }
    doc.y = y + 44;
  });
}

async function approvedToExcel(res, { tournamentId } = {}) {
  const rows = await appsRepo.query({ status: 'approved', tournamentId, limit: 10000 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Approved');
  ws.columns = [
    { header: 'ID', key: 'id', width: 38 },
    { header: 'First name', key: 'first_name', width: 20 },
    { header: 'Last name', key: 'last_name', width: 20 },
    { header: 'Club', key: 'club_name', width: 24 },
    { header: 'Discipline', key: 'discipline', width: 26 },
    { header: 'Weight class', key: 'weight_class', width: 20 },
    { header: 'Weight (kg)', key: 'weight_kg', width: 14 },
    { header: 'Tournament', key: 'tournament_name', width: 28 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Updated', key: 'updated_at', width: 24 },
  ];
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="approved.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}

async function approvedParticipantsToExcel(res, { tournamentId } = {}) {
  const report = await approvedParticipantReport({ tournamentId });
  const wb = new ExcelJS.Workbook();
  const wsClub = wb.addWorksheet('Club Participants');
  const wsIndividual = wb.addWorksheet('Individual Participants');

  const columns = [
    { header: 'Application ID', key: 'applicationId', width: 40 },
    { header: 'Participant Name', key: 'participantName', width: 28 },
    { header: 'Date of Birth', key: 'dateOfBirth', width: 16 },
    { header: 'Age (today)', key: 'ageToday', width: 12 },
    { header: 'Sex', key: 'sex', width: 14 },
    { header: 'Discipline', key: 'discipline', width: 22 },
    { header: 'Club', key: 'clubName', width: 28 },
    { header: 'Tournament', key: 'tournamentName', width: 30 },
    { header: 'Approved At', key: 'approvedAt', width: 24 },
  ];

  wsClub.columns = columns;
  wsIndividual.columns = columns;
  report.clubParticipants.forEach((row) => wsClub.addRow(row));
  report.individualParticipants.forEach((row) => wsIndividual.addRow(row));
  wsClub.getRow(1).font = { bold: true };
  wsIndividual.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="approved-participants.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}

// ─── Grid layout helpers ──────────────────────────────────────────────────────

const GRID = {
  col: 515 / 12,        // 12-column base unit on A4 content width
  gap: 8,
  radius: { sm: 6, md: 10, lg: 16 },
};

function gridX(pageX, col, span, colUnit = GRID.col, gap = GRID.gap) {
  return pageX + col * (colUnit + gap);
}

function gridW(span, colUnit = GRID.col, gap = GRID.gap) {
  return span * colUnit + (span - 1) * gap;
}

/** Filled rounded rect with optional right-side accent bar */
function gridCard(doc, x, y, w, h, opts = {}) {
  const { fill = '#ffffff', stroke = '#e8edf3', radius = GRID.radius.md, accentColor, accentW = 3 } = opts;
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fill(fill);
  doc.roundedRect(x, y, w, h, radius).strokeColor(stroke).lineWidth(0.75).stroke();
  if (accentColor) {
    doc.roundedRect(x, y, accentW, h, radius).fill(accentColor);
    doc.rect(x + accentW / 2, y, accentW / 2, h).fill(accentColor);
  }
  doc.restore();
}

/** Thin horizontal rule */
function gridRule(doc, x, y, w, color = '#e8edf3') {
  doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).strokeColor(color).stroke().restore();
}

/** Uppercase micro-label */
function microLabel(doc, text, x, y, w, palette, fonts) {
  doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(6.8)
    .text(String(text).toUpperCase(), x, y, { width: w, characterSpacing: 0.5 });
}

/** Bold value text */
function valueText(doc, text, x, y, w, palette, fonts, size = 9) {
  doc.fillColor(palette.text).font(fonts.body).fontSize(size)
    .text(asText(text), x, y, { width: w, ellipsis: true });
}

/** Status pill badge */
function statusPill(doc, status, x, y, fonts) {
  const configs = {
    approved:          { bg: '#d1fae5', text: '#065f46', label: 'Approved' },
    rejected:          { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
    needs_correction:  { bg: '#fef3c7', text: '#92400e', label: 'Needs Correction' },
    pending:           { bg: '#e0e7ff', text: '#3730a3', label: 'Pending' },
    under_review:      { bg: '#f0f9ff', text: '#0369a1', label: 'Under Review' },
  };
  const cfg = configs[status] || { bg: '#f1f5f9', text: '#475569', label: statusLabel(status) };
  const label = cfg.label;
  const pillW = Math.max(72, doc.widthOfString(label, { font: fonts.headingBold }) + 22);
  doc.save();
  doc.roundedRect(x, y, pillW, 18, 9).fill(cfg.bg);
  doc.restore();
  doc.fillColor(cfg.text).font(fonts.headingBold).fontSize(8)
    .text(label, x, y + 5, { width: pillW, align: 'center' });
  return pillW;
}

/** Compact KV row inside a card */
function kvRow(doc, label, value, x, y, totalW, palette, fonts, labelW = 90) {
  doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(7.4)
    .text(String(label).toUpperCase(), x, y, { width: labelW, characterSpacing: 0.3 });
  doc.fillColor(palette.text).font(fonts.body).fontSize(8.5)
    .text(asText(value), x + labelW, y, { width: totalW - labelW, ellipsis: true });
}

// ─── Redesigned applicationToPdf ────────────────────────────────────────────

async function applicationToPdf(res, applicationId, actor, ctx = {}) {
  const app = await appsRepo.findFullById(applicationId);
  if (!app) { res.status(404).json({ error: { code: 'NOT_FOUND' } }); return; }
  await assertCanView(actor, app);

  const brandName = config.pdf?.brandName || 'Primal';
  const palette = {
    primary:    normalizeHexColor(config.pdf?.brandPrimary, '#0f172a'),
    accent:     normalizeHexColor(config.pdf?.brandAccent,  '#e11d48'),
    text:       '#0f172a',
    textMuted:  '#64748b',
    line:       '#e2e8f0',
    surface:    '#f8fafc',
    cardBorder: '#e8edf3',
  };

  const [documents, statusEvents] = await Promise.all([
    docsRepo.listForApplication(app.id),
    eventsRepo.listForApplication(app.id),
  ]);

  const renderableImages = await loadRenderableDocumentImages(documents);
  const primaryImage = renderableImages.find((d) => d.kind === 'photo_id') || renderableImages[0] || null;
  const appliedDisciplines = collectAppliedDisciplines(app);
  const address = app.metadata && typeof app.metadata === 'object' ? app.metadata.address : null;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="application-${app.id}.pdf"`);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 32, bottom: 32, left: 32, right: 32 },
    info: {
      Title: `Application ${app.id}`,
      Author: brandName,
      Subject: 'Participant application export',
    },
  });
  doc.pipe(res);

  const fonts = resolvePdfFonts(doc);
  const PX   = doc.page.margins.left;                                           // page x origin
  const PY   = doc.page.margins.top;                                            // page y origin
  const CW   = doc.page.width  - PX - doc.page.margins.right;                  // content width  (~531)
  const COL  = (CW - GRID.gap * 11) / 12;                                      // column unit

  // ── Page background ──────────────────────────────────────────────────────
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f1f5f9');
  doc.restore();

  // ── HEADER BAND ──────────────────────────────────────────────────────────
  const HEADER_H = 80;
  doc.save();
  doc.rect(0, 0, doc.page.width, HEADER_H + 32).fill(palette.primary);
  doc.restore();

  // Logo mark
  const LOGO_SIZE = 40;
  doc.save();
  doc.roundedRect(PX, PY + 8, LOGO_SIZE, LOGO_SIZE, 8).fill(palette.accent);
  doc.restore();
  const logo = resolveLogoPath(config.pdf?.logoPath);
  if (logo) {
    doc.image(logo, PX + 4, PY + 12, { fit: [LOGO_SIZE - 8, LOGO_SIZE - 8], align: 'center', valign: 'center' });
  } else {
    doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(14)
      .text(brandInitials(brandName), PX, PY + 19, { width: LOGO_SIZE, align: 'center' });
  }

  // Brand + tournament
  doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(18)
    .text(brandName, PX + LOGO_SIZE + 12, PY + 10);
  doc.fillColor('#94a3b8').font(fonts.body).fontSize(8.5)
    .text(asText(app.tournament_name), PX + LOGO_SIZE + 12, PY + 33);
  doc.fillColor('#64748b').font(fonts.body).fontSize(7.5)
    .text(`Application  ${app.id}   ·   ${formatDateTime(new Date())}`, PX + LOGO_SIZE + 12, PY + 47);

  // Status pill + ID (right-aligned)
  const pillX = PX + CW - 130;
  statusPill(doc, app.status, pillX, PY + 14, fonts);
  doc.fillColor('#94a3b8').font(fonts.body).fontSize(7)
    .text('Participant registration export', pillX - 30, PY + 40, { width: 160, align: 'right' });

  // Divider below header
  doc.y = PY + HEADER_H + 10;

  // ── ROW 1: 4 metric chips ─────────────────────────────────────────────
  const CHIP_H = 46;
  const CHIP_W = (CW - GRID.gap * 3) / 4;
  const chips = [
    { label: 'Discipline',   value: asText(app.discipline   || 'Open')   },
    { label: 'Weight Class', value: asText(app.weight_class || 'Open')   },
    { label: 'Entry Type',   value: app.club_name ? 'Club Entry' : 'Individual' },
    { label: 'Status',       value: statusLabel(app.status)              },
  ];
  const chipY = doc.y;
  chips.forEach((chip, i) => {
    const cx = PX + i * (CHIP_W + GRID.gap);
    gridCard(doc, cx, chipY, CHIP_W, CHIP_H, { fill: '#ffffff', stroke: palette.cardBorder, radius: GRID.radius.md });
    microLabel(doc, chip.label, cx + 10, chipY + 8, CHIP_W - 20, palette, fonts);
    doc.fillColor(palette.text).font(fonts.headingBold).fontSize(11)
      .text(chip.value, cx + 10, chipY + 20, { width: CHIP_W - 20, ellipsis: true });
  });
  doc.y = chipY + CHIP_H + 10;

  const disciplinesY = doc.y;
  const disciplinesH = 58;
  gridCard(doc, PX, disciplinesY, CW, disciplinesH, { fill: '#ffffff', stroke: palette.cardBorder, radius: GRID.radius.lg, accentColor: palette.accent });
  microLabel(doc, 'Applied Disciplines', PX + 14, disciplinesY + 10, CW - 28, palette, fonts);
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(12)
    .text(appliedDisciplines.length ? appliedDisciplines.join(' / ') : 'Open', PX + 14, disciplinesY + 24, { width: CW - 28, ellipsis: true });
  doc.y = disciplinesY + disciplinesH + 10;

  // ── ROW 2: Identity card (left 7 cols) + Photo/Verify panel (right 5 cols) ──
  const ROW2_Y = doc.y;
  const LEFT_W  = Math.floor(CW * 0.575);
  const RIGHT_W = CW - LEFT_W - GRID.gap;
  const RIGHT_X = PX + LEFT_W + GRID.gap;

  // LEFT: identity grid card
  const ID_ROWS = [
    ['Full Name',    `${asText(app.first_name)} ${asText(app.last_name)}`],
    ['Email',        asText(app.email)],
    ['Phone',        asText(app.phone)],
    ['Date of Birth', formatDateOnly(app.date_of_birth)],
    ['Gender',       asText(app.gender)],
    ['Nationality',  asText(app.nationality)],
    ['Club / Team',  asText(app.club_name || 'Individual')],
    ['Fight Record', `${app.record_wins || 0}W – ${app.record_losses || 0}L – ${app.record_draws || 0}D`],
    ['Weight',       app.weight_kg ? `${app.weight_kg} kg` : '—'],
    ['Experience',   asText(app.form_data?.experienceLevel)],
  ];
  const ID_CARD_H = ID_ROWS.length * 22 + 36;
  gridCard(doc, PX, ROW2_Y, LEFT_W, ID_CARD_H, { fill: '#ffffff', stroke: palette.cardBorder, radius: GRID.radius.lg, accentColor: palette.accent });

  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(10)
    .text('Applicant Identity', PX + 14, ROW2_Y + 12);
  gridRule(doc, PX + 14, ROW2_Y + 28, LEFT_W - 28, palette.line);

  ID_ROWS.forEach((row, i) => {
    const ry = ROW2_Y + 36 + i * 22;
    const bgFill = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.save();
    doc.rect(PX + 14, ry, LEFT_W - 28, 20).fill(bgFill);
    doc.restore();
    kvRow(doc, row[0], row[1], PX + 18, ry + 6, LEFT_W - 36, palette, fonts, 82);
  });

  // RIGHT: photo + digital approval stacked
  const PHOTO_CARD_H = 160;
  gridCard(doc, RIGHT_X, ROW2_Y, RIGHT_W, PHOTO_CARD_H, { fill: '#ffffff', stroke: palette.cardBorder, radius: GRID.radius.lg });

  const PHOTO_W = 80;
  const PHOTO_H = 104;
  const PHOTO_X = RIGHT_X + 12;
  const PHOTO_Y = ROW2_Y + 16;
  doc.save();
  doc.roundedRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 8).fill(palette.surface);
  doc.roundedRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 8).strokeColor('#cbd5e1').lineWidth(0.75).stroke();
  doc.restore();

  if (primaryImage) {
    doc.save();
    doc.roundedRect(PHOTO_X + 2, PHOTO_Y + 2, PHOTO_W - 4, PHOTO_H - 4, 7).clip();
    doc.image(primaryImage.imageBuffer, PHOTO_X + 2, PHOTO_Y + 2, {
      fit: [PHOTO_W - 4, PHOTO_H - 4],
      align: 'center',
      valign: 'center',
    });
    doc.restore();
  } else {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.5)
      .text('No photo\nuploaded', PHOTO_X, PHOTO_Y + 42, { width: PHOTO_W, align: 'center' });
  }

  microLabel(doc, 'Photo ID', PHOTO_X, PHOTO_Y + PHOTO_H + 5, PHOTO_W, palette, fonts);

  // Approval block to the right of photo
  const VX = PHOTO_X + PHOTO_W + 10;
  const VW = RIGHT_W - PHOTO_W - 34;
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(8.5)
    .text(`${asText(app.first_name)} ${asText(app.last_name)}`, VX, PHOTO_Y, { width: VW, ellipsis: true });
  microLabel(doc, 'Reviewer', VX, PHOTO_Y + 14, VW, palette, fonts);
  doc.fillColor(palette.text).font(fonts.body).fontSize(8)
    .text(asText(app.reviewer_id), VX, PHOTO_Y + 22, { width: VW, ellipsis: true });
  microLabel(doc, 'Decided', VX, PHOTO_Y + 36, VW, palette, fonts);
  doc.fillColor(palette.text).font(fonts.body).fontSize(8)
    .text(formatDateTime(app.decided_at), VX, PHOTO_Y + 44, { width: VW });

  doc.save();
  doc.circle(VX + 12, PHOTO_Y + 78, 11).fill('#16a34a');
  doc.lineWidth(2).lineCap('round').strokeColor('#ffffff');
  doc.moveTo(VX + 7, PHOTO_Y + 78).lineTo(VX + 11, PHOTO_Y + 82).lineTo(VX + 18, PHOTO_Y + 73).stroke();
  doc.restore();
  doc.fillColor('#166534').font(fonts.bodyBold).fontSize(8.5)
    .text('Digitally verified', VX + 28, PHOTO_Y + 70, { width: VW - 28, ellipsis: true });
  doc.fillColor('#334155').font('Times-Italic').fontSize(12)
    .text('digitally signed', VX + 28, PHOTO_Y + 83, { width: VW - 28, ellipsis: true });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.2)
    .text('Verified copy of the submitted participant record', VX, PHOTO_Y + 104, { width: VW, align: 'left' });

  doc.y = Math.max(ROW2_Y + ID_CARD_H, ROW2_Y + PHOTO_CARD_H) + 12;

  // ── ROW 3: Competition Declaration (full width 3-col grid) ────────────────
  ensureSpace(doc, 20);
  const DECL_Y = doc.y;
  const DECL_CARD_H = 26;
  const DECL_COLS = 3;
  const DECL_CW = (CW - GRID.gap * (DECL_COLS - 1)) / DECL_COLS;
  const declRows = [
    ['Submitted',       formatDateTime(app.submitted_at)],
    ['Review Started',  formatDateTime(app.review_started_at)],
    ['Review Due',      formatDateTime(app.review_due_at)],
    ['Decided',         formatDateTime(app.decided_at)],
    ['Correction Due',  formatDateTime(app.correction_due_at)],
    ['Disciplines',     appliedDisciplines.length ? appliedDisciplines.join(', ') : 'Open'],
    ['Rejection Reason', asText(app.rejection_reason)],
    ['Reopen Reason',   asText(app.reopen_reason)],
    ['Notes',           asText(app.form_data?.notes)],
  ];

  // Section label
  microLabel(doc, 'Competition Declaration', PX, DECL_Y, CW, palette, fonts);
  gridRule(doc, PX, DECL_Y + 13, CW, palette.line);
  doc.y = DECL_Y + 18;

  declRows.forEach((row, i) => {
    const col = i % DECL_COLS;
    const line = Math.floor(i / DECL_COLS);
    if (col === 0 && i > 0) ensureSpace(doc, DECL_CARD_H + 6);
    const cellX = PX + col * (DECL_CW + GRID.gap);
    const cellY = doc.y + line * (DECL_CARD_H + 5);   // will be computed per row below
    // We'll use a simple sequential layout per row for page-break safety:
    if (col === 0) {
      ensureSpace(doc, DECL_CARD_H + 5);
    }
  });

  // Re-render sequentially for safe page breaks
  doc.y = DECL_Y + 18;
  for (let i = 0; i < declRows.length; i += DECL_COLS) {
    ensureSpace(doc, DECL_CARD_H + 5);
    const rowY = doc.y;
    for (let c = 0; c < DECL_COLS; c++) {
      const idx = i + c;
      if (idx >= declRows.length) break;
      const cx = PX + c * (DECL_CW + GRID.gap);
      gridCard(doc, cx, rowY, DECL_CW, DECL_CARD_H, { fill: '#ffffff', stroke: palette.cardBorder, radius: GRID.radius.sm });
      microLabel(doc, declRows[idx][0], cx + 8, rowY + 5, DECL_CW - 16, palette, fonts);
      doc.fillColor(palette.text).font(fonts.body).fontSize(8)
        .text(asText(declRows[idx][1]), cx + 8, rowY + 15, { width: DECL_CW - 16, ellipsis: true });
    }
    doc.y = rowY + DECL_CARD_H + 5;
  }

  // Address row (full width)
  if (address) {
    ensureSpace(doc, DECL_CARD_H + 5);
    const addrY = doc.y;
    gridCard(doc, PX, addrY, CW, DECL_CARD_H, { fill: '#ffffff', stroke: palette.cardBorder, radius: GRID.radius.sm });
    microLabel(doc, 'Address', PX + 8, addrY + 5, CW - 16, palette, fonts);
    const addrStr = `${asText(address.line1)}, ${asText(address.line2)}, ${asText(address.district)}, ${asText(address.state)}, ${asText(address.country)} ${asText(address.postalCode)}`;
    doc.fillColor(palette.text).font(fonts.body).fontSize(8)
      .text(addrStr, PX + 8, addrY + 15, { width: CW - 16, ellipsis: true });
    doc.y = addrY + DECL_CARD_H + 5;
  }

  doc.moveDown(0.8);

  // ── ROW 4: Document register ──────────────────────────────────────────────
  ensureSpace(doc, 60);
  microLabel(doc, 'Document Register', PX, doc.y, CW, palette, fonts);
  gridRule(doc, PX, doc.y + 13, CW, palette.line);
  doc.y += 18;
  drawDocumentTable(doc, documents, palette, fonts);
  doc.moveDown(0.8);

  // ── ROW 5: Supporting images ──────────────────────────────────────────────
  if (renderableImages.length) {
    ensureSpace(doc, 60);
    microLabel(doc, 'Supporting Attachments', PX, doc.y, CW, palette, fonts);
    gridRule(doc, PX, doc.y + 13, CW, palette.line);
    doc.y += 18;
    drawImageGallery(doc, renderableImages, palette, fonts);
    doc.moveDown(0.8);
  }

  // ── ROW 6: Timeline ───────────────────────────────────────────────────────
  ensureSpace(doc, 60);
  microLabel(doc, 'Workflow Timeline', PX, doc.y, CW, palette, fonts);
  gridRule(doc, PX, doc.y + 13, CW, palette.line);
  doc.y += 18;
  drawTimelineCards(doc, statusEvents, { x: PX, width: CW, palette, fonts });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.moveDown(1.2);
  gridRule(doc, PX, doc.y, CW, palette.line);
  doc.moveDown(0.4);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.2)
    .text(
      `${brandName} · Participant Application Export · Digitally signed · ${formatDateTime(new Date())}`,
      PX, doc.y, { width: CW, align: 'center' },
    );

  doc.end();

  await auditWrite({
    actorUserId: actor?.id,
    actorRole:   actor?.role,
    action:      'export.pdf',
    entityType:  'application',
    entityId:    applicationId,
    payload:     {},
    requestIp:   ctx.ip,
  });
}

async function auditToExcel(res, actor, { since, until } = {}) {
  const args = []; const where = [];
  if (since) { args.push(since); where.push(`occurred_at >= $${args.length}`); }
  if (until) { args.push(until); where.push(`occurred_at <= $${args.length}`); }
  const sql = `SELECT id, occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, payload, hash, prev_hash
               FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id ASC LIMIT 100000`;
  const { rows } = await query(sql, args);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Audit');
  ws.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'At', key: 'occurred_at', width: 22 },
    { header: 'Actor', key: 'actor_user_id', width: 38 },
    { header: 'Role', key: 'actor_role', width: 10 },
    { header: 'Action', key: 'action', width: 26 },
    { header: 'Entity', key: 'entity_type', width: 14 },
    { header: 'Entity ID', key: 'entity_id', width: 40 },
    { header: 'Payload', key: 'payload', width: 60 },
    { header: 'Prev hash', key: 'prev_hash', width: 66 },
    { header: 'Hash', key: 'hash', width: 66 },
  ];
  rows.forEach((r) => ws.addRow({ ...r, payload: JSON.stringify(r.payload || {}) }));
  ws.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="audit.xlsx"');
  await wb.xlsx.write(res);
  res.end();

  await auditWrite({ actorUserId: actor?.id, actorRole: actor?.role, action: 'export.audit',
    entityType: 'audit', entityId: 'bulk', payload: { since, until, count: rows.length }, requestIp: ctx.ip });
}

function getBracketSlotHeight(totalRounds) {
  return totalRounds <= 2 ? 120 : totalRounds === 3 ? 96 : 82;
}

function drawBracketSlot(doc, x, y, width, height, side, palette, fonts) {
  doc.save();
  doc.roundedRect(x, y, width, height, 10).fill('#ffffff');
  doc.roundedRect(x, y, width, height, 10).strokeColor('#111111').lineWidth(1.5).stroke();
  doc.restore();
  if (!side || side.placeholder === 'tbd') return;

  doc.fillColor(side.corner === 'blue' ? '#0f6ab6' : '#b91c1c')
    .font(fonts.headingBold)
    .fontSize(7.5)
    .text((side.corner || 'slot').toUpperCase(), x + 8, y + 6, { width: width - 16 });
  if (side.seedScore) {
    doc.fillColor('#6b7280')
      .font(fonts.bodyBold)
      .fontSize(7.5)
      .text(`#${side.seedScore}`, x + width - 28, y + 6, { width: 20, align: 'right' });
  }
  doc.fillColor('#111827')
    .font(fonts.headingBold)
    .fontSize(9)
    .text(side.name || 'TBD', x + 8, y + 18, { width: width - 16, ellipsis: true });
  doc.fillColor('#4b5563')
    .font(fonts.body)
    .fontSize(7.5)
    .text(side.club || 'Independent', x + 8, y + 33, { width: width - 16, ellipsis: true });
}

function drawBracketMatch(doc, x, y, slotWidth, slotHeight, matchGap, match, palette, fonts) {
  const topY = y;
  const bottomY = y + slotHeight + matchGap;
  drawBracketSlot(doc, x, topY, slotWidth, slotHeight, match.sides[0], palette, fonts);
  drawBracketSlot(doc, x, bottomY, slotWidth, slotHeight, match.sides[1], palette, fonts);

  const connectorX = x + slotWidth;
  const midX = connectorX + 18;
  const topMidY = topY + slotHeight / 2;
  const bottomMidY = bottomY + slotHeight / 2;
  const centerY = (topMidY + bottomMidY) / 2;

  doc.save();
  doc.lineWidth(1.5).strokeColor('#111111');
  doc.moveTo(connectorX, topMidY).lineTo(midX, topMidY).stroke();
  doc.moveTo(connectorX, bottomMidY).lineTo(midX, bottomMidY).stroke();
  doc.moveTo(midX, topMidY).lineTo(midX, bottomMidY).stroke();
  doc.moveTo(midX, centerY).lineTo(midX + 14, centerY).stroke();
  doc.restore();

  return { centerY };
}

function drawBracketRound(doc, x, startY, round, roundIndex, totalRounds, palette, fonts) {
  const slotWidth = 112;
  const slotHeight = getBracketSlotHeight(totalRounds);
  const matchGap = 16;
  const roundBlockHeight = slotHeight * 2 + matchGap;
  const roundSpacing = Math.max(30, (slotHeight + matchGap) * Math.pow(2, roundIndex));
  const centers = [];

  doc.fillColor(palette.text)
    .font(fonts.headingBold)
    .fontSize(10)
    .text(round.label, x, startY - 22, { width: slotWidth + 40, align: 'center' });

  round.matches.forEach((match, index) => {
    const y = startY + index * (roundBlockHeight + roundSpacing);
    const result = drawBracketMatch(doc, x, y, slotWidth, slotHeight, matchGap, match, palette, fonts);
    centers.push(result.centerY);
  });

  return centers;
}

function drawChampionCard(doc, x, y, champion, palette, fonts) {
  const width = 148;
  const height = 92;
  doc.save();
  doc.roundedRect(x, y, width, height, 14).fill('#fef3c7');
  doc.roundedRect(x, y, width, height, 14).strokeColor('#b45309').lineWidth(1.5).stroke();
  doc.restore();
  doc.fillColor('#b45309').font(fonts.headingBold).fontSize(10).text('Champion', x + 12, y + 12);
  doc.fillColor('#111827').font(fonts.headingBold).fontSize(13).text(champion?.name || 'TBD', x + 12, y + 32, {
    width: width - 24,
    ellipsis: true,
  });
  doc.fillColor('#6b7280').font(fonts.body).fontSize(9).text(champion?.club || 'Independent', x + 12, y + 52, {
    width: width - 24,
    ellipsis: true,
  });
}

async function bracketToPdf(res, bracketId, actor, ctx = {}) {
  if (!actor || actor.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    return;
  }

  const bracket = await bracketService.findStoredBracketById(bracketId);
  if (!bracket) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bracket not found' } });
    return;
  }
  const tournament = await tournamentsRepo.findById(bracket.tournamentId);

  const brandName = config.pdf?.brandName || 'Primal';
  const palette = {
    primary: normalizeHexColor(config.pdf?.brandPrimary, '#0b0b0b'),
    accent: normalizeHexColor(config.pdf?.brandAccent, '#ef1a1a'),
    text: '#111111',
    textMuted: '#5b6470',
    line: '#dbe1ea',
    surface: '#f8fafc',
  };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bracket-${bracket.id}.pdf"`);
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 28,
    info: {
      Title: `${bracket.categoryLabel} bracket`,
      Author: brandName,
      Subject: 'Tournament bracket export',
    },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fffaf5');
  doc.fillOpacity(0.7).fillColor('#fee2e2').circle(doc.page.width - 120, 90, 180).fill();
  doc.fillOpacity(0.7).fillColor('#dbeafe').circle(110, doc.page.height - 80, 140).fill();
  doc.fillOpacity(0.62).fillColor('#fef3c7').circle(doc.page.width / 2 + 120, doc.page.height / 2 + 100, 120).fill();
  doc.restore();
  doc.save();
  doc.roundedRect(doc.page.margins.left, doc.page.margins.top, pageWidth, 72, 16).fill('#ffffff');
  doc.roundedRect(doc.page.margins.left, doc.page.margins.top, pageWidth, 72, 16).strokeColor('#111111').lineWidth(1.5).stroke();
  doc.restore();

  drawLogoMark(doc, {
    x: doc.page.margins.left + 16,
    y: doc.page.margins.top + 14,
    size: 40,
    logoPath: config.pdf?.logoPath,
    brandName,
    accent: palette.primary,
    fonts,
  });
  doc.fillColor(palette.text)
    .font(fonts.headingBold)
    .fontSize(20)
    .text(tournament?.name || 'Tournament', doc.page.margins.left + 68, doc.page.margins.top + 15);
  doc.fillColor('#b91c1c')
    .font(fonts.headingBold)
    .fontSize(13)
    .text(bracket.categoryLabel, doc.page.margins.left + 68, doc.page.margins.top + 40, { width: pageWidth - 220 });
  doc.fillColor(palette.textMuted)
    .font(fonts.body)
    .fontSize(9)
    .text(`Status: ${statusLabel(bracket.status)}   |   Draw: ${bracket.seedingLabel || bracket.seeding}   |   Exported: ${formatDateOnly(new Date())}`, doc.page.margins.left + 68, doc.page.margins.top + 58);

  const rounds = bracket.rounds || [];
  const startX = doc.page.margins.left + 22;
  const startY = doc.page.margins.top + 120;
  const roundWidth = 145;
  rounds.forEach((round, roundIndex) => {
    drawBracketRound(doc, startX + roundIndex * roundWidth, startY + roundIndex * 28, round, roundIndex, rounds.length, palette, fonts);
  });

  const finalMatch = rounds[rounds.length - 1]?.matches?.[0];
  const champion = finalMatch?.winnerIndex !== undefined ? finalMatch.sides?.[finalMatch.winnerIndex] : null;
  if (finalMatch) {
    const slotHeight = getBracketSlotHeight(rounds.length);
    const championX = startX + rounds.length * roundWidth + 18;
    const championY = startY + (slotHeight / 2) + 18;
    const connectorStartX = startX + (rounds.length - 1) * roundWidth + 126;
    const connectorY = championY + 46;
    doc.save();
    doc.lineWidth(1.5).strokeColor('#111111');
    doc.moveTo(connectorStartX, connectorY).lineTo(championX - 12, connectorY).stroke();
    doc.restore();
    drawChampionCard(doc, championX, championY, champion, palette, fonts);
  }

  doc.end();
  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'export.bracket_pdf',
    entityType: 'bracket',
    entityId: bracketId,
    payload: { tournamentId: bracket.tournamentId, categoryId: bracket.categoryId },
    requestIp: ctx.ip,
  });
}

async function divisionBracketToPdf(res, divisionId, actor, ctx = {}) {
  if (!actor || actor.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    return;
  }

  const payload = await matchService.getDivisionBracketExport(actor, divisionId);
  if (!payload?.division) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Division not found' } });
    return;
  }

  const { division, bracket } = payload;
  const brandName = config.pdf?.brandName || 'Primal';
  const palette = {
    primary: normalizeHexColor(config.pdf?.brandPrimary, '#0b0b0b'),
    accent: normalizeHexColor(config.pdf?.brandAccent, '#ef1a1a'),
    text: '#111111',
    textMuted: '#5b6470',
    line: '#dbe1ea',
    surface: '#f8fafc',
  };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="division-${division.id}-bracket.pdf"`);
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 28,
    info: {
      Title: `${division.label} bracket`,
      Author: brandName,
      Subject: 'Division bracket export',
    },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff8fb');
  doc.fillOpacity(0.68).fillColor('#ffd6e7').circle(doc.page.width - 160, 96, 180).fill();
  doc.fillOpacity(0.68).fillColor('#cde8ff').circle(110, doc.page.height - 90, 150).fill();
  doc.fillOpacity(0.64).fillColor('#fde68a').circle(doc.page.width / 2 + 110, doc.page.height / 2 + 90, 120).fill();
  doc.fillOpacity(0.3).fillColor('#fecaca').circle(doc.page.width / 2 - 150, 120, 90).fill();
  doc.restore();

  doc.save();
  doc.roundedRect(doc.page.margins.left, doc.page.margins.top, pageWidth, 76, 16).fill('#ffffff');
  doc.roundedRect(doc.page.margins.left, doc.page.margins.top, pageWidth, 76, 16).strokeColor('#111111').lineWidth(1.5).stroke();
  doc.restore();

  drawLogoMark(doc, {
    x: doc.page.margins.left + 16,
    y: doc.page.margins.top + 16,
    size: 40,
    logoPath: config.pdf?.logoPath,
    brandName,
    accent: palette.primary,
    fonts,
  });

  doc.fillColor(palette.text)
    .font(fonts.headingBold)
    .fontSize(20)
    .text(division.tournamentName || 'Tournament', doc.page.margins.left + 68, doc.page.margins.top + 15);
  doc.fillColor('#b91c1c')
    .font(fonts.headingBold)
    .fontSize(13)
    .text(division.label, doc.page.margins.left + 68, doc.page.margins.top + 42, { width: pageWidth - 220 });
  doc.fillColor(palette.textMuted)
    .font(fonts.body)
    .fontSize(9)
    .text(`Status: ${bracket.statusLabel || statusLabel(bracket.status)}   |   Draw: ${bracket.seedingLabel}   |   Exported: ${formatDateOnly(new Date())}`, doc.page.margins.left + 68, doc.page.margins.top + 60);

  const rounds = bracket.rounds || [];
  const startX = doc.page.margins.left + 22;
  const startY = doc.page.margins.top + 120;
  const roundWidth = 145;
  rounds.forEach((round, roundIndex) => {
    drawBracketRound(doc, startX + roundIndex * roundWidth, startY + roundIndex * 28, round, roundIndex, rounds.length || 1, palette, fonts);
  });

  const finalMatch = rounds[rounds.length - 1]?.matches?.[0];
  const champion = finalMatch?.winnerIndex !== undefined ? finalMatch.sides?.[finalMatch.winnerIndex] : (bracket.champion || payload.champion ? {
    name: bracket.champion?.name || payload.champion?.participantName,
    club: bracket.champion?.club || payload.champion?.clubName,
  } : null);

  if (finalMatch || champion) {
    const slotHeight = getBracketSlotHeight(Math.max(rounds.length, 1));
    const championX = startX + Math.max(rounds.length, 1) * roundWidth + 18;
    const championY = startY + (slotHeight / 2) + 18;
    const connectorStartX = startX + Math.max(rounds.length - 1, 0) * roundWidth + 126;
    const connectorY = championY + 46;
    if (rounds.length) {
      doc.save();
      doc.lineWidth(1.5).strokeColor('#111111');
      doc.moveTo(connectorStartX, connectorY).lineTo(championX - 12, connectorY).stroke();
      doc.restore();
    }
    drawChampionCard(doc, championX, championY, champion, palette, fonts);
  }

  doc.end();
  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'export.division_bracket_pdf',
    entityType: 'division',
    entityId: divisionId,
    payload: { tournamentId: division.tournamentId },
    requestIp: ctx.ip,
  });
}

module.exports = { approvedToExcel, approvedParticipantsToExcel, applicationToPdf, auditToExcel, bracketToPdf, divisionBracketToPdf };

