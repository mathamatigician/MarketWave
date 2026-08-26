# Agentic News Ingestion + Live Activity Window — Design Spec

## Summary

MarketWave's news-ingestion pipeline (`backend/pipeline.py`) currently scores
article sentiment by calling `google.genai`'s `Client.generate_content()`
directly. Meanwhile, the repo already defines a real multi-agent framework
(`backend/agents/orchestrator.py`: `ResearchAgent`, `SentimentAnalyst`,
`MarketCorrelator` via the `google-antigravity` SDK) — but today that
framework is wired up *only* for the chat assistant (`/ws/chat`), not for
ingestion. This creates a real gap between what the project claims
(agent-based architecture, a hackathon judging criterion) and what the
ingestion path actually does (a plain SDK call with no agent involved).

This spec converts the ingestion pipeline's two AI-driven steps — cleaning
scraped article text and scoring its sentiment — to route through the
existing `ResearchAgent` and `SentimentAnalyst` agents, and adds a live
"Agent Activity" panel to the Dashboard so a user can watch ingestion happen
step-by-step when they trigger it, the same way the chat assistant already
streams its reasoning.

## Context

**Today's pipeline** (`backend/pipeline.py:run_pipeline`): a deterministic,
synchronous Python loop — dedup against Firestore's existing article URLs,
fetch each watchlist ticker's news via Google News RSS
(`fetch_news_items`), scrape article bodies (`resolve_and_scrape_article`,
BeautifulSoup), a crude regex whitespace-clean, then
`analyze_sentiment_gemini()` (a direct `genai.Client().generate_content()`
call with `response_schema=TopicSentimentSchema`), then a single Firestore
batch write of all newly-ingested articles. Runs as a FastAPI
`BackgroundTasks` job from `POST /api/pipeline/run`, or standalone via
`python pipeline.py --ticker X`. No progress is visible anywhere except
server-side `print()` logs.

**The agent framework already exists** (`backend/agents/orchestrator.py`):
`research_agent_config` and `sentiment_analyst_config` are standalone
`LocalAgentConfig` objects (not just entries in the orchestrator's
`subagents=[...]` list), so they can be instantiated directly —
`Agent(research_agent_config)` / `Agent(sentiment_analyst_config)` — without
going through the orchestrator's own delegation logic. `sentiment_analyst_config`
already declares `response_schema=TopicSentimentSchema` (imported from
`pipeline.py`), matching exactly what `analyze_sentiment_gemini()` produces
today.

**The existing `/ws/chat` streaming pattern** (`main.py:527-579`) is the
template for the new activity channel: accept a WebSocket, stream JSON
messages with a `"type"` discriminator, reconnect on the frontend side after
a 3s delay (`AgentChat.tsx`'s `connectWebSocket`).

**A pre-existing, unrelated bug** found during this design's exploration:
the Dashboard's "Run Pipeline" button (`Dashboard.tsx:174`,
`handleRunPipeline`) calls `POST /api/pipeline/run` with **no params at
all** — no `ticker`, no `admin_key`. `pipeline.run_pipeline(ticker_arg=None)`
treats a missing ticker as "load every unique ticker across every user's
watchlist, system-wide" (`load_all_watchlist_tickers()`) — a genuinely
expensive, shared-cost operation, not something scoped to the clicking
user. `main.py:415-427`'s `trigger_pipeline` route correctly 403s this
without a matching `admin_key`, and the frontend's `if (res.ok)` check
silently swallows the failure (no error shown to the user). Since
`ADMIN_KEY` is a real, bound secret in production, this button is very
likely non-functional today, and even if it weren't gated, its current
behavior (trigger a global refresh for every user in the system) is not
what a single user clicking a button on their own dashboard should cause.
Fixing this is in scope here — see Decisions below — since there is no
point building a live activity window behind a trigger that doesn't fire,
or that fires far more broadly than intended.

