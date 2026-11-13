# ODYSSEY: Architecture

```
Browser (React + Three.js)                     Node backend (server/, tsx)                         External
──────────────────────────                     ───────────────────────────                         ────────
OrbitalExperience ─ stage 01 AGENT ──REST/SSE──▶ index.ts  HTTP API, auth, rate limit, SSE
  AgentMission (trace, candidates,                  │
  where-Earth-fails, evidence, lab,                 ├─ agent/loop.ts    AgentRunner (LLM tool loop + deterministic completion)
  campaign, report)                                 │    └─ agent/tools.ts  18 typed tools ─┐
  InterventionLab ─ /api/interventions/simulate     │                                       │
  Stages 02–05 (deterministic, in-browser) ◀──┐     ├─ llm/provider.ts  LLMProvider ─────────┼──▶ OpenCode Go/Zen (DeepSeek V4.1 Flash)
                                              │     ├─ science/          profiles, mismatch, │
src/mission src/temporal src/interventions ───┴─────┤   candidates, interventions            │
src/campaign src/data/*.json  (shared engines)      ├─ evidence/retrieve.ts full-source ─────┼──▶ allow-listed NASA/ESA/USGS/… hosts
                                                    ├─ evidence/verify.ts  claim checks     │
                                                    ├─ evidence/python.ts ─▶ bridge.py ─────┼──▶ external/Earth-Location-Nasa ─▶ Serper
                                                    │                                       └──▶ external/Reranker ─▶ Crossref, OpenCode
                                                    └─ store.ts  node:sqlite (runs, events, sources, feedback)
```

## Principles

1. **One set of engines.** The backend imports the same deterministic TypeScript
   engines the frontend uses (`src/mission`, `src/temporal`, `src/interventions`,
   `src/campaign`), no reimplementation, no drift.
2. **LLM orchestrates, code computes.** The model selects tools and writes the
   narrative. All arithmetic, unit handling, scoring, filtering and optimisation
   is deterministic code.
3. **External repositories stay unmodified.** Both are pinned git submodules.
   A stdlib-only Python bridge (`server/evidence/bridge.py`, run with
   `python3 -I`) adapts them; secrets reach it only through environment variables.
4. **Everything is persisted.** Each tool call is an event row; the typed agent
   state and the message transcript are checkpointed after every call, which makes
   cancellation, crash recovery and resume possible.

## Interfaces (PART 2.3)

| Interface | Implementation | Supplied by |
|---|---|---|
| `EvidenceRetriever` | `search_earth_evidence`, `search_planetary_reference` → `bridge.py validate/search` | Earth-Location-Nasa (Serper client, `canonical_url`, term filters, budgets) |
| `EvidenceVerifier` | `retrieve_source` + `verify_source` (`evidence/retrieve.ts`, `evidence/verify.ts`) | ODYSSEY (completes E-L-N's unimplemented full-source verification) |
| `EvidenceReranker` | `rerank_evidence`: candidates: Reranker `rerank()`; sources: BM25 | WA-on-test2/Reranker; ODYSSEY BM25 |
| `MissionPlanner` | `AgentRunner` (`agent/loop.ts`) | ODYSSEY + OpenCode LLM |
| `ExperimentPlanner` | `parse_mission`, `decompose_experiments`, `extract_requirements` | `src/mission` recipes; LLM limited to choosing catalogue archetypes |
| `InterventionPlanner` | `find_intervention_options`, `evaluate_intervention` | `server/science/interventions.ts` + `src/interventions` catalogue |
| `CampaignOptimizer` | `optimize_campaign` | `src/campaign` (respects agent rejections) |

## Data flow of one run

1. `POST /api/runs {brief}` creates a run row (`queued`) and launches `AgentRunner`.
2. The LLM receives the system prompt (rules + workflow) and the 18 tool schemas.
3. Each tool call is validated, executed with a timeout and abort signal, logged as
   `tool_call` / `tool_result` events, and fed back as a compact JSON tool message.
4. When the LLM stops early or exhausts its budget, `nextDeterministicStep()`
   completes the required steps (ranking, campaign, report). The run's planner
   label records this (`llm:<model>+deterministic-completion`).
5. `generate_mission_report` builds the report, the evidence graph and the
   Markdown export, then the run is `completed`.
6. The UI subscribes to `/api/runs/:id/stream` (SSE, replay + live) and refreshes
   the typed state on each tool result. Globe highlights follow the agent's kept
   candidates and campaign stops.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Capabilities (no secrets), budgets, active runs |
| GET | `/api/meta` | Tool list, dimension schema, aggregate definition, component map |
| POST | `/api/runs` | Start a run `{brief, planner?: "auto"\|"deterministic"}` |
| GET | `/api/runs`, `/api/runs/:id` | History; run + typed state |
| GET | `/api/runs/:id/events?after=n`, `/api/runs/:id/stream` | Event log; SSE |
| POST | `/api/runs/:id/cancel`, `/api/runs/:id/resume` | Cancellation; resume from snapshot |
| GET | `/api/runs/:id/report.md`, `/api/runs/:id/report.json` | Exports |
| POST/GET | `/api/runs/:id/feedback` | Reviewer feedback (pending review, never auto-applied) |
| POST | `/api/interventions/simulate` | Intervention Lab models |
| GET | `/api/targets/:id`, `/api/sites/:id/comparison` | Planetary profile; site-vs-target comparison |

## Deployment

Single process: `npm run build && npm start` serves `dist/` and `/api` from the
backend on `ODYSSEY_PORT`. Development: `npm run server` + `npm run dev` (Vite
proxies `/api`). Requirements: Node ≥ 22.5 (built-in `node:sqlite`; developed on
Node 26), Python ≥ 3.10 (stdlib only for the bridge), `pdftotext` (poppler) for
PDF sources. For a shared deployment set `ODYSSEY_API_TOKEN`, put the server
behind HTTPS, and keep `.env` out of images (inject secrets at runtime).
