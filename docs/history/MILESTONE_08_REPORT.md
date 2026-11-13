# MILESTONE 08 REPORT
## Global Candidate Discovery

**Status:** implemented and verified  
**Methodology version:** `m8-v1.2`  
**Discovery data:** `src/data/globalDiscovery.json`  
**Pipeline:** `scripts/global_discovery.py`  
**Data fetcher:** `scripts/fetch_global_discovery_data.py`  
**Tests:** `scripts/test_global_discovery.py`  
**UI:** `src/components/GeneratedDiscovery.tsx`, `src/generatedDiscovery.css`, entry point in `src/components/DiscoveryMode.tsx`

---

## 1. Audit findings

The existing discovery layer is a curated candidate engine, not a global search.

- `scripts/discover_candidates.py` contains a literal `SEEDS = [S(...), ...]` list of 107 candidate coordinates. The file then enriches those supplied coordinates with NASA POWER, Copernicus DEM, Macrostrat and OurAirports. `src/data/discovery.json` is the output of that pipeline.
- `scripts/fetch_sites.py` and `src/data/odyssey.json` supply the 39 curated control sites. `scripts/enrich.py` adds a further set of hand-written sites and fits surrogate models.
- `src/discovery/engine.ts` scores only the candidates that are already in `discovery.json`. It does not generate coordinates.
- `src/components/DiscoveryMode.tsx` displays the 107 supplied candidates. `src/OrbitalExperience.tsx` and `src/components/SiteOrbit.tsx` accept curated `Site` objects with pre-fetched Sentinel-2 imagery and Copernicus terrain. A coordinate alone cannot enter DIVE.
- Therefore the previous claim of "discovery beyond the 39" was true only in the sense of a manually assembled 107-site extension. It was not algorithmic geographic discovery.

Data availability:

| Source | Coverage | Access mode | Suitable for every global cell? |
|---|---|---|---|
| WorldClim 2.1 10 arc-minute | Global land | Local GeoTIFF | Yes, 6 rasters, ~1.5 GB unpacked |
| Natural Earth 1:110m land | Global | Local GeoJSON | Yes |
| OurAirports | Global airports | Local CSV/JSON | Yes, one nearest-airport lookup |
| Copernicus DEM GLO-90 | Near-global | Per-tile COG/STAC | No, too expensive for 288k cells |
| NASA POWER | Point API | Per-point HTTP | No, thousands of requests |
| Macrostrat | Vector/API | Per-point lookup | No, per-candidate enrichment only |
| Sentinel-2 L2A | Partial, cloud/polar-night gaps | STAC/COG | No, reserved for Site Orbit enrichment |

The 107 seeds were not selected by a documented global sampling rule. They cluster around manually interesting impact, volcanic, polar, cave and arid localities. The manual list under-represents Antarctica's interior, the high Arctic, Central Asia, Siberia and remote islands. That is a selection bias, not a data-availability exclusion.

The existing ML surrogate was trained on expert-scored curated sites with random KFold (and a grouped variant in `scripts/enrich.py`). Neither is spatial cross-validation over the globe. It cannot legitimately rank arbitrary H3 cells, so this milestone does not use it for generated regions. All generated screening is rule-based and profile-specific.

Integration path chosen:

1. Keep the 39 and 107 records untouched.
2. Write generated regions to a separate `src/data/globalDiscovery.json`.
3. Add a restrained `GENERATED / 80` entry point inside the existing Discovery Engine.
4. Reuse the same full-screen Discovery shell and globe projection, but give generated data an amber visual language.
5. Disable DIVE for generated regions until high-resolution imagery and terrain are actually enriched. Do not fabricate detail.

---

## 2. Spatial generation methodology

The generator uses **H3 resolution 4**, an equal-area hierarchical hexagonal index.

- Deterministic universe: all H3 resolution-0 cells are expanded to resolution 4.
- Total cells: **288,122**.
- Average cell area: **1,770.3 km²**; average edge length: **26.07 km**.
- Cell IDs are the H3 cell strings, for example `84e741dffffffff`.
- No catalogue coordinate is read during generation, sampling, scoring or clustering.
- Candidate ID: `GD-<representative H3 cell>`.
- Representative cell: the highest-scoring cell in the cluster, with cell ID as a deterministic tie-breaker.
- Representative point: the highest-scoring cell in the cluster, with cell ID as a deterministic tie-breaker. It is not a geographic centroid.
- Incremental processing: a cell-feature cache is keyed by methodology version, H3 resolution, variable list, land source and airport source. It is written every 10,000 cells and reused on later runs. `--refresh` forces resampling.