**Verified, load-bearing implementation constraint:** a naive top-level
`pipeline.py → orchestrator.py` import creates a real circular import.
`orchestrator.py` does `from pipeline import TopicSentimentSchema` at its
own top level; if `pipeline.py` also imports from `orchestrator.py` at its
top level (before `TopicSentimentSchema`'s class definition executes),
Python raises `ImportError: cannot import name 'TopicSentimentSchema' from
partially initialized module 'pipeline'`. This was reproduced directly
(not just reasoned about) in the project's real `.venv` before writing this
spec. The fix — used throughout this design — is that every function in
`pipeline.py` that needs an agent config does a **local import inside the
function body**, deferred until call time, after both modules are fully
loaded. This is the same technique `analyze_sentiment_gemini()` already
uses today for its own `from google import genai` import (see the comment
there re: protobuf conflicts) — same technique, different reason.

**Also verified:** the long-standing project constraint "never import
`main.py` directly, it hangs" does not reproduce in this repo's real
`.venv` (tested directly: clean, fast import). It's very likely specific to
ephemeral SDD worktrees, which never receive the gitignored `.venv`
directory at all. This spec keeps `py_compile`-only discipline for
per-task verification inside ephemeral worktrees (they still lack a
working `.venv`), but the final whole-branch verification — run from a
worktree with a real `.venv` available — may do real imports.

## Decisions

- **Approach:** keep the deterministic Python loop and Firestore
  persistence exactly as they are today (proven reliable — dedup logic,
  batch writes, error fallbacks). Only the two AI touchpoints change to
  route through named agents. Rejected alternative: letting the
  `OrchestratorAgent` freely drive the whole ingestion end-to-end
  (prompting it to "ingest and score news for TSLA" and streaming its raw
  reasoning) — rejected because the LLM, not deterministic code, would then
  decide how many articles to fetch/score and whether each one gets
  persisted, risking silent drift from today's guaranteed
  every-article-gets-saved behavior.
- **Fetch/scrape stays plain Python.** No LLM reasoning happens in RSS
  fetch + BeautifulSoup scrape today; wrapping it in an Agent call would be
  theater, not substance, and would add pure latency for no value.
- **`ResearchAgent`'s job is cleaning, not fetching.** It takes the raw
  scraped text (already fetched deterministically) and produces a cleaned,
  focused summary — replacing today's regex whitespace-strip. This is a
  genuine quality improvement (a cleaner signal for scoring), not just
  relabeling, and it means ingestion becomes 2 Gemini calls per article
  instead of 1 (clean + score) — accepted as a reasonable cost at
  hackathon/demo scale.
- **`SentimentAnalyst` replaces `analyze_sentiment_gemini()`'s direct
  `genai.Client()` call**, using its existing `response_schema=TopicSentimentSchema`.
- **The hourly watchdog (`backend/agents/triggers.py`) gets the same
  `SentimentAnalyst` swap** for its own `pipeline.analyze_sentiment_gemini()`
  call, so there is exactly one sentiment-scoring code path in the entire
  app, used by both the on-demand pipeline and the background watchdog. No
  UI is added for the watchdog itself — it's a background cron with no
  viewer.
- **UI placement: a panel embedded directly in `Dashboard.tsx`'s own
  layout**, not a new sliding drawer (that pattern is already used by
  `AgentChat`, opened via a separate floating bubble — this is a distinct,
  always-present-but-collapsed panel, not a reuse of that mechanism).
  Collapsed by default, auto-expands on the first activity event of a run,
  manually collapsible after that — mirroring `AgentChat`'s existing
  "Thought Stream" collapse/expand UX and visual styling exactly (dark
  card, `Terminal`/`Activity` lucide icons, `#00FF94` accent, monospace log
  lines).
- **`admin_key` gating split:** a scoped, single-ticker run no longer
  requires `admin_key` — it's bounded in cost (~5 articles) and is a
  legitimate user action, guarded instead by a lightweight in-memory
  per-ticker cooldown (reject if the same ticker ran in the last 60s) to
  prevent spam-clicking. The unscoped "run for every ticker across every
  user's watchlist" mode (no `ticker` param — the expensive, genuinely
  shared-cost, admin/cron case) keeps requiring `admin_key`, unchanged.
  This avoids inventing new auth/session infrastructure this app doesn't
  otherwise have anywhere else.
