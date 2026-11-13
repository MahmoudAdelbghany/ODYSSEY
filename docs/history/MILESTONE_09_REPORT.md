# MILESTONE 09 REPORT
## Generated Region Enrichment

**Status:** implemented and verified  
**Enrichment version:** `m9-enrichment-v1`  
**Selection version:** `m9-selection-v1`  
**Deduplication audit:** `m9-dedup-v1` / `m9-groups-v1`  
**Selection:** `src/data/generatedEnrichmentSelection.json`  
**Enrichment:** `src/data/generatedEnrichment.json`  
**Thermal:** `src/data/generatedThermal.json`  
**Planetary reference:** `src/data/generatedPlanetaryReference.json`  
**Groups:** `src/data/generatedRegionGroupsV2.json`  
**Original catalogue:** `src/data/globalDiscovery.json` unchanged

---

## 1. Audit and scope

Milestone 08 produced 80 generated regions from a deterministic H3 resolution-4 screen. Each region has a coarse WorldClim/airport dossier, a union footprint, member cell IDs and a rule-based profile score. It has no high-resolution terrain, imagery, mapped geology, monthly climate or satellite thermal observation.

Milestone 09 adds those layers to a bounded, stratified subset of 15 regions. It does not re-run or rewrite the global screen.

Existing infrastructure reused:

| Capability | Existing code | Reuse in Milestone 09 |
|---|---|---|
| Sentinel-2 L2A | `scripts/fetch_site_imagery.py` | Same Earth Search STAC, cloud/sort passes, 2–98% display stretch, 10 m native window |
| Copernicus DEM GLO-30 | `scripts/fetch_site_terrain.py` | Same AWS COG tiles, UTM window, 40 m 512 × 320 heightmap, bilinear resampling |
| Terrain statistics | `scripts/derive_terrain_stats.py` | Same slope, p95, flat fraction, roughness and relief definitions |
| NASA POWER | `scripts/fetch_site_monthly.py` | Same MERRA-2 monthly climatology 2001–2020, 11 parameters |
| Macrostrat | `scripts/discover_candidates.py` | Same geologic_units/map point query, CC-BY 4.0 |
| MODIS LST | `scripts/fetch_modis_lst.py` | Same MODIS/MYD11A1 v061 policy, native 1 km centre pixel, QC, seasonal windows |
| Planetary comparison | `scripts/derive_planetary_reference.py` | Same 12.8 km / 400 m LOLA and 463 m MOLA baselines |
| Site Orbit | `src/components/SiteOrbit.tsx` | Extended with a generated origin, missing-dimension handling and generated limitations |

New data files are separate from `odyssey.json`, `discovery.json` and `globalDiscovery.json`. No curated candidate record was changed.

---

## 2. Top-15 selection methodology

Selection is deterministic and stratified. It is not a top-score cut.

Rules, in order:

1. Preserve a catalogue overlap if the screen produced one.
2. Apply environmental quotas: polar 4, high relief 3, hyper-arid 3, moderate relief 2, remote 2, other 1.
3. Within each category, take:
   - the highest screening score;
   - the strongest lunar-expedition score;
   - a geographic outlier from the regions already selected.
4. Fill remaining quota by screening score.
5. Never invent a region to satisfy a quota.

The algorithm is in `scripts/select_generated_enrichment.py`; the output records the reason for every choice.

### Selected set

| # | Region | Lat / lon | Category | Class | Best profile | Coarse score | Access km | Selection reason |
|---:|---|---|---|---|---|---:|---:|---|
| 1 | `GD-840d707ffffffff` | 69.13, -144.55 | polar | new | lunar base | 100.0 | 88.5 | strongest lunar-expedition score |
| 2 | `GD-84e7747ffffffff` | -72.45, 25.62 | polar | new | lunar base | 100.0 | 4269.6 | highest screening score |
| 3 | `GD-84ef4a1ffffffff` | -72.55, -63.07 | polar | new | lunar base | 100.0 | 1982.6 | geographic outlier |
| 4 | `GD-84f3b5dffffffff` | -78.55, 163.93 | polar | existing | lunar base | 100.0 | 3534.2 | catalogue overlap / control rediscovery |
| 5 | `GD-8425169ffffffff` | 48.99, 90.02 | high relief | new | Mars landing | 97.1 | 70.6 | highest screening score |
| 6 | `GD-8424943ffffffff` | 36.30, 94.94 | hyper-arid | nearby | Mars landing | 96.0 | 69.7 | highest screening score |
| 7 | `GD-8420887ffffffff` | 37.86, 75.23 | hyper-arid | new | Mars landing | 95.7 | 73.4 | geographic outlier |
| 8 | `GD-842512bffffffff` | 48.09, 91.80 | hyper-arid | new | Mars landing | 95.7 | 69.9 | strongest lunar-expedition score |
| 9 | `GD-8425151ffffffff` | 49.93, 92.47 | high relief | new | Mars landing | 94.1 | 79.0 | strongest lunar-expedition score |
| 10 | `GD-84b2e43ffffffff` | -30.72, -69.83 | high relief | new | Mars landing | 93.1 | 134.4 | geographic outlier / South America |
| 11 | `GD-84245c3ffffffff` | 43.46, 111.61 | moderate relief | new | Mars landing | 93.0 | 70.1 | highest screening score |
| 12 | `GD-8420265ffffffff` | 47.46, 66.88 | other | new | Mars landing | 91.0 | 95.8 | highest screening score |
| 13 | `GD-843d467ffffffff` | 35.24, 87.16 | moderate relief | new | Mars landing | 90.7 | 369.7 | strongest lunar-expedition score |
| 14 | `GD-8414725ffffffff` | 57.12, 133.54 | remote | new | lunar base | 78.2 | 542.3 | highest screening score |
| 15 | `GD-84e093dffffffff` | -49.37, 70.30 | remote | nearby | Mars landing | 61.7 | 3332.8 | strongest lunar-expedition score |

