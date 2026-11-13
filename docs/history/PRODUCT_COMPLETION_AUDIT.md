# ODYSSEY: Product Completion Audit

Audit date: 2026-11-13. Source of truth: the code and test behaviour in this
repository, not earlier milestone reports. Every "verified" entry below was
exercised by a test or an end-to-end run during this audit.

Legend: **IMPLEMENTED AND VERIFIED** · **IMPLEMENTED BUT INCOMPLETE** ·
**PRESENTATION ONLY** · **MOCKED OR SYNTHETIC** · **NOT IMPLEMENTED** ·
**BLOCKED BY EXTERNAL DEPENDENCY**

## 1. Baseline found at the start of this work

Before this work ODYSSEY was a **frontend-only** React/Three.js application. All
"intelligence" ran in the browser as deterministic TypeScript; there was no
backend, no persistent runs, no evidence retrieval, and the only LLM use was a
legacy browser call to a free public endpoint (Pollinations) in the `?full=1`
shell.

| Capability | Status at baseline | Evidence |
|---|---|---|
| Cinematic globe (Blue Marble LOD, night lights, clouds), orbital camera, site descent | IMPLEMENTED AND VERIFIED | Runs in browser; screenshots `docs/agent-0*.png` |
| Site Orbit (Copernicus GLO-30 terrain + Sentinel-2 10 m imagery, 39 curated + 15 enriched regions) | IMPLEMENTED AND VERIFIED | `src/components/SiteOrbit.tsx`, `src/data/siteTerrain.json`, `siteImagery.json` |
| Mission decomposition | IMPLEMENTED BUT INCOMPLETE | Keyword/regex archetype matching only (`src/mission/decompose.ts`); no language understanding |
| Experiment × site evaluation (39 sites) | IMPLEMENTED AND VERIFIED | `src/mission/evaluate.ts`; exercised by agent tests |
| Temporal windows (NASA POWER monthly normals) | IMPLEMENTED AND VERIFIED | `src/temporal/engine.ts`; exercised by agent tests |
| Environmental interventions | IMPLEMENTED BUT INCOMPLETE | Qualitative catalogue (`src/interventions/`); no control variables, models or protocols |
| Campaign optimisation | IMPLEMENTED AND VERIFIED | `src/campaign/engine.ts` exact search over pruned options; exercised by tests |
| Global generated discovery (H3, WorldClim) | IMPLEMENTED AND VERIFIED | `scripts/global_discovery.py`; 22/22 tests pass (needs `h3 shapely numpy scipy rasterio`) |
| Generated-region enrichment (15 regions) | IMPLEMENTED AND VERIFIED | `scripts/test_generated_enrichment.py` 13/13 pass |
| MODIS LST / QC pipeline (39 sites, day/night) | IMPLEMENTED AND VERIFIED | `scripts/test_modis_metadata.py` passes (run from `scripts/`) |
| Planetary terrain comparison (LOLA 400 m / MOLA 463 m, same baseline) | IMPLEMENTED AND VERIFIED | `src/data/planetaryReference.json` |
| 107-seed discovery engine | IMPLEMENTED AND VERIFIED | `src/discovery/engine.ts`, `src/data/discovery.json` |
| Learned surrogate models (39-site SVR/ExtraTrees) | PRESENTATION ONLY | Displayed as context; zero weight in scoring (by design). 39 samples, not a validated global predictor |
| "Free LLM agent" (Pollinations) | PRESENTATION ONLY (legacy) | Browser-side call in `?full=1` shell only; not part of the product path |
| Backend / API / persistence | NOT IMPLEMENTED |, |
| Tool-using AI agent | NOT IMPLEMENTED |, |
| Evidence search and full-source verification | NOT IMPLEMENTED |, |
| Earth/Moon/Mars mismatch model with epistemic status | NOT IMPLEMENTED | Partial: requirement provenance only |
| Reranking | NOT IMPLEMENTED |, |
| Export of an evidence-linked plan | NOT IMPLEMENTED | JSON exports of discovery screens only |
| Tests for the TypeScript engines | NOT IMPLEMENTED | Only Python pipeline tests existed |
| Secret management | NOT IMPLEMENTED | No `.env` handling; `.env` was not gitignored |

## 2. State after this work

