import os
import joblib
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

DATASET_PATH = os.getenv("DATASET_PATH", "data/bank_churn.csv")
MODEL_PATH = os.getenv("MODEL_PATH", "model/xgb_model.pkl")

REQUIRED_COLUMNS = [
    "CreditScore",
    "Age",
    "Tenure",
    "Balance",
    "HasCrCard",
    "IsActiveMember",
    "EstimatedSalary",
    "Exited",
]


def train_and_save_model() -> bool:
    if not os.path.exists(DATASET_PATH):
        print(f"Dataset not found at: {DATASET_PATH}")
        return False

    df = pd.read_csv(DATASET_PATH)
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        print(f"Missing required columns: {missing}")
        return False

    training_df = df[REQUIRED_COLUMNS].copy()
    training_df = training_df.dropna()

    x_data = training_df.drop(columns=["Exited"])
    y_data = training_df["Exited"].astype(int)

    x_train, x_test, y_train, y_test = train_test_split(
        x_data,
        y_data,
        test_size=0.2,
        random_state=42,
        stratify=y_data,
    )

    model = xgb.XGBClassifier(
        n_estimators=220,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        random_state=42,
    )

    model.fit(x_train, y_train)

    y_pred = model.predict(x_test)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"Model accuracy: {accuracy:.4f}")
    print("Classification report:")
    print(classification_report(y_test, y_pred))

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    print(f"Model saved to: {MODEL_PATH}")
    return True


if __name__ == "__main__":
    success = train_and_save_model()
    if not success:
        raise SystemExit(1)
