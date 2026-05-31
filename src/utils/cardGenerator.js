/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Replicates the SFGGC Ticket Tracker card design:
 *   - Landscape half-letter (8.5" × 5.5")
 *   - Logo top-left, pack name center, price top-right
 *   - "TICKET TRACKER" title below
 *   - 6 raffle-ticket-shaped stubs with scalloped edges and dotted perforations
 *   - START NUMBER / END NUMBER labels on left, numbers inside each stub
 *   - Tournament name + serial number at bottom
 */

import PDFDocument from 'pdfkit';

const COLORS_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

// Ticket stub fill colors and text colors matching the reference design
const COLOR_VALUES = {
  Red:    { fill: '#E8393A', header: '#E8393A', numColor: '#E8393A', headerText: '#FFFFFF' },
  Orange: { fill: '#F47B20', header: '#F47B20', numColor: '#F47B20', headerText: '#FFFFFF' },
  Yellow: { fill: '#F5C518', header: '#F5C518', numColor: '#C8960C', headerText: '#8B6500' },
  Green:  { fill: '#2EAA4A', header: '#2EAA4A', numColor: '#2EAA4A', headerText: '#FFFFFF' },
  Blue:   { fill: '#1E6DB5', header: '#1E6DB5', numColor: '#1E6DB5', headerText: '#FFFFFF' },
  Purple: { fill: '#7B3FA0', header: '#7B3FA0', numColor: '#7B3FA0', headerText: '#FFFFFF' },
};

// Page: landscape half-letter in points (72pt = 1in)
const PAGE_W = 8.5 * 72;  // 612 pts
const PAGE_H = 5.5 * 72;  // 396 pts

/**
 * Draw scalloped edge along top or bottom of a rectangle.
 * scallops = number of semi-circle bites
 * side: 'top' | 'bottom'
 */
function drawScallopedRect(doc, x, y, w, h, r, scallops, color) {
  const scW = w / scallops;
  const scR = scW / 2;

  doc.save();
  doc.fillColor(color);

  // Build path manually
  doc.moveTo(x + r, y);

  // Top edge with scallops (bites out)
  for (let i = 0; i < scallops; i++) {
    const cx = x + i * scW + scR;
    doc.lineTo(cx - scR, y);
    doc.arc(cx, y, scR, Math.PI, 0, false); // upward bump
  }
  doc.lineTo(x + w, y);

  // Right edge
  doc.lineTo(x + w, y + h);

  // Bottom edge with scallops (bites in)
  for (let i = scallops - 1; i >= 0; i--) {
    const cx = x + i * scW + scR;
    doc.lineTo(cx + scR, y + h);
    doc.arc(cx, y + h, scR, 0, Math.PI, false); // downward bump
  }
  doc.lineTo(x, y + h);
  doc.lineTo(x, y);

  doc.fill();
  doc.restore();
}

/**
 * Draw dotted perforation line between tickets
 */
function drawPerforation(doc, x, y1, y2) {
  const dotR = 2.5;
  const gap = 8;
  doc.save();
  doc.fillColor('#FFFFFF');
  let cy = y1 + gap;
  while (cy < y2 - gap) {
    doc.circle(x, cy, dotR).fill();
    cy += gap * 1.5;
  }
  doc.restore();
}

/**
 * Main card drawing function — draws onto the current PDFDocument page.
 */
