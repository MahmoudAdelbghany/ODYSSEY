#!/usr/bin/env python3
"""Add weight-perturbation stability metrics to odyssey.json."""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src" / "data" / "odyssey.json"

WEIGHTS = {
    "lunar_base": dict(thermal=0.24, aridity=0.10, terrain=0.18, geology=0.22, dust=0.10, access=0.16),
    "mars_landing": dict(thermal=0.15, aridity=0.18, terrain=0.18, geology=0.22, dust=0.17, access=0.10),
    "expedition": dict(thermal=0.16, aridity=0.08, terrain=0.22, geology=0.24, dust=0.12, access=0.18),
}


def rank(profile, weights, sites):
    rows = []
    for s in sites:
        dims = s["scores"][profile]["dimensions"]
        rows.append((sum(dims[k] * weights[k] for k in weights), s["id"]))
    rows.sort(reverse=True)
    return [x[1] for x in rows]


def main():
    d = json.loads(PATH.read_text())
    sites = d["sites"]
    validation = {}
    random.seed(7)
    for profile, weights in WEIGHTS.items():
        base = rank(profile, weights, sites)
        top1, top3 = base[0], set(base[:3])
        runs = 300
        same1 = same3 = 0
        for _ in range(runs):
            w = {k: max(0.01, weights[k] * (1 + random.uniform(-0.15, 0.15))) for k in weights}
            total = sum(w.values())
            w = {k: v / total for k, v in w.items()}
            r = rank(profile, w, sites)
            same1 += r[0] == top1
            same3 += set(r[:3]) == top3
        validation[profile] = {
            "top1Stability": round(same1 / runs * 100),
            "top3Stability": round(same3 / runs * 100),
            "runs": runs,
        }
    d["validation"] = validation
    PATH.write_text(json.dumps(d, indent=2))
    print(json.dumps(validation, indent=2))


if __name__ == "__main__":
    main()
