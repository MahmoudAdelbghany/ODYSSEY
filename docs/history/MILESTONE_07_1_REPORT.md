# Milestone 07.1 — MODIS Metadata Decoding Correction

Date: 2026-11-13  
Scope: correct view-angle and clear-sky metadata decoding, compare overlap policies, and preserve timing provenance. Mandatory-QA acceptance is unchanged.

---

## 1. Audit findings

### 1.1 View angle was treated as raw DN degrees

The previous implementation stored `Day_view_angl` / `Night_view_angl` as if the raw DN were the angle. That was wrong.

Official C6.1 metadata:

- Raw valid range: 0–130
- Fill: 255
- Scale: 1.0
- Offset: −65°
- Signed angle: `DN − 65`
- Absolute zenith angle: `|DN − 65|`
- Sign encodes east/west viewing direction

Consequences of the old interpretation:

- Raw 0 was treated as missing; it is actually **−65°** (valid).
- Raw 65 was shown as 65°; it is actually **0°** (nadir).
- Raw 130 was shown as 130°; it is actually **+65°**.
- Raw 255 was not consistently handled as fill.

### 1.2 Clear-sky coverage was clipped and mislabeled

The previous implementation used `raw × 0.0005` and capped at 1.0, then presented it as a normalized fraction. That cap is not in the product metadata.

Correction:

- raw DN preserved
- scale 0.0005 preserved
- unclipped scaled value preserved
- fill candidates 0 and 65535 marked missing
- no claim that the field is a 0–1 fraction
- no clipping

### 1.3 Timing and product date were not distinguished

The previous timing field was a local-solar time. It did not record that the product date is the UTC acquisition date. The local solar date was not derived and should not be assumed equal to the product date.

Correction:

- `productDateUTC`
- `localSolarTimeHours`
- `localSolarDate: null`
- `timeBasis` explaining the distinction

### 1.4 Overlap policy used raw QC ordering

The current selector used `(raw QC, itemId)`. It did not explicitly rank by mandatory QA, LST error class, then emissivity error class. The current policy is retained for comparison, but an explicit error-aware policy was added and tested.

Bits 2–3 remain excluded from ranking and acceptance.

---

## 2. Correction: view-angle decoding

Implemented in `scripts/modis_metadata.py`, versioned `m7.1-meta-v1`.

| Raw DN | Signed | Absolute | Direction | Missing |
|---:|---:|---:|---|---|
| 0 | −65.0° | 65.0° | west | no |
| 65 | 0.0° | 0.0° | nadir | no |
| 130 | +65.0° | 65.0° | east | no |
| 255 | — | — | missing | yes |

Every timing record stores:

- `rawViewAngleDN`
- `signedViewAngleDeg`
- `absoluteViewAngleDeg`
- `viewDirection` (`west` / `east` / `nadir` / `missing`)
- `viewAngleMissing`

No raw zero is treated as missing.

---

## 3. Correction: clear-sky coverage

| Raw DN | Scale | Unclipped | Missing |
|---:|---:|---:|---|
| 1999 | 0.0005 | 0.9995 | no |
| 4000 | 0.0005 | 2.0000 | no |
| 0 | 0.0005 | — | yes (fill candidate) |
| 65535 | 0.0005 | — | yes (fill candidate) |

The unclipped value is stored. It is **not** labeled as a normalized fraction and is **not** capped.

---

## 4. Before/after values

### Atacama — day Terra

| Field | Before | After |
|---|---|---|
| Mean view angle | 26.3 (raw DN treated as degrees) | signed −12.9°, absolute 38.7° |
| Clear-sky coverage | 0.997 (clipped, labeled fraction) | raw 2437.2 DN → 1.2186 unclipped |
| Local solar time | 9.54 h | 9.54 h |

### Devon Island — day Terra

| Field | Before | After |
|---|---|---|
| Mean view angle | 81.0 (raw DN treated as degrees) | signed +16.0°, absolute 16.0° |
| Clear-sky coverage | 1.0 (clipped) | raw 2056.0 DN → 1.0280 unclipped |
| Local solar time | 12.80 h | 12.80 h |

