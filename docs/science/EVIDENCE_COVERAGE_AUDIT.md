# ODYSSEY: Evidence Coverage Audit

Date: 2026-11-14. Mission audited (the demonstration brief, unchanged):

> Plan a seven-day simulated lunar surface expedition that includes geological sampling, rover navigation, equipment deployment, thermal survival and dust mitigation.

Reference run before the repair: `95db2401-7a03-4d72-a143-5ffbe2507221` (stored in `server/data/odyssey.sqlite`). The recomputation script is `scripts/evidence_before_after.mts`.

## 1. How evidence flows, and where it disappeared

```
brief → parse_mission (LLM picks archetypes, quotes the brief)
      → decomposeMission (src/mission/decompose.ts): recipes from src/mission/archetypes.ts
      → RequirementSpec {metric, threshold, kind}
      → getMetric(site, terrain, metric)      (src/mission/metrics.ts)
      → evaluateRequirement → status pass / partial / fail / missing
      → candidates (server/science/candidates.ts)
      → profiles + compareMeasurements          (server/science/profile.ts, mismatch.ts)
      → UI: Mission, Site, Where Earth falls short
```

The demonstration mission has 35 requirements across 5 experiments, and every Earth site is compared with the target on 4–5 conditions per experiment. Evidence disappeared at five distinct points:

| # | Where | What happened |
|---|---|---|
| A | `getMetric` | `rockExposure`, `bearingStrength`, `thermalInertia` and `dustFlux` were hard-coded to `null`. The UI then said "No open data" for all 39 sites. No investigation stood behind that label. |
| B | `metricEvidence` | `access`, `dust`, `water` were labelled "Odyssey derived index". They are numbers typed by hand in `scripts/fetch_sites.py` / `scripts/enrich.py` (e.g. `access=0.72, dust=0.90`), with no dataset or method. |
| C | `planetaryProfile` | Every target dimension without a value was filled with one generic `missing(..., 'No verified reference ingested')`. The Moon had no thermal inertia, darkness duration, lithology or grain size, so Earth sites showed "No data" even where Earth had measurements. |
| D | `compareMeasurements` | A missing value on either side produced one class, `missing`, labelled "No data". The UI could not say which side was missing, or why. "Cannot be evaluated yet: there is no compatible measurement on Earth or on the target" was printed for all of them. |
| E | Recipes | Two requirements were scientifically ill-defined (thermal inertia and dust flux, see §3), and every threshold carried the same "inferred" flag without saying where it came from. |

## 2. Root cause of every displayed gap (demonstration mission)

Classification uses the eleven causes from the brief: (1) data does not exist, (2) exists but not integrated, (3) downloaded but not exposed, (4) wrong variable/unit mapping, (5) spatial resolution, (6) temporal support, (7) incomplete generated-site enrichment, (8) search failure/budget, (9) retrieval failure, (10) not remotely measurable, (11) requirement without a valid measurement definition.

| Gap shown before | Root cause | Notes |
|---|---|---|
| Rock exposure ≥ 30% ("No open data") | 2 and 10 | No global product maps *fresh rock*. ESA WorldCover maps bare ground at 10 m and gives a valid upper bound; it was never integrated. Separating rock from sand and soil needs field or sub-metre imagery. |
| Surface bearing strength ≥ 30 kPa ("No open data") | 10 | No open, site-scale strength data exist for these sites. Soil-texture models (SoilGrids) and survey interpretations (gNATSGO, US only) are not strength measurements. |
| Thermal inertia ("No open data", "Cannot be evaluated") | 11, 4, 2 (target side) | The recipe asked for *apparent* thermal inertia (units K⁻¹) in SI units (J m⁻² K⁻¹ s⁻¹ᐟ²), with a direction (≥ 500) that moves away from the lunar value. The Moon side had no value although Hayne et al. (2017) publish one. Earth-side SI thermal inertia needs in-situ measurement. |
| Dust mass flux ≥ 5 g/m²/day ("No open data") | 11, 2 | "Horizontal mass flux" is per unit width (g m⁻¹ day⁻¹), not per area. Deposition flux (per area) is the relevant exposure and MERRA-2 models it, but access needs a NASA Earthdata Login that is not configured. |
| Longest darkness (target "No data") | 2 (target side) | Mazarico et al. (2011) give the longest continuous darkness at the best-lit Shackleton rim point (≈ 1.5 days). It was never ingested; the Moon value was `null`. |
| Night ground temperature ("No data at all three sites") | 2 (target side) | Earth MODIS night LST **exists** for the sites. The Moon reference was missing (Diviner polar night temperatures are on the PDS but not ingested). The UI blamed no side. |
| Rock type / lithology ("No data at all three sites") | 2 (target side) | Earth Macrostrat lithology exists. The lunar south-pole lithology (Spudis et al. 2008) had not been ingested. |
| Mineralogy ("Cannot be evaluated") | 2 (both sides) | EMIT L2B (Earth, Earthdata Login), M3 (Moon) and CRISM (Mars) exist; none ingested. Mapped lithology is not mineralogy. |
| Regolith grain size ("Cannot be evaluated") | 2 (target), 10 (Earth) | Apollo/Luna median grain size is published (Carrier). Earth sites need sieve analysis. |
| Moon air temperature, aerosol, soil moisture ("No data") | none: not applicable | The Moon has no atmosphere and no soil water; these are not gaps. |
| Field access index, dust index (shown as derived) | 11 | Hand-typed values presented as derived indices. Not a gap in the UI, which was the problem. |
| 3×3 residual roughness ≤ 2.5 m | 11 (definition) | The value is computed correctly, but the statement gave no footprint. At 40 m spacing a 3×3 window is 120 m. 29 of 39 sites are below 2 m, the Copernicus DEM's stated relative vertical accuracy, so the threshold barely discriminates. |

