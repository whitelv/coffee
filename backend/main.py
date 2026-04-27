import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import close_db, connect_db
from routers import auth, history, recipes, sessions, users, ws

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    watchdog_task = asyncio.create_task(ws.stale_session_watchdog())
    yield
    watchdog_task.cancel()
    try:
        await watchdog_task
    except asyncio.CancelledError:
        pass
    await close_db()


app = FastAPI(title="Coffee Bar API", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(recipes.router, prefix="/api/recipes", tags=["recipes"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(ws.router, tags=["websocket"])


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
