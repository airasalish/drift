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
