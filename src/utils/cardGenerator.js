/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Design spec:
 *   - Landscape half-letter (8.5" × 5.5")
 *   - Logo: top-left, ~40% card height, no overlap with tickets
 *   - "30 Tickets": Nunito Bold, large, light→dark blue horizontal gradient
 *   - "TICKET TRACKER": Copperplate Gothic Bold, purple with 3D block shadow
 *   - Price: Nunito Bold, peach/salmon, large, rotated ~-8°
 *   - Ticket header labels: Constantia Bold, black
 *   - Numbers in tickets: Constantia Bold, ticket color with thin black outline
 *   - 3 ticket rows per color, small gap between rows
 *   - Elements placed independently, anchored to ticket strip
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

// Ticket image natural aspect ratio 256×132
const TICKET_ASPECT = 256 / 132;

// Landscape half-letter
const PAGE_W = 8.5 * 72;  // 612 pts
const PAGE_H = 5.5 * 72;  // 396 pts

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

function loadFonts(doc) {
  try {
    doc.registerFont('Copperplate', path.join(FONT_DIR, 'COPRGTB.TTF'));
  } catch(e) { console.warn('Copperplate font not found, falling back'); }
  try {
    doc.registerFont('Constantia', path.join(FONT_DIR, 'CONSTAN.TTF'));
  } catch(e) { console.warn('Constantia font not found, falling back'); }
  try {
    doc.registerFont('Nunito', path.join(FONT_DIR, 'Nunito-Bold.ttf'));
  } catch(e) { console.warn('Nunito font not found, falling back'); }
}

function loadTicketImages() {
  const images = {};
  const publicDir = path.join(process.cwd(), 'public');
  for (const color of COLORS_ORDER) {
    const filePath = path.join(publicDir, `ticket_${color.toLowerCase()}.jpg`);
    try { images[color] = fs.readFileSync(filePath); }
    catch(e) { images[color] = null; }
  }
  return images;
}

/**
 * Draw text with a thin outline (stroke + fill).
 * PDFKit: draw stroke first, then fill on top.
 */
function drawOutlinedText(doc, text, x, y, opts, fillColor, strokeColor = '#000000', strokeWidth = 0.5) {
  doc.fillColor(strokeColor).strokeColor(strokeColor).lineWidth(strokeWidth * 2);
  doc.text(text, x, y, { ...opts, fill: false, stroke: true });
  doc.fillColor(fillColor).strokeColor(fillColor).lineWidth(0);
  doc.text(text, x, y, { ...opts, fill: true, stroke: false });
}

/**
 * Draw "TICKET TRACKER" with 3D block shadow effect.
 * Layers: dark offset shadow → mid offset → main text on top.
 */
function draw3DText(doc, text, x, y, w, fontSize, mainColor, shadowColor, layers = 4) {
  doc.font('Copperplate').fontSize(fontSize);
  // Draw shadow layers offset down-right
  for (let i = layers; i >= 1; i--) {
    doc.fillColor(shadowColor);
    doc.text(text, x + i * 0.9, y + i * 0.9, { width: w, align: 'center', lineBreak: false });
  }
  // Main text on top
  doc.fillColor(mainColor);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
}

/**
 * Draw text with a horizontal gradient by clipping to text shape
 * and filling with a gradient rect behind it.
 * PDFKit approach: draw text as vector path, fill with gradient.
 */
function drawGradientText(doc, text, x, y, w, fontSize, font, colorStart, colorEnd) {
  doc.save();
  doc.font(font).fontSize(fontSize);
  // Draw filled text in start color first (fallback)
  doc.fillColor(colorStart);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
  // Overlay gradient using linear gradient fill
  // PDFKit supports linearGradient as a fill for shapes but not directly for text
  // Best achievable: draw text twice — lighter shade then slightly darker on right half
  // Simulate gradient by drawing right half in darker color with clip
  const grad = doc.linearGradient(x, y, x + w, y);
  grad.stop(0, colorStart);
  grad.stop(1, colorEnd);
  doc.fillColor(grad);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
  doc.restore();
}

