import os
import joblib
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")

def _load_model(model_name: str):
    path = os.path.join(MODEL_DIR, f"{model_name}.joblib")
    if not os.path.exists(path):
        return None
    return joblib.load(path)

def map_form_to_model_input(inp):
    nitrogen = inp.get("nitrogen_value", 50)
    phosphorus = inp.get("phosphorus_value", 30)
    potassium = inp.get("potassium_value", 30)
    temperature = inp.get("temp", 25)
    humidity = inp.get("humidity", 60)
    ph = inp.get("ph", 6.5)
    rainfall = inp.get("rainfall", 800)

    # Preserve feature names used during training. This prevents sklearn from
    # silently accepting a differently ordered array at inference time.
    return pd.DataFrame([{
        "N": nitrogen,
        "P": phosphorus,
        "K": potassium,
        "temperature": temperature,
        "humidity": humidity,
        "ph": ph,
        "rainfall": rainfall,
    }], dtype=float)

def predict_crops(inp):
    model = _load_model("best_model")
    if model is None:
        return {
            "status": "unavailable",
            "message": "ML model file is missing. Run python ml/train.py first.",
            "predictions": []
        }

    features = map_form_to_model_input(inp)
    probs = model.predict_proba(features)[0]
    classes = model.classes_

    ranked = sorted(
        zip(classes, probs),
        key=lambda x: x[1],
        reverse=True
    )[:3]

    return {
        "status": "ok",
        "predictions": [
            {"crop": str(crop), "probability": round(float(prob), 4)}
            for crop, prob in ranked
        ]
    }
