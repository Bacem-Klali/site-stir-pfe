import sys
import os
import re
import pandas as pd
import numpy as np
from pathlib import Path
from sqlalchemy import create_engine, text

sys.stdout.reconfigure(encoding='utf-8')

# ==========================================
# ARGUMENTS : input_dir, year
# ==========================================
if len(sys.argv) < 3:
    print("Usage: python etl_script.py <input_dir> <year>")
    sys.exit(1)

input_dir  = Path(sys.argv[1])
BASE_YEAR_N = int(sys.argv[2])
SCHEMA_NAME = f"budget_{BASE_YEAR_N}"

dw_url = os.environ.get("DW_DATABASE_URL")
if not dw_url:
    print("ERREUR: Variable d'environnement DW_DATABASE_URL manquante.")
    sys.exit(1)

print(f"ETL démarré pour l'année budgétaire {BASE_YEAR_N}")
print(f"Dossier source  : {input_dir}")
print(f"Schéma cible    : {SCHEMA_NAME}")

# ==========================================
# FICHIERS SOURCE
# ==========================================
files = {
    "prod_file":      input_dir / "activite_raffinage_consolide.xlsx",
    "import_file":    input_dir / "importation.xlsx",
    "taxes_file":     input_dir / "charges_ordinaires_impots.xlsx",
    "personnel_file": input_dir / "charges_personnel.xlsx",
    "externes_file":  input_dir / "donnees_services_charges.xlsx",
}

for name, path in files.items():
    if not path.exists():
        print(f"ERREUR: Fichier manquant — {path}")
        sys.exit(1)

# ==========================================
# UTILITAIRES
# ==========================================
def normalize_columns(df):
    df = df.copy()
    df.columns = (
        df.columns.astype(str)
                 .str.strip()
                 .str.replace(r"\s+", "_", regex=True)
                 .str.replace(r"[^\w_]", "", regex=True)
                 .str.lower()
    )
    return df

def clean_text_cells(df):
    return df.replace({"#DIV/0!": np.nan, "#N/A": np.nan, "": np.nan})

def drop_empty_rows_cols(df):
    df = df.copy()
    df = df.dropna(axis=0, how="all")
    df = df.dropna(axis=1, how="all")
    return df

def to_numeric_safe(series):
    s = series.astype(str).str.replace(" ", "", regex=False).str.replace(",", ".", regex=False)
    s = s.replace({"nan": np.nan, "none": np.nan})
    return pd.to_numeric(s, errors="coerce")

def convert_numeric(df, numeric_cols):
    df = df.copy()
    for c in numeric_cols:
        if c in df.columns:
            df[c] = to_numeric_safe(df[c])
    return df

def parse_year(text):
    if pd.isna(text):
        return np.nan
    m = re.search(r"(20\d{2})", str(text))
    return int(m.group(1)) if m else np.nan

def parse_scenario(text):
    if pd.isna(text):
        return "Inconnu"
    t = str(text).lower()
    if "prev" in t or "prévi" in t: return "Prevision"
    if "actu" in t:                 return "Actualisation"
    if "real" in t or "réal" in t: return "Realisation"
    if "estim" in t:                return "Estimation"
    return "Inconnu"

def normalize_scenario_3(s):
    if pd.isna(s):
        return "Prevision"
    t = str(s).strip().lower()
    if "réal" in t or "real" in t: return "Realisation"
    if "actu" in t:                 return "Actualisation"
    return "Prevision"

def read_excel_all_sheets(path):
    xls = pd.ExcelFile(path, engine="openpyxl")
    dfs = []
    for sh in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sh, engine="openpyxl")
        df["__sheet"] = sh
        dfs.append(df)
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

# ==========================================
# PARTIE 1 : PRODUCTION (RAFFINAGE)
# ==========================================
print("\n[1/4] Traitement Production (Raffinage)...")

df_prod = (read_excel_all_sheets(files["prod_file"])
           .pipe(drop_empty_rows_cols)
           .pipe(clean_text_cells)
           .pipe(normalize_columns))

