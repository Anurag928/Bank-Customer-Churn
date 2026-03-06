import csv
import importlib
import json
import os
import pickle
import re
from datetime import datetime
from typing import Any, Dict, Optional

from flask import Flask, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash


def _optional_module(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception:
        return None


dotenv_module = _optional_module("dotenv")


def load_dotenv() -> None:
    if dotenv_module and hasattr(dotenv_module, "load_dotenv"):
        dotenv_module.load_dotenv()


flask_login_module = _optional_module("flask_login")
if not flask_login_module:
    raise RuntimeError("Missing dependency: Flask-Login. Install requirements before running app.py.")

LoginManager = flask_login_module.LoginManager
UserMixin = flask_login_module.UserMixin
current_user = flask_login_module.current_user
login_required = flask_login_module.login_required
login_user = flask_login_module.login_user
logout_user = flask_login_module.logout_user


pymongo_module = _optional_module("pymongo")
if not pymongo_module:
    raise RuntimeError("Missing dependency: pymongo. Install requirements before running app.py.")

MongoClient = getattr(pymongo_module, "MongoClient", None)
ReturnDocument = getattr(pymongo_module, "ReturnDocument", None)
if not MongoClient or not ReturnDocument:
    raise RuntimeError("Unable to load MongoDB client classes from pymongo.")

bson_module = _optional_module("bson")
ObjectId = getattr(bson_module, "ObjectId", None) if bson_module else None
if not ObjectId:
    raise RuntimeError("Missing dependency: bson ObjectId support via pymongo.")


load_dotenv()

REQUIRED_FEATURES = [
    "CreditScore",
    "Age",
    "Tenure",
    "Balance",
    "HasCrCard",
    "IsActiveMember",
    "EstimatedSalary",
]

MODEL_PATH = os.getenv("MODEL_PATH", "model/xgb_model.pkl")
CSV_LOG_PATH = os.getenv("CSV_LOG_PATH", "history.csv")
BASE_URL = os.getenv("BASE_URL", "")
MONGODB_URI = (os.getenv("MONGODB_URI") or "").strip()
MONGODB_DB_NAME = (os.getenv("MONGODB_DB_NAME") or "bank_churn_app").strip()

if not MONGODB_URI or "<" in MONGODB_URI or ">" in MONGODB_URI:
    raise RuntimeError("MONGODB_URI is not configured. Add a valid MongoDB URI in .env.")

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-me")

login_manager = LoginManager()
login_manager.login_view = "signin"
login_manager.init_app(app)


mongo_client = MongoClient(MONGODB_URI)
try:
    default_db = mongo_client.get_default_database()
except Exception:
    default_db = None
mongo_db = default_db if default_db is not None else mongo_client[MONGODB_DB_NAME]
users_collection = mongo_db["users"]
predictions_collection = mongo_db["predictions"]

try:
    users_collection.create_index("email", unique=True)
    users_collection.create_index("google_sub", unique=True, sparse=True)
    predictions_collection.create_index([("user_id", -1), ("created_at", -1)])
except Exception as index_error:
    app.logger.warning("Mongo index setup skipped: %s", index_error)


authlib_flask_client = _optional_module("authlib.integrations.flask_client")
OAuth = getattr(authlib_flask_client, "OAuth", None) if authlib_flask_client else None

oauth = OAuth(app) if OAuth else None
google = (
    oauth.register(
        name="google",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
    if oauth
    else None
)


class AppUser(UserMixin):
    def __init__(self, doc: Dict[str, Any]):
        self.doc = doc
        self.id = str(doc.get("_id"))
        self.username = doc.get("username") or "User"
        self.email = (doc.get("email") or "").lower()
        self.password_hash = doc.get("password_hash")
        self.google_sub = doc.get("google_sub")
        self.auth_providers = doc.get("auth_providers") or "local"
        self.created_at = doc.get("created_at")
        self.updated_at = doc.get("updated_at")


def now_utc() -> datetime:
    return datetime.utcnow()


def parse_providers(raw: Optional[str]) -> set[str]:
    if not raw:
        return set()
    return {item.strip() for item in raw.split(",") if item.strip()}


def dump_providers(values: set[str]) -> str:
    return ",".join(sorted(values))


def normalize_user_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    normalized = dict(doc)
    normalized["email"] = (normalized.get("email") or "").strip().lower()
    return normalized


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    try:
        return normalize_user_doc(users_collection.find_one({"_id": ObjectId(user_id)}))
    except Exception:
        return None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    lowered = (email or "").strip().lower()
    if not lowered:
        return None
    return normalize_user_doc(users_collection.find_one({"email": lowered}))


def get_user_by_google_sub(google_sub: str) -> Optional[Dict[str, Any]]:
    if not google_sub:
        return None
    return normalize_user_doc(users_collection.find_one({"google_sub": google_sub}))


@login_manager.user_loader
def load_user(user_id: str) -> Optional[AppUser]:
    doc = get_user_by_id(user_id)
    if not doc:
        return None
    return AppUser(doc)


def oauth_credentials_valid() -> bool:
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()

    if not client_id or not client_secret:
        return False

    placeholders = ["your-google-client-id", "your-google-client-secret", "replace-with", "<", ">"]
    combined = f"{client_id} {client_secret}".lower()
    return not any(marker in combined for marker in placeholders)


@app.context_processor
def inject_oauth_flags() -> Dict[str, bool]:
    return {"google_oauth_enabled": oauth_credentials_valid()}


def validate_signup_password(password: str, username: str, email: str) -> Optional[str]:
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if re.search(r"\s", password):
        return "Password must not contain spaces."
    if not re.search(r"[A-Z]", password):
        return "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must include at least one lowercase letter."
    if not re.search(r"\d", password):
        return "Password must include at least one number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must include at least one special character."

    lowered = password.lower()
    if username and username.lower() in lowered:
        return "Password must not contain your username."

    email_name = email.split("@")[0].lower() if email and "@" in email else email.lower()
    if email_name and email_name in lowered:
        return "Password must not contain your email name."

    common_passwords = {
        "password",
        "password123",
        "qwerty123",
        "12345678",
        "letmein123",
        "admin123",
        "welcome123",
    }
    if lowered in common_passwords:
        return "Choose a less common password."

    return None


def get_external_redirect(endpoint: str) -> str:
    path = url_for(endpoint)
    if BASE_URL:
        return f"{BASE_URL.rstrip('/')}{path}"
    return url_for(endpoint, _external=True)


def parse_prediction_payload(form_data) -> Dict[str, float]:
    parsed: Dict[str, float] = {}
    for key in REQUIRED_FEATURES:
        value = form_data.get(key, "").strip()
        if value == "":
            raise ValueError(f"{key} is required.")
        parsed[key] = float(value)
    return parsed


def write_csv_log(row: Dict[str, Any]) -> None:
    try:
        file_exists = os.path.exists(CSV_LOG_PATH)
        with open(CSV_LOG_PATH, "a", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(
                csv_file,
                fieldnames=[
                    "date",
                    "email",
                    "CreditScore",
                    "Age",
                    "Tenure",
                    "Balance",
                    "HasCrCard",
                    "IsActiveMember",
                    "EstimatedSalary",
                    "prediction",
                    "probability",
                ],
            )
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)
    except Exception as error:
        app.logger.warning("CSV logging skipped: %s", error)


def _as_iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return now_utc().isoformat()


def _as_display_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = now_utc()
    return dt.strftime("%d-%m-%Y %H:%M:%S")


def serialize_prediction(doc: Dict[str, Any]) -> Dict[str, Any]:
    created_at = doc.get("created_at")
    return {
        "id": str(doc.get("_id", "")),
        "date": _as_iso(created_at),
        "date_display": _as_display_datetime(created_at),
        "CreditScore": doc.get("CreditScore", doc.get("credit_score", 0.0)),
        "Age": doc.get("Age", doc.get("age", 0.0)),
        "Tenure": doc.get("Tenure", doc.get("tenure", 0.0)),
        "Balance": doc.get("Balance", doc.get("balance", 0.0)),
        "HasCrCard": doc.get("HasCrCard", doc.get("has_cr_card", 0.0)),
        "IsActiveMember": doc.get("IsActiveMember", doc.get("is_active_member", 0.0)),
        "EstimatedSalary": doc.get("EstimatedSalary", doc.get("estimated_salary", 0.0)),
        "prediction": doc.get("prediction", ""),
        "probability": doc.get("probability", 0.0),
    }


model = None


def load_model() -> None:
    global model
    if os.path.exists(MODEL_PATH):
        try:
            joblib_module = _optional_module("joblib")
            if joblib_module and hasattr(joblib_module, "load"):
                model = joblib_module.load(MODEL_PATH)
                return

            with open(MODEL_PATH, "rb") as model_file:
                model = pickle.load(model_file)
        except Exception as error:
            model = None
            app.logger.warning("Model loading failed: %s", error)
    else:
        model = None


load_model()


@app.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("home"))
    return redirect(url_for("signup"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("home"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")
        accept_terms = request.form.get("accept_terms")

        if not username or not email or not password or not confirm_password:
            flash("All fields are required.", "error")
            return render_template("signup.html", show_nav=False)

        password_error = validate_signup_password(password, username, email)
        if password_error:
            flash(password_error, "error")
            return render_template("signup.html", show_nav=False)

        if password != confirm_password:
            flash("Passwords do not match.", "error")
            return render_template("signup.html", show_nav=False)

        if accept_terms != "on":
            flash("Please accept Terms and Conditions to continue.", "error")
            return render_template("signup.html", show_nav=False)

        existing = get_user_by_email(email)
        hashed_password = generate_password_hash(password)

        if existing:
            providers = parse_providers(existing.get("auth_providers"))
            if "local" in providers:
                flash("Email already registered. Please sign in.", "error")
                return render_template("signup.html", show_nav=False)

            providers.add("local")
            updated = users_collection.find_one_and_update(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "username": username,
                        "password_hash": hashed_password,
                        "auth_providers": dump_providers(providers),
                        "updated_at": now_utc(),
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
            login_user(AppUser(updated))
            flash("Account created successfully.", "success")
            return redirect(url_for("predict"))

        user_doc = {
            "username": username,
            "email": email,
            "password_hash": hashed_password,
            "google_sub": None,
            "auth_providers": "local",
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
        inserted = users_collection.insert_one(user_doc)
        user_doc["_id"] = inserted.inserted_id

        login_user(AppUser(user_doc))
        flash("Account created successfully.", "success")
        return redirect(url_for("predict"))

    return render_template("signup.html", show_nav=False)


@app.route("/signin", methods=["GET", "POST"])
def signin():
    if current_user.is_authenticated:
        return redirect(url_for("home"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            flash("Email and password are required.", "error")
            return render_template("signin.html", show_nav=False)

        user_doc = get_user_by_email(email)
        if not user_doc or not user_doc.get("password_hash"):
            flash("Invalid credentials.", "error")
            return render_template("signin.html", show_nav=False)

        if not check_password_hash(user_doc["password_hash"], password):
            flash("Invalid credentials.", "error")
            return render_template("signin.html", show_nav=False)

        login_user(AppUser(user_doc))
        return redirect(url_for("home"))

    return render_template("signin.html", show_nav=False)


@app.route("/auth/google")
def auth_google():
    if google is None:
        flash("Google OAuth dependency is not installed. Please install Authlib.", "error")
        return redirect(url_for("signin"))

    if not oauth_credentials_valid():
        return redirect(url_for("signin"))

    flow = request.args.get("flow", "signin")
    session["oauth_flow"] = flow

    redirect_uri = get_external_redirect("auth_google_callback")
    return google.authorize_redirect(
        redirect_uri,
        prompt="select_account",
        access_type="offline",
        include_granted_scopes="true",
    )


@app.route("/auth/google/callback")
def auth_google_callback():
    if google is None:
        flash("Google OAuth dependency is not installed. Please install Authlib.", "error")
        return redirect(url_for("signin"))

    flow = session.pop("oauth_flow", "signin")

    token = google.authorize_access_token()
    userinfo = token.get("userinfo")
    if not userinfo:
        userinfo = google.get("userinfo").json()

    email = userinfo.get("email", "").lower()
    sub = userinfo.get("sub")
    name = userinfo.get("name") or userinfo.get("given_name") or "Google User"

    if not email or not sub:
        flash("Google authentication failed.", "error")
        return redirect(url_for("signin"))

    user_doc = get_user_by_google_sub(sub)
    if not user_doc:
        existing_by_email = get_user_by_email(email)
        if existing_by_email:
            if existing_by_email.get("google_sub") and existing_by_email.get("google_sub") != sub:
                flash("Email already linked to another Google account.", "error")
                return redirect(url_for("signin"))

            providers = parse_providers(existing_by_email.get("auth_providers"))
            providers.add("google")

            username = (existing_by_email.get("username") or "").strip() or name
            updated = users_collection.find_one_and_update(
                {"_id": existing_by_email["_id"]},
                {
                    "$set": {
                        "google_sub": sub,
                        "username": username,
                        "auth_providers": dump_providers(providers),
                        "updated_at": now_utc(),
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
            user_doc = normalize_user_doc(updated)
        else:
            new_doc = {
                "username": name,
                "email": email,
                "password_hash": None,
                "google_sub": sub,
                "auth_providers": "google",
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
            inserted = users_collection.insert_one(new_doc)
            new_doc["_id"] = inserted.inserted_id
            user_doc = normalize_user_doc(new_doc)

    if flow == "signup":
        flash("Google sign-up successful.", "success")
        return redirect(url_for("signin"))

    login_user(AppUser(user_doc))
    flash("Google sign-in successful.", "success")
    return redirect(url_for("home"))


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("signin"))


@app.route("/home")
@login_required
def home():
    return render_template("home.html", show_nav=True)


@app.route("/predict", methods=["GET", "POST"])
@login_required
def predict():
    result = None

    if request.method == "POST":
        if model is None:
            load_model()
        if model is None:
            flash("Model not found. Run training script first.", "error")
            prediction_count = predictions_collection.count_documents({"user_id": current_user.id})
            return render_template("predict.html", show_nav=True, result=None, prediction_count=prediction_count)

        try:
            payload = parse_prediction_payload(request.form)
            input_data = [[payload[k] for k in REQUIRED_FEATURES]]

            prediction_raw = int(model.predict(input_data)[0])
            if hasattr(model, "predict_proba"):
                probability = float(model.predict_proba(input_data)[0][1])
            else:
                probability = float(prediction_raw)

            prediction_text = "Customer Will Churn" if prediction_raw == 1 else "Customer Will Stay"
            probability_percent = round(probability * 100, 2)

            prediction_doc = {
                "user_id": current_user.id,
                "email": current_user.email,
                "created_at": now_utc(),
                "CreditScore": payload["CreditScore"],
                "Age": payload["Age"],
                "Tenure": payload["Tenure"],
                "Balance": payload["Balance"],
                "HasCrCard": payload["HasCrCard"],
                "IsActiveMember": payload["IsActiveMember"],
                "EstimatedSalary": payload["EstimatedSalary"],
                "prediction": prediction_text,
                "probability": probability_percent,
            }
            predictions_collection.insert_one(prediction_doc)

            write_csv_log(
                {
                    "date": prediction_doc["created_at"].isoformat(),
                    "email": current_user.email,
                    **payload,
                    "prediction": prediction_text,
                    "probability": probability_percent,
                }
            )

            result = {"prediction": prediction_text, "probability": probability_percent}
        except ValueError as error:
            flash(str(error), "error")
        except Exception as error:
            flash(f"Prediction failed: {error}", "error")

    prediction_count = predictions_collection.count_documents({"user_id": current_user.id})
    return render_template("predict.html", show_nav=True, result=result, prediction_count=prediction_count)


@app.route("/history")
@login_required
def history():
    cursor = predictions_collection.find({"user_id": current_user.id}).sort("created_at", -1)
    predictions = [serialize_prediction(doc) for doc in cursor]
    return render_template(
        "history.html",
        show_nav=True,
        predictions=predictions,
        predictions_json=json.dumps(predictions),
    )


@app.route("/profile")
@login_required
def profile():
    cursor = predictions_collection.find({"user_id": current_user.id}).sort("created_at", -1)
    predictions = [serialize_prediction(doc) for doc in cursor]

    total_predictions = len(predictions)
    last_result = predictions[0]["prediction"] if predictions else "No predictions yet"
    last_probability = predictions[0]["probability"] if predictions else None
    recent_predictions = predictions[:5]

    return render_template(
        "profile.html",
        show_nav=True,
        total_predictions=total_predictions,
        last_result=last_result,
        last_probability=last_probability,
        recent_predictions=recent_predictions,
        all_predictions=predictions,
    )


@app.route("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    app.run(debug=True)
