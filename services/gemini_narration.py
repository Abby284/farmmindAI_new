"""Gemini-powered, grounded narration for FarmMind crop plans and What-If results."""
import os
import requests


def generate_narration(payload):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    language = payload.get("language", "en")
    scope = payload.get("scope", "plan")
    facts = payload.get("data", {})
    language_name = "Hindi" if language == "hi" else "English"
    task = (
        "Explain the latest What-If scenario, compare before and after crop-fit scores, "
        "identify the largest change, and explain what the simulation does and does not mean."
        if scope == "whatif" else
        "Explain the complete crop plan: leading crop recommendations and their fit scores, "
        "estimated net returns and ROI, risk flags, the soil-health outlook, the rotation plan, "
        "and any separate historical-yield model signal when present."
    )
    prompt = f"""You are FarmMind, a careful agricultural decision-support explainer.
Write a clear spoken explanation in {language_name}, suitable for a farmer.
{task}
Use only facts in the JSON data below. Do not invent agronomic facts, crop prices, yields,
weather, causes, or recommendations. Distinguish heuristic field-fit estimates from the
separate historical model. Explain percentage-point changes correctly. Never present
simulations or estimates as guarantees. Keep the explanation conversational and concise
(about 120-180 words). Avoid markdown, tables, emojis, and headings; return only text.
FarmMind data:
{facts}
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    response = requests.post(
        url,
        params={"key": api_key},
        json={"contents": [{"parts": [{"text": prompt}]}],
              "generationConfig": {"temperature": 0.25, "maxOutputTokens": 700}},
        timeout=(5, 35),
    )
    response.raise_for_status()
    body = response.json()
    candidates = body.get("candidates") or []
    parts = (candidates[0].get("content") or {}).get("parts") or [] if candidates else []
    text = " ".join(part.get("text", "").strip() for part in parts if part.get("text"))
    if not text:
        raise RuntimeError("Gemini returned an empty narration")
    return text