prod_rename = {
    "version": "version", "section": "section", "produit": "produit",
    "stock_initial_quantite": "stock_initial_qte",
    "stock_initial_pmp_or_punit": "stock_initial_prix",
    "stock_initial_montant_brut": "stock_initial_montant_brut",
    "stock_initial_pu_net": "stock_initial_prix_net",
    "stock_initial_montant_net": "stock_initial_montant_net",
    "reception_production_quantite": "reception_qte",
    "reception_production_punit": "reception_pu",
    "reception_production_montant": "reception_montant",
    "emploi_ventes_quantite": "vente_qte",
    "emploi_ventes_punit": "vente_pu",
    "emploi_ventes_montant": "vente_montant",
    "ecart_pertes": "pertes_qte",
    "stock_final_quantite": "stock_final_qte",
    "stock_final_pmp_or_pv": "stock_final_prix",
    "stock_final_montant_brut": "stock_final_montant_brut",
    "stock_final_pu_net": "stock_final_prix_net",
    "stock_final_montant_net": "stock_final_montant_net",
}
df_prod = df_prod.rename(columns={k: v for k, v in prod_rename.items() if k in df_prod.columns})

for c in ["version", "section"]:
    if c in df_prod.columns:
        df_prod[c] = df_prod[c].ffill()

if "produit" in df_prod.columns:
    df_prod = df_prod[df_prod["produit"].notna()]
    df_prod = df_prod[~df_prod["produit"].astype(str).str.lower().str.contains("total", na=False)]

prod_num_cols = [
    "stock_initial_qte", "stock_initial_prix", "stock_initial_montant_brut",
    "stock_initial_prix_net", "stock_initial_montant_net",
    "reception_qte", "reception_pu", "reception_montant",
    "vente_qte", "vente_pu", "vente_montant", "pertes_qte",
    "stock_final_qte", "stock_final_prix", "stock_final_montant_brut",
    "stock_final_prix_net", "stock_final_montant_net",
]
df_prod = convert_numeric(df_prod, prod_num_cols)

df_prod["annee"] = df_prod["version"].apply(parse_year)
df_prod["scenario"] = df_prod["version"].apply(parse_scenario)
df_prod["scenario"] = df_prod["scenario"].apply(normalize_scenario_3)
df_prod["periode_type"] = "ANNUEL"
df_prod["periode_fin_mois"] = 12

prod_measures = [c for c in prod_num_cols if c in df_prod.columns]
mask_all_zero = (df_prod[prod_measures].fillna(0).abs().sum(axis=1) == 0)
df_prod = df_prod[~mask_all_zero].copy()

print(f"  ✔ Production — {len(df_prod)} lignes")

# ==========================================
# PARTIE 2 : IMPORTATION
# ==========================================
print("\n[2/4] Traitement Importation...")

df_imp = (read_excel_all_sheets(files["import_file"])
          .pipe(drop_empty_rows_cols)
          .pipe(clean_text_cells)
          .pipe(normalize_columns))

imp_rename = {
    "typeproduit": "type_produit", "produit": "produit", "source_origine": "source_origine",
    "stock_initial_quantite": "stock_initial_qte",
    "stock_initial_pmp": "stock_initial_prix",
    "stock_initial_montant_brut": "stock_initial_montant",
    "stock_initial_pu_net": "stock_initial_prix_net",
    "stock_initial_montant_net": "stock_initial_montant_net",
    "stock_initial_pv": "stock_initial_prix_pv",
    "reception_quantite": "reception_qte",
    "reception_punit": "reception_pu",
    "reception_montant": "reception_montant",
    "ventes_quantite": "vente_qte",
    "ventes_punit": "vente_pu",
    "ventes_montant": "vente_montant",
    "ecart_perte": "pertes_qte",
    "stock_final_quantite": "stock_final_qte",
    "stock_final_pmp": "stock_final_prix",
    "stock_final_montant_brut": "stock_final_montant",
    "stock_final_pv": "stock_final_prix_pv",
    "stock_final_montant_net": "stock_final_montant_net",
}
df_imp = df_imp.rename(columns={k: v for k, v in imp_rename.items() if k in df_imp.columns})

for c in ["type_produit", "source_origine"]:
    if c in df_imp.columns:
        df_imp[c] = df_imp[c].ffill()