| Capability | Status | Where / how verified |
|---|---|---|
| Node backend (`server/`), REST + SSE, SQLite persistence, run history, cancel, resume, feedback, rate limits, optional bearer auth, structured errors | IMPLEMENTED AND VERIFIED | `server/index.ts`, `server/store.ts`; `server/tests/http.test.ts` (5) |
| Tool-using agent with 18 typed tools, budgets, timeouts, loop detection, deterministic completion | IMPLEMENTED AND VERIFIED | `server/agent/`; `agent.test.ts` (12); three live DeepSeek V4.1 Flash runs completed |
| LLM provider abstraction (OpenCode Go/Zen, OpenAI-compatible) | IMPLEMENTED AND VERIFIED | `server/llm/provider.ts`; live smoke test (tool call) |
| LLM-assisted mission parsing (constrained to the archetype catalogue, verbatim brief fragments) | IMPLEMENTED AND VERIFIED | `parse_mission`; live runs |
| Earth-Location-Nasa integration (Serper search, domain/term filtering, numeric checks, pending-review evidence) | IMPLEMENTED AND VERIFIED | Pinned submodule `455870d`; bridge `validate` + `search`; `adapters.test.ts`; live smoke |
| Full-source retrieval (HTML + PDF, allow-listed hosts and redirects) | IMPLEMENTED AND VERIFIED | `server/evidence/retrieve.ts`; tests + live NASA PDFs |
| Claim verification (verbatim quote, number presence, quantity guard, unit-aware judgement) | IMPLEMENTED AND VERIFIED | `server/evidence/verify.ts`; `verify.test.ts` (9); live: NSSDC gravity → SUPPORTED |
| Contradiction detection | IMPLEMENTED BUT INCOMPLETE | Reference-vs-source and pairwise source contradictions; no multi-source adjudication |
| Reranker integration (WA-on-test2/Reranker) | IMPLEMENTED AND VERIFIED | Pinned submodule `8d706dc`; live Crossref + OpenCode weights; deterministic baseline + Kendall τ |
| Environmental profile schema (31 dimensions, 8 groups, epistemic status, support) | IMPLEMENTED AND VERIFIED | `server/science/profile.ts`; `science.test.ts` (15) |
| Mismatch engine ("where Earth fails") | IMPLEMENTED AND VERIFIED | `server/science/mismatch.ts`; tests |
| Intervention planner (Part 5.2 schema, labels, 3 physical models + protocol generator) | IMPLEMENTED AND VERIFIED | `server/science/interventions.ts`; tests; Intervention Lab UI |
| Candidate filtering with independent rankings | IMPLEMENTED AND VERIFIED | `server/science/candidates.ts`; tests |
| Campaign respecting agent rejections | IMPLEMENTED AND VERIFIED | `optimize_campaign`; test asserts no rejected pair is scheduled |
| Evidence graph + Markdown/JSON export | IMPLEMENTED AND VERIFIED | `server/agent/report.ts`; HTTP test |
| Agent UI (live trace, mission, candidates, where-Earth-fails, evidence, lab, campaign, report) | IMPLEMENTED AND VERIFIED | `src/components/AgentMission.tsx`, `InterventionLab.tsx`; Playwright screenshots |
| Secret handling (`.env`, `.env.example`, secret scan incl. client bundle) | IMPLEMENTED AND VERIFIED | `scripts/secret-scan.mjs` |

## 3. What remains incomplete or blocked

| Item | Status | Detail |
|---|---|---|
| Thermal inertia (Earth/Moon/Mars) | NOT IMPLEMENTED | Diviner/THEMIS products not ingested; always MISSING |
| Spectral mineralogy (EMIT/ASTER) | NOT IMPLEMENTED | Mapped lithology only; mineralogy always MISSING |
| Mars surface dose rate | BLOCKED BY EXTERNAL DEPENDENCY | Hassler et al. 2014 value not verifiable from accessible full text; left MISSING |
| Lunar polar darkness duration | IMPLEMENTED BUT INCOMPLETE | Qualitative only; no horizon-resolved illumination model |
| Earth sites at certification resolution beyond the 39 + 15 enriched | IMPLEMENTED BUT INCOMPLETE | 65 generated regions remain coarse (WorldClim 10′) |
| Facility capability verification | IMPLEMENTED BUT INCOMPLETE | Interventions are capability classes; specific facility performance is UNVERIFIED |
| Cost / power / schedule of interventions | NOT IMPLEMENTED (by design) | No verified data; reported as "not estimated" |
| Paywalled publishers (science.org, Wiley) | BLOCKED BY EXTERNAL DEPENDENCY | HTTP 403 to automated retrieval; evidence stays unverified |
| User accounts / multi-tenant auth | NOT IMPLEMENTED | Single shared bearer token only |
| Human-reviewed reranker gold set | NOT IMPLEMENTED | Reranker is compared against a deterministic baseline only |
| Legacy `?full=1` shell (Pollinations call) | PRESENTATION ONLY | Kept for reference; not on the product path |
