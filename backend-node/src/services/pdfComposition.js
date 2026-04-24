/**
 * Primal OS PDF composition helpers.
 *
 * These are the shared drawing primitives that render the federation-grade
 * cover page, running header, grayscale-safe status badge, and 4-block
 * identity grid used by the Application PDF (Phase 1) and re-used by later
 * templates (bracket poster, analytics yearbook).
 *
 * Every helper respects the Primal OS type scale (TYPE_SCALE) and palette
 * (createPalette) from pdfTokens.js. No template should ever call fontSize()
 * with a number that is not one of the six TYPE_SCALE values.
 */

const {
  TYPE_SCALE,
  getStatusSpec,
  resolveStatusColor,
} = require('./pdfTokens');

// ─── Low-level drawing primitives ─────────────────────────────────────────

function setType(doc, font, variant) {
  const spec = TYPE_SCALE[variant];
  if (!spec) throw new Error(`Unknown type scale variant: ${variant}`);
  doc.font(font).fontSize(spec.size);
  if (typeof spec.letterSpacing === 'number') doc.lineGap(spec.lineGap || 0);
  return spec;
}

/**
 * Position-locked text: writes a string at (x, y) without mutating doc.y
 * and without triggering an automatic page break if the write lands near
 * the page margin. Composition helpers must use this instead of raw
 * doc.text() so that drawing a cover / header / badge is always a pure
 * visual operation that never shifts the document cursor out from under
 * the caller.
 */
function lockedText(doc, str, x, y, options = {}) {
  const savedY = doc.y;
  doc.text(str, x, y, {
    lineBreak: false,
    height: 0,
    ...options,
  });
  doc.y = savedY;
}

/**
 * Draw one of the icon shapes declared in STATUS_SPEC at (cx, cy) with radius
 * `r`. All shapes are solid-ink (single color) and look identical in
 * grayscale — the shape alone communicates the status.
 */
function drawStatusGlyph(doc, { shape, cx, cy, r, color, bg }) {
  doc.save();
  // Filled background disc so the glyph sits inside a tidy chip.
  doc.circle(cx, cy, r + 3).fill(bg || color);
  const strokeColor = '#FFFFFF';
  doc.strokeColor(strokeColor).lineWidth(Math.max(1.1, r * 0.22)).lineCap('round').lineJoin('round');

  switch (shape) {
    case 'check': {
      const s = r * 0.55;
      doc.moveTo(cx - s, cy + s * 0.1)
         .lineTo(cx - s * 0.2, cy + s * 0.9)
         .lineTo(cx + s, cy - s * 0.7)
         .stroke();
      break;
    }
    case 'cross': {
      const s = r * 0.62;
      doc.moveTo(cx - s, cy - s).lineTo(cx + s, cy + s).stroke();
      doc.moveTo(cx - s, cy + s).lineTo(cx + s, cy - s).stroke();
      break;
    }
    case 'asterisk': {
      const s = r * 0.7;
      const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
      angles.forEach((a) => {
        doc.moveTo(cx - Math.cos(a) * s, cy - Math.sin(a) * s)
           .lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s)
           .stroke();
      });
      break;
    }
    case 'clock': {
      const s = r * 0.65;
      doc.circle(cx, cy, s).lineWidth(Math.max(0.9, r * 0.14)).stroke();
      doc.moveTo(cx, cy).lineTo(cx, cy - s * 0.7).stroke();
      doc.moveTo(cx, cy).lineTo(cx + s * 0.5, cy).stroke();
      break;
    }
    case 'dash': {
      const s = r * 0.65;
      doc.moveTo(cx - s, cy).lineTo(cx + s, cy).stroke();
      break;
    }
    case 'dot':
    default: {
      doc.fillColor(strokeColor).circle(cx, cy, Math.max(1.5, r * 0.32)).fill();
      break;
    }
  }
  doc.restore();
}

// ─── Public composition helpers ───────────────────────────────────────────

/**
 * Grayscale-safe status badge. Renders an icon glyph + textual label inside a
 * rounded capsule so that status meaning survives a B&W print and a
 * screen-reader (via the text label). Colors are *accent*, never decorative.
 *
 *   drawStatusBadge(doc, { status: 'approved', x, y, palette, fonts })
 */
