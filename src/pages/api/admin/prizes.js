import { query } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';

export default async function handler(req, res) {
  const { tournamentId } = req.query;

  if (req.method === 'GET') {
    const { session: sessionFilter } = req.query;
    let sql = `SELECT * FROM prizes WHERE tournament_id=$1`;
    const params = [tournamentId];
    if (sessionFilter) {
      sql += ` AND session_label=$${params.length+1}`;
      params.push(sessionFilter);
    }
    sql += ' ORDER BY sequence_order, id';
    const { rows } = await query(sql, params);
    return res.json(rows);
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === 'POST') {
    const { name, prize_type, value_display, description, donor, session_label, sequence_order } = req.body;
    const { rows } = await query(
      `INSERT INTO prizes
         (tournament_id, name, prize_type, value_display, description, donor, session_label, sequence_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tournamentId, name, prize_type||'cash', value_display||null,
       description||null, donor||null, session_label||'Tournament',
       sequence_order || 0]
    );
    return res.json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id, name, prize_type, value_display, description, donor,
            session_label, sequence_order, status } = req.body;

    if (req.body.action === 'reorder') {
      // Bulk reorder: [{id, sequence_order}, ...]
      const { items } = req.body;
      for (const item of items) {
        await query(
          'UPDATE prizes SET sequence_order=$1 WHERE id=$2 AND tournament_id=$3',
          [item.sequence_order, item.id, tournamentId]
        );
      }
      return res.json({ ok: true });
    }

    const { rows } = await query(
      `UPDATE prizes SET
         name=$1, prize_type=$2, value_display=$3, description=$4,
         donor=$5, session_label=$6, sequence_order=$7,
         status=COALESCE($8, status)
       WHERE id=$9 AND tournament_id=$10 RETURNING *`,
      [name, prize_type, value_display||null, description||null,
       donor||null, session_label, sequence_order||0,
       status||null, id, tournamentId]
    );
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    await query(
      'DELETE FROM prizes WHERE id=$1 AND tournament_id=$2',
      [id, tournamentId]
    );
    return res.json({ ok: true });
  }

  res.status(405).end();
}
