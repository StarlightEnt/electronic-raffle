/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Uses the actual SFGGC ticket stub images (extracted from the original Word doc)
 * as the ticket backgrounds, overlaying color name, start/end numbers on top.
 *
 * Layout: Landscape half-letter (8.5" × 5.5")
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const COLORS_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const COLOR_TEXT = {
  Red:    '#CC0000',
  Orange: '#C05000',
  Yellow: '#8B6500',
  Green:  '#006600',
  Blue:   '#0000CC',
  Purple: '#6600AA',
};

const COLOR_HEADER = {
  Red:    '#CC0000',
  Orange: '#D05A00',
  Yellow: '#8B6500',
  Green:  '#007700',
  Blue:   '#0033CC',
  Purple: '#6600AA',
};

// Landscape half-letter
const PAGE_W = 8.5 * 72;  // 612 pts
const PAGE_H = 5.5 * 72;  // 396 pts

/**
 * Load ticket stub image buffers from public folder (server-side).
 * Falls back gracefully if files not found.
 */
function loadTicketImages() {
  const images = {};
  const publicDir = path.join(process.cwd(), 'public');
  for (const color of COLORS_ORDER) {
    const filePath = path.join(publicDir, `ticket_${color.toLowerCase()}.jpg`);
    try {
      images[color] = fs.readFileSync(filePath);
    } catch(e) {
      images[color] = null;
    }
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

  // ── Price top-right — large peach bold ───────────────────────────
  doc.font('Helvetica-Bold').fontSize(58).fillColor('#F4A460');
  doc.text(`$${Math.round(price)}`, PAGE_W - M - 140, M - 8,
    { width: 140, align: 'right', lineBreak: false });

  // ── Pack name center — light blue ────────────────────────────────
  const headW = PAGE_W - logoRight - 150;
  doc.font('Helvetica-Bold').fontSize(42).fillColor('#7EC8E3');
  doc.text(tierName, logoRight, M + 2, { width: headW, align: 'center', lineBreak: false });

  // ── "TICKET TRACKER" — purple ────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(30).fillColor('#8B2FC9');
  doc.text('TICKET TRACKER', logoRight, M + 48, { width: headW, align: 'center', lineBreak: false });

  // ── Ticket strip layout ───────────────────────────────────────────
  const labelW = 48;
  const stripTop = M + logoSize + 10;
  const stripH = PAGE_H - stripTop - M - 22;
  const stripX = M + labelW + 2;
  const stripW = PAGE_W - stripX - M;
  const ticketW = stripW / 6;

  // The ticket image is 256×132 px → aspect ratio ~1.94:1
  // We render each stub at ticketW wide, full stripH tall
  // The image is used as full background, then we overdraw text

  // Header area height within the stub (top ~28%)
  const headerH = stripH * 0.27;
  const bodyH = (stripH - headerH) / 2;

  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const tx = stripX + i * ticketW;
    const imgBuf = ticketImages[color];

    if (imgBuf) {
      // Draw the actual ticket stub image as background
      doc.image(imgBuf, tx, stripTop, { width: ticketW, height: stripH });
    } else {
      // Fallback: plain colored rect
      doc.roundedRect(tx, stripTop, ticketW, stripH, 6).fill(COLOR_HEADER[color]);
    }

    // ── Color name header overlay ──────────────────────────────────
    // The header area is the top portion of the stub
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_HEADER[color]);
    doc.text(color.toUpperCase(), tx, stripTop + 6,
      { width: ticketW, align: 'center', lineBreak: false });
    doc.text('TICKETS', tx, stripTop + 16,
      { width: ticketW, align: 'center', lineBreak: false });

    // ── START number ───────────────────────────────────────────────
    const startStr = range.start.toString();
    const numFontSize = startStr.length >= 7 ? 10 : 12;
    doc.font('Helvetica-Bold').fontSize(numFontSize).fillColor(COLOR_TEXT[color]);
    doc.text(startStr, tx, stripTop + headerH + (bodyH - numFontSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false });

    // ── END number ─────────────────────────────────────────────────
    const endStr = range.end.toString();
    doc.font('Helvetica-Bold').fontSize(numFontSize).fillColor(COLOR_TEXT[color]);
    doc.text(endStr, tx, stripTop + headerH + bodyH + (bodyH - numFontSize) / 2,
      { width: ticketW, align: 'center', lineBreak: false });
  });

  // ── START / END NUMBER labels left of strip ───────────────────────
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#8B2FC9');

  const startLabelY = stripTop + headerH + bodyH / 2 - 8;
  doc.text('START', M, startLabelY, { width: labelW, align: 'center', lineBreak: false });
  doc.text('NUMBER', M, startLabelY + 9, { width: labelW, align: 'center', lineBreak: false });

  const endLabelY = stripTop + headerH + bodyH + bodyH / 2 - 8;
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
