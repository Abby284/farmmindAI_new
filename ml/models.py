"""Utilities for training and loading the project's classifier artifacts."""
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_FILES = {
    "random_forest": "randomforest_model.joblib",
    "decision_tree": "decisiontree_model.joblib",
    "knn": "knn_model.joblib",
    "naive_bayes": "naivebayes_model.joblib",
}

class ModelManager:
    def __init__(self):
        self.models = {
            "random_forest": RandomForestClassifier(random_state=42, class_weight="balanced"),
            "decision_tree": DecisionTreeClassifier(random_state=42),
            "knn": KNeighborsClassifier(n_neighbors=5),
            "naive_bayes": GaussianNB(),
        }

    def train(self, X_train, y_train):
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        for name, model in self.models.items():
            model.fit(X_train, y_train)
            joblib.dump(model, MODEL_DIR / MODEL_FILES[name])

    def load_model(self, model_name):
        if model_name not in MODEL_FILES:
            raise ValueError(f"Unknown model name: {model_name}")
        return joblib.load(MODEL_DIR / MODEL_FILES[model_name])

    def predict(self, model_name, X):
        model = self.load_model(model_name)
        predictions = model.predict(X)
        probabilities = model.predict_proba(X) if hasattr(model, "predict_proba") else None
        return predictions, probabilities

    def evaluate(self, X_test, y_test):
        results = {}
        for name in self.models:
            model = self.load_model(name)
            results[name] = accuracy_score(y_test, model.predict(X_test))
        return results

    def get_feature_importances(self, model_name):
        model = self.load_model(model_name)
        return getattr(model, "feature_importances_", None)
