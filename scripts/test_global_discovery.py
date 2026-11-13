#!/usr/bin/env python3
"""Unit tests for the ODYSSEY global discovery pipeline.

Run with the repository data environment:
  /tmp/opencode/odyssey-venv/bin/python -m unittest scripts/test_global_discovery.py -v
"""
from __future__ import annotations

import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

import h3

sys.path.insert(0, str(Path(__file__).resolve().parent))
import global_discovery as gd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "src" / "data" / "globalDiscovery.json"


def feature(value: float | None, n: int = 1) -> dict:
    return {"mean": value, "min": value, "max": value, "n": n}


def region(
    ident: str,
    lat: float,
    lon: float,
    score: float,
    classification: str = "new",
    category: str = "other",
    cell_count: int = 3,
) -> dict:
    return {
        "id": ident,
        "lat": lat,
        "lon": lon,
        "bestScore": score,
        "classification": classification,
        "category": category,
        "cellCount": cell_count,
    }


class GridTests(unittest.TestCase):
    def test_grid_is_deterministic(self):
        first = gd.generate_global_cells(4)
        second = gd.generate_global_cells(4)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 288_122)
        sample = next(iter(first))
        self.assertTrue(sample)
        self.assertEqual(h3.get_resolution(sample), 4)

    def test_candidate_id_is_stable_and_cell_derived(self):
        cell = next(iter(gd.generate_global_cells(4)))
        self.assertEqual(gd.candidate_id(cell), f"GD-{cell}")
        self.assertEqual(gd.candidate_id(cell), gd.candidate_id(cell))


class LandMaskTests(unittest.TestCase):
    def test_land_mask_uses_actual_polygon(self):
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
                        ],
                    },
                }
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "land.geojson"
            path.write_text(json.dumps(geojson))
            mask = gd.build_land_mask(36, 18, path)
        self.assertTrue(gd.is_land(mask, 5.0, 5.0))
        self.assertFalse(gd.is_land(mask, 20.0, 20.0))
        self.assertFalse(gd.is_land(mask, -5.0, -5.0))


class MissingDataTests(unittest.TestCase):
    def test_missing_dimensions_are_masked_not_imputed(self):
        dimensions = gd.profile_dimensions(
            lat=80.0,
            temp_c=-20.0,
            precip_mm=50.0,
            relief_m=None,
            slope_deg=None,
            seasonality=None,
            access=None,
        )
        self.assertIsNone(dimensions["terrain"])
        profiles = gd.evaluate_profiles(80.0, dimensions)
        self.assertIn("lunar_base", profiles)
        self.assertEqual(profiles["lunar_base"]["coverage"], 0.75)
        self.assertIsNone(profiles["lunar_base"]["dimensions"]["terrain"])
        self.assertEqual(profiles["lunar_base"]["score"], 100.0)
        self.assertIn("mars_landing", profiles)
        self.assertEqual(profiles["mars_landing"]["coverage"], 0.5)

    def test_profile_minimums_are_separate(self):
        dimensions = gd.profile_dimensions(
            lat=40.0,
            temp_c=2.0,
            precip_mm=120.0,
            relief_m=0.0,
            slope_deg=0.0,
            seasonality=30.0,
            access=0.5,
        )
        profiles = gd.evaluate_profiles(40.0, dimensions)
        # Lunar base requires polar terrain; low relief fails expedition and Mars
        # terrain minimums. This must not be treated as a global rejection.
        self.assertNotIn("lunar_base", profiles)
        self.assertNotIn("lunar_expedition", profiles)
        self.assertNotIn("mars_landing", profiles)


class ClusteringTests(unittest.TestCase):
    def test_adjacent_cells_cluster_and_far_cell_does_not(self):
        seed = h3.latlng_to_cell(40.0, 60.0, 4)
        neighbors = [cell for cell in h3.grid_disk(seed, 1) if cell != seed]
        far = h3.latlng_to_cell(-40.0, -60.0, 4)
        candidates = [
            {"cell": seed, "bestScore": 90.0, "lat": 40.0, "lon": 60.0},
            {"cell": neighbors[0], "bestScore": 88.0, "lat": 40.1, "lon": 60.1},
            {"cell": far, "bestScore": 89.0, "lat": -40.0, "lon": -60.0},
        ]
        clusters = gd.cluster_candidates(candidates, min_cells=2)
        self.assertEqual(len(clusters), 1)
        self.assertEqual({cell["cell"] for cell in clusters[0]}, {seed, neighbors[0]})

    def test_incoherent_neighbor_is_not_absorbed(self):
        seed = h3.latlng_to_cell(10.0, 10.0, 4)
        neighbor = next(cell for cell in h3.grid_disk(seed, 1) if cell != seed)
        candidates = [
            {"cell": seed, "bestScore": 90.0, "lat": 10.0, "lon": 10.0},
            {"cell": neighbor, "bestScore": 50.0, "lat": 10.1, "lon": 10.1},
        ]
        clusters = gd.cluster_candidates(candidates, min_cells=2)
        self.assertEqual(clusters, [])


