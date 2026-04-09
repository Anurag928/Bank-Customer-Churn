import csv
import hashlib
import importlib
import json
import os
import pickle
import re
import secrets
import subprocess
import sys
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Dict, Optional


def _maybe_reexec_with_project_venv() -> None:
    current_python = os.path.normcase(os.path.abspath(sys.executable))
    project_dir = os.path.dirname(os.path.abspath(__file__))
    preferred_python = os.path.normcase(os.path.abspath(os.path.join(project_dir, ".venv", "Scripts", "python.exe")))

    if os.path.exists(preferred_python) and preferred_python != current_python:
        command = [preferred_python, os.path.abspath(__file__), *sys.argv[1:]]
        raise SystemExit(subprocess.call(command, cwd=project_dir))


_maybe_reexec_with_project_venv()

from flask import Flask, flash, jsonify, redirect, render_template, request, url_for
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from config.mail_config import configure_mail
from services.email_service import (
    notify_admin_new_signup,
    notify_user_approved,
    send_password_changed_confirmation,
    send_password_reset_email,
)
from services.registration_service import approve_signup_request, create_signup_request


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


flask_mail_module = _optional_module("flask_mail")
if not flask_mail_module:
    raise RuntimeError("Missing dependency: Flask-Mail. Install requirements before running app.py.")

Mail = getattr(flask_mail_module, "Mail", None)
if not Mail:
    raise RuntimeError("Unable to load Mail class from flask_mail.")


pymongo_module = _optional_module("pymongo")
if not pymongo_module:
    raise RuntimeError("Missing dependency: pymongo. Install requirements before running app.py.")

pymongo_errors_module = _optional_module("pymongo.errors")

MongoClient = getattr(pymongo_module, "MongoClient", None)
ReturnDocument = getattr(pymongo_module, "ReturnDocument", None)
if not MongoClient or not ReturnDocument:
    raise RuntimeError("Unable to load MongoDB client classes from pymongo.")

MongoConnectionErrors = tuple(
    error_type
    for error_type in (
        getattr(pymongo_errors_module, "ServerSelectionTimeoutError", None),
        getattr(pymongo_errors_module, "AutoReconnect", None),
        getattr(pymongo_errors_module, "ConnectionFailure", None),
        getattr(pymongo_errors_module, "NetworkTimeout", None),
    )
    if isinstance(error_type, type)
)

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

ROLE_ADMIN = "Admin"
ROLE_EMPLOYEE = "Employee"
ROLE_ANALYST = "Analyst"
ALLOWED_SIGNUP_ROLES = {ROLE_EMPLOYEE, ROLE_ANALYST}

STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"

ADMIN_ID = (os.getenv("ADMIN_ID") or "AADM057").strip()
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "gudaanurag6@gmail.com").strip().lower()
ADMIN_PASSWORD = (os.getenv("ADMIN_PASSWORD") or "").strip()
ADMIN_USER_SESSION_ID = (os.getenv("ADMIN_USER_SESSION_ID") or "admin-fixed").strip()

MODEL_PATH = os.getenv("MODEL_PATH", "model/xgb_model.pkl")
CSV_LOG_PATH = os.getenv("CSV_LOG_PATH", "prediction_history.csv")
MONGODB_URI = (os.getenv("MONGODB_URI") or "").strip()
MONGODB_DB_NAME = (os.getenv("MONGODB_DB_NAME") or "bank_churn_app").strip()


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


MONGO_SERVER_SELECTION_TIMEOUT_MS = _env_int("MONGO_SERVER_SELECTION_TIMEOUT_MS", 3000)
MONGO_CONNECT_TIMEOUT_MS = _env_int("MONGO_CONNECT_TIMEOUT_MS", 3000)
MONGO_SOCKET_TIMEOUT_MS = _env_int("MONGO_SOCKET_TIMEOUT_MS", 3000)
PASSWORD_RESET_TOKEN_TTL_MINUTES = _env_int("PASSWORD_RESET_TOKEN_TTL_MINUTES", 15)

PASSWORD_RESET_GENERIC_MESSAGE = "If an account with this email exists, a reset link has been sent."
PASSWORD_RESET_INVALID_MESSAGE = "This password reset link is invalid or expired. Request a new one."

if not MONGODB_URI or "<" in MONGODB_URI or ">" in MONGODB_URI:
    raise RuntimeError("MONGODB_URI is not configured. Add a valid MongoDB URI in .env.")

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-me")
# Honor forwarded host/scheme when behind a reverse proxy.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config.update(
    SESSION_COOKIE_NAME="bank_churn_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,
)
configure_mail(app)

login_manager = LoginManager()
login_manager.login_view = "signin"
login_manager.init_app(app)
mail = Mail(app)

MONGO_UNAVAILABLE_MESSAGE = "Database temporarily unavailable"


def is_mongo_unavailable_error(error: Exception) -> bool:
    if MongoConnectionErrors and isinstance(error, MongoConnectionErrors):
        return True

    message = str(error).lower()
    return (
        "serverselectiontimeouterror" in message
        or "ssl handshake failed" in message
        or "replicasetnoprimary" in message
        or "connection failure" in message
    )


def _mongo_error_response(error: Exception):
    app.logger.warning("MongoDB unavailable: %s", error)
    fallback_message = MONGO_UNAVAILABLE_MESSAGE

    if request.path.startswith("/api/"):
        return jsonify({"success": False, "error": fallback_message})

    if request.endpoint == "signup":
        flash(fallback_message, "error")
        return render_template("signup.html", show_nav=False)

    if request.endpoint == "signin":
        flash(fallback_message, "error")
        return render_template("signin.html", show_nav=False)

    if request.endpoint == "admin_login":
        flash(fallback_message, "error")
        return render_template("admin_login.html", show_nav=False)

    if request.endpoint == "forgot_password":
        flash(fallback_message, "error")
        return render_template("forgot_password.html", show_nav=False)

    if request.endpoint == "reset_password":
        flash(fallback_message, "error")
        return render_template("reset_password.html", show_nav=False, reset_token_valid=False)

    flash(fallback_message, "error")
    return redirect(url_for("home"))


for error_class in MongoConnectionErrors:
    app.register_error_handler(error_class, _mongo_error_response)


certifi_module = _optional_module("certifi")
mongo_kwargs = {
    # Keep UI responsive when Mongo is down or blocked by network/TLS issues.
    "serverSelectionTimeoutMS": MONGO_SERVER_SELECTION_TIMEOUT_MS,
    "connectTimeoutMS": MONGO_CONNECT_TIMEOUT_MS,
    "socketTimeoutMS": MONGO_SOCKET_TIMEOUT_MS,
}
if certifi_module:
    mongo_kwargs["tlsCAFile"] = certifi_module.where()

mongo_client = MongoClient(MONGODB_URI, **mongo_kwargs)
try:
    default_db = mongo_client.get_default_database()
except Exception:
    default_db = None
mongo_db = default_db if default_db is not None else mongo_client[MONGODB_DB_NAME]
users_collection = mongo_db["users"]
predictions_collection = mongo_db["predictions"]

try:
    users_collection.create_index("email", unique=True)
    users_collection.create_index("official_id", unique=True, sparse=True)
    users_collection.create_index("reset_token_hash", unique=True, sparse=True)
    predictions_collection.create_index([("user_id", -1), ("created_at", -1)])
except Exception as index_error:
    app.logger.warning("Mongo index setup skipped: %s", index_error)


class AppUser(UserMixin):
    def __init__(self, doc: Dict[str, Any]):
        self.doc = doc
        self.id = str(doc.get("_id"))
        self.username = doc.get("username") or "User"
        self.email = (doc.get("email") or "").lower()
        self.password_hash = doc.get("password_hash")
        self.role = doc.get("role") or ROLE_EMPLOYEE
        self.official_id = doc.get("official_id") or ""
        self.status = doc.get("status") or STATUS_APPROVED
        self.last_login = doc.get("last_login")
        self.is_admin = self.role == ROLE_ADMIN
        self.created_at = doc.get("created_at")
        self.updated_at = doc.get("updated_at")


def now_utc() -> datetime:
    return datetime.utcnow()


def normalize_user_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    normalized = dict(doc)
    normalized["email"] = (normalized.get("email") or "").strip().lower()
    normalized["role"] = normalized.get("role") or ROLE_EMPLOYEE
    normalized_status = str(normalized.get("status") or STATUS_APPROVED).strip().lower()
    normalized["status"] = normalized_status if normalized_status else STATUS_APPROVED
    normalized["official_id"] = (normalized.get("official_id") or "").strip().upper()
    return normalized