### Diversity audit

| Dimension | Result |
|---|---|
| Categories | polar 4, high relief 3, hyper-arid 3, moderate relief 2, remote 2, other 1 |
| Best profiles | lunar base 5, Mars landing 10 |
| Classification | new 12, catalogue-adjacent 2, catalogue overlap 1 |
| Access bands | <=100 km 8, 100–250 km 1, 250–500 km 1, >500 km 5 |
| Score bands | >=95 8, 85–95 5, <85 2 |
| Geographic sectors | Arctic 1, Antarctica 3, North/Central Asia 9, South America 1, Southern/Indian Ocean 1 |
| Expedition-competitive (within 10 points of best) | 4 |

The geographic result reflects the source catalogue: 51 of the original 80 regions are in North/Central Asia. Selection includes every non-Central-Asian cluster that the quotas and diversity rules could reach, plus nine Asian regions. This bias is inherited from the global screen and is not corrected by enrichment.

### Why Lunar Expedition has zero best-profile regions

All 80 source regions have a `lunar_expedition` score. None has `lunar_expedition` as its highest score. This is a **profile-weighting outcome**, not a missing environment class.

- Lunar base has a 20-point polar weight. Its thermal and aridity weights are also high. Polar regions therefore score near 100.
- Mars landing has a 10-point seasonality weight and higher thermal/aridity weights. For non-polar regions, seasonality near 100 plus the thermal weighting usually beats expedition.
- Lunar expedition has the highest terrain weight (35) and a 15-point access weight, but no seasonality bonus and only a 10-point polar weight. It is structurally sandwiched between the two specialists.

Measured margins: every region is 8.3 to 22.9 points below its best profile on the expedition score. Five regions are within 10 points. The enrichment set includes four of them (`GD-840d707`, `GD-8425151`, `GD-8414725`, `GD-84e093d`). This is recorded in `generatedEnrichmentSelection.json` as `expeditionCompetitiveWithin10Points: 4`.

No profile score was changed retroactively.

---

## 3. Dataset inventory and exact identifiers

| Dataset | Product identifier | Native resolution | Period / window | Role |
|---|---|---|---|---|
| Sentinel-2 L2A | `sentinel-2-l2a`, Earth Search STAC, AWS Open Data | 10 m B04/B03/B02 | Best usable scene from 12/24/36-month passes, 2024-12-18 to 2026-11-13 | True-color site window |
| Copernicus DEM | `Copernicus_DSM_COG_10_*_DEM` COGs, AWS Open Data | 30 m source | 2011–2015 | 40 m heightmap and terrain statistics |
| NASA POWER | POWER monthly climatology, community RE, MERRA-2 | 0.5° × 0.625° reanalysis, point sample | 2001–2020 | Monthly temperature, precipitation, humidity, wind, solar, AOD, soil wetness, pressure |
| Macrostrat | `geologic_units/map` API | Vector point query | Current mapped units | Geologic unit, lithology, age |
| MODIS | `MODIS/MYD11A1 v061`, collection `modis-11A1-061`, Microsoft Planetary Computer | 1 km | NH 2023-06-01..2023-08-31; SH 2023-12-01..2024-02-29 | Day/night land-surface temperature |
| WorldClim 2.1 | 10 arc-minute `bio1/5/6/12/15/elev` | ~18.5 km | 1970–2000 | Coarse screen only; retained for comparison |
| Natural Earth | 1:110m land | 1:110m | Current | Coarse land mask |
| OurAirports | Scheduled large/medium airports | Point | Current | Coarse access proxy |
| Moon reference | LRO LOLA `LDEM_45S_400M`, PDS `LRO-L-LOLA-4-GDR-V1.0` | 400 m | Mission product | Same-baseline comparison |
| Mars reference | MGS MOLA `mola128_mola64_merge_90Nto90S` | 463 m | Mission product | Same-baseline comparison |

