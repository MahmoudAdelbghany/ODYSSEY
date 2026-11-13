# ODYSSEY — submission narrative

**Challenge:** Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars  
**Event:** NASA International Space Apps Challenge 2026  
**Team:** Team Odyssey — Anuradhapura, Sri Lanka  
**Demo:** `demo/odyssey-demo.mp4` (64 s, Mission Control)  
**Briefing film:** `demo/odyssey-briefing-demo.mp4` (75 s)  
**Live prototype:** `npm run dev` → http://127.0.0.1:5173

## The live experience

The app opens in **ODYSSEY Mission Control**, not a dashboard. A full-screen 3D Earth turns
behind a natural-language brief. Press **Initialize Mission** and the agent runs a visible
boot sequence: parse the brief, decompose experiments, scan 39 regions, rank them with three
learned models, and optimize travel.

The Earth never leaves the screen. A left phase rail and a right context panel frame it:
**Brief → Analyze → Explore → Time → Intervene → Campaign**. The globe is a custom Three.js
instrument: 8K day/night textures, moving clouds, ocean specular, city lights, an atmospheric
rim, a graticule, orbit rings, glowing waypoints and a selected-site beam. Every phase changes
the globe, not just the copy.

Explore opens a floating **SCIENCE LAYER** dock: ML score, thermal, dry regime, terrain,
geology, dust and access. The 39 waypoints re-color live, so the layer is spatial, not a table
filter. Time re-colors the waypoints month by month. Intervene shows what Earth cannot provide.
Campaign draws animated route arcs and prices every leg. **Walk the Site** opens a real 3D
terrain flythrough generated from the site's satellite frame: drag to look, adjust thrust,
pause, and move across a relief surface with contour lines and boulders. It is clearly labeled
as a surrogate, not a photograph. The always-on command bar (“best geology”, “when should we
go”, “what is missing”, “build the campaign”) makes the agent answer by changing the world.

The long-form evidence page is preserved as the **Briefing** layer, one click away. It holds
the full dossier, Weight Lab, model card, validation, data stack and limitations.

## One sentence

Odyssey turns a Moon or Mars mission brief into a travel-aware campaign across the right
Earth analog sites — searches beyond the 39 famous controls for new candidates — and names
exactly what Earth cannot provide.

## The problem

No place on Earth is Mars. Every analog is partial: a site that nails geology can fail on
thermal, a site that nails thermal can fail on dust. Most teams search for one "Mars-like"
place and hide the compromise inside the test. NASA's own challenge says an analog does
not have to match everything.

## The solution

Odyssey starts with the experiment, not the planet.

1. **Decompose** a plain-language mission brief into six weighted requirements:
   thermal, dry/volatile regime, terrain, surface materials, dust/aeolian and field access.
2. **Rank 39 candidate regions** with a profile-specific learned surrogate trained on
   15 features from NASA POWER, NASA GIBS/MODIS, Open-Meteo and Macrostrat.
3. **Characterize** each site with a satellite frame, mapped geology, climate, aerosol,
   soil wetness, live weather, seismic hazard and a "what breaks" layer.
4. **Optimize a campaign** across three sites and three experiments, with real airport
   hubs, ground transfers, flight-time estimates and cost.
5. **Explain the trade-off** with four scenarios: Balanced, Fast, Science-max and Budget.

## Why it is different

- **The campaign is the unit, not the site.** The optimizer assigns each experiment to the
  site that can actually test it.
- **Travel is part of the science.** The objective is experiment fit minus travel hours and
  cost. A slightly lower-scoring site can win if it keeps the campaign in one region.
- **The model is visible.** R², MAE, Spearman, pairwise accuracy, permutation importance,
  uncertainty and a model-selection table are all in the UI.
- **The agent is real.** A free LLM (Pollinations, no key) decomposes a brief into structured
  weights and a shortlist; a deterministic fallback works offline.
- **The limitations are explicit.** Gravity, pressure and radiation are facility-only. The UI
  says so instead of pretending.

## Discovery Engine

The 39 curated sites are controls, not the search universe. The **Discovery Engine** adds a second mode that searches beyond them.

Full engine documentation: [`../science/ANALOG_DISCOVERY_ENGINE.md`](../science/ANALOG_DISCOVERY_ENGINE.md).

- **107 real candidates** across impact structures, arid/salt systems, polar deserts, volcanic fields, caves, mines and high-altitude basins. None is within 80 km of a curated control.
- **Two reference profiles:** Moon south pole base and Mars/Jezero. Each is a distribution of feature targets, not a single vector.
- **Real evidence:** NASA POWER 2001–2020 monthly climatology, Copernicus DEM GLO-90 terrain, Macrostrat geology and OurAirports access. Per-dimension scores, evidence coverage and a best 2–3 month climatological window.
- **Two scores:** a compensatory weighted mean and a weak-link weighted distance that penalizes a fatal mismatch. A sensitivity band reports the evidence tolerance; neither score is a probability.
- **RADARSAT-1 historical SAR:** six Canadian/polar candidates carry a real RADARSAT-1 scene, browse thumbnail and L1 frame texture. It is labeled segment/frame context, not a local AOI measurement, because the open AWS COGs are not geocoded.
- **Honest gaps:** mineralogy species, vegetation, water/ice, subsurface and geotechnical evidence are missing, not imputed. Every dossier states what Earth cannot reproduce.
- **From screen to field:** promote a candidate to a field-review shortlist and export a JSON dossier for later ODYSSEY ingestion. The method is **global screen → regional refine → local certify**; global layers rank and exclude, local measurements certify.

