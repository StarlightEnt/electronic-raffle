/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Matches the SFGGC Ticket Tracker reference design:
 *   - Landscape half-letter (8.5" × 5.5")
 *   - Logo top-left, pack name center (light blue), price top-right (peach)
 *   - "TICKET TRACKER" in purple below pack name
 *   - 6 ticket stubs side by side: colored border/frame, white interior
 *     with 3 circle punch-outs on each side (perforations between stubs)
 *   - START/END NUMBER labels on left, numbers inside each stub in ticket color
 *   - Tournament name + serial number at bottom
 */

import PDFDocument from 'pdfkit';

const COLORS_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const COLOR_VALUES = {
  Red:    { border: '#E8393A', numColor: '#E8393A', headerText: '#FFFFFF', headerBg: '#E8393A' },
  Orange: { border: '#F47B20', numColor: '#F47B20', headerText: '#FFFFFF', headerBg: '#F47B20' },
  Yellow: { border: '#E6B800', numColor: '#B8860B', headerText: '#7A5800', headerBg: '#E6B800' },
  Green:  { border: '#2EAA4A', numColor: '#2EAA4A', headerText: '#FFFFFF', headerBg: '#2EAA4A' },
  Blue:   { border: '#1E6DB5', numColor: '#1E6DB5', headerText: '#FFFFFF', headerBg: '#1E6DB5' },
  Purple: { border: '#7B3FA0', numColor: '#7B3FA0', headerText: '#FFFFFF', headerBg: '#7B3FA0' },
};

// Landscape half-letter
const PAGE_W = 8.5 * 72;  // 612 pts
const PAGE_H = 5.5 * 72;  // 396 pts

/**
 * Draw a single ticket stub shape:
 * - Filled rounded rect (border color)
 * - White inner rounded rect (leaving colored border)
 * - 3 white circles on left edge and 3 on right edge (punch-outs)
 * - Color header bar at top inside stub
 */
function drawTicketStub(doc, x, y, w, h, color, label, startNum, endNum) {
  const cv = COLOR_VALUES[color];
  const borderW = 6;       // border thickness
  const cornerR = 8;       // outer corner radius
  const innerR = 5;        // inner corner radius
  const circleR = 6;       // punch-out circle radius
  const numCircles = 3;    // circles per side
  const headerH = h * 0.27;

  // ── Outer colored rounded rect (the border) ──────────────────────
  doc.roundedRect(x, y, w, h, cornerR).fill(cv.border);

  // ── White interior ───────────────────────────────────────────────
  doc.roundedRect(
    x + borderW, y + borderW,
    w - borderW * 2, h - borderW * 2,
    innerR
  ).fill('#FFFFFF');

  // ── Punch-out circles on LEFT edge ───────────────────────────────
  const circleSpacing = (h - headerH) / (numCircles + 1);
  for (let i = 1; i <= numCircles; i++) {
    const cy = y + headerH + i * circleSpacing;
    doc.circle(x, cy, circleR).fill('#FFFFFF');
  }

  // ── Punch-out circles on RIGHT edge ──────────────────────────────
  for (let i = 1; i <= numCircles; i++) {
    const cy = y + headerH + i * circleSpacing;
    doc.circle(x + w, cy, circleR).fill('#FFFFFF');
  }

  // ── Colored header bar inside stub ───────────────────────────────
  // clip to inner rect so header doesn't overflow
  doc.save();
  doc.roundedRect(x + borderW, y + borderW, w - borderW * 2, h - borderW * 2, innerR).clip();

  doc.rect(x + borderW, y + borderW, w - borderW * 2, headerH - borderW).fill(cv.headerBg);

  // Color name + TICKETS in header
  doc.font('Helvetica-Bold').fontSize(8).fillColor(cv.headerText);
  doc.text(color.toUpperCase(), x + borderW, y + borderW + 4, {
    width: w - borderW * 2, align: 'center', lineBreak: false,
  });
  doc.text('TICKETS', x + borderW, y + borderW + 14, {
    width: w - borderW * 2, align: 'center', lineBreak: false,
  });

  doc.restore();

  // ── START number ─────────────────────────────────────────────────
  const bodyH = (h - headerH) / 2;
  const startY = y + headerH;
  const endY = startY + bodyH;

  // Divider line between start and end
  doc.moveTo(x + borderW + 4, startY + bodyH)
     .lineTo(x + w - borderW - 4, startY + bodyH)
     .strokeColor(cv.border).lineWidth(0.5).stroke();

  // START number centered in its half
  doc.font('Helvetica-Bold').fillColor(cv.numColor);
  // Scale font to fit — longer numbers need smaller font
  const numStr = startNum.toString();
  const fontSize = numStr.length >= 7 ? 11 : 13;
  doc.fontSize(fontSize);
  doc.text(numStr, x + borderW, startY + (bodyH - fontSize) / 2, {
    width: w - borderW * 2, align: 'center', lineBreak: false,
  });

  // END number
  const endStr = endNum.toString();
  doc.fontSize(fontSize);
  doc.text(endStr, x + borderW, endY + (bodyH - fontSize) / 2, {
    width: w - borderW * 2, align: 'center', lineBreak: false,
  });
}

