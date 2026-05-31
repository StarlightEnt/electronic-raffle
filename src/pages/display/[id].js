import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const TICKET_COLORS = {
  Red:    { hex: '#ef4444', textDark: false },
  Orange: { hex: '#f97316', textDark: false },
  Yellow: { hex: '#eab308', textDark: true  },
  Green:  { hex: '#22c55e', textDark: false },
  Blue:   { hex: '#3b82f6', textDark: false },
  Purple: { hex: '#a855f7', textDark: false },
};

export default function Display() {
  const router = useRouter();
  const { id: tournamentId } = router.query;

  const [tournament, setTournament] = useState(null);
  const [drawState, setDrawState] = useState(null);
  const [latestDraw, setLatestDraw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [singleScreen, setSingleScreen] = useState(false);
  const pollRef = useRef();

  useEffect(() => {
    if (!tournamentId) return;
    loadAll();
    // Poll every 3 seconds for live updates
    pollRef.current = setInterval(loadAll, 3000);
    return () => clearInterval(pollRef.current);
  }, [tournamentId]);

  // Also listen for postMessage from admin window (immediate push)
  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === 'DRAW_RESULT') {
        const { draw, result, prize } = e.data.data;
        setLatestDraw({ draw, result, prize });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function loadAll() {
    try {
      const [tRes, drawRes] = await Promise.all([
        fetch('/api/admin/tournament'),
        tournamentId ? fetch(`/api/admin/draw?tournamentId=${tournamentId}`) : Promise.resolve(null),
      ]);
      const ts = await tRes.json();
      const t = ts.find(x => String(x.id) === String(tournamentId));
      setTournament(t || null);
      if (drawRes) {
        const drawData = await drawRes.json();
        setDrawState(drawData);
        if (drawData.recentDraws?.[0]) {
          const latest = drawData.recentDraws[0];
          setLatestDraw(prev => {
            // Only update if it's actually a new draw
            if (!prev || prev.draw?.id !== latest.id) {
              return {
                draw: latest,
                result: {
                  ticketNumber: latest.ticket_number,
                  color: latest.ticket_color,
                  packSerial: latest.pack_serial,
                  buyerName: latest.buyer_name,
                  totalInPool: latest.total_in_pool,
                },
                prize: { name: latest.prize_name },
              };
            }
            return prev;
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const colorInfo = latestDraw?.result?.color
    ? TICKET_COLORS[latestDraw.result.color]
    : null;
  const ticketColor = colorInfo?.hex || '#f59e0b';
  const digitMode = tournament?.digit_mode || 6;
  const ticketDisplay = latestDraw?.result?.ticketNumber
    ?.toString().padStart(digitMode, '0');

  const gold = tournament?.primary_color || '#f59e0b';

  if (loading) return (
    <div style={{ background: '#09090f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: gold, letterSpacing: '0.1em' }}>LOADING…</div>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet" />
    </div>
  );

  return (
    <>
      <Head>
        <title>{tournament?.name || 'Raffle'} — Live Draw</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #09090f; color: #eeeef8; font-family: 'DM Sans', sans-serif; overflow: hidden; }
          @keyframes revealNum {
            0%   { transform: scale(0.6) translateY(20px); opacity: 0; filter: blur(8px); }
            60%  { transform: scale(1.08) translateY(-4px); opacity: 1; filter: blur(0); }
            100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); }
          }
          @keyframes revealName {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes glow {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.7; }
          }
          @keyframes tickerScroll {
            from { transform: translateX(100%); }
            to   { transform: translateX(-100%); }
          }
        `}</style>
      </Head>

      <div style={{
        width: '100vw', height: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        background: '#09090f',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background glow */}
        {colorInfo && (
          <div style={{
            position: 'absolute',
            top: '30%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 800, height: 800,
            background: `radial-gradient(circle, ${ticketColor}18 0%, transparent 70%)`,
            borderRadius: '50%',
            animation: 'glow 3s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header style={{
          padding: '20px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${gold}25`,
          background: `linear-gradient(to right, ${gold}08, transparent, ${gold}08)`,
          position: 'relative', zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {tournament?.logo_url && (
              <img src={tournament.logo_url} alt="Logo" style={{ height: 52, width: 'auto', objectFit: 'contain' }} />
            )}
            <div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: '0.08em', color: gold, lineHeight: 1 }}>
                {tournament?.name}
              </div>
              {(tournament?.date_start || tournament?.location) && (
                <div style={{ fontSize: 13, color: '#7878a0', marginTop: 2 }}>
                  {[tournament.location, tournament.date_start].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: '#7878a0', letterSpacing: '0.1em' }}>
              ELECTRONIC RAFFLE
            </div>
            {drawState && (
              <div style={{ fontSize: 12, color: '#555570', marginTop: 2 }}>
                {drawState.remainingTickets?.toLocaleString()} tickets remaining
              </div>
            )}
          </div>
        </header>

        {/* ── Main display ─────────────────────────────────────────────── */}
        <main style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 48px',
          position: 'relative', zIndex: 2,
          textAlign: 'center',
        }}>
          {!latestDraw ? (
            <div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 52, letterSpacing: '0.06em', color: '#7878a0', marginBottom: 12 }}>
                STANDING BY
              </div>
              <div style={{ fontSize: 16, color: '#555570' }}>Raffle draw will appear here</div>
            </div>
          ) : (
            <div>
              {/* Prize name */}
              <div style={{
                fontFamily: 'Bebas Neue',
                fontSize: 28,
                letterSpacing: '0.12em',
                color: gold,
                marginBottom: 16,
                textTransform: 'uppercase',
              }}>
                {latestDraw.prize?.name || '🎉 Winner'}
                {latestDraw.prize?.value_display && (
                  <span style={{ color: '#eeeef8', marginLeft: 16 }}>
                    {latestDraw.prize.value_display}
                  </span>
                )}
              </div>

              {/* THE TICKET NUMBER — the star of the show */}
              <div
                key={latestDraw.draw?.id}
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 'min(22vw, 200px)',
                  letterSpacing: '0.06em',
                  lineHeight: 0.9,
                  color: ticketColor,
                  textShadow: `0 0 80px ${ticketColor}50, 0 0 160px ${ticketColor}25`,
                  animation: 'revealNum 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
                  marginBottom: 24,
                }}>
                {ticketDisplay}
              </div>

              {/* Color badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                background: `${ticketColor}20`,
                border: `1px solid ${ticketColor}50`,
                borderRadius: 100,
                padding: '6px 20px',
                marginBottom: 20,
              }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: ticketColor }} />
                <span style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.1em', color: ticketColor }}>
                  {latestDraw.result?.color} TICKET
                </span>
              </div>

              {/* Winner name */}
              <div
                key={`name-${latestDraw.draw?.id}`}
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 'min(8vw, 72px)',
                  letterSpacing: '0.04em',
                  color: '#eeeef8',
                  animation: 'revealName 0.5s ease 0.6s both',
                  marginBottom: 8,
                }}>
                {latestDraw.result?.buyerName}
              </div>

              <div style={{ fontSize: 14, color: '#7878a0' }}>
                Pack {latestDraw.result?.packSerial}
              </div>
            </div>
          )}
        </main>

        {/* ── Bottom ticker — recent winners ─────────────────────────── */}
        {drawState?.recentDraws?.length > 0 && (
          <footer style={{
            borderTop: `1px solid #2a2a3e`,
            padding: '10px 0',
            overflow: 'hidden',
            background: '#111118',
            position: 'relative', zIndex: 2,
          }}>
            <div style={{
              display: 'inline-flex',
              gap: 48,
              animation: 'tickerScroll 30s linear infinite',
              whiteSpace: 'nowrap',
            }}>
              {[...drawState.recentDraws, ...drawState.recentDraws].map((d, i) => (
                <span key={i} style={{ fontSize: 13, color: '#7878a0' }}>
                  <span style={{ color: TICKET_COLORS[d.ticket_color]?.hex || gold, fontFamily: 'Bebas Neue', marginRight: 8 }}>
                    {d.ticket_number?.toString().padStart(digitMode, '0')}
                  </span>
                  <span style={{ color: '#eeeef8' }}>{d.buyer_name}</span>
                  <span style={{ color: '#555570', marginLeft: 6 }}>— {d.prize_name}</span>
                </span>
              ))}
            </div>
          </footer>
        )}

        {/* Single-screen mode toggle (bottom right corner, subtle) */}
        <div style={{ position: 'fixed', bottom: 8, right: 12, fontSize: 11, color: '#333344' }}>
          Auto-refreshing · 🔒 CSPRNG
        </div>
      </div>
    </>
  );
}