This directly answers the challenge's "look beyond well-known analog sites" requirement without pretending that a screening score is a discovery.

## Data

| Source | Use |
|---|---|
| NASA POWER climatology 2001–2020 | Temperature, precipitation, humidity, wind, solar, AOD, soil wetness, pressure |
| NASA GIBS / MODIS Terra | True-color satellite frame per site |
| Open-Meteo | Elevation, local relief, live 7-day forecast |
| Macrostrat (CC-BY 4.0) | Mapped geologic unit, lithology, age |
| USGS Earthquake Catalog | M4+ seismicity within 300 km / 1 year |
| NASA PDS / LRO / MRO literature | Moon and Mars reference conditions |
| RADARSAT-1 (CSA, open) | Historical SAR browse and L1 frame texture for six Canadian/polar discovery candidates |
| OpenFlights / great-circle | Airport hubs, distances, travel estimates |

39 sites, 15 features, 12 open sources.

## The model

| Profile | Model | R² | MAE | Spearman | Pairwise |
|---|---|---:|---:|---:|---:|
| Lunar south pole base | RBF-SVR | 0.782 | 3.36 | 0.877 | 0.850 |
| Mars landing | ExtraTrees | 0.829 | 3.80 | 0.892 | 0.866 |
| Lunar expedition | RBF-SVR | 0.787 | 4.16 | 0.896 | 0.869 |

5-fold cross-validation on real sites. Uncertainty from 24 bootstrap SVR fits or
ExtraTrees tree variance. Full model card in `../science/MODEL_CARD.md`.

## The agent

The Mission Architect calls the free Pollinations OpenAI-compatible endpoint with a strict
JSON prompt. It returns a profile, weights, a site shortlist, field suggestions and risks.
The UI validates site names against the real dataset and falls back to a deterministic
campaign if the endpoint is slow or unavailable.

Mission Control responds instantly with the deterministic brief parser and the learned
ranking, so the globe never waits on a network call. The free LLM architect is one click
away in **Briefing** and can re-weight the model; its output is validated against the same
39-site dataset.

## Current campaigns

| Scenario | Campaign | Days | Travel | Cost |
|---|---|---:|---:|---:|
| Lunar base / Balanced | Puna de Atacama → Atacama → Craters of the Moon | 23 | 25.5 h | $1,541 |
| Lunar base / Budget | Harrat Khaybar → Wadi Rum → White Desert | 22 | 13.7 h | $788 |
| Mars / Balanced | Bodélé → Harrat Khaybar → Wadi Rum | 23 | 26.8 h | $1,791 |
| Mars / Science-max | Bodélé → Atacama → Erg Chebbi | 25 | 46.9 h | $3,115 |
| Expedition / All scenarios | Harrat Khaybar → Wadi Rum → White Desert | 22 | 13.7 h | $788 |

## Impact

- **Who uses it:** NASA analog mission planners, commercial lunar lander teams, ESA/JAXA
  mission designers, analog research stations, field campaign managers.
- **What it saves:** site-search time, travel cost and field days; it surfaces non-obvious
  sites and names the facility-only gaps before a team deploys.
- **What it changes:** one-site analog testing becomes a transparent, auditable campaign.

## Demo

`demo/odyssey-demo.mp4` — 64 s, narrated, 1440×900. It tours the live **Mission Control**
experience: opening, boot, Analyze, Explore and the science-layer dock, the 3D terrain walk,
the seasonal Time machine, the campaign route and the Budget scenario. The earlier 75 s
evidence tour is kept as `demo/odyssey-briefing-demo.mp4`.

## AI disclosure

- LLM: Pollinations free endpoint (`text.pollinations.ai/openai`, `gpt-oss-20b`) for the
  mission-architect agent. The output is validated and can be replaced by a deterministic
  fallback.
- ML: scikit-learn RBF-SVR and ExtraTrees surrogates trained on the project's own
  expert-scored dataset. No external model weights are used for the ranking.
- Imagery: NASA GIBS/MODIS; geologic data: Macrostrat; no AI-generated imagery is presented
  as real data.

## Limitations

- The climate grid is coarse (NASA POWER reanalysis), not a local weather station.
- Macrostrat gives a mapped unit, not an in-situ assay.
- Travel costs are planning estimates, not quotes.
- The model is a surrogate for the expert rubric, not a substitute for field validation.
- Planetary geologist sign-off and field assay of the top three sites are the next steps.
- The official challenge Resources tab opens November 13, 2026; the app is ready to ingest it.

## Links

- Source: this repository
- Demo: `demo/odyssey-demo.mp4`
- Model card: `../science/MODEL_CARD.md`
- Data licenses: `DATA_LICENSES.md`
- Concept film: the separate concept-film project (separate project)
