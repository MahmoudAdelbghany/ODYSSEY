# Site orbit imagery credits

The site orbit uses **Sentinel-2 Level-2A surface reflectance** at native 10 m
resolution. Nothing is upsampled or generated. The full-resolution satellite
image is the primary surface in this view.

## Source

- **Sentinel-2 L2A B04 / B03 / B02** (red, green, blue), ESA Copernicus.
- COGs hosted on the AWS Open Data registry: `sentinel-cogs`.
- Catalogue and asset discovery: Element 84 **Earth Search** STAC API,
  <https://earth-search.aws.element84.com/v1>.
- Processing: each site window is 2048 × 1280 pixels at native 10 m
  (about 20.5 × 12.8 km). A 2–98% display stretch and an sRGB transfer are
  applied for screen display; no detail is generated.
- Per-site scene IDs, dates, cloud cover and WGS84 bounds are recorded in
  `src/data/siteImagery.json`.
- Regenerate with `scripts/fetch_site_imagery.py` (requires `rasterio`,
  `pyproj`, `Pillow`, `requests`).

## Licence and attribution

Copernicus Sentinel data are free and open under the **Copernicus Sentinel Data
Terms and Conditions**. Attribution is required.

> Contains modified Copernicus Sentinel data 2026 / ESA

The scene date is shown in the site orbit interface. The image is a crop, not a
full-scene product. Cloud cover is the scene-level percentage; a clear scene can
still contain local cloud or cloud shadow.

## Why not Google Earth tiles

Google Earth’s global sub-meter mosaic is licensed commercial imagery (Maxar,
Airbus, CNES and others) served through Google Maps Platform. It is not a public
dataset and there is no free endpoint that legally exposes all of it. Marble’s
satellite layer is Sentinel-2 (2016) at up to level 14, the same open data class
as this view, not Google’s licensed imagery. A Google Maps API key is required
for Google’s actual tiles.
