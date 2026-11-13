#!/usr/bin/env python3
"""Recompute campaigns with experiment-aware site assignment."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src" / "data" / "odyssey.json"
d = json.loads(PATH.read_text())
sites = d["sites"]
by_id = {s["id"]: s for s in sites}

PROFILE_META = {
    "lunar_base": {
        "name": "Permanent Lunar South Pole Base",
        "experiments": [
            ("Regolith & construction", ["geology", "access"], {"tags": ["basalt", "regolith"], "bonus": 0.16}),
            ("Thermal & illumination", ["thermal", "aridity"], {"type": ["polar", "desert", "cold"], "bonus": 0.14}),
            ("Subsurface & shielding", ["geology", "terrain"], {"tags": ["lava tube", "cave"], "bonus": 0.22}),
        ],
        "missing": ["gravity 0.166 g", "surface pressure ~0 kPa", "radiation environment"],
    },
    "mars_landing": {
        "name": "Mars Landing & Exploration",
        "experiments": [
            ("Dust & aeolian processes", ["dust", "aridity"], {"type": ["dust", "desert", "dune"], "bonus": 0.16}),
            ("Mineralogy & habitability", ["geology", "aridity"], {"tags": ["iron", "clay", "sulfate"], "bonus": 0.18}),
            ("Terrain & rover operations", ["terrain", "access"], {"tags": ["impact", "volcanic", "basalt"], "bonus": 0.14}),
        ],
        "missing": ["gravity 0.38 g", "atmosphere 0.6 kPa", "radiation environment"],
    },
    "expedition": {
        "name": "7-Day Lunar Surface Expedition",
        "experiments": [
            ("Geological sampling", ["geology", "access"], {"tags": ["basalt", "regolith"], "bonus": 0.16}),
            ("Rover navigation", ["terrain", "access"], {"relief_min": 200, "bonus": 0.12}),
            ("Equipment deployment", ["access", "terrain"], {"access_min": 0.5, "relief_max": 450, "bonus": 0.10}),
        ],
        "missing": ["gravity 0.166 g", "surface pressure ~0 kPa", "radiation environment"],
    },
}


def bonus(site, rule):
    b = 0.0
    if "tags" in rule:
        if set(site["tags"]) & set(rule["tags"]):
            b += rule["bonus"]
    if "type" in rule:
        if any(t in site["type"].lower() for t in rule["type"]):
            b += rule["bonus"]
    if "relief_min" in rule and site["climate"]["relief"] >= rule["relief_min"]:
        b += rule["bonus"]
    if "relief_max" in rule and site["climate"]["relief"] <= rule["relief_max"]:
        b += rule["bonus"]
    if "access_min" in rule and site["access"] >= rule["access_min"]:
        b += rule["bonus"]
    return b


def build(profile_key):
    meta = PROFILE_META[profile_key]
    chosen = []
    assignments = []
    used = set()
    for exp, dims, rule in meta["experiments"]:
        candidates = []
        for s in sites:
            if s["id"] in used:
                continue
            dim_score = sum(s["scores"][profile_key]["dimensions"][x] for x in dims) / len(dims) / 100.0
            value = dim_score * 0.86 + bonus(s, rule) + s["scores"][profile_key]["total"] / 100.0 * 0.14
            candidates.append((value, s))
        candidates.sort(key=lambda x: -x[0])
        value, site = candidates[0]
        used.add(site["id"])
        chosen.append(site)
        assignments.append({
            "experiment": exp,
            "site": site["name"],
            "siteId": site["id"],
            "country": site["country"],
            "window": site["windows"][profile_key],
            "score": site["scores"][profile_key]["total"],
            "dimensions": site["scores"][profile_key]["dimensions"],
            "fit": round(value * 100, 1),
        })
    # timeline: 2 travel + 4 field per site, 2 synthesis, 2 buffer
    day = 1
    timeline = []
    for a in assignments:
        timeline.append(dict(day=day, label=f"Travel to {a['site']}", type="travel", site=a["site"], days=2))
        day += 2
        timeline.append(dict(day=day, label=a["experiment"], type="field", site=a["site"], experiment=a["experiment"], days=4))
        day += 4
    timeline.append(dict(day=day, label="Synthesis & sample transfer", type="analysis", site="Campaign HQ", days=2))
    day += 2
    timeline.append(dict(day=day, label="Contingency / weather window", type="buffer", site="Campaign HQ", days=2))
    day += 2
    return dict(
        key=profile_key,
        name=meta["name"],
        sites=[dict(id=s["id"], name=s["name"], country=s["country"], score=s["scores"][profile_key]["total"], window=s["windows"][profile_key], image=s["image"], type=s["type"]) for s in chosen],
        assignments=assignments,
        timeline=timeline,
        totalDays=day - 1,
        interventions=meta["missing"],
        summary=f"{len(assignments)} experiments, {len(chosen)} sites, {day - 1} days. Facility-only conditions: {', '.join(meta['missing'])}.",
    )


d["campaigns"] = {k: build(k) for k in PROFILE_META}
PATH.write_text(json.dumps(d, indent=2))
for k, c in d["campaigns"].items():
    print("\n", k, c["totalDays"], "days")
    for a in c["assignments"]:
        print(f"  {a['experiment']:<28} -> {a['site']:<22} {a['country']:<14} score {a['score']} fit {a['fit']} {a['window']}")
