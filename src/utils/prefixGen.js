/**
 * Electronic Raffle — Ticket Prefix Generation Algorithm
 *
 * Generates cryptographically random 2-digit prefix seeds for each
 * color × pack tier combination, with the following guarantees:
 *
 * 1. Within the same color, no two tier prefixes are within 7 of each other
 *    (prevents astute buyers from guessing pack sizes by number range)
 * 2. Tier assignment order is randomized per color (no size→prefix correlation)
 * 3. Cross-color proximity is irrelevant (color is printed on physical ticket)
 * 4. Uses crypto.randomBytes for true randomness
 *
 * Prefix math:
 *   seed=39 → prefix='390' → first ticket='390001'
 *   A color+tier "owns" prefix*1000+1 through prefix*1000+9999
 *   = 9,999 tickets per color per tier before rollover
 *
 * Collision warning threshold:
 *   (pack_count × tickets_per_color) > 9999 → warn, suggest 7-digit mode
 */

import crypto from 'crypto';

export const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
export const MIN_GAP = 7;
const SEED_MIN = 1;   // 01
const SEED_MAX = 99;  // 99

/**
 * Generate a cryptographically secure random integer in [min, max] inclusive.
 */
function secureRandInt(min, max) {
  const range = max - min + 1;
  const MAX_UINT32 = 0xFFFFFFFF;
  const limit = MAX_UINT32 - ((MAX_UINT32 % range) + 1) % range;
  let value;
  do {
    const bytes = crypto.randomBytes(4);
    value = bytes.readUInt32BE(0);
  } while (value > limit);
  return min + (value % range);
}

/**
 * Fisher-Yates shuffle using crypto randomness.
 */
function secureShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Check if a candidate seed is at least MIN_GAP away from all assigned seeds.
 */
function hasMinGap(candidate, assigned) {
  return assigned.every(s => Math.abs(candidate - s) >= MIN_GAP);
}

/**
 * Generate prefix assignments for a full tournament configuration.
 *
 * @param {Array<{id, name, ticket_count, price}>} packTiers - configured pack tiers
 * @param {number} digitMode - 6 or 7 (ticket number digit count)
 * @returns {Object} prefixMap: { colorName: { tierName: { seed, prefix, startTicket } } }
 */
export function generatePrefixes(packTiers, digitMode = 6) {
  const sequenceDigits = digitMode - 3; // 3 for prefix digits
  const maxSequence = Math.pow(10, sequenceDigits) - 1; // 999 or 9999

  const prefixMap = {};

  for (const color of COLORS) {
    prefixMap[color] = {};
    const assigned = [];

    // Shuffle tier order so no size→prefix correlation exists
    const shuffledTiers = secureShuffle(packTiers);

    for (const tier of shuffledTiers) {
      // Find all candidate seeds with sufficient gap from already-assigned seeds
      const candidates = [];
      for (let s = SEED_MIN; s <= SEED_MAX; s++) {
        if (hasMinGap(s, assigned)) {
          candidates.push(s);
        }
      }

      if (candidates.length === 0) {
        // Fallback: relax gap constraint if we run out of candidates
        // (only possible with many tiers — 14+ would exhaust 99 slots with gap=7)
        for (let s = SEED_MIN; s <= SEED_MAX; s++) {
          if (!assigned.includes(s)) candidates.push(s);
        }
      }

      // Pick a random candidate
      const seed = candidates[secureRandInt(0, candidates.length - 1)];
      assigned.push(seed);

      const seedStr = seed.toString().padStart(2, '0');
      const prefix = seedStr + '0'; // e.g., '390'
      const startNumber = parseInt(prefix) * 1000 + 1; // e.g., 390001

      prefixMap[color][tier.id] = {
        seed,
        prefix,
        startNumber,
        maxSequence,
      };
    }
  }

  return prefixMap;
}

/**
 * Calculate the ticket number range for a specific pack within a tier+color.
 *
 * @param {number} startNumber - base start (e.g., 390001)
 * @param {number} packIndex - 0-based index of this pack within the tier
 * @param {number} ticketsPerColor - tickets per color per pack
 * @returns {{ start: number, end: number }}
 */
export function getPackColorRange(startNumber, packIndex, ticketsPerColor) {
  const start = startNumber + (packIndex * ticketsPerColor);
  const end = start + ticketsPerColor - 1;
  return { start, end };
}

/**
 * Format a ticket number with color for display.
 * e.g., { number: 390047, color: 'Purple' } → '390047'
 */
export function formatTicketNumber(number, digitMode = 6) {
  return number.toString().padStart(digitMode, '0');
}

/**
 * Check if a tournament configuration will cause ticket number overflow.
 *
 * @param {Array} packTiers
 * @param {Object} packCounts - { tierId: count }
 * @param {number} digitMode
 * @returns {Array<{tier, color, packCount, ticketsUsed, maxTickets, overflow: bool}>}
 */
export function checkCollisionRisk(packTiers, packCounts, digitMode = 6) {
  // Each 2-digit seed owns 10,000 tickets (e.g. seed 39 → 390000–399999)
  // Overflow only if ticketsPerColor > 9,999 (crosses into next seed range)
  const maxSequence = 9999;

  return packTiers.map(tier => {
    const count = packCounts[tier.id] || 0;
    const ticketsPerColor = tier.ticket_count / 6;
    const ticketsUsed = count * ticketsPerColor;
    const overflow = ticketsUsed > maxSequence;
    return {
      tier: tier.name,
      tierId: tier.id,
      packCount: count,
      ticketsPerColor,
      ticketsUsed,
      maxTickets: maxSequence,
      overflow,
      utilizationPct: Math.round((ticketsUsed / maxSequence) * 100),
    };
  });
}

/**
 * Given a drawn ticket number and the tournament's prefix map + sold packs,
 * determine which pack it belongs to and which color.
 *
 * @param {number} drawnNumber
 * @param {Array} soldPacks - array of pack records from DB
 * @returns {{ pack, color } | null}
 */
export function identifyTicket(drawnNumber, soldPacks) {
  for (const pack of soldPacks) {
    const ranges = JSON.parse(pack.color_ranges);
    for (const [color, range] of Object.entries(ranges)) {
      if (drawnNumber >= range.start && drawnNumber <= range.end) {
        return { pack, color };
      }
    }
  }
  return null;
}


