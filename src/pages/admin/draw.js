import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';

const TICKET_COLORS = {
  Red:    '#ef4444', Orange: '#f97316', Yellow: '#eab308',
  Green:  '#22c55e', Blue:   '#3b82f6', Purple: '#a855f7',
};

export default function DrawPage() {
  const router = useRouter();
  const { t: tournamentId } = router.query;

  const [tournament, setTournament] = useState(null);
  const [drawState, setDrawState] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [selectedPrize, setSelectedPrize] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animDisplay, setAnimDisplay] = useState('');
  const [lastDraw, setLastDraw] = useState(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const animRef = useRef();
  const displayWindow = useRef(null);

  useEffect(() => { if (tournamentId) load(); }, [tournamentId]);

  // Keep display window in sync
  useEffect(() => {
    if (lastDraw && displayWindow.current && !displayWindow.current.closed) {
      displayWindow.current.postMessage({
        type: 'DRAW_RESULT',
        data: lastDraw,
      }, '*');
    }
  }, [lastDraw]);

  async function load() {
    const [tRes, drawRes, prizeRes] = await Promise.all([
      fetch('/api/admin/tournament'),
      fetch(`/api/admin/draw?tournamentId=${tournamentId}`),
      fetch(`/api/admin/prizes?tournamentId=${tournamentId}`),
    ]);
    const [ts, drawData, prizeData] = await Promise.all([tRes.json(), drawRes.json(), prizeRes.json()]);
    const t = ts.find(x => String(x.id) === String(tournamentId));
    if (!t) { router.push('/admin/login'); return; }
    setTournament(t);
    setDrawState(drawData);
    setPrizes(prizeData);
    if (!selectedPrize && drawData.nextPrize) setSelectedPrize(drawData.nextPrize);
  }

  function openDisplayWindow() {
    const url = `/display/${tournamentId}`;
    displayWindow.current = window.open(url, 'raffle_display',
      'width=1920,height=1080,toolbar=no,menubar=no,scrollbars=no'
    );
  }

  async function performDraw() {
    if (!selectedPrize) return;
    setDrawing(true);
    setLastDraw(null);

    // Animate through random numbers
    const digitMode = tournament?.digit_mode || 6;
    const maxNum = Math.pow(10, digitMode) - 1;
    const colors = Object.keys(TICKET_COLORS);
    let count = 0;
    setAnimating(true);

    animRef.current = setInterval(() => {
      const randNum = Math.floor(Math.random() * maxNum).toString().padStart(digitMode, '0');
      const randColor = colors[Math.floor(Math.random() * colors.length)];
      setAnimDisplay(JSON.stringify({ num: randNum, color: randColor }));
      count++;
      if (count >= 25) {
        clearInterval(animRef.current);
        setAnimating(false);
        executeDraw();
      }
    }, 80);
  }

  async function executeDraw() {
    const res = await fetch(`/api/admin/draw?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draw',
        prizeId: selectedPrize?.id,
        attemptNumber,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setLastDraw(data);
      setAttemptNumber(a => a + 1);

      // Push to display window
      if (displayWindow.current && !displayWindow.current.closed) {
        displayWindow.current.postMessage({ type: 'DRAW_RESULT', data }, '*');
      }
    }
    setDrawing(false);
    load();
  }

  async function claimPrize() {
    if (!selectedPrize || !lastDraw) return;
    await fetch(`/api/admin/draw?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'claim', prizeId: selectedPrize.id, drawId: lastDraw.draw?.id }),
    });
    setLastDraw(null);
    setAttemptNumber(1);
    setSelectedPrize(null);
    load();
  }

  async function skipPrize() {
    if (!selectedPrize) return;
    if (!confirm(`Skip "${selectedPrize.name}"? It will be marked as skipped.`)) return;
    await fetch(`/api/admin/draw?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip', prizeId: selectedPrize.id }),
    });
    setLastDraw(null);
    setAttemptNumber(1);
    setSelectedPrize(null);
    load();
  }

  const animState = animDisplay ? JSON.parse(animDisplay) : null;
  const pendingPrizes = prizes.filter(p => p.status === 'pending');
  const drawnPrizes = prizes.filter(p => p.status === 'drawn');
  const skippedPrizes = prizes.filter(p => p.status === 'skipped');

  return (
    <>
      <Head><title>Draw Control — Electronic Raffle</title></Head>
      <Nav tournamentId={tournamentId} tournamentName={tournament?.name} salesOpen={tournament?.sales_open} />
      <div className="page-wide">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

          {/* ── Main draw panel ─────────────────────────────────────── */}
          <div>
            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Tickets', val: drawState?.totalTickets?.toLocaleString() || '—' },
                { label: 'Remaining', val: drawState?.remainingTickets?.toLocaleString() || '—' },
                { label: 'Drawn', val: drawState?.discardedCount?.toLocaleString() || '0' },
                { label: 'Prizes Left', val: pendingPrizes.length },
              ].map(s => (
                <div key={s.label} className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--gold)', letterSpacing: '0.04em' }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Prize selector */}
            <div className="card" style={{ marginBottom: 16 }}>
              <label>DRAWING FOR PRIZE</label>
              <select
                value={selectedPrize?.id || ''}
                onChange={e => {
                  const p = prizes.find(x => String(x.id) === e.target.value);
                  setSelectedPrize(p || null);
                  setLastDraw(null);
                  setAttemptNumber(1);
                }}
                style={{ marginBottom: 0 }}
              >
                <option value="">— Select a prize —</option>
                {pendingPrizes.map(p => (
                  <option key={p.id} value={p.id}>
                    [{p.session_label}] #{p.sequence_order} · {p.name}
                    {p.value_display ? ` (${p.value_display})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Big draw display */}
            <div className="card" style={{
              textAlign: 'center',
              padding: '48px 32px',
              marginBottom: 16,
              minHeight: 240,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              border: lastDraw ? '1px solid var(--gold)40' : '1px solid var(--border)',
            }}>
              {lastDraw && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `radial-gradient(ellipse at center, ${TICKET_COLORS[lastDraw.result?.color] || 'var(--gold)'}12 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
              )}

              {!drawing && !lastDraw && !animating && (
                <div>
                  {selectedPrize ? (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Ready to Draw
                      </p>
                      <p style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--text)' }}>{selectedPrize.name}</p>
                      {selectedPrize.value_display && (
                        <p style={{ color: 'var(--gold)', fontSize: 18 }}>{selectedPrize.value_display}</p>
                      )}
                    </>
                  ) : (
                    <p style={{ color: 'var(--muted)' }}>Select a prize above to begin</p>
                  )}
                </div>
              )}

              {animating && animState && (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.15em', marginBottom: 16 }}>DRAWING…</p>
                  <div style={{
                    fontFamily: 'Bebas Neue',
                    fontSize: 64,
                    letterSpacing: '0.08em',
                    color: TICKET_COLORS[animState.color] || 'var(--gold)',
                    lineHeight: 1,
                    filter: 'blur(0.5px)',
                    animation: 'pulse 0.1s ease-in-out infinite',
                  }}>{animState.num}</div>
                </div>
              )}

              {lastDraw && !animating && (
                <div className="scale-in">
                  {attemptNumber > 2 && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.12em', marginBottom: 8 }}>
                      ATTEMPT {attemptNumber - 1}
                    </p>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
                    🎉 {selectedPrize?.name || 'Winner'}
                    {selectedPrize?.value_display && ` — ${selectedPrize.value_display}`}
                  </p>
                  <div style={{
                    fontFamily: 'Bebas Neue',
                    fontSize: 72,
                    letterSpacing: '0.06em',
                    color: TICKET_COLORS[lastDraw.result?.color] || 'var(--gold)',
                    lineHeight: 1,
                    marginBottom: 12,
                    textShadow: `0 0 40px ${TICKET_COLORS[lastDraw.result?.color] || 'var(--gold)'}60`,
                  }}>
                    {lastDraw.result?.ticketNumber?.toString().padStart(tournament?.digit_mode || 6, '0')}
                  </div>
                  <p style={{
                    fontFamily: 'Bebas Neue',
                    fontSize: 32,
                    letterSpacing: '0.04em',
                    color: 'var(--text)',
                    marginBottom: 8,
                  }}>{lastDraw.result?.buyerName}</p>
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {lastDraw.result?.color} ticket · Pack {lastDraw.result?.packSerial}
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10 }}>
              <button
                className="btn-primary btn-xl"
                onClick={performDraw}
                disabled={drawing || animating || !selectedPrize || drawState?.remainingTickets === 0}
              >
                {drawing || animating ? 'DRAWING…' : lastDraw ? '🎲 RE-DRAW' : '🎲 DRAW'}
              </button>
              {lastDraw && (
                <button className="btn-success btn-lg" onClick={claimPrize}>
                  ✓ CLAIMED
                </button>
              )}
              {selectedPrize && (
                <button className="btn-danger btn-lg" onClick={skipPrize} disabled={drawing || animating}>
                  SKIP
                </button>
              )}
            </div>

            {lastDraw && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                Ticket #{lastDraw.result?.ticketNumber?.toLocaleString()} is permanently discarded whether claimed or not.
                Press RE-DRAW to pick a new winner for this prize.
              </p>
            )}

            {/* Display window controls */}
            <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn-secondary btn-sm" onClick={openDisplayWindow}>
                📺 Open Display Window (1080p)
              </button>
              <Link href={`/display/${tournamentId}`} target="_blank">
                <button className="btn-ghost btn-sm">Open in Tab ↗</button>
              </Link>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Display auto-polls every 3s. Open on your second screen / projector.
              </span>
            </div>
          </div>

          {/* ── Right sidebar: prize queue + history ────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Upcoming prizes */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: 18 }}>PRIZE QUEUE ({pendingPrizes.length})</h2>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {pendingPrizes.length === 0 ? (
                  <p style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>All prizes drawn</p>
                ) : pendingPrizes.map(p => (
                  <div key={p.id}
                    onClick={() => { setSelectedPrize(p); setLastDraw(null); setAttemptNumber(1); }}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedPrize?.id === p.id ? 'var(--surface2)' : '',
                      borderLeft: selectedPrize?.id === p.id ? '3px solid var(--gold)' : '3px solid transparent',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                      {p.value_display && <span style={{ color: 'var(--gold)', fontSize: 13 }}>{p.value_display}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.session_label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent draws */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: 18 }}>DRAW HISTORY</h2>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {!drawState?.recentDraws?.length ? (
                  <p style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>No draws yet</p>
                ) : drawState.recentDraws.map(d => (
                  <div key={d.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{
                        fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.04em',
                        color: TICKET_COLORS[d.ticket_color] || 'var(--text)',
                      }}>
                        {d.ticket_number?.toString().padStart(tournament?.digit_mode || 6, '0')}
                      </span>
                      {d.claimed && <span className="badge badge-green" style={{ fontSize: 10 }}>Claimed</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{d.buyer_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.prize_name}</div>
                  </div>
                ))}
              </div>
            </div>

            {skippedPrizes.length > 0 && (
              <div className="card card-sm">
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>SKIPPED PRIZES</div>
                {skippedPrizes.map(p => (
                  <div key={p.id} style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.name}</span>
                    <button className="btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => {
                      // Re-activate skipped prize
                      fetch(`/api/admin/prizes?tournamentId=${tournamentId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...p, status: 'pending' }),
                      }).then(load);
                    }}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
      `}</style>
    </>
  );
}
