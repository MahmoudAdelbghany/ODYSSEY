# Milestone 05 — Planetary Thermal Evidence Completion

Date: 2026-11-13  
Scope: complete and qualify the measured thermal evidence in the existing Site Orbit / PLANETARY panel.

---

## 1. Products and exact identifiers

| Body / support | Product | Identifier | Native resolution | Support | Units |
|---|---|---|---|---|---|
| Earth day surface | MODIS/MYD11A1 v061 | `LST_Day_1km`, `QC_Day` | 1 km, daily | Clear-sky daytime surface skin temperature | DN × 0.02 = K |
| Earth night surface | MODIS/MYD11A1 v061 | `LST_Night_1km`, `QC_Night` | 1 km, daily | Clear-sky night-time surface skin temperature | DN × 0.02 = K |
| Earth air | NASA POWER / MERRA-2 | `T2M`, 2001–2020 | 0.5° × 0.625°, monthly normals | 2 m air temperature, point sample | °C → K |
| Mars air/surface | MEDA / Perseverance | DOI `10.1038/s41561-022-01084-0` | Point at Jezero | Air at 1.45 m; surface brightness temperature; Sols 0–400 | K |
| Moon polar surface | LRO Diviner | DOI `10.1126/science.1187726` | Published mission-level range | PSRs and illuminated slopes; annual/seasonal range | K |
| Thermal inertia | — | — | — | Not integrated for Earth, Moon or Mars | — |

MODIS access: Microsoft Planetary Computer STAC, collection `modis-11A1-061`.

---

## 2. Exact data-processing methodology

1. **Search** `modis-11A1-061` at the site point.
2. **Seasonal window:**
   - Northern hemisphere: 2023-06-01 → 2023-08-31.
   - Southern hemisphere: 2023-12-01 → 2024-02-29.
3. **Deduplicate by acquisition date** (`YYYYDDD`) before sampling. Duplicate items are counted and reported.
4. **Sample the native 1 km centre pixel.** No 3×3 averaging and no resampling.
5. **QC filter:** `QC_Day` / `QC_Night` bits 0–1 must equal `00` (good quality). Fill pixels (`DN = 0`) are rejected.
6. **Scale:** `K = DN × 0.02`.
7. **Keep day and night separate.** No combined thermal index.
8. **Sample cap:** up to 5 unique dates for newly processed sites; earlier cached sites retain up to 12. The count is shown in the UI.
9. **Sufficiency threshold:** at least **4 accepted unique dates**. Below that, the statistic is `INSUFFICIENT` and no mean is shown.
10. **Statistics:** mean/min/max of accepted dates only; `nAccepted` and `nRejected` are stored.
11. **Day–night difference** is computed only when both day and night meet the sufficiency threshold.
12. **Cache:** each site is cached in `/tmp/opencode/modis-lst-cache/<site>.json` to avoid repeated requests.

### Audit corrections from the previous implementation

- The previous 3×3 sampling was applied before QC filtering. It is now a **single native 1 km centre pixel** with per-pixel QC.
- The previous “diurnal amplitude” row mixed Earth **seasonal air** amplitude with Mars **diurnal** amplitude. They are now separate rows.
- The previous two-site sample is expanded to all 39 sites.
- The previous Earth surface values are replaced by day and night statistics with explicit sample counts.
- The previous single Moon range is now a class-aware model: `polarRange`, `permanentlyShadowed`, `illuminatedSlope`, with provenance. PSR and illuminated classes are marked **no separate sample** because Diviner PCP/PRP rasters were not ingested.

---

## 3. Coverage across the 39 sites

| Metric | Count |
|---|---:|
| Sites with a thermal record | 39 |
| Day surface sufficient (≥4 accepted dates) | 13 |
| Night surface sufficient (≥4 accepted dates) | 10 |
| Both day and night sufficient | 9 |
| Total accepted day observations | 98 |
| Total accepted night observations | 88 |
| Duplicate items encountered and collapsed by date | 2,328 |

The low counts are real: cloud cover, QC rejection and polar conditions remove many scenes. Sites with insufficient samples show `INSUFFICIENT` and the accepted/scene count, never a fabricated mean.

---

## 4. Sample counts for tested sites

