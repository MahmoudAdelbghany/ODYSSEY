# ODYSSEY: Planetary Analog Mission Planner

Working prototype for the **2026 NASA Space Apps Challenge** challenge:
*Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars.*

Odyssey does not search for one "Mars-like place." It decomposes an arbitrary mission
brief into independent experiments, translates each experiment into measurable
requirements with explicit evidence provenance, and evaluates all **39 candidate
regions** against every experiment. A separate global screen generates new candidate
regions from spatial data without being seeded by those 39 or the 107 manual seeds.
A site can be strong for one experiment and weak for another. Missing evidence is
shown, never imputed. Learned-model scores remain context, not proof.

## Run it

```bash
git clone --recurse-submodules <repo>   # or: git submodule update --init
npm install
cp .env.example .env                    # add OPENCODE_API_KEY and SERPER_API_KEY (server-side only)
npm run server                          # backend + agent on http://127.0.0.1:8787
npm run dev                             # frontend on http://localhost:5173 (proxies /api)
```

Production (single process serving `dist/` and `/api`):

```bash
npm run build && npm start
```

Requirements: Node ≥ 22.5 (built-in `node:sqlite`), Python ≥ 3.10 (stdlib only,
for the external-repo bridge), `pdftotext` (poppler-utils) for PDF sources. The
frontend's stages 02–05 still run fully offline; the mission agent needs the backend.

Tests:

```bash
npm test                 # 44 backend tests (science, verifier, agent, HTTP, adapters)
npm run test:smoke       # live OpenCode + Serper + NASA source verification (spends API budget)
npm run test:external    # the two external repositories' own suites (54 + 5)
npm run secrets:scan     # credential scan of sources and the built bundle
```

## Using ODYSSEY

The start screen has one field, the mission brief, and one main action, **Analyze mission**. It starts the server-side agent and opens the workspace:

| Section | What it answers |
|---|---|
| 1 Brief | The brief, analysis options, previous analyses |
| 2 Mission | Which experiments the brief contains and what each one requires |
| 3 Candidates | Which sites pass the hard limits for each experiment, best first, and which were rejected and why |
| 4 Site | Everything about one site: suitability per experiment, measured values beside the Moon or Mars values, what is not measured, and the 3D terrain |
| 5 Where Earth fails | Conditions no site on Earth reproduces, conditions that cannot be evaluated yet, and how the top sites compare |
| 6 Interventions | Controlled tests for those conditions, with adjustable first-order models |
| 7 Campaign | Three campaign plans (best science, least travel, fewest facilities) |
| 8 Report | Summary, open questions, sources with verification status, downloads, corrections |

The globe sits beside the panel and follows the section. The agent's step-by-step log is in **Activity** (top right). A run can be reopened with `?run=<id>`.

The mission agent (OpenCode, DeepSeek V4.1 Flash with reasoning disabled) works through 18 typed tools: it parses the brief, decomposes experiments, searches and verifies evidence (Earth-Location-Nasa plus full-source verification), filters and ranks every candidate, finds where Earth fails to match the Moon or Mars, reranks with the WA-on-test2 Reranker, proposes and models controlled interventions, optimises a multi-site campaign and exports an evidence-linked plan.

| Document | Content |
|---|---|
| [`PRODUCT_COMPLETION_AUDIT.md`](PRODUCT_COMPLETION_AUDIT.md) | What works, what is partial, what is missing |
| [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) | System, interfaces, API, deployment |
| [`../architecture/AGENT_ARCHITECTURE.md`](../architecture/AGENT_ARCHITECTURE.md) | Provider, loop, budgets, 18 tools |
| [`../science/SCIENTIFIC_METHODOLOGY.md`](../science/SCIENTIFIC_METHODOLOGY.md) | Profiles, comparison rules, mismatch, filtering, verification |
| [`../science/INTERVENTION_METHODOLOGY.md`](../science/INTERVENTION_METHODOLOGY.md) | Labels, models, validity limits |
| [`../science/DATA_PROVENANCE.md`](../science/DATA_PROVENANCE.md) | Every dataset, reference and component with licence |
| [`SECURITY.md`](SECURITY.md) | Secrets, network boundaries, API protections |
| [`../submission/NASA_CHALLENGE_MAPPING.md`](../submission/NASA_CHALLENGE_MAPPING.md) | Challenge objectives, judging criteria, submission checklist |
| [`PRODUCT_COMPLETION_REPORT.md`](PRODUCT_COMPLETION_REPORT.md) | What was built and verified |

Demo mission output: `../demo/agent-run/` (Markdown plan, JSON report with evidence
graph, full event log). Screenshots: `docs/ux-*.png`.

## Globe and 3D terrain

