#!/usr/bin/env python3
"""Build same-baseline Earth/Moon/Mars terrain statistics for enriched regions.

Earth statistics are derived from the generated 40 m Copernicus heightmaps at
the same 400 m and 463 m baselines used by the curated planetary comparison.
Moon and Mars reference statistics are reused unchanged from
src/data/planetaryReference.json.

Output: src/data/generatedPlanetaryReference.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.ndimage import zoom

ROOT = Path(__file__).resolve().parent.parent
SELECTION = ROOT / "src" / "data" / "generatedEnrichmentSelection.json"
ENRICHMENT = ROOT / "src" / "data" / "generatedEnrichment.json"
REFERENCE = ROOT / "src" / "data" / "planetaryReference.json"
TERRAIN_DIR = ROOT / "public" / "generated" / "terrain"
OUT = ROOT / "src" / "data" / "generatedPlanetaryReference.json"


def terrain_stats(arr, spacing_m, window_km, resolution_m, source, datum, lat, lon, name):
    arr = np.asarray(arr, dtype=float)
    if arr.size == 0:
        return None
    arr = np.where(np.isfinite(arr), arr, np.nanmedian(arr))
    gy, gx = np.gradient(arr, spacing_m, spacing_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    from scipy.ndimage import gaussian_filter

    rough = arr - gaussian_filter(arr, 2)
    return {
        "name": name,
        "lat": lat,
        "lon": lon,
        "source": source,
        "datum": datum,
        "resolutionM": resolution_m,
        "windowKm": round(window_km, 1),
        "pixels": [int(arr.shape[0]), int(arr.shape[1])],
        "elevationMean": round(float(np.mean(arr)), 1),
        "elevationMin": round(float(np.min(arr)), 1),
        "elevationMax": round(float(np.max(arr)), 1),
        "reliefP95P5": round(float(np.percentile(arr, 95) - np.percentile(arr, 5)), 1),
        "slopeMean": round(float(np.mean(slope)), 2),
        "slopeP95": round(float(np.percentile(slope, 95)), 2),
        "roughness": round(float(np.std(rough)), 2),
        "class": "derived",
        "note": (
            "Slope and roughness are derived from a DEM at the stated baseline. "
            "Absolute elevation uses a body-specific datum and is not a cross-body similarity metric."
        ),
    }


def earth_stats(site):
    path = TERRAIN_DIR / f"{site['id']}.bin"
    if not path.exists():
        return None
    raw = np.fromfile(path, dtype="<f4")
    if raw.size != 512 * 320:
        return None
    arr = raw.reshape(320, 512)
    # 12.8 x 12.8 km centre crop at 40 m: 320 x 320 cells.
    crop = arr[:, 96:416]
    out = {}
    for baseline, factor in ((400, 40 / 400), (463, 40 / 463)):
        small = zoom(crop, factor, order=1)
        out[f"{baseline}m"] = terrain_stats(
            small,
            baseline,
            12.8,
            baseline,
            "Copernicus DEM GLO-30 (30 m source, 40 m heightmap)",
            "Earth mean sea level / EGM2008",
            site.get("lat"),
            site.get("lon"),
            site["id"],
        )
    return out


def main() -> None:
    selection = json.loads(SELECTION.read_text())
    enrichment = json.loads(ENRICHMENT.read_text())
    reference = json.loads(REFERENCE.read_text())
    earth = {}
    for item in selection["regions"]:
        stats = earth_stats(item)
        if stats:
            earth[item["id"]] = stats
    payload = {
        "generatedAt": "2026-11-13",
        "method": (
            "Same-baseline DEM comparison. Earth uses a 12.8 km centre crop of the generated "
            "40 m Copernicus GLO-30 heightmap, resampled to 400 m and 463 m. Moon and Mars "
            "reference statistics are reused from the curated planetaryReference.json."
        ),
        "references": reference["references"],
        "earth": earth,
        "sourceTerrain": "public/generated/terrain/<region-id>.bin",
        "selectionVersion": selection["version"],
        "enrichmentVersion": enrichment["version"],
    }
    OUT.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(f"wrote {OUT} ({len(earth)} Earth regions)")


if __name__ == "__main__":
    main()
