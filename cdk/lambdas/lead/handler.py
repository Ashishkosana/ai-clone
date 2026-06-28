"""POST /lead — capture a lead (name/email) and immediately start a chat session.

No verification code: we just record who's chatting (for the dashboard) and hand
back a session token + a fresh conversation.
"""
import re
import secrets as rng
from datetime import datetime, timezone

from common import parse_body, resp, sign_token, table

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def main(event, _ctx):
    body = parse_body(event)
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    phone = (body.get("phone") or "").strip()
    category = (body.get("category") or "General").strip()

    if not name or not EMAIL_RE.match(email):
        return resp(400, {"error": "Valid name and email are required."})

    lead_id = rng.token_hex(8)
    conv_id = rng.token_hex(8)
    iso = datetime.now(timezone.utc).isoformat()

    table().put_item(
        Item={
            "PK": f"LEAD#{lead_id}",
            "SK": "PROFILE",
            "entity": "LEAD",
            "createdAt": iso,
            "leadId": lead_id,
            "name": name,
            "email": email,
            "phone": phone,
            "category": category,
            "verified": True,
        }
    )
    table().put_item(
        Item={
            "PK": f"LEAD#{lead_id}",
            "SK": f"CONV#{conv_id}",
            "entity": "CONV",
            "createdAt": iso,
            "convId": conv_id,
            "leadId": lead_id,
        }
    )

    return resp(200, {"token": sign_token(lead_id), "convId": conv_id})
