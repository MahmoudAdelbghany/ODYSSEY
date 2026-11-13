# Data sources

Every source ODYSSEY uses, with identifiers, access, units, purpose, limitations and terms. Checked 2026-11-14.

**Integrated** means the data, or values derived from it by a script in `scripts/`, are committed in `src/data/` or `public/` and used by the engine. A **published reference** is a value read verbatim from a paper or fact sheet and stored with its quote. Sources that were only investigated are listed separately in §5 and are not used.

Evidence classes used throughout the app and documentation:

| Class | Meaning | Example |
|---|---|---|
| MEASURED | Direct instrument observation at the stated support | MODIS land-surface temperature, 1 km pixel |
| DERIVED | Computed deterministically from a measurement | Slope and roughness from Copernicus DEM |
| MODELED | Model or reanalysis output | NASA POWER / MERRA-2 climatology |
| PUBLISHED | Value quoted from a paper or fact sheet | Lunar thermal inertia 55 ± 2 (Hayne et al. 2017) |
| PROXY | A different quantity used only as a bound or indicator | WorldCover bare ground as an upper bound on rock exposure |
| ESTIMATED | Hand-assigned or curated, no recorded method | Field access index, dust index |
| PROPOSED | A threshold or intervention design, not an observation | Recipe thresholds; chamber setpoints |
| SIMULATED | First-order physical model output | Thermal-vacuum pump-down time |
| PENDING REVIEW | Search result not yet retrieved and verified | Serper hits |
| MISSING | No usable value; the reason is recorded | Bearing strength (field measurement required) |

## 1. NASA data

### Resources named in the challenge's Resources tab

The challenge lists NASA Earthdata Search, NASA Worldview, the NASA Planetary Data System (PDS), NASA LRO, and NASA LRO Diviner Lunar Data. ODYSSEY uses:

| Challenge resource | What ODYSSEY uses | Where |
|---|---|---|
| **NASA PDS** and **NASA LRO** | LRO LOLA gridded DEM `LDEM_45S_400M` (PDS data set `LRO-L-LOLA-4-GDR-V1.0`), downloaded from the PDS Geosciences Node (`https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/`) | `scripts/derive_planetary_reference.py` → `src/data/planetaryReference.json`; the lunar terrain reference in every comparison |
| **NASA LRO Diviner Lunar Data** | Diviner results used as published references: polar surface temperature range 50–250 K (Paige et al. 2010) and regolith thermal inertia 55 ± 2 J m⁻² K⁻¹ s⁻¹ᐟ² at 273 K (Hayne et al. 2017). Diviner gridded products themselves are not ingested (§5). | `src/data/planetaryThermal.json`, `server/science/profile.ts` |
| **NASA Worldview** (imagery served by GIBS) | MODIS Terra Corrected Reflectance true colour and VIIRS City Lights 2012 through the GIBS WMTS service that Worldview uses | `public/sites/*.jpg`, globe night texture |

### All NASA data used

