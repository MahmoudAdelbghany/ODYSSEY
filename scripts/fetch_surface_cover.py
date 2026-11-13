#!/usr/bin/env python3
"""Surface-cover fractions from ESA WorldCover 2021 (10 m) for ODYSSEY sites.

Why: the geological-sampling requirement asks for "fresh rock exposure >= 30%".
No open global product maps fresh rock exposure. WorldCover maps "Bare / sparse
vegetation" (class 60): ground with < 10% vegetation cover all year. Exposed
rock is a subset of that class (which also contains sand, gravel and bare
soil), so the class fraction is an UPPER BOUND on rock exposure. It can show
that a site cannot meet the requirement; it can never show that it does.

Method:
- Curated sites: the exact UTM window of the site's Copernicus DEM heightmap
  (src/data/siteTerrain.json boundsUtm, usually 20.48 x 12.8 km).
- Discovery candidates and generated regions: a 10 x 10 km window centred on
  the representative point, in the local UTM zone.
- WorldCover tiles are warped onto a 10 m UTM grid with NEAREST resampling
  (categorical data; no class mixing). Pixels with no data (0) are excluded.
- Fractions are pixel counts / valid pixels.

Product: ESA WorldCover 10 m 2021 v200, CC-BY 4.0, via Microsoft Planetary
Computer STAC (collection esa-worldcover). Reported overall accuracy of the
2021 map is 76.7% (WorldCover v200 product validation report); per-class
accuracy for bare/sparse vegetation varies by region and is not re-validated
at ODYSSEY sites.

Run: uv run --with rasterio,pystac-client,planetary-computer,numpy,pyproj \
       python scripts/fetch_surface_cover.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from pyproj import CRS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = DATA / "siteSurfaceCover.json"
CACHE = Path("/tmp/claude-1000/surface-cover-cache")
CACHE.mkdir(parents=True, exist_ok=True)

CLASSES = {
    10: "tree",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built",
    60: "bareSparse",
    70: "snowIce",
    80: "water",
    90: "herbaceousWetland",
    95: "mangrove",
    100: "mossLichen",
}

CATALOG = pystac_client.Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1",
    modifier=planetary_computer.sign_inplace,
)


def utm_crs(lat: float, lon: float) -> CRS:
    zone = int(math.floor((lon + 180) / 6) + 1)
    return CRS.from_epsg((32600 if lat >= 0 else 32700) + zone)


def centred_window(lat: float, lon: float, half_m: float):
    crs = utm_crs(lat, lon)
    from pyproj import Transformer

    x, y = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform(lon, lat)
    return crs, (x - half_m, y - half_m, x + half_m, y + half_m)


BLOCK_PX = 200  # 2 km at 10 m
STRIDE_PX = 50  # 500 m


def best_block(bare: np.ndarray, valid: np.ndarray) -> float | None:
    """Highest bare/sparse fraction of any 2 x 2 km block (500 m stride) with >= 90% valid pixels."""
    h, w = bare.shape
    if h < BLOCK_PX or w < BLOCK_PX:
        return None
    ib = np.pad(bare.astype(np.int64).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    iv = np.pad(valid.astype(np.int64).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    best = None
    for y in range(0, h - BLOCK_PX + 1, STRIDE_PX):
        for x in range(0, w - BLOCK_PX + 1, STRIDE_PX):
            y2, x2 = y + BLOCK_PX, x + BLOCK_PX
            nv = iv[y2, x2] - iv[y, x2] - iv[y2, x] + iv[y, x]
            if nv < 0.9 * BLOCK_PX * BLOCK_PX:
                continue
            nb = ib[y2, x2] - ib[y, x2] - ib[y2, x] + ib[y, x]
            frac = nb / nv
            best = frac if best is None or frac > best else best
    return None if best is None else round(float(best), 4)


def cover_fractions(crs: CRS, bounds) -> dict:
    west, south, east, north = transform_bounds(crs, "EPSG:4326", *bounds, densify_pts=21)
    items = list(
        CATALOG.search(
            collections=["esa-worldcover"],
            bbox=[west, south, east, north],
            query={"esa_worldcover:product_version": {"eq": "2.0.0"}},
        ).items()
    )
    if not items:
        return {"status": "no_coverage", "items": []}
    width = int(round((bounds[2] - bounds[0]) / 10))
    height = int(round((bounds[3] - bounds[1]) / 10))
    counts = np.zeros(256, dtype=np.int64)
    filled = np.zeros((height, width), dtype=bool)
    classes = np.zeros((height, width), dtype=np.uint8)
    for item in sorted(items, key=lambda i: i.id):
        href = item.assets["map"].href
        with rasterio.open(href) as src:
            transform = rasterio.transform.from_bounds(*bounds, width, height)
            with WarpedVRT(src, crs=crs, transform=transform, width=width, height=height, resampling=Resampling.nearest, nodata=0) as vrt:
                arr = vrt.read(1)
        take = (arr > 0) & ~filled
        counts += np.bincount(arr[take].ravel(), minlength=256)
        classes[take] = arr[take]
        filled |= arr > 0
    valid = int(counts.sum())
    if valid == 0:
        return {"status": "no_valid_pixels", "items": [i.id for i in items]}
    fractions = {name: round(float(counts[code]) / valid, 4) for code, name in CLASSES.items()}
    return {
        "status": "ok",
        "items": sorted(i.id for i in items),
        "validPixels": valid,
        "coverage": round(valid / (width * height), 4),
        "fractions": fractions,
        "bestBlockBareSparse": best_block(classes == 60, filled),
        "block": "2 x 2 km, 500 m stride, >= 90% valid pixels",
    }


def main() -> None:
    which = set(sys.argv[1:]) or {"curated", "candidates", "generated"}
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    result = {
        "product": "ESA WorldCover 10 m 2021 v200",
        "license": "CC-BY 4.0, © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
        "access": "Microsoft Planetary Computer STAC, collection esa-worldcover",
        "resolutionM": 10,
        "date": "2021",
        "overallAccuracy": "76.7% (WorldCover 2021 v200 validation report)",
        "resampling": "nearest (categorical)",
        "classes": CLASSES,
        "note": (
            "Class fractions inside the stated window. bareSparse is ground with < 10% "
            "vegetation all year: rock, sand, gravel or bare soil. It is an upper bound on "
            "exposed rock, not a rock-exposure measurement."
        ),
        "curated": previous.get("curated", {}),
        "candidates": previous.get("candidates", {}),
        "generated": previous.get("generated", {}),
    }

    if "curated" in which:
        terrain = json.loads((DATA / "siteTerrain.json").read_text())["sites"]
        for site_id, meta in terrain.items():
            crs = CRS.from_string(meta["crs"])
            out = cover_fractions(crs, meta["boundsUtm"])
            out["window"] = f"{meta['widthMeters']/1000:.2f} x {meta['heightMeters']/1000:.2f} km DEM window ({meta['crs']})"
            result["curated"][site_id] = out
            print(f"curated {site_id:18s} {out.get('fractions', {}).get('bareSparse')}", flush=True)
        OUT.write_text(json.dumps(result, indent=1) + "\n")

    if "candidates" in which:
        disc = json.loads((DATA / "discovery.json").read_text())
        for cand in disc["candidates"]:
            cid = cand.get("id") or cand["name"]
            crs, bounds = centred_window(cand["lat"], cand["lon"], 5000)
            out = cover_fractions(crs, bounds)
            out["window"] = f"10 x 10 km centred window ({crs.to_string()})"
            result["candidates"][cid] = out
            print(f"candidate {cid:28s} {out.get('fractions', {}).get('bareSparse')}", flush=True)
        OUT.write_text(json.dumps(result, indent=1) + "\n")

    if "generated" in which:
        glob = json.loads((DATA / "globalDiscovery.json").read_text())
        for region in glob["regions"]:
            crs, bounds = centred_window(region["lat"], region["lon"], 5000)
            out = cover_fractions(crs, bounds)
            out["window"] = f"10 x 10 km window at the region's representative point ({crs.to_string()}); not the full region"
            result["generated"][region["id"]] = out
            print(f"generated {region['id']:12s} {out.get('fractions', {}).get('bareSparse')}", flush=True)
        OUT.write_text(json.dumps(result, indent=1) + "\n")

    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
