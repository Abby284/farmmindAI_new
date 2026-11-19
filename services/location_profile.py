"""Location-aware field defaults with explicit source and confidence metadata."""
from __future__ import annotations

import csv
import logging
import os
import re
from collections import defaultdict
from datetime import date
from functools import lru_cache
from pathlib import Path
from statistics import median
from typing import Any, Dict, Optional

import requests

BASE_DIR = Path(__file__).resolve().parents[1]
BASELINES_FILE = BASE_DIR / "data" / "location_baselines.csv"
INDIA_BOUNDS = {"lat_min": 6.0, "lat_max": 37.6, "lon_min": 68.0, "lon_max": 97.5}
# A quick client-safe guard before reverse geocoding. Reverse-geocoding verifies
# the state before FarmMind returns an Odisha profile.
ODISHA_BOUNDS = {"lat_min": 17.6, "lat_max": 22.7, "lon_min": 81.2, "lon_max": 87.7}
REQUEST_TIMEOUT = (5, 12)
logger = logging.getLogger(__name__)
DATA_GOV_API_URL = "https://api.data.gov.in/resource/{resource_id}"
DATA_GOV_PAGE_SIZE = 1_000
# A single filtered IMD page contains multiple historical seasons for most
# districts. Keeping this to one page makes user-triggered autofill responsive;
# the result is cached for the lifetime of the server.
DATA_GOV_MAX_PAGES = 1
SEASONAL_RAINFALL_SHARE = {"kharif": 0.78, "rabi": 0.12, "zaid": 0.10}
ODISHA_RAINFALL_DISTRICTS = {
    "anugul": "Anugul", "baleshwar": "Baleshwar", "bargarh": "Bargarh",
    "balangir": "Balangir", "kendujhar": "Kendujhar", "khordha": "Khordha",
    "subarnapur": "Subarnapur",
}
DISTRICT_ALIASES = {
    "angul": "anugul", "anugul": "anugul", "balasore": "baleshwar",
    "baleshwar": "baleshwar", "baragarh": "bargarh", "bargarh": "bargarh",
    "bolangir": "balangir", "balangir": "balangir", "keonjhar": "kendujhar",
    "kendujhar": "kendujhar", "khurda": "khordha", "khordha": "khordha",
    "sonapur": "subarnapur", "subarnapur": "subarnapur",
}


def _as_number(value: Any) -> Optional[float]:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _in_india(lat: float, lon: float) -> bool:
    return (INDIA_BOUNDS["lat_min"] <= lat <= INDIA_BOUNDS["lat_max"] and
            INDIA_BOUNDS["lon_min"] <= lon <= INDIA_BOUNDS["lon_max"])


def _district_key(value: Any) -> str:
    key = re.sub(r"[^a-z]", "", str(value or "").casefold())
    return DISTRICT_ALIASES.get(key, key)


def _in_odisha_bounds(lat: float, lon: float) -> bool:
    return (ODISHA_BOUNDS["lat_min"] <= lat <= ODISHA_BOUNDS["lat_max"] and
            ODISHA_BOUNDS["lon_min"] <= lon <= ODISHA_BOUNDS["lon_max"])


def _season_for_today() -> str:
    month = date.today().month
    if month in (6, 7, 8, 9, 10):
        return "kharif"
    if month in (11, 12, 1, 2, 3):
        return "rabi"
    return "zaid"


