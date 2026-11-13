#!/usr/bin/env python3
"""Enrich the selected generated regions with detailed, real evidence.

For each region in src/data/generatedEnrichmentSelection.json:

  - Sentinel-2 L2A true-color window, best usable acquisition, 10 m;
  - Copernicus DEM GLO-30 heightmap, 40 m, 512 x 320, 20.48 x 12.8 km;
  - NASA POWER monthly climatology 2001-2020 at the representative point;
  - Macrostrat mapped geology at the representative point;
  - a detailed-screen comparison against the original coarse screen.

MODIS thermal is handled separately by scripts/fetch_generated_modis.py because
it is slower and uses the existing Planetary Computer sampler. Planetary
comparison statistics are handled by scripts/derive_generated_planetary_reference.py.

Outputs:
  public/generated/close/<region-id>.jpg
  public/generated/terrain/<region-id>.bin
  src/data/generatedEnrichment.json

The original src/data/globalDiscovery.json is never modified.

Requires: rasterio, pyproj, numpy, scipy, Pillow, requests.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
os.environ.setdefault("GDAL_HTTP_CONNECTTIMEOUT", "10")
os.environ.setdefault("CPL_VSIL_CURL_TIMEOUT", "30")

import numpy as np
import requests
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_site_imagery as fsi  # noqa: E402
import fetch_site_terrain as fst  # noqa: E402
from fetch_site_monthly import fetch as fetch_power  # noqa: E402
from global_discovery import (  # noqa: E402
    PROFILES,
    clamp,
    evaluate_profiles,
    haversine,
    profile_dimensions,
)

SELECTION = ROOT / "src" / "data" / "generatedEnrichmentSelection.json"
GLOBAL = ROOT / "src" / "data" / "globalDiscovery.json"
OUT = ROOT / "src" / "data" / "generatedEnrichment.json"
IMAGERY_DIR = ROOT / "public" / "generated" / "close"
TERRAIN_DIR = ROOT / "public" / "generated" / "terrain"
CACHE = Path("/tmp/opencode/generated-enrichment-cache/m9-v1")
CACHE.mkdir(parents=True, exist_ok=True)

VERSION = "m9-enrichment-v1"
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MACROSTRAT_URL = "https://macrostrat.org/api/geologic_units/map"
AIRPORTS = Path(os.environ.get("ODYSSEY_AIRPORTS", "/tmp/opencode/discovery-cache/airports.json"))

IMAGERY_SOURCE = (
    "Sentinel-2 Level-2A B04/B03/B02 surface reflectance, ESA Copernicus, via "
    "the AWS Open Data registry and Element 84 Earth Search"
)
IMAGERY_LICENSE = (
    "Copernicus Sentinel Data Terms and Conditions. Free and open; contains "
    "modified Copernicus Sentinel data. Attribution required."
)
TERRAIN_LICENSE = (
    "Copernicus DEM © DLR e.V. 2010-2014 / ESA 2021. Free and open with "
    "attribution."
)
POWER_LICENSE = "NASA POWER / MERRA-2, open data, attribution requested."
MACROSTRAT_LICENSE = "Macrostrat, CC-BY 4.0, attribution required."


def valid(values):
    return [float(v) for v in values if v is not None and np.isfinite(float(v))]


def mean(values):
    values = valid(values)
    return round(float(np.mean(values)), 2) if values else None


def annual_power(series: dict) -> dict:
    temp = series["T2M"]
    precip = series["PRECTOTCORR"]
    annual_precip = sum(
        value * DAYS[index]
        for index, value in enumerate(precip)
        if value is not None
    )
    precip_values = valid(precip)
    precip_mean = float(np.mean(precip_values)) if precip_values else 0.0
    precip_cv = (
        100.0 * float(np.std(precip_values)) / precip_mean
        if precip_mean > 0 and precip_values
        else None
    )
    return {
        "tempMeanC": mean(temp),
        "tempMaxC": mean(series["T2M_MAX"]),
        "tempMinC": mean(series["T2M_MIN"]),
        "tempMonthlyMaxC": max(valid(series["T2M_MAX"])) if valid(series["T2M_MAX"]) else None,
        "tempMonthlyMinC": min(valid(series["T2M_MIN"])) if valid(series["T2M_MIN"]) else None,
        "precipDayMm": mean(precip),
        "precipYearMm": round(annual_precip, 1) if annual_precip else None,
        "precipSeasonalityCv": round(precip_cv, 1) if precip_cv is not None else None,
        "humidityPct": mean(series["RH2M"]),
        "windMs": mean(series["WS2M"]),
        "solarKwhM2Day": mean(series["ALLSKY_SFC_SW_DWN"]),
        "aerosolAod550": mean(series["AOD_55"]),
        "soilWetnessTop": mean(series["GWETTOP"]),
        "soilWetnessRoot": mean(series["GWETROOT"]),
        "pressureKpa": mean(series["PS"]),
    }


def nearest_airport(lat: float, lon: float) -> dict | None:
    if not AIRPORTS.exists():
        return None
    airports = json.loads(AIRPORTS.read_text())
    if not airports:
        return None
    best = min(
        airports,
        key=lambda airport: haversine(lat, lon, float(airport["lat"]), float(airport["lon"])),
    )
    return {
        "name": best.get("name", ""),
        "iata": best.get("iata", ""),
        "country": best.get("country", ""),
        "lat": best["lat"],
        "lon": best["lon"],
        "distanceKm": round(haversine(lat, lon, float(best["lat"]), float(best["lon"])), 1),
        "method": "straight-line distance; no roads, permits or seasonal access",
        "source": "OurAirports scheduled large/medium airports",
    }


def geology_tags(lith: str, name: str) -> list[str]:
    tags = []
    text = f"{lith} {name}".lower()
    for needle, tag in (
        ("basalt", "basalt"),
        ("volcan", "volcanic"),
        ("evapor", "evaporite"),
        ("salt", "evaporite"),
        ("gypsum", "evaporite"),
        ("limestone", "limestone"),
        ("carbonate", "limestone"),
        ("sandstone", "sand"),
        ("sand", "sand"),
        ("shale", "clay"),
        ("mudstone", "clay"),
        ("clay", "clay"),
        ("iron", "iron"),
        ("sulfate", "sulfate"),
        ("glacial", "glacier"),
        ("till", "glacier"),
        ("ice", "ice"),
        ("alluvium", "regolith"),
        ("colluvium", "regolith"),
        ("granite", "granite"),
        ("gneiss", "granite"),
        ("schist", "granite"),
        ("rhyolite", "volcanic"),
        ("andesite", "volcanic"),
        ("tuff", "volcanic"),
        ("sedimentary", "sedimentary"),
        ("metamorphic", "metamorphic"),
        ("intrusive", "intrusive"),
    ):
        if needle in text and tag not in tags:
            tags.append(tag)
    return tags


def fetch_macrostrat(lat: float, lon: float) -> dict | None:
    for attempt in range(3):
        try:
            response = requests.get(
                MACROSTRAT_URL, params={"lat": lat, "lng": lon}, timeout=30
            )
            response.raise_for_status()
            data = response.json().get("success", {}).get("data", [])
            if not data:
                return None
            unit = next((item for item in data if item.get("lith")), data[0])
            lith = unit.get("lith", "") or ""
            name = unit.get("name", "") or ""
            age = unit.get("best_int_name", "") or ""
            tags = geology_tags(lith, name)
            return {
                "lith": lith,
                "age": age,
                "unit": name,
                "tags": tags,
                "source": "Macrostrat CC-BY 4.0",
                "query": {"lat": lat, "lon": lon},
            }
        except Exception:
            if attempt == 2:
                return None
            time.sleep(1.2)
    return None


def fetch_imagery(site: dict, force: bool) -> tuple[dict | None, dict]:
    """Best usable S2 L2A window. Returns metadata and an attempt audit."""
    out = IMAGERY_DIR / f"{site['id']}.jpg"
    audit = {"passes": [], "selected": None, "reason": None}
    if out.exists() and not force:
        # Metadata is restored from the per-site cache by the caller; the file
        # existing alone is not enough to reconstruct provenance.
        pass
    for months, cloud, field, direction in fsi.PASSES:
        features = fsi.stac_search(site, months, cloud, field, direction)
        audit["passes"].append(
            {
                "months": months,
                "cloudLimit": cloud,
                "sortField": field,
                "sortDirection": direction,
                "features": len(features),
            }
        )
        if not features:
            continue
        tried = 0
        for feature in features:
            if not fsi.contains_site(feature, site):
                continue
            tried += 1
            if tried > 8:
                break
            try:
                result = fsi.read_window(feature.get("assets", {}), site)
            except Exception as exc:  # noqa: BLE001
                audit["reason"] = f"read error: {exc}"
                continue
            if not result:
                continue
            array, site_px, bounds, mpp = result
            out.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(array).save(out, quality=90, subsampling=0)
            properties = feature.get("properties", {})
            stamp = str(properties.get("datetime", ""))[:10]
            metadata = {
                "file": f"/generated/close/{site['id']}.jpg",
                "width": fsi.WIDTH,
                "height": fsi.HEIGHT,
                "sitePx": [round(site_px[0], 1), round(site_px[1], 1)],
                "mpp": round(mpp, 2),
                "date": stamp,
                "cloud": round(float(properties.get("eo:cloud_cover", 0.0)), 2),
                "scene": feature.get("id"),
                "collection": "sentinel-2-l2a",
                "bounds": [round(value, 5) for value in bounds],
                "bands": "B04 / B03 / B02 surface reflectance",
                "source": IMAGERY_SOURCE,
                "license": IMAGERY_LICENSE,
                "credit": f"Contains modified Copernicus Sentinel data {stamp[:4]}",
                "nativeResolutionM": 10.0,
                "coverage": "2048 x 1280 native 10 m pixels; no resampling",
                "processing": "2-98% display stretch and sRGB transfer; no generated detail",
            }
            audit["selected"] = metadata["scene"]
            audit["reason"] = None
            return metadata, audit
    audit["reason"] = audit["reason"] or "no usable cloud-free scene in the search passes"
    return None, audit


def terrain_stats(path: Path, height: int, width: int, spacing: float) -> dict:
    raw = np.fromfile(path, dtype="<f4")
    if raw.size != height * width:
        raise ValueError(f"{path}: {raw.size} values, expected {height * width}")
    dem = raw.reshape(height, width).astype(float)
    gy, gx = np.gradient(dem, spacing, spacing)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    rough = dem - gaussian_filter(dem, 2)
    return {
        "meanSlope": round(float(slope.mean()), 2),
        "p95Slope": round(float(np.percentile(slope, 95)), 2),
        "maxSlope": round(float(slope.max()), 2),
        "flatFraction": round(float((slope < 5.0).mean()), 4),
        "roughness": round(float(np.std(rough)), 2),
        "elevRange": round(float(dem.max() - dem.min()), 2),
        "elevMean": round(float(dem.mean()), 2),
        "elevP95P5": round(float(np.percentile(dem, 95) - np.percentile(dem, 5)), 2),
        "voidPct": round(float(np.isnan(dem).mean() * 100.0), 3),
        "baselineM": spacing,
    }


def fetch_terrain(site: dict, imagery: dict | None, force: bool) -> dict:
    if imagery:
        descriptor = {
            "width": imagery["width"],
            "height": imagery["height"],
            "sitePx": imagery["sitePx"],
            "mpp": imagery["mpp"],
        }
        window_source = "Sentinel-2 acquisition window"
    else:
        descriptor = {
            "width": 512,
            "height": 320,
            "sitePx": [256.0, 160.0],
            "mpp": 40.0,
        }
        window_source = "standard 20.48 x 12.8 km UTM window; imagery unavailable"

    fst.OUT_DIR = TERRAIN_DIR
    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    entry = fst.terrain_for(site, descriptor, force)
    if entry is None:
        # Existing file without a fresh metadata return: reconstruct from the
        # known heightmap layout and read the file.
        path = TERRAIN_DIR / f"{site['id']}.bin"
        if not path.exists():
            raise RuntimeError("terrain file missing")
        entry = {
            "file": f"/generated/terrain/{site['id']}.bin",
            "width": 512,
            "height": 320,
            "mpp": 40.0,
            "widthMeters": 20480.0,
            "heightMeters": 12800.0,
            "crs": "local UTM",
            "boundsUtm": [0, 0, 0, 0],
            "min": None,
            "max": None,
            "mean": None,
            "voidPct": None,
            "date": "2011-2015",
            "source": fst.SOURCE,
            "credit": "Copernicus DEM © DLR e.V. 2010-2014 / ESA 2021",
        }
    entry["file"] = f"/generated/terrain/{site['id']}.bin"
    entry["windowSource"] = window_source
    entry["nativeResolutionM"] = 30.0
    entry["heightmapResolutionM"] = 40.0
    entry["heightmapSize"] = [512, 320]
    entry["license"] = TERRAIN_LICENSE
    stats = terrain_stats(
        TERRAIN_DIR / f"{site['id']}.bin",
        int(entry["height"]),
        int(entry["width"]),
        float(entry["mpp"]),
    )
    entry["stats"] = stats
    return entry


def detailed_profile_scores(region: dict, power: dict, terrain: dict) -> dict:
    coarse = region["features"]
    access_km = coarse["accessKm"]["mean"]
    access = None if access_km is None else clamp(1 - math.log10(1 + access_km) / 3.2)
    dimensions = profile_dimensions(
        region["lat"],
        power["tempMeanC"],
        power["precipYearMm"],
        terrain["stats"]["elevRange"],
        terrain["stats"]["meanSlope"],
        power["precipSeasonalityCv"],
        access,
    )
    return evaluate_profiles(region["lat"], dimensions)


def profile_sensitivity(lat: float, dimensions: dict) -> dict:
    """Deterministic +/-20% weight perturbation, not a statistical interval."""
    base_profiles = evaluate_profiles(lat, dimensions)
    out = {}
    for key, profile in PROFILES.items():
        if key not in base_profiles:
            continue
        base = base_profiles[key]["score"]
        weights = profile["weights"]
        valid = {
            "thermal": dimensions["thermal_lunar"] if key.startswith("lunar") else dimensions["thermal_mars"],
            "aridity": dimensions["aridity"],
            "terrain": dimensions["terrain"],
            "polar": dimensions["polar"],
            "seasonality": dimensions["seasonality"],
            "access": dimensions["access"],
        }
        scores = [base]
        for changed in weights:
            for factor in (0.8, 1.2):
                total = 0.0
                used = 0.0
                for dim, weight in weights.items():
                    value = valid.get(dim)
                    if value is None:
                        continue
                    effective = weight * (factor if dim == changed else 1.0)
                    total += effective * value
                    used += effective
                if used:
                    scores.append(100.0 * total / used)
        out[key] = {
            "base": round(base, 1),
            "maxDelta": round(max(scores) - min(scores), 2),
            "min": round(min(scores), 2),
            "max": round(max(scores), 2),
        }
    return out


def load_cache(site_id: str) -> dict:
    path = CACHE / f"{site_id}.json"
    return json.loads(path.read_text()) if path.exists() else {}


def write_cache(site_id: str, payload: dict) -> None:
    (CACHE / f"{site_id}.json").write_text(json.dumps(payload, indent=1, allow_nan=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="comma-separated region ids")
    parser.add_argument("--force", action="store_true", help="re-fetch existing assets")
    parser.add_argument("--skip-imagery", action="store_true")
    parser.add_argument("--skip-terrain", action="store_true")
    parser.add_argument("--skip-power", action="store_true")
    parser.add_argument("--skip-macrostrat", action="store_true")
    args = parser.parse_args()

    selection = json.loads(SELECTION.read_text())
    global_data = json.loads(GLOBAL.read_text())
    by_id = {region["id"]: region for region in global_data["regions"]}
    selected = selection["regions"]
    if args.only:
        wanted = {item.strip() for item in args.only.split(",") if item.strip()}
        selected = [item for item in selected if item["id"] in wanted]

    sites = {}
    for index, item in enumerate(selected, 1):
        site_id = item["id"]
        region = by_id[site_id]
        print(f"[{index:02d}/{len(selected)}] {site_id} {item['name']} {item['lat']:.2f},{item['lon']:.2f}")
        sys.stdout.flush()
        cache = load_cache(site_id)

        imagery = cache.get("imagery")
        if not args.skip_imagery and (args.force or not imagery):
            imagery, audit = fetch_imagery({"id": site_id, "lat": item["lat"], "lon": item["lon"]}, args.force)
            cache["imagery"] = imagery
            cache["imageryAudit"] = audit
            write_cache(site_id, cache)
            print(f"  imagery: {'NO SCENE' if imagery is None else imagery['scene'] + ' cloud=' + str(imagery['cloud'])}")

        terrain = cache.get("terrain")
        if not args.skip_terrain and (args.force or not terrain):
            try:
                terrain = fetch_terrain(
                    {"id": site_id, "lat": item["lat"], "lon": item["lon"]}, imagery, args.force
                )
                cache["terrain"] = terrain
                write_cache(site_id, cache)
                print(f"  terrain: {terrain['stats']['elevRange']:.0f} m range / {terrain['stats']['meanSlope']:.2f} deg mean slope")
            except Exception as exc:  # noqa: BLE001
                cache["terrainError"] = str(exc)
                write_cache(site_id, cache)
                print(f"  terrain ERROR: {exc}")
                terrain = None

        if terrain:
            tile_lat = math.floor(item["lat"])
            tile_lon = math.floor(item["lon"])
            terrain["demTile"] = f"Copernicus_DSM_COG_10_{fst.tile_name(tile_lat, tile_lon)}_DEM"
            terrain["demTileUrl"] = fst.tile_url(tile_lat, tile_lon)
            cache["terrain"] = terrain
            write_cache(site_id, cache)

        power = cache.get("power")
        if not args.skip_power and (args.force or not power):
            try:
                result = fetch_power({"id": site_id, "lat": item["lat"], "lon": item["lon"]})
                power = {
                    "period": "2001-2020",
                    "source": "NASA POWER / MERRA-2 climatology, community RE",
                    "spatialResolution": "0.5 x 0.625 degree reanalysis grid, sampled at the point",
                    "temporalResolution": "monthly climatological normals",
                    "retrieved": result["retrieved"],
                    "complete": len(result["missing"]) == 0,
                    "missing": result["missing"],
                    "monthly": result["series"],
                    "annual": annual_power(result["series"]),
                    "license": POWER_LICENSE,
                    "limitations": "Monthly normals, not a forecast or a spatial field.",
                }
                cache["power"] = power
                write_cache(site_id, cache)
                print(f"  POWER: {power['annual']['tempMeanC']} C / {power['annual']['precipYearMm']} mm y-1")
            except Exception as exc:  # noqa: BLE001
                cache["powerError"] = str(exc)
                write_cache(site_id, cache)
                print(f"  POWER ERROR: {exc}")
                power = None

        macrostrat = cache.get("macrostrat")
        if macrostrat:
            macrostrat["tags"] = geology_tags(macrostrat.get("lith", ""), macrostrat.get("unit", ""))
        if not args.skip_macrostrat and (args.force or macrostrat is None):
            macrostrat = fetch_macrostrat(item["lat"], item["lon"])
            cache["macrostrat"] = macrostrat
            write_cache(site_id, cache)
            print(f"  geology: {'NO UNIT' if macrostrat is None else macrostrat['unit']}")

        airport = cache.get("nearestAirport")
        if airport is None or args.force:
            airport = nearest_airport(item["lat"], item["lon"])
            cache["nearestAirport"] = airport
            write_cache(site_id, cache)
            print(f"  airport: {'NONE' if airport is None else airport['name'] + ' ' + str(airport['distanceKm']) + ' km'}")

        power_ready = bool(
            power
            and power["annual"].get("tempMeanC") is not None
            and power["annual"].get("precipYearMm") is not None
        )
        if power_ready and terrain:
            detailed = detailed_profile_scores(region, power["annual"], terrain)
        else:
            detailed = {}

        detail_dimensions = None
        if power_ready and terrain:
            access_km = region["features"]["accessKm"]["mean"]
            access = None if access_km is None else clamp(1 - math.log10(1 + access_km) / 3.2)
            detail_dimensions = profile_dimensions(
                region["lat"],
                power["annual"]["tempMeanC"],
                power["annual"]["precipYearMm"],
                terrain["stats"]["elevRange"],
                terrain["stats"]["meanSlope"],
                power["annual"]["precipSeasonalityCv"],
                access,
            )

        comparison = None
        if power_ready and terrain and detail_dimensions:
            coarse_relief = region["features"]["reliefM"]["mean"]
            coarse_slope = region["features"]["slopeDeg"]["mean"]
            coarse_temp = region["features"]["tempMeanC"]["mean"]
            coarse_precip = region["features"]["precipYearMm"]["mean"]
            comparison = {
                "coarse": {
                    "tempMeanC": coarse_temp,
                    "precipYearMm": coarse_precip,
                    "reliefM": coarse_relief,
                    "slopeDeg": coarse_slope,
                    "bestScore": region["bestScore"],
                    "bestProfile": region["bestProfile"],
                },
                "detailed": {
                    "tempMeanC": power["annual"]["tempMeanC"],
                    "precipYearMm": power["annual"]["precipYearMm"],
                    "reliefM": terrain["stats"]["elevRange"],
                    "slopeDeg": terrain["stats"]["meanSlope"],
                    "bestScore": max((p["score"] for p in detailed.values()), default=0.0),
                    "bestProfile": max(detailed, key=lambda key: detailed[key]["score"]) if detailed else None,
                },
                "deltas": {
                    "tempC": round((power["annual"]["tempMeanC"] or 0) - (coarse_temp or 0), 2),
                    "precipMm": round((power["annual"]["precipYearMm"] or 0) - (coarse_precip or 0), 1),
                    "reliefRatio": round(terrain["stats"]["elevRange"] / coarse_relief, 2) if coarse_relief else None,
                    "slopeRatio": round(terrain["stats"]["meanSlope"] / coarse_slope, 2) if coarse_slope else None,
                    "bestScore": round(
                        max((p["score"] for p in detailed.values()), default=0.0) - region["bestScore"], 2
                    ),
                },
                "profileSensitivity": profile_sensitivity(region["lat"], detail_dimensions),
                "note": (
                    "Coarse values are WorldClim 10-minute / 92 km relief-window statistics. "
                    "Detailed values are NASA POWER monthly normals at the point and a 20.48 x 12.8 km "
                    "Copernicus GLO-30 heightmap. They are different support, not a correction of one another. "
                    "This 15-region comparison is not a global validation set."
                ),
            }

        missing = []
        if imagery is None:
            missing.append("Sentinel-2 usable acquisition")
        if terrain is None:
            missing.append("Copernicus DEM heightmap")
        if power is None:
            missing.append("NASA POWER monthly climatology")
        if macrostrat is None:
            missing.append("Macrostrat mapped geology")
        missing.extend(
            [
                "MODIS thermal sample (separate file)",
                "field validation",
                "high-resolution land cover",
                "permit and seasonal access",
            ]
        )

        sites[site_id] = {
            "id": site_id,
            "name": item["name"],
            "category": item["category"],
            "classification": item["classification"],
            "selectionReason": item["selectionReason"],
            "lat": item["lat"],
            "lon": item["lon"],
            "representativeCell": region["representativeCell"],
            "cells": region["cells"],
            "cellCount": region["cellCount"],
            "areaKm2": region["areaKm2"],
            "nearestExisting": region["nearestExisting"],
            "coarse": {
                "features": region["features"],
                "profiles": region["profiles"],
                "bestProfile": region["bestProfile"],
                "bestScore": region["bestScore"],
                "dataCompleteness": region["dataCompleteness"],
                "footprint": region["footprint"],
                "evidence": region["evidence"],
            },
            "imagery": imagery,
            "terrain": terrain,
            "power": power,
            "macrostrat": macrostrat,
            "nearestAirport": airport,
            "detailedProfiles": detailed,
            "detailedDimensions": (
                None
                if detail_dimensions is None
                else {key: (None if value is None else round(value * 100, 1)) for key, value in detail_dimensions.items()}
            ),
            "comparison": comparison,
            "missing": missing,
            "licensing": {
                "imagery": IMAGERY_LICENSE,
                "terrain": TERRAIN_LICENSE,
                "power": POWER_LICENSE,
                "macrostrat": MACROSTRAT_LICENSE,
            },
        }
        write_cache(site_id, cache)

        payload = {
            "version": VERSION,
            "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "selectionVersion": selection["version"],
            "sourceVersion": global_data["version"],
            "licensing": {
                "worldclim": "WorldClim 2.1 is free for academic and other non-commercial use. Redistribution or commercial use requires prior permission from WorldClim. Coarse derived fields in globalDiscovery.json are subject to this restriction.",
                "naturalEarth": "Natural Earth is public domain.",
                "ourairports": "OurAirports data is public domain.",
                "sentinel2": IMAGERY_LICENSE,
                "copernicusDem": TERRAIN_LICENSE,
                "nasaPower": POWER_LICENSE,
                "macrostrat": MACROSTRAT_LICENSE,
                "modis": "NASA MODIS data are open; accessed through Microsoft Planetary Computer. Attribution requested.",
            },
            "methods": {
                "imagery": "Sentinel-2 L2A TCI window, best usable acquisition in three cloud/sort passes; 10 m native; no resampling",
                "terrain": "Copernicus DEM GLO-30 COG; 40 m heightmap 512 x 320 over 20.48 x 12.8 km; bilinear resampling",
                "power": "NASA POWER / MERRA-2 monthly climatology 2001-2020, point sample",
                "macrostrat": "Macrostrat geologic_units/map query at the representative point",
                "comparison": "Same profile rules applied to coarse and detailed dimensions; scores remain rule-based, not probabilities",
            },
            "sites": sites,
        }
        OUT.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n")
        print(f"  wrote {OUT} ({len(sites)} sites)")

    print(f"done: {len(sites)} sites")


if __name__ == "__main__":
    main()
