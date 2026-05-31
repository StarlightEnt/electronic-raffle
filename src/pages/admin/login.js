import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Login() {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      router.push('/admin/dashboard');
    } else {
      setError('Invalid password');
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>Admin Login — Electronic Raffle</title></Head>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 0%, #f59e0b08 0%, transparent 60%)',
      }}>
        <div className="card" style={{ width: 380, padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎟</div>
            <h1 style={{ fontSize: 32, color: 'var(--gold)' }}>ELECTRONIC RAFFLE</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Admin Access</p>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 12 }}>
              <label>Password</label>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                autoFocus
                placeholder="Enter admin password"
              />
            </div>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            <button className="btn-primary btn-full btn-lg" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