The globe uses NASA Blue Marble imagery with a tiled level-of-detail pyramid (4K to 16K), VIIRS night lights and a cloud layer. In the workspace it highlights the candidates of the current experiment, flies to the selected site, and draws campaign routes in the Campaign section. **View 3D terrain** in the Site section opens the site at real scale: Copernicus DEM GLO-30 terrain at 40 m with native 10 m Sentinel-2 imagery, switchable scientific layers (imagery, elevation, slope, thermal, geology, surface and access) and a comparison with the LOLA or MOLA terrain of the target.

## Discovery Engine

The 39 regions are curated controls, not the search universe. **Open Discovery Engine** from the opening screen (or the top bar) to search beyond them.

**Full engine documentation:** [`../science/ANALOG_DISCOVERY_ENGINE.md`](../science/ANALOG_DISCOVERY_ENGINE.md), architecture, data sources, scoring math, SAR pipeline, schema, limitations and extension roadmap.

- **107 real candidate AOIs** spanning impact structures, arid and salt systems, polar deserts, volcanic fields, caves, mines and high-altitude basins. The pipeline rejects any seed within 80 km of a curated control.
- **Two reference profiles:** Moon south pole base and Mars/Jezero. Each is a distribution of feature targets, not a single vector.
- **Real evidence per candidate:** NASA POWER / MERRA-2 monthly climatology 2001–2020, Copernicus DEM GLO-90 terrain (elevation, relief, slope p95, roughness), Macrostrat mapped geology and OurAirports access distance.
- **Per-dimension scoring:** thermal, terrain, aridity, dust/wind, surface materials, polar illumination, ice/permafrost proxy, low-pressure proxy and field access. A composite score never hides the weakest dimension.
- **Two composites:** a compensatory weighted mean, and a weak-link weighted distance (diagonal Mahalanobis-style loss) that penalizes a fatal mismatch. A deterministic sensitivity band reports the evidence tolerance; the tolerances are expert-assigned (0.05–0.15 score units), not statistically estimated. Rank by either, and filter to N2 or SAR-evidenced candidates.
- **RADARSAT-1 historical SAR:** six Canadian/polar candidates carry a real RADARSAT-1 scene, browse thumbnail and L1 frame texture. It is explicitly labeled segment/frame context, not a local AOI measurement; the AWS COGs are not geocoded.
- **Core-dimension coverage and uncertainty:** missing dimensions are masked, not imputed. Every candidate states what it does not have, including the refinement layers that would be needed before certification.
- **Right time:** a 12-month climatological window is scored for each candidate and reference. It is a planning window, not a forecast.
- **Novelty:** nearest-control distance plus an N0/N1/N2 screening grade. This is a review queue, not a claim of literature novelty.
- **Promote / export:** add a candidate to a field-review shortlist, or export the full filtered screen. Both exports are JSON dossiers for later ODYSSEY ingestion.

The method is three tiers: **global screen → regional refine → local certify**. Global layers rank and exclude; local measurements certify. Mineralogy species (EMIT/ASTER), vegetation (Sentinel-2/Landsat), water/ice (ICESat-2/SAR), subsurface and geotechnical properties remain explicit missing evidence until refined.

Code: `src/components/DiscoveryMode.tsx`, `src/discovery/engine.ts`, `src/discovery/types.ts`, `src/discovery.css`; pipeline: `scripts/discover_candidates.py`; data: `src/data/discovery.json`.

Frames: `img/discovery-moon-final.png`, `img/discovery-mars-final.png`, `img/discovery-method-final.png`, `img/discovery-mobile-final.png`, `img/discovery-scores-final.png`, `img/discovery-sar.png`. Demo script: `DISCOVERY_DEMO.md`.

## Global candidate discovery (Milestone 08)

The 107-seed layer is still manually supplied. Milestone 08 adds a **separate, reproducible H3 screen** that generates candidate cells from global spatial data. It does not read the 39 curated coordinates or 107 manual seeds until after cells have been sampled, scored and clustered; catalogue distances are then used only for novelty classification and preservation. See [`MILESTONE_08_REPORT.md`](MILESTONE_08_REPORT.md).

