#!/usr/bin/env python3
"""
Odyssey enrichment pipeline.

Adds:
  - 15 more candidate sites
  - NASA POWER AOD_55, GWETTOP, GWETROOT, PS
  - Macrostrat geologic units (CC-BY 4.0)
  - Nearest-airport logistics + travel matrix
  - A learned RandomForest surrogate per mission profile
  - Travel-aware multi-site campaign optimization

Run:
  python3 scripts/enrich.py
"""

from __future__ import annotations

import json
import math
import random
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageStat
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from fetch_sites import (  # noqa: E402
    MONTHS,
    PROFILES,
    fetch_elevations,
    fetch_gibs,
    geology_score,
    range_score,
)

DATA_PATH = ROOT / "src" / "data" / "odyssey.json"
IMG_DIR = ROOT / "public" / "sites"
DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
IMG_DIR.mkdir(parents=True, exist_ok=True)

POWER_PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M,ALLSKY_SFC_SW_DWN,AOD_55,GWETTOP,GWETROOT,PS"

NEW_SITES = [
    dict(id="wadirum", name="Wadi Rum", country="Jordan", lat=29.58, lon=35.42,
         type="Sandstone desert", tags=["sand", "clay", "regolith"], access=0.68, dust=0.82, water=0.05,
         summary="A protected sandstone desert with towering massifs, sand valleys and Bedouin access. A strong aeolian and field-operations analog."),
    dict(id="ergchebbi", name="Erg Chebbi", country="Morocco", lat=31.15, lon=-4.00,
         type="Erg / linear dunes", tags=["sand", "evaporite", "regolith"], access=0.60, dust=0.95, water=0.05,
         summary="A compact erg of high star dunes on the Sahara's northern edge. Excellent for rover mobility and dust studies."),
    dict(id="wawannamus", name="Waw an Namus", country="Libya", lat=24.90, lon=17.80,
         type="Volcanic crater oasis", tags=["basalt", "regolith", "evaporite"], access=0.15, dust=0.90, water=0.10,
         summary="A remote volcanic crater with basaltic tephra and salt deposits in the central Sahara. Under-studied and logistically hard."),
    dict(id="oldoinyo", name="Ol Doinyo Lengai", country="Tanzania", lat=-2.76, lon=35.91,
         type="Carbonatite volcano", tags=["volcanic", "basalt", "evaporite"], access=0.35, dust=0.50, water=0.20,
         summary="The only active carbonatite volcano on Earth. A rare process analog for alkaline volcanism and rapid alteration."),
    dict(id="uyuni", name="Salar de Uyuni", country="Bolivia", lat=-20.13, lon=-67.49,
         type="Salt flat", tags=["evaporite", "clay", "regolith"], access=0.55, dust=0.80, water=0.30,
         summary="The world's largest salt flat: precise horizons, evaporite chemistry and seasonal flooding. A landing-zone and sample-return analog."),
    dict(id="pinacate", name="Pinacate Volcanic Field", country="Mexico", lat=31.77, lon=-113.50,
         type="Basaltic volcanic field", tags=["basalt", "lava tube", "regolith"], access=0.55, dust=0.80, water=0.05,
         summary="A UNESCO biosphere reserve of maars, cinder cones and lava tubes. Accessible basaltic terrain for rover and subsurface tests."),
    dict(id="mojave", name="Mojave Desert", country="USA", lat=35.00, lon=-115.50,
         type="Desert", tags=["sand", "regolith", "evaporite"], access=0.70, dust=0.85, water=0.05,
         summary="A dry, accessible desert with playas, basalts and strong dust activity. A practical operations analog with good logistics."),
    dict(id="cratersmoon", name="Craters of the Moon", country="USA", lat=43.40, lon=-113.50,
         type="Basaltic lava field", tags=["basalt", "lava tube", "regolith"], access=0.65, dust=0.60, water=0.10,
         summary="A young basaltic lava field with lava tubes and cinder cones. A strong, accessible regolith and subsurface analog."),
    dict(id="kamchatka", name="Kamchatka Volcanic Field", country="Russia", lat=56.00, lon=160.00,
         type="Volcanic / glacial", tags=["basalt", "volcanic", "glacier"], access=0.20, dust=0.60, water=0.50,
         summary="A remote volcanic peninsula with basaltic lavas, ash and glaciers. A high-energy process analog with severe logistics."),
    dict(id="kawahijen", name="Kawah Ijen", country="Indonesia", lat=-8.06, lon=114.24,
         type="Acidic crater lake", tags=["volcanic", "sulfate", "iron"], access=0.45, dust=0.40, water=0.30,
         summary="An acidic, sulfur-rich crater lake with hydrothermal alteration. A Mars aqueous-chemistry analog in a tropical setting."),
    dict(id="pinnacles", name="Pinnacles Desert", country="Australia", lat=-30.60, lon=115.10,
         type="Limestone karst", tags=["limestone", "cave", "regolith"], access=0.40, dust=0.70, water=0.05,
         summary="A field of limestone pillars and karst cavities in an arid setting. A subsurface and construction analog."),
    dict(id="whitedesert", name="White Desert", country="Egypt", lat=27.30, lon=28.00,
         type="Chalk desert", tags=["limestone", "evaporite", "regolith"], access=0.45, dust=0.85, water=0.05,
         summary="A chalk and evaporite desert with dramatic yardangs. A low-cost, accessible testbed for dust and soft-rock operations."),
    dict(id="axelheiberg", name="Axel Heiberg Island", country="Canada", lat=79.40, lon=-90.00,
         type="Polar desert", tags=["glacier", "regolith", "ice", "basalt"], access=0.12, dust=0.40, water=0.70,
         summary="A high-Arctic polar desert with ice, dry valleys and impact-like terrain. A cold, isolated Moon/Mars analog."),
    dict(id="kangerlussuaq", name="Kangerlussuaq", country="Greenland", lat=67.00, lon=-50.70,
         type="Polar / glacial", tags=["glacier", "regolith", "ice"], access=0.55, dust=0.40, water=0.60,
         summary="A dry, ice-marginal polar landscape with road access and an international airport. A practical cold-climate analog."),
    dict(id="deathvalley", name="Death Valley", country="USA", lat=36.50, lon=-116.90,
         type="Extreme desert", tags=["evaporite", "sand", "regolith"], access=0.70, dust=0.90, water=0.05,
         summary="The hottest place on Earth, with salt pans, alluvial fans and extreme thermal cycling. A benchmark thermal-stress analog."),
    dict(id="meteorcrater", name="Meteor Crater", country="USA", lat=35.03, lon=-111.02,
         type="Impact crater", tags=["impact", "sand", "limestone"], access=0.75, dust=0.70, water=0.05,
         summary="A young, well-preserved 1.2 km impact crater in northern Arizona. A compact analogue for crater morphology and ejecta."),
    dict(id="wolfeCreek", name="Wolfe Creek Crater", country="Australia", lat=-19.17, lon=127.79,
         type="Impact crater", tags=["impact", "sand", "regolith"], access=0.18, dust=0.80, water=0.05,
         summary="A 880 m meteorite crater in the remote Kimberley. A pristine impact analogue with severe logistics."),
    dict(id="lanzarote", name="Lanzarote", country="Spain", lat=29.04, lon=-13.63,
         type="Volcanic lava tubes", tags=["basalt", "lava tube", "regolith"], access=0.72, dust=0.50, water=0.10,
         summary="A volcanic island with extensive lava tubes and basaltic terrain. Accessible subsurface and regolith analogue."),
    dict(id="hawaii", name="Hawaii Volcanoes", country="USA", lat=19.42, lon=-155.29,
         type="Basaltic lava tubes", tags=["basalt", "lava tube", "regolith"], access=0.60, dust=0.40, water=0.30,
         summary="Active basaltic volcanism with lava tubes and fresh flows. A high-fidelity lunar regolith and subsurface analogue."),
    dict(id="socotra", name="Socotra", country="Yemen", lat=12.50, lon=54.00,
         type="Limestone / desert", tags=["limestone", "sand", "evaporite"], access=0.15, dust=0.80, water=0.10,
         summary="An isolated limestone and desert island with unusual endemism. A remote karst and arid-terrain analogue."),
]

