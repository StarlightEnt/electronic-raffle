/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Uses actual SFGGC ticket stub images stacked 3 per color:
 *   Row 1: header (color name + TICKETS)
 *   Row 2: start number
 *   Row 3: end number
 *
 * Ticket images maintain their natural aspect ratio (256x132, ~1.94:1).
 * Layout: Landscape half-letter (8.5" × 5.5")
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const COLORS_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

// Dark text color per ticket for overlaying on the light interior
const COLOR_TEXT = {
  Red:    '#CC0000',
  Orange: '#C05000',
  Yellow: '#8B6500',
  Green:  '#007700',
  Blue:   '#0033CC',
  Purple: '#6600AA',
};

// Ticket image natural aspect ratio: 256 × 132 ≈ 1.939:1
const TICKET_ASPECT = 256 / 132;

const PAGE_W = 8.5 * 72;  // 612 pts landscape
const PAGE_H = 5.5 * 72;  // 396 pts

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

function drawCard(doc, params, ticketImages) {
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
  doc.font('Helvetica-Bold').fontSize(58).fillColor('#F4A460');
  doc.text(`$${Math.round(price)}`, PAGE_W - M - 140, M - 8,
    { width: 140, align: 'right', lineBreak: false });

  // ── Pack name center (light blue) ─────────────────────────────────
  const headW = PAGE_W - logoRight - 150;
  doc.font('Helvetica-Bold').fontSize(42).fillColor('#7EC8E3');
  doc.text(tierName, logoRight, M + 2, { width: headW, align: 'center', lineBreak: false });

  // ── "TICKET TRACKER" (purple) ─────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(30).fillColor('#8B2FC9');
  doc.text('TICKET TRACKER', logoRight, M + 48, { width: headW, align: 'center', lineBreak: false });

  // ── Ticket strip area ─────────────────────────────────────────────
  const labelW = 48;
  const stripTop = M + logoSize + 10;
  const stripH = PAGE_H - stripTop - M - 22;
  const stripX = M + labelW + 2;
  const stripW = PAGE_W - stripX - M;

  // Each column is 1/6 of the strip width
  const ticketW = stripW / 6;

  // Each ticket stub height = ticketW / TICKET_ASPECT (preserving ratio)
  const ticketH = ticketW / TICKET_ASPECT;

  // 3 tickets stacked = 3 × ticketH; center vertically in stripH
  const totalStackH = ticketH * 3;
  const stackOffsetY = stripTop + (stripH - totalStackH) / 2;

  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const tx = stripX + i * ticketW;
    const imgBuf = ticketImages[color];

    // ── ROW 1: Header ticket ────────────────────────────────────────
    const y1 = stackOffsetY;
    if (imgBuf) doc.image(imgBuf, tx, y1, { width: ticketW, height: ticketH });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_TEXT[color]);
    doc.text(color.toUpperCase(), tx, y1 + ticketH * 0.25,
      { width: ticketW, align: 'center', lineBreak: false });
    doc.text('TICKETS', tx, y1 + ticketH * 0.25 + 10,
      { width: ticketW, align: 'center', lineBreak: false });

    // ── ROW 2: Start number ticket ──────────────────────────────────
    const y2 = stackOffsetY + ticketH;
    if (imgBuf) doc.image(imgBuf, tx, y2, { width: ticketW, height: ticketH });

    const startStr = range.start.toString();
    const numSize = startStr.length >= 7 ? 10 : 12;
    doc.font('Helvetica-Bold').fontSize(numSize).fillColor(COLOR_TEXT[color]);
    doc.text(startStr, tx, y2 + (ticketH - numSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false });

    // ── ROW 3: End number ticket ────────────────────────────────────
    const y3 = stackOffsetY + ticketH * 2;
    if (imgBuf) doc.image(imgBuf, tx, y3, { width: ticketW, height: ticketH });

    const endStr = range.end.toString();
    doc.font('Helvetica-Bold').fontSize(numSize).fillColor(COLOR_TEXT[color]);
    doc.text(endStr, tx, y3 + (ticketH - numSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false });
  });

  // ── START / END NUMBER labels on left ────────────────────────────
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#8B2FC9');

  const startLabelY = stackOffsetY + ticketH + (ticketH / 2) - 8;
  doc.text('START', M, startLabelY, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, startLabelY + 9, { width: labelW, align: 'center', lineBreak: false });

  const endLabelY = stackOffsetY + ticketH * 2 + (ticketH / 2) - 8;
  doc.text('END', M, endLabelY, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, endLabelY + 9, { width: labelW, align: 'center', lineBreak: false });

  // ── Footer ────────────────────────────────────────────────────────
  const footerY = PAGE_H - M - 14;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#8B2FC9');
  doc.text(tournamentName.toUpperCase(), M, footerY,
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
