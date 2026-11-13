# ODYSSEY: Evidence Repair Milestone Report

Date: 2026-11-14. Companion documents: `EVIDENCE_COVERAGE_AUDIT.md` (root causes), `REQUIREMENT_EVIDENCE_REGISTRY.md` (every requirement, generated from code), `DATASET_EXPANSION_REPORT.md` (sources investigated).

Demonstration brief, unchanged: *"Plan a seven-day simulated lunar surface expedition that includes geological sampling, rover navigation, equipment deployment, thermal survival and dust mitigation."*

* Run before: `95db2401-7a03-4d72-a143-5ffbe2507221`.
* Live runs after: `29e1d0f4-b6d7-4586-ab44-f96b13a683d2` and `65a483d3-9cd9-4369-b094-4df64a0c179a`. The second is exported to `../demo/agent-run/`. Both used the real agent (DeepSeek V4.1 Flash via OpenCode) with Serper search.

## 1. What changed

1. **Requirement-to-evidence registry** (`src/mission/evidence.ts`). Shared by the UI, the engine and the agent. Each metric records:
   * quantity, unit, spatial and temporal support, and required resolution;
   * method, validation and limitation;
   * every dataset investigated, marked *used*, *found, not connected* or *not suitable*, each with a reason;
   * what exists, what is missing, and the next action.
2. **A 17-state evidence model.** Every state maps to one outcome: evaluated, integration needed, field measurement, physical mismatch, investigation needed or not applicable. "No open data" is gone from the app.
3. **Threshold provenance** on every requirement:
   * stated in the brief;
   * recipe assumption;
   * scientific source;
   * engineering constraint;
   * proposed in the audit, needing review.
4. **Separate Earth and target sides.** Each comparison now carries `earthState`, `targetState`, `gapSide` and `gapOutcome`. The UI says "Target value missing", "Needs field data", "Earth value missing" or "Not applicable" instead of "No data".
5. **New data: ESA WorldCover 2021 (10 m)** for 204 of 226 locations. It gives an upper bound on rock exposure that can rule a site out but never confirm one.
6. **Five verified target references:**
   * lunar thermal inertia, 55 ± 2;
   * Jezero thermal inertia, 180–605;
   * lunar longest darkness, ≈ 1.5 d at the best-lit point;
   * lunar south-pole lithology;
   * lunar median grain size, 72 µm.
7. **Four requirement definitions repaired:** thermal inertia, dust flux, roughness footprint and rock-exposure sampling area.
8. **Agent:**
   * new tool `investigate_evidence_gap`;
   * planner step and prompt rule keeping the three outcomes apart;
   * the report always explains every remaining gap;
   * a new "Evidence gaps" section in the Markdown report.
9. **API:** `POST /api/runs/:id/investigate` lets a user investigate one gap, optionally with one allow-listed search.
10. **UI:**
    * Mission and Site sections show an expandable evidence row per requirement (status, why, what exists, what is missing, next action, threshold source, sources and method) with an "Investigate this gap" button;
    * "Where Earth falls short" groups gaps by outcome.

## 2. Before / after

| Requirement | Previous status | Root cause | New source / method | New status |
|---|---|---|---|---|
| Fresh rock exposure ≥ 30% (geological sampling, required) | "No open data" at 39 sites | Bare-ground data existed but was not integrated; "the site" undefined | ESA WorldCover 2021 bare/sparse class, barest 2 × 2 km block in the DEM window, used as an upper bound | 4 sites **Not met** (bound < 5%: Lonar, Nullarbor, Undara, Wolfe Creek); 3 at best partly met; 31 *Field measurement required* with the bound shown; Dry Valleys *Dataset does not cover this location* |
| Surface bearing strength ≥ 30 kPa (rover, required) | "No open data" | Not remotely measurable at site scale | SoilGrids, gNATSGO and Macrostrat investigated and rejected (composition is not strength) | *Field measurement required*: DCP (ASTM D6951) grid, plate load tests |
| Thermal inertia (thermal survival, required) | "No open data"; statement "apparent thermal inertia ≥ 500 J m⁻² K⁻¹ s⁻¹ᐟ²" | Quantity and unit conflated, direction reversed; target reference not ingested | Requirement redefined as SI thermal inertia ≤ 400 (proposed, needs review); MODIS ATI rejected as a different quantity; Moon 55 ± 2 and Mars 180–605 ingested | Earth: *Field measurement required* (needle probe ASTM D5334). Target: verified reference. |
| Dust mass flux ≥ 5 g/m²/day (dust, required) | "No open data" | Definition mixed horizontal flux (per width) with an areal unit; source exists behind Earthdata Login | Redefined as deposition flux; MERRA-2 M2TMNXADG DUDP001–005 identified; AOD rejected as a substitute | *Source found, not integrated* (needs a NASA Earthdata Login) |
| Roughness ≤ 2.5 / 2 m (rover, deployment, required) | Shown as derived, footprint unstated | Definition lacked support; threshold near DEM noise | Statement gives the 120 m footprint; Copernicus DEM relative accuracy (< 2 m, 90% LE) stated as limitation | *Verified derived value*, with limitation: 29 of 39 sites fall below the DEM's 2 m accuracy |
| Field access index (4 experiments) | Shown as "derived index" | Hand-typed values in `fetch_sites.py` | Provenance corrected | *Unvalidated estimate*. A site whose required conditions rest mainly on estimates cannot be "strong". |
| Dust index (rover, dust) | Shown as "derived index" | Hand-typed values | Provenance corrected; replacement path recorded | *Unvalidated estimate* |
| Airport transfer, mapped material count, tag-only geology | Shown as derived/mapped | Hub table and curated tags | Tag-only matches separated from Macrostrat matches | *Unvalidated estimate* where no mapped unit supports it |
| Gravity, vacuum, 14-day lunar night | Site-independent | Physical | Unchanged; target-dependence of lunar darkness noted | *Not physically reproducible* (physical mismatch) |
| Climate requirements (temperature, precipitation, humidity, wind, solar) | Reanalysis | none | NASA POWER, unchanged | *Modelled (reanalysis)* |
| DEM terrain requirements (slopes, flat fraction) | Derived | none | Unchanged | *Verified derived value* |

