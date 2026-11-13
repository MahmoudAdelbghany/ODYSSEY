# Milestone 07 — MODIS Quality and Observation-Time Harmonization

Date: 2026-11-13  
Scope: decode MODIS quality information, preserve observation identity/timing, compare platform policies, and test QC00-only versus QC00+01.

---

## 1. Documentation conflict: bits 2–3

There is a real conflict between NASA sources:

| Source | Bits 2–3 interpretation |
|---|---|
| MOD11 Collection 6.1 User Guide, Table 13 | Two-bit data-quality field |
| NASA LAADS MOD11A1 C61 product specification | Bit 2 = data quality; bit 3 = Snow/Lakeice |
| NASA LAADS MYD11A1 C61 product specification | Bit 2 = data quality; bit 3 = Snow/Lakeice |

**ODyssey does not resolve this silently.**

- Raw QC byte is preserved unchanged.
- The decoder is product-specific (`MOD11A1` Terra, `MYD11A1` Aqua) and versioned: `m7-qc-v2`.
- Both interpretations are stored per observation:
  - `guideC61.dataQualityBits2_3`
  - `laadsC61.bit2DataQuality`
  - `laadsC61.bit3SnowLakeIce`
- Acceptance uses **only bits 0–1**, the mandatory QA field. Bits 2–3 are **not used to accept or reject** an observation.
- The QC00 vs QC00+01 sensitivity analysis therefore does not depend on the disputed bits.

The milestone’s suggested “bit 2 thermal band, bit 3 snow/ice” layout does not match the official MOD11A1 C6.1 QC table as published in the User Guide. The conflict is recorded, not hidden.

---

## 2. QC decoding rules

`qcPolicy` in `planetaryThermal.json`:

| Bits | Meaning | Used for acceptance? |
|---|---|---|
| 0–1 | Mandatory QA: 0 good, 1 other, 2 cloud, 3 other failure | **Yes** |
| 2–3 | Disputed: guide = data quality; LAADS = bit 2 data quality + bit 3 snow/lakeice | **No** |
| 4–5 | Emissivity error: ≤0.01, ≤0.02, ≤0.04, >0.04 | No |
| 6–7 | LST error: ≤1 K, ≤2 K, ≤3 K, >3 K | No |

Acceptance:

- **QC00** — accepted as good.
- **QC01** — accepted conditionally; counted separately as `nOtherQC`.
- **QC10 / QC11** — rejected.
- Fill DN = 0 rejected.

Every observation stores `rawQC`, decoded flags, `product`, `platform`, `itemId`, `date`, `qcClass`, `decoderVersion` and the documentation source used.

---

## 3. Observation identity and timing

For every accepted observation, the pipeline stores:

- Terra or Aqua
- `MOD11A1` or `MYD11A1`
- Item identifier
- Day/night phase
- Scaled view time (`Day/Night_view_time` × 0.1, local solar hours)
- View angle (raw degree DN, 0–90 accepted; 0/null treated as missing)
- Clear-sky coverage (`Clear_day/night_cov` × 0.0005, capped at 1.0)

Timing was extracted for the four audit sites: **Devon Island, Atacama, Namib, Svalbard**. The other 35 sites have platform and decoded QC but not timing; this is stated explicitly in the report and UI.

### Terra/Aqua local-time difference

| Site | Day Terra | Day Aqua | Night Terra | Night Aqua |
|---|---:|---:|---:|---:|
| Atacama | 9.54 h | 14.27 h | 22.03 h | 1.65 h |
| Devon Island | 12.80 h | 10.27 h | 20.10 h | 4.02 h |
| Svalbard | 13.96 h | — | 18.96 h | 5.07 h |

Terra and Aqua are different local-time overpasses. The best-QC selection can and does mix them across dates.

---

## 4. Platform distribution and paired mixing

Across the 39 sites:

| Phase | Terra | Aqua |
|---|---:|---:|
| Day accepted | 251 | 65 |
| Night accepted | 238 | 73 |

Paired day–night dates:

- **173 same-platform pairs**
- **82 mixed-platform pairs**

The mixed pairs are recorded but not averaged away. The UI reports the mix.

### Overlap-resolution comparison

| Policy | Day sites with ≥4 | Night sites with ≥4 |
|---|---:|---:|
| Best-QC (current) | **35** | **34** |
| Terra-only series | 31 | 33 |
| Aqua-only series | 4 | 6 |

Best-QC maximizes coverage but mixes platforms. Terra-only preserves phase consistency for most sites but loses Aqua. Aqua-only is too sparse. The current policy keeps best-QC **and** stores platform/item provenance, so a platform-specific series can be reconstructed by filtering observations.

One daily observation per date is selected by `(QC, itemId)`. Terra/Aqua overpasses are not averaged as if they were independent daily measurements.

---

## 5. QC00 versus QC00+01 sensitivity

Using only bits 0–1:

| Metric | QC00-only | QC00+01 accepted |
|---|---:|---:|
| Day accepted observations | 199 | **316** |
| Night accepted observations | 187 | **311** |
| Day sites with ≥4 | 23 | **35** |
| Night sites with ≥4 | 22 | **34** |

