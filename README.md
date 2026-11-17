# FarmMind AI

FarmMind AI is a Flask-based crop-planning and field decision-support application. It combines a transparent rule-based crop-fit engine with machine-learning signals, Odisha district-level historical yield estimates, location-aware defaults, and an optional local Ollama explanation service.

Recommendations are decision support, not a substitute for a current soil test or advice from a local agricultural extension professional. District-level and sample data are not field-level measurements.

## Features

- Rule-based crop ranking using soil type, season, rainfall, temperature, pH, nitrogen, water access, farm size, and the grower's goal.
- Generic crop classifier trained on the bundled `ml/crop_recommendation.csv` dataset.
- Odisha district yield ranking from the bundled historical/sample dataset in `data/`. Yield estimates are shown as yield, not as calibrated probabilities.
- Optional location profile using browser permission and external weather/data services. Location is opt-in; manual entry remains available.
- Optional Ollama-based explanations, with a grounded local fallback when Ollama is unavailable.
- What-if analysis and a responsive results dashboard.

## Requirements

- Python 3.10+ (Python 3.11 is a good default)
- pip
- Ollama is optional; the application still works without it.

The checked-in classifier artifacts were serialized with scikit-learn 1.6.1. Keep that version when loading the bundled `.joblib` files; retrain the models if you intentionally change the ML stack.

## Setup

```bash
git clone https://github.com/Abby284/farmmindAI.git
cd farmmindAI
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Open `http://127.0.0.1:5001`. On Windows, create `.env` by copying `.env.example` in File Explorer or with `Copy-Item .env.example .env`.

## Environment variables

- `DATA_GOV_IN_API_KEY` and `DATA_GOV_IN_RAINFALL_RESOURCE_ID`: optional OGD rainfall source.
- `DATA_GOV_IN_CROP_RESOURCE_ID`: optional OGD crop production resource for the sample-data builder.
- `IMD_API_KEY`: optional IMD district rainfall integration.
- `OLLAMA_BASE_URL` and `OLLAMA_MODEL`: optional local Ollama service settings.

Keep real credentials in your local `.env`. **Never commit `.env` or paste secret values into issues, logs, or source files.** The repository includes only `.env.example` placeholders. Existing API keys do not need to be rotated simply to update this repository.

## ML utilities

Train the generic classifiers from the bundled dataset:

```bash
python ml/train.py
```

Evaluate the saved classifiers on a reproducible hold-out split:

```bash
python -m ml.evaluate
```

The Odisha yield model is built from the bundled data when first needed by the application. The sample builder is in `scripts/build_odisha_sample_data.py`; it may use the optional OGD environment variables.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Repository hygiene

Virtual environments, editor files, Python caches, and local `.env` files are excluded by `.gitignore`. Model artifacts and the small training datasets are included because the application uses them at runtime.

## License

No license file is currently included. Add a license only after choosing the terms under which you want this project distributed.
