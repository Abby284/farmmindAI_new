import os
from typing import Any, Dict

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from services.location_profile import get_location_profile

load_dotenv()

app = Flask(__name__)

# ------------------------------------------------------------
# Keep the legacy app behavior and add the ML + LLM upgrade.
# Supports form posts and JSON AJAX requests.
# ------------------------------------------------------------

try:
    from engine import GOAL_LABELS, SEASON_LABELS, analyze, run_whatif
except ImportError:
    GOAL_LABELS = {
        "yield": "Maximum Yield",
        "profit": "High Profit",
        "soil": "Soil Health",
        "water": "Water Efficiency",
        "organic": "Organic Farming",
    }
    SEASON_LABELS = {
        "kharif": "Kharif (Jun–Oct)",
        "rabi": "Rabi (Nov–Mar)",
        "zaid": "Zaid (Apr–Jun)",
        "tropical": "Tropical Year-Round",
        "semi-arid": "Semi-Arid",
    }

    def analyze(inp):
        return {
            "ranked": [],
            "top": None,
            "rotation": [],
            "soil_history": [],
            "soil_final": 0,
            "soil_advice": "Heuristic engine unavailable.",
            "whatif_scenarios": [],
        }

    def run_whatif(*args, **kwargs):
        return {"scenario": "", "results": [], "top_mover": None}

try:
    from ml.predictor import predict_crops
except ImportError:
    def predict_crops(inp):
        return {
            "status": "unavailable",
            "message": "ML model not available yet.",
            "predictions": [],
        }

try:
    from ml.odisha_predictor import predict_odisha_crops
except ImportError:
    def predict_odisha_crops(inp):
        return {"status": "unavailable", "predictions": []}

try:
    from services.explanation_service import generate_explanation
except ImportError:
    def generate_explanation(heuristic_results, ml_results):
        return "Local AI explanation service unavailable."

SOILS = [
    "loamy", "sandy", "clayey", "silty",
    "black cotton", "alluvial", "red laterite", "peaty"
]
SEASONS = list(SEASON_LABELS.keys())
NITROS = ["low", "medium", "high"]
WATERS = ["rainfed", "partial", "full"]

WATER_LABELS = {
    "rainfed": "Rainfed Only",
    "partial": "Partial Irrigation",
    "full": "Full Irrigation",
}

def parse_form(form: Dict[str, Any]) -> Dict[str, Any]:
    if not form:
        form = {}

    def _to_float(value):
        if value in (None, "", "null"):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return {
        "soil": form.get("soil", "loamy"),
        "season": form.get("season", "kharif"),
        "rainfall": _to_float(form.get("rainfall")),
        "temp": _to_float(form.get("temp")),
        "ph": _to_float(form.get("ph")),
        "nitrogen": form.get("nitrogen", "medium"),
        "water": form.get("water", "partial"),
        "farm_size": float(form.get("farm_size", 5) or 5),
        "goal": form.get("goal", "profit"),
        "nitrogen_value": _to_float(form.get("nitrogen_value", 50)),
        "phosphorus_value": _to_float(form.get("phosphorus_value", 30)),
        "potassium_value": _to_float(form.get("potassium_value", 30)),
        "humidity": _to_float(form.get("humidity", 60)),
        # Exact browser coordinates are never posted with the analysis form.
        # The location request resolves them to a district, then discards them.
        "state": str(form.get("state", "")).strip(),
        "district": str(form.get("district", "")).strip(),
        "district_key": str(form.get("district_key", "")).strip(),
    }

def build_payload_from_request() -> Dict[str, Any]:
    payload = request.get_json(silent=True)
    if isinstance(payload, dict):
        return payload
    if request.form:
        return request.form.to_dict()
    return {}

def safe_ml_results(inp: Dict[str, Any]):
    try:
        odisha = predict_odisha_crops(inp)
        if odisha.get("status") == "ok" and odisha.get("predictions"):
            return odisha
        return predict_crops(inp)
    except Exception:
        return {
            "status": "unavailable",
            "message": "ML model could not run at the moment.",
            "predictions": [],
        }

def safe_explanation(heuristic_results, ml_results):
    try:
        return generate_explanation(heuristic_results, ml_results)
    except Exception:
        return "Local AI explanation unavailable."

@app.route("/")
def index():
    return render_template(
        "index.html",
        soils=SOILS,
        seasons=SEASONS,
        season_labels=SEASON_LABELS,
        nitros=NITROS,
        waters=WATERS,
        water_labels=WATER_LABELS,
        goal_labels=GOAL_LABELS,
    )

@app.route("/analyze", methods=["POST"])
def analyze_field():
    raw = build_payload_from_request()
    inp = parse_form(raw)

    heuristic_results = analyze(inp)
    ml_results = safe_ml_results(inp)
    explanation = safe_explanation(heuristic_results, ml_results)

    result = {
        "heuristic": heuristic_results,
        "ml": ml_results,
        "explanation": explanation,
        "water_labels": WATER_LABELS,
    }

    if request.form:
        return render_template("results.html", **result)

    return jsonify(result)

@app.route("/location-profile", methods=["POST"])
def location_profile():
    """Return sourced defaults after a user has explicitly granted browser location access."""
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(get_location_profile(payload.get("lat"), payload.get("lon")))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Location profile lookup failed")
        return jsonify({"error": "Location services are unavailable. Please enter your field details manually."}), 503

@app.route("/whatif", methods=["POST"])
def whatif_route():
    data = request.get_json(silent=True) or {}
    inp = data.get("inp", {})

    if not inp:
        return jsonify({"error": "No input supplied."}), 400

    normalized = parse_form(inp)
    scenario_id = data.get("scenario_id")
    original_ranked = data.get("orig_ranked", [])

    try:
        result = run_whatif(scenario_id, normalized, original_ranked)
    except Exception as exc:
        return jsonify({"error": "What-if scenario failed.", "details": str(exc)}), 500

    return jsonify(result)

@app.route("/explain", methods=["POST"])
def explain_result():
    payload = request.get_json(silent=True) or request.form.to_dict() or {}
    if not payload:
        return jsonify({"error": "No input supplied."}), 400

    heuristic = payload.get("heuristic", {})
    ml = payload.get("ml", {})
    explanation = safe_explanation(heuristic, ml)
    return jsonify({"explanation": explanation})


@app.route("/narrate", methods=["POST"])
def narrate_results():
    """Generate a spoken crop-plan or What-If explanation with Gemini."""
    from services.gemini_narration import generate_narration

    payload = request.get_json(silent=True) or {}
    if payload.get("scope") not in ("plan", "whatif"):
        return jsonify({"error": "Choose a valid narration scope."}), 400
    if payload.get("language") not in ("en", "hi"):
        return jsonify({"error": "Choose English or Hindi."}), 400
    if not isinstance(payload.get("data"), dict):
        return jsonify({"error": "Narration data is missing."}), 400
    try:
        return jsonify({"text": generate_narration(payload)})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except requests.RequestException:
        app.logger.exception("Gemini narration request failed")
        return jsonify({"error": "Gemini is temporarily unavailable. Using the built-in summary instead."}), 502
    except Exception:
        app.logger.exception("Gemini narration failed")
        return jsonify({"error": "AI narration could not be generated. Using the built-in summary instead."}), 502

if __name__ == "__main__":
    app.run(debug=False, use_reloader=False, port=5001)
