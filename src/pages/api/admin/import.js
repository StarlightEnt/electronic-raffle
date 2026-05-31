import { query, getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';
import { parse } from 'csv-parse/sync';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

/**
 * Expected CSV format from SFGGC portal:
 * PID,First Name,Last Name,Email,Phone,30-Pack Qty,120-Pack Qty,300-Pack Qty,750-Pack Qty
 *
 * Also accepts the existing bowler roster format (Name,Average) with no pre-buys.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await requireAdmin(req, res);
  if (!session) return;

  const { tournamentId, csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv required' });

  let records;
  try {
    records = parse(csv, { skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV: ' + e.message });
  }

  if (records.length === 0) return res.json({ imported: 0, skipped: 0, preBuysAssigned: 0 });

  // Detect format by header
  const header = records[0].map(h => h.toLowerCase());
  const hasPid = header.includes('pid') || header[0] === 'pid';
  const hasPreBuys = header.some(h => h.includes('pack'));
  const dataRows = hasPid ? records.slice(1) : records;

  // Get pack tiers for pre-buy assignment
  const { rows: tiers } = await query(
    'SELECT * FROM pack_tiers WHERE tournament_id=$1 AND active=true ORDER BY sort_order',
    [tournamentId]
  );

  const db = getDb();
  const client = await db.connect();

  let imported = 0, skipped = 0, preBuysAssigned = 0;

  try {
    await client.query('BEGIN');

    for (const row of dataRows) {
      if (!row[0]) { skipped++; continue; }

      let pid, firstName, lastName, email, phone, preBuys = {};

      if (hasPid && row.length >= 3) {
        // Full portal format: PID, First, Last, Email, Phone, [pack qtys...]
        pid = row[0];
        firstName = row[1];
        lastName = row[2];
        email = row[3] || null;
        phone = row[4] || null;

        if (hasPreBuys) {
          // Map pack quantities to tier IDs by matching ticket_count
          // CSV columns 5+ are pack quantities in tier sort order
          const tierCols = header.slice(5);
          tierCols.forEach((col, idx) => {
            const tierMatch = tiers.find(t =>
              col.includes(t.ticket_count.toString()) ||
              col.includes(t.name.toLowerCase())
            );
            if (tierMatch && row[5 + idx]) {
              const qty = parseInt(row[5 + idx]);
              if (qty > 0) preBuys[tierMatch.id] = qty;
            }
          });
        }
      } else {
        // Simple format: Name (or First Last), optional average
        const fullName = row[0];
        firstName = fullName.split(' ')[0];
        lastName = fullName.split(' ').slice(1).join(' ');
        pid = row[1] && !isNaN(row[1]) ? null : row[1]; // skip if numeric (average)
      }

      const name = [firstName, lastName].filter(Boolean).join(' ');
      if (!name) { skipped++; continue; }

      // Upsert buyer
      await client.query(
        `INSERT INTO buyers (tournament_id, pid, name, email, phone, source)
         VALUES ($1,$2,$3,$4,$5,'import')
         ON CONFLICT DO NOTHING`,
        [tournamentId, pid||null, name, email, phone]
      );
      imported++;

      // Assign pre-bought packs
      for (const [tierId, qty] of Object.entries(preBuys)) {
        const { rows: availablePacks } = await client.query(
          `SELECT * FROM packs
           WHERE tournament_id=$1 AND tier_id=$2 AND sold=false
           ORDER BY serial LIMIT $3 FOR UPDATE SKIP LOCKED`,
          [tournamentId, tierId, qty]
        );

        for (const pack of availablePacks) {
          await client.query(
            `UPDATE packs SET sold=true, buyer_name=$1, buyer_pid=$2,
               buyer_email=$3, buyer_phone=$4,
               sale_source='preregistration', sold_at=NOW()
             WHERE id=$5`,
            [name, pid||null, email||null, phone||null, pack.id]
          );
          preBuysAssigned++;
        }
      }
    }

    // Log the import
    await client.query(
      `INSERT INTO import_log
         (tournament_id, imported_count, skipped_count, pre_buys_assigned)
       VALUES ($1,$2,$3,$4)`,
      [tournamentId, imported, skipped, preBuysAssigned]
    );

    await client.query('COMMIT');
    res.json({ ok: true, imported, skipped, preBuysAssigned });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