function drawStatusBadge(doc, {
  status,
  x,
  y,
  palette,
  fonts,
  scale = 1,
}) {
  const spec = getStatusSpec(status);
  const color = resolveStatusColor(spec.tone, palette);

  const padX = 10 * scale;
  const padY = 5 * scale;
  const iconR = 7 * scale;
  const gap = 8 * scale;

  const font = fonts.bodyBold || fonts.body || 'Helvetica-Bold';
  doc.save();
  doc.font(font).fontSize(TYPE_SCALE.label.size * scale);
  const textWidth = doc.widthOfString(spec.label);
  doc.restore();

  const width = padX + (iconR * 2) + gap + textWidth + padX;
  const height = Math.max(iconR * 2 + padY * 2, 22 * scale);

  // Capsule
  doc.save();
  doc.roundedRect(x, y, width, height, height / 2).fill(palette.paper);
  doc.roundedRect(x, y, width, height, height / 2).lineWidth(1).strokeColor(color).stroke();
  doc.restore();

  drawStatusGlyph(doc, {
    shape: spec.shape,
    cx: x + padX + iconR,
    cy: y + height / 2,
    r: iconR,
    color,
  });

  doc.save();
  doc.fillColor(color).font(font).fontSize(TYPE_SCALE.label.size * scale);
  lockedText(doc, spec.label, x + padX + iconR * 2 + gap, y + (height - TYPE_SCALE.label.size * scale) / 2 - 0.5, {
    width: textWidth + 2,
  });
  doc.restore();

  return { width, height };
}

/**
 * A 4-block identity grid: Full Name / Application ID / Date of Birth /
 * Nationality. Each block is a (label, value) pair with fixed typographic
 * rhythm — micro label on top, body value below, divider between columns.
 */
function drawIdentityBlocks(doc, {
  blocks,
  x,
  y,
  width,
  palette,
  fonts,
}) {
  const cols = blocks.length || 1;
  const colW = (width - (cols - 1) * 1) / cols; // thin 1pt gaps handled by dividers
  const rowH = 54;

  blocks.forEach((block, i) => {
    const bx = x + i * colW;
    // Micro label
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
    lockedText(doc, (block.label || '').toUpperCase(), bx, y + 6, {
      width: colW - 10,
      characterSpacing: TYPE_SCALE.label.letterSpacing,
    });
    doc.restore();
    // Value
    doc.save();
    doc.fillColor(palette.text).font(fonts.headingBold || fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.h2.size);
    lockedText(doc, block.value || '—', bx, y + 22, {
      width: colW - 10,
      ellipsis: true,
    });
    doc.restore();
    // Divider (right edge, except last col)
    if (i < cols - 1) {
      doc.save();
      doc.strokeColor(palette.line).opacity(0.18).lineWidth(0.5);
      doc.moveTo(bx + colW - 0.5, y + 4).lineTo(bx + colW - 0.5, y + rowH - 4).stroke();
      doc.restore();
    }
  });

  return { height: rowH };
}

/**
 * Credential-style cover page for an Application PDF.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │ PRIMAL · TOURNAMENT NAME · APP-ID · DATE │ ← micro-label band
 *   │                                          │
 *   │              <PARTICIPANT PHOTO>         │ ← hero portrait
 *   │                                          │
 *   │       FULL NAME (display, 28pt)          │ ← display heading
 *   │       Club name · Category · Weight       │ ← body subtitle
 *   │                                          │
 *   │    ╭─────────────╮                       │
 *   │    │  STATUS      │                       │ ← grayscale-safe badge
 *   │    ╰─────────────╯                       │
 *   │                                          │
 *   │ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐│ ← 4-block identity
 *   │ │ NAME   │ │ APP ID │ │ DOB    │ │ NATL ││
 *   │ └────────┘ └────────┘ └────────┘ └──────┘│
 *   │                                          │
 *   │ ISSUING AUTHORITY        [QR][FINGERPRINT]│ ← signature block
 *   └──────────────────────────────────────────┘
 */