def is_valid_email_address(email: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", (email or "").strip()))


def password_reset_expiry() -> datetime:
    return now_utc() + timedelta(minutes=PASSWORD_RESET_TOKEN_TTL_MINUTES)


def hash_reset_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def can_request_password_reset(user_doc: Optional[Dict[str, Any]]) -> bool:
    if not user_doc:
        return False
    return user_doc.get("role") != ROLE_ADMIN and bool(user_doc.get("password_hash"))


def issue_password_reset_token(user_doc: Dict[str, Any]) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    issued_at = now_utc()
    expires_at = password_reset_expiry()
    users_collection.update_one(
        {"_id": user_doc["_id"]},
        {
            "$set": {
                "reset_token_hash": hash_reset_token(token),
                "reset_token_expires_at": expires_at,
                "reset_token_created_at": issued_at,
                "updated_at": issued_at,
            },
        },
    )
    return token, expires_at


def get_user_by_reset_token(token: str, suppress_errors: bool = True) -> Optional[Dict[str, Any]]:
    if not token:
        return None

    try:
        return normalize_user_doc(
            users_collection.find_one(
                {
                    "reset_token_hash": hash_reset_token(token),
                    "reset_token_expires_at": {"$gt": now_utc()},
                }
            )
        )
    except Exception as error:
        app.logger.warning("Failed to fetch user by reset token: %s", error)
        if suppress_errors:
            return None
        raise


def clear_password_reset_token(user_id: Any) -> None:
    users_collection.update_one(
        {"_id": user_id},
        {
            "$unset": {
                "reset_token_hash": "",
                "reset_token_expires_at": "",
                "reset_token_created_at": "",
            },
            "$set": {"updated_at": now_utc()},
        },
    )


def build_password_reset_email_context(user_doc: Dict[str, Any], token: str) -> Dict[str, Any]:
    return {
        "username": user_doc.get("username") or "there",
        "email": user_doc.get("email") or "",
        "reset_link": url_for("reset_password", token=token, _external=True),
        "expiry_minutes": PASSWORD_RESET_TOKEN_TTL_MINUTES,
    }


def fixed_admin_doc() -> Dict[str, Any]:
    try:
        persisted = normalize_user_doc(users_collection.find_one({"$or": [{"official_id": ADMIN_ID}, {"email": ADMIN_EMAIL}]}))
    except Exception as error:
        app.logger.warning("Failed to load admin account from Mongo: %s", error)
        persisted = None

    if persisted:
        persisted["role"] = ROLE_ADMIN
        persisted["status"] = STATUS_APPROVED
        persisted["official_id"] = ADMIN_ID
        persisted["email"] = ADMIN_EMAIL
        persisted["username"] = persisted.get("username") or "System Administrator"
        return persisted

    now = now_utc()
    return {
        "_id": ADMIN_USER_SESSION_ID,
        "username": "System Administrator",
        "email": ADMIN_EMAIL,
        "password_hash": "",
        "role": ROLE_ADMIN,
        "official_id": ADMIN_ID,
        "status": STATUS_APPROVED,
        "last_login": now,
        "created_at": now,
        "updated_at": now,
    }


def upsert_admin_account(update_last_login: bool = False) -> Optional[Dict[str, Any]]:
    now = now_utc()
    set_fields: Dict[str, Any] = {
        "username": "System Administrator",
        "email": ADMIN_EMAIL,
        "role": ROLE_ADMIN,
        "official_id": ADMIN_ID,
        "status": STATUS_APPROVED,
        "updated_at": now,
    }
    if update_last_login:
        set_fields["last_login"] = now

    try:
        updated = users_collection.find_one_and_update(
            {"$or": [{"official_id": ADMIN_ID}, {"email": ADMIN_EMAIL}]},
            {
                "$set": set_fields,
                "$setOnInsert": {
                    "password_hash": "",
                    "created_at": now,
                    "request_date": now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return normalize_user_doc(updated)
    except Exception as error:
        app.logger.warning("Failed to upsert admin account: %s", error)
        return None


# Keep an admin record available for analytics and role distribution at startup.
upsert_admin_account(update_last_login=False)


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    if user_id == ADMIN_USER_SESSION_ID:
        return fixed_admin_doc()
    try:
        return normalize_user_doc(users_collection.find_one({"_id": ObjectId(user_id)}))
    except Exception:
        return None


def get_user_by_email(email: str, suppress_errors: bool = True) -> Optional[Dict[str, Any]]:
    lowered = (email or "").strip().lower()
    if not lowered:
        return None

    try:
        return normalize_user_doc(users_collection.find_one({"email": lowered}))
    except Exception as error:
        app.logger.warning("Failed to fetch user by email: %s", error)
        if suppress_errors:
            return None
        raise


@login_manager.user_loader
def load_user(user_id: str) -> Optional[AppUser]:
    doc = get_user_by_id(user_id)
    if not doc:
        return None
    return AppUser(doc)


def role_dashboard_endpoint(role: str) -> str:
    if role == ROLE_ADMIN:
        return "admin_dashboard"
    if role == ROLE_ANALYST:
        return "analyst_dashboard"
    return "employee_dashboard"


def redirect_to_dashboard(user: AppUser):
    return redirect(url_for(role_dashboard_endpoint(user.role)))


def role_required(*roles: str):
    def decorator(func):
        @wraps(func)
        @login_required
        def wrapper(*args, **kwargs):
            role = getattr(current_user, "role", "")
            if role not in roles:
                flash("You are not authorized to access that page.", "error")
                return redirect_to_dashboard(current_user)
            return func(*args, **kwargs)

        return wrapper

    return decorator


@app.before_request
def enforce_account_status():
    if not current_user.is_authenticated:
        return
    if getattr(current_user, "role", "") == ROLE_ADMIN:
        return

    fresh_doc = get_user_by_id(current_user.id)
    if not fresh_doc:
        logout_user()
        flash("Session expired. Please sign in again.", "error")
        return redirect(url_for("signin"))

    if fresh_doc.get("status") != STATUS_APPROVED:
        logout_user()
        flash("Your account access has changed. Please contact the administrator.", "error")
        return redirect(url_for("signin"))


@app.context_processor
def inject_shell_context():
    role = getattr(current_user, "role", None) if current_user.is_authenticated else None
    sidebar_items = []
    if role == ROLE_ADMIN:
        sidebar_items = [
            {"label": "Dashboard", "endpoint": "admin_dashboard", "icon": "fa-solid fa-chart-column"},
            {"label": "Approval Requests", "endpoint": "approval_requests", "icon": "fa-solid fa-user-check"},
            {"label": "Users", "endpoint": "admin_users", "icon": "fa-solid fa-users"},
            {"label": "Prediction Records", "endpoint": "admin_prediction_records", "icon": "fa-solid fa-table-list"},
            {"label": "Analytics Overview", "endpoint": "admin_analytics", "icon": "fa-solid fa-chart-pie"},
            {"label": "Profile", "endpoint": "profile", "icon": "fa-regular fa-user"},
        ]
    elif role == ROLE_EMPLOYEE:
        sidebar_items = [
            {"label": "Dashboard", "endpoint": "employee_dashboard", "icon": "fa-solid fa-chart-column"},
            {"label": "Predict Churn", "endpoint": "predict", "icon": "fa-solid fa-bolt"},
            {"label": "My Predictions", "endpoint": "my_predictions", "icon": "fa-solid fa-clock-rotate-left"},
            {"label": "Profile", "endpoint": "profile", "icon": "fa-regular fa-user"},
        ]
    elif role == ROLE_ANALYST:
        sidebar_items = [
            {"label": "Dashboard", "endpoint": "analyst_dashboard", "icon": "fa-solid fa-chart-column"},
            {"label": "Prediction Analysis", "endpoint": "prediction_analysis", "icon": "fa-solid fa-chart-line"},
            {"label": "Reports", "endpoint": "analyst_reports", "icon": "fa-solid fa-file-lines"},
            {"label": "Profile", "endpoint": "profile", "icon": "fa-regular fa-user"},
        ]
    return {"sidebar_items": sidebar_items}


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


def parse_prediction_payload(form_data) -> Dict[str, float]:
    parsed: Dict[str, float] = {}
    for key in REQUIRED_FEATURES:
        value = form_data.get(key, "").strip()
        if value == "":
            raise ValueError(f"{key} is required.")
        parsed[key] = float(value)
    return parsed


def parse_num_of_products(form_data) -> float:
    value = (form_data.get("NumOfProducts") or "").strip()
    if value == "":
        # Field removed from UI. Keep a sane default for prediction-log compatibility.
        return 1.0
    parsed = float(value)
    return parsed if parsed > 0 else 1.0


def predict_probability_percent(payload: Dict[str, float]) -> tuple[float, float, int]:
    if model is None:
        load_model()
    if model is None:
        raise ValueError("Model not available. Please run training first.")

    input_data = [[payload[k] for k in REQUIRED_FEATURES]]
    prediction_raw = int(model.predict(input_data)[0])
    if hasattr(model, "predict_proba"):
        base_probability = float(model.predict_proba(input_data)[0][1])
    else:
        base_probability = float(prediction_raw)

    adjusted_probability = apply_business_rule_adjustments(base_probability, payload)
    return round(adjusted_probability * 100, 2), round(base_probability * 100, 2), prediction_raw


def build_retention_guidance(payload: Dict[str, float], probability_percent: float, prediction_raw: int) -> Dict[str, list[str]]:
    reasons: list[str] = []
    actions: list[str] = []

    credit_score = payload.get("CreditScore", 0.0)
    tenure = payload.get("Tenure", 0.0)
    balance = payload.get("Balance", 0.0)
    has_card = int(payload.get("HasCrCard", 1.0))
    is_active = int(payload.get("IsActiveMember", 1.0))

    if is_active == 0:
        reasons.append("Customer activity is currently low, which is a major churn signal.")
    if credit_score < 500:
        reasons.append("Lower credit score profile often maps to unstable retention confidence.")
    if tenure <= 2:
        reasons.append("Short relationship tenure suggests weaker loyalty maturity.")
    if balance < 5000:
        reasons.append("Low balance indicates shallow account engagement.")
    if has_card == 0:
        reasons.append("No linked credit card reduces product stickiness.")

    if not reasons:
        reasons.append("Risk is based on combined account behavior and customer profile patterns.")

    if prediction_raw == 1 or probability_percent >= 70:
        actions = [
            "Assign a retention manager for a personal outreach call within 24 hours.",
            "Offer a targeted retention package (fee waiver, cashback, or loyalty bonus).",
            "Recommend a product bundle aligned to salary and spending behavior.",
        ]
    elif probability_percent >= 40:
        actions = [
            "Send a personalized engagement offer and follow up in 3-5 days.",
            "Proactively review account fit and suggest better-value plan options.",
            "Monitor next-cycle activity and escalate if engagement drops again.",
        ]
    else:
        actions = [
            "Maintain regular engagement through value-added communications.",
            "Promote cross-product adoption to strengthen customer relationship depth.",
            "Track trend changes monthly to catch early churn signals.",
        ]

    return {"reasons": reasons[:5], "actions": actions[:4]}


def parse_customer_id(form_data) -> str:
    customer_id = (form_data.get("CustomerId") or form_data.get("ClientId") or "").strip().upper()
    if not customer_id:
        raise ValueError("CustomerId/ClientId is required.")
    if not re.fullmatch(r"C\d+", customer_id):
        raise ValueError("CustomerId/ClientId must start with C followed by numbers (example: C15634602).")
    return customer_id


def parse_official_id(role: str, raw_value: str) -> str:
    official_id = (raw_value or "").strip().upper()
    if role == ROLE_EMPLOYEE:
        if not re.fullmatch(r"AEMP\d{3}", official_id):
            raise ValueError("Employee Official ID must follow AEMP + 3 digits (example: AEMP101).")
    elif role == ROLE_ANALYST:
        if not re.fullmatch(r"AANA\d{3}", official_id):
            raise ValueError("Analyst Official ID must follow AANA + 3 digits (example: AANA101).")
    else:
        raise ValueError("Invalid role selected.")
    return official_id


def clamp_probability(value: float) -> float:
    return max(0.0, min(1.0, value))


def risk_level_from_probability(probability: float) -> str:
    if probability >= 0.7:
        return "High"
    if probability >= 0.4:
        return "Medium"
    return "Low"


def apply_business_rule_adjustments(base_probability: float, payload: Dict[str, float]) -> float:
    adjusted_probability = base_probability
    risk_factor_count = 0

    # Low credit score is a strong risk signal in churn behavior.
    if payload.get("CreditScore", 0.0) < 400:
        adjusted_probability += 0.10
        risk_factor_count += 1

    # Lack of a credit card can reduce product stickiness.
    if int(payload.get("HasCrCard", 1.0)) == 0:
        adjusted_probability += 0.06
        risk_factor_count += 1

    # Inactive members are at higher churn risk.
    if int(payload.get("IsActiveMember", 1.0)) == 0:
        adjusted_probability += 0.12
        risk_factor_count += 1

    # Very low balance indicates weak banking relationship.
    if payload.get("Balance", 0.0) < 5000:
        adjusted_probability += 0.08
        risk_factor_count += 1

    # Additional uplift when multiple independent risks co-occur.
    if risk_factor_count >= 2:
        adjusted_probability += 0.03 * (risk_factor_count - 1)

    return clamp_probability(adjusted_probability)


def write_csv_log(row: Dict[str, Any]) -> None:
    fieldnames = [
        "date",
        "email",
        "entered_by",
        "CustomerId",
        "ClientId",
        "CreditScore",
        "Age",
        "Tenure",
        "Balance",
        "NumOfProducts",
        "HasCrCard",
        "IsActiveMember",
        "EstimatedSalary",
        "prediction",
        "probability",
        "risk_level",
        "base_probability",
    ]

    def normalize_csv_row(input_row: Dict[str, Any]) -> Dict[str, Any]:
        normalized = {key: input_row.get(key, "") for key in fieldnames}
        if not normalized["CustomerId"]:
            normalized["CustomerId"] = input_row.get("ClientId", "")
        if not normalized["ClientId"]:
            normalized["ClientId"] = normalized["CustomerId"]
        return normalized

    try:
        file_exists = os.path.exists(CSV_LOG_PATH) and os.path.getsize(CSV_LOG_PATH) > 0
        existing_rows = []
        existing_header = []

        if file_exists:
            with open(CSV_LOG_PATH, "r", newline="", encoding="utf-8") as csv_file:
                reader = csv.DictReader(csv_file)
                existing_header = reader.fieldnames or []
                existing_rows = [normalize_csv_row(item) for item in reader]

        normalized_new_row = normalize_csv_row(row)
        schema_changed = existing_header != fieldnames

        if not file_exists or schema_changed:
            with open(CSV_LOG_PATH, "w", newline="", encoding="utf-8") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
                writer.writeheader()
                if existing_rows:
                    writer.writerows(existing_rows)
                writer.writerow(normalized_new_row)
        else:
            with open(CSV_LOG_PATH, "a", newline="", encoding="utf-8") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
                writer.writerow(normalized_new_row)
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


def format_login_datetime(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d-%m-%Y %H:%M:%S")
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.replace(tzinfo=None).strftime("%d-%m-%Y %H:%M:%S")
        except Exception:
            return "Never"
    return "Never"


def serialize_prediction(doc: Dict[str, Any]) -> Dict[str, Any]:
    created_at = doc.get("created_at")
    customer_id = doc.get("CustomerId", doc.get("customer_id", doc.get("ClientId", doc.get("client_id", ""))))
    return {
        "id": str(doc.get("_id", "")),
        "date": _as_iso(created_at),
        "date_display": _as_display_datetime(created_at),
        "CustomerId": customer_id,
        "ClientId": customer_id,
        "CreditScore": doc.get("CreditScore", doc.get("credit_score", 0.0)),
        "Age": doc.get("Age", doc.get("age", 0.0)),
        "Tenure": doc.get("Tenure", doc.get("tenure", 0.0)),
        "Balance": doc.get("Balance", doc.get("balance", 0.0)),
        "NumOfProducts": doc.get("NumOfProducts", doc.get("num_of_products", 0.0)),
        "HasCrCard": doc.get("HasCrCard", doc.get("has_cr_card", 0.0)),
        "IsActiveMember": doc.get("IsActiveMember", doc.get("is_active_member", 0.0)),
        "EstimatedSalary": doc.get("EstimatedSalary", doc.get("estimated_salary", 0.0)),
        "prediction": doc.get("prediction", ""),
        "probability": doc.get("probability", 0.0),
        "risk_level": doc.get("risk_level", "Low"),
        "entered_by": doc.get("entered_by", doc.get("email", "")),
        "predictor_role": doc.get("predictor_role", doc.get("role", "")),
        "predictor_official_id": doc.get("predictor_official_id", doc.get("official_id", "")),
        "reasons": doc.get("reasons", []),
        "actions": doc.get("actions", []),
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
def home():
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)
    return render_template("home.html", show_nav=False)


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")
        role = request.form.get("role", "").strip()
        official_id_input = request.form.get("official_id", "")
        accept_terms = request.form.get("accept_terms")

        if not username or not email or not password or not confirm_password or not role or not official_id_input:
            flash("All fields are required.", "error")
            return render_template("signup.html", show_nav=False)

        if role not in ALLOWED_SIGNUP_ROLES:
            flash("Please choose Employee or Analyst.", "error")
            return render_template("signup.html", show_nav=False)

        try:
            official_id = parse_official_id(role, official_id_input)
        except ValueError as error:
            flash(str(error), "error")
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

        try:
            existing = get_user_by_email(email, suppress_errors=False)
            existing_official_id = users_collection.find_one({"official_id": official_id})
        except Exception as error:
            if is_mongo_unavailable_error(error):
                flash(MONGO_UNAVAILABLE_MESSAGE, "error")
                return render_template("signup.html", show_nav=False)
            raise

        hashed_password = generate_password_hash(password)

        if existing:
            flash("Email already registered. Please sign in.", "error")
            return render_template("signup.html", show_nav=False)

        if official_id == ADMIN_ID or existing_official_id:
            flash("This official ID is already registered.", "error")
            return render_template("signup.html", show_nav=False)

        request_timestamp = now_utc()

        try:
            create_signup_request(
                users_collection,
                username=username,
                email=email,
                password_hash=hashed_password,
                role=role,
                official_id=official_id,
                now=request_timestamp,
                pending_status=STATUS_PENDING,
            )
        except Exception as error:
            app.logger.exception("Signup request creation failed: %s", error)
            error_text = str(error).lower()
            if "duplicate" in error_text or "e11000" in error_text:
                flash("This email or official ID is already registered.", "error")
                return render_template("signup.html", show_nav=False)
            if is_mongo_unavailable_error(error):
                flash(MONGO_UNAVAILABLE_MESSAGE, "error")
                return render_template("signup.html", show_nav=False)
            flash("Unable to create account right now. Please try again.", "error")
            return render_template("signup.html", show_nav=False)

        notify_admin_new_signup(
            mail=mail,
            admin_email=ADMIN_EMAIL,
            username=username,
            user_email=email,
            role=role,
            request_time=request_timestamp,
            review_link=url_for("approval_requests", _external=True),
        )

        return redirect(url_for("request_submitted"))

    return render_template("signup.html", show_nav=False)


@app.route("/request-submitted")
def request_submitted():
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)
    return render_template("request_submitted.html", show_nav=False)


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()

        if not email:
            flash("Email is required.", "error")
            return render_template("forgot_password.html", show_nav=False, submitted_email=email)

        if not is_valid_email_address(email):
            flash("Enter a valid email address.", "error")
            return render_template("forgot_password.html", show_nav=False, submitted_email=email)

        try:
            user_doc = get_user_by_email(email, suppress_errors=False)
            if can_request_password_reset(user_doc):
                token, _ = issue_password_reset_token(user_doc)
                email_context = build_password_reset_email_context(user_doc, token)
                send_password_reset_email(
                    mail=mail,
                    user_email=email_context["email"],
                    username=email_context["username"],
                    reset_link=email_context["reset_link"],
                    expiry_minutes=email_context["expiry_minutes"],
                )
        except Exception as error:
            if is_mongo_unavailable_error(error):
                flash(MONGO_UNAVAILABLE_MESSAGE, "error")
                return render_template("forgot_password.html", show_nav=False, submitted_email=email)
            raise

        flash(PASSWORD_RESET_GENERIC_MESSAGE, "success")
        return redirect(url_for("forgot_password"))

    return render_template("forgot_password.html", show_nav=False)


@app.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token: str):
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)

    try:
        user_doc = get_user_by_reset_token(token, suppress_errors=False)
    except Exception as error:
        if is_mongo_unavailable_error(error):
            flash(MONGO_UNAVAILABLE_MESSAGE, "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=False)
        raise

    reset_token_valid = can_request_password_reset(user_doc)

    if request.method == "POST":
        if not reset_token_valid:
            flash(PASSWORD_RESET_INVALID_MESSAGE, "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=False)

        new_password = request.form.get("new_password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not new_password or not confirm_password:
            flash("New password and confirmation are required.", "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=True)

        if new_password != confirm_password:
            flash("Passwords do not match.", "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=True)

        password_error = validate_signup_password(new_password, user_doc.get("username", "User"), user_doc.get("email", ""))
        if password_error:
            flash(password_error, "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=True)

        existing_password_hash = user_doc.get("password_hash") or ""
        if existing_password_hash and check_password_hash(existing_password_hash, new_password):
            flash("Choose a new password that is different from your current one.", "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=True)

        now = now_utc()

        try:
            update_result = users_collection.update_one(
                {
                    "_id": user_doc["_id"],
                    "reset_token_hash": hash_reset_token(token),
                    "reset_token_expires_at": {"$gt": now},
                },
                {
                    "$set": {
                        "password_hash": generate_password_hash(new_password),
                        "password_reset_at": now,
                        "updated_at": now,
                    },
                    "$unset": {
                        "reset_token_hash": "",
                        "reset_token_expires_at": "",
                        "reset_token_created_at": "",
                    },
                },
            )
        except Exception as error:
            if is_mongo_unavailable_error(error):
                flash(MONGO_UNAVAILABLE_MESSAGE, "error")
                return render_template("reset_password.html", show_nav=False, reset_token_valid=True)
            raise

        if update_result.modified_count != 1:
            flash(PASSWORD_RESET_INVALID_MESSAGE, "error")
            return render_template("reset_password.html", show_nav=False, reset_token_valid=False)

        send_password_changed_confirmation(
            mail=mail,
            user_email=(user_doc.get("email") or "").strip().lower(),
            username=user_doc.get("username") or "User",
            changed_at=now,
            action_source="Password reset link",
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr or "") or "Unknown",
            device_info=request.headers.get("User-Agent", "Unknown device"),
            sign_in_link=url_for("signin", _external=True),
        )

        flash("Your password has been reset successfully. Please sign in.", "success")
        return redirect(url_for("signin"))

    return render_template("reset_password.html", show_nav=False, reset_token_valid=reset_token_valid)


@app.route("/signin", methods=["GET", "POST"])
def signin():
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            flash("Email and password are required.", "error")
            return render_template("signin.html", show_nav=False)

        try:
            user_doc = get_user_by_email(email, suppress_errors=False)
        except Exception as error:
            if is_mongo_unavailable_error(error):
                flash(MONGO_UNAVAILABLE_MESSAGE, "error")
                return render_template("signin.html", show_nav=False)
            raise

        if not user_doc or not user_doc.get("password_hash"):
            flash("Invalid credentials.", "error")
            return render_template("signin.html", show_nav=False)

        if not check_password_hash(user_doc["password_hash"], password):
            flash("Invalid credentials.", "error")
            return render_template("signin.html", show_nav=False)

        status = user_doc.get("status")
        if status == STATUS_PENDING:
            flash("Your account is waiting for admin approval.", "warning")
            return render_template("signin.html", show_nav=False)
        if status == STATUS_REJECTED:
            flash("Your registration request was rejected. Please contact the administrator.", "error")
            return render_template("signin.html", show_nav=False)
        if status != STATUS_APPROVED:
            flash("Your account cannot sign in right now.", "error")
            return render_template("signin.html", show_nav=False)

        if user_doc.get("role") == ROLE_ADMIN:
            flash("Use the separate Admin Login page.", "error")
            return render_template("signin.html", show_nav=False)

        try:
            updated = users_collection.find_one_and_update(
                {"_id": user_doc["_id"]},
                {"$set": {"last_login": now_utc(), "updated_at": now_utc()}},
                return_document=ReturnDocument.AFTER,
            )
        except Exception as error:
            if is_mongo_unavailable_error(error):
                flash(MONGO_UNAVAILABLE_MESSAGE, "error")
                return render_template("signin.html", show_nav=False)
            raise

        login_user(AppUser(updated))
        return redirect_to_dashboard(current_user)

    return render_template("signin.html", show_nav=False)


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user)

    if request.method == "POST":
        identifier = request.form.get("identifier", "").strip()
        password = request.form.get("password", "")

        if not identifier or not password:
            flash("Admin ID/Email and password are required.", "error")
            return render_template("admin_login.html", show_nav=False)

        matches_identifier = identifier.upper() == ADMIN_ID or identifier.lower() == ADMIN_EMAIL
        if matches_identifier and password == ADMIN_PASSWORD:
            admin_doc = upsert_admin_account(update_last_login=True) or fixed_admin_doc()
            login_user(AppUser(admin_doc))
            flash("Admin login successful.", "success")
            return redirect(url_for("admin_dashboard"))

        flash("Invalid admin credentials.", "error")
        return render_template("admin_login.html", show_nav=False)

    return render_template("admin_login.html", show_nav=False)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("signin"))


@app.route("/dashboard")
@login_required
def dashboard():
    return redirect_to_dashboard(current_user)


def _prediction_counts_by_user(user_id: str) -> Dict[str, int]:
    all_count = predictions_collection.count_documents({"user_id": user_id})
    high_count = predictions_collection.count_documents({"user_id": user_id, "risk_level": "High"})
    return {"all": all_count, "high": high_count, "recent": min(all_count, 5)}


def _serialize_prediction_cursor(cursor):
    return [serialize_prediction(doc) for doc in cursor]


def _compute_admin_analytics() -> Dict[str, Any]:
    now = now_utc()
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)

    def _coerce_datetime(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                return None
        return None

    def _to_day_label(value: Optional[datetime]) -> str:
        return value.strftime("%Y-%m-%d") if value else "Unknown"

    def _trend_percent(current: float, previous: float) -> float:
        if previous <= 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    def _bucket_probability(probability_percent: float) -> str:
        if probability_percent >= 70:
            return "High"
        if probability_percent >= 40:
            return "Medium"
        return "Low"

    user_docs = list(users_collection.find({"role": {"$in": [ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_ANALYST]}}))
    prediction_docs = list(predictions_collection.find({}).sort("created_at", -1).limit(3000))

    total_registered = len(user_docs)
    status_counts = {"approved": 0, "pending": 0, "rejected": 0}
    status_counts_non_admin = {"approved": 0, "pending": 0, "rejected": 0}
    role_counts = {ROLE_ADMIN: 0, ROLE_EMPLOYEE: 0, ROLE_ANALYST: 0}
    signup_trend: Dict[str, int] = {}
    signup_week = 0
    signup_prev_week = 0
    pending_week = 0
    pending_prev_week = 0
    active_users_week = 0

    approval_today = {"approved": 0, "rejected": 0}
    approval_durations_hours: list[float] = []
    approval_timeline = []
    approval_daily_trend: Dict[str, Dict[str, int]] = {}

    for user in user_docs:
        role = user.get("role") or ROLE_EMPLOYEE
        role_counts[role] = role_counts.get(role, 0) + 1

        status = str(user.get("status") or STATUS_PENDING).strip().lower()
        if status not in status_counts:
            status = STATUS_PENDING
        status_counts[status] += 1
        if role != ROLE_ADMIN:
            status_counts_non_admin[status] += 1

        req_dt = _coerce_datetime(user.get("request_date") or user.get("created_at"))
        upd_dt = _coerce_datetime(user.get("updated_at"))
        last_login = _coerce_datetime(user.get("last_login"))

        if req_dt:
            day_label = _to_day_label(req_dt)
            signup_trend[day_label] = signup_trend.get(day_label, 0) + 1
            if req_dt >= week_start:
                signup_week += 1
                if status == STATUS_PENDING:
                    pending_week += 1
            elif prev_week_start <= req_dt < week_start:
                signup_prev_week += 1
                if status == STATUS_PENDING:
                    pending_prev_week += 1

        if last_login and last_login >= week_start:
            active_users_week += 1

        # Admin account activity should not be counted as signup/approval workflow traffic.
        if role == ROLE_ADMIN:
            continue

        if upd_dt and status in {STATUS_APPROVED, STATUS_REJECTED}:
            if upd_dt.date() == now.date():
                approval_today[status] += 1
            trend_key = _to_day_label(upd_dt)
            if trend_key not in approval_daily_trend:
                approval_daily_trend[trend_key] = {"approved": 0, "rejected": 0}
            approval_daily_trend[trend_key][status] += 1

            if req_dt and upd_dt >= req_dt:
                approval_durations_hours.append((upd_dt - req_dt).total_seconds() / 3600)

            approval_timeline.append(
                {
                    "name": user.get("username") or "User",
                    "email": user.get("email") or "-",
                    "role": role,
                    "status": status,
                    "time": _as_display_datetime(upd_dt),
                    "sort_ts": upd_dt.timestamp(),
                }
            )

    prediction_total = len(prediction_docs)
    risk_counts = {"High": 0, "Medium": 0, "Low": 0}
    confidence_bands = {"0-39": 0, "40-69": 0, "70-84": 0, "85-100": 0}
    prediction_trend: Dict[str, int] = {}
    activity_people: Dict[str, int] = {}
    activity_roles: Dict[str, int] = {ROLE_ADMIN: 0, ROLE_EMPLOYEE: 0, ROLE_ANALYST: 0}

    probability_sum = 0.0
    prediction_week = 0
    prediction_prev_week = 0
    high_week = 0
    high_prev_week = 0
    low_week = 0
    low_prev_week = 0
    analyst_prediction_count = 0

    for doc in prediction_docs:
        created_dt = _coerce_datetime(doc.get("created_at"))
        probability = float(doc.get("probability") or 0.0)
        probability_sum += probability

        risk_level = str(doc.get("risk_level") or _bucket_probability(probability)).capitalize()
        if risk_level not in risk_counts:
            risk_level = _bucket_probability(probability)
        risk_counts[risk_level] += 1

        if probability < 40:
            confidence_bands["0-39"] += 1
        elif probability < 70:
            confidence_bands["40-69"] += 1
        elif probability < 85:
            confidence_bands["70-84"] += 1
        else:
            confidence_bands["85-100"] += 1

        if created_dt:
            day_label = _to_day_label(created_dt)
            prediction_trend[day_label] = prediction_trend.get(day_label, 0) + 1

            if created_dt >= week_start:
                prediction_week += 1
                if risk_level == "High":
                    high_week += 1
                if risk_level == "Low":
                    low_week += 1
            elif prev_week_start <= created_dt < week_start:
                prediction_prev_week += 1
                if risk_level == "High":
                    high_prev_week += 1
                if risk_level == "Low":
                    low_prev_week += 1

        person = doc.get("entered_by") or doc.get("email") or "Unknown"
        activity_people[person] = activity_people.get(person, 0) + 1

        predictor_role = doc.get("predictor_role") or ROLE_EMPLOYEE
        activity_roles[predictor_role] = activity_roles.get(predictor_role, 0) + 1
        if predictor_role == ROLE_ANALYST:
            analyst_prediction_count += 1

    avg_probability = round((probability_sum / prediction_total), 2) if prediction_total else 0.0

    approved_count = status_counts[STATUS_APPROVED]
    rejected_count = status_counts[STATUS_REJECTED]
    pending_count = status_counts[STATUS_PENDING]
    non_admin_total = total_registered - role_counts.get(ROLE_ADMIN, 0)
    approval_approved_count = status_counts_non_admin[STATUS_APPROVED]
    approval_rejected_count = status_counts_non_admin[STATUS_REJECTED]
    approval_pending_count = status_counts_non_admin[STATUS_PENDING]

    processed_count = status_counts_non_admin[STATUS_APPROVED] + status_counts_non_admin[STATUS_REJECTED]
    approval_rate = round((status_counts_non_admin[STATUS_APPROVED] / processed_count) * 100, 2) if processed_count else 0.0
    avg_approval_hours = round(sum(approval_durations_hours) / len(approval_durations_hours), 2) if approval_durations_hours else 0.0

    role_distribution = [
        {"label": ROLE_ADMIN, "value": role_counts.get(ROLE_ADMIN, 0)},
        {"label": ROLE_EMPLOYEE, "value": role_counts.get(ROLE_EMPLOYEE, 0)},
        {"label": ROLE_ANALYST, "value": role_counts.get(ROLE_ANALYST, 0)},
    ]
    approval_status_distribution = [
        {"label": "Approved", "value": approved_count},
        {"label": "Pending", "value": pending_count},
        {"label": "Rejected", "value": rejected_count},
    ]

    signup_points = [{"label": key, "value": value} for key, value in sorted(signup_trend.items())][-14:]
    prediction_points = [{"label": key, "value": value} for key, value in sorted(prediction_trend.items())][-14:]
    approval_daily_points = [
        {
            "label": key,
            "approved": value.get("approved", 0),
            "rejected": value.get("rejected", 0),
        }
        for key, value in sorted(approval_daily_trend.items())
    ][-10:]

    top_activity_people = [
        {"label": key, "value": value} for key, value in sorted(activity_people.items(), key=lambda item: item[1], reverse=True)
    ][:8]

    most_common_risk = max(risk_counts.items(), key=lambda item: item[1])[0] if prediction_total else "-"
    most_active_role = max(activity_roles.items(), key=lambda item: item[1])[0] if prediction_total else "-"

    kpis = [
        {
            "key": "total_registered_users",
            "label": "Total Registered Users",
            "value": total_registered,
            "icon": "fa-solid fa-users",
            "tone": "neutral",
            "trend": _trend_percent(signup_week, signup_prev_week),
            "meta": f"{signup_week} new this week",
        },
        {
            "key": "total_approved_users",
            "label": "Total Approved Users",
            "value": approved_count,
            "icon": "fa-solid fa-user-check",
            "tone": "success",
            "trend": _trend_percent(approval_today["approved"], max(1, approved_count - approval_today["approved"])),
            "meta": f"{approval_today['approved']} approved today",
        },
        {
            "key": "total_pending_requests",
            "label": "Total Pending Approval Requests",
            "value": pending_count,
            "icon": "fa-solid fa-hourglass-half",
            "tone": "warning",
            "trend": _trend_percent(pending_week, pending_prev_week),
            "meta": "Awaiting admin action",
        },
        {
            "key": "total_rejected_users",
            "label": "Total Rejected Users",
            "value": rejected_count,
            "icon": "fa-solid fa-user-xmark",
            "tone": "danger",
            "trend": _trend_percent(approval_today["rejected"], max(1, rejected_count - approval_today["rejected"])),
            "meta": f"{approval_today['rejected']} rejected today",
        },
        {
            "key": "total_predictions_made",
            "label": "Total Predictions Made",
            "value": prediction_total,
            "icon": "fa-solid fa-chart-line",
            "tone": "primary",
            "trend": _trend_percent(prediction_week, prediction_prev_week),
            "meta": f"{prediction_week} in last 7 days",
        },
        {
            "key": "total_high_churn_cases",
            "label": "Total High Churn Cases",
            "value": risk_counts["High"],
            "icon": "fa-solid fa-triangle-exclamation",
            "tone": "danger",
            "trend": _trend_percent(high_week, high_prev_week),
            "meta": "Critical-risk segment",
        },
        {
            "key": "total_low_churn_cases",
            "label": "Total Low Churn Cases",
            "value": risk_counts["Low"],
            "icon": "fa-solid fa-shield-heart",
            "tone": "success",
            "trend": _trend_percent(low_week, low_prev_week),
            "meta": "Stable customer segment",
        },
        {
            "key": "average_churn_probability",
            "label": "Average Churn Probability",
            "value": avg_probability,
            "suffix": "%",
            "icon": "fa-solid fa-gauge-high",
            "tone": "primary",
            "trend": _trend_percent(avg_probability, 50.0),
            "meta": "Across all predictions",
        },
        {
            "key": "active_users_this_week",
            "label": "Active Users This Week",
            "value": active_users_week,
            "icon": "fa-solid fa-bolt",
            "tone": "success",
            "trend": _trend_percent(active_users_week, max(1, total_registered - active_users_week)),
            "meta": "Based on last login",
        },
        {
            "key": "reports_generated",
            "label": "Reports Generated",
            "value": analyst_prediction_count,
            "icon": "fa-solid fa-file-lines",
            "tone": "neutral",
            "trend": _trend_percent(analyst_prediction_count, max(1, prediction_total - analyst_prediction_count)),
            "meta": "Analyst-generated records",
        },
    ]

    return {
        "trend_points": prediction_points,
        "high_vs_low": {"High": risk_counts.get("High", 0), "Low": risk_counts.get("Low", 0)},
        "activity_points": top_activity_people,
        "kpis": kpis,
        "user_analytics": {
            "role_distribution": role_distribution,
            "approval_distribution": approval_status_distribution,
            "signup_trend": signup_points,
            "most_active_role": most_active_role,
            "totals": {
                "admins": role_counts.get(ROLE_ADMIN, 0),
                "employees": role_counts.get(ROLE_EMPLOYEE, 0),
                "analysts": role_counts.get(ROLE_ANALYST, 0),
            },
        },
        "prediction_analytics": {
            "total_predictions": prediction_total,
            "risk_counts": risk_counts,
            "average_confidence": avg_probability,
            "prediction_trend": prediction_points,
            "most_common_risk": most_common_risk,
            "confidence_bands": confidence_bands,
            "active_people": top_activity_people,
        },
        "approval_workflow": {
            "pending_requests": pending_count,
            "approved_today": approval_today["approved"],
            "rejected_today": approval_today["rejected"],
            "average_approval_hours": avg_approval_hours,
            "approval_rate": approval_rate,
            "pipeline": {
                "total": non_admin_total,
                "pending": approval_pending_count,
                "approved": approval_approved_count,
                "rejected": approval_rejected_count,
            },
            "daily": approval_daily_points,
            "recent_actions": [
                {
                    "name": row["name"],
                    "email": row["email"],
                    "role": row["role"],
                    "status": row["status"],
                    "time": row["time"],
                }
                for row in sorted(approval_timeline, key=lambda row: row.get("sort_ts", 0), reverse=True)[:10]
            ],
        },
    }


def _compute_analyst_dashboard_analytics() -> Dict[str, Any]:
    now = now_utc()
    today = now.date()
    yesterday_start = now - timedelta(days=1)
    two_days_back = now - timedelta(days=2)
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)

    def _coerce_datetime(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                return None
        return None

    def _to_day(value: Optional[datetime]) -> str:
        return value.strftime("%Y-%m-%d") if value else "Unknown"

    def _risk_from_row(probability: float, raw_risk: Any) -> str:
        cleaned = str(raw_risk or "").strip().capitalize()
        if cleaned in {"High", "Medium", "Low"}:
            return cleaned
        if probability >= 70:
            return "High"
        if probability >= 40:
            return "Medium"
        return "Low"

    docs = list(predictions_collection.find({}).sort("created_at", -1).limit(3000))

    total_predictions = len(docs)
    predictions_today = 0
    probability_sum = 0.0
    risk_counts = {"High": 0, "Medium": 0, "Low": 0}

    trend_days: Dict[str, int] = {}
    recent_rows = []

    high_24h = 0
    high_prev_24h = 0
    predictions_24h = 0
    predictions_prev_24h = 0
    inactive_week = 0
    inactive_prev_week = 0
    daily_week: Dict[str, int] = {}

    feature_values = {
        "Credit Score": {"all": [], "high": [], "low": []},
        "Balance": {"all": [], "high": [], "low": []},
        "Age": {"all": [], "high": [], "low": []},
        "Tenure": {"all": [], "high": [], "low": []},
        "Active Member": {"all": [], "high": [], "low": []},
        "Credit Card": {"all": [], "high": [], "low": []},
    }

    for doc in docs:
        created_at = _coerce_datetime(doc.get("created_at"))
        probability = float(doc.get("probability") or 0.0)
        risk_level = _risk_from_row(probability, doc.get("risk_level"))
        is_active = int(float(doc.get("IsActiveMember") or 0))

        probability_sum += probability
        risk_counts[risk_level] += 1

        if created_at and created_at.date() == today:
            predictions_today += 1

        day_key = _to_day(created_at)
        trend_days[day_key] = trend_days.get(day_key, 0) + 1

        if created_at and created_at >= yesterday_start:
            predictions_24h += 1
            if risk_level == "High":
                high_24h += 1
        elif created_at and two_days_back <= created_at < yesterday_start:
            predictions_prev_24h += 1
            if risk_level == "High":
                high_prev_24h += 1

        if created_at and created_at >= week_start:
            if is_active == 0:
                inactive_week += 1
            daily_key = _to_day(created_at)
            daily_week[daily_key] = daily_week.get(daily_key, 0) + 1
        elif created_at and prev_week_start <= created_at < week_start and is_active == 0:
            inactive_prev_week += 1

        row = serialize_prediction(doc)
        recent_rows.append(
            {
                "CustomerId": row.get("CustomerId", "-"),
                "CreditScore": float(row.get("CreditScore") or 0),
                "Balance": float(row.get("Balance") or 0),
                "probability": float(row.get("probability") or 0),
                "risk_level": _risk_from_row(float(row.get("probability") or 0), row.get("risk_level")),
                "date": row.get("date", ""),
                "date_display": row.get("date_display", "-"),
            }
        )

        feature_map = {
            "Credit Score": float(doc.get("CreditScore") or 0),
            "Balance": float(doc.get("Balance") or 0),
            "Age": float(doc.get("Age") or 0),
            "Tenure": float(doc.get("Tenure") or 0),
            "Active Member": 1.0 if int(float(doc.get("IsActiveMember") or 0)) == 1 else 0.0,
            "Credit Card": 1.0 if int(float(doc.get("HasCrCard") or 0)) == 1 else 0.0,
        }

        for feature, value in feature_map.items():
            feature_values[feature]["all"].append(value)
            if risk_level == "High":
                feature_values[feature]["high"].append(value)
            if risk_level == "Low":
                feature_values[feature]["low"].append(value)

    sorted_days = sorted([k for k in trend_days.keys() if k != "Unknown"])
    trend_points = [{"label": day, "value": trend_days[day]} for day in sorted_days[-10:]]

    average_probability = round((probability_sum / total_predictions), 2) if total_predictions else 0.0

    def _percent_change(current: float, previous: float) -> float:
        if previous <= 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    def _safe_mean(values: list[float]) -> float:
        return sum(values) / len(values) if values else 0.0

    feature_impacts = []
    for feature, grouped in feature_values.items():
        all_values = grouped["all"]
        high_values = grouped["high"]
        low_values = grouped["low"]

        high_mean = _safe_mean(high_values)
        low_mean = _safe_mean(low_values)
        diff = abs(high_mean - low_mean)

        if feature in {"Active Member", "Credit Card"}:
            score = round(min(100.0, diff * 100.0), 1)
        else:
            value_range = (max(all_values) - min(all_values)) if all_values else 1.0
            normalized = (diff / value_range) * 100 if value_range > 0 else 0
            score = round(min(100.0, normalized), 1)

        feature_impacts.append(
            {
                "feature": feature,
                "score": score,
                "high_mean": round(high_mean, 2),
                "low_mean": round(low_mean, 2),
            }
        )

    feature_impacts.sort(key=lambda item: item["score"], reverse=True)

    avg_daily_week = (sum(daily_week.values()) / len(daily_week)) if daily_week else 0.0
    high_change = _percent_change(high_24h, high_prev_24h)
    prediction_change = _percent_change(predictions_24h, predictions_prev_24h)
    inactive_change = _percent_change(inactive_week, inactive_prev_week)

    risk_alerts = [
        {
            "type": "high-risk",
            "severity": "high" if high_change > 15 else ("medium" if high_change > 0 else "low"),
            "title": "High-risk customers trend",
            "description": f"{high_24h} high-risk predictions in last 24h ({high_change:+.1f}% vs previous 24h).",
        },
        {
            "type": "prediction-spike",
            "severity": "high" if predictions_24h > (avg_daily_week * 1.6) and predictions_24h >= 5 else "medium",
            "title": "Prediction volume spike",
            "description": f"{predictions_24h} predictions in last 24h, weekly daily average is {avg_daily_week:.1f}.",
        },
        {
            "type": "inactive-rise",
            "severity": "high" if inactive_change > 20 else ("medium" if inactive_change > 0 else "low"),
            "title": "Inactive customer increase",
            "description": f"{inactive_week} inactive-member predictions in last 7 days ({inactive_change:+.1f}% vs prior 7 days).",
        },
    ]

    return {
        "generated_at": now.isoformat(),
        "kpis": {
            "total_predictions": total_predictions,
            "predictions_today": predictions_today,
            "high_risk": risk_counts["High"],
            "medium_risk": risk_counts["Medium"],
            "low_risk": risk_counts["Low"],
            "average_probability": average_probability,
        },
        "risk_distribution": risk_counts,
        "trend_points": trend_points,
        "feature_impacts": feature_impacts[:6],
        "recent_predictions": recent_rows[:10],
        "risk_alerts": risk_alerts,
        "meta": {
            "high_risk_change_24h": high_change,
            "prediction_change_24h": prediction_change,
            "inactive_change_7d": inactive_change,
        },
    }


@app.route("/admin/dashboard")
@role_required(ROLE_ADMIN)
def admin_dashboard():
    total_users = users_collection.count_documents({"role": {"$in": [ROLE_EMPLOYEE, ROLE_ANALYST]}})
    total_employees = users_collection.count_documents({"role": ROLE_EMPLOYEE})
    total_analysts = users_collection.count_documents({"role": ROLE_ANALYST})
    total_predictions = predictions_collection.count_documents({})
    high_risk_predictions = predictions_collection.count_documents({"risk_level": "High"})

    recent_docs = _serialize_prediction_cursor(predictions_collection.find({}).sort("created_at", -1).limit(12))
    recent_activity = []
    for row in recent_docs:
        recent_activity.append(
            {
                "CustomerId": row.get("CustomerId", "-"),
                "prediction": row.get("prediction", "-"),
                "risk_score": round(float(row.get("probability") or 0), 2),
                "entered_by": row.get("entered_by") or row.get("email") or "-",
                "date_time": row.get("date_display", "-"),
            }
        )

    return render_template(
        "admin_dashboard.html",
        show_nav=True,
        total_users=total_users,
        total_employees=total_employees,
        total_analysts=total_analysts,
        total_predictions=total_predictions,
        high_risk_predictions=high_risk_predictions,
        recent_activity=recent_activity,
    )


@app.route("/admin/approval-requests")
@role_required(ROLE_ADMIN)
def approval_requests():
    requests_cursor = users_collection.find({"role": {"$in": [ROLE_EMPLOYEE, ROLE_ANALYST]}}).sort("request_date", -1)
    requests_data = []
    for doc in requests_cursor:
        requests_data.append(
            {
                "id": str(doc.get("_id")),
                "username": doc.get("username", ""),
                "email": doc.get("email", ""),
                "role": doc.get("role", ""),
                "official_id": doc.get("official_id", ""),
                "request_date": _as_display_datetime(doc.get("request_date")),
                "status": str(doc.get("status", STATUS_PENDING)).strip().lower(),
            }
        )
    return render_template("approval_requests.html", show_nav=True, requests_data=requests_data)


@app.post("/admin/approval-requests/<user_id>/approve")
@role_required(ROLE_ADMIN)
def approve_request(user_id: str):
    try:
        object_id = ObjectId(user_id)
    except Exception:
        flash("Invalid user request ID.", "error")
        return redirect(url_for("approval_requests"))

    updated = approve_signup_request(
        users_collection,
        object_id=object_id,
        now=now_utc(),
        pending_status=STATUS_PENDING,
        approved_status=STATUS_APPROVED,
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        notify_user_approved(
            mail=mail,
            user_email=(updated.get("email") or "").strip().lower(),
            username=updated.get("username") or "User",
            role=updated.get("role") or ROLE_EMPLOYEE,
            approved_at=now_utc(),
            login_link=url_for("signin", _external=True),
        )
        flash("User approved successfully.", "success")
    else:
        flash("Approval failed. Request may already be processed.", "error")
    return redirect(url_for("approval_requests"))


@app.post("/admin/approval-requests/<user_id>/reject")
@role_required(ROLE_ADMIN)
def reject_request(user_id: str):
    try:
        object_id = ObjectId(user_id)
    except Exception:
        flash("Invalid user request ID.", "error")
        return redirect(url_for("approval_requests"))

    updated = users_collection.find_one_and_update(
        {"_id": object_id, "status": {"$in": [STATUS_PENDING, "Pending"]}},
        {"$set": {"status": STATUS_REJECTED, "updated_at": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        flash("User rejected.", "warning")
    else:
        flash("Reject failed. Request may already be processed.", "error")
    return redirect(url_for("approval_requests"))


@app.route("/admin/users")
@role_required(ROLE_ADMIN)
def admin_users():
    raw_rows = list(users_collection.find({"role": {"$in": [ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_ANALYST]}}).sort("created_at", -1))
    user_rows = []
    for doc in raw_rows:
        row = dict(doc)
        row["last_login_display"] = format_login_datetime(doc.get("last_login"))
        user_rows.append(row)

    return render_template("admin_users.html", show_nav=True, user_rows=user_rows)


@app.route("/admin/prediction-records")
@role_required(ROLE_ADMIN)
def admin_prediction_records():
    rows = _serialize_prediction_cursor(predictions_collection.find({}).sort("created_at", -1).limit(300))
    return render_template("admin_prediction_records.html", show_nav=True, rows=rows)


@app.route("/admin/analytics")
@role_required(ROLE_ADMIN)
def admin_analytics():
    analytics = _compute_admin_analytics()
    return render_template("admin_analytics.html", show_nav=True, analytics_json=json.dumps(analytics))


@app.route("/employee/dashboard")
@role_required(ROLE_EMPLOYEE)
def employee_dashboard():
    stats = _prediction_counts_by_user(current_user.id)
    recent = _serialize_prediction_cursor(predictions_collection.find({"user_id": current_user.id}).sort("created_at", -1).limit(8))
    return render_template("employee_dashboard.html", show_nav=True, stats=stats, recent=recent)


@app.route("/analyst/dashboard")
@role_required(ROLE_ANALYST)
def analyst_dashboard():
    analytics = _compute_analyst_dashboard_analytics()

    return render_template(
        "analyst_dashboard.html",
        show_nav=True,
        analyst_analytics_json=json.dumps(analytics),
    )


@app.route("/analyst/dashboard/data")
@role_required(ROLE_ANALYST)
def analyst_dashboard_data():
    return _compute_analyst_dashboard_analytics()


@app.post("/analyst/simulate")
@role_required(ROLE_ANALYST)
def analyst_simulate():
    payload = request.get_json(silent=True) or {}
    required_fields = {
        "Age": (18, 100),
        "CreditScore": (300, 900),
        "Balance": (0, None),
        "Tenure": (0, 40),
        "HasCrCard": (0, 1),
        "IsActiveMember": (0, 1),
        "EstimatedSalary": (0, None),
    }

    parsed: Dict[str, float] = {}
    for field, limits in required_fields.items():
        raw = payload.get(field)
        if raw is None:
            return jsonify({"error": f"{field} is required."}), 400
        try:
            value = float(raw)
        except Exception:
            return jsonify({"error": f"{field} must be numeric."}), 400

        low, high = limits
        if low is not None and value < low:
            return jsonify({"error": f"{field} must be >= {low}."}), 400
        if high is not None and value > high:
            return jsonify({"error": f"{field} must be <= {high}."}), 400

        if field in {"HasCrCard", "IsActiveMember"}:
            value = 1.0 if int(value) == 1 else 0.0
        parsed[field] = value

    try:
        probability_percent, base_probability_percent, prediction_raw = predict_probability_percent(parsed)
        probability_value = probability_percent / 100
        risk_level = risk_level_from_probability(probability_value)
        guidance = build_retention_guidance(parsed, probability_percent, prediction_raw)

        explanation = (
            guidance["reasons"][0]
            if guidance.get("reasons")
            else "Risk is derived from account profile and behavior signals."
        )

        return {
            "probability": probability_percent,
            "base_probability": base_probability_percent,
            "risk_level": risk_level,
            "prediction": "Customer Will Churn" if prediction_raw == 1 else "Customer Will Stay",
            "explanation": explanation,
            "reasons": guidance.get("reasons", []),
            "actions": guidance.get("actions", []),
        }
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        app.logger.warning("Analyst simulator failed: %s", error)
        return jsonify({"error": "Unable to run churn simulator right now."}), 500


@app.route("/predict", methods=["GET", "POST"])
@role_required(ROLE_EMPLOYEE)
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
            customer_id = parse_customer_id(request.form)
            payload = parse_prediction_payload(request.form)
            num_of_products = parse_num_of_products(request.form)
            probability_percent, base_probability_percent, prediction_raw = predict_probability_percent(payload)
            probability = probability_percent / 100
            risk_level = risk_level_from_probability(probability)

            prediction_text = "Customer Will Churn" if prediction_raw == 1 else "Customer Will Stay"
            guidance = build_retention_guidance(payload, probability_percent, prediction_raw)

            prediction_doc = {
                "user_id": current_user.id,
                "email": current_user.email,
                "entered_by": current_user.username,
                "predictor_role": current_user.role,
                "predictor_official_id": current_user.official_id,
                "created_at": now_utc(),
                "CustomerId": customer_id,
                "ClientId": customer_id,
                "CreditScore": payload["CreditScore"],
                "Age": payload["Age"],
                "Tenure": payload["Tenure"],
                "Balance": payload["Balance"],
                "NumOfProducts": num_of_products,
                "HasCrCard": payload["HasCrCard"],
                "IsActiveMember": payload["IsActiveMember"],
                "EstimatedSalary": payload["EstimatedSalary"],
                "prediction": prediction_text,
                "probability": probability_percent,
                "risk_level": risk_level,
                "base_probability": base_probability_percent,
                "reasons": guidance["reasons"],
                "actions": guidance["actions"],
            }
            predictions_collection.insert_one(prediction_doc)

            write_csv_log(
                {
                    "date": prediction_doc["created_at"].isoformat(),
                    "email": current_user.email,
                    "entered_by": current_user.username,
                    "CustomerId": customer_id,
                    "ClientId": customer_id,
                    **payload,
                    "NumOfProducts": num_of_products,
                    "prediction": prediction_text,
                    "probability": probability_percent,
                    "risk_level": risk_level,
                    "base_probability": base_probability_percent,
                }
            )

            result = {
                "prediction": prediction_text,
                "probability": probability_percent,
                "risk_level": risk_level,
                "reasons": guidance["reasons"],
                "actions": guidance["actions"],
            }
        except ValueError as error:
            flash(str(error), "error")
        except Exception as error:
            flash(f"Prediction failed: {error}", "error")

    prediction_count = predictions_collection.count_documents({"user_id": current_user.id})
    return render_template("predict.html", show_nav=True, result=result, prediction_count=prediction_count)


@app.route("/employee/my-predictions")
@role_required(ROLE_EMPLOYEE)
def my_predictions():
    cursor = predictions_collection.find({"user_id": current_user.id}).sort("created_at", -1)
    predictions = [serialize_prediction(doc) for doc in cursor]
    return render_template(
        "history.html",
        show_nav=True,
        predictions=predictions,
        predictions_json=json.dumps(predictions),
    )


@app.route("/analyst/prediction-analysis")
@role_required(ROLE_ANALYST)
def prediction_analysis():
    rows = _serialize_prediction_cursor(predictions_collection.find({}).sort("created_at", -1).limit(300))
    return render_template("analyst_analysis.html", show_nav=True, rows=rows)


@app.route("/analyst/reports")
@role_required(ROLE_ANALYST)
def analyst_reports():
    rows = _serialize_prediction_cursor(predictions_collection.find({}).sort("created_at", -1).limit(300))
    high = [r for r in rows if float(r.get("probability") or 0) >= 70]
    report_data = {
        "total_predictions": len(rows),
        "high_risk_predictions": len(high),
        "low_risk_predictions": len(rows) - len(high),
    }
    return render_template("analyst_reports.html", show_nav=True, report_data=report_data, rows=rows[:30])


@app.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    if request.method == "POST":
        current_password = request.form.get("current_password", "")
        new_password = request.form.get("new_password", "")
        confirm_password = request.form.get("confirm_password", "")

        if current_user.role == ROLE_ADMIN:
            if current_password != ADMIN_PASSWORD:
                flash("Current password is incorrect.", "error")
                return redirect(url_for("profile"))
            if new_password != confirm_password:
                flash("New passwords do not match.", "error")
                return redirect(url_for("profile"))
            password_error = validate_signup_password(new_password, current_user.username, current_user.email)
            if password_error:
                flash(password_error, "error")
                return redirect(url_for("profile"))
            flash("Admin password is fixed in code and cannot be changed here.", "warning")
            return redirect(url_for("profile"))

        user_doc = get_user_by_id(current_user.id)
        if not user_doc:
            flash("User not found.", "error")
            return redirect(url_for("signin"))

        if not check_password_hash(user_doc.get("password_hash", ""), current_password):
            flash("Current password is incorrect.", "error")
            return redirect(url_for("profile"))

        if new_password != confirm_password:
            flash("New passwords do not match.", "error")
            return redirect(url_for("profile"))

        password_error = validate_signup_password(new_password, current_user.username, current_user.email)
        if password_error:
            flash(password_error, "error")
            return redirect(url_for("profile"))

        users_collection.update_one(
            {"_id": ObjectId(current_user.id)},
            {"$set": {"password_hash": generate_password_hash(new_password), "updated_at": now_utc()}},
        )

        send_password_changed_confirmation(
            mail=mail,
            user_email=(current_user.email or "").strip().lower(),
            username=current_user.username or "User",
            changed_at=now_utc(),
            action_source="Profile security settings",
            ip_address=request.headers.get("X-Forwarded-For", request.remote_addr or "") or "Unknown",
            device_info=request.headers.get("User-Agent", "Unknown device"),
            sign_in_link=url_for("signin", _external=True),
        )

        flash("Password updated successfully.", "success")
        return redirect(url_for("profile"))

    fresh_user_doc = get_user_by_id(current_user.id)
    last_login_value = fresh_user_doc.get("last_login") if fresh_user_doc else current_user.last_login
    last_login_display = format_login_datetime(last_login_value)
    return render_template("profile.html", show_nav=True, last_login_display=last_login_display)


@app.route("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    debug_enabled = (os.getenv("FLASK_DEBUG", "true").strip().lower() == "true")
    # Flask's debug reloader can fail on some Windows setups (WinError 10038).
    use_reloader = debug_enabled and os.name != "nt"
    app.run(debug=debug_enabled, use_reloader=use_reloader)
