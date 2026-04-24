// PDF + Excel export helpers. Streamed to response.
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
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
const { approvedParticipantReport, groupedApplicationReport, seasonalTournamentReport } = require('./report.service');
const bracketService = require('./bracket.service');
const matchService = require('./match.service');
const documentStorage = require('./documentStorage.service');
const { buildSignatureForApplication } = require('../pdfSignature');
const { formatPersonName, applicationDisplayId, reviewerDisplayId } = require('./identity.service');
const {
  TYPE_SCALE,
  createPalette,
  baseDocumentOptions,
  buildExportFilename,
  finalizePageRibbons,
  shortSignatureId,
} = require('./pdfTokens');
const {
  drawApplicationCoverPage,
  drawRunningHeader,
  drawBracketTree,
  drawBracketHeader,
  drawChampionCard: drawBracketChampionCard,
  autoSlotHeight,
  drawReportHeader,
  drawKpiStrip,
  drawDataTable,
  drawStatusDistributionBar,
} = require('./pdfComposition');

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

function displayText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
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

async function buildExportSignatureArtifacts(app) {
  const signature = buildSignatureForApplication(app);
  const qrBuffer = await QRCode.toBuffer(signature.url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 180,
  });

  return {
    signature,
    qrBuffer,
  };
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

  if (hasInterTight) fonts.body = 'InterTightBody';
  if (hasInterTightBold) {
    fonts.bodyBold = 'InterTightBodyBold';
  } else if (hasInterTight) {
    fonts.bodyBold = 'InterTightBody';
  }
  fonts.heading = fonts.bodyBold;
  fonts.headingBold = fonts.bodyBold;

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
    doc.image(logo, x, y, {
      fit: [size, size],
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
  doc.rect(x, headerY, width, 20).fill(palette.ink);
  doc.restore();

  let colX = x;
  columns.forEach((c) => {
    doc.fillColor(palette.paper).font(fonts.headingBold).fontSize(TYPE_SCALE.label.size)
      .text(String(c.label).toUpperCase(), colX + 6, headerY + 6, {
        width: c.w - 12,
        characterSpacing: TYPE_SCALE.label.letterSpacing,
        lineBreak: false,
      });
    colX += c.w;
  });

  doc.y = headerY + 24;
  if (!documents.length) {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size)
      .text('No uploaded documents.');
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

    const rowHeight = 20;
    ensureSpace(doc, rowHeight + 2);
    const rowY = doc.y;
    if (idx % 2 === 0) {
      doc.save();
      doc.rect(x, rowY, width, rowHeight).fill(palette.surfaceMuted);
      doc.restore();
    }
    // Thin hairline between rows
    doc.save();
    doc.strokeColor(palette.line).opacity(0.1).lineWidth(0.5);
    doc.moveTo(x, rowY + rowHeight).lineTo(x + width, rowY + rowHeight).stroke();
    doc.restore();

    let vx = x;
    columns.forEach((c) => {
      doc.fillColor(palette.text).font(fonts.body).fontSize(TYPE_SCALE.body.size)
        .text(values[c.key], vx + 6, rowY + 6, { width: c.w - 12, ellipsis: true, lineBreak: false });
      vx += c.w;
    });
    doc.y = rowY + rowHeight;
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
    doc.roundedRect(cardX, y, cardW, cardH, 2).fill('#fff3e2');
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

  events.forEach((ev, idx) => {
    ensureSpace(doc, 40);
    const y = doc.y;
    // Zebra stripe on the paper; no blobby rounded card.
    if (idx % 2 === 0) {
      doc.save();
      doc.rect(x, y, width, 34).fill(palette.surfaceMuted);
      doc.restore();
    }
    // Left ink bar indicates workflow advance
    doc.save();
    doc.rect(x, y, 2, 34).fill(palette.ink);
    doc.restore();

    doc.fillColor(palette.text).font(fonts.headingBold).fontSize(TYPE_SCALE.body.size)
      .text(`${statusLabel(ev.from_status)} → ${statusLabel(ev.to_status)}`, x + 10, y + 6, { width: width - 150, ellipsis: true, lineBreak: false });
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.micro.size)
      .text(formatDateTime(ev.created_at), x + width - 128, y + 8, { width: 120, align: 'right', lineBreak: false });
    if (ev.reason) {
      doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.micro.size)
        .text(ev.reason, x + 10, y + 20, { width: width - 20, ellipsis: true, lineBreak: false });
    }
    doc.y = y + 38;
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

function addGroupedAnalyticsWorksheet(worksheet, rows) {
  worksheet.columns = [
    { header: 'Label', key: 'label', width: 34 },
    { header: 'Draft', key: 'draft', width: 12 },
    { header: 'Submitted', key: 'submitted', width: 12 },
    { header: 'Under Review', key: 'under_review', width: 14 },
    { header: 'Needs Correction', key: 'needs_correction', width: 16 },
    { header: 'Season Closed', key: 'season_closed', width: 16 },
    { header: 'Approved', key: 'approved', width: 12 },
    { header: 'Rejected', key: 'rejected', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
  ];
  rows.forEach((row) => {
    worksheet.addRow({
      label: row.label,
      ...row.statuses,
    });
  });
  worksheet.getRow(1).font = { bold: true };
}

async function groupedAnalyticsToExcel(res, { tournamentId, discipline } = {}) {
  const report = await groupedApplicationReport({ tournamentId, discipline });
  const wb = new ExcelJS.Workbook();
  const wsDiscipline = wb.addWorksheet('By Discipline');
  const wsWeight = wb.addWorksheet('By Weight');
  const wsCategory = wb.addWorksheet('By Category');

  addGroupedAnalyticsWorksheet(wsDiscipline, report.disciplineGroups);
  addGroupedAnalyticsWorksheet(wsWeight, report.weightClassGroups);
  addGroupedAnalyticsWorksheet(wsCategory, report.categoryGroups.map((row) => ({
    label: `${row.label} / ${row.discipline} / ${row.weightClass}`,
    statuses: row.statuses,
  })));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="application-analytics.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}

// Legacy `drawAnalyticsTable` has been retired. The analytics tables in
// groupedAnalyticsToPdf now use `drawDataTable` from pdfComposition.js with
// inline status distribution bars (drawStatusDistributionBar).

async function groupedAnalyticsToPdf(res, actor, { tournamentId, discipline } = {}, ctx = {}) {
  const report = await groupedApplicationReport({ tournamentId, discipline });
  const brandName = config.pdf?.brandName || 'Primal';
  const palette = createPalette(config);

  const filename = buildExportFilename({
    type: 'analytics',
    tournamentId: tournamentId || 'all',
    discipline: discipline || undefined,
    brand: brandName,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({
    ...baseDocumentOptions({
      title: `${brandName} / Grouped application analytics`,
      subject: 'Grouped application analytics',
      brand: brandName,
      keywords: ['analytics', 'applications'],
    }),
    size: 'A4',
    layout: 'landscape',
    margins: { top: 28, bottom: 32, left: 28, right: 28 },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
  doc.restore();

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const cursorY = drawReportHeader(doc, {
    palette, fonts, brandName,
    title: 'Application Analytics',
    subtitle: tournamentId ? 'Tournament report' : 'Federation-wide report',
    metaLines: [
      `Generated ${formatDateTime(report.generatedAt)}`,
      `Tournament ${displayText(report.filters.tournamentId, 'All')}`,
      `Discipline ${displayText(report.filters.discipline, 'All')}`,
    ],
  });

  const pending = report.totals.submitted + report.totals.under_review + report.totals.needs_correction;
  let y = drawKpiStrip(doc, {
    x: doc.page.margins.left,
    y: cursorY,
    width: pageWidth,
    height: 52,
    palette, fonts,
    kpis: [
      { label: 'All applications', value: report.totals.total },
      { label: 'Approved', value: report.totals.approved, highlight: true,
        delta: report.totals.total ? `${Math.round((report.totals.approved / report.totals.total) * 100)}% of total` : undefined },
      { label: 'Pending review', value: pending },
      { label: 'Rejected', value: report.totals.rejected },
    ],
  });

  // Shared columns for discipline / weight / category tables — inline status
  // distribution bar makes each table scannable at a glance.
  const pageBottom = doc.page.height - doc.page.margins.bottom - 32;
  const makeColumns = (labelHeader) => ([
    { key: 'label', label: labelHeader, width: 180 },
    { key: 'total', label: 'Total', width: 50, align: 'right',
      render: ({ doc: d, row, x, y: cy, width: cw }) => {
        d.save();
        d.fillColor(palette.ink).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.body.size);
        d.text(String(row.statuses.total || 0), x, cy + 5, { width: cw, align: 'right', lineBreak: false, height: 0 });
        d.restore();
      } },
    { key: 'approved', label: 'Approved', width: 55, align: 'right',
      render: ({ doc: d, row, x, y: cy, width: cw }) => {
        d.save();
        d.fillColor(palette.verify).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.body.size);
        d.text(String(row.statuses.approved || 0), x, cy + 5, { width: cw, align: 'right', lineBreak: false, height: 0 });
        d.restore();
      } },
    { key: 'pending', label: 'Pending', width: 55, align: 'right',
      render: ({ doc: d, row, x, y: cy, width: cw }) => {
        const v = (row.statuses.submitted || 0) + (row.statuses.under_review || 0) + (row.statuses.needs_correction || 0);
        d.save();
        d.fillColor(palette.ink).font(fonts.body).fontSize(TYPE_SCALE.body.size);
        d.text(String(v), x, cy + 5, { width: cw, align: 'right', lineBreak: false, height: 0 });
        d.restore();
      } },
    { key: 'rejected', label: 'Rejected', width: 55, align: 'right',
      render: ({ doc: d, row, x, y: cy, width: cw }) => {
        d.save();
        d.fillColor(palette.accent).font(fonts.body).fontSize(TYPE_SCALE.body.size);
        d.text(String(row.statuses.rejected || 0), x, cy + 5, { width: cw, align: 'right', lineBreak: false, height: 0 });
        d.restore();
      } },
    { key: 'distribution', label: 'Distribution', width: 280,
      render: ({ row, x, y: cy, width: cw }) => {
        drawStatusDistributionBar(doc, {
          x, y: cy + 2, width: cw, height: 8, palette,
          segments: [
            { tone: 'verify', count: row.statuses.approved || 0 },
            { tone: 'ink',    count: (row.statuses.submitted || 0) + (row.statuses.under_review || 0) },
            { tone: 'warn',   count: row.statuses.needs_correction || 0 },
            { tone: 'accent', count: row.statuses.rejected || 0 },
            { tone: 'muted',  count: row.statuses.season_closed || 0 },
          ],
        });
      } },
  ]);

  const ML = doc.page.margins.left;
  const renderSection = (title, rows) => {
    const estHeight = 28 + 18 + rows.length * 18 + 8;
    if (y + estHeight > pageBottom) {
      doc.addPage();
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
      doc.restore();
      y = doc.page.margins.top;
    }
    y = drawDataTable(doc, {
      x: ML, y, width: pageWidth,
      title, rows, columns: makeColumns(title.split(' · ')[0]),
      palette, fonts,
    }) + 8;
  };

  renderSection('By discipline', report.disciplineGroups);
  renderSection('By weight class', report.weightClassGroups);
  renderSection('By category', report.categoryGroups.map((row) => ({
    ...row,
    label: `${row.label} · ${row.discipline} · ${row.weightClass}`,
  })));

  finalizePageRibbons(doc, {
    palette,
    fonts,
    brand: brandName,
    identifier: `Analytics · ${discipline || 'All disciplines'}`,
  });
  doc.end();

  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'export.analytics_pdf',
    entityType: 'report',
    entityId: tournamentId || 'all',
    payload: { tournamentId: tournamentId || null, discipline: discipline || null },
    requestIp: ctx.ip,
  });
}

async function seasonalReportToPdf(res, actor, tournamentId, ctx = {}) {
  const report = await seasonalTournamentReport({ tournamentId });
  const brandName = config.pdf?.brandName || 'Primal';
  const palette = createPalette(config);

  const filename = buildExportFilename({
    type: 'season',
    tournamentName: report.tournament.name,
    tournamentId: report.tournament.id,
    extra: report.tournament.season ? `s${report.tournament.season}` : undefined,
    brand: brandName,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({
    ...baseDocumentOptions({
      title: `${brandName} / ${report.tournament.name} / Season archive`,
      subject: 'Season archive report',
      brand: brandName,
      keywords: ['season', 'archive', report.tournament.name],
    }),
    size: 'A4',
    layout: 'landscape',
    margins: { top: 28, bottom: 32, left: 28, right: 28 },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
  doc.restore();

  const ML = doc.page.margins.left;
  const pageWidth = doc.page.width - ML - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom - 32;

  const matchesPlayed = report.matches.filter((row) => row.matchId).length;
  const matchesCompleted = report.matches.filter((row) => row.status === 'completed').length;

  const cursorY = drawReportHeader(doc, {
    palette, fonts, brandName,
    title: report.tournament.name,
    subtitle: `Season archive · ${displayText(report.tournament.season, 'N/A')}`,
    metaLines: [
      `Archived ${displayText(formatDateOnly(report.tournament.archivedAt), 'Active')}`,
      `Generated ${formatDateTime(report.generatedAt)}`,
      `${report.divisions.length} divisions`,
      `${matchesPlayed} matches played`,
    ],
  });

  let y = drawKpiStrip(doc, {
    x: ML, y: cursorY, width: pageWidth, height: 52, palette, fonts,
    kpis: [
      { label: 'Registered', value: report.totals.total },
      { label: 'Approved',   value: report.totals.approved, highlight: true,
        delta: report.totals.total ? `${Math.round((report.totals.approved / report.totals.total) * 100)}% of registered` : undefined },
      { label: 'Divisions',  value: report.divisions.length },
      { label: 'Matches',    value: matchesPlayed,
        delta: matchesPlayed ? `${matchesCompleted} completed` : undefined },
    ],
  });

  const renderSection = (title, rows, columns) => {
    const estHeight = 28 + 18 + rows.length * 18 + 8;
    if (y + estHeight > pageBottom) {
      doc.addPage();
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
      doc.restore();
      y = doc.page.margins.top;
    }
    y = drawDataTable(doc, {
      x: ML, y, width: pageWidth,
      title, rows, columns,
      palette, fonts,
    }) + 8;
  };

  // Registered participants — the core season record
  renderSection('Registered participants by category', report.registrations, [
    { key: 'applicationDisplayId', label: 'App ID', width: 80 },
    { key: 'participantName', label: 'Participant', width: 130 },
    { key: 'discipline', label: 'Discipline', width: 80 },
    { key: 'weightClass', label: 'Wt class', width: 64 },
    { key: 'weightKg', label: 'Kg', width: 40, align: 'right' },
    { key: 'status', label: 'Status', width: 80 },
    { key: 'category', label: 'Category', width: 150 },
    { key: 'bracketState', label: 'Bracket', width: 76 },
  ]);

  // Divisions — winner highlighted
  renderSection('Division winners and category summary', report.divisions, [
    { key: 'discipline_name', label: 'Discipline', width: 110 },
    { key: 'label', label: 'Division', width: 210 },
    { key: 'fighter_count', label: 'Fighters', width: 60, align: 'right' },
    { key: 'match_count', label: 'Matches', width: 60, align: 'right' },
    { key: 'champion_name', label: 'Champion', width: 150,
      render: ({ doc: d, row, x, y: cy, width: cw }) => {
        d.save();
        d.fillColor(row.champion_name ? palette.ink : palette.textMuted)
         .font(row.champion_name ? (fonts.bodyBold || fonts.body) : fonts.body)
         .fontSize(TYPE_SCALE.body.size);
        d.text(displayText(row.champion_name, 'Pending'), x, cy + 5, {
          width: cw, ellipsis: true, lineBreak: false, height: 0,
        });
        d.restore();
      } },
    { key: 'champion_club_name', label: 'Club', width: 110 },
  ]);

  // Matches — full ledger
  renderSection('Matches played', report.matches, [
    { key: 'divisionLabel', label: 'Division', width: 200 },
    { key: 'roundNumber', label: 'Rnd', width: 40, align: 'right' },
    { key: 'matchNumber', label: 'Bout', width: 40, align: 'right' },
    { key: 'redName', label: 'Red', width: 120 },
    { key: 'blueName', label: 'Blue', width: 120 },
    { key: 'winnerName', label: 'Winner', width: 130,
      render: ({ doc: d, row, x, y: cy, width: cw }) => {
        d.save();
        d.fillColor(row.winnerName ? palette.ink : palette.textMuted)
         .font(row.winnerName ? (fonts.bodyBold || fonts.body) : fonts.body)
         .fontSize(TYPE_SCALE.body.size);
        d.text(displayText(row.winnerName, 'Pending'), x, cy + 5, {
          width: cw, ellipsis: true, lineBreak: false, height: 0,
        });
        d.restore();
      } },
    { key: 'status', label: 'Status', width: 80 },
  ]);

  finalizePageRibbons(doc, {
    palette, fonts, brand: brandName,
    identifier: `Season Archive · ${report.tournament.name}`,
  });
  doc.end();
  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'export.season_pdf',
    entityType: 'tournament',
    entityId: tournamentId,
    payload: {},
    requestIp: ctx.ip,
  });
}

// Season-report tabular helpers (drawSeasonRegistrationTable,
// drawSeasonDivisionTable, drawSeasonMatchesTable, drawWideTable) now live
// inside `seasonalReportToPdf` as inline column definitions passed to
// `drawDataTable` from pdfComposition.js — the Primal OS unified table
// primitive with an ink header band, zebra rows, and custom cell renderers.

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
    approved:          { bg: '#ece6dc', text: '#1f2937', stroke: '#2f3742', label: 'APPROVED' },
    rejected:          { bg: '#ece6dc', text: '#1f2937', stroke: '#2f3742', label: 'REJECTED' },
    needs_correction:  { bg: '#ece6dc', text: '#1f2937', stroke: '#2f3742', label: 'CORRECTION' },
    pending:           { bg: '#ece6dc', text: '#1f2937', stroke: '#2f3742', label: 'PENDING' },
    under_review:      { bg: '#ece6dc', text: '#1f2937', stroke: '#2f3742', label: 'UNDER REVIEW' },
  };
  const cfg = configs[status] || { bg: '#ece6dc', text: '#1f2937', stroke: '#2f3742', label: String(statusLabel(status)).toUpperCase() };
  const label = cfg.label;
  const pillW = Math.max(72, doc.widthOfString(label, { font: fonts.headingBold }) + 22);
  doc.save();
  doc.roundedRect(x, y, pillW, 18, 3).fill(cfg.bg);
  doc.roundedRect(x, y, pillW, 18, 3).strokeColor(cfg.stroke).lineWidth(0.8).stroke();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusPillLabel(status) {
  const labels = {
    approved: 'APPROVED',
    rejected: 'REJECTED',
    needs_correction: 'CORRECTION',
    pending: 'PENDING',
    under_review: 'UNDER REVIEW',
    season_closed: 'SEASON CLOSED',
  };

  return labels[status] || String(statusLabel(status)).toUpperCase();
}

function buildApplicationExportViewModel(app, documents, statusEvents, renderableImages, brandName, palette) {
  const appliedDisciplines = collectAppliedDisciplines(app);
  const applicantName = formatPersonName(app.first_name, app.last_name);
  const applicationDisplayCode = applicationDisplayId(app.id);
  const reviewerDisplayCode = app.reviewer_id ? reviewerDisplayId(app.reviewer_id) : null;
  const address = app.metadata && typeof app.metadata === 'object' ? app.metadata.address : null;
  const primaryImage = renderableImages.find((documentRow) => documentRow.kind === 'photo_id') || null;
  const metricChips = [
    { label: 'Disciplines', value: displayText(appliedDisciplines.length ? appliedDisciplines.join(' / ') : 'Open') },
    { label: 'Weight Class', value: asText(app.weight_class || 'Open') },
    { label: 'Entry Type', value: app.club_name ? 'Club Entry' : 'Individual' },
    { label: 'Status', value: statusLabel(app.status) },
  ];
  const identityRows = [
    ['Full Name', displayText(applicantName)],
    ['Application ID', applicationDisplayCode],
    ['Email', asText(app.email)],
    ['Phone', asText(app.phone)],
    ['Date of Birth', formatDateOnly(app.date_of_birth)],
    ['Gender', asText(app.gender)],
    ['Nationality', asText(app.nationality)],
    ['Club / Team', asText(app.club_name || 'Individual')],
    ['Fight Record', `${app.record_wins || 0}W - ${app.record_losses || 0}L - ${app.record_draws || 0}D`],
    ['Weight', app.weight_kg ? `${app.weight_kg} kg` : '-'],
    ['Experience', asText(app.form_data?.experienceLevel)],
  ];
  const declarationRows = [
    ['Submitted', formatDateTime(app.submitted_at)],
    ['Review Started', formatDateTime(app.review_started_at)],
    ['Review Due', formatDateTime(app.review_due_at)],
    ['Decided', formatDateTime(app.decided_at)],
    ['Correction Due', formatDateTime(app.correction_due_at)],
    ['Disciplines', appliedDisciplines.length ? appliedDisciplines.join(', ') : 'Open'],
    ['Rejection Reason', asText(app.rejection_reason)],
    ['Reopen Reason', asText(app.reopen_reason)],
    ['Notes', asText(app.form_data?.notes)],
  ];
  const addressText = address
    ? `${asText(address.line1)}, ${asText(address.line2)}, ${asText(address.district)}, ${asText(address.state)}, ${asText(address.country)} ${asText(address.postalCode)}`
    : null;
  const documentRows = documents.map((documentRow) => ({
    kind: asText(documentRow.kind),
    name: asText(documentRow.original_filename || documentRow.storage_key),
    mime: asText(documentRow.mime_type),
    size: documentRow.size_bytes ? `${Math.round(documentRow.size_bytes / 1024)} KB` : '-',
    uploaded: formatDateOnly(documentRow.created_at),
  }));
  const attachmentRows = [];
  const timelineRows = statusEvents.map((eventRow) => ({
    transition: `${statusLabel(eventRow.from_status)} -> ${statusLabel(eventRow.to_status)}`,
    createdAt: formatDateTime(eventRow.created_at),
    reason: eventRow.reason ? asText(eventRow.reason) : null,
  }));

  return {
    brandName,
    palette,
    generatedAt: formatDateTime(new Date()),
    applicationId: asText(app.id),
    applicationDisplayId: applicationDisplayCode,
    tournamentName: asText(app.tournament_name),
    status: app.status,
    statusLabel: statusLabel(app.status),
    statusPillLabel: statusPillLabel(app.status),
    reviewerId: asText(app.reviewer_id),
    reviewerDisplayId: reviewerDisplayCode,
    decidedAt: formatDateTime(app.decided_at),
    applicantName: displayText(applicantName),
    appliedDisciplines,
    metricChips,
    identityRows,
    declarationRows,
    addressText,
    documentRows,
    attachmentRows,
    timelineRows,
    primaryImageName: primaryImage ? asText(primaryImage.original_filename || primaryImage.storage_key) : null,
  };
}

async function loadApplicationExportViewModel(applicationId, actor) {
  const app = await appsRepo.findFullById(applicationId);
  if (!app) {
    const error = new Error('Application not found');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  await assertCanView(actor, app);

  const brandName = config.pdf?.brandName || 'Primal';
  const palette = createPalette(config);

  const [documents, statusEvents] = await Promise.all([
    docsRepo.listForApplication(app.id),
    eventsRepo.listForApplication(app.id),
  ]);
  const renderableImages = await loadRenderableDocumentImages(documents);
  const signatureArtifacts = await buildExportSignatureArtifacts(app);
  const viewModel = buildApplicationExportViewModel(app, documents, statusEvents, renderableImages, brandName, palette);

  return {
    app,
    brandName,
    palette,
    documents,
    statusEvents,
    renderableImages,
    signatureArtifacts,
    viewModel,
  };
}

function renderKeyValueRowsHtml(rows) {
  return rows.map((row, index) => `
    <div style="display: flex; align-items: center; min-height: 32px; background: ${index % 2 === 0 ? '#ede7dc' : '#fbfaf7'}; border: 1px solid #2f3742; border-radius: 8px; padding: 0 12px; gap: 12px;" layer-name="Identity Row">
      <div style="width: 112px; color: #5f6773; font-size: 10px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">${escapeHtml(row[0])}</div>
      <div style="flex: 1; color: #1f2937; font-size: 11px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row[1])}</div>
    </div>
  `).join('');
}

function renderMicroCardsHtml(rows, columns) {
  const items = rows.map((row) => `
    <div style="display: flex; flex-direction: column; width: calc((100% - ${(columns - 1) * 10}px) / ${columns}); min-height: 56px; border: 1px solid #2f3742; border-radius: 8px; background: #fbfaf7; padding: 8px; gap: 6px;" layer-name="Micro Card">
      <div style="color: #5f6773; font-size: 9px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">${escapeHtml(row[0])}</div>
      <div style="color: #1f2937; font-size: 11px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row[1])}</div>
    </div>
  `).join('');

  return `<div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">${items}</div>`;
}

function renderTableRowsHtml(rows) {
  if (!rows.length) {
    return '<div style="color: #5f6773; font-size: 11px; font-family: \'Inter Tight\', sans-serif;">No uploaded documents.</div>';
  }

  const header = `
    <div style="display: flex; align-items: center; border: 1px solid #2f3742; border-radius: 8px; background: #8c6a43; min-height: 30px; padding: 0 8px;" layer-name="Table Header">
      <div style="width: 80px; color: #f8f5ef; font-size: 10px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">Kind</div>
      <div style="width: 200px; color: #f8f5ef; font-size: 10px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">File Name</div>
      <div style="width: 98px; color: #f8f5ef; font-size: 10px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">Mime Type</div>
      <div style="width: 56px; color: #f8f5ef; font-size: 10px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">Size</div>
      <div style="flex: 1; color: #f8f5ef; font-size: 10px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">Uploaded</div>
    </div>
  `;

  const body = rows.map((row, index) => `
    <div style="display: flex; align-items: center; border: 1px solid #2f3742; border-radius: 8px; background: ${index % 2 === 0 ? '#ede7dc' : '#fbfaf7'}; min-height: 28px; padding: 0 8px;" layer-name="Table Row">
      <div style="width: 80px; color: #1f2937; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.kind)}</div>
      <div style="width: 200px; color: #1f2937; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.name)}</div>
      <div style="width: 98px; color: #1f2937; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.mime)}</div>
      <div style="width: 56px; color: #1f2937; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.size)}</div>
      <div style="flex: 1; color: #1f2937; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.uploaded)}</div>
    </div>
  `).join('');

  return `${header}${body}`;
}

function renderAttachmentCardsHtml(rows) {
  if (!rows.length) return '';

  return `
    <div style="display: flex; flex-wrap: wrap; gap: 12px; width: 100%;" layer-name="Supporting Attachments">
      ${rows.map((row) => `
        <div style="display: flex; flex-direction: column; width: calc((100% - 12px) / 2); gap: 6px;" layer-name="Attachment Card">
          <div style="display: flex; align-items: center; justify-content: center; height: 130px; border: 1px solid #2f3742; border-radius: 8px; background: #ede7dc; color: #5f6773; font-size: 11px; font-family: 'Inter Tight', sans-serif; text-transform: uppercase;">${escapeHtml(row.kind)}</div>
          <div style="color: #1f2937; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.name)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTimelineRowsHtml(rows) {
  if (!rows.length) {
    return '<div style="color: #5f6773; font-size: 11px; font-family: \'Inter Tight\', sans-serif;">No status events recorded.</div>';
  }

  return rows.map((row) => `
    <div style="display: flex; flex-direction: column; border: 1px solid #2f3742; border-radius: 8px; background: #fbfaf7; padding: 10px 12px; gap: 6px;" layer-name="Timeline Row">
      <div style="display: flex; justify-content: space-between; gap: 12px;">
        <div style="color: #1f2937; font-size: 11px; font-family: 'Inter Tight', sans-serif; font-weight: 700;">${escapeHtml(row.transition)}</div>
        <div style="color: #5f6773; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.createdAt)}</div>
      </div>
      ${row.reason ? `<div style="color: #5f6773; font-size: 10px; font-family: 'Inter Tight', sans-serif;">${escapeHtml(row.reason)}</div>` : ''}
    </div>
  `).join('');
}

function renderApplicationPaperHtml(viewModel) {
  const chipsHtml = viewModel.metricChips.map((chip) => `
    <div style="display: flex; flex-direction: column; width: calc((100% - 24px) / 4); min-height: 64px; border: 1px solid #2f3742; border-radius: 8px; background: #fbfaf7; padding: 10px; gap: 6px;" layer-name="Metric Chip">
      <div style="color: #5f6773; font-size: 9px; font-family: 'Inter Tight', sans-serif; font-weight: 700; text-transform: uppercase;">${escapeHtml(chip.label)}</div>
      <div style="color: #1f2937; font-size: 12px; line-height: 1.35; font-family: 'Inter Tight', sans-serif; font-weight: 700;">${escapeHtml(chip.value)}</div>
    </div>
  `).join('');

  return `
    <div layer-name="Participant Application Export" style="display: flex; flex-direction: column; width: 794px; background: #f4f1ea; box-sizing: border-box; font-family: 'Inter Tight', sans-serif; color: #1f2937;">
      <div layer-name="Header" style="display: flex; flex-direction: column; width: 100%; background: ${escapeHtml(viewModel.palette.primary)}; padding: 32px; gap: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
          <div style="display: flex; gap: 14px; align-items: center;">
            <div style="display: flex; align-items: center; justify-content: center; width: 54px; height: 54px; border: 1px solid #f8f5ef; color: #f8f5ef; font-size: 16px; font-weight: 700;">${escapeHtml(brandInitials(viewModel.brandName))}</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              <div style="color: #f8f5ef; font-size: 22px; font-weight: 700;">${escapeHtml(viewModel.brandName)}</div>
              <div style="color: #ece6dc; font-size: 10px;">${escapeHtml(viewModel.tournamentName)}</div>
              <div style="color: #e4d7c6; font-size: 9px;">Application ${escapeHtml(viewModel.applicationDisplayId)} / ${escapeHtml(viewModel.generatedAt)}</div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
            <div style="display: flex; align-items: center; justify-content: center; min-width: 104px; height: 28px; border: 1px solid #2f3742; border-radius: 999px; background: #ece6dc; padding: 0 14px; color: #1f2937; font-size: 10px; font-weight: 700;">${escapeHtml(viewModel.statusPillLabel)}</div>
            <div style="color: #ece6dc; font-size: 9px; text-transform: uppercase;">Participant Registration Export</div>
          </div>
        </div>
      </div>
      <div layer-name="Content" style="display: flex; flex-direction: column; width: 100%; padding: 24px 32px 32px 32px; gap: 14px;">
        <div style="display: flex; gap: 8px; width: 100%;">${chipsHtml}</div>
        <div style="display: flex; flex-direction: column; border: 1px solid #2f3742; border-radius: 10px; background: #fbfaf7; padding: 12px 14px; gap: 8px;">
          <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Discipline Breakdown</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">${viewModel.appliedDisciplines.length ? viewModel.appliedDisciplines.map((discipline) => `<div style="display:flex;align-items:center;height:28px;padding:0 12px;border:1px solid #b5aa99;border-radius:999px;background:#f4f1ea;color:#1f2937;font-size:11px;font-weight:700;">${escapeHtml(discipline)}</div>`).join('') : `<div style="color: #1f2937; font-size: 14px; font-weight: 700;">Open</div>`}</div>
        </div>
        <div style="display: flex; width: 100%; gap: 8px; align-items: stretch;">
          <div style="display: flex; flex-direction: column; width: 57.5%; border: 1px solid #2f3742; border-radius: 10px; background: #fbfaf7; padding: 12px 14px; gap: 8px;" layer-name="Applicant Identity">
            <div style="color: #1f2937; font-size: 12px; font-weight: 700;">Applicant Identity</div>
            <div style="height: 1px; background: #2f3742; width: 100%;"></div>
            ${renderKeyValueRowsHtml(viewModel.identityRows)}
          </div>
          <div style="display: flex; flex-direction: column; width: calc(42.5% - 8px); border: 1px solid #2f3742; border-radius: 10px; background: #fbfaf7; padding: 12px; gap: 14px;" layer-name="Verification Panel">
            <div style="display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 12px; align-items: start;">
              <div style="display: flex; flex-direction: column; gap: 6px; width: 80px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; justify-content: center; width: 80px; height: 104px; border: 1px solid #2f3742; border-radius: 8px; background: #e7e0d5; color: #5f6773; font-size: 10px; text-transform: uppercase;">${viewModel.primaryImageName ? 'Photo ID' : 'No Photo'}</div>
                <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">${escapeHtml(viewModel.primaryImageName || 'No photo uploaded')}</div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px; min-width: 0; padding-top: 1px;">
                <div style="color: #1f2937; font-size: 11px; font-weight: 700; line-height: 1.35;">${escapeHtml(viewModel.applicantName)}</div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Reviewer ID</div>
                  <div style="color: #1f2937; font-size: 10px;">${escapeHtml(viewModel.reviewerDisplayId || 'Unassigned')}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Decided</div>
                  <div style="color: #1f2937; font-size: 10px;">${escapeHtml(viewModel.decidedAt)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; min-height: 48px;">
                  <div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 2px; background: ${escapeHtml(viewModel.palette.primary)}; color: #f8f5ef; font-size: 9px; font-weight: 700;">OK</div>
                  <div style="display: flex; flex-direction: column; gap: 2px;">
                    <div style="color: #1f2937; font-size: 10px; font-weight: 700;">Digitally Verified</div>
                    <div style="color: #5f6773; font-size: 9px;">Signed record / internal reference copy</div>
                  </div>
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:8px;border-top:1px solid #d7d0c5;">
              <div style="display:flex;flex-direction:column;gap:4px;max-width:150px;">
                <div style="color:#1f2937;font-size:10px;font-weight:700;">Scan to verify</div>
                <div style="color:#5f6773;font-size:9px;line-height:1.4;">Printed QR opens the signed verification record.</div>
              </div>
              <div style="display:flex;align-items:center;justify-content:center;width:72px;height:72px;border:1px solid #2f3742;border-radius:8px;background:#fff;padding:6px;"><img src="${escapeHtml(viewModel.qrDataUrl || '')}" alt="Verification QR" style="width:100%;height:100%;object-fit:contain;" /></div>
            </div>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;" layer-name="Competition Declaration">
            <div style="display: flex; flex-direction: column; gap: 5px;">
            <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Competition Declaration</div>
            <div style="height: 1px; background: #2f3742; width: 100%;"></div>
          </div>
          ${renderMicroCardsHtml(viewModel.declarationRows, 3)}
          ${viewModel.addressText ? `
            <div style="display: flex; flex-direction: column; border: 1px solid #2f3742; border-radius: 8px; background: #fbfaf7; padding: 8px; gap: 6px;">
              <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Address</div>
              <div style="color: #1f2937; font-size: 11px;">${escapeHtml(viewModel.addressText)}</div>
            </div>
          ` : ''}
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;" layer-name="Document Register">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Document Register</div>
            <div style="height: 1px; background: #2f3742; width: 100%;"></div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px;">${renderTableRowsHtml(viewModel.documentRows)}</div>
        </div>
        ${viewModel.attachmentRows.length ? `
          <div style="display: flex; flex-direction: column; gap: 10px;" layer-name="Supporting Attachments Section">
            <div style="display: flex; flex-direction: column; gap: 5px;">
              <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Supporting Attachments</div>
              <div style="height: 1px; background: #2f3742; width: 100%;"></div>
            </div>
            ${renderAttachmentCardsHtml(viewModel.attachmentRows)}
          </div>
        ` : ''}
        <div style="display: flex; flex-direction: column; gap: 10px;" layer-name="Workflow Timeline">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">Workflow Timeline</div>
            <div style="height: 1px; background: #2f3742; width: 100%;"></div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">${renderTimelineRowsHtml(viewModel.timelineRows)}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; padding-top: 8px;">
          <div style="height: 1px; background: #2f3742; width: 100%;"></div>
          <div style="color: #5f6773; font-size: 9px; text-align: center;">${escapeHtml(`${viewModel.brandName} / Participant Application Export / Digitally signed / ${viewModel.generatedAt}`)}</div>
        </div>
      </div>
    </div>
  `;
}

async function applicationToPaper(applicationId, actor) {
  const { viewModel, signatureArtifacts } = await loadApplicationExportViewModel(applicationId, actor);
  const paperViewModel = {
    ...viewModel,
    qrDataUrl: `data:image/png;base64,${signatureArtifacts.qrBuffer.toString('base64')}`,
  };

  return {
    artboard: {
      name: `Participant Application ${viewModel.applicationDisplayId}`,
      width: 794,
      height: 'fit-content',
      backgroundColor: '#f4f1ea',
    },
    html: renderApplicationPaperHtml(paperViewModel),
    data: {
      ...paperViewModel,
      verificationUrl: signatureArtifacts.signature.url,
    },
  };
}

// ─── Redesigned applicationToPdf ────────────────────────────────────────────

async function applicationToPdf(res, applicationId, actor, ctx = {}) {
  const {
    app,
    brandName,
    palette,
    documents,
    statusEvents,
    renderableImages,
    signatureArtifacts,
    viewModel,
  } = await loadApplicationExportViewModel(applicationId, actor);
  const primaryImage = renderableImages.find((d) => d.kind === 'photo_id') || null;
  const appliedDisciplines = viewModel.appliedDisciplines;
  const address = app.metadata && typeof app.metadata === 'object' ? app.metadata.address : null;

  const filename = buildExportFilename({
    type: 'application',
    tournamentName: app.tournament_name,
    tournamentId: app.tournament_id,
    applicationDisplayId: viewModel.applicationDisplayId || app.id,
    applicationId: app.id,
    brand: brandName,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({
    ...baseDocumentOptions({
      title: `${brandName} / ${viewModel.applicantName || 'Applicant'} / ${viewModel.applicationDisplayId || app.id}`,
      subject: 'Participant application export',
      brand: brandName,
      keywords: ['application', 'participant', viewModel.applicantName || '', app.tournament_name || '']
        .filter(Boolean),
    }),
    size: 'A4',
    margins: { top: 32, bottom: 32, left: 32, right: 32 },
  });
  doc.pipe(res);

  const fonts = resolvePdfFonts(doc);
  const PX   = doc.page.margins.left;                                           // page x origin
  const PY   = doc.page.margins.top;                                            // page y origin
  const CW   = doc.page.width  - PX - doc.page.margins.right;                  // content width  (~531)
  const COL  = (CW - GRID.gap * 11) / 12;                                      // column unit

  // ── Cover page ──────────────────────────────────────────────────────────
  // Phase 1: every application export opens with a credential-style cover
  // page holding the hero portrait, participant name, status, the 4-block
  // identity grid, the issuing authority block, and the verify QR/fingerprint.
  const identityBlocks = [
    { label: 'Full Name',      value: displayText(viewModel.applicantName) },
    { label: 'Application ID', value: viewModel.applicationDisplayId || app.id },
    { label: 'Date of Birth',  value: formatDateOnly(app.date_of_birth) },
    { label: 'Nationality',    value: asText(app.nationality) },
  ];
  const categoryLine = [
    appliedDisciplines.length ? appliedDisciplines.join(' / ') : null,
    app.weight_class || null,
    app.weight_kg ? `${app.weight_kg} kg` : null,
  ].filter(Boolean).join('  ·  ') || '—';

  drawApplicationCoverPage(doc, {
    palette,
    fonts,
    brandName,
    tournamentName: asText(app.tournament_name),
    applicationDisplayId: viewModel.applicationDisplayId || app.id,
    applicantName: viewModel.applicantName,
    clubName: app.club_name || 'Individual',
    categoryLine,
    status: app.status,
    identityBlocks,
    photoBuffer: primaryImage ? primaryImage.imageBuffer : null,
    qrBuffer: signatureArtifacts.qrBuffer,
    verifyUrl: signatureArtifacts.signature && signatureArtifacts.signature.url,
    signatureShortId: shortSignatureId(signatureArtifacts.signature),
    issuingAuthority: brandName,
    issuedAt: formatDateTime(new Date()),
  });

  // ── Detail pages ───────────────────────────────────────────────────────
  // Register a running-header listener so every subsequent page carries
  // brand, app id, and the grayscale-safe status badge. Never draws on page 1.
  doc.on('pageAdded', () => {
    drawRunningHeader(doc, {
      palette,
      fonts,
      brandName,
      applicationDisplayId: viewModel.applicationDisplayId || app.id,
      tournamentName: asText(app.tournament_name),
      status: app.status,
    });
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
    doc.restore();
    doc.y = doc.page.margins.top + 16;
  });

  doc.addPage();

  // Section header for detail content
  doc.fillColor(palette.ink).font(fonts.headingBold).fontSize(TYPE_SCALE.h1.size)
    .text('Participant record', PX, doc.y);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size)
    .text('Full declaration, submitted documents, and workflow events for this registration.', PX, doc.y + 24, { width: CW });
  doc.y += 28;

  // ── Contact & additional identity details (moved from cover to page 2) ──
  const DETAILS_ROWS = [
    ['Email',        asText(app.email)],
    ['Phone',        asText(app.phone)],
    ['Gender',       asText(app.gender)],
    ['Club / Team',  asText(app.club_name || 'Individual')],
    ['Fight Record', `${app.record_wins || 0}W – ${app.record_losses || 0}L – ${app.record_draws || 0}D`],
    ['Experience',   asText(app.form_data?.experienceLevel)],
  ];
  const DETAILS_COLS = 3;
  const DETAILS_CW = (CW - GRID.gap * (DETAILS_COLS - 1)) / DETAILS_COLS;
  microLabel(doc, 'Contact & Profile', PX, doc.y, CW, palette, fonts);
  gridRule(doc, PX, doc.y + 13, CW, palette.line);
  doc.y += 18;
  for (let i = 0; i < DETAILS_ROWS.length; i += DETAILS_COLS) {
    ensureSpace(doc, 40);
    const rowY = doc.y;
    for (let c = 0; c < DETAILS_COLS; c += 1) {
      const idx = i + c;
      if (idx >= DETAILS_ROWS.length) break;
      const cx = PX + c * (DETAILS_CW + GRID.gap);
      gridCard(doc, cx, rowY, DETAILS_CW, 32, { fill: palette.surface, stroke: palette.cardBorder, radius: 4 });
      microLabel(doc, DETAILS_ROWS[idx][0], cx + 8, rowY + 5, DETAILS_CW - 16, palette, fonts);
      doc.fillColor(palette.text).font(fonts.body).fontSize(TYPE_SCALE.body.size)
        .text(asText(DETAILS_ROWS[idx][1]), cx + 8, rowY + 16, { width: DETAILS_CW - 16, ellipsis: true });
    }
    doc.y = rowY + 36;
  }
  doc.y += 6;

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
      gridCard(doc, cx, rowY, DECL_CW, DECL_CARD_H, { fill: palette.surface, stroke: palette.cardBorder, radius: 4 });
      microLabel(doc, declRows[idx][0], cx + 8, rowY + 5, DECL_CW - 16, palette, fonts);
      doc.fillColor(palette.text).font(fonts.body).fontSize(TYPE_SCALE.body.size)
        .text(asText(declRows[idx][1]), cx + 8, rowY + 15, { width: DECL_CW - 16, ellipsis: true });
    }
    doc.y = rowY + DECL_CARD_H + 5;
  }

  // Address row (full width)
  if (address) {
    ensureSpace(doc, DECL_CARD_H + 5);
    const addrY = doc.y;
    gridCard(doc, PX, addrY, CW, DECL_CARD_H, { fill: palette.surface, stroke: palette.cardBorder, radius: 4 });
    microLabel(doc, 'Address', PX + 8, addrY + 5, CW - 16, palette, fonts);
    const addrStr = `${asText(address.line1)}, ${asText(address.line2)}, ${asText(address.district)}, ${asText(address.state)}, ${asText(address.country)} ${asText(address.postalCode)}`;
    doc.fillColor(palette.text).font(fonts.body).fontSize(TYPE_SCALE.body.size)
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

  // ── ROW 6: Timeline ───────────────────────────────────────────────────────
  ensureSpace(doc, 60);
  microLabel(doc, 'Workflow Timeline', PX, doc.y, CW, palette, fonts);
  gridRule(doc, PX, doc.y + 13, CW, palette.line);
  doc.y += 18;
  drawTimelineCards(doc, statusEvents, { x: PX, width: CW, palette, fonts });

  // ── Footer ────────────────────────────────────────────────────────────────
  // Per-page signed ribbon is rendered via finalizePageRibbons below so that
  // page numbers, identifier, and signature fingerprint show on every page.
  finalizePageRibbons(doc, {
    palette,
    fonts,
    brand: brandName,
    identifier: `Application · ${viewModel.applicationDisplayId || app.id}`,
    signatureShortId: shortSignatureId(signatureArtifacts.signature),
  });

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

// Bracket primitives (slot, match, tree, champion card) now live in
// pdfComposition.js — see drawBracketTree / drawBracketChampionCard.

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
  const palette = createPalette(config);

  const filename = buildExportFilename({
    type: 'bracket',
    tournamentName: tournament?.name,
    tournamentId: bracket.tournamentId,
    extra: bracket.categoryLabel,
    bracketId: bracket.id,
    brand: brandName,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({
    ...baseDocumentOptions({
      title: `${brandName} / ${tournament?.name || 'Tournament'} / ${bracket.categoryLabel} bracket`,
      subject: 'Tournament bracket export',
      brand: brandName,
      keywords: ['bracket', tournament?.name || '', bracket.categoryLabel || ''].filter(Boolean),
    }),
    size: 'A4',
    layout: 'landscape',
    margins: { top: 28, bottom: 32, left: 28, right: 28 },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  // Paper wash
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
  doc.restore();

  // Header band (brand + tournament + category + meta)
  drawBracketHeader(doc, {
    palette, fonts, brandName,
    tournamentName: tournament?.name,
    categoryLabel: bracket.categoryLabel,
    statusText: `Status: ${statusLabel(bracket.status)}`,
    seedingLabel: `Draw: ${bracket.seedingLabel || bracket.seeding || '—'}`,
    exportedAt: `Exported ${formatDateOnly(new Date())}`,
  });

  // Classical elimination tree area
  const rounds = bracket.rounds || [];
  const ML = doc.page.margins.left;
  const MT = doc.page.margins.top;
  const MR = doc.page.margins.right;
  const MB = doc.page.margins.bottom;
  const headerH = 90;
  const treeTop = MT + headerH;
  const treeBottom = doc.page.height - MB - 32; // leave room for ribbon
  const treeHeight = treeBottom - treeTop;
  const championW = rounds.length ? 160 : 0;
  const gutter = rounds.length ? 16 : 0;
  const treeLeft = ML;
  const treeWidth = doc.page.width - ML - MR - championW - gutter;

  if (rounds.length) {
    drawBracketTree(doc, {
      rounds,
      x: treeLeft,
      y: treeTop,
      width: treeWidth,
      height: treeHeight,
      palette, fonts,
      slotWidth: Math.min(150, treeWidth / Math.max(1, rounds.length + 0.5)),
      slotHeight: autoSlotHeight({
        contentHeight: treeHeight,
        firstRoundMatches: rounds[0].matches.length,
      }),
      matchGap: 0,
    });

    // Champion card to the right of the final
    const finalMatch = rounds[rounds.length - 1]?.matches?.[0];
    if (finalMatch) {
      const champion = finalMatch.winnerIndex !== undefined ? finalMatch.sides?.[finalMatch.winnerIndex] : null;
      const championX = treeLeft + treeWidth + gutter;
      const championY = treeTop + treeHeight / 2 - 30;
      drawBracketChampionCard(doc, {
        x: championX, y: championY, champion, palette, fonts,
        width: championW, height: 60,
      });
      // Connector from final match → champion
      doc.save();
      doc.lineWidth(0.9).strokeColor(palette.ink).opacity(0.75);
      doc.moveTo(championX - gutter, championY + 30).lineTo(championX, championY + 30).stroke();
      doc.restore();
    }
  } else {
    // Empty state
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size)
      .text('No rounds have been generated for this bracket yet.', treeLeft, treeTop + 12, { width: treeWidth });
    doc.restore();
  }

  finalizePageRibbons(doc, {
    palette,
    fonts,
    brand: brandName,
    identifier: `Bracket · ${tournament?.name || 'Tournament'} · ${bracket.categoryLabel}`,
  });
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
  const palette = createPalette(config);

  const filename = buildExportFilename({
    type: 'division-bracket',
    tournamentName: division.tournamentName,
    divisionId: division.id,
    extra: division.label,
    brand: brandName,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({
    ...baseDocumentOptions({
      title: `${brandName} / ${division.tournamentName || 'Tournament'} / ${division.label} bracket`,
      subject: 'Division bracket export',
      brand: brandName,
      keywords: ['bracket', 'division', division.tournamentName || '', division.label || '']
        .filter(Boolean),
    }),
    size: 'A4',
    layout: 'landscape',
    margins: { top: 28, bottom: 32, left: 28, right: 28 },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(palette.paper);
  doc.restore();

  drawBracketHeader(doc, {
    palette, fonts, brandName,
    tournamentName: division.tournamentName,
    categoryLabel: division.label,
    statusText: `Status: ${bracket.statusLabel || statusLabel(bracket.status)}`,
    seedingLabel: `Draw: ${bracket.seedingLabel || '—'}`,
    exportedAt: `Exported ${formatDateOnly(new Date())}`,
  });

  const rounds = bracket.rounds || [];
  const ML = doc.page.margins.left;
  const MT = doc.page.margins.top;
  const MR = doc.page.margins.right;
  const MB = doc.page.margins.bottom;
  const headerH = 90;
  const treeTop = MT + headerH;
  const treeBottom = doc.page.height - MB - 32;
  const treeHeight = treeBottom - treeTop;
  const championW = 160;
  const gutter = 16;
  const treeLeft = ML;
  const treeWidth = doc.page.width - ML - MR - championW - gutter;

  const finalMatch = rounds[rounds.length - 1]?.matches?.[0];
  const champion = finalMatch?.winnerIndex !== undefined ? finalMatch.sides?.[finalMatch.winnerIndex] : (bracket.champion || payload.champion ? {
    name: bracket.champion?.name || payload.champion?.participantName,
    club: bracket.champion?.club || payload.champion?.clubName,
  } : null);

  if (rounds.length) {
    drawBracketTree(doc, {
      rounds,
      x: treeLeft,
      y: treeTop,
      width: treeWidth,
      height: treeHeight,
      palette, fonts,
      slotWidth: Math.min(150, treeWidth / Math.max(1, rounds.length + 0.5)),
      slotHeight: autoSlotHeight({
        contentHeight: treeHeight,
        firstRoundMatches: rounds[0].matches.length,
      }),
      matchGap: 0,
    });
  } else {
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size)
      .text('No rounds have been generated for this bracket yet.', treeLeft, treeTop + 12, { width: treeWidth });
    doc.restore();
  }

  if (finalMatch || champion) {
    const championX = treeLeft + treeWidth + gutter;
    const championY = treeTop + treeHeight / 2 - 30;
    drawBracketChampionCard(doc, {
      x: championX, y: championY, champion, palette, fonts,
      width: championW, height: 60,
    });
    if (rounds.length) {
      doc.save();
      doc.lineWidth(0.9).strokeColor(palette.ink).opacity(0.75);
      doc.moveTo(championX - gutter, championY + 30).lineTo(championX, championY + 30).stroke();
      doc.restore();
    }
  }

  finalizePageRibbons(doc, {
    palette,
    fonts,
    brand: brandName,
    identifier: `Division Bracket · ${division.tournamentName || 'Tournament'} · ${division.label}`,
  });
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

async function applicationExportSmoke(applicationId, actor) {
  const { app, palette, renderableImages, signatureArtifacts } = await loadApplicationExportViewModel(applicationId, actor);
  const doc = new PDFDocument({ autoFirstPage: false });
  const fonts = resolvePdfFonts(doc);
  const visualDocumentKinds = renderableImages
    .filter((row) => row.kind === 'photo_id')
    .map((row) => row.kind);

  return {
    applicationId: app.id,
    palette,
    fonts,
    verificationUrl: signatureArtifacts.signature.url,
    checks: {
      usesInterTightBody: fonts.body !== 'Helvetica',
      usesInterTightHeading: fonts.heading === fonts.bodyBold,
      onlyPhotoIdVisual: visualDocumentKinds.every((kind) => kind === 'photo_id'),
      hasVerificationUrl: signatureArtifacts.signature.url.includes('/api/public/verify/application-signature'),
    },
  };
}

// ─── Bulk ZIP export (Phase 4) ──────────────────────────────────────────────
//
// Replaces the frontend's sequential `for…await` of 250+ individual PDF
// downloads (with a native `window.confirm`) with a single streaming ZIP
// archive assembled server-side. Uses `archiver` to pipe the ZIP directly
// into the response — no large in-memory staging of the whole archive.
//
// Each entry inside the ZIP is still a canonical Primal OS application PDF
// with the deterministic filename built by `buildExportFilename()` so the
// archive unzips to human-readable files ready for print queues.

const archiver = require('archiver');
const { PassThrough } = require('stream');

/**
 * Render one application PDF into a Buffer. This is a thin wrapper around
 * `applicationToPdf(res, …)` that swaps the HTTP response for a PassThrough
 * sink so the resulting bytes can be written into a ZIP entry.
 *
 * Returns `{ filename, buffer }`. `filename` is the Content-Disposition
 * filename the endpoint would have used — ideal for the ZIP entry name.
 */
async function applicationToPdfBuffer(applicationId, actor, ctx = {}) {
  return new Promise((resolve, reject) => {
    const pass = new PassThrough();
    const chunks = [];
    let filename = `application-${applicationId}.pdf`;

    pass.on('data', (chunk) => chunks.push(chunk));
    pass.on('end', () => resolve({ filename, buffer: Buffer.concat(chunks) }));
    pass.on('error', reject);

    const resLike = {
      setHeader(name, value) {
        if (String(name).toLowerCase() === 'content-disposition') {
          const match = /filename="([^"]+)"/.exec(String(value));
          if (match) filename = match[1];
        }
      },
      write: pass.write.bind(pass),
      end: pass.end.bind(pass),
      on: pass.on.bind(pass),
      once: pass.once.bind(pass),
      emit: pass.emit.bind(pass),
      pipe: pass.pipe.bind(pass),
    };

    applicationToPdf(resLike, applicationId, actor, ctx).catch(reject);
  });
}

/**
 * Stream a ZIP of every approved participant PDF for the given tournament
 * (or across all tournaments when `tournamentId` is omitted) straight into
 * the response.
 *
 * The archive name is deterministic: `primal_<tournament>_participants_<date>.zip`
 * so the browser downloads a file with a useful name.
 *
 * Errors while generating an individual application PDF are swallowed per
 * entry so one bad record never breaks the whole bulk export — a manifest
 * file `_errors.txt` is appended at the end listing any failures.
 */
async function bulkApprovedParticipantsToZip(res, actor, { tournamentId } = {}, ctx = {}) {
  const report = await approvedParticipantReport({ tournamentId });
  const deduped = new Map();
  [...report.clubParticipants, ...report.individualParticipants].forEach((row) => {
    if (row?.applicationId && !deduped.has(row.applicationId)) {
      deduped.set(row.applicationId, row);
    }
  });
  const applications = Array.from(deduped.values());

  const brandName = config.pdf?.brandName || 'Primal';
  const tournamentName = applications[0]?.tournamentName || (tournamentId ? 'tournament' : 'all');
  const archiveName = buildExportFilename({
    type: 'participants',
    tournamentName,
    tournamentId: tournamentId || 'all',
    extra: `bundle-${applications.length}`,
    brand: brandName,
    extension: 'zip',
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
  res.setHeader('Cache-Control', 'no-store');

  const archive = archiver('zip', {
    zlib: { level: 5 }, // PDFs are already compressed — level 5 is a good balance
  });

  const errors = [];
  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') errors.push(`archive warning: ${err.message}`);
  });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500);
    errors.push(`archive error: ${err.message}`);
    try { res.end(); } catch (_) { /* ignore */ }
  });

  archive.pipe(res);

  // Sequential generation keeps memory flat — each PDF is buffered, zipped, and released.
  for (const row of applications) {
    try {
      const { filename, buffer } = await applicationToPdfBuffer(row.applicationId, actor, ctx);
      archive.append(buffer, { name: filename });
    } catch (err) {
      errors.push(`${row.applicationId} (${row.participantName || 'unknown'}): ${err.message}`);
    }
  }

  if (errors.length) {
    archive.append(errors.join('\n') + '\n', { name: '_errors.txt' });
  }

  // Include a human-readable manifest so federation staff can audit the bundle.
  const manifest = [
    `${brandName} · Approved participants bundle`,
    `Tournament: ${tournamentName}`,
    `Count: ${applications.length} approved applications`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '# applicationId | name | club | discipline',
    ...applications.map((row) => [
      row.applicationId,
      row.participantName || '—',
      row.clubName || 'Independent',
      row.discipline || '—',
    ].join(' | ')),
  ].join('\n');
  archive.append(`${manifest}\n`, { name: 'manifest.txt' });

  await archive.finalize();

  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'export.participants_bulk_zip',
    entityType: 'tournament',
    entityId: tournamentId || 'all',
    payload: {
      count: applications.length,
      errors: errors.length,
    },
    requestIp: ctx.ip,
  });
}

module.exports = {
  approvedToExcel,
  approvedParticipantsToExcel,
  groupedAnalyticsToExcel,
  groupedAnalyticsToPdf,
  seasonalReportToPdf,
  applicationToPaper,
  applicationToPdf,
  applicationToPdfBuffer,
  bulkApprovedParticipantsToZip,
  applicationExportSmoke,
  auditToExcel,
  bracketToPdf,
  divisionBracketToPdf,
};