if "produit" in df_imp.columns:
    df_imp = df_imp[df_imp["produit"].notna()]
    df_imp = df_imp[~df_imp["produit"].astype(str).str.lower().str.contains("total", na=False)]

imp_num_cols = [
    "stock_initial_qte", "stock_initial_prix", "stock_initial_montant",
    "stock_initial_prix_net", "stock_initial_montant_net", "stock_initial_prix_pv",
    "reception_qte", "reception_pu", "reception_montant",
    "vente_qte", "vente_pu", "vente_montant", "pertes_qte",
    "stock_final_qte", "stock_final_prix", "stock_final_montant",
    "stock_final_prix_pv", "stock_final_montant_net",
]
df_imp = convert_numeric(df_imp, imp_num_cols)

src_col = "source_origine" if "source_origine" in df_imp.columns else None
if src_col:
    df_imp["annee"] = df_imp[src_col].apply(parse_year)
    df_imp["scenario"] = df_imp[src_col].apply(parse_scenario)
else:
    df_imp["annee"] = np.nan
    df_imp["scenario"] = "Inconnu"

df_imp["scenario"] = df_imp["scenario"].apply(normalize_scenario_3)
df_imp["periode_type"] = "ANNUEL"
df_imp["periode_fin_mois"] = 12

imp_measures = [c for c in imp_num_cols if c in df_imp.columns]
mask_all_zero = (df_imp[imp_measures].fillna(0).abs().sum(axis=1) == 0)
df_imp = df_imp[~mask_all_zero].copy()

print(f"  ✔ Importation — {len(df_imp)} lignes")

# ==========================================
# PARTIE 3 : CHARGES
# ==========================================
print("\n[3/4] Traitement Charges...")

df_tax = (read_excel_all_sheets(files["taxes_file"])
          .pipe(drop_empty_rows_cols).pipe(clean_text_cells).pipe(normalize_columns))
df_per = (read_excel_all_sheets(files["personnel_file"])
          .pipe(drop_empty_rows_cols).pipe(clean_text_cells).pipe(normalize_columns))
df_ext = (read_excel_all_sheets(files["externes_file"])
          .pipe(drop_empty_rows_cols).pipe(clean_text_cells).pipe(normalize_columns))

COL_MAP = {
    "annee_n":                        ("Budget",             0,  "ANNUEL", 12),
    "annee_n_1_previsions":           ("Prevision",          -1, "ANNUEL", 12),
    "annee_n_1_prevision":            ("Prevision",          -1, "ANNUEL", 12),
    "annee_n_1_estimations":          ("Estimation",         -1, "ANNUEL", 12),
    "annee_n_1_estimations_init":     ("EstimationInitiale", -1, "ANNUEL", 12),
    "annee_n_1_estimations_initiales":("EstimationInitiale", -1, "ANNUEL", 12),
    "sept_n_1":                       ("Realisation",        -1, "YTD",    9),
    "sept_n_1_reel":                  ("Realisation",        -1, "YTD",    9),
    "annee_n_1_mois_sept":            ("Realisation",        -1, "YTD",    9),
    "annee_n_2_real":                 ("Realisation",        -2, "ANNUEL", 12),
    "annee_n_2_reel":                 ("Realisation",        -2, "ANNUEL", 12),
}

def charges_to_long(df, id_col, famille, source):
    df = df.copy()
    value_cols = [c for c in df.columns if c in COL_MAP]
    if not value_cols:
        return pd.DataFrame()
    df = df[[id_col] + value_cols].copy()
    long = df.melt(id_vars=[id_col], value_vars=value_cols,
                   var_name="col_source", value_name="montant")
    long["montant"] = to_numeric_safe(long["montant"])
    long[["scenario", "offset", "periode_type", "periode_fin_mois"]] = long["col_source"].apply(
        lambda c: pd.Series(COL_MAP[c])
    )
    long["annee"] = long["offset"].apply(lambda o: BASE_YEAR_N + o)
    long = long.rename(columns={id_col: "categorie_charge"})
    long["famille_charge"] = famille
    long["source_fichier"] = source
    return long.drop(columns=["col_source", "offset"])