| Source | Identifier and access | Resolution / period | Units | Purpose | Class | Limitations | Terms |
|---|---|---|---|---|---|---|---|
| NASA POWER | Climatology API `https://power.larc.nasa.gov/api/temporal/climatology/point`; parameters T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, WS2M, RH2M, ALLSKY_SFC_SW_DWN, AOD_55, GWETTOP, PS | 0.5° × 0.625° grid at the site; 2001–2020 | °C, mm/day, m/s, %, kWh m⁻² day⁻¹, kPa | Climate requirements; monthly windows | MODELED | Grid-cell climatology, not a station record | NASA, no restrictions |
| MODIS Aqua LST | `MYD11A1` v061 (`modis-11A1-061`, Planetary Computer STAC), bands LST_Day_1km, LST_Night_1km, QC | 1 km centre pixel; ≤ 12 clear-sky dates in a 3-month warm-season window (NH Jun–Aug 2023, SH Dec 2023–Feb 2024); QC bits 0–1 = 00; ≥ 4 accepted dates | K | Earth surface temperature, day/night and paired ΔT | MEASURED / DERIVED (ΔT) | Warm-season window only, not annual extremes | NASA LP DAAC, public |
| NASA GIBS | WMTS `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/`: MODIS_Terra_CorrectedReflectance_TrueColor (2020 dates), VIIRS_CityLights_2012 | Zoom 7 tiles; 500 m night lights | RGB | Site context images; globe night lights | Imagery (display only) | Not used for scoring | NASA, public domain |
| NASA Blue Marble 2002 | Visible Earth image 57752 (master via Wikimedia Commons) | 43,200 × 21,600 master, shipped ≤ 16,384 × 8,192 | RGB | Globe surface | Imagery (display only) | 2002 composite | Public domain |
| LRO LOLA | `LDEM_45S_400M`, PDS Geosciences Node | 400 m, 12.8 km window near the south pole | m → °, m | Lunar slope, relief, roughness at a 400 m baseline | DERIVED | One window; Earth compared at the same 400 m baseline | NASA PDS, public |
| MGS MOLA | MOLA 128/64 pixel-per-degree merged global COG `mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif` (USGS Astrogeology PDS services, `asc-pds-services` S3) | 463 m, Jezero window | m → °, m | Mars terrain at a 463 m baseline | DERIVED | Coarser than Earth DEM; compared at the same baseline | Public |
| NASA NSSDC fact sheets | Moon, Mars and Earth fact sheets (`nssdc.gsfc.nasa.gov/planetary/factsheet/`) | Body-wide constants | m/s², Pa, W/m², composition | Gravity, pressure, irradiance, atmosphere | PUBLISHED (quoted verbatim) | Global means | NASA, public |

### NASA mission literature used as published references

