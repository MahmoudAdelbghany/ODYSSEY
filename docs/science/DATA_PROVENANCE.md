# ODYSSEY: Data Provenance and Attribution

All values in ODYSSEY trace to one of the sources below. Licences of the
pre-existing datasets are also summarised in `../history/DATA_LICENSES.md`; per-asset
credits are in `public/tex/earth/CREDITS.md`, `public/sites/close/CREDITS.md` and
`public/sites/terrain/CREDITS.md`.

## Earth data

| Dataset | Version / period | Used for | Epistemic class | Licence / attribution |
|---|---|---|---|---|
| NASA POWER (MERRA-2) | Climatology 2001–2020 | Air temperature, precipitation, humidity, wind, insolation, AOD 550 nm, soil wetness, surface pressure; monthly normals | MODELED (reanalysis, point) | NASA open data, attribution requested |
| MODIS MYD11A1 v061 (Aqua LST) | 3-month warm-season windows 2023–24, ≤12 dates | Day/night land-surface temperature, paired ΔT | MEASURED (1 km pixel) | NASA open data; accessed via Microsoft Planetary Computer |
| Copernicus DEM GLO-30 | 2011–2015 acquisition | 40 m site heightmaps; 400/463 m same-baseline windows; slope, relief, roughness | DERIVED | © DLR e.V. 2010–2014 / ESA 2021, free with attribution |
| Copernicus DEM GLO-90 |, | 107-seed discovery terrain | DERIVED | as above |
| Sentinel-2 L2A | Scenes 2024–2026 (IDs in `src/data/siteImagery.json`) | Site Orbit imagery | MEASURED (imagery) | Copernicus Sentinel data terms; contains modified Copernicus Sentinel data |
| NASA Blue Marble 2002, Black Marble / VIIRS City Lights 2012 |, | Globe textures |, | Public domain |
| Macrostrat | API, 2026 | Mapped lithology / age at site point | DERIVED (mapped point) | CC-BY 4.0 |
| WorldClim 2.1 (10′) | 1970–2000 | Global generated-discovery screen | MODELED | Academic / non-commercial; redistribution of derived fields needs permission |
| Natural Earth 1:110m |, | Land mask |, | Public domain |
| OurAirports | 2026 | Access distance | DERIVED | Public domain |
| RADARSAT-1 (CSA) | Historical archive | SAR context for 6 candidates | context only | Open licence (CSA) |

## Moon and Mars data

| Source | Used for | Class |
|---|---|---|
| LRO LOLA LDEM_45S_400M (PDS LRO-L-LOLA-4-GDR-V1.0) | Lunar south-pole terrain window | DERIVED |
| MGS MOLA 463 m global DEM | Jezero terrain window | DERIVED |
| Paige et al. 2010, *Science*, doi:10.1126/science.1187726 (LRO Diviner) | Lunar polar surface temperature 50–250 K | PUBLISHED |
| Rodriguez-Manfredi et al. 2023, *Nature Geoscience*, doi:10.1038/s41561-022-01084-0 (MEDA) | Jezero air/surface temperature | MEASURED (point) |
| NASA NSSDC Moon / Mars / Earth fact sheets (nssdc.gsfc.nasa.gov, accessed 2026-11-13) | Gravity, surface pressure, atmospheric composition, solar irradiance, wind (Viking) | PUBLISHED (quotes stored in profile) |
| Zhang et al. 2020, *Science Advances* 6:eaaz1334, doi:10.1126/sciadv.aaz1334 (Chang'E-4 LND) | Lunar surface absorbed dose rate 13.2 ± 1 µGy/h in Si | PUBLISHED (abstract via Europe PMC PMC7518862) |
| Hassler et al. 2014, *Science*, doi:10.1126/science.1244797 (MSL RAD) | Cited only; value **not** used (not verifiable from open text) | MISSING |

## Runtime sources (per run)

Every source a run touches is stored with URL, retrieval time, SHA-256 of the
bytes, content type, title, publication date and DOI when present, and its
status (pending review, retrieved, supported, contradicted, unresolved,
retrieval failed). Allowed search domains: nasa.gov, esa.int, usgs.gov, jaxa.jp,
asc-csa.gc.ca, nature.com, science.org, agupubs.onlinelibrary.wiley.com,
springer.com, copernicus.org. Additional retrieval-only hosts (DOI resolution and
open-access mirrors): doi.org, ncbi.nlm.nih.gov, europepmc.org, ebi.ac.uk,
arxiv.org, iopscience.iop.org, sciencedirect.com, mdpi.com, frontiersin.org,
hou.usra.edu, lpi.usra.edu.

## Software components

| Component | Version | Licence | Role |
|---|---|---|---|
| Earth-Location-Nasa (mernaahany) | commit `455870d` (submodule) | **No licence file in the repository**: not copied; referenced as a submodule; confirm terms with the author before redistribution | Serper search, filters, validation |
| Reranker (WA-on-test2) | commit `8d706dc` (submodule, **private repository**) | Apache-2.0 | Mission-weighted candidate reranking; system prompt reused in `bridge.py` with attribution |
| Serper (google.serper.dev) | API | Commercial API | Web search |
| Crossref REST API | API | Metadata open (CC0) | Literature for Reranker weights |
| OpenCode Go / DeepSeek V4.1 Flash | API | Commercial subscription | Agent reasoning |
