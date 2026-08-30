import os
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import secretmanager
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://m14901507-boop.github.io")
BUDGET_SHEET_NAME = os.getenv("BUDGET_SHEET_NAME", "موازنات الحسابات")

app = FastAPI(title="Floosy API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@lru_cache(maxsize=32)
def read_secret(secret_id: str) -> str:
    """Read the latest Secret Manager value without exposing it to the browser."""
    if not PROJECT_ID:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not configured.")

    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8").strip()


@lru_cache(maxsize=1)
def google_credentials() -> Credentials:
    client_id = read_secret("FLOOSY_GOOGLE_CLIENT_ID")
    client_secret = read_secret("FLOOSY_GOOGLE_CLIENT_SECRET")
    refresh_token = read_secret("FLOOSY_GOOGLE_REFRESH_TOKEN")

    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/gmail.readonly",
        ],
    )


def spreadsheet_id() -> str:
    return read_secret("FLOOSY_SPREADSHEET_ID")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "floosy-backend",
        "runtime": "python-fastapi",
    }


@app.get("/api/budgets")
def budgets() -> dict[str, Any]:
    try:
        sheets = build("sheets", "v4", credentials=google_credentials(), cache_discovery=False)
        response = (
            sheets.spreadsheets()
            .values()
            .get(
                spreadsheetId=spreadsheet_id(),
                range=f"'{BUDGET_SHEET_NAME}'!A:H",
                valueRenderOption="UNFORMATTED_VALUE",
            )
            .execute()
        )

        values = response.get("values", [])
        return {
            "ok": True,
            "headers": values[0] if values else [],
            "rows": values[1:] if len(values) > 1 else [],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/gmail/unread")
def gmail_unread() -> dict[str, Any]:
    try:
        gmail = build("gmail", "v1", credentials=google_credentials(), cache_discovery=False)
        response = (
            gmail.users()
            .messages()
            .list(userId="me", q="is:unread", maxResults=1)
            .execute()
        )
        return {
            "ok": True,
            "unread": int(response.get("resultSizeEstimate", 0)),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