| Value | Source | Support |
|---|---|---|
| Lunar polar surface temperature 50–250 K | Paige et al. 2010, Science, doi:10.1126/science.1187726 (LRO Diviner) | Mission-level polar range |
| Lunar thermal inertia 55 ± 2 J m⁻² K⁻¹ s⁻¹ᐟ² at 273 K | Hayne et al. 2017, JGR Planets 122:2371, doi:10.1002/2017JE005387 (LRO Diviner) | Global regolith fines |
| Lunar longest continuous darkness ≈ 1.5 days | Mazarico et al. 2011, Icarus 211:1066, doi:10.1016/j.icarus.2010.10.030 (LRO LOLA) | Best-lit Shackleton rim point |
| Jezero air 216–222.5 K, surface 223–232 K | Rodriguez-Manfredi et al. 2023, Nature Geoscience, doi:10.1038/s41561-022-01084-0 (Mars 2020 MEDA) | Rover point record, sols 0–400 |
| Jezero thermal inertia 180–605 SI | Martínez et al. 2023, JGR Planets, doi:10.1029/2022JE007537 (MEDA) | Traverse, 3–4 m² footprint |
| Lunar median grain size 72 µm (40–130 µm) | Carrier 2005 (LPI); Carrier 1973, NTRS 19740027286 (Apollo/Luna samples) | Non-polar returned soils |
| Lunar south-pole lithology | Spudis et al. 2008, GRL 35:L14201, doi:10.1029/2008GL034468 | Regional description |
| Lunar surface dose 13.2 ± 1 µGy/h | Zhang et al. 2020, Science Advances, doi:10.1126/sciadv.aaz1334 (Chang'E-4, not NASA) | Far side, not the pole |

## 2. Space agency partner data

| Source | Identifier and access | Resolution / period | Units | Purpose | Class | Limitations | Terms and attribution |
|---|---|---|---|---|---|---|---|
| Copernicus DEM GLO-30 | `COP-DEM_GLO-30-DGED`, `copernicus-dem-30m` (AWS Open Data) | 30 m, resampled to 40 m site heightmaps (20.48 × 12.8 km) | m | Slope, roughness, flat fraction, relief, 3D terrain | DERIVED | Surface model (includes vegetation); relative vertical accuracy < 2 m (90% LE) on slopes ≤ 20% | Free with attribution: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |
| Copernicus DEM GLO-90 | `copernicus-dem-90m` (AWS Open Data) | 90 m | m | Discovery-candidate screening | DERIVED | Coarser | As above (WorldDEM-90) |
| Sentinel-2 L2A | Element 84 Earth Search STAC (`sentinel-2-l2a`), AWS Open Data | 10 m true colour, 2048 × 1280 px windows | Reflectance → RGB | Site imagery; generated-region imagery | Imagery (display only) | Not used for scoring | Copernicus Sentinel data terms; "Contains modified Copernicus Sentinel data" |
| ESA WorldCover 2021 | v200, Planetary Computer `esa-worldcover` | 10 m; 2021 | Land-cover class | Upper bound on rock exposure (bare/sparse class), 204 of 226 locations | PROXY | 76.7% overall accuracy; no coverage south of 60°S | CC BY 4.0, © ESA WorldCover project 2021 |
| CSA RADARSAT-1 | Archive via EODMS STAC and `radarsat-r1-l1-cog` (AWS) | Scene browse thumbnails | Relative amplitude | SAR context for discovery candidates (6 browse images) | Imagery (display only) | Historical; relative amplitude only | Released under an open licence by the Canadian Space Agency (challenge partner resource) |

## 3. Other scientific resources

| Source | Identifier and access | Resolution / period | Purpose | Class | Terms |
|---|---|---|---|---|---|
| WorldClim 2.1 | 10-minute bioclimatic and elevation grids, `geodata.ucdavis.edu/climate/worldclim/2_1/base` | ~18.5 km; 1970–2000 | Global H3 screen for generated regions (only per-region summary statistics are committed) | MODELED | No licence is stated on the WorldClim 2.1 page; citation requested: Fick & Hijmans 2017, Int. J. Climatology 37:4302. Raw rasters are not redistributed. |
| Natural Earth | `ne_110m_land` (GeoJSON); world-atlas `world-110m` | 1:110m | Land mask; maps | n/a | Public domain |
| Macrostrat | `macrostrat.org/api/geologic_units/map` | Varies by source map | Mapped lithology and age at site points | DERIVED (mapped interpretation) | CC BY 4.0 |
| OurAirports | `ourairports-data/airports.csv` | Points | Nearest airports, access distances | n/a | Public domain |
| Open-Meteo elevation | `api.open-meteo.com/v1/elevation` (Copernicus DEM-based) | 90 m | Site elevation in the curated table | DERIVED | CC BY 4.0, "Weather data by Open-Meteo.com" |
| Crossref REST API | `api.crossref.org` (via the optional Reranker) | n/a | Literature metadata for weight proposals | PENDING REVIEW until verified | Public API; metadata largely CC0 |
| Uber H3 | h3 / h3-js, resolution 4 | ~1,770 km² cells | Global screening grid | n/a | Apache-2.0 |
| Curated site table | `scripts/fetch_sites.py`, `scripts/enrich.py` | One value per site | Field access, dust and water indices; site tags | ESTIMATED (hand-assigned) | Project data |

## 4. Coverage and gaps

What each dataset covers, and why a value may be absent, is recorded per requirement in [`docs/science/REQUIREMENT_EVIDENCE_REGISTRY.md`](docs/science/REQUIREMENT_EVIDENCE_REGISTRY.md) and explained in [`docs/science/EVIDENCE_COVERAGE_AUDIT.md`](docs/science/EVIDENCE_COVERAGE_AUDIT.md).

## 5. Investigated but not integrated

These were identified and read but are **not** used. They are listed so the gaps they would close are visible.

| Source | Why not integrated |
|---|---|
| MERRA-2 `M2TMNXADG` dust deposition (DUDP001–005) | Requires NASA Earthdata Login (not configured) |
| EMIT L2B mineral identification | Requires NASA Earthdata Login |
| LRO Diviner polar gridded products (PDS) | Not yet ingested; only published ranges are used |
| LOLA polar maps, NASA PGDA product 69 (60–240 m/px) | Not yet ingested |
| Moon Mineralogy Mapper (M3), CRISM, MEDA time series | Not yet ingested |
| ISRIC SoilGrids, USDA gNATSGO | Rejected: soil composition is not bearing strength or grain size |
| MODIS apparent thermal inertia | Rejected: different quantity (K⁻¹), not SI thermal inertia |
| NASA Earthdata Search, JAXA G-Portal, RADARSAT Constellation Mission, ESA Open Science Catalog | Not used |

Details and access checks are in [`docs/science/DATASET_EXPANSION_REPORT.md`](docs/science/DATASET_EXPANSION_REPORT.md).