The build sequence is:

```
all H3 res-4 cells
  -> Natural Earth land mask
  -> WorldClim sample (bio1, bio5, bio6, bio12, bio15, elev)
  -> local relief/slope from a 5x5 elevation window
  -> nearest scheduled airport distance
  -> transparent profile dimensions
  -> candidate cells above the profile threshold
  -> bounded seed-and-grow clustering
  -> region aggregation and footprint union
  -> novelty classification against all 146 catalogue coordinates
  -> 80 km spatial deduplication
  -> category-balanced output selection
```

Reproduction:

```bash
python3 scripts/fetch_global_discovery_data.py
python3 scripts/global_discovery.py
python3 -m unittest scripts/test_global_discovery.py -v
```

The fetcher caches WorldClim bio/elevation ZIPs, Natural Earth land GeoJSON and the filtered OurAirports JSON. It does not redownload existing files unless `--refresh` is passed.

---

## 3. Global coverage and exclusions

Final run, `m8-v1.2`:

| Stage | Count | Meaning |
|---|---:|---|
| H3 cells generated | 288,122 | Full global grid at resolution 4 |
| Water cells | 206,343 | Not land according to Natural Earth 1:110m |
| Land cells | 81,779 | Land mask positive |
| Usable land cells | 81,575 | Have finite WorldClim climate and elevation |
| Missing climate/elevation | 204 | Land cell excluded from screening; counted, not imputed |
| Candidate cells | 43,721 | At least one profile score >= 58 and profile gates passed |
| Below profile threshold | 37,854 | Usable land cells that did not pass any profile |
| Raw clusters | 4,792 | Seed-and-grow regions of at least 2 cells |
| Spatial duplicates removed | 116 | Region centres closer than 80 km |
| Output regions | 80 | Category-balanced selection |

Exclusion rules:

- **Water** is excluded using the actual Natural Earth polygon mask. No country, biome or political boundary is used.
- **Polar, island and remote land is retained.** There is no artificial exclusion for latitude, isolation, ice or imagery availability.
- **Missing climate/elevation** is recorded as `missing_climate_or_elevation`; it is never treated as a negative observation or imputed.
- **Profile gate failure** is not an environmental exclusion. A region may fail lunar base because it is not polar, while still passing Mars landing.
- Natural Earth 1:110m can misclassify small islands and coastlines at H3 cell scale. This is a documented coarse-mask limitation, not a hidden exclusion.

The output is a bounded screening run, not a claim of global completeness. Four thousand seven hundred ninety-two clusters were reduced to 80 regions by score, category balance and deduplication.

---

## 4. Spatial resolution

| Property | Value |
|---|---|
| Index | H3 |
| Resolution | 4 |
| Average cell area | 1,770.3 km² |
| Average cell edge | 26.07 km |
| Elevation/relief window | 5 × 5 WorldClim cells, ~92 km across |
| Maximum region size | 19 cells, ~33,637 km² |
| Minimum region size | 2 cells, ~3,540 km² |
| Deduplication distance | 80 km, configurable with `--dedup-km` |

The 80 km rule is **centre-to-centre**, roughly 1.5 H3 cell diameters. It prevents two region centres from being emitted for the same local landscape, but it does not guarantee that two region footprints never touch. The threshold is deliberately configurable and recorded in the output.

The 10 arc-minute WorldClim grid (~18.5 km) is coarser than the H3 cell. An H3 cell centre therefore samples one climate/elevation pixel, while relief and slope use the surrounding 5 × 5 pixel window. The output must not be read as 1,770 km² of uniform measured terrain.

---

## 5. Dataset inventory and provenance

