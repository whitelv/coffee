import asyncio
import json
import logging
from datetime import datetime, timedelta

import numpy as np
from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import state as st
from config import settings
from database import get_db
from models.history import HistoryModel
from models.session import BrewSessionModel
from routers.auth import create_jwt

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _send(ws: WebSocket | None, payload: dict) -> None:
    if ws is None:
        return
    try:
        await ws.send_text(json.dumps(payload))
    except Exception:
        pass


async def _abandon_session(session_id: str, reason: str = "timeout") -> None:
    entry = st.sessions.get(session_id)
    if entry is None:
        return
    db = get_db()
    now = datetime.utcnow()
    await db.brew_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"status": "abandoned", "completed_at": now}},
    )
    await _send(entry.browser_ws, {"event": "session_abandoned"})
    esp_ws = st.esp_sockets.get(entry.esp_id)
    await _send(esp_ws, {"event": "session_abandoned"})
    st.esp_registry.pop(entry.esp_id, None)
    st.sessions.pop(session_id, None)


async def stale_session_watchdog() -> None:
    while True:
        await asyncio.sleep(60)
        now = datetime.utcnow()
        timeout = timedelta(seconds=60)
        for session_id, entry in list(st.sessions.items()):
            if now - entry.last_seen > timeout:
                logger.info("Abandoning stale session %s", session_id)
                await _abandon_session(session_id, "timeout")


def _check_weight_stable(entry: st.SessionEntry) -> bool:
    window = entry.weight_window
    if len(window) < 10:
        return False
    if entry.weight_target is None or entry.weight_tolerance is None:
        return False
    arr = np.array(list(window), dtype=float)
    latest = arr[-1]
    return (
        float(np.std(arr)) < settings.esp_weight_stable_stddev
        and abs(latest - entry.weight_target) <= entry.weight_tolerance
    )


async def _complete_session(session_id: str, entry: st.SessionEntry) -> None:
    db = get_db()
    now = datetime.utcnow()
    session_doc = await db.brew_sessions.find_one({"_id": ObjectId(session_id)})
    await db.brew_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"status": "completed", "completed_at": now}},
    )
    if session_doc:
        recipe_doc = await db.recipes.find_one({"_id": ObjectId(entry.recipe_id)})
        history = HistoryModel(
            session_id=session_id,
            user_id=entry.user["id"],
            recipe_id=entry.recipe_id,
            recipe_name=recipe_doc["name"] if recipe_doc else "Unknown",
            worker_name=entry.user["name"],
            cooked_by_admin=entry.user.get("role") == "admin",
            started_at=session_doc["started_at"],
            completed_at=now,
        )
        await db.history.insert_one(
            history.model_dump(by_alias=True, exclude_none=True)
        )
    await _send(entry.browser_ws, {"event": "session_complete"})
    esp_ws = st.esp_sockets.get(entry.esp_id)
    await _send(esp_ws, {"event": "session_complete"})
    st.esp_registry.pop(entry.esp_id, None)
    st.sessions.pop(session_id, None)


# ---------------------------------------------------------------------------
# ESP32 WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/esp/{esp_id}")
async def esp_websocket(websocket: WebSocket, esp_id: str) -> None:
    await websocket.accept()
    st.esp_sockets[esp_id] = websocket
    logger.info("ESP32 connected: %s", esp_id)

    # Notify browser if a session is active for this esp
    session_id = st.esp_registry.get(esp_id)
    if session_id and session_id in st.sessions:
        await _send(st.sessions[session_id].browser_ws, {"event": "esp_reconnected"})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            event = msg.get("event")

            if event == "rfid_scan":
                await _handle_rfid_scan(esp_id, msg)
            elif event == "weight_reading":
                await _handle_weight_reading(esp_id, msg)
            elif event == "heartbeat":
                await _handle_heartbeat(esp_id)

    except WebSocketDisconnect:
        pass
    finally:
        st.esp_sockets.pop(esp_id, None)
        logger.info("ESP32 disconnected: %s", esp_id)
        session_id = st.esp_registry.get(esp_id)
        if session_id and session_id in st.sessions:
            await _send(st.sessions[session_id].browser_ws, {"event": "esp_disconnected"})


