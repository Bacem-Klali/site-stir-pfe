import '../loadEnv.js';
import pg from 'pg';

const { Pool } = pg;

const DW_TABLES = [
  'dim_temps',
  'dim_scenario',
  'dim_produit',
  'dim_categorie_charge',
  'fact_production',
  'fact_importation',
  'fact_charges',
];

let pool;

function getPool() {
  if (!process.env.DW_DATABASE_URL) {
    throw new Error('DW_DATABASE_URL non configurée.');
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DW_DATABASE_URL });
  }
  return pool;
}

function validateYear(year) {
  if (!/^\d{4}$/.test(String(year))) {
    const err = new Error('Année budgétaire invalide.');
    err.status = 400;
    throw err;
  }
}

export function budgetSchemaName(year) {
  validateYear(year);
  return `budget_${year}`;
}

export async function schemaExists(schemaName) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
    [schemaName]
  );
  return rows.length > 0;
}

export async function budgetHasData(year) {
  const schema = budgetSchemaName(year);
  if (!(await schemaExists(schema))) return false;

  const { rows } = await getPool().query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = 'fact_production'
     LIMIT 1`,
    [schema]
  );
  return rows.length > 0;
}

export async function listBudgets() {
  const db = getPool();

  const { rows: registry } = await db.query(
    `SELECT year, imported_at FROM public.budget_registry ORDER BY year DESC`
  );

  const { rows: config } = await db.query(
    `SELECT active_schema FROM public.budget_config WHERE id = 1`
  );

  const activeSchema = config[0]?.active_schema ?? null;
  const activeYear = activeSchema?.startsWith('budget_')
    ? activeSchema.replace('budget_', '')
    : null;

  const budgets = registry.map(({ year, imported_at }) => ({
    year,
    importedAt: imported_at,
    active: activeYear === String(year),
  }));

  return { budgets, activeYear };
}

export async function activateBudget(year) {
  const schema = budgetSchemaName(year);

  if (!(await budgetHasData(year))) {
    const err = new Error(`Budget ${year} introuvable.`);
    err.status = 404;
    throw err;
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows: views } = await client.query(
      `SELECT viewname FROM pg_views WHERE schemaname = 'active_view'`
    );
    for (const { viewname } of views) {
      await client.query(`DROP VIEW IF EXISTS active_view."${viewname}"`);
    }

    for (const table of DW_TABLES) {
      await client.query(
        `CREATE VIEW active_view."${table}" AS SELECT * FROM "${schema}"."${table}"`
      );
    }

    await client.query(
      `UPDATE public.budget_config
       SET active_schema = $1, activated_at = NOW()
       WHERE id = 1`,
      [schema]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