def _reverse_geocode(lat: float, lon: float) -> Dict[str, str]:
    """Resolve a location only after the grower explicitly opts in in the UI."""
    response = requests.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 10},
        headers={"User-Agent": "FarmMind-AI/1.0 (field-profile-autofill)"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    address = payload.get("address") or {}
    district = (address.get("state_district") or address.get("district") or address.get("county") or address.get("city_district") or address.get("municipality") or "")
    state = address.get("state") or address.get("region") or ""
    if not district:
        city = (address.get("city") or address.get("town") or address.get("village") or "").strip().casefold()
        city_to_district = {"bhubaneswar": "Khordha", "khordha": "Khordha", "cuttack": "Cuttack", "puri": "Puri", "sambalpur": "Sambalpur", "balasore": "Baleshwar", "bhadrak": "Bhadrak", "berhampur": "Ganjam", "brahmapur": "Ganjam", "rourkela": "Sundargarh", "angul": "Angul", "baripada": "Mayurbhanj", "jeypore": "Koraput"}
        district = city_to_district.get(city, "")
    return {
        "district": district,
        "district_key": _district_key(district),
        "state": state,
        "label": district or address.get("city") or address.get("town") or state or "Your area",
    }


def _weather_snapshot(lat: float, lon: float) -> Dict[str, Optional[float]]:
    response = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m",
            "daily": "precipitation_sum",
            "forecast_days": 7,
            "timezone": "auto",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    current = payload.get("current", {})
    daily = payload.get("daily", {})
    precipitation = daily.get("precipitation_sum") or []
    return {
        "temp": _as_number(current.get("temperature_2m")),
        "humidity": _as_number(current.get("relative_humidity_2m")),
        "forecast_rainfall": round(sum(v or 0 for v in precipitation), 1),
    }


@lru_cache(maxsize=1)
def _baseline_rows():
    if not BASELINES_FILE.exists():
        return []
    with BASELINES_FILE.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _baseline_for(location: Dict[str, str]) -> Dict[str, Any]:
    """Read the installed Odisha district context by normalized district key."""
    state = location.get("state", "").strip().casefold()
    district = location.get("district_key") or _district_key(location.get("district", ""))
    for row in _baseline_rows():
        row_key = row.get("district_key") or _district_key(row.get("district", ""))
        if row.get("state", "").strip().casefold() == state and row_key == district:
            return row
    for row in _baseline_rows():
        if row.get("state", "").strip().casefold() == state and not row.get("district", "").strip():
            return row
    return {}


def _season_months(season: str):
    return {
        "kharif": {6, 7, 8, 9, 10},
        "rabi": {11, 12, 1, 2, 3},
        "zaid": {4, 5},
    }.get(season, set())


@lru_cache(maxsize=256)
def _district_seasonal_rainfall(state: str, district: str, season: str) -> Dict[str, Any]:
    """Calculate a historical seasonal district baseline from OGD daily data.

    The source provides daily observations, while FarmMind needs seasonal rainfall.
    We therefore build a median of complete historical seasons and cache it rather
    than treating a single day's value as crop-planning rainfall.
    """
    api_key = os.getenv("DATA_GOV_IN_API_KEY")
    resource_id = os.getenv("DATA_GOV_IN_RAINFALL_RESOURCE_ID")
    if not api_key or not resource_id or not state or not district:
        return {}

    # OGD rainfall has Odisha data under NRSC VIC MODEL; some other states also
    # expose IMD GRID MODEL. The location remains sourced either way.
    api_district = ODISHA_RAINFALL_DISTRICTS.get(district, district.title())
    records = []
    for page in range(DATA_GOV_MAX_PAGES):
        response = requests.get(
            DATA_GOV_API_URL.format(resource_id=resource_id),
            params={
                "api-key": api_key,
                "format": "json",
                "limit": DATA_GOV_PAGE_SIZE,
                "offset": page * DATA_GOV_PAGE_SIZE,
                "filters[State]": "Odisha" if state.casefold() == "odisha" else state,
                "filters[District]": api_district,
                "filters[Agency_name]": "NRSC VIC MODEL" if state.casefold() == "odisha" else "IMD GRID MODEL",
            },
            headers={"User-Agent": "Mozilla/5.0 FarmMind-AI/1.0", "Accept": "application/json"},
            timeout=(10, REQUEST_TIMEOUT),
        )
        response.raise_for_status()
        page_records = response.json().get("records", [])
        records.extend(page_records)
        if len(page_records) < DATA_GOV_PAGE_SIZE:
            break

    values_by_day: Dict[date, list] = defaultdict(list)
    for record in records:
        observed_on = record.get("Date")
        rainfall = _as_number(record.get("Avg_rainfall"))
        if not observed_on or rainfall is None:
            continue
        try:
            day = date.fromisoformat(observed_on)
        except (TypeError, ValueError):
            continue
        values_by_day[day].append(rainfall)

    months = _season_months(season)
    seasonal_totals: Dict[int, float] = defaultdict(float)
    seasonal_days: Dict[int, int] = defaultdict(int)
    for day, daily_values in values_by_day.items():
        if day.month not in months:
            continue
        crop_year = day.year - 1 if season == "rabi" and day.month in {1, 2, 3} else day.year
        seasonal_totals[crop_year] += sum(daily_values) / len(daily_values)
        seasonal_days[crop_year] += 1

    # Ignore obviously partial seasons. This protects the model from a few days
    # of data being presented as a full Kharif/Rabi estimate.
    complete = [total for year, total in seasonal_totals.items() if seasonal_days[year] >= 35]
    if not complete:
        return {}
    return {
        "rainfall": round(float(median(complete))),
        "sample_count": len(complete),
        "source": "data.gov.in district daily rainfall (seasonal historical median)",
    }


def _imd_district_rainfall() -> Dict[str, Any]:
    """Use IMD's official endpoint when an IMD-specific API key is configured."""
    api_key = os.getenv("IMD_API_KEY")
    if not api_key:
        return {}
    response = requests.get(
        "https://api.imd.gov.in/api/v1/districtrainfall",
        params={"api-key": api_key},
        headers={"X-API-Key": api_key, "User-Agent": "FarmMind-AI/1.0", "Accept": "application/json"},
        timeout=(5, REQUEST_TIMEOUT),
    )
    response.raise_for_status()
    payload = response.json()
    records = payload if isinstance(payload, list) else payload.get("data", payload.get("records", []))
    return {"record_count": len(records) if isinstance(records, list) else 0}


def get_location_profile(lat_value: Any, lon_value: Any) -> Dict[str, Any]:
    lat, lon = _as_number(lat_value), _as_number(lon_value)
    if lat is None or lon is None:
        raise ValueError("A valid latitude and longitude are required.")
    if not _in_india(lat, lon) or not _in_odisha_bounds(lat, lon):
        raise ValueError("Location autofill is currently available for fields in Odisha only.")

    sources, notices = [], []
    try:
        location = _reverse_geocode(lat, lon)
        sources.append("Approximate district from OpenStreetMap reverse geocoding")
    except (requests.RequestException, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Reverse geocoding failed (%s); coordinates omitted from logs.", type(exc).__name__)
        location = {"district": "", "district_key": "", "state": "", "label": "Your field"}
        notices.append("We could not identify your district. You can still enter values manually.")
    if location.get("state") and location["state"].strip().casefold() != "odisha":
        raise ValueError("This location is outside Odisha. FarmMind's current model supports Odisha districts only.")

    values: Dict[str, Any] = {"season": _season_for_today()}
    try:
        weather = _weather_snapshot(lat, lon)
        values.update({key: weather[key] for key in ("temp", "humidity") if weather[key] is not None})
        values["forecast_rainfall"] = weather["forecast_rainfall"]
        sources.append("Open-Meteo seven-day local forecast for temperature and humidity")
        notices.append("Forecast rainfall is shown as a field note; seasonal rainfall requires a district climatology source.")
    except (requests.RequestException, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Weather lookup failed (%s); coordinates omitted from logs.", type(exc).__name__)
        notices.append("Live weather was unavailable, so temperature and humidity were not filled.")

    baseline = _baseline_for(location)
    try:
        rainfall_baseline = _district_seasonal_rainfall(location.get("state", ""), location.get("district_key", ""), values["season"])
    except requests.RequestException:
        rainfall_baseline = {}
        notices.append("The official district rainfall service was unavailable, so rainfall was not filled.")
    if rainfall_baseline:
        values["rainfall"] = rainfall_baseline["rainfall"]
        sources.append(rainfall_baseline["source"])
        notices.append(f"Rainfall is a median from {rainfall_baseline['sample_count']} complete historical seasons.")
    try:
        imd = _imd_district_rainfall()
        if imd:
            sources.append("IMD district rainfall feed")
    except requests.RequestException:
        notices.append("The optional IMD feed was unavailable; official OGD rainfall remains in use.")
    if baseline:
        annual_normal = _as_number(baseline.get("annual_normal_rainfall_mm"))
        if not rainfall_baseline and annual_normal is not None:
            estimate = annual_normal * SEASONAL_RAINFALL_SHARE.get(values["season"], 0.78)
            values["rainfall"] = int(round(estimate / 5.0) * 5)
            sources.append("DAG 2026 district annual normal rainfall (seasonal planning estimate)")
            notices.append("Seasonal rainfall is estimated from district annual normal because complete daily historical seasons were unavailable. Replace it if you know the field's seasonal rainfall.")
        for key in ("soil", "rainfall", "ph", "nitrogen", "water", "nitrogen_value", "phosphorus_value", "potassium_value"):
            # Never overwrite seasonal rainfall with an annual district figure.
            if key != "rainfall" and baseline.get(key) not in (None, ""):
                values[key] = _as_number(baseline[key]) if key in {"rainfall", "ph", "nitrogen_value", "phosphorus_value", "potassium_value"} else baseline[key]
        sources.append(baseline.get("source") or "Installed district agriculture baseline")
        if baseline.get("soil_profile_source"):
            sources.append(baseline["soil_profile_source"])
        if baseline.get("profile_status") == "sample":
            notices.append("Soil type, pH and NPK are district sample planning values, not a field Soil Health Card. Replace them with a lab result when available.")
        if baseline.get("period"):
            notices.append(f"Baseline period: {baseline['period']}. Confirm against a current soil test where possible.")
        if baseline.get("annual_normal_rainfall_mm"):
            notices.append(f"District annual normal rainfall: {baseline['annual_normal_rainfall_mm']} mm (context only, not used as seasonal rainfall).")
    else:
        notices.append("No approved district soil baseline is installed yet, so soil pH and NPK were left unchanged.")

    return {"location": location, "values": values, "sources": sources, "notices": notices}
