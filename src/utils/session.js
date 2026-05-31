import { getIronSession } from 'iron-session';

const sessionOptions = {
  password: process.env.ADMIN_SESSION_SECRET || 'fallback-dev-secret-change-in-production-32chars',
  cookieName: 'raffle_admin_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12, // 12 hours
  },
};

export async function getSession(req, res) {
  return getIronSession(req, res, sessionOptions);
}

export async function requireAdmin(req, res) {
  const session = await getSession(req, res);
  if (!session?.admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}
