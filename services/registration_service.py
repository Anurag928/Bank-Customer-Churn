from typing import Any, Dict, Optional


def create_signup_request(
    users_collection,
    *,
    username: str,
    email: str,
    password_hash: str,
    role: str,
    official_id: str,
    now,
    pending_status: str,
) -> Dict[str, Any]:
    """Insert a pending signup request document into MongoDB."""
    user_doc = {
        "username": username,
        "email": email,
        "password_hash": password_hash,
        "role": role,
        "official_id": official_id,
        "status": pending_status,
        "request_date": now,
        "last_login": None,
        "created_at": now,
        "updated_at": now,
    }
    users_collection.insert_one(user_doc)
    return user_doc


def approve_signup_request(
    users_collection,
    *,
    object_id,
    now,
    pending_status: str,
    approved_status: str,
    return_document,
) -> Optional[Dict[str, Any]]:
    """Approve only pending users and return the updated document."""
    pending_aliases = [pending_status, pending_status.capitalize()]
    return users_collection.find_one_and_update(
        {"_id": object_id, "status": {"$in": pending_aliases}},
        {"$set": {"status": approved_status, "updated_at": now}},
        return_document=return_document,
    )
