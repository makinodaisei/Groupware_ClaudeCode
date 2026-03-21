"""Document management Lambda handler - S3 presigned URLs + DynamoDB metadata."""
import logging
import os
import re
import uuid

import auth
import response
from boto3.dynamodb.conditions import Key, Attr
from db_client import get_table, get_s3_client
from utils import now_iso, get_method_and_path
from router import Router
from validators import parse_body, require_fields, sanitize_string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ.get("BUCKET_NAME", "")
PRESIGNED_URL_EXPIRY = 900  # 15 minutes


# ---------- Helpers ----------

def _item_to_folder(item: dict) -> dict:
    return {
        "folderId": item.get("folderId"),
        "name": item.get("name"),
        "parentFolderId": item.get("parentFolderId"),
        "path": item.get("folderPath", "/"),
        "createdBy": item.get("createdBy"),
        "createdAt": item.get("createdAt"),
    }


def _item_to_file(item: dict) -> dict:
    return {
        "fileId": item.get("fileId"),
        "folderId": item.get("folderId"),
        "name": item.get("name"),
        "contentType": item.get("contentType", "application/octet-stream"),
        "size": item.get("size", 0),
        "s3Key": item.get("s3Key"),
        "status": item.get("status", "pending"),
        "uploadedBy": item.get("uploadedBy"),
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
    }


def _is_s3_event(event: dict) -> bool:
    return "Records" in event and event["Records"][0].get("eventSource") == "aws:s3"


# ---------- Folder Handlers ----------

def list_folders(event: dict) -> dict:
    params = event.get("queryStringParameters") or {}
    parent_id = params.get("parentFolderId", "ROOT")

    table = get_table()
    resp = table.scan(
        FilterExpression=Attr("parentFolderId").eq(parent_id) & Attr("entityType").eq("FOLDER"),
    )
    folders = [_item_to_folder(item) for item in resp.get("Items", [])]
    return response.ok({"folders": folders})


def create_folder(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    body = parse_body(event)
    missing = require_fields(body, ["name"])
    if missing:
        return response.bad_request(f"Missing required fields: {', '.join(missing)}")

    parent_id = body.get("parentFolderId", "ROOT")
    folder_id = str(uuid.uuid4())
    parent_path = body.get("parentPath", "/")
    folder_path = f"{parent_path.rstrip('/')}/{sanitize_string(body['name'], 100)}"

    item = {
        "PK": f"DOCS#{folder_id}",
        "SK": "#METADATA",
        "entityType": "FOLDER",
        "folderId": folder_id,
        "name": sanitize_string(body["name"], 100),
        "parentFolderId": parent_id,
        "folderPath": folder_path,
        "createdBy": user_id,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    get_table().put_item(Item=item)
    return response.created(_item_to_folder(item))


def delete_folder(event: dict) -> dict:
    deny = auth.require_admin(event)
    if deny:
        return deny

    _, path = get_method_and_path(event)
    match = re.search(r"/documents/folders/([^/]+)$", path)
    if not match:
        return response.bad_request("Invalid path")
    folder_id = match.group(1)

    table = get_table()
    # Check if folder has files
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"DOCS#{folder_id}") & Key("SK").begins_with("FILE#"),
    )
    if resp.get("Items"):
        return response.conflict("Cannot delete folder with files. Remove files first.")

    table.delete_item(Key={"PK": f"DOCS#{folder_id}", "SK": "#METADATA"})
    return response.no_content()


# ---------- File Handlers ----------

def list_files(event: dict) -> dict:
    _, path = get_method_and_path(event)
    match = re.search(r"/documents/folders/([^/]+)/files", path)
    if not match:
        return response.bad_request("Invalid path")
    folder_id = match.group(1)

    table = get_table()
    resp = table.query(
        KeyConditionExpression=Key("PK").eq(f"DOCS#{folder_id}") & Key("SK").begins_with("FILE#"),
    )
    files = [_item_to_file(item) for item in resp.get("Items", [])]
    return response.ok({"files": files, "count": len(files)})


def get_upload_url(event: dict) -> dict:
    """Generate presigned S3 PUT URL for direct browser upload."""
    user_id = auth.get_user_id(event)
    _, path = get_method_and_path(event)
    match = re.search(r"/documents/folders/([^/]+)/files/upload-url", path)
    if not match:
        return response.bad_request("Invalid path")
    folder_id = match.group(1)

    body = parse_body(event)
    missing = require_fields(body, ["name", "contentType"])
    if missing:
        return response.bad_request(f"Missing required fields: {', '.join(missing)}")

    file_id = str(uuid.uuid4())
    file_name = sanitize_string(body["name"], 255)
    content_type = sanitize_string(body["contentType"], 100)
    s3_key = f"uploads/{folder_id}/{file_id}/{file_name}"

    # Write pending metadata to DynamoDB
    item = {
        "PK": f"DOCS#{folder_id}",
        "SK": f"FILE#{file_id}",
        "entityType": "FILE",
        "fileId": file_id,
        "folderId": folder_id,
        "name": file_name,
        "contentType": content_type,
        "size": int(body.get("size", 0)),
        "s3Key": s3_key,
        "status": "pending",
        "uploadedBy": user_id,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    get_table().put_item(Item=item)

    # Generate presigned PUT URL
    s3 = get_s3_client()
    presigned_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": s3_key,
            "ContentType": content_type,
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY,
    )

    return response.created({
        "fileId": file_id,
        "uploadUrl": presigned_url,
        "expiresIn": PRESIGNED_URL_EXPIRY,
        "s3Key": s3_key,
    })


