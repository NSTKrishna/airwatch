import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email,
  password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
});
const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password').max(72) });

// Public sign-up always creates a citizen. Municipal accounts are provisioned by seeding/ops only.
router.post('/register', limiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw conflict('An account with this email already exists');
  }
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12), role: 'CITIZEN' },
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// Fixed dummy hash keeps timing similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/login', limiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw unauthorized('Incorrect email or password');
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
