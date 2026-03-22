"""Admin Lambda handler - relation rules, data cleansing, backfill."""
import logging

from boto3.dynamodb.conditions import Attr

import auth
import response
from db_client import get_table
from router import Router
from validators import parse_body

logger = logging.getLogger()
logger.setLevel(logging.INFO)


# ---------- Relation Rules (static definition) ----------

RELATION_RULES = [
    {
        "id": "reservation_facility",
        "child": "RESERVATION", "childSkPrefix": "RESERVATION#",
        "field": "facilityId",
        "parent": "FACILITY",   "parentPrefix": "FACILITY", "parentSk": "#METADATA",
        "onDelete": "CASCADE",  "required": True, "backfillable": False,
        "desc": "予約は施設に紐づく。施設削除時に予約も削除。",
    },
    {
        "id": "reservation_user",
        "child": "RESERVATION", "childSkPrefix": "RESERVATION#",
        "field": "reservedBy",
        "parent": "USER",       "parentPrefix": None, "parentSk": None,
        "onDelete": "SET_NULL", "required": False, "backfillable": False,
        "desc": "予約の予約者。ユーザー削除時はNULLに。",
    },
    {
        "id": "schedule_user",
        "child": "SCHEDULE",    "childSkPrefix": "SCHEDULE#",
        "field": "createdBy",
        "parent": "USER",       "parentPrefix": None, "parentSk": None,
        "onDelete": "SET_NULL", "required": False, "backfillable": False,
        "desc": "スケジュールの作成者。ユーザー削除時はNULLに。",
    },
    {
        "id": "document_user",
        "child": "DOCUMENT",    "childSkPrefix": "DOCUMENT#",
        "field": "uploadedBy",
        "parent": "USER",       "parentPrefix": None, "parentSk": None,
        "onDelete": "SET_NULL", "required": False, "backfillable": False,
        "desc": "ドキュメントのアップロード者。ユーザー削除時はNULLに。",
    },
    {
        "id": "facility_parent",
        "child": "FACILITY",    "childSkPrefix": None, "childSk": "#METADATA",
        "field": "parentId",
        "parent": "FACILITY",   "parentPrefix": "FACILITY", "parentSk": "#METADATA",
        "onDelete": "RESTRICT", "required": False, "backfillable": False,
        "desc": "施設の親施設。子施設が存在する間は親削除不可。",
    },
    {
        "id": "facility_type",
        "child": "FACILITY",    "childSkPrefix": None, "childSk": "#METADATA",
        "field": "facilityTypeId",
        "parent": "FACILITYTYPE", "parentPrefix": "FACILITYTYPE", "parentSk": "FACILITYTYPE",
        "onDelete": "RESTRICT", "required": True,  "backfillable": True,
        "desc": "施設の種別。種別削除前に施設の再割当が必要。",
    },
    {
        "id": "facility_org",
        "child": "FACILITY",    "childSkPrefix": None, "childSk": "#METADATA",
        "field": "orgId",
        "parent": "ORG",        "parentPrefix": "ORG", "parentSk": "ORG",
        "onDelete": "SET_NULL", "required": False, "backfillable": True,
        "desc": "施設の所属組織。組織削除時はNULLに。",
    },
    {
        "id": "user_org",
        "child": "USER",        "childSkPrefix": None, "childSk": "USER",
        "field": "orgId",
        "parent": "ORG",        "parentPrefix": "ORG", "parentSk": "ORG",
        "onDelete": "SET_NULL", "required": False, "backfillable": False,
        "desc": "ユーザーの所属組織。組織削除時はNULLに。",
    },
]

# Rules that can actually be cleansed via DynamoDB scan (USER references Cognito, skip)
_CLEANSABLE_RULES = [r for r in RELATION_RULES if r["parentPrefix"] is not None]


# ---------- Helpers ----------

