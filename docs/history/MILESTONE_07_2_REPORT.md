# Milestone 07.2 — Final MODIS Metadata Corrections

Date: 2026-11-13  
Scope: three narrowly scoped corrections to Milestone 07.1. No LST changes, no mandatory-QA policy change, no UI redesign.

---

## 1. View-direction correction

The C6.1 sign convention is:

- Negative signed angle = MODIS views the grid **from the east**.
- Positive signed angle = MODIS views the grid **from the west**.
- Zero = nadir.
- Raw 255 = missing.

### Correct mapping

| Raw DN | Signed | Absolute | Direction |
|---:|---:|---:|---|
| 0 | −65.0° | 65.0° | **east** |
| 65 | 0.0° | 0.0° | **nadir** |
| 130 | +65.0° | 65.0° | **west** |
| 255 | — | — | **missing** |

Raw DN and angle calculations are unchanged. Only the direction mapping is corrected.

### Before/after

| Observation | Before | After |
|---|---|---|
| Atacama day Terra, raw 47 | −18.0°, west | **−18.0°, east** |
| Atacama day Terra, raw 108 | +43.0°, east | **+43.0°, west** |
| Devon day Terra, raw 81 | +16.0°, east | **+16.0°, west** |
| Atacama raw 0 | −65.0°, west | **−65.0°, east** |

Across the four audit sites:

- 70 timed observations
- 40 east, 29 west, 1 nadir after correction
- **69 direction labels flipped**; the nadir observation is unchanged

No temperature values changed.

---

## 2. Clear-sky fill correction

C6.1 metadata:

- Valid raw range: 1–65535
- Fill: 0
- Scale: 0.0005
- Offset: 0

### Correct decoding

| Raw DN | Before | After |
|---:|---|---|
| 0 | missing | **missing** |
| 1 | 0.0005 | **0.0005, valid** |
| 1999 | 0.9995 | **0.9995, valid** |
| 4000 | 2.0000 | **2.0000, valid** |
| 65535 | missing | **32.7675, valid** |

Raw values and unclipped scaled values are preserved. The field is not clipped and is not labeled a normalized 0–1 fraction.

At the four audit sites there are no raw 65535 or raw 0 clear-sky values, so no site-level clear-sky values changed in this correction. The boundary behavior is covered by unit tests.

---

## 3. Overlap-ranking audit

### Finding

The previous “current” selector was:

```python
rank_current = (rawQC, itemId)
```

That compared the **entire raw QC byte**, including disputed bits 2–3. Even if the ranking happened to agree with the error-aware policy, it was structurally wrong.

### Correction

```python
rank_current = (mandatoryQA bits 0–1, itemId)
rank_error_aware = (mandatoryQA bits 0–1,
                    LST error bits 6–7,
                    emissivity error bits 4–5,
                    itemId)
```

Bits 2–3 are explicitly not used. Deterministic item-ID tie-breaking is retained.

### Sensitivity after correction

The corrected selectors were rerun on the four audit sites.

- Current vs error-aware: **0.00 K change, zero count change** at Devon, Atacama, Namib and Svalbard.
- The previous raw-byte selector happened to choose the same observations at these four sites.
- The implementation is now structurally incapable of letting bits 2–3 influence selection.

Platform-only sensitivity is unchanged:

| Site | Terra-only Δday / Δnight | Aqua-only Δday / Δnight |
|---|---:|---:|
| Devon | +1.63 K / +2.69 K | −0.23 K / −2.29 K |
| Atacama | −3.17 K / +0.20 K | +12.01 K / −4.55 K |
| Namib | −1.58 K / +0.47 K | +8.01 K / −3.19 K |
| Svalbard | 0.00 K / +0.08 K | +0.39 K / −1.90 K |

No LST observations changed as a result of the ranking correction.

---

## 4. Timing provenance unchanged

The distinction remains:

- `productDateUTC` — UTC acquisition date
- `localSolarTimeHours` — view time × 0.1
- `localSolarDate: null` — not derived
- `timeBasis` — product date is UTC; view time is local solar; local date may differ

Terra and Aqua remain separate local-time overpasses and are not averaged.

---

## 5. QC conflict unchanged

Mandatory-QA acceptance is unchanged:

- QC00 accepted as good
- QC01 accepted conditionally
- QC10/QC11 rejected
- Raw QC byte preserved
- Bits 2–3 stored under both interpretations
- Bits 2–3 never used for acceptance or ranking

---

## 6. Unit tests

`scripts/test_modis_metadata.py` now contains 13 tests:

- raw 0 → −65°, absolute 65°, **east**
- raw 65 → 0°, nadir
- raw 130 → +65°, absolute 65°, **west**
- raw 255 → missing
- clear-sky 0 → missing
- clear-sky 1 → 0.0005, valid
- clear-sky 1999 → 0.9995, valid
- clear-sky 4000 → 2.0, unclipped
- clear-sky 65535 → 32.7675, valid
- current policy ignores raw QC bits 2–3
- error-aware policy uses LST error then emissivity error
- Terra and Aqua filters
- deterministic item-ID tie-break

Result: **13/13 PASS**.

---

## 7. Verification

| Test | Result |
|---|---|
| `python3 -m unittest -v test_modis_metadata` | **13/13 PASS** |
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** — pre-existing warnings only |
| Playwright E2E, Atacama | **PASS** |
| Playwright E2E, Devon Island | **PASS** |
| Playwright E2E, Namib | **PASS** |
| Playwright E2E, Svalbard | **PASS** |
| Terrain comparison / orbital navigation | **PASS** — no regression |

Screenshot: `img/planetary-thermal.png`

---

## 8. Files changed

| File | Change |
|---|---|
| `scripts/modis_metadata.py` | Corrected direction mapping, clear-sky fill, explicit QA/LST/emissivity ranking |
| `scripts/test_modis_metadata.py` | 13 boundary and ranking tests |
| `scripts/fetch_modis_timing.py` | Uses shared decoders for corrected metadata |
| `scripts/analyze_overlap_policy.py` | Rerun with explicit bits 0–1 / 6–7 / 4–5 ranking |
| `src/data/planetaryThermal.json` | Corrected timing metadata, direction counts, overlap sensitivity |
| `src/components/PlanetaryComparison.tsx` | Corrected direction/fill wording in the panel |
| `MILESTONE_07_2_REPORT.md` | This report |
| `img/planetary-thermal.png` | Updated screenshot |

---

## 9. Remaining limitations

- Timing extracted for the four audit sites only; the other 35 have platform/QC but not view time/angle.
- Clear-sky values are unclipped and not interpreted as normalized fractions; raw 65535 is valid but its physical meaning needs confirmation.
- Bits 2–3 remain an unresolved documentation conflict.
- Current and error-aware selection agree at the four audit sites; a larger audit may find divergences.
- Terra/Aqua platform sensitivity remains material, especially at Atacama and Namib.
- One seasonal window; no uncertainty propagation; Mars is a point record and the Moon is a published range.

---

## 10. Bottom line

Three corrections are complete:

1. **View direction:** negative = east, positive = west, 0 = nadir, 255 = missing.
2. **Clear-sky fill:** 0 = missing, 1–65535 valid, 65535 = 32.7675 unclipped.
3. **Overlap ranking:** explicit mandatory-QA / LST-error / emissivity-error fields; disputed bits 2–3 excluded.

LST observations, mandatory-QA acceptance and the planetary comparison architecture are unchanged.
