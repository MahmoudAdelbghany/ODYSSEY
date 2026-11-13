#!/usr/bin/env python3
"""Audit footprint-aware duplication among the 80 generated regions.

The original catalogue is not modified. This script measures:

  - H3 member-cell overlap;
  - polygon intersection area;
  - minimum distance between region footprints;
  - pairs whose centres are >80 km apart but whose footprints are close;
  - proposed landscape groups from footprint proximity.

Output: src/data/generatedDeduplicationAudit.json
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import Polygon, shape
from shapely.ops import nearest_points, unary_union

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "globalDiscovery.json"
OUT = ROOT / "src" / "data" / "generatedDeduplicationAudit.json"
GROUPS_OUT = ROOT / "src" / "data" / "generatedRegionGroupsV2.json"

VERSION = "m9-dedup-v1"
CENTER_DEDUP_KM = 80.0
FOOTPRINT_GROUP_KM = 10.0


def haversine(lat1, lon1, lat2, lon2):
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def unwrap_ring(boundary):
    """Unwrap a ring's longitudes so consecutive points never jump >180 deg."""
    ring = [list(boundary[0])]
    for lon, lat in boundary[1:]:
        previous = ring[-1][0]
        while lon - previous > 180.0:
            lon -= 360.0
        while lon - previous < -180.0:
            lon += 360.0
        ring.append([lon, lat])
    return ring


def corrected_region_geometry(region):
    """Union H3 cells in a local longitude frame, fixing antimeridian wraps."""
    ref = region["lon"]
    polygons = []
    for cell in region["cellGeometry"]:
        ring = unwrap_ring(cell["boundary"])
        mean_lon = sum(point[0] for point in ring) / len(ring)
        shift = round((ref - mean_lon) / 360.0) * 360.0
        polygons.append(Polygon([[point[0] + shift, point[1]] for point in ring]))
    return unary_union(polygons)


def shifted(geometry, offset):
    if offset == 0:
        return geometry
    from shapely.affinity import translate

    return translate(geometry, xoff=offset)


def pair_geometry_distance(a, b):
    """Minimum footprint distance in km, tolerant of the antimeridian."""
    best = None
    for offset in (0.0, 360.0, -360.0):
        other = shifted(b, offset)
        if a.intersects(other):
            return 0.0, True, None
        p1, p2 = nearest_points(a, other)
        distance = haversine(p1.y, p1.x, p2.y, p2.x)
        if best is None or distance < best[0]:
            best = (distance, False, (p1, p2))
    return best


def find(parent, key):
    while parent[key] != key:
        parent[key] = parent[parent[key]]
        key = parent[key]
    return key


def union(parent, a, b):
    ra, rb = find(parent, a), find(parent, b)
    if ra != rb:
        parent[rb] = ra


