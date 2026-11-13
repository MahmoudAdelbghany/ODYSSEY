# ODYSSEY: NASA Space Apps 2026 Challenge Mapping

Challenge: **Identify Earth Locations that Analog the Permanent Moon Base
Locations and Mars**, https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/
(read 2026-11-13). Judging: Impact, Creativity, Validity, Relevance, Presentation,
each scored 1–5 with equal weight (Judging & Awards Guide, read 2026-11-13).

## Objectives → what ODYSSEY demonstrates

| Challenge text | ODYSSEY capability | Where to see it |
|---|---|---|
| "use open Earth, Moon, and Mars data from NASA and other space agencies" | NASA POWER, MODIS MYD11A1, LRO LOLA, MGS MOLA, LRO Diviner (published range and Hayne et al. thermal inertia), Mars 2020 MEDA, NASA NSSDC fact sheets, Copernicus DEM + Sentinel-2 + WorldCover (ESA), RADARSAT-1 (CSA) | `../science/DATA_PROVENANCE.md` |
| "identify and characterize new terrestrial analogs" | 39 curated controls + 80 generated regions from an H3 global screen not seeded by known sites (70 new); 15 enriched with GLO-30, Sentinel-2, MODIS, Macrostrat | Discovery Engine; `discover_global_regions` |
| "explain what makes them analogous **and what does not**" | Mismatch engine: per-experiment, per-condition classification (analog / partial / mismatch / not naturally reproducible / not comparable / no data) with handling | Agent → *Where Earth fails*; report "Where Earth does not match" |
| "Your analog does not need to match … in every way. Explain … where the analogy breaks down" | Independent rankings per dimension; Earth-wide gaps; rejected/downgraded candidates with reasons | Agent → *Candidates* |
| "Think beyond visual similarity" | Quantity/support-aware comparisons; same-baseline DEM terrain; MODIS surface vs reanalysis air temperature kept separate | `../science/SCIENTIFIC_METHODOLOGY.md` |
| "Consider scale" | 20.48 × 12.8 km Site Orbit windows at 40 m; 12.8 km same-baseline windows vs LOLA/MOLA; ~1,770 km² H3 cells for screening | Site Orbit; methodology |
| "Look beyond well-known analog sites" | H3 generated discovery with novelty classes (new / adjacent / overlap) | Discovery Engine |
| "Connect your analog to exploration … test instruments … prepare operations" | Mission brief → experiments → requirements → candidates → interventions → multi-site campaign | Agent stages, exported mission plan |
| "Remember Earth's limits as an analog: reduced gravity, lunar vacuum, thin Martian atmosphere, radiation" | Planet-wide conditions classified *not naturally reproducible*; intervention planner with labelled models (gravity offload, thermal-vacuum, CO₂ chamber, irradiation as concept) | Agent → *Intervention lab* |
| "similarity metrics, machine learning approaches" | Weighted requirement satisfaction; weak-link distance (discovery); literature-weighted Reranker; learned surrogate shown as context only | Candidates / Discovery |

## Judging criteria → evidence

| Criterion | What judges can verify |
|---|---|
| **Impact** | Turns a mission brief into an evidence-linked, exportable field campaign and says explicitly which conditions need facilities instead of fieldwork, the planning step analog campaigns need before committing travel and equipment. |
| **Creativity** | Planning around *where Earth fails*, not only where it matches; combines global discovery, mission decomposition, mismatch analysis, intervention design and campaign optimisation in one agent; the planet is the interface. |
| **Validity** | Every number traces to a dataset or verified publication; MISSING is never imputed; air/surface temperature and thermal inertia are never conflated; verified claims require verbatim quotes; every evidence gap is classified as integration needed, field measurement required or physical mismatch (`../science/EVIDENCE_COVERAGE_AUDIT.md`); 71 automated tests + 59 external-repo tests + live smoke tests. Limitations are documented (`../history/PRODUCT_COMPLETION_AUDIT.md`, `../science/MILESTONE_EVIDENCE_REPAIR_REPORT.md`). |
| **Relevance** | Directly addresses permanent Moon-base (lunar south pole) and Mars (Jezero) analogs; NASA data is the core (POWER, MODIS, LOLA, MOLA, Diviner, MEDA, NSSDC). |
| **Presentation** | Cinematic orbital interface, live agent trace, Intervention Lab, demo mission output and screenshots (`docs/agent-*.png`, `../demo/agent-run/`). |

## Required demonstration scenario (PART 15)

Brief: *"Plan a seven-day simulated lunar surface expedition that includes
geological sampling, rover navigation, equipment deployment, thermal survival and
dust mitigation."* Output from a live run is in `../demo/agent-run/`. Recommendations
are produced at run time from data; no site is preprogrammed.

| Required element | Demonstrated by (final run) |
|---|---|
| Strong natural terrain analog | See `../demo/agent-run/lunar-expedition-report.md` → rover navigation / equipment deployment candidates and rankings |
| Strong environmental analog for a different experiment | Dust experiment: viable aeolian sites (Bodélé, Mojave, Socotra…) ranked independently of terrain |
| Rejected or downgraded location | Hard-constraint rejections with reasons (e.g. slope limit violations) and downgrades on critical mismatches |
| Controlled intervention for a non-reproducible condition | Thermal-vacuum cycling (vacuum + 50–250 K envelope), gravity offload |
| Unresolved requirement due to missing data | Each gap names its cause and next step: bearing strength, SI thermal inertia, grain size and rock exposure need field measurement (ASTM D6951, D5334, D6913); dust deposition and mineralogy need datasets that exist but are not integrated (MERRA-2, EMIT); see `../demo/agent-run/` → Evidence gaps |

## Submission checklist (from the official Project Submission Guide)

* Submit before **Sunday, November 15, 2026, 11:59 p.m.** local time of the team's Local Event.
* Demo: ≤ 30 s video (English subtitles if spoken in another language) **or** ≤ 7 slides. Exceeding either limit makes the project ineligible for Global Judging.
* At least one NASA data resource must be used (satisfied: see above).
* List **all** external resources in the References field: data (../science/DATA_PROVENANCE.md), code (Earth-Location-Nasa, WA-on-test2/Reranker, React, Three.js, react-globe.gl, Vite, tsx), APIs (Serper, Crossref, OpenCode).
* Disclose Super-Intelligence (AI) use: the in-product agent uses an LLM via OpenCode; development used AI coding assistants. SI-generated images/video need a visible watermark.
* No NASA logos or branding in generated content.
* **NASA China-funding restriction review applies to Global Judging.** The default agent model (DeepSeek V4.1 Flash) is developed by a Chinese company, and one radiation reference comes from the Chang'E-4 mission literature. Confirm with your Local Lead whether this matters; switching models is one setting (`OPENCODE_MODEL`, e.g. `gpt-6-luna` or `claude-haiku-5-5` on OpenCode Go).
* The Reranker repository is **private**: judges cannot access it unless it is made public (it is Apache-2.0). Earth-Location-Nasa has **no licence file**; obtain the author's permission before redistribution.
