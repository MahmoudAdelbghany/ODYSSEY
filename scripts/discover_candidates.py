#!/usr/bin/env python3
"""Discover planetary-analog candidates outside the 39 curated ODYSSEY sites.

This is the screening tier of the discovery engine. It samples a deliberately
under-studied seed list, then attaches real open evidence:

  - NASA POWER monthly climatology 2001-2020 (reanalysis, 0.5 x 0.625 deg)
  - Copernicus DEM GLO-90 (90 m DSM; slope, roughness, relief)
  - Macrostrat geologic units (mapped vector; lithology/age)
  - OurAirports nearest-airport distance (access proxy)

It does NOT claim mineralogy, vegetation, water/ice, subsurface or geotechnical
evidence. Those are emitted as missing and must be refined with EMIT/ASTER,
Sentinel-2, GEDI/ICESat-2 and field work.

Output: src/data/discovery.json

Usage:
  python3 scripts/discover_candidates.py --limit 5
  python3 scripts/discover_candidates.py
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.windows import Window
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
OUT = ROOT / "src" / "data" / "discovery.json"
CACHE = Path("/tmp/opencode/discovery-cache")
CACHE.mkdir(parents=True, exist_ok=True)

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
POWER_PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN,AOD_55,GWETTOP,GWETROOT,PS"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
MACROSTRAT_URL = "https://macrostrat.org/api/geologic_units/map"
AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
DEM_BASE = "https://copernicus-dem-90m.s3.amazonaws.com"

# ---------------------------------------------------------------------------
# Seed list: deliberately outside the 39 curated controls.
# Coordinates are candidate AOI centres, not surveyed site markers.
# ---------------------------------------------------------------------------


def S(sid, name, country, lat, lon, kind, tags, note=""):
    return dict(id=sid, name=name, country=country, lat=lat, lon=lon, type=kind,
                tags=tags, note=note)


SEEDS = [
    # Impact structures
    S("mistastin", "Mistastin Lake", "Canada", 55.88, -63.30, "Impact crater / anorthosite", ["impact", "anorthosite", "regolith"]),
    S("gossesbluff", "Gosses Bluff", "Australia", -23.82, 132.31, "Impact crater / eroded", ["impact", "sandstone", "regolith"]),
    S("shoemaker", "Shoemaker Structure", "Australia", -25.87, 120.88, "Impact crater / eroded", ["impact", "regolith"]),
    S("veevers", "Veevers Crater", "Australia", -22.97, 125.37, "Impact crater / small", ["impact", "regolith"]),
    S("dalgaranga", "Dalgaranga Crater", "Australia", -25.73, 117.08, "Impact crater / small", ["impact", "regolith"]),
    S("piccaninny", "Piccaninny Crater", "Australia", -17.43, 128.43, "Impact crater / eroded", ["impact", "regolith"]),
    S("tswaing", "Tswaing Crater", "South Africa", -25.41, 28.08, "Impact crater / small", ["impact", "regolith"]),
    S("roterkamm", "Roter Kamm", "Namibia", -27.77, 16.30, "Impact crater / small", ["impact", "sand", "regolith"]),
    S("bplibya", "BP Structure", "Libya", 25.32, 24.33, "Impact crater / eroded", ["impact", "sandstone"]),
    S("oasiscrater", "Oasis Crater", "Libya", 24.58, 24.40, "Impact crater / buried", ["impact", "sandstone"]),
    S("wabar", "Wabar Craters", "Saudi Arabia", 21.50, 50.47, "Impact crater / small", ["impact", "sand"]),
    S("dhala", "Dhala Structure", "India", 25.30, 78.13, "Impact crater / eroded", ["impact", "regolith"]),
    S("ramgarh", "Ramgarh Crater", "India", 25.33, 76.63, "Impact crater / small", ["impact", "regolith"]),
    S("westclearwater", "West Clearwater", "Canada", 56.22, -74.10, "Impact crater / complex", ["impact", "regolith"]),
    S("manicouagan", "Manicouagan", "Canada", 51.38, -68.70, "Impact crater / complex", ["impact", "regolith"]),
    S("charlevoix", "Charlevoix", "Canada", 47.53, -70.30, "Impact crater / complex", ["impact", "regolith"]),
    S("pingualuit", "Pingualuit Crater", "Canada", 61.28, -73.67, "Impact crater / small", ["impact", "regolith"]),
    S("couture", "Couture Crater", "Canada", 60.13, -75.33, "Impact crater / small", ["impact", "regolith"]),
    S("nicholson", "Nicholson Lake", "Canada", 62.23, -102.70, "Impact crater / complex", ["impact", "regolith"]),
    S("lamoinerie", "La Moinerie", "Canada", 57.43, -66.63, "Impact crater / small", ["impact", "regolith"]),
    S("ilerouleau", "Île Rouleau", "Canada", 50.68, -73.88, "Impact crater / small", ["impact", "regolith"]),
    S("gow", "Gow Crater", "Canada", 56.45, -104.48, "Impact crater / small", ["impact", "regolith"]),
    S("brent", "Brent Crater", "Canada", 46.08, -78.48, "Impact crater / small", ["impact", "regolith"]),
    S("holleford", "Holleford Crater", "Canada", 44.47, -76.63, "Impact crater / small", ["impact", "regolith"]),

    # Arid and salt systems
    S("lut", "Lut Desert", "Iran", 30.30, 59.20, "Hyper-arid desert / yardangs", ["sand", "evaporite", "regolith"]),
    S("dashtekavir", "Dasht-e Kavir", "Iran", 34.80, 54.70, "Salt desert", ["evaporite", "clay", "regolith"]),
    S("dashtemargo", "Dasht-e Margo", "Afghanistan", 31.00, 62.00, "Arid desert", ["sand", "regolith"]),
    S("registan", "Registan Desert", "Afghanistan", 30.50, 64.00, "Sand desert", ["sand", "regolith"]),
    S("taklamakan", "Taklamakan", "China", 38.90, 82.00, "Sand sea", ["sand", "regolith"]),
    S("badainjaran", "Badain Jaran", "China", 40.00, 102.00, "Megadune desert", ["sand", "regolith"]),
    S("tengger", "Tengger Desert", "China", 38.70, 105.00, "Dune desert", ["sand", "regolith"]),
    S("turpan", "Turpan Depression", "China", 42.80, 89.20, "Below-sea-level arid basin", ["evaporite", "sand", "regolith"]),
    S("thar", "Thar Desert", "India", 27.00, 71.00, "Sand desert", ["sand", "regolith"]),
    S("siwa", "Siwa Oasis", "Egypt", 29.20, 25.52, "Salt lake / desert oasis", ["evaporite", "sand", "regolith"]),
    S("kufra", "Kufra Basin", "Libya", 24.50, 23.00, "Saharan desert", ["sand", "regolith"]),
    S("murzuq", "Murzuq Sand Sea", "Libya", 25.00, 14.00, "Sand sea", ["sand", "regolith"]),
    S("tassili", "Tassili n'Ajjer", "Algeria", 25.00, 9.00, "Sandstone plateau", ["sandstone", "regolith"]),
    S("ennedi", "Ennedi Plateau", "Chad", 17.00, 22.00, "Sandstone desert", ["sandstone", "regolith"]),
    S("sossusvlei", "Sossusvlei", "Namibia", -24.73, 15.30, "Dune field", ["sand", "regolith"]),
    S("kgalagadi", "Kgalagadi", "South Africa", -25.00, 20.00, "Arid savanna / dunes", ["sand", "regolith"]),
    S("karoo", "Karoo", "South Africa", -32.00, 22.00, "Semi-arid shale basin", ["clay", "regolith"]),
    S("patagonia", "Patagonian Steppe", "Argentina", -44.00, -68.00, "Cold desert steppe", ["sand", "regolith"]),
    S("sechura", "Sechura Desert", "Peru", -5.50, -80.00, "Coastal desert", ["sand", "regolith"]),
    S("nazca", "Nazca Desert", "Peru", -14.80, -75.00, "Coastal desert", ["sand", "regolith"]),
    S("patagoniavolcanic", "Patagonian Volcanic Plateau", "Argentina", -40.00, -69.00, "Volcanic plateau", ["basalt", "regolith"]),
    S("kalahari", "Kalahari Basin", "Botswana", -23.00, 22.00, "Sand basin", ["sand", "regolith"]),
    S("richtersveld", "Richtersveld", "South Africa", -28.50, 17.00, "Arid mountain desert", ["regolith"]),
    S("jujuy", "Puna de Jujuy", "Argentina", -23.00, -66.00, "High-altitude arid basin", ["evaporite", "regolith"]),
    S("coipasa", "Salar de Coipasa", "Bolivia", -19.20, -68.20, "High-altitude salt flat", ["evaporite", "regolith"]),

    # Polar and periglacial
    S("deception", "Deception Island", "Antarctica", -62.97, -60.65, "Subglacial volcano", ["basalt", "ice", "regolith"]),
    S("jamesross", "James Ross Island", "Antarctica", -64.17, -57.50, "Volcanic / glacial", ["basalt", "ice", "regolith"]),
    S("erebus", "Mount Erebus", "Antarctica", -77.53, 167.17, "Active volcanic", ["basalt", "ice", "regolith"]),
    S("melbourne", "Mount Melbourne", "Antarctica", -74.35, 164.70, "Volcanic / glacial", ["basalt", "ice", "regolith"]),
    S("ellesmere", "Ellesmere Island", "Canada", 80.00, -80.00, "Polar desert", ["ice", "regolith"]),
    S("wardhunt", "Ward Hunt Island", "Canada", 83.10, -74.00, "Polar desert", ["ice", "regolith"]),
    S("baffin", "Baffin Island", "Canada", 67.00, -66.00, "Glacial / fjord", ["ice", "regolith"]),
    S("victoriaisland", "Victoria Island", "Canada", 70.00, -110.00, "Polar desert", ["ice", "regolith"]),
    S("franzjosef", "Franz Josef Land", "Russia", 80.50, 55.00, "Polar desert", ["ice", "regolith"]),
    S("severnayazemlya", "Severnaya Zemlya", "Russia", 79.50, 98.00, "Polar desert", ["ice", "regolith"]),
    S("novayazemlya", "Novaya Zemlya", "Russia", 74.00, 56.00, "Polar / glacial", ["ice", "regolith"]),
    S("qiangtang", "Qiangtang Plateau", "China", 34.00, 88.00, "High-altitude cold desert", ["ice", "regolith"]),
    S("hohxil", "Hoh Xil", "China", 35.50, 92.00, "High-altitude cold desert", ["ice", "regolith"]),
    S("tianshuihai", "Tianshuihai", "China", 35.30, 78.00, "High-altitude cold desert", ["ice", "regolith"]),
    S("cerrogalan", "Cerro Galán", "Argentina", -25.50, -66.70, "High-altitude caldera", ["volcanic", "evaporite"]),
    S("altiplano", "Altiplano", "Bolivia", -18.00, -68.00, "High-altitude plateau", ["evaporite", "regolith"]),
    S("falklands", "Falkland Islands", "UK", -51.50, -59.00, "Cold maritime", ["regolith"]),
    S("southgeorgia", "South Georgia", "UK", -54.50, -36.50, "Subpolar / glacial", ["ice", "regolith"]),
    S("patagoniaice", "Southern Patagonian Icefield", "Chile", -49.00, -73.00, "Glacial", ["ice", "regolith"]),
    S("qaanaaq", "Qaanaaq", "Greenland", 77.47, -69.23, "Polar desert", ["ice", "regolith"]),

    # Volcanic
    S("ertaale", "Erta Ale", "Ethiopia", 13.60, 40.67, "Basaltic lava lake", ["basalt", "volcanic", "regolith"]),
    S("nyiragongo", "Nyiragongo", "DRC", -1.52, 29.25, "Basaltic lava lake", ["basalt", "volcanic", "regolith"]),
    S("nyamuragira", "Nyamuragira", "DRC", -1.40, 29.20, "Basaltic shield", ["basalt", "volcanic", "regolith"]),
    S("sierranegra", "Sierra Negra", "Ecuador", -0.83, -91.17, "Basaltic caldera", ["basalt", "volcanic", "regolith"]),
    S("alcedo", "Alcedo", "Ecuador", -0.43, -91.12, "Basaltic caldera", ["basalt", "volcanic", "regolith"]),
    S("lascar", "Láscar", "Chile", -23.37, -67.73, "High-altitude volcano", ["volcanic", "regolith"]),
    S("villarrica", "Villarrica", "Chile", -39.42, -71.93, "Basaltic volcano", ["basalt", "volcanic"]),
    S("cotopaxi", "Cotopaxi", "Ecuador", -0.68, -78.44, "Andesitic volcano", ["volcanic", "regolith"]),
    S("teide", "Teide", "Spain", 28.27, -16.64, "Basaltic volcano", ["basalt", "volcanic"]),
    S("fogo", "Fogo", "Cape Verde", 14.95, -24.35, "Basaltic volcano", ["basalt", "volcanic"]),
    S("fournaise", "Piton de la Fournaise", "France", -21.24, 55.71, "Basaltic shield", ["basalt", "volcanic"]),
    S("etna", "Etna", "Italy", 37.75, 14.99, "Basaltic volcano", ["basalt", "volcanic"]),
    S("vulcano", "Vulcano", "Italy", 38.40, 14.96, "Volcanic island", ["volcanic", "sulfate"]),
    S("campiflegrei", "Campi Flegrei", "Italy", 40.83, 14.14, "Caldera", ["volcanic", "regolith"]),
    S("askja", "Askja", "Iceland", 65.03, -16.75, "Volcanic / glacial", ["basalt", "ice", "volcanic"]),
    S("krafla", "Krafla", "Iceland", 65.70, -16.80, "Volcanic fissure", ["basalt", "volcanic"]),
    S("mutnovsky", "Mutnovsky", "Russia", 52.45, 158.20, "Volcanic / glacial", ["volcanic", "ice"]),
    S("karymsky", "Karymsky", "Russia", 54.05, 159.45, "Active volcano", ["volcanic", "regolith"]),
    S("sakurajima", "Sakurajima", "Japan", 31.58, 130.66, "Active volcano", ["volcanic", "regolith"]),
    S("aso", "Aso", "Japan", 32.88, 131.10, "Caldera", ["volcanic", "regolith"]),
    S("taal", "Taal", "Philippines", 14.00, 120.99, "Caldera lake", ["volcanic", "water"]),
    S("mayon", "Mayon", "Philippines", 13.25, 123.69, "Active volcano", ["volcanic", "regolith"]),
    S("krakatoa", "Krakatoa", "Indonesia", -6.10, 105.42, "Caldera", ["volcanic", "regolith"]),
    S("tambora", "Tambora", "Indonesia", -8.25, 118.00, "Caldera", ["volcanic", "regolith"]),
    S("rinjani", "Rinjani", "Indonesia", -8.42, 116.47, "Caldera", ["volcanic", "regolith"]),
    S("ambrym", "Ambrym", "Vanuatu", -16.25, 168.12, "Basaltic caldera", ["basalt", "volcanic"]),

    # Caves, karst, mines and subsurface
    S("lavabeds", "Lava Beds", "USA", 41.75, -121.50, "Lava tube field", ["basalt", "lava tube", "cave"]),
    S("galapagoslava", "Galápagos Lava Tubes", "Ecuador", -0.63, -90.37, "Lava tube field", ["basalt", "lava tube", "cave"]),
    S("surtshellir", "Surtshellir", "Iceland", 64.78, -19.95, "Lava tube", ["basalt", "lava tube", "cave"]),
    S("carlsbad", "Carlsbad Caverns", "USA", 32.17, -104.44, "Karst cave", ["limestone", "karst", "cave"]),
    S("mammoth", "Mammoth Cave", "USA", 37.19, -86.10, "Karst cave", ["limestone", "karst", "cave"]),
    S("postojna", "Postojna Cave", "Slovenia", 45.78, 14.20, "Karst cave", ["limestone", "karst", "cave"]),
    S("phongnha", "Phong Nha", "Vietnam", 17.53, 106.12, "Karst cave", ["limestone", "karst", "cave"]),
    S("mulu", "Gunung Mulu", "Malaysia", 4.05, 114.88, "Karst cave", ["limestone", "karst", "cave"]),
    S("waitomo", "Waitomo", "New Zealand", -38.26, 175.10, "Karst cave", ["limestone", "karst", "cave"]),
    S("sudbury", "Sudbury Structure", "Canada", 46.60, -81.18, "Impact structure / mine", ["impact", "mine", "subsurface"]),
    S("kola", "Kola Superdeep", "Russia", 69.40, 30.60, "Deep borehole", ["mine", "subsurface"]),
    S("kiruna", "Kiruna", "Sweden", 67.85, 20.23, "Iron mine", ["mine", "subsurface"]),
    S("bingham", "Bingham Canyon", "USA", 40.52, -112.15, "Open-pit mine", ["mine", "subsurface"]),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def sanitize(value):
    """Replace non-finite floats with null so the JSON is valid for browsers."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value