def main():
    payload = json.loads(SOURCE.read_text())
    regions = payload["regions"]
    geometries = {region["id"]: corrected_region_geometry(region) for region in regions}
    corrections = []
    for region in regions:
        original = shape(region["footprint"])
        corrected = geometries[region["id"]]
        original_span = original.bounds[2] - original.bounds[0]
        corrected_span = corrected.bounds[2] - corrected.bounds[0]
        if abs(original_span - corrected_span) > 1.0:
            corrections.append(
                {
                    "id": region["id"],
                    "originalBounds": [round(value, 5) for value in original.bounds],
                    "correctedBounds": [round(value, 5) for value in corrected.bounds],
                    "reason": "H3 ring crosses the antimeridian; longitudes were unwrapped in a local frame",
                }
            )

    # Member cells are disjoint by construction; verify rather than assume.
    cell_owner = {}
    cell_overlaps = []
    for region in regions:
        for cell in region["cells"]:
            if cell in cell_owner:
                cell_overlaps.append([cell_owner[cell], region["id"], cell])
            else:
                cell_owner[cell] = region["id"]

    pairs = []
    intersections = 0
    touching = 0
    for index, first in enumerate(regions):
        for second in regions[index + 1 :]:
            distance, intersects, _ = pair_geometry_distance(
                geometries[first["id"]], geometries[second["id"]]
            )
            if intersects:
                intersections += 1
                # Area of intersection is zero for shared cell edges; compute
                # it only when a real overlap exists.
                area = geometries[first["id"]].intersection(
                    geometries[second["id"]]
                ).area
                if area > 0:
                    touching += 1
            center_distance = haversine(
                first["lat"], first["lon"], second["lat"], second["lon"]
            )
            if distance <= 25.0 or center_distance <= 80.0:
                pairs.append(
                    {
                        "a": first["id"],
                        "b": second["id"],
                        "footprintKm": round(distance, 3),
                        "centerKm": round(center_distance, 3),
                        "sameCategory": first["category"] == second["category"],
                        "categories": [first["category"], second["category"]],
                        "classifications": [
                            first["classification"],
                            second["classification"],
                        ],
                        "scores": [first["bestScore"], second["bestScore"]],
                        "cells": [first["cellCount"], second["cellCount"]],
                        "tempDeltaC": round(
                            first["features"]["tempMeanC"]["mean"]
                            - second["features"]["tempMeanC"]["mean"],
                            2,
                        ),
                        "precipDeltaMm": round(
                            first["features"]["precipYearMm"]["mean"]
                            - second["features"]["precipYearMm"]["mean"],
                            1,
                        ),
                    }
                )

    pairs.sort(key=lambda item: (item["footprintKm"], item["centerKm"]))
    proposed_edges = [
        pair
        for pair in pairs
        if pair["footprintKm"] <= FOOTPRINT_GROUP_KM and pair["sameCategory"]
    ]
    parent = {region["id"]: region["id"] for region in regions}
    for edge in proposed_edges:
        union(parent, edge["a"], edge["b"])
    groups = defaultdict(list)
    for region in regions:
        groups[find(parent, region["id"])].append(region["id"])
    proposed_groups = [
        {
            "regionIds": sorted(ids),
            "size": len(ids),
            "categories": sorted(
                {
                    next(r["category"] for r in regions if r["id"] == region_id)
                    for region_id in ids
                }
            ),
        }
        for ids in groups.values()
        if len(ids) > 1
    ]

    same_category_close = [
        pair for pair in pairs if pair["sameCategory"] and pair["footprintKm"] <= 25.0
    ]
    center_far_but_footprint_close = [
        pair for pair in pairs if pair["centerKm"] > CENTER_DEDUP_KM and pair["footprintKm"] <= 25.0
    ]

    output = {
        "version": VERSION,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sourceVersion": payload["version"],
        "method": (
            "Footprint-aware duplication audit of the original 80 generated regions. "
            "Region footprints are unions of member H3 cell polygons. Distances are "
            "minimum boundary-to-boundary distances computed with haversine; pairs are "
            "checked with +360/-360 longitude shifts for antimeridian cases. No original "
            "region is deleted or modified."
        ),
        "parameters": {
            "centerDedupKm": CENTER_DEDUP_KM,
            "footprintGroupKm": FOOTPRINT_GROUP_KM,
            "pairCount": len(regions) * (len(regions) - 1) // 2,
        },
        "summary": {
            "regions": len(regions),
            "h3CellOverlaps": len(cell_overlaps),
            "polygonIntersections": intersections,
            "polygonOverlapAreaPositive": touching,
            "pairsWithin25KmFootprint": len([p for p in pairs if p["footprintKm"] <= 25.0]),
            "pairsWithin10KmFootprint": len([p for p in pairs if p["footprintKm"] <= 10.0]),
            "sameCategoryPairsWithin25Km": len(same_category_close),
            "centerFarButFootprintWithin25Km": len(center_far_but_footprint_close),
            "proposedGroups": len(proposed_groups),
            "proposedGroupedRegions": sum(group["size"] for group in proposed_groups),
        },
        "closestPairs": pairs[:25],
        "centerFarButFootprintClose": center_far_but_footprint_close[:25],
        "proposedGroups": proposed_groups,
        "cellOverlaps": cell_overlaps[:10],
        "antimeridianCorrections": corrections,
        "note": (
            "The 80 km centre-to-centre rule prevents coincident region centres. It does "
            "not prevent adjacent footprints or landscapes split by the seed-and-grow "
            "coherence threshold. Proposed groups are audit evidence, not a replacement "
            "catalogue."
        ),
    }
    OUT.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n")

    by_id = {region["id"]: region for region in regions}
    grouped_ids = set()
    group_records = []
    for index, group in enumerate(sorted(proposed_groups, key=lambda item: (-item["size"], item["regionIds"])), 1):
        members = [by_id[region_id] for region_id in group["regionIds"]]
        grouped_ids.update(group["regionIds"])
        representative = max(members, key=lambda region: (region["bestScore"], region["cellCount"], region["id"]))
        group_records.append(
            {
                "id": f"GG-{index:03d}",
                "regionIds": group["regionIds"],
                "categories": group["categories"],
                "size": group["size"],
                "representativeRegion": representative["id"],
                "combinedCellCount": sum(region["cellCount"] for region in members),
                "combinedAreaKm2": round(sum(region["areaKm2"] for region in members), 1),
                "maxBestScore": max(region["bestScore"] for region in members),
                "minNoveltyKm": min(region["noveltyKm"] for region in members),
                "reason": "same-category footprints within 10 km boundary distance",
            }
        )
    groups_payload = {
        "version": "m9-groups-v1",
        "generatedAt": output["generatedAt"],
        "sourceVersion": payload["version"],
        "method": (
            "Connected components of same-category generated regions whose corrected "
            "footprints are within 10 km boundary-to-boundary. This is a versioned "
            "audit grouping only; the original 80 regions and IDs are unchanged."
        ),
        "parameters": {
            "footprintGroupKm": FOOTPRINT_GROUP_KM,
            "centerDedupKm": CENTER_DEDUP_KM,
        },
        "groups": group_records,
        "ungrouped": [
            region["id"] for region in regions if region["id"] not in grouped_ids
        ],
        "note": (
            "Groups identify landscapes that may have been split by the seed-and-grow "
            "coherence threshold. They are not merged into the original catalogue."
        ),
    }
    GROUPS_OUT.write_text(json.dumps(groups_payload, indent=2, allow_nan=False) + "\n")
    print(f"wrote {GROUPS_OUT} ({len(group_records)} groups)")
    print(f"wrote {OUT}")
    print(json.dumps(output["summary"], indent=2))
    print("closest pairs:")
    for pair in pairs[:8]:
        print(
            pair["a"],
            pair["b"],
            pair["footprintKm"],
            pair["centerKm"],
            pair["sameCategory"],
            pair["categories"],
        )


if __name__ == "__main__":
    main()
