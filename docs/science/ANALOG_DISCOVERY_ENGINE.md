# Analog Discovery Engine

**Status:** 24-hour prototype, 2026-11-13.  
**Purpose:** search beyond the 39 curated ODYSSEY sites, score candidate AOIs against Moon/Mars reference profiles, attach explicit evidence and uncertainty, and produce reviewable dossiers for later ODYSSEY ingestion.

This document is the engine reference. The demo script is in `../history/DISCOVERY_DEMO.md`; the high-level product narrative is in `../history/LEGACY_README.md` and `../history/SUBMISSION.md`.

---

## 1. What the engine is

A candidate is not a pin on a map. It is a space-time evidence object:

```text
Candidate = (AOI, reference_profile, time_window, evidence_version)
```

The engine answers:

- Where exactly, at what spatial scale?
- Analog to which reference environment?
- Which dimensions match, which do not, with what uncertainty?
- When is the analogy strongest or operationally usable?
- What evidence supports each claim, and what is missing?
- What can Earth not reproduce?
- Is it already known, or is it a review candidate?
- Which data version produced it?

It does **not** claim that a high score is a discovery. The output is a ranked review queue.

---

## 2. Quick start

```bash
npm run dev
# http://127.0.0.1:5173
```

Open **Discovery Engine** from the opening screen or the top bar.

Regenerate the candidate dataset:

```bash
python3 scripts/discover_candidates.py
python3 scripts/fetch_radarsat1.py
```

Dependencies:

- `discover_candidates.py`: `requests`, `numpy`, `scipy`, `rasterio`
- `fetch_radarsat1.py`: `requests`, `numpy`, `scipy`, `rasterio`, `Pillow`

Production build:

```bash
npm run build
npm run preview
```

---

## 3. Architecture

Three tiers:

```text
TIER 1  GLOBAL SCREEN
        NASA POWER + Copernicus DEM + Macrostrat + OurAirports
        rank and exclude, 107 candidates
                    |
                    v
TIER 2  REGIONAL REFINE
        RADARSAT-1 historical SAR, Sentinel-2/Landsat, EMIT/ASTER,
        Sentinel-1, GEDI/ICESat-2
                    |
                    v
TIER 3  LOCAL CERTIFY
        LiDAR/RTK, met mast, soil pits, geotechnical tests,
        field mapping, permits, community consent
```

Rule: **global layers rank and exclude; local measurements certify.**

Data flow:

```text
seed list
  -> 80 km control exclusion
  -> NASA POWER monthly climatology
  -> Copernicus DEM GLO-90 terrain
  -> Macrostrat geology
  -> OurAirports access
  -> RADARSAT-1 EODMS STAC + AWS L1 COG (6 candidates)
  -> src/data/discovery.json
  -> per-dimension scoring
  -> Discovery UI
  -> shortlist / full-screen JSON export
  -> ODYSSEY review and ingestion
```

---

## 4. File map

| File | Role |
|---|---|
| `src/discovery/types.ts` | Candidate, score, reference, SAR and window types |
| `src/discovery/engine.ts` | Reference profiles, target functions, composites, novelty, time windows |
| `src/discovery.css` | Discovery UI styling |
| `src/components/DiscoveryMode.tsx` | Full-screen map, filters, dossier, shortlist, exports, method drawer |
| `src/OrbitalExperience.tsx` | Entry points to Discovery mode |
| `src/orbital.css` | Opening-screen discovery button |
| `src/data/discovery.json` | 107 candidates and their evidence |
| `scripts/discover_candidates.py` | Candidate generation and enrichment pipeline |
| `scripts/fetch_radarsat1.py` | RADARSAT-1 SAR evidence pipeline |
| `public/sar/*.jpg` | RADARSAT-1 browse thumbnails |
| `docs/discovery-*.png` | Screenshots |
| `../history/DISCOVERY_DEMO.md` | 2-minute demo script |

---

## 5. Candidate generation

The current prototype uses **107 deliberately selected seed AOIs**, not a full global grid.

Seed categories:

