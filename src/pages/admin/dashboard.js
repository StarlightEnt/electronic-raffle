import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';

export default function Dashboard() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', year: new Date().getFullYear(), location: '', date_start: '', date_end: '', primary_color: '#f59e0b', digit_mode: 6 });
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/tournament')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setTournaments)
      .catch(() => router.push('/admin/login'))
      .finally(() => setLoading(false));
  }, []);

  async function createTournament(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/admin/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const t = await res.json();
      router.push(`/admin/setup?t=${t.id}`);
    }
    setSaving(false);
  }

  return (
    <>
      <Head><title>Dashboard — Electronic Raffle</title></Head>
      <Nav />
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">TOURNAMENTS</h1>
            <p className="page-subtitle">Manage raffle events</p>
          </div>
          <button className="btn-primary" onClick={() => setCreating(!creating)}>
            + New Tournament
          </button>
        </div>

        {creating && (
          <div className="card fade-up" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, marginBottom: 18 }}>CREATE TOURNAMENT</h2>
            <form onSubmit={createTournament}>
              <div className="form-row form-row-2">
                <div><label>Tournament Name *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="San Francisco Golden Gate Classic Invitational" required /></div>
                <div><label>Year *</label>
                  <input type="number" value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value)})} required /></div>
              </div>
              <div className="form-row form-row-2">
                <div><label>Location</label>
                  <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Mission Bowling Club, San Francisco" /></div>
                <div><label>Accent Color</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={form.primary_color} onChange={e => setForm({...form, primary_color: e.target.value})} style={{ width: 44, flex: 'none' }} />
                    <input value={form.primary_color} onChange={e => setForm({...form, primary_color: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="form-row form-row-3">
                <div><label>Start Date</label>
                  <input type="date" value={form.date_start} onChange={e => setForm({...form, date_start: e.target.value})} /></div>
                <div><label>End Date</label>
                  <input type="date" value={form.date_end} onChange={e => setForm({...form, date_end: e.target.value})} /></div>
                <div><label>Ticket Digit Mode</label>
                  <select value={form.digit_mode} onChange={e => setForm({...form, digit_mode: parseInt(e.target.value)})}>
                    <option value={6}>6-digit (standard)</option>
                    <option value={7}>7-digit (large events)</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Tournament'}</button>
                <button className="btn-ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {loading ? <p style={{color:'var(--muted)'}}>Loading…</p> : tournaments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <p style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 8 }}>No tournaments yet</p>
            <p style={{ fontSize: 13, color: 'var(--muted2)' }}>Create your first tournament above</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {tournaments.map(t => (
              <div key={t.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                <div style={{ width: 5, height: 52, borderRadius: 3, background: t.primary_color || 'var(--gold)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.05em' }}>{t.name} {t.year}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {[t.location, t.date_start && t.date_end ? `${t.date_start} – ${t.date_end}` : t.date_start].filter(Boolean).join(' · ')}
                    {' · '}{t.digit_mode}-digit mode
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {t.sales_open && <span className="badge badge-green">Sales Open</span>}
                  {t.draw_active && <span className="badge badge-gold">Draw Active</span>}
                  <Link href={`/admin/setup?t=${t.id}`}>
                    <button className="btn-secondary btn-sm">Setup</button>
                  </Link>
                  <Link href={`/admin/pos?t=${t.id}`}>
                    <button className="btn-secondary btn-sm">POS</button>
                  </Link>
                  <Link href={`/admin/draw?t=${t.id}`}>
                    <button className="btn-primary btn-sm">Draw</button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
