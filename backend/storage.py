import os
import uuid
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "sewa-ac"

storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")},
        timeout=30,
    )
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def make_upload_path(folder: str, filename: str) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    return f"{APP_NAME}/uploads/{folder}/{uuid.uuid4()}.{ext}"


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_DOC_PHOTO_SIZE = 2 * 1024 * 1024


async def save_image(db, file, folder: str, max_size: int = MAX_FILE_SIZE) -> str:
    from fastapi import HTTPException
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="File harus berupa gambar (JPG/PNG/WEBP)")
    data = await file.read()
    if len(data) > max_size:
        raise HTTPException(status_code=400, detail=f"Ukuran file maksimal {max_size // (1024 * 1024)}MB")
    if not data:
        raise HTTPException(status_code=400, detail="File kosong")
    path = make_upload_path(folder, file.filename or "file")
    result = put_object(path, data, file.content_type)
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return result["path"]


async def save_pdf(db, file, folder: str) -> str:
    from fastapi import HTTPException
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File harus berupa PDF")
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 5MB")
    if not data:
        raise HTTPException(status_code=400, detail="File kosong")
    path = make_upload_path(folder, (file.filename or "dokumen").rsplit(".", 1)[0] + ".pdf")
    result = put_object(path, data, "application/pdf")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": "application/pdf",
        "size": result["size"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return result["path"]