Search budget exhaustion (cause 8) and retrieval failures (cause 9) did not cause any of the displayed gaps in the demonstration run. They are now recorded explicitly when they occur, and a failed search is reported as a search outcome, never as absence of data.

## 3. Requirement definitions corrected

| Requirement | Before | After | Why |
|---|---|---|---|
| Thermal inertia (thermal survival) | apparent thermal inertia ≥ 500 J m⁻² K⁻¹ s⁻¹ᐟ² | surface thermal inertia ≤ 400 J m⁻² K⁻¹ s⁻¹ᐟ² (SI) | Unit/quantity conflation and wrong direction. Lunar regolith: 55 ± 2 at 273 K (Hayne et al. 2017). Limits marked *proposed, needs review*. |
| Dust flux (dust mitigation) | horizontal dust mass flux ≥ 5 g/m²/day | dust deposition flux ≥ 5 g m⁻² day⁻¹ | Horizontal flux is per unit width. Magnitude marked *proposed, needs review*. |
| Roughness (rover, deployment) | 3×3 residual roughness ≤ 2.5 / 2 m | RMS residual relief in a 120 m window (3×3 cells of the 40 m DEM) ≤ 2.5 / 2 m | States the footprint; the DEM accuracy limit is shown as the limitation. |
| Rock exposure (geological sampling) | fresh rock exposure ≥ 30% of the site | fresh rock exposure ≥ 30% within a 2 × 2 km sampling area | "The site" was undefined; a 20 km window penalises sites whose outcrop is local. |

No requirement was removed. None was made easier to pass.

## 4. Threshold provenance

Every threshold now carries a basis: *stated in your brief*, *proposed assumption (experiment recipe)*, *from a cited scientific source*, *derived from an engineering constraint*, or *proposed in the evidence audit, needs review*. In the demonstration mission:

* 33 of 35 thresholds are recipe assumptions. None is a NASA requirement and none cites a source. The UI says so and invites editing.
* 2 (thermal inertia, dust deposition) are audit revisions that need review.
* 0 are stated in the brief (the brief contains no numbers). A brief such as "slopes must stay below 10°" produces thresholds marked *stated in your brief* (tested).
* No threshold is labelled as scientifically sourced, because none has a verified source yet.

## 5. Earth side and target side are reported separately

Each comparison now carries `earthState`, `targetState`, `gapSide` (`earth` / `target` / `both`) and `gapOutcome`. The three outcomes the brief asks to keep apart are distinct values:

| Outcome | Meaning | Example |
|---|---|---|
| `integration_needed` | A dataset exists but ODYSSEY has not connected it | Lunar night-time surface temperature (Diviner, PDS) |
| `field_measurement` | Cannot be measured remotely at the needed scale | Bearing strength; Earth thermal inertia; Earth grain size |
| `physical_mismatch` | Earth cannot reproduce it anywhere | Gravity, vacuum, lunar night |

`not_applicable` (e.g. lunar air temperature) and `investigation_needed` (no source review recorded yet) are separate as well. A missing value never counts as a mismatch, and never passes a requirement.