Every enriched site records its exact Sentinel-2 scene ID and Copernicus DEM tile.

### Scene and tile identifiers

| Region | Sentinel-2 scene | Date | Cloud | Copernicus DEM tile |
|---|---|---|---|---|
| `GD-840d707ffffffff` | `S2B_6WWB_20261020_0_L2A` | 2026-10-20 | 10.11% | `Copernicus_DSM_COG_10_N69_00_W145_00_DEM` |
| `GD-84e7747ffffffff` | `S2B_35CMV_20261109_0_L2A` | 2026-11-09 | 2.68% | `Copernicus_DSM_COG_10_S73_00_E025_00_DEM` |
| `GD-84ef4a1ffffffff` | `S2B_20CME_20241218_0_L2A` | 2024-12-18 | 4.40% | `Copernicus_DSM_COG_10_S73_00_W064_00_DEM` |
| `GD-84f3b5dffffffff` | `S2B_57CWN_20260302_0_L2A` | 2026-03-02 | 11.12% | `Copernicus_DSM_COG_10_S79_00_E163_00_DEM` |
| `GD-8425169ffffffff` | `S2B_45UYQ_20261026_0_L2A` | 2026-10-26 | 0.08% | `Copernicus_DSM_COG_10_N48_00_E090_00_DEM` |
| `GD-8424943ffffffff` | `S2A_46SFF_20261113_1_L2A` | 2026-11-13 | 7.57% | `Copernicus_DSM_COG_10_N36_00_E094_00_DEM` |
| `GD-8420887ffffffff` | `S2C_43SEB_20261105_0_L2A` | 2026-11-05 | 10.10% | `Copernicus_DSM_COG_10_N37_00_E075_00_DEM` |
| `GD-842512bffffffff` | `S2C_46UDU_20261110_0_L2A` | 2026-11-10 | 11.08% | `Copernicus_DSM_COG_10_N48_00_E091_00_DEM` |
| `GD-8425151ffffffff` | `S2B_46UDA_20261026_0_L2A` | 2026-10-26 | 0.12% | `Copernicus_DSM_COG_10_N49_00_E092_00_DEM` |
| `GD-84b2e43ffffffff` | `S2B_19JDG_20261113_0_L2A` | 2026-11-13 | 8.43% | `Copernicus_DSM_COG_10_S31_00_W070_00_DEM` |
| `GD-84245c3ffffffff` | `S2C_49TEJ_20261113_0_L2A` | 2026-11-13 | 5.89% | `Copernicus_DSM_COG_10_N43_00_E111_00_DEM` |
| `GD-8420265ffffffff` | `S2C_41TQN_20261107_0_L2A` | 2026-11-07 | 11.63% | `Copernicus_DSM_COG_10_N47_00_E066_00_DEM` |
| `GD-843d467ffffffff` | `S2A_45SWU_20261112_1_L2A` | 2026-11-12 | 2.45% | `Copernicus_DSM_COG_10_N35_00_E087_00_DEM` |
| `GD-8414725ffffffff` | `S2C_53VMD_20261105_0_L2A` | 2026-11-05 | 11.10% | `Copernicus_DSM_COG_10_N57_00_E133_00_DEM` |
| `GD-84e093dffffffff` | `S2C_42FWL_20260624_0_L2A` | 2026-06-24 | 6.69% | `Copernicus_DSM_COG_10_S50_00_E070_00_DEM` |

---

## 4. Detailed terrain results

All 15 heightmaps are real Copernicus GLO-30 samples: 512 × 320 cells at 40 m, covering 20.48 × 12.8 km. Voids are 0.00% in all 15. No synthetic relief was added.

| Region | Relief (m) | Mean slope (°) | P95 slope (°) | Roughness (m) | Mean elevation (m) | Flat <5° |
|---|---:|---:|---:|---:|---:|---:|
| `GD-840d707ffffffff` | 1578 | 22.77 | 36.87 | 9.50 | 1245 | 6.6% |
| `GD-84e7747ffffffff` | 434 | 1.69 | 5.32 | 0.84 | 2767 | 94.5% |
| `GD-84ef4a1ffffffff` | 602 | 3.47 | 12.68 | 2.91 | 1459 | 85.0% |
| `GD-84f3b5dffffffff` | 2167 | 9.96 | 21.25 | 3.18 | 1648 | 23.7% |
| `GD-8425169ffffffff` | 913 | 5.78 | 24.04 | 4.68 | 1786 | 68.9% |
| `GD-8424943ffffffff` | 1145 | 7.23 | 30.95 | 6.81 | 3025 | 68.0% |
| `GD-8420887ffffffff` | 1787 | 18.85 | 39.13 | 10.57 | 3500 | 21.5% |
| `GD-842512bffffffff` | 533 | 2.84 | 18.04 | 3.41 | 1271 | 87.8% |
| `GD-8425151ffffffff` | 446 | 1.19 | 2.23 | 0.85 | 856 | 99.2% |
| `GD-84b2e43ffffffff` | 2416 | 26.50 | 38.69 | 10.72 | 3673 | 3.4% |
| `GD-84245c3ffffffff` | 153 | 1.07 | 2.59 | 0.62 | 970 | 99.8% |
| `GD-8420265ffffffff` | 123 | 1.28 | 3.08 | 0.72 | 413 | 99.4% |
| `GD-843d467ffffffff` | 369 | 3.56 | 9.28 | 2.15 | 4875 | 75.0% |
| `GD-8414725ffffffff` | 281 | 4.09 | 11.13 | 1.82 | 593 | 73.8% |
| `GD-84e093dffffffff` | 183 | 0.92 | 4.21 | 0.79 | 13 | 96.4% |

