/**
 * Electronic Raffle — Draw Engine
 *
 * Uses Node.js crypto.randomBytes (CSPRNG) for all random operations.
 * Rejection sampling eliminates modulo bias for perfectly uniform distribution.
 *
 * Draw logic:
 *   1. Build the sold ticket pool from pack ranges (mathematical, not expanded)
 *   2. Draw a secure random index into the total ticket count
 *   3. Walk ranges to find which ticket that index corresponds to
 *   4. Identify owner via pack record
 *   5. Record as discarded — never re-drawable
 */

import crypto from 'crypto';

/**
 * Cryptographically secure random integer in [0, max) with rejection sampling.
 */
function secureRandomInt(max) {
  if (max <= 0) throw new Error('max must be > 0');
  if (max === 1) return 0;
  const MAX_UINT32 = 0xFFFFFFFF;
  const limit = MAX_UINT32 - ((MAX_UINT32 % max) + 1) % max;
  let value;
  do {
    const bytes = crypto.randomBytes(4);
    value = bytes.readUInt32BE(0);
  } while (value > limit);
  return value % max;
}

/**
 * Build an array of { color, start, end, packId } range segments
 * from all sold (and not fully discarded) packs.
 * Excludes any individually discarded ticket numbers.
 *
 * @param {Array} soldPacks - DB records with color_ranges JSON
 * @param {Set<number>} discardedNumbers - already-drawn ticket numbers
 * @returns {{ segments: Array, totalCount: number }}
 */
export function buildDrawPool(soldPacks, discardedNumbers = new Set()) {
  const segments = [];
  let totalCount = 0;

  for (const pack of soldPacks) {
    const ranges = typeof pack.color_ranges === 'string'
      ? JSON.parse(pack.color_ranges)
      : pack.color_ranges;

    for (const [color, range] of Object.entries(ranges)) {
      // Walk through range, splitting around discarded numbers
      // For efficiency, we store segments as full ranges and handle
      // discarded numbers at draw time via re-draw (discard is permanent,
      // re-draw picks again — pool shrinks each draw)
      // Since discarded numbers are removed from the pool count:
      let rangeCount = range.end - range.start + 1;

      // Count discarded numbers within this range
      let discardedInRange = 0;
      for (const d of discardedNumbers) {
        if (d >= range.start && d <= range.end) discardedInRange++;
      }
      rangeCount -= discardedInRange;

      if (rangeCount > 0) {
        segments.push({
          color,
          start: range.start,
          end: range.end,
          packId: pack.id,
          packSerial: pack.serial,
          buyerName: pack.buyer_name,
          buyerPid: pack.buyer_pid,
          count: rangeCount,
          discardedInRange: discardedInRange,
        });
        totalCount += rangeCount;
      }
    }
  }

  return { segments, totalCount };
}

/**
 * Draw a single winning ticket from the pool.
 *
 * @param {Array} soldPacks
 * @param {Set<number>} discardedNumbers
 * @returns {{ ticketNumber, color, packSerial, buyerName, buyerPid, totalInPool }}
 */
export function drawTicket(soldPacks, discardedNumbers = new Set()) {
  const { segments, totalCount } = buildDrawPool(soldPacks, discardedNumbers);

  if (totalCount === 0) {
    throw new Error('No tickets remaining in pool');
  }

  // Pick a random position in [0, totalCount)
  let position = secureRandomInt(totalCount);

  // Walk segments to find which ticket this position corresponds to
  for (const seg of segments) {
    if (position < seg.count) {
      // This segment contains our winning ticket
      // Walk through the segment's actual numbers, skipping discarded ones
      let actualPosition = 0;
      for (let n = seg.start; n <= seg.end; n++) {
        if (!discardedNumbers.has(n)) {
          if (actualPosition === position) {
            return {
              ticketNumber: n,
              color: seg.color,
              packSerial: seg.packSerial,
              packId: seg.packId,
              buyerName: seg.buyerName,
              buyerPid: seg.buyerPid,
              totalInPool: totalCount,
            };
          }
          actualPosition++;
        }
      }
    }
    position -= seg.count;
  }

  throw new Error('Draw algorithm error — position exceeded pool');
}

/**
 * CSS color values for each ticket color, matching the physical ticket design.
 */
export const TICKET_COLORS = {
  Red:    { bg: '#ef4444', text: '#ffffff', dark: '#b91c1c' },
  Orange: { bg: '#f97316', text: '#ffffff', dark: '#c2410c' },
  Yellow: { bg: '#eab308', text: '#000000', dark: '#a16207' },
  Green:  { bg: '#22c55e', text: '#ffffff', dark: '#15803d' },
  Blue:   { bg: '#3b82f6', text: '#ffffff', dark: '#1d4ed8' },
  Purple: { bg: '#a855f7', text: '#ffffff', dark: '#7e22ce' },
};