| Dataset | Product / version | Resolution | Period | Role | Coverage and missing behavior |
|---|---|---|---|---|---|
| WorldClim 2.1 | `wc2.1_10m_bio_1/5/6/12/15`, `wc2.1_10m_elev` | 10 arc-minutes (~18.5 km) | 1970-2000 | Temperature, precipitation, seasonality, elevation | Global land; ocean and some coastal cells nodata. Native °C and mm values verified by direct sampling. |
| Natural Earth | `ne_110m_land` | 1:110 million | Current vector | Land mask | Global land polygons; water excluded only. Small-island generalization is a known limitation. |
| OurAirports | Scheduled large/medium airports | Point records | Current snapshot | Access proxy | Global airport points; straight-line spherical distance. No roads, permits or seasonal access. |
| Copernicus DEM GLO-90 | Not used in the global screen | 90 m | 2011-2015 | Reserved for top-N enrichment | Too expensive for 288k cells in this environment. |
| NASA POWER | Not used in the global screen | 0.5 × 0.625° | 2001-2020 | Reserved for top-N enrichment | Point API; not a global raster in this run. |
| Macrostrat | Not used in the global screen | Vector | Variable | Reserved for top-N enrichment | Per-candidate lookup; not a global raster. |
| Sentinel-2 L2A | Not used in the global screen | 10 m | Current | Site Orbit only | Coverage and illumination gaps; generated regions have no Site Orbit asset. |

Temperature units: the downloaded WorldClim 2.1 10-minute `bio1` raster contains native degrees Celsius (for example 26.0 at the Thar Desert and -52.7 in Antarctica). The earlier assumption that the 10-minute product stores °C × 10 was checked against the raster and rejected. The pipeline now uses the native values and records this in `datasets.worldclim.temperatureUnits`.

All source identifiers, versions, paths and URLs are stored in `globalDiscovery.json` under `datasets`. Per-region `evidence` repeats the climate, terrain, land and access provenance.

---

## 6. Screening architecture

### Stage A - coarse global features

For every usable land cell:

| Feature | Definition | Unit |
|---|---|---|
| `tempMeanC` | WorldClim `bio1` | °C |
| `tempMaxC` | WorldClim `bio5` | °C |
| `tempMinC` | WorldClim `bio6` | °C |
| `precipYearMm` | WorldClim `bio12` | mm y⁻¹ |
| `precipSeasonality` | WorldClim `bio15` | % |
| `elevationM` | WorldClim `elev` | m |
| `reliefM` | max - min elevation in 5 × 5 window | m |
| `slopeDeg` | mean gradient angle in the same window | degrees |
| `absLat` | absolute cell latitude | degrees |
| `accessKm` | nearest scheduled large/medium airport | km |

### Stage B - profile rules

Three profile rule sets are independent. A cell may pass one, several or none.

| Profile | Weights | Gate |
|---|---|---|
| Lunar base | thermal 30, aridity 25, terrain 25, polar 20 | `abs(lat) >= 55`; terrain >= 0.35 when present |
| Lunar expedition | thermal 20, aridity 20, terrain 35, access 15, polar 10 | terrain >= 0.50 when present |
| Mars landing | thermal 25, aridity 25, terrain 30, seasonality 10, access 10 | terrain >= 0.35 when present |

Dimension definitions:

- `thermal`: lunar profiles use `lower(temp, -10, 25)`; Mars uses `lower(temp, 5, 20)`.
- `aridity`: `lower(precip, 150, 450)`.
- `terrain`: `0.65 * clamp(relief / 200 m) + 0.35 * band(slope, 1, 30, 5)`.
- `polar`: `higher(abs(lat), 55, 25)`.
- `seasonality`: `higher(bio15, 20, 35)`.
- `access`: `clamp(1 - log10(1 + distance_km) / 3.2)`.

Score and coverage:

```
score = sum(weight[d] * dimension[d] for present d) / sum(weight[d] for present d)
coverage = sum(weight[d] for present d) / sum(all weights)
```

Missing dimensions are omitted from both numerator and denominator. They are never replaced by zero, a global mean or a negative value. A profile is not scored when its structural gate fails (for example lunar base outside the polar latitude band); the UI shows `PROFILE GATE NOT MET`.

No ML surrogate is used. No output field is called a probability. Scores saturate at 100 by construction; 64 of 80 output regions score at least 90. That is a ranking artefact of clipped rule dimensions, not a claim that the regions are 90-100% likely to be mission-successful.

