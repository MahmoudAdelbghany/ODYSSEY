#!/usr/bin/env python3
"""Milestone 06 MODIS LST sampler: one policy for all 39 ODYSSEY sites.

Policy:
- Seasonal window: NH 2023-06-01..2023-08-31, SH 2023-12-01..2024-02-29.
- Enumerate all STAC items in the window, group by acquisition date.
- Deterministically select up to 12 unique dates, evenly spaced across the
  available dates. The cap and available count are recorded.
- For every selected date, evaluate every MODIS item covering the point.
- Sample the native 1 km centre pixel; no resampling.
- QC bits 0-1 must be 00; fill DN=0 rejected.
- If multiple items are valid on one date, choose one deterministically by
  (QC, item id). Do not average overlapping granules.
- Day and night are separate. Paired day-night differences only use dates
  where both are valid.
- Statistics require >= 4 accepted dates; evidence status is a display category.
- A 5x5 neighbourhood is recorded separately for spatial sensitivity; it never
  replaces the native centre-pixel observation.
- Cache key includes policy version; cache history cannot change sample size.

Requires: planetary-computer, pystac-client, rasterio, numpy.
"""
from __future__ import annotations

import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
os.environ.setdefault("GDAL_HTTP_CONNECTTIMEOUT", "10")
os.environ.setdefault("CPL_VSIL_CURL_TIMEOUT", "30")
import rasterio
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parent.parent
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
MONTHLY = ROOT / "src" / "data" / "siteMonthly.json"
OUT = ROOT / "src" / "data" / "planetaryThermal.json"
CACHE = Path("/tmp/opencode/modis-lst-m6v4-cache")
CACHE.mkdir(parents=True, exist_ok=True)

CATALOG = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1")
EARTH_R = 6371007.181
CAP = 12
MIN_STATS = 4
POLICY = "m6-v4"
WINDOW_NH = "2023-06-01/2023-08-31"
WINDOW_SH = "2023-12-01/2024-02-29"


def window_for(lat):
    return (WINDOW_NH, "north") if lat >= 0 else (WINDOW_SH, "south")


def status_for(n):
    if n == 0:
        return "NO DATA"
    if n < 4:
        return "INSUFFICIENT"
    if n <= 5:
        return "LIMITED"
    if n <= 11:
        return "MODERATE"
    return "STRONGER SAMPLE"


def sample_item(item, lon, lat, reach=2):
    x = EARTH_R * math.radians(lon) * math.cos(math.radians(lat))
    y = EARTH_R * math.radians(lat)
    a, _b, c, _d, e, f = item.properties["proj:transform"]
    col = int((x - c) / a)
    row = int((y - f) / e)
    signed = planetary_computer.sign(item)
    out = {}
    for band, qc_band in (("LST_Day_1km", "QC_Day"), ("LST_Night_1km", "QC_Night")):
        try:
            with rasterio.open(signed.assets[band].href) as src:
                lst = src.read(
                    1, window=Window(col - reach, row - reach, 2 * reach + 1, 2 * reach + 1)
                ).astype(float)
            with rasterio.open(signed.assets[qc_band].href) as src:
                qc = src.read(
                    1, window=Window(col - reach, row - reach, 2 * reach + 1, 2 * reach + 1)
                ).astype(int)
        except Exception:
            out[band] = None
            continue
        # A point near a granule edge can produce a clipped/empty window.
        # Reject it rather than indexing a missing centre pixel.
        expected = 2 * reach + 1
        if lst.shape != (expected, expected) or qc.shape != (expected, expected):
            out[band] = None
            continue
        q = qc & 3
        valid = (lst > 0) & (q <= 1)
        center = reach
        center_valid = bool(valid[center, center])
        neighbor_vals = lst[valid]
        out[band] = {
            "K": round(float(lst[center, center]) * 0.02, 2) if center_valid else None,
            "qc": int(qc[center, center]),
            "qcClass": "good" if int(qc[center, center]) & 3 == 0 else "other",
            "valid": center_valid,
            "neighborhood": {
                "validPixels": int(valid.sum()),
                "totalPixels": int(valid.size),
                "meanK": round(float(np.mean(neighbor_vals)) * 0.02, 2) if neighbor_vals.size else None,
                "stdK": round(float(np.std(neighbor_vals)) * 0.02, 2) if neighbor_vals.size else None,
                "minK": round(float(np.min(neighbor_vals)) * 0.02, 2) if neighbor_vals.size else None,
                "maxK": round(float(np.max(neighbor_vals)) * 0.02, 2) if neighbor_vals.size else None,
            },
        }
    return out


