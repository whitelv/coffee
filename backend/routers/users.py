from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from models.user import UserCreate, UserModel
from routers.auth import require_admin

router = APIRouter()


def _to_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid ID: {id_str}")


@router.get("")
async def list_users(_ = Depends(require_admin)):
    db = get_db()
    docs = []
    async for doc in db.users.find():
        doc["_id"] = str(doc["_id"])
        doc.pop("rfid_uid", None)
        docs.append(doc)
    return docs


@router.post("", status_code=201)
async def create_user(body: UserCreate, _ = Depends(require_admin)):
    db = get_db()
    existing = await db.users.find_one({"rfid_uid": body.rfid_uid})
    if existing:
        raise HTTPException(status_code=409, detail="RFID UID already registered")
    user = UserModel(rfid_uid=body.rfid_uid, name=body.name, role=body.role)
    doc = user.model_dump(by_alias=True, exclude_none=True)
    result = await db.users.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc.pop("rfid_uid", None)
    return doc


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, _ = Depends(require_admin)):
    db = get_db()
    result = await db.users.delete_one({"_id": _to_object_id(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