tax_id = "element" if "element" in df_tax.columns else df_tax.columns[0]
per_id = "categories" if "categories" in df_per.columns else df_per.columns[0]
ext_id = "element" if "element" in df_ext.columns else df_ext.columns[0]

charges_long = pd.concat([
    charges_to_long(df_tax, tax_id, "Impots_Taxes_Dotations", "taxes_file"),
    charges_to_long(df_per, per_id, "Personnel",              "personnel_file"),
    charges_to_long(df_ext, ext_id, "ChargesExternes",        "externes_file"),
], ignore_index=True)

charges_long = charges_long[charges_long["categorie_charge"].notna()]
charges_long = charges_long[~charges_long["categorie_charge"].astype(str).str.lower().str.contains("total", na=False)]
charges_long["montant"] = pd.to_numeric(charges_long["montant"], errors="coerce")
charges_long = charges_long[charges_long["montant"].fillna(0) != 0].copy()
charges_long["scenario"] = charges_long["scenario"].apply(normalize_scenario_3)
charges_long["periode_fin_mois"] = charges_long["periode_fin_mois"].astype(int)

df_chg = charges_long
print(f"  ✔ Charges — {len(df_chg)} lignes")

# ==========================================
# PARTIE 4 : DIMENSIONS + FACTS
# ==========================================
print("\n[4/4] Génération des dimensions et tables de faits...")

# Dim_Temps — from actual data
dim_temps = pd.DataFrame({
    "annee": pd.Series(pd.concat([
        df_prod["annee"], df_imp["annee"], df_chg["annee"]
    ], ignore_index=True).dropna().unique()).astype(int)
}).sort_values("annee").reset_index(drop=True)
dim_temps["TempsKey"] = np.arange(1, len(dim_temps) + 1, dtype=int)
dim_temps = dim_temps[["TempsKey", "annee"]]

# Dim_Scenario
dim_scenario = pd.concat([
    df_prod[["scenario", "periode_type", "periode_fin_mois"]],
    df_imp[["scenario",  "periode_type", "periode_fin_mois"]],
    df_chg[["scenario",  "periode_type", "periode_fin_mois"]],
], ignore_index=True).drop_duplicates()
dim_scenario = dim_scenario[dim_scenario["scenario"].isin(["Realisation", "Actualisation", "Prevision"])]
dim_scenario = dim_scenario.sort_values(["scenario", "periode_type", "periode_fin_mois"]).reset_index(drop=True)
dim_scenario["ScenarioKey"] = np.arange(1, len(dim_scenario) + 1, dtype=int)
dim_scenario = dim_scenario[["ScenarioKey", "scenario", "periode_type", "periode_fin_mois"]]

# Dim_Produit — built from data
def infer_type_produit(section):
    if pd.isna(section): return "Inconnu"
    s = str(section).lower()
    if "brut" in s:       return "Brut"
    if "semi" in s:       return "Semi-fini"
    if "pollu" in s:      return "Pollué"
    if "production" in s: return "Fini"
    return "Inconnu"

prod_products = df_prod[["produit"]].copy()
prod_products["type_produit"] = df_prod["section"].apply(infer_type_produit) if "section" in df_prod.columns else "Inconnu"
prod_products = prod_products.dropna(subset=["produit"]).drop_duplicates()

imp_products = df_imp[["produit"]].copy()
imp_products["type_produit"] = df_imp["type_produit"].fillna("Importé") if "type_produit" in df_imp.columns else "Importé"
imp_products = imp_products.dropna(subset=["produit"]).drop_duplicates()

dim_produit = pd.concat([prod_products, imp_products], ignore_index=True)
dim_produit["produit"] = dim_produit["produit"].astype(str).str.strip()
dim_produit = (dim_produit
               .groupby("produit", as_index=False)
               .agg(type_produit=("type_produit", lambda x: x.value_counts().index[0])))
dim_produit = dim_produit.sort_values("produit").reset_index(drop=True)
dim_produit["ProduitKey"] = np.arange(1, len(dim_produit) + 1, dtype=int)
dim_produit["unite"] = "Tonne"
dim_produit["prix_unite"] = "TND/Tonne"
dim_produit = dim_produit[["ProduitKey", "produit", "type_produit", "unite", "prix_unite"]]