function drawApplicationCoverPage(doc, ctx) {
  const {
    palette,
    fonts,
    brandName,
    tournamentName,
    applicationDisplayId,
    applicantName,
    clubName,
    categoryLine,
    status,
    identityBlocks,
    photoBuffer,
    qrBuffer,
    verifyUrl,
    signatureShortId,
    issuingAuthority,
    issuedAt,
  } = ctx;

  const PW = doc.page.width;
  const PH = doc.page.height;
  const ML = doc.page.margins.left;
  const MT = doc.page.margins.top;
  const MR = doc.page.margins.right;
  const CW = PW - ML - MR;

  // Paper
  doc.save();
  doc.rect(0, 0, PW, PH).fill(palette.paper);
  doc.restore();

  // Top ink-red accent rule
  doc.save();
  doc.rect(0, 0, PW, 4).fill(palette.accent);
  doc.restore();

  // ── Top band: brand / tournament / app id / date (micro-label) ──────────
  const bandY = MT + 8;
  doc.save();
  doc.fillColor(palette.ink).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
  lockedText(doc, brandName.toUpperCase(), ML, bandY, {
    characterSpacing: TYPE_SCALE.label.letterSpacing,
  });
  const right = [tournamentName, applicationDisplayId, issuedAt].filter(Boolean).join('  ·  ');
  doc.fillColor(palette.textMuted);
  lockedText(doc, right, ML, bandY, {
    width: CW,
    align: 'right',
    characterSpacing: TYPE_SCALE.label.letterSpacing,
  });
  doc.restore();

  // ── Hero portrait ────────────────────────────────────────────────────────
  const PHOTO_W = 220;
  const PHOTO_H = 260;
  const PHOTO_X = ML + (CW - PHOTO_W) / 2;
  const PHOTO_Y = bandY + 24;

  doc.save();
  doc.rect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H).fill(palette.surfaceMuted);
  doc.rect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H).lineWidth(1).strokeColor(palette.line).stroke();
  doc.restore();

  if (photoBuffer) {
    doc.save();
    doc.rect(PHOTO_X + 2, PHOTO_Y + 2, PHOTO_W - 4, PHOTO_H - 4).clip();
    doc.image(photoBuffer, PHOTO_X + 2, PHOTO_Y + 2, {
      fit: [PHOTO_W - 4, PHOTO_H - 4],
      align: 'center',
      valign: 'center',
    });
    doc.restore();
  } else {
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size);
    lockedText(doc, 'No participant photo on file', PHOTO_X, PHOTO_Y + PHOTO_H / 2 - 6, {
      width: PHOTO_W,
      align: 'center',
    });
    doc.restore();
  }

  // Corner crops (4 ink-red L-shapes) — federation credential look
  const crop = 14;
  doc.save();
  doc.strokeColor(palette.accent).lineWidth(1.4);
  // TL
  doc.moveTo(PHOTO_X - 1, PHOTO_Y + crop).lineTo(PHOTO_X - 1, PHOTO_Y - 1).lineTo(PHOTO_X + crop, PHOTO_Y - 1).stroke();
  // TR
  doc.moveTo(PHOTO_X + PHOTO_W - crop, PHOTO_Y - 1).lineTo(PHOTO_X + PHOTO_W + 1, PHOTO_Y - 1).lineTo(PHOTO_X + PHOTO_W + 1, PHOTO_Y + crop).stroke();
  // BL
  doc.moveTo(PHOTO_X - 1, PHOTO_Y + PHOTO_H - crop).lineTo(PHOTO_X - 1, PHOTO_Y + PHOTO_H + 1).lineTo(PHOTO_X + crop, PHOTO_Y + PHOTO_H + 1).stroke();
  // BR
  doc.moveTo(PHOTO_X + PHOTO_W - crop, PHOTO_Y + PHOTO_H + 1).lineTo(PHOTO_X + PHOTO_W + 1, PHOTO_Y + PHOTO_H + 1).lineTo(PHOTO_X + PHOTO_W + 1, PHOTO_Y + PHOTO_H - crop).stroke();
  doc.restore();

  // ── Display heading: participant name ────────────────────────────────────
  const nameY = PHOTO_Y + PHOTO_H + 22;
  doc.save();
  doc.fillColor(palette.ink).font(fonts.headingBold || fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.display.size);
  doc.lineGap(TYPE_SCALE.display.lineGap);
  lockedText(doc, applicantName || '—', ML, nameY, {
    width: CW,
    align: 'center',
    ellipsis: true,
    characterSpacing: TYPE_SCALE.display.letterSpacing,
  });
  doc.restore();

  // Subtitle: Club · Category · Weight
  const subtitleY = nameY + TYPE_SCALE.display.size + 8;
  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size);
  lockedText(doc, [clubName, categoryLine].filter(Boolean).join('  ·  '), ML, subtitleY, {
    width: CW,
    align: 'center',
  });
  doc.restore();

  // ── Status badge ────────────────────────────────────────────────────────
  const badgeScale = 1.3;
  // Probe the width with a scratch measurement
  const badgeFont = fonts.bodyBold || fonts.body;
  doc.save();
  doc.font(badgeFont).fontSize(TYPE_SCALE.label.size * badgeScale);
  const spec = getStatusSpec(status);
  const w = 10 * badgeScale + 7 * badgeScale * 2 + 8 * badgeScale + doc.widthOfString(spec.label) + 10 * badgeScale;
  doc.restore();
  const badgeX = ML + (CW - w) / 2;
  const badgeY = subtitleY + TYPE_SCALE.body.size + 14;
  drawStatusBadge(doc, { status, x: badgeX, y: badgeY, palette, fonts, scale: badgeScale });

  // ── 4-block identity grid ───────────────────────────────────────────────
  const idY = badgeY + 50;
  const idH = 58;
  doc.save();
  doc.rect(ML, idY, CW, idH).fill(palette.surface);
  doc.rect(ML, idY, CW, idH).lineWidth(0.8).strokeColor(palette.line).stroke();
  doc.restore();
  drawIdentityBlocks(doc, {
    blocks: identityBlocks,
    x: ML + 10,
    y: idY + 2,
    width: CW - 20,
    palette,
    fonts,
  });

  // ── Signature block ─────────────────────────────────────────────────────
  const sigY = PH - doc.page.margins.bottom - 104;
  doc.save();
  doc.moveTo(ML, sigY - 8).lineTo(ML + CW, sigY - 8).lineWidth(0.5).strokeColor(palette.line).opacity(0.25).stroke();
  doc.restore();

  // Left: issuing authority
  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
  lockedText(doc, 'ISSUING AUTHORITY', ML, sigY, { characterSpacing: TYPE_SCALE.label.letterSpacing });
  doc.restore();
  doc.save();
  doc.fillColor(palette.ink).font(fonts.headingBold || fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.h2.size);
  lockedText(doc, issuingAuthority || brandName, ML, sigY + 12, { width: CW * 0.55 });
  doc.restore();
  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size);
  lockedText(doc, 'Digitally signed participant registration — this artifact is generated automatically and is verifiable via the QR code to the right.', ML, sigY + 32, {
    width: CW * 0.55,
    height: 56,
    lineBreak: true,
  });
  doc.restore();

  // Right: QR + fingerprint
  const QR = 72;
  const QX = ML + CW - QR;
  const QY = sigY;
  if (qrBuffer) {
    doc.save();
    doc.rect(QX - 4, QY - 4, QR + 8, QR + 8).fill(palette.surface);
    doc.rect(QX - 4, QY - 4, QR + 8, QR + 8).lineWidth(0.8).strokeColor(palette.line).stroke();
    doc.image(qrBuffer, QX, QY, { fit: [QR, QR] });
    doc.restore();
  }
  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
  lockedText(doc, 'SCAN TO VERIFY', QX - 126, QY, {
    width: 120,
    align: 'right',
    characterSpacing: TYPE_SCALE.label.letterSpacing,
  });
  doc.restore();
  if (signatureShortId) {
    doc.save();
    doc.fillColor(palette.ink).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.body.size);
    lockedText(doc, signatureShortId, QX - 126, QY + 14, {
      width: 120,
      align: 'right',
      characterSpacing: 0.8,
    });
    doc.restore();
  }
  if (verifyUrl) {
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.micro.size);
    lockedText(doc, verifyUrl, QX - 200, QY + 34, {
      width: 194,
      align: 'right',
      lineBreak: true,
      height: 36,
    });
    doc.restore();
  }
}

