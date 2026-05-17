from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd


RAW_COUNTS_CSV = Path("data/interim/pedestrian_appended_raw.csv")
GEODATA_XLSX = Path("data/raw/Pedestrian Geodata (updated Apr 2026).xlsx")
OUT_DIR = Path("web/public/data")
OUT_LOCATIONS = OUT_DIR / "locations.json"
OUT_COUNTS = OUT_DIR / "foottraffic-month-hour-weekday.json"

SOURCE_COLUMNS = {"date", "time", "source_year", "source_file", "source_url"}

LOCATION_ID_ALIASES = {
    "59_high_stret": "59_high_street",
    "commercial_bay_hm_ns": "commercial_bay_h_m",
    "commercial_bay_hugo_boss_ns": "commercial_bay_hugo_boss",
    "commercial_bay_quay_st_ew": "commercial_bay_quay_street",
}

DIRECTION_SUFFIXES = {
    "ew": "EW",
    "ns": "NS",
}


def normalize_location_id(value: object) -> str:
    """Match the snake_case column IDs used by the raw count files."""
    text = str(value).strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("_")


def compact_json_dump(records: list[dict[str, Any]], path: Path) -> None:
    path.write_text(
        json.dumps(records, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def display_name_for(location_id: str, geodata_name: str) -> str:
    suffix = location_id.rsplit("_", 1)[-1]
    if suffix in DIRECTION_SUFFIXES and DIRECTION_SUFFIXES[suffix] not in geodata_name:
        return f"{geodata_name} ({DIRECTION_SUFFIXES[suffix]})"
    return geodata_name


def read_locations(count_columns: list[str]) -> pd.DataFrame:
    geodata = pd.read_excel(GEODATA_XLSX, sheet_name="Lat and Long")
    geodata.columns = [normalize_location_id(column) for column in geodata.columns]

    required_columns = {"address", "latitude", "longitude"}
    missing_columns = required_columns - set(geodata.columns)
    if missing_columns:
        raise ValueError(f"Geodata is missing required columns: {sorted(missing_columns)}")

    geodata = geodata.rename(columns={"address": "name"})
    geodata["latitude"] = pd.to_numeric(geodata["latitude"], errors="coerce")
    geodata["longitude"] = pd.to_numeric(geodata["longitude"], errors="coerce")
    geodata = geodata.dropna(subset=["name", "latitude", "longitude"]).copy()
    geodata["geo_location_id"] = geodata["name"].map(normalize_location_id)

    duplicate_geo_ids = sorted(
        geodata.loc[geodata["geo_location_id"].duplicated(), "geo_location_id"].unique()
    )
    if duplicate_geo_ids:
        raise ValueError(f"Geodata has duplicate normalized IDs: {duplicate_geo_ids}")

    locations = pd.DataFrame({"location_id": count_columns})
    locations["geo_location_id"] = locations["location_id"].replace(LOCATION_ID_ALIASES)
    locations = locations.merge(geodata, on="geo_location_id", how="left")

    missing_coordinates = sorted(
        locations.loc[locations["latitude"].isna() | locations["longitude"].isna(), "location_id"]
    )
    if missing_coordinates:
        raise ValueError(f"Count columns missing geodata coordinates: {missing_coordinates}")

    locations["display_name"] = locations.apply(
        lambda row: display_name_for(row["location_id"], row["name"]),
        axis=1,
    )

    return locations[
        ["location_id", "display_name", "latitude", "longitude", "geo_location_id"]
    ].sort_values("display_name")


def read_counts() -> tuple[pd.DataFrame, list[str]]:
    counts = pd.read_csv(RAW_COUNTS_CSV, low_memory=False)

    required_columns = {"date", "time"}
    missing_columns = required_columns - set(counts.columns)
    if missing_columns:
        raise ValueError(f"Raw counts are missing required columns: {sorted(missing_columns)}")

    count_columns = [column for column in counts.columns if column not in SOURCE_COLUMNS]
    if not count_columns:
        raise ValueError("Raw counts do not include any counter columns")

    counts["date"] = pd.to_datetime(counts["date"], errors="coerce")
    counts["hour"] = (
        counts["time"].astype("string").str.extract(r"^\s*(\d{1,2}):", expand=False)
    )
    counts["hour"] = pd.to_numeric(counts["hour"], errors="coerce")
    counts = counts.dropna(subset=["date", "hour"]).copy()
    counts["hour"] = counts["hour"].astype(int)
    counts = counts[counts["hour"].between(0, 23)]
    counts["month"] = counts["date"].dt.to_period("M").astype(str)
    counts["month_number"] = counts["date"].dt.month
    counts["day_of_week"] = counts["date"].dt.day_name()
    counts["day_of_week_number"] = counts["date"].dt.dayofweek

    long_counts = counts.melt(
        id_vars=[
            "month",
            "month_number",
            "day_of_week",
            "day_of_week_number",
            "hour",
        ],
        value_vars=count_columns,
        var_name="location_id",
        value_name="count",
    )
    long_counts["count"] = pd.to_numeric(long_counts["count"], errors="coerce")
    long_counts = long_counts.dropna(subset=["count"])
    long_counts = long_counts[long_counts["count"] != 0]

    return long_counts, count_columns


def aggregate_counts(long_counts: pd.DataFrame) -> pd.DataFrame:
    monthly = (
        long_counts.groupby(
            [
                "month",
                "month_number",
                "day_of_week",
                "day_of_week_number",
                "location_id",
                "hour",
            ],
            as_index=False,
        )
        .agg(avg_count=("count", "mean"))
    )

    monthly["avg_count"] = monthly["avg_count"].round(2)

    return monthly.sort_values(["month", "day_of_week_number", "hour", "location_id"])


def to_json_records(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    selected = frame[columns].astype(object)
    records = selected.where(pd.notna(selected), None).to_dict(orient="records")
    return records


def main() -> None:
    if not RAW_COUNTS_CSV.exists():
        raise FileNotFoundError(f"Run scripts/01_download_and_append.py first: {RAW_COUNTS_CSV}")
    if not GEODATA_XLSX.exists():
        raise FileNotFoundError(f"Missing geodata workbook: {GEODATA_XLSX}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    long_counts, count_columns = read_counts()
    locations = read_locations(count_columns)
    monthly_counts = aggregate_counts(long_counts)

    missing_location_ids = sorted(
        set(monthly_counts["location_id"]) - set(locations["location_id"])
    )
    if missing_location_ids:
        raise ValueError(f"Aggregates include unknown locations: {missing_location_ids}")

    location_records = to_json_records(
        locations,
        ["location_id", "display_name", "latitude", "longitude"],
    )
    count_records = to_json_records(
        monthly_counts,
        [
            "month",
            "day_of_week",
            "hour",
            "location_id",
            "avg_count",
        ],
    )

    compact_json_dump(location_records, OUT_LOCATIONS)
    compact_json_dump(count_records, OUT_COUNTS)

    print("Done.")
    print(f"Locations: {len(location_records):,}")
    print(f"Monthly/hourly/weekday aggregates: {len(count_records):,}")
    print(f"Saved: {OUT_LOCATIONS}")
    print(f"Saved: {OUT_COUNTS}")


if __name__ == "__main__":
    main()
