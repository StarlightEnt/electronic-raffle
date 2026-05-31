import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

function darken(hex, factor = 0.85) {
  return '#' + [1, 3, 5].map(i =>
    Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor))
      .toString(16).padStart(2, '0')
  ).join('');
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const t = router.query.t;

  useEffect(() => {
    const root = document.documentElement.style;
    if (!t) {
      root.removeProperty('--gold');
      root.removeProperty('--gold-d');
      return;
    }
    fetch('/api/admin/tournament')
      .then(r => r.ok ? r.json() : null)
      .then(ts => {
        if (!ts) return;
        const match = ts.find(x => String(x.id) === String(t));
        const color = match?.primary_color;
        if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
          root.setProperty('--gold', color);
          root.setProperty('--gold-d', darken(color));
        }
      })
      .catch(() => {});
  }, [t]);

  return <Component {...pageProps} />;
}