Across the 15: relief 123–2416 m (median 533 m), mean slope 0.92–26.50° (median 3.56°), roughness 0.62–10.72 m (median 2.91 m), mean elevation 13–4875 m (median 1459 m).

The detailed window is 20.48 × 12.8 km, not the full H3 region (up to 33,637 km²). The coarse WorldClim relief is a ~92 km window. These are different support and are never merged into a single terrain number.

---

## 5. Imagery availability and quality

- 15 of 15 regions have a usable Sentinel-2 L2A true-color window.
- Native 10 m, 2048 × 1280 pixels, approximately 20.5 × 12.8 km.
- Acquisition dates: 2024-12-18 to 2026-11-13.
- Cloud cover: 0.08% to 11.63%.
- Each scene is stored with its STAC item ID, collection, bounds, cloud cover, acquisition date, native resolution and credit.
- The selection uses the best usable scene across three passes (12/24/36 months, sorted by date/cloud), not simply the newest scene. Some newer low-cloud scenes were rejected when the window crossed no-data or failed the luminance/no-data checks.
- No imagery was generated or interpolated. If all passes fail, the site is marked `NO IMAGE`; none of the 15 required this fallback.

Stored under `public/generated/close/<region-id>.jpg`; metadata in `generatedEnrichment.json`.

---

## 6. Climate, geology and thermal evidence

### NASA POWER monthly climate

15 of 15 sites have monthly NASA POWER climatology for 2001–2020. Annual mean air temperature ranges -32.2 °C to 6.7 °C; annual precipitation ranges 69 mm to 698 mm. The monthly arrays include T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, WS2M, ALLSKY_SFC_SW_DWN, AOD_55, GWETTOP, GWETROOT and PS.

12 of 15 are complete. Three Antarctic sites lack root-zone soil wetness (`GWETROOT`) for all months; the values are stored as missing, not filled. The annual values, monthly series, source resolution and limitations are in `generatedEnrichment.json`.

### Macrostrat geology

15 of 15 sites have a mapped Macrostrat unit. Examples:

| Region | Unit | Lithology | Tags |
|---|---|---|---|
| `GD-840d707ffffffff` | Lisburne Group, undivided | Sedimentary | sedimentary |
| `GD-84e7747ffffffff` | Precambrian-Phanerozoic sedimentary rocks | sedimentary rocks | sedimentary |
| `GD-84ef4a1ffffffff` | Phanerozoic ice | ice | ice |
| `GD-84f3b5dffffffff` | Cenozoic volcanic rocks | intermediate volcanic rocks | volcanic |
| `GD-8425169ffffffff` | Paleozoic sedimentary rocks | sedimentary rocks | sedimentary |
| `GD-8424943ffffffff` | Paleozoic intrusive rocks | intrusive igneous rocks | intrusive |
| `GD-8420887ffffffff` | Precambrian crystalline metamorphic rocks | crystalline metamorphic rocks | metamorphic |
| `GD-84b2e43ffffffff` | Neogene Undifferentiated | Volcanic | volcanic |
| `GD-84e093dffffffff` | Cenozoic volcanic rocks | volcanic rocks | volcanic |

This is a point query, not a continuous geological surface. The dossier and Site Orbit state that limitation.

### MODIS day/night thermal

14 of 15 sites have a MODIS sample; one South American region returns `NO DATA`.

| Status | Day | Night |
|---|---:|---:|
| `NO DATA` | 1 | 1 |
| `INSUFFICIENT` | 0 | 0 |
| `LIMITED` | 1 | 1 |
| `MODERATE` | 12 | 11 |
| `STRONGER SAMPLE` | 1 | 2 |
| Paired day-night | 14 sites | |

