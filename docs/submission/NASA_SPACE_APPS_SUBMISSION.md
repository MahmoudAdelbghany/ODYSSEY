# NASA Space Apps Challenge 2026: submission information

**Challenge:** Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars
**Project title:** ODYSSEY: Planetary Analog Mission Planner

* Public GitHub repository: https://github.com/MahmoudAdelbghany/ODYSSEY
* Live application: https://odyssey.qd.je
* Demo video (30 s): https://youtu.be/i5nh3yk-ONs
* NASA Space Apps project page: https://www.spaceappschallenge.org/2026/find-a-team/ns-sbys-bs-jd/?tab=project
* Team: ناسا سبيس ابس جدا

## High-level summary

ODYSSEY turns a Moon or Mars mission brief into separate experiments and finds the Earth sites that suit each experiment, using open NASA and partner-agency data. It then compares each site with the lunar south pole or Mars's Jezero crater, condition by condition. It reports where the analogy holds and where it breaks. For each break it says whether another site, a controlled facility test or a field measurement can close it, or whether Earth cannot reproduce the condition at all. A tool-using AI agent runs the analysis, but every number comes from deterministic, unit-aware code and every cited value is checked against its source.

## Detailed description

**Problem.** Analog sites such as the Atacama Desert or Devon Island are chosen for missions, but no Earth site matches the Moon or Mars everywhere, and terrestrial analogs are not well characterised. Mission teams need to know which site suits which experiment, and which conditions must be tested elsewhere.

**What ODYSSEY does.**

1. **Mission decomposition:** a brief becomes experiments (for example geological sampling, rover navigation, thermal survival). Each experiment has measurable requirements labelled with their provenance: stated in the brief, or a proposed assumption.
2. **Site ranking per experiment:** 39 curated Earth sites are checked against hard limits, then ranked on terrain, temperature, geology, access and evidence. Each is shown separately, with a defined aggregate.
3. **Where Earth falls short:** each site is compared with the target on 31 environmental dimensions. A comparison happens only when quantity and support match: air temperature is never compared with surface temperature, and a 40 m slope never with a 400 m one. Gravity, vacuum, the lunar night and radiation are flagged as not reproducible on Earth.
4. **Evidence gaps explained:** every missing value is classified as one of three things: a dataset exists but is not integrated, a field measurement is required (with the test, e.g. ASTM D6951 for bearing strength), or a physical mismatch. Missing data never counts as a match or a mismatch.
5. **Interventions:** for conditions Earth cannot provide, controlled tests (thermal-vacuum chamber, gravity offload, CO₂ chamber) with adjustable first-order physics, labelled as simulated or proposed.
6. **Campaign:** an optimiser assigns experiments to sites and climate windows three ways: best science, least travel, fewest facilities.
7. **Global discovery:** an H3 screen of Earth's land, not seeded by known analogs, finds 80 regions beyond the curated set. Of these, 70 are new relative to the 107 screened candidates and 39 curated sites.

**Result for the sample lunar expedition.**

* No curated site matches the lunar south-pole rock type. ODYSSEY points to Manicouagan and Pingualuit, where Macrostrat maps anorthosite.
* No Earth site reaches the 50–250 K lunar surface range, so thermal survival needs a chamber.
* Bearing strength, thermal inertia, grain size and rock exposure need field measurements, each with a named protocol.
* The suggested campaign pairs the Atacama Desert with a dust site.

**Technology.** TypeScript (React 19, Three.js, Vite) frontend; Node.js backend (`node:http`, `node:sqlite`, SSE); a Python standard-library bridge to optional components; Python data pipelines (rasterio, pystac-client, numpy, h3); 71 Node and 48 Python automated tests.

## NASA data used

**From this challenge's Resources tab:**

* **NASA Planetary Data System (PDS) / NASA Lunar Reconnaissance Orbiter (LRO):** LRO LOLA gridded DEM `LDEM_45S_400M` (PDS data set `LRO-L-LOLA-4-GDR-V1.0`), downloaded from the PDS Geosciences Node. It is the lunar south-pole terrain reference: slope, relief and roughness at a 400 m baseline, compared with Earth sites at the same baseline (`scripts/derive_planetary_reference.py`, `src/data/planetaryReference.json`).
* **NASA LRO Diviner Lunar Data:** Diviner results are used as verified published references: polar surface temperature 50–250 K (Paige et al. 2010) and regolith thermal inertia 55 ± 2 J m⁻² K⁻¹ s⁻¹ᐟ² (Hayne et al. 2017). The gridded Diviner products are identified but not yet ingested.
* **NASA Worldview (GIBS imagery service):** MODIS Terra true-colour site images and VIIRS City Lights.

