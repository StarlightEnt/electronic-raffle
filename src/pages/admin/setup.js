import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';

const DEFAULT_TIERS = [
  { name: '30 Tickets', ticket_count: 30, price: 5, pack_quantity: 30 },
  { name: '120 Tickets', ticket_count: 120, price: 20, pack_quantity: 75 },
  { name: '300 Tickets', ticket_count: 300, price: 50, pack_quantity: 25 },
  { name: '750 Tickets', ticket_count: 750, price: 100, pack_quantity: 15 },
];

export default function Setup() {
  const router = useRouter();
  const { t: tournamentId } = router.query;

  const [tournament, setTournament] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [collisionRisk, setCollisionRisk] = useState([]);
  const [newTier, setNewTier] = useState({ name: '', ticket_count: 120, price: 20, pack_quantity: 50 });
  const [showAddTier, setShowAddTier] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [settingsForm, setSettingsForm] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { if (tournamentId) load(); }, [tournamentId]);

  async function load() {
    setLoading(true);
    try {
      const [tRes, tierRes, packRes] = await Promise.all([
        fetch('/api/admin/tournament'),
        fetch(`/api/admin/pack-tiers?tournamentId=${tournamentId}`),
        fetch(`/api/admin/packs?tournamentId=${tournamentId}`),
      ]);
      const [ts, tierData, packData] = await Promise.all([tRes.json(), tierRes.json(), packRes.json()]);
      const t = ts.find(x => String(x.id) === String(tournamentId));
      if (!t) { router.push('/admin/login'); return; }
      setTournament(t);
      setSettingsForm(t);
      setTiers(tierData);
      setPacks(packData);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    const res = await fetch('/api/admin/tournament', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settingsForm, id: tournamentId }),
    });
    if (res.ok) { setMsg({ type: 'ok', text: 'Settings saved.' }); load(); }
    setSavingSettings(false);
  }

  async function generateInventory() {
    if (!confirm('Generate pack inventory? This will create all ticket number ranges based on current tier configuration.')) return;
    setGenerating(true);
    setMsg(null);
    const res = await fetch(`/api/admin/packs?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ type: 'ok', text: `✓ Generated ${data.generated} packs across ${data.tiers} tiers.` });
      setCollisionRisk(data.collisionRisk || []);
      load();
    } else if (data.overflows) {
      setCollisionRisk(data.overflows);
      setMsg({ type: 'error', text: data.error });
    } else {
      setMsg({ type: 'error', text: data.error });
    }
    setGenerating(false);
  }

  async function resetInventory() {
    if (!confirm('RESET all unsold packs and regenerate prefix assignments? This cannot be undone.')) return;
    setResetting(true);
    const res = await fetch(`/api/admin/packs?tournamentId=${tournamentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    });
    const data = await res.json();
    if (res.ok) { setMsg({ type: 'ok', text: 'Inventory reset.' }); load(); }
    else setMsg({ type: 'error', text: data.error });
    setResetting(false);
  }

  async function addTier(e) {
    e.preventDefault();
    if (newTier.ticket_count % 6 !== 0) {
      setMsg({ type: 'error', text: 'Ticket count must be a multiple of 6.' });
      return;
    }
    const res = await fetch(`/api/admin/pack-tiers?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTier, sort_order: tiers.length + 1 }),
    });
    if (res.ok) { setShowAddTier(false); load(); }
    else { const d = await res.json(); setMsg({ type: 'error', text: d.error }); }
  }

  async function deleteTier(id) {
    if (!confirm('Remove this pack tier?')) return;
    const res = await fetch(`/api/admin/pack-tiers?tournamentId=${tournamentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) load();
    else { const d = await res.json(); setMsg({ type: 'error', text: d.error }); }
  }

  async function doImport() {
    if (!importCsv.trim()) return;
    setImporting(true);
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, csv: importCsv }),
    });
    const data = await res.json();
    setImportResult(data);
    setImporting(false);
  }

  async function toggleSales(val) {
    await fetch('/api/admin/tournament', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tournament, id: tournamentId, sales_open: val }),
    });
    load();
  }

  const totalPacks = packs.length;
  const soldPacks = packs.filter(p => p.sold).length;
  const packsGenerated = totalPacks > 0;

  // Compute collision risk warnings
  const warnings = tiers.map(tier => {
    const ticketsPerColor = tier.ticket_count / 6;
    const maxTickets = 9999; // seed owns 390000–399999 = 10,000 tickets; overflow at 9,999
    const used = tier.pack_quantity * ticketsPerColor;
    const pct = Math.round((used / maxTickets) * 100);
    return { tier, used, maxTickets, pct, overflow: used > maxTickets };
  });

  if (loading) return <><Nav /><div className="page"><p style={{color:'var(--muted)'}}>Loading…</p></div></>;

  return (
    <>
      <Head><title>Setup — {tournament?.name}</title></Head>
      <Nav tournamentId={tournamentId} tournamentName={tournament?.name} salesOpen={tournament?.sales_open} />
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">TOURNAMENT SETUP</h1>
            <p className="page-subtitle">{tournament?.name}</p>
          </div>
        </div>

        {msg && (
          <div className={`alert alert-${msg.type === 'ok' ? 'ok' : 'error'} fade-in`} style={{ marginBottom: 20 }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Tournament Settings */}
          <div className="card">
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>SETTINGS</h2>
            <form onSubmit={saveSettings}>
              <div className="form-row">
                <div><label>Tournament Name</label>
                  <input value={settingsForm.name||''} onChange={e => setSettingsForm({...settingsForm, name: e.target.value})} /></div>
              </div>
              <div className="form-row form-row-2">
                <div><label>Year</label>
                  <input type="number" value={settingsForm.year||''} onChange={e => setSettingsForm({...settingsForm, year: parseInt(e.target.value)})} /></div>
                <div><label>Digit Mode</label>
                  <select value={settingsForm.digit_mode||6} onChange={e => setSettingsForm({...settingsForm, digit_mode: parseInt(e.target.value)})}
                    disabled={packsGenerated}>
                    <option value={6}>6-digit (standard)</option>
                    <option value={7}>7-digit (large events)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div><label>Location</label>
                  <input value={settingsForm.location||''} onChange={e => setSettingsForm({...settingsForm, location: e.target.value})} /></div>
              </div>
              <div className="form-row form-row-2">
                <div><label>Start Date</label>
                  <input type="date" value={settingsForm.date_start||''} onChange={e => setSettingsForm({...settingsForm, date_start: e.target.value})} /></div>
                <div><label>End Date</label>
                  <input type="date" value={settingsForm.date_end||''} onChange={e => setSettingsForm({...settingsForm, date_end: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div><label>Logo URL</label>
                  <input value={settingsForm.logo_url||''} onChange={e => setSettingsForm({...settingsForm, logo_url: e.target.value})} placeholder="https://..." /></div>
              </div>
              <div className="form-row">
                <div><label>Accent Color</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={settingsForm.primary_color||'#f59e0b'} onChange={e => setSettingsForm({...settingsForm, primary_color: e.target.value})} style={{ width: 44, flex: 'none' }} />
                    <input value={settingsForm.primary_color||'#f59e0b'} onChange={e => setSettingsForm({...settingsForm, primary_color: e.target.value})} />
                  </div>
                </div>
              </div>
              <button className="btn-primary btn-sm" type="submit" disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save Settings'}</button>
            </form>
          </div>

          {/* Sales Toggle + Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card">
              <h2 style={{ fontSize: 20, marginBottom: 14 }}>SALES CONTROL</h2>
              <div className="toggle-row">
                <div>
                  <div className="toggle-label">Sales Window</div>
                  <div className="toggle-desc">Open to accept pack purchases at POS</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={!!tournament?.sales_open}
                    onChange={e => toggleSales(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total Packs', val: totalPacks },
                  { label: 'Sold', val: soldPacks },
                  { label: 'Available', val: totalPacks - soldPacks },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontFamily: 'Bebas Neue', letterSpacing: '0.04em', color: 'var(--gold)' }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roster Import */}
            <div className="card">
              <h2 style={{ fontSize: 20, marginBottom: 10 }}>ROSTER IMPORT</h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
                CSV format: <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>PID,First,Last,Email,Phone,30-Qty,120-Qty,300-Qty,750-Qty</code>
              </p>
              <textarea value={importCsv} onChange={e => setImportCsv(e.target.value)}
                rows={4} placeholder="Paste CSV or use file upload…" style={{ marginBottom: 8 }} />
              {importResult && (
                <div className="alert alert-ok" style={{ marginBottom: 8, fontSize: 12 }}>
                  ✓ Imported {importResult.imported} buyers · {importResult.preBuysAssigned} pre-buys assigned · {importResult.skipped} skipped
                </div>
              )}
              <button className="btn-primary btn-sm" onClick={doImport} disabled={importing || !importCsv.trim()}>
                {importing ? 'Importing…' : 'Import Roster'}
              </button>
            </div>
          </div>
        </div>

        {/* Pack Tiers */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20 }}>PACK TIERS</h2>
            <button className="btn-secondary btn-sm" onClick={() => setShowAddTier(!showAddTier)}>+ Add Tier</button>
          </div>

          {showAddTier && (
            <form onSubmit={addTier} style={{ background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div className="form-row form-row-4">
                <div><label>Name</label>
                  <input value={newTier.name} onChange={e => setNewTier({...newTier, name: e.target.value})} placeholder="90 Tickets" required /></div>
                <div><label>Tickets (mult. of 6)</label>
                  <input type="number" min={6} step={6} value={newTier.ticket_count} onChange={e => setNewTier({...newTier, ticket_count: parseInt(e.target.value)})} required /></div>
                <div><label>Price ($)</label>
                  <input type="number" step="0.01" value={newTier.price} onChange={e => setNewTier({...newTier, price: parseFloat(e.target.value)})} required /></div>
                <div><label>Pack Qty</label>
                  <input type="number" min={1} value={newTier.pack_quantity} onChange={e => setNewTier({...newTier, pack_quantity: parseInt(e.target.value)})} required /></div>
              </div>
              <div className="form-actions">
                <button className="btn-primary btn-sm" type="submit">Add Tier</button>
                <button className="btn-ghost btn-sm" type="button" onClick={() => setShowAddTier(false)}>Cancel</button>
              </div>
            </form>
          )}

          {warnings.some(w => w.overflow) && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              ⚠ Overflow detected — reduce pack quantities or switch to 7-digit mode.
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>Pack Name</th>
                <th>Tickets / Pack</th>
                <th>Per Color</th>
                <th>Price</th>
                <th>Qty to Print</th>
                <th>Utilization</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(tier => {
                const w = warnings.find(x => x.tier.id === tier.id);
                return (
                  <tr key={tier.id}>
                    <td style={{ fontWeight: 500 }}>{tier.name}</td>
                    <td>{tier.ticket_count}</td>
                    <td style={{ color: 'var(--muted)' }}>{tier.ticket_count / 6}</td>
                    <td><span className="badge badge-gold">${tier.price}</span></td>
                    <td>{tier.pack_quantity}</td>
                    <td>
                      {w && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(w.pct, 100)}%`, background: w.overflow ? 'var(--red)' : w.pct > 70 ? 'var(--gold)' : 'var(--green)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: w.overflow ? 'var(--red)' : 'var(--muted)', minWidth: 36 }}>{w.pct}%</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {!packsGenerated && (
                        <button className="btn-danger btn-sm" onClick={() => deleteTier(tier.id)}>Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Inventory Generation */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 20, marginBottom: 4 }}>PACK INVENTORY</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                {packsGenerated
                  ? `${totalPacks} packs generated — ${soldPacks} sold, ${totalPacks - soldPacks} available`
                  : 'No packs generated yet. Configure tiers above, then generate.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {packsGenerated && (
                <>
                  <a href={`/api/admin/cards?tournamentId=${tournamentId}&action=bulk`} target="_blank">
                    <button className="btn-secondary btn-sm">⬇ Download All Cards (PDF)</button>
                  </a>
                  <button className="btn-danger btn-sm" onClick={resetInventory} disabled={resetting || soldPacks > 0}>
                    {resetting ? 'Resetting…' : 'Reset Inventory'}
                  </button>
                </>
              )}
              {!packsGenerated && (
                <button className="btn-primary" onClick={generateInventory} disabled={generating || tiers.length === 0}>
                  {generating ? 'Generating…' : 'Generate Pack Inventory'}
                </button>
              )}
            </div>
          </div>

          {packsGenerated && (
            <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Serial</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Buyer</th>
                    <th>Source</th>
                    <th>Card</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.slice(0, 200).map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.serial}</td>
                      <td style={{ fontSize: 13 }}>{p.tier_name}</td>
                      <td>
                        <span className={`badge ${p.sold ? 'badge-green' : 'badge-muted'}`}>
                          {p.sold ? 'Sold' : 'Available'}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{p.buyer_name || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.sale_source || '—'}</td>
                      <td>
                        <a href={`/api/admin/cards?tournamentId=${tournamentId}&packId=${p.id}`} target="_blank">
                          <button className="btn-ghost btn-sm">View</button>
                        </a>
                      </td>
                    </tr>
                  ))}
                  {packs.length > 200 && (
                    <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 13 }}>
                      Showing 200 of {packs.length} — download PDF for full list
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
