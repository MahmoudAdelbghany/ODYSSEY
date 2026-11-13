# ODYSSEY: Product Completion Report (Milestone 10)

Date: 2026-11-13. This report states what was built and how it was verified. It
does not claim 100 % completion; open items are listed at the end and in
`PRODUCT_COMPLETION_AUDIT.md`.

## What changed

ODYSSEY went from a frontend-only prototype to a working product with a backend,
a tool-using AI agent and two integrated external components:

* **Backend** (`server/`): Node + TypeScript (tsx), REST + SSE API, SQLite
  persistence (runs, append-only events, source cache, feedback), cancel/resume,
  rate limits, optional bearer auth, structured errors, single-process production
  serving of the built frontend.
* **Agent**: 18 typed tools, OpenCode Go provider (DeepSeek V4.1 Flash,
  `reasoning_effort: none`), budgets, timeouts, duplicate-call guard, budget reserve,
  deterministic completion, typed state with a decision log, checkpoints after every
  tool call.
* **Earth-Location-Nasa** (submodule `455870d`): Serper search with its domain,
  lookalike, mission-term and planet-term filters, numeric constraint checks and
  pending-review evidence model, called through a Python bridge without modifying
  the repository.
* **Full-source verification** (the capability Earth-Location-Nasa lists as not
  implemented): allow-listed HTML/PDF retrieval, LLM-proposed claims kept only when
  quoted verbatim with their numbers and the right quantity, unit-aware judgement,
  per-quantity results per source, contradiction records.
* **WA-on-test2/Reranker** (submodule `8d706dc`, Apache-2.0): candidate reranking
  with Crossref literature and OpenCode-proposed weights via the repository's
  `propose` hook, polite Crossref access (cache + 429 backoff), deterministic
  baseline and Kendall τ for every rerank.
* **Science layer** (`server/science/`): 31-dimension environmental profiles with
  epistemic status and support; verified Moon/Mars references; mismatch engine;
  candidate filtering with independent rankings; intervention planner with
  labelled first-order models.
* **Frontend**: stage **01 AGENT** in the orbital experience (live trace, mission,
  candidates, where Earth fails, evidence, Intervention Lab, campaign, report and
  feedback); globe highlights follow agent decisions; dive into real terrain from
  the panel; mobile sheet layout.
* **Engine change**: `decomposeMission` accepts validated archetype selections
  (backward compatible) so LLM parsing reuses the same requirement recipes.

## Verification

| Check | Result |
|---|---|
| `npm test` (science 15, verifier 9, agent 13, HTTP 5, adapters 3; live smoke skipped) | **45 pass, 0 fail, 3 skipped** |
| `npm run test:smoke` (OpenCode tool call, Serper via E-L-N, NSSDC gravity verification) | **3 / 3 pass** |
| Earth-Location-Nasa own suite | 54 / 54 pass |
| Reranker own suite | 5 / 5 pass |
| Pre-existing pipeline tests | global discovery 22/22 (with geo deps), enrichment 13/13, MODIS metadata OK |
| Frontend + server typecheck, `vite build` | pass |
| `npm run secrets:scan` (sources + built bundle + local `.env` values) | pass |
| Live end-to-end runs with DeepSeek V4.1 Flash | 4 completed from UI/API (42–48 tool calls, 18–24 LLM turns, 12 searches each) |

## Demonstration (PART 15)

Brief: *"Plan a seven-day simulated lunar surface expedition that includes
geological sampling, rover navigation, equipment deployment, thermal survival and
dust mitigation."* Final run `95db2401…` (`../demo/agent-run/`):

* **Parsed and decomposed** by the LLM into 5 experiments (each tied to a verbatim
  brief fragment), with 2–3 hard requirements each.
* **Strong natural analogs for different experiments**: geological sampling, 39
  viable sites (Kawah Ijen, Mojave lead); dust, 26 viable aeolian sites
  (Mojave, Wadi Rum…) ranked independently of terrain.
