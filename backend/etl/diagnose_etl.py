import pandas as pd
import sys
import os

# ==========================================
# USAGE: python diagnose_etl.py <output_folder>
# Example: python diagnose_etl.py etl/output/budget_2026
# ==========================================

if len(sys.argv) < 2:
    print("Usage: python diagnose_etl.py <output_folder>")
    sys.exit(1)

folder = sys.argv[1]

# Dim_Temps — what IDs map to what years
dim_temps_path = os.path.join(folder, 'Dim_Temps.csv')
if os.path.exists(dim_temps_path):
    dim_temps = pd.read_csv(dim_temps_path, sep=';')
    print("=" * 50)
    print("DIM_TEMPS — ID to Year mapping:")
    print(dim_temps.to_string(index=False))
else:
    print("WARNING: Dim_Temps.csv not found")
    dim_temps = None

def check_fact(filename, id_cols=['ID_Temps', 'ID_Scenario']):
    path = os.path.join(folder, filename)
    if not os.path.exists(path):
        print(f"\nWARNING: {filename} not found")
        return

    df = pd.read_csv(path, sep=';')
    print("\n" + "=" * 50)
    print(f"{filename}")
    print(f"  Total rows: {len(df)}")

    # Show unique ID_Temps values
    print(f"  Unique ID_Temps values: {sorted(df['ID_Temps'].unique().tolist())}")

    # Join with Dim_Temps to show actual years
    if dim_temps is not None:
        merged = df.merge(dim_temps, on='ID_Temps', how='left')
        year_counts = merged.groupby(['Annee', 'ID_Scenario']).size().reset_index(name='Rows')
        print(f"  Rows by Year + Scenario:")
        print(year_counts.to_string(index=False))

        # Flag anything unexpected
        all_years = merged['Annee'].dropna().unique()
        unexpected = [y for y in all_years if y > 2026 or y < 2024]
        if unexpected:
            print(f"  ⚠️  UNEXPECTED YEARS FOUND: {sorted(unexpected)}")
            # Show sample rows with unexpected years
            bad_rows = merged[merged['Annee'].isin(unexpected)].head(5)
            print(f"  Sample bad rows:")
            print(bad_rows[['ID_Temps', 'Annee', 'ID_Scenario'] + 
                           [c for c in bad_rows.columns if c not in ['ID_Temps', 'Annee', 'ID_Scenario', 'Annee']]
                           ].head(5).to_string(index=False))
        else:
            print(f"  ✔ All years look correct")
    else:
        print(f"  (Cannot resolve years — Dim_Temps missing)")

check_fact('Fact_Raffinage.csv')
check_fact('Fact_Importation.csv')
check_fact('Fact_Charges.csv')

# Also check what the mapping_annee_id would produce for common years
print("\n" + "=" * 50)
print("MAPPING CHECK — base_year=2024, range(10):")
base_year = 2024
mapping = {base_year + i: i + 1 for i in range(10)}
for year, id_ in mapping.items():
    print(f"  Year {year} → ID_Temps {id_}")

print("\n" + "=" * 50)
print("REVERSE MAPPING — ID_Temps to Year:")
for id_, year in enumerate(range(base_year, base_year + 10), start=1):
    print(f"  ID_Temps {id_} → Year {year}")
