import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';

export default function Inventory() {
  const router = useRouter();
  const { t: tournamentId } = router.query;

  const [tournament, setTournament] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [packs, setPacks] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [emailingId, setEmailingId] = useState(null);
  const [emailMsg, setEmailMsg] = useState({});
  const [voidingId, setVoidingId] = useState(null);

  useEffect(() => { if (tournamentId) load(); }, [tournamentId]);

  async function load() {
    setLoading(true);
    try {
      const [tRes, tierRes, packRes, sumRes] = await Promise.all([
        fetch('/api/admin/tournament'),
        fetch(`/api/admin/pack-tiers?tournamentId=${tournamentId}`),
        fetch(`/api/admin/packs?tournamentId=${tournamentId}`),
        fetch(`/api/admin/sales?tournamentId=${tournamentId}&action=summary`),
      ]);
      const [ts, tierData, packData, sumData] = await Promise.all([
        tRes.json(), tierRes.json(), packRes.json(), sumRes.json(),
      ]);
      const t = ts.find(x => String(x.id) === String(tournamentId));
      if (!t) { router.push('/admin/login'); return; }
      setTournament(t);
      setTiers(tierData);
      setPacks(packData);
      setSummary(sumData);
    } finally {
      setLoading(false);
    }
  }

  async function emailCard(packId) {
    setEmailingId(packId);
    const res = await fetch(`/api/admin/cards?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'email', packId }),
    });
    const data = await res.json();
    setEmailMsg(m => ({ ...m, [packId]: res.ok ? '✓ Sent' : data.error || 'Failed' }));
    setEmailingId(null);
    setTimeout(() => setEmailMsg(m => { const n = {...m}; delete n[packId]; return n; }), 3000);
  }

  async function voidSale(packId) {
    if (!confirm('Void this sale? The pack will return to available inventory.')) return;
    setVoidingId(packId);
    await fetch(`/api/admin/sales?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'void', packId }),
    });
    setVoidingId(null);
    load();
  }

  // Filter packs
  const filtered = packs.filter(p => {
    if (filterTier !== 'all' && String(p.tier_id) !== filterTier) return false;
    if (filterStatus === 'sold' && !p.sold) return false;
    if (filterStatus === 'available' && p.sold) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.serial?.toLowerCase().includes(q) ||
        p.buyer_name?.toLowerCase().includes(q) ||
        p.buyer_pid?.toLowerCase().includes(q) ||
        p.buyer_email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalRevenue = summary.reduce((s, r) => s + parseFloat(r.revenue || 0), 0);
  const totalSold = summary.reduce((s, r) => s + parseInt(r.sold_packs || 0), 0);
  const totalPacks = packs.length;

  if (loading) return <><Nav /><div className="page"><p style={{ color: 'var(--muted)' }}>Loading…</p></div></>;

  return (
    <>
      <Head><title>Inventory — {tournament?.name}</title></Head>
      <Nav tournamentId={tournamentId} tournamentName={tournament?.name} salesOpen={tournament?.sales_open} />
      <div className="page-wide">
        <div className="page-header">
          <div>
            <h1 className="page-title">PACK INVENTORY</h1>
            <p className="page-subtitle">{totalSold} of {totalPacks} packs sold · ${totalRevenue.toFixed(2)} revenue</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/api/admin/cards?tournamentId=${tournamentId}&action=bulk`} target="_blank">
              <button className="btn-secondary btn-sm">⬇ Download All Cards (PDF)</button>
            </a>
            {filterTier !== 'all' && (
              <a href={`/api/admin/cards?tournamentId=${tournamentId}&action=bulk&tierId=${filterTier}`} target="_blank">
                <button className="btn-secondary btn-sm">⬇ Download Tier PDF</button>
              </a>
            )}
          </div>
        </div>

        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
          {summary.map((s, i) => (
            <div key={i} className="card card-sm" style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `hsl(${i * 55}, 70%, 55%)`,
              }} />
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 13, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4, marginTop: 6 }}>
                {s.tier_name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--gold)' }}>{s.sold_packs}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>/ {s.total_packs}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>${parseFloat(s.revenue || 0).toFixed(0)}</div>
              </div>
              {/* Sold progress bar */}
              <div style={{ marginTop: 6, height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((s.sold_packs / s.total_packs) * 100)}%`,
                  background: `hsl(${i * 55}, 70%, 55%)`,
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search serial, buyer name, PID, email…"
            style={{ width: 280, fontSize: 13 }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'sold', 'available'].map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                className={filterStatus === f ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>
                {f === 'all' ? `All (${packs.length})` : f === 'sold' ? `Sold (${packs.filter(p => p.sold).length})` : `Available (${packs.filter(p => !p.sold).length})`}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setFilterTier('all')}
              className={filterTier === 'all' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>
              All Tiers
            </button>
            {tiers.map(t => (
              <button key={t.id} onClick={() => setFilterTier(String(t.id))}
                className={filterTier === String(t.id) ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>
                {t.name}
              </button>
            ))}
          </div>

          {(search || filterTier !== 'all' || filterStatus !== 'all') && (
            <button className="btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterTier('all'); setFilterStatus('all'); }}>
              Clear filters
            </button>
          )}

          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
            {filtered.length} packs shown
          </span>
        </div>

        {/* Pack table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
            <table>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 5 }}>
                <tr>
                  <th>Serial</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Buyer</th>
                  <th>PID</th>
                  <th>Email</th>
                  <th>Source</th>
                  <th>Sold At</th>
                  <th>Card</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                    {packs.length === 0 ? 'No packs generated yet — go to Setup' : 'No packs match filters'}
                  </td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{p.serial}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>{p.tier_name}</td>
                    <td>
                      <span className={`badge ${p.sold ? 'badge-green' : 'badge-muted'}`}>
                        {p.sold ? 'Sold' : 'Available'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: p.buyer_name ? 500 : 400, color: p.buyer_name ? 'var(--text)' : 'var(--muted)' }}>
                      {p.buyer_name || '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.buyer_pid || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.buyer_email || '—'}</td>
                    <td>
                      {p.sale_source && (
                        <span className="badge badge-muted" style={{ fontSize: 10 }}>{p.sale_source}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {p.sold_at ? new Date(p.sold_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      {p.card_emailed && (
                        <span title="Card emailed" style={{ fontSize: 14, marginRight: 4 }}>📧</span>
                      )}
                      <a href={`/api/admin/cards?tournamentId=${tournamentId}&packId=${p.id}`} target="_blank">
                        <button className="btn-ghost btn-sm">View</button>
                      </a>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {p.sold && p.buyer_email && (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => emailCard(p.id)}
                            disabled={emailingId === p.id}
                            title="Re-send tracker card by email"
                          >
                            {emailMsg[p.id] || (emailingId === p.id ? '…' : '📧')}
                          </button>
                        )}
                        {p.sold && !tournament?.draw_active && (
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => voidSale(p.id)}
                            disabled={voidingId === p.id}
                            title="Void this sale"
                          >
                            {voidingId === p.id ? '…' : 'Void'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
