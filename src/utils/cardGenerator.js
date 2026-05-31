/**
 * Electronic Raffle — Ticket Tracker Card Generator
 *
 * Generates half-letter (5.5" × 8.5") portrait PDF tracker cards.
 * Each card shows:
 *   - Tournament logo (uploadable)
 *   - Pack denomination and ticket count
 *   - Serial number
 *   - Rainbow ticket strip: 6 colored ticket stubs with start/end numbers
 *
 * Uses PDFKit for server-side PDF generation.
 */

import PDFDocument from 'pdfkit';

const COLORS_ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const COLOR_VALUES = {
  Red:    { bg: [239, 68,  68],  text: [255, 255, 255] },
  Orange: { bg: [249, 115, 22],  text: [255, 255, 255] },
  Yellow: { bg: [234, 179, 8],   text: [0,   0,   0  ] },
  Green:  { bg: [34,  197, 94],  text: [255, 255, 255] },
  Blue:   { bg: [59,  130, 246], text: [255, 255, 255] },
  Purple: { bg: [168, 85,  247], text: [255, 255, 255] },
};

// Half-letter in points (72pts = 1 inch)
const PAGE_W = 5.5 * 72;  // 396 pts
const PAGE_H = 8.5 * 72;  // 612 pts
const MARGIN = 18;

/**
 * Generate a single tracker card as a Buffer.
 *
 * @param {Object} params
 * @param {string} params.serial - e.g. '030 1001'
 * @param {string} params.tierName - e.g. '30 Tickets'
 * @param {number} params.price - e.g. 5
 * @param {string} params.tournamentName - e.g. 'San Francisco Golden Gate Classic 2026'
 * @param {Object} params.colorRanges - { Red: {start, end}, Orange: {start, end}, ... }
 * @param {Buffer|null} params.logoBuffer - PNG/JPEG logo bytes, or null
 * @param {string} params.primaryColor - hex color for accents e.g. '#f59e0b'
 * @returns {Promise<Buffer>}
 */