def _scan_all(table, **kwargs) -> list:
    items = []
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def _child_filter(rule: dict):
    """Build Attr filter for child entity scan based on rule's SK info."""
    if rule.get("childSk"):
        return Attr("SK").eq(rule["childSk"])
    elif rule.get("childSkPrefix"):
        return Attr("SK").begins_with(rule["childSkPrefix"])
    return None


def _get_existing_pks(table, prefix: str, sk: str) -> set:
    """Return set of all IDs (without prefix) for a given entity type."""
    items = _scan_all(
        table,
        FilterExpression=Attr("SK").eq(sk),
    )
    return {i["PK"].replace(f"{prefix}#", "") for i in items}


def _find_orphans(table, rule: dict) -> list:
    """Return list of child items where the referenced parent does not exist."""
    field = rule["field"]
    parent_prefix = rule["parentPrefix"]
    parent_sk = rule["parentSk"]

    sk_filter = _child_filter(rule)
    if sk_filter is None:
        return []

    children = _scan_all(
        table,
        FilterExpression=sk_filter & Attr(field).exists(),
    )

    parent_ids = _get_existing_pks(table, parent_prefix, parent_sk)
    orphans = []
    for item in children:
        val = item.get(field, "")
        if not val:
            continue
        raw_id = val.replace(f"{parent_prefix}#", "") if val.startswith(f"{parent_prefix}#") else val
        if raw_id not in parent_ids and val not in parent_ids:
            orphans.append(item)
    return orphans


# ---------- Route Handlers ----------

def get_relation_rules(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    # Return without internal fields
    rules = [
        {k: v for k, v in r.items() if k != "parentPrefix"}
        for r in RELATION_RULES
    ]
    return response.ok({"rules": rules})


def run_cleanse(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    body = parse_body(event)
    dry_run = body.get("dryRun", True)

    table = get_table()
    results = []

    for rule in _CLEANSABLE_RULES:
        orphans = _find_orphans(table, rule)
        count = len(orphans)

        if not dry_run and count > 0:
            if rule["onDelete"] == "CASCADE":
                for item in orphans:
                    table.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            elif rule["onDelete"] == "SET_NULL":
                for item in orphans:
                    table.update_item(
                        Key={"PK": item["PK"], "SK": item["SK"]},
                        UpdateExpression=f"REMOVE {rule['field']}",
                    )

        results.append({
            "ruleId": rule["id"],
            "child": rule["child"],
            "field": rule["field"],
            "onDelete": rule["onDelete"],
            "orphanCount": count,
            "action": "skipped" if dry_run else ("none" if count == 0 else rule["onDelete"].lower()),
        })

    return response.ok({"dryRun": dry_run, "results": results})


def run_backfill(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny
    body = parse_body(event)
    rule_id = body.get("ruleId")
    default_value = body.get("defaultValue")

    if not rule_id or not default_value:
        return response.bad_request("ruleId and defaultValue are required")

    rule = next((r for r in RELATION_RULES if r["id"] == rule_id and r["backfillable"]), None)
    if not rule:
        return response.bad_request(f"No backfillable rule found: {rule_id}")

    table = get_table()
    field = rule["field"]

    sk_filter = _child_filter(rule)
    if sk_filter is None:
        return response.bad_request(f"SK filter not defined for rule: {rule_id}")

    # Find items where field is missing or empty
    items = _scan_all(
        table,
        FilterExpression=sk_filter & (
            Attr(field).not_exists() | Attr(field).eq("")
        ),
    )

    updated_count = 0
    for item in items:
        table.update_item(
            Key={"PK": item["PK"], "SK": item["SK"]},
            UpdateExpression=f"SET {field} = :val",
            ExpressionAttributeValues={":val": default_value},
        )
        updated_count += 1

    return response.ok({"updatedCount": updated_count})


# ---------- Router ----------

router = Router()
router.add("GET",  r"/admin/relation-rules", get_relation_rules)
router.add("POST", r"/admin/cleanse",         run_cleanse)
router.add("POST", r"/admin/backfill",        run_backfill)


def lambda_handler(event: dict, context) -> dict:
    return router.dispatch(event)