- **Spatial universe:** 288,122 H3 resolution-4 cells (~1,770 km² each) covering the globe. Natural Earth 1:110m land leaves 81,779 land cells; 81,575 have usable WorldClim climate/elevation. Polar, island and remote land is not excluded.
- **Coarse evidence:** WorldClim 2.1 10 arc-minute `bio1` (mean annual temperature), `bio5`/`bio6` (warmest/coldest month), `bio12` (annual precipitation), `bio15` (precipitation seasonality) and elevation, 1970–2000. Local relief and mean slope come from a 5×5 elevation window (~92 km); access is straight-line distance to the nearest scheduled large/medium airport from OurAirports.
- **Screening:** independent transparent rule sets for lunar base, lunar expedition and Mars landing. Missing dimensions are excluded from the weighted mean and reduce coverage; they are never imputed or treated as negative evidence. The 39-site ML surrogate is not used.
- **Regions, not pixels:** seed-and-grow from high-scoring unassigned cells, up to two H3 rings, at most 19 cells per region, score coherence within 15 points of the seed. Region centres closer than 80 km are deduplicated. The current run yields 4,792 clusters and 80 output regions after category-balanced selection.
- **Novelty:** measured against all 146 existing catalogue coordinates. Under 10 km is a catalogue overlap; under 80 km is catalogue-adjacent; otherwise new. After deduplication the run detects 15 overlaps and 234 adjacent regions. The 80-region display contains **70 new**, 9 catalogue-adjacent and 1 overlap; all 249 known/nearby regions remain in the `knownRegions` audit list with an explicit class. Known locations are not silently discarded.
- **UI:** **Discovery Engine → GENERATED / 80**. Amber diamond markers distinguish generated regions from the cyan curated layer. Selecting a region draws its union footprint and individual H3 cell outlines, and opens a dossier with the discovery rationale, strongest rule dimensions, per-profile scores, measured ranges, provenance and missing evidence. DIVE is deliberately unavailable because no generated region has high-resolution DEM or Site Orbit imagery yet.
- **Reproduce:**
  ```bash
  python3 scripts/fetch_global_discovery_data.py
  python3 scripts/global_discovery.py
  python3 -m unittest scripts/test_global_discovery.py -v
  ```
  Requires `h3`, `shapely`, `rasterio`, `numpy` and `scipy`. The cell-feature cache is written under the data directory and re-used on later runs; pass `--refresh` to resample.
- **Data and code:** `src/data/globalDiscovery.json`, `scripts/global_discovery.py`, `scripts/fetch_global_discovery_data.py`, `scripts/test_global_discovery.py`, `src/components/GeneratedDiscovery.tsx`, `src/generatedDiscovery.css`.

Screenshots: `img/generated-discovery.png`, `img/generated-discovery-method.png`, `img/generated-discovery-missing-evidence.png`, `img/generated-discovery-narrow.png`.

**What this screen is not:** it is a coarse, rule-based nomination layer. The 10 arc-minute covariates cannot resolve caves, lava tubes, moraines, mineralogy, regolith, dust or local hazards. No generated region has Sentinel-2 Site Orbit imagery, Copernicus GLO-30 terrain, humidity, wind, solar irradiance, aerosol/dust, mapped geology or field validation. Earth does not reproduce lunar gravity/vacuum or the Martian atmosphere, and the existing ML surrogate is not globally validated.

## Generated-region enrichment (Milestone 09)

A stratified subset of **15 of the 80** generated regions now carries detailed evidence. The original 80 records are unchanged. See [`MILESTONE_09_REPORT.md`](MILESTONE_09_REPORT.md).

- **Selection:** deterministic quotas by category, strongest score, strongest lunar-expedition score and geographic outlier, with existing/nearby preservation. Result: 4 polar, 3 high-relief, 3 hyper-arid, 2 moderate-relief, 2 remote, 1 other; 5 lunar-base and 10 Mars-best; 12 new, 2 adjacent, 1 overlap; 4 expedition-competitive.
- **Detailed terrain:** 15 Copernicus DEM GLO-30 heightmaps, 512 × 320 at 40 m over 20.48 × 12.8 km, 0% voids. Relief 123–2,416 m, mean slope 0.92–26.50°, roughness 0.62–10.72 m.
- **Imagery:** 15/15 usable Sentinel-2 L2A true-color windows, 10 m native, 2048 × 1280, dates 2024-12-18 to 2026-11-13, cloud 0.08–11.63%. Exact scene IDs and DEM tiles are recorded per region.
- **Climate:** 15/15 NASA POWER monthly climatology 2001–2020; 12/15 complete, with three Antarctic root-zone soil-wetness series missing.
- **Geology:** 15/15 Macrostrat mapped units at the representative point; point query, not a continuous surface.
- **Thermal:** 14/15 MODIS/MYD11A1 v061 day/night samples; one South American region is `NO DATA`.
- **Planetary comparison:** same-baseline 12.8 km Earth 400 m/463 m metrics against LOLA 400 m and MOLA 463 m. Median Mars relief ratio 1.07×; median Moon relief ratio 0.07×. Dimension-specific, not an overall score.
- **Coarse versus detailed:** best profile is stable in 15/15; scores are not. 13/15 drop, mean delta -5.54 points, Spearman rank correlation 0.479, coarse saturation 8/15 at >=95 versus 1/15 detailed. The 15 are not a global validation set.
- **Site Orbit:** `OPEN SITE ORBIT` is enabled only for enriched regions with real imagery and terrain. The generated Site Orbit uses real assets, marks ML as `NOT USED`, shows `NO WINDOW`/`NOT IN CAMPAIGN`, and enables the PLANETARY panel with generated terrain and MODIS data.
- **Footprint dedup:** 80 km centre dedup is not footprint dedup. The audit finds 0 shared H3 cells, 0 positive overlaps, 50 touching footprint pairs and 17 proposed landscape groups covering 47 regions. Versioned groups are stored in `src/data/generatedRegionGroupsV2.json`; the original 80 are untouched.
- **Licensing:** Sentinel-2 Copernicus terms, Copernicus DEM © DLR/ESA, NASA POWER/MODIS open with attribution, Macrostrat CC-BY 4.0, Natural Earth/OurAirports public domain. **WorldClim 2.1 is academic/non-commercial; redistribution or commercial use of the coarse derived fields requires permission.**

