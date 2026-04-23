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
const { buildSignatureForApplication } = require('../pdfSignature');
const { approvedParticipantReport } = require('./report.service');
const bracketService = require('./bracket.service');
const matchService = require('./match.service');

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

function safeJoin(baseDir, subPath) {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, subPath || '');
  if (!resolved.startsWith(root)) return null;
  return resolved;
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
    doc.image(images[i].absolutePath, cardX + 2, y + 2, {
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

async function applicationToPdf(res, applicationId, actor, ctx = {}) {
  const app = await appsRepo.findFullById(applicationId);
  if (!app) { res.status(404).json({ error: { code: 'NOT_FOUND' } }); return; }
  await assertCanView(actor, app);

  const brandName = config.pdf?.brandName || 'Primal';
  const palette = {
    primary: normalizeHexColor(config.pdf?.brandPrimary, '#0b0b0b'),
    accent: normalizeHexColor(config.pdf?.brandAccent, '#ef1a1a'),
    text: '#0f172a',
    textMuted: '#475569',
    line: '#cbd5e1',
    surface: '#f8fafc',
  };
  const signature = buildSignatureForApplication(app);
  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(signature.url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 128,
      color: { dark: palette.accent, light: '#00000000' },
    });
  } catch (_err) {
    qrBuffer = null;
  }

  const [documents, statusEvents] = await Promise.all([
    docsRepo.listForApplication(app.id),
    eventsRepo.listForApplication(app.id),
  ]);

  const uploadRoot = path.resolve(config.uploadDir);
  const renderableImages = documents
    .filter((d) => isPdfImage(d))
    .map((d) => ({ ...d, absolutePath: safeJoin(uploadRoot, d.storage_key) }))
    .filter((d) => d.absolutePath && fs.existsSync(d.absolutePath));

  const primaryImage = renderableImages.find((d) => d.kind === 'photo_id') || renderableImages[0] || null;
  const address = app.metadata && typeof app.metadata === 'object' ? app.metadata.address : null;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',     `attachment; filename="application-${app.id}.pdf"`  );
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Application ${app.id}`,
      Author: brandName,
      Subject: 'Participant application export',
    },
  });

  doc.pipe(res);
  const fonts = resolvePdfFonts(doc);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageX = doc.page.margins.left;
  const pageY = doc.page.margins.top;

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff9f7');
  doc.fillOpacity(0.72).fillColor('#fde2e7').circle(doc.page.width - 88, 84, 140).fill();
  doc.fillOpacity(0.62).fillColor('#dbeafe').circle(82, doc.page.height - 120, 120).fill();
  doc.fillOpacity(0.34).fillColor('#fecaca').circle(doc.page.width / 2 + 40, doc.page.height / 2, 180).fill();
  doc.restore();

  const seasonStamp = String(app.tournament_name || brandName).replace(/championship/gi, '').trim() || 'Championship';
  const mastheadH = 132;
  drawPanel(doc, { x: pageX, y: pageY, width: contentWidth, height: mastheadH, fill: palette.primary, stroke: palette.primary, radius: 18 });
  doc.save();
  doc.fillOpacity(0.12).fillColor('#ffffff').circle(pageX + contentWidth - 112, pageY + 70, 52).fill();
  doc.fillOpacity(0.08).fillColor('#ffffff').circle(pageX + contentWidth - 112, pageY + 70, 64).fill();
  doc.restore();
  drawLogoMark(doc, {
    x: pageX + 18,
    y: pageY + 18,
    size: 52,
    logoPath: config.pdf?.logoPath,
    brandName,
    accent: palette.accent,
    fonts,
  });

  const statusColor = app.status === 'approved'
    ? '#166534'
    : app.status === 'rejected'
      ? '#991b1b'
      : app.status === 'needs_correction'
        ? '#92400e'
        : palette.accent;
  const badgeText = statusLabel(app.status);
  const badgeW = Math.max(92, doc.widthOfString(badgeText, { font: fonts.headingBold, size: 9 }) + 28);
  drawPanel(doc, { x: pageX + contentWidth - badgeW - 18, y: pageY + 18, width: badgeW, height: 24, fill: statusColor, stroke: statusColor, radius: 12 });
  doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(9)
    .text(badgeText, pageX + contentWidth - badgeW - 18, pageY + 26, { width: badgeW, align: 'center' });

  const headingX = pageX + 84;
  doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(24)
    .text(`${brandName} Fight Series`, headingX, pageY + 18);
  doc.fillColor('#fca5a5').font(fonts.heading).fontSize(10)
    .text('Participant Application Sheet', headingX, pageY + 48);
  doc.fillColor('#cbd5e1').font(fonts.body).fontSize(8.6)
    .text(`Generated ${formatDateTime(new Date())}`, headingX, pageY + 68);
  doc.fillColor('#cbd5e1').font(fonts.body).fontSize(8.6)
    .text(`Application ${app.id}`, headingX, pageY + 82, { width: 220, ellipsis: true });
  doc.fillColor('#cbd5e1').font(fonts.body).fontSize(8.6)
    .text(`Signature ${signature.sig.slice(0, 22)}...`, headingX + 232, pageY + 82, { width: contentWidth - 340, ellipsis: true });
  doc.fillColor('#e2e8f0').font(fonts.bodyBold).fontSize(7.2)
    .text('SANCTIONED APPLICATION RECORD', headingX, pageY + 99, { width: 180 });
  doc.fillColor('#ffffff').font(fonts.headingBold).fontSize(16)
    .text(brandInitials(seasonStamp), pageX + contentWidth - 142, pageY + 42, { width: 60, align: 'center' });
  doc.fillColor('#f8fafc').font(fonts.bodyBold).fontSize(7.5)
    .text(seasonStamp.toUpperCase(), pageX + contentWidth - 178, pageY + 80, { width: 132, align: 'center', ellipsis: true });
  doc.fillColor('#cbd5e1').font(fonts.body).fontSize(6.9)
    .text('Season crest', pageX + contentWidth - 178, pageY + 92, { width: 132, align: 'center' });

  const chipY = pageY + mastheadH + 16;
  const chipGap = 10;
  const chipW = (contentWidth - chipGap * 3) / 4;
  drawMetricChip(doc, { x: pageX, y: chipY, width: chipW, height: 42, label: 'Tournament', value: asText(app.tournament_name), palette, fonts, tone: '#ffffff' });
  drawMetricChip(doc, { x: pageX + chipW + chipGap, y: chipY, width: chipW, height: 42, label: 'Discipline', value: asText(app.discipline || 'Open'), palette, fonts, tone: '#fff5f5' });
  drawMetricChip(doc, { x: pageX + (chipW + chipGap) * 2, y: chipY, width: chipW, height: 42, label: 'Weight Class', value: asText(app.weight_class || 'Open'), palette, fonts, tone: '#f8fafc' });
  drawMetricChip(doc, { x: pageX + (chipW + chipGap) * 3, y: chipY, width: chipW, height: 42, label: 'Entry Type', value: app.club_name ? 'Club Entry' : 'Individual', palette, fonts, tone: '#f0fdf4' });

  const approvalStripY = chipY + 56;
  const approvalStripH = 52;
  drawPanel(doc, { x: pageX, y: approvalStripY, width: contentWidth, height: approvalStripH, fill: '#fffaf0', stroke: '#fed7aa', radius: 14 });
  doc.fillColor('#9a3412').font(fonts.bodyBold).fontSize(7.3)
    .text('APPROVAL & AUTHENTICATION STRIP', pageX + 14, approvalStripY + 10, { width: 190 });
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(10.5)
    .text(statusLabel(app.status), pageX + 14, approvalStripY + 23, { width: 110, ellipsis: true });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.8)
    .text(`Reviewer ${asText(app.reviewer_id)}`, pageX + 132, approvalStripY + 14, { width: 150, ellipsis: true });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.8)
    .text(`Decision ${formatDateTime(app.decided_at)}`, pageX + 132, approvalStripY + 27, { width: 150, ellipsis: true });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.8)
    .text(`Verified via signed export digest ${signature.dig.slice(0, 12)}...`, pageX + 300, approvalStripY + 20, { width: contentWidth - 314, ellipsis: true });

  const mainY = approvalStripY + approvalStripH + 14;
  const leftW = 352;
  const rightW = contentWidth - leftW - 16;
  const profileH = 224;
  drawPanel(doc, { x: pageX, y: mainY, width: leftW, height: profileH, fill: '#ffffff', stroke: palette.line, radius: 16 });
  drawPanel(doc, { x: pageX + leftW + 16, y: mainY, width: rightW, height: profileH, fill: '#ffffff', stroke: palette.line, radius: 16 });

  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(12)
    .text('Applicant Identity', pageX + 16, mainY + 16);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(8.5)
    .text('Primary identity, contact, and competition profile.', pageX + 16, mainY + 30);

  drawLabeledGrid(doc, [
    ['Applicant', `${asText(app.first_name)} ${asText(app.last_name)}`],
    ['Email', asText(app.email)],
    ['Phone', asText(app.phone)],
    ['Date of Birth', formatDateOnly(app.date_of_birth)],
    ['Gender', asText(app.gender)],
    ['Nationality', asText(app.nationality)],
    ['Club', asText(app.club_name || 'Individual')],
    ['Record', `${app.record_wins || 0}-${app.record_losses || 0}-${app.record_draws || 0}`],
    ['Discipline', asText(app.discipline)],
    ['Weight', app.weight_kg ? `${app.weight_kg} kg` : '?'],
  ], {
    x: pageX + 16,
    y: mainY + 52,
    width: leftW - 32,
    columns: 2,
    labelWidth: 62,
    rowHeight: 30,
    gap: 8,
    palette,
    fonts,
    fill: '#f8fafc',
  });

  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(12)
    .text('Verification & Photo', pageX + leftW + 32, mainY + 16);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(8.5)
    .text('Visual ID block and public signature verification.', pageX + leftW + 32, mainY + 30);

  const photoX = pageX + leftW + 32;
  const photoY = mainY + 52;
  const photoW = 118;
  const photoH = 144;
  drawPanel(doc, { x: photoX, y: photoY, width: photoW, height: photoH, fill: '#f8fafc', stroke: '#94a3b8', radius: 12 });
  drawPanel(doc, { x: photoX + 8, y: photoY + 18, width: photoW - 16, height: photoH - 38, fill: '#edf2f7', stroke: palette.line, radius: 8 });
  doc.fillColor('#475569').font(fonts.bodyBold).fontSize(7)
    .text('PHOTO ID', photoX, photoY + 8, { width: photoW, align: 'center' });
  if (primaryImage) {
    doc.image(primaryImage.absolutePath, photoX + 11, photoY + 21, {
      fit: [photoW - 22, photoH - 44],
      align: 'center',
      valign: 'center',
    });
  } else {
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(8.5)
      .text('No renderable image uploaded', photoX + 16, photoY + 68, { width: photoW - 32, align: 'center' });
  }
  doc.fillColor(palette.text).font(fonts.bodyBold).fontSize(7.1)
    .text(`${asText(app.first_name)} ${asText(app.last_name)}`, photoX + 8, photoY + photoH - 16, { width: photoW - 16, align: 'center', ellipsis: true });

  const verifyX = photoX + photoW + 16;
  const verifyW = rightW - (verifyX - (pageX + leftW + 16)) - 16;
  drawPanel(doc, { x: verifyX, y: photoY, width: verifyW, height: 72, fill: '#fff1f2', stroke: '#fecdd3', radius: 10 });
  doc.fillColor('#7f1d1d').font(fonts.headingBold).fontSize(9.2)
    .text('Digital signature', verifyX + 12, photoY + 10);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.8)
    .text('Scan the QR code or open the verify link to confirm authenticity.', verifyX + 12, photoY + 24, { width: verifyW - 92 });
  doc.fillColor(palette.accent).font(fonts.body).fontSize(7.4)
    .text(signature.url, verifyX + 12, photoY + 48, { width: verifyW - 92, ellipsis: true });
  if (qrBuffer) {
    doc.image(qrBuffer, verifyX + verifyW - 60, photoY + 10, {
      fit: [48, 48],
      align: 'center',
      valign: 'center',
    });
  }

  drawPanel(doc, { x: verifyX, y: photoY + 82, width: verifyW, height: 62, fill: '#f8fafc', stroke: palette.line, radius: 10 });
  doc.fillColor(palette.text).font(fonts.headingBold).fontSize(8.8)
    .text('Application digest', verifyX + 12, photoY + 92);
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.5)
    .text(`Digest ${signature.dig.slice(0, 28)}...`, verifyX + 12, photoY + 108, { width: verifyW - 24, ellipsis: true });
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(7.5)
    .text(`Issued ${formatDateTime(new Date(signature.iat * 1000))}`, verifyX + 12, photoY + 122, { width: verifyW - 24, ellipsis: true });

  doc.y = mainY + profileH + 16;
  sectionHeading(doc, 'Competition Declaration', palette, fonts);
  const detailsEndY = drawLabeledGrid(doc, [
    ['Submitted At', formatDateTime(app.submitted_at)],
    ['Review Started', formatDateTime(app.review_started_at)],
    ['Review Due', formatDateTime(app.review_due_at)],
    ['Decided At', formatDateTime(app.decided_at)],
    ['Correction Due', formatDateTime(app.correction_due_at)],
    ['Reviewer ID', asText(app.reviewer_id)],
    ['Experience Level', asText(app.form_data?.experienceLevel)],
    ['Selected Disciplines', Array.isArray(app.form_data?.selectedDisciplines) ? app.form_data.selectedDisciplines.join(', ') : '?'],
    ['Rejection Reason', asText(app.rejection_reason)],
    ['Reopen Reason', asText(app.reopen_reason)],
    ['Address', address ? `${asText(address.line1)}, ${asText(address.line2)}, ${asText(address.district)}, ${asText(address.state)}, ${asText(address.country)} ${asText(address.postalCode)}` : '?'],
    ['Applicant Notes', asText(app.form_data?.notes)],
  ], {
    x: pageX,
    y: doc.y,
    width: contentWidth,
    columns: 2,
    labelWidth: 88,
    rowHeight: 32,
    gap: 8,
    palette,
    fonts,
    fill: '#ffffff',
  });
  doc.y = detailsEndY + 16;

  sectionHeading(doc, 'Document Register', palette, fonts);
  drawDocumentTable(doc, documents, palette, fonts);

  if (renderableImages.length) {
    sectionHeading(doc, 'Supporting Attachments', palette, fonts);
    drawImageGallery(doc, renderableImages, palette, fonts);
  }

  sectionHeading(doc, 'Workflow Timeline', palette, fonts);
  drawTimelineCards(doc, statusEvents, { x: pageX, width: contentWidth, palette, fonts });

  doc.moveDown(0.7)
    .fillColor('#64748b')
    .font(fonts.body)
    .fontSize(8)
    .text(`${brandName} application export ? branded review sheet ? digitally signed and verifiable`, pageX, doc.y, {
      width: contentWidth,
      align: 'center',
    });

  doc.end();

  await auditWrite({ actorUserId: actor?.id, actorRole: actor?.role, action: 'export.pdf',
    entityType: 'application', entityId: applicationId, payload: {}, requestIp: ctx.ip });
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
