# Sprint Report — Scientific Excellence

Date: 2026-11-13  
Sprint: 60-minute autonomous scientific improvement  
Commit: `f1c5db1`

---

## 1. What I investigated

I audited the actual implementation, not the design intent:

- candidate source and discovery pipeline
- every ML model, training label, evaluation method and inference path
- every scientific dataset used, with resolution, coverage, units and limitations
- whether Earth sites were compared to actual lunar/Martian data
- the Site Orbit, mission evaluation, temporal engine and Discovery Engine

Primary files inspected: `scripts/fetch_sites.py`, `scripts/enrich.py`, `scripts/train_model.py`, `src/data/odyssey.json`, `src/data/siteTerrain.json`, `src/mission/metrics.ts`, `src/mission/archetypes.ts`, `src/components/SiteOrbit.tsx`, `src/types.ts`, `LEGACY_README.md`.

---

## 2. What I discovered

1. **The 39 sites are manually predefined.** 19 seeds in `fetch_sites.py`, 20 in `enrich.py`. They are enriched with APIs, not discovered algorithmically.
2. **The ML is a surrogate for an expert rubric.** RBF-SVR (lunar base/expedition) and ExtraTrees (Mars) reproduce `score_site_new()` labels. The labels are not independent ground truth.
3. **Evaluation is random 5-fold KFold on 39 sites**, not spatial/group CV. The shipped R² values (0.782–0.829) measure rubric reproduction, not real-world predictive validity.
4. **Missing ML features are defaulted** (`aerosol 0.2`, soil wetness `0.2`, pressure `101.3`). The mission engine is stricter: missing evidence is `NO DATA`, never a pass.
5. **Earth-to-Moon/Mars comparison was missing as data.** Moon/Mars were hardcoded target ranges and text. No LOLA, MOLA, Diviner, THEMIS, CRISM, MEDA or REMS arrays were ingested.
6. **The Discovery Engine is a real expansion but not a global grid.** It uses 107 curated seeds, 80 km from controls, with NASA POWER, Copernicus GLO-90, Macrostrat and OurAirports.

---

## 3. What I implemented

A real, narrowly scoped **Planetary Reference Comparison** inside the existing Site Orbit.

### 3.1 Data

- **Moon:** LRO LOLA 400 m south-polar stereographic DEM, `LDEM_45S_400M`, PDS `LRO-L-LOLA-4-GDR-V1.0`.
- **Mars:** MGS MOLA 463 m global COG, `mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif`, USGS/ASU.
- **Earth:** existing Copernicus DEM GLO-30 heightmaps, resampled to 400 m and 463 m.
- **Window:** approximately 12.8 km square per body (Moon 13.2 km, Mars 13.4 km due to integer native pixels).
- **Derived variables:** relief (p95–p5), slope mean, slope p95, roughness (std of high-pass residual), mean elevation.
- **Datums:** Earth MSL/EGM2008, Moon 1737.4 km sphere, Mars areoid (GMM-2B).

### 3.2 UI

- New **PLANETARY** button in Site Orbit.
- Readable panel with two sections: Moon / south pole (LOLA 400 m) and Mars / Jezero (MOLA 463 m).
- Values and units side by side, with a match label:
  - `CLOSE` = 0.8–1.25×
  - `SAME ORDER` = 0.4–2.5×
  - `DIFFERENT` = outside that range
- Absolute elevation is shown with its datum but marked **DATUM**, not compared.
- Explicit “NOT COMPARED HERE”: gravity, vacuum/atmosphere, radiation, surface temperature, mineralogy, regolith mechanics.
- Highlighted section follows the active mission profile.

### 3.3 Example result: Devon Island

- **Moon:** relief 134.8 m vs 3,712.9 m; slope p95 5.19° vs 32.76°; roughness 16.6 m vs 71.1 m → all **DIFFERENT**.
- **Mars:** relief 134.2 m vs 256.0 m → **SAME ORDER (0.52×)**; slope p95 4.84° vs 4.35° → **CLOSE (1.11×)**; roughness 18.7 m vs 11.6 m → **SAME ORDER (1.61×)**.

This is the intended scientific result: Devon Island is a credible **Mars terrain** analog and a weak **lunar south pole terrain** analog. It does not claim equivalence in gravity, atmosphere or temperature.

---

## 4. Files changed

