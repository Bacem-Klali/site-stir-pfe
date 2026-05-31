import sys
import os
import pandas as pd
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

# ==========================================
# ARGUMENTS : input_dir, output_dir, year
# ==========================================
if len(sys.argv) < 4:
    print("Usage: python etl_script.py <input_dir> <output_dir> <year>")
    sys.exit(1)

input_dir  = sys.argv[1]
output_dir = sys.argv[2]
year       = int(sys.argv[3])

os.makedirs(output_dir, exist_ok=True)

def inp(filename):
    return os.path.join(input_dir, filename)

def out(filename):
    return os.path.join(output_dir, filename)

# ==========================================
# MAPPING DYNAMIQUE (auto selon l'année)
# ==========================================
# On génère les IDs dynamiquement à partir de l'année de base
mapping_annee_id = {
    year - 2: 1,
    year - 1: 2,
    year:     3,
}
mapping_scenario_id = {'Prévision': 1, 'Actualisation': 2, 'Réalisation': 3}

print(f"ETL démarré pour l'année budgétaire {year}")
print(f"Dossier source  : {input_dir}")
print(f"Dossier sortie  : {output_dir}")

# ==========================================
# PARTIE 1 : FACT_RAFFINAGE
# ==========================================
PRODUITS_AUTORISES = [
    'PB1', 'PB2', 'PB3', 'Ess L Raffinée', 'Slop', 'GPL',
    'Ess Ss Plomb', 'Pétrole', 'Gas oil', 'Fuel oil BTS',
    'White Spirit', 'Fuel oil BTS (Exp)', 'V Naphte (Exp)'
]

mapping_section_raf = {'1- Pétrole Brut': 1, '2- Produits Semi-finis': 2, '3- Production': 3}

mapping_produit_id = {
    'PB1': 1, 'PB2': 2, 'PB3': 3, 'Ess L Raffinée': 4, 'Slop': 5,
    'Produits pollués': 6, 'Fuel déclassé': 7, 'GPL': 8, 'Ess Ss Plomb': 9,
    'Pétrole': 10, 'Gas oil': 11, 'Fuel oil BTS': 12, 'Fuel oil HTS': 13,
    'White Spirit': 14, 'V Naphte': 15, 'Fuel oil BTS (Exp)': 12, 'V Naphte (Exp)': 15
}

print("\n[1/6] Traitement Fact_Raffinage...")
df_raf_raw = pd.read_excel(inp('activite_raffinage_consolide.xlsx'))
df_raf_raw.columns = df_raf_raw.columns.str.strip()

df_raf = df_raf_raw.replace('#DIV/0!', np.nan).copy()
df_raf = df_raf[df_raf['Produit'].notna()].copy()
df_raf = df_raf[~df_raf['Produit'].str.contains('Total', case=False, na=False)].copy()
df_raf = df_raf[df_raf['Produit'].isin(PRODUITS_AUTORISES)].copy()

df_raf['Annee'] = df_raf['Version'].str.extract(r'\((\d{4})\)').astype(float)
df_raf['Scenario_txt'] = df_raf['Version'].str.split(r' \(').str[0]

def map_scenario(texte):
    texte = str(texte).lower()
    if 'prévision' in texte or 'prevision' in texte: return 'Prévision'
    elif 'actualisation' in texte or 'actu' in texte: return 'Actualisation'
    elif 'réalisation' in texte or 'realisation' in texte: return 'Réalisation'
    else: return 'Inconnu'

df_raf['Libelle_Scenario'] = df_raf['Scenario_txt'].apply(map_scenario)
df_raf['ID_Temps']    = df_raf['Annee'].map(mapping_annee_id)
df_raf['ID_Scenario'] = df_raf['Libelle_Scenario'].map(mapping_scenario_id)
df_raf['ID_Section']  = df_raf['Section'].map(mapping_section_raf)
df_raf['ID_Produit']  = df_raf['Produit'].map(mapping_produit_id)

df_fact_raf = df_raf.rename(columns={
    'Reception_Production_Quantite': 'Qte_Brut_Entre',
    'Reception_Production_Montant': 'MD_Brut_Entre',
    'Emploi_Ventes_Quantite': 'Qte_Production_Sortie',
    'Emploi_Ventes_Montant': 'MD_Production_Sortie',
    'Ecart_Pertes': 'Ecart_Pertes',
    'Stock_Final_Quantite': 'Qte_Stock_Fin',
    'Stock_Final_Montant_Net': 'MD_Stock_Fin'
})

