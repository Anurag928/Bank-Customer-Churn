from datetime import datetime
from html import escape
from typing import Iterable, Optional

from flask import current_app
from flask_mail import Mail, Message


STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"


def _can_send_email() -> bool:
    username = (current_app.config.get("MAIL_USERNAME") or "").strip()
    password = (current_app.config.get("MAIL_PASSWORD") or "").strip()
    return bool(username and password)


def _format_event_timestamp(value: Optional[datetime]) -> str:
    if not isinstance(value, datetime):
        return "Unknown"
    return value.strftime("%d %b %Y, %I:%M %p UTC")


def _render_cta(label: str, link: str) -> str:
    safe_label = escape(label)
    safe_link = escape(link, quote=True)
    return (
        f"<a href=\"{safe_link}\" style=\"display:inline-block;background:linear-gradient(135deg,#22d3ee,#3b82f6);"
        "color:#061328;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 22px;font-size:14px;"
        "box-shadow:0 8px 22px rgba(34,211,238,0.26);\">"
        f"{safe_label}</a>"
    )


def _brand_shell(*, eyebrow: str, title: str, subtitle: str, body_html: str) -> str:
    return f"""
    <div style="margin:0;padding:28px 14px;background:#0b1020;color:#dbe7ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#1f3a8a,#2563eb);border-radius:18px 18px 0 0;padding:24px 26px;border:1px solid rgba(255,255,255,0.1);border-bottom:none;">
                <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#bfe0ff;font-weight:700;">{escape(eyebrow)}</p>
                <h1 style="margin:0;font-size:30px;line-height:1.2;color:#ffffff;">{escape(title)}</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#d7e7ff;">{escape(subtitle)}</p>
            </div>
            <div style="background:#111a33;border:1px solid rgba(148,175,255,0.24);border-radius:0 0 18px 18px;padding:28px 26px;box-shadow:0 18px 40px rgba(4,10,23,0.45);">
                {body_html}
                <hr style="border:none;border-top:1px solid rgba(148,175,255,0.24);margin:26px 0;" />
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#9eb4d8;">Need help? Contact <a href="mailto:support@churnvision.ai" style="color:#8ec5ff;text-decoration:none;font-weight:600;">support@churnvision.ai</a></p>
                <p style="margin:0;font-size:12px;line-height:1.7;color:#7f95bb;">ChurnVision Security Notifications. Please do not share sensitive credentials through email.</p>
            </div>
        </div>
    </div>
    """


def send_notification_email(
    mail: Mail,
    subject: str,
    recipients: Iterable[str],
    body: str,
    html: Optional[str] = None,
) -> bool:
    recipient_list = [item.strip().lower() for item in recipients if item and item.strip()]
    if not recipient_list:
        return False

    if not _can_send_email():
        current_app.logger.warning("Mail not configured. Skipping email subject='%s'.", subject)
        return False

    try:
        message = Message(subject=subject, recipients=recipient_list, body=body, html=html)
        mail.send(message)
        return True
    except Exception as error:
        current_app.logger.warning("Email send failed for '%s': %s", subject, error)
        return False


