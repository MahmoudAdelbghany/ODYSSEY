#!/usr/bin/env python3
"""Attach observation timing and platform metadata to selected audit sites.

Reads Day/Night_view_time, Day/Night_view_angl and Clear_day/night_cov for
the exact accepted item IDs already stored by the MODIS sampler.

- view time: raw * 0.1 -> local solar hours
- view angle: raw DN, degrees (0-65 valid); no undocumented offset applied
- clear-sky coverage: raw * 0.0005, capped to 1.0
"""
from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path

import planetary_computer
import pystac_client
import rasterio
from rasterio.windows import Window

from modis_metadata import decode_clear_sky, decode_view_angle

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "src" / "data" / "planetaryThermal.json"
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
SITES = ["devon", "atacama", "namib", "svalbard"]
R = 6371007.181
CATALOG = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1")


def add_timing(site, meta):
    lat, lon = meta["lat"], meta["lon"]
    for phase, prefix in (("day", "Day"), ("night", "Night")):
        obs = site[phase]["observations"]
        ids = [o["itemId"] for o in obs]
        if not ids:
            continue
        items = {it.id: it for it in CATALOG.search(collections=["modis-11A1-061"], ids=ids).items()}
        for o in obs:
            item = items.get(o["itemId"])
            if not item:
                o["timing"] = None
                continue
            a, _b, c, _d, e, f = item.properties["proj:transform"]
            x = R * math.radians(lon) * math.cos(math.radians(lat))
            y = R * math.radians(lat)
            col = int((x - c) / a)
            row = int((y - f) / e)
            signed = planetary_computer.sign(item)
            try:
                values = {}
                for band in (f"{prefix}_view_time", f"{prefix}_view_angl", f"Clear_{phase}_cov"):
                    with rasterio.open(signed.assets[band].href) as src:
                        values[band] = float(src.read(1, window=Window(col, row, 1, 1))[0, 0])
                raw_time = values[f"{prefix}_view_time"]
                raw_angle = values[f"{prefix}_view_angl"]
                raw_cov = values[f"Clear_{phase}_cov"]
                angle = decode_view_angle(raw_angle)
                coverage = decode_clear_sky(raw_cov)
                product_date = datetime.strptime(o["date"], "%Y%j").strftime("%Y-%m-%d")
                o["timing"] = {
                    "platform": "Aqua" if o["itemId"].startswith("MYD") else "Terra",
                    "productDateUTC": product_date,
                    "localSolarDate": None,
                    "timeBasis": "product date is UTC acquisition date; view time is local solar time; local date not derived",
                    "localSolarTimeHours": round(raw_time * 0.1, 2) if raw_time > 0 else None,
                    "rawViewAngleDN": angle["rawDN"],
                    "signedViewAngleDeg": angle["signedDeg"],
                    "absoluteViewAngleDeg": angle["absoluteDeg"],
                    "viewDirection": angle["direction"],
                    "viewAngleMissing": angle["missing"],
                    "rawClearSkyCoverageDN": coverage["rawDN"],
                    "clearSkyCoverageScale": coverage["scale"],
                    "clearSkyCoverageUnclipped": coverage["unclipped"],
                    "clearSkyCoverageMissing": coverage["missing"],
                    "missingRule": "view angle 255 missing; clear-sky coverage 0 missing; 1-65535 valid",
                }
            except Exception as exc:  # noqa: BLE001
                o["timing"] = {"error": str(exc)[:120]}
    return site


def main():
    data = json.loads(PATH.read_text())
    meta = {s["id"]: s for s in json.loads(ODYSSEY.read_text())["sites"]}
    for sid in SITES:
        if sid in data["earth"]:
            print("timing", sid)
            site = data["earth"][sid]
            add_timing(site, meta[sid])
            data["earth"][sid] = site
    PATH.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    print("wrote", PATH)


if __name__ == "__main__":
    main()
