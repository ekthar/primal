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
  doc.roundedRect(x, headerY, width, 18, 4).fill(palette.primary);
  doc.restore();

  let colX = x;
  columns.forEach((c) => {
    doc.fillColor('#111111').font(fonts.headingBold).fontSize(8)
      .text(String(c.label).toUpperCase(), colX + 4, headerY + 5, { width: c.w - 8 });
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
      doc.roundedRect(x, rowY, width, rowHeight, 3).fill('#fff8f1');
      doc.restore();
    }

    let vx = x;
    columns.forEach((c) => {
      doc.fillColor(palette.text).font(fonts.body).fontSize(8)
        .text(String(values[c.key]).toUpperCase ? values[c.key] : values[c.key], vx + 4, rowY + 5, { width: c.w - 8, ellipsis: true });
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

  events.forEach((ev) => {
    ensureSpace(doc, 44);
    const y = doc.y;
    drawPanel(doc, { x, y, width, height: 38, fill: '#fffdf9', stroke: palette.line, radius: 2 });
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

function drawAnalyticsTable(doc, title, rows, palette, fonts) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const columns = [
    { key: 'label', label: title, width: 190 },
    { key: 'submitted', label: 'Submitted', width: 60 },
    { key: 'under_review', label: 'Review', width: 56 },
    { key: 'needs_correction', label: 'Correction', width: 64 },
    { key: 'season_closed', label: 'Season Closed', width: 68 },
    { key: 'approved', label: 'Approved', width: 60 },
    { key: 'rejected', label: 'Rejected', width: 60 },
    { key: 'total', label: 'Total', width: 52 },
  ];

  ensureSpace(doc, 36);
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(13).text(title);
  doc.moveDown(0.3);

  const headerY = doc.y;
  doc.save();
  doc.roundedRect(x, headerY, width, 22, 6).fill('#ece6dc');
  doc.restore();

  let headerX = x;
  columns.forEach((column) => {
    doc.fillColor(palette.text).font(fonts.bodyBold).fontSize(8)
      .text(column.label.toUpperCase(), headerX + 6, headerY + 7, { width: column.width - 12, ellipsis: true });
    headerX += column.width;
  });

  doc.y = headerY + 26;
  if (!rows.length) {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(9).text('No grouped rows found for the selected filters.');
    doc.moveDown(1);
    return;
  }

  rows.forEach((row, index) => {
    ensureSpace(doc, 22);
    const rowY = doc.y;
    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(x, rowY, width, 20, 4).fill('#fbfaf7');
      doc.restore();
    }

    const values = {
      label: row.label,
      submitted: row.statuses.submitted,
      under_review: row.statuses.under_review,
      needs_correction: row.statuses.needs_correction,
      season_closed: row.statuses.season_closed,
      approved: row.statuses.approved,
      rejected: row.statuses.rejected,
      total: row.statuses.total,
    };

    let valueX = x;
    columns.forEach((column) => {
      doc.fillColor(palette.text).font(fonts.body).fontSize(8.5)
        .text(String(values[column.key]), valueX + 6, rowY + 6, { width: column.width - 12, ellipsis: true });
      valueX += column.width;
    });
    doc.y = rowY + 22;
  });

  doc.moveDown(0.8);
}

async function groupedAnalyticsToPdf(res, actor, { tournamentId, discipline } = {}, ctx = {}) {
  const report = await groupedApplicationReport({ tournamentId, discipline });
  const brandName = config.pdf?.brandName || 'Primal';
  const palette = {
    primary: '#8c6a43',
    text: '#1f2937',
    textMuted: '#5f6773',
    line: '#2f3742',
  };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="application-analytics.pdf"');
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 28, bottom: 28, left: 28, right: 28 },
    info: {
      Title: 'Application analytics export',
      Author: brandName,
      Subject: 'Grouped application analytics',
    },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f4f1ea');
  doc.restore();

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  drawPanel(doc, {
    x: doc.page.margins.left,
    y: doc.page.margins.top,
    width: pageWidth,
    height: 84,
    fill: '#fbfaf7',
    stroke: '#2f3742',
    radius: 16,
  });

  doc.fillColor(palette.primary).font(fonts.bodyBold).fontSize(9)
    .text('GROUPED APPLICATION ANALYTICS', doc.page.margins.left + 18, doc.page.margins.top + 16);
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(24)
    .text(brandName, doc.page.margins.left + 18, doc.page.margins.top + 30);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(9)
    .text(`Generated ${formatDateTime(report.generatedAt)} / Tournament ${displayText(report.filters.tournamentId, 'All')} / Discipline ${displayText(report.filters.discipline, 'All')}`, doc.page.margins.left + 18, doc.page.margins.top + 58);

  const kpiY = doc.page.margins.top + 104;
  const kpiW = (pageWidth - 24) / 4;
  [
    ['All applications', report.totals.total],
    ['Approved', report.totals.approved],
    ['Pending', report.totals.submitted + report.totals.under_review + report.totals.needs_correction],
    ['Rejected', report.totals.rejected],
  ].forEach(([label, value], index) => {
    drawMetricChip(doc, {
      x: doc.page.margins.left + index * (kpiW + 8),
      y: kpiY,
      width: kpiW,
      height: 54,
      label,
      value: String(value),
      palette,
      fonts,
      tone: '#fbfaf7',
    });
  });

  doc.y = kpiY + 72;
  drawAnalyticsTable(doc, 'By discipline', report.disciplineGroups, palette, fonts);
  drawAnalyticsTable(doc, 'By weight class', report.weightClassGroups, palette, fonts);
  drawAnalyticsTable(doc, 'By category', report.categoryGroups.map((row) => ({
    ...row,
    label: `${row.label} / ${row.discipline} / ${row.weightClass}`,
  })), palette, fonts);

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
  const palette = {
    primary: '#8c6a43',
    text: '#1f2937',
    textMuted: '#5f6773',
    line: '#2f3742',
  };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="season-${report.tournament.id}.pdf"`);
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 24, bottom: 24, left: 24, right: 24 },
    info: {
      Title: `${report.tournament.name} seasonal report`,
      Author: brandName,
      Subject: 'Season archive report',
    },
  });
  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f4f1ea');
  doc.restore();

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  drawPanel(doc, {
    x: doc.page.margins.left,
    y: doc.page.margins.top,
    width: pageWidth,
    height: 88,
    fill: '#fbfaf7',
    stroke: '#2f3742',
    radius: 16,
  });
  doc.fillColor(palette.primary).font(fonts.bodyBold).fontSize(9)
    .text('SEASON ARCHIVE REPORT', doc.page.margins.left + 18, doc.page.margins.top + 16);
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(22)
    .text(report.tournament.name, doc.page.margins.left + 18, doc.page.margins.top + 30);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(9)
    .text(`Season ${displayText(report.tournament.season, 'N/A')} / Archived ${displayText(formatDateOnly(report.tournament.archivedAt), 'Active')} / Generated ${formatDateTime(report.generatedAt)}`, doc.page.margins.left + 18, doc.page.margins.top + 58);

  const kpiY = doc.page.margins.top + 104;
  const kpiW = (pageWidth - 8) / 2;
  [
    ['Registered', report.totals.total],
    ['Approved', report.totals.approved],
    ['Divisions', report.divisions.length],
    ['Matches', report.matches.filter((row) => row.matchId).length],
  ].forEach(([label, value], index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    drawMetricChip(doc, {
      x: doc.page.margins.left + col * (kpiW + 8),
      y: kpiY + row * 60,
      width: kpiW,
      height: 52,
      label,
      value: String(value),
      palette,
      fonts,
      tone: '#fbfaf7',
    });
  });

  doc.y = kpiY + 128;
  drawSeasonRegistrationTable(doc, report.registrations, palette, fonts);
  drawSeasonDivisionTable(doc, report.divisions, palette, fonts);
  drawSeasonMatchesTable(doc, report.matches, palette, fonts);

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

function drawSeasonRegistrationTable(doc, rows, palette, fonts) {
  const columns = [
    { key: 'applicationDisplayId', label: 'App ID', width: 54 },
    { key: 'participantName', label: 'Participant', width: 104 },
    { key: 'discipline', label: 'Discipline', width: 68 },
    { key: 'weightClass', label: 'Wt Class', width: 54 },
    { key: 'weightKg', label: 'Kg', width: 34 },
    { key: 'status', label: 'Status', width: 64 },
    { key: 'category', label: 'Category', width: 118 },
    { key: 'bracketState', label: 'Bracket', width: 70 },
  ];
  drawWideTable(doc, 'Registered participants by category', rows, columns, palette, fonts);
}

function drawSeasonDivisionTable(doc, rows, palette, fonts) {
  const columns = [
    { key: 'discipline_name', label: 'Discipline', width: 82 },
    { key: 'label', label: 'Division', width: 170 },
    { key: 'fighter_count', label: 'Fighters', width: 48 },
    { key: 'match_count', label: 'Matches', width: 48 },
    { key: 'champion_name', label: 'Winner', width: 110 },
    { key: 'champion_club_name', label: 'Club', width: 86 },
  ];
  drawWideTable(doc, 'Division winners and category summary', rows, columns, palette, fonts);
}

function drawSeasonMatchesTable(doc, rows, palette, fonts) {
  const columns = [
    { key: 'divisionLabel', label: 'Division', width: 154 },
    { key: 'roundNumber', label: 'Rnd', width: 34 },
    { key: 'matchNumber', label: 'Bout', width: 34 },
    { key: 'redName', label: 'Red', width: 84 },
    { key: 'blueName', label: 'Blue', width: 84 },
    { key: 'winnerName', label: 'Winner', width: 84 },
    { key: 'status', label: 'Status', width: 58 },
  ];
  drawWideTable(doc, 'Bracket and match ledger', rows.filter((row) => row.matchId), columns, palette, fonts);
}

function drawWideTable(doc, title, rows, columns, palette, fonts) {
  ensureSpace(doc, 36);
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(13).text(title);
  doc.moveDown(0.3);
  const x = doc.page.margins.left;
  const width = columns.reduce((sum, column) => sum + column.width, 0);

  const drawHeader = () => {
    const headerY = doc.y;
    doc.save();
    doc.roundedRect(x, headerY, width, 22, 6).fill('#ece6dc');
    doc.restore();

    let currentX = x;
    columns.forEach((column) => {
      doc.fillColor(palette.text).font(fonts.bodyBold).fontSize(7.2)
        .text(column.label.toUpperCase(), currentX + 4, headerY + 7, { width: column.width - 8, ellipsis: true });
      currentX += column.width;
    });
    doc.y = headerY + 26;
  };

  drawHeader();
  if (!rows.length) {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(9).text('No rows found.');
    doc.moveDown(0.8);
    return;
  }

  rows.forEach((row, index) => {
    if (doc.y + 20 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const rowY = doc.y;
    if (index % 2 === 0) {
      doc.save();
      doc.roundedRect(x, rowY, width, 19, 4).fill('#fbfaf7');
      doc.restore();
    }
    let rowX = x;
    columns.forEach((column) => {
      doc.fillColor(palette.text).font(fonts.body).fontSize(7.2)
        .text(displayText(row[column.key], ''), rowX + 4, rowY + 6, { width: column.width - 8, ellipsis: true });
      rowX += column.width;
    });
    doc.y = rowY + 21;
  });

  doc.moveDown(0.8);
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
  const palette = {
    primary: '#8c6a43',
    accent: '#2f3742',
    text: '#1f2937',
    textMuted: '#5f6773',
    line: '#2f3742',
    surface: '#f4f1ea',
    cardBorder: '#2f3742',
  };

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
          <div style="display: flex; flex-direction: column; width: calc(42.5% - 8px); border: 1px solid #2f3742; border-radius: 10px; background: #fbfaf7; padding: 12px; gap: 12px;" layer-name="Verification Panel">
            <div style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="display: flex; flex-direction: column; gap: 6px; width: 80px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; justify-content: center; width: 80px; height: 104px; border: 1px solid #2f3742; border-radius: 8px; background: #e7e0d5; color: #5f6773; font-size: 10px; text-transform: uppercase;">${viewModel.primaryImageName ? 'Photo ID' : 'No Photo'}</div>
                <div style="color: #5f6773; font-size: 9px; font-weight: 700; text-transform: uppercase;">${escapeHtml(viewModel.primaryImageName || 'No photo uploaded')}</div>
              </div>
              <div style="display: flex; flex-direction: column; flex: 1; gap: 10px; min-width: 0;">
                <div style="color: #1f2937; font-size: 11px; font-weight: 700;">${escapeHtml(viewModel.applicantName)}</div>
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
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:6px;border-top:1px solid #d7d0c5;">
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
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f4f1ea');
  doc.restore();

  // ── HEADER BAND ──────────────────────────────────────────────────────────
  const HEADER_H = 80;
  doc.save();
  doc.rect(0, 0, doc.page.width, HEADER_H + 32).fill(palette.primary);
  doc.restore();

  // Logo mark
  const LOGO_SIZE = 54;
  const logo = resolveLogoPath(config.pdf?.logoPath);
  if (logo) {
    doc.image(logo, PX, PY + 2, { fit: [LOGO_SIZE, LOGO_SIZE], align: 'center', valign: 'center' });
  } else {
    doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(14)
      .text(brandInitials(brandName), PX, PY + 19, { width: LOGO_SIZE, align: 'center' });
  }

  // Brand + tournament
  doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(18)
    .text(brandName, PX + LOGO_SIZE + 14, PY + 10);
  doc.fillColor('#ece6dc').font(fonts.body).fontSize(8.5)
    .text(asText(app.tournament_name), PX + LOGO_SIZE + 14, PY + 33);
  doc.fillColor('#e4d7c6').font(fonts.body).fontSize(7.5)
    .text(`Application  ${viewModel.applicationDisplayId}   /   ${formatDateTime(new Date())}`, PX + LOGO_SIZE + 14, PY + 47);

  // Status pill + ID (right-aligned)
  const pillX = PX + CW - 130;
  statusPill(doc, app.status, pillX, PY + 14, fonts);
  doc.fillColor('#ece6dc').font(fonts.body).fontSize(7)
    .text('PARTICIPANT REGISTRATION EXPORT', pillX - 34, PY + 40, { width: 170, align: 'right' });

  // Divider below header
  doc.y = PY + HEADER_H + 10;

  // ── ROW 1: 4 metric chips ─────────────────────────────────────────────
  const CHIP_H = 58;
  const CHIP_W = (CW - GRID.gap * 3) / 4;
  const chips = [
    { label: 'Disciplines',  value: displayText(appliedDisciplines.length ? appliedDisciplines.join(' / ') : 'Open') },
    { label: 'Weight Class', value: asText(app.weight_class || 'Open')   },
    { label: 'Entry Type',   value: app.club_name ? 'Club Entry' : 'Individual' },
    { label: 'Status',       value: statusLabel(app.status)              },
  ];
  const chipY = doc.y;
  chips.forEach((chip, i) => {
    const cx = PX + i * (CHIP_W + GRID.gap);
    gridCard(doc, cx, chipY, CHIP_W, CHIP_H, { fill: '#fbfaf7', stroke: palette.cardBorder, radius: 8 });
    microLabel(doc, chip.label, cx + 10, chipY + 8, CHIP_W - 20, palette, fonts);
    doc.fillColor(palette.text).font(fonts.headingBold).fontSize(11)
      .text(chip.value, cx + 10, chipY + 18, { width: CHIP_W - 20, height: CHIP_H - 22, ellipsis: true });
  });
  doc.y = chipY + CHIP_H + 10;

  const disciplinesY = doc.y;
  const disciplinesH = 66;
  gridCard(doc, PX, disciplinesY, CW, disciplinesH, { fill: '#fbfaf7', stroke: palette.cardBorder, radius: 8, accentColor: palette.primary, accentW: 4 });
  microLabel(doc, 'Discipline Breakdown', PX + 14, disciplinesY + 10, CW - 28, palette, fonts);
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
    ['Full Name',    displayText(viewModel.applicantName)],
    ['Application ID', viewModel.applicationDisplayId],
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
  gridCard(doc, PX, ROW2_Y, LEFT_W, ID_CARD_H, { fill: '#fbfaf7', stroke: palette.cardBorder, radius: 8, accentColor: palette.primary, accentW: 4 });

  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(10)
    .text('Applicant Identity', PX + 14, ROW2_Y + 12);
  gridRule(doc, PX + 14, ROW2_Y + 28, LEFT_W - 28, palette.line);

  ID_ROWS.forEach((row, i) => {
    const ry = ROW2_Y + 36 + i * 22;
    const bgFill = i % 2 === 0 ? '#ede7dc' : '#fbfaf7';
    doc.save();
    doc.rect(PX + 14, ry, LEFT_W - 28, 20).fill(bgFill);
    doc.restore();
    kvRow(doc, row[0], row[1], PX + 18, ry + 6, LEFT_W - 36, palette, fonts, 82);
  });

  // RIGHT: photo + digital approval stacked
  const PHOTO_CARD_H = 214;
  gridCard(doc, RIGHT_X, ROW2_Y, RIGHT_W, PHOTO_CARD_H, { fill: '#fbfaf7', stroke: palette.cardBorder, radius: 8 });

  const PHOTO_W = 80;
  const PHOTO_H = 104;
  const PHOTO_X = RIGHT_X + 12;
  const PHOTO_Y = ROW2_Y + 16;
  doc.save();
  doc.roundedRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 8).fill('#e7e0d5');
  doc.roundedRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H, 8).strokeColor('#2f3742').lineWidth(0.75).stroke();
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
    .text(viewModel.applicantName, VX, PHOTO_Y, { width: VW, ellipsis: true });
  microLabel(doc, 'Reviewer ID', VX, PHOTO_Y + 14, VW, palette, fonts);
  doc.fillColor(palette.text).font(fonts.body).fontSize(8)
    .text(displayText(viewModel.reviewerDisplayId, 'Unassigned'), VX, PHOTO_Y + 22, { width: VW, ellipsis: true });
  microLabel(doc, 'Decided', VX, PHOTO_Y + 36, VW, palette, fonts);
  doc.fillColor(palette.text).font(fonts.body).fontSize(8)
    .text(formatDateTime(app.decided_at), VX, PHOTO_Y + 44, { width: VW });

  doc.save();
  doc.circle(VX + 12, PHOTO_Y + 78, 11).fill(palette.primary);
  doc.lineWidth(2).lineCap('round').strokeColor('#ffffff');
  doc.moveTo(VX + 7, PHOTO_Y + 78).lineTo(VX + 11, PHOTO_Y + 82).lineTo(VX + 18, PHOTO_Y + 73).stroke();
  doc.restore();
  doc.fillColor('#1f2937').font(fonts.bodyBold).fontSize(8.5)
    .text('DIGITALLY VERIFIED', VX + 28, PHOTO_Y + 70, { width: VW - 28, ellipsis: true });
  doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(7.2)
    .text('SIGNED RECORD / INTERNAL REFERENCE COPY', VX, PHOTO_Y + 84, { width: VW - 6, align: 'left' });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.2)
    .text('Verified copy of the submitted participant record.', VX, PHOTO_Y + 98, { width: VW - 6, align: 'left' });

  const qrSectionY = ROW2_Y + PHOTO_CARD_H - 76;
  doc.save();
  doc.roundedRect(RIGHT_X + 12, qrSectionY, RIGHT_W - 24, 60, 8).fill('#f4f1ea');
  doc.restore();
  const qrBoxSize = 52;
  const qrX = RIGHT_X + RIGHT_W - qrBoxSize - 20;
  const qrY = qrSectionY + 4;
  doc.save();
  doc.roundedRect(qrX - 106, qrY, 86, qrBoxSize, 8).fill('#ede7dc');
  doc.restore();
  doc.image(signatureArtifacts.qrBuffer, qrX, qrY, { fit: [qrBoxSize, qrBoxSize] });
  doc.fillColor(palette.textMuted).font(fonts.bodyBold).fontSize(6.5)
    .text('SCAN TO VERIFY', qrX - 98, qrY + 10, { width: 72, align: 'right' });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(5.6)
    .text('Printed QR opens the signed verification record.', qrX - 112, qrY + 22, { width: 94, align: 'right' });

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
      gridCard(doc, cx, rowY, DECL_CW, DECL_CARD_H, { fill: '#fbfaf7', stroke: palette.cardBorder, radius: 6 });
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
    gridCard(doc, PX, addrY, CW, DECL_CARD_H, { fill: '#fbfaf7', stroke: palette.cardBorder, radius: 6 });
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

module.exports = {
  approvedToExcel,
  approvedParticipantsToExcel,
  groupedAnalyticsToExcel,
  groupedAnalyticsToPdf,
  seasonalReportToPdf,
  applicationToPaper,
  applicationToPdf,
  applicationExportSmoke,
  auditToExcel,
  bracketToPdf,
  divisionBracketToPdf,
};


