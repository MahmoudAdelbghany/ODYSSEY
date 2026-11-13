# Data licenses and credits

Odyssey uses open data. This file records the source, license and attribution for each
layer. It is a prototype; verify the current license before redistribution or commercial use.

## NASA POWER

- Provider: NASA Langley Research Center / NASA POWER.
- Data: climatology 2001–2020, including T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, WS2M,
  RH2M, ALLSKY_SFC_SW_DWN, AOD_55, GWETTOP, GWETROOT, PS.
- License: NASA data are generally not subject to copyright in the United States.
- Credit: NASA POWER / NASA Langley Research Center.
- URL: https://power.larc.nasa.gov/

## NASA GIBS / MODIS Terra

- Provider: NASA Global Imagery Browse Services / NASA EOSDIS.
- Data: MODIS Terra Corrected Reflectance TrueColor imagery (2020, multiple dates).
- License: NASA imagery is generally not subject to copyright in the United States.
- Credit: NASA GIBS / NASA EOSDIS / MODIS Terra.
- URL: https://gibs.earthdata.nasa.gov/

## Macrostrat

- Provider: Macrostrat, University of Wisconsin–Madison.
- Data: geologic units, lithology and age at each site.
- License: CC-BY 4.0.
- Credit: Macrostrat (macrostrat.org), CC-BY 4.0.
- URL: https://macrostrat.org/api/

## Open-Meteo

- Provider: Open-Meteo.
- Data: elevation, local relief, 7-day weather forecast.
- License: CC-BY 4.0 for non-commercial use; commercial use requires an Open-Meteo
  subscription. This prototype is non-commercial.
- Credit: Open-Meteo.com, CC-BY 4.0.
- URL: https://open-meteo.com/

## USGS Earthquake Catalog

- Provider: U.S. Geological Survey.
- Data: M4+ earthquakes within 300 km of each site, past year.
- License: U.S. Government work / public domain.
- Credit: USGS Earthquake Hazards Program.
- URL: https://earthquake.usgs.gov/fdsnws/event/1/

## NASA PDS / LRO / MRO

- Provider: NASA Planetary Data System and mission teams.
- Data: reference conditions for Moon and Mars analog profiles (literature values).
- License: NASA data are generally not subject to copyright in the United States.
- Credit: NASA PDS, LRO, MRO, and the cited mission literature.

## Airports / travel model

- The nearest-airport table is a curated list of public airport hubs and coordinates.
- Travel times are heuristic estimates from great-circle distance, connections, ground
  transfer and a buffer. They are not quotes and not a routing service.
- Airport codes and locations are public identifiers.

## Pollinations LLM

- Provider: Pollinations.
- Use: free LLM endpoint for the mission-architect agent (`text.pollinations.ai/openai`).
- The endpoint is called at runtime; no model weights are redistributed.
- Check Pollinations' current terms before a public/high-volume deployment.

## Imagery / fonts

- Mars opening plate: NASA/JPL-Caltech/MSSS, Curiosity panorama PIA26019, re-cropped/graded.
- Earth/Moon/Mars textures: NASA / Solar System Scope (CC-BY 4.0 for the Solar System Scope maps).
  The 8K day and night maps are from Solar System Scope; the normal, specular and cloud maps are
  from the three.js examples (MIT), ultimately derived from NASA imagery.
- Terrain flythrough: the 3D relief is generated from the site's satellite frame. It is an
  illustrative interpretation, not measured topography or a ground photograph.
- Starfield / grain: project-generated or public-domain assets from the Odyssey concept film.
- Fonts: Space Grotesk, Inter, IBM Plex Mono (SIL Open Font License 1.1).

## Code

The application code in this repository is the project's own work. Third-party libraries
are used under their respective licenses (React, Vite, framer-motion, three.js,
react-globe.gl, d3-geo, topojson-client, world-atlas, lucide-react, lenis, scikit-learn,
pandas, numpy, Pillow).
