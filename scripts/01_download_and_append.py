# scripts/01_download_and_append.py

# Run from project root:
# uv run python scripts/01_download_and_append.py

from pathlib import Path
from urllib.parse import urljoin, unquote
import re

import pandas as pd
import requests


# ------------------------------------------------------------
# Settings
# ------------------------------------------------------------

BASE_URL = "https://www.hotcity.co.nz"

RAW_DIR = Path("data/raw")
INTERIM_DIR = Path("data/interim")

RAW_DIR.mkdir(parents=True, exist_ok=True)
INTERIM_DIR.mkdir(parents=True, exist_ok=True)

OUT_CSV = INTERIM_DIR / "pedestrian_appended_raw.csv"
OUT_MANIFEST = INTERIM_DIR / "download_manifest.csv"

links = [
    "/sites/20180201.prod.hotcity.co.nz/files/2026-05/All%20pedestrian%20data%20day%20by%20hour%202026%20-%20April.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2026-01/All%20pedestrian%20data%20day%20by%20hour%202025%20-%20December.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2025-01/All%20pedestrian%20data%20day%20by%20hour%202024.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2024-01/All%20pedestrian%20data%20day%20by%20hour%202023%20-%20December.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2023-01/All%20pedestrian%20data%20day%20by%20hour%202022%20-%20December.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2022-01/All%20pedestrian%20data%20day%20by%20hour%202021.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2021-01/All%20pedestrian%20data%20day%20by%20hour%202020.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2020-01/All%20pedestrian%20data%20day%20by%20hour%20to%2031%20December%202019.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2019-06/All%20pedestrian%20data%20day%20by%20hour%202018.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2018-06/All%20pedestrian%20data%20day%20by%20hour%202017.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2018-06/All%20pedestrian%20data%20day%20by%20hour%202016.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2018-06/All%20pedestrian%20data%20day%20by%20hour%202015.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2018-06/All%20pedestrian%20data%20day%20by%20hour%202014.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2018-06/All%20pedestrian%20data%20day%20by%20hour%202013.xlsx",
    "/sites/20180201.prod.hotcity.co.nz/files/2018-06/All%20pedestrian%20data%20day%20by%20hour%202012.xlsx",
]


# ------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------

def clean_colnames(df: pd.DataFrame) -> pd.DataFrame:
    """Clean column names into simple snake_case."""
    df = df.copy()

    df.columns = (
        pd.Series(df.columns)
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "_", regex=True)
        .str.replace(r"[^a-z0-9_]", "", regex=True)
        .str.replace(r"_+", "_", regex=True)
        .str.strip("_")
    )

    return df


def extract_year_from_filename(filename: str) -> int | None:
    """Extract first 20xx year from filename."""
    match = re.search(r"(20\d{2})", filename)
    return int(match.group(1)) if match else None


def download_file(url: str, out_path: Path) -> None:
    """Download file if it does not already exist."""
    if out_path.exists():
        print(f"Already downloaded: {out_path.name}")
        return

    print(f"Downloading: {out_path.name}")

    response = requests.get(url, timeout=60)
    response.raise_for_status()

    out_path.write_bytes(response.content)


def read_pedestrian_excel(path: Path) -> pd.DataFrame:
    """
    Read one pedestrian-count Excel file.

    These files often have note rows before the actual header.
    The true header row is the row where column 1 is Date and column 2 is Time.
    """

    raw = pd.read_excel(path, sheet_name=0, header=None)

    first_col = raw.iloc[:, 0].astype(str).str.strip().str.lower()
    second_col = raw.iloc[:, 1].astype(str).str.strip().str.lower()

    header_matches = raw[first_col.eq("date") & second_col.eq("time")]

    if header_matches.empty:
        raise ValueError(f"Could not find Date/Time header row in {path.name}")

    header_row = header_matches.index[0]

    df = raw.iloc[(header_row + 1):].copy()
    df.columns = raw.iloc[header_row]

    df = clean_colnames(df)

    # Drop fully empty rows and columns
    df = df.dropna(how="all")
    df = df.dropna(axis=1, how="all")

    # Drop annoying Excel artifact columns, if any remain
    df = df.loc[:, ~df.columns.str.startswith("unnamed")]

    # Keep only rows with a real date
    if "date" in df.columns:
        df = df[df["date"].notna()]

    return df


# ------------------------------------------------------------
# Download files
# ------------------------------------------------------------

manifest = []

for link in links:
    url = urljoin(BASE_URL, link)
    filename = Path(unquote(link)).name
    local_path = RAW_DIR / filename

    download_file(url, local_path)

    manifest.append(
        {
            "source_year": extract_year_from_filename(filename),
            "filename": filename,
            "url": url,
            "local_path": str(local_path),
        }
    )

manifest_df = pd.DataFrame(manifest)
manifest_df.to_csv(OUT_MANIFEST, index=False)


# ------------------------------------------------------------
# Read and append files
# ------------------------------------------------------------

dfs = []
column_sets = {}

for item in manifest:
    print(f"Reading: {item['filename']}")

    df = read_pedestrian_excel(Path(item["local_path"]))

    df["source_year"] = item["source_year"]
    df["source_file"] = item["filename"]
    df["source_url"] = item["url"]

    column_sets[item["filename"]] = set(df.columns)

    dfs.append(df)

ped = pd.concat(dfs, ignore_index=True)


# ------------------------------------------------------------
# Basic column check
# ------------------------------------------------------------

all_cols = sorted(set().union(*column_sets.values()))

print("\nColumn check:")

for filename, cols in column_sets.items():
    missing = sorted(set(all_cols) - cols)

    print(f"\n{filename}")
    print(f"  Columns: {len(cols)}")

    if missing:
        print(f"  Missing columns relative to full dataset: {missing}")


# ------------------------------------------------------------
# Save appended file
# ------------------------------------------------------------

ped.to_csv(OUT_CSV, index=False)

print("\nDone.")
print(f"Rows: {len(ped):,}")
print(f"Columns: {len(ped.columns):,}")
print(f"Saved: {OUT_CSV}")
print(f"Saved: {OUT_MANIFEST}")

print("\nColumns:")
print(ped.columns.tolist())