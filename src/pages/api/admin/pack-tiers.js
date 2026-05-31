import { query } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';

export default async function handler(req, res) {
  const { tournamentId } = req.query;

  if (req.method === 'GET') {
    const { rows } = await query(
      'SELECT * FROM pack_tiers WHERE tournament_id=$1 ORDER BY sort_order, price',
      [tournamentId]
    );
    return res.json(rows);
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === 'POST') {
    const { name, ticket_count, price, pack_quantity, sort_order } = req.body;
    if (ticket_count % 6 !== 0) {
      return res.status(400).json({ error: 'ticket_count must be a multiple of 6' });
    }
    const { rows } = await query(
      `INSERT INTO pack_tiers (tournament_id, name, ticket_count, price, pack_quantity, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tournamentId, name, ticket_count, price, pack_quantity || 50, sort_order || 0]
    );
    return res.json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id, name, ticket_count, price, pack_quantity, sort_order, active } = req.body;
    if (ticket_count % 6 !== 0) {
      return res.status(400).json({ error: 'ticket_count must be a multiple of 6' });
    }
    const { rows } = await query(
      `UPDATE pack_tiers SET name=$1, ticket_count=$2, price=$3,
         pack_quantity=$4, sort_order=$5, active=$6
       WHERE id=$7 AND tournament_id=$8 RETURNING *`,
      [name, ticket_count, price, pack_quantity, sort_order||0, active!==false, id, tournamentId]
    );
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    // Check no packs sold for this tier
    const { rows: sold } = await query(
      'SELECT COUNT(*) as cnt FROM packs WHERE tier_id=$1 AND sold=true',
      [id]
    );
    if (parseInt(sold[0].cnt) > 0) {
      return res.status(400).json({ error: 'Cannot delete tier with sold packs' });
    }
    await query('DELETE FROM pack_tiers WHERE id=$1 AND tournament_id=$2', [id, tournamentId]);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