def notify_admin_new_signup(
    mail: Mail,
    admin_email: str,
    username: str,
    user_email: str,
    role: str,
    request_time: Optional[datetime] = None,
    review_link: Optional[str] = None,
) -> bool:
    display_time = _format_event_timestamp(request_time)
    safe_username = escape(username or "New User")
    safe_email = escape(user_email)
    safe_role = escape(role)
    safe_status = escape(STATUS_PENDING.title())

    body = (
        "New User Registration Awaiting Approval\n\n"
        f"Name: {username or 'New User'}\n"
        f"Email: {user_email}\n"
        f"Requested Role: {role}\n"
        f"Status: {STATUS_PENDING}\n"
        f"Registration Time: {display_time}\n\n"
        "Please review this access request in the admin workflow."
    )

    cta_html = _render_cta("Review Request", review_link) if review_link else ""
    details_html = (
        "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" style=\"width:100%;border-collapse:collapse;\">"
        "<tr><td style=\"padding:9px 0;color:#9eb4d8;font-size:13px;\">Full Name</td>"
        f"<td style=\"padding:9px 0;color:#e4edff;font-size:14px;font-weight:600;text-align:right;\">{safe_username}</td></tr>"
        "<tr><td style=\"padding:9px 0;color:#9eb4d8;font-size:13px;\">Registered Email</td>"
        f"<td style=\"padding:9px 0;color:#e4edff;font-size:14px;font-weight:600;text-align:right;\">{safe_email}</td></tr>"
        "<tr><td style=\"padding:9px 0;color:#9eb4d8;font-size:13px;\">Requested Role</td>"
        f"<td style=\"padding:9px 0;color:#e4edff;font-size:14px;font-weight:600;text-align:right;\">{safe_role}</td></tr>"
        "<tr><td style=\"padding:9px 0;color:#9eb4d8;font-size:13px;\">Registration Time</td>"
        f"<td style=\"padding:9px 0;color:#e4edff;font-size:14px;font-weight:600;text-align:right;\">{escape(display_time)}</td></tr>"
        "<tr><td style=\"padding:9px 0;color:#9eb4d8;font-size:13px;\">Status</td>"
        f"<td style=\"padding:9px 0;text-align:right;\"><span style=\"display:inline-block;background:rgba(251,191,36,0.16);color:#fcd34d;border:1px solid rgba(251,191,36,0.36);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;\">{safe_status}</span></td></tr>"
        "</table>"
    )

    html = _brand_shell(
        eyebrow="Admin Workflow Alert",
        title="New User Registration Awaiting Approval",
        subtitle="A new access request needs your review in ChurnVision.",
        body_html=(
            "<div style=\"background:#0f2346;border:1px solid rgba(88,129,255,0.36);border-radius:14px;padding:18px 16px;\">"
            f"{details_html}"
            "</div>"
            "<p style=\"margin:16px 0 0;color:#a8bce0;font-size:13px;line-height:1.6;\">Review the request from a trusted admin session and verify role eligibility before approval.</p>"
            f"<div style=\"margin-top:20px;\">{cta_html}</div>"
        ),
    )

    return send_notification_email(
        mail=mail,
        subject="Action Needed: Review New User Access Request",
        recipients=[admin_email],
        body=body,
        html=html,
    )


def notify_user_approved(
    mail: Mail,
    user_email: str,
    username: str,
    role: str,
    approved_at: Optional[datetime] = None,
    login_link: Optional[str] = None,
) -> bool:
    display_time = _format_event_timestamp(approved_at)

    body = (
        f"Hello {username},\n\n"
        "Your account request has been reviewed and approved.\n\n"
        f"Role: {role}\n"
        f"Approved At: {display_time}\n"
        f"Status: {STATUS_APPROVED}\n\n"
        "You can now sign in and access your workspace."
    )

    cta_html = _render_cta("Login to Your Account", login_link) if login_link else ""
    html = _brand_shell(
        eyebrow="Access Approved",
        title="Your Account Has Been Approved",
        subtitle="Welcome to ChurnVision. Your workspace access is now active.",
        body_html=(
            f"<p style=\"margin:0 0 14px;color:#dce8ff;font-size:15px;line-height:1.7;\">Hi {escape(username or 'there')}, your access request was approved by an administrator.</p>"
            "<div style=\"background:#0f2346;border:1px solid rgba(88,129,255,0.36);border-radius:14px;padding:18px 16px;\">"
            "<p style=\"margin:0 0 8px;color:#9eb4d8;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;\">Account Details</p>"
            f"<p style=\"margin:0 0 6px;color:#eef4ff;font-size:14px;\"><strong>Role:</strong> {escape(role)}</p>"
            f"<p style=\"margin:0 0 6px;color:#eef4ff;font-size:14px;\"><strong>Email:</strong> {escape(user_email)}</p>"
            f"<p style=\"margin:0;color:#eef4ff;font-size:14px;\"><strong>Approved At:</strong> {escape(display_time)}</p>"
            "</div>"
            "<div style=\"margin-top:18px;background:#0f1c37;border:1px solid rgba(148,175,255,0.24);border-radius:14px;padding:14px 16px;\">"
            "<p style=\"margin:0 0 8px;color:#dce8ff;font-size:14px;font-weight:700;\">What you can do now</p>"
            "<ul style=\"margin:0;padding-left:18px;color:#a8bce0;font-size:13px;line-height:1.7;\">"
            "<li>Sign in to your approved workspace.</li>"
            "<li>Complete your profile and security settings.</li>"
            "<li>Start using churn prediction and role features.</li>"
            "</ul>"
            "</div>"
            f"<div style=\"margin-top:20px;\">{cta_html}</div>"
        ),
    )

    return send_notification_email(
        mail=mail,
        subject="Welcome, Your Access Is Now Active",
        recipients=[user_email],
        body=body,
        html=html,
    )


