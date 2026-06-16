import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from './middleware/auth.js';

import etlRouter from './routes/etl.js';

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/etl', etlRouter);



// ── AUTH ──────────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'E-mail et mot de passe requis.' });

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  

  const success = user ? await bcrypt.compare(password, user.password) : false;

  // Log the attempt
  if (user) {
    await prisma.loginLog.create({
      data: {
        userId: user.id,
        email: user.email,
        success,
        ip: req.ip,
      },
    });
  }

  if (!user || !success)
    return res.status(401).json({ message: 'Identifiants incorrects.' });

  if (!user.isActive)
    return res.status(403).json({ message: 'Compte désactivé.' });

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});



// GET /api/auth/me
app.get('/api/auth/me', verifyToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  res.json({ user });
});

// ── ADMIN ─────────────────────────────────────────────

// Middleware: must be owner or admin
const requireAdmin = (req, res, next) => {
  if (!['owner', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: 'Accès refusé.' });
  next();
};

// Middleware: must be owner
const requireOwner = (req, res, next) => {
  if (req.user.role !== 'owner')
    return res.status(403).json({ message: 'Réservé au propriétaire.' });
  next();
};

// GET /api/admin/users — list all users
app.get('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
  res.json({ users });
});

app.get('/api/admin/logs/imports', verifyToken, requireAdmin, async (req, res) => {
  const logs = await prisma.importLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { name: true } } },
  });
  res.json({ logs });
});

// POST /api/admin/users — create user
app.post('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name)
    return res.status(400).json({ message: 'Tous les champs sont requis.' });

  // Admins can only create "user", owners can create "admin" or "user"
  const allowedRoles =
    req.user.role === 'owner' ? ['admin', 'user'] : ['user'];

  const assignedRole = role && allowedRoles.includes(role) ? role : 'user';

  const exists = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (exists)
    return res.status(409).json({ message: 'Cet e-mail est déjà utilisé.' });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hash,
      name,
      role: assignedRole,
      createdById: req.user.id,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  res.status(201).json({ user });
});

// PATCH /api/admin/users/:id — update name/email/role
app.patch('/api/admin/users/:id', verifyToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, email, role } = req.body;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target)
    return res.status(404).json({ message: 'Utilisateur introuvable.' });

  // Only owner can change roles, and nobody can touch owner account
  if (target.role === 'owner')
    return res.status(403).json({ message: 'Impossible de modifier le propriétaire.' });

  if (role && req.user.role !== 'owner')
    return res.status(403).json({ message: 'Seul le propriétaire peut changer les rôles.' });

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(email && { email: email.toLowerCase() }),
      ...(role && req.user.role === 'owner' && { role }),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  res.json({ user: updated });
});

// PATCH /api/admin/users/:id/toggle — activate/deactivate
app.patch('/api/admin/users/:id/toggle', verifyToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target)
    return res.status(404).json({ message: 'Utilisateur introuvable.' });
  if (target.role === 'owner')
    return res.status(403).json({ message: 'Impossible de désactiver le propriétaire.' });

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: !target.isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  res.json({ user: updated });
});

// GET /api/admin/logs/logins — login history
app.get('/api/admin/logs/logins', verifyToken, requireAdmin, async (req, res) => {
  const logs = await prisma.loginLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { name: true } } },
  });
  res.json({ logs });
});

app.listen(process.env.PORT, () =>
  console.log(`Serveur lancé sur http://localhost:${process.env.PORT}`)
);