def tile_url(lat, lon):
    la, lo = math.floor(lat), math.floor(lon)
    ns = "N" if la >= 0 else "S"
    ew = "E" if lo >= 0 else "W"
    name = f"{ns}{abs(la):02d}_00_{ew}{abs(lo):03d}_00"
    return f"{DEM_BASE}/Copernicus_DSM_COG_30_{name}_DEM/Copernicus_DSM_COG_30_{name}_DEM.tif"


def load_controls():
    return json.loads(ODYSSEY.read_text())["sites"]


def load_airports():
    cache = CACHE / "airports.json"
    if cache.exists():
        return json.loads(cache.read_text())
    print("Downloading OurAirports ...")
    r = requests.get(AIRPORTS_URL, timeout=60)
    r.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(r.text)))
    keep = []
    for row in rows:
        if row.get("type") not in ("large_airport", "medium_airport"):
            continue
        if row.get("scheduled_service") != "yes":
            continue
        try:
            keep.append(dict(
                name=row["name"], iata=row.get("iata_code") or "", country=row.get("iso_country") or "",
                lat=float(row["latitude_deg"]), lon=float(row["longitude_deg"]),
            ))
        except (TypeError, ValueError):
            continue
    cache.write_text(json.dumps(keep))
    print(f"  {len(keep)} scheduled large/medium airports")
    return keep