def send_password_reset_email(
    mail: Mail,
    user_email: str,
    username: str,
    reset_link: str,
    expiry_minutes: int,
) -> bool:
    safe_name = escape(username or "there")
    safe_link = escape(reset_link, quote=True)

    body = (
        f"Hello {username or 'there'},\n\n"
        "We received a request to reset your ChurnVision password.\n\n"
        f"Reset your password: {reset_link}\n\n"
        f"This link will expire in {expiry_minutes} minutes.\n\n"
        "If you did not request this, you can safely ignore this email.\n"
        "Your existing password will remain unchanged until you create a new one."
    )

    html = _brand_shell(
        eyebrow="Security Request",
        title="Reset Your Password",
        subtitle="Use the secure link below to create a new password.",
        body_html=(
            f"<p style=\"margin:0 0 14px;color:#dce8ff;font-size:15px;line-height:1.7;\">Hello {safe_name}, we received a request to reset your password.</p>"
            f"<div style=\"margin:0 0 16px;\">{_render_cta('Reset Password', reset_link)}</div>"
            "<p style=\"margin:0 0 8px;color:#a8bce0;font-size:13px;line-height:1.7;\">If the button does not work, copy this link:</p>"
            f"<p style=\"margin:0 0 14px;color:#8ec5ff;font-size:13px;word-break:break-all;\">{safe_link}</p>"
            f"<p style=\"margin:0 0 8px;color:#fcd34d;font-size:13px;\">This link expires in {expiry_minutes} minutes.</p>"
            "<p style=\"margin:0;color:#a8bce0;font-size:13px;line-height:1.7;\">If you did not request this change, no action is needed and your current password remains active.</p>"
        ),
    )

    return send_notification_email(
        mail=mail,
        subject="Reset Your Password",
        recipients=[user_email],
        body=body,
        html=html,
    )


def send_password_changed_confirmation(
    mail: Mail,
    user_email: str,
    username: str,
    changed_at: Optional[datetime],
    action_source: str,
    ip_address: str,
    device_info: str,
    sign_in_link: Optional[str] = None,
) -> bool:
    display_time = _format_event_timestamp(changed_at)
    safe_ip = escape(ip_address or "Unknown")
    safe_device = escape(device_info or "Unknown")
    safe_source = escape(action_source or "Account Security")

    body = (
        f"Hello {username or 'there'},\n\n"
        "This is a confirmation that your ChurnVision password was changed successfully.\n\n"
        f"Changed At: {display_time}\n"
        f"Source: {action_source}\n"
        f"IP Address: {ip_address or 'Unknown'}\n"
        f"Device: {device_info or 'Unknown'}\n\n"
        "If this was not you, contact support immediately and secure your account."
    )

    cta_html = _render_cta("Sign In Securely", sign_in_link) if sign_in_link else ""
    html = _brand_shell(
        eyebrow="Security Confirmation",
        title="Your Password Was Changed",
        subtitle="Your account credentials were updated successfully.",
        body_html=(
            f"<p style=\"margin:0 0 14px;color:#dce8ff;font-size:15px;line-height:1.7;\">Hi {escape(username or 'there')}, this message confirms your password was changed.</p>"
            "<div style=\"background:#0f2346;border:1px solid rgba(88,129,255,0.36);border-radius:14px;padding:18px 16px;\">"
            "<p style=\"margin:0 0 8px;color:#9eb4d8;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;\">Security Event</p>"
            f"<p style=\"margin:0 0 6px;color:#eef4ff;font-size:14px;\"><strong>Date & Time:</strong> {escape(display_time)}</p>"
            f"<p style=\"margin:0 0 6px;color:#eef4ff;font-size:14px;\"><strong>Source:</strong> {safe_source}</p>"
            f"<p style=\"margin:0 0 6px;color:#eef4ff;font-size:14px;\"><strong>IP Address:</strong> {safe_ip}</p>"
            f"<p style=\"margin:0;color:#eef4ff;font-size:14px;\"><strong>Device:</strong> {safe_device}</p>"
            "</div>"
            "<div style=\"margin-top:18px;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.36);border-radius:14px;padding:14px 16px;\">"
            "<p style=\"margin:0;color:#fecaca;font-size:13px;line-height:1.7;\"><strong>Did not make this change?</strong> Contact support immediately and secure your account session.</p>"
            "</div>"
            f"<div style=\"margin-top:20px;\">{cta_html}</div>"
        ),
    )

    return send_notification_email(
        mail=mail,
        subject="Security Alert: Your Password Was Updated",
        recipients=[user_email],
        body=body,
        html=html,
    )
