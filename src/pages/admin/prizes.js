import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';

const PRIZE_TYPES = ['cash', 'free_entry', 'bowling_ball', 'donated', 'other'];
const TYPE_LABELS = {
  cash: '💵 Cash',
  free_entry: '🎳 Free Entry',
  bowling_ball: '🎱 Bowling Ball',
  donated: '🎁 Donated Item',
  other: '🏆 Other',
};
const TYPE_COLORS = {
  cash: 'badge-gold',
  free_entry: 'badge-green',
  bowling_ball: 'badge-blue',
  donated: 'badge-muted',
  other: 'badge-muted',
};

const BLANK_FORM = {
  name: '', prize_type: 'cash', value_display: '',
  description: '', donor: '', session_label: 'Tournament',
};

export default function Prizes() {
  const router = useRouter();
  const { t: tournamentId } = router.query;

  const [tournament, setTournament] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [form, setForm] = useState(BLANK_FORM);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState(['Tournament', 'Awards Ceremony']);
  const [newSession, setNewSession] = useState('');
  const [filterSession, setFilterSession] = useState('all');
  const [dragIdx, setDragIdx] = useState(null);

  useEffect(() => { if (tournamentId) load(); }, [tournamentId]);

  async function load() {
    const [tRes, prRes] = await Promise.all([
      fetch('/api/admin/tournament'),
      fetch(`/api/admin/prizes?tournamentId=${tournamentId}`),
    ]);
    const [ts, prizeData] = await Promise.all([tRes.json(), prRes.json()]);
    const t = ts.find(x => String(x.id) === String(tournamentId));
    if (!t) { router.push('/admin/login'); return; }
    setTournament(t);
    setPrizes(prizeData);
    // Extract unique session labels
    const sessionSet = new Set(['Tournament', 'Awards Ceremony', ...prizeData.map(p => p.session_label)]);
    setSessions([...sessionSet]);
  }

  async function addPrize(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/admin/prizes?tournamentId=${tournamentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, sequence_order: prizes.length + 1 }),
    });
    if (res.ok) { setForm(BLANK_FORM); load(); }
    setSaving(false);
  }

  async function updatePrize() {
    setSaving(true);
    const res = await fetch(`/api/admin/prizes?tournamentId=${tournamentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    if (res.ok) { setEditing(null); load(); }
    setSaving(false);
  }

  async function deletePrize(id) {
    if (!confirm('Delete this prize?')) return;
    await fetch(`/api/admin/prizes?tournamentId=${tournamentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  }

  // Drag-to-reorder
  function handleDragStart(idx) { setDragIdx(idx); }
  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const updated = [...prizes];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    updated.forEach((p, i) => { p.sequence_order = i + 1; });
    setPrizes(updated);
    setDragIdx(idx);
  }
  async function handleDragEnd() {
    setDragIdx(null);
    // Save new order
    await fetch(`/api/admin/prizes?tournamentId=${tournamentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', items: prizes.map(p => ({ id: p.id, sequence_order: p.sequence_order })) }),
    });
  }

  const filtered = filterSession === 'all' ? prizes : prizes.filter(p => p.session_label === filterSession);
  const grouped = sessions.reduce((acc, s) => {
    acc[s] = prizes.filter(p => p.session_label === s);
    return acc;
  }, {});

  return (
    <>
      <Head><title>Prizes — Electronic Raffle</title></Head>
      <Nav tournamentId={tournamentId} tournamentName={tournament?.name} salesOpen={tournament?.sales_open} />
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">PRIZE INVENTORY</h1>
            <p className="page-subtitle">{prizes.length} prizes configured · drag rows to reorder</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
          {/* Add prize form */}
          <div>
            <div className="card" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 20, marginBottom: 14 }}>ADD PRIZE</h2>
              <form onSubmit={addPrize}>
                <div className="form-row">
                  <div><label>Prize Name *</label>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="$50 Cash Prize" required /></div>
                </div>
                <div className="form-row form-row-2">
                  <div><label>Type</label>
                    <select value={form.prize_type} onChange={e => setForm({...form, prize_type: e.target.value})}>
                      {PRIZE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div><label>Value / Display</label>
                    <input value={form.value_display} onChange={e => setForm({...form, value_display: e.target.value})} placeholder="$50" /></div>
                </div>
                <div className="form-row">
                  <div><label>Description</label>
                    <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Optional details" /></div>
                </div>
                {form.prize_type === 'donated' && (
                  <div className="form-row">
                    <div><label>Donor</label>
                      <input value={form.donor} onChange={e => setForm({...form, donor: e.target.value})} placeholder="Donated by…" /></div>
                  </div>
                )}
                <div className="form-row">
                  <div><label>Draw Session</label>
                    <select value={form.session_label} onChange={e => setForm({...form, session_label: e.target.value})}>
                      {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn-primary btn-full" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Prize'}</button>
              </form>
            </div>

            {/* Add custom session */}
            <div className="card card-sm">
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>CUSTOM SESSIONS</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newSession} onChange={e => setNewSession(e.target.value)} placeholder="New session name…" style={{ fontSize: 13 }} />
                <button className="btn-secondary btn-sm" onClick={() => {
                  if (newSession.trim()) {
                    setSessions(s => [...new Set([...s, newSession.trim()])]);
                    setNewSession('');
                  }
                }}>Add</button>
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sessions.map(s => (
                  <span key={s} className="badge badge-muted">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Prize list */}
          <div>
            {/* Session filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {['all', ...sessions].map(s => (
                <button key={s} onClick={() => setFilterSession(s)}
                  className={filterSession === s ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}>
                  {s === 'all' ? 'All Prizes' : s}
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({s === 'all' ? prizes.length : (grouped[s]?.length || 0)})
                  </span>
                </button>
              ))}
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th style={{ width: 36 }}>#</th>
                    <th>Prize</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Session</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.id}
                      draggable
                      onDragStart={() => handleDragStart(prizes.indexOf(p))}
                      onDragOver={e => handleDragOver(e, prizes.indexOf(p))}
                      onDragEnd={handleDragEnd}
                      style={{ cursor: 'grab', opacity: dragIdx === prizes.indexOf(p) ? 0.5 : 1 }}>
                      <td style={{ color: 'var(--muted2)', textAlign: 'center' }}>⠿</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.sequence_order}</td>
                      {editing?.id === p.id ? (
                        <>
                          <td><input value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} style={{ fontSize: 13 }} /></td>
                          <td>
                            <select value={editing.prize_type} onChange={e => setEditing({...editing, prize_type: e.target.value})} style={{ fontSize: 12 }}>
                              {PRIZE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                            </select>
                          </td>
                          <td><input value={editing.value_display||''} onChange={e => setEditing({...editing, value_display: e.target.value})} style={{ fontSize: 13 }} /></td>
                          <td>
                            <select value={editing.session_label} onChange={e => setEditing({...editing, session_label: e.target.value})} style={{ fontSize: 12 }}>
                              {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td colSpan={2}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn-primary btn-sm" onClick={updatePrize} disabled={saving}>Save</button>
                              <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.description}</div>}
                            {p.donor && <div style={{ fontSize: 11, color: 'var(--muted)' }}>by {p.donor}</div>}
                          </td>
                          <td><span className={`badge ${TYPE_COLORS[p.prize_type] || 'badge-muted'}`}>{TYPE_LABELS[p.prize_type]}</span></td>
                          <td style={{ fontFamily: 'Bebas Neue', fontSize: 16, color: 'var(--gold)' }}>{p.value_display || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.session_label}</td>
                          <td>
                            <span className={`badge ${p.status === 'drawn' ? 'badge-green' : p.status === 'skipped' ? 'badge-red' : 'badge-muted'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {p.status === 'pending' && <button className="btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>}
                              <button className="btn-danger btn-sm" onClick={() => deletePrize(p.id)}>✕</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No prizes yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