- impact structures
- arid and salt systems
- polar deserts and periglacial terrain
- volcanic fields
- caves, karst and mines
- high-altitude basins

The pipeline rejects any seed within **80 km** of one of the 39 curated controls. The closest current candidate is about 81.6 km from a control.

Why not a global 1 km grid yet:

- The 24-hour build prioritised a working evidence chain and a reviewable dossier over planetary-scale compute.
- The same scoring code can consume a grid; the bottleneck is enrichment (climate, DEM, geology, access), not the UI.
- A full grid should be run tile-by-tile with a STAC-first cache, not one API call per point.

To add a candidate:

1. Add a seed to `SEEDS` in `scripts/discover_candidates.py`.
2. Run:
   ```bash
   python3 scripts/discover_candidates.py --only <id>
   ```
3. Optionally add SAR:
   ```bash
   python3 scripts/fetch_radarsat1.py --only <id>
   ```
4. Rebuild.

The pipeline caches per-candidate responses in `/tmp/opencode/discovery-cache`; RADARSAT-1 month listings are cached in `/tmp/opencode/radarsat1-cache`.

---

## 6. Data sources

| Source | Product / version | Resolution | Evidence class | Used for |
|---|---|---|---|---|
| NASA POWER / MERRA-2 | Monthly climatology 2001–2020 | 0.5° × 0.625° reanalysis, point sample | reanalysis | temperature, precipitation, humidity, wind, solar, AOD, soil wetness, pressure |
| Copernicus DEM | GLO-90, TanDEM-X 2011–2015 | 90 m DSM | derived | elevation, slope p95, roughness, relief |
| Macrostrat | CC-BY 4.0 | mapped vector unit | mapped | lithology, age, unit, tags |
| OurAirports | scheduled large/medium airports | point | derived | straight-line access distance |
| CSA RADARSAT-1 | EODMS STAC + AWS Open Data L1 COG | scene/frame; 8-bit relative amplitude | historical SAR context | browse thumbnail, frame texture |

Important limits:

- NASA POWER is **air temperature**, not land surface temperature. MODIS/VIIRS LST is missing.
- Copernicus GLO-90 is a **DSM**, not a bare-earth DTM, and slope/roughness are at a 90 m baseline.
- Macrostrat is a **regional mapped unit**, not an outcrop or assay.
- OurAirports is a **straight-line airport distance**, not a road, permit or cost model.
- RADARSAT-1 is **historical** (1996–2013), HH-only, and the AWS COGs are not geocoded. It is not a local AOI measurement or calibrated sigma0.

---

## 7. Reference profiles

Two profiles are implemented. Each is a distribution of target ranges, not a single vector.

### Moon south pole base

Weights:

```text
thermal 20, terrain 22, aridity 16, dust 10,
geology 16, illumination 10, ice 6   → 100
```

Targets:

- slope p95 5–30° at a matched baseline
- roughness 0.5–6 m; local relief 50–600 m
- mean temperature below −30 °C; large diurnal amplitude
- precipitation below 100 mm/yr; humidity below 30%
- polar latitude and low solar irradiance
- basalt / anorthosite / impact / regolith / ice geology

### Mars / Jezero

Weights:

```text
thermal 18, terrain 18, aridity 12, dust 16,
geology 22, pressure 6, access 8   → 100
```

Targets:

- slope p95 below 15°; roughness 0.2–3 m
- mean temperature below −30 °C; diurnal amplitude above 50 °C
- precipitation below 200 mm/yr; humidity below 40%
- dusty aerosol regime; wind 3–10 m/s
- clay / sulfate / carbonate / iron / olivine / basalt geology
- low pressure via high elevation; field access

To add a profile:

1. Extend `ReferenceKey` in `src/discovery/types.ts`.
2. Add weights and target summary in `REFERENCES` in `src/discovery/engine.ts`.
3. Add the dimension formulas in `scoreCandidate`.
4. The UI tab is generated from `REFERENCES`.

---

## 8. Scoring

### 8.1 Per-dimension target functions