/**
 * Compact running header for detail pages (page 2+). Appears above the
 * margin top and carries the brand mark, app id, and status badge so that
 * each printed page is self-identifying.
 */
function drawRunningHeader(doc, {
  palette,
  fonts,
  brandName,
  applicationDisplayId,
  tournamentName,
  status,
}) {
  const PW = doc.page.width;
  const ML = doc.page.margins.left;
  const MR = doc.page.margins.right;
  const MT = doc.page.margins.top;
  const CW = PW - ML - MR;
  const y = MT - 8;

  doc.save();
  doc.fillColor(palette.ink).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
  lockedText(
    doc,
    [brandName.toUpperCase(), tournamentName, applicationDisplayId].filter(Boolean).join('  ·  '),
    ML,
    y,
    { width: CW * 0.7, characterSpacing: TYPE_SCALE.label.letterSpacing },
  );
  doc.restore();

  // Status badge floats on the right
  const badgeFont = fonts.bodyBold || fonts.body;
  doc.save();
  doc.font(badgeFont).fontSize(TYPE_SCALE.label.size);
  const spec = getStatusSpec(status);
  const w = 10 + 7 * 2 + 8 + doc.widthOfString(spec.label) + 10;
  doc.restore();
  drawStatusBadge(doc, { status, x: ML + CW - w, y: y - 7, palette, fonts });

  // Thin rule below
  doc.save();
  doc.moveTo(ML, y + 14).lineTo(ML + CW, y + 14).lineWidth(0.5).strokeColor(palette.line).opacity(0.25).stroke();
  doc.restore();
}