Reproduce:

```bash
python3 scripts/select_generated_enrichment.py
python3 scripts/enrich_generated_regions.py
python3 scripts/fetch_generated_modis.py
python3 scripts/derive_generated_planetary_reference.py
python3 scripts/audit_generated_deduplication.py
python3 -m unittest scripts/test_global_discovery.py scripts/test_generated_enrichment.py -v
```

Screenshots: `img/generated-enriched.png`, `img/generated-enriched-terrain.png`, `img/generated-enriched-climate.png`, `img/generated-enriched-planetary.png`, `img/generated-enriched-open.png`, `img/generated-site-orbit.png`.

The previous mission-control shell remains available at `?full=1` for reference. Its ground-level terrain walk is a labeled surrogate, not the direction of the new site experience.

Code: `src/OrbitalExperience.tsx`, `src/components/OrbitalPlanet.tsx`, `src/components/SiteOrbit.tsx`, `src/components/MissionTree.tsx`, `src/components/ExperimentMatrix.tsx`, `src/components/TemporalStage.tsx`, `src/components/TemporalRing.tsx`, `src/components/InterventionsStage.tsx`, `src/components/ConditionShell.tsx`, `src/components/CampaignStage.tsx`, `src/components/CampaignRibbon.tsx`, `src/mission/`, `src/temporal/`, `src/interventions/`, `src/campaign/`, `src/orbital.css`; data-generation scripts in `scripts/`; design thesis in `ART_DIRECTION.md`.

## What is real

| Source | Used for |
|---|---|
| **NASA POWER** climatology 2001–2020 | Annual values plus 12 monthly normals for temperature, precipitation, humidity, wind, solar, **AOD_55**, **soil wetness** and surface pressure |
| **Macrostrat** (CC-BY 4.0) | Mapped geologic unit, lithology and age for each site |
| **Open-Meteo** elevation API | Site elevation + local relief from five samples |
| **NASA GIBS / MODIS Terra** | True-color satellite frame for every site |
| **NASA PDS / LRO / MRO literature** | Moon and Mars reference conditions |
| **NASA Blue Marble 2002** (public domain) | Cloud-free global surface mosaic; 4K/8K/16K tiled LOD |
| **NASA Black Marble / VIIRS City Lights 2012** via GIBS (public domain) | Night-side city lights |
| **NASA cloud composite** via Solar System Scope (CC BY 4.0) | Cloud density, opacity variation and cloud shadows |
| **Sentinel-2 L2A** (ESA Copernicus, via AWS Open Data / Earth Search) | Native 10 m site-orbit imagery, current scenes, no resampling |
| **Copernicus DEM GLO-30** (ESA/DLR, via AWS Open Data) | Real site terrain geometry, 30 m source sampled to 40 m heightmaps |
| **Solar System Scope** (CC BY 4.0) | 4K normal map and 2K ocean specular mask |
| **Pollinations** | Free LLM endpoint for the mission-architect agent (no key) |
| **OpenFlights / great-circle** | Airport hubs, distances, flight + ground travel estimates |

### Earth rendering pipeline

The previous “8K” day texture was a smoothed 2K upscale: a bicubic 2K
reconstruction reaches 32.9 dB PSNR against the 8192 file, and the old 8K file
has roughly a quarter of the high-frequency energy of the true source
(Laplacian variance 140.8 versus 611.4). It looked soft because it was soft,
not because the shader needed more sharpen. The same 1440 × 900 comparison is
in `img/earth-comparison.png`.

The orbital Earth now uses a real NASA Blue Marble 2002 master (43,200 ×
21,600) and a tiled level-of-detail pyramid:

- A 4 × 2 spherical patch grid with 4K (L0), 8K (L1) and 16K (L2) global
  levels. The maximum shipped level is 16,384 × 8,192 (≈2.4 km/pixel); the full
  43,200 source is not sent to the browser.
