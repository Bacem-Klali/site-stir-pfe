"""
One-time migration: load existing CSV outputs into stirsite_dw.

Usage:
  set DW_DATABASE_URL=postgresql://...
  python migrate_csv_to_dw.py 2026
  python migrate_csv_to_dw.py 2026 2027 2028
"""
import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

TABLES = [
    "dim_temps",
    "dim_scenario",
    "dim_produit",
    "dim_categorie_charge",
    "fact_production",
    "fact_importation",
    "fact_charges",
]

dw_url = os.environ.get("DW_DATABASE_URL")
if not dw_url:
    print("ERREUR: DW_DATABASE_URL manquante.")
    sys.exit(1)

if len(sys.argv) < 2:
    print("Usage: python migrate_csv_to_dw.py <year> [year ...]")
    sys.exit(1)

output_base = Path(__file__).parent / "output"
engine = create_engine(dw_url)

for year_arg in sys.argv[1:]:
    year = str(year_arg)
    schema = f"budget_{year}"
    csv_dir = output_base / schema

    if not csv_dir.is_dir():
        print(f"SKIP {year}: dossier introuvable — {csv_dir}")
        continue

    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        conn.commit()

    for table in TABLES:
        csv_path = csv_dir / f"{table}.csv"
        if not csv_path.exists():
            print(f"  SKIP {table}.csv (fichier absent)")
            continue
        df = pd.read_csv(csv_path, encoding="utf-8-sig")
        df.to_sql(table, engine, schema=schema, if_exists="replace", index=False)
        print(f"  ✔ {schema}.{table} — {len(df)} lignes")

    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO public.budget_registry (year, schema_name, imported_at)
                VALUES (:year, :schema, NOW())
                ON CONFLICT (year) DO UPDATE
                  SET schema_name = EXCLUDED.schema_name,
                      imported_at = NOW()
            """),
            {"year": year, "schema": schema},
        )
        conn.commit()

    print(f"✅ Budget {year} migré.\n")

print("Migration terminée. Activez un budget via l'interface ou POST /api/etl/activate/:year")
