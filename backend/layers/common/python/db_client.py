"""Singleton DynamoDB resource and table reference."""
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr  # re-export for convenience

_table = None


def get_table():
    """Return cached DynamoDB Table resource."""
    global _table
    if _table is None:
        dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))
        _table = dynamodb.Table(os.environ["TABLE_NAME"])
    return _table


def get_s3_client():
    """Return S3 client."""
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))


def get_cognito_client():
    """Return Cognito IDP client."""
    return boto3.client("cognito-idp", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))