### Stage C - detailed enrichment

Not run for all global cells. The existing Copernicus DEM, NASA POWER, Macrostrat, Sentinel-2 and Site Orbit integrations are reused only by the curated pipelines and remain the intended enrichment path for the top generated regions. Generated regions are therefore marked as coarse-screen only and their DIVE action is disabled.

If enrichment is added later, the correct order is: take a bounded top-N, fetch DEM and imagery through the existing cached/rate-limited pipeline, attach source-level provenance, then allow Site Orbit. The current UI explicitly states that this has not happened.

---

## 7. Clustering methodology

A collection of adjacent pixels is not a region, and one contiguous landscape should not appear many times.

1. Sort candidate cells by `bestScore` descending, then H3 cell ID.
2. Take the highest-scoring unassigned cell as a seed.
3. Grow through adjacent H3 cells up to two rings.
4. Accept a neighbour only if it is a candidate and its score is within 15 points of the seed.
5. Stop at 19 cells.
6. Mark every accepted cell assigned so a cell belongs to one region.
7. Drop groups smaller than 2 cells.
8. Compute region-level mean/min/max/count for every feature.
9. Compute region-level profile maximum, mean and coverage.
10. Build the union footprint from H3 cell boundaries and store every cell ID and boundary.
11. Sort regions by score, cell count and ID.
12. Remove region centres closer than 80 km to an already kept region.
13. Select 80 regions with category balance.

Category buckets are descriptive, not biological classifications:

- `polar`: mean absolute latitude >= 60.
- `hyper_arid`: mean annual precipitation <= 150 mm.
- `high_relief`: mean local relief >= 500 m.
- `remote`: mean nearest-airport distance >= 500 km.
- `moderate_relief`: mean relief >= 200 m.
- `other`: everything else.

Selection takes at least five from each represented category, then fills by score with a per-category cap derived from `ceil(80 / 6) = 14`, then fills any remaining slots by score if a category is genuinely scarce. Final distribution: polar 20, high relief 14, hyper-arid 14, moderate relief 14, other 14, remote 4. Remote land is scarce under the 500 km access threshold; the output does not pad it with fabricated regions.

Region size range: 4 to 19 cells (7,081 to 33,637 km²). The output preserves `cells`, `cellGeometry`, `bbox`, `footprint`, `representativeCell` and `areaKm2`.

---

## 8. Novel candidate regions

All coordinates below come from the algorithmic run. None was inserted manually. Each row is a genuinely new region at least 80 km from every one of the 146 existing catalogue coordinates.

| ID | Generated label | Representative lat / lon | Cells / area | Score / profile | Coarse evidence | Nearest catalogue |
|---|---|---|---:|---|---|---|
| `GD-84e741dffffffff` | polar hyper-arid high-relief region | -71.75, 11.97 | 19 / 33,637 km² | 100.0 / lunar base | -20.2 °C; 107 mm y⁻¹; relief 1,024 m; access 4,013 km | `jamesross` seed, 2,792 km |
| `GD-8425169ffffffff` | cold arid high-relief region | 48.99, 90.02 | 19 / 33,637 km² | 97.1 / Mars landing | -3.8 °C; 160 mm y⁻¹; relief 1,293 m; access 71 km | `turpan` seed, 607 km |
| `GD-8420887ffffffff` | cold hyper-arid high-relief region | 37.86, 75.23 | 19 / 33,637 km² | 95.7 / Mars landing | -2.4 °C; 98 mm y⁻¹; relief 1,667 m; access 73 km | `tianshuihai` seed, 281 km |
| `GD-84245c3ffffffff` | cool arid moderate-relief region | 43.46, 111.61 | 19 / 33,637 km² | 93.0 / Mars landing | 4.2 °C; 160 mm y⁻¹; relief 203 m; access 70 km | `gobi` control, 640 km |
| `GD-8420265ffffffff` | cool arid low-relief region | 47.46, 66.88 | 19 / 33,637 km² | 91.0 / Mars landing | 5.7 °C; 167 mm y⁻¹; relief 195 m; access 96 km | `taklamakan` seed, 1,453 km |
| `GD-8414725ffffffff` | cold moist moderate-relief region | 57.12, 133.54 | 7 / 12,392 km² | 78.2 / lunar base | -8.4 °C; 531 mm y⁻¹; relief 480 m; access 542 km | `kamchatka` control, 1,543 km |