// ─── Bracket composition (Phase 2) ────────────────────────────────────────

/**
 * Draw a single fighter "slot" — the top or bottom half of a match box. Uses
 * a corner bar (blue / red) + seed fingerprint + name + club. Winners get a
 * full ink left bar and bold name; losers are kept at normal weight so the
 * tree is scannable without color.
 */
function drawBracketSlot(doc, ctx) {
  const {
    x, y, width, height, side,
    isWinner = false,
    isChampionshipRound = false,
    palette,
    fonts,
  } = ctx;

  // Card body — winners get a subtle tint so the advance path is visible
  // without a line cutting across the text (previous bug).
  doc.save();
  doc.rect(x, y, width, height).fill(isWinner ? palette.surface : palette.paper);
  doc.rect(x, y, width, height).strokeColor(palette.line).opacity(0.35).lineWidth(0.5).stroke();
  doc.restore();

  // Left corner bar — blue / red for the two seeds; gold left bar marks a
  // winner. Championship-round winner stays gold (the champion card picks
  // up the brighter emphasis).
  const corner = side && side.corner;
  let barColor = palette.textMuted;
  if (corner === 'blue') barColor = '#0F4C81';
  else if (corner === 'red') barColor = palette.accent;
  if (isWinner) barColor = isChampionshipRound ? palette.gold : palette.ink;
  doc.save();
  doc.rect(x, y, 3, height).fill(barColor);
  doc.restore();

  const padX = 10;
  const contentX = x + padX;
  const contentW = width - padX - 6;

  if (!side || side.placeholder === 'tbd' || !side.name) {
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size);
    lockedText(doc, 'TBD', contentX, y + height / 2 - TYPE_SCALE.body.size / 2, {
      width: contentW,
    });
    doc.restore();
    return;
  }

  // Compact slot (≤ 28pt tall): single-line — seed · name on one row.
  // Generous slot (> 28pt): two-row — seed/corner micro-label above,
  // name + club stacked.
  const compact = height <= 28;
  const seedText = side.seedScore || side.seed ? `#${side.seedScore || side.seed}` : '';
  const cornerText = (side.corner || '').toUpperCase();

  if (compact) {
    // Seed fingerprint on the left, small muted
    const leftMeta = [cornerText.charAt(0), seedText].filter(Boolean).join(' ');
    let nameX = contentX;
    let nameW = contentW;
    if (leftMeta) {
      doc.save();
      doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.micro.size);
      lockedText(doc, leftMeta, contentX, y + (height - TYPE_SCALE.body.size) / 2 + 1, {
        width: 28,
      });
      doc.restore();
      nameX = contentX + 30;
      nameW = contentW - 30;
    }
    doc.save();
    doc.fillColor(palette.ink)
      .font(isWinner ? (fonts.headingBold || fonts.bodyBold) : (fonts.bodyBold || fonts.body))
      .fontSize(TYPE_SCALE.body.size);
    lockedText(doc, side.name, nameX, y + (height - TYPE_SCALE.body.size) / 2, {
      width: nameW,
      ellipsis: true,
    });
    doc.restore();
    return;
  }

  // Generous layout
  const labelY = y + 4;
  if (cornerText) {
    doc.save();
    doc.fillColor(barColor).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.micro.size);
    lockedText(doc, cornerText, contentX, labelY, {
      width: 32,
      characterSpacing: 0.6,
    });
    doc.restore();
  }
  if (seedText) {
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.micro.size);
    lockedText(doc, seedText, x + width - padX - 30, labelY, {
      width: 28,
      align: 'right',
    });
    doc.restore();
  }
  doc.save();
  doc.fillColor(palette.ink)
    .font(isWinner ? (fonts.headingBold || fonts.bodyBold) : (fonts.bodyBold || fonts.body))
    .fontSize(TYPE_SCALE.body.size);
  lockedText(doc, side.name, contentX, y + 13, {
    width: contentW,
    ellipsis: true,
  });
  doc.restore();
  if (height >= 34) {
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.micro.size);
    lockedText(doc, side.club || 'Independent', contentX, y + 13 + TYPE_SCALE.body.size + 3, {
      width: contentW,
      ellipsis: true,
    });
    doc.restore();
  }
}

