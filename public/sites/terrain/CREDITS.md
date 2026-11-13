# Site terrain credits

The site orbit's terrain is generated from real elevation data. No mountains,
craters, boulders or relief are invented.

## Source

**Copernicus DEM GLO-30**, 1 arc-second (~30 m) digital surface model, ESA /
DLR, distributed through the AWS Open Data registry.

- Dataset: `copernicus-dem-30m`
- <https://registry.opendata.aws/copernicus-dem/>
- Product documentation: <https://doi.org/10.5270/ESA-copro-dem>

## Processing

- Each site's heightmap covers the **exact local UTM window** of its Sentinel-2
  site image: 20.48 × 12.8 km.
- The DEM is mosaicked from the 1° COG tiles, reprojected to the site UTM CRS,
  and sampled to a **512 × 320 float32 heightmap at 40 m** spacing.
- Vertical values are metres above the DEM vertical datum. There is no vertical
  exaggeration in the 3D mesh.
- NaN / no-data cells are filled with 0 m and the filled fraction is recorded as
  `voidPct` in `src/data/siteTerrain.json`. All 39 sites currently have 0% voids.
- Heightmaps are loaded only for the selected site at DIVE time. The app does
  not load the global DEM.

## Licence and attribution

Copernicus DEM is free and open with attribution.

> Copernicus DEM © DLR e.V. 2010–2014 / ESA 2021

The Copernicus DEM GLO-30 product is based on TanDEM-X data acquired
2011–2015. The site-orbit DEM date is shown as 2011–2015.

Regenerate with `scripts/fetch_site_terrain.py` (requires `rasterio`, `pyproj`,
`numpy`).