AIRPORTS = {
    "atacama": dict(name="Calama / El Loa", iata="CJC", lat=-22.50, lon=-68.90, groundHours=1.5, hub="Chile"),
    "puna": dict(name="Salta", iata="SLA", lat=-24.85, lon=-65.48, groundHours=3.0, hub="Argentina"),
    "danakil": dict(name="Mekele", iata="MQX", lat=13.47, lon=39.53, groundHours=4.0, hub="Ethiopia"),
    "khaybar": dict(name="Medina", iata="MED", lat=24.55, lon=39.70, groundHours=2.5, hub="Saudi Arabia"),
    "namib": dict(name="Windhoek", iata="WDH", lat=-22.48, lon=17.47, groundHours=4.0, hub="Namibia"),
    "bodele": dict(name="N'Djamena", iata="NDJ", lat=12.13, lon=15.03, groundHours=10.0, hub="Chad"),
    "makgadikgadi": dict(name="Maun", iata="MUB", lat=-19.97, lon=23.43, groundHours=3.0, hub="Botswana"),
    "nullarbor": dict(name="Adelaide", iata="ADL", lat=-34.95, lon=138.60, groundHours=8.0, hub="Australia"),
    "chyulu": dict(name="Nairobi", iata="NBO", lat=-1.32, lon=36.93, groundHours=4.0, hub="Kenya"),
    "undara": dict(name="Cairns", iata="CNS", lat=-16.88, lon=145.75, groundHours=3.0, hub="Australia"),
    "kerguelen": dict(name="Reunion", iata="RUN", lat=-20.89, lon=55.51, groundHours=96.0, hub="France"),
    "devon": dict(name="Resolute Bay", iata="YRB", lat=74.72, lon=-94.97, groundHours=2.0, hub="Canada"),
    "svalbard": dict(name="Longyearbyen", iata="LYR", lat=78.25, lon=15.47, groundHours=0.5, hub="Norway"),
    "riotinto": dict(name="Seville", iata="SVQ", lat=37.42, lon=-5.90, groundHours=1.5, hub="Spain"),
    "lonar": dict(name="Aurangabad", iata="IXU", lat=19.86, lon=75.40, groundHours=2.0, hub="India"),
    "qaidam": dict(name="Golmud", iata="GOQ", lat=36.40, lon=94.90, groundHours=3.0, hub="China"),
    "gobi": dict(name="Dalanzadgad", iata="DLZ", lat=43.60, lon=104.40, groundHours=2.0, hub="Mongolia"),
    "dryvalleys": dict(name="Christchurch", iata="CHC", lat=-43.49, lon=172.53, groundHours=8.0, hub="New Zealand"),
    "iceland": dict(name="Keflavik", iata="KEF", lat=63.99, lon=-22.62, groundHours=3.0, hub="Iceland"),
    "wadirum": dict(name="Aqaba", iata="AQJ", lat=29.61, lon=35.02, groundHours=1.0, hub="Jordan"),
    "ergchebbi": dict(name="Errachidia", iata="ERH", lat=31.95, lon=-4.40, groundHours=2.0, hub="Morocco"),
    "wawannamus": dict(name="Sabha", iata="SEB", lat=27.00, lon=14.50, groundHours=8.0, hub="Libya"),
    "oldoinyo": dict(name="Kilimanjaro", iata="JRO", lat=-3.43, lon=37.07, groundHours=5.0, hub="Tanzania"),
    "uyuni": dict(name="Uyuni", iata="UYU", lat=-20.45, lon=-66.85, groundHours=1.0, hub="Bolivia"),
    "pinacate": dict(name="Phoenix", iata="PHX", lat=33.43, lon=-112.00, groundHours=3.0, hub="USA"),
    "mojave": dict(name="Las Vegas", iata="LAS", lat=36.08, lon=-115.15, groundHours=2.0, hub="USA"),
    "cratersmoon": dict(name="Idaho Falls", iata="IDA", lat=43.51, lon=-112.07, groundHours=2.0, hub="USA"),
    "kamchatka": dict(name="Petropavlovsk", iata="PKC", lat=53.17, lon=158.45, groundHours=6.0, hub="Russia"),
    "kawahijen": dict(name="Surabaya", iata="SUB", lat=-7.38, lon=112.79, groundHours=6.0, hub="Indonesia"),
    "pinnacles": dict(name="Perth", iata="PER", lat=-31.94, lon=115.97, groundHours=4.0, hub="Australia"),
    "whitedesert": dict(name="Cairo", iata="CAI", lat=30.12, lon=31.40, groundHours=5.0, hub="Egypt"),
    "axelheiberg": dict(name="Resolute Bay", iata="YRB", lat=74.72, lon=-94.97, groundHours=4.0, hub="Canada"),
    "kangerlussuaq": dict(name="Kangerlussuaq", iata="SFJ", lat=67.01, lon=-50.71, groundHours=0.5, hub="Greenland"),
    "deathvalley": dict(name="Las Vegas", iata="LAS", lat=36.08, lon=-115.15, groundHours=2.5, hub="USA"),
    "meteorcrater": dict(name="Flagstaff", iata="FLG", lat=35.14, lon=-111.67, groundHours=0.75, hub="USA"),
    "wolfeCreek": dict(name="Halls Creek", iata="HCQ", lat=-18.23, lon=127.67, groundHours=2.0, hub="Australia"),
    "lanzarote": dict(name="Lanzarote", iata="ACE", lat=28.95, lon=-13.61, groundHours=0.5, hub="Spain"),
    "hawaii": dict(name="Hilo", iata="ITO", lat=19.72, lon=-155.05, groundHours=1.0, hub="USA"),
    "socotra": dict(name="Socotra", iata="SCT", lat=12.63, lon=53.91, groundHours=0.5, hub="Yemen"),
}

