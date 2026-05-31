import { query } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { rows } = await query(
      'SELECT * FROM tournament_settings ORDER BY year DESC, id DESC'
    );
    return res.json(rows);
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === 'POST') {
    const { name, year, location, date_start, date_end, logo_url, primary_color, digit_mode } = req.body;
    const { rows } = await query(
      `INSERT INTO tournament_settings
         (name, year, location, date_start, date_end, logo_url, primary_color, digit_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, year, location||null, date_start||null, date_end||null,
       logo_url||null, primary_color||'#f59e0b', digit_mode||6]
    );
    return res.json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id, name, year, location, date_start, date_end, logo_url,
            primary_color, digit_mode, sales_open, draw_active } = req.body;
    const { rows } = await query(
      `UPDATE tournament_settings SET
         name=$1, year=$2, location=$3, date_start=$4, date_end=$5,
         logo_url=$6, primary_color=$7, digit_mode=$8,
         sales_open=COALESCE($9, sales_open),
         draw_active=COALESCE($10, draw_active),
         updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [name, year, location||null, date_start||null, date_end||null,
       logo_url||null, primary_color||'#f59e0b', digit_mode||6,
       sales_open ?? null, draw_active ?? null, id]
    );
    return res.json(rows[0]);
  }

  res.status(405).end();
}
