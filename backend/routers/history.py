from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId

from database import get_db
from models.user import UserPublic
from routers.auth import get_current_user

router = APIRouter()


def _to_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid ID: {id_str}")


@router.get("")
async def list_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: UserPublic = Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if user.role != "admin":
        query["user_id"] = user.id
    skip = (page - 1) * limit
    cursor = db.history.find(query).sort("started_at", -1).skip(skip).limit(limit)
    total = await db.history.count_documents(query)
    docs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        docs.append(doc)
    return {"items": docs, "total": total, "page": page, "limit": limit}


@router.get("/{history_id}")
async def get_history_entry(
    history_id: str,
    user: UserPublic = Depends(get_current_user),
):
    db = get_db()
    doc = await db.history.find_one({"_id": _to_object_id(history_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="History entry not found")
    if user.role != "admin" and doc.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    doc["_id"] = str(doc["_id"])
    return doc
