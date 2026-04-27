from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import WebSocket


@dataclass
class PendingAuth:
    token: str
    user: dict
    resume_available: bool
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class SessionEntry:
    esp_id: str
    user: dict
    recipe_id: str
    current_step: int
    last_seen: datetime
    browser_ws: WebSocket | None = None
    weight_streaming: bool = False
    weight_window: deque = field(default_factory=lambda: deque(maxlen=20))
    weight_target: float | None = None
    weight_tolerance: float | None = None


# esp_id -> session_id
esp_registry: dict[str, str] = {}

# session_id -> SessionEntry
sessions: dict[str, SessionEntry] = {}

# esp_id -> PendingAuth
pending_auth: dict[str, PendingAuth] = {}

# esp_id -> WebSocket
esp_sockets: dict[str, WebSocket] = {}