/**
 * Pair-geometry helper: given a list of Y-centers for the child round, return
 * the Y-centers for the parent round — each parent center is the midpoint
 * between its two child matches. This is how a classical elimination tree
 * stays balanced: a match is vertically centered on the pair below it, not
 * stair-stepped sideways like the old layout.
 */
function deriveParentCenters(childCenters) {
  const parents = [];
  for (let i = 0; i < childCenters.length; i += 2) {
    const a = childCenters[i];
    const b = childCenters[i + 1];
    if (b === undefined) { parents.push(a); continue; }
    parents.push((a + b) / 2);
  }
  return parents;
}

/**
 * Draw a connector — two horizontal legs out of the child match right edges,
 * joined by a short vertical segment, then one horizontal leg into the
 * parent match left edge. Classical elimination-tree geometry.
 */
function drawBracketConnector(doc, ctx) {
  const { childRightX, parentLeftX, topY, bottomY, parentY, palette } = ctx;
  const midX = childRightX + (parentLeftX - childRightX) / 2;
  doc.save();
  doc.lineWidth(0.75).strokeColor(palette.ink).opacity(0.55);
  // Leg from top child
  doc.moveTo(childRightX, topY).lineTo(midX, topY).stroke();
  // Leg from bottom child
  doc.moveTo(childRightX, bottomY).lineTo(midX, bottomY).stroke();
  // Vertical join
  doc.moveTo(midX, topY).lineTo(midX, bottomY).stroke();
  // Entry into parent
  doc.moveTo(midX, parentY).lineTo(parentLeftX, parentY).stroke();
  doc.restore();
}

/**
 * Auto-fit slot height: given vertical room for N match-boxes, pick a slot
 * height that leaves ~30% of each pitch as visible gap between match boxes
 * (so pairs read as discrete matches, not as a continuous list). Clamps
 * between a readable minimum (14pt) and a cap (24pt).
 */
function autoSlotHeight({ contentHeight, firstRoundMatches, innerGap = 0 }) {
  const pitch = contentHeight / Math.max(1, firstRoundMatches);
  const usable = pitch * 0.72 - innerGap; // reserve 28% as between-pair gap
  const raw = usable / 2;
  return Math.max(14, Math.min(24, raw));
}