Example: `GD-840d707ffffffff` day 245.7 K / -27.5 °C (12 dates), night 242.8 K / -30.4 °C (12 dates), paired difference 3.0 K. `GD-84b2e43ffffffff` is `NO DATA` for both day and night; this is missing evidence, not a cold or warm result.

MODIS is a 1 km clear-sky surface skin observation. NASA POWER is a 2 m air-temperature monthly normal. They are labeled separately in the data and UI.

---

## 7. Earth / Moon / Mars terrain comparison

The generated regions were added to the same 12.8 km same-baseline comparison used by the curated sites. Earth statistics are derived from the 40 m heightmap at 400 m and 463 m; Moon uses LOLA 400 m; Mars uses MOLA 463 m.

Example `GD-84e7747ffffffff`:

| Metric | Earth | Moon | Ratio |
|---|---:|---:|---:|
| Relief p95–p5 | 257 m | 3,713 m | 0.07× |
| Slope p95 | 4.92° | 32.76° | 0.15× |
| Roughness | 10.3 m | 71.1 m | 0.15× |

| Metric | Earth | Mars | Ratio |
|---|---:|---:|---:|
| Relief p95–p5 | 259 m | 256 m | 1.01× |
| Slope p95 | 5.03° | 4.35° | 1.16× |
| Roughness | 12.0 m | 11.0 m | 1.09× |

Across all 15:

| Comparison | Median ratio | Range | Within 0.8–1.25× |
|---|---:|---:|---:|
| Moon relief | 0.07× | 0.02–0.49× | 0 / 15 |
| Moon slope p95 | 0.25× | 0.04–1.04× | 3 / 15 |
| Moon roughness | 0.32× | 0.05–1.85× | 0 / 15 |
| Mars relief | 1.07× | 0.27–7.14× | 4 / 15 |
| Mars slope p95 | 1.69× | 0.31–7.66× | 3 / 15 |
| Mars roughness | 2.21× | 0.38–12.72× | 2 / 15 |

The enriched set is generally closer to Mars terrain than to the Moon in relief and slope, but individual sites vary widely. This is a dimension-specific terrain comparison, not an overall analog score. No claim is made that an Earth site reproduces lunar gravity/vacuum or the Martian atmosphere.

The existing `PlanetaryComparison` panel is preserved and extended with generated Earth statistics and generated MODIS thermal data. The curated 39-site comparison is unchanged.

---

## 8. Coarse screen versus detailed evidence

| Region | Coarse best | Detailed best | Delta | Detailed best profile | Detailed temp | Detailed precip |
|---|---:|---:|---:|---|---:|---:|
| `GD-840d707ffffffff` | 100.0 | 75.0 | -25.0 | lunar base | -10.6 °C | 684 mm |
| `GD-84e7747ffffffff` | 100.0 | 95.9 | -4.1 | lunar base | -32.2 °C | 224 mm |
| `GD-84ef4a1ffffffff` | 100.0 | 85.0 | -15.0 | lunar base | -20.9 °C | 420 mm |
| `GD-84f3b5dffffffff` | 100.0 | 92.3 | -7.7 | lunar base | -26.7 °C | 288 mm |
| `GD-8425169ffffffff` | 97.1 | 94.1 | -3.0 | Mars landing | -1.9 °C | 152 mm |
| `GD-8424943ffffffff` | 96.0 | 92.1 | -3.9 | Mars landing | 6.7 °C | 69 mm |
| `GD-8420887ffffffff` | 95.7 | 94.2 | -1.5 | Mars landing | -3.6 °C | 76 mm |
| `GD-842512bffffffff` | 95.7 | 94.0 | -1.7 | Mars landing | 3.7 °C | 154 mm |
| `GD-8425151ffffffff` | 94.1 | 90.9 | -3.2 | Mars landing | 3.5 °C | 206 mm |
| `GD-84b2e43ffffffff` | 93.1 | 93.3 | +0.2 | Mars landing | -0.1 °C | 95 mm |
| `GD-84245c3ffffffff` | 93.0 | 89.0 | -4.0 | Mars landing | 5.5 °C | 148 mm |
| `GD-8420265ffffffff` | 91.0 | 82.1 | -8.9 | Mars landing | 6.5 °C | 190 mm |
| `GD-843d467ffffffff` | 90.7 | 92.0 | +1.3 | Mars landing | -4.8 °C | 145 mm |
| `GD-8414725ffffffff` | 78.2 | 72.6 | -5.6 | lunar base | -8.0 °C | 651 mm |
| `GD-84e093dffffffff` | 61.7 | 60.7 | -1.0 | Mars landing | 3.1 °C | 698 mm |

Key findings:

