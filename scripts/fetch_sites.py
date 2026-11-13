#!/usr/bin/env python3
"""
Odyssey data pipeline.

Real inputs:
  - NASA POWER climatology (2001-2020): temperature, precipitation, humidity, wind, solar.
  - Open-Meteo elevation: site elevation + local relief (5 samples).
  - NASA GIBS / MODIS Terra true color: site satellite imagery.

Outputs:
  - src/data/odyssey.json
  - public/sites/<id>.jpg
"""

from __future__ import annotations

import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "src" / "data" / "odyssey.json"
OUT_IMG = ROOT / "public" / "sites"
OUT_IMG.mkdir(parents=True, exist_ok=True)

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

POWER_PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M,ALLSKY_SFC_SW_DWN"

SITES = [
    dict(
        id="atacama", name="Atacama Desert", country="Chile", lat=-23.5, lon=-68.2,
        type="Hyper-arid desert", tags=["basalt", "evaporite", "regolith", "clay"],
        access=0.72, dust=0.90, water=0.20,
        summary="The benchmark hyper-arid desert. Clear skies, salt basins and Mars-like soils, but heavily studied.",
        benchmark=True,
    ),
    dict(
        id="puna", name="Puna de Atacama", country="Argentina", lat=-24.5, lon=-67.5,
        type="High-altitude salt flat", tags=["evaporite", "basalt", "regolith", "clay"],
        access=0.52, dust=0.85, water=0.35,
        summary="A high-altitude Andean salt-and-volcanic plateau. Less crowded than the Chilean Atacama and rich in evaporites.",
    ),
    dict(
        id="danakil", name="Danakil Depression", country="Ethiopia", lat=14.24, lon=40.30,
        type="Volcanic / acidic basin", tags=["basalt", "evaporite", "iron", "regolith"],
        access=0.30, dust=0.75, water=0.10,
        summary="Below sea level, hot, salty and hydrothermally altered. A brutal multi-extreme analog for early Mars and volcanic Moon terrain.",
    ),
    dict(
        id="khaybar", name="Harrat Khaybar", country="Saudi Arabia", lat=25.0, lon=39.9,
        type="Basaltic volcanic field", tags=["basalt", "lava tube", "regolith"],
        access=0.58, dust=0.80, water=0.05,
        summary="A vast basalt field with lava tubes and cinder cones. A strong, under-studied regolith and subsurface analog.",
    ),
    dict(
        id="namib", name="Namib Desert", country="Namibia", lat=-23.5, lon=15.0,
        type="Desert / linear dunes", tags=["sand", "evaporite", "regolith"],
        access=0.48, dust=0.95, water=0.10,
        summary="The world's oldest desert. Linear dunes, dust and aeolian processes make it a process analog for Mars.",
    ),
    dict(
        id="bodele", name="Bodélé Depression", country="Chad", lat=17.0, lon=18.0,
        type="Dust source basin", tags=["evaporite", "clay", "sand"],
        access=0.22, dust=1.00, water=0.05,
        summary="One of Earth's largest dust sources. A direct process analog for Martian dust storms and atmospheric mineral loading.",
    ),
    dict(
        id="makgadikgadi", name="Makgadikgadi Pans", country="Botswana", lat=-20.5, lon=25.5,
        type="Salt pan", tags=["evaporite", "clay", "regolith"],
        access=0.58, dust=0.85, water=0.20,
        summary="A vast, flat salt pan with precise horizons and evaporite chemistry. Good for landing-zone and sample-return analog work.",
    ),
    dict(
        id="nullarbor", name="Nullarbor Plain", country="Australia", lat=-30.5, lon=129.0,
        type="Karst / cave terrain", tags=["limestone", "cave", "regolith"],
        access=0.52, dust=0.70, water=0.05,
        summary="A flat limestone karst with caves and solution features. A candidate for subsurface and habitation analog studies.",
    ),
    dict(
        id="chyulu", name="Chyulu Hills", country="Kenya", lat=-2.7, lon=37.8,
        type="Lava tube field", tags=["basalt", "lava tube", "regolith"],
        access=0.42, dust=0.60, water=0.30,
        summary="Long basaltic lava tubes in a tropical setting. A rare accessible subsurface analog for lunar lava-tube shelters.",
    ),
    dict(
        id="undara", name="Undara Volcanic", country="Australia", lat=-18.2, lon=144.6,
        type="Lava tube field", tags=["basalt", "lava tube", "regolith"],
        access=0.48, dust=0.65, water=0.20,
        summary="A well-preserved lava-tube system. Useful for testing subsurface mobility, shielding and habitat concepts.",
    ),
    dict(
        id="kerguelen", name="Kerguelen Islands", country="France", lat=-49.3, lon=69.5,
        type="Polar volcanic island", tags=["basalt", "glacier", "regolith"],
        access=0.12, dust=0.40, water=0.70,
        summary="Remote, cold, windy and volcanic. An isolation and operations analog with strong logistical constraints.",
    ),
    dict(
        id="devon", name="Devon Island", country="Canada", lat=75.0, lon=-87.0,
        type="Polar desert / impact crater", tags=["impact", "regolith", "ice", "basalt"],
        access=0.18, dust=0.50, water=0.60,
        summary="Home of Haughton Crater and the Haughton-Mars Project. A classic Mars analog, useful as a calibration site.",
        benchmark=True,
    ),
    dict(
        id="svalbard", name="Svalbard", country="Norway", lat=78.2, lon=15.6,
        type="Polar desert", tags=["basalt", "glacier", "regolith", "ice"],
        access=0.42, dust=0.50, water=0.70,
        summary="Cold, dry and accessible. A polar-desert analog for thermal extremes, ice and low-light operations.",
        benchmark=True,
    ),
    dict(
        id="riotinto", name="Río Tinto", country="Spain", lat=37.7, lon=-6.6,
        type="Acidic river system", tags=["iron", "clay", "sulfate"],
        access=0.78, dust=0.40, water=0.40,
        summary="An acidic, iron-rich river with extremophiles. A benchmark analog for Martian aqueous alteration and habitability.",
        benchmark=True,
    ),
    dict(
        id="lonar", name="Lonar Crater", country="India", lat=19.97, lon=76.5,
        type="Impact crater / basalt", tags=["impact", "basalt", "evaporite"],
        access=0.68, dust=0.55, water=0.40,
        summary="A young basaltic impact crater with a saline lake. A compact analog for crater lakes, basalt and landing terrain.",
    ),
    dict(
        id="qaidam", name="Qaidam Basin", country="China", lat=37.0, lon=94.0,
        type="Cold desert basin", tags=["evaporite", "sand", "clay"],
        access=0.38, dust=0.80, water=0.15,
        summary="A high, cold, hyper-arid basin with yardangs, salts and strong winds. A less-studied Mars analog candidate.",
    ),
    dict(
        id="gobi", name="Gobi Desert", country="Mongolia", lat=42.5, lon=103.0,
        type="Cold desert", tags=["sand", "regolith", "evaporite"],
        access=0.32, dust=0.90, water=0.05,
        summary="A vast cold desert with dust storms and low vegetation. A process analog for Martian aeolian activity.",
    ),
    dict(
        id="dryvalleys", name="McMurdo Dry Valleys", country="Antarctica", lat=-77.5, lon=162.0,
        type="Polar desert", tags=["glacier", "regolith", "ice", "basalt"],
        access=0.08, dust=0.30, water=0.60,
        summary="The driest, coldest non-polar desert on Earth. A benchmark for polar desert and subsurface ice studies.",
        benchmark=True,
    ),
    dict(
        id="iceland", name="Icelandic Highlands", country="Iceland", lat=64.0, lon=-19.0,
        type="Volcanic / glacial", tags=["basalt", "glacier", "regolith"],
        access=0.62, dust=0.60, water=0.50,
        summary="Basaltic lavas, glacial outwash and wind-driven ash. A well-studied volcanic analog for Moon and Mars terrain.",
        benchmark=True,
    ),
]