/**
 * Compute a classical elimination-tree layout for an array of rounds.
 *
 * Rounds are given in ascending order: rounds[0] is the first round with the
 * most matches, rounds[rounds.length-1] is the final.
 *
 * Returns: { matchLayout: { [roundIndex]: [{ y, centerY }...] }, contentHeight }
 *
 * The first-round matches are evenly distributed across `contentHeight`.
 * Each subsequent round's match centers are midpoints of its two children.
 * Match boxes are `slotHeight * 2 + matchGap` tall and vertically centered on
 * their computed centerY.
 */
function layoutBracket(rounds, { contentHeight, topY, slotHeight, matchGap }) {
  const firstRound = rounds[0] || { matches: [] };
  const firstCount = Math.max(1, firstRound.matches.length);
  const matchHeight = slotHeight * 2 + matchGap;
  // Evenly space first-round match centers across the usable content area.
  const firstPitch = contentHeight / firstCount;
  let centers = [];
  for (let i = 0; i < firstCount; i += 1) {
    centers.push(topY + firstPitch * (i + 0.5));
  }
  const layout = { 0: centers.map((c) => ({ centerY: c, y: c - matchHeight / 2 })) };
  for (let r = 1; r < rounds.length; r += 1) {
    centers = deriveParentCenters(centers);
    layout[r] = centers.map((c) => ({ centerY: c, y: c - matchHeight / 2 }));
  }
  return { matchLayout: layout, matchHeight };
}

/**
 * Full bracket poster renderer. Draws the classical elimination tree onto
 * the current page, with round labels along the top and connectors between
 * match boxes. Champion card is rendered to the right of the final round.
 *
 * ctx.rounds — an array of { label, matches: [{ sides: [slotA, slotB], winnerIndex }] }
 * ctx.x, ctx.y, ctx.width, ctx.height — the rectangle to fill with the tree
 */
function drawBracketTree(doc, ctx) {
  const {
    rounds,
    x, y, width, height,
    palette, fonts,
    slotWidth = 140,
    slotHeight = 18,
    matchGap = 0,
  } = ctx;

  if (!rounds || !rounds.length) return;

  const numRounds = rounds.length;
  const roundPitch = (width - slotWidth) / Math.max(1, numRounds - 0.5);
  const { matchLayout, matchHeight } = layoutBracket(rounds, {
    contentHeight: height,
    topY: y,
    slotHeight,
    matchGap,
  });

  rounds.forEach((round, r) => {
    const roundX = x + r * roundPitch;
    // Round label at the top
    doc.save();
    doc.fillColor(palette.textMuted).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
    lockedText(doc, (round.label || `ROUND ${r + 1}`).toUpperCase(), roundX, y - 20, {
      width: slotWidth,
      align: 'center',
      characterSpacing: TYPE_SCALE.label.letterSpacing,
    });
    doc.restore();

    round.matches.forEach((match, i) => {
      const pos = matchLayout[r][i];
      if (!pos) return;
      const matchY = pos.y;
      const topSide = match.sides && match.sides[0];
      const botSide = match.sides && match.sides[1];
      const isChampRound = r === numRounds - 1;
      const topWin = match.winnerIndex === 0;
      const botWin = match.winnerIndex === 1;

      drawBracketSlot(doc, {
        x: roundX, y: matchY, width: slotWidth, height: slotHeight,
        side: topSide, isWinner: topWin, isChampionshipRound: isChampRound,
        palette, fonts,
      });
      drawBracketSlot(doc, {
        x: roundX, y: matchY + slotHeight + matchGap, width: slotWidth, height: slotHeight,
        side: botSide, isWinner: botWin, isChampionshipRound: isChampRound,
        palette, fonts,
      });

      // Draw connector from this pair to parent, if a parent exists.
      if (r < numRounds - 1) {
        const parentPos = matchLayout[r + 1][Math.floor(i / 2)];
        if (parentPos) {
          const matchCenterY = pos.centerY;
          const childRightX = roundX + slotWidth;
          const parentLeftX = x + (r + 1) * roundPitch;
          const midX = (childRightX + parentLeftX) / 2;
          doc.save();
          doc.lineWidth(0.9).strokeColor(palette.ink).opacity(0.75);
          // Leg from child match center
          doc.moveTo(childRightX, matchCenterY).lineTo(midX, matchCenterY).stroke();
          // Vertical join toward parent — each sibling draws its own half of
          // the vertical; together they form the full bracket fork.
          doc.moveTo(midX, matchCenterY).lineTo(midX, parentPos.centerY).stroke();
          // Horizontal into parent
          doc.moveTo(midX, parentPos.centerY).lineTo(parentLeftX, parentPos.centerY).stroke();
          doc.restore();
        }
      }
    });
  });
}

