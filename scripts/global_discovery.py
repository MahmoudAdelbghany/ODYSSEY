#!/usr/bin/env python3
"""Global algorithmic candidate discovery for ODYSSEY.

This pipeline is independent of the 39 curated sites and the 107 manual
discovery seeds. It generates H3 cells over global land, samples WorldClim 2.1
10-minute climate/elevation, applies transparent profile rules, clusters
adjacent surviving cells into compact regions, and compares those regions with
the existing catalogue.

Output: src/data/globalDiscovery.json

Data (not checked in):
  /tmp/opencode/global-data/wc2.1_10m_bio_{1,5,6,12,15}.tif
  /tmp/opencode/global-data/wc2.1_10m_elev.tif
  /tmp/opencode/global-data/ne_land.geojson
  /tmp/opencode/discovery-cache/airports.json

Requires: h3, shapely, rasterio, numpy, scipy.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import h3
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from scipy.spatial import cKDTree
from shapely.geometry import Polygon, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "globalDiscovery.json"
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
DISCOVERY = ROOT / "src" / "data" / "discovery.json"
AIRPORTS = Path(os.environ.get("ODYSSEY_AIRPORTS", "/tmp/opencode/discovery-cache/airports.json"))
DATA = Path(os.environ.get("ODYSSEY_GLOBAL_DATA", "/tmp/opencode/global-data"))
CACHE = Path(os.environ.get("ODYSSEY_GLOBAL_CACHE", DATA / "cell_cache_m8_v1.json"))

H3_RES = 4
DEDUP_KM = 80.0
MIN_REGION_CELLS = 2
MAX_REGIONS = 80
VERSION = "m8-v1.2"
EARTH_R = 6371.0

# Shared descriptive and category thresholds. The same numbers are used by the
# generated label and the category bucket so they cannot disagree.
POLAR_LAT = 60.0
HYPER_ARID_MM = 150.0
ARID_MM = 300.0
SEMI_ARID_MM = 500.0
HIGH_RELIEF_M = 500.0
MODERATE_RELIEF_M = 200.0
REMOTE_KM = 500.0

# WorldClim 2.1 10 arc-minute rasters.
BIO1 = DATA / "wc2.1_10m_bio_1.tif"
BIO5 = DATA / "wc2.1_10m_bio_5.tif"
BIO6 = DATA / "wc2.1_10m_bio_6.tif"
BIO12 = DATA / "wc2.1_10m_bio_12.tif"
BIO15 = DATA / "wc2.1_10m_bio_15.tif"
ELEV = DATA / "wc2.1_10m_elev.tif"
LAND = DATA / "ne_land.geojson"

FEATURE_KEYS = [
    "tempMeanC",
    "tempMaxC",
    "tempMinC",
    "precipYearMm",
    "precipSeasonality",
    "elevationM",
    "reliefM",
    "slopeDeg",
    "absLat",
    "accessKm",
]

PROFILES = {
    "lunar_base": {
        "label": "Lunar base",
        "weights": {"thermal": 30, "aridity": 25, "terrain": 25, "polar": 20},
        "threshold": 58,
        "polar_min": 55,
        "terrain_min": 0.35,
    },
    "lunar_expedition": {
        "label": "Lunar expedition",
        "weights": {"thermal": 20, "aridity": 20, "terrain": 35, "access": 15, "polar": 10},
        "threshold": 58,
        "polar_min": None,
        "terrain_min": 0.50,
    },
    "mars_landing": {
        "label": "Mars landing",
        "weights": {"thermal": 25, "aridity": 25, "terrain": 30, "seasonality": 10, "access": 10},
        "threshold": 58,
        "polar_min": None,
        "terrain_min": 0.35,
    },
}


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def lower(value: float, target: float, tolerance: float) -> float:
    """1 at or below target, falling linearly to 0 at target + tolerance."""
    return 1.0 if value <= target else clamp(1 - (value - target) / tolerance)


def higher(value: float, target: float, tolerance: float) -> float:
    """1 at or above target, falling linearly to 0 at target - tolerance."""
    return 1.0 if value >= target else clamp(1 - (target - value) / tolerance)


def band(value: float, lo: float, hi: float, soft: float) -> float:
    """1 inside [lo, hi], falling linearly outside by soft."""
    if lo <= value <= hi:
        return 1.0
    if value < lo:
        return clamp(1 - (lo - value) / soft)
    return clamp(1 - (value - hi) / soft)


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def generate_global_cells(res: int = H3_RES) -> set[str]:
    """Deterministic full H3 grid. No catalogue coordinate is read here."""
    cells: set[str] = set()
    for base in h3.get_res0_cells():
        cells.update(h3.cell_to_children(base, res))
    return cells


def cell_row_col(lat: float, lon: float, width: int, height: int) -> tuple[int, int]:
    col = min(max(int((lon + 180) / 360 * width), 0), width - 1)
    row = min(max(int((90 - lat) / 180 * height), 0), height - 1)
    return row, col


def is_land(mask: np.ndarray, lat: float, lon: float) -> bool:
    height, width = mask.shape
    row, col = cell_row_col(lat, lon, width, height)
    return bool(mask[row, col])


def build_land_mask(width: int, height: int, geojson_path: Path = LAND) -> np.ndarray:
    """Rasterize Natural Earth land polygons onto the WorldClim grid."""
    ne = json.loads(geojson_path.read_text())
    geoms = [shape(f["geometry"]) for f in ne["features"]]
    return rasterize(
        ((g, 1) for g in geoms),
        out_shape=(height, width),
        transform=from_bounds(-180, -90, 180, 90, width, height),
        fill=0,
        dtype="uint8",
    )


def read_raster(path: Path) -> tuple[np.ndarray, int, int]:
    with rasterio.open(path) as src:
        arr = src.read(1).astype(float)
        if src.nodata is not None:
            arr[arr == src.nodata] = np.nan
        return arr, src.width, src.height


def sample(arr: np.ndarray, row: int, col: int) -> float | None:
    if row < 0 or col < 0 or row >= arr.shape[0] or col >= arr.shape[1]:
        return None
    value = arr[row, col]
    return None if not np.isfinite(value) else float(value)


def sample_window(arr: np.ndarray, row: int, col: int, half: int = 2) -> np.ndarray:
    r0, r1 = max(0, row - half), min(arr.shape[0], row + half + 1)
    c0, c1 = max(0, col - half), min(arr.shape[1], col + half + 1)
    return arr[r0:r1, c0:c1]


def profile_dimensions(
    lat: float,
    temp_c: float,
    precip_mm: float,
    relief_m: float | None,
    slope_deg: float | None,
    seasonality: float | None,
    access: float | None,
) -> dict[str, float | None]:
    """Transparent per-dimension scores in [0, 1]. Missing stays None."""
    thermal_lunar = lower(temp_c, -10, 25)
    thermal_mars = lower(temp_c, 5, 20)
    aridity = lower(precip_mm, 150, 450)
    if relief_m is None or slope_deg is None:
        terrain = None
    else:
        relief_score = clamp(relief_m / 200.0)
        slope_score = band(slope_deg, 1, 30, 5)
        terrain = 0.65 * relief_score + 0.35 * slope_score
    polar = higher(abs(lat), 55, 25)
    seasonal = None if seasonality is None else higher(seasonality, 20, 35)
    return {
        "thermal_lunar": thermal_lunar,
        "thermal_mars": thermal_mars,
        "aridity": aridity,
        "terrain": terrain,
        "polar": polar,
        "seasonality": seasonal,
        "access": access,
    }


def evaluate_profiles(
    lat: float,
    dimensions: dict[str, float | None],
    profiles: dict = PROFILES,
) -> dict:
    """Apply profile weights. Missing dimensions reduce coverage, never imputed."""
    out: dict[str, dict] = {}
    for key, profile in profiles.items():
        if isinstance(profile, dict) and "weights" not in profile:
            # Tolerate legacy/profile payloads that include an explicit threshold.
            continue
        if profile.get("polar_min") is not None and abs(lat) < profile["polar_min"]:
            continue
        terrain = dimensions["terrain"]
        if terrain is not None and terrain < profile["terrain_min"]:
            continue
        weights = profile["weights"]
        valid = {
            "thermal": dimensions["thermal_lunar"] if key.startswith("lunar") else dimensions["thermal_mars"],
            "aridity": dimensions["aridity"],
            "terrain": dimensions["terrain"],
            "polar": dimensions["polar"],
            "seasonality": dimensions["seasonality"],
            "access": dimensions["access"],
        }
        total_weight = sum(weights.values())
        used = sum(weight for dim, weight in weights.items() if valid.get(dim) is not None)
        if used == 0:
            continue
        score = sum(
            weight * valid[dim] for dim, weight in weights.items() if valid.get(dim) is not None
        ) / used
        out[key] = {
            "score": round(score * 100, 1),
            "coverage": round(used / total_weight, 2),
            "dimensions": {
                dim: (None if valid.get(dim) is None else round(valid[dim] * 100, 1))
                for dim in weights
            },
        }
    return out


def cluster_candidates(
    candidates: list[dict],
    min_cells: int = MIN_REGION_CELLS,
    coherence: float = 15.0,
    rings: int = 2,
) -> list[list[dict]]:
    """Seed-and-grow compact regions, highest score first.

    A region starts at an unassigned high-scoring cell and grows up to `rings`
    H3 steps through adjacent candidate cells whose score is within
    `coherence` points of the seed. This avoids continent-scale connected
    components while keeping coherent landscapes together.
    """
    cell_map = {c["cell"]: c for c in candidates}
    assigned: set[str] = set()
    clusters: list[list[dict]] = []
    ordered = sorted(candidates, key=lambda c: (-c["bestScore"], c["cell"]))
    for seed in ordered:
        if seed["cell"] in assigned:
            continue
        group = [seed]
        assigned.add(seed["cell"])
        queue = deque([(seed["cell"], 0)])
        while queue:
            current, depth = queue.popleft()
            if depth >= rings:
                continue
            for neighbor in h3.grid_disk(current, 1):
                if neighbor in assigned or neighbor not in cell_map:
                    continue
                if cell_map[neighbor]["bestScore"] < seed["bestScore"] - coherence:
                    continue
                assigned.add(neighbor)
                group.append(cell_map[neighbor])
                queue.append((neighbor, depth + 1))
        if len(group) >= min_cells:
            clusters.append(group)
    return clusters


def aggregate_features(group: list[dict], keys: list[str] = FEATURE_KEYS) -> dict:
    """Mean/min/max/count per feature. Values are never imputed."""
    features: dict[str, dict] = {}
    for key in keys:
        values = [c["features"][key] for c in group if c["features"].get(key) is not None]
        features[key] = {
            "mean": round(float(np.mean(values)), 2) if values else None,
            "min": round(float(np.min(values)), 2) if values else None,
            "max": round(float(np.max(values)), 2) if values else None,
            "n": len(values),
        }
    return features


def aggregate_profiles(group: list[dict], profiles: dict = PROFILES) -> dict:
    """Region-level profile score and per-dimension means, with coverage."""
    out: dict[str, dict] = {}
    for key, profile in profiles.items():
        if not isinstance(profile, dict) or "weights" not in profile:
            continue
        scores = [c["profiles"][key]["score"] for c in group if key in c["profiles"]]
        coverages = [c["profiles"][key]["coverage"] for c in group if key in c["profiles"]]
        if not scores:
            continue
        dimensions = {}
        for dim in profile["weights"]:
            values = [
                c["profiles"][key]["dimensions"][dim]
                for c in group
                if key in c["profiles"] and c["profiles"][key]["dimensions"].get(dim) is not None
            ]
            dimensions[dim] = round(float(np.mean(values)), 1) if values else None
        out[key] = {
            "max": max(scores),
            "mean": round(float(np.mean(scores)), 1),
            "coverageMean": round(float(np.mean(coverages)), 2),
            "cells": len(scores),
            "dimensions": dimensions,
        }
    return out


def region_geometry(group: list[dict]) -> tuple[dict | None, float, list[dict]]:
    """Union footprint, approximate area, and per-cell geometry for inspection."""
    polygons = []
    cell_geometry = []
    for cell in group:
        boundary = [[round(lon, 5), round(lat, 5)] for lat, lon in h3.cell_to_boundary(cell["cell"])]
        polygons.append(Polygon(boundary))
        cell_geometry.append(
            {
                "cell": cell["cell"],
                "center": [round(cell["lon"], 5), round(cell["lat"], 5)],
                "boundary": boundary,
            }
        )
    try:
        geom = unary_union(polygons)
        footprint = mapping(geom)
        area = round(len(group) * h3.average_hexagon_area(H3_RES, unit="km^2"), 1)
    except Exception:
        footprint = None
        area = round(len(group) * h3.average_hexagon_area(H3_RES, unit="km^2"), 1)
    return footprint, area, cell_geometry


def candidate_id(cell: str) -> str:
    """Stable public candidate ID derived from the representative H3 cell."""
    return f"GD-{cell}"


def deduplicate_regions(regions: list[dict], dedup_km: float = DEDUP_KM) -> tuple[list[dict], int]:
    """Keep the highest-scoring region when two region centers are too close."""
    kept: list[dict] = []
    removed = 0
    for region in regions:
        if any(
            haversine(region["lat"], region["lon"], other["lat"], other["lon"]) < dedup_km
            for other in kept
        ):
            removed += 1
            continue
        kept.append(region)
    return kept, removed


def region_novelty(
    group: list[dict],
    existing: list[tuple[float, float, str, str]],
    dedup_km: float = DEDUP_KM,
) -> tuple[str, float, tuple[float, float, str, str]]:
    """Classify against every existing control and manual seed.

    Distance is measured from the nearest cell center in the region, not only
    from the representative cell, so a known site inside a region is preserved.
    """
    nearest = min(
        existing,
        key=lambda e: min(
            haversine(cell["lat"], cell["lon"], e[0], e[1]) for cell in group
        ),
    )
    distance = min(
        haversine(cell["lat"], cell["lon"], nearest[0], nearest[1]) for cell in group
    )
    if distance < 10.0:
        classification = "existing"
    elif distance < dedup_km:
        classification = "nearby"
    else:
        classification = "new"
    return classification, round(distance, 1), nearest


def category_of(region: dict) -> str:
    """Single bucket used only for balanced output selection."""
    features = region["features"]
    lat = features["absLat"]["mean"]
    precip = features["precipYearMm"]["mean"]
    relief = features["reliefM"]["mean"]
    access = features["accessKm"]["mean"]
    if lat is not None and lat >= POLAR_LAT:
        return "polar"
    if precip is not None and precip <= HYPER_ARID_MM:
        return "hyper_arid"
    if relief is not None and relief >= HIGH_RELIEF_M:
        return "high_relief"
    if access is not None and access >= REMOTE_KM:
        return "remote"
    if relief is not None and relief >= MODERATE_RELIEF_M:
        return "moderate_relief"
    return "other"


def _fmt(value: float | None, digits: int = 0) -> str:
    return "N/A" if value is None else f"{value:.{digits}f}"


def describe(features: dict) -> str:
    """Descriptive label from region-level means, never an official place name."""
    lat = features["absLat"]["mean"]
    temp = features["tempMeanC"]["mean"]
    precip = features["precipYearMm"]["mean"]
    relief = features["reliefM"]["mean"]
    if lat is None:
        thermal = "unlocated"
    elif lat >= POLAR_LAT:
        thermal = "polar"
    elif temp is None:
        thermal = "unclassified-thermal"
    elif temp <= 0:
        thermal = "cold"
    elif temp <= 12:
        thermal = "cool"
    elif temp <= 24:
        thermal = "warm"
    else:
        thermal = "hot"

    if precip is None:
        moisture = "unclassified-moisture"
    elif precip <= HYPER_ARID_MM:
        moisture = "hyper-arid"
    elif precip <= ARID_MM:
        moisture = "arid"
    elif precip <= SEMI_ARID_MM:
        moisture = "semi-arid"
    else:
        moisture = "moist"

    if relief is None:
        terrain = "unknown-relief"
    elif relief >= HIGH_RELIEF_M:
        terrain = "high-relief"
    elif relief >= MODERATE_RELIEF_M:
        terrain = "moderate-relief"
    else:
        terrain = "low-relief"

    return f"{thermal} {moisture} {terrain} region"


def select_regions(regions: list[dict], max_regions: int = MAX_REGIONS) -> list[dict]:
    """Guarantee novelty-class and category representation, then fill by score."""
    selected: list[dict] = []
    selected_ids: set[str] = set()
    category_order = ("polar", "hyper_arid", "high_relief", "remote", "moderate_relief", "other")

    def take(region: dict) -> None:
        if region["id"] in selected_ids or len(selected) >= max_regions:
            return
        selected.append(region)
        selected_ids.add(region["id"])

    for classification in ("existing", "nearby"):
        for region in regions:
            if region["classification"] == classification:
                take(region)
                break
    for category in category_order:
        for region in [r for r in regions if r["category"] == category][:5]:
            take(region)
    # Keep one biome from consuming the whole output. The cap is derived from
    # the requested output size, not tuned to a preferred region.
    category_cap = max(5, math.ceil(max_regions / len(category_order)))
    for region in regions:
        if len(selected) >= max_regions:
            break
        if sum(1 for item in selected if item["category"] == region["category"]) >= category_cap:
            continue
        take(region)
    # If a category has fewer members than the cap (for example remote land is
    # genuinely scarce), fill the remaining slots by score rather than padding.
    for region in regions:
        if len(selected) >= max_regions:
            break
        take(region)
    selected.sort(key=lambda r: (-r["bestScore"], -r["cellCount"], r["id"]))
    return selected


def _build_access_tree(airports: list[dict]) -> cKDTree | None:
    if not airports:
        return None
    lat = np.radians([a["lat"] for a in airports])
    lon = np.radians([a["lon"] for a in airports])
    xyz = np.c_[np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)]
    return cKDTree(xyz)


def _access_km(tree: cKDTree | None, lat: float, lon: float) -> float | None:
    if tree is None:
        return None
    latr, lonr = math.radians(lat), math.radians(lon)
    query = [
        math.cos(latr) * math.cos(lonr),
        math.cos(latr) * math.sin(lonr),
        math.sin(latr),
    ]
    distance, _ = tree.query(query)
    return 2 * EARTH_R * math.asin(min(1.0, distance / 2))


def sample_cell(
    cell: str,
    rows: dict[str, np.ndarray],
    tree: cKDTree | None,
) -> dict:
    """Sample one H3 cell. Returns features plus exclusion reason if unusable."""
    lat, lon = h3.cell_to_latlng(cell)
    row, col = cell_row_col(lat, lon, rows["bio1"].shape[1], rows["bio1"].shape[0])
    temperature = sample(rows["bio1"], row, col)
    precipitation = sample(rows["bio12"], row, col)
    elevation = sample(rows["elev"], row, col)
    if temperature is None or precipitation is None or elevation is None:
        return {"cell": cell, "lat": lat, "lon": lon, "excluded": "missing_climate_or_elevation"}

    temp_c = temperature
    tmax = sample(rows["bio5"], row, col)
    tmin = sample(rows["bio6"], row, col)
    seasonality = sample(rows["bio15"], row, col)
    window = sample_window(rows["elev"], row, col, 2)
    valid = np.isfinite(window)
    if valid.sum() < 4:
        relief = None
        slope = None
    else:
        filled = np.where(valid, window, np.nanmedian(window[valid]))
        relief = float(np.max(window[valid]) - np.min(window[valid]))
        gradient_y, gradient_x = np.gradient(filled, 18550.0, 18550.0)
        slope = float(np.degrees(np.arctan(np.hypot(gradient_x, gradient_y))).mean())

    access_distance = _access_km(tree, lat, lon)
    access = None if access_distance is None else clamp(1 - math.log10(1 + access_distance) / 3.2)
    dimensions = profile_dimensions(
        lat,
        temp_c,
        precipitation,
        relief,
        slope,
        seasonality,
        access,
    )
    profile_scores = evaluate_profiles(lat, dimensions)
    best = max((value["score"] for value in profile_scores.values()), default=0.0)
    return {
        "cell": cell,
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "features": {
            "tempMeanC": round(temp_c, 1),
            "tempMaxC": None if tmax is None else round(tmax, 1),
            "tempMinC": None if tmin is None else round(tmin, 1),
            "precipYearMm": round(precipitation, 0),
            "precipSeasonality": None if seasonality is None else round(seasonality, 1),
            "elevationM": round(elevation, 0),
            "reliefM": None if relief is None else round(relief, 0),
            "slopeDeg": None if slope is None else round(slope, 2),
            "absLat": round(abs(lat), 1),
            "accessKm": None if access_distance is None else round(access_distance, 0),
        },
        "dimensions": {key: None if value is None else round(value, 4) for key, value in dimensions.items()},
        "profiles": profile_scores,
        "bestScore": best,
    }


def _load_cache(path: Path, signature: dict) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return {}
    if payload.get("signature") != signature:
        return {}
    cells = payload.get("cells")
    return cells if isinstance(cells, dict) else {}


def _write_cache(path: Path, signature: dict, cells: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"signature": signature, "writtenAt": datetime.now(timezone.utc).isoformat(), "cells": cells}
    path.write_text(json.dumps(payload, separators=(",", ":")))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="ignore the cell feature cache")
    parser.add_argument("--max-regions", type=int, default=MAX_REGIONS)
    parser.add_argument("--dedup-km", type=float, default=DEDUP_KM)
    parser.add_argument("--cache", type=Path, default=CACHE)
    args = parser.parse_args()

    print("reading rasters")
    bio1, width, height = read_raster(BIO1)
    bio5, _, _ = read_raster(BIO5)
    bio6, _, _ = read_raster(BIO6)
    bio12, _, _ = read_raster(BIO12)
    bio15, _, _ = read_raster(BIO15)
    elev, _, _ = read_raster(ELEV)
    rows = {"bio1": bio1, "bio5": bio5, "bio6": bio6, "bio12": bio12, "bio15": bio15, "elev": elev}

    print("building land mask")
    land = build_land_mask(width, height)

    airports = json.loads(AIRPORTS.read_text()) if AIRPORTS.exists() else []
    tree = _build_access_tree(airports)

    cells = generate_global_cells(H3_RES)
    print("h3 cells", len(cells))

    signature = {
        "version": VERSION,
        "h3Res": H3_RES,
        "variables": ["bio1", "bio5", "bio6", "bio12", "bio15", "elev"],
        "land": "ne_110m_land",
        "airports": "ourairports_scheduled_large_medium",
    }
    cached = {} if args.refresh else _load_cache(args.cache, signature)
    if cached:
        print("cache hits", len(cached))

    candidates: list[dict] = []
    usable_land_cells = 0
    excluded: dict[str, int] = defaultdict(int)
    computed: dict[str, dict] = dict(cached)
    land_cells: list[str] = []
    for cell in cells:
        lat, lon = h3.cell_to_latlng(cell)
        if is_land(land, lat, lon):
            land_cells.append(cell)
        else:
            excluded["water"] += 1
    print("land cells", len(land_cells))

    for index, cell in enumerate(land_cells):
        record = cached.get(cell)
        if record is None:
            record = sample_cell(cell, rows, tree)
            computed[cell] = record
        if record.get("excluded"):
            excluded[record["excluded"]] += 1
            continue
        usable_land_cells += 1
        best_score = max(
            (value["score"] for value in record["profiles"].values()), default=0.0
        )
        if best_score < 58:
            excluded["below_profile_threshold"] += 1
            continue
        candidates.append(record)
        if index % 10000 == 0:
            _write_cache(args.cache, signature, computed)

    _write_cache(args.cache, signature, computed)
    print(
        "usable land cells",
        usable_land_cells,
        "candidate cells",
        len(candidates),
        "cache",
        len(computed),
    )

    clusters = cluster_candidates(candidates)
    print("clusters", len(clusters))

    controls = json.loads(ODYSSEY.read_text())["sites"]
    seeds = json.loads(DISCOVERY.read_text())["candidates"]
    existing = [(s["lat"], s["lon"], s["id"], "control") for s in controls] + [
        (s["lat"], s["lon"], s["id"], "seed") for s in seeds
    ]

    regions = []
    for group in clusters:
        representative = max(group, key=lambda item: (item["bestScore"], item["cell"]))
        classification, novelty_km, nearest = region_novelty(group, existing, args.dedup_km)
        features = aggregate_features(group)
        profiles = aggregate_profiles(group)
        footprint, area, cell_geometry = region_geometry(group)
        label = describe(features)
        best_profile = max(profiles, key=lambda key: profiles[key]["max"]) if profiles else None
        rationale = None
        if best_profile:
            dims = [
                (key, value)
                for key, value in profiles[best_profile]["dimensions"].items()
                if value is not None
            ]
            dims.sort(key=lambda item: -item[1])
            rationale = {
                "profile": best_profile,
                "profileLabel": PROFILES[best_profile]["label"],
                "score": profiles[best_profile]["max"],
                "coverage": profiles[best_profile]["coverageMean"],
                "strongest": [
                    {"key": key, "score": value} for key, value in dims[:4]
                ],
                "observations": {
                    "tempMeanC": features["tempMeanC"]["mean"],
                    "precipYearMm": features["precipYearMm"]["mean"],
                    "reliefM": features["reliefM"]["mean"],
                    "accessKm": features["accessKm"]["mean"],
                },
            }
        observed = sum(1 for key in FEATURE_KEYS if features[key]["n"] > 0)
        regions.append(
            {
                "id": candidate_id(representative["cell"]),
                "name": label,
                "lat": representative["lat"],
                "lon": representative["lon"],
                "classification": classification,
                "noveltyKm": novelty_km,
                "nearestExisting": {
                    "id": nearest[2],
                    "kind": nearest[3],
                    "distanceKm": novelty_km,
                },
                "cellCount": len(group),
                "areaKm2": area,
                "bbox": [
                    min(point[0] for cell in cell_geometry for point in cell["boundary"]),
                    min(point[1] for cell in cell_geometry for point in cell["boundary"]),
                    max(point[0] for cell in cell_geometry for point in cell["boundary"]),
                    max(point[1] for cell in cell_geometry for point in cell["boundary"]),
                ],
                "representativeCell": representative["cell"],
                "cells": [cell["cell"] for cell in group],
                "cellGeometry": cell_geometry,
                "features": features,
                "profiles": profiles,
                "bestProfile": best_profile,
                "rationale": rationale,
                "bestScore": max((value["max"] for value in profiles.values()), default=0),
                "dataCompleteness": round(observed / len(FEATURE_KEYS), 2),
                "footprint": footprint,
                "evidence": {
                    "climate": "WorldClim 2.1 10 arc-minute bio1/bio5/bio6/bio12/bio15",
                    "terrain": "WorldClim 2.1 10 arc-minute elevation; 5x5 window relief/slope",
                    "land": "Natural Earth 1:110m land mask",
                    "access": "OurAirports scheduled large/medium airports; straight-line distance",
                },
                "missing": [
                    "humidity",
                    "wind",
                    "solar irradiance",
                    "aerosol/dust",
                    "geology",
                    "high-resolution DEM",
                    "Sentinel-2 imagery",
                    "field validation",
                ],
            }
        )

    regions.sort(key=lambda region: (-region["bestScore"], -region["cellCount"], region["id"]))
    for region in regions:
        region["category"] = category_of(region)
    deduped, duplicates = deduplicate_regions(regions, args.dedup_km)
    class_counts = defaultdict(int)
    for region in deduped:
        class_counts[region["classification"]] += 1
    print("classes after dedup", dict(sorted(class_counts.items())))
    kept = select_regions(deduped, args.max_regions)
    kept_ids = {region["id"] for region in kept}
    known_regions = [
        {
            "id": region["id"],
            "lat": region["lat"],
            "lon": region["lon"],
            "classification": region["classification"],
            "noveltyKm": region["noveltyKm"],
            "nearestExisting": region["nearestExisting"],
            "cellCount": region["cellCount"],
            "bestScore": region["bestScore"],
            "category": region["category"],
            "selected": region["id"] in kept_ids,
        }
        for region in deduped
        if region["classification"] in ("existing", "nearby")
    ]
    known_regions.sort(key=lambda region: (region["classification"] != "existing", region["noveltyKm"]))
    print("known regions audited", len(known_regions))
    print("kept regions", len(kept), "duplicates", duplicates)

    payload = {
        "version": VERSION,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "methodology": (
            "Independent H3 res-4 global land screen. No 39/107 catalogue coordinate is used to "
            "generate, sample, score or cluster cells. Catalogue distances are computed after "
            "clustering for novelty classification and preservation only. WorldClim 2.1 10-minute "
            "climate/elevation, Natural Earth 1:110m land, OurAirports access. Transparent profile "
            "rules; missing evidence masked."
        ),
        "grid": {
            "index": "H3",
            "resolution": H3_RES,
            "totalCells": len(cells),
            "landCells": len(land_cells),
            "usableLandCells": usable_land_cells,
            "averageCellAreaKm2": round(h3.average_hexagon_area(H3_RES, unit="km^2"), 1),
            "cellIdEncoding": "H3 cell string",
            "areaMethod": "cellCount * average H3 res-4 area; approximate, not a geodesic polygon area",
        },
        "datasets": {
            "worldclim": {
                "product": "WorldClim 2.1 10-minute",
                "variables": ["bio1", "bio5", "bio6", "bio12", "bio15", "elev"],
                "resolution": "10 arc-minutes (~18.5 km)",
                "period": "1970-2000",
                "source": "https://worldclim.org/data/worldclim21.html",
                "temperatureUnits": "degrees C (native raster values, verified by direct sampling)",
            },
            "land": {
                "product": "Natural Earth 1:110m land",
                "resolution": "1:110 million",
                "source": "https://www.naturalearthdata.com/",
                "exclusions": "Water cells are excluded. Polar, island and remote land cells are retained.",
            },
            "airports": {
                "product": "OurAirports scheduled large/medium airports",
                "source": "https://ourairports.com/data/",
                "distance": "straight-line spherical distance to nearest airport",
            },
        },
        "screening": {
            "dedupKm": args.dedup_km,
            "minRegionCells": MIN_REGION_CELLS,
            "maxRegions": args.max_regions,
            "profiles": PROFILES,
            "dimensionDefinitions": {
                "thermal": "mean annual temperature at or below profile target; WorldClim bio1 in degrees C",
                "aridity": "annual precipitation at or below 150 mm, soft to 600 mm",
                "terrain": "0.65 * clamp(relief / 200 m) + 0.35 * slope band (1-30 degrees)",
                "polar": "absolute latitude above 55 degrees",
                "seasonality": "precipitation seasonality (bio15)",
                "access": "log-scaled distance to nearest scheduled large/medium airport",
            },
            "missingData": "Dimensions with no value are excluded from the weighted mean and coverage; they are never imputed or treated as negative evidence.",
            "ml": "The existing 39-site ML surrogate is not used to generate, rank or label these regions.",
            "exclusions": dict(sorted(excluded.items())),
        },
        "counts": {
            "totalCells": len(cells),
            "landCells": len(land_cells),
            "usableLandCells": usable_land_cells,
            "candidateCells": len(candidates),
            "clusters": len(clusters),
            "keptRegions": len(kept),
            "spatialDuplicatesRemoved": duplicates,
            "newRegions": sum(1 for region in kept if region["classification"] == "new"),
            "nearbyRegions": sum(1 for region in kept if region["classification"] == "nearby"),
            "existingRegions": sum(1 for region in kept if region["classification"] == "existing"),
            "knownExistingAfterDedup": class_counts.get("existing", 0),
            "knownNearbyAfterDedup": class_counts.get("nearby", 0),
            "knownRegionsAudited": len(known_regions),
        },
        "knownRegions": known_regions,
        "regions": kept,
    }
    OUT.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
    print("wrote", OUT, "regions", len(kept))


if __name__ == "__main__":
    main()