def resolve_date(items, lon, lat):
    day_candidates, night_candidates = [], []
    for item in items:
        sample = sample_item(item, lon, lat)
        for key, bucket in (("LST_Day_1km", day_candidates), ("LST_Night_1km", night_candidates)):
            value = sample.get(key)
            if value and value["valid"]:
                bucket.append({"itemId": item.id, **value})
    # Deterministic resolution: best QC, then item id.
    day = min(day_candidates, key=lambda v: (v["qc"], v["itemId"])) if day_candidates else None
    night = min(night_candidates, key=lambda v: (v["qc"], v["itemId"])) if night_candidates else None
    return {
        "day": day,
        "night": night,
        "nItems": len(items),
        "nValidDay": len(day_candidates),
        "nValidNight": len(night_candidates),
    }


def stats(obs):
    n = len(obs)
    enough = n >= MIN_STATS
    return {
        "nAccepted": n,
        "nGoodQC": sum(1 for o in obs if o.get("qcClass") == "good"),
        "nOtherQC": sum(1 for o in obs if o.get("qcClass") == "other"),
        "status": status_for(n),
        "meanK": round(float(np.mean([o["K"] for o in obs])), 2) if enough else None,
        "minK": round(float(np.min([o["K"] for o in obs])), 2) if enough else None,
        "maxK": round(float(np.max([o["K"] for o in obs])), 2) if enough else None,
        "observations": obs,
    }


def process_site(site):
    sid = site["id"]
    lat, lon = site["lat"], site["lon"]
    window, hemisphere = window_for(lat)
    cache_path = CACHE / f"{POLICY}-{sid}.json"
    if cache_path.exists():
        return sid, json.loads(cache_path.read_text())

    items = list(
        CATALOG.search(
            collections=["modis-11A1-061"],
            intersects={"type": "Point", "coordinates": [lon, lat]},
            datetime=window,
        ).items()
    )
    by_date = {}
    for item in items:
        date = item.id.split(".")[1][1:]
        by_date.setdefault(date, []).append(item)
    available = sorted(by_date)
    if len(available) > CAP:
        idx = sorted(set(np.linspace(0, len(available) - 1, CAP).round().astype(int).tolist()))
        selected = [available[i] for i in idx]
    else:
        selected = available

    day_obs, night_obs, paired = [], [], []
    rejected_day = rejected_night = 0
    overlap_items = 0
    dates_multi = 0
    overlap_valid_resolved = 0
    day_neighborhoods = []
    for date in selected:
        resolved = resolve_date(by_date[date], lon, lat)
        if resolved["nItems"] > 1:
            dates_multi += 1
            overlap_items += resolved["nItems"] - 1
        if resolved["nValidDay"] > 1 or resolved["nValidNight"] > 1:
            overlap_valid_resolved += 1
        if resolved["day"]:
            obs = {
                "date": date,
                "K": resolved["day"]["K"],
                "qc": resolved["day"]["qc"],
                "qcClass": resolved["day"]["qcClass"],
                "itemId": resolved["day"]["itemId"],
            }
            day_obs.append(obs)
            day_neighborhoods.append(resolved["day"]["neighborhood"])
        else:
            rejected_day += 1
        if resolved["night"]:
            night_obs.append({
                "date": date,
                "K": resolved["night"]["K"],
                "qc": resolved["night"]["qc"],
                "qcClass": resolved["night"]["qcClass"],
                "itemId": resolved["night"]["itemId"],
            })
        else:
            rejected_night += 1
        if resolved["day"] and resolved["night"]:
            paired.append({
                "date": date,
                "dayK": resolved["day"]["K"],
                "nightK": resolved["night"]["K"],
                "deltaK": round(resolved["day"]["K"] - resolved["night"]["K"], 2),
                "dayItemId": resolved["day"]["itemId"],
                "nightItemId": resolved["night"]["itemId"],
            })

    day = {**stats(day_obs), "nRejected": rejected_day}
    night = {**stats(night_obs), "nRejected": rejected_night}
    paired_delta = (
        {
            "nPaired": len(paired),
            "meanDeltaK": round(float(np.mean([p["deltaK"] for p in paired])), 2),
            "minDeltaK": round(float(np.min([p["deltaK"] for p in paired])), 2),
            "maxDeltaK": round(float(np.max([p["deltaK"] for p in paired])), 2),
            "observations": paired,
        }
        if paired
        else {"nPaired": 0, "meanDeltaK": None, "minDeltaK": None, "maxDeltaK": None, "observations": []}
    )
    unpaired = (
        round(day["meanK"] - night["meanK"], 2)
        if day["meanK"] is not None and night["meanK"] is not None
        else None
    )
    if day_neighborhoods:
        center = [n["meanK"] for n in day_neighborhoods if n["meanK"] is not None]
        neigh = [n["meanK"] for n in day_neighborhoods if n["meanK"] is not None]
        diffs = [
            abs(n["meanK"] - o["K"])
            for n, o in zip(day_neighborhoods, day_obs)
            if n["meanK"] is not None and o["K"] is not None
        ]
        sensitivity = {
            "phase": "day",
            "nDates": len(diffs),
            "meanNeighborhoodStdK": round(float(np.mean([n["stdK"] for n in day_neighborhoods if n["stdK"] is not None])), 2) if center else None,
            "meanAbsCenterNeighborhoodK": round(float(np.mean(diffs)), 2) if diffs else None,
            "maxAbsCenterNeighborhoodK": round(float(np.max(diffs)), 2) if diffs else None,
            "meanValidPixels": round(float(np.mean([n["validPixels"] for n in day_neighborhoods])), 1) if center else None,
            "support": "5x5 native 1 km pixels; neighbourhood mean is not substituted for the centre pixel",
        }
    else:
        sensitivity = {"phase": "day", "nDates": 0, "support": "no valid day neighbourhoods"}

    payload = {
        "window": window,
        "hemisphere": hemisphere,
        "cap": CAP,
        "availableDates": len(available),
        "selectedDates": len(selected),
        "selection": "deterministic evenly spaced dates across the available window",
        "nItems": sum(len(by_date[d]) for d in selected),
        "nOverlapItems": overlap_items,
        "nDatesWithMultipleItems": dates_multi,
        "nOverlapValidResolved": overlap_valid_resolved,
        "day": day,
        "night": night,
        "unpairedDayNightDeltaK": unpaired,
        "pairedDayNight": paired_delta,
        "spatialSensitivity": sensitivity,
    }
    cache_path.write_text(json.dumps(payload))
    return sid, payload


