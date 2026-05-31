import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Nav({ tournamentId, tournamentName, salesOpen }) {
  const router = useRouter();
  const base = tournamentId ? `?t=${tournamentId}` : '';

  function isActive(path) {
    return router.pathname.startsWith(path) ? 'nav-link active' : 'nav-link';
  }

  async function logout() {
    await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.push('/admin/login');
  }

  return (
    <nav className="nav">
      <span className="nav-brand">🎟 ELECTRONIC RAFFLE</span>

      <Link href="/admin/dashboard" className={isActive('/admin/dashboard')}>
        Tournaments
      </Link>

      {tournamentId && <>
        <Link href={`/admin/setup${base}`} className={isActive('/admin/setup')}>
          Setup
        </Link>
        <Link href={`/admin/inventory${base}`} className={isActive('/admin/inventory')}>
          Inventory
        </Link>
        <Link href={`/admin/pos${base}`} className={isActive('/admin/pos')}>
          POS {salesOpen && <span className="badge badge-green" style={{marginLeft:6,fontSize:10}}>OPEN</span>}
        </Link>
        <Link href={`/admin/prizes${base}`} className={isActive('/admin/prizes')}>
          Prizes
        </Link>
        <Link href={`/admin/draw${base}`} className={isActive('/admin/draw')}>
          Draw
        </Link>
        <Link href={`/display/${tournamentId}`} target="_blank" className="nav-link">
          Display ↗
        </Link>
      </>}

      {tournamentName && (
        <span style={{
          marginLeft: 8,
          fontSize: 12,
          color: 'var(--muted)',
          background: 'var(--surface2)',
          padding: '3px 10px',
          borderRadius: 100,
          border: '1px solid var(--border)',
        }}>
          {tournamentName}
        </span>
      )}

      <span className="nav-spacer" />
      <button className="btn-ghost btn-sm" onClick={logout}>Logout</button>
    </nav>
  );
}