| Site | Window | Day accepted / scenes | Night accepted / scenes | Day mean | Night mean | Day–night |
|---|---|---|---:|---:|---:|---:|
| Devon Island | 2023-06-01 → 2023-08-31 | 0 / 12 | 1 / 12 | INSUFFICIENT | INSUFFICIENT | NO DATA |
| Atacama Desert | 2023-12-01 → 2024-02-29 | 8 / 12 | 5 / 12 | 318.56 K | 289.10 K | 29.46 K |
| Namib Desert | 2023-12-01 → 2024-02-29 | 10 / 12 | 8 / 12 | 325.48 K | 288.61 K | 36.87 K |
| Svalbard | 2023-06-01 → 2023-08-31 | 0 / 12 | 1 / 12 | INSUFFICIENT | INSUFFICIENT | NO DATA |

Devon and Svalbard demonstrate low-sample behavior. Atacama and Namib demonstrate full day/night separation and day–night differences.

---

## 5. Quality thresholds and evidence classes

- **MEASURED** — MODIS day/night, MEDA point values.
- **CLIMATOLOGY** — NASA POWER 2 m air temperature.
- **PUBLISHED RANGE** — Diviner polar range.
- **INSUFFICIENT** — fewer than 4 accepted unique dates.
- **NO DATA** — no valid observation or not integrated.

The panel shows:
- native support (1 km MODIS, point MEDA, published Diviner range)
- acquisition window
- accepted/scene counts
- QC rule
- source and DOI
- explicit non-comparisons

No combined thermal score is computed.

---

## 6. Lunar reference model

The Moon block now supports separate classes:

| Class | Status |
|---|---|
| `polarRange` | 50–250 K, published mission-level range, Paige et al. 2010 |
| `permanentlyShadowed` | No separate sample; Diviner PCP/PRP not ingested |
| `illuminatedSlope` | No separate sample; Diviner PCP/PRP not ingested |

The existing published range is preserved and clearly labeled as **mission-level**, not a local observation. No site-specific lunar values were invented.

---

## 7. Files changed

| File | Change |
|---|---|
| `scripts/fetch_modis_lst.py` | New 39-site MODIS day/night sampling pipeline with cache, QC, dedupe and sufficiency |
| `src/data/planetaryThermal.json` | 39-site day/night records; Mars/Moon blocks; thermal inertia missing |
| `src/components/PlanetaryComparison.tsx` | Day/night/air rows, evidence badges, sample counts, class-aware Moon model |
| `src/planetary.css` | Readable thermal table and evidence badge styling |
| `MILESTONE_05_REPORT.md` | This report |
| `img/planetary-thermal.png` | Verified screenshot |

The terrain comparison and orbital navigation were not changed.

---

## 8. Tests

| Test | Result |
|---|---|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** — pre-existing warnings only, no errors |
| Playwright E2E, Devon Island | **PASS** — day 0/12, night 1/12, INSUFFICIENT shown |
| Playwright E2E, Atacama | **PASS** — day 8/12, night 5/12, day–night 29.46 K |
| Playwright E2E, Namib | **PASS** — day 10/12, night 8/12, day–night 36.87 K |
| Playwright E2E, Svalbard | **PASS** — day 0/12, night 1/12, INSUFFICIENT shown |
| Terrain comparison / orbital navigation | **PASS** — no regression observed |
| Screenshot | `img/planetary-thermal.png` |

---

## 9. Limitations

1. **MODIS sample size is small** for many sites because of clouds, QC and polar conditions.
2. **Day and night are clear-sky only.** They are not full diurnal cycles or monthly climatologies.
3. **Earth surface temperature is not available for all 39 sites** at the sufficiency threshold; these are marked INSUFFICIENT.
4. **Mars is a point record at Jezero**, not a global field.
5. **Moon is a published polar range**, not a site-specific Diviner sample. PSR and illuminated classes are not separately sampled.
6. **Thermal inertia is missing** for all three bodies.
7. **MODIS sample caps differ** between cached sites (up to 12 dates) and newly processed sites (up to 5). Counts are shown explicitly.
8. **No combined thermal score.** No claim of physical equivalence.

---

## 10. What remains unimplemented

- Diviner PCP/PRP site-specific raster ingestion, with PSR/illuminated separation.
- Calibrated THEMIS surface temperature or thermal inertia.
- MODIS/VIIRS LST for all sites with a larger seasonal sample and night-time coverage.
- Uncertainty propagation from QC, sample size and spatial support.
- A profile-aware thermal interpretation that does not collapse into a single score.

---

## 11. Bottom line

The thermal evidence is now broader, more explicitly qualified and harder to misread:

- 39 sites attempted, with day and night separate.
- 13 day and 10 night sites pass the 4-date sufficiency threshold.
- Insufficient samples are shown as `INSUFFICIENT`, not as values.
- Earth surface, Earth air, Mars point measurements and the Moon mission-level range are distinct evidence classes.
- Thermal inertia remains missing and is not conflated with temperature.
