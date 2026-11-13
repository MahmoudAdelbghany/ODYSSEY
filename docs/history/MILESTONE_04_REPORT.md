# Milestone 04 — Environmental Analog Comparison

Date: 2026-11-13  
Scope: measured thermal comparison inside the existing Site Orbit / PLANETARY panel.

---

## 1. Products and exact identifiers

| Body | Product | Identifier | Native resolution | Support | Units |
|---|---|---|---|---|---|
| Earth surface | MODIS/MYD11A1 v061 Land Surface Temperature | `LST_Day_1km` + `QC_Day` | 1 km, daily | Clear-sky daytime surface skin temperature | DN × 0.02 = K |
| Earth air | NASA POWER / MERRA-2 monthly climatology 2001–2020 | `T2M` | 0.5° × 0.625°, monthly normals | 2 m air temperature, point sample | °C (converted to K) |
| Mars | MEDA / Perseverance | Rodriguez-Manfredi et al. 2023, DOI `10.1038/s41561-022-01084-0` | Point at Jezero | Air at 1.45 m; surface brightness temperature; Sols 0–400 | K |
| Moon | LRO Diviner polar surface temperature | Paige et al. 2010, DOI `10.1126/science.1187726` | Mission-level polar range | Permanently shadowed regions and illuminated slopes | K |

MODIS access: Microsoft Planetary Computer STAC, collection `modis-11A1-061`.

---

## 2. Data provenance and processing

### Earth surface temperature

- Searched `modis-11A1-061` at the site point for a seasonal window.
- Read the native 1 km `LST_Day_1km` pixel (3 × 3 median) from the signed COG.
- Converted DN to K: `K = DN × 0.02`.
- Filtered `QC_Day` bits 0–1 equal to `00` (good quality).
- No resampling. Native 1 km support is preserved.
- Windows:
  - Devon Island: 2023-06-01 → 2023-08-31, 24 scenes, **1 good-QC**.
  - Atacama: 2023-01-01 → 2023-03-31, 24 scenes, **23 good-QC**.

### Earth air temperature

- Existing NASA POWER / MERRA-2 monthly climatology 2001–2020.
- 2 m air temperature, monthly normals, point sample.
- Annual mean and seasonal range computed from `src/data/siteMonthly.json`.

### Mars

- MEDA point record at Jezero.
- Air temperature at 1.45 m: **216.0–222.5 K**.
- Surface brightness temperature: **223.0–232.0 K**.
- Diurnal amplitude: **73–92 K**.
- Period: Sols 0–400 (2021–2022).
- Explicitly a point record, not a regional or global field.

### Moon

- Diviner polar surface-temperature range: **50–250 K**.
- Support: permanently shadowed regions and illuminated polar slopes; annual/seasonal range.
- Explicitly a mission-level published range, **not** a site-specific Diviner sample.
- The Diviner PCP/PRP rasters were not ingested in this sprint.

### Thermal inertia

- Earth: not available in the repository.
- Moon: Diviner thermal inertia not integrated.
- Mars: THEMIS thermal inertia not integrated.
- Displayed as **NO DATA** in all three columns. Thermal inertia is not treated as temperature.

---

## 3. Results for tested sites

### Devon Island (polar desert, 75.00°N / 87.00°W)

| Variable | Earth | Mars / Jezero | Moon / south pole |
|---|---:|---:|---:|
| Air temperature | 257.5 K | 216.0–222.5 K | Not defined |
| Surface temperature | 275.7 K | 223.0–232.0 K | 50–250 K |
| Seasonal air amplitude | 38.7 K | NO DATA | Not defined |
| Diurnal amplitude | NO DATA | 73–92 K | NO DATA |
| Thermal inertia | NO DATA | NO DATA | NO DATA |

Earth surface temperature is from **1 good-QC MODIS scene** (2023-06-01 → 2023-08-31). The low sample is shown explicitly in the panel.