### Boundary examples in the accepted data

- Atacama 2023-12-17: raw angle 0 → **−65.0° / absolute 65.0° / west**; previously treated as missing.
- Atacama 2023-12-17: raw clear-sky 4000 → **2.0000 unclipped**; previously clipped to 1.0.
- Any raw angle 255 → **missing**.
- Raw angle 65 → **0° nadir**.

---

## 5. Overlap-resolution sensitivity

Policies compared on the four audit sites:

1. **Current** — raw QC, then item ID.
2. **Error-aware** — mandatory QA, LST error bits 6–7, emissivity error bits 4–5, then item ID.
3. **Terra-only** — Terra candidates, then error-aware.
4. **Aqua-only** — Aqua candidates, then error-aware.

Bits 2–3 were not used in any ranking.

### Results

| Site | Policy | Day n / mean | Night n / mean | Paired n / mean Δ | Δ day vs current | Δ night vs current |
|---|---|---:|---:|---:|---:|---:|
| Devon | current | 7 / 275.93 K | 8 / 269.94 K | 7 / 4.30 K | — | — |
| Devon | error-aware | 7 / 275.93 K | 8 / 269.94 K | 7 / 4.30 K | 0.00 | 0.00 |
| Devon | Terra-only | 4 / 277.56 K | 6 / 272.63 K | 4 / 5.10 K | +1.63 | +2.69 |
| Devon | Aqua-only | 7 / 275.70 K | 7 / 267.65 K | 6 / 5.26 K | −0.23 | −2.29 |
| Atacama | current | 12 / 310.92 K | 10 / 293.32 K | 10 / 18.78 K | — | — |
| Atacama | error-aware | 12 / 310.92 K | 10 / 293.32 K | 10 / 18.78 K | 0.00 | 0.00 |
| Atacama | Terra-only | 9 / 307.75 K | 8 / 293.52 K | 6 / 14.81 K | −3.17 | +0.20 |
| Atacama | Aqua-only | 10 / 322.93 K | 9 / 288.77 K | 9 / 35.03 K | +12.01 | −4.55 |
| Namib | current | 10 / 316.38 K | 10 / 293.94 K | 9 / 22.18 K | — | — |
| Namib | error-aware | 10 / 316.38 K | 10 / 293.94 K | 9 / 22.18 K | 0.00 | 0.00 |
| Namib | Terra-only | 9 / 314.80 K | 10 / 294.41 K | 9 / 20.40 K | −1.58 | +0.47 |
| Namib | Aqua-only | 9 / 324.39 K | 6 / 290.75 K | 4 / 35.96 K | +8.01 | −3.19 |
| Svalbard | current | 5 / 277.34 K | 8 / 276.74 K | 5 / 0.65 K | — | — |
| Svalbard | error-aware | 5 / 277.34 K | 8 / 276.74 K | 5 / 0.65 K | 0.00 | 0.00 |
| Svalbard | Terra-only | 5 / 277.34 K | 5 / 276.82 K | 3 / 0.86 K | 0.00 | +0.08 |
| Svalbard | Aqua-only | 5 / 277.73 K | 5 / 274.84 K | 4 / 6.01 K | +0.39 | −1.90 |

**Key finding:** the current raw-QC selector and the explicit error-aware selector produce **identical observations at all four audit sites**. The material sensitivity is platform choice, not the LST/emissivity tie-break. Atacama and Namib show large Aqua-only day differences (+12.01 K and +8.01 K), while Terra-only is closer to the current mixed series.

No single platform is a substitute for the mixed best-QC series.

---

## 6. Timing provenance

Every timing record now distinguishes:

- `productDateUTC` — UTC acquisition date from the item ID
- `localSolarTimeHours` — view time × 0.1
- `localSolarDate: null` — not derived
- `timeBasis` — “product date is UTC acquisition date; view time is local solar time; local date not derived”

### Examples

