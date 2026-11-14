# Third-party notices

ODYSSEY's original code and documentation are licensed under Apache-2.0 (`LICENSE`). That licence does **not** extend to the materials below, which keep their own terms. Datasets are listed in detail in [`DATA_SOURCES.md`](DATA_SOURCES.md); this file covers code, packages, fonts, imagery, models and services.

Checked 2026-11-14. "Redistributed" means the material is inside this repository or the built site.

## 1. Optional external components (not in this repository)

| Component | Source | Version | Licence | Redistributed | Notes |
|---|---|---|---|---|---|
| Earth-Location-Nasa (`analog_validation`) | https://github.com/mernaahany/Earth-Location-Nasa | commit `455870dff0caffdfc250c4034370550e7c548c5e` | **None stated** (no LICENSE file; GitHub reports no licence) | **No** | Imported at run time by `server/evidence/bridge.py` if present in `external/Earth-Location-Nasa`. No code from it is copied into ODYSSEY. Without it, evidence search is disabled. Use requires the author's permission until a licence is added. |
| Reranker (`mission_reranker`) | https://github.com/WA-on-test2/Reranker | commit `8d706dc1311b92d44966b72fdd7104d9c4534b61` | Apache-2.0 | **No** (repository is private) | Imported at run time if present in `external/Reranker`. Without it, literature reranking is disabled and the deterministic order stands. One system prompt is reproduced in `server/evidence/bridge.py` with attribution (see `NOTICE`); no other code is copied. |

Integration boundary: both are reached only through `server/evidence/bridge.py` (one JSON command on stdin, one JSON result on stdout, run with `python3 -I`). `server/config.ts` detects whether they are installed.

## 2. JavaScript packages

Direct dependencies (versions from `package-lock.json`):

| Package | Version | Licence | Source |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | https://github.com/react/react |
| three | 0.187.0 | MIT | https://github.com/mrdoob/three.js |
| react-globe.gl | 2.38.0 | MIT | https://github.com/vasturiano/react-globe.gl |
| framer-motion | 14.11.1 | MIT | https://github.com/motiondivision/motion |
| lenis | 1.3.27 | MIT | https://github.com/darkroomengineering/lenis |
| clsx | 2.1.1 | MIT | https://github.com/lukeed/clsx |
| lucide-react | 1.70.0 | ISC | https://github.com/lucide-icons/lucide |
| d3-geo | 3.1.2 | ISC | https://github.com/d3/d3-geo |
| topojson-client | 3.1.0 | ISC | https://github.com/topojson/topojson-client |
| world-atlas | 2.0.2 | ISC (package); boundaries from Natural Earth (public domain) | https://github.com/topojson/world-atlas |
| h3-js (transitive) | 4.5.0 | Apache-2.0 | https://github.com/uber/h3-js |