- **Best profile is stable in 15 of 15 regions.** The coarse screen identified the same dominant profile as the detailed evidence.
- **The score is not stable.** 13 of 15 detailed scores are lower; mean delta -5.54 points, median -3.9, worst -25.0 (polar Alaska), best +1.3 (Tibet).
- **Ranking is only moderately stable.** Spearman rank correlation between coarse and detailed best scores is **0.479** across the 15.
- **Precipitation is the largest climate discrepancy.** Mean absolute precipitation delta is 108.6 mm; the largest is +544 mm at the polar Alaska site (WorldClim 140 mm vs POWER 684 mm). The coarse 10′ climatology under-represents coastal/orographic precipitation at these points.
- **Slope is systematically under-sampled by the coarse screen.** Detailed mean slope is 1.35× to 28.82× the coarse value (median 7.95×), because the coarse 92 km window smooths local relief.
- **Score saturation is real.** 8 of 15 coarse scores are >=95; only 1 of 15 detailed scores is >=95. The coarse score compresses many distinct regions near 100.
- **Weight sensitivity is moderate.** Re-running each profile with ±20% per-dimension weights changes scores by 2.39 to 7.52 points (median 3.88). The best-profile label is not sensitive in these 15; the exact rank is.

This is not a global validation set. It is a bounded check of where the coarse screen is useful (profile nomination) and where it is misleading (score magnitude, precipitation, local slope, fine ranking). The 15 regions were selected with diversity constraints, not randomly, so even these statistics are not population estimates.

---

## 9. Promotion into Site Orbit

The promotion path is real, not a mock card:

1. The generated dossier marks a region `ENRICHED` only when imagery and terrain assets exist.
2. `OPEN SITE ORBIT` is enabled only for those regions.
3. `src/generated.ts` builds a `Site` object from the enrichment record, including imagery, terrain, POWER climate, Macrostrat, nearest airport and detailed profile scores.
4. `src/OrbitalExperience.tsx` accepts the promoted site and passes it to `SiteOrbit`.
5. `SiteOrbit` opens with the generated origin, real 10 m imagery and real 40 m terrain. It disables ML display (`NOT USED`), marks the field window as `NO WINDOW`, and labels the campaign as `NOT IN CAMPAIGN`.
6. The scientific layers work: orbital imagery, elevation, slope, thermal, geology and surface/access.
7. The `PLANETARY` panel uses the generated same-baseline terrain statistics and generated MODIS data.
8. Closing Site Orbit returns to the orbital view and clears the promoted site.

The 65 non-enriched regions still show the coarse dossier and `DIVE UNAVAILABLE`. No generated region is forced into Site Orbit without assets. No curated `Site` record is fabricated or modified.

Screenshot: `img/generated-site-orbit.png`.

---

## 10. Footprint-aware deduplication audit

The original 80 km rule is **centre-to-centre**. It does not test whether region footprints touch or overlap.

Audit of all 3,160 pairs:

| Metric | Result |
|---|---:|
| Regions | 80 |
| Shared H3 member cells | 0 |
| Positive polygon overlap area | 0 |
| Pairs with touching footprints (distance 0) | 50 |
| Pairs within 25 km footprint distance | 51 |
| Pairs within 10 km footprint distance | 50 |
| Same-category pairs within 25 km | 33 |
| Pairs with centres >80 km but footprints within 25 km | 51 |
| Proposed landscape groups | 17 |
| Regions in proposed groups | 47 |
| Ungrouped regions | 33 |

The largest proposed group is `GG-001`: seven `other` regions in Kazakhstan/Central Asia, 95 cells and 168,183 km² combined, with a representative region `GD-8420265ffffffff`. These regions have distinct centres but adjacent footprints; the seed-and-grow coherence threshold split one broad landscape into multiple candidates.

Other groups include polar Dry Valleys/adjacent Antarctic regions, high-relief Altai, moderate-relief Mongolia and `other` Siberia. The groups are stored in `src/data/generatedRegionGroupsV2.json` with member IDs, representative region, combined cell count and combined area. They are **not** applied to the original 80 records.

An antimeridian geometry correction is recorded for `GD-84f39b9ffffffff`: its H3 ring crosses 180°, producing original bounds `[-179.0, 178.85]` and corrected local bounds `[164.78, 186.02]`. The audit unwraps H3 longitudes in a local frame. Without this correction, three false positive polygon overlaps appeared in the first pass.

The UI shows a `FOOTPRINT AUDIT / LANDSCAPE GROUP` note on affected dossiers and documents the audit counts in the method drawer.

**Terminology:** the highest-scoring H3 cell is called a **representative cell** and its centre a **representative point**, never a geographic centroid or survey centre. The old Milestone 08 report line using "centroid" was corrected.

---

## 11. Missing evidence and limitations

### Data gaps in the enriched set

