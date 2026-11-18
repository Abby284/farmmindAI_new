"""Train the Odisha yield model during deployment build, never during a user request."""
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "data" / "odisha_crop_training_sample.csv"
MODEL_DIR = ROOT / "ml" / "models"
MODEL_FILE = MODEL_DIR / "odisha_yield_model.joblib"

CATEGORICAL = ["district_key", "season_key", "crop_name"]
NUMERIC = [
    "annual_normal_rainfall_mm", "irrigation_all_season_thousand_ha",
    "net_area_sown_thousand_ha", "fertilizer_consumption_kg_ha",
    "ph", "nitrogen_value", "phosphorus_value", "potassium_value",
    "organic_carbon_pct", "electrical_conductivity_dsm",
]


def main():
    if not DATASET.exists():
        raise FileNotFoundError(f"Odisha training data not found: {DATASET}")

    data = pd.read_csv(DATASET)
    required = set(CATEGORICAL + NUMERIC + ["yield_tonnes_per_ha"])
    missing = sorted(required - set(data.columns))
    if missing:
        raise ValueError(f"Odisha dataset is missing required columns: {missing}")

    data = data.dropna(subset=CATEGORICAL + NUMERIC + ["yield_tonnes_per_ha"]).copy()
    data = data[(data["yield_tonnes_per_ha"] > 0) & (data["yield_tonnes_per_ha"] < 100)]
    if len(data) < 100:
        raise ValueError(f"Not enough valid Odisha training rows: {len(data)}")

    transformer = ColumnTransformer([
        ("labels", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("numeric", "passthrough", NUMERIC),
    ])
    model = Pipeline([
        ("features", transformer),
        ("regressor", RandomForestRegressor(
            n_estimators=40, min_samples_leaf=2, random_state=42, n_jobs=1
        )),
    ])
    model.fit(data[CATEGORICAL + NUMERIC], data["yield_tonnes_per_ha"])

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE, compress=3)
    print(f"Saved Odisha model from {len(data)} rows to {MODEL_FILE}")


if __name__ == "__main__":
    main()