These six span all six output categories: polar, high relief, hyper-arid, moderate relief, other and remote. They are not the only new regions: the output contains **70 new**, 9 catalogue-adjacent and 1 catalogue overlap.

The first region's 19 cell IDs are recorded in the JSON, beginning with `84e7403ffffffff`, `84e7401ffffffff`, `84e7407ffffffff`. The representative cell `84e741dffffffff` is the highest-scoring member; it is not the only cell that survived.

### Why they survived

- `GD-84e741dffffffff`: lunar-base rule set, score 100, coverage 100%. Thermal 100, aridity 100, polar 100, terrain 98. Mean annual temperature -20.2 °C, annual precipitation 107 mm, relief 1,024 m. It is extremely remote (4,013 km to the nearest scheduled airport), which is a real limitation for a base even though the lunar-base rule set does not weight access.
- `GD-8425169ffffffff`: Mars-landing set, score 97.1, coverage 100%. Thermal 100, seasonality 100, terrain 99, aridity 95. Cold high-relief terrain in the Altai, with 1,293 m mean relief and 71 km access.
- `GD-8420887ffffffff`: Mars-landing set, score 95.7, coverage 100%. Aridity 100, seasonality 100, terrain 99, thermal 99. Mean precipitation 98 mm and relief 1,667 m on the Tibetan Plateau margin.
- `GD-84245c3ffffffff`: Mars-landing set, score 93.0, coverage 100%. Seasonality 100, thermal 100, aridity 97, terrain 89. A moderate-relief arid region in Inner Mongolia, not a famous named analog.
- `GD-8420265ffffffff`: Mars-landing set, score 91.0, coverage 100%. Seasonality 98, thermal 96, aridity 96, terrain 83. A low-relief cold arid region in Kazakhstan.
- `GD-8414725ffffffff`: lunar-base set, score 78.2, coverage 100%. Polar 100, terrain 96, thermal 94, aridity 15. This is a cold moist region; it demonstrates that the screen can nominate non-desert terrain when polar and thermal dimensions dominate. Its weak aridity is visible rather than hidden.

### Catalogue-adjacent and overlap examples

| Class | ID | Distance | Nearest | Why it matters |
|---|---|---:|---|---|
| nearby | `GD-8403543ffffffff` | 78.7 km | `wardhunt` seed | High Arctic land close to a manual seed |
| nearby | `GD-84ed5cdffffffff` | 17.1 km | `melbourne` seed | Antarctic coast near an existing seed |
| nearby | `GD-84035edffffffff` | 17.3 km | `ellesmere` seed | Ellesmere Island rediscovery |
| nearby | `GD-8402283ffffffff` | 19.2 km | `axelheiberg` control | Control-adjacent polar terrain |
| nearby | `GD-8424943ffffffff` | 39.8 km | `qaidam` control | Qaidam Basin margin |
| existing | `GD-84f3b5dffffffff` | 9.1 km | `dryvalleys` control | Algorithmic rediscovery of a known control |

The existing overlap is preserved, not discarded. It is evidence that the screen can rediscover a known analog, but it is not counted as a new discovery. All 39 controls and all 107 seeds remain unchanged in `odyssey.json` and `discovery.json`.

---

## 9. Evidence for why each region was selected

Every output region stores:

- `profiles.<profile>.max`, `.mean`, `.coverageMean`, `.cells` and `.dimensions` (per-dimension 0-100).
- `rationale.profile`, `.profileLabel`, `.score`, `.coverage`, `.strongest` and `.observations`.
- `features.<feature>.mean/min/max/n`.
- `dataCompleteness` (10 of 10 coarse feature groups for all 80 regions).
- `evidence` strings for climate, terrain, land and access.
- `missing` list: humidity, wind, solar irradiance, aerosol/dust, geology, high-resolution DEM, Sentinel-2 imagery, field validation.

The dossier shows the strongest four rule dimensions as bars, the measured means, the per-profile screen, the measured min/max/n range and the missing-evidence chips. A user can inspect the region's union footprint and every H3 cell outline on the map.

