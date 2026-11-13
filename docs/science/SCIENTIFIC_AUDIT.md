# Scientific Audit — ODYSSEY

Date: 2026-11-13  
Scope: actual code and data in this repository, not the design intent.

Labels: **VERIFIED** = read from code/data or tested. **ASSUMPTION** = inferred, not directly verified. **RECOMMENDATION** = proposed change.

---

## 1. Verified existing capabilities

| Capability | Status | Evidence |
|---|---|---|
| 39 candidate regions | **VERIFIED** | `src/data/odyssey.json` contains 39 sites |
| Mission decomposition into experiments/requirements | **VERIFIED** | `src/mission/decompose.ts`, `archetypes.ts`, `evaluate.ts` |
| Requirement-level evidence provenance | **VERIFIED** | `src/mission/metrics.ts`, `src/mission/types.ts` |
| Temporal monthly evaluation | **VERIFIED** | `src/temporal/engine.ts`, `src/data/siteMonthly.json` |
| Environmental gap/intervention analysis | **VERIFIED** | `src/interventions/` |
| Campaign search | **VERIFIED** | `src/campaign/engine.ts` |
| Real Sentinel-2 site imagery | **VERIFIED** | `src/data/siteImagery.json`, `public/sites/close/` |
| Real Copernicus GLO-30 terrain | **VERIFIED** | `src/data/siteTerrain.json`, `public/sites/terrain/` |
| Discovery mode with 107 extra candidates | **VERIFIED** | `src/data/discovery.json`, `src/components/DiscoveryMode.tsx` |
| RADARSAT-1 evidence for 6 candidates | **VERIFIED** | `src/data/discovery.json` `sar` blocks, `public/sar/` |

---

## 2. Candidate discovery

- The 39 regions are **manually predefined**, not algorithmically discovered.
  - 19 seeds in `scripts/fetch_sites.py` (`SITES`).
  - 20 more in `scripts/enrich.py` (`NEW_SITES`).
  - Coordinates are stored in `src/data/odyssey.json` (`lat`, `lon`).
- The discovery pipeline is a **manual seed list + API enrichment**, not a global search:
  - `fetch_sites.py` → base climate, elevation, imagery.
  - `enrich.py` → Macrostrat, AOD, soil wetness, airports, ML, campaigns.
  - `train_model.py` → ML surrogate.
  - `fetch_site_imagery.py` → Sentinel-2 crops.
  - `fetch_site_terrain.py` → Copernicus DEM heightmaps.
  - `derive_terrain_stats.py` → slope/roughness stats.
  - `fetch_site_monthly.py` → monthly NASA POWER normals.
- The system **can** discover locations outside the 39 only through the separate Discovery Engine:
  - `scripts/discover_candidates.py` uses 107 manually selected seeds, filters any seed within 80 km of a control, and enriches with NASA POWER, Copernicus GLO-90, Macrostrat and OurAirports.
  - It is **not** a global grid search; it is a curated screening set.
- No algorithmic candidate generation, tiling, clustering or global land-cover mask exists in the current pipeline.

---

## 3. Machine learning

### Models used

| Profile | Model | Code |
|---|---|---|
| Lunar base | RBF-SVR (`StandardScaler` + `SVR(C=100, gamma='scale', epsilon=0.5)`) | `scripts/train_model.py` |
| Mars landing | ExtraTreesRegressor (`500 trees`, max_depth 6) | `scripts/train_model.py` |
| Lunar expedition | RBF-SVR | `scripts/train_model.py` |

Candidate models compared during selection: RBF-SVR, ExtraTrees, GradientBoosting, RandomForest.

### Training data and labels

- Training set: **39 sites**, one row per site.
- Features (15): thermal mean, thermal amplitude, annual precipitation, humidity, wind, solar, elevation, local relief, aerosol, surface soil wetness, root-zone wetness, pressure, Macrostrat geology score, expert dust index, field access.
- Labels: `score_site_new()` in `scripts/enrich.py` — a **transparent expert rubric** total (0–100) built from target ranges and profile weights.
- **The labels are not independent ground truth.** The ML model is a surrogate for the rubric, not a measurement of analog quality.

### Evaluation

