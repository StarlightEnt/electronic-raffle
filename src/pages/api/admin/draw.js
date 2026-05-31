import { query, getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';
import { drawTicket } from '../../../utils/drawEngine';

export default async function handler(req, res) {
  const { tournamentId } = req.query;

  // ── GET: draw state (current prize, pool size, history) ─────────────
  if (req.method === 'GET') {
    const [prizesRes, drawsRes, discardedRes, poolRes] = await Promise.all([
      query(
        `SELECT * FROM prizes WHERE tournament_id=$1 AND status='pending'
         ORDER BY sequence_order LIMIT 1`,
        [tournamentId]
      ),
      query(
        `SELECT d.*, pr.prize_type
         FROM draws d
         LEFT JOIN prizes pr ON d.prize_id = pr.id
         WHERE d.tournament_id=$1
         ORDER BY d.drawn_at DESC LIMIT 50`,
        [tournamentId]
      ),
      query(
        'SELECT COUNT(*) as cnt FROM discarded_numbers WHERE tournament_id=$1',
        [tournamentId]
      ),
      query(
        `SELECT SUM(
           (color_ranges->'Red'->>'end')::int - (color_ranges->'Red'->>'start')::int + 1 +
           (color_ranges->'Orange'->>'end')::int - (color_ranges->'Orange'->>'start')::int + 1 +
           (color_ranges->'Yellow'->>'end')::int - (color_ranges->'Yellow'->>'start')::int + 1 +
           (color_ranges->'Green'->>'end')::int - (color_ranges->'Green'->>'start')::int + 1 +
           (color_ranges->'Blue'->>'end')::int - (color_ranges->'Blue'->>'start')::int + 1 +
           (color_ranges->'Purple'->>'end')::int - (color_ranges->'Purple'->>'start')::int + 1
         ) as total_tickets
         FROM packs WHERE tournament_id=$1 AND sold=true`,
        [tournamentId]
      ),
    ]);

    const totalTickets = parseInt(poolRes.rows[0]?.total_tickets || 0);
    const discardedCount = parseInt(discardedRes.rows[0]?.cnt || 0);

    return res.json({
      nextPrize: prizesRes.rows[0] || null,
      recentDraws: drawsRes.rows,
      totalTickets,
      remainingTickets: totalTickets - discardedCount,
      discardedCount,
    });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const db = getDb();

  // ── POST: perform a draw ─────────────────────────────────────────────
  if (req.method === 'POST' && req.body.action === 'draw') {
    const { prizeId, attemptNumber } = req.body;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Get sold packs
      const { rows: soldPacks } = await client.query(
        'SELECT * FROM packs WHERE tournament_id=$1 AND sold=true',
        [tournamentId]
      );
      if (soldPacks.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No sold packs in pool' });
      }

      // Get discarded numbers
      const { rows: discardedRows } = await client.query(
        'SELECT ticket_number, ticket_color FROM discarded_numbers WHERE tournament_id=$1',
        [tournamentId]
      );
      const discardedNumbers = new Set(discardedRows.map(r => r.ticket_number));

      // Perform the draw
      let result;
      try {
        result = drawTicket(soldPacks, discardedNumbers);
      } catch (e) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: e.message });
      }

      // Get prize info
      let prize = null;
      if (prizeId) {
        const { rows } = await client.query(
          'SELECT * FROM prizes WHERE id=$1', [prizeId]
        );
        prize = rows[0] || null;
      }

      // Record the draw
      const { rows: [draw] } = await client.query(
        `INSERT INTO draws
           (tournament_id, prize_id, prize_name, ticket_number, ticket_color,
            pack_serial, buyer_name, buyer_pid, total_in_pool, attempt_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          tournamentId,
          prizeId || null,
          prize?.name || 'General Draw',
          result.ticketNumber,
          result.color,
          result.packSerial,
          result.buyerName,
          result.buyerPid || null,
          result.totalInPool,
          attemptNumber || 1,
        ]
      );

      // Permanently discard the drawn number
      await client.query(
        `INSERT INTO discarded_numbers (tournament_id, ticket_number, ticket_color)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [tournamentId, result.ticketNumber, result.color]
      );

      await client.query('COMMIT');
      res.json({ ok: true, draw, result, prize });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Draw error:', err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
    return;
  }

  // ── POST: skip a prize ───────────────────────────────────────────────
  if (req.method === 'POST' && req.body.action === 'skip') {
    const { prizeId } = req.body;
    await query(
      `UPDATE prizes SET status='skipped' WHERE id=$1 AND tournament_id=$2`,
      [prizeId, tournamentId]
    );
    return res.json({ ok: true });
  }

  // ── POST: mark prize as claimed/drawn ────────────────────────────────
  if (req.method === 'POST' && req.body.action === 'claim') {
    const { prizeId, drawId } = req.body;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE prizes SET status='drawn' WHERE id=$1 AND tournament_id=$2`,
        [prizeId, tournamentId]
      );
      if (drawId) {
        await client.query(
          'UPDATE draws SET claimed=true WHERE id=$1', [drawId]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
    return;
  }

  res.status(405).end();
}