PROFILES = {
    "lunar_base": dict(
        key="lunar_base",
        name="Permanent Lunar South Pole Base",
        short="Lunar base",
        target=dict(
            temp=(-50, 0), amp=(120, 300), precip=(0, 20), humidity=(0, 15),
            wind=(0, 6), relief=(50, 1200),
            geology=["basalt", "regolith", "lava tube", "evaporite"],
            dust=0.90, access=(0.35, 0.90),
        ),
        weights=dict(thermal=0.24, aridity=0.10, terrain=0.18, geology=0.22, dust=0.10, access=0.16),
        experiments=["Regolith & construction", "Thermal & illumination", "Subsurface & shielding"],
        missing=["gravity 0.166 g", "surface pressure ~0 kPa", "radiation environment"],
    ),
    "mars_landing": dict(
        key="mars_landing",
        name="Mars Landing & Exploration",
        short="Mars landing",
        target=dict(
            temp=(-80, 0), amp=(50, 100), precip=(0, 30), humidity=(0, 25),
            wind=(2, 15), relief=(100, 1500),
            geology=["iron", "clay", "sulfate", "basalt", "evaporite"],
            dust=0.92, access=(0.35, 0.90),
        ),
        weights=dict(thermal=0.15, aridity=0.18, terrain=0.18, geology=0.22, dust=0.17, access=0.10),
        experiments=["Dust & aeolian processes", "Mineralogy & habitability", "Terrain & rover operations"],
        missing=["gravity 0.38 g", "atmosphere 0.6 kPa", "radiation environment"],
    ),
    "expedition": dict(
        key="expedition",
        name="7-Day Lunar Surface Expedition",
        short="Lunar expedition",
        target=dict(
            temp=(-20, 20), amp=(30, 100), precip=(0, 30), humidity=(0, 30),
            wind=(0, 8), relief=(100, 1500),
            geology=["basalt", "regolith", "lava tube"],
            dust=0.90, access=(0.45, 0.95),
        ),
        weights=dict(thermal=0.16, aridity=0.08, terrain=0.22, geology=0.24, dust=0.12, access=0.18),
        experiments=["Geological sampling", "Rover navigation", "Equipment deployment"],
        missing=["gravity 0.166 g", "surface pressure ~0 kPa", "radiation environment"],
    ),
}


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def range_score(value, bounds, softness):
    lo, hi = bounds
    if lo <= value <= hi:
        return 1.0
    if value < lo:
        return math.exp(-((lo - value) / softness) ** 2)
    return math.exp(-((value - hi) / softness) ** 2)


