#!/usr/bin/env python3
"""Fetch native 10 m Sentinel-2 true-color windows for every Odyssey site.

Data: Sentinel-2 Level-2A true-color (TCI) COGs, ESA Copernicus, hosted on the
AWS Open Data registry and indexed by Element 84's Earth Search STAC API.
The window is 2048 x 1280 native pixels (about 20.5 x 12.8 km). Nothing is
upsampled or synthesised.

Outputs:
  public/sites/close/<site-id>.jpg
  src/data/siteImagery.json

Requires: requests, rasterio (GDAL), Pillow, numpy, pyproj.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
from pathlib import Path

os.environ.setdefault("GDAL_HTTP_TIMEOUT", "20")
os.environ.setdefault("GDAL_HTTP_CONNECTTIMEOUT", "10")
os.environ.setdefault("CPL_VSIL_CURL_TIMEOUT", "20")

import numpy as np
import rasterio
import requests
from PIL import Image
from pyproj import Transformer
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parent.parent
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
OUT_DIR = ROOT / "public" / "sites" / "close"
META_PATH = ROOT / "src" / "data" / "siteImagery.json"
WIDTH, HEIGHT = 2048, 1280
STAC = "https://earth-search.aws.element84.com/v1/search"
NOW = dt.datetime.now(dt.timezone.utc)

PASSES = [
    (12, 15, "properties.datetime", "desc"),
    (24, 30, "properties.eo:cloud_cover", "asc"),
    (36, 60, "properties.eo:cloud_cover", "asc"),
]

SOURCE = (
    "Sentinel-2 Level-2A B04/B03/B02 surface reflectance, ESA Copernicus, via "
    "the AWS Open Data registry and Element 84 Earth Search"
)
LICENSE = (
    "Copernicus Sentinel Data Terms and Conditions. Free and open; contains "
    "modified Copernicus Sentinel data. Attribution required."
)


def stac_search(site: dict, months: int, cloud: float, field: str, direction: str):
    lat, lon = float(site["lat"]), float(site["lon"])
    pad = 0.30
    start = NOW - dt.timedelta(days=months * 30)
    body = {
        "bbox": [lon - pad, max(-90.0, lat - pad), lon + pad, min(90.0, lat + pad)],
        "collections": ["sentinel-2-l2a"],
        "datetime": f"{start:%Y-%m-%dT00:00:00Z}/{NOW:%Y-%m-%dT23:59:59Z}",
        "query": {"eo:cloud_cover": {"lt": cloud}},
        "limit": 60,
        "sortby": [{"field": field, "direction": direction}],
    }
    try:
        response = requests.post(STAC, json=body, timeout=30)
        response.raise_for_status()
        return response.json().get("features", [])
    except Exception as exc:  # noqa: BLE001
        print(f"  STAC error: {exc}", file=sys.stderr)
        return []


def contains_site(feature: dict, site: dict) -> bool:
    bbox = feature.get("bbox")
    if not bbox or len(bbox) != 4:
        return False
    lat, lon = float(site["lat"]), float(site["lon"])
    # Keep a small margin so the centre is not exactly on the swath edge.
    margin = 0.012
    return (
        bbox[0] - margin <= lon <= bbox[2] + margin
        and bbox[1] - margin <= lat <= bbox[3] + margin
    )


def read_window(assets: dict, site: dict):
    lat, lon = float(site["lat"]), float(site["lon"])
    hrefs = [
        (assets.get("red") or {}).get("href"),
        (assets.get("green") or {}).get("href"),
        (assets.get("blue") or {}).get("href"),
    ]
    if any(not h for h in hrefs):
        return None
    with rasterio.open(hrefs[0]) as ds:
        transformer = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
        x, y = transformer.transform(lon, lat)
        col, row = (~ds.transform) * (x, y)
        if not (0 <= col < ds.width and 0 <= row < ds.height):
            return None
        left = int(round(col - WIDTH / 2))
        top = int(round(row - HEIGHT / 2))
        left = max(0, min(ds.width - WIDTH, left))
        top = max(0, min(ds.height - HEIGHT, top))
        window = Window(left, top, WIDTH, HEIGHT)
        bands = []
        for href in hrefs:
            with rasterio.open(href) as band_ds:
                bands.append(band_ds.read(1, window=window))
        raw = np.stack(bands, axis=-1).astype(np.float32) / 10000.0
        if raw.size == 0 or not np.isfinite(raw).any():
            return None
        # Display stretch only; no invented detail. Reflectance is linear, so
        # apply a 2-98% range stretch followed by an sRGB transfer.
        lo, hi = np.percentile(raw, [2, 98])
        stretched = np.clip((raw - lo) / max(1e-6, hi - lo), 0.0, 1.0)
        srgb = np.where(
            stretched <= 0.0031308,
            stretched * 12.92,
            1.055 * np.power(stretched, 1.0 / 2.4) - 0.055,
        )
        arr = (np.clip(srgb, 0.0, 1.0) * 255.0).astype(np.uint8)
        # Reject black/night scenes and no-data-edged windows.
        luminance = arr.mean(axis=2)
        if luminance.mean() < 14 or luminance.mean() > 246 or luminance.std() < 4:
            return None
        if float((luminance < 4).mean()) > 0.03:
            return None
        window_transform = ds.window_transform(window)
        inverse = Transformer.from_crs(ds.crs, "EPSG:4326", always_xy=True)
        corners = []
        for px, py in ((0, 0), (WIDTH, 0), (WIDTH, HEIGHT), (0, HEIGHT)):
            wx, wy = window_transform * (px, py)
            clon, clat = inverse.transform(wx, wy)
            corners.append((clon, clat))
        bounds = [
            min(c[0] for c in corners),
            min(c[1] for c in corners),
            max(c[0] for c in corners),
            max(c[1] for c in corners),
        ]
        mpp = abs(float(ds.transform.a))
        return arr, (float(col - left), float(row - top)), bounds, mpp


def fetch_site(site: dict, force: bool) -> dict | None:
    site_id = site["id"]
    out = OUT_DIR / f"{site_id}.jpg"
    if out.exists() and not force:
        print(f"  exists: {out.name}")
        return None

    for months, cloud, field, direction in PASSES:
        features = stac_search(site, months, cloud, field, direction)
        if not features:
            continue
        tried = 0
        for feature in features:
            if not contains_site(feature, site):
                continue
            tried += 1
            if tried > 8:
                break
            try:
                result = read_window(feature.get("assets", {}), site)
            except Exception as exc:  # noqa: BLE001
                print(f"  read error {feature.get('id')}: {exc}", file=sys.stderr)
                continue
            if not result:
                continue
            arr, site_px, bounds, mpp = result
            image = Image.fromarray(arr)
            image.save(out, quality=90, subsampling=0)
            props = feature.get("properties", {})
            stamp = str(props.get("datetime", ""))[:10]
            cloud_cover = float(props.get("eo:cloud_cover", 0.0))
            print(
                f"  {site_id:16s} {stamp} cloud={cloud_cover:5.2f}% "
                f"{feature.get('id')} {out.stat().st_size // 1024} KB"
            )
            return {
                "file": f"/sites/close/{site_id}.jpg",
                "width": WIDTH,
                "height": HEIGHT,
                "sitePx": [round(site_px[0], 1), round(site_px[1], 1)],
                "mpp": round(mpp, 2),
                "date": stamp,
                "cloud": round(cloud_cover, 2),
                "scene": feature.get("id"),
                "bounds": [round(v, 5) for v in bounds],
                "bands": "B04 / B03 / B02 surface reflectance",
                "credit": f"Contains modified Copernicus Sentinel data {stamp[:4]}",
            }
    print(f"  NO SCENE for {site_id}")
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated site ids")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = json.loads(ODYSSEY.read_text())
    sites = data["sites"]
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        sites = [s for s in sites if s["id"] in wanted]

    existing = {}
    if META_PATH.exists():
        existing = json.loads(META_PATH.read_text()).get("sites", {})

    sys.stdout.reconfigure(line_buffering=True)
    print(f"Fetching {len(sites)} sites at native Sentinel-2 10 m")

    def write_meta() -> None:
        payload = {
            "source": SOURCE,
            "license": LICENSE,
            "resolution": "10 m native Sentinel-2 B04/B03/B02; no resampling",
            "processing": "2-98% display stretch and sRGB transfer; no generated detail",
            "sites": existing,
        }
        META_PATH.write_text(json.dumps(payload, indent=2) + "\n")

    for site in sites:
        print(f"{site['id']}  {site['lat']:.3f}, {site['lon']:.3f}")
        entry = fetch_site(site, args.force)
        if entry:
            existing[site["id"]] = entry
        write_meta()
    print(f"\nWrote {META_PATH} ({len(existing)} sites)")


if __name__ == "__main__":
    main()