**Other NASA data:**

* NASA POWER (MERRA-2) 2001–2020 climatology;
* MODIS Aqua land-surface temperature MYD11A1 v061;
* MGS MOLA (Mars terrain at 463 m);
* NSSDC planetary fact sheets;
* Blue Marble 2002 and Black Marble;
* published Mars 2020 MEDA and LRO LOLA illumination results.

Full details: [`../../DATA_SOURCES.md`](../../DATA_SOURCES.md).

## Space agency partner resources used

* **ESA / Copernicus:** Copernicus DEM GLO-30 and GLO-90 (terrain), Sentinel-2 L2A (site imagery), ESA WorldCover 2021 (bare-ground bound on rock exposure).
* **CSA:** RADARSAT-1 archive (SAR browse imagery for discovery candidates).

## Other data resources

WorldClim 2.1, Natural Earth, Macrostrat, OurAirports, Open-Meteo (elevation), Crossref (literature metadata, through the optional Reranker), and published papers listed in `DATA_SOURCES.md`.

## External code and software

* Open-source libraries: React, Three.js, react-globe.gl, framer-motion, d3-geo, topojson, h3-js, lucide-react, Vite, TypeScript, tsx, oxlint; Python numpy, rasterio, pystac-client, planetary-computer, pyproj, shapely, scipy, scikit-learn, h3, pillow. Licences are in [`../../THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
* Optional, not included in the repository:
  * `mernaahany/Earth-Location-Nasa` (evidence search and validation; no licence file);
  * `WA-on-test2/Reranker` (literature-weighted reranking; Apache-2.0, private repository).
* Fonts: Inter, Space Grotesk, IBM Plex Mono, Instrument Serif (SIL OFL 1.1).

## AI models and tools

**In the product (the submitted demonstration):**

* **DeepSeek V4.1 Flash** (`deepseek-v4.1-flash`), developed by DeepSeek, accessed through the **OpenCode Go** API. It acts as the mission agent: it chooses tools, extracts claims from retrieved sources and writes the report narrative, with reasoning disabled (`reasoning_effort: none`). It also proposes the Reranker's feature weights. The model can be changed with `OPENCODE_MODEL`; without a key, a deterministic planner runs the same tools. The model never produces the numbers, scores or decisions in the report.
* **Pollinations** text endpoint: only in the legacy "Briefing" page (`?full` mode), not in the current workspace.

**During development:**

* **Claude Code (Anthropic), model Claude Opus 5.5:** an AI coding assistant used to write and review code, run tests and research and verify data sources. Every source it cited was checked against the original document.
* **Microsoft Edge TTS** (neural voices): narration for earlier demo videos. Those videos are not part of this release.
* **ElevenLabs** (text-to-speech model `eleven_v4`, voice "Eric"; Music model `music_v2_5`): the synthetic narration and the instrumental music of the 30-second demo video. **ElevenLabs Scribe** transcribed the final mix to check that the narration matched the script and that the music had no vocals. The video description states that the voice is synthetic.

No AI-generated imagery is used. The globe, terrain, site and context images come from NASA, ESA, USGS and Copernicus data; the starfield and grain textures are generated procedurally by code in this repository.

**Funding review note:** DeepSeek is developed by a company based in China, and one radiation reference (Zhang et al. 2020) comes from the Chang'E-4 mission. Confirm with the Local Lead whether the Space Apps rules on Chinese entities affect Global Judging. Switching the in-product model is one setting.

## Licensing and attribution summary

* ODYSSEY's original code and documentation: Apache-2.0.
* Third-party code, data, imagery and fonts keep their own licences ([`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), [`DATA_SOURCES.md`](../../DATA_SOURCES.md)).
* Copernicus data are used with the required notices. NASA data are used under NASA's open data policy.
* No NASA logo or branding is used, and the project is not endorsed by NASA.

Challenge requirements and judging criteria are mapped in [`NASA_CHALLENGE_MAPPING.md`](NASA_CHALLENGE_MAPPING.md).