export async function generateTrackerCard(params) {
  const {
    serial,
    tierName,
    price,
    tournamentName,
    colorRanges,
    logoBuffer,
    primaryColor = '#f59e0b',
  } = params;

  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `Ticket Tracker — ${serial}`,
        Author: 'Electronic Raffle',
      },
    });

    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const contentW = PAGE_W - MARGIN * 2;

    // ── Header area ──────────────────────────────────────────────
    let yPos = MARGIN;

    // Logo (left side) + Price badge (right side)
    const logoSize = 72;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, yPos, { width: logoSize, height: logoSize });
      } catch (e) {
        // Logo load failed — skip gracefully
      }
    }

    // Price badge (top right)
    const priceText = `$${price}`;
    doc.fontSize(36).font('Helvetica-Bold');
    const priceW = 80;
    const priceX = PAGE_W - MARGIN - priceW;
    const priceC = hexToRgb(primaryColor);
    doc.fillColor([priceC.r, priceC.g, priceC.b])
       .text(priceText, priceX, yPos, { width: priceW, align: 'right' });

    // Tournament name centered
    doc.fontSize(9).font('Helvetica').fillColor([80, 80, 80])
       .text(tournamentName || '', MARGIN + logoSize + 4, yPos + 8, {
         width: contentW - logoSize - priceW - 8,
         align: 'center',
       });

    yPos += logoSize + 8;

    // ── Title ────────────────────────────────────────────────────
    doc.fontSize(28).font('Helvetica-Bold').fillColor([0, 128, 255])
       .text(`${tierName}`, MARGIN, yPos, { width: contentW, align: 'center' });
    yPos += 36;

    doc.fontSize(22).font('Helvetica-Bold').fillColor([128, 0, 128])
       .text('TICKET TRACKER', MARGIN, yPos, { width: contentW, align: 'center' });
    yPos += 30;

    // ── Ticket strip ─────────────────────────────────────────────
    const stripH = 148; // total height for the 6-color ticket strip
    const ticketW = (contentW - 10) / 6; // width per color block
    const ticketH = stripH;
    const cornerR = 6;

    // Draw each color ticket block
    COLORS_ORDER.forEach((color, i) => {
      const range = colorRanges[color];
      if (!range) return;

      const cv = COLOR_VALUES[color];
      const x = MARGIN + i * (ticketW + 2);
      const y = yPos;

      // Main ticket body
      doc.roundedRect(x, y, ticketW, ticketH, cornerR)
         .fillAndStroke(
           [cv.bg[0], cv.bg[1], cv.bg[2]],
           [Math.max(0, cv.bg[0]-40), Math.max(0, cv.bg[1]-40), Math.max(0, cv.bg[2]-40)]
         );

      // Perforation dots along left edge (except first)
      if (i > 0) {
        doc.fillColor([255, 255, 255]);
        for (let d = 0; d < 5; d++) {
          doc.circle(x - 1, y + 16 + d * 26, 3).fill();
        }
      }

      // Color name header
      const textColor = cv.text;
      doc.fillColor(textColor)
         .fontSize(7).font('Helvetica-Bold')
         .text(color.toUpperCase(), x + 2, y + 6, { width: ticketW - 4, align: 'center' })
         .text('TICKETS', x + 2, y + 14, { width: ticketW - 4, align: 'center' });

      // Divider line
      doc.moveTo(x + 4, y + 24)
         .lineTo(x + ticketW - 4, y + 24)
         .strokeColor(textColor)
         .lineWidth(0.5)
         .stroke();

      // START NUMBER label + value
      doc.fontSize(6).font('Helvetica')
         .fillColor(textColor)
         .text('START', x + 2, y + 28, { width: ticketW - 4, align: 'center' })
         .text('NUMBER', x + 2, y + 34, { width: ticketW - 4, align: 'center' });

      doc.fontSize(10).font('Helvetica-Bold')
         .fillColor(textColor)
         .text(range.start.toString(), x + 2, y + 44, { width: ticketW - 4, align: 'center' });

      // END NUMBER label + value
      doc.fontSize(6).font('Helvetica')
         .fillColor(textColor)
         .text('END', x + 2, y + 62, { width: ticketW - 4, align: 'center' })
         .text('NUMBER', x + 2, y + 68, { width: ticketW - 4, align: 'center' });

      doc.fontSize(10).font('Helvetica-Bold')
         .fillColor(textColor)
         .text(range.end.toString(), x + 2, y + 78, { width: ticketW - 4, align: 'center' });
    });

    yPos += stripH + 12;

    // ── Footer ───────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica').fillColor([80, 80, 80])
       .text(tournamentName || '', MARGIN, yPos, { width: contentW, align: 'center' });
    yPos += 14;

    doc.fontSize(10).font('Helvetica-Bold').fillColor([60, 60, 60])
       .text(`Serial No: ${serial}`, MARGIN, yPos, { width: contentW, align: 'right' });

    doc.end();
  });
}

/**
 * Generate a multi-page PDF containing tracker cards for a batch of packs.
 *
 * @param {Array<Object>} packs - array of pack records with colorRanges, serial, etc.
 * @param {Object} config - { tournamentName, logoBuffer, primaryColor }
 * @returns {Promise<Buffer>}
 */
export async function generateBulkTrackerPDF(packs, config) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: false,
    });

    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // We'll generate each card synchronously since PDFKit is sync
    // (generateTrackerCard wraps it in a Promise, so we need a sync version here)
    for (const pack of packs) {
      doc.addPage({ size: [PAGE_W, PAGE_H] });
      drawCardOnDoc(doc, {
        serial: pack.serial,
        tierName: pack.tier_name,
        price: pack.price,
        tournamentName: config.tournamentName,
        colorRanges: typeof pack.color_ranges === 'string'
          ? JSON.parse(pack.color_ranges) : pack.color_ranges,
        logoBuffer: config.logoBuffer,
        primaryColor: config.primaryColor || '#f59e0b',
      });
    }

    doc.end();
  });
}

/**
 * Synchronous card drawing onto an existing PDFDocument page.
 * (Same logic as generateTrackerCard but operates on an existing doc.)
 */