Across sites where both QC00 and accepted samples are sufficient:

- Day mean change: **−0.34 K** (range −3.30 to +5.33 K; 23 sites)
- Night mean change: **−0.61 K** (range −2.59 to +0.64 K; 22 sites)
- **15 sites** change sufficiency status when QC01 is conditionally accepted.

QC01 is not silently equivalent to QC00. It is counted, displayed, and its effect is quantified.

---

## 6. Polar pixel behavior

Nineteen sites are above 30° latitude. MOD11A1/MYD11A1 note that above 30° latitude, a daily pixel may average multiple qualifying clear-sky observations. View time and angle describe the daily retrieval, not necessarily a single overpass.

This is now recorded as a `polarNote` for every site above 30° and shown in the panel.

### Polar timing examples

- **Devon Island:** day Terra 12.80 h / Aqua 10.27 h; night Terra 20.10 h / Aqua 4.02 h.
- **Svalbard:** day Terra 13.96 h; night Terra 18.96 h / Aqua 5.07 h.
- Svalbard has only 1 QC00 day date; the accepted 5-date day sample is conditional quality, not equal to a QC00 sample.

---

## 7. Changed site values (selected)

| Site | Day mean | Night mean | Paired difference | Paired dates | Status |
|---|---:|---:|---:|---:|---|
| Devon Island | 275.9 K | 269.9 K | 4.3 K | 7 | day/night MODERATE |
| Atacama | 310.9 K | 293.3 K | 18.8 K | 10 | day STRONGER, night MODERATE |
| Namib | 316.4 K | 293.9 K | 22.2 K | 9 | day/night MODERATE |
| Svalbard | 277.3 K | 276.7 K | 0.7 K | 5 | day LIMITED, night MODERATE |
| Mojave | INSUFFICIENT | INSUFFICIENT | 16.8 K | 3 | 3-date reduced sample, documented |

Mojave remains a 3-date sample because a 12-date run hit a repeated remote-read timeout. It is not hidden as a full sample.

---

## 8. UI changes

Inside the existing PLANETARY panel:

- Day/night surface temperatures remain separate.
- Unpaired and paired day–night differences are separate; `nPaired` is shown.
- QC decoder note states the bits 2–3 conflict and that acceptance uses bits 0–1 only.
- Platform counts and paired same/mixed counts are shown.
- Per-site QC00-only vs QC00+01 sensitivity is shown.
- Local solar timing is shown for the four audit sites.
- Polar pixel note appears for sites above 30°.
- Status labels remain display categories, not confidence levels.

No combined thermal score was added. No terrain comparison or navigation changes.

---

## 9. Files changed

| File | Change |
|---|---|
| `scripts/fetch_modis_lst.py` | Policy-versioned sampler with raw QC, platform, item provenance, paired statistics |
| `scripts/analyze_modis_qc.py` | Product-specific, versioned QC decoder; both bits 2–3 interpretations; QC00 vs QC00+01 sensitivity |
| `scripts/fetch_modis_timing.py` | View time, angle, clear-sky coverage for four audit sites |
| `src/data/planetaryThermal.json` | Decoded QC, platform, timing, sensitivity, polar notes |
| `src/components/PlanetaryComparison.tsx` | QC/platform/timing/sensitivity UI |
| `src/planetary.css` | Readable QC/status styling |
| `MILESTONE_07_REPORT.md` | This report |
| `img/planetary-thermal.png` | Verified screenshot |

---

## 10. Tests

| Test | Result |
|---|---|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** — pre-existing warnings only |
| Playwright E2E, Atacama | **PASS** — QC/platform/timing/sensitivity visible |
| Playwright E2E, Svalbard | **PASS** — LIMITED day, polar note, QC platform mix |
| Playwright E2E, Mojave | **PASS** — INSUFFICIENT, 3-date sample, mixed platform pairs |
| QC00 vs QC00+01 | **PASS** — independent of bits 2–3 |
| Terrain comparison / navigation | **PASS** — no regression |

Screenshot: `img/planetary-thermal.png`

---

## 11. Remaining limitations

- Timing extracted for four audit sites only; the other 35 have platform/QC but not view time/angle.
- Bits 2–3 remain an unresolved documentation conflict; neither interpretation is used for acceptance.
- QC01 is conditional quality, not equivalent to QC00.
- One seasonal window; not a long-term climatology.
- 12-date cap is a screening sample.
- Terra/Aqua mixed pairs are recorded but not converted into a platform-specific diurnal statistic.
- No uncertainty propagation from QC, sample size or spatial support.
- Mars is a point record at Jezero; the Moon is a published mission-level range.
- Thermal inertia remains missing.

---

## 12. Bottom line

ODYSSEY now preserves the raw QC byte, decodes it product-specifically, and records the bits 2–3 conflict instead of silently choosing a side. Acceptance and sensitivity use only the unambiguous mandatory QA bits 0–1.

The QC00-only comparison retains 23 day / 22 night sites with ≥4 dates; conditional QC01 raises coverage to 35 / 34 sites, with day/night mean changes of −0.34 K and −0.61 K. The result is more coverage, explicitly conditional, and auditable.