- **MODIS:** 1 of 15 regions has `NO DATA` for both day and night (`GD-84b2e43ffffffff`). This is not a cold/warm result.
- **NASA POWER:** 3 of 15 Antarctic sites have all 12 `GWETROOT` months missing. Other parameters are present.
- **Macrostrat:** all 15 have a mapped unit, but tags can be empty and the query is a point, not a continuous surface.
- **Imagery:** all 15 have one usable scene. Cloud cover up to 11.63%; one scene is from 2024 because later passes were unusable.
- **Terrain:** all 15 have 0.00% voids at the 40 m heightmap. This does not mean the source DEM has no voids at 30 m; it means the generated window contains no missing values after the source read.
- **Not measured:** field validation, continuous land cover, meter-scale hazards, subsurface structure, regolith thickness, atmospheric profiles, dust deposition, wind gusts, permits, seasonal access, community consent.

### Method limitations

- The detailed window is a 20.48 × 12.8 km subsample of a region up to 33,637 km². It is not a region-wide survey.
- The detailed profile scores use the same rule weights as the coarse screen. They are a consistency check, not a new validated model.
- The best profile is stable in 15/15, but the score and rank are not. Coarse scores are not probabilities.
- The 15 enriched regions are deliberately diverse, not a random sample. Do not treat the distributions as global estimates.
- The original 80-region catalogue is biased toward North/Central Asia (51/80). Enrichment does not remove that bias.
- WorldClim 2.1 is non-commercial. The coarse derived fields are subject to that restriction.
- The MODIS sampler uses 2023/2024 seasonal windows, not a multi-year climatology. It is a sample, not a long-term average.
- The planetary comparison is dimension-specific. It is not an overall analog-success score.

---

## 12. Licensing and redistribution

| Source | License / condition | Redistribution implication |
|---|---|---|
| WorldClim 2.1 | Free for academic and other non-commercial use. Redistribution or commercial use requires prior permission. | **The coarse generated output is not cleared for commercial redistribution.** Do not sell or redistribute the derived WorldClim fields without permission. |
| Natural Earth | Public domain | No restriction |
| OurAirports | Public domain | No restriction |
| Sentinel-2 L2A | Copernicus Sentinel Data Terms and Conditions; attribution required | Contains modified Copernicus Sentinel data; retain attribution |
| Copernicus DEM GLO-30 | © DLR e.V. 2010-2014 / ESA 2021; free with attribution | Retain attribution |
| NASA POWER / MERRA-2 | Open data; attribution requested | Retain attribution |
| Macrostrat | CC-BY 4.0 | Attribution required |
| MODIS/MYD11A1 | NASA open data; attribution requested | Retain attribution |
| LOLA / MOLA | NASA PDS; follow PDS citation/usage guidance | Reused unchanged from existing references |

`generatedEnrichment.json` contains a `licensing` block with these conditions. The method drawer and README state the WorldClim restriction. This is a documentation and distribution constraint, not a technical blocker for the prototype.

---

## 13. Tests and verification

### Python

- `scripts/test_global_discovery.py`: 22 tests, pass.
- `scripts/test_generated_enrichment.py`: 13 tests, pass.

The 35 tests cover:

- deterministic top-15 selection and quota/diversity constraints;
- documented zero lunar-expedition best-profile result;
- 15/15 enrichment contract;
- imagery metadata and file existence;
- terrain heightmap size, DEM tile, statistics and zero-void check;
- POWER monthly/annual structure;
- coarse-versus-detailed comparison and sensitivity;
- geology and licensing fields;
- MODIS 14/15 data contract and 1 `NO DATA`;
- planetary 400 m / 463 m Earth statistics and Moon/Mars references;
- dedup audit counts, versioned groups, no shared H3 cells, one antimeridian correction.

Run:

```bash
/tmp/opencode/odyssey-venv/bin/python -m unittest scripts/test_global_discovery.py scripts/test_generated_enrichment.py -v
```

Result: **35 tests, OK**.

### Build and lint

- `npm run build`: TypeScript project build and Vite production build pass.
- `npm run lint`: 0 errors. Four pre-existing `react(set-state-in-effect)` warnings remain in `Briefing.tsx`, `Planner.tsx`, `LiveConditions.tsx` and `MissionControl.tsx`; none is in the new code.
- Vite reports the existing large-chunk warning. The generated enrichment data is imported into the client bundle; lazy loading is remaining work.

### Playwright

Verified against the Vite dev server at 1440 × 900 and 900 × 800:

- opening → curated Discovery Engine → curated dossier (Ellesmere Island);
- curated Lanzarote → DIVE → Site Orbit → PLANETARY terrain comparison;
- generated layer → enriched region (`GD-84e7747ffffffff`) → imagery, terrain, climate, geology, thermal, planetary and coarse/detailed sections;
- `OPEN SITE ORBIT` → generated Site Orbit with real imagery/terrain, generated header, `ML NOT USED`, `NO WINDOW`, `NOT IN CAMPAIGN`;
- generated Site Orbit layers: orbital imagery, elevation, slope, thermal, geology, surface/access;
- generated PLANETARY panel with Earth/Moon/Mars same-baseline statistics and MODIS day/night evidence;
- non-enriched region still shows `DIVE UNAVAILABLE`;
- `ENRICHED ONLY / 15` filter;
- narrow viewport layout;
- zero console errors throughout.

