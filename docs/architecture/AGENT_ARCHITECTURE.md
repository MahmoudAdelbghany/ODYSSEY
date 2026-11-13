# ODYSSEY: Agent Architecture

## Reasoning provider

| Setting | Value | Notes |
|---|---|---|
| Provider | OpenCode (Go subscription) | OpenAI-compatible `POST /chat/completions` at `https://opencode.ai/inference/go/openai/v1` |
| Model | `deepseek-v4.1-flash` | Configurable with `OPENCODE_MODEL`; any tool-calling model in the plan works |
| Reasoning | `reasoning_effort: "none"` | Verified to drop hidden reasoning tokens to 0 for this model (`OPENCODE_REASONING_EFFORT`) |
| Required headers | `Authorization: Bearer`, `x-opencode-session: odyssey-<runId>`, `User-Agent: odyssey-mission-agent/1.0` | Go rejects requests without a session id (`MissingSessionID`) |
| Retries | 2 retries with exponential backoff on 429/5xx/network | Non-retryable 4xx surface immediately |
| Timeouts | 90 s per request; 120 s per tool; 12 min per run | All configurable |

Authentication was inspected first: the key is an OpenCode Console key registered
in the local OpenCode CLI for both `opencode` (Zen) and `opencode-go`. Zen returned
`402 Insufficient balance`; Go accepted the key once the session header was sent.
OpenCode documents Go as designed for coding-agent-style clients that identify
themselves and send a stable session id, ODYSSEY does both. Zen (pay-as-you-go)
is the cleaner contract for a public deployment; switch with `OPENCODE_BASE_URL`.

## Loop

```
system prompt (rules + workflow) + brief
 └─▶ LLM turn ──tool calls──▶ executeTool() ──▶ typed state transition ──▶ compact JSON tool message
        ▲                         │  validation · preconditions · duplicate guard · budget · timeout · abort
        └─────────────────────────┘  every call → events table (inputs, outputs, errors, ms, evidence refs)
 LLM stops / budget reached ──▶ nextDeterministicStep() completes required steps ──▶ generate_mission_report
```

* **Typed state** (`server/agent/state.ts`): parsed mission, experiments, candidate
  evaluations, Earth-wide gaps, evidence items with status, verifications,
  contradictions, mismatches, interventions + evaluations, reranks, campaign,
  decisions log, budgets. Matrices are recomputed deterministically from state
  (`agent/engine.ts`), never trusted from model text.
* **Controlled transitions**: tools enforce preconditions (e.g. campaign requires
  ranking for every experiment). Changing the temporal configuration invalidates
  rankings and the campaign; the agent must re-rank. The `decisions` log records
  every selection, rejection, downgrade, revisit and unresolved item.
* **Budgets**: 64 tool calls (12 held in reserve for required completion steps),
  36 LLM turns, 12 Serper calls, 10 source fetches. Budget-refused calls are
  recorded so the deterministic planner moves on instead of looping.
* **Loop prevention**: an identical successful call is refused; at most 6 tool
  calls per LLM turn; the deterministic completion has a hard step guard.
* **Cancellation / resume**: an `AbortController` per run propagates into fetches,
  the Python bridge (SIGKILL) and LLM requests. State and transcript are
  checkpointed after each tool, so `POST /api/runs/:id/resume` continues without
  repeating completed steps (tested).

## Tools

| # | Tool | Deterministic core | External |
|---|---|---|---|
| 1 | `parse_mission` | target/duration regexes; archetype ids validated against catalogue; brief fragments must be verbatim or are marked INFERRED | LLM (JSON) |
| 2 | `decompose_experiments` | `decomposeMission` recipes (thresholds, provenance) |, |
| 3 | `extract_requirements` | requirement table + planetary conditions that matter |, |
| 4 | `discover_global_regions` | H3 screen (80 generated regions) |, |
| 5 | `search_earth_evidence` | E-L-N `validate()` (2 scopes, filters, numeric checks) | Serper |
| 6 | `search_planetary_reference` | E-L-N client + planet/objective filters | Serper |
| 7 | `retrieve_source` | allow-listed HTTPS fetch, HTML/PDF text, citation metadata, cache | publisher hosts |
| 8 | `verify_source` | verbatim + number + quantity guards; unit-aware judgement; contradiction records | LLM (extraction only) |
| 9 | `compare_measurements` | support/quantity-aware comparison |, |
| 10 | `evaluate_requirement` | `evaluateMission` per requirement |, |
| 11 | `detect_environmental_mismatch` | mismatch classes, importance, handling |, |
| 12 | `rank_candidate_regions` | hard filters → independent rankings → Earth-wide gaps |, |
| 13 | `rerank_evidence` | Reranker weighted distance; BM25; Kendall τ vs baseline | Crossref, LLM weights |
| 14 | `analyze_temporal_window` | `evaluateTemporal` |, |
| 15 | `find_intervention_options` | intervention templates (Part 5.2) | optional Serper facility search |
| 16 | `evaluate_intervention` | pump-down, radiative equilibrium, gravity offload, cycle protocol |, |
| 17 | `optimize_campaign` | `optimizeCampaign` with rejected pairs excluded |, |
| 18 | `generate_mission_report` | report + evidence graph + Markdown; narrative id check |, |

## What the agent can explain

The report and UI answer: what was searched (`searchReports`, queries), which
sources were examined (`evidence[]` with retrieval status, title, date, DOI), what
was verified or contradicted (verbatim quotes), why a candidate was rejected or
selected (`candidates[].reasons`, `decisions`), what assumptions were used
(`interventionEvaluations[].defaults`, template thresholds tagged INFERRED), and
which measurements would most improve the plan (narrative + Earth-wide evidence gaps).

## Observed behaviour (live runs, DeepSeek V4.1 Flash, reasoning off)

The model parses the brief into the correct five experiments, issues parallel
tool calls, searches planetary references before ranking, retrieves NASA NTRS
PDFs, ranks every experiment, searches Earth evidence for its top sites,
proposes and evaluates interventions, optimises the campaign and writes a
narrative whose identifiers all resolve. Weak points observed and mitigated: with
reasoning disabled the model sometimes misreads a quantity (e.g. a temperature
*difference* as a temperature), the deterministic quantity guard rejects these;
it can over-call `analyze_temporal_window`: harmless now that unchanged
configurations no longer invalidate rankings.
