"""Short, grounded crop explanations with an optional local Ollama layer."""
import os
from typing import Any, Dict

import requests


def _fallback(heuristic_results: Dict[str, Any], ml_results: Dict[str, Any]) -> str:
    ranked = (heuristic_results or {}).get("ranked", [])
    top = ranked[0].get("crop", {}).get("name") if ranked else None
    ml_top = ((ml_results or {}).get("predictions") or [{}])[0].get("crop")
    if top and ml_top and top.casefold() == str(ml_top).casefold():
        return f"{top} is the strongest match in both the field-fit and Odisha historic-yield signals. Confirm the current soil test and local market price before planting."
    if top and ml_top:
        return f"{top} best fits the field details, while {ml_top} has the stronger local historic-yield signal. Compare water availability, a current soil test, and market price before choosing."
    if top:
        return f"{top} is the strongest field-fit option. Confirm the current soil test and local market price before planting."
    return "Enter complete field conditions to receive a crop explanation."


def generate_explanation(heuristic_results: Dict[str, Any], ml_results: Dict[str, Any]) -> str:
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    top_field = ((heuristic_results or {}).get("ranked") or [{}])[0]
    top_ml = ((ml_results or {}).get("predictions") or [{}])[0]
    prompt = f"""You are FarmMind's Odisha crop advisor. Write two short, practical sentences.
Use only the facts below. Do not make guarantees, invent prices, or give pesticide doses.
Detected district: {(ml_results or {}).get('district', 'not detected')}
Field-fit crop: {top_field.get('crop', {}).get('name', 'not available')}
Field-fit score: {top_field.get('pct', 'not available')}
Historic-yield crop: {top_ml.get('crop', 'not available')}
Expected historic yield: {top_ml.get('expected_yield_tonnes_per_ha', 'not available')} t/ha
Historic observations: {top_ml.get('source_records', 'not available')}
End by reminding the farmer to confirm soil test and local market conditions."""
    try:
        response = requests.post(
            f"{base_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=(3, 30),
        )
        response.raise_for_status()
        explanation = response.json().get("response", "").strip()
        return explanation or _fallback(heuristic_results, ml_results)
    except Exception:
        # Ollama is optional. A model outage cannot make field analysis fail.
        return _fallback(heuristic_results, ml_results)
