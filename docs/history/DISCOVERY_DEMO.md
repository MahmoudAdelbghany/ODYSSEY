# Discovery Engine — 2-minute demo

Run:

```bash
npm run dev
# http://127.0.0.1:5173
```

## Sequence

### 1. Opening — 15 s

Show the ODYSSEY opening screen.

> "ODYSSEY already has 39 curated analog regions. They are useful controls, but they are also a biased sample: Atacama, Devon Island, McMurdo, MDRS, Svalbard. If we only re-rank them, we rediscover the same places. So we added a discovery tier that searches beyond them."

Point at **OPEN DISCOVERY ENGINE / BEYOND THE 39**.

### 2. Global screen — 10 s

Click **OPEN DISCOVERY ENGINE**.

> "107 real candidate AOIs. None is within 80 km of the 39 controls. The small pale dots are the controls; the colored dots are new candidates. The engine is not replacing the curated set — it is generating the next review queue."

Point at the top stats: **107 CANDIDATES / 0 OF 39 CONTROLS**.

### 3. Moon south pole — 30 s

Reference tab: **MOON SOUTH POLE**. Select **Ellesmere Island** (top of the list).

> "Score 80.4 on the compensatory weighted mean. Terrain 100, ice/permafrost proxy 97, polar illumination 100. But the dry/volatile regime is 33: 267 mm of precipitation and 91% relative humidity in the reanalysis cell. That is why the weak-link score is 69.2, not 80.4. It penalizes the fatal mismatch instead of letting three strong dimensions hide it. Earth cannot reproduce the lunar vacuum, 1.62 m/s² gravity, the radiation environment, or true permanent-shadow illumination."

Point at **COMPENSATORY / WEAK-LINK / SENSITIVITY**, then **STRONGEST ANALOGY** and **WEAKEST LINK**. Point at the 12-month window: **JAN–FEB–MAR**.

> "Notice what it did not do: it did not send us back to McMurdo. McMurdo is already a control. It found Arctic polar deserts outside the curated set — Ellesmere, Victoria Island, Ward Hunt, Baffin."

### 4. Mars / Jezero — 30 s

Toggle **MARS / JEZERO**. The selection resets to the top candidate, **Dasht-e Kavir**.

> "Score 79.4 compensatory, but weak-link 63.7. Surface materials 100, dust and wind 100, aridity 95. Thermal is 22: the mean is about 19 °C, while Jezero is 216–222 K. So this is a mineralogy and dust analog, not a thermal analog. That is exactly the challenge brief: an analog does not have to match everything. The weak-link score makes the mismatch visible instead of averaging it away."

Point at the per-dimension bars. Point at **BEST CLIMATOLOGICAL WINDOW / JAN–FEB**.

> "If I switch the ranking from compensatory to weak-link, Victoria Island overtakes Dasht-e Kavir. That is the difference between the best average and the site with no fatal mismatch."

> "Look at the rest of the top five: Victoria Island, Turpan Depression, Île Rouleau. Turpan is a below-sea-level arid basin in western China. Île Rouleau is a small impact structure in Quebec. These are not the usual Atacama/Devon/McMurdo list."

### 5. RADARSAT-1 — 20 s

Switch back to **MOON SOUTH POLE** and select **Victoria Island**. Scroll to the **RADARSAT-1 / HISTORICAL SAR** block.

> "This is real RADARSAT-1, not a placeholder. 22 July 2005, Standard S5, 39° incidence. The thumbnail is the segment browse; the texture numbers come from an L1 frame. It is labeled historical segment/frame context, not a local AOI measurement. That is the honest limit of the open RADARSAT-1 COG archive. Sentinel-1 is the next layer for calibrated local backscatter."

Click **SAR EVIDENCE ONLY** to show the six candidates with RADARSAT-1 evidence.

Point at the SAR thumbnail, **BEAM / INCIDENCE / TEXTURE / SUPPORT**, and the support note.

### 6. N2 filter — 10 s

Click **N2 STRONG ONLY**.

> "15 Moon candidates and 18 Mars candidates pass the strongest screening grade. That is a review queue, not a claim of discovery. The next gate is literature and catalog review, then field validation."

### 7. Promote and export — 15 s

Click **PROMOTE TO SHORTLIST**. Open **SHORTLIST**.

> "A promoted candidate becomes a dossier, not a pin. It carries its reference profile, per-dimension scores, evidence coverage, best window, missing evidence and residual gaps. Export JSON is the handoff to ODYSSEY ingestion."

Click **EXPORT JSON**. Then close the drawer and click **EXPORT SCREEN** in the ranked-list header.

> "The shortlist export is the handoff. The screen export is all 107 scored candidates with their per-dimension evidence, windows and missing layers — the full review queue, not just the three we liked."

### 8. Method — 15 s

Open **METHOD**.

> "Three tiers. Global layers rank and exclude. Regional sensors refine: EMIT and ASTER for mineralogy, Sentinel-2 and Landsat for land cover and thermal, Sentinel-1 for all-weather structure, GEDI and ICESat-2 for sparse structure and ice. Local measurements certify: LiDAR, met mast, soil pits, geotechnical tests, permits. The pipeline is reproducible and the 39 controls are never the search universe."

### 9. Close — 5 s

Close the overlay. Return to the main ODYSSEY experience.

## If asked

**Is this real data?**
Yes. NASA POWER / MERRA-2 monthly climatology 2001–2020, Copernicus DEM GLO-90 terrain, Macrostrat geology, OurAirports access. The pipeline is `scripts/discover_candidates.py`.

**Why not Sentinel-2 or EMIT for every candidate?**
Sentinel-2 does not systematically cover Antarctica (56°S–84°N), and EMIT is 52°N–52°S and targeted. They are refinement layers, not global screening layers. ASTER SWIR stopped in 2008 and TIR was turned off in January 2026.

**What is missing?**
Mineralogy species, land surface temperature, vegetation, water/ice state, subsurface structure, geotechnical properties and field validation. The dossier lists all of them. Missing evidence is never imputed.

**What is new?**
The candidate set is outside the 39 controls, and the dossier is per-dimension and time-windowed. Novelty is graded N0/N1/N2 against the controls; it is not a literature claim until the catalog review is done.

**What can Earth not reproduce?**
Lunar vacuum, 1.62 m/s² gravity, radiation, regolith thickness, true PSR illumination. Martian 6 mbar CO2 atmosphere, 3.71 m/s² gravity, global dust storms, surface oxidants. Every dossier states this.
