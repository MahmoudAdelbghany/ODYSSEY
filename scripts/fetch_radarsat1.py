#!/usr/bin/env python3
"""Attach historical RADARSAT-1 evidence to selected discovery candidates.

What this does:
  1. Searches the EODMS STAC API for RADARSAT-1 scenes covering a candidate.
  2. Downloads the segment browse image.
  3. Matches the acquisition to a RADARSAT-1 L1 COG in the AWS Open Data bucket.
  4. Computes relative texture statistics from the browse image and one L1 frame.
  5. Writes a `sar` block into src/data/discovery.json.

It does NOT claim a calibrated sigma0 or a local AOI measurement. The COG frames
are not geocoded in the AWS archive, so the evidence is labeled as historical
segment/frame context. Use Sentinel-1 GRD for calibrated local backscatter.

Usage:
  python3 scripts/fetch_radarsat1.py --only ellesmere,victoriaisland
  python3 scripts/fetch_radarsat1.py
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from scipy.ndimage import laplace

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data" / "discovery.json"
OUT_DIR = ROOT / "public" / "sar"
CACHE = Path("/tmp/opencode/radarsat1-cache")
CACHE.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

STAC_SEARCH = "https://www.eodms-sgdot.nrcan-rncan.gc.ca/search/search"
S3_BASE = "https://radarsat-r1-l1-cog.s3.amazonaws.com/"
TARGETS = ["ellesmere", "victoriaisland", "wardhunt", "baffin", "ilerouleau", "mistastin"]


def point_in_poly(poly, x, y):
    inside = False
    for i in range(len(poly)):
        x1, y1 = poly[i][0], poly[i][1]
        x2, y2 = poly[(i + 1) % len(poly)][0], poly[(i + 1) % len(poly)][1]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1):
            inside = not inside
    return inside


def parse_dt(value):
    value = value.replace("Z", "+00:00")
    if "." in value:
        head, tail = value.split(".", 1)
        frac = re.match(r"(\d+)", tail)
        rest = tail[len(frac.group(1)):] if frac else ""
        value = f"{head}.{frac.group(1)[:6]}{rest}" if frac else head
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        dt = datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def search(lat, lon, pad=1.0):
    params = {
        "collections": "Radarsat-1-Raw",
        "bbox": f"{lon - pad},{lat - pad},{lon + pad},{lat + pad}",
        "datetime": "2005-01-01T00:00:00Z/2013-03-29T23:59:59Z",
        "limit": 100,
    }
    for attempt in range(3):
        try:
            r = requests.get(STAC_SEARCH, params=params, timeout=60)
            r.raise_for_status()
            return r.json().get("features", [])
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                print(f"  STAC failed {lat},{lon}: {exc}")
                return []
            time.sleep(2)


def select_scene(features, lat, lon):
    hits = []
    for f in features:
        geom = f.get("geometry") or {}
        rings = geom.get("coordinates") or []
        if not rings:
            continue
        poly = rings[0]
        if not point_in_poly(poly, lon, lat):
            continue
        p = f.get("properties", {})
        beam = p.get("beam_mode", "")
        priority = 0 if beam == "Standard" else 1 if beam == "Fine" else 2
        hits.append((priority, -parse_dt(p.get("datetime")).timestamp(), f))
    if not hits:
        return None
    hits.sort(key=lambda x: (x[0], x[1]))
    return hits[0][2]


def list_month_keys(year, month):
    cache = CACHE / f"{year}-{month}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    keys = []
    token = None
    for _ in range(12):
        url = f"{S3_BASE}?list-type=2&prefix={year}/{month}/&max-keys=1000"
        if token:
            url += "&continuation-token=" + requests.utils.quote(token)
        r = requests.get(url, timeout=90)
        r.raise_for_status()
        keys += re.findall(r"<Key>(.*?)</Key>", r.text)
        m = re.search(r"<NextContinuationToken>(.*?)</NextContinuationToken>", r.text)
        if not m:
            break
        token = m.group(1)
    cache.write_text(json.dumps(keys))
    return keys


def beam_tokens(beam_mnemonic):
    b = (beam_mnemonic or "").upper()
    if b.startswith("S") and b[1:].isdigit():
        return [f"ST{b[1:]}"]
    if b.startswith("F") and b[1:].isdigit():
        return [f"F{b[1:]}"]
    if b.startswith("SCW"):
        return ["SW", "SCW"]
    return [b]


def match_key(scene, keys):
    p = scene.get("properties", {})
    target = parse_dt(p.get("datetime"))
    target_ts = target.timestamp()
    tokens = beam_tokens(p.get("beam_mnemonic"))
    best = None
    for key in keys:
        if "_HH_" not in key:
            continue
        if not any(t in key for t in tokens):
            continue
        m = re.search(r"_(\d{8})_(\d{6})_HH_", key)
        if not m:
            continue
        try:
            ts = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            continue
        delta = abs(ts - target_ts)
        if delta <= 300 and (best is None or delta < best[0]):
            best = (delta, key)
    return best[1] if best else None


def texture_from_image(path):
    img = Image.open(path).convert("L")
    arr = np.asarray(img, dtype=float)
    if arr.size < 100:
        return None
    hist, _ = np.histogram(arr, bins=32, range=(0, 255))
    prob = hist / max(1, hist.sum())
    entropy = float(-(prob[prob > 0] * np.log2(prob[prob > 0])).sum())
    gy, gx = np.gradient(arr)
    grad = np.hypot(gx, gy)
    contrast = float(np.var(laplace(arr)))
    return {
        "mean": round(float(np.mean(arr)), 2),
        "std": round(float(np.std(arr)), 2),
        "p10": round(float(np.percentile(arr, 10)), 2),
        "p90": round(float(np.percentile(arr, 90)), 2),
        "entropy": round(entropy, 3),
        "edgeDensity": round(float((grad > np.percentile(grad, 90)).mean()), 3),
        "contrast": round(contrast, 3),
        "homogeneity": round(1.0 / (1.0 + contrast), 4),
    }


def texture_from_cog(url):
    with rasterio.Env(GDAL_HTTP_TIMEOUT="60", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(url) as src:
            arr = src.read(1, out_shape=(512, 512), resampling=Resampling.average).astype(float)
            tags = dict(src.tags())
    arr[arr <= 0] = np.nan
    if np.isfinite(arr).mean() < 0.5:
        return None, tags
    arr = np.where(np.isfinite(arr), arr, np.nanmedian(arr))
    hist, _ = np.histogram(arr, bins=32, range=(0, 255))
    prob = hist / max(1, hist.sum())
    entropy = float(-(prob[prob > 0] * np.log2(prob[prob > 0])).sum())
    gy, gx = np.gradient(arr)
    grad = np.hypot(gx, gy)
    contrast = float(np.var(laplace(arr)))
    return {
        "mean": round(float(np.mean(arr)), 2),
        "std": round(float(np.std(arr)), 2),
        "p10": round(float(np.percentile(arr, 10)), 2),
        "p90": round(float(np.percentile(arr, 90)), 2),
        "entropy": round(entropy, 3),
        "edgeDensity": round(float((grad > np.percentile(grad, 90)).mean()), 3),
        "contrast": round(contrast, 3),
        "homogeneity": round(1.0 / (1.0 + contrast), 4),
    }, tags


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated candidate ids")
    args = parser.parse_args()

    data = json.loads(DATA.read_text())
    by_id = {c["id"]: c for c in data["candidates"]}
    wanted = [s.strip() for s in args.only.split(",")] if args.only else TARGETS

    for cid in wanted:
        candidate = by_id.get(cid)
        if not candidate:
            print(f"  {cid}: not in discovery.json")
            continue
        lat, lon = candidate["lat"], candidate["lon"]
        print(f"{cid}  {lat:.3f}, {lon:.3f}")
        features = search(lat, lon)
        scene = select_scene(features, lat, lon)
        if not scene:
            print("  no scene covering point")
            continue
        p = scene.get("properties", {})
        dt = parse_dt(p.get("datetime"))
        thumb_url = scene.get("assets", {}).get("thumbnail", {}).get("href")
        thumb_path = OUT_DIR / f"{cid}.jpg"
        if not thumb_path.exists() and thumb_url:
            r = requests.get(thumb_url, timeout=60)
            if r.ok:
                thumb_path.write_bytes(r.content)
        browse = texture_from_image(thumb_path) if thumb_path.exists() else None

        keys = list_month_keys(dt.year, dt.month)
        key = match_key(scene, keys)
        frame_texture = None
        tags = {}
        if key:
            try:
                frame_texture, tags = texture_from_cog(S3_BASE + key)
            except Exception as exc:  # noqa: BLE001
                print(f"  COG failed {key}: {exc}")
        inc = None
        if tags.get("CEOS_INC_ANGLE"):
            try:
                inc = round(float(tags["CEOS_INC_ANGLE"]), 2)
            except ValueError:
                pass

        if not browse:
            print("  no browse texture")
            continue
        candidate["sar"] = {
            "platform": "RADARSAT-1",
            "productId": key or scene.get("id", ""),
            "acquired": dt.strftime("%Y-%m-%d"),
            "beamMode": f"{p.get('beam_mode', '')} {p.get('beam_mnemonic', '')}".strip(),
            "polarization": "HH",
            "incidenceAngle": inc,
            "footprint": (scene.get("geometry") or {}).get("coordinates", [[]])[0],
            "thumbnail": f"/sar/{cid}.jpg",
            "texture": frame_texture or browse,
            "browseTexture": browse,
            "frameProduct": key or "",
            "support": (
                "RADARSAT-1 segment browse texture"
                + (" plus one L1 frame sample." if key else " only; no matching L1 frame found for this acquisition in the open AWS archive.")
                + " The AWS L1 COG is not geocoded, so this is historical segment/frame context, "
                "not a local AOI measurement."
            ),
            "class": "historical SAR context",
            "uncertainty": (
                "8-bit relative amplitude; no calibration to sigma0; no terrain correction; "
                "the frame may not cover the exact candidate AOI."
            ),
            "source": "CSA RADARSAT-1 via EODMS STAC + AWS Open Data COG",
        }
        print(f"  {dt.date()} {candidate['sar']['beamMode']} / {key or 'no frame'} / inc {inc}")
        DATA.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")

    print(f"\nWrote {DATA}")


if __name__ == "__main__":
    main()
