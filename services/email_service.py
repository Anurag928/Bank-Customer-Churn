from typing import Iterable

from flask import current_app
from flask_mail import Mail, Message


STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"


def _can_send_email() -> bool:
    username = (current_app.config.get("MAIL_USERNAME") or "").strip()
    password = (current_app.config.get("MAIL_PASSWORD") or "").strip()
    return bool(username and password)


def send_notification_email(mail: Mail, subject: str, recipients: Iterable[str], body: str) -> bool:
    recipient_list = [item.strip().lower() for item in recipients if item and item.strip()]
    if not recipient_list:
        return False

    if not _can_send_email():
        current_app.logger.warning("Mail not configured. Skipping email subject='%s'.", subject)
        return False

    try:
        message = Message(subject=subject, recipients=recipient_list, body=body)
        mail.send(message)
        return True
    except Exception as error:
        current_app.logger.warning("Email send failed for '%s': %s", subject, error)
        return False


def notify_admin_new_signup(mail: Mail, admin_email: str, user_email: str, role: str) -> bool:
    body = (
        "A new registration request has been submitted in ChurnVision.\n\n"
        f"User Email: {user_email}\n"
        f"Requested Role: {role}\n"
        f"Request Status: {STATUS_PENDING}\n\n"
        "Please review this request in the Admin Dashboard."
    )
    return send_notification_email(
        mail=mail,
        subject="New Signup Request - ChurnVision",
        recipients=[admin_email],
        body=body,
    )


def notify_user_approved(mail: Mail, user_email: str, username: str, role: str) -> bool:
    body = (
        f"Hello {username},\n\n"
        "Your account request for ChurnVision has been approved successfully.\n\n"
        f"Role: {role}\n"
        f"Status: {STATUS_APPROVED}\n\n"
        "You can now sign in and access your dashboard."
    )
    return send_notification_email(
        mail=mail,
        subject="Your Account Has Been Approved - ChurnVision",
        recipients=[user_email],
        body=body,
    )