def nearest_airport(airports, lat, lon):
    if not airports:
        return None
    best = min(airports, key=lambda a: haversine(lat, lon, a["lat"], a["lon"]))
    km = haversine(lat, lon, best["lat"], best["lon"])
    return {**best, "km": round(km, 1)}


def fetch_power(lat, lon):
    params = dict(parameters=POWER_PARAMS, community="RE", longitude=lon, latitude=lat,
                  format="JSON", start="2001", end="2020")
    last = None
    for attempt in range(4):
        try:
            r = requests.get(POWER_URL, params=params, timeout=60)
            r.raise_for_status()
            p = r.json()["properties"]["parameter"]
            out = {}
            for key in POWER_PARAMS.split(","):
                vals = []
                for month in MONTHS:
                    raw = p.get(key, {}).get(month)
                    try:
                        v = float(raw)
                    except (TypeError, ValueError):
                        v = None
                    if v is not None and v <= -900:
                        v = None
                    vals.append(v)
                out[key] = vals
            if all(v is None for v in out["T2M"]):
                raise ValueError("no T2M values")
            return out
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 + attempt * 1.5)
    print(f"  POWER failed {lat},{lon}: {last}")
    return None


def fetch_macrostrat(lat, lon):
    for attempt in range(3):
        try:
            r = requests.get(MACROSTRAT_URL, params={"lat": lat, "lng": lon}, timeout=30)
            r.raise_for_status()
            data = r.json().get("success", {}).get("data", [])
            if not data:
                return None
            unit = next((u for u in data if u.get("lith")), data[0])
            lith = unit.get("lith", "") or ""
            return {
                "lith": lith,
                "age": unit.get("best_int_name", "") or "",
                "unit": unit.get("name", "") or "",
                "tags": lith_tags(lith),
                "source": "Macrostrat CC-BY 4.0",
            }
        except Exception:  # noqa: BLE001
            if attempt == 2:
                return None
            time.sleep(1.2)
    return None