def moon_block():
    return {
        "site": "Lunar south polar region",
        "classes": {
            "polarRange": {
                "rangeK": [50.0, 250.0],
                "support": "Diviner polar surface temperature range; PSRs and illuminated slopes; annual/seasonal range",
                "source": "Paige et al. 2010, Science",
                "doi": "10.1126/science.1187726",
                "class": "published mission-level range",
            },
            "permanentlyShadowed": {
                "rangeK": None,
                "support": "Not separately quantified in this repository; Diviner PCP/PRP not ingested",
                "class": "no separate sample",
            },
            "illuminatedSlope": {
                "rangeK": None,
                "support": "Not separately quantified in this repository; Diviner PCP/PRP not ingested",
                "class": "no separate sample",
            },
        },
        "note": "The polarRange is a published mission-level range, not a site-specific Diviner sample.",
    }


def main():
    sys.stdout.reconfigure(line_buffering=True)
    sites = json.loads(ODYSSEY.read_text())["sites"]
    monthly = json.loads(MONTHLY.read_text())["sites"]
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    earth = {}
    with ProcessPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(process_site, site): site for site in sites}
        for i, future in enumerate(as_completed(futures), 1):
            site = futures[future]
            try:
                sid, stats = future.result(timeout=240)
            except Exception as exc:  # noqa: BLE001
                print(f"[{i:02d}/{len(sites)}] {site['id']} ERROR {exc}", flush=True)
                continue
            temps = monthly[sid]["temp"]
            earth[sid] = {
                **stats,
                "air": {
                    "meanK": round(sum(temps) / 12 + 273.15, 2),
                    "minK": round(min(temps) + 273.15, 2),
                    "maxK": round(max(temps) + 273.15, 2),
                    "source": "NASA POWER / MERRA-2 monthly climatology 2001-2020",
                    "support": "2 m air temperature, monthly normals, point sample",
                    "class": "climatology",
                },
            }
            print(
                f"[{i:02d}/{len(sites)}] {sid} day {earth[sid]['day']['status']} "
                f"{earth[sid]['day']['nAccepted']}/{earth[sid]['selectedDates']} "
                f"night {earth[sid]['night']['status']} {earth[sid]['night']['nAccepted']}/{earth[sid]['selectedDates']}",
                flush=True,
            )
            payload = {
                "generatedAt": "2026-11-13",
                "policy": POLICY,
                "modis": {
                    "collection": "modis-11A1-061",
                    "product": "MODIS/MYD11A1 v061",
                    "bands": ["LST_Day_1km", "LST_Night_1km", "QC_Day", "QC_Night"],
                    "scale": 0.02,
                    "qc": "QC bits 0-1 == 00",
                    "support": "native 1 km centre pixel; clear-sky; day and night separate",
                    "access": "Microsoft Planetary Computer STAC",
                    "cap": CAP,
                    "statuses": "NO DATA / INSUFFICIENT / LIMITED / MODERATE / STRONGER SAMPLE are display categories, not confidence levels",
                },
                "earth": earth,
                "mars": previous.get("mars"),
                "moon": moon_block(),
                "thermalInertia": previous.get("thermalInertia"),
            }
            OUT.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(f"Wrote {OUT} ({len(earth)} sites)")


if __name__ == "__main__":
    main()
