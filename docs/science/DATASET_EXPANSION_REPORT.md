# ODYSSEY: Dataset Expansion Report

Date: 2026-11-14. Each source below was opened and read at its origin (dataset page, PDS/NTRS record or paper abstract), not judged from a search snippet. "Integrated" means the data is in the repository and used by the engine; a source found by search is not counted as integrated.

## 1. Integrated in this milestone

### ESA WorldCover 10 m 2021 v200 (Earth, bare-ground upper bound for rock exposure)

| Field | Value |
|---|---|
| Identifier | ESA WorldCover 10 m 2021 v200; STAC collection `esa-worldcover` (Microsoft Planetary Computer), filter `esa_worldcover:product_version = 2.0.0` |
| Provider / licence | ESA WorldCover consortium; CC-BY 4.0 |
| Resolution / time | 10 m; 2021 annual map |
| Coverage | Global land north of 60°S (Antarctica not covered; 22 of our 226 locations) |
| Variable | Land-cover class; class 60 "Bare / sparse vegetation" = ground with < 10% vegetation all year |
| Missing values | 0 = no data (excluded from fractions) |
| Accuracy | 76.7% overall (v200 validation report); not re-validated at ODYSSEY sites |
| Does it measure the requirement? | **No.** It measures bare ground, which contains rock, sand, gravel and soil. Exposed rock is a subset, so the bare fraction is an **upper bound** on rock exposure. |
| Support used | Curated sites: the exact UTM window of each site DEM (20.48 × 12.8 km), warped to a 10 m grid with nearest-neighbour resampling (categorical). Bound = barest 2 × 2 km block (500 m stride, ≥ 90% valid pixels). Discovery candidates and generated regions: 10 × 10 km window at the representative point. |
| Code / output | `scripts/fetch_surface_cover.py` → `src/data/siteSurfaceCover.json` |
| Rule in the engine | The bound can make a "≥" requirement fail (bound < limit). It can never make it pass. |

Coverage achieved: 38 / 39 curated sites, 102 / 107 discovery candidates, 64 / 80 generated regions (the rest are south of 60°S and are labelled *Dataset does not cover this location*).

Per-site result for "rock exposure ≥ 30% within a 2 × 2 km area" (limit 5%):

| Bound result | Sites |
|---|---|
| Ruled out (barest 2 km block < 5% bare) | Lonar (2.1%), Wolfe Creek (0.2%), Undara (0.2%), Nullarbor (0.03%) |
| At best partly met (5–30%) | Kamchatka (7.7%), Kawah Ijen (10.9%), Socotra (19.2%) |
| Permitted, not established (≥ 30%) | 31 sites |
| Not covered | Dry Valleys |

The window-wide fraction was rejected as the support: Kawah Ijen is 0.2% bare over its full 20 km window but up to 10.9% in its barest 2 km block (the crater). Judging an outcrop requirement on a 260 km² window would have rejected sites unfairly.

### Verified planetary references (target side)

All values were verified verbatim from an accessible abstract or document before entry.

| Dimension | Target | Value | Source and quote | Support |
|---|---|---|---|---|
| Thermal inertia | Moon | 55 ± 2 J m⁻² K⁻¹ s⁻¹ᐟ² at 273 K | Hayne et al. 2017, JGR Planets 122:2371, doi:10.1002/2017JE005387; arXiv:1711.00977: "a thermal inertia of 55 ±2 J m−2 K−1 s−1/2 at 273 K" | Global regolith fines, diurnal layer (~4–7 cm); vacuum |
| Thermal inertia | Mars (Jezero) | 180–605 SI | Martínez et al. 2023, JGR Planets, doi:10.1029/2022JE007537: "Thermal inertia values ranged between 180 (sand dune) and 605 (bedrock-dominated material) SI units" | MEDA, ~3–4 m² footprint, Perseverance traverse |
| Longest continuous darkness | Moon | ≈ 1.5 days | Mazarico et al. 2011, Icarus 211:1066, doi:10.1016/j.icarus.2010.10.030 (NTRS 20120010094): "a location near the Shackleton crater rim … its longest continuous period in total darkness is about 1.5 days" | Single best-lit point, LOLA 240 m horizons, several 18.6-yr cycles. Not an illumination fraction. |
| Lithology | Moon | highland terrain, impact breccia | Spudis et al. 2008, GRL 35:L14201, doi:10.1029/2008GL034468: "located in the rugged, heavily cratered terrain of the southern highlands"; plains "consisting of impact breccia" | South-polar region |
| Median grain size (D50) | Moon | 72 µm (40–130 µm) | Carrier 2005 (LPI): "median particle size, D50 … is approximately 0.072 mm"; Carrier 1973 (NTRS 19740027286): "40 to 130 microns" | Apollo/Luna returned soils from seven non-polar sites; polar soil may differ |