Development only (not shipped in the built site): typescript 7.0.2 (Apache-2.0), vite 8.3.7 (MIT), @vitejs/plugin-react 6.3.0 (MIT), tsx 4.23.15 (MIT, also used to run the server), oxlint 1.93.0 (MIT), and @types/* (MIT).

All 63 installed production packages in the resolved tree are under permissive licences: MIT (44), ISC (16), Apache-2.0 (1), 0BSD (1), Unlicense (1). Four further entries are optional peer dependencies (vue, preact-render-to-string, remix, @nuxt/kit) that are not installed. Reproduce with `npm ls --omit=dev --all`. None of these packages was modified.

## 3. Python packages

The server bridge uses the Python standard library only. The data pipelines in `scripts/` use (pinned in `pyproject.toml`): numpy (BSD-3-Clause), h3 (Apache-2.0), rasterio (BSD-3-Clause), pystac-client (Apache-2.0), planetary-computer (MIT), pyproj (MIT), shapely (BSD-3-Clause), scipy (BSD-3-Clause), scikit-learn (BSD-3-Clause), requests (Apache-2.0) and pillow (MIT-CMU). None is redistributed; they are installed by the user.

## 4. Fonts (redistributed in `public/fonts/`, unmodified)

All under the SIL Open Font License 1.1; the licence text and copyright notices are in [`public/fonts/OFL.txt`](public/fonts/OFL.txt).

| Font | Copyright (from the font file) | Source |
|---|---|---|
| Inter | Copyright 2016 The Inter Project Authors | https://github.com/rsms/inter |
| Space Grotesk | Copyright 2020 The Space Grotesk Project Authors | https://github.com/floriankarsten/space-grotesk |
| IBM Plex Mono | Copyright 2017 IBM Corp. ("Plex" is a reserved font name and IBM trademark) | https://github.com/IBM/plex |
| Instrument Serif | Copyright 2022 The Instrument Serif Project Authors | https://github.com/Instrument/instrument-serif |

## 5. Imagery and visual assets (redistributed in `public/`)

| Asset | Provider / author | Licence or terms | Modified | Attribution |
|---|---|---|---|---|
| `public/tex/earth/day_*` (globe surface LOD tiles) | NASA Blue Marble 2002, Reto Stöckli / Robert Simmon, NASA Earth Observatory (via Wikimedia Commons master) | Public domain (NASA) | Tiled, resized, gutters added | NASA Earth Observatory / Visible Earth |
| `public/tex/earth_night_8k.jpg`, night tiles | NASA Black Marble / VIIRS City Lights 2012, via NASA GIBS | Public domain (NASA) | Mosaicked, resized | NASA GIBS / Black Marble |
| `public/tex/earth/clouds_*`, `earth_specular_2048.jpg`, `earth_normal_2048.jpg`, `2k_earth_*`, `moon.jpg`, `mars.jpg` | Solar System Scope (https://www.solarsystemscope.com/textures/) | CC BY 4.0 | Resized; clouds converted to a single channel | "Textures by Solar System Scope, CC BY 4.0" |
| `public/tex/earth_day_8k.jpg` | NASA Worldview / Blue Marble Next Generation snapshot | Public domain (NASA) | Resized | NASA Earthdata / GSFC |
| `public/img/mars_opening_plate.jpg` (legacy views) | NASA/JPL-Caltech/MSSS, Curiosity PIA26019 | NASA media guidelines; generally not copyrighted | Re-cropped, sky reconstructed, graded | NASA/JPL-Caltech/MSSS |
| `public/sites/*.jpg`, `public/sites/close/*`, `public/generated/*` | Sentinel-2 L2A (ESA Copernicus) and NASA GIBS MODIS Terra true colour | Copernicus Sentinel data terms (free, attribution); NASA public domain | Cropped, reprojected | "Contains modified Copernicus Sentinel data [year]"; NASA GIBS / EOSDIS |
| `public/sites/terrain/*`, `public/generated/terrain/*` (heightmaps) | Copernicus DEM GLO-30, ESA / DLR / Airbus | Copernicus DEM licence (free, attribution) | Resampled to 40 m | "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |
| `public/sar/*.jpg` | RADARSAT-1 archive, Canadian Space Agency | Released under an open licence (CSA open data portal) | Browse thumbnails | Canadian Space Agency. **Exact attribution wording to confirm.** |
| `public/world-110m.json` | Natural Earth via world-atlas | Public domain (Natural Earth) | None | Natural Earth |
| `public/img/stars.svg`, `public/img/grain.svg` | Generated procedurally by the ODYSSEY team (seeded random star points; SVG fractal noise) | Project work, Apache-2.0 | n/a | n/a |
| `public/img/og.jpg` | Screenshot of the ODYSSEY start screen | Project work, Apache-2.0 | Contains NASA Blue Marble imagery (public domain) | NASA |
| `public/favicon.svg`, `public/icons.svg` | ODYSSEY / Vite template | Project / MIT | n/a | n/a |

Not redistributed: earlier demo videos and synthesized-voice narration (Microsoft Edge TTS neural voices) remain outside the release.

## 6. AI models and services (called at run time; nothing is redistributed)

| Service | Use | Terms |
|---|---|---|
| OpenCode Go API, model `deepseek-v4.1-flash` (DeepSeek) | In-product mission agent and Reranker weight proposals | User supplies their own `OPENCODE_API_KEY`; OpenCode terms of service. Any OpenAI-compatible tool-calling model can be configured. |
| Serper (Google search API) | Evidence search through Earth-Location-Nasa | User supplies their own `SERPER_API_KEY`. |
| Crossref REST API | Literature metadata for the Reranker | Public API; metadata largely CC0; requests are cached and rate-limited. |
| Pollinations (`text.pollinations.ai`) | **Legacy** "Briefing" page only (`?full` mode), called from the browser | Free public endpoint; not used by the current workspace. |
| Open-Meteo, USGS earthquake API | **Legacy** live-conditions panel only | Open-Meteo CC BY 4.0 (link required); USGS public domain. |

Development tools used to build ODYSSEY are listed in `docs/submission/NASA_SPACE_APPS_SUBMISSION.md`.

## Context photographs and target globe textures (added in 1.1.0)

| Files | Source | Licence / terms | Changes | Credit |
|---|---|---|---|---|
| `public/visuals/*.jpg` | NASA Image and Video Library: Apollo 11, 15 and 17 surface photographs; LRO south-pole mosaic PIA13523; Curiosity PIA19140, PIA22486, PIA26019; Perseverance PIA24542, PIA25290; Webb Pathfinder in Chamber A (GSFC) | NASA media guidelines; generally not copyrighted in the United States | Resized to 1400 px wide | Per file in `public/visuals/CREDITS.md` |
| `public/tex/targets/moon_lroc_2k.jpg` | NASA Scientific Visualization Studio, CGI Moon Kit (LRO WAC colour mosaic), https://svs.gsfc.nasa.gov/4720 | Public domain (NASA) | Converted from TIFF | NASA SVS |
| `public/tex/targets/mars_viking_2k.jpg` | Mars Viking MDIM 2.1 colourised mosaic (NASA/USGS), tiles from NASA Mars Trek | Public domain (NASA/USGS) | Stitched, downsampled to 2048 × 1024 | NASA/USGS |