def geology_score(tags, target_tags):
    if not tags or not target_tags:
        return 0.0
    overlap = len(set(tags) & set(target_tags))
    if overlap:
        return clamp(0.72 + 0.09 * overlap)
    # partial credit for related materials
    related = {
        "basalt": {"impact", "regolith", "lava tube", "iron"},
        "regolith": {"sand", "clay", "impact", "basalt"},
        "evaporite": {"salt", "clay", "sulfate", "ice"},
        "iron": {"sulfate", "clay", "basalt"},
        "clay": {"sulfate", "evaporite", "iron"},
        "ice": {"glacier", "water", "evaporite"},
        "cave": {"lava tube", "limestone"},
        "lava tube": {"cave", "basalt"},
    }
    for t in tags:
        if related.get(t, set()) & set(target_tags):
            return 0.48
    return 0.15


def score_site(site, profile, climate):
    t = profile["target"]
    w = profile["weights"]
    temp_mean = climate["tempMean"]
    temp_amp = climate["tempAmp"]
    precip = climate["precipYear"]
    humidity = climate["humidity"]
    wind = climate["wind"]
    relief = climate["relief"]

    thermal = 0.6 * range_score(temp_mean, t["temp"], max(12, (t["temp"][1] - t["temp"][0]) * 0.55)) + \
              0.4 * range_score(temp_amp, t["amp"], max(15, (t["amp"][1] - t["amp"][0]) * 0.55))
    aridity = 0.6 * range_score(precip, t["precip"], 120) + 0.4 * range_score(humidity, t["humidity"], 18)
    terrain = range_score(relief, t["relief"], 420)
    geology = geology_score(site["tags"], t["geology"])
    dust = clamp(1.0 - abs(site["dust"] - t["dust"]) * 1.25)
    access = range_score(site["access"], t["access"], 0.28)

    dims = dict(thermal=thermal, aridity=aridity, terrain=terrain, geology=geology, dust=dust, access=access)
    total = sum(dims[k] * w[k] for k in w) * 100

    missing = []
    for key, label in [
        ("thermal", "thermal envelope"),
        ("aridity", "dry / volatile regime"),
        ("terrain", "terrain relief"),
        ("geology", "surface materials"),
        ("dust", "dust / aeolian regime"),
        ("access", "field access"),
    ]:
        if dims[key] < 0.55:
            missing.append(label)

    confidence = 0.72
    if climate.get("complete"):
        confidence += 0.12
    if relief > 0:
        confidence += 0.06
    if site.get("benchmark"):
        confidence += 0.04
    confidence = round(min(confidence, 0.96), 2)

    return dict(
        total=round(total, 1),
        dimensions={k: round(v * 100, 1) for k, v in dims.items()},
        confidence=confidence,
        missing=missing,
        rationale=build_rationale(site, dims, profile),
    )


