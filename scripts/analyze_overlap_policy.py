#!/usr/bin/env python3
"""Compare overlap-resolution policies for the four thermal audit sites.

Policies:
- current: raw QC, then item id.
- error_aware: mandatory QA, LST error bits 6-7, emissivity error bits 4-5, item id.
- terra: Terra-only, then error_aware.
- aqua: Aqua-only, then error_aware.

Bits 2-3 are never used.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.windows import Window

from modis_metadata import select_candidate

ROOT = Path(__file__).resolve().parent.parent
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
THERMAL = ROOT / "src" / "data" / "planetaryThermal.json"
CATALOG = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1")
R = 6371007.181
CAP = 12
SITES = ["devon", "atacama", "namib", "svalbard"]


def window(lat):
    return "2023-06-01/2023-08-31" if lat >= 0 else "2023-12-01/2024-02-29"


def sample(item, lon, lat):
    x = R * math.radians(lon) * math.cos(math.radians(lat))
    y = R * math.radians(lat)
    a, _b, c, _d, e, f = item.properties["proj:transform"]
    col = int((x - c) / a)
    row = int((y - f) / e)
    signed = planetary_computer.sign(item)
    out = {}
    for band, qc_band in (("LST_Day_1km", "QC_Day"), ("LST_Night_1km", "QC_Night")):
        try:
            with rasterio.open(signed.assets[band].href) as src:
                k = float(src.read(1, window=Window(col, row, 1, 1))[0, 0])
            with rasterio.open(signed.assets[qc_band].href) as src:
                qc = int(src.read(1, window=Window(col, row, 1, 1))[0, 0])
        except Exception:
            out[band] = None
            continue
        good = k > 0 and (qc & 3) <= 1
        out[band] = {
            "itemId": item.id,
            "platform": "Aqua" if item.id.startswith("MYD") else "Terra",
            "qc": qc,
            "K": round(k * 0.02, 2) if good else None,
            "valid": good,
        }
    return out


def stats(candidates_by_date, phase):
    values = [v for v in candidates_by_date.values() if v]
    n = len(values)
    return {
        "n": n,
        "meanK": round(float(np.mean([v["K"] for v in values])), 2) if n >= 4 else None,
    }


def main():
    thermal = json.loads(THERMAL.read_text())
    meta = {s["id"]: s for s in json.loads(ODYSSEY.read_text())["sites"]}
    result = {}
    for sid in SITES:
        s = meta[sid]
        lon, lat = s["lon"], s["lat"]
        items = list(
            CATALOG.search(
                collections=["modis-11A1-061"],
                intersects={"type": "Point", "coordinates": [lon, lat]},
                datetime=window(lat),
            ).items()
        )
        by_date = {}
        for item in items:
            date = item.id.split(".")[1][1:]
            by_date.setdefault(date, []).append(item)
        available = sorted(by_date)
        idx = sorted(set(np.linspace(0, len(available) - 1, CAP).round().astype(int).tolist())) if len(available) > CAP else list(range(len(available)))
        selected = [available[i] for i in idx]
        print(sid, "selected", len(selected))

        candidates = {}
        for date in selected:
            day, night = [], []
            for item in by_date[date]:
                sample_result = sample(item, lon, lat)
                for key, bucket in (("LST_Day_1km", day), ("LST_Night_1km", night)):
                    v = sample_result.get(key)
                    if v and v["valid"]:
                        bucket.append(v)
            candidates[date] = {"day": day, "night": night}

        policies = {}
        for policy in ["current", "error_aware", "terra", "aqua"]:
            day_sel, night_sel, paired = {}, {}, []
            for date, buckets in candidates.items():
                d = select_candidate(buckets["day"], policy)
                n = select_candidate(buckets["night"], policy)
                day_sel[date] = d
                night_sel[date] = n
                if d and n:
                    paired.append(d["K"] - n["K"])
            policies[policy] = {
                "day": stats(day_sel, "day"),
                "night": stats(night_sel, "night"),
                "paired": {
                    "n": len(paired),
                    "meanDeltaK": round(float(np.mean(paired)), 2) if paired else None,
                },
            }
        current = policies["current"]
        for policy in ["error_aware", "terra", "aqua"]:
            p = policies[policy]
            p["deltaVsCurrent"] = {
                "dayMeanK": round(p["day"]["meanK"] - current["day"]["meanK"], 2) if p["day"]["meanK"] is not None and current["day"]["meanK"] is not None else None,
                "nightMeanK": round(p["night"]["meanK"] - current["night"]["meanK"], 2) if p["night"]["meanK"] is not None and current["night"]["meanK"] is not None else None,
                "dayCount": p["day"]["n"] - current["day"]["n"],
                "nightCount": p["night"]["n"] - current["night"]["n"],
            }
        result[sid] = {"window": window(lat), "selectedDates": len(selected), "policies": policies}
    thermal["overlapPolicySensitivity"] = result
    THERMAL.write_text(json.dumps(thermal, indent=2, allow_nan=False) + "\n")
    print(json.dumps(result, indent=2)[:3000])


if __name__ == "__main__":
    main()
