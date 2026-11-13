#!/usr/bin/env python3
"""Decode MOD11A1/MYD11A1 QC bits and compare QC00-only vs QC00+01.

Reads src/data/planetaryThermal.json, adds:
- decoded QC flags per observation,
- platform (Terra/Aqua) per observation,
- platform counts,
- paired-platform mix,
- per-site QC sensitivity,
- global QC sensitivity summary.

Does not change the accepted observation values. Raw QC is preserved.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "src" / "data" / "planetaryThermal.json"

QC_DECODER_VERSION = "m7-qc-v2"
SOURCES = {
    "guide": "MOD11 Collection 6.1 User Guide, Table 13 (modis-land.gsfc.nasa.gov/pdf/MOD11_User_Guide_V61.pdf)",
    "laads_mod": "NASA LAADS MOD11A1 C61 product specification",
    "laads_myd": "NASA LAADS MYD11A1 C61 product specification",
    "conflict": "Bits 2-3 are documented as a two-bit data-quality field in the MOD11 C6.1 User Guide, but as bit 2 data quality plus bit 3 snow/lake-ice in the LAADS MOD11A1/MYD11A1 specs.",
}


def decode(qc: int, product: str):
    bits23 = (qc >> 2) & 0b11
    return {
        "rawQC": qc,
        "mandatoryQA": qc & 0b11,
        "bits2_3Raw": bits23,
        "guideC61": {"dataQualityBits2_3": bits23},
        "laadsC61": {
            "bit2DataQuality": (qc >> 2) & 1,
            "bit3SnowLakeIce": (qc >> 3) & 1,
        },
        "emissivityErrorBits4_5": (qc >> 4) & 0b11,
        "lstErrorBits6_7": (qc >> 6) & 0b11,
        "product": product,
        "collection": "061",
        "decoderVersion": QC_DECODER_VERSION,
        "bits2_3Status": "unresolved documentation conflict; not used for acceptance",
        "documentation": "MOD11 C6.1 User Guide Table 13 vs LAADS MOD11A1/MYD11A1 product specifications",
    }


def platform(item_id: str):
    return "Aqua" if item_id.startswith("MYD") else "Terra" if item_id.startswith("MOD") else "Unknown"


def product(item_id: str):
    return "MYD11A1" if item_id.startswith("MYD") else "MOD11A1" if item_id.startswith("MOD") else "Unknown"


def mean(vals):
    return round(float(np.mean(vals)), 2) if vals else None


def phase_stats(obs):
    n = len(obs)
    return {
        "n": n,
        "meanK": mean([o["K"] for o in obs]) if n >= 4 else None,
        "minK": round(float(np.min([o["K"] for o in obs])), 2) if n >= 4 else None,
        "maxK": round(float(np.max([o["K"] for o in obs])), 2) if n >= 4 else None,
    }


def main():
    data = json.loads(PATH.read_text())
    summary_rows = []
    total_qc00_day = total_qc00_night = 0
    total_acc_day = total_acc_night = 0
    for sid, site in data["earth"].items():
        day_map, night_map = {}, {}
        for phase_name, mapping in (("day", day_map), ("night", night_map)):
            for obs in site[phase_name]["observations"]:
                obs["platform"] = platform(obs["itemId"])
                obs["product"] = product(obs["itemId"])
                obs["qcFlags"] = decode(int(obs["qc"]), obs["product"])
                mapping[obs["date"]] = obs
        day_qc00 = [o for o in day_map.values() if o["qcFlags"]["mandatoryQA"] == 0]
        night_qc00 = [o for o in night_map.values() if o["qcFlags"]["mandatoryQA"] == 0]
        total_qc00_day += len(day_qc00)
        total_qc00_night += len(night_qc00)
        total_acc_day += len(day_map)
        total_acc_night += len(night_map)

        day_platforms = Counter(o["platform"] for o in day_map.values())
        night_platforms = Counter(o["platform"] for o in night_map.values())
        paired_dates = sorted(set(day_map) & set(night_map))
        mixed = sum(1 for d in paired_dates if day_map[d]["platform"] != night_map[d]["platform"])
        same = len(paired_dates) - mixed

        site["platformCounts"] = {
            "day": dict(day_platforms),
            "night": dict(night_platforms),
            "pairedSamePlatform": same,
            "pairedMixedPlatform": mixed,
        }
        site["qcSensitivity"] = {
            "qc00": {
                "day": phase_stats(day_qc00),
                "night": phase_stats(night_qc00),
            },
            "accepted": {
                "day": phase_stats(list(day_map.values())),
                "night": phase_stats(list(night_map.values())),
            },
            "deltaDayMeanK": (
                round(phase_stats(list(day_map.values()))["meanK"] - phase_stats(day_qc00)["meanK"], 2)
                if phase_stats(list(day_map.values()))["meanK"] is not None
                and phase_stats(day_qc00)["meanK"] is not None
                else None
            ),
            "deltaNightMeanK": (
                round(phase_stats(list(night_map.values()))["meanK"] - phase_stats(night_qc00)["meanK"], 2)
                if phase_stats(list(night_map.values()))["meanK"] is not None
                and phase_stats(night_qc00)["meanK"] is not None
                else None
            ),
        }
        if abs(site.get("lat", 0)) > 30:
            site["polarNote"] = (
                "Above 30° latitude, MOD11A1/MYD11A1 may average multiple qualifying clear-sky "
                "observations into one daily pixel. View time and angle, if available, describe the "
                "daily retrieval, not necessarily a single overpass."
            )
        summary_rows.append((sid, site))

    data["qcPolicy"] = {
        "decoderVersion": QC_DECODER_VERSION,
        "productScope": "MOD11A1 Terra and MYD11A1 Aqua, Collection 061",
        "acceptance": "Bits 0-1 only: 00 accepted as good, 01 accepted conditionally, 10/11 rejected.",
        "bits0_1": {
            "0": "LST produced, good quality",
            "1": "LST produced, other quality",
            "2": "LST not produced due to cloud",
            "3": "LST not produced primarily for reasons other than cloud",
        },
        "bits2_3": {
            "status": "unresolved documentation conflict",
            "guideC61": "two-bit data-quality field",
            "laadsC61": "bit 2 = data quality; bit 3 = snow/lake-ice",
            "usedForAcceptance": False,
        },
        "bits4_5": "emissivity error: 0 <=0.01, 1 <=0.02, 2 <=0.04, 3 >0.04",
        "bits6_7": "LST error: 0 <=1 K, 1 <=2 K, 2 <=3 K, 3 >3 K",
        "sources": SOURCES,
        "note": "Raw QC is preserved. Both bits 2-3 interpretations are stored per observation. Neither is used to accept or reject an observation.",
    }
    data["qcSensitivitySummary"] = {
        "qc00Only": {"day": total_qc00_day, "night": total_qc00_night},
        "accepted": {"day": total_acc_day, "night": total_acc_night},
        "daySitesQc00": sum(1 for _, s in summary_rows if s["qcSensitivity"]["qc00"]["day"]["n"] >= 4),
        "daySitesAccepted": sum(1 for _, s in summary_rows if s["qcSensitivity"]["accepted"]["day"]["n"] >= 4),
        "nightSitesQc00": sum(1 for _, s in summary_rows if s["qcSensitivity"]["qc00"]["night"]["n"] >= 4),
        "nightSitesAccepted": sum(1 for _, s in summary_rows if s["qcSensitivity"]["accepted"]["night"]["n"] >= 4),
    }
    PATH.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    print("QC00 day/night:", total_qc00_day, total_qc00_night)
    print("Accepted day/night:", total_acc_day, total_acc_night)
    print(json.dumps(data["qcSensitivitySummary"], indent=2))


if __name__ == "__main__":
    main()