- Only visible patches load. A 4K placeholder appears immediately; 8K tiles
  preload for facing patches, and 4K² 16K tiles load only inside the close
  orbit. The far side never downloads its high-resolution tiles.
- Surface tiles carry 4/8/16-pixel gutters cut from the same mosaic, so
  mipmapped filtering does not produce seams at longitude/latitude boundaries.
- Night lights come from the real VIIRS City Lights 2012 mosaic at 8K desktop
  and 4K mobile. Clouds come from an 8K/4K density field, uploaded as an R8
  texture (33.5 MB at 8K instead of 134 MB RGBA) and sampled with variable
  opacity and a projected cloud shadow.
- Albedo and night maps are sRGB; normal, specular and cloud density are linear.
  Mipmaps are enabled and anisotropy is capped at 8. The 8K auxiliary maps are
  only used when the GPU reports an 8192 texture limit.

Full source links, licenses and processing notes: `public/tex/earth/CREDITS.md`.
Site orbit imagery is documented in `public/sites/close/CREDITS.md`; terrain
provenance is in `public/sites/terrain/CREDITS.md`. Scene IDs, dates, DEM bounds
and void fractions are recorded in `src/data/siteImagery.json` and
`src/data/siteTerrain.json`. Site-orbit frames:
`img/site-orbit-craters.png`, `img/site-orbit-elevation.png`,
`img/site-orbit-slope.png`, `img/site-orbit-surface.png`.

Mission decomposition frames: `img/mission-decomposition.png`,
`img/mission-requirement.png`, `img/mission-site-orbit.png`,
`img/mission-mobile.png`, `img/mission-mobile-requirement.png`.

Final operations and readability frames: `img/temporal-intelligence.png`,
`img/environmental-interventions.png`, `img/campaign-synthesis.png`,
`img/readability-lens.png`, `img/readability-requirement.png`,
`img/readability-1280.png`,
`img/readability-1024.png`, `img/readability-mobile.png`,
`img/mobile-temporal.png`, `img/mobile-site-orbit.png`.

Each site orbit loads only the selected site: a **2048 × 1280 native 10 m**
Sentinel-2 crop and a **512 × 320, 40 m** Copernicus DEM heightmap covering the
same UTM window. The 3D mesh uses true vertical scale (no exaggeration); the
camera's minimum altitude is set so the 10 m imagery is not upsampled. The
global Earth uses its own tiled LOD; the site patch is loaded on demand.

Google Earth's global sub-meter mosaic is licensed commercial imagery served
through Google Maps Platform; it is not a free public dataset. Marble's
satellite theme is Sentinel-2 (2016) at level 14, the same open data class, not
Google's licensed imagery. The site orbit includes a `GOOGLE EARTH ↗` link for
the exact proprietary view. A Google Maps API key is required to replace the
Sentinel-2 view with Google Map Tiles inside ODYSSEY.

## Mission decomposition engine

The engine is deterministic and auditable. It is not an LLM output and does not
depend on a remote service. The code is in `src/mission/`.

1. **Brief parsing** (`decompose.ts`) matches the brief against a library of 21
   experiment archetypes, including a generic site-survey fallback, detects the target body, duration and crew, and parses
   explicit numeric constraints such as "slopes below 8 degrees". Experiments are
   ordered by where they appear in the brief. If the brief names no experiment, the
   selected profile's experiments are used and explicitly tagged `INFERRED`.
2. **Experiment library** (`archetypes.ts`) defines the scientific objective,
   analog target, equipment, measurements, constraints, assumptions, facility
   notes and requirement recipes for each archetype. Supported archetypes include
   regolith construction, thermal survival, subsurface shielding, continuous power,
   geological sampling, rover navigation, equipment deployment, sample return,
   life detection, dust/aeolian processes, human factors, EVA, communications,
   ISRU, glaciology, volcanology, impact cratering, drilling, UAV survey and
   bioregenerative agriculture.
3. **Requirement model** (`types.ts`) separates `required`, `preferred`,
   `operational`, `facility` and `impossible` conditions. Every requirement has a
   measurable metric, direction, ideal and limit threshold, unit, weight, rationale,
   evidence provenance and an explicit `source` plus `inferred` flag. Brief-stated
   constraints are tagged `BRIEF`; template thresholds are tagged `INFERRED`.
4. **Evidence provenance** (`metrics.ts`) distinguishes measured, derived,
   reanalysis, mapped, predicted and missing evidence, and spatial from point or
   mapped support. DEM slope and roughness are spatial derivations; NASA POWER
   climate is a point reanalysis; Macrostrat geology is a mapped point lookup;
   accessibility and dust are derived indices; regolith depth, bearing strength,
   thermal inertia, dust flux, radiation flux, ice thickness, subsurface
   stratigraphy, organic carbon, soil toxicity and similar quantities are
   explicit `NO DATA`.