def build_rationale(site, dims, profile):
    best = sorted(dims.items(), key=lambda kv: -kv[1])[:2]
    worst = sorted(dims.items(), key=lambda kv: kv[1])[:2]
    labels = {
        "thermal": "thermal behavior", "aridity": "dryness / volatiles",
        "terrain": "terrain relief", "geology": "surface materials",
        "dust": "dust regime", "access": "field access",
    }
    return (
        f"Strongest on {labels[best[0][0]]} and {labels[best[1][0]]}; "
        f"weakest on {labels[worst[0][0]]} and {labels[worst[1][0]]}."
    )


def fetch_power(lat, lon):
    url = "https://power.larc.nasa.gov/api/temporal/climatology/point"
    params = {
        "parameters": POWER_PARAMS,
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "format": "JSON",
        "start": "2001",
        "end": "2020",
    }
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=45)
            r.raise_for_status()
            data = r.json()
            p = data["properties"]["parameter"]
            out = {}
            for key in ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "WS2M", "RH2M", "ALLSKY_SFC_SW_DWN"]:
                if key in p:
                    out[key] = {m: p[key].get(m) for m in MONTHS + ["ANN"]}
            return out
        except Exception as e:
            if attempt == 2:
                print(f"  POWER failed for {lat},{lon}: {e}")
                return {}
            time.sleep(1.5)
    return {}


def fetch_elevations(lat, lon):
    # center + four samples for local relief
    offsets = [(0, 0), (0.18, 0), (-0.18, 0), (0, 0.18), (0, -0.18)]
    lats = ",".join(str(round(lat + a, 4)) for a, b in offsets)
    lons = ",".join(str(round(lon + b, 4)) for a, b in offsets)
    url = f"https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lons}"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        values = r.json().get("elevation", [])
        if values and values[0] is not None:
            center = float(values[0])
            allv = [float(v) for v in values if v is not None]
            relief = max(allv) - min(allv)
            return center, relief
    except Exception as e:
        print(f"  elevation failed for {lat},{lon}: {e}")
    return 0.0, 0.0


def deg2num(lat, lon, z):
    lat_r = math.radians(lat)
    n = 2.0 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return int(x), int(y)


