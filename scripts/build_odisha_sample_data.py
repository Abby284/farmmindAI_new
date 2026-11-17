"""Build FarmMind's reproducible Odisha district training sample.

District At a Glance contributes 2026 district context and OGD contributes
historic crop area/production. Soil Atlas maps are provenance only: they are
not an authorised field-level soil-test export, so no pH or NPK is fabricated.
"""
from __future__ import annotations

import argparse
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SOIL_SAMPLE = DATA_DIR / "odisha_district_soil_sample.csv"
OGD_CROP_RESOURCE = "35be999b-0208-4354-b557-f6ca9a5355de"
OGD_URL = "https://api.data.gov.in/resource/{resource_id}"

# Differences between OSM, DAG and OGD source names.
DISTRICT_ALIASES = {
    "angul": "anugul", "anugul": "anugul", "balasore": "baleshwar",
    "baleshwar": "baleshwar", "baragarh": "bargarh", "bargarh": "bargarh",
    "bolangir": "balangir", "balangir": "balangir", "keonjhar": "kendujhar",
    "kendujhar": "kendujhar", "khurda": "khordha", "khordha": "khordha",
    "sonapur": "subarnapur", "subarnapur": "subarnapur",
}


def district_key(value: object) -> str:
    key = re.sub(r"[^a-z]", "", str(value or "").casefold())
    return DISTRICT_ALIASES.get(key, key)


def district_context(dag_path: Path) -> pd.DataFrame:
    raw = pd.read_excel(dag_path, sheet_name=0, header=3)
    rows = raw[pd.to_numeric(raw["YEAR"], errors="coerce").eq(2026)].copy()
    rows["NAME OF THE DISTRICT"] = rows["NAME OF THE DISTRICT"].astype(str).str.strip()
    rows = rows[rows["NAME OF THE DISTRICT"].str.len().gt(1)]
    rows = rows[~rows["NAME OF THE DISTRICT"].str.casefold().eq("odisha")]
    context = pd.DataFrame({
        "state": "Odisha",
        "district": rows["NAME OF THE DISTRICT"],
        "district_key": rows["NAME OF THE DISTRICT"].map(district_key),
        "annual_normal_rainfall_mm": pd.to_numeric(rows["NORMAL RAINFALL"], errors="coerce"),
        "annual_actual_rainfall_mm": pd.to_numeric(rows["ACTUAL RAINFALL"], errors="coerce"),
        "irrigation_all_season_thousand_ha": pd.to_numeric(rows["ALL SEASON.5"], errors="coerce"),
        "net_area_sown_thousand_ha": pd.to_numeric(rows["NET AREA SOWN"], errors="coerce"),
        "fertilizer_consumption_kg_ha": pd.to_numeric(rows["FERTILIZER CONSUMPTION (KG/HA.)"], errors="coerce"),
        "context_period": rows["REMARKS CROP"].fillna("2024-25").astype(str),
        "soil_reference": "Odisha Soil Atlas 2020 - district map; field soil test required for pH/NPK",
        "source": "DAG 2026, Directorate of Economics & Statistics Odisha / DAFP",
    })
    for output, column in {
        "paddy_production_thousand_tonnes": "PADDY",
        "maize_production_thousand_tonnes": "MAIZE",
        "mung_production_thousand_tonnes": "MUNG",
        "biri_production_thousand_tonnes": "BIRI",
        "til_production_thousand_tonnes": "TIL",
        "groundnut_production_thousand_tonnes": "GROUNDNUT",
        "mustard_production_thousand_tonnes": "MUSTARD",
        "potato_production_thousand_tonnes": "POTATO",
    }.items():
        context[output] = pd.to_numeric(rows[column], errors="coerce")
    context = context.drop_duplicates("district_key").sort_values("district").reset_index(drop=True)
    if len(context) != 30:
        raise ValueError(f"Expected 30 Odisha districts, found {len(context)}")
    soil = pd.read_csv(SOIL_SAMPLE)
    required_soil = {
        "district_key", "soil", "ph", "nitrogen", "nitrogen_value", "phosphorus_value",
        "potassium_value", "organic_carbon_pct", "electrical_conductivity_dsm", "water",
        "profile_status", "source",
    }
    missing = required_soil - set(soil.columns)
    if missing or len(soil) != 30:
        raise ValueError(f"Invalid Odisha soil sample: missing={sorted(missing)}, rows={len(soil)}")
    soil = soil.rename(columns={"source": "soil_profile_source"})
    merged = context.merge(soil, on="district_key", how="left", validate="one_to_one")
    if merged["soil"].isna().any():
        missing_keys = merged.loc[merged["soil"].isna(), "district_key"].tolist()
        raise ValueError(f"Soil sample has no profile for: {missing_keys}")
    return merged


def fetch_crop_records(api_key: str, resource_id: str) -> pd.DataFrame:
    limit = 1000

    def get_page(offset: int):
        response = requests.get(
            OGD_URL.format(resource_id=resource_id),
            params={"api-key": api_key, "format": "json", "limit": limit, "offset": offset, "filters[state_name]": "Odisha"},
            headers={"User-Agent": "FarmMind-AI/1.0", "Accept": "application/json"},
            timeout=(10, 45),
        )
        response.raise_for_status()
        return response.json()

    first = get_page(0)
    records = first.get("records", [])
    total = int(first.get("total") or len(records))
    offsets = list(range(limit, total, limit))
    # Bounded parallel pagination keeps the setup practical while avoiding a
    # large one-shot request to OGD.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for page in pool.map(get_page, offsets):
            records.extend(page.get("records", []))
    if not records:
        raise RuntimeError("The OGD crop endpoint returned no Odisha crop records.")
    return pd.DataFrame(records)