Every dimension is scored 0–1.

```text
lower(x, target, tolerance)
  = 1                          if x <= target
  = 1 - (x - target)/tolerance  if x > target
  clamped to [0, 1]

higher(x, target, tolerance)
  = 1                          if x >= target
  = 1 - (target - x)/tolerance  if x < target
  clamped to [0, 1]

band(x, lo, hi, soft)
  = 1                          if lo <= x <= hi
  = 1 - (lo - x)/soft          if x < lo
  = 1 - (x - hi)/soft          if x > hi
  clamped to [0, 1]
```

Examples:

```text
lower(-18.4, -30, 45) = 1 - 11.6/45 = 0.742
higher(31, 30, 25)    = 1.0
band(0, 5, 30, 15)    = 1 - 5/15 = 0.667
band(45, 5, 30, 15)   = 1 - 15/15 = 0
```

### 8.2 Dimension formulas

**Moon south pole**

| Dimension | Formula |
|---|---|
| Thermal | `0.65 * lower(Tmean, -30, 45) + 0.35 * higher(Tamp, 30, 25)` |
| Terrain | `0.50 * band(slopeP95, 5, 30, 15) + 0.25 * band(roughness, 0.5, 6, 4) + 0.25 * band(relief, 50, 600, 300)` |
| Aridity | `0.50 * lower(precip, 100, 500) + 0.30 * lower(RH, 30, 40) + 0.20 * lower(soilTop, 0.1, 0.4)` |
| Dust | `0.70 * lower(AOD, 0.05, 0.25) + 0.30 * lower(wind, 3, 8)` |
| Geology | `max(tagHits/3, 0.85 * textHits/2)`, capped at 1 |
| Illumination | `0.60 * higher(abs(lat), 60, 25) + 0.40 * lower(solar, 4, 3)` |
| Ice proxy | `0.50 * iceTag + 0.50 * lower(Tmean, -20, 30)` |

**Mars / Jezero**

| Dimension | Formula |
|---|---|
| Thermal | `0.50 * lower(Tmean, -30, 40) + 0.50 * higher(Tamp, 50, 30)` |
| Terrain | `0.50 * lower(slopeP95, 15, 15) + 0.25 * band(roughness, 0.2, 3, 2) + 0.25 * band(relief, 50, 400, 250)` |
| Aridity | `0.50 * lower(precip, 200, 500) + 0.30 * lower(RH, 40, 40) + 0.20 * lower(soilTop, 0.15, 0.4)` |
| Dust | `0.60 * band(AOD, 0.2, 1.0, 0.4) + 0.40 * band(wind, 3, 10, 5)` |
| Geology | `max(tagHits/3, 0.85 * textHits/2)`, capped at 1 |
| Pressure | `lower(P, 80, 25)` |
| Access | `higher(access, 0.7, 0.7)` |

### 8.3 Compensatory score

```text
S_mean = Σ(w_i × s_i) / Σ(w_i)
```

This is the weighted mean over valid dimensions. Strong dimensions can compensate for weak ones. It shows what the site is good at.

### 8.4 Weak-link score

```text
d_i = 1 - s_i
D = sqrt( Σ(w_i × d_i²) / Σ(w_i) )
S_weak = 100 × (1 - D)
```

This is a weighted Euclidean distance in loss space — a diagonal Mahalanobis-style distance. A single fatal mismatch lowers the score instead of being averaged away.

### 8.5 Sensitivity band

Expert-assigned per-dimension tolerances:

```text
thermal 0.10, terrain 0.10, aridity 0.10, dust 0.10,
geology 0.15, illumination 0.10, ice 0.15,
pressure 0.05, access 0.10
```

```text
low  = 100 × Σ(w_i × max(0, s_i - u_i)) / Σ(w_i)
high = 100 × Σ(w_i × min(1, s_i + u_i)) / Σ(w_i)
```

This is a deterministic evidence tolerance, **not** a confidence interval.

### 8.6 Fragility

```text
weakest dimension < 30  → fragile
30 to 50                → mixed
50+                     → robust
```

