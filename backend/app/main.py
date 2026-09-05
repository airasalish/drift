import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from app.database import SessionLocal, ensure_schema
from app.demo_user import backfill_company_websites
from app.routers.auth import router as auth_router
from app.routers.symbols import router as symbols_router
from app.routers.watchlist import router as watchlist_router, watchlists_router
from app.services.poller import poll_forever

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    db = SessionLocal()
    try:
        backfill_company_websites(db)
    finally:
        db.close()
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

# Vercel gives every single deployment its own unique subdomain (in
# addition to the stable one in ALLOWED_ORIGINS above) -- clicking "Visit"
# on any deployment in the Vercel dashboard, a completely normal thing to
# do, lands on one of these and would otherwise get silently CORS-blocked.
# This regex trusts the whole project's subdomain space, not just the one
# alias we happen to test against. Configurable so this isn't hardcoded to
# one person's Vercel team slug.
allowed_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX", r"https://.*-airasalishs-projects\.vercel\.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Catches anything unhandled anywhere in the pipeline (including
# response-serialization errors a route-level try/except can't reach --
# see ENGINEERING_DECISIONS.md for the NaN-in-JSON incident this caught).
# Logs the real exception server-side; never returns it to the client --
# leaking tracebacks/internals to a public API is its own security issue.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.exception("unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "something went wrong on our end"})


app.include_router(auth_router)
app.include_router(watchlist_router)
app.include_router(watchlists_router)
app.include_router(symbols_router)


@app.get("/api/health")
def health():
    return {"ok": True}
