import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.database import Base, engine
from app.routers.symbols import router as symbols_router
from app.routers.watchlist import router as watchlist_router
from app.services.poller import poll_forever

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    poll_task = asyncio.create_task(poll_forever())
    try:
        yield
    finally:
        poll_task.cancel()


app = FastAPI(title="Drift API", lifespan=lifespan)

# comma-separated in prod (e.g. ALLOWED_ORIGINS=https://drift.vercel.app),
# defaults to local dev origins so `uvicorn app.main:app` needs no config
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(watchlist_router)
app.include_router(symbols_router)


@app.get("/api/health")
def health():
    return {"ok": True}
