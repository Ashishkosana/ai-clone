"""GET /admin/stats — admin-authed dashboard metrics."""
import hmac
from collections import Counter

from boto3.dynamodb.conditions import Key
from common import resp, secrets, table


def _authed(event) -> bool:
    hdrs = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    auth = hdrs.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else auth
    return bool(token) and hmac.compare_digest(token, secrets().get("adminToken", ""))


def _count(entity: str) -> int:
    total, key = 0, None
    while True:
        kw = {
            "IndexName": "GSI1",
            "KeyConditionExpression": Key("entity").eq(entity),
            "Select": "COUNT",
        }
        if key:
            kw["ExclusiveStartKey"] = key
        page = table().query(**kw)
        total += page["Count"]
        key = page.get("LastEvaluatedKey")
        if not key:
            return total


def _categories() -> dict:
    counts, key = Counter(), None
    while True:
        kw = {
            "IndexName": "GSI1",
            "KeyConditionExpression": Key("entity").eq("LEAD"),
            "ProjectionExpression": "category",
        }
        if key:
            kw["ExclusiveStartKey"] = key
        page = table().query(**kw)
        for i in page.get("Items", []):
            counts[i.get("category", "General")] += 1
        key = page.get("LastEvaluatedKey")
        if not key:
            return dict(counts)


def main(event, _ctx):
    if not _authed(event):
        return resp(401, {"error": "Unauthorized."})
    return resp(
        200,
        {
            "leads": _count("LEAD"),
            "conversations": _count("CONV"),
            "messages": _count("MSG"),
            "categories": _categories(),
        },
    )