LITH_TAGS = {
    "basalt": "basalt", "mafic": "basalt", "volcanic": "volcanic",
    "evaporite": "evaporite", "salt": "evaporite", "gypsum": "evaporite",
    "limestone": "limestone", "carbonate": "limestone", "dolomite": "limestone",
    "sandstone": "sand", "sand": "sand", "shale": "clay", "mudstone": "clay",
    "clay": "clay", "iron": "iron", "sulfate": "sulfate", "glacial": "glacier",
    "till": "glacier", "ice": "ice", "alluvium": "regolith", "colluvium": "regolith",
    "granite": "granite", "gneiss": "granite", "schist": "granite",
    "rhyolite": "volcanic", "andesite": "volcanic", "tuff": "volcanic",
    "chert": "sedimentary", "coal": "sedimentary", "phosphorite": "sedimentary",
}


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def lith_tags(lith: str) -> list[str]:
    l = (lith or "").lower()
    tags = []
    for k, v in LITH_TAGS.items():
        if k in l:
            tags.append(v)
    return sorted(set(tags))


def fetch_power_full(lat, lon):
    url = "https://power.larc.nasa.gov/api/temporal/climatology/point"
    params = dict(parameters=POWER_PARAMS, community="RE", longitude=lon, latitude=lat,
                  format="JSON", start="2001", end="2020")
    try:
        r = requests.get(url, params=params, timeout=50)
        r.raise_for_status()
        p = r.json()["properties"]["parameter"]
        out = {}
        for key in POWER_PARAMS.split(","):
            if key in p:
                out[key] = {m: p[key].get(m) for m in MONTHS + ["ANN"]}
        return out
    except Exception as e:
        print(f"  POWER failed {lat},{lon}: {e}")
        return {}