class AggregationTests(unittest.TestCase):
    def test_feature_aggregation_uses_only_observed_values(self):
        group = [
            {"features": {"reliefM": 100.0, "tempMeanC": 2.0}},
            {"features": {"reliefM": None, "tempMeanC": 4.0}},
            {"features": {"reliefM": 300.0, "tempMeanC": None}},
        ]
        features = gd.aggregate_features(group, ["reliefM", "tempMeanC"])
        self.assertEqual(features["reliefM"]["n"], 2)
        self.assertEqual(features["reliefM"]["mean"], 200.0)
        self.assertEqual(features["reliefM"]["min"], 100.0)
        self.assertEqual(features["reliefM"]["max"], 300.0)
        self.assertEqual(features["tempMeanC"]["n"], 2)
        self.assertEqual(features["tempMeanC"]["mean"], 3.0)


class DeduplicationTests(unittest.TestCase):
    def test_close_regions_are_deduplicated(self):
        regions = [
            region("GD-a", 0.0, 0.0, 90.0),
            region("GD-b", 0.0, 0.1, 89.0),
            region("GD-c", 0.0, 2.0, 88.0),
        ]
        kept, removed = gd.deduplicate_regions(regions, dedup_km=80.0)
        self.assertEqual(removed, 1)
        self.assertEqual([item["id"] for item in kept], ["GD-a", "GD-c"])

    def test_select_regions_preserves_existing_and_nearby(self):
        regions = [region(f"GD-new-{i}", 0.0, i * 2.0, 80.0 - i) for i in range(8)]
        regions.append(region("GD-existing", 10.0, 10.0, 1.0, "existing", "other"))
        regions.append(region("GD-nearby", 20.0, 20.0, 2.0, "nearby", "other"))
        selected = gd.select_regions(regions, max_regions=5)
        ids = {item["id"] for item in selected}
        self.assertIn("GD-existing", ids)
        self.assertIn("GD-nearby", ids)
        self.assertEqual(len(selected), 5)


class NoveltyTests(unittest.TestCase):
    def test_existing_nearby_and_new_are_distinguished(self):
        existing = [(0.0, 0.0, "control-a", "control")]
        cell = h3.latlng_to_cell(0.0, 0.0, 4)
        group = [{"cell": cell, "lat": 0.0, "lon": 0.0}]
        classification, distance, nearest = gd.region_novelty(group, existing)
        self.assertEqual(classification, "existing")
        self.assertEqual(distance, 0.0)
        self.assertEqual(nearest[2], "control-a")

        nearby_cell = h3.latlng_to_cell(0.0, 0.5, 4)
        nearby_group = [{"cell": nearby_cell, "lat": 0.0, "lon": 0.5}]
        classification, distance, _ = gd.region_novelty(nearby_group, existing)
        self.assertEqual(classification, "nearby")
        self.assertGreater(distance, 10.0)
        self.assertLess(distance, 80.0)

        far_cell = h3.latlng_to_cell(0.0, 3.0, 4)
        far_group = [{"cell": far_cell, "lat": 0.0, "lon": 3.0}]
        classification, distance, _ = gd.region_novelty(far_group, existing)
        self.assertEqual(classification, "new")
        self.assertGreater(distance, 80.0)

    def test_haversine_one_degree_at_equator(self):
        self.assertAlmostEqual(gd.haversine(0.0, 0.0, 0.0, 1.0), 111.19, places=1)


class LabelTests(unittest.TestCase):
    def test_label_matches_region_means_and_category(self):
        features = {
            "absLat": feature(32.0),
            "tempMeanC": feature(4.0),
            "precipYearMm": feature(220.0),
            "reliefM": feature(640.0),
            "accessKm": feature(120.0),
        }
        label = gd.describe(features)
        self.assertIn("high-relief", label)
        self.assertIn("arid", label)
        self.assertNotIn("low-relief", label)
        payload = {"features": features}
        self.assertEqual(gd.category_of(payload), "high_relief")

    def test_missing_mean_never_becomes_zero(self):
        features = {
            "absLat": feature(None, 0),
            "tempMeanC": feature(None, 0),
            "precipYearMm": feature(None, 0),
            "reliefM": feature(None, 0),
            "accessKm": feature(None, 0),
        }
        label = gd.describe(features)
        self.assertIn("unknown-relief", label)
        self.assertNotIn("low-relief", label)


class OutputContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(OUTPUT.read_text())

    def test_output_has_required_coverage(self):
        self.assertEqual(self.data["grid"]["resolution"], 4)
        self.assertEqual(self.data["grid"]["totalCells"], 288_122)
        self.assertGreater(self.data["counts"]["landCells"], 80_000)
        self.assertGreaterEqual(len(self.data["regions"]), 5)

    def test_generated_ids_are_cell_derived_and_unique(self):
        ids = []
        cells = []
        for item in self.data["regions"]:
            self.assertEqual(item["id"], f"GD-{item['representativeCell']}")
            self.assertTrue(h3.is_valid_cell(item["representativeCell"]))
            ids.append(item["id"])
            cells.extend(item["cells"])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(cells), len(set(cells)))

    def test_at_least_five_new_regions(self):
        new = [item for item in self.data["regions"] if item["classification"] == "new"]
        self.assertGreaterEqual(len(new), 5)
        for item in new:
            self.assertGreaterEqual(item["noveltyKm"], 80.0)
            self.assertIn("cells", item)
            self.assertTrue(item["cells"])
            self.assertIn("why" if "why" in item else "rationale", item)

    def test_new_regions_are_actually_absent_from_catalogue(self):
        controls = json.loads((ROOT / "src" / "data" / "odyssey.json").read_text())["sites"]
        seeds = json.loads((ROOT / "src" / "data" / "discovery.json").read_text())["candidates"]
        catalogue = [(site["lat"], site["lon"]) for site in controls + seeds]
        for item in self.data["regions"]:
            if item["classification"] != "new":
                continue
            actual = min(
                gd.haversine(cell["center"][1], cell["center"][0], lat, lon)
                for cell in item["cellGeometry"]
                for lat, lon in catalogue
            )
            self.assertGreaterEqual(actual, 80.0, item["id"])
            self.assertAlmostEqual(actual, item["noveltyKm"], delta=0.2)

    def test_existing_and_nearby_are_preserved(self):
        classes = {item["classification"] for item in self.data["regions"]}
        self.assertIn("existing", classes)
        self.assertIn("nearby", classes)
        known = self.data["knownRegions"]
        self.assertEqual(len(known), self.data["counts"]["knownRegionsAudited"])
        self.assertEqual(
            sum(1 for item in known if item["selected"]),
            self.data["counts"]["existingRegions"] + self.data["counts"]["nearbyRegions"],
        )
        self.assertGreaterEqual(
            self.data["counts"]["knownExistingAfterDedup"],
            self.data["counts"]["existingRegions"],
        )
        self.assertGreaterEqual(
            self.data["counts"]["knownNearbyAfterDedup"],
            self.data["counts"]["nearbyRegions"],
        )
        for item in known:
            self.assertIn(item["classification"], ("existing", "nearby"))
            self.assertEqual(item["classification"] == "existing", item["noveltyKm"] < 10.0)
            self.assertEqual(item["classification"] == "nearby", 10.0 <= item["noveltyKm"] < 80.0)

    def test_profiles_are_multidimensional_and_rule_based(self):
        for item in self.data["regions"]:
            for profile in item["profiles"].values():
                self.assertGreaterEqual(profile["coverageMean"], 0.0)
                self.assertLessEqual(profile["coverageMean"], 1.0)
                self.assertTrue(profile["dimensions"])
            self.assertIn("high-resolution DEM", item["missing"])
            self.assertIn("Sentinel-2 imagery", item["missing"])

    def test_names_match_region_statistics(self):
        for item in self.data["regions"]:
            relief = item["features"]["reliefM"]["mean"]
            if item["category"] == "high_relief":
                self.assertIn("high-relief", item["name"])
            if item["category"] == "moderate_relief":
                self.assertIn("moderate-relief", item["name"])
            if item["category"] == "polar":
                self.assertIn("polar", item["name"])
            if item["category"] == "hyper_arid":
                self.assertIn("hyper-arid", item["name"])
            if relief is None:
                self.assertIn("unknown-relief", item["name"])

    def test_no_ml_scores_are_present(self):
        serialized = json.dumps(self.data)
        self.assertNotIn("mlScore", serialized)
        self.assertNotIn("mlUncertainty", serialized)
        self.assertIn("not used", self.data["screening"]["ml"])


if __name__ == "__main__":
    unittest.main()
