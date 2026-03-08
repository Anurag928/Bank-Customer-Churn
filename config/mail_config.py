import os
from typing import Any, Dict


def build_mail_settings() -> Dict[str, Any]:
    """Return Flask-Mail settings driven by environment variables."""
    mail_username = (os.getenv("MAIL_USERNAME", "bankchurnpredictor@gmail.com") or "").strip()
    mail_default_sender = (os.getenv("MAIL_DEFAULT_SENDER") or mail_username).strip()
    return {
        "MAIL_SERVER": os.getenv("MAIL_SERVER", "smtp.gmail.com"),
        "MAIL_PORT": int(os.getenv("MAIL_PORT", "587")),
        "MAIL_USE_TLS": (os.getenv("MAIL_USE_TLS", "true").strip().lower() == "true"),
        "MAIL_USE_SSL": (os.getenv("MAIL_USE_SSL", "false").strip().lower() == "true"),
        "MAIL_USERNAME": mail_username,
        "MAIL_PASSWORD": (os.getenv("MAIL_PASSWORD") or "").strip(),
        "MAIL_DEFAULT_SENDER": mail_default_sender,
        "MAIL_SUPPRESS_SEND": (os.getenv("MAIL_SUPPRESS_SEND", "false").strip().lower() == "true"),
    }


def configure_mail(app) -> None:
    """Attach mail settings to a Flask app instance."""
    app.config.update(build_mail_settings())
