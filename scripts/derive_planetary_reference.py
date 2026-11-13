#!/usr/bin/env python3
"""Build a same-baseline Earth / Moon / Mars terrain reference table.

Earth: Copernicus DEM GLO-30 heightmaps already stored in
  public/sites/terrain/<site>.bin (40 m, 512 x 320).
Moon: LRO LOLA 400 m south-polar stereographic DEM
  LDEM_45S_400M (PDS LRO-L-LOLA-4-GDR-V1.0).
Mars: MGS MOLA 463 m global COG
  mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif.

Each comparison uses a 12.8 km square window at the native planetary
resolution. Slope and roughness are computed at that same baseline.
Absolute elevation is reported with its datum, but is not treated as a
similarity metric across bodies.

Output: src/data/planetaryReference.json

Usage:
  python3 scripts/derive_planetary_reference.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import gaussian_filter, zoom

ROOT = Path(__file__).resolve().parent.parent
TERRAIN_DIR = ROOT / "public" / "sites" / "terrain"
TERRAIN_META = ROOT / "src" / "data" / "siteTerrain.json"
OUT = ROOT / "src" / "data" / "planetaryReference.json"
MOON_FILE = Path("/tmp/opencode/ldem_45s_400m_float.img")
MARS_COG = "https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps3/Mars/MOLA/mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif"


def terrain_stats(arr, spacing_m, window_km, resolution_m, source, datum, lat, lon, name):
    arr = np.asarray(arr, dtype=float)
    arr = np.where(np.isfinite(arr), arr, np.nanmedian(arr))
    gy, gx = np.gradient(arr, spacing_m, spacing_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
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
    site_id = site["id"]
    path = TERRAIN_DIR / f"{site_id}.bin"
    if not path.exists():
        return None
    raw = np.fromfile(path, dtype="<f4")
    if raw.size != 512 * 320:
        return None
    arr = raw.reshape(320, 512)
    # 12.8 x 12.8 km centre crop at 40 m.
    cy, cx = 160, 256
    half = 160
    crop = arr[cy - half:cy + half, cx - half:cx + half]
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
            site_id,
        )
    return out


def moon_stats():
    if not MOON_FILE.exists():
        raise FileNotFoundError(
            f"Missing {MOON_FILE}. Download LDEM_45S_400M_FLOAT.IMG from "
            "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/"
        )
    arr = np.memmap(MOON_FILE, dtype="<f4", mode="r", shape=(7200, 7200))
    half = 16  # 33 px * 400 m = 13.2 km
    cy = cx = 3600
    window = np.array(arr[cy - half:cy + half + 1, cx - half:cx + half + 1], dtype=float) * 1000.0
    return terrain_stats(
        window,
        400,
        12.8,
        400,
        "LRO LOLA 400 m south-polar stereographic DEM (LDEM_45S_400M, PDS LRO-L-LOLA-4-GDR-V1.0)",
        "1737.4 km lunar reference sphere",
        -89.9,
        0.0,
        "Lunar south pole / Shackleton region",
    )


def mars_stats():
    R = 3396190.0
    lon, lat = 77.45, 18.44
    x = R * math.radians(lon)
    y = R * math.radians(lat)
    with rasterio.open(MARS_COG) as src:
        row, col = src.index(x, y)
        half = 14  # 29 px * 463 m = 13.4 km
        arr = src.read(1, window=Window(col - half, row - half, 2 * half + 1, 2 * half + 1)).astype(float)
        arr[arr == src.nodata] = np.nan
    return terrain_stats(
        arr,
        463,
        12.8,
        463,
        "MGS MOLA 463 m global DEM COG (mola128_mola64_merge_90Nto90S)",
        "Mars areoid (GMM-2B)",
        lat,
        lon,
        "Jezero crater floor / landing region",
    )


def main():
    sites = json.loads((ROOT / "src" / "data" / "odyssey.json").read_text())["sites"]
    earth = {}
    for site in sites:
        stats = earth_stats(site)
        if stats:
            earth[site["id"]] = stats
    payload = {
        "generatedAt": "2026-11-13",
        "method": (
            "Same-baseline DEM comparison. Each body uses a 12.8 km window at its native DEM resolution: "
            "Earth 400 m / 463 m from Copernicus GLO-30 heightmaps, Moon 400 m from LOLA LDEM_45S_400M, "
            "Mars 463 m from MOLA. Slope and roughness are derived at the stated baseline. "
            "Absolute elevation uses body-specific datums and is not a cross-body similarity metric."
        ),
        "references": {
            "moon": moon_stats(),
            "mars": mars_stats(),
        },
        "earth": earth,
    }
    OUT.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(f"Wrote {OUT} ({len(earth)} Earth sites)")


if __name__ == "__main__":
    main()
