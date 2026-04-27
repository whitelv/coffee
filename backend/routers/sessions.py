from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request

import state as st
from database import get_db
from models.session import BrewSessionModel, SessionCreate
from models.user import UserPublic
from routers.auth import get_current_user

router = APIRouter()


def _to_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid ID: {id_str}")


@router.post("", status_code=201)
async def create_session(
    body: SessionCreate,
    user: UserPublic = Depends(get_current_user),
):
    db = get_db()

    recipe_doc = await db.recipes.find_one({"_id": _to_object_id(body.recipe_id)})
    if not recipe_doc:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Abandon any existing active session for this user
    existing = await db.brew_sessions.find_one({"user_id": user.id, "status": "active"})
    if existing:
        from routers.ws import _abandon_session
        await _abandon_session(str(existing["_id"]), "replaced")

    session = BrewSessionModel(
        user_id=user.id,
        recipe_id=body.recipe_id,
        esp_id=body.esp_id,
    )
    doc = session.model_dump(by_alias=True, exclude_none=True)
    result = await db.brew_sessions.insert_one(doc)
    session_id = str(result.inserted_id)

    entry = st.SessionEntry(
        esp_id=body.esp_id,
        user={"id": user.id, "name": user.name, "role": user.role},
        recipe_id=body.recipe_id,
        current_step=0,
        last_seen=datetime.utcnow(),
    )
    st.sessions[session_id] = entry
    st.esp_registry[body.esp_id] = session_id

    return {"session_id": session_id}


@router.get("/current")
async def get_current_session(user: UserPublic = Depends(get_current_user)):
    db = get_db()
    doc = await db.brew_sessions.find_one({"user_id": user.id, "status": "active"})
    if not doc:
        raise HTTPException(status_code=404, detail="No active session")
    doc["_id"] = str(doc["_id"])
    return doc


@router.patch("/current/heartbeat")
async def heartbeat(user: UserPublic = Depends(get_current_user)):
    db = get_db()
    now = datetime.utcnow()
    result = await db.brew_sessions.find_one_and_update(
        {"user_id": user.id, "status": "active"},
        {"$set": {"last_seen": now}},
    )
    if not result:
        raise HTTPException(status_code=404, detail="No active session")
    session_id = str(result["_id"])
    if session_id in st.sessions:
        st.sessions[session_id].last_seen = now
    return {"ok": True}


@router.post("/current/ping-close")
async def ping_close(request: Request, user: UserPublic = Depends(get_current_user)):
    # Called via navigator.sendBeacon on page unload — body may be empty
    db = get_db()
    doc = await db.brew_sessions.find_one({"user_id": user.id, "status": "active"})
    if not doc:
        return {"ok": True}
    session_id = str(doc["_id"])
    # Only abandon if the ESP is not connected (hardware still running is ok)
    entry = st.sessions.get(session_id)
    if entry and entry.esp_id not in st.esp_sockets:
        from routers.ws import _abandon_session
        await _abandon_session(session_id, "browser_close")
    return {"ok": True}