Screenshots:

- `img/generated-enriched.png` - enriched dossier with Sentinel-2 image and `ENRICHED` state.
- `img/generated-enriched-terrain.png` - detailed terrain and climate section.
- `img/generated-enriched-climate.png` - monthly climate, geology and MODIS thermal.
- `img/generated-enriched-planetary.png` - Earth/Moon/Mars comparison, coarse-versus-detailed table and sensitivity.
- `img/generated-enriched-open.png` - promotion control and missing-evidence state.
- `img/generated-site-orbit.png` - generated region in Site Orbit with real terrain and imagery.

### Regression checks

- The 39 curated sites and 107 manual discovery candidates are untouched.
- Curated Site Orbit and its scientific layers still work.
- The curated PLANETARY comparison still shows LOLA/MOLA references.
- The generated 80-region dossier still opens and preserves coarse scores and provenance.
- The original `globalDiscovery.json` was not regenerated or rewritten in Milestone 09.

---

## 14. Remaining work

1. **Field validation.** The enriched sites remain remote-sensing candidates. LiDAR/RTK, met masts, soil pits, geotechnical tests, field mapping, permits and community consent are still required before certification.
2. **Continuous land cover and hazards.** Add ESA WorldCover or a comparable product, plus meter-scale slope/roughness and hazard layers.
3. **Atmospheric and surface processes.** Add dust deposition, wind gusts, boundary-layer profiles, snow/ice, permafrost and regolith thickness where defensible.
4. **More regions.** Enrich the remaining 65 or a larger stratified subset, with rate limiting and caching. Do not present the 15 as global validation.
5. **Catalogue grouping.** Decide whether to merge the 17 proposed landscape groups into a future versioned catalogue. Keep the original IDs for traceability.
6. **Score calibration.** Reduce saturation, test alternative weights, and report distributions and ranks rather than only maxima. Keep scores separate from probabilities.
7. **Commercial licensing.** Replace or relicense WorldClim-derived fields if the output must be redistributed commercially. Keep the non-commercial notice until then.
8. **UI performance.** Lazy-load generated enrichment and imagery metadata; the main bundle is now larger.
9. **Playwright suite.** Convert the manual checks into repository E2E tests, including generated Site Orbit and planetary layers.
10. **Data versioning.** Store source checksums and a manifest for Sentinel-2 scenes, DEM tiles, POWER responses and MODIS item IDs.

---

## 15. Acceptance summary

| Requirement | Result |
|---|---|
| Audit existing pipelines | Yes; reused Sentinel-2, DEM, POWER, Macrostrat, MODIS and planetary comparison |
| Bounded top-15 selection, not pure score | Yes; stratified by category, profile, geography, access, score and novelty |
| Environmental/geographic/profile diversity | Yes; 6 categories, 5 sectors, 5 lunar-base and 10 Mars-best, 4 expedition-competitive |
| Investigate lunar-expedition zero best-profile | Yes; weighting outcome, documented, not a data absence |
| Keep original 80 unchanged | Yes; `globalDiscovery.json` not regenerated or edited |
| Real terrain | Yes; 15 Copernicus GLO-30 heightmaps, 40 m, 512 × 320, 0% voids |
| Coarse and detailed terrain separate | Yes; separate fields and comparison table |
| Real Sentinel-2 imagery | Yes; 15/15 usable scenes, 10 m native, exact scene IDs, dates and cloud |
| NASA POWER | Yes; 15/15 monthly climatology, 12/15 complete, missing values retained |
| Macrostrat | Yes; 15/15 point units, provenance and limitations |
| MODIS thermal | Yes; 14/15 with day/night samples, 1 `NO DATA` |
| Planetary comparison | Yes; same-baseline 400 m/463 m Earth, LOLA/MOLA references, dimension-specific |
| Coarse vs detailed validation | Yes; 15/15 stable best profile, score deltas, Spearman 0.479, saturation quantified |
| Promote to Site Orbit | Yes; only enriched regions, real assets, generated origin, missing states |
| Footprint-aware dedup | Yes; 3,160 pairs, 0 cell overlaps, 50 touching footprints, 17 versioned groups |
| Preserve original catalogue | Yes; no curated or generated record deleted or rewritten |
| Missing evidence visible | Yes; nulls, coverage, `NO DATA`, missing lists and limitations |
| No fabricated data | Yes; no synthetic terrain, imagery or inferred planetary measurement |
| No global-validation claim | Yes; explicitly bounded to 15 enriched regions |
| Tests/build/lint/Playwright | 35 Python tests, build, lint, browser checks |
| Report and commit | This report; commit after verification |