* **Rejected / downgraded**: Mojave rejected for rover navigation (P95 slope 34.9°
  > 12° limit); Kawah Ijen rejected for equipment deployment (mean slope 15.7° > 8°);
  every rover candidate downgraded because Earth sites are ~30° flatter than the
  12.8 km LOLA south-polar window.
* **Where Earth fails**: gravity (6.06×), pressure (~3×10¹⁴×) and the lunar surface
  envelope (0 % covered by any MODIS-sampled site) are Earth-wide gaps.
* **Controlled interventions**: thermal-vacuum cycling (radiative equilibrium
  399 K hot / 77 K shroud-limited cold, with the 50 K target low flagged as not
  reproduced), ideal pump-down (labelled; lunar pressure explicitly outside model
  validity), gravity offload (SIMULATED; soil bias stated).
* **Unresolved**: thermal inertia, mineralogy, regolith grain size, bearing
  strength, lunar polar darkness duration, reported, never imputed.
* **Evidence**: 30 sources (27 pending review, 1 retrieval failed, 1 unresolved, 1 contradicted); NASA *Lunar Surface Data Book*
  (M2M-30044) retrieved and its verbatim extremes ("18 K … in permanently shadowed
  regions to 394 K … at noon at the equator") **contradict** the repository's
  50–250 K reference envelope, recorded as a contradiction for review (the 394 K
  value is equatorial, a different support).
* **Campaign**: science-first Atacama → Salar de Uyuni → Bodélé (25.7 travel h);
  logistics-first Atacama only; intervention-light Qaidam → Bodélé → Danakil. No
  rejected (experiment, site) pair is scheduled.
* **Export**: Markdown mission plan, JSON report with a 188-node evidence graph,
  full event log.

Recommendations are computed at run time; no site is hard-coded.

## Defects found and fixed during live testing

1. Changing nothing in `analyze_temporal_window` still invalidated all rankings → only real configuration changes invalidate now.
2. Lone UTF-16 surrogates from PDF text broke upstream JSON (HTTP 400) → text sanitised.
3. Budget-refused calls were not recorded → deterministic completion looped; required steps now retry (bounded) and optional steps are skipped once the budget is spent.
4. Reasoning tokens exhausted output limits → reasoning disabled (`reasoning_effort: none`, verified 0 reasoning tokens).
5. With reasoning off the model mislabelled a temperature *difference* as a temperature → deterministic quantity-qualifier guard.
6. Overlap was treated as support for envelopes; a single point inside an envelope was treated as support → bounds must match; points are `consistent`, never `supported`.
7. Several verifications of one source overwrote each other → per-quantity verification list with aggregated status.
8. Crossref 429s forced reranks back to baseline → cache + backoff; literature failure now yields LLM weights marked "unsourced assumption".

## Known limitations and next steps

* Ingest Diviner polar products (PCP/PRP, thermal inertia) and THEMIS; revisit the
  50–250 K lunar envelope in light of the verified 18 K PSR value.
* Add EMIT/ASTER mineralogy and enrich more generated regions to Site Orbit level.
* Facility capability evidence (chamber base pressures, offload rigs) remains
  unverified; a curated facility table with sources would raise intervention
  feasibility from "capability class" to "verified facility".
* A human-reviewed gold set for the reranker.
* Per-user accounts for multi-tenant deployment.
* Rotate the OpenCode and Serper keys used during development (see `SECURITY.md`).
* Space Apps: make the Reranker repository public (or vendor it under Apache-2.0
  with NOTICE), obtain a licence for Earth-Location-Nasa, check the China-funding
  review with your Local Lead given the DeepSeek default model, and record a ≤30 s
  demo or ≤7 slides before **Nov 15, 23:59 local**.

## UI and UX overhaul (2026-11-14)

The interface was rebuilt around one workspace instead of several competing panels and navigation systems.

* **One structure**: a start screen with a single mission brief field and one main action, then a workspace with eight sections in workflow order (Brief, Mission, Candidates, Site, Where Earth fails, Interventions, Campaign, Report). The globe sits beside the panel and follows the section. The agent's raw tool trace moved to a secondary Activity drawer.
* **One design system** (`src/ui.css`): colour, type, spacing and radius tokens; one primary, secondary, ghost and danger button; real text inputs, textareas and dropdowns with focus rings; tabs and segmented controls with clear active states; badges for decisions, comparison results, evidence and epistemic status; disclosures for secondary detail; empty, error and loading states.
* **Readability**: body text 15 to 17 px, metadata at least 12.5 px, headings 28 to 36 px, secondary text contrast raised (text-2 #b4bdc7 and text-3 #8a95a1 on #080b0f). Fonts in the Discovery Engine and 3D terrain view were as small as 5.8 px; every size under 12 px was raised, wide letter-spacing and forced uppercase were removed, and monospace is used only for numbers, coordinates and identifiers.
* **Copy**: no em dashes in user-facing text (frontend, server messages and exported report), no numbered eyebrow labels, ALL CAPS labels rewritten in sentence case with acronyms preserved, technical dimension names replaced by plain labels with the method in a tooltip, the model's narrative limited to three sentences and six findings.
* **Removed duplication**: the old stage components (mission tree, site matrix, temporal, interventions and campaign stages, stage rail) are deleted. The 3D terrain view no longer shows a separate in-browser score that could contradict the agent.
* **Fixes found while testing**: a crash when opening Activity (an effect returned the Promise from `scrollIntoView`), legacy `.btn` styles leaking into the new buttons, a top bar layout bug on mobile, low text contrast over bright clouds on the start screen.
* **Design skill**: `Leonxlnx/taste-skill` was installed (`.agents/skills/design-taste-frontend`). Its guidance on copy tells, one button system and type scale was applied. Its website-specific rules (one section per screen, stock photographs, hero animations, shader effects) do not fit an analysis app and were not followed; its scripts and Stop hook were not run.

Verified: frontend and server typecheck, production build, 45 backend tests passing, secret scan of sources and bundle, screenshots at 1440×900 and 390×844 (`docs/ux-*.png`).

### Follow-up polish (2026-11-14)

* Globe: the cursor shows a hand (grab) over the globe, a closed hand while dragging, and a pointer over clickable site markers. A "Drag to rotate · Scroll to zoom" hint appears until the first interaction and is not shown again in that browser.
* Mission brief: the box is focused on load with the caret at the end of the text, in the accent colour.
* Global discovery and generated regions: same top bar, brand, buttons, tabs, cards, list selection and amber accent as the workspace (`src/discovery-theme.css`); header copy rewritten in plain language; the remaining capitalised labels converted to sentence case.
* About the project: a new About page in the current design (what ODYSSEY does, how it works, data, rules, limits). It replaces the link to the old briefing page.

### Evidence coverage repair (2026-11-14)

See `../science/MILESTONE_EVIDENCE_REPAIR_REPORT.md`, `../science/EVIDENCE_COVERAGE_AUDIT.md`, `../science/REQUIREMENT_EVIDENCE_REGISTRY.md` and `../science/DATASET_EXPANSION_REPORT.md`.

* A requirement-to-evidence registry (`src/mission/evidence.ts`) and a 17-state evidence model replace "No open data". Every gap is integration needed, field measurement required, physical mismatch, not applicable or not yet investigated.
* ESA WorldCover 2021 (10 m) bare-ground upper bound for rock exposure at 204 of 226 locations; five verified planetary references (lunar thermal inertia, darkness duration, lithology and grain size; Jezero thermal inertia).
* Four requirement definitions corrected; threshold provenance on every requirement; hand-assigned access and dust indices labelled as unvalidated estimates.
* Agent tool `investigate_evidence_gap`, API `POST /api/runs/:id/investigate`, and an "Evidence gaps" report section. 71 tests pass.
