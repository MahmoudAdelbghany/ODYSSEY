#!/usr/bin/env python3
"""Unit tests for MODIS C6.1 metadata decoding and deterministic ranking."""
import unittest

from modis_metadata import decode_clear_sky, decode_view_angle, select_candidate


class ViewAngleTests(unittest.TestCase):
    def test_raw_zero_is_valid_east(self):
        d = decode_view_angle(0)
        self.assertEqual(d["signedDeg"], -65.0)
        self.assertEqual(d["absoluteDeg"], 65.0)
        self.assertEqual(d["direction"], "east")
        self.assertFalse(d["missing"])

    def test_raw_65_is_nadir(self):
        d = decode_view_angle(65)
        self.assertEqual(d["signedDeg"], 0.0)
        self.assertEqual(d["absoluteDeg"], 0.0)
        self.assertEqual(d["direction"], "nadir")

    def test_raw_130_is_valid_west(self):
        d = decode_view_angle(130)
        self.assertEqual(d["signedDeg"], 65.0)
        self.assertEqual(d["absoluteDeg"], 65.0)
        self.assertEqual(d["direction"], "west")

    def test_raw_255_is_missing(self):
        d = decode_view_angle(255)
        self.assertIsNone(d["signedDeg"])
        self.assertIsNone(d["absoluteDeg"])
        self.assertTrue(d["missing"])


class ClearSkyTests(unittest.TestCase):
    def test_unclipped_scaling(self):
        d = decode_clear_sky(1999)
        self.assertEqual(d["unclipped"], 0.9995)
        self.assertFalse(d["missing"])

    def test_above_one_is_not_clipped(self):
        d = decode_clear_sky(4000)
        self.assertEqual(d["unclipped"], 2.0)
        self.assertFalse(d["missing"])

    def test_zero_is_missing(self):
        self.assertTrue(decode_clear_sky(0)["missing"])
        self.assertIsNone(decode_clear_sky(0)["unclipped"])

    def test_lowest_valid_value(self):
        d = decode_clear_sky(1)
        self.assertEqual(d["unclipped"], 0.0005)
        self.assertFalse(d["missing"])

    def test_65535_is_valid(self):
        d = decode_clear_sky(65535)
        self.assertEqual(d["unclipped"], 32.7675)
        self.assertFalse(d["missing"])


class RankingTests(unittest.TestCase):
    def candidates(self):
        # qc 16  = 0b00010000: QC00, emissivity 1, LST error 0
        # qc 64  = 0b01000000: QC00, emissivity 0, LST error 1
        return [
            {"itemId": "MOD_A", "qc": 16, "platform": "Terra"},
            {"itemId": "MOD_B", "qc": 64, "platform": "Terra"},
            {"itemId": "MYD_C", "qc": 0, "platform": "Aqua"},
        ]

    def test_current_policy_ignores_raw_qc_bits_2_3(self):
        # Both QC00, but MOD_A has higher raw QC due to bits 2-3.
        candidates = [
            {"itemId": "MOD_Z", "qc": 0, "platform": "Terra"},
            {"itemId": "MOD_A", "qc": 12, "platform": "Terra"},
        ]
        chosen = select_candidate(candidates, "current")
        self.assertEqual(chosen["itemId"], "MOD_A")

    def test_error_aware_uses_lst_then_emissivity(self):
        candidates = [c for c in self.candidates() if c["platform"] == "Terra"]
        chosen = select_candidate(candidates, "error_aware")
        self.assertEqual(chosen["itemId"], "MOD_A")

    def test_terra_and_aqua_filters(self):
        self.assertEqual(select_candidate(self.candidates(), "terra")["itemId"], "MOD_A")
        self.assertEqual(select_candidate(self.candidates(), "aqua")["itemId"], "MYD_C")

    def test_tie_breaks_by_item_id(self):
        candidates = [
            {"itemId": "MOD_Z", "qc": 0, "platform": "Terra"},
            {"itemId": "MOD_A", "qc": 0, "platform": "Terra"},
        ]
        self.assertEqual(select_candidate(candidates, "error_aware")["itemId"], "MOD_A")


if __name__ == "__main__":
    unittest.main()
