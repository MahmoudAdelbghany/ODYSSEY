#!/usr/bin/env python3
"""Build scenario variants for each mission profile."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from enrich import best_campaign, PROFILES  # noqa: E402

DATA = ROOT / "src" / "data" / "odyssey.json"

VARIANTS = {
    "balanced": dict(penalty_hours=0.30, penalty_cost=0.008, max_days=42, max_hours=240, max_cost=32000,
                     label="Balanced", note="Best blend of experiment fit, travel time and cost."),
    "fast": dict(penalty_hours=0.75, penalty_cost=0.010, max_days=30, max_hours=120, max_cost=25000,
                 label="Fast", note="Minimize travel. Keep the campaign in as few regions as possible."),
    "science": dict(penalty_hours=0.08, penalty_cost=0.002, max_days=50, max_hours=320, max_cost=45000,
                    label="Science-max", note="Let match score dominate. Accept a longer, more expensive route."),
    "budget": dict(penalty_hours=0.20, penalty_cost=0.030, max_days=40, max_hours=220, max_cost=12000,
                   label="Budget", note="Minimize cost while keeping the science credible."),
}


def main():
    d = json.loads(DATA.read_text())
    sites = d["sites"]
    variants = {}
    for profile in PROFILES:
        pred = {p["id"]: p["predicted"] for p in d["ml"]["profiles"][profile]["predictions"]}
        profile_variants = {}
        for name, cfg in VARIANTS.items():
            c = best_campaign(
                profile, sites, pred,
                penalty_hours=cfg["penalty_hours"],
                penalty_cost=cfg["penalty_cost"],
                max_days=cfg["max_days"],
                max_hours=cfg["max_hours"],
                max_cost=cfg["max_cost"],
            )
            if c is None:
                c = best_campaign(profile, sites, pred)
            if c is None:
                continue
            c["scenario"] = name
            c["scenarioLabel"] = cfg["label"]
            c["scenarioNote"] = cfg["note"]
            profile_variants[name] = c
            print(f"{profile:<12} {name:<10} {c['assignments'][0]['site']} -> {c['assignments'][1]['site']} -> {c['assignments'][2]['site']}  {c['totalDays']}d  {c['travelHours']}h  ${c['travelCost']:,}  score {c['score']}")
        variants[profile] = profile_variants
        if "balanced" in profile_variants:
            d["campaigns"][profile] = profile_variants["balanced"]
    d["campaignVariants"] = variants
    DATA.write_text(json.dumps(d, indent=2))
    print("wrote scenarios")


if __name__ == "__main__":
    main()