/**
 * Champion card — renders to the right of the final. Paper-white card with
 * gold left bar (championship tone), "CHAMPION" micro-label, name + club.
 */
function drawChampionCard(doc, ctx) {
  const { x, y, champion, palette, fonts, width = 160, height = 60 } = ctx;
  doc.save();
  doc.rect(x, y, width, height).fill(palette.surface);
  doc.rect(x, y, 4, height).fill(palette.gold);
  doc.rect(x, y, width, height).strokeColor(palette.line).opacity(0.3).lineWidth(0.5).stroke();
  doc.restore();
  doc.save();
  doc.fillColor(palette.gold).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
  lockedText(doc, 'CHAMPION', x + 12, y + 8, { characterSpacing: TYPE_SCALE.label.letterSpacing });
  doc.restore();
  doc.save();
  doc.fillColor(palette.ink).font(fonts.headingBold || fonts.bodyBold).fontSize(TYPE_SCALE.h2.size);
  lockedText(doc, champion?.name || 'TBD', x + 12, y + 22, { width: width - 24, ellipsis: true });
  doc.restore();
  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.body.size);
  lockedText(doc, champion?.club || 'Independent', x + 12, y + 40, { width: width - 24, ellipsis: true });
  doc.restore();
}

/**
 * Bracket poster header — a compact landscape header with brand · tournament
 * name · category label · status · seeding on a single row, plus the
 * ink-red accent rule. Leaves the tree area free.
 */
function drawBracketHeader(doc, ctx) {
  const { palette, fonts, brandName, tournamentName, categoryLabel, statusText, seedingLabel, exportedAt } = ctx;
  const PW = doc.page.width;
  const ML = doc.page.margins.left;
  const MT = doc.page.margins.top;
  const MR = doc.page.margins.right;
  const CW = PW - ML - MR;

  doc.save();
  doc.rect(0, 0, PW, 3).fill(palette.accent);
  doc.restore();

  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.label.size);
  lockedText(doc, (brandName || 'Primal').toUpperCase(), ML, MT + 6, {
    characterSpacing: TYPE_SCALE.label.letterSpacing,
  });
  doc.restore();

  doc.save();
  doc.fillColor(palette.ink).font(fonts.headingBold || fonts.bodyBold).fontSize(TYPE_SCALE.h1.size);
  lockedText(doc, tournamentName || 'Tournament', ML, MT + 18, {
    width: CW * 0.7,
    ellipsis: true,
  });
  doc.restore();

  doc.save();
  doc.fillColor(palette.accent).font(fonts.bodyBold || fonts.body).fontSize(TYPE_SCALE.h2.size);
  lockedText(doc, categoryLabel || 'Bracket', ML, MT + 40, { width: CW * 0.7, ellipsis: true });
  doc.restore();

  const meta = [statusText, seedingLabel, exportedAt].filter(Boolean).join('  ·  ');
  doc.save();
  doc.fillColor(palette.textMuted).font(fonts.body).fontSize(TYPE_SCALE.micro.size);
  lockedText(doc, meta, ML, MT + 56, { width: CW });
  doc.restore();
}

module.exports = {
  setType,
  lockedText,
  drawStatusGlyph,
  drawStatusBadge,
  drawIdentityBlocks,
  drawApplicationCoverPage,
  drawRunningHeader,
  drawBracketSlot,
  drawBracketTree,
  drawBracketHeader,
  drawChampionCard,
  layoutBracket,
  deriveParentCenters,
  autoSlotHeight,
};
