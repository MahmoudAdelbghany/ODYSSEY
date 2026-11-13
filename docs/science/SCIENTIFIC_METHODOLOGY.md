# ODYSSEY: Scientific Methodology

ODYSSEY's question is not only *where does Earth resemble the Moon or Mars* but
*where does Earth fail to resemble it, does that failure matter for this
experiment, and how can it be bridged*.

## 1. Environmental profiles

`server/science/profile.ts` declares a complete schema of 31 dimensions in eight
groups (terrain, thermal, atmosphere, radiation & illumination, gravity, geology,
resources, operations). A profile carries a value only where a real dataset or a
verified published reference exists; otherwise the dimension is `MISSING` with
the reason. Each measurement records:

* **quantity**: what was measured (e.g. `surface_temperature_envelope` vs
  `air_temperature_envelope` vs `thermal_inertia`);
* **support**: spatial (`point`, `pixel_1km`, `dem_window`, `regional_raster`,
  `mapped_unit`, `mission_region`, `global_constant`) and temporal
  (`seasonal_window`, `monthly_climatology`, `annual_climatology`,
  `multi_year_range`, `instantaneous`, `static` …), resolution and period;
* **epistemic status**: MEASURED, DERIVED, MODELED, PUBLISHED, SEARCHED,
  PENDING_REVIEW, PROPOSED, SIMULATED, ESTIMATED, MISSING;
* **source**, URL and date.

## 2. Planetary references (verified)

| Dimension | Moon (south pole) | Mars (Jezero) | Source |
|---|---|---|---|
| Terrain (mean/P95 slope, relief, roughness) | LOLA 400 m, 12.8 km window | MOLA 463 m, 12.8 km window | PDS products, `planetaryReference.json` |
| Surface temperature envelope | 50–250 K (published mission-level range) | 223–232 K (MEDA surface, sols 0–400) | Paige et al. 2010; Rodriguez-Manfredi et al. 2023 |
| Air temperature envelope |, | 216–222.5 K (MEDA 1.45 m) | Rodriguez-Manfredi et al. 2023 |
| Surface gravity | 1.62 m/s² | 3.73 m/s² | NASA NSSDC fact sheets (verified verbatim, live test) |
| Surface pressure | 3×10⁻¹⁵ bar (night) | 6.36 mb (4.0–8.7 seasonal) | NASA NSSDC fact sheets |
| Atmosphere | exosphere | CO₂ 95.1 % | NASA NSSDC fact sheets |
| Absorbed dose rate (Si) | 13.2 ± 1 µGy/h (Chang'E-4 LND, far side) | MISSING (not verifiable from open text) | Zhang et al. 2020, Sci. Adv. abstract |

## 3. Comparison rules (`compareMeasurements`)

1. Different quantities are never compared (`incompatible_support`), air vs
   surface temperature, temperature vs thermal inertia.
2. Temporal supports must be compatible; envelope comparisons across a seasonal
   window and a multi-period envelope are allowed only as **envelope tests** and
   say so. Diurnal vs seasonal, for example, is refused.
3. DEM-derived terrain is compared only at the same baseline (Earth resampled to
   400 m for LOLA, 463 m for MOLA).
4. A missing value on either side yields `missing`: never a match, never zero.
   Qualitative references (e.g. lunar polar darkness) are not compared numerically.
5. Envelope vs envelope: classification uses the share of the **target** envelope
   covered by Earth (≥60 % analog, ≥20 % partial, else mismatch).
6. Ratio-scale quantities (gravity, pressure, relief, dose) report a ratio and a
   relative difference; interval quantities report absolute differences only.
7. Gravity, pressure, atmospheric composition and radiation are **planet-wide**:
   any non-analog result is classified `not_naturally_reproducible` because no
   Earth site can change them.

## 4. Mismatch → handling

Each experiment archetype lists the conditions that matter with an importance
(critical / important / context) and a reason (`EXPERIMENT_RELEVANCE`). A
mismatch *matters* when it is not an analog and not context-only. Handling:

| Classification | Handling |
|---|---|
| analog | natural analog |
| partial / mismatch (site-variable) | choose a better site; if none exists → Earth-wide gap |
| not naturally reproducible | controlled intervention (or numerical simulation for gravity) |
| missing / incompatible support | needs measurement, stays unresolved |

An **Earth-wide gap** is a non-context condition that no non-rejected candidate
reproduces even partially; it cannot be closed by site choice.

## 5. Candidate filtering (PART 6)

1. Hard constraints first: any `required` requirement that fails its limit, no
   climatological window for the mission duration, required-evidence coverage
   below 50 %, or experiment score below 40 → **rejected** with the reason.
2. Critical mismatches, or a critical condition the target quantifies but the site
   has no data for → **downgraded**.
3. Independent rankings: experimental suitability (deterministic requirement
   score), terrain vs target, thermal vs target, geology, operations, evidence
   completeness, bridgeable gaps (share of mattering gaps with a non-concept
   intervention).
4. Secondary aggregate, explicitly defined: experimental suitability 0.35,
   terrain 0.15, evidence 0.15, thermal 0.10, geology 0.10, operations 0.10,
   intervention feasibility 0.05, renormalised over available rankings. It is
   not a probability.

## 6. Reranking (PART 8)

Learned relevance ordering is applied **only** to non-rejected candidates. The
WA-on-test2/Reranker computes `Σ weight × (1 − satisfaction)` per candidate with
weights proposed by the LLM from Crossref abstracts and validated by the
Reranker (unknown features or sources are rejected). Missing scores produce a
provisional distance interval, never a zero. Every rerank is stored with input
ids, model, weights with basis and papers, output order, the deterministic
baseline order (ODYSSEY requirement weights) and Kendall τ between the two.
Retrieved sources are ordered by BM25, relevance, not truth.

## 7. Evidence verification (PART 7)

Search results are `PENDING_REVIEW`. Verification requires: full source text
retrieved from an allow-listed host; claims proposed by the LLM; each kept claim's
quote found verbatim (whitespace/dash-normalised) in the source; every reported
number present in that quote; no quantity qualifier (difference, amplitude,
subsurface, air, inertia, rate, …) absent from the request; then a deterministic
unit-converted judgement. Envelope claims must agree with the reference at
**both** bounds, overlap alone is not support. Results: `supported`,
`contradicted` (recorded as a contradiction and a revisit decision) or
`unresolved`. Without an LLM, numeric matches are only candidates (`unresolved`).

## 8. Temporal evaluation

NASA POWER/MERRA-2 monthly normals (2001–2020) via `src/temporal`. Windows are
climatological, not forecasts; monthly normals suppress daily extremes.

## 9. Known limitations

* MODIS LST samples are warm-season 3-month windows (≤12 dates), not annual
  extremes; Earth envelopes therefore understate cold extremes.
* The lunar 50–250 K envelope is a published mission-level polar range; NASA
  sources retrieved during runs report lower PSR and higher sunlit values, the
  verifier flags such bound disagreements for review rather than silently
  editing the reference.
* Requirement thresholds come from expert-defined recipes tagged INFERRED unless
  stated in the brief.
* The 39 curated sites and 15 enriched regions are not a global validation set.