No generated region has high-resolution DEM or Site Orbit imagery. The dossier says so directly and disables DIVE. The `EXPORT REGION` action downloads the full generated record as JSON for later enrichment.

---

## 10. Comparison with the original 146 candidates

Novelty is measured from every member cell of a generated region to every one of the 39 control and 107 seed coordinates. The minimum distance determines the class:

- `< 10 km`: `existing` (catalogue overlap)
- `10-80 km`: `nearby` (catalogue-adjacent)
- `>= 80 km`: `new`

Final comparison:

| Class | Displayed regions | Share of 80 | Detected after dedup |
|---|---:|---:|---:|
| New | 70 | 87.5% | 4,427 |
| Catalogue-adjacent | 9 | 11.25% | 234 |
| Catalogue overlap | 1 | 1.25% | 15 |
| Total | 80 | 100% | 4,676 |

The 80-region display is deliberately new-focused: it contains 1 overlap and 9 adjacent examples, not all 249 detected known/nearby clusters. To avoid silently discarding known locations, every deduplicated existing or nearby region is retained in the output's `knownRegions` audit list with its class, distance, nearest catalogue record and a `selected` flag. The method drawer states the detected total and the displayed subset.

The five required demonstrations are present with exact cell IDs and measured evidence. The test suite independently recomputes the minimum distance from each new region's cells to all 146 coordinates and asserts it is at least 80 km; it does not trust the stored `noveltyKm` value.

The 107 manual seeds are still a useful control set, but they are no longer the only path to a candidate. The generated layer is separate and additive.

---

## 11. Mission-profile evaluation

Profiles remain independent and multidimensional.

| Profile | Best profile in output | Present in output | Gate behavior |
|---|---:|---:|---|
| Lunar base | 22 | 22 | Requires polar latitude and terrain >= 0.35; fails for 58 regions |
| Lunar expedition | 0 | 80 | Terrain >= 0.50; all 80 pass |
| Mars landing | 58 | 80 | Terrain >= 0.35; all 80 pass |

The best-profile counts are not a quality ranking across profiles. They show which rule set produced the highest score for each region. A region can be strong for Mars landing and not eligible for lunar base because it is not polar.

Per-dimension evidence is preserved. For example, `GD-8414725ffffffff` shows polar 100, terrain 96, thermal 94 and aridity 15, so the weak aridity is visible. `GD-8420887ffffffff` shows aridity 100, seasonality 100, terrain 99 and thermal 99, with access 73 km.

The 39-site ML surrogate is not used anywhere in this pipeline. No output field is labeled as a probability, confidence, or validated analog success rate. The screen score is a transparent weighted mean over clipped rule dimensions, with coverage reported separately.

---

## 12. Performance and caching

| Operation | Result |
|---|---|
| Full first run, no cell cache | ~45 s |
| Cached re-run | ~32 s |
| Global H3 cells | 288,122 |
| Land mask raster | 2,160 × 1,080 |
| Cell feature cache | ~56 MB JSON |
| Downloaded source data | ~151 MB |
| Output JSON | ~1.3 MB, including per-cell footprints |

The local raster screen makes no per-cell HTTP requests. WorldClim, Natural Earth and OurAirports are downloaded once. The cell cache stores sampled features, dimension scores and profile scores keyed by methodology signature. A cache mismatch invalidates the cache automatically. The cache is written every 10,000 cells so an interrupted run can resume.

The pipeline is not distributed and does not attempt H3 resolution 5. That would multiply the cell count by roughly seven and is unnecessary for a bounded prototype.

---

## 13. Tests and screenshots

### Python tests

`scripts/test_global_discovery.py` contains 22 tests, all passing:

- deterministic H3 grid generation and exact cell count;
- stable candidate IDs derived from representative cells;
- Natural Earth land mask with a synthetic polygon fixture;
- missing-dimension masking and coverage reduction;
- independent profile gates;
- adjacent clustering and non-absorption of incoherent neighbours;
- feature aggregation over observed values only;
- spatial deduplication;
- preservation of existing and nearby regions during selection;
- existing/nearby/new novelty classification;
- haversine sanity check;
- generated labels matching region means and category;
- missing means not becoming zero;
- output coverage, unique IDs, valid H3 cells, at least five new regions;
- existing and nearby preservation in the output;
- multidimensional profiles and missing-evidence lists;
- no ML score fields in the generated data;
- independent recomputation of new-region distance to all 146 catalogue coordinates.