| File | Change |
|---|---|
| `scripts/derive_planetary_reference.py` | New reproducible same-baseline DEM comparison pipeline |
| `src/data/planetaryReference.json` | New 39-site Earth table + LOLA/MOLA reference stats |
| `src/components/PlanetaryComparison.tsx` | New comparison panel |
| `src/planetary.css` | Readable panel styling |
| `src/components/SiteOrbit.tsx` | PLANETARY toggle and panel integration |
| `../science/SCIENTIFIC_AUDIT.md` | Audit report |
| `SPRINT_REPORT.md` | This report |
| `img/planetary-comparison.png` | Verified screenshot |

No existing data pipeline was replaced or mocked.

---

## 5. Datasets and sources

| Dataset | Provider | Product / ID | Resolution | Use |
|---|---|---|---|---|
| LRO LOLA south polar DEM | NASA PDS / GSFC | `LDEM_45S_400M`, `LRO-L-LOLA-4-GDR-V1.0` | 400 m | Moon relief/slope/roughness |
| MGS MOLA global DEM | NASA / USGS Astrogeology | `mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif` | 463 m | Mars relief/slope/roughness |
| Copernicus DEM GLO-30 | ESA / DLR | existing 40 m heightmaps | 30 m source | Earth relief/slope/roughness |
| NASA POWER / MERRA-2 | NASA | climatology 2001–2020 | 0.5° × 0.625° | Existing climate evidence, unchanged |
| Macrostrat | Macrostrat | CC-BY 4.0 | mapped unit | Existing geology evidence, unchanged |

LOLA source:
`https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/`

MOLA COG:
`https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps3/Mars/MOLA/mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif`

---

## 6. Scientific assumptions and limitations

1. **Terrain only.** The comparison does not measure temperature, mineralogy, water/ice, gravity, vacuum, atmosphere or radiation.
2. **Same baseline, different native data.** Moon 400 m, Mars 463 m, Earth resampled to both. Slope and roughness are baseline-dependent; the panel states the baseline.
3. **Window size.** Approximately 12.8 km square per body; this is a local comparison, not a regional or global statistic.
4. **Elevation datums differ.** Earth MSL, Moon 1737.4 km sphere, Mars areoid. Absolute elevation is shown but marked DATUM and not used as a similarity metric.
5. **LOLA south pole window.** Centered near the south pole / Shackleton region. The 400 m product is a real LOLA product, but the window includes rugged polar terrain; it is not a single landing pad.
6. **MOLA Jezero window.** Centered on the Jezero landing region; the 463 m window includes crater floor and nearby relief.
7. **Roughness definition.** Standard deviation of the DEM residual after a Gaussian high-pass (σ = 2 pixels). It is a relative texture metric, not a calibrated geological roughness.
8. **Match labels are descriptive**, not probabilities or calibrated scores.
9. **No field validation.** The comparison is a screening/planning tool.

---

## 7. Tests executed

| Test | Command | Result |
|---|---|---|
| TypeScript + production build | `npm run build` | **PASS** |
| Lint | `npm run lint` | **PASS** (pre-existing warnings only, no errors) |
| End-to-end, real browser | Playwright: initialize → select Devon Island → DIVE → PLANETARY | **PASS** |
| Panel content check | Playwright `innerText` | **PASS** — values, units, datums, match labels present |
| Screenshot | `img/planetary-comparison.png` | **PASS** |

The E2E check confirmed the panel renders the Moon and Mars sections, the Earth/Moon/Mars values, the `DIFFERENT`/`SAME ORDER`/`CLOSE` labels and the “not compared” statement.

---

## 8. Screenshot

`img/planetary-comparison.png` — Devon Island Site Orbit with the Planetary Reference panel open.

---

## 9. Remaining work

- Add measured **surface temperature** from Diviner (Moon) and THEMIS/MEDA (Mars) instead of only terrain.
- Add **mineralogy** from CRISM/OMEGA and ASTER/EMIT.
- Replace hardcoded Moon/Mars target ranges with measured distributions from the same missions.
- Add a **profile-specific weighting** of the terrain comparison (e.g., Moon south pole vs lunar mare; Jezero delta vs volcanic terrain).
- Add uncertainty bands from DEM vertical accuracy and window sensitivity.
- Add spatial/group cross-validation for the ML surrogate.
- Expand the Discovery Engine from 107 seeds to a tiled global screen.

---

## 10. Recommended next milestone

**Measured thermal comparison.** Add LRO Diviner 240 m polar temperatures and Mars THEMIS/MEDA anchor values to the same panel, with units, supports and explicit differences between air temperature, surface temperature and thermal inertia. This would turn the comparison from terrain-only into a two-dimension physical comparison without pretending that Earth reproduces the full environment.

---

## 11. Commit

Final commit: `f1c5db1`