- `train_model.py`: **5-fold KFold**, random split over 39 sites. Not spatial or group cross-validation.
- Shipped metrics in `odyssey.json`:

| Profile | R² | MAE | Spearman | Pairwise |
|---|---:|---:|---:|---:|
| Lunar base | 0.782 | 3.36 | 0.877 | 0.850 |
| Mars landing | 0.829 | 3.80 | 0.892 | 0.866 |
| Lunar expedition | 0.787 | 4.16 | 0.896 | 0.869 |

- `enrich.py` contains a GroupKFold routine with jittered rows for model selection, but the **shipped metrics come from `train_model.py`** (random KFold).
- The README says “5-fold cross-validation on real sites”; that is accurate for `train_model.py`, but it does not establish spatial generalization.

### What scores represent

- `site.scores[profile].total` — rule-based weighted rubric score (0–100).
- `site.ml[profile].predicted` — surrogate prediction of that rubric score.
- Mission fit — requirement-level evidence score from `src/mission/evaluate.ts`, not the ML score.
- The ML score is displayed as **context**, not requirement evidence or proof.

### Uncertainty and missing data

- Uncertainty: 24 bootstrap SVR fits or ExtraTrees tree variance (`scripts/train_model.py`).
- Not calibrated; no conformal interval, no probability calibration.
- Missing features in `feature_vector()` are filled with defaults (`aerosol 0.2`, soil wetness `0.2`, pressure `101.3`). The mission engine, by contrast, marks missing evidence as `NO DATA` and never treats it as a pass.
- No explicit “missing feature” indicator reaches the ML model.

---

## 4. Scientific data inventory

| Dataset | Provider | NASA? | Resolution | Temporal | Coverage | Units | Use | Limitations |
|---|---|---|---|---|---|---|---|---|
| NASA POWER / MERRA-2 climatology 2001–2020 | NASA | Yes | 0.5° × 0.625°, point sample | Monthly normals | Global | °C, mm/day, %, m/s, kWh/m²/day, AOD, fraction, kPa | Climate, thermal, aridity, dust, pressure | Reanalysis, not station data; air temperature, not LST; monthly means suppress extremes |
| Copernicus DEM GLO-30 | ESA/DLR | No | 30 m source; 40 m heightmap | 2011–2015 static | Global land (public tile exceptions) | m | Elevation, slope, roughness, relief | DSM, not bare-earth; 40 m analysis window; not a metre-scale hazard survey |
| Sentinel-2 L2A | ESA/Copernicus | No | 10/20/60 m | 5-day revisit | 56°S–84°N systematic land; not Antarctica | reflectance | Site imagery | Clouds; no TIR; no mineral species |
| NASA GIBS / MODIS Terra | NASA | Yes | ~250 m–1 km imagery | Daily | Global | RGB imagery | Site thumbnails / visual context | Visualization, not quantitative analysis |
| NASA Blue Marble / Black Marble | NASA | Yes | Tiled 4K–16K rendering | 2002 / 2012 | Global | RGB | Globe rendering | Visual only |
| Macrostrat | Macrostrat | No | Mapped vector unit | Static/updated | Global, strongest North America | lithology/age | Geology tags | Regional unit, not outcrop or assay |
| Open-Meteo elevation | Open-Meteo | No | Point samples | Static | Global | m | Initial elevation/relief | Replaced by Copernicus DEM for terrain stats |
| OurAirports / OpenFlights | Community | No | Point | Static/daily | Global | airport, km, hours | Access/travel | Straight-line/planning estimate, not road/permit model |
| USGS Earthquake Catalog | USGS | No | Point | 1 year | Global | M4+ events | Seismic context | Not a site hazard survey |
| NASA PDS / LRO / MRO literature | NASA | Yes | — | — | — | — | Text/constants for Moon/Mars conditions | **No actual lunar/Mars data arrays were ingested before this sprint** |

### NASA challenge resources actually used

- NASA Earthdata / POWER: **used**.
- NASA GIBS / Worldview imagery: **used**.
- NASA PDS lunar/Mars data: **not used as data before this sprint**; only referenced in text.
- NASA LRO LOLA / Diviner / LROC, MRO MOLA / THEMIS / CRISM, MEDA/REMS: **not integrated** before this sprint.
- Partner agency data: Copernicus/Sentinel-2 and Copernicus DEM used; JAXA G-Portal, CSA RCM, ESA Open Science Catalog not used.

