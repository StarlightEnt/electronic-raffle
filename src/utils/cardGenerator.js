/**
 * Electronic Raffle — Ticket Tracker Card Generator
 * Layout anchored to ticket strip position.
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
const PAGE_W = 8.5 * 72;  // 612
const PAGE_H = 5.5 * 72;  // 396
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

function draw3DText(doc, text, x, y, w, fontSize, mainColor, shadowColor, layers = 4) {
  doc.font('Copperplate').fontSize(fontSize);
  for (let i = layers; i >= 1; i--) {
    doc.fillColor(shadowColor);
    doc.text(text, x + i * 0.8, y + i * 0.8, { width: w, align: 'center', lineBreak: false });
  }
  doc.fillColor(mainColor);
  doc.text(text, x, y, { width: w, align: 'center', lineBreak: false });
}

function drawCard(doc, params, ticketImages) {
  const { serial, tierName, price, tournamentName, colorRanges, logoBuffer } = params;

  // White background
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');

  // ── STEP 1: Calculate ticket strip position (the anchor) ──────────
  const labelW = 50;
  const footerH = 16;
  const stripX = M + labelW + 2;
  const stripW = PAGE_W - stripX - M;
  const ticketW = stripW / 6;
  const ticketH = ticketW / TICKET_ASPECT;  // ~45.7pts
  const rowGap = 4;
  const totalStackH = ticketH * 3 + rowGap * 2;

  // Pin strip bottom 6pts above footer zone
  const stripBottom = PAGE_H - M - footerH - 6;
  const stripTop = stripBottom - totalStackH;  // ~214.8pts from top

  // ── STEP 2: Logo — 40% card height, top-left ─────────────────────
  const logoH = PAGE_H * 0.40;  // ~158pts
  const logoAspect = 281 / 323; // portrait logo aspect
  const logoW = logoH * logoAspect; // ~137pts
  if (logoBuffer) {
    try { doc.image(logoBuffer, M, M, { width: logoW, height: logoH }); } catch(e) {}
  }

  // ── STEP 3: Title block — centered in space right of logo ─────────
  // Space to right of logo, above ticket strip
  const titleX = M + logoW + 12;
  const titleW = PAGE_W - titleX - M - 90; // leave room for price top-right
  // Vertically center the two title lines in the space above the strip
  const spaceAbove = stripTop - M; // ~200pts
  const titleBlockH = 46 + 34; // approx height of both lines
  const titleY = M + (spaceAbove - titleBlockH) / 2;

  // "30 Tickets" — Nunito Bold, gradient blue
  const grad = doc.linearGradient(titleX, titleY, titleX + titleW, titleY);
  grad.stop(0, '#87CEEB');
  grad.stop(1, '#1565C0');
  doc.font('Nunito').fontSize(46).fillColor(grad);
  doc.text(tierName, titleX, titleY, { width: titleW, align: 'center', lineBreak: false });

  // "TICKET TRACKER" — Copperplate, 3D purple shadow
  const ttY = titleY + 52;
  draw3DText(doc, 'TICKET TRACKER', titleX, ttY, titleW, 30, '#8B2FC9', '#3D0066', 4);

  // ── STEP 4: Price — top-right, Nunito, peach, rotated -8° ────────
  const priceStr = `$${Math.round(price)}`;
  const priceBoxW = 100;
  const priceBoxH = 70;
  const priceX = PAGE_W - M - priceBoxW;
  const priceY = M;
  doc.save();
  doc.rotate(-8, { origin: [priceX + priceBoxW / 2, priceY + priceBoxH / 2] });
  doc.font('Nunito').fontSize(62).fillColor('#F4A460');
  doc.text(priceStr, priceX, priceY, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.restore();

  // ── STEP 5: Draw ticket strip ─────────────────────────────────────
  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const tx = stripX + i * ticketW;
    const imgBuf = ticketImages[color];

    const y1 = stripTop;
    const y2 = stripTop + ticketH + rowGap;
    const y3 = stripTop + ticketH * 2 + rowGap * 2;

    if (imgBuf) {
      doc.image(imgBuf, tx, y1, { width: ticketW, height: ticketH });
      doc.image(imgBuf, tx, y2, { width: ticketW, height: ticketH });
      doc.image(imgBuf, tx, y3, { width: ticketW, height: ticketH });
    }

    // Row 1: Color header — Constantia, black, size 9, bold
    doc.font('Constantia').fontSize(9).fillColor('#000000');
    doc.text(color.toUpperCase(), tx, y1 + ticketH * 0.20,
      { width: ticketW, align: 'center', lineBreak: false });
    doc.text('TICKETS', tx, y1 + ticketH * 0.20 + 12,
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

  // ── STEP 6: START/END labels left of strip ────────────────────────
  const y2 = stripTop + ticketH + rowGap;
  const y3 = stripTop + ticketH * 2 + rowGap * 2;

  doc.font('Constantia').fontSize(7).fillColor('#8B2FC9');
  doc.text('START', M, y2 + ticketH / 2 - 9, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, y2 + ticketH / 2, { width: labelW, align: 'center', lineBreak: false });
  doc.text('END', M, y3 + ticketH / 2 - 9, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, y3 + ticketH / 2, { width: labelW, align: 'center', lineBreak: false });

  // ── STEP 7: Footer ────────────────────────────────────────────────
  const footerY = stripBottom + 6;
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
        serial: pack.serial, tierName: pack.tier_name, price: pack.price,
        tournamentName: config.tournamentName, colorRanges, logoBuffer: config.logoBuffer,
      }, ticketImages);
    }
    doc.end();
  });
}
