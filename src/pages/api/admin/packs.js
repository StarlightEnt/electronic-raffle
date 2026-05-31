import { query, getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';
import {
  generatePrefixes,
  getPackColorRange,
  checkCollisionRisk,
  COLORS,
} from '../../../utils/prefixGen';

export default async function handler(req, res) {
  const { tournamentId } = req.query;

  if (req.method === 'GET') {
    const { tier, soldOnly, unsoldOnly } = req.query;
    let sql = `
      SELECT p.*, pt.name as tier_name, pt.ticket_count, pt.price
      FROM packs p
      JOIN pack_tiers pt ON p.tier_id = pt.id
      WHERE p.tournament_id=$1
    `;
    const params = [tournamentId];
    if (tier) { sql += ` AND p.tier_id=$${params.length+1}`; params.push(tier); }
    if (soldOnly === 'true') sql += ' AND p.sold=true';
    if (unsoldOnly === 'true') sql += ' AND p.sold=false';
    sql += ' ORDER BY pt.sort_order, p.serial';

    const { rows } = await query(sql, params);
    return res.json(rows);
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  // ── Generate full pack inventory for tournament ──────────────────────
  if (req.method === 'POST' && req.body.action === 'generate') {
    const db = getDb();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Get tournament settings
      const { rows: [tournament] } = await client.query(
        'SELECT * FROM tournament_settings WHERE id=$1', [tournamentId]
      );
      if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

      // Check no packs already generated
      const { rows: existing } = await client.query(
        'SELECT COUNT(*) as cnt FROM packs WHERE tournament_id=$1', [tournamentId]
      );
      if (parseInt(existing[0].cnt) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Packs already generated. Reset inventory first.'
        });
      }

      // Get pack tiers
      const { rows: tiers } = await client.query(
        'SELECT * FROM pack_tiers WHERE tournament_id=$1 AND active=true ORDER BY sort_order',
        [tournamentId]
      );
      if (tiers.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No active pack tiers configured' });
      }

      // Check collision risk first
      const packCounts = {};
      tiers.forEach(t => { packCounts[t.id] = t.pack_quantity; });
      const risks = checkCollisionRisk(tiers, packCounts, tournament.digit_mode);
      const overflows = risks.filter(r => r.overflow);
      if (overflows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Ticket number overflow detected',
          overflows,
          suggestion: 'Switch to 7-digit mode or reduce pack quantities',
        });
      }

      // Generate color prefixes
      const prefixMap = generatePrefixes(tiers, tournament.digit_mode);

      // Store prefix assignments
      for (const color of COLORS) {
        for (const tier of tiers) {
          const assignment = prefixMap[color][tier.id];
          await client.query(
            `INSERT INTO color_prefixes
               (tournament_id, tier_id, color, seed, prefix, start_number)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (tournament_id, tier_id, color) DO UPDATE
               SET seed=$4, prefix=$5, start_number=$6`,
            [tournamentId, tier.id, color,
             assignment.seed, assignment.prefix, assignment.startNumber]
          );
        }
      }

      // Generate pack records
      let totalGenerated = 0;
      for (const tier of tiers) {
        const ticketsPerColor = tier.ticket_count / 6;
        // Format serial prefix from ticket count
        // e.g., 30-ticket pack → '030', 120 → '120', 750 → '750'
        const serialPrefix = tier.ticket_count.toString().padStart(3, '0');

        for (let i = 0; i < tier.pack_quantity; i++) {
          const packNum = (1001 + i).toString(); // 1001, 1002, ...
          const serial = `${serialPrefix} ${packNum}`;

          // Build color ranges for this pack
          const colorRanges = {};
          for (const color of COLORS) {
            const assignment = prefixMap[color][tier.id];
            const range = getPackColorRange(assignment.startNumber, i, ticketsPerColor);
            colorRanges[color] = range;
          }

          await client.query(
            `INSERT INTO packs
               (tournament_id, tier_id, serial, pack_index, color_ranges)
             VALUES ($1,$2,$3,$4,$5)`,
            [tournamentId, tier.id, serial, i, JSON.stringify(colorRanges)]
          );
          totalGenerated++;
        }
      }

      await client.query('COMMIT');
      res.json({
        ok: true,
        generated: totalGenerated,
        tiers: tiers.length,
        collisionRisk: risks,
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Pack generation error:', err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
    return;
  }

  // ── Reset all unsold packs (destructive) ────────────────────────────
  if (req.method === 'DELETE' && req.body?.action === 'reset') {
    const { rows: sold } = await query(
      'SELECT COUNT(*) as cnt FROM packs WHERE tournament_id=$1 AND sold=true',
      [tournamentId]
    );
    if (parseInt(sold[0].cnt) > 0) {
      return res.status(400).json({
        error: `Cannot reset: ${sold[0].cnt} packs already sold. Sold packs cannot be deleted.`
      });
    }
    await query('DELETE FROM packs WHERE tournament_id=$1', [tournamentId]);
    await query('DELETE FROM color_prefixes WHERE tournament_id=$1', [tournamentId]);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