function drawCard(doc, params, ticketImages) {
  const { serial, tierName, price, tournamentName, colorRanges, logoBuffer } = params;

  const M = 14; // page margin

  // White background
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');

  // ── TICKET STRIP — the anchor ─────────────────────────────────────
  // Fix the strip to the bottom portion of the card
  const labelW = 50;
  const stripX = M + labelW + 2;
  const stripW = PAGE_W - stripX - M;
  const ticketW = stripW / 6;
  const ticketH = ticketW / TICKET_ASPECT; // natural aspect ratio
  const rowGap = 3; // small gap between stacked rows
  const totalStackH = ticketH * 3 + rowGap * 2;

  // Pin strip bottom to near bottom of page
  const footerH = 16;
  const stripBottom = PAGE_H - M - footerH - 4;
  const stripTop = stripBottom - totalStackH;
  const stackStartY = stripTop;

  // ── LOGO — top-left, ~40% card height ────────────────────────────
  const logoMaxH = PAGE_H * 0.40; // 40% of card height
  const logoMaxW = stripX - M - 4; // can't go past the strip label area
  // Keep aspect ratio — logo is portrait-ish (281×323 from Word doc)
  const logoAspect = 281 / 323;
  let logoH = logoMaxH;
  let logoW = logoH * logoAspect;
  if (logoW > logoMaxW) { logoW = logoMaxW; logoH = logoW / logoAspect; }

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, M, M, { width: logoW, height: logoH });
    } catch(e) {}
  }

  // ── "30 Tickets" — Nunito Bold, gradient blue ────────────────────
  // Positioned to the right of logo, vertically in upper area
  const titleX = M + logoW + 10;
  const titleW = PAGE_W - titleX - M - 80; // leave room for price
  const titleY = stripTop - 78; // sits above ticket strip

  doc.font('Nunito').fontSize(46);
  // Simulate gradient: draw in light blue, then overlay darker on right using gradient fill
  const grad = doc.linearGradient(titleX, titleY, titleX + titleW, titleY);
  grad.stop(0, '#87CEEB'); // light sky blue
  grad.stop(1, '#1E90FF'); // dodger blue
  doc.fillColor(grad);
  doc.text(tierName, titleX, titleY, { width: titleW, align: 'center', lineBreak: false });

  // ── "TICKET TRACKER" — Copperplate, 3D purple block shadow ───────
  const ttY = titleY + 48;
  draw3DText(doc, 'TICKET TRACKER', titleX, ttY, titleW, 28, '#8B2FC9', '#4A1060', 4);

  // ── Price — Nunito Bold, peach, rotated -8° ───────────────────────
  const priceStr = `$${Math.round(price)}`;
  const priceX = PAGE_W - M - 95;
  const priceY = M + 4;
  doc.save();
  doc.rotate(-8, { origin: [priceX + 47, priceY + 30] });
  doc.font('Nunito').fontSize(60).fillColor('#F4A460');
  doc.text(priceStr, priceX, priceY, { width: 95, align: 'center', lineBreak: false });
  doc.restore();

  // ── Ticket strip ──────────────────────────────────────────────────
  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const tx = stripX + i * ticketW;
    const imgBuf = ticketImages[color];

    const y1 = stackStartY;
    const y2 = stackStartY + ticketH + rowGap;
    const y3 = stackStartY + ticketH * 2 + rowGap * 2;

    // Draw 3 ticket images
    if (imgBuf) {
      doc.image(imgBuf, tx, y1, { width: ticketW, height: ticketH });
      doc.image(imgBuf, tx, y2, { width: ticketW, height: ticketH });
      doc.image(imgBuf, tx, y3, { width: ticketW, height: ticketH });
    }

    // ── Row 1: Color header — Constantia Bold, BLACK ──────────────
    doc.font('Constantia').fontSize(8).fillColor('#000000');
    doc.text(color.toUpperCase(), tx, y1 + ticketH * 0.22,
      { width: ticketW, align: 'center', lineBreak: false });
    doc.text('TICKETS', tx, y1 + ticketH * 0.22 + 11,
      { width: ticketW, align: 'center', lineBreak: false });

    // ── Row 2: Start number — Constantia, ticket color + outline ──
    const startStr = range.start.toString();
    const numSize = startStr.length >= 7 ? 10 : 12;
    doc.font('Constantia').fontSize(numSize);
    // Outline: stroke in black first, then fill in ticket color
    doc.strokeColor('#000000').lineWidth(0.8).fillColor(COLOR_TEXT[color]);
    doc.text(startStr, tx, y2 + (ticketH - numSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false, fill: true, stroke: true });

    // ── Row 3: End number ─────────────────────────────────────────
    const endStr = range.end.toString();
    doc.font('Constantia').fontSize(numSize);
    doc.strokeColor('#000000').lineWidth(0.8).fillColor(COLOR_TEXT[color]);
    doc.text(endStr, tx, y3 + (ticketH - numSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false, fill: true, stroke: true });
  });

  // ── START / END NUMBER labels — Constantia, purple ───────────────
  const y2 = stackStartY + ticketH + rowGap;
  const y3 = stackStartY + ticketH * 2 + rowGap * 2;

  doc.font('Constantia').fontSize(7).fillColor('#8B2FC9');
  doc.text('START', M, y2 + ticketH / 2 - 9, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, y2 + ticketH / 2, { width: labelW, align: 'center', lineBreak: false });

  doc.text('END', M, y3 + ticketH / 2 - 9, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, y3 + ticketH / 2, { width: labelW, align: 'center', lineBreak: false });

  // ── Footer ────────────────────────────────────────────────────────
  const footerY = stripBottom + rowGap + 4;
  const cleanName = tournamentName.replace(/\s+\d{4}$/, '');
  doc.font('Constantia').fontSize(8).fillColor('#8B2FC9');
  doc.text(cleanName.toUpperCase(), M, footerY,
    { width: PAGE_W - M * 2, align: 'center', lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
  doc.text(`Serial No: ${serial}`, M, footerY,
    { width: PAGE_W - M * 2, align: 'right', lineBreak: false });
}

export async function generateTrackerCard(params) {
  const ticketImages = loadTicketImages();
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H], margin: 0,
      info: { Title: `Ticket Tracker — ${params.serial}` },
    });
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
