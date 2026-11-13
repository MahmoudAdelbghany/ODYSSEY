"""MODIS MOD11A1/MYD11A1 C6.1 metadata decoders.

View angle:
  raw 0-130, fill 255, scale 1.0, offset -65.
  signed = raw - 65; absolute = |signed|.
  Negative signed angle = viewed from the east.
  Positive signed angle = viewed from the west.

Clear-sky coverage:
  valid raw 1-65535, fill 0, scale 0.0005, offset 0.
  Unclipped scaled value; do not label as a normalized 0-1 fraction.

Ranking:
  current = mandatory QA bits 0-1, then item id.
  error_aware = mandatory QA, LST error bits 6-7, emissivity error bits 4-5,
  then item id.
  Bits 2-3 are never used in ranking or acceptance.
"""
from __future__ import annotations

VIEW_ANGLE_FILL = 255
VIEW_ANGLE_OFFSET = -65.0
CLEAR_SKY_SCALE = 0.0005
CLEAR_SKY_FILL = 0


def decode_view_angle(raw: int):
    raw = int(raw)
    if raw == VIEW_ANGLE_FILL:
        return {
            "rawDN": raw,
            "signedDeg": None,
            "absoluteDeg": None,
            "direction": "missing",
            "missing": True,
        }
    signed = raw + VIEW_ANGLE_OFFSET
    # C6.1 sign convention: negative = east, positive = west.
    direction = "east" if signed < 0 else "west" if signed > 0 else "nadir"
    return {
        "rawDN": raw,
        "signedDeg": round(signed, 1),
        "absoluteDeg": round(abs(signed), 1),
        "direction": direction,
        "missing": False,
    }


def decode_clear_sky(raw: int):
    raw = int(raw)
    missing = raw == CLEAR_SKY_FILL
    return {
        "rawDN": raw,
        "scale": CLEAR_SKY_SCALE,
        "unclipped": None if missing else round(raw * CLEAR_SKY_SCALE, 4),
        "missing": missing,
    }


def qc_fields(qc: int):
    return {
        "mandatoryQA": qc & 0b11,
        "bits2_3Raw": (qc >> 2) & 0b11,
        "emissivityError": (qc >> 4) & 0b11,
        "lstError": (qc >> 6) & 0b11,
    }


def rank_current(candidate):
    """Mandatory QA only. The raw QC byte is deliberately not compared."""
    return (qc_fields(candidate["qc"])["mandatoryQA"], candidate["itemId"])


def rank_error_aware(candidate):
    q = qc_fields(candidate["qc"])
    return (q["mandatoryQA"], q["lstError"], q["emissivityError"], candidate["itemId"])


def select_candidate(candidates, policy: str):
    if not candidates:
        return None
    if policy == "current":
        return min(candidates, key=rank_current)
    if policy == "error_aware":
        return min(candidates, key=rank_error_aware)
    if policy == "terra":
        subset = [c for c in candidates if c.get("platform") == "Terra"]
        return min(subset, key=rank_error_aware) if subset else None
    if policy == "aqua":
        subset = [c for c in candidates if c.get("platform") == "Aqua"]
        return min(subset, key=rank_error_aware) if subset else None
    raise ValueError(f"unknown policy: {policy}")