async def _handle_rfid_scan(esp_id: str, msg: dict) -> None:
    uid = msg.get("uid", "")
    db = get_db()
    esp_ws = st.esp_sockets.get(esp_id)

    user_doc = await db.users.find_one({"rfid_uid": uid})
    if not user_doc:
        await _send(esp_ws, {"event": "auth_fail", "reason": "unknown_card"})
        return

    user = {
        "id": str(user_doc["_id"]),
        "name": user_doc["name"],
        "role": user_doc["role"],
    }

    # Check for resumable abandoned session (last 10 minutes)
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    abandoned = await db.brew_sessions.find_one({
        "user_id": user["id"],
        "status": "abandoned",
        "completed_at": {"$gte": cutoff},
    })
    resume_available = abandoned is not None

    token = create_jwt(user["id"], user["name"], user["role"])
    st.pending_auth[esp_id] = st.PendingAuth(
        token=token,
        user=user,
        resume_available=resume_available,
    )
    await _send(esp_ws, {
        "event": "auth_ok",
        "token": token,
        "user": {"name": user["name"], "role": user["role"]},
        "resume_available": resume_available,
    })


async def _handle_weight_reading(esp_id: str, msg: dict) -> None:
    session_id = st.esp_registry.get(esp_id)
    if not session_id:
        return
    entry = st.sessions.get(session_id)
    if not entry or not entry.weight_streaming:
        return

    value = float(msg.get("value", 0))
    entry.weight_window.append(value)

    await _send(entry.browser_ws, {"event": "weight_update", "value": value, "stable": False})

    if _check_weight_stable(entry):
        entry.weight_streaming = False
        esp_ws = st.esp_sockets.get(esp_id)
        await _send(esp_ws, {"event": "stop_weight"})
        await _send(entry.browser_ws, {"event": "weight_stable", "value": value})


async def _handle_heartbeat(esp_id: str) -> None:
    session_id = st.esp_registry.get(esp_id)
    if not session_id:
        return
    entry = st.sessions.get(session_id)
    if not entry:
        return
    entry.last_seen = datetime.utcnow()
    db = get_db()
    asyncio.create_task(
        db.brew_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"last_seen": entry.last_seen}},
        )
    )


# ---------------------------------------------------------------------------
# Browser WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/browser/{session_id}")
async def browser_websocket(websocket: WebSocket, session_id: str) -> None:
    entry = st.sessions.get(session_id)
    if entry is None:
        await websocket.close(code=4004)
        return

    await websocket.accept()
    entry.browser_ws = websocket
    logger.info("Browser connected to session %s", session_id)

    db = get_db()
    recipe_doc = await db.recipes.find_one({"_id": ObjectId(entry.recipe_id)})
    recipe_data = None
    if recipe_doc:
        recipe_doc["_id"] = str(recipe_doc["_id"])
        recipe_data = recipe_doc

    await _send(websocket, {
        "event": "session_state",
        "status": "active",
        "current_step": entry.current_step,
        "recipe": recipe_data,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            event = msg.get("event")

            if event == "start_weight":
                await _handle_start_weight(session_id, entry, msg, recipe_data)
            elif event == "next_step":
                await _handle_next_step(session_id, entry, recipe_data)
            elif event == "ping":
                await _send(websocket, {"event": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        if st.sessions.get(session_id):
            st.sessions[session_id].browser_ws = None
        logger.info("Browser disconnected from session %s", session_id)


async def _handle_start_weight(
    session_id: str,
    entry: st.SessionEntry,
    msg: dict,
    recipe_data: dict | None,
) -> None:
    if not recipe_data:
        return
    steps = recipe_data.get("steps", [])
    if entry.current_step >= len(steps):
        return
    step = steps[entry.current_step]
    entry.weight_target = step.get("target_value")
    entry.weight_tolerance = step.get("tolerance")
    entry.weight_streaming = True
    entry.weight_window.clear()
    esp_ws = st.esp_sockets.get(entry.esp_id)
    await _send(esp_ws, {"event": "request_weight", "target": entry.weight_target})


async def _handle_next_step(
    session_id: str,
    entry: st.SessionEntry,
    recipe_data: dict | None,
) -> None:
    if not recipe_data:
        return
    steps = recipe_data.get("steps", [])
    entry.current_step += 1
    entry.weight_streaming = False
    entry.weight_window.clear()

    db = get_db()
    await db.brew_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"current_step": entry.current_step}},
    )

    if entry.current_step >= len(steps):
        await _complete_session(session_id, entry)
    else:
        next_step = steps[entry.current_step]
        await _send(entry.browser_ws, {
            "event": "step_advance",
            "step_index": entry.current_step,
            "step": next_step,
        })
