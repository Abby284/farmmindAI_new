"""Odisha crop-yield model trained from the local, sourced OGD sample."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "data" / "odisha_crop_training_sample.csv"
CATEGORICAL = ["district_key", "season_key", "crop_name"]
NUMERIC = [
    "annual_normal_rainfall_mm", "irrigation_all_season_thousand_ha",
    "net_area_sown_thousand_ha", "fertilizer_consumption_kg_ha",
    "ph", "nitrogen_value", "phosphorus_value", "potassium_value",
    "organic_carbon_pct", "electrical_conductivity_dsm",
]


@lru_cache(maxsize=1)
def _load_model_and_data():
    if not DATASET.exists():
        return None, pd.DataFrame()
    data = pd.read_csv(DATASET)
    required = set(CATEGORICAL + NUMERIC + ["yield_tonnes_per_ha"])
    if not required.issubset(data.columns):
        return None, pd.DataFrame()
    data = data.dropna(subset=CATEGORICAL + NUMERIC + ["yield_tonnes_per_ha"]).copy()
    data = data[(data["yield_tonnes_per_ha"] > 0) & (data["yield_tonnes_per_ha"] < 100)]
    if len(data) < 100:
        return None, pd.DataFrame()
    transformer = ColumnTransformer([
        ("labels", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("numeric", "passthrough", NUMERIC),
    ])
    model = Pipeline([
        ("features", transformer),
        # Kept deliberately compact: this runs once per app process and must
        # not make a farmer's first result wait for a large background build.
        ("regressor", RandomForestRegressor(n_estimators=80, min_samples_leaf=2, random_state=42, n_jobs=1)),
    ])
    model.fit(data[CATEGORICAL + NUMERIC], data["yield_tonnes_per_ha"])
    return model, data


def _input_or_context(inp: Dict[str, Any], name: str, fallback: Any) -> float:
    try:
        value = inp.get(name)
        return float(fallback if value in (None, "") else value)
    except (TypeError, ValueError):
        return float(fallback)


def predict_odisha_crops(inp: Dict[str, Any]) -> Dict[str, Any]:
    """Rank crops with historic Odisha observations for the detected district."""
    district = str(inp.get("district_key") or "").strip()
    season = str(inp.get("season") or "").strip().casefold()
    if not district:
        return {"status": "unavailable", "reason": "No Odisha district was detected.", "predictions": []}
    model, data = _load_model_and_data()
    if model is None:
        return {"status": "unavailable", "reason": "Odisha training sample is not built yet.", "predictions": []}

    historical = data[(data["district_key"] == district) & (data["season_key"] == season)]
    if historical.empty:
        historical = data[data["district_key"] == district]
    if historical.empty:
        return {"status": "unavailable", "reason": "No historic crop records matched this Odisha district.", "predictions": []}

    context = historical.iloc[0]
    candidates = historical.groupby("crop_name", as_index=False).agg(observations=("crop_year", "count"))
    reliable = candidates[candidates["observations"] >= 3]
    if not reliable.empty:
        candidates = reliable
    candidate_rows = candidates.assign(
        district_key=district,
        season_key=season if season in {"kharif", "rabi", "zaid"} else "annual",
        annual_normal_rainfall_mm=context["annual_normal_rainfall_mm"],
        irrigation_all_season_thousand_ha=context["irrigation_all_season_thousand_ha"],
        net_area_sown_thousand_ha=context["net_area_sown_thousand_ha"],
        fertilizer_consumption_kg_ha=context["fertilizer_consumption_kg_ha"],
        ph=_input_or_context(inp, "ph", context["ph"]),
        nitrogen_value=_input_or_context(inp, "nitrogen_value", context["nitrogen_value"]),
        phosphorus_value=_input_or_context(inp, "phosphorus_value", context["phosphorus_value"]),
        potassium_value=_input_or_context(inp, "potassium_value", context["potassium_value"]),
        organic_carbon_pct=context["organic_carbon_pct"],
        electrical_conductivity_dsm=context["electrical_conductivity_dsm"],
    )
    candidate_rows["predicted_yield"] = model.predict(candidate_rows[CATEGORICAL + NUMERIC])
    candidate_rows = candidate_rows.sort_values("predicted_yield", ascending=False).head(3)
    maximum = float(candidate_rows["predicted_yield"].max()) or 1.0
    predictions = [
        {
            "crop": row.crop_name,
            "probability": round(max(0.0, min(1.0, float(row.predicted_yield) / maximum)), 4),
            "expected_yield_tonnes_per_ha": round(float(row.predicted_yield), 2),
            "source_records": int(row.observations),
        }
        for row in candidate_rows.itertuples(index=False)
    ]
    return {
        "status": "ok",
        "model": "Odisha district yield model",
        "message": "Ranked from historic OGD crop outcomes and Odisha district context.",
        "district": str(context["district"]),
        "predictions": predictions,
    }
