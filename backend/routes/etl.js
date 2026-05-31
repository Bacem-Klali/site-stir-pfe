import express from 'express';
import multer from 'multer';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { verifyToken } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();
const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ETL_BASE = path.join(__dirname, '../etl');

// Multer — accept multiple files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const year = req.query.year || 'unknown'; // ← query, not body
    const uploadDir = path.join(ETL_BASE, 'uploads', `budget_${year}`);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.xlsx', '.xls'].includes(ext) ? cb(null, true) : cb(new Error('Format non supporté — xlsx uniquement'));
  },
});

// GET /api/etl/budgets — list available budget years
router.get('/budgets', verifyToken, (req, res) => {
  const outputBase = path.join(ETL_BASE, 'output');
  fs.mkdirSync(outputBase, { recursive: true });

  const activePath = path.join(outputBase, 'active', '.meta.json');
  let activeYear = null;
  if (fs.existsSync(activePath)) {
    try { activeYear = JSON.parse(fs.readFileSync(activePath)).year; } catch {}
  }

  const entries = fs.readdirSync(outputBase, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('budget_'))
    .map(d => {
      const year = d.name.replace('budget_', '');
      const metaPath = path.join(outputBase, d.name, '.meta.json');
      let importedAt = null;
      if (fs.existsSync(metaPath)) {
        try { importedAt = JSON.parse(fs.readFileSync(metaPath)).importedAt; } catch {}
      }
      return { year, importedAt, active: year === String(activeYear) };
    })
    .sort((a, b) => b.year - a.year);

  res.json({ budgets: entries, activeYear });
});

// POST /api/etl/run — upload files and run ETL
router.post('/run', verifyToken, (req, res) => {
  // Read from query param (available before body parsing)
  const year = req.query.year;
  if (!year) return res.status(400).json({ message: 'Année budgétaire requise.' });

  upload.fields([
    { name: 'activite_raffinage_consolide' },
    { name: 'importation' },
    { name: 'charges_ordinaires_impots' },
    { name: 'charges_personnel' },
    { name: 'donnees_services_charges' },
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });

    const inputDir  = path.join(ETL_BASE, 'uploads', `budget_${year}`);
    const outputDir = path.join(ETL_BASE, 'output', `budget_${year}`);
    const scriptPath = path.join(ETL_BASE, 'etl_script.py');

    fs.mkdirSync(outputDir, { recursive: true });

    // Use 'python3' fallback and log full error detail
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const command = `"${pythonCmd}" "${scriptPath}" "${inputDir}" "${outputDir}" "${year}"`;

    exec(command, { timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, async (error, stdout, stderr) => {
  
  await prisma.importLog.create({
    data: {
      userId: req.user.id,
      year: String(year),
      status: error ? 'error' : 'success',
      message: error ? (stderr || stdout) : 'ETL terminé avec succès',
      filesCount: Object.keys(req.files || {}).length,
    }
  });

  if (error) {
    return res.status(500).json({ message: 'Erreur ETL.', detail: stderr || stdout });
  }

  fs.writeFileSync(
    path.join(outputDir, '.meta.json'),
    JSON.stringify({ year, importedAt: new Date().toISOString() })
  );

  res.json({ message: `Budget ${year} traité avec succès.`, output: stdout });
});
  });
});

// POST /api/etl/activate/:year — copy year folder to active/
router.post('/activate/:year', verifyToken, (req, res) => {
  const { year } = req.params;
  const sourceDir = path.join(ETL_BASE, 'output', `budget_${year}`);
  const activeDir = path.join(ETL_BASE, 'output', 'active');

  if (!fs.existsSync(sourceDir)) {
    return res.status(404).json({ message: `Budget ${year} introuvable.` });
  }

  // Clear active dir and copy new year's files
  fs.mkdirSync(activeDir, { recursive: true });
  fs.readdirSync(activeDir).forEach(f => fs.unlinkSync(path.join(activeDir, f)));
  fs.readdirSync(sourceDir).forEach(f => {
    fs.copyFileSync(path.join(sourceDir, f), path.join(activeDir, f));
  });

  // Update active meta
  fs.writeFileSync(
    path.join(activeDir, '.meta.json'),
    JSON.stringify({ year, activatedAt: new Date().toISOString() })
  );

  res.json({ message: `Budget ${year} activé avec succès.` });
});

export default router;