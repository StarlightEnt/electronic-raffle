import { query, getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';

export default async function handler(req, res) {
  const { tournamentId } = req.query;

  const session = await requireAdmin(req, res);
  if (!session) return;

  // ── Sell one or more packs to a buyer ───────────────────────────────
  if (req.method === 'POST' && req.body.action === 'sell') {
    const { buyerName, buyerPid, buyerEmail, buyerPhone, tierId, quantity, source } = req.body;

    if (!buyerName) return res.status(400).json({ error: 'buyerName required' });
    if (!tierId) return res.status(400).json({ error: 'tierId required' });

    // Check sales are open
    const { rows: [t] } = await query(
      'SELECT sales_open FROM tournament_settings WHERE id=$1', [tournamentId]
    );
    if (!t?.sales_open && source !== 'preregistration') {
      return res.status(400).json({ error: 'Sales are currently closed' });
    }

    const qty = parseInt(quantity) || 1;
    const db = getDb();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Get next available unsold packs for this tier
      const { rows: availablePacks } = await client.query(
        `SELECT * FROM packs
         WHERE tournament_id=$1 AND tier_id=$2 AND sold=false
         ORDER BY serial
         LIMIT $3
         FOR UPDATE SKIP LOCKED`,
        [tournamentId, tierId, qty]
      );

      if (availablePacks.length < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Only ${availablePacks.length} packs available for this tier`
        });
      }

      // Mark packs as sold
      const soldPacks = [];
      for (const pack of availablePacks) {
        const { rows: [updated] } = await client.query(
          `UPDATE packs SET
             sold=true, buyer_name=$1, buyer_pid=$2,
             buyer_email=$3, buyer_phone=$4,
             sale_source=$5, sold_at=NOW()
           WHERE id=$6 RETURNING *`,
          [buyerName, buyerPid||null, buyerEmail||null,
           buyerPhone||null, source||'pos', pack.id]
        );
        soldPacks.push(updated);
      }

      // Upsert buyer record
      if (buyerPid) {
        await client.query(
          `INSERT INTO buyers (tournament_id, pid, name, email, phone, source)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING`,
          [tournamentId, buyerPid, buyerName, buyerEmail||null, buyerPhone||null, source||'pos']
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, packs: soldPacks });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Sale error:', err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
    return;
  }

  // ── Void a sale (unsell a pack) ─────────────────────────────────────
  if (req.method === 'POST' && req.body.action === 'void') {
    const { packId } = req.body;

    // Cannot void if draws have started
    const { rows: [t] } = await query(
      'SELECT draw_active FROM tournament_settings WHERE id=$1', [tournamentId]
    );
    if (t?.draw_active) {
      return res.status(400).json({ error: 'Cannot void sales after drawing has begun' });
    }

    const { rows } = await query(
      `UPDATE packs SET
         sold=false, buyer_name=null, buyer_pid=null,
         buyer_email=null, buyer_phone=null,
         sale_source=null, sold_at=null
       WHERE id=$1 AND tournament_id=$2 RETURNING *`,
      [packId, tournamentId]
    );
    return res.json({ ok: true, pack: rows[0] });
  }

  // ── Buyer lookup (typeahead) ─────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'lookup') {
    const { q } = req.query;
    const { rows } = await query(
      `SELECT DISTINCT buyer_name as name, buyer_pid as pid,
              buyer_email as email, buyer_phone as phone
       FROM packs
       WHERE tournament_id=$1 AND sold=true
         AND (buyer_name ILIKE $2 OR buyer_pid ILIKE $2)
       UNION
       SELECT name, pid, email, phone FROM buyers
       WHERE tournament_id=$1
         AND (name ILIKE $2 OR pid ILIKE $2)
       ORDER BY name LIMIT 10`,
      [tournamentId, `%${q}%`]
    );
    return res.json(rows);
  }

  // ── Sales summary ────────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'summary') {
    const { rows } = await query(
      `SELECT pt.name as tier_name, pt.price, pt.ticket_count,
              COUNT(*) as total_packs,
              COUNT(*) FILTER (WHERE p.sold=true) as sold_packs,
              COUNT(*) FILTER (WHERE p.sold=false) as available_packs,
              SUM(pt.price) FILTER (WHERE p.sold=true) as revenue
       FROM packs p
       JOIN pack_tiers pt ON p.tier_id = pt.id
       WHERE p.tournament_id=$1
       GROUP BY pt.id, pt.name, pt.price, pt.ticket_count, pt.sort_order
       ORDER BY pt.sort_order`,
      [tournamentId]
    );
    return res.json(rows);
  }

  res.status(405).end();
}
