/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Design (finalized via preview iterations):
 *   - Landscape half-letter (8.5" × 5.5")
 *   - Logo: top-left, 40% card height
 *   - "30 Tickets": Nunito Bold, light→dark blue gradient
 *   - "TICKET TRACKER": Copperplate Gothic Bold, purple with
 *     4-layer shadow: lavender→lavender→light lavender→near-white→purple
 *   - Price: Nunito Bold, peach, rotated -8°, dynamically sized to fit
 *   - Ticket header labels: Constantia, black, vertically centered
 *   - Numbers: Constantia, ticket color, 0.25pt black outline
 *   - START/END labels: Constantia, bold purple (stroke+fill)
 *   - 3 ticket rows per color, 4pt gap between rows
 *   - Strip anchored at y=188 (just above vertical midline)
 *   - Footer: tournament name centered purple, serial right, both Constantia 8pt
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const COLORS_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const COLOR_TEXT = {
  Red:    '#CC0000',
  Orange: '#C05000',
  Yellow: '#8B6500',
  Green:  '#007700',
  Blue:   '#0033CC',
  Purple: '#6600AA',
};

const TICKET_ASPECT = 256 / 132;
const PAGE_W = 8.5 * 72;  // 612pts
const PAGE_H = 5.5 * 72;  // 396pts
const M = 14;

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

function loadFonts(doc) {
  try { doc.registerFont('Copperplate', path.join(FONT_DIR, 'COPRGTB.TTF')); } catch(e) {}
  try { doc.registerFont('Constantia',  path.join(FONT_DIR, 'CONSTAN.TTF')); } catch(e) {}
  try { doc.registerFont('Nunito',      path.join(FONT_DIR, 'Nunito-Bold.ttf')); } catch(e) {}
}

function loadTicketImages() {
  const images = {};
  const publicDir = path.join(process.cwd(), 'public');
  for (const color of COLORS_ORDER) {
    try { images[color] = fs.readFileSync(path.join(publicDir, `ticket_${color.toLowerCase()}.jpg`)); }
    catch(e) { images[color] = null; }
  }
  return images;
}

function draw3DText(doc, text, x, y, w, fontSize, mainColor) {
  doc.font('Copperplate').fontSize(fontSize);
  const shadowColors = {
    4: '#C9A0DC',  // lavender
    3: '#C9A0DC',  // lavender
    2: '#DEC4EC',  // light lavender
    1: '#F2EEEE',  // near-white highlight
  };
  for (let i = 4; i >= 1; i--) {
    doc.fillColor(shadowColors[i]);
    doc.text(text, x + i * 0.9, y + i * 0.9, { width: w, align: 'center', lineBreak: false });
  }
  doc.fillColor(mainColor);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
}