function drawCard(doc, params) {
  const { serial, tierName, price, tournamentName, colorRanges, logoBuffer } = params;

  const M = 18; // margin
  const contentW = PAGE_W - M * 2;
  const contentH = PAGE_H - M * 2;

  // ── White background ─────────────────────────────────────────────
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');

  // ── TOP SECTION ──────────────────────────────────────────────────
  const logoSize = 100;
  let logoRight = M;

  // Logo top-left
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, M, M, { width: logoSize, height: logoSize });
      logoRight = M + logoSize + 10;
    } catch(e) { logoRight = M; }
  }

  // Price top-right — large peach/salmon bold
  const priceStr = `$${Math.round(price)}`;
  doc.font('Helvetica-Bold').fontSize(52).fillColor('#F4A460');
  doc.text(priceStr, PAGE_W - M - 120, M - 4, { width: 120, align: 'right' });

  // Pack name center — large light-blue bold
  const centerX = logoRight;
  const centerW = PAGE_W - logoRight - 140;
  doc.font('Helvetica-Bold').fontSize(44).fillColor('#7EC8E3');
  doc.text(tierName, centerX, M + 2, { width: centerW, align: 'center' });

  // "TICKET TRACKER" — large purple bold below pack name
  doc.font('Helvetica-Bold').fontSize(34).fillColor('#8B2FC9');
  doc.text('TICKET TRACKER', centerX, M + 52, { width: centerW, align: 'center' });

  // ── TICKET STRIP ─────────────────────────────────────────────────
  const stripTop = M + logoSize + 10;
  const stripH = PAGE_H - stripTop - M - 28; // leave room for footer

  const labelW = 44;  // width of START/END NUMBER labels on left
  const stripX = M + labelW + 4;
  const stripW = PAGE_W - stripX - M;

  const ticketW = stripW / 6;
  const headerH = stripH * 0.28;
  const bodyH = (stripH - headerH) / 2;
  const scallops = 6;

  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const cv = COLOR_VALUES[color];
    const tx = stripX + i * ticketW;

    // Header tab (colored rectangle, slightly rounded top)
    doc.roundedRect(tx + 1, stripTop, ticketW - 2, headerH, 4)
       .fill(cv.fill);

    // Color name text in header
    doc.font('Helvetica-Bold').fontSize(9).fillColor(cv.headerText);
    doc.text(color.toUpperCase(), tx + 1, stripTop + 5, { width: ticketW - 2, align: 'center' });
    doc.text('TICKETS', tx + 1, stripTop + 16, { width: ticketW - 2, align: 'center' });

    // START NUMBER body — white with scalloped edges
    const startY = stripTop + headerH;
    drawScallopedRect(doc, tx + 1, startY, ticketW - 2, bodyH, 4, scallops, cv.fill);
    doc.roundedRect(tx + 3, startY + 2, ticketW - 6, bodyH - 4, 3).fill('#FFFFFF');

    // START number value
    doc.font('Helvetica-Bold').fontSize(13).fillColor(cv.numColor);
    doc.text(range.start.toString(), tx + 1, startY + (bodyH - 16) / 2 + 2, {
      width: ticketW - 2, align: 'center'
    });

    // END NUMBER body
    const endY = startY + bodyH;
    drawScallopedRect(doc, tx + 1, endY, ticketW - 2, bodyH, 4, scallops, cv.fill);
    doc.roundedRect(tx + 3, endY + 2, ticketW - 6, bodyH - 4, 3).fill('#FFFFFF');

    // END number value
    doc.font('Helvetica-Bold').fontSize(13).fillColor(cv.numColor);
    doc.text(range.end.toString(), tx + 1, endY + (bodyH - 16) / 2 + 2, {
      width: ticketW - 2, align: 'center'
    });

    // Perforation between tickets (not after last)
    if (i < 5) {
      drawPerforation(doc, tx + ticketW, stripTop + headerH, stripTop + stripH);
    }
  });

  // START NUMBER / END NUMBER labels on left
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#8B2FC9');
  const startLabelY = stripTop + headerH + bodyH / 2 - 8;
  doc.text('START', M, startLabelY, { width: labelW, align: 'center' });
  doc.text('NUMBER', M, startLabelY + 9, { width: labelW, align: 'center' });

  const endLabelY = stripTop + headerH + bodyH + bodyH / 2 - 8;
  doc.text('END', M, endLabelY, { width: labelW, align: 'center' });
  doc.text('NUMBER', M, endLabelY + 9, { width: labelW, align: 'center' });

  // ── FOOTER ────────────────────────────────────────────────────────
  const footerY = PAGE_H - M - 18;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#8B2FC9');
  doc.text(tournamentName.toUpperCase(), M, footerY, { width: contentW, align: 'center' });

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
  doc.text(`Serial No: ${serial}`, M, footerY, { width: contentW, align: 'right' });
}

/**
 * Generate a single tracker card as a Buffer.
 */
export async function generateTrackerCard(params) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margin: 0,
      info: { Title: `Ticket Tracker — ${params.serial}` },
    });
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
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margin: 0,
      autoFirstPage: false,
    });
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
