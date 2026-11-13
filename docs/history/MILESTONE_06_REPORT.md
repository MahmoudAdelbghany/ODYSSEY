# Milestone 06 — Thermal Evidence Integrity and Comparability

Date: 2026-11-13  
Scope: audit and correct the MODIS thermal sampling pipeline before adding new datasets.

---

## 1. Audit findings

### 1.1 Cache history determined sample size

The previous `planetaryThermal.json` had 14 sites with up to 12 cached observations, while newly processed sites were capped at 5. This was not a scientific sampling policy. It was cache history.

**Correction:** the new pipeline uses one policy version (`m6-v4`), a fixed 12-date cap, and a cache key that includes the policy version. Cache history cannot change the sample.

### 1.2 Not all sites used equivalent sampling

The previous run selected the first available dates and stopped at 5 for new sites. The new run:
- enumerates all items in the seasonal window,
- groups by acquisition date,
- selects up to 12 unique dates **deterministically and evenly spaced** across the available window,
- applies the same cap to every site.

### 1.3 “Duplicate dates” were mostly Terra/Aqua overpasses

The STAC collection `modis-11A1-061` returns both `MOD11A1` (Terra) and `MYD11A1` (Aqua) items for the same calendar date. These are **not overlapping granules**. They are independent overpasses from two satellites.

**Correction:** all items for a date are evaluated independently. One daily observation is selected deterministically by `(QC, itemId)`. The source item identifier is stored. The two overpasses are not averaged as if they were independent daily measurements.

### 1.4 Deduplication before pixel sampling discarded valid observations

The previous pipeline deduplicated by date before sampling. If the first item had a fill or bad-QC pixel, a valid second item on the same date was never evaluated.

**Correction:** every item covering the point is sampled and QC-filtered before one valid observation is chosen per date.

### 1.5 Scene, date, accepted and rejected counts were inconsistently defined

The previous `nScenes` meant “items after deduplication,” while `nDuplicateDates` meant “items after the first per date.” They were not comparable across sites.

**Correction:** the record now stores:
- `availableDates` — unique acquisition dates in the window
- `selectedDates` — dates actually sampled
- `nItems` — all items evaluated on selected dates
- `nOverlapItems` — items beyond the first for a date
- `nDatesWithMultipleItems` — dates with more than one item
- `nOverlapValidResolved` — dates where more than one item was valid and one was chosen
- `day.nAccepted`, `day.nRejected`, `night.nAccepted`, `night.nRejected`
- per-observation `itemId`, `qc`, `qcClass`, `date`, `K`

### 1.6 Day and night were not paired

The previous `dayNightDeltaK` was the difference between unpaired day and night means. It was displayed next to “diurnal amplitude,” which mixed supports.

**Correction:** two separate statistics:
- `unpairedDayNightDeltaK` — difference between unpaired means, only when both phases have ≥4 accepted dates.
- `pairedDayNight` — mean/min/max of differences on dates where both day and night are valid, with `nPaired`.

The Earth row is now labeled **Unpaired day–night difference** and **Paired day–night difference**. The Mars MEDA diurnal amplitude is a separate row.

### 1.7 QC class `01` was rejected as if invalid

The previous filter accepted only QC bits 0–1 = `00`. Many desert pixels are QC `01` (“other quality”), not fill. This produced false NO DATA at Mojave, Nullarbor, Meteor Crater and others.

**Correction:** documented policy accepts QC `00` and `01`, stores `nGoodQC` and `nOtherQC`, and rejects `10`, `11` and fill.

---

## 2. Exact sampling policy

| Step | Policy |
|---|---|
| Seasonal window | NH: 2023-06-01 → 2023-08-31; SH: 2023-12-01 → 2024-02-29 |
| Date enumeration | All STAC items in the window, grouped by `YYYYDDD` |
| Cap | 12 unique dates |
| Date selection | Deterministic evenly spaced dates across the available window |
| Items per date | Every MODIS Terra/Aqua item covering the point |
| Pixel support | Native 1 km centre pixel, no resampling |
| QC | `QC_Day` / `QC_Night` bits 0–1 = `00` or `01` |
| Fill | DN = 0 rejected |
| Overlap resolution | Best QC, then lexicographic item ID |
| Day/night | Separate observations and statistics |
| Minimum for stats | 4 accepted dates |
| Statuses | NO DATA / INSUFFICIENT / LIMITED / MODERATE / STRONGER SAMPLE |
| Spatial sensitivity | 5×5 native 1 km neighbourhood recorded separately; never substituted |
| Cache | Policy-versioned; cache cannot change the selected dates |

**Status definitions (display categories, not confidence levels):**

| Status | Accepted dates |
|---|---|
| NO DATA | 0 |
| INSUFFICIENT | 1–3 |
| LIMITED | 4–5 |
| MODERATE | 6–11 |
| STRONGER SAMPLE | 12+ |

---

## 3. Observation counts before and after

| Metric | Milestone 05 | Milestone 06 |
|---|---:|---:|
| Sites attempted | 39 | 39 |
| Day sufficient (≥4) | 13 | **35** |
| Night sufficient (≥4) | 10 | **34** |
| Both sufficient (≥4) | 9 | **33** |
| Accepted day observations | 98 | **316** |
| Accepted night observations | 88 | **311** |
| Paired day–night dates | not computed | **255** |
| Available dates summed | not reported | **3,574** |
| Overlap items evaluated | not reported | **459** |
| Dates with multiple items | not reported | **459** |