| Site | Day Terra | Day Aqua | Night Terra | Night Aqua |
|---|---:|---:|---:|---:|
| Atacama | 9.54 h | 14.27 h | 22.03 h | 1.65 h |
| Devon Island | 12.80 h | 10.27 h | 20.10 h | 4.02 h |
| Namib | 9.46 h | 14.80 h | 22.21 h | 1.70 h |
| Svalbard | 13.96 h | — | 18.96 h | 5.07 h |

Terra and Aqua are different local-time overpasses. They are not averaged.

---

## 7. QC conflict remains preserved

No change to the mandatory-QA acceptance policy.

- Raw QC byte preserved.
- Product-specific, versioned decoder `m7-qc-v2`.
- Bits 0–1 used for acceptance.
- Bits 2–3 stored under both interpretations:
  - MOD11 C6.1 guide: two-bit data quality
  - LAADS MOD11A1/MYD11A1: bit 2 data quality, bit 3 snow/lake-ice
- Neither bits 2–3 interpretation is used for acceptance or ranking.

---

## 8. Files changed

| File | Change |
|---|---|
| `scripts/modis_metadata.py` | Shared angle, clear-sky and ranking decoder |
| `scripts/test_modis_metadata.py` | Unit tests for angle, fill, coverage and ranking |
| `scripts/fetch_modis_timing.py` | Corrected angle/coverage/timing provenance for four audit sites |
| `scripts/analyze_overlap_policy.py` | Four-policy overlap sensitivity |
| `src/data/planetaryThermal.json` | Corrected timing fields, metadata decoder, overlap sensitivity |
| `src/components/PlanetaryComparison.tsx` | Corrected angle/coverage/timing and overlap-policy display |
| `src/planetary.css` | Readable metadata text |
| `MILESTONE_07_1_REPORT.md` | This report |
| `img/planetary-thermal.png` | Verified screenshot |

---

## 9. Tests

| Test | Result |
|---|---|
| `python3 -m unittest -v test_modis_metadata` | **11/11 PASS** |
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** — pre-existing warnings only |
| Playwright E2E, Atacama | **PASS** |
| Playwright E2E, Devon Island | **PASS** |
| Playwright E2E, Namib | **PASS** |
| Playwright E2E, Svalbard | **PASS** |
| Terrain comparison / orbital navigation | **PASS** — no regression |

Unit tests cover:

- raw 0 → −65°, absolute 65°, west
- raw 65 → 0°, nadir
- raw 130 → +65°, east
- raw 255 → missing
- clear-sky 1999 → 0.9995
- clear-sky 4000 → 2.0 unclipped
- clear-sky 0/65535 → missing
- current vs error-aware ranking
- Terra/Aqua filters
- deterministic item-ID tie-break

Screenshot: `img/planetary-thermal.png`

---

## 10. Remaining limitations

- Timing extracted for the four audit sites only; the other 35 have platform/QC but not view time/angle.
- Clear-sky coverage values above 1.0 are preserved unclipped but not physically interpreted; the product’s exact valid range/fill convention needs confirmation.
- Bits 2–3 remain an unresolved documentation conflict.
- The current and error-aware selectors agree at these four sites; a larger audit may find divergences.
- Terra/Aqua mixed pairs are recorded but not converted into a platform-specific diurnal statistic.
- One seasonal window; not a long-term climatology.
- No uncertainty propagation from QC, sample size or spatial support.
- Mars is a point record at Jezero; the Moon is a published mission-level range.
- Thermal inertia remains missing.

---

## 11. Bottom line

The metadata interpretation is corrected:

- view angle is signed `DN − 65`, with absolute angle and direction preserved;
- raw 0 is valid, raw 255 is fill;
- clear-sky coverage is raw + unclipped scaled, not a clipped 0–1 fraction;
- timing distinguishes UTC product date from local solar time;
- error-aware overlap ranking is implemented and compared, but the material sensitivity is platform choice;
- mandatory-QA acceptance and the QC bits 2–3 conflict remain unchanged.