/**
 * Draw the full card onto the current PDFDocument page.
 */
function drawCard(doc, params) {
  const { serial, tierName, price, tournamentName, colorRanges, logoBuffer } = params;

  const M = 16;

  // White background
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');

  // ── Logo top-left ─────────────────────────────────────────────────
  const logoSize = 95;
  let logoRight = M;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, M, M, { width: logoSize, height: logoSize });
      logoRight = M + logoSize + 8;
    } catch(e) {}
  }

  // ── Price top-right ───────────────────────────────────────────────
  const priceStr = `$${Math.round(price)}`;
  doc.font('Helvetica-Bold').fontSize(54).fillColor('#F4A460');
  doc.text(priceStr, PAGE_W - M - 130, M - 6, { width: 130, align: 'right', lineBreak: false });

  // ── Pack name center (light blue) ─────────────────────────────────
  const headCenterX = logoRight;
  const headCenterW = PAGE_W - logoRight - 145;
  doc.font('Helvetica-Bold').fontSize(40).fillColor('#7EC8E3');
  doc.text(tierName, headCenterX, M + 2, { width: headCenterW, align: 'center', lineBreak: false });

  // ── "TICKET TRACKER" (purple) ─────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(30).fillColor('#8B2FC9');
  doc.text('TICKET TRACKER', headCenterX, M + 46, { width: headCenterW, align: 'center', lineBreak: false });

  // ── Ticket strip ──────────────────────────────────────────────────
  const labelW = 46;
  const stripTop = M + logoSize + 8;
  const stripH = PAGE_H - stripTop - M - 24;
  const stripX = M + labelW + 2;
  const stripW = PAGE_W - stripX - M;
  const ticketW = stripW / 6;

  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const tx = stripX + i * ticketW;
    drawTicketStub(doc, tx + 1, stripTop, ticketW - 2, stripH, color, color, range.start, range.end);
  });

  // ── START / END NUMBER labels (purple, left of strip) ────────────
  const headerH = stripH * 0.27;
  const bodyH = (stripH - headerH) / 2;

  doc.font('Helvetica-Bold').fontSize(7).fillColor('#8B2FC9');

  const startLabelY = stripTop + headerH + bodyH / 2 - 9;
  doc.text('START', M, startLabelY, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, startLabelY + 9, { width: labelW, align: 'center', lineBreak: false });

  const endLabelY = stripTop + headerH + bodyH + bodyH / 2 - 9;
  doc.text('END', M, endLabelY, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, endLabelY + 9, { width: labelW, align: 'center', lineBreak: false });

  // ── Footer ────────────────────────────────────────────────────────
  const footerY = PAGE_H - M - 14;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#8B2FC9');
  doc.text(tournamentName.toUpperCase(), M, footerY, { width: PAGE_W - M * 2, align: 'center', lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
  doc.text(`Serial No: ${serial}`, M, footerY, { width: PAGE_W - M * 2, align: 'right', lineBreak: false });
}

/**
 * Generate a single tracker card as a Buffer.
 */
export async function generateTrackerCard(params) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0,
      info: { Title: `Ticket Tracker — ${params.serial}` } });
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const colorRanges = typeof params.colorRanges === 'string'
      ? JSON.parse(params.colorRanges) : params.colorRanges;
    drawCard(doc, { ...params, colorRanges });
    doc.end();
  });
}

/**
 * Generate bulk PDF — one card per page.
 */
export async function generateBulkTrackerPDF(packs, config) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    for (const pack of packs) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      const colorRanges = typeof pack.color_ranges === 'string'
        ? JSON.parse(pack.color_ranges) : pack.color_ranges;
      drawCard(doc, {
        serial: pack.serial,
        tierName: pack.tier_name,
        price: pack.price,
        tournamentName: config.tournamentName,
        colorRanges,
        logoBuffer: config.logoBuffer,
      });
    }
    doc.end();
  });
}