colonnes_finales_raf = ['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit',
                        'Qte_Brut_Entre', 'MD_Brut_Entre', 'Qte_Production_Sortie',
                        'MD_Production_Sortie', 'Ecart_Pertes', 'Qte_Stock_Fin', 'MD_Stock_Fin']
colonnes_presentes = [c for c in colonnes_finales_raf if c in df_fact_raf.columns]
Fact_Raf = df_fact_raf[colonnes_presentes].copy()

cols_num_raf = [c for c in colonnes_finales_raf if c not in ['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit']]
for col in cols_num_raf:
    if col in Fact_Raf.columns:
        Fact_Raf[col] = pd.to_numeric(Fact_Raf[col], errors='coerce')

Fact_Raf[cols_num_raf] = Fact_Raf[cols_num_raf].fillna(0)
Fact_Raf = Fact_Raf.dropna(subset=['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit'])
Fact_Raf = Fact_Raf[(Fact_Raf[cols_num_raf] != 0).any(axis=1)].copy()
Fact_Raf['ID_Temps']    = Fact_Raf['ID_Temps'].astype(int)
Fact_Raf['ID_Scenario'] = Fact_Raf['ID_Scenario'].astype(int)
Fact_Raf['ID_Section']  = Fact_Raf['ID_Section'].astype(int)
Fact_Raf['ID_Produit']  = Fact_Raf['ID_Produit'].astype(int)

# Prix unitaires
Fact_Raf['Prix_Achat_Brut'] = np.where(Fact_Raf['Qte_Brut_Entre'] > 0, (Fact_Raf['MD_Brut_Entre'] / Fact_Raf['Qte_Brut_Entre']).round(3), 0)
Fact_Raf['Prix_Vente_Production'] = np.where(Fact_Raf['Qte_Production_Sortie'] > 0, (Fact_Raf['MD_Production_Sortie'] / Fact_Raf['Qte_Production_Sortie']).round(3), 0)
Fact_Raf['Prix_Stock_Fin'] = np.where(Fact_Raf['Qte_Stock_Fin'] > 0, (Fact_Raf['MD_Stock_Fin'] / Fact_Raf['Qte_Stock_Fin']).round(3), 0)