def fetch_macrostrat(lat, lon):
    for attempt in range(4):
        try:
            r = requests.get(
                "https://macrostrat.org/api/geologic_units/map",
                params={"lat": lat, "lng": lon},
                timeout=30,
            )
            r.raise_for_status()
            data = r.json().get("success", {}).get("data", [])
            if not data:
                return {}
            unit = next((u for u in data if u.get("lith")), data[0])
            lith = unit.get("lith", "")
            return {
                "lith": lith,
                "age": unit.get("best_int_name", ""),
                "unit": unit.get("name", ""),
                "tags": lith_tags(lith),
                "source": "Macrostrat CC-BY 4.0",
            }
        except Exception as e:
            if attempt == 3:
                print(f"  Macrostrat failed {lat},{lon}: {e}")
                return {}
            time.sleep(1.2)
    return {}


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def travel(a, b):
    A, B = a["airport"], b["airport"]
    km = haversine(A["lat"], A["lon"], B["lat"], B["lon"])
    if km < 500:
        hours = km / 70 + 1
        cost = 50 + km * 0.6
        mode = "ground"
    else:
        flight = km / 850 + 0.75
        connection = 3 if km > 4000 else 1.5
        ground = A["groundHours"] + B["groundHours"]
        hours = flight + connection + ground + 1
        cost = 250 + km * 0.09 + ground * 60
        mode = "air + ground"
    return dict(
        fromId=a["id"], toId=b["id"],
        fromName=a["name"], toName=b["name"],
        fromAirport=A["iata"], toAirport=B["iata"],
        fromHub=A["hub"], toHub=B["hub"],
        km=round(km), hours=round(hours, 1), cost=round(cost), mode=mode,
    )