5. **Evaluation** (`evaluate.ts`) scores every non-facility requirement on a
   0–100 satisfaction curve, then computes an evidence-weighted experiment score.
   Evidence coverage is reported separately. Missing required evidence applies a
   penalty and a ceiling; a missing measurement is never treated as a pass.
   Facility/impossible requirements are excluded from site scoring and remain
   visible as mission-level constraints. The mission aggregate is a
   priority-weighted mean of the experiment scores.
6. **Terrain statistics** (`scripts/derive_terrain_stats.py`) derive mean, P95 and
   maximum slope, flat fraction, 3×3 residual roughness and elevation range from
   each real DEM heightmap. These statistics power the terrain requirements.

The matrix shown in the interface is the actual experiment-site evaluation:
4 experiments × 39 sites in the default brief, with per-requirement evidence
available for all 39 sites. The selected site keeps the same identity from the
matrix through the lens, DIVE, site orbit and return.

### Where the learned model fits

The learned model remains a separate surrogate. It is displayed as context in the
lens and site orbit, but it contributes **zero** weight to requirement satisfaction
or experiment scores. The mission ranking is driven by experiment evidence, so it
can differ sharply from the ML ranking; that difference is deliberate and visible.

## Temporal intelligence

A site is not permanently suitable. The temporal engine (`src/temporal/`) evaluates
the same experiment requirements against monthly NASA POWER climatology.

- **Data**: `src/data/siteMonthly.json` contains 12 monthly normals per site for
  temperature (mean/max/min), precipitation, humidity, wind, solar irradiance,
  aerosol optical depth, surface soil wetness and pressure. Source: NASA POWER /
  MERRA-2 climatology 2001–2020, sampled at the site point. It is a monthly
  climatology, not a forecast.
- **Temporal requirement flags**: every requirement now carries an explicit
  `temporal` flag. Terrain, geology, access and missing-evidence requirements are
  time-invariant where the evidence base has only one value; climate requirements
  are evaluated month by month.
- **Monthly status**: a month is `good` when required conditions meet their ideal
  thresholds, `marginal` when they are within the acceptable limit or a required
  measurement is missing, `unsuitable` when a required condition is beyond its
  limit, and `insufficient` when evidence coverage is too low. Missing evidence is
  never treated as a pass.
- **Windows**: the engine finds contiguous suitable runs, then the best
  mission-duration window inside each run. It reports mean/min fit, stability,
  evidence coverage, violations and the exact climatological label. A site with no
  window for an experiment is excluded from that experiment's campaign options.
- **Configuration**: duration (7, 14, 30, 90 days or permanent) and an optional
  fixed start month. The campaign respects the same configuration.
- **Spatial interface**: a temporal ring with engraved months, a solar marker, a
  suitability arc and the selected site/experiment. The Earth's seasonal
  declination and terminator respond to the selected month. Selecting a month
  highlights sites that are suitable in that month for the active experiment.
- **Uncertainty**: monthly normals suppress daily and hourly extremes; a suitable
  month is not a guarantee for every day. The source, period and limitation are
  repeated in the interface.

## Environmental interventions

Earth is not Mars and not the Moon. The intervention layer (`src/interventions/`)
separates what the site provides naturally from what a controlled capability can
add.

- **Gap analysis**: every requirement is classified as naturally satisfied,
  naturally partial, a seasonal/window gap, outside the natural range, an evidence
  gap, facility-reproducible, or not realistically reproducible. The analysis
  uses the best available mission window and reports the exact natural value.
- **Intervention catalog**: controlled environmental chambers, thermal-vacuum
  chambers, solar simulators, dust chambers, wind tunnels, reduced-gravity
  facilities, irradiation facilities, regolith test beds, prepared surfaces,
  cleanrooms, environmental monitoring, geotechnical/thermal/geophysical/RF
  surveys, sample analysis and isolation habitats. Each entry states what it
  reproduces, what it cannot, equipment and infrastructure classes, constraints,
  complexity, deployment mode, evidence confidence and assumptions.
- **No invented performance**: the catalog is deliberately qualitative. It does
  not claim costs, equipment availability, performance specifications or
  site-specific infrastructure. Those remain unverified.
- **Condition shell**: an inner natural ring and an outer controlled ring. A
  measurement-only intervention is shown as a measurement tick, not as a filled
  environmental condition. Partial and simulation-only interventions leave a
  residual arc. The natural site condition is never erased by selecting an
  intervention.
- **Campaign integration**: facility-dependent interventions are included only
  when the intervention policy allows them. Measurement-only actions are listed
  separately from controlled conditions. Residual conditions remain explicit in
  every campaign stop.

## Campaign synthesis

`src/campaign/` turns the experiment, temporal and intervention layers into a
coordinated expedition.