Fact_Raf.to_csv(out('Fact_Raffinage.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Fact_Raffinage.csv — {len(Fact_Raf)} lignes")

# ==========================================
# PARTIE 2 : FACT_IMPORTATION
# ==========================================
print("\n[2/6] Traitement Fact_Importation...")

mapping_libelle_produit = {
    'GPL': 'GPL', 'GPL STEG': 'GPL', 'GPL ETAP-SH': 'GPL',
    'GPL ETAP-EN': 'GPL', 'GPL ETAP-OM': 'GPL', 'GPL ETAP-BG': 'GPL',
    'Butane C/C': 'Butane', 'Butane B/C': 'Butane',
    'Ess Ss Plomb': 'Ess Ss Plomb', 'Gas oil': 'Gas oil',
    'Gas oil 50ppm': 'Gas oil', 'Fuel oil': 'Fuel oil', 'Jet A1': 'Jet A1'
}

mapping_produit_id_imp = {
    'GPL': 8, 'Ess Ss Plomb': 9, 'Pétrole': 10, 'Gas oil': 11,
    'Fuel oil BTS': 12, 'Butane': 16, 'Jet A1': 17, 'Fuel oil': 12
}

def map_section_import(type_str):
    return 4 if 'bizerte' in str(type_str).lower() else 5

df_imp_raw = pd.read_excel(inp('importation.xlsx'))
df_imp_raw.columns = df_imp_raw.columns.str.strip()
df_imp = df_imp_raw.replace('#DIV/0!', np.nan).copy()
df_imp = df_imp[df_imp['Produit'].notna()].copy()
df_imp = df_imp[~df_imp['Produit'].str.contains('Total', case=False, na=False)].copy()
df_imp = df_imp[df_imp['Produit'].isin(mapping_libelle_produit.keys())].copy()

df_imp['Produit_Standard'] = df_imp['Produit'].map(mapping_libelle_produit)
df_imp['Annee'] = df_imp['Source_Origine'].str[-4:].astype(float)
df_imp['Scenario_txt'] = df_imp['Source_Origine'].str.split('_').str[0]
df_imp['Libelle_Scenario'] = df_imp['Scenario_txt'].apply(map_scenario)
df_imp['ID_Temps']    = df_imp['Annee'].map(mapping_annee_id)
df_imp['ID_Scenario'] = df_imp['Libelle_Scenario'].map(mapping_scenario_id)
df_imp['ID_Section']  = df_imp['Type'].apply(map_section_import)
df_imp['ID_Produit']  = df_imp['Produit_Standard'].map(mapping_produit_id_imp)

df_fact_imp = df_imp.rename(columns={
    'Reception_Quantite': 'Qte_Importee', 'Reception_Montant': 'MD_Importee',
    'Ventes_Quantite': 'Qte_Vendue', 'Ventes_Montant': 'MD_Vendue',
    'Stock_Final_Quantite': 'Qte_Stock_Fin', 'Stock_Final_Montant_Net': 'MD_Stock_Fin'
})

colonnes_finales_imp = ['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit',
                        'Qte_Importee', 'MD_Importee', 'Qte_Vendue', 'MD_Vendue',
                        'Qte_Stock_Fin', 'MD_Stock_Fin']
colonnes_presentes_imp = [c for c in colonnes_finales_imp if c in df_fact_imp.columns]
df_temp = df_fact_imp[colonnes_presentes_imp].copy()

cols_num_imp = [c for c in colonnes_finales_imp if c not in ['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit']]
for col in cols_num_imp:
    if col in df_temp.columns:
        if df_temp[col].dtype == object:
            df_temp[col] = df_temp[col].astype(str).str.replace(',', '.').astype(float)
        df_temp[col] = pd.to_numeric(df_temp[col], errors='coerce')

df_temp[cols_num_imp] = df_temp[cols_num_imp].fillna(0)
df_temp = df_temp.dropna(subset=['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit'])
df_temp = df_temp[(df_temp[cols_num_imp] != 0).any(axis=1)].copy()
Fact_Imp = df_temp.groupby(['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit'], as_index=False).sum()

# Fix Fuel oil IDs for import sections
Fact_Imp.loc[(Fact_Imp['ID_Produit'] == 12) & (Fact_Imp['ID_Section'].isin([4, 5])), 'ID_Produit'] = 18

for col in ['ID_Temps', 'ID_Scenario', 'ID_Section', 'ID_Produit']:
    Fact_Imp[col] = Fact_Imp[col].astype(int)

# Prix unitaires
Fact_Imp['Prix_Achat_Import'] = np.where(Fact_Imp['Qte_Importee'] > 0, (Fact_Imp['MD_Importee'] / Fact_Imp['Qte_Importee']).round(3), 0)
Fact_Imp['Prix_Vente_Import'] = np.where(Fact_Imp['Qte_Vendue'] > 0, (Fact_Imp['MD_Vendue'] / Fact_Imp['Qte_Vendue']).round(3), 0)

Fact_Imp.to_csv(out('Fact_Importation.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Fact_Importation.csv — {len(Fact_Imp)} lignes")

# ==========================================
# PARTIE 3 : FACT_CHARGES
# ==========================================
print("\n[3/6] Traitement Fact_Charges...")

mapping_annee_id_ch  = mapping_annee_id
mapping_scenario_id_ch = {'Prévision': 1, 'Réalisation': 3}

mapping_libelle_id = {
    'Ecole pompiers': 1, "Frais d'enregistrement": 2, 'Taxe de circulation': 3,
    'Impot sur les societes': 4, 'Autres impots et taxes': 5,
    'Dotations aux amortissements': 6, 'Dotations aux provisions': 7,
    'Salaires': 8, 'Heures supplementaires': 9, 'Primes et indemnites': 10,
    'Avantages en nature': 11, 'Conges payes': 12, 'Cotisations CNSS': 13,
    'Regime assurance maladie': 14, 'Charges formation prof.': 15,
    'Locations (Kiraat)': 16, 'Services communs (Kiraat)': 17, 'Entretien (Abaa)': 18,
    'Assurances (Apsat)': 19, 'Etudes et recherches': 20, 'Personnel extérieur': 21,
    'Audit et contrôle': 22, 'Publicité et inscriptions': 23, 'Attente supplémentaire': 24,
    'Transport de marchandises': 25, 'Frais de mission': 26, 'Déplacements': 27,
    'Frais de mission (suite)': 28, 'Réceptions': 29, 'Frais postaux': 30, 'Commission Hedging': 31
}

def process_charges(filepath, col_libelle, col_prev, col_real_curr, col_real_prev, year):
    df = pd.read_excel(filepath)
    df.columns = df.columns.str.strip()
    df = df.replace('#DIV/0!', np.nan)
    df = df[df[col_libelle].notna()].copy()
    df = df.rename(columns={col_libelle: 'Libelle_Charge'})
    df['Libelle_Charge'] = df['Libelle_Charge'].str.strip()
    df['ID_Nature_Charge'] = df['Libelle_Charge'].map(mapping_libelle_id)

    parts = []
    if col_prev and col_prev in df.columns:
        p = df[['ID_Nature_Charge', col_prev]].copy().rename(columns={col_prev: 'Montant_MD'})
        p['Annee'] = year - 1      # Annee_n_1_Previsions → forecast for year n-1
        p['Scenario'] = 'Prévision'
        parts.append(p)
    if col_real_curr and col_real_curr in df.columns:
        p = df[['ID_Nature_Charge', col_real_curr]].copy().rename(columns={col_real_curr: 'Montant_MD'})
        p['Annee'] = year - 1      # Sept_n_1 → partial realisation of year n-1
        p['Scenario'] = 'Réalisation'
        parts.append(p)
    if col_real_prev and col_real_prev in df.columns:
        p = df[['ID_Nature_Charge', col_real_prev]].copy().rename(columns={col_real_prev: 'Montant_MD'})
        p['Annee'] = year - 2      # Annee_n_2_Real → full realisation of year n-2
        p['Scenario'] = 'Réalisation'
        parts.append(p)

    result = pd.concat(parts, ignore_index=True)
    result['Montant_MD']   = pd.to_numeric(result['Montant_MD'], errors='coerce')
    result['ID_Temps']     = result['Annee'].map(mapping_annee_id_ch)
    result['ID_Scenario']  = result['Scenario'].map(mapping_scenario_id_ch)
    result = result[['ID_Temps', 'ID_Scenario', 'ID_Nature_Charge', 'Montant_MD']]
    result = result.dropna()
    result = result[result['Montant_MD'] != 0]
    for col in ['ID_Temps', 'ID_Scenario', 'ID_Nature_Charge']:
        result[col] = result[col].astype(int)
    return result

part1 = process_charges(inp('charges_ordinaires_impots.xlsx'), 'Element',
                        'Annee_n_1_Previsions', 'Sept_n_1', 'Annee_n_2_Real', year)
part2 = process_charges(inp('charges_personnel.xlsx'), 'Categories',
                        'Annee_n_1_Previsions', 'Sept_n_1_Reel', 'Annee_n_2_Reel', year)
part3 = process_charges(inp('donnees_services_charges.xlsx'), 'Element',
                        'Annee_n_1_Previsions', 'Annee_n_1_Mois_Sept', 'Annee_n_2_Real', year)

Fact_Charges = pd.concat([part1, part2, part3], ignore_index=True)
Fact_Charges = Fact_Charges.sort_values(by=['ID_Temps', 'ID_Scenario', 'ID_Nature_Charge']).reset_index(drop=True)
Fact_Charges.to_csv(out('Fact_Charges.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Fact_Charges.csv — {len(Fact_Charges)} lignes")

# ==========================================
# PARTIE 4 : DIMS (statiques)
# ==========================================
# ==========================================
# PARTIE 4 : DIMS (statiques)
# ==========================================
print("\n[4/6] Génération des dimensions...")

# Dim_Scenario
Dim_Scenario = pd.DataFrame([
    {'ID_Scenario': 1, 'Libelle_Scenario': 'Prévision'},
    {'ID_Scenario': 2, 'Libelle_Scenario': 'Actualisation'},
    {'ID_Scenario': 3, 'Libelle_Scenario': 'Réalisation'}
])
Dim_Scenario.to_csv(out('Dim_Scenario.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Dim_Scenario.csv — {len(Dim_Scenario)} lignes")

# Dim_Section
Dim_Section = pd.DataFrame([
    {'ID_Section': 1, 'Libelle_Section': '1- Pétrole Brut',        'Domaine_Activite': 'Raffinage'},
    {'ID_Section': 2, 'Libelle_Section': '2- Produits Semi-finis',  'Domaine_Activite': 'Raffinage'},
    {'ID_Section': 3, 'Libelle_Section': '3- Production Finie',     'Domaine_Activite': 'Raffinage'},
    {'ID_Section': 4, 'Libelle_Section': '4- Import sur Bizerte',   'Domaine_Activite': 'Importation'},
    {'ID_Section': 5, 'Libelle_Section': '5- Import Hors Bizerte',  'Domaine_Activite': 'Importation'}
])
Dim_Section.to_csv(out('Dim_Section.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Dim_Section.csv — {len(Dim_Section)} lignes")

# Dim_Prdt — exact structure from reference
Dim_Prdt = pd.DataFrame([
    {'ID_Produit': 1,  'Nom_Produit': 'PB1',             'ID_Section': 1},
    {'ID_Produit': 2,  'Nom_Produit': 'PB2',             'ID_Section': 1},
    {'ID_Produit': 3,  'Nom_Produit': 'PB3',             'ID_Section': 1},
    {'ID_Produit': 4,  'Nom_Produit': 'Ess L Raffinée',  'ID_Section': 2},
    {'ID_Produit': 5,  'Nom_Produit': 'Slop',            'ID_Section': 2},
    {'ID_Produit': 6,  'Nom_Produit': 'Produits pollués','ID_Section': 2},
    {'ID_Produit': 7,  'Nom_Produit': 'Fuel déclassé',   'ID_Section': 2},
    {'ID_Produit': 8,  'Nom_Produit': 'GPL',             'ID_Section': 3},
    {'ID_Produit': 9,  'Nom_Produit': 'Ess Ss Plomb',    'ID_Section': 3},
    {'ID_Produit': 10, 'Nom_Produit': 'Pétrole',         'ID_Section': 3},
    {'ID_Produit': 11, 'Nom_Produit': 'Gas oil',         'ID_Section': 3},
    {'ID_Produit': 12, 'Nom_Produit': 'Fuel oil BTS',    'ID_Section': 3},
    {'ID_Produit': 13, 'Nom_Produit': 'Fuel oil HTS',    'ID_Section': 3},
    {'ID_Produit': 14, 'Nom_Produit': 'White Spirit',    'ID_Section': 3},
    {'ID_Produit': 15, 'Nom_Produit': 'V Naphte',        'ID_Section': 3},
    {'ID_Produit': 16, 'Nom_Produit': 'Butane',          'ID_Section': 4},
    {'ID_Produit': 17, 'Nom_Produit': 'Jet A1',          'ID_Section': 4},
    {'ID_Produit': 18, 'Nom_Produit': 'Fuel oil',        'ID_Section': 4}
])
Dim_Prdt.to_csv(out('Dim_Prdt.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Dim_Prdt.csv — {len(Dim_Prdt)} lignes")

# Dim_Temps

Dim_Temps = pd.DataFrame([
    {'ID_Temps': 1, 'Annee': year - 2},
    {'ID_Temps': 2, 'Annee': year - 1},
    {'ID_Temps': 3, 'Annee': year},
])
Dim_Temps.to_csv(out('Dim_Temps.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Dim_Temps.csv — {len(Dim_Temps)} lignes")

# Dim_Charge_Globale — exact structure from reference
donnees_nature = [
    {'ID_Nature_Charge': 1,  'Libelle_Charge': 'Ecole pompiers',              'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',  'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 2,  'Libelle_Charge': "Frais d'enregistrement",      'ID_Categorie': 2, 'Libelle_Categorie': 'Impôts et taxes',        'Regroupement_Strategique': 'Charges Fiscales'},
    {'ID_Nature_Charge': 3,  'Libelle_Charge': 'Taxe de circulation',         'ID_Categorie': 2, 'Libelle_Categorie': 'Impôts et taxes',        'Regroupement_Strategique': 'Charges Fiscales'},
    {'ID_Nature_Charge': 4,  'Libelle_Charge': 'Impot sur les societes',      'ID_Categorie': 2, 'Libelle_Categorie': 'Impôts et taxes',        'Regroupement_Strategique': 'Charges Fiscales'},
    {'ID_Nature_Charge': 5,  'Libelle_Charge': 'Autres impots et taxes',      'ID_Categorie': 2, 'Libelle_Categorie': 'Impôts et taxes',        'Regroupement_Strategique': 'Charges Fiscales'},
    {'ID_Nature_Charge': 6,  'Libelle_Charge': 'Dotations aux amortissements','ID_Categorie': 3, 'Libelle_Categorie': 'Dotations',              'Regroupement_Strategique': 'Charges Calculées'},
    {'ID_Nature_Charge': 7,  'Libelle_Charge': 'Dotations aux provisions',    'ID_Categorie': 3, 'Libelle_Categorie': 'Dotations',              'Regroupement_Strategique': 'Charges Calculées'},
    {'ID_Nature_Charge': 8,  'Libelle_Charge': 'Salaires',                    'ID_Categorie': 4, 'Libelle_Categorie': 'Charges de personnel',   'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 9,  'Libelle_Charge': 'Heures supplementaires',      'ID_Categorie': 4, 'Libelle_Categorie': 'Charges de personnel',   'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 10, 'Libelle_Charge': 'Primes et indemnites',        'ID_Categorie': 4, 'Libelle_Categorie': 'Charges de personnel',   'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 11, 'Libelle_Charge': 'Avantages en nature',         'ID_Categorie': 4, 'Libelle_Categorie': 'Charges de personnel',   'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 12, 'Libelle_Charge': 'Conges payes',                'ID_Categorie': 4, 'Libelle_Categorie': 'Charges de personnel',   'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 13, 'Libelle_Charge': 'Cotisations CNSS',            'ID_Categorie': 5, 'Libelle_Categorie': 'Charges sociales',       'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 14, 'Libelle_Charge': 'Regime assurance maladie',    'ID_Categorie': 5, 'Libelle_Categorie': 'Charges sociales',       'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 15, 'Libelle_Charge': 'Charges formation prof.',     'ID_Categorie': 5, 'Libelle_Categorie': 'Charges sociales',       'Regroupement_Strategique': 'Charges de Personnel'},
    {'ID_Nature_Charge': 16, 'Libelle_Charge': 'Locations (Kiraat)',          'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 17, 'Libelle_Charge': 'Services communs (Kiraat)',   'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 18, 'Libelle_Charge': 'Entretien (Abaa)',            'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 19, 'Libelle_Charge': 'Assurances (Apsat)',          'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 20, 'Libelle_Charge': 'Etudes et recherches',        'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 21, 'Libelle_Charge': 'Personnel extérieur',         'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 22, 'Libelle_Charge': 'Audit et contrôle',           'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 23, 'Libelle_Charge': 'Publicité et inscriptions',   'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 24, 'Libelle_Charge': 'Attente supplémentaire',      'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 25, 'Libelle_Charge': 'Transport de marchandises',   'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 26, 'Libelle_Charge': 'Frais de mission',            'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 27, 'Libelle_Charge': 'Déplacements',                'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 28, 'Libelle_Charge': 'Frais de mission (suite)',    'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 29, 'Libelle_Charge': 'Réceptions',                  'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 30, 'Libelle_Charge': 'Frais postaux',               'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
    {'ID_Nature_Charge': 31, 'Libelle_Charge': 'Commission Hedging',          'ID_Categorie': 1, 'Libelle_Categorie': 'Services extérieurs',    'Regroupement_Strategique': 'Charges Opérationnelles'},
]
Dim_Charge_Globale = pd.DataFrame(donnees_nature)
Dim_Charge_Globale.to_csv(out('Dim_Charge_Globale.csv'), sep=';', index=False, encoding='utf-8-sig')
print(f"  ✔ Dim_Charge_Globale.csv — {len(Dim_Charge_Globale)} lignes")

print(f"\n✅ ETL terminé avec succès pour le budget {year} !")