- **`handleRunPipeline` changes what it triggers, not just how it's
  gated.** Today it sends no ticker at all (hitting the expensive,
  admin-gated, system-wide path — and 403ing). Resolving this ambiguity
  (found during this spec's self-review, not part of the original ask):
  the button will instead loop over the current user's own `watchlist`
  array (already loaded into `Dashboard.tsx` state) and fire one scoped
  `POST /api/pipeline/run?ticker=X` request per ticker, sequentially
  awaited (not concurrent — keeps behavior predictable and avoids bursting
  Gemini rate limits across a multi-ticker watchlist at once). Each
  ticker's run independently broadcasts its own activity events over the
  same shared `/ws/ingest` channel; events already carry a `ticker` field,
  so the panel handles a multi-ticker sequence with no special-casing —
  it just renders whatever arrives, in order.

## Architecture / Data Flow

```
User clicks "Run Pipeline" (Dashboard.tsx)
  │
  ├─ IngestActivity.tsx already holds an open /ws/ingest WebSocket
  │  (connected on mount, same lifecycle as AgentChat's /ws/chat connection)
  │
  ▼
POST /api/pipeline/run?ticker=TSLA   (no admin_key needed for scoped runs)
  │
  ▼
main.py: trigger_pipeline()
  - per-ticker 60s cooldown check (in-memory dict)
  - BackgroundTasks.add_task(pipeline.run_pipeline, ticker="TSLA",
                              on_activity=broadcast_to_ws_ingest_clients)
  - returns {"status": "started"} immediately
  │
  ▼
pipeline.run_pipeline(ticker, on_activity)   [async]
  for each new article:
    on_activity({"type": "activity", "agent": "ResearchAgent", ...})
      → local import: from backend.agents.orchestrator import research_agent_config
      → Agent(research_agent_config): clean scraped text
    on_activity({"type": "activity", "agent": "SentimentAnalyst", ...})
      → local import: from backend.agents.orchestrator import sentiment_analyst_config
      → Agent(sentiment_analyst_config): score cleaned text (TopicSentimentSchema)
    (existing dedup / Firestore batch-write logic, unchanged)
  on_activity({"type": "done", ...})
  │
  ▼
main.py broadcasts each on_activity(...) call to every connected /ws/ingest
WebSocket (simple in-process set of connections, fan-out, no per-user
scoping)
  │
  ▼
IngestActivity.tsx renders each event as a log line in its collapsible panel
```

## Backend Components

**`backend/agents/orchestrator.py`** — no changes. `research_agent_config`
and `sentiment_analyst_config` are reused as-is.

**`backend/pipeline.py`**:
- `run_pipeline()` becomes `async def run_pipeline(ticker_arg: Optional[str] = None, on_activity: Optional[Callable[[dict], Awaitable[None]]] = None)`.
  Same loop, same dedup (`existing_urls` set), same Firestore batch write —
  unchanged. Every checkpoint (start ticker, fetched N items, cleaning
  article, scored article, saved, error/fallback) calls
  `if on_activity: await on_activity({...})` in addition to the existing
  `print()` statements. When run via CLI (`if __name__ == "__main__":`),
  `on_activity` stays `None` — CLI behavior is unchanged.
- New `async def clean_article_with_agent(text: str, ticker: str) -> str`:
  local import `from backend.agents.orchestrator import research_agent_config`
  then `from google.antigravity import Agent` (also local, same reasoning),
  runs the agent on the raw scraped text, returns its cleaned output. On
  any exception, falls back to today's regex whitespace-strip
  (`re.sub(r'\s+', ' ', text).strip()`) and the caller emits an
  `on_activity({"type": "activity", ..., "status": "fallback", ...})` event
  so the fallback is visible, not silently masked.
- New `async def score_sentiment_with_agent(text: str, ticker: str) -> Optional[dict]`:
  same local-import pattern, instantiates `Agent(sentiment_analyst_config)`.
  **Preserves `analyze_sentiment_gemini()`'s exact existing contract**
  (`Optional[dict]`, returns `None` on failure) rather than absorbing the
  neutral-default fallback itself — this distinction matters: `triggers.py`'s
  watchdog relies on getting `None` back so it can *exclude* a failed
  scoring attempt from its average-sentiment calculation
  (`if sentiment_dict and sentiment_dict.get('overall_sentiment') is not None:`).
  If this function instead always returned a neutral-default dict on
  failure, the watchdog would silently start *including* a fabricated
  `0.0` in its average instead of excluding the failure — a real change to
  its alert-triggering math, not just an internal implementation detail.
  `score_sentiment_with_agent` is a direct structural replacement for
  `analyze_sentiment_gemini()` — same nullable contract, same callers'
  existing failure-handling keeps working unchanged.
- The existing `analyze_sentiment()` wrapper (the one that always returns
  a dict — never `None` — via its own neutral-default fallback, and is
  what `run_pipeline` actually calls today) has its body updated to call
  the new `score_sentiment_with_agent()` instead of `analyze_sentiment_gemini()`.
  Its own always-succeeds contract is unchanged; only what it calls
  internally changes.
- `on_activity` fallback events fire from inside `score_sentiment_with_agent`
  (before returning `None`) and from inside `analyze_sentiment()` (when it
  substitutes the neutral default) — so both consumers' UIs-of-one
  (the ingest panel via `analyze_sentiment()`, and watchdog logs via the
  raw `None`) see the failure, not just one of them.
- `analyze_sentiment_gemini()` (the old direct-`genai.Client()` function)
  becomes fully unused after this change — nothing calls it anymore.  Not
  deleted in this change (avoids a wider blast radius than necessary); a
  follow-up cleanup can remove it.

**`backend/agents/triggers.py`**: `check_watchlist_sentiment` (`triggers.py:28`)
is already `async def` (confirmed by reading the current file — no wrapper
change needed). Its line 47,
`sentiment_dict = pipeline.analyze_sentiment_gemini(body_text, ticker)`,
becomes `sentiment_dict = await pipeline.score_sentiment_with_agent(body_text, ticker)`.
Everything after that line (`if sentiment_dict and sentiment_dict.get('overall_sentiment') is not None:`)
is unchanged — the nullable contract match means no other logic in this
file needs to change.

**`backend/main.py`**:
- New `@app.websocket("/ws/ingest")` — same accept/receive-loop shape as
  `/ws/chat`, but this channel is push-only from the server (no client
  prompt needed to start; the client just connects and listens). Maintains
  a module-level `set()` of connected websockets; a `broadcast_ingest_activity(event: dict)`
  async helper iterates the set and `await ws.send_json(event)`, removing
  any socket that raises (disconnected).
- `trigger_pipeline()` (`main.py:415-427`) changes: `ticker` becomes the
  gate — if `ticker` is provided, `admin_key` is no longer required, but a
  per-ticker in-memory cooldown (module-level dict of `{ticker: last_run_timestamp}`,
  60s window) applies, returning 429 if triggered too soon. If `ticker` is
  omitted (the "run for every watchlist ticker" case), `admin_key` is
  still required exactly as today. `background_tasks.add_task(pipeline.run_pipeline, ticker, on_activity=broadcast_ingest_activity)`.

## Frontend Components

**New: `frontend/src/components/IngestActivity.tsx`**:
- Connects to `${WS_URL}/ws/ingest` on mount; reconnects after a 3s delay
  on close, matching `AgentChat.tsx`'s `connectWebSocket` pattern exactly.
- Local state: a list of activity events, a `showActivity` boolean
  (collapsed by default), auto-set to `true` on the first event of a new
  run (detected via `{"type": "start"}`).
- Visual styling matches `AgentChat.tsx`'s "Thought Stream" panel exactly:
  same card classes, same `Terminal`/`ChevronDown`/`ChevronUp` icons from
  `lucide-react`, same `#00FF94` accent, monospace log-line rendering. One
  line per event: `<agent> · <ticker> · <status>: <detail>`.
- No shared hook extracted — kept self-contained like `AgentChat.tsx`
  already is; this repo has no shared-hooks pattern yet and a 2-file
  feature isn't reason enough to start one.

**`frontend/src/components/Dashboard.tsx`**:
- Imports and renders `<IngestActivity />` near the existing "Run Pipeline"
  button.
- `handleRunPipeline` (currently `Dashboard.tsx:174-189`) changes from a
  single param-less `POST /api/pipeline/run` call to a loop over `watchlist`
  (existing state, already populated), firing
  `POST /api/pipeline/run?ticker=${encodeURIComponent(ticker)}` once per
  ticker, sequentially `await`ed. Keeps `setPipelineRunning(true)`/`finally`
  bracketing the whole loop (unchanged pattern), so the button's own
  loading state still reflects "is any run still in flight."

## WebSocket Event Contract (`/ws/ingest`)

```json
{"type": "start", "ticker": "TSLA", "total_items": 5}
{"type": "activity", "agent": "ResearchAgent", "ticker": "TSLA", "status": "fetching", "detail": "Querying Google News RSS..."}
{"type": "activity", "agent": "ResearchAgent", "ticker": "TSLA", "status": "found", "detail": "Found 5 recent articles"}
{"type": "activity", "agent": "ResearchAgent", "ticker": "TSLA", "status": "cleaning", "detail": "Cleaning article 1/5: \"Tesla Q3 earnings beat\""}
{"type": "activity", "agent": "SentimentAnalyst", "ticker": "TSLA", "status": "scoring", "detail": "Scoring article 1/5"}
{"type": "activity", "agent": "SentimentAnalyst", "ticker": "TSLA", "status": "scored", "detail": "overall_sentiment: 0.6", "article_title": "Tesla Q3 earnings beat"}
{"type": "activity", "agent": "System", "ticker": "TSLA", "status": "saved", "detail": "Saved 3 new articles to Firestore"}
{"type": "activity", "agent": "ResearchAgent", "ticker": "TSLA", "status": "fallback", "detail": "Agent cleaning failed, using basic text cleanup"}
{"type": "done", "ticker": "TSLA", "new_articles": 3, "skipped_duplicates": 2}
{"type": "error", "ticker": "TSLA", "detail": "Pipeline run failed: <message>"}
```

`type` is always present. `activity` events always carry `agent`, `ticker`,
`status`, `detail`. `status` values used: `fetching`, `found`, `cleaning`,
`scoring`, `scored`, `saved`, `fallback`.

## Error Handling

- Per-article failures (scrape fails, agent call fails) do not abort the
  whole run — same as today. `clean_article_with_agent`/`score_sentiment_with_agent`
  fall back to today's existing defaults on any exception, and emit a
  `"fallback"` activity event so the UI shows it rather than silently
  masking it.
- If `run_pipeline` itself raises unexpectedly (e.g. Firestore batch write
  fails), `on_activity({"type": "error", ...})` fires before the exception
  propagates, so the panel shows *something* went wrong even in a
  worst-case failure, then the existing `except Exception as e: print(...)`
  handling (already present at the Firestore-write site) still applies —
  no new unhandled-exception surface is introduced.
- No connected `/ws/ingest` client (CLI run, or user navigated away): the
  `on_activity` callback (or its absence) is unaffected either way —
  broadcasting to zero sockets is a no-op, or `on_activity is None` for the
  CLI path, exactly as today.
- Disconnect mid-run: frontend auto-reconnects (`AgentChat`'s existing
  3-second retry pattern). No replay/resume of missed events — reconnecting
  mid-run just means picking up live from that point on. Acceptable for
  this feature's scope; not a guarantee this app makes anywhere else
  either.
- The `admin_key`-gating change is a narrowing of what's checked (scoped
  runs need no key, unscoped runs still do), not a widening of what's
  trusted — no new secret exposure.

