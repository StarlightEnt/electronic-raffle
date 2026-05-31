import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';

export default function POS() {
  const router = useRouter();
  const { t: tournamentId } = router.query;

  const [tournament, setTournament] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [summary, setSummary] = useState([]);
  const [recentSales, setRecentSales] = useState([]);

  // Sale form state
  const [buyerQuery, setBuyerQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [buyer, setBuyer] = useState({ name: '', pid: '', email: '', phone: '' });
  const [cart, setCart] = useState({}); // { tierId: quantity }
  const [selling, setSelling] = useState(false);
  const [saleResult, setSaleResult] = useState(null);
  const [error, setError] = useState('');
  const [showCard, setShowCard] = useState(null);

  const searchRef = useRef();
  const debounceRef = useRef();

  useEffect(() => { if (tournamentId) load(); }, [tournamentId]);

  async function load() {
    const [tRes, tierRes, sumRes] = await Promise.all([
      fetch('/api/admin/tournament'),
      fetch(`/api/admin/pack-tiers?tournamentId=${tournamentId}`),
      fetch(`/api/admin/sales?tournamentId=${tournamentId}&action=summary`),
    ]);
    const [ts, tierData, sumData] = await Promise.all([tRes.json(), tierRes.json(), sumRes.json()]);
    const t = ts.find(x => String(x.id) === String(tournamentId));
    if (!t) { router.push('/admin/login'); return; }
    setTournament(t);
    setTiers(tierData);
    setSummary(sumData);

    const packRes = await fetch(`/api/admin/packs?tournamentId=${tournamentId}&soldOnly=true`);
    const packData = await packRes.json();
    setRecentSales(packData.slice(0, 30).reverse());
  }

  async function lookupBuyer(q) {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    const res = await fetch(`/api/admin/sales?tournamentId=${tournamentId}&action=lookup&q=${encodeURIComponent(q)}`);
    if (res.ok) setSuggestions(await res.json());
  }

  function handleBuyerInput(val) {
    setBuyerQuery(val);
    setBuyer(b => ({ ...b, name: val }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => lookupBuyer(val), 250);
  }

  function selectSuggestion(s) {
    setBuyer({ name: s.name, pid: s.pid || '', email: s.email || '', phone: s.phone || '' });
    setBuyerQuery(s.name);
    setSuggestions([]);
  }

  function setQty(tierId, qty) {
    setCart(c => ({ ...c, [tierId]: Math.max(0, qty) }));
  }

  const totalTickets = tiers.reduce((sum, t) => {
    const qty = cart[t.id] || 0;
    return sum + qty * t.ticket_count;
  }, 0);

  const totalCost = tiers.reduce((sum, t) => {
    const qty = cart[t.id] || 0;
    return sum + qty * parseFloat(t.price);
  }, 0);

  const hasItems = Object.values(cart).some(q => q > 0);

  async function completeSale() {
    if (!buyer.name.trim()) { setError('Buyer name required'); return; }
    if (!hasItems) { setError('Select at least one pack'); return; }
    if (!tournament?.sales_open) { setError('Sales are currently closed'); return; }

    setSelling(true);
    setError('');
    setSaleResult(null);

    const results = [];
    for (const tier of tiers) {
      const qty = cart[tier.id] || 0;
      if (!qty) continue;
      const res = await fetch(`/api/admin/sales?tournamentId=${tournamentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sell',
          buyerName: buyer.name.trim(),
          buyerPid: buyer.pid || null,
          buyerEmail: buyer.email || null,
          buyerPhone: buyer.phone || null,
          tierId: tier.id,
          quantity: qty,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setSelling(false); return; }
      results.push(...(data.packs || []));
    }

    setSaleResult({ packs: results, buyer: buyer.name, total: totalCost });
    setShowCard(results[0]?.id || null);
    setCart({});
    setBuyerQuery('');
    setBuyer({ name: '', pid: '', email: '', phone: '' });
    load();
    setSelling(false);
  }

  function clearSale() {
    setSaleResult(null);
    setShowCard(null);
    setCart({});
    setError('');
    searchRef.current?.focus();
  }

  return (
    <>
      <Head><title>POS — Electronic Raffle</title></Head>
      <Nav tournamentId={tournamentId} tournamentName={tournament?.name} salesOpen={tournament?.sales_open} />
      <div className="page-wide">

        {!tournament?.sales_open && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            ⚠ Sales are currently <strong>closed</strong>. Enable sales in Setup to accept purchases.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20 }}>
          {/* ── Sale Form ─────────────────────────────────────────────── */}
          <div>
            <div className="card">
              <h2 style={{ fontSize: 22, marginBottom: 16 }}>NEW SALE</h2>

              {/* Buyer lookup */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <label>Buyer Name or ID</label>
                <input
                  ref={searchRef}
                  value={buyerQuery}
                  onChange={e => handleBuyerInput(e.target.value)}
                  placeholder="Search bowler or type guest name…"
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 8, overflow: 'hidden', marginTop: 4,
                  }}>
                    {suggestions.map((s, i) => (
                      <div key={i} onClick={() => selectSuggestion(s)} style={{
                        padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                        fontSize: 13,
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <strong>{s.name}</strong>
                        {s.pid && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>PID: {s.pid}</span>}
                        {s.email && <span style={{ color: 'var(--muted2)', marginLeft: 8 }}>{s.email}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional buyer details */}
              <div className="form-row form-row-2" style={{ marginBottom: 14 }}>
                <div><label>Email (optional)</label>
                  <input type="email" value={buyer.email} onChange={e => setBuyer(b => ({...b, email: e.target.value}))} placeholder="for tracker card email" /></div>
                <div><label>Phone (optional)</label>
                  <input value={buyer.phone} onChange={e => setBuyer(b => ({...b, phone: e.target.value}))} placeholder="xxx-xxx-xxxx" /></div>
              </div>

              {/* Pack selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ marginBottom: 10 }}>Select Packs</label>
                {tiers.map(tier => {
                  const tierSummary = summary.find(s => s.tier_name === tier.name);
                  const available = tierSummary
                    ? parseInt(tierSummary.available_packs)
                    : null;
                  return (
                    <div key={tier.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--surface2)',
                      borderRadius: 8,
                      marginBottom: 6,
                      border: (cart[tier.id] || 0) > 0 ? '1px solid var(--gold)40' : '1px solid transparent',
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{tier.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          ${tier.price} · {available !== null ? `${available} available` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn-ghost btn-sm" onClick={() => setQty(tier.id, (cart[tier.id]||0) - 1)}
                          disabled={(cart[tier.id]||0) === 0} style={{ width: 30, padding: 0, fontSize: 18, lineHeight: 1 }}>−</button>
                        <span style={{ width: 24, textAlign: 'center', fontWeight: 600, fontSize: 16 }}>
                          {cart[tier.id] || 0}
                        </span>
                        <button className="btn-ghost btn-sm" onClick={() => setQty(tier.id, (cart[tier.id]||0) + 1)}
                          disabled={available === 0} style={{ width: 30, padding: 0, fontSize: 18, lineHeight: 1 }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              {hasItems && (
                <div style={{
                  background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px',
                  marginBottom: 14, display: 'flex', justifyContent: 'space-between'
                }}>
                  <span style={{ color: 'var(--muted)' }}>{totalTickets} tickets total</span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'var(--gold)' }}>
                    ${totalCost.toFixed(2)}
                  </span>
                </div>
              )}

              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

              <button className="btn-primary btn-full btn-lg" onClick={completeSale}
                disabled={selling || !hasItems || !buyer.name || !tournament?.sales_open}>
                {selling ? 'Processing…' : 'Complete Sale'}
              </button>
            </div>
          </div>

          {/* ── Right panel: result + recent sales ────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sale result */}
            {saleResult && (
              <div className="card scale-in" style={{ border: '1px solid var(--gold)40' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 22, color: 'var(--green)', marginBottom: 4 }}>✓ SALE COMPLETE</h2>
                    <p style={{ color: 'var(--muted)', fontSize: 13 }}>{saleResult.buyer} · ${saleResult.total.toFixed(2)}</p>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={clearSale}>New Sale</button>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {saleResult.packs.map(pack => (
                    <div key={pack.id} style={{
                      background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600 }}>{pack.serial}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pack.tier_name}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <a href={`/api/admin/cards?tournamentId=${tournamentId}&packId=${pack.id}`} target="_blank">
                          <button className="btn-secondary btn-sm">🖨 Print Card</button>
                        </a>
                        {pack.buyer_email && (
                          <button className="btn-ghost btn-sm" onClick={async () => {
                            await fetch(`/api/admin/cards?tournamentId=${tournamentId}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'email', packId: pack.id }),
                            });
                          }}>📧 Email</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="card">
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>SALES SUMMARY</h2>
              <table>
                <thead>
                  <tr><th>Tier</th><th>Price</th><th>Sold</th><th>Available</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {summary.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{s.tier_name}</td>
                      <td>${parseFloat(s.price).toFixed(2)}</td>
                      <td><span className="badge badge-green">{s.sold_packs}</span></td>
                      <td style={{ color: 'var(--muted)' }}>{s.available_packs}</td>
                      <td style={{ color: 'var(--gold)', fontFamily: 'Bebas Neue', fontSize: 16 }}>
                        ${parseFloat(s.revenue || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ fontWeight: 600, textAlign: 'right' }}>Total Revenue</td>
                    <td style={{ color: 'var(--gold)', fontFamily: 'Bebas Neue', fontSize: 18 }}>
                      ${summary.reduce((s, r) => s + parseFloat(r.revenue || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Recent sales */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: 18 }}>RECENT SALES</h2>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Serial</th><th>Buyer</th><th>Source</th><th>Card</th></tr></thead>
                  <tbody>
                    {recentSales.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.serial}</td>
                        <td style={{ fontSize: 13 }}>{p.buyer_name}</td>
                        <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{p.sale_source}</span></td>
                        <td>
                          <a href={`/api/admin/cards?tournamentId=${tournamentId}&packId=${p.id}`} target="_blank">
                            <button className="btn-ghost btn-sm">View</button>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
