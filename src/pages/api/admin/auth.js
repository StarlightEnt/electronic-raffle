import bcrypt from 'bcryptjs';
import { getSession } from '../../../utils/session';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { password, action } = req.body;
  const session = await getSession(req, res);

  if (action === 'logout') {
    session.destroy();
    return res.json({ ok: true });
  }

  if (action === 'check') {
    return res.json({ admin: !!session?.admin });
  }

  // Reconstruct bcrypt hash from colon-encoded env var
  // Stored as "2b:10:rest" to avoid $ stripping in some env systems
  const raw = process.env.ADMIN_PASSWORD_HASH || '';
  let fullHash = raw;
  if (!raw.startsWith('$')) {
    const parts = raw.split(':');
    if (parts.length >= 3) {
      fullHash = `$${parts[0]}$${parts[1]}$${parts.slice(2).join('')}`;
    }
  }

  const valid = await bcrypt.compare(password, fullHash);
  if (!valid) return res.status(401).json({ error: 'Invalid password' });

  session.admin = true;
  await session.save();
  res.json({ ok: true });
}
