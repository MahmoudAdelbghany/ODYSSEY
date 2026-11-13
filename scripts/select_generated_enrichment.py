#!/usr/bin/env python3
"""Select a bounded, diverse set of generated regions for detailed enrichment.

This script does not modify src/data/globalDiscovery.json. It applies a
deterministic, stratified selection over the 80 output regions:

  - quota per environmental category;
  - one existing overlap if present;
  - within each category: highest screening score, strongest lunar-expedition
    score, and a geographic outlier;
  - remaining quota filled by score.

The result is a reproducible 15-region enrichment queue with explicit reasons.

Output: src/data/generatedEnrichmentSelection.json
"""
from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "globalDiscovery.json"
OUT = ROOT / "src" / "data" / "generatedEnrichmentSelection.json"

VERSION = "m9-selection-v1"
MAX_REGIONS = 15
QUOTAS = {
    "polar": 4,
    "high_relief": 3,
    "hyper_arid": 3,
    "moderate_relief": 2,
    "remote": 2,
    "other": 1,
}
CATEGORY_ORDER = ["polar", "high_relief", "hyper_arid", "moderate_relief", "remote", "other"]


def haversine(lat1, lon1, lat2, lon2):
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def expedition_score(region):
    return region["profiles"].get("lunar_expedition", {}).get("max", 0.0)


def geographic_sector(lat, lon):
    if lat >= 60:
        return "Arctic"
    if lat <= -60:
        return "Antarctica"
    if -30 <= lon <= 60 and -35 <= lat <= 40:
        return "Africa / Middle East"
    if lon < -25 and lat < 20:
        return "South America"
    if lon < -25:
        return "North America"
    if lon > 110 and lat < -10:
        return "Australia / New Zealand"
    if 55 <= lon <= 110 and lat < -30:
        return "Southern / Indian Ocean"
    if lon > 40 and lat >= 35:
        return "North / Central Asia"
    if lon > 60:
        return "South / East Asia"
    return "Other"


def access_band(access):
    if access is None:
        return "unknown"
    if access <= 100:
        return "accessible <=100 km"
    if access <= 250:
        return "moderate 100-250 km"
    if access <= 500:
        return "remote 250-500 km"
    return "very remote >500 km"


def score_band(score):
    if score >= 95:
        return "strong >=95"
    if score >= 85:
        return "medium 85-95"
    return "uncertain <85"


def select(regions):
    selected = []
    reasons = {}

    def take(region, reason, pool=None):
        if region in selected or len(selected) >= MAX_REGIONS:
            return
        selected.append(region)
        reasons[region["id"]] = reason
        if pool is not None and region in pool:
            pool.remove(region)

    # Preserve a known-location rediscovery if the screen produced one.
    existing = [region for region in regions if region["classification"] == "existing"]
    if existing:
        take(max(existing, key=lambda r: (r["bestScore"], r["cellCount"], r["id"])), "catalogue overlap / control rediscovery")

    for category in CATEGORY_ORDER:
        quota = QUOTAS[category]
        pool = [r for r in regions if r["category"] == category and r not in selected]

        def count():
            return sum(1 for r in selected if r["category"] == category)

        category_existing = [r for r in pool if r["classification"] == "existing"]
        if category_existing and count() < quota:
            take(category_existing[0], f"{category}: catalogue overlap", pool)

        if count() < quota and pool:
            choice = max(pool, key=lambda r: (r["bestScore"], r["cellCount"], r["id"]))
            take(choice, f"{category}: highest screening score", pool)

        if count() < quota and pool:
            choice = max(pool, key=lambda r: (expedition_score(r), r["bestScore"]))
            take(choice, f"{category}: strongest lunar-expedition score", pool)

        if count() < quota and pool:
            choice = max(
                pool,
                key=lambda r: min(
                    (haversine(r["lat"], r["lon"], s["lat"], s["lon"]) for s in selected),
                    default=0.0,
                ),
            )
            take(choice, f"{category}: geographic outlier from selected", pool)

        while count() < quota and pool:
            choice = max(pool, key=lambda r: (r["bestScore"], r["cellCount"], r["id"]))
            take(choice, f"{category}: score fill", pool)

    # If a category had fewer members than its quota, fill from remaining
    # candidates by score rather than inventing a region.
    if len(selected) < MAX_REGIONS:
        for region in sorted(regions, key=lambda r: (-r["bestScore"], r["id"])):
            if len(selected) >= MAX_REGIONS:
                break
            if region not in selected:
                take(region, "global score fill")

    selected.sort(key=lambda r: (-r["bestScore"], r["id"]))
    return selected, reasons


