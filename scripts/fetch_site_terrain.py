#!/usr/bin/env python3
"""Build real 3D terrain heightmaps for the Odyssey site orbit.

Source: Copernicus DEM GLO-30, 1 arc-second (~30 m) elevation, ESA/DLR,
distributed through the AWS Open Data registry. Each site heightmap is sampled
onto the exact local UTM window used by its Sentinel-2 site image, at 40 m
spacing, 512 x 320 samples. No synthetic relief is added.

Outputs:
  public/sites/terrain/<site-id>.bin   float32 little-endian, 512 x 320
  src/data/siteTerrain.json

Requires: rasterio, pyproj, numpy.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.merge import merge
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject

os.environ.setdefault("GDAL_HTTP_TIMEOUT", "45")
os.environ.setdefault("GDAL_HTTP_CONNECTTIMEOUT", "15")
os.environ.setdefault("CPL_VSIL_CURL_TIMEOUT", "45")

ROOT = Path(__file__).resolve().parent.parent
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
IMAGERY = ROOT / "src" / "data" / "siteImagery.json"
OUT_DIR = ROOT / "public" / "sites" / "terrain"
META_PATH = ROOT / "src" / "data" / "siteTerrain.json"
WIDTH, HEIGHT = 512, 320
RES = 40.0
DEM_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"

SOURCE = "Copernicus DEM GLO-30 (30 m), ESA / DLR, via AWS Open Data"
LICENSE = (
    "Copernicus DEM © DLR e.V. 2010-2014 / ESA 2021. Free and open with "
    "attribution."
)


def tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00"


def tile_url(lat: int, lon: int) -> str:
    name = tile_name(lat, lon)
    return f"{DEM_BASE}/Copernicus_DSM_COG_10_{name}_DEM/Copernicus_DSM_COG_10_{name}_DEM.tif"


def terrain_for(site: dict, image: dict, force: bool):
    site_id = site["id"]
    out = OUT_DIR / f"{site_id}.bin"
    if out.exists() and not force:
        return None

    lat, lon = float(site["lat"]), float(site["lon"])
    zone = int((lon + 180) // 6) + 1
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    to_utm = Transformer.from_crs("EPSG:4326", epsg, always_xy=True)
    x, y = to_utm.transform(lon, lat)
    mpp = float(image["mpp"])
    site_px = image["sitePx"]
    image_w = float(image["width"]) * mpp
    image_h = float(image["height"]) * mpp
    left = x - site_px[0] * mpp
    top = y + site_px[1] * mpp
    right = left + image_w
    bottom = top - image_h

    to_wgs = Transformer.from_crs(epsg, "EPSG:4326", always_xy=True)
    corners = [
        to_wgs.transform(left, bottom),
        to_wgs.transform(right, bottom),
        to_wgs.transform(right, top),
        to_wgs.transform(left, top),
    ]
    west = min(c[0] for c in corners)
    east = max(c[0] for c in corners)
    south = min(c[1] for c in corners)
    north = max(c[1] for c in corners)
    margin = 0.01
    lat0, lat1 = math.floor(south - margin), math.floor(north + margin)
    lon0, lon1 = math.floor(west - margin), math.floor(east + margin)
    urls = [tile_url(la, lo) for la in range(lat0, lat1 + 1) for lo in range(lon0, lon1 + 1)]

    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="45",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    ):
        sources = [rasterio.open(url) for url in urls]
        try:
            merged, merged_transform = merge(
                sources,
                bounds=(west - margin, south - margin, east + margin, north + margin),
                res=1.0 / 3600.0,
                nodata=np.nan,
            )
        finally:
            for src in sources:
                src.close()

        dst = np.full((HEIGHT, WIDTH), np.nan, dtype=np.float32)
        dst_transform = Affine(RES, 0, left, 0, -RES, top)
        reproject(
            source=merged[0],
            destination=dst,
            src_transform=merged_transform,
            src_crs="EPSG:4326",
            dst_transform=dst_transform,
            dst_crs=f"EPSG:{epsg}",
            resampling=Resampling.bilinear,
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )

    void = np.isnan(dst)
    void_pct = float(void.mean() * 100.0)
    filled = np.nan_to_num(dst, nan=0.0).astype(np.float32)
    mn = float(filled.min())
    mx = float(filled.max())
    mean = float(filled.mean())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    filled.tofile(out)
    print(
        f"  {site_id:16s} {image_w/1000:.1f}x{image_h/1000:.1f} km "
        f"{mn:.0f}..{mx:.0f} m  voids={void_pct:.2f}%  {out.stat().st_size//1024} KB"
    )
    return {
        "file": f"/sites/terrain/{site_id}.bin",
        "width": WIDTH,
        "height": HEIGHT,
        "mpp": RES,
        "widthMeters": image_w,
        "heightMeters": image_h,
        "crs": f"EPSG:{epsg}",
        "boundsUtm": [round(left, 2), round(bottom, 2), round(right, 2), round(top, 2)],
        "min": round(mn, 2),
        "max": round(mx, 2),
        "mean": round(mean, 2),
        "voidPct": round(void_pct, 3),
        "date": "2011-2015",
        "source": SOURCE,
        "credit": "Copernicus DEM © DLR e.V. 2010-2014 / ESA 2021",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated site ids")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sites = json.loads(ODYSSEY.read_text())["sites"]
    imagery = json.loads(IMAGERY.read_text())["sites"]
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        sites = [s for s in sites if s["id"] in wanted]

    existing = {}
    if META_PATH.exists():
        existing = json.loads(META_PATH.read_text()).get("sites", {})

    sys.stdout.reconfigure(line_buffering=True)
    print(f"Fetching DEM terrain for {len(sites)} sites")

    def write_meta() -> None:
        payload = {
            "source": SOURCE,
            "license": LICENSE,
            "resolution": "30 m source, resampled to 40 m heightmaps (512 x 320)",
            "sites": existing,
        }
        META_PATH.write_text(json.dumps(payload, indent=2) + "\n")

    for site in sites:
        image = imagery.get(site["id"])
        if not image:
            print(f"  {site['id']}: no site imagery metadata; skipped")
            continue
        print(f"{site['id']}  {site['lat']:.3f}, {site['lon']:.3f}")
        try:
            entry = terrain_for(site, image, args.force)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR: {exc}", file=sys.stderr)
            continue
        if entry:
            existing[site["id"]] = entry
        write_meta()
    print(f"\nWrote {META_PATH} ({len(existing)} sites)")


if __name__ == "__main__":
    main()
