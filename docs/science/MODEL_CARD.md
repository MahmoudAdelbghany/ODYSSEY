# Model card — Odyssey analog ranking surrogate

## Intended use

Rank Earth analog sites for three mission profiles:

- **Permanent lunar south pole base**
- **Mars landing and exploration**
- **7-day lunar surface expedition**

The model is a **surrogate** for a transparent domain rubric. It is used for rapid
screening and campaign optimization, not for flight certification or field deployment.

## Training data

- 39 candidate sites across 6 continents and 20+ countries.
- 15 features per site: mean temperature, thermal amplitude, annual precipitation,
  humidity, wind, solar, elevation, local relief, aerosol optical depth, surface soil
  wetness, root-zone wetness, surface pressure, Macrostrat geology match, expert dust,
  field access.
- Climate: NASA POWER climatology 2001–2020.
- Geology: Macrostrat mapped units (CC-BY 4.0).
- Elevation/relief: Open-Meteo API.
- Labels: the project's transparent domain match score (0–100) for each profile.

## Models

| Profile | Selected model | Why |
|---|---|---|
| Lunar base | RBF-SVR | Best 5-fold R² and pairwise accuracy among tested candidates |
| Mars landing | ExtraTreesRegressor | Best R² and ranking correlation |
| Lunar expedition | RBF-SVR | Best R² and pairwise accuracy |

Candidate models compared: RBF-SVR, ExtraTrees, GradientBoosting, RandomForest.

## Validation

5-fold cross-validation on the real sites:

| Profile | R² | MAE | Spearman | Pairwise |
|---|---:|---:|---:|---:|
| Lunar base | 0.782 | 3.36 | 0.877 | 0.850 |
| Mars landing | 0.829 | 3.80 | 0.892 | 0.866 |
| Lunar expedition | 0.787 | 4.16 | 0.896 | 0.869 |

Uncertainty: 24 bootstrap SVR fits (lunar/expedition) or ExtraTrees tree variance (Mars).

## Explainability

- Permutation importance is computed per profile and shown in the UI.
- Top lunar-base features in the current model: local relief, annual precipitation,
  thermal amplitude, Macrostrat geology, surface soil wetness.

## Limitations

- Small dataset (39 sites); the model is a screening tool, not a universal analog law.
- Labels come from a human-authored rubric; the model inherits its assumptions.
- The climate grid is coarse; local microclimate can differ.
- Geology is a mapped unit, not an in-situ assay.
- Access and dust are partly expert-coded.
- No field validation yet. Planetary geologist review is pending.
- Travel costs are estimates, not quotes.

## Ethical / operational notes

- Do not use the model as the sole basis for a hazardous field campaign.
- Check seismic, volcanic, weather and permitting conditions before deployment.
- The model does not reproduce gravity, pressure or radiation; those remain facility-only.
- Report uncertainty; do not present a predicted score as a measurement.

## Reproduce

```bash
python3 scripts/fetch_sites.py
python3 scripts/enrich.py        # adds sites, Macrostrat, AOD, soil, airports, models
python3 scripts/train_model.py   # retrains models and rebuilds campaigns
python3 scripts/scenarios.py     # Balanced / Fast / Science-max / Budget
python3 scripts/validate.py      # weight-perturbation stability
```
