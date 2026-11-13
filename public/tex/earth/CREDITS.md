# Earth imagery credits

The Earth in the orbital experience is assembled from real NASA imagery. No
geographical detail is generated or hallucinated, and the interface does not
claim more resolution than is shipped.

## Surface

**NASA Blue Marble 2002** — land surface, shallow water and shaded topography.
NASA Earth Observatory / Visible Earth. Image by Reto Stöckli; enhancements by
Robert Simmon. Public domain.

- Source: <https://visibleearth.nasa.gov/images/57752/blue-marble-land-surface-shallow-water-and-shaded-topography>
- Commons source used for the 43,200 × 21,600 master: <https://commons.wikimedia.org/wiki/File:Blue_Marble_2002.png>
- Native source resolution: 43,200 × 21,600 (about 0.93 km/pixel at the equator).
- Shipped LOD pyramid: 4K (L0), 8K (L1), 16K (L2), arranged as a 4 × 2 spherical
  patch grid. The maximum shipped global resolution is 16,384 × 8,192
  (about 2.4 km/pixel). The full 43,200 master is not shipped to the browser.

## Night lights

**NASA Black Marble / VIIRS City Lights 2012**, served by NASA GIBS. Public
domain.

- Layer: `VIIRS_CityLights_2012`
- <https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_CityLights_2012/default/500m/0/0/0.jpeg>
- Mosaicked from GIBS 500 m tiles at 10,240 × 5,120, then shipped at 8K and 4K.

## Clouds

**NASA cloud composite**, distributed by Solar System Scope under CC BY 4.0.

- Source: <https://www.solarsystemscope.com/textures/> (`8k_earth_clouds.jpg`)
- Shipped as 4K and 8K single-channel density fields. This is a global cloud
  composite, not a live weather observation. It is used for visual structure,
  opacity variation and cloud shadows.

## Normal and specular

**Solar System Scope Earth normal and specular maps**, CC BY 4.0.

- Source: <https://www.solarsystemscope.com/textures/>
- Normal map shipped at 4K; specular/ocean mask shipped at 2K.

## Processing

- Surface tiles include 4/8/16 px gutters from the same mosaic, so mipmapped
  bilinear filtering does not create seams at patch boundaries.
- Albedo and night maps are sRGB; normal, specular and cloud density maps are
  linear (`NoColorSpace`).
- Mipmaps are generated; anisotropy is capped at 8. The 16K LOD uses 4096²
  tiles and loads only visible patches. 8K auxiliary maps are used only where
  the GPU reports an 8192 texture limit; 4K is the fallback.
- Cloud density is uploaded as an R8 `DataTexture` (33.5 MB at 8K) instead of
  RGBA (134 MB).