LITH_TAGS = {
    "basalt": "basalt", "mafic": "basalt", "volcanic": "volcanic",
    "evaporite": "evaporite", "salt": "evaporite", "gypsum": "evaporite",
    "limestone": "limestone", "carbonate": "limestone", "dolomite": "limestone",
    "sandstone": "sand", "sand": "sand", "shale": "clay", "mudstone": "clay",
    "clay": "clay", "iron": "iron", "sulfate": "sulfate", "glacial": "glacier",
    "till": "glacier", "ice": "ice", "alluvium": "regolith", "colluvium": "regolith",
    "granite": "granite", "gneiss": "granite", "schist": "granite",
    "rhyolite": "volcanic", "andesite": "volcanic", "tuff": "volcanic",
    "chert": "sedimentary", "coal": "sedimentary", "phosphorite": "sedimentary",
}


def lith_tags(lith):
    l = (lith or "").lower()
    return sorted({v for k, v in LITH_TAGS.items() if k in l})


def fetch_dem(lat, lon):
    url = tile_url(lat, lon)
    dem = None
    last = None
    for attempt in range(3):
        try:
            with rasterio.Env(GDAL_HTTP_TIMEOUT="60", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
                with rasterio.open(url) as src:
                    row, col = src.index(lon, lat)
                    half = 60
                    row0, row1 = max(0, row - half), min(src.height, row + half)
                    col0, col1 = max(0, col - half), min(src.width, col + half)
                    if row1 - row0 < 20 or col1 - col0 < 20:
                        return None
                    dem = src.read(1, window=Window(col0, row0, col1 - col0, row1 - row0)).astype(float)
                    nodata = src.nodata
                    if nodata is not None:
                        dem[dem == nodata] = np.nan
                    dem[dem < -1000] = np.nan
            break
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 + attempt)
    if dem is None:
        print(f"  DEM failed {lat},{lon}: {last}")
        return None

    valid = np.isfinite(dem)
    if valid.mean() < 0.55:
        return None
    fill = float(np.nanmedian(dem))
    filled = np.where(valid, dem, fill)
    dy_m = 90.0
    dx_m = 90.0 * max(0.2, math.cos(math.radians(lat)))
    gy, gx = np.gradient(filled, dy_m, dx_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    rough = filled - gaussian_filter(filled, sigma=2.0)
    center = float(dem[dem.shape[0] // 2, dem.shape[1] // 2])
    if not np.isfinite(center):
        center = float(np.nanmedian(dem))
    return {
        "elevation": round(center, 1),
        "relief": round(float(np.nanpercentile(dem, 95) - np.nanpercentile(dem, 5)), 1),
        "slopeMean": round(float(np.nanmean(slope)), 2),
        "slopeP95": round(float(np.nanpercentile(slope, 95)), 2),
        "slopeMax": round(float(np.nanmax(slope)), 2),
        "roughness": round(float(np.nanstd(rough)), 2),
        "validFraction": round(float(valid.mean()), 3),
    }


def annualize(power):
    def clean(vals):
        return [v for v in vals if v is not None]

    t = power["T2M"]
    tmax = power["T2M_MAX"]
    tmin = power["T2M_MIN"]
    temp_mean = float(np.mean(clean(t)))
    temp_max = float(np.max(clean(tmax)))
    temp_min = float(np.min(clean(tmin)))
    amp = [a - b for a, b in zip(tmax, tmin) if a is not None and b is not None]
    seasonal = max(clean(t)) - min(clean(t))
    precip = sum((v or 0) * d for v, d in zip(power["PRECTOTCORR"], DAYS))
    return {
        "tempMean": round(temp_mean, 1),
        "tempMax": round(temp_max, 1),
        "tempMin": round(temp_min, 1),
        "tempAmp": round(float(np.mean(amp)), 1),
        "seasonalAmp": round(seasonal, 1),
        "precipYear": round(precip, 1),
        "humidity": round(float(np.mean(clean(power["RH2M"]))), 1),
        "wind": round(float(np.mean(clean(power["WS2M"]))), 2),
        "solar": round(float(np.mean(clean(power["ALLSKY_SFC_SW_DWN"]))), 2),
        "aerosol": round(float(np.mean(clean(power["AOD_55"]))), 3),
        "soilWetnessTop": round(float(np.mean(clean(power["GWETTOP"]))), 3),
        "soilWetnessRoot": round(
            float(np.mean(clean(power["GWETROOT"])))
            if clean(power["GWETROOT"])
            else float(np.mean(clean(power["GWETTOP"]))),
            3,
        ),
        "pressure": round(float(np.mean(clean(power["PS"]))), 1),
    }


def fetch_candidate(seed, controls, airports):
    sid = seed["id"]
    cache_path = CACHE / f"{sid}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    power = fetch_power(seed["lat"], seed["lon"])
    if not power:
        return None
    climate = annualize(power)
    geology = fetch_macrostrat(seed["lat"], seed["lon"])
    dem = fetch_dem(seed["lat"], seed["lon"])
    airport = nearest_airport(airports, seed["lat"], seed["lon"])
    nearest = min(controls, key=lambda c: haversine(seed["lat"], seed["lon"], c["lat"], c["lon"]))
    novelty = haversine(seed["lat"], seed["lon"], nearest["lat"], nearest["lon"])

    tags = list(seed["tags"])
    if geology:
        tags = sorted(set(tags) | set(geology["tags"]))

    payload = {
        **seed,
        "tags": tags,
        "summary": (
            f"{seed['type']} candidate in {seed['country']}. "
            "Screened from NASA POWER climatology, Copernicus DEM and Macrostrat geology. "
            "Mineralogy, vegetation, water/ice, subsurface and geotechnical evidence remain missing."
        ),
        "climate": climate,
        "monthly": {
            "temp": [None if v is None else round(v, 1) for v in power["T2M"]],
            "precip": [None if v is None else round(v, 2) for v in power["PRECTOTCORR"]],
            "humidity": [None if v is None else round(v, 1) for v in power["RH2M"]],
            "wind": [None if v is None else round(v, 2) for v in power["WS2M"]],
            "aerosol": [None if v is None else round(v, 3) for v in power["AOD_55"]],
            "solar": [None if v is None else round(v, 2) for v in power["ALLSKY_SFC_SW_DWN"]],
        },
        "terrain": dem,
        "geology": geology,
        "airport": airport,
        "access": None if airport is None else round(math.exp(-airport["km"] / 350.0), 3),
        "noveltyKm": round(novelty, 1),
        "nearestControl": {"id": nearest["id"], "name": nearest["name"], "km": round(novelty, 1)},
        "missing": [
            "catalog / literature novelty review",
            "land surface temperature (MODIS/VIIRS LST)",
            "mineralogy species (requires EMIT/ASTER refinement)",
            "vegetation / land cover",
            "water / ice state",
            "subsurface structure",
            "geotechnical properties",
            "field validation",
        ],
        "evidence": {
            "climate": {
                "source": "NASA POWER / MERRA-2 climatology 2001-2020",
                "resolution": "0.5° x 0.625° reanalysis grid, point sample",
                "class": "reanalysis",
                "uncertainty": "Monthly normals; suppresses daily extremes; not a forecast.",
            },
            "terrain": {
                "source": "Copernicus DEM GLO-90 (TanDEM-X 2011-2015)",
                "resolution": "90 m DSM",
                "class": "derived",
                "uncertainty": "DSM includes vegetation/buildings; <4 m LE90 absolute; slope at 90 m baseline.",
            },
            "geology": {
                "source": "Macrostrat CC-BY 4.0",
                "resolution": "mapped vector unit",
                "class": "mapped",
                "uncertainty": "Regional unit, not an outcrop or assay.",
            },
            "access": {
                "source": "OurAirports scheduled large/medium airports",
                "resolution": "point distance",
                "class": "derived",
                "uncertainty": "Straight-line distance to nearest scheduled airport; no road or permit model.",
            },
        },
    }
    cache_path.write_text(json.dumps(payload))
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--only", help="comma-separated ids")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    controls = load_controls()
    airports = load_airports()

    seeds = SEEDS
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        seeds = [s for s in seeds if s["id"] in wanted]

    # Keep candidates genuinely outside the curated control set.
    filtered = []
    for s in seeds:
        km = min(haversine(s["lat"], s["lon"], c["lat"], c["lon"]) for c in controls)
        if km < 80:
            print(f"  skip {s['id']}: {km:.0f} km from a control")
            continue
        filtered.append(s)
    seeds = filtered
    if args.limit:
        seeds = seeds[: args.limit]

    print(f"Fetching {len(seeds)} discovery candidates")
    results = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(fetch_candidate, s, controls, airports): s for s in seeds}
        for i, fut in enumerate(as_completed(futures), 1):
            seed = futures[fut]
            try:
                payload = fut.result()
            except Exception as exc:  # noqa: BLE001
                print(f"[{i:03d}/{len(seeds)}] {seed['id']} ERROR {exc}")
                continue
            if payload:
                results.append(payload)
                print(f"[{i:03d}/{len(seeds)}] {seed['id']:16s} ok")
            else:
                print(f"[{i:03d}/{len(seeds)}] {seed['id']:16s} skipped")

    results.sort(key=lambda c: c["id"])
    payload = sanitize({
        "generatedAt": time.strftime("%Y-%m-%d"),
        "source": (
            "NASA POWER / MERRA-2 climatology 2001-2020; Copernicus DEM GLO-90; "
            "Macrostrat CC-BY 4.0; OurAirports."
        ),
        "note": (
            "Screening-tier candidates outside the 39 curated ODYSSEY controls. "
            "Mineralogy, vegetation, water/ice, subsurface and geotechnical evidence are missing "
            "and must be refined before a site is promoted to a mission plan."
        ),
        "count": len(results),
        "candidates": results,
    })
    OUT.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print(f"\nWrote {OUT} ({len(results)} candidates)")


if __name__ == "__main__":
    main()