Run:

```bash
/tmp/opencode/odyssey-venv/bin/python -m unittest scripts/test_global_discovery.py -v
```

Result: **22 tests, OK**.

### Build and lint

- `npm run build`: TypeScript project build and Vite production build pass.
- `npm run lint`: 0 errors. Four pre-existing `react(set-state-in-effect)` warnings remain in `Briefing.tsx`, `Planner.tsx`, `LiveConditions.tsx` and `MissionControl.tsx`; none is in the new code.
- Vite reports the existing large-chunk warning. The generated JSON is imported into the client bundle; this is acceptable for the prototype but is a candidate for lazy loading later.

### Playwright verification

Manual Playwright checks were run against the Vite dev server at 1440 × 900 and 900 × 800:

- opening screen → Discovery Engine → curated 107 candidate dossier (Ellesmere Island);
- curated site Lanzarote → DIVE → Site Orbit → PLANETARY terrain comparison, with real LOD/MOLA evidence visible;
- Discovery Engine → GENERATED / 80;
- five new regions verified by representative cell ID:
  - `84e741dffffffff` (Antarctica)
  - `8425169ffffffff` (Altai)
  - `8420887ffffffff` (Tibet margin)
  - `84245c3ffffffff` (Inner Mongolia)
  - `8414725ffffffff` (Siberia)
- one catalogue-adjacent region (`CATALOGUE-ADJACENT` label and distance);
- one catalogue overlap (`GD-84f3b5dffffffff`, 9.1 km to Dry Valleys);
- missing-evidence panel and disabled DIVE state;
- method drawer with grid, datasets, exclusions, clustering and limitations;
- narrow viewport layout with map first and readable stacked panels;
- zero console errors throughout.

Screenshots:

- `img/generated-discovery.png` - main generated layer, selected Antarctic region, footprint, rationale and profile screen.
- `img/generated-discovery-method.png` - method drawer with data and exclusion counts.
- `img/generated-discovery-missing-evidence.png` - measured ranges, provenance, missing evidence and disabled DIVE.
- `img/generated-discovery-catalogue-overlap.png` - explicit catalogue overlap and footprint.
- `img/generated-discovery-narrow.png` - 900 px layout.

### Existing regression checks

- Curated site DIVE and Site Orbit still open with real Sentinel-2 imagery and terrain.
- PLANETARY terrain comparison still opens and reports measured LOLA/MOLA comparisons.
- The 39-site and 107-seed Discovery Mode still loads, filters, ranks and opens dossiers.
- No `odyssey.json` or `discovery.json` records were changed.

---

## 14. Scientific limitations

1. **Coarse climate.** WorldClim 10 arc-minutes (~18.5 km) cannot resolve caves, lava tubes, moraines, mineralogy, regolith, dust or local hazards. The H3 cell is ~1,770 km²; the climate sample is one pixel per cell.
2. **Climatology, not weather.** WorldClim 1970-2000 is a long-term norm, not a mission window or forecast. The existing NASA POWER monthly layer is not attached to generated regions.
3. **Terrain approximation.** Relief and slope come from a 5 × 5 WorldClim elevation window (~92 km). They are not Copernicus GLO-30 measurements. Mean slope is smoothed and can understate local relief.
4. **Access proxy.** Straight-line distance to a scheduled large/medium airport ignores roads, permits, seasonal access, ice and political constraints.
5. **Missing higher-tier evidence.** No generated region has humidity, wind, solar irradiance, aerosol/dust, mapped geology, high-resolution DEM, Sentinel-2 Site Orbit imagery or field validation. The UI states this explicitly.
6. **Complete coarse covariates, incomplete higher-tier evidence.** All 80 output regions have 10 of 10 coarse feature groups. The "incomplete data" case is therefore represented by the categorical missing-evidence list and by profile gates (`PROFILE GATE NOT MET`), not by a missing WorldClim value. The 204 land cells with missing climate/elevation are counted and excluded from the screen.
7. **Score saturation.** Many polar lunar-base regions reach 100 because multiple clipped dimensions hit their maximum. Scores rank candidates; they are not probabilities. The category-balanced selection mitigates but does not eliminate this.
8. **Generic labels.** Labels are descriptive generated strings, not official place names. Fifteen distinct label strings cover 80 regions. Coordinates and H3 IDs disambiguate them.
9. **Selection is not exhaustive.** 4,792 clusters were reduced to 80 by score, category balance and 80 km deduplication. A different selection policy would produce a different set.
10. **Land-mask generalization.** Natural Earth 1:110m can misclassify small islands and coastlines. No global land-cover product was used in this run.
11. **No global ML.** The existing surrogate is trained on 39 curated expert-scored sites with random KFold or grouped KFold; it is not spatially validated over the globe and is not used here.
12. **No physical equivalence.** Earth does not reproduce lunar gravity, vacuum, radiation or permanent-shadow illumination, nor the Martian 6 mbar CO2 atmosphere, gravity, dust storms or oxidant chemistry. A generated region is an Earth analog candidate, not a Moon or Mars substitute.

