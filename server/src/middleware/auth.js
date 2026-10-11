import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

export const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

// The role is re-read from the database on every request so a token cannot
// outlive a role change or a deleted account.
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('Session expired or invalid. Please sign in again.');
  }
  const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
  if (!user) throw unauthorized('Account no longer exists');
  req.user = user;
  next();
}

// Public case pages may optionally identify the signed-in reporter so they can link to
// the private management page. A missing, expired, or invalid token must not block reading.
export async function optionalAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (user) req.user = user;
  } catch {
    // Optional auth intentionally treats an invalid session as signed out.
  }
  return next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) throw unauthorized();
  if (!roles.includes(req.user.role)) throw forbidden();
  next();
};