# Dim_Categorie_Charge
dim_cat_charge = (df_chg[["categorie_charge", "famille_charge"]]
                  .dropna().drop_duplicates()
                  .sort_values(["famille_charge", "categorie_charge"])
                  .reset_index(drop=True))
dim_cat_charge["CategorieChargeKey"] = np.arange(1, len(dim_cat_charge) + 1, dtype=int)
dim_cat_charge = dim_cat_charge[["CategorieChargeKey", "categorie_charge", "famille_charge"]]

# FK helpers
def add_fk_temps(df):
    return df.merge(dim_temps, on="annee", how="left")

def add_fk_scenario(df):
    return df.merge(dim_scenario, on=["scenario", "periode_type", "periode_fin_mois"], how="left")

def add_fk_produit(df):
    return df.merge(dim_produit[["ProduitKey", "produit"]], on="produit", how="left")

# Fact_Production
fact_production = df_prod.copy()
fact_production["produit"] = fact_production["produit"].astype(str).str.strip()
fact_production = (fact_production.pipe(add_fk_temps).pipe(add_fk_scenario).pipe(add_fk_produit))
prod_fact_cols = ["TempsKey", "ScenarioKey", "ProduitKey"] + prod_measures
prod_fact_cols = [c for c in prod_fact_cols if c in fact_production.columns]
fact_production = fact_production[prod_fact_cols].copy()
fact_production = (fact_production
                   .groupby(["TempsKey", "ScenarioKey", "ProduitKey"], as_index=False)[prod_measures]
                   .sum(min_count=1))

# Fact_Importation
fact_importation = df_imp.copy()
fact_importation["produit"] = fact_importation["produit"].astype(str).str.strip()
fact_importation = (fact_importation.pipe(add_fk_temps).pipe(add_fk_scenario).pipe(add_fk_produit))
imp_fact_cols = ["TempsKey", "ScenarioKey", "ProduitKey"] + imp_measures
imp_fact_cols = [c for c in imp_fact_cols if c in fact_importation.columns]
fact_importation = fact_importation[imp_fact_cols].copy()
fact_importation = (fact_importation
                    .groupby(["TempsKey", "ScenarioKey", "ProduitKey"], as_index=False)[imp_measures]
                    .sum(min_count=1))

# Fact_Charges
fact_charges = df_chg.copy()
fact_charges = (fact_charges
                .pipe(add_fk_temps)
                .pipe(add_fk_scenario)
                .merge(dim_cat_charge, on=["categorie_charge", "famille_charge"], how="left"))
fact_charges = fact_charges[["TempsKey", "ScenarioKey", "CategorieChargeKey", "montant"]].copy()
fact_charges = (fact_charges
                .groupby(["TempsKey", "ScenarioKey", "CategorieChargeKey"], as_index=False)["montant"]
                .sum(min_count=1))

# ==========================================
# EXPORT PostgreSQL (stirsite_dw)
# ==========================================
tables = {
    "dim_temps":              dim_temps,
    "dim_scenario":           dim_scenario,
    "dim_produit":            dim_produit,
    "dim_categorie_charge":   dim_cat_charge,
    "fact_production":        fact_production,
    "fact_importation":       fact_importation,
    "fact_charges":           fact_charges,
}

engine = create_engine(dw_url)

with engine.connect() as conn:
    conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA_NAME}"'))
    conn.commit()

for name, df in tables.items():
    df.to_sql(
        name,
        engine,
        schema=SCHEMA_NAME,
        if_exists="replace",
        index=False,
        method="multi",
        chunksize=1000,
    )
    print(f"  ✔ {SCHEMA_NAME}.{name} — {len(df)} lignes")

with engine.connect() as conn:
    conn.execute(
        text("""
            INSERT INTO public.budget_registry (year, schema_name, imported_at)
            VALUES (:year, :schema, NOW())
            ON CONFLICT (year) DO UPDATE
              SET schema_name = EXCLUDED.schema_name,
                  imported_at = NOW()
        """),
        {"year": str(BASE_YEAR_N), "schema": SCHEMA_NAME},
    )
    conn.commit()

print(f"\n✅ ETL terminé avec succès pour le budget {BASE_YEAR_N} !")
