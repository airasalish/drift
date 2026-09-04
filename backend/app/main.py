import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(watchlist_router)


@app.get("/api/health")
def health():
    return {"ok": True}