function drawCardOnDoc(doc, params) {
  const { serial, tierName, price, tournamentName, colorRanges, logoBuffer, primaryColor } = params;
  const contentW = PAGE_W - MARGIN * 2;
  let yPos = MARGIN;

  const logoSize = 72;
  if (logoBuffer) {
    try { doc.image(logoBuffer, MARGIN, yPos, { width: logoSize, height: logoSize }); }
    catch (e) {}
  }

  const priceText = `$${price}`;
  const priceW = 80;
  const priceX = PAGE_W - MARGIN - priceW;
  const priceC = hexToRgb(primaryColor);
  doc.fontSize(36).font('Helvetica-Bold')
     .fillColor([priceC.r, priceC.g, priceC.b])
     .text(priceText, priceX, yPos, { width: priceW, align: 'right' });

  doc.fontSize(9).font('Helvetica').fillColor([80, 80, 80])
     .text(tournamentName || '', MARGIN + logoSize + 4, yPos + 8, {
       width: contentW - logoSize - priceW - 8, align: 'center',
     });

  yPos += logoSize + 8;

  doc.fontSize(28).font('Helvetica-Bold').fillColor([0, 128, 255])
     .text(`${tierName}`, MARGIN, yPos, { width: contentW, align: 'center' });
  yPos += 36;

  doc.fontSize(22).font('Helvetica-Bold').fillColor([128, 0, 128])
     .text('TICKET TRACKER', MARGIN, yPos, { width: contentW, align: 'center' });
  yPos += 30;

  const stripH = 148;
  const ticketW = (contentW - 10) / 6;

  COLORS_ORDER.forEach((color, i) => {
    const range = colorRanges[color];
    if (!range) return;
    const cv = COLOR_VALUES[color];
    const x = MARGIN + i * (ticketW + 2);
    const y = yPos;

    doc.roundedRect(x, y, ticketW, stripH, 6)
       .fillAndStroke(
         [cv.bg[0], cv.bg[1], cv.bg[2]],
         [Math.max(0, cv.bg[0]-40), Math.max(0, cv.bg[1]-40), Math.max(0, cv.bg[2]-40)]
       );

    if (i > 0) {
      doc.fillColor([255, 255, 255]);
      for (let d = 0; d < 5; d++) doc.circle(x - 1, y + 16 + d * 26, 3).fill();
    }

    const tc = cv.text;
    doc.fillColor(tc).fontSize(7).font('Helvetica-Bold')
       .text(color.toUpperCase(), x + 2, y + 6, { width: ticketW - 4, align: 'center' })
       .text('TICKETS', x + 2, y + 14, { width: ticketW - 4, align: 'center' });

    doc.moveTo(x + 4, y + 24).lineTo(x + ticketW - 4, y + 24)
       .strokeColor(tc).lineWidth(0.5).stroke();

    doc.fontSize(6).font('Helvetica').fillColor(tc)
       .text('START', x + 2, y + 28, { width: ticketW - 4, align: 'center' })
       .text('NUMBER', x + 2, y + 34, { width: ticketW - 4, align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(tc)
       .text(range.start.toString(), x + 2, y + 44, { width: ticketW - 4, align: 'center' });

    doc.fontSize(6).font('Helvetica').fillColor(tc)
       .text('END', x + 2, y + 62, { width: ticketW - 4, align: 'center' })
       .text('NUMBER', x + 2, y + 68, { width: ticketW - 4, align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(tc)
       .text(range.end.toString(), x + 2, y + 78, { width: ticketW - 4, align: 'center' });
  });

  yPos += stripH + 12;

  doc.fontSize(9).font('Helvetica').fillColor([80, 80, 80])
     .text(tournamentName || '', MARGIN, yPos, { width: contentW, align: 'center' });
  yPos += 14;
  doc.fontSize(10).font('Helvetica-Bold').fillColor([60, 60, 60])
     .text(`Serial No: ${serial}`, MARGIN, yPos, { width: contentW, align: 'right' });
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 245, g: 158, b: 11 };
}