def main():
    payload = json.loads(SOURCE.read_text())
    regions = payload["regions"]
    selected, reasons = select(regions)
    if len(selected) != MAX_REGIONS:
        raise SystemExit(f"selection produced {len(selected)} regions, expected {MAX_REGIONS}")

    entries = []
    for region in selected:
        expedition = expedition_score(region)
        entries.append(
            {
                "id": region["id"],
                "name": region["name"],
                "category": region["category"],
                "classification": region["classification"],
                "bestProfile": region["bestProfile"],
                "bestScore": region["bestScore"],
                "expeditionScore": expedition,
                "expeditionMargin": round(region["bestScore"] - expedition, 1),
                "accessKm": region["features"]["accessKm"]["mean"],
                "tempMeanC": region["features"]["tempMeanC"]["mean"],
                "precipYearMm": region["features"]["precipYearMm"]["mean"],
                "reliefM": region["features"]["reliefM"]["mean"],
                "lat": region["lat"],
                "lon": region["lon"],
                "cellCount": region["cellCount"],
                "areaKm2": region["areaKm2"],
                "representativeCell": region["representativeCell"],
                "cells": region["cells"],
                "nearestExisting": region["nearestExisting"],
                "selectionReason": reasons[region["id"]],
            }
        )

    category_counts = Counter(r["category"] for r in selected)
    profile_counts = Counter(r["bestProfile"] for r in selected)
    class_counts = Counter(r["classification"] for r in selected)
    sector_counts = Counter(geographic_sector(r["lat"], r["lon"]) for r in selected)
    access_counts = Counter(access_band(r["features"]["accessKm"]["mean"]) for r in selected)
    score_counts = Counter(score_band(r["bestScore"]) for r in selected)
    expedition_competitive = sum(1 for r in selected if r["bestScore"] - expedition_score(r) <= 10)

    audit = {
        "selected": len(selected),
        "categoryCounts": dict(category_counts),
        "bestProfileCounts": dict(profile_counts),
        "classificationCounts": dict(class_counts),
        "geographicSectors": dict(sector_counts),
        "accessBands": dict(access_counts),
        "scoreBands": dict(score_counts),
        "expeditionCompetitiveWithin10Points": expedition_competitive,
        "lunarExpeditionBestProfileCountInSource": sum(
            1 for region in regions if region["bestProfile"] == "lunar_expedition"
        ),
        "note": (
            "Lunar expedition is represented by regions with the strongest expedition score, "
            "not by a best-profile label. In the source 80, zero regions have lunar_expedition "
            "as their best profile; this is a weighting outcome, documented in the report."
        ),
    }

    output = {
        "version": VERSION,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "src/data/globalDiscovery.json",
        "sourceVersion": payload["version"],
        "strategy": {
            "maxRegions": MAX_REGIONS,
            "quotas": QUOTAS,
            "rules": [
                "preserve one catalogue overlap if present",
                "per category: highest screening score",
                "per category: strongest lunar-expedition score",
                "per category: geographic outlier from already selected regions",
                "fill remaining quota by screening score",
                "never invent a region to satisfy a quota",
            ],
        },
        "audit": audit,
        "regions": entries,
    }
    OUT.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n")
    print(f"wrote {OUT} ({len(entries)} regions)")
    print("categories", dict(category_counts))
    print("profiles", dict(profile_counts))
    print("classes", dict(class_counts))
    print("sectors", dict(sector_counts))
    print("access", dict(access_counts))
    print("scores", dict(score_counts))
    print("expedition competitive", expedition_competitive)


if __name__ == "__main__":
    main()