A search snippet for the Hayne et al. abstract reads "a thermal inertia of 552 J m-2 K-1 s-1/2"; the "±" had been lost. The value came from the arXiv abstract instead. A regression test pins it to 55 ± 2.

## 2. Found, not integrated

| Dataset | Identifier / access | What it measures | Why not integrated | What it would close |
|---|---|---|---|---|
| MERRA-2 aerosol diagnostics | M2TMNXADG (tavgM_2d_adg_Nx) v5.12.4, variables DUDP001–005, kg m⁻² s⁻¹, 0.5° × 0.625°, monthly 1980–present (Earthdata catalog page, read 2026-11-14) | Modelled dust dry deposition by size bin | Anonymous download redirects to NASA Earthdata Login (HTTP 302 to urs.earthdata.nasa.gov, checked 2026-11-14). No login is configured. | Dust deposition flux as a **modelled regional** value (labelled as such), not a site measurement |
| EMIT L2B mineral identification | NASA JPL / LP DAAC, 60 m, since 2022, arid belt | Surface mineral groups of exposed ground | Earthdata Login; not configured | Earth-side mineralogy for arid sites |
| LRO Diviner polar products | PDS Geosciences Node | Polar surface brightness temperatures, day and night | Not yet ingested; only the 50–250 K polar envelope is | Lunar night-time and daytime surface temperature at the target |
| LOLA polar DEMs | NASA PGDA product 69 (60, 120 and 240 m/px polar maps; COG links available) | Lunar polar topography and illumination | Only the 400 m baseline window is ingested | Local slope at 40 m on the Moon; a horizon-resolved illumination check |
| Moon Mineralogy Mapper (M3) | PDS | Lunar spectral mineralogy | Not ingested | Target mineralogy |
| CRISM / Perseverance | PDS | Jezero mineralogy | Not ingested | Mars mineralogy |
| MEDA TIRS ground temperature | PDS | Jezero day/night ground temperature | Only the envelope is ingested | Mars night-time temperature, diurnal ΔT |

## 3. Investigated and rejected

| Source | Proposed for | Why it does not measure the requirement |
|---|---|---|
| Macrostrat mapped units | Rock exposure; bearing strength | A mapped unit is what underlies the area, not how much is exposed, and not mechanical strength. |
| Sentinel-2 L2A classification | Rock exposure | Rock vs sand vs soil cannot be separated reliably without local ground truth; an unvalidated classifier would be an estimate shown as a measurement. |
| ISRIC SoilGrids 2.0 (250 m) | Bearing strength; grain size | Modelled texture fractions and bulk density. Not strength; class fractions are not a median grain size. |
| USDA gNATSGO | Bearing strength | US only, interpretive map-unit classes, not point strength. |
| MODIS apparent thermal inertia (1 − albedo)/ΔT | Thermal inertia | Different quantity and unit (K⁻¹). Converting to SI needs a thermal model and soil properties. |
| NASA POWER aerosol optical depth | Dust flux | Column extinction of all aerosols, not a surface mass flux. |

## 4. Not remotely measurable at the needed scale → field protocols

| Quantity | Protocol recommended in the app |
|---|---|
| Surface bearing strength | Dynamic cone penetrometer, ASTM D6951 (8 kg hammer; standard title verified on astm.org), on a grid across the traverse; plate load tests for deployment pads; record moisture |
| SI thermal inertia | Needle-probe thermal conductivity (ASTM D5334) plus bulk density and heat capacity of site samples; I = √(kρc) |
| Grain size (D50) | Sieve and hydrometer analysis (ASTM D6913 / D7928) of surface samples |
| Fresh rock exposure | UAV orthomosaic (≤ 5 cm) classification or point-count transects |

## 5. Not reproducible on Earth (unchanged, now separated from evidence gaps)

Gravity (1.62 / 3.73 m/s² vs 9.82), vacuum (3 × 10⁻¹⁵ bar at night), the 14-day lunar night, atmospheric composition and surface radiation dose. These are physical mismatches handled by the intervention planner, never shown as missing data.