def season_key(value: object) -> str:
    label = str(value or "").casefold()
    if label in {"kharif", "autumn"}:
        return "kharif"
    if label == "rabi":
        return "rabi"
    if label in {"summer", "zaid"}:
        return "zaid"
    return "annual"


def crop_training_sample(records: pd.DataFrame, context: pd.DataFrame) -> pd.DataFrame:
    required = {"district_name", "crop_year", "season", "crop", "area_", "production_"}
    missing = required - set(records.columns)
    if missing:
        raise ValueError(f"OGD crop resource is missing expected fields: {sorted(missing)}")
    sample = records.copy()
    sample["district_key"] = sample["district_name"].map(district_key)
    sample["season_key"] = sample["season"].map(season_key)
    sample["area_hectare"] = pd.to_numeric(sample["area_"], errors="coerce")
    sample["production_tonnes"] = pd.to_numeric(sample["production_"], errors="coerce")
    sample["crop_year"] = pd.to_numeric(sample["crop_year"], errors="coerce")
    sample["yield_tonnes_per_ha"] = sample["production_tonnes"] / sample["area_hectare"]
    sample = sample[(sample["area_hectare"] > 0) & sample["yield_tonnes_per_ha"].notna()].copy()
    sample = sample.merge(
        context[["district_key", "district", "annual_normal_rainfall_mm", "irrigation_all_season_thousand_ha", "net_area_sown_thousand_ha", "fertilizer_consumption_kg_ha", "ph", "nitrogen_value", "phosphorus_value", "potassium_value", "organic_carbon_pct", "electrical_conductivity_dsm"]],
        on="district_key", how="inner", validate="many_to_one",
    )
    sample = sample.rename(columns={"district_name": "district_source", "crop": "crop_name"})
    sample["state"] = "Odisha"
    sample["source"] = "data.gov.in OGD crop statistics resource 35be999b-0208-4354-b557-f6ca9a5355de"
    columns = [
        "state", "district", "district_key", "district_source", "crop_year", "season", "season_key", "crop_name",
        "area_hectare", "production_tonnes", "yield_tonnes_per_ha", "annual_normal_rainfall_mm",
        "irrigation_all_season_thousand_ha", "net_area_sown_thousand_ha", "fertilizer_consumption_kg_ha",
        "ph", "nitrogen_value", "phosphorus_value", "potassium_value", "organic_carbon_pct", "electrical_conductivity_dsm", "source",
    ]
    return sample[columns].sort_values(["district", "crop_year", "season", "crop_name"]).reset_index(drop=True)


def write_form_baseline(context: pd.DataFrame) -> None:
    output = context.copy()
    # These are labelled sample planning values, never GPS-derived lab results.
    for column in ("soil", "rainfall", "ph", "nitrogen", "water", "nitrogen_value", "phosphorus_value", "potassium_value"):
        if column not in output:
            output[column] = ""
    output["period"] = output["context_period"]
    output.to_csv(DATA_DIR / "location_baselines.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dag", type=Path, required=True, help="Path to DAG_2026.xlsx")
    parser.add_argument("--fetch-crop-priors", action="store_true", help="Download Odisha crop history from OGD")
    parser.add_argument("--reuse-crop-sample", action="store_true", help="Rebuild from the already downloaded local OGD crop sample")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env")
    DATA_DIR.mkdir(exist_ok=True)
    context = district_context(args.dag)
    context.to_csv(DATA_DIR / "odisha_district_baselines.csv", index=False)
    write_form_baseline(context)
    print(f"Wrote {len(context)} district baselines.")
    if not args.fetch_crop_priors and not args.reuse_crop_sample:
        return
    if args.reuse_crop_sample:
        existing = pd.read_csv(DATA_DIR / "odisha_crop_training_sample.csv")
        stale_context = {
            "district", "district_key", "annual_normal_rainfall_mm", "irrigation_all_season_thousand_ha",
            "net_area_sown_thousand_ha", "fertilizer_consumption_kg_ha", "source", "yield_tonnes_per_ha",
        }
        records = existing.drop(columns=list(stale_context & set(existing.columns))).rename(columns={
            "district_source": "district_name", "crop_name": "crop",
            "area_hectare": "area_", "production_tonnes": "production_",
        })
    else:
        api_key = os.getenv("DATA_GOV_IN_API_KEY")
        if not api_key:
            raise RuntimeError("Set DATA_GOV_IN_API_KEY in .env before fetching OGD crop records.")
        records = fetch_crop_records(api_key, os.getenv("DATA_GOV_IN_CROP_RESOURCE_ID", OGD_CROP_RESOURCE))
    training = crop_training_sample(records, context)
    training.to_csv(DATA_DIR / "odisha_crop_training_sample.csv", index=False)
    priors = training.groupby(["district", "district_key", "season_key", "crop_name"], as_index=False).agg(
        observations=("crop_year", "count"), latest_crop_year=("crop_year", "max"),
        median_yield_tonnes_per_ha=("yield_tonnes_per_ha", "median"), mean_yield_tonnes_per_ha=("yield_tonnes_per_ha", "mean"),
    )
    priors.to_csv(DATA_DIR / "odisha_crop_priors.csv", index=False)
    print(f"Wrote {len(training)} model rows and {len(priors)} district-crop priors.")


if __name__ == "__main__":
    main()
