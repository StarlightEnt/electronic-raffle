import { query } from '../../../utils/db';
import { requireAdmin } from '../../../utils/session';
import { generateTrackerCard, generateBulkTrackerPDF } from '../../../utils/cardGenerator';
import { sendTrackerCard } from '../../../utils/email';

export const config = { api: { bodyParser: { sizeLimit: '10mb' }, responseLimit: false } };

export default async function handler(req, res) {
  const { tournamentId } = req.query;

  const session = await requireAdmin(req, res);
  if (!session) return;

  // Get tournament + logo for card generation
  const { rows: [tournament] } = await query(
    'SELECT * FROM tournament_settings WHERE id=$1', [tournamentId]
  );
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  // Fetch logo buffer if configured
  let logoBuffer = null;
  if (tournament.logo_url) {
    try {
      const logoRes = await fetch(tournament.logo_url);
      if (logoRes.ok) {
        logoBuffer = Buffer.from(await logoRes.arrayBuffer());
      }
    } catch (e) {
      console.warn('Could not load logo:', e.message);
    }
  }

  // ── Single card by pack ID ───────────────────────────────────────────
  if (req.method === 'GET' && req.query.packId) {
    const { rows: [pack] } = await query(
      `SELECT p.*, pt.name as tier_name, pt.ticket_count, pt.price
       FROM packs p JOIN pack_tiers pt ON p.tier_id=pt.id
       WHERE p.id=$1 AND p.tournament_id=$2`,
      [req.query.packId, tournamentId]
    );
    if (!pack) return res.status(404).json({ error: 'Pack not found' });

    const pdfBuffer = await generateTrackerCard({
      serial: pack.serial,
      tierName: pack.tier_name,
      price: pack.price,
      tournamentName: tournament.name + (tournament.year ? ` ${tournament.year}` : ''),
      colorRanges: typeof pack.color_ranges === 'string'
        ? JSON.parse(pack.color_ranges) : pack.color_ranges,
      logoBuffer,
      primaryColor: tournament.primary_color,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Tracker-${pack.serial.replace(' ','-')}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  }

  // ── Bulk PDF for all packs in a tier (or all tiers) ──────────────────
  if (req.method === 'GET' && req.query.action === 'bulk') {
    const { tierId } = req.query;
    let sql = `
      SELECT p.*, pt.name as tier_name, pt.ticket_count, pt.price
      FROM packs p JOIN pack_tiers pt ON p.tier_id=pt.id
      WHERE p.tournament_id=$1
    `;
    const params = [tournamentId];
    if (tierId) { sql += ' AND p.tier_id=$2'; params.push(tierId); }
    sql += ' ORDER BY pt.sort_order, p.serial';

    const { rows: packs } = await query(sql, params);
    if (packs.length === 0) return res.status(404).json({ error: 'No packs found' });

    const pdfBuffer = await generateBulkTrackerPDF(packs, {
      tournamentName: tournament.name + (tournament.year ? ` ${tournament.year}` : ''),
      logoBuffer,
      primaryColor: tournament.primary_color,
    });

    const filename = tierId ? `Trackers-Tier${tierId}.pdf` : 'Trackers-All.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  }

  // ── Email a card to a buyer ───────────────────────────────────────────
  if (req.method === 'POST' && req.body.action === 'email') {
    const { packId } = req.body;

    const { rows: [pack] } = await query(
      `SELECT p.*, pt.name as tier_name, pt.ticket_count, pt.price
       FROM packs p JOIN pack_tiers pt ON p.tier_id=pt.id
       WHERE p.id=$1 AND p.tournament_id=$2`,
      [packId, tournamentId]
    );
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
    if (!pack.buyer_email) return res.status(400).json({ error: 'No email on file for this buyer' });

    const pdfBuffer = await generateTrackerCard({
      serial: pack.serial,
      tierName: pack.tier_name,
      price: pack.price,
      tournamentName: tournament.name + (tournament.year ? ` ${tournament.year}` : ''),
      colorRanges: typeof pack.color_ranges === 'string'
        ? JSON.parse(pack.color_ranges) : pack.color_ranges,
      logoBuffer,
      primaryColor: tournament.primary_color,
    });

    const emailResult = await sendTrackerCard(
      pack.buyer_email,
      pack.buyer_name,
      pdfBuffer,
      pack.serial
    );

    if (emailResult.ok) {
      await query(
        'UPDATE packs SET card_emailed=true, card_emailed_at=NOW() WHERE id=$1',
        [packId]
      );
    }

    return res.json(emailResult);
  }

  res.status(405).end();
}