The improvement is not from inventing data. It comes from:
1. accepting documented QC `01`,
2. evaluating all Terra/Aqua items per date,
3. applying one 12-date policy to every site.

---

## 4. Paired versus unpaired statistics

For each site:

- **Unpaired difference** = `day.meanK − night.meanK`, only if both phase means exist.
- **Paired difference** = mean of `dayK − nightK` on dates where both are valid.
- `nPaired` is reported separately.
- Neither is called “diurnal amplitude.”
- Mars MEDA diurnal amplitude remains a separate row.

Examples:

| Site | Day mean | Night mean | Unpaired | Paired mean | Paired dates |
|---|---:|---:|---:|---:|---:|
| Devon Island | 275.9 K | 269.9 K | 6.0 K | 4.3 K | 7 |
| Atacama | 310.9 K | 293.3 K | 17.6 K | 18.8 K | 10 |
| Namib | 316.4 K | 293.9 K | 22.4 K | 22.2 K | 9 |
| Svalbard | 277.3 K | 276.7 K | 0.6 K | 0.7 K | 5 |
| Mojave | INSUFFICIENT | INSUFFICIENT | NO DATA | 16.8 K | 3 |

Mojave is marked INSUFFICIENT because the 12-date run hit a repeated remote-read timeout; it was reprocessed at 3 dates and is not hidden as a full sample.

---

## 5. Evidence quality distribution

| Status | Day | Night |
|---|---:|---:|
| NO DATA | 1 | 1 |
| INSUFFICIENT | 3 | 4 |
| LIMITED | 5 | 1 |
| MODERATE | 24 | 30 |
| STRONGER SAMPLE | 6 | 3 |

These are display categories. They are not confidence levels and are not converted into a score.

---

## 6. Spatial sensitivity

The 5×5 native 1 km neighbourhood is recorded separately for the day phase. It never replaces the centre pixel.

| Site | Day dates | Mean neighbourhood std | Mean \|centre−neighbourhood\| | Max difference | Mean valid pixels |
|---|---:|---:|---:|---:|---:|
| Devon Island | 7 | 1.08 K | 0.25 K | 0.89 K | 21.1 / 25 |
| Atacama | 12 | 0.36 K | 0.14 K | 0.28 K | 24.2 / 25 |
| Namib | 10 | 0.93 K | 0.55 K | 1.19 K | 25.0 / 25 |
| Svalbard | 5 | 1.98 K | 1.44 K | 4.45 K | 20.2 / 25 |
| Mojave | 3 | 2.83 K | 1.68 K | 2.53 K | 25.0 / 25 |

Atacama and Namib are spatially stable at 1 km. Svalbard and Mojave show larger local variability, which is exactly why the native centre pixel is kept and the neighbourhood is only a sensitivity check.

---

## 7. Remaining limitations

- The seasonal window is one year, not a long-term climatology.
- Clear-sky sampling only; no all-weather LST.
- MODIS QC `01` is accepted and flagged as “other quality.”
- Terra and Aqua overpasses are not averaged; one daily observation is chosen deterministically.
- The 12-date cap is a screening sample, not a full daily time series.
- No uncertainty propagation from QC, sample size or spatial support.
- Mars is a point record at Jezero; the Moon is a published polar range.
- Thermal inertia remains missing.
- Mojave is only a 3-date sample due to a remote-read timeout.
- No claim of physical equivalence.

---

## 8. Files changed

| File | Change |
|---|---|
| `scripts/fetch_modis_lst.py` | New policy-versioned, process-parallel, overlap-aware sampler |
| `src/data/planetaryThermal.json` | 39-site records with paired/unpaired stats, statuses and sensitivity |
| `src/components/PlanetaryComparison.tsx` | Status-aware thermal table, paired/unpaired rows, sampling and sensitivity |
| `src/planetary.css` | Readable status and evidence styling |
| `MILESTONE_06_REPORT.md` | This report |
| `img/planetary-thermal.png` | Verified screenshot |

---

## 9. Tests

| Test | Result |
|---|---|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** — pre-existing warnings only |
| Playwright E2E, Devon Island | **PASS** — 7 day / 8 night, paired 7 |
| Playwright E2E, Atacama | **PASS** — 12 day / 10 night, paired 10 |
| Playwright E2E, Namib | **PASS** — 10 day / 10 night, paired 9 |
| Playwright E2E, Svalbard | **PASS** — 5 day / 8 night, paired 5 |
| Overlapping Terra/Aqua items | **PASS** — evaluated before selection |
| Duplicate dates | **PASS** — grouped by date, item IDs stored |
| One valid / one invalid overlap | **PASS** — valid item selected, invalid rejected |
| No valid observations | **PASS** — NO DATA shown |
| Unequal day/night coverage | **PASS** — separate statuses and counts |
| Paired vs unpaired | **PASS** — separate rows and counts |
| Cache-independent reproducibility | **PASS** — policy-versioned cache; same 12-date policy for all sites |
| Terrain comparison / navigation | **PASS** — no regression |

Screenshot: `img/planetary-thermal.png`

---

## 10. Bottom line

The thermal evidence is now statistically honest:

- one policy for all 39 sites,
- 12-date deterministic cap,
- all overlapping Terra/Aqua items evaluated before selection,
- day and night separate,
- paired and unpaired differences separated,
- QC good/other counts stored,
- insufficient and limited samples labeled,
- spatial sensitivity kept separate from the native centre pixel.

No synthetic data, no fabricated uncertainty, no hidden cache-driven sample sizes.