## Testing

- New tests for `clean_article_with_agent` / `score_sentiment_with_agent`
  in `backend/pipeline.py`, mocking at the same boundary the local imports
  use (`@patch('backend.agents.orchestrator.Agent')` or equivalent),
  verifying: the right config is used, `clean_article_with_agent` falls
  back to the regex clean on a raised exception (always returns a string,
  never raises), and `score_sentiment_with_agent` returns `None` — not a
  fallback dict — on a raised exception (preserving the nullable contract
  `triggers.py` depends on). A separate test on `analyze_sentiment()`
  confirms *it* still substitutes the neutral-default dict when
  `score_sentiment_with_agent` returns `None`, so `run_pipeline`'s
  always-succeeds expectation is independently verified too.
- `main.py`'s new `/ws/ingest` route and the `trigger_pipeline` gating
  change get `python3 -m py_compile` verification when done inside an
  ephemeral SDD worktree (no `.venv` there). The final whole-branch
  verification, run from this spec's own worktree (which has a working
  `.venv`), can do a real `import backend.main` smoke test — confirmed
  safe to do so earlier in this design process.
- No frontend test framework, as established elsewhere in this repo.
  `npm run build` plus a real manual smoke test: run the backend locally,
  trigger a scoped pipeline run, confirm `IngestActivity` renders live
  events end-to-end, before calling the frontend work done.