def score_site_new(site, profile_key, climate):
    profile = PROFILES[profile_key]
    t = profile["target"]
    w = profile["weights"]
    temp_mean = climate["tempMean"]
    temp_amp = climate["tempAmp"]
    precip = climate["precipYear"]
    humidity = climate["humidity"]
    wind = climate["wind"]
    relief = climate["relief"]
    soil = climate.get("soilWetnessTop", 0.2)
    aerosol = climate.get("aerosol", 0.2)

    thermal = 0.6 * range_score(temp_mean, t["temp"], max(12, (t["temp"][1] - t["temp"][0]) * 0.55)) + \
              0.4 * range_score(temp_amp, t["amp"], max(15, (t["amp"][1] - t["amp"][0]) * 0.55))
    aridity = 0.45 * range_score(precip, t["precip"], 120) + \
              0.25 * range_score(humidity, t["humidity"], 18) + \
              0.30 * (1 - clamp(soil / 0.6))
    terrain = range_score(relief, t["relief"], 420)
    tags = list(set(site.get("tags", [])) | set(site.get("macrostrat", {}).get("tags", [])))
    geology = geology_score(tags, t["geology"])
    dust = 0.50 * clamp(1 - abs(site["dust"] - t["dust"]) * 1.25) + \
           0.30 * clamp(aerosol / 0.6) + \
           0.20 * clamp(wind / 12)
    access = range_score(site["access"], t["access"], 0.28)

    dims = dict(thermal=thermal, aridity=aridity, terrain=terrain, geology=geology, dust=dust, access=access)
    total = sum(dims[k] * w[k] for k in w) * 100
    missing = []
    for key, label in [
        ("thermal", "thermal envelope"), ("aridity", "dry / volatile regime"),
        ("terrain", "terrain relief"), ("geology", "surface materials"),
        ("dust", "dust / aeolian regime"), ("access", "field access"),
    ]:
        if dims[key] < 0.55:
            missing.append(label)
    confidence = 0.72
    if climate.get("complete"):
        confidence += 0.10
    if relief > 0:
        confidence += 0.06
    if site.get("macrostrat"):
        confidence += 0.05
    if site.get("benchmark"):
        confidence += 0.03
    return dict(
        total=round(total, 1),
        dimensions={k: round(v * 100, 1) for k, v in dims.items()},
        confidence=round(min(confidence, 0.97), 2),
        missing=missing,
    )


def feature_vector(site, profile_key, climate):
    tags = list(set(site.get("tags", [])) | set(site.get("macrostrat", {}).get("tags", [])))
    geo = geology_score(tags, PROFILES[profile_key]["target"]["geology"])
    return [
        climate["tempMean"], climate["tempAmp"], climate["precipYear"], climate["humidity"],
        climate["wind"], climate["solar"], climate["elevation"], climate["relief"],
        climate.get("aerosol", 0.2), climate.get("soilWetnessTop", 0.2),
        climate.get("soilWetnessRoot", 0.2), climate.get("pressure", 101.3),
        geo, site["dust"], site["access"],
    ]


FEATURE_NAMES = [
    "temp mean", "thermal amplitude", "annual precip", "humidity", "wind", "solar",
    "elevation", "local relief", "aerosol / dust", "surface soil wetness",
    "root-zone wetness", "surface pressure", "macrostrat geology", "expert dust", "field access",
]


def jitter_climate(c):
    out = dict(c)
    out.update(
        tempMean=c["tempMean"] + random.gauss(0, 3),
        tempAmp=max(1, c["tempAmp"] + random.gauss(0, 6)),
        precipYear=max(0, c["precipYear"] * math.exp(random.gauss(0, 0.35))),
        humidity=clamp(c["humidity"] + random.gauss(0, 3), 0, 100),
        wind=max(0, c["wind"] + random.gauss(0, 0.8)),
        solar=max(0, c.get("solar", 5) + random.gauss(0, 0.4)),
        elevation=c["elevation"] + random.gauss(0, 120),
        relief=max(0, c["relief"] + random.gauss(0, 45)),
        aerosol=clamp(c.get("aerosol", 0.2) + random.gauss(0, 0.04), 0, 2),
        soilWetnessTop=clamp(c.get("soilWetnessTop", 0.2) + random.gauss(0, 0.04), 0, 1),
        soilWetnessRoot=clamp(c.get("soilWetnessRoot", 0.2) + random.gauss(0, 0.04), 0, 1),
        pressure=clamp(c.get("pressure", 101.3) + random.gauss(0, 1.5), 50, 110),
    )
    return out


