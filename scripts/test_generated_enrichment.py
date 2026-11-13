#!/usr/bin/env python3
"""Tests for Milestone 09 generated-region enrichment.

Run:
  /tmp/opencode/odyssey-venv/bin/python -m unittest scripts/test_generated_enrichment.py -v
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import select_generated_enrichment as selection  # noqa: E402

GLOBAL = ROOT / "src" / "data" / "globalDiscovery.json"
SELECTION = ROOT / "src" / "data" / "generatedEnrichmentSelection.json"
ENRICHMENT = ROOT / "src" / "data" / "generatedEnrichment.json"
THERMAL = ROOT / "src" / "data" / "generatedThermal.json"
PLANETARY = ROOT / "src" / "data" / "generatedPlanetaryReference.json"
GROUPS = ROOT / "src" / "data" / "generatedRegionGroupsV2.json"
AUDIT = ROOT / "src" / "data" / "generatedDeduplicationAudit.json"
TERRAIN = ROOT / "public" / "generated" / "terrain"
IMAGERY = ROOT / "public" / "generated" / "close"


class SelectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.global_data = json.loads(GLOBAL.read_text())
        cls.selection = json.loads(SELECTION.read_text())
        cls.by_id = {region["id"]: region for region in cls.global_data["regions"]}

    def test_selection_is_deterministic(self):
        selected, _ = selection.select(self.global_data["regions"])
        self.assertEqual([item["id"] for item in selected], [item["id"] for item in self.selection["regions"]])

    def test_selection_has_fifteen_unique_source_regions(self):
        ids = [item["id"] for item in self.selection["regions"]]
        self.assertEqual(len(ids), 15)
        self.assertEqual(len(ids), len(set(ids)))
        for region_id in ids:
            self.assertIn(region_id, self.by_id)

    def test_selection_quota_and_diversity(self):
        audit = self.selection["audit"]
        self.assertEqual(audit["selected"], 15)
        self.assertEqual(audit["categoryCounts"], {"polar": 4, "high_relief": 3, "hyper_arid": 3, "moderate_relief": 2, "remote": 2, "other": 1})
        self.assertGreaterEqual(audit["bestProfileCounts"].get("lunar_base", 0), 2)
        self.assertGreaterEqual(audit["bestProfileCounts"].get("mars_landing", 0), 2)
        self.assertGreaterEqual(audit["expeditionCompetitiveWithin10Points"], 4)
        self.assertGreaterEqual(audit["classificationCounts"].get("existing", 0), 1)
        self.assertGreaterEqual(audit["classificationCounts"].get("nearby", 0), 2)
        self.assertGreaterEqual(len(audit["accessBands"]), 3)
        self.assertGreaterEqual(len(audit["geographicSectors"]), 4)
        self.assertGreaterEqual(audit["scoreBands"].get("uncertain <85", 0), 2)

    def test_lunar_expedition_absence_is_documented(self):
        self.assertEqual(self.selection["audit"]["lunarExpeditionBestProfileCountInSource"], 0)
        self.assertIn("weighting", self.selection["audit"]["note"])
        margins = [item["expeditionMargin"] for item in self.selection["regions"]]
        self.assertGreaterEqual(sum(1 for margin in margins if margin <= 10.0), 4)


class EnrichmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.selection = json.loads(SELECTION.read_text())
        cls.enrichment = json.loads(ENRICHMENT.read_text())
        cls.sites = cls.enrichment["sites"]

    def test_all_selected_regions_are_enriched(self):
        self.assertEqual(set(self.sites), {item["id"] for item in self.selection["regions"]})
        for site in self.sites.values():
            self.assertIsNotNone(site["imagery"])
            self.assertIsNotNone(site["terrain"])
            self.assertIsNotNone(site["power"])
            self.assertIsNotNone(site["macrostrat"])
            self.assertIsNotNone(site["nearestAirport"])
            self.assertIn("field validation", site["missing"])

    def test_imagery_assets_and_metadata(self):
        for site in self.sites.values():
            imagery = site["imagery"]
            self.assertEqual(imagery["mpp"], 10.0)
            self.assertEqual(imagery["width"], 2048)
            self.assertEqual(imagery["height"], 1280)
            self.assertIn("sentinel-2-l2a", imagery["collection"])
            self.assertTrue(imagery["scene"])
            self.assertIn("Copernicus Sentinel", imagery["license"])
            path = ROOT / "public" / imagery["file"].lstrip("/")
            self.assertTrue(path.exists(), path)
            self.assertGreater(path.stat().st_size, 10_000)

    def test_terrain_assets_and_stats(self):
        for site in self.sites.values():
            terrain = site["terrain"]
            self.assertEqual(terrain["width"], 512)
            self.assertEqual(terrain["height"], 320)
            self.assertEqual(terrain["mpp"], 40.0)
            self.assertTrue(terrain["demTile"].startswith("Copernicus_DSM_COG_10_"))
            self.assertIn("copernicus-dem-30m", terrain["demTileUrl"])
            path = ROOT / "public" / terrain["file"].lstrip("/")
            self.assertTrue(path.exists(), path)
            self.assertEqual(path.stat().st_size, 512 * 320 * 4)
            stats = terrain["stats"]
            for key in ("meanSlope", "p95Slope", "maxSlope", "flatFraction", "roughness", "elevRange"):
                self.assertIn(key, stats)
            self.assertEqual(stats["voidPct"], 0.0)
            self.assertEqual(stats["baselineM"], 40.0)

    def test_power_monthly_and_annual(self):
        for site in self.sites.values():
            power = site["power"]
            self.assertEqual(power["period"], "2001-2020")
            self.assertEqual(len(power["monthly"]["T2M"]), 12)
            self.assertEqual(len(power["monthly"]["PRECTOTCORR"]), 12)
            self.assertIsNotNone(power["annual"]["tempMeanC"])
            self.assertIsNotNone(power["annual"]["precipYearMm"])
            for key in ("humidityPct", "windMs", "solarKwhM2Day", "aerosolAod550", "pressureKpa"):
                self.assertIn(key, power["annual"])

    def test_comparison_is_separate_from_coarse_screen(self):
        for site in self.sites.values():
            comparison = site["comparison"]
            self.assertIsNotNone(comparison)
            self.assertIn("coarse", comparison)
            self.assertIn("detailed", comparison)
            self.assertIn("deltas", comparison)
            self.assertIn("profileSensitivity", comparison)
            self.assertNotEqual(comparison["coarse"], comparison["detailed"])
            self.assertIn("not a global validation", comparison["note"].lower())

    def test_geology_and_licensing(self):
        for site in self.sites.values():
            self.assertIn("source", site["macrostrat"])
            self.assertIn("Macrostrat", site["macrostrat"]["source"])
            for key in ("imagery", "terrain", "power", "macrostrat"):
                self.assertIn(key, site["licensing"])
        licensing = self.enrichment["licensing"]
        self.assertIn("non-commercial", licensing["worldclim"])
        self.assertIn("public domain", licensing["naturalEarth"])


class ThermalTests(unittest.TestCase):
    def test_thermal_contract(self):
        data = json.loads(THERMAL.read_text())
        self.assertEqual(len(data["earth"]), 15)
        no_data = 0
        for site_id, block in data["earth"].items():
            self.assertIn("day", block)
            self.assertIn("night", block)
            self.assertIn("pairedDayNight", block)
            self.assertIn("spatialSensitivity", block)
            if block["day"]["status"] == "NO DATA":
                no_data += 1
                self.assertEqual(block["day"]["nAccepted"], 0)
        self.assertEqual(no_data, 1)
        self.assertEqual(len(data["errors"]), 0)


class PlanetaryTests(unittest.TestCase):
    def test_planetary_reference_and_earth_stats(self):
        data = json.loads(PLANETARY.read_text())
        self.assertEqual(len(data["earth"]), 15)
        self.assertIn("moon", data["references"])
        self.assertIn("mars", data["references"])
        for stats in data["earth"].values():
            for baseline in ("400m", "463m"):
                block = stats[baseline]
                self.assertEqual(block["resolutionM"], int(baseline[:-1]))
                for key in ("reliefP95P5", "slopeP95", "roughness", "elevationMean"):
                    self.assertIn(key, block)


class DeduplicationTests(unittest.TestCase):
    def test_audit_summary_and_versioned_groups(self):
        audit = json.loads(AUDIT.read_text())
        groups = json.loads(GROUPS.read_text())
        summary = audit["summary"]
        self.assertEqual(summary["regions"], 80)
        self.assertEqual(summary["h3CellOverlaps"], 0)
        self.assertEqual(summary["polygonOverlapAreaPositive"], 0)
        self.assertGreater(summary["pairsWithin10KmFootprint"], 0)
        self.assertGreater(summary["centerFarButFootprintWithin25Km"], 0)
        self.assertEqual(summary["proposedGroups"], len(groups["groups"]))
        self.assertEqual(summary["proposedGroupedRegions"], sum(group["size"] for group in groups["groups"]))
        self.assertEqual(sum(group["size"] for group in groups["groups"]) + len(groups["ungrouped"]), 80)
        self.assertEqual(len(audit["antimeridianCorrections"]), 1)

        seen = set()
        by_id = {region["id"] for region in json.loads(GLOBAL.read_text())["regions"]}
        for group in groups["groups"]:
            self.assertEqual(group["size"], len(group["regionIds"]))
            for region_id in group["regionIds"]:
                self.assertIn(region_id, by_id)
                self.assertNotIn(region_id, seen)
                seen.add(region_id)
        for region_id in groups["ungrouped"]:
            self.assertIn(region_id, by_id)
            self.assertNotIn(region_id, seen)
            seen.add(region_id)
        self.assertEqual(len(seen), 80)


if __name__ == "__main__":
    unittest.main()