- **Hard constraints**: every experiment must have a site and a climatological
  window; a fixed start month must be suitable; the campaign must respect maximum
  distinct sites, maximum travel hours and minimum static experiment fit.
- **Option generation**: each experiment-site-window option carries static fit,
  temporal feasibility, planning score, evidence coverage, required interventions,
  measurement-only actions, residual gaps and confidence. The search keeps the top
  options per experiment plus options at sites that are competitive for more than
  one experiment.
- **Exact search over the pruned set**: the engine enumerates assignment
  combinations, groups experiments at a shared site only when their windows
  overlap for the required duration, orders stops chronologically, and prunes by
  the hard constraints. It does not call a single arbitrary weighted score a global
  optimum.
- **Explicit trade-offs**: three lexicographic plans are returned:
  - **Science-first**: maximise the weakest experiment fit, then mean fit, then
    minimise residual gaps, intervention complexity, sites and travel.
  - **Logistics-first**: minimise distinct sites and travel hours, then maximise
    the weakest fit.
  - **Intervention-light**: minimise intervention complexity and residual
    conditions, then maximise the weakest fit.
- **Output**: selected sites, assigned experiments, climatological windows,
  interventions, field measurements, equipment classes, dependencies, travel legs,
  scientific suitability, confidence and unresolved conditions. If no feasible
  campaign exists, the engine reports which experiments or constraints fail rather
  than fabricating one.
- **Travel**: great-circle distance at 800 km/h plus published airport
  ground-transfer estimates. It is a planning estimate, not a booked route, and
  there is no cost model.
- **Readable schedule**: the spatial campaign uses globe arcs, a campaign ribbon
  and a detailed stop panel. The mobile interface uses the readable stop list and
  detail sheet.

## Typography and readability

The final phase replaced the earlier micro-type with one consistent scale across
all operations:

- main section headings **32–48 px** (Instrument Serif)
- secondary headings **22–28 px**
- body and descriptions **14–18 px** (Inter)
- important measurements **20–28 px**
- metadata and annotations **12–14 px**
- no essential text below **12 px**

The mission tree and evidence matrix scroll rather than shrink; the site lens has
a sticky action foot and a bounded scroll area; Site Orbit uses a readable layer
strip, legend and mission panel; on mobile the mission/evidence surfaces become
scrollable sheets and the temporal ring remains spatial. The scale was tested at
1440 × 900, 1280 × 800, 1024 × 768 and 390 × 844.

## The learned model

Three profile-specific surrogates are trained on 39 sites with 15 features:

| Profile | Model | R² | MAE | Spearman | Pairwise |
|---|---|---:|---:|---:|---:|
| Lunar south pole base | RBF-SVR | **0.782** | 3.36 | 0.877 | 0.850 |
| Mars landing | ExtraTrees | **0.829** | 3.80 | 0.892 | 0.866 |
| Lunar expedition | RBF-SVR | **0.787** | 4.16 | 0.896 | 0.869 |

- **Target:** the transparent domain match score (0–100) per profile.
- **Validation:** 5-fold cross-validation on real sites.
- **Uncertainty:** 24 bootstrap SVR fits or ExtraTrees tree variance.
- **Explainability:** permutation importance is shown in the UI.
- **Features:** thermal mean, thermal amplitude, precipitation, humidity, wind, solar,
  elevation, relief, aerosol, surface/root soil wetness, pressure, Macrostrat geology,
  expert dust, field access.

The model is a **surrogate** for the expert rubric, not a substitute for field validation.
In the orbital experience it is displayed as context only; it does not rank sites or
contribute to experiment requirement scores. The legacy `?full=1` mission-control shell
still uses it for ranking and campaign optimization.

## Travel-aware campaign optimizer

Every site has a nearest-airport hub and a ground-transfer estimate. The optimizer
evaluates three-site permutations and experiment assignments, then maximizes:

```
experiment fit − 0.30 × travel hours − 0.008 × travel cost
```

subject to campaign length, travel time and cost limits. The result is a route, a
monthly window per site, a day-by-day plan, and a travel estimate. The UI shows the
route map, legs, times and costs.

## The free LLM agent (legacy `?full=1` shell only)

Superseded by the server-side mission agent above. The legacy **Mission Architect** section calls:

```
POST https://text.pollinations.ai/openai
```

with a strict-JSON prompt containing the mission brief and the current site context.
It returns a profile, weighted requirements, a site shortlist, field suggestions and
risks. If the endpoint is slow or unavailable, the UI falls back to a deterministic
campaign recommendation. No API key is required.

## Pipeline