def fetch_gibs(site, z=7, size=4, out_size=(900, 560)):
    out_path = OUT_IMG / f"{site['id']}.jpg"
    if out_path.exists():
        return str(out_path)
    x, y = deg2num(site["lat"], site["lon"], z)
    half = size // 2
    tiles = []
    for dy in range(-half, half):
        row = []
        for dx in range(-half, half):
            tx, ty = x + dx, y + dy
            url = (
                "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
                "MODIS_Terra_CorrectedReflectance_TrueColor/default/2020-07-01/"
                f"GoogleMapsCompatible_Level9/{z}/{ty}/{tx}.jpg"
            )
            try:
                r = requests.get(url, timeout=30, headers={"User-Agent": "Odyssey/1.0"})
                if r.status_code == 200 and r.content[:2] == b"\xff\xd8":
                    row.append(Image.open(BytesIO(r.content)).convert("RGB"))
                else:
                    row.append(Image.new("RGB", (256, 256), (8, 14, 18)))
            except Exception:
                row.append(Image.new("RGB", (256, 256), (8, 14, 18)))
        tiles.append(row)
    if not tiles:
        return ""
    w = sum(im.width for im in tiles[0])
    h = sum(row[0].height for row in tiles)
    mosaic = Image.new("RGB", (w, h))
    yy = 0
    for row in tiles:
        xx = 0
        for im in row:
            mosaic.paste(im, (xx, yy))
            xx += im.width
        yy += row[0].height
    # crop center
    target_w, target_h = out_size
    cx, cy = w // 2, h // 2
    left = max(0, cx - target_w // 2)
    top = max(0, cy - target_h // 2)
    crop = mosaic.crop((left, top, left + target_w, top + target_h))
    # grade: deep contrast, subtle teal
    crop = crop.resize((target_w, target_h), Image.LANCZOS)
    crop.save(out_path, quality=88, optimize=True)
    return str(out_path)


def month_score(temp, precip, profile):
    t = profile["target"]
    ts = range_score(temp, t["temp"], max(12, (t["temp"][1] - t["temp"][0]) * 0.55))
    ps = range_score(precip, (0, max(2, t["precip"][1] * 0.4)), 6)
    return ts * 0.7 + ps * 0.3


def best_window(monthly, profile):
    scores = []
    for i, m in enumerate(MONTHS):
        t = monthly.get("T2M", {}).get(m)
        p = monthly.get("PRECTOTCORR", {}).get(m)
        if t is None or p is None:
            scores.append(0.0)
        else:
            scores.append(month_score(float(t), float(p), profile))
    best = max(range(12), key=lambda i: scores[i] + scores[(i + 1) % 12] * 0.55)
    nxt = (best + 1) % 12
    return [MONTH_LABELS[best], MONTH_LABELS[nxt]], scores


def build_campaign(profile_key, sites, scored):
    profile = PROFILES[profile_key]
    ranked = sorted(scored, key=lambda s: -s["scores"][profile_key]["total"])
    chosen = []
    used_types = set()
    for s in ranked:
        if len(chosen) >= 3:
            break
        if s["id"] in {c["id"] for c in chosen}:
            continue
        if s["type"] in used_types and len(chosen) < 2:
            continue
        chosen.append(s)
        used_types.add(s["type"])
    if len(chosen) < 3:
        for s in ranked:
            if len(chosen) >= 3:
                break
            if s["id"] not in {c["id"] for c in chosen}:
                chosen.append(s)

    # assign experiments to sites by strongest relevant dimension
    dim_for_exp = {
        "Regolith & construction": ["geology", "access"],
        "Thermal & illumination": ["thermal"],
        "Subsurface & shielding": ["geology", "terrain"],
        "Dust & aeolian processes": ["dust", "aridity"],
        "Mineralogy & habitability": ["geology", "aridity"],
        "Terrain & rover operations": ["terrain", "access"],
        "Geological sampling": ["geology"],
        "Rover navigation": ["terrain", "access"],
        "Equipment deployment": ["access", "terrain"],
    }
    remaining = list(chosen)
    assignments = []
    for exp in profile["experiments"]:
        dims = dim_for_exp.get(exp, ["geology"])
        best_site = max(remaining or chosen, key=lambda s: sum(s["scores"][profile_key]["dimensions"][d] for d in dims))
        if best_site in remaining:
            remaining.remove(best_site)
        assignments.append({
            "experiment": exp,
            "site": best_site["name"],
            "siteId": best_site["id"],
            "country": best_site["country"],
            "window": best_site["windows"][profile_key],
            "score": best_site["scores"][profile_key]["total"],
            "dimensions": best_site["scores"][profile_key]["dimensions"],
        })

    # 21-day timeline
    day = 1
    timeline = []
    for i, a in enumerate(assignments):
        timeline.append(dict(day=day, label=f"Travel to {a['site']}", type="travel", site=a["site"]))
        day += 2
        timeline.append(dict(day=day, label=f"{a['experiment']} / {a['site']}", type="field", site=a["site"], experiment=a["experiment"], days=4))
        day += 4
    timeline.append(dict(day=day, label="Synthesis & sample transfer", type="analysis", site="Campaign HQ"))
    day += 2
    return dict(
        key=profile_key,
        name=profile["name"],
        sites=[dict(id=s["id"], name=s["name"], country=s["country"], score=s["scores"][profile_key]["total"], window=s["windows"][profile_key], image=s["image"], type=s["type"]) for s in chosen],
        assignments=assignments,
        timeline=timeline,
        totalDays=day - 1,
        interventions=profile["missing"],
        summary=f"{len(assignments)} experiments, {len(chosen)} sites, {day - 1} days. Facility-only conditions: {', '.join(profile['missing'])}.",
    )


def main():
    print(f"Fetching {len(SITES)} sites...")
    results = []
    for idx, site in enumerate(SITES, 1):
        print(f"[{idx}/{len(SITES)}] {site['name']}")
        power = fetch_power(site["lat"], site["lon"])
        elev, relief = fetch_elevations(site["lat"], site["lon"])
        image = fetch_gibs(site)
        if not power:
            print("  skipping, no climate data")
            continue
        monthly_t = {m: power.get("T2M", {}).get(m) for m in MONTHS}
        monthly_p = {m: power.get("PRECTOTCORR", {}).get(m) for m in MONTHS}
        vals_t = [float(v) for v in monthly_t.values() if v is not None]
        vals_p = [float(v) for v in monthly_p.values() if v is not None]
        temp_mean = float(power.get("T2M", {}).get("ANN") or (sum(vals_t) / len(vals_t)))
        temp_max = float(power.get("T2M_MAX", {}).get("ANN") or temp_mean)
        temp_min = float(power.get("T2M_MIN", {}).get("ANN") or temp_mean)
        precip_day = float(power.get("PRECTOTCORR", {}).get("ANN") or 0)
        humidity = float(power.get("RH2M", {}).get("ANN") or 0)
        wind = float(power.get("WS2M", {}).get("ANN") or 0)
        solar = float(power.get("ALLSKY_SFC_SW_DWN", {}).get("ANN") or 0)
        climate = dict(
            tempMean=round(temp_mean, 1),
            tempMax=round(temp_max, 1),
            tempMin=round(temp_min, 1),
            tempAmp=round(temp_max - temp_min, 1),
            seasonalAmp=round(max(vals_t) - min(vals_t), 1) if vals_t else 0,
            precipDay=round(precip_day, 2),
            precipYear=round(precip_day * 365, 1),
            humidity=round(humidity, 1),
            wind=round(wind, 1),
            solar=round(solar, 2),
            elevation=round(elev, 0),
            relief=round(relief, 0),
            complete=len(vals_t) == 12 and len(vals_p) == 12,
        )
        scored = {}
        for key, profile in PROFILES.items():
            scored[key] = score_site(site, profile, climate)
        windows = {}
        for key, profile in PROFILES.items():
            win, _ = best_window({"T2M": monthly_t, "PRECTOTCORR": monthly_p}, profile)
            windows[key] = win
        results.append(dict(
            **site,
            image=f"/sites/{site['id']}.jpg" if image else "",
            climate=climate,
            monthly={
                "temp": [round(float(monthly_t[m]), 1) if monthly_t[m] is not None else None for m in MONTHS],
                "precip": [round(float(monthly_p[m]), 2) if monthly_p[m] is not None else None for m in MONTHS],
            },
            scores=scored,
            windows=windows,
        ))

    campaigns = {}
    for key in PROFILES:
        campaigns[key] = build_campaign(key, SITES, results)

    payload = dict(
        generatedAt=datetime.now(timezone.utc).isoformat(),
        source="NASA POWER climatology 2001-2020; Open-Meteo elevation; NASA GIBS/MODIS Terra true color (2020, multiple dates)",
        profiles={k: {kk: vv for kk, vv in v.items() if kk not in ("target", "weights")} for k, v in PROFILES.items()},
        sites=results,
        campaigns=campaigns,
    )
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT_JSON} ({len(results)} sites)")


if __name__ == "__main__":
    main()
