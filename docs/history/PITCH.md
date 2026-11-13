# ODYSSEY — pitch and demo script

## One sentence

Odyssey turns a Moon or Mars mission brief into a learned, travel-aware campaign across
the right Earth analog sites — and names exactly what Earth cannot provide.

## 60-second pitch

> No place on Earth is Mars. Every analog is partial: a site that nails geology can fail on
> thermal; a site that nails thermal can fail on dust.
>
> Today, teams pick one famous site and hide the compromise inside the test.
>
> Odyssey starts with the experiment, not the planet. It decomposes the brief into six
> weighted requirements, ranks thirty-nine candidate regions with a profile-specific learned
> model, and assembles a multi-site campaign. It prices every leg, from airport to airport,
> then trades match score against travel time and cost.
>
> For a permanent lunar south pole base, the balanced campaign is Puna de Atacama, Atacama
> and Craters of the Moon: twenty-three days, twenty-five travel hours, about fifteen hundred
> dollars. Switch to Budget and it becomes Harrat Khaybar, Wadi Rum and White Desert: twenty-
> two days, fourteen travel hours, seven hundred and eighty-eight dollars.
>
> It shows live weather, seismic hazard, what breaks, what to synthesize and what to test.
> It is a campaign planner, not a map.
>
> Odyssey. Your next mission starts on Earth.

## 3-minute live demo script

### 0:00–0:20 — Opening

**Show:** the turning Earth, the mission brief, `INITIALIZE MISSION`.

**Say:** “This is Odyssey Mission Control. It does not search for one Mars-like place.
Define a planetary mission, and Odyssey discovers where on Earth it can be tested.”

### 0:20–0:50 — Initialize and analysis

**Show:** press Initialize; the boot sequence; the Analysis panel.

**Say:** “The agent decomposes the brief into experiments and environmental requirements,
scans thirty-nine candidate regions, ranks them with three learned models, and starts the
travel optimizer. The lunar-base model has an R² of 0.78 on five-fold cross-validation.”

### 0:50–1:20 — Explore and science layers

**Show:** click a top site; switch the globe layer from ML score to Thermal and Geology;
open live conditions and field suggestions.

**Say:** “The Earth is the instrument. Each site carries a satellite frame, Macrostrat
geology, climate, live weather, seismic hazard, uncertainty and the campaign role. Change
the layer and the whole planet re-colors from the same data.”

### 1:20–1:35 — Walk the site

**Show:** `Walk the Site`; drag to look; pause; point at the contour lines and boulders.

**Say:** “No ground imagery exists at most of these sites, so Odyssey builds a 3D relief
flythrough from the satellite frame. It is not a photograph; it is an explorable terrain
surrogate, and the interface says so.”

### 1:35–1:50 — Time machine

**Show:** Time phase; press `PLAY YEAR`; drag to a month.

**Say:** “Seasonality is not a footnote. The same site can be viable in February and
hostile in July. The time machine re-colors the globe and re-scores the site from monthly
climatology.”

### 1:50–2:05 — Intervention lab

**Show:** Intervene; toggle thermal vacuum, dust chamber and pressure facility.

**Say:** “Earth gives us the analog, not the physics. The lab separates matched, partial
and missing conditions, then shows what a facility must supply: gravity, pressure,
radiation, thermal swing or dust.”

### 2:00–2:30 — Campaign

**Show:** Campaign; switch Balanced → Budget; hover the route arcs.

**Say:** “The campaign is the unit. The optimizer assigns each experiment to the site that
can test it, prices every airport-to-airport leg, and trades match score against travel
time and cost. Balanced goes through the Andes and North America; Budget stays in the
Middle East for about seven hundred and eighty-eight dollars.”

### 2:30–2:45 — Ask Odyssey

**Show:** the command bar: “best geology”, “what is missing”, “build the campaign”.

**Say:** “Ask a question and the agent answers by changing the world in front of you. The
globe flies to the site, activates the evidence, opens the right phase, and narrates why.”

### 2:45–3:00 — Evidence and close

**Show:** `BRIEFING`; the model card, data stack and limitations; return to Mission Control.

**Say:** “Every recommendation is auditable: R², MAE, Spearman, permutation importance,
uncertainty, data licenses and facility-only gaps. Three models, four scenarios, one
campaign. Your next mission starts on Earth.”

## Judge Q&A

**“What data did you use?”**
NASA POWER climatology (2001–2020) including AOD and soil wetness; NASA GIBS/MODIS imagery;
Open-Meteo elevation and live forecast; Macrostrat geologic units (CC-BY 4.0); USGS
earthquakes; NASA PDS/LRO/MRO reference conditions.

**“Why this site?”**
The dossier shows per-dimension evidence, Macrostrat unit, climate, uncertainty and the
campaign role. The model and the rubric are both shown; the delta is visible.

**“How do you validate?”**
5-fold cross-validation on 39 real sites; R² 0.78 lunar, 0.83 Mars, 0.79 expedition.
Benchmark recovery, permutation importance, 300-run weight-perturbation stability, and
live hazard checks.

**“What breaks?”**
Gravity, pressure and radiation are facility-only. The UI says so. Earth also cannot
reproduce scale, biology or temporal dynamics perfectly.

**“Is the LLM real?”**
Yes. Pollinations free endpoint, model gpt-oss-20b, structured JSON output. It is tested
live and has a deterministic fallback. No key.

**“Why not just Atacama?”**
Atacama is a core lunar-base analog, but one site cannot test everything. The optimizer
assigns regolith, thermal and subsurface experiments to different sites, then sequences
them.

**“What is the impact?”**
It turns a months-long site search into an auditable, travel-aware campaign, surfaces
non-obvious sites, and names the facility-only gaps before a team deploys.

**“What is next?”**
Planetary geologist sign-off, field assay of the top three sites, higher-resolution
mineralogy/terrain, and the official challenge Resources tab on November 13.

## Judging map

| Criterion | Evidence |
|---|---|
| **Impact** | 39 sites, 3 models, 4 scenarios, travel-aware campaign, facility gaps named |
| **Creativity** | Campaign-not-site framing; Weight Lab; agent-applied weights; scenario trade-offs |
| **Validity** | Real NASA/Macrostrat/Open-Meteo/USGS data; 5-fold CV; uncertainty; benchmark recovery |
| **Relevance** | Directly answers the 2026 Moon/Mars analog challenge; permanent base + Mars landing |
| **Presentation** | Mission Control shell, 8K 3D Earth, six live phases, spatial callouts, science-layer dock, 3D terrain walk, command bar, 64-second cut, dossier, route map, model dashboard |

## Submission checklist

- [x] Public code repo (local commit; add remote before submitting)
- [x] Live prototype (`npm run dev`)
- [x] 64-second Mission Control demo (`demo/odyssey-demo.mp4`); 75-second Briefing cut retained
- [x] Project page narrative (`SUBMISSION.md`)
- [x] Model card (`../science/MODEL_CARD.md`)
- [x] Data licenses (`DATA_LICENSES.md`)
- [x] AI/SI disclosure
- [ ] Planetary geologist sign-off
- [ ] Official Resources tab ingestion (opens Nov 13)
- [ ] Final project page upload + video link
