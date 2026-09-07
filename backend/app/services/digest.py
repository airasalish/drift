"""Optional, user-triggered digest: turns already-computed rule signals into
one readable paragraph. Deliberately narrow scope -- see
ENGINEERING_DECISIONS.md for why this doesn't undermine the rule-based,
auditable story:

- The rules still decide everything (what fires, the score, the ranking).
  This only rephrases facts that already exist; it never decides what's
  flagged or why.
- The prompt is constrained to the numbers we hand it. It is explicitly
  told not to invent a causal reason for a price move -- we have no real
  news source to back that up, and a finance-adjacent app presenting a
  hallucinated "why" as fact is a real credibility risk, not a nice-to-have
  we can shrug off.
- Gracefully degrading: any failure (bad key, rate limit, network, timeout)
  just returns None, and the frontend already handles that by showing
  nothing extra -- the per-item rule messages remain the fallback.
- Called on demand only (a button), not on every background poll -- no
  reason to spend an LLM call on a page just sitting open.
"""

import logging
import os

from groq import Groq

logger = logging.getLogger(__name__)

MODEL = "openai/gpt-oss-20b"

SYSTEM_PROMPT = (
    "You summarize a stock watchlist's already-computed alerts in plain English. "
    "You are given a JSON list of facts: symbol, which rule fired, and the exact "
    "numbers behind it. Write ONE short paragraph (2-3 sentences, no more) "
    "recapping them for someone who hasn't looked at their watchlist in a while. "
    "Use only the numbers and facts given. Do not guess or invent a reason why "
    "a price moved -- you have no news data, so never claim a cause you weren't "
    "given. If you don't know why something moved, don't mention why at all."
)


def _keys() -> list[str]:
    raw = os.getenv("GROQ_API_KEYS", "")
    return [k.strip() for k in raw.split(",") if k.strip()]


def generate_digest(fired_facts: list[dict]) -> str | None:
    if not fired_facts:
        return None

    facts_text = "\n".join(
        f"- {f['symbol']}: {', '.join(r['message'] for r in f['fired'])}" for f in fired_facts
    )

    for key in _keys():
        try:
            client = Groq(api_key=key)
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": facts_text},
                ],
                max_tokens=400,
                reasoning_effort="low",  # this is a phrasing task, not a reasoning one --
                temperature=0.3,          # avoid burning the token budget on hidden chain-of-thought
                timeout=10,
            )
            text = resp.choices[0].message.content
            if text:
                return text.strip()
        except Exception:
            logger.exception("groq digest failed with one key, trying next if available")
            continue

    return None


DRIFTY_INSIGHT_SYSTEM_PROMPT = (
    "You are Drifty, giving a one-stock read in a single short, conversational "
    "sentence (two at most). You are given three already-computed verdicts for "
    "one stock: how it's moving compared to its own history, compared to the "
    "user's other tracked stocks, and compared to the market benchmark, plus an "
    "attention score. Weave them into ONE natural, casual sentence a sharp "
    "friend would say -- actually synthesize what the three verdicts mean "
    "together, don't just restate each one in turn. Use only the numbers and "
    "facts given. Never guess or invent a reason why the stock moved -- you "
    "have no news data, so if you don't know why, don't mention why at all."
)


def generate_drifty_insight(symbol: str, facts: dict) -> str | None:
    """One-line conversational synthesis of compute_drifty's self/peer/market
    verdicts for a single stock -- a readability layer, same principle as
    generate_digest above: the rule engine already decided everything (the
    score, what fired, why), this only rephrases the already-decided facts
    into one natural sentence instead of three separate labeled paragraphs.
    """
    facts_text = (
        f"Symbol: {symbol}\n"
        f"Attention score: {facts['attention_score']}/100\n"
        f"Self (vs own history): {facts['self_context']}\n"
        f"Peer (vs watchlist): {facts['peer_comparison']}\n"
        f"Market (vs benchmark): {facts['market_context']}\n"
    )
    if facts.get("reasons"):
        facts_text += f"Flagged reasons: {', '.join(facts['reasons'])}\n"

    for key in _keys():
        try:
            client = Groq(api_key=key)
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": DRIFTY_INSIGHT_SYSTEM_PROMPT},
                    {"role": "user", "content": facts_text},
                ],
                max_tokens=120,
                reasoning_effort="low",
                temperature=0.4,
                timeout=8,
            )
            text = resp.choices[0].message.content
            if text:
                return text.strip()
        except Exception:
            logger.exception("groq drifty insight failed with one key, trying next if available")
            continue

    return None
