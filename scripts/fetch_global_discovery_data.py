#!/usr/bin/env python3
"""Download the public datasets used by scripts/global_discovery.py.

Data is cached outside the repository. Re-running is a no-op unless --refresh
is passed.

Usage:
  python3 scripts/fetch_global_discovery_data.py
  python3 scripts/fetch_global_discovery_data.py --refresh

Environment overrides:
  ODYSSEY_GLOBAL_DATA    default /tmp/opencode/global-data
  ODYSSEY_AIRPORTS       default /tmp/opencode/discovery-cache/airports.json
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import urllib.request
import zipfile
from pathlib import Path

DATA = Path(os.environ.get("ODYSSEY_GLOBAL_DATA", "/tmp/opencode/global-data"))
AIRPORTS = Path(os.environ.get("ODYSSEY_AIRPORTS", "/tmp/opencode/discovery-cache/airports.json"))

WORLDCLIM = "https://geodata.ucdavis.edu/climate/worldclim/2_1/base"
NATURAL_EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson"
AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"

DOWNLOADS = [
    (f"{WORLDCLIM}/wc2.1_10m_bio.zip", "wc2.1_10m_bio.zip"),
    (f"{WORLDCLIM}/wc2.1_10m_elev.zip", "wc2.1_10m_elev.zip"),
    (NATURAL_EARTH, "ne_land.geojson"),
]


def download(url: str, path: Path, refresh: bool) -> None:
    if path.exists() and not refresh:
        print(f"  cached {path} ({path.stat().st_size / 1e6:.1f} MB)")
        return
    print(f"  downloading {url}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=180) as response:
        path.write_bytes(response.read())
    print(f"  wrote {path} ({path.stat().st_size / 1e6:.1f} MB)")


def unzip_rasters(path: Path, refresh: bool) -> None:
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            target = path.parent / name
            if name.endswith(".tif") and (refresh or not target.exists()):
                archive.extract(name, path.parent)
                print(f"  extracted {target}")


def build_airports(refresh: bool) -> None:
    if AIRPORTS.exists() and not refresh:
        print(f"  cached {AIRPORTS} ({AIRPORTS.stat().st_size / 1e6:.1f} MB)")
        return
    print(f"  downloading {AIRPORTS_URL}")
    with urllib.request.urlopen(AIRPORTS_URL, timeout=180) as response:
        text = response.read().decode("utf-8")
    keep = []
    for row in csv.DictReader(io.StringIO(text)):
        if row.get("type") not in ("large_airport", "medium_airport"):
            continue
        if row.get("scheduled_service") != "yes":
            continue
        try:
            keep.append(
                {
                    "name": row["name"],
                    "iata": row.get("iata_code") or "",
                    "country": row.get("iso_country") or "",
                    "lat": float(row["latitude_deg"]),
                    "lon": float(row["longitude_deg"]),
                }
            )
        except (TypeError, ValueError):
            continue
    AIRPORTS.parent.mkdir(parents=True, exist_ok=True)
    AIRPORTS.write_text(json.dumps(keep))
    print(f"  wrote {AIRPORTS} ({len(keep)} scheduled large/medium airports)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-download existing files")
    args = parser.parse_args()
    print(f"data directory {DATA}")
    for url, name in DOWNLOADS:
        download(url, DATA / name, args.refresh)
    for name in ("wc2.1_10m_bio.zip", "wc2.1_10m_elev.zip"):
        unzip_rasters(DATA / name, args.refresh)
    build_airports(args.refresh)
    print("done")


if __name__ == "__main__":
    main()
