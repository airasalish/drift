"""Symbol search/autocomplete. Deliberately not an LLM lookup -- see
ENGINEERING_DECISIONS.md. Yahoo's own search index is a real lookup against
actually-listed securities, so it can't return a plausible-sounding but
wrong ticker the way an LLM guess could. Same principle as digest.py:
don't ask a model to produce a fact when a real, verifiable source already
does the job.
"""

import logging

import yfinance as yf
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/symbols", tags=["symbols"])


@router.get("/search")
def search_symbols(q: str = Query(min_length=1, max_length=40)):
    try:
        result = yf.Search(q, max_results=8)
    except Exception:
        logger.exception("symbol search failed for query %r", q)
        return {"results": []}

    out = []
    for quote in result.quotes:
        symbol = quote.get("symbol")
        name = quote.get("shortname") or quote.get("longname")
        if not symbol or not name:
            continue
        out.append({"symbol": symbol, "name": name, "exchange": quote.get("exchange")})

    return {"results": out}
