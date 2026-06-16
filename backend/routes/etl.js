import express from 'express';
import multer from 'multer';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { verifyToken } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import { listBudgets, activateBudget } from '../lib/dw.js';


const prisma = new PrismaClient();
const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ETL_BASE = path.join(__dirname, '../etl');

// Multer — accept multiple files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const year = req.query.year || 'unknown';
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

// GET /api/etl/budgets — list available budget years from stirsite_dw
router.get('/budgets', verifyToken, async (req, res) => {
  try {
    const { budgets, activeYear } = await listBudgets();
    res.json({ budgets, activeYear });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur de connexion au data warehouse.' });
  }
});

// POST /api/etl/run — upload files and run ETL
router.post('/run', verifyToken, (req, res) => {
  const year = req.query.year;
  if (!year) return res.status(400).json({ message: 'Année budgétaire requise.' });

  if (!process.env.DW_DATABASE_URL) {
    return res.status(500).json({ message: 'DW_DATABASE_URL non configurée.' });
  }

  upload.fields([
    { name: 'activite_raffinage_consolide' },
    { name: 'importation' },
    { name: 'charges_ordinaires_impots' },
    { name: 'charges_personnel' },
    { name: 'donnees_services_charges' },
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });

    const inputDir  = path.join(ETL_BASE, 'uploads', `budget_${year}`);
    const scriptPath = path.join(ETL_BASE, 'etl_script.py');

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const command = `"${pythonCmd}" "${scriptPath}" "${inputDir}" "${year}"`;

    exec(command, { timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, async (error, stdout, stderr) => {
      await prisma.importLog.create({
        data: {
          userId: req.user.id,
          year: String(year),
          status: error ? 'error' : 'success',
          message: error ? (stderr || stdout) : 'ETL terminé avec succès',
          filesCount: Object.keys(req.files || {}).length,
        },
      });

      if (error) {
        return res.status(500).json({ message: 'Erreur ETL.', detail: stderr || stdout });
      }

      res.json({ message: `Budget ${year} traité avec succès.`, output: stdout });
    });
  });
});

// POST /api/etl/activate/:year — point active_view to the budget schema
router.post('/activate/:year', verifyToken, async (req, res) => {
  try {
    await activateBudget(req.params.year);
    res.json({ message: `Budget ${req.params.year} activé avec succès.` });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Erreur lors de l\'activation.' });
  }
});

export default router;