Comparison gaps (Where Earth falls short):

| Condition | Previous display | Root cause | Now |
|---|---|---|---|
| Lithology ("Rock type") | "No data at all three sites" | Target reference missing | Spudis et al. 2008 highland impact breccia. **Does not match** at every curated site; Manicouagan and Pingualuit (discovery candidates) match. |
| Night ground temperature | "No data at all three sites" | Target reference missing; Earth MODIS exists | *Target value missing*, *Source found, not integrated* (Diviner, PDS) |
| Thermal inertia | "Cannot be evaluated yet" | Both sides | Target verified; Earth *Needs field data* |
| Longest darkness | Target "qualitative" | Not ingested | ≈ 1.5 d at the best-lit Shackleton rim point; compared as a ratio (0.5 d tropics → partial; polar night → mismatch) |
| Median grain size | "Cannot be evaluated yet" | Target not ingested; Earth not measurable remotely | Target 72 µm (Apollo/Luna); Earth *Needs field data* (ASTM D6913/D7928) |
| Mineralogy | "Cannot be evaluated yet" | Sources exist, not integrated | *Missing both sides*, *Source found, not integrated* (EMIT, M3, CRISM) |
| Moon air temperature, aerosol, soil moisture | "No data" | Not applicable | *Not applicable* |

## 3. Coverage, before and after (35 requirements × 39 sites = 1,365 cells)

| | Before | After |
|---|---|---|
| Cells labelled "No open data" / "No data" | 156 | 0 |
| Field measurement required (with protocol) | 0 named | 112 |
| Ruled out by a validated upper bound | 0 | 4 |
| Dataset does not cover the location | 0 named | 1 |
| Source found, not integrated | 0 named | 39 |
| Unvalidated estimate (hand-assigned or tag-only) | 0 named (shown as derived) | 323 |
| Modelled (reanalysis) | 429 | 429 |
| Verified derived value | 340 | 340 |
| Not physically reproducible | 117 | 117 |

The number of usable values went *up* by four (the bound-based failures). The number of cells honestly marked as weak went up by 323, because hand-typed indices are no longer presented as derived. The gap counter did not shrink for its own sake: every former "No data" now names its cause and its next step.

Target side: four dimensions that were missing for the Moon (thermal inertia, darkness, lithology, grain size) and one for Mars (thermal inertia) now hold verified references.

## 4. Changes to candidate rankings (recomputed from the same mission)

| Experiment | Before | After | Why |
|---|---|---|---|
| Geological sampling | 39 viable; top Kawah Ijen 67 | 0 viable, 35 downgraded, 4 rejected | Rock-exposure bound rules out Lonar, Nullarbor, Undara, Wolfe Creek. The verified lunar lithology (highland impact breccia) matches no curated site: critical mismatch. This experiment **needs a different location**. The registry points to Manicouagan (Macrostrat "plutonic: anorthosite") and Pingualuit ("anorthositic gabbro"; 27% bare ground in its window), neither yet evaluated as a mission site. |
| Rover navigation | 28 downgraded, 11 rejected | unchanged decisions; top scores +2 | More target evidence raised evidence completeness; no new rejection |
| Equipment deployment | 30 downgraded, 9 rejected | unchanged | No requirement in this experiment gained data |
| Thermal survival | 33 downgraded, 6 rejected | unchanged decisions; scores +1–2 | Thermal inertia now evaluable on the target side; Earth side remains a field measurement |
| Dust mitigation | 26 viable, 13 rejected | 0 viable, 26 downgraded, 13 rejected | The critical grain-size condition now has a target value and no Earth value. A critical, target-quantified condition with no Earth evidence downgrades (it no longer counts as silently fine). |

No candidate improved its decision. New evidence rejected or downgraded sites; it was never allowed to promote one. Missing evidence did not reject any site.