`N2` is the screening tier. Fragility is a separate robustness flag. A site can be a strong screening candidate for one function and still be globally fragile.

### 8.7 Novelty grade

```text
N = min(1, nearestControlKm / 500)

N2 if S_mean >= 65 and coverage >= 0.6 and N >= 0.4
N1 if S_mean >= 50 and coverage >= 0.4
N0 otherwise
```

N2 means “strong screening candidate at least 200 km from a control,” not “proven new analog.” Literature and catalog review is still required.

### 8.8 Time window

Monthly scores use the same target functions on monthly temperature, precipitation, AOD and wind:

- Moon: `0.4*cold + 0.3*dry + 0.2*clear + 0.1*calm`
- Mars: `0.35*cold + 0.25*dry + 0.25*dusty + 0.15*windy`

The best 2 or 3 consecutive months are selected. It is a climatological window, not a forecast. Polar night and access season are not modeled.

### 8.9 Worked example: Ellesmere Island, Moon south pole

```text
thermal 83, terrain 100, aridity 33, dust 100,
geology 67, illumination 100, ice 97

Compensatory:
83*20 + 100*22 + 33*16 + 100*10 + 67*16 + 100*10 + 97*6
= 8042 / 100 = 80.4

Weak-link:
d = [0.17, 0, 0.67, 0, 0.33, 0, 0.03]
D = 0.308
S_weak = 69.2

Sensitivity: 69–87
Fragility: mixed (weakest 33)
```

### 8.10 Worked example: Dasht-e Kavir, Mars/Jezero

```text
thermal 22, terrain 97, aridity 95, dust 100,
geology 100, pressure 48, access 71

Compensatory:
22*18 + 97*18 + 95*12 + 100*16 + 100*22 + 48*6 + 71*8
= 7938 / 100 = 79.4

Weak-link: 63.7
Sensitivity: 69–84
Fragility: fragile (weakest 22)
```

The thermal mismatch is visible instead of being averaged away. Under weak-link ranking, Victoria Island overtakes Dasht-e Kavir on the Mars profile.

### 8.11 Missing data

- Dimensions with no value get weight 0.
- Coverage is `Σ(w_i)/100` over valid dimensions.
- Missing dimensions are never imputed.
- The dossier lists refinement layers separately: mineralogy species, LST, vegetation, water/ice, subsurface, geotechnical properties, catalog review and field validation.

### 8.12 What is not used

The 24-hour build does **not** use z-scores, full covariance Mahalanobis, random forest or clustering for ranking.

Reasons:

- No labelled positive/negative analog set.
- Reference profiles are ranges, not a multivariate Gaussian.
- Missing dimensions are common; z-scores would require imputation.
- A target function is explainable: “why 83?” has a direct answer.

A full covariance Mahalanobis with a bootstrap interval is the next statistical step. Using the 39 controls as the covariance sample would bake in their selection bias.

---

## 9. RADARSAT-1 SAR refinement

Six Canadian/polar candidates carry real historical SAR:

| Candidate | Date | Mode | Evidence |
|---|---|---|---|
| Victoria Island | 2005-07-22 | Standard S5, 39° incidence | L1 frame match + browse |
| Ellesmere Island | 2005-03-24 | Fine F2 | browse only |
| Ward Hunt Island | 2005-02-17 | Standard S1 | browse only |
| Baffin Island | 2005-02-10 | Standard S5 | browse only |
| Île Rouleau | 2005-07-28 | Standard S7 | browse only |
| Mistastin Lake | 2005-04-24 | ScanSAR Wide SCWA | browse only |

Pipeline:

1. Search EODMS STAC for `Radarsat-1-Raw`.
2. Check the scene footprint against the candidate point.
3. Download the segment browse JPEG.
4. Match the acquisition to an AWS Open Data L1 COG by date, beam and timestamp.
5. Compute relative texture: mean, std, p10/p90, entropy, edge density, Laplacian contrast, homogeneity.
6. Write the `sar` block and thumbnail.