- The `admin_key` cooldown logic (module-level dict, 60s window) gets a
  direct unit test: first call within the window is gated, a call after
  the window passes.

## Explicitly Out of Scope

- Removing `analyze_sentiment_gemini()` from `pipeline.py` entirely (it
  becomes fully unused after this change — both `analyze_sentiment()` and
  `triggers.py` are repointed to the new `score_sentiment_with_agent()` —
  but deletion is left to a follow-up cleanup pass to keep this change's
  blast radius contained). `analyze_sentiment()` itself is NOT unused —
  `run_pipeline` still calls it; only what it calls internally changes.
- Any change to the `OrchestratorAgent` / `/ws/chat` chat assistant flow —
  untouched.
- Persisting or replaying missed `/ws/ingest` activity events across a
  disconnect.
- Per-user auth/session scoping of `/ws/ingest` broadcasts (all connected
  clients see all activity — acceptable at this app's scale).
- Rate-limiting beyond the simple per-ticker 60s cooldown (no distributed
  rate limiter, no per-IP throttling).
- Deleting `frontend/src/components/Watchlist.tsx` / `Heatmap.tsx` /
  `ChartPanel.tsx` (already-orphaned, per `ARCHITECTURE.md`'s own note —
  unrelated to this change, left alone).

## Global Constraints

- Never import `backend/main.py` or `backend/agents/orchestrator.py` at
  module level from `backend/pipeline.py` — use local imports inside the
  specific async functions that need them (empirically confirmed necessary
  to avoid a real circular import: `orchestrator.py → pipeline.py → orchestrator.py`).
- `pipeline.py`'s CLI entry point (`python pipeline.py --ticker X`) must
  keep working unchanged — `on_activity` defaults to `None` and every
  emission site guards on it.
- The unscoped ("run for every watchlist ticker") pipeline trigger keeps
  requiring `admin_key` — do not relax that path.
- No new secrets, no new env vars. `ADMIN_KEY` usage narrows in scope; it
  is not removed.
- Verification inside ephemeral SDD worktrees uses `python3 -m py_compile`
  only for any file touching `main.py` or `orchestrator.py` (no working
  `.venv` there). Real-import verification is reserved for this spec's own
  worktree, which has a working `.venv`.
- Match `AgentChat.tsx`'s existing visual language exactly for
  `IngestActivity.tsx` (colors, icons, collapse/expand interaction) —
  no new visual pattern introduced for this feature.
- Existing behavior must be unaffected for anyone not triggering an
  ingest run: no change to `/ws/chat`, no change to article/sentiment data
  shape stored in Firestore, no change to the unscoped admin pipeline
  trigger's required key.