---

## 5. Earth-to-Moon/Mars comparison before this sprint

- **No actual planetary reference dataset was used.**
- Lunar/Mars targets were hardcoded ranges in `scripts/fetch_sites.py` (`PROFILES`) and text/requirement thresholds in `src/mission/`.
- `src/mission/metrics.ts` correctly marks gravity, vacuum, lunar night, radiation and other physical conditions as facility/missing, not site evidence.
- There was no measured lunar or Martian elevation, slope, roughness, temperature or mineralogy compared to an Earth site.
- The existence of Earth suitability scores did **not** mean a planetary analog comparison existed.

---

## 6. Scientific weaknesses

1. **Manual candidate set.** The 39 sites are curated, biased toward accessible/famous locations.
2. **ML labels are rubric scores.** High R² means the model reproduces the rubric, not that it predicts real analog quality.
3. **Random KFold, small N.** No spatial/group CV; 39 sites is small; no external validation.
4. **Imputation in ML features.** Missing climate/soil values are defaulted; this can hide evidence gaps.
5. **Point climate, not surface thermal.** NASA POWER air temperature is not MODIS/VIIRS LST; no thermal inertia.
6. **No mineralogy species.** Macrostrat lithology is not ASTER/EMIT mineralogy.
7. **No water/ice, subsurface or geotechnical evidence.** These remain explicit gaps.
8. **No calibrated uncertainty.** Bootstrap/tree variance is a spread, not a confidence interval.
9. **No actual planetary data before this sprint.** Hardcoded targets are not measurements.
10. **No field validation.** The system is a screening/planning prototype.

---

## 7. Highest-impact opportunities

1. **Real same-baseline planetary comparison** — implemented in this sprint (LOLA/MOLA vs Copernicus).
2. Replace hardcoded Moon/Mars target ranges with measured distributions from LOLA, Diviner, MOLA, THEMIS and MEDA/REMS.
3. Add mineralogy (EMIT/ASTER archive) and land surface temperature (MODIS/VIIRS) refinement.
4. Use spatial/group cross-validation and calibrated uncertainty for the ML surrogate.
5. Expand candidate discovery from 107 seeds to a tiled global screen with a land mask and STAC-first cache.
6. Add catalog/literature novelty checks and field-validation dossiers.

---

## 8. Exact files and components

| Area | Files |
|---|---|
| Candidate seeds / enrichment | `scripts/fetch_sites.py`, `scripts/enrich.py`, `scripts/discover_candidates.py` |
| ML | `scripts/train_model.py`, `src/types.ts`, `src/components/Model.tsx` |
| Mission requirements | `src/mission/archetypes.ts`, `decompose.ts`, `evaluate.ts`, `metrics.ts`, `types.ts` |
| Temporal | `src/temporal/engine.ts`, `src/components/TemporalStage.tsx` |
| Interventions | `src/interventions/`, `src/components/InterventionsStage.tsx`, `ConditionShell.tsx` |
| Campaign | `src/campaign/engine.ts`, `src/components/CampaignStage.tsx` |
| Data | `src/data/odyssey.json`, `siteMonthly.json`, `siteTerrain.json`, `siteImagery.json`, `discovery.json` |
| Site Orbit | `src/components/SiteOrbit.tsx` |
| New planetary comparison | `src/components/PlanetaryComparison.tsx`, `src/planetary.css`, `src/data/planetaryReference.json`, `scripts/derive_planetary_reference.py` |

---

## 9. Bottom line

ODYSSEY had strong **Earth evidence provenance**, a working mission/temporal/campaign engine, and a real discovery mode. Its weakest scientific link was the **planetary reference**: Moon/Mars were target ranges and text, not measured data.

This sprint fixes the narrowest, highest-value part of that gap: a real, same-baseline **terrain comparison** using LRO LOLA and MGS MOLA, exposed in Site Orbit with units, datums, match labels and explicit non-comparisons. It does not claim to compare gravity, vacuum, atmosphere, radiation, temperature or mineralogy.