What it is not:

- not calibrated sigma0
- not geocoded to the candidate AOI
- not a local measurement
- not global

The AWS COGs have no CRS, so the evidence is labeled **historical segment/frame context**. Sentinel-1 GRD is the next layer for calibrated local backscatter.

---

## 10. UI

The Discovery mode is a full-screen instrument:

- **Left:** reference profile, target ranges, stats, filters, ranked candidate list, rank toggle, full-screen export.
- **Centre:** global map with 107 candidates and 39 controls as small pale dots.
- **Right:** dossier with compensatory/weak-link/sensitivity scores, strongest and weakest dimensions, 12-month window, evidence provenance, geology, access, SAR block, missing evidence, residual gaps and literature check.
- **Top:** method drawer, shortlist, close.
- **Bottom:** honesty footer and data version.

Filters:

- minimum compensatory fit
- minimum core coverage
- N2 strong only
- SAR evidence only
- category: impact / polar / volcanic / cave-mine / arid

Exports:

- **shortlist** JSON: promoted candidates with scores, dimensions, window, missing, evidence and SAR
- **screen** JSON: all filtered candidates with the same dossier fields

---

## 11. Data schema

`src/data/discovery.json`:

```json
{
  "generatedAt": "2026-11-13",
  "source": "NASA POWER; Copernicus DEM GLO-90; Macrostrat; OurAirports",
  "note": "Screening-tier candidates outside the 39 controls...",
  "count": 107,
  "candidates": [
    {
      "id": "ellesmere",
      "name": "Ellesmere Island",
      "country": "Canada",
      "lat": 80.0,
      "lon": -80.0,
      "type": "Polar desert",
      "tags": ["ice", "regolith"],
      "summary": "...",
      "climate": {
        "tempMean": -18.1,
        "tempAmp": 30.6,
        "precipYear": 266.7,
        "humidity": 91.0,
        "wind": 2.14,
        "solar": 2.52,
        "aerosol": 0.047,
        "soilWetnessTop": 0.76,
        "soilWetnessRoot": 0.794,
        "pressure": 92.1
      },
      "monthly": {
        "temp": ["12 monthly values"],
        "precip": ["12 monthly values"],
        "humidity": ["12 monthly values"],
        "wind": ["12 monthly values"],
        "aerosol": ["12 monthly values"],
        "solar": ["12 monthly values"]
      },
      "terrain": {
        "elevation": 1303.4,
        "relief": 142.9,
        "slopeMean": 7.78,
        "slopeP95": 21.25,
        "slopeMax": 37.91,
        "roughness": 2.24,
        "validFraction": 1.0
      },
      "geology": {
        "lith": "sedimentary rocks",
        "age": "Cenozoic",
        "unit": "...",
        "tags": [],
        "source": "Macrostrat CC-BY 4.0"
      },
      "airport": {
        "name": "Qaanaaq Airport",
        "iata": "NAQ",
        "km": 360.9
      },
      "access": 0.357,
      "noveltyKm": 209.4,
      "nearestControl": {
        "id": "axelheiberg",
        "name": "Axel Heiberg Island",
        "km": 209.4
      },
      "sar": {
        "platform": "RADARSAT-1",
        "acquired": "2005-03-24",
        "beamMode": "Fine F2",
        "polarization": "HH",
        "incidenceAngle": null,
        "thumbnail": "/sar/ellesmere.jpg",
        "texture": {
          "mean": 125.11,
          "std": 48.47,
          "entropy": 4.599,
          "edgeDensity": 0.1,
          "contrast": 7928.718,
          "homogeneity": 0.0001
        },
        "browseTexture": {
          "mean": 125.11,
          "std": 48.47,
          "p10": 58.0,
          "p90": 186.0,
          "entropy": 4.599,
          "edgeDensity": 0.1,
          "contrast": 7928.718,
          "homogeneity": 0.0001
        },
        "frameProduct": "",
        "support": "RADARSAT-1 segment browse texture only...",
        "class": "historical SAR context",
        "uncertainty": "8-bit relative amplitude...",
        "source": "CSA RADARSAT-1 via EODMS STAC + AWS Open Data COG"
      },
      "missing": [
        "catalog / literature novelty review",
        "land surface temperature (MODIS/VIIRS LST)",
        "mineralogy species (requires EMIT/ASTER refinement)",
        "vegetation / land cover",
        "water / ice state",
        "subsurface structure",
        "geotechnical properties",
        "field validation"
      ],
      "evidence": {
        "climate": {"source": "...", "resolution": "...", "class": "...", "uncertainty": "..."},
        "terrain": {},
        "geology": {},
        "access": {}
      }
    }
  ]
}
```