```bash
python3 scripts/fetch_sites.py    # base 19-site fetch (optional; enrich.py refetches)
python3 scripts/enrich.py         # 39 sites, Macrostrat, AOD, soil, airports, ML, campaigns
python3 scripts/train_model.py    # retrain models, attach predictions, rebuild campaigns
python3 scripts/validate.py       # weight-perturbation stability
python3 scripts/fetch_site_imagery.py  # native 10 m Sentinel-2 site views
python3 scripts/fetch_site_terrain.py  # Copernicus DEM heightmaps (30 m source)
python3 scripts/derive_terrain_stats.py  # slope, roughness and flat-fraction stats
python3 scripts/fetch_site_monthly.py  # 12 monthly NASA POWER normals per site
python3 scripts/discover_candidates.py  # 107 discovery candidates outside the 39 controls
python3 scripts/fetch_radarsat1.py      # RADARSAT-1 SAR evidence for 6 Canadian/polar candidates
```

`fetch_site_imagery.py` needs `rasterio`, `pyproj`, `Pillow` and `requests`; it
reads a 2048 × 1280 window from each site's best recent Sentinel-2 scene via
the AWS Open Data COGs. `fetch_site_terrain.py` needs `rasterio`, `pyproj` and
`numpy`; it samples Copernicus DEM GLO-30 onto the same UTM window at 40 m.
`derive_terrain_stats.py` needs `numpy` and updates the `stats` block in
`src/data/siteTerrain.json`. `fetch_site_monthly.py` needs `requests` and writes
`src/data/siteMonthly.json`; it is slower because it queries NASA POWER once per
site. `discover_candidates.py` needs `requests`, `numpy`, `scipy` and `rasterio`;
it reads Copernicus DEM GLO-90 COGs over HTTP and caches per-candidate responses
in `/tmp/opencode/discovery-cache`. `fetch_radarsat1.py` needs `requests`,
`numpy`, `scipy`, `rasterio` and `Pillow`; it queries the EODMS STAC API, matches
an AWS Open Data RADARSAT-1 COG, and writes `public/sar/*.jpg` plus the `sar`
blocks in `src/data/discovery.json`. The app itself does not depend on rasterio or requests at runtime.

`enrich.py` writes `src/data/odyssey.json` and `public/sites/*.jpg`.
`train_model.py` is the fast retraining loop if the data is already enriched.

## UI

The default orbital experience is described above. The following sections belong to
the legacy mission-control shell at `?full=1`.

- **Hero**: 3D globe, campaign arcs, live counts, current surrogate R².
- **Problem / Shift**: why one-site analogs fail.
- **Agent**: free LLM mission architect with structured output and fallback.
- **Mission Brief**: profile tabs, typed prompt, weighted requirements, ML top candidates.
- **Global Scan**: world map, campaign connectors, ranked ML list, benchmark/surprise filters.
- **Site Dossier**: ML score, rule score, uncertainty, six dimensions, Macrostrat unit,
  climate strip, what breaks, field suggestions, limitations, travel-in time.
- **Shortlist / Campaign**: three sites, ML + rule scores, dynamic Gantt, travel legs.
- **Travel**: route map, leg times, costs, travel days, campaign days.
- **Model**: metrics, predicted-vs-actual scatter, permutation importance, top predictions.
- **Validation**: benchmark recovery and weight-perturbation stability.
- **Data**: source inventory.
- **Film**: 90-second concept film.

## Caveats

This is a concept prototype, not a validated mission plan. The climate grid is coarse,
Macrostrat units are not in-situ assays, and travel is a derived planning estimate
with no cost model. The brief parser is deterministic keyword/archetype matching, not
general natural-language understanding; the explicit numeric-constraint parser covers
a bounded set of metrics and phrasings. Requirement thresholds are scientific and
operational criteria, not measurements; template thresholds are tagged `INFERRED`.
Temporal windows are NASA POWER monthly climatology 2001–2020, not forecasts, and
they suppress daily extremes. The site terrain statistics cover a 20.48 × 12.8 km
window at 40 m spacing; they are not a metre-scale hazard survey. Intervention
availability, performance, infrastructure and cost are not verified. Gravity,
vacuum, the full radiation spectrum and a true 14-day lunar night are marked as
facility, simulation or residual conditions; an intervention never silently turns a
site into a perfect planetary analog. The next step is a planetary geologist review,
higher-resolution mineralogy and terrain data, facility verification and field
validation. The official challenge Resources tab opens **November 13, 2026**.

## Demo

A 64-second narrated screen capture of the earlier Mission Control is in **`demo/odyssey-demo.mp4`** (1440×900). The earlier 75-second Briefing tour is kept as **`demo/odyssey-briefing-demo.mp4`**.
It predates the orbital redesign; a new capture of the opening and global discovery is pending.
The recording and mux recipe are in `LEGACY_DEMO_README.md`.

The site's **Film** section plays the demo cut. The original 90-second concept film
remains in the sibling project at the separate concept-film project.