function drawCard(doc, params, ticketImages) {
  const { serial, tierName, price, tournamentName, colorRanges, logoBuffer } = params;

  // White background
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');

  // ── TICKET STRIP — the anchor ─────────────────────────────────────
  const labelW = 50;
  const stripX = M + labelW + 2;
  const stripW = PAGE_W - stripX - M;
  const ticketW = stripW / 6;
  const ticketH = ticketW / TICKET_ASPECT;
  const rowGap = 4;
  const totalStackH = ticketH * 3 + rowGap * 2;
  const stripTop = 188;
  const stripBottom = stripTop + totalStackH;

  // ── LOGO — top-left, 40% card height ─────────────────────────────
  const logoH = PAGE_H * 0.40;
  const logoAspect = 281 / 323;
  const logoW = logoH * logoAspect;
  if (logoBuffer) {
    try { doc.image(logoBuffer, M, M, { width: logoW, height: logoH }); } catch(e) {}
  }

  // ── TITLE BLOCK — right of logo, vertically centered above strip ──
  const titleX = M + logoW + 12;
  const titleW = PAGE_W - titleX - M - 75;
  const spaceAbove = stripTop - M;
  const titleBlockH = 52 + 36;
  const titleY = M + (spaceAbove - titleBlockH) / 2;

  // "30 Tickets" — Nunito Bold, light→dark blue gradient
  const grad = doc.linearGradient(titleX, titleY, titleX + titleW, titleY);
  grad.stop(0, '#87CEEB');
  grad.stop(1, '#1565C0');
  doc.font('Nunito').fontSize(46).fillColor(grad);
  doc.text(tierName, titleX, titleY, { width: titleW, align: 'center', lineBreak: false });

  // "TICKET TRACKER" — Copperplate, 3D lavender→white→purple shadow
  draw3DText(doc, 'TICKET TRACKER', titleX, titleY + 54, titleW, 36, '#8B2FC9');

  // ── PRICE — top-right, Nunito, peach, rotated -8° ─────────────────
  const priceStr = `$${Math.round(price)}`;
  const priceBoxW = 100;
  const priceX = PAGE_W - M - priceBoxW;
  const priceY = M;
  // Dynamic font size — measure actual width and scale to fit box
  const maxPriceFontSize = 62;
  doc.font('Nunito').fontSize(maxPriceFontSize);
  const actualPriceW = doc.widthOfString(priceStr);
  const priceFontSize = actualPriceW > priceBoxW
    ? Math.floor(maxPriceFontSize * (priceBoxW / actualPriceW))
    : maxPriceFontSize;
  doc.save();
  doc.rotate(-8, { origin: [priceX + priceBoxW / 2, priceY + 35] });
  doc.font('Nunito').fontSize(priceFontSize).fillColor('#F4A460');
  doc.text(priceStr, priceX, priceY, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.restore();

  // ── TICKET STRIP ──────────────────────────────────────────────────
  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const tx = stripX + i * ticketW;
    const imgBuf = ticketImages[color];
    const y1 = stripTop;
    const y2 = stripTop + ticketH + rowGap;
    const y3 = stripTop + ticketH * 2 + rowGap * 2;

    // 3 stacked ticket stub images at natural aspect ratio
    if (imgBuf) {
      doc.image(imgBuf, tx, y1, { width: ticketW, height: ticketH });
      doc.image(imgBuf, tx, y2, { width: ticketW, height: ticketH });
      doc.image(imgBuf, tx, y3, { width: ticketW, height: ticketH });
    }

    // Row 1: Color label — Constantia, black, vertically centered
    const headerTextBlockH = 21;
    const headerTextY = y1 + (ticketH - headerTextBlockH) / 2;
    doc.font('Constantia').fontSize(9).fillColor('#000000')
       .strokeColor('#000000').lineWidth(0);
    doc.text(color.toUpperCase(), tx, headerTextY,
      { width: ticketW, align: 'center', lineBreak: false });
    doc.text('TICKETS', tx, headerTextY + 12,
      { width: ticketW, align: 'center', lineBreak: false });

    // Row 2: Start number — Constantia, ticket color, hairline outline
    const startStr = range.start.toString();
    const numSize = startStr.length >= 7 ? 10 : 12;
    doc.font('Constantia').fontSize(numSize)
       .strokeColor('#000000').lineWidth(0.25)
       .fillColor(COLOR_TEXT[color]);
    doc.text(startStr, tx, y2 + (ticketH - numSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false, fill: true, stroke: true });

    // Row 3: End number
    const endStr = range.end.toString();
    doc.font('Constantia').fontSize(numSize)
       .strokeColor('#000000').lineWidth(0.25)
       .fillColor(COLOR_TEXT[color]);
    doc.text(endStr, tx, y3 + (ticketH - numSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false, fill: true, stroke: true });
  });

  // ── START/END LABELS — Constantia, bold purple ────────────────────
  const y2 = stripTop + ticketH + rowGap;
  const y3 = stripTop + ticketH * 2 + rowGap * 2;
  doc.font('Constantia').fontSize(8).fillColor('#8B2FC9')
     .strokeColor('#8B2FC9').lineWidth(0.4);
  doc.text('START', M, y2 + ticketH / 2 - 9,
    { width: labelW, align: 'center', lineBreak: false, fill: true, stroke: true });
  doc.text('NUMBER', M, y2 + ticketH / 2,
    { width: labelW, align: 'center', lineBreak: false, fill: true, stroke: true });
  doc.text('END', M, y3 + ticketH / 2 - 9,
    { width: labelW, align: 'center', lineBreak: false, fill: true, stroke: true });
  doc.text('NUMBER', M, y3 + ticketH / 2,
    { width: labelW, align: 'center', lineBreak: false, fill: true, stroke: true });

  // ── FOOTER ────────────────────────────────────────────────────────
  const footerY = stripBottom + 5;
  // Strip duplicate year e.g. "...2027 2027" → "...2027"
  const cleanFooterName = tournamentName.replace(/(\d{4})\s+\1$/, '$1');
  doc.font('Constantia').fontSize(8).fillColor('#8B2FC9')
     .strokeColor('#8B2FC9').lineWidth(0.3);
  doc.text(cleanFooterName, M, footerY,
    { width: PAGE_W - M * 2, align: 'center', lineBreak: false, fill: true, stroke: true });
  doc.font('Constantia').fontSize(8).fillColor('#333333')
     .strokeColor('#333333').lineWidth(0);
  doc.text(`Serial No: ${serial}`, M, footerY,
    { width: PAGE_W - M * 2, align: 'right', lineBreak: false });
}

export async function generateTrackerCard(params) {
  const ticketImages = loadTicketImages();
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0,
      info: { Title: `Ticket Tracker — ${params.serial}` } });
    loadFonts(doc);
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    const colorRanges = typeof params.colorRanges === 'string'
      ? JSON.parse(params.colorRanges) : params.colorRanges;
    drawCard(doc, { ...params, colorRanges }, ticketImages);
    doc.end();
  });
}

export async function generateBulkTrackerPDF(packs, config) {
  const ticketImages = loadTicketImages();
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
    loadFonts(doc);
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
      }, ticketImages);
    }
    doc.end();
  });
}