The exact values for each candidate are in the file; the example above is abbreviated.

---

## 12. Reproducibility

```bash
python3 scripts/discover_candidates.py
python3 scripts/fetch_radarsat1.py
npm run build
```

Caches:

- `/tmp/opencode/discovery-cache` — per-candidate NASA POWER, Macrostrat, DEM and airport responses
- `/tmp/opencode/radarsat1-cache` — RADARSAT-1 monthly S3 key listings

Commits:

```text
7ce77cd  feat: add analog discovery engine with 107 screened candidates
04c9bb5  polish: add full-screen export, literature check and polar warnings
0f840be  feat: add RADARSAT-1 evidence and weak-link similarity score
811a670  docs: explain weak-link fragility in method drawer
```

---

## 13. Validation and limitations

What is validated:

- every candidate has real climate, terrain, geology and access evidence
- every score is reproducible from the formulas above
- every missing layer is explicit
- the 39 controls are not used as the search universe
- SAR evidence is real, dated and sourced

What is not validated:

- no field validation
- no literature-level novelty verification
- no calibrated SAR sigma0
- no local AOI SAR measurement
- no mineralogy species
- no land surface temperature
- no vegetation, water/ice, subsurface or geotechnical data
- sensitivity band is not a confidence interval
- weak-link is not a full covariance Mahalanobis

What Earth cannot reproduce:

- lunar vacuum, 1.62 m/s² gravity, radiation, regolith thickness, true permanent-shadow illumination
- Martian 6 mbar CO2 atmosphere, 3.71 m/s² gravity, global dust storms, surface oxidants

---

## 14. Extension roadmap

1. **Sentinel-1 GRD** — calibrated local backscatter and change detection.
2. **EMIT / ASTER archive** — mineral species refinement for top candidates.
3. **MODIS / VIIRS LST** — replace air-temperature proxy with surface thermal observations.
4. **Catalog and literature novelty check** — USGS layer, ESA catalogue, GSA SP483, regional reviews.
5. **STAC-first incremental pipeline** — tile cache, new-scene triggers, candidate versioning.
6. **Full covariance Mahalanobis + bootstrap interval** — second statistical opinion, not a replacement for per-dimension evidence.
7. **Field dossier** — LiDAR/RTK, met mast, soil pits, geotechnical tests, permits, community consent.

---

## 15. Demo and screenshots

Demo script: `../history/DISCOVERY_DEMO.md`

Screenshots:

- `../history/img/discovery-moon-final.png`
- `../history/img/discovery-mars-final.png`
- `../history/img/discovery-method-final.png`
- `../history/img/discovery-mobile-final.png`
- `../history/img/discovery-scores-final.png`
- `../history/img/discovery-sar.png`
- `../history/img/discovery-dossier-final.png`

The demo sequence:

1. Opening — 39 controls, not the search universe.
2. Global screen — 107 candidates, 0 of 39 controls.
3. Moon south pole — Ellesmere, 80.4 / 69.2 / mixed.
4. Mars/Jezero — Dasht-e Kavir, 79.4 / 63.7 / fragile.
5. RADARSAT-1 — Victoria Island, L1 frame sample, 39° incidence.
6. N2 filter — 15 Moon / 18 Mars.
7. Promote and export — shortlist and full screen.
8. Method — three tiers, continuous discovery, what Earth cannot reproduce.