def train_models(sites):
    random.seed(7)
    out = {}
    for profile_key in PROFILES:
        X, y, groups = [], [], []
        for site in sites:
            for k in range(9):
                climate = site["climate"] if k == 0 else jitter_climate(site["climate"])
                X.append(feature_vector(site, profile_key, climate))
                y.append(score_site_new(site, profile_key, climate)["total"])
                groups.append(site["id"])
        X = np.array(X, dtype=float)
        y = np.array(y, dtype=float)
        groups = np.array(groups)

        gkf = GroupKFold(n_splits=5)
        pred = np.zeros(len(y))
        for tr, te in gkf.split(X, y, groups):
            m = RandomForestRegressor(n_estimators=220, max_depth=5, min_samples_leaf=2, random_state=7, n_jobs=-1)
            m.fit(X[tr], y[tr])
            pred[te] = m.predict(X[te])

        # real-site rows only (first row per group)
        seen, real_idx = set(), []
        for i, g in enumerate(groups):
            if g not in seen:
                seen.add(g)
                real_idx.append(i)
        yt, yp = y[real_idx], pred[real_idx]
        mae = float(np.mean(np.abs(yt - yp)))
        ss_res = float(np.sum((yt - yp) ** 2))
        ss_tot = float(np.sum((yt - np.mean(yt)) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
        rho = float(spearmanr(yt, yp).correlation)
        pairs = correct = 0
        for i in range(len(yt)):
            for j in range(i + 1, len(yt)):
                if yt[i] == yt[j]:
                    continue
                pairs += 1
                if (yt[i] - yt[j]) * (yp[i] - yp[j]) > 0:
                    correct += 1
        pairwise = correct / pairs if pairs else 0.0

        final = RandomForestRegressor(n_estimators=500, max_depth=5, min_samples_leaf=2, random_state=7, n_jobs=-1)
        final.fit(X, y)
        importances = final.feature_importances_
        importances = (importances / importances.sum()).tolist()

        predictions = []
        for site in sites:
            x = np.array([feature_vector(site, profile_key, site["climate"])], dtype=float)
            tree_preds = np.array([t.predict(x)[0] for t in final.estimators_])
            predictions.append(dict(
                id=site["id"], name=site["name"],
                actual=round(score_site_new(site, profile_key, site["climate"])["total"], 1),
                predicted=round(float(final.predict(x)[0]), 1),
                uncertainty=round(float(np.std(tree_preds)), 1),
            ))

        out[profile_key] = dict(
            algorithm="RandomForestRegressor",
            trainSize=int(len(y)),
            sites=int(len(sites)),
            augmentation="8 jittered climate copies per site",
            cv="5-fold GroupKFold by site",
            mae=round(mae, 2),
            r2=round(r2, 3),
            spearman=round(rho, 3),
            pairwise=round(pairwise, 3),
            features=FEATURE_NAMES,
            importances=[round(v, 4) for v in importances],
            predictions=sorted(predictions, key=lambda p: -p["predicted"]),
        )
    return out


def best_campaign(profile_key, sites, ml_pred, penalty_hours=0.30, penalty_cost=0.008, max_days=42, max_hours=240, max_cost=32000):
    experiments = PROFILES[profile_key]["experiments"]
    dim_map = {
        "Regolith & construction": ["geology", "access"],
        "Thermal & illumination": ["thermal", "aridity"],
        "Subsurface & shielding": ["geology", "terrain"],
        "Dust & aeolian processes": ["dust", "aridity"],
        "Mineralogy & habitability": ["geology", "aridity"],
        "Terrain & rover operations": ["terrain", "access"],
        "Geological sampling": ["geology", "access"],
        "Rover navigation": ["terrain", "access"],
        "Equipment deployment": ["access", "terrain"],
    }
    candidates = sorted(sites, key=lambda s: -ml_pred.get(s["id"], 0))[:9]
    best = None
    for a in candidates:
        for b in candidates:
            if b["id"] == a["id"]:
                continue
            for c in candidates:
                if c["id"] in (a["id"], b["id"]):
                    continue
                order = [a, b, c]
                for perm in [(0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0)]:
                    assigned = [order[i] for i in perm]
                    fits = []
                    for exp, site in zip(experiments, assigned):
                        dims = dim_map[exp]
                        fits.append(sum(site["scores"][profile_key]["dimensions"][d] for d in dims) / len(dims))
                    legs = [travel(assigned[0], assigned[1]), travel(assigned[1], assigned[2])]
                    travel_hours = sum(l["hours"] for l in legs)
                    travel_cost = sum(l["cost"] for l in legs)
                    travel_days = math.ceil(travel_hours / 10)
                    total_days = 2 + 12 + travel_days + 2  # mobilization + field + travel + synthesis/buffer
                    if total_days > max_days or travel_hours > max_hours or travel_cost > max_cost:
                        continue
                    match = sum(fits)
                    penalty = penalty_hours * travel_hours + penalty_cost * travel_cost
                    score = match - penalty
                    if best is None or score > best["score"]:
                        best = dict(
                            score=round(score, 1), match=round(match, 1),
                            travelHours=round(travel_hours, 1), travelCost=round(travel_cost),
                            travelDays=travel_days, totalDays=total_days,
                            assignments=[
                                dict(experiment=exp, site=site["name"], siteId=site["id"],
                                     country=site["country"], window=site["windows"][profile_key],
                                     fit=round(fit, 1),
                                     score=round(ml_pred.get(site["id"], site["scores"][profile_key]["total"]), 1),
                                     ruleScore=site["scores"][profile_key]["total"])
                                for exp, site, fit in zip(experiments, assigned, fits)
                            ],
                            legs=legs,
                        )
    if best is None:
        # relax and retry
        return best_campaign(profile_key, sites, ml_pred) if False else None
    # timeline
    day = 1
    timeline = [dict(day=day, label="Mobilization / final field checks", type="analysis", site="Campaign HQ", days=2)]
    day += 2
    for i, a in enumerate(best["assignments"]):
        if i == 0:
            timeline.append(dict(day=day, label=f"Deploy to {a['site']}", type="travel", site=a["site"], days=2))
            day += 2
        else:
            leg = best["legs"][i - 1]
            travel_days = max(1, math.ceil(leg["hours"] / 10))
            timeline.append(dict(day=day, label=f"{leg['fromName']} → {leg['toName']}", type="travel", site=a["site"], days=travel_days, hours=leg["hours"]))
            day += travel_days
        timeline.append(dict(day=day, label=a["experiment"], type="field", site=a["site"], days=4))
        day += 4
    timeline.append(dict(day=day, label="Synthesis & sample transfer", type="analysis", site="Campaign HQ", days=2))
    day += 2
    timeline.append(dict(day=day, label="Contingency / weather window", type="buffer", site="Campaign HQ", days=2))
    day += 2
    best["key"] = profile_key
    best["name"] = PROFILES[profile_key]["name"]
    best["sites"] = [
        dict(id=a["siteId"], name=a["site"], country=a["country"],
             score=a["score"], window=a["window"], image=f"/sites/{a['siteId']}.jpg",
             type=next(s["type"] for s in sites if s["id"] == a["siteId"]))
        for a in best["assignments"]
    ]
    best["timeline"] = timeline
    best["totalDays"] = day - 1
    best["interventions"] = PROFILES[profile_key]["missing"]
    best["summary"] = (
        f"{len(best['assignments'])} experiments, {len(best['sites'])} sites, "
        f"{best['totalDays']} days, {best['travelHours']:.0f} travel hours, "
        f"${best['travelCost']:,} estimated travel."
    )
    return best


def main():
    d = json.loads(DATA_PATH.read_text())
    sites = d["sites"]
    existing_ids = {s["id"] for s in sites}
    for s in NEW_SITES:
        if s["id"] not in existing_ids:
            sites.append(s)
    for s in sites:
        s["airport"] = AIRPORTS.get(s["id"], dict(name="Nearest gateway", iata="—", lat=s["lat"], lon=s["lon"], groundHours=6.0, hub="—"))

    print(f"Enriching {len(sites)} sites...")

    def enrich(site):
        power = fetch_power_full(site["lat"], site["lon"])
        macro = fetch_macrostrat(site["lat"], site["lon"])
        if not site.get("climate"):
            elev, relief = fetch_elevations(site["lat"], site["lon"])
        else:
            elev, relief = site["climate"].get("elevation", 0), site["climate"].get("relief", 0)
        img = IMG_DIR / f"{site['id']}.jpg"
        if not img.exists():
            fetch_gibs(site)
        site["image"] = f"/sites/{site['id']}.jpg" if img.exists() else ""
        return site["id"], power, macro, elev, relief

    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(enrich, s): s for s in sites}
        for fut in as_completed(futures):
            site = futures[fut]
            try:
                sid, power, macro, elev, relief = fut.result()
            except Exception as e:
                print("  failed", site["id"], e)
                continue
            if not power:
                continue
            mt = {m: power.get("T2M", {}).get(m) for m in MONTHS}
            mp = {m: power.get("PRECTOTCORR", {}).get(m) for m in MONTHS}
            vals_t = [float(v) for v in mt.values() if v is not None]
            vals_p = [float(v) for v in mp.values() if v is not None]
            temp_mean = float(power.get("T2M", {}).get("ANN") or (sum(vals_t) / len(vals_t)))
            temp_max = float(power.get("T2M_MAX", {}).get("ANN") or temp_mean)
            temp_min = float(power.get("T2M_MIN", {}).get("ANN") or temp_mean)
            precip_day = float(power.get("PRECTOTCORR", {}).get("ANN") or 0)
            site["climate"] = dict(
                tempMean=round(temp_mean, 1),
                tempMax=round(temp_max, 1),
                tempMin=round(temp_min, 1),
                tempAmp=round(temp_max - temp_min, 1),
                seasonalAmp=round(max(vals_t) - min(vals_t), 1) if vals_t else 0,
                precipDay=round(precip_day, 2),
                precipYear=round(precip_day * 365, 1),
                humidity=round(float(power.get("RH2M", {}).get("ANN") or 0), 1),
                wind=round(float(power.get("WS2M", {}).get("ANN") or 0), 1),
                solar=round(float(power.get("ALLSKY_SFC_SW_DWN", {}).get("ANN") or 0), 2),
                aerosol=round(float(power.get("AOD_55", {}).get("ANN") or 0), 3),
                soilWetnessTop=round(float(power.get("GWETTOP", {}).get("ANN") or 0), 3),
                soilWetnessRoot=round(float(power.get("GWETROOT", {}).get("ANN") or 0), 3),
                pressure=round(float(power.get("PS", {}).get("ANN") or 101.3), 2),
                elevation=round(elev, 0),
                relief=round(relief, 0),
                complete=len(vals_t) == 12 and len(vals_p) == 12,
            )
            site["monthly"] = {
                "temp": [round(float(mt[m]), 1) if mt[m] is not None else None for m in MONTHS],
                "precip": [round(float(mp[m]), 2) if mp[m] is not None else None for m in MONTHS],
            }
            if macro:
                site["macrostrat"] = macro
            print(f"  {site['name']:<28} T {site['climate']['tempMean']:>6}  AOD {site['climate']['aerosol']:>5}  lith {macro.get('lith','')[:40]}")

    # scores
    for site in sites:
        site["scores"] = {k: score_site_new(site, k, site["climate"]) for k in PROFILES}
        windows = {}
        for k, profile in PROFILES.items():
            scores = []
            for i, m in enumerate(MONTHS):
                t = site["monthly"]["temp"][i]
                p = site["monthly"]["precip"][i]
                if t is None or p is None:
                    scores.append(0)
                else:
                    ts = range_score(t, profile["target"]["temp"], 15)
                    ps = range_score(p, (0, 3), 6)
                    scores.append(ts * 0.7 + ps * 0.3)
            best = max(range(12), key=lambda i: scores[i] + scores[(i + 1) % 12] * 0.55)
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            windows[k] = [months[best], months[(best + 1) % 12]]
        site["windows"] = windows

    print("\nTraining ML surrogate...")
    ml = train_models(sites)
    d["ml"] = dict(
        generatedAt=d.get("generatedAt"),
        target="domain match score (0-100) per mission profile",
        profiles=ml,
        features=FEATURE_NAMES,
        method="RandomForestRegressor, 500 trees, max_depth=5; 8 jittered climate copies per site; 5-fold GroupKFold by site.",
        caveat="Surrogate model trained on expert-scored sites. It reproduces the transparent domain rubric and provides uncertainty; it is not a substitute for field validation.",
    )
    for k in PROFILES:
        print(f"  {k}: R2 {ml[k]['r2']}  MAE {ml[k]['mae']}  Spearman {ml[k]['spearman']}  pairwise {ml[k]['pairwise']}")

    print("\nOptimizing travel-aware campaigns...")
    campaigns = {}
    for k in PROFILES:
        pred = {p["id"]: p["predicted"] for p in ml[k]["predictions"]}
        c = best_campaign(k, sites, pred)
        if c is None:
            print("  no feasible campaign for", k)
            continue
        campaigns[k] = c
        print(f"  {k}: {c['assignments'][0]['site']} → {c['assignments'][1]['site']} → {c['assignments'][2]['site']}  {c['totalDays']}d  {c['travelHours']}h  ${c['travelCost']:,}")

    d["sites"] = sites
    d["campaigns"] = campaigns
    d["generatedAt"] = d.get("generatedAt")
    DATA_PATH.write_text(json.dumps(d, indent=2))
    print(f"\nWrote {DATA_PATH}")


if __name__ == "__main__":
    main()
