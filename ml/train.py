import os
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.naive_bayes import GaussianNB

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# Put the public crop recommendation dataset here:
# /Users/abby/Desktop/farmmind-ai/ml/crop_recommendation.csv
DATASET_PATH = os.path.join(BASE_DIR, "crop_recommendation.csv")

def train_and_save():
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(
            f"Dataset not found at {DATASET_PATH}. "
            "Download the Crop Recommendation dataset and save it there."
        )

    df = pd.read_csv(DATASET_PATH)

    # Expected columns from the public dataset:
    # N, P, K, temperature, humidity, ph, rainfall, label
    if "label" not in df.columns:
        raise ValueError("The dataset must include a 'label' column.")

    X = df.drop(columns=["label"])
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    models = {
        "RandomForest": RandomForestClassifier(
            n_estimators=200,
            random_state=42,
            class_weight="balanced"
        ),
        "DecisionTree": DecisionTreeClassifier(random_state=42),
        "KNN": KNeighborsClassifier(n_neighbors=5),
        "NaiveBayes": GaussianNB(),
    }

    results = {}

    for name, model in models.items():
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        acc = accuracy_score(y_test, preds)
        results[name] = acc
        joblib.dump(model, os.path.join(MODEL_DIR, f"{name.lower()}_model.joblib"))

    best_name = max(results, key=results.get)
    best_model = {
        "RandomForest": RandomForestClassifier(
            n_estimators=200,
            random_state=42,
            class_weight="balanced"
        ),
        "DecisionTree": DecisionTreeClassifier(random_state=42),
        "KNN": KNeighborsClassifier(n_neighbors=5),
        "NaiveBayes": GaussianNB(),
    }[best_name]

    # Refit best model for storage
    best_model.fit(X_train, y_train)
    joblib.dump(best_model, os.path.join(MODEL_DIR, "best_model.joblib"))

    print("Model accuracy:")
    for name, acc in results.items():
        print(f"  {name}: {acc:.4f}")

    print(f"Best model saved as: {MODEL_DIR}/best_model.joblib")

if __name__ == "__main__":
    train_and_save()