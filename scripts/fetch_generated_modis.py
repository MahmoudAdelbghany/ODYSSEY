#!/usr/bin/env python3
"""Fetch MODIS day/night land-surface temperature for enriched generated regions.

Reuses the Milestone 06 policy in scripts/fetch_modis_lst.py:

  - MODIS/MYD11A1 v061, native 1 km centre pixel;
  - seasonal windows NH 2023-06..08, SH 2023-12..2024-02;
  - up to 12 deterministically spaced dates;
  - QC bits 0-1 must be 00 or 01; fill rejected;
  - day and night kept separate; paired differences only where both exist;
  - >= 4 accepted dates for summary statistics.

Output: src/data/generatedThermal.json
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from fetch_modis_lst import process_site  # noqa: E402

SELECTION = ROOT / "src" / "data" / "generatedEnrichmentSelection.json"
ENRICHMENT = ROOT / "src" / "data" / "generatedEnrichment.json"
OUT = ROOT / "src" / "data" / "generatedThermal.json"


def air_block(site: dict):
    power = site.get("power")
    if not power or not power.get("monthly"):
        return None
    monthly = power["monthly"]["T2M"]
    values = [value for value in monthly if value is not None]
    if not values:
        return None
    return {
        "meanK": round(sum(values) / len(values) + 273.15, 2),
        "minK": round(min(values) + 273.15, 2),
        "maxK": round(max(values) + 273.15, 2),
        "source": "NASA POWER / MERRA-2 monthly climatology 2001-2020",
        "support": "2 m air temperature, monthly normals, point sample",
        "class": "climatology",
    }


def main() -> None:
    selection = json.loads(SELECTION.read_text())
    enrichment = json.loads(ENRICHMENT.read_text())
    sites = enrichment["sites"]
    earth = {}
    errors = {}
    with ProcessPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(
                process_site,
                {"id": item["id"], "lat": item["lat"], "lon": item["lon"]},
            ): item
            for item in selection["regions"]
        }
        for index, future in enumerate(as_completed(futures), 1):
            item = futures[future]
            site_id = item["id"]
            try:
                _, payload = future.result(timeout=300)
            except Exception as exc:  # noqa: BLE001
                errors[site_id] = str(exc)
                print(f"[{index:02d}/{len(futures)}] {site_id} ERROR {exc}")
                continue
            site = sites.get(site_id, {})
            earth[site_id] = {
                **payload,
                "air": air_block(site),
            }
            print(
                f"[{index:02d}/{len(futures)}] {site_id} "
                f"day {payload['day']['status']} {payload['day']['nAccepted']}/{payload['selectedDates']} "
                f"night {payload['night']['status']} {payload['night']['nAccepted']}/{payload['selectedDates']}"
            )

    output = {
        "generatedAt": "2026-11-13",
        "policy": "m6-v4",
        "selectionVersion": selection["version"],
        "modis": {
            "collection": "modis-11A1-061",
            "product": "MODIS/MYD11A1 v061",
            "bands": ["LST_Day_1km", "LST_Night_1km", "QC_Day", "QC_Night"],
            "scale": 0.02,
            "qc": "QC bits 0-1 == 00 or 01 accepted; fill rejected",
            "support": "native 1 km centre pixel; clear-sky; day and night separate",
            "access": "Microsoft Planetary Computer STAC",
            "cap": 12,
            "statuses": "NO DATA / INSUFFICIENT / LIMITED / MODERATE / STRONGER SAMPLE are display categories, not confidence levels",
        },
        "earth": earth,
        "errors": errors,
    }
    OUT.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n")
    print(f"wrote {OUT} ({len(earth)} sites, {len(errors)} errors)")


if __name__ == "__main__":
    main()