Decisive conditions per experiment, after repair:
* Geology: lithology class.
* Rover: P95 slope and gravity.
* Deployment: mean slope, gravity, pressure.
* Thermal: surface temperature envelope and pressure (controlled intervention).
* Dust: pressure (physical) and grain size (field measurement).

## 5. What the live agent did with this

Run `65a483d3` (52 tool calls, 12 searches): the model called `investigate_evidence_gap` four times. The report step recorded four more deterministically, so all eight gaps are explained:

| Gap | State | Outcome |
|---|---|---|
| Bearing strength | Field measurement required | field measurement |
| Thermal inertia (requirement and comparison) | Field measurement required | field measurement |
| Rock exposure | Field measurement required (with bound) | field measurement |
| Grain size | Field measurement required | field measurement |
| Dust deposition flux | Source found, not integrated | integration needed |
| Mineralogy | Source found, not integrated (both sides) | integration needed |
| Lunar night-time temperature | Source found, not integrated (target) | integration needed |

From its narrative: "Several required quantities are simply unmeasured rather than mismatched: bearing strength, SI thermal inertia, rock exposure and dust flux all need field or laboratory measurement before any site can be certified." Its next measurements are the ASTM D6951, D5334 and D6913/D7928 tests, deposition samplers or MERRA-2 integration, UAV orthomosaics, and EMIT and Diviner integration.

In the first live run the search budget was spent before the investigation step. The tool recorded "Search skipped: budget exhausted. This says nothing about whether a dataset exists." rather than "no data".

## 6. Scientific limitations

* The WorldCover bound uses a 2021 map with 76.7% overall accuracy, not re-validated at these sites. A misclassified block could hide or invent bare ground.
* The 2 × 2 km sampling area is a definition chosen in this audit, not a mission requirement.
* The lunar thermal inertia is a global average at 273 K, not a south-polar value.
* The lunar grain size comes from non-polar Apollo/Luna soils.
* The lunar darkness value applies to one best-lit point; the region also contains permanent shadow.
* The lithology class rule (anorthosite analog; impact breccia, norite, gabbro partial) is expert-assigned. It compares Macrostrat text, which is uneven in detail.
* 33 of 35 thresholds are unsourced recipe assumptions; two are audit proposals that need review.
* MERRA-2 dust deposition, once integrated, will be a ~50 km modelled value: a regional proxy, not a site measurement.
* Roughness thresholds of 2–2.5 m sit at the Copernicus DEM's stated relative accuracy and barely discriminate.

## 7. Tests

`npx tsx --test server/tests/*.test.ts`: **71 pass**, 3 live tests skipped (opt-in). `server/tests/evidence.test.ts` adds 25 regression tests:

* missing dataset mapping;
* search budget exhaustion (recorded as skipped, no network call);
* failed and empty searches never reported as absence of data;
* dataset found but not integrated;
* dataset not covering the location;
* inadequate resolution, via the roughness limitation and DEM baselines;
* incompatible units refused;
* Earth present / target missing, and target present / Earth missing;
* valid derived measurements;
* hand-assigned estimates versus measurements;
* upper-bound proxy can fail but never pass;
* field-measurement-required conditions;
* unsupported metrics;
* threshold provenance (recipe vs brief vs audit);
* an investigation with a fabricated search hit ("Bearing capacity 45 kPa measured at Mojave") leaves the value null and the status unchanged;
* side-specific badge rendering;
* lithology needs a geological match, not a shared word;
* the 55 ± 2 lunar value is pinned against the snippet's "552";
* every required gap is explained before the report.

`server/tests/science.test.ts` was updated for the verified references and gained a darkness-ratio test. Lint, typecheck (app and server), production build and the secret scan pass.

## 8. Screenshots

| File | Shows |
|---|---|
| `../screenshots/ev-01-mission-rock.png` | Mission section: evidence rows with state badges; rock exposure expanded with threshold provenance |
| `../screenshots/ev-02-site-requirements.png` | Site section, Kawah Ijen: requirements at this site, with the bare-ground bound (≤ 10.9%) |
| `../screenshots/ev-03-gaps-thermal.png` | Where Earth falls short, Thermal: gaps grouped into Integration needed and Field measurement required |
| `../screenshots/ev-04-investigation.png` | An investigation run from the UI (Diviner night temperature: source found, not integrated) |
| `../screenshots/ev-05-gaps-geology.png` | Geology comparison: rock type now "Does not match", mineralogy "Missing both sides" |
| `../screenshots/ev-06-mobile.png` | The same section at 390 px |

## 9. Next steps

1. Configure a NASA Earthdata Login (server-side `.env` only) and integrate MERRA-2 dust deposition and EMIT L2B mineralogy.
2. Ingest Diviner polar night-time temperatures and a 60 m PGDA LOLA tile for the target.
3. Promote Manicouagan and Pingualuit to curated sites (DEM, MODIS, POWER) so the geological sampling experiment has lithology-matched candidates.
4. Replace the hand-assigned access index with a documented quantity (transfer time and route survey).
5. Let users edit thresholds in the Mission section; the provenance field already records which ones are assumptions.