### Atacama Desert (hyper-arid, 23.50°S / 68.20°W)

| Variable | Earth | Mars / Jezero | Moon / south pole |
|---|---:|---:|---:|
| Air temperature | 287.6 K | 216.0–222.5 K | Not defined |
| Surface temperature | 311.4 K | 223.0–232.0 K | 50–250 K |
| Seasonal air amplitude | 8.6 K | NO DATA | Not defined |
| Diurnal amplitude | NO DATA | 73–92 K | NO DATA |
| Thermal inertia | NO DATA | NO DATA | NO DATA |

Earth surface temperature is from **23 good-QC MODIS scenes** (2023-01-01 → 2023-03-31).

The two sites produce different thermal regimes, confirming the comparison is site-sensitive, not a fixed display.

---

## 4. Assumptions and limitations

1. **Earth surface temperature is clear-sky daytime only.** It is not a full diurnal cycle or a monthly climatology.
2. **Devon has only one good-QC MODIS scene.** This is a weak sample and is labeled as such; it is not presented as a seasonal mean.
3. **Mars is a point record.** MEDA at Jezero is not a global field; the values are ranges across Sols 0–400.
4. **Moon is a published polar range.** It is not a site-specific Diviner sample, and it is not a single temperature.
5. **Air and surface temperature are separate rows.** They are not merged into one value or score.
6. **Earth seasonal air amplitude is not compared to Mars diurnal amplitude.** They are different supports and are shown in separate rows.
6. **Thermal inertia is missing for all three bodies.** It is not inferred from temperature.
7. **No combined thermal score.** The panel shows measured supports side by side.
8. **No physical equivalence is claimed.** Earth does not reproduce lunar vacuum or the Martian 6 mbar CO2 atmosphere.
9. **MODIS is sampled for two test sites only** in this sprint (Devon and Atacama). Other sites show `NO DATA` for Earth surface temperature rather than an invented value.

---

## 5. Files changed

| File | Change |
|---|---|
| `src/data/planetaryThermal.json` | New measured thermal reference table |
| `src/components/PlanetaryComparison.tsx` | Thermal section added below terrain |
| `src/planetary.css` | Readable thermal table styling |
| `MILESTONE_04_REPORT.md` | This report |
| `img/planetary-thermal.png` | Verified screenshot |

The existing terrain comparison and orbital navigation were not changed.

---

## 6. Tests

| Test | Result |
|---|---|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** — pre-existing warnings only, no errors |
| Playwright E2E, Devon Island | **PASS** — thermal table rendered with values and sources |
| Playwright E2E, Atacama | **PASS** — thermal table rendered with 23/24 QC scenes |
| Screenshot | `img/planetary-thermal.png` |

Observed Devon panel: Earth 257.5 K air / 275.7 K surface; Mars 216.0–222.5 K air / 223.0–232.0 K surface; Moon 50–250 K surface; thermal inertia NO DATA.

Observed Atacama panel: Earth 287.6 K air / 311.4 K surface; Mars and Moon as above; thermal inertia NO DATA.

---

## 7. What remains unimplemented

- Diviner PCP/PRP site-specific raster ingestion.
- Calibrated THEMIS surface temperature or thermal inertia.
- MODIS/VIIRS LST for all 39 sites.
- MODIS night-time LST and a true diurnal amplitude.
- Uncertainty propagation from MODIS QC and MEDA/Diviner ranges.
- A profile-aware thermal weighting or score — intentionally not added.
- Field validation.

---

## 8. Bottom line

ODYSSEY now compares **measured thermal supports** without collapsing them:

- Earth: MODIS LST (surface) and NASA POWER (air), separate.
- Mars: MEDA point air/surface ranges.
- Moon: published Diviner polar surface range.
- Thermal inertia: explicitly missing.

The panel states dates, native resolution, QC counts, units, sources and non-comparisons. No synthetic temperature, no fabricated NASA data, and no claim of physical equivalence.
