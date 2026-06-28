"""POST /chat — verified-only. Persona + knowledge -> Claude, with stored history."""
import json
import os
import secrets as rng
import urllib.request
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from boto3.dynamodb.conditions import Key
from common import parse_body, resp, secrets, table, verify_token

PROVIDER = os.environ.get("LLM_PROVIDER", "gemini")  # "gemini" | "claude"
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_TURNS = 16  # recent messages kept in context
CONTENT = Path(__file__).parent / "content"


@lru_cache(maxsize=1)
def system_prompt() -> str:
    persona = (CONTENT / "persona.md").read_text()
    knowledge = (CONTENT / "knowledge.md").read_text()
    return f"{persona}\n\n---\nKNOWLEDGE BASE (your only source of facts):\n\n{knowledge}"


def _history(conv_id: str) -> list[dict]:
    items = table().query(
        KeyConditionExpression=Key("PK").eq(f"CONV#{conv_id}")
        & Key("SK").begins_with("MSG#"),
        ScanIndexForward=True,
    ).get("Items", [])
    msgs = [{"role": i["role"], "content": i["content"]} for i in items]
    return msgs[-MAX_TURNS:]


def _store(conv_id: str, role: str, content: str) -> None:
    iso = datetime.now(timezone.utc).isoformat()
    table().put_item(
        Item={
            "PK": f"CONV#{conv_id}",
            "SK": f"MSG#{iso}#{rng.token_hex(2)}",
            "entity": "MSG",
            "createdAt": iso,
            "convId": conv_id,
            "role": role,
            "content": content,
        }
    )


def _post_json(url: str, payload: dict, headers: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode())
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=25) as r:  # noqa: S310
        return json.loads(r.read())


def _call_claude(messages: list[dict]) -> str:
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        {
            "model": CLAUDE_MODEL,
            "max_tokens": 800,
            "system": system_prompt(),
            "messages": messages,
        },
        {"x-api-key": secrets()["claudeApiKey"], "anthropic-version": "2023-06-01"},
    )
    return "".join(b.get("text", "") for b in data.get("content", []))


def _call_gemini(messages: list[dict]) -> str:
    key = secrets()["geminiApiKey"]
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={key}"
    )
    contents = [
        {
            "role": "model" if m["role"] == "assistant" else "user",
            "parts": [{"text": m["content"]}],
        }
        for m in messages
    ]
    data = _post_json(
        url,
        {
            "system_instruction": {"parts": [{"text": system_prompt()}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 800},
        },
        {},
    )
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts)


def _call_llm(messages: list[dict]) -> str:
    return _call_claude(messages) if PROVIDER == "claude" else _call_gemini(messages)


def main(event, _ctx):
    body = parse_body(event)
    lead_id = verify_token((body.get("token") or "").strip())
    if not lead_id:
        return resp(401, {"error": "Verify your email to start chatting."})

    conv_id = (body.get("convId") or "").strip()
    message = (body.get("message") or "").strip()
    if not conv_id or not message:
        return resp(400, {"error": "convId and message are required."})
    if len(message) > 2000:
        return resp(400, {"error": "Message too long."})

    history = _history(conv_id)
    history.append({"role": "user", "content": message})

    try:
        reply = _call_llm(history)
    except Exception:  # noqa: BLE001
        return resp(502, {"error": "The clone is unavailable right now."})

    _store(conv_id, "user", message)
    _store(conv_id, "assistant", reply)
    return resp(200, {"reply": reply})