def get_download_url(event: dict) -> dict:
    """Generate presigned S3 GET URL for file download."""
    _, path = get_method_and_path(event)
    match = re.search(r"/documents/folders/([^/]+)/files/([^/]+)/download-url", path)
    if not match:
        return response.bad_request("Invalid path")
    folder_id, file_id = match.group(1), match.group(2)

    table = get_table()
    resp = table.get_item(Key={"PK": f"DOCS#{folder_id}", "SK": f"FILE#{file_id}"})
    item = resp.get("Item")
    if not item:
        return response.not_found("File")

    if item.get("status") != "uploaded":
        return response.bad_request("File upload is not complete")

    s3 = get_s3_client()
    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET_NAME, "Key": item["s3Key"]},
        ExpiresIn=PRESIGNED_URL_EXPIRY,
    )
    return response.ok({
        "downloadUrl": presigned_url,
        "fileName": item.get("name"),
        "expiresIn": PRESIGNED_URL_EXPIRY,
    })


def delete_file(event: dict) -> dict:
    user_id = auth.get_user_id(event)
    _, path = get_method_and_path(event)
    match = re.search(r"/documents/folders/([^/]+)/files/([^/]+)$", path)
    if not match:
        return response.bad_request("Invalid path")
    folder_id, file_id = match.group(1), match.group(2)

    table = get_table()
    resp = table.get_item(Key={"PK": f"DOCS#{folder_id}", "SK": f"FILE#{file_id}"})
    item = resp.get("Item")
    if not item:
        return response.not_found("File")

    if item.get("uploadedBy") != user_id and not auth.is_admin(event):
        return response.forbidden()

    # Delete from S3
    s3 = get_s3_client()
    try:
        s3.delete_object(Bucket=BUCKET_NAME, Key=item["s3Key"])
    except Exception:
        logger.warning("Failed to delete S3 object: %s", item.get("s3Key"))

    table.delete_item(Key={"PK": f"DOCS#{folder_id}", "SK": f"FILE#{file_id}"})
    return response.no_content()


# ---------- S3 Event Handler ----------

def handle_s3_event(event: dict) -> None:
    """Confirm upload and update file metadata status to 'uploaded'."""
    for record in event.get("Records", []):
        s3_info = record.get("s3", {})
        s3_key = s3_info.get("object", {}).get("key", "")
        size = s3_info.get("object", {}).get("size", 0)

        # s3_key format: uploads/{folderId}/{fileId}/{fileName}
        parts = s3_key.split("/")
        if len(parts) < 3:
            continue
        folder_id = parts[1]
        file_id = parts[2]

        table = get_table()
        try:
            table.update_item(
                Key={"PK": f"DOCS#{folder_id}", "SK": f"FILE#{file_id}"},
                UpdateExpression="SET #status = :uploaded, size = :size, updatedAt = :now",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":uploaded": "uploaded",
                    ":size": size,
                    ":now": now_iso(),
                },
                ConditionExpression="attribute_exists(PK)",
            )
            logger.info("Confirmed upload for file %s in folder %s", file_id, folder_id)
        except Exception:
            logger.exception("Failed to update file metadata for key: %s", s3_key)


# ---------- Router ----------

_router = Router()
_router.add("GET",    r".*/documents/folders$",                                      list_folders)
_router.add("POST",   r".*/documents/folders$",                                      create_folder)
_router.add("DELETE", r".*/documents/folders/[^/]+$",                               delete_folder)
_router.add("GET",    r".*/documents/folders/[^/]+/files$",                         list_files)
_router.add("POST",   r".*/documents/folders/[^/]+/files/upload-url$",              get_upload_url)
_router.add("GET",    r".*/documents/folders/[^/]+/files/[^/]+/download-url$",      get_download_url)
_router.add("DELETE", r".*/documents/folders/[^/]+/files/[^/]+$",                   delete_file)


def lambda_handler(event: dict, context) -> dict:
    if _is_s3_event(event):
        handle_s3_event(event)
        return {"statusCode": 200}

    logger.info("Documents event: method=%s path=%s",
                event.get("requestContext", {}).get("http", {}).get("method"),
                event.get("requestContext", {}).get("http", {}).get("path"))
    return _router.dispatch(event)
