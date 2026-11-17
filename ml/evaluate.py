"""Evaluate the saved classifiers on a reproducible hold-out split.

Usage: python -m ml.evaluate [--data ml/crop_recommendation.csv]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "ml" / "models"
MODEL_FILES = {
    "Random Forest": "randomforest_model.joblib",
    "Decision Tree": "decisiontree_model.joblib",
    "KNN": "knn_model.joblib",
    "Naive Bayes": "naivebayes_model.joblib",
}

def evaluate_models(data_path: Path, target: str = "label") -> pd.DataFrame:
    data = pd.read_csv(data_path)
    if target not in data.columns:
        raise ValueError(f"Target column {target!r} not found in {data_path}")
    X, y = data.drop(columns=[target]), data[target]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    rows = {}
    for name, filename in MODEL_FILES.items():
        path = MODEL_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing model: {path}. Run python ml/train.py first.")
        model = joblib.load(path)
        model.fit(X_train, y_train)
        predicted = model.predict(X_test)
        rows[name] = {
            "Accuracy": accuracy_score(y_test, predicted),
            "Precision": precision_score(y_test, predicted, average="weighted", zero_division=0),
            "Recall": recall_score(y_test, predicted, average="weighted", zero_division=0),
            "F1 Score": f1_score(y_test, predicted, average="weighted", zero_division=0),
        }
    return pd.DataFrame.from_dict(rows, orient="index")

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "ml" / "crop_recommendation.csv")
    parser.add_argument("--target", default="label")
    args = parser.parse_args()
    print(evaluate_models(args.data, args.target).to_string(float_format=lambda x: f"{x:.4f}"))

if __name__ == "__main__":
    main()