---

## 15. Remaining work

1. **Top-N enrichment.** Select a bounded number of generated regions (for example 10-20) and fetch Copernicus GLO-30 terrain, NASA POWER monthly climatology, Macrostrat geology and Sentinel-2 imagery through the existing cached/rate-limited pipelines. Attach per-source provenance and enable DIVE only when the assets exist.
2. **Higher-resolution screening.** Add ESA WorldCover or a comparable land-cover mask and a higher-resolution DEM summary for candidate cells. Keep the coarse and fine evidence separate.
3. **Atmospheric and surface dimensions.** Add humidity, wind, solar irradiance, aerosol/dust and geological diversity once globally available at a defensible resolution. Do not infer them from the existing point layers.
4. **Scoring calibration.** Reduce ceiling effects, test weight sensitivity, and report score distributions rather than only maxima. Keep the rule-based score separate from any learned model.
5. **Spatial cross-validation.** If a learned model is ever used for global ranking, train and validate with spatially blocked folds and explicitly report extrapolation limits. Do not reuse the 39-site random-KFold result as global validation.
6. **Selection policy.** Make category quotas, deduplication distance and maximum region size explicit CLI parameters. Add an option to export all 4,792 clusters, not only the selected 80.
7. **UI.** Add a category-grouped sort, a region-to-region comparison, and a clear path from an enriched generated region into Site Orbit. Keep the planet as the primary interface.
8. **Data versioning.** Store checksums for the WorldClim, Natural Earth and OurAirports inputs in the output. Add a `--verify-data` mode.
9. **Full Playwright suite.** Convert the manual checks into repository tests, including the generated layer, curated layer, Site Orbit and terrain comparison.
10. **Global completeness statement.** Keep the output explicitly bounded: 288,122 H3 cells, 81,779 land cells, 4,792 clusters, 80 selected regions. Do not describe it as a complete global catalogue.

---

## Acceptance summary

| Requirement | Result |
|---|---|
| Generate candidates without reading the 39/107 seeds | Yes. Catalogue read only after clustering for novelty and preservation |
| At least five genuinely new regions | Yes. 70 new regions; six documented with cell IDs and measured evidence |
| Actual spatial data | Yes. WorldClim 2.1, Natural Earth 1:110m, OurAirports |
| Transparent exclusions | Yes. Water, missing climate/elevation and profile thresholds are counted |
| Missing data distinguished | Yes. Masked dimensions, coverage, missing-evidence list, profile gates |
| Deterministic IDs | Yes. `GD-<H3 cell>`; tested |
| Spatial clustering | Yes. Seed-and-grow, 2 rings, 19-cell cap, 15-point coherence, 80 km dedup |
| Enter existing experience | Yes. Generated layer inside Discovery Engine; curated flow preserved |
| No false Moon/Mars equivalence | Yes. Dossier and method drawer state the residual gaps |
| Every candidate inspectable | Yes. Footprint, cell IDs, rationale, profiles, ranges, provenance, missing evidence |
| Tests and verification | 22 Python tests, build, lint, Playwright, existing terrain/orbital regression checks |
| Report and commit | This report; commit after verification |
