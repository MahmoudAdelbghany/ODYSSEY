#!/usr/bin/env python3
"""Fetch monthly NASA POWER climatology for every Odyssey site.

The existing annual climate values are useful for static screening, but temporal
requirements need monthly normals. This script retrieves the same NASA POWER
climatology product used by ``enrich.py`` and stores every monthly parameter
needed by the temporal engine.

Source: NASA POWER / MERRA-2 climatology 2001-2020, community RE.
The values are climatological monthly normals, not forecasts.

Output: src/data/siteMonthly.json

Requires: requests.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
ODYSSEY = ROOT / "src" / "data" / "odyssey.json"
OUT = ROOT / "src" / "data" / "siteMonthly.json"

MONTHS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
]
PARAMS = {
    "T2M": "mean air temperature at 2 m",
    "T2M_MAX": "maximum air temperature at 2 m",
    "T2M_MIN": "minimum air temperature at 2 m",
    "PRECTOTCORR": "precipitation rate",
    "RH2M": "relative humidity at 2 m",
    "WS2M": "wind speed at 2 m",
    "ALLSKY_SFC_SW_DWN": "all-sky surface shortwave downward irradiance",
    "AOD_55": "aerosol optical depth at 550 nm",
    "GWETTOP": "surface soil wetness",
    "GWETROOT": "root-zone soil wetness",
    "PS": "surface pressure",
}
POWER_PARAMS = ",".join(PARAMS)
URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"


def fetch(site: dict) -> dict:
    params = {
        "parameters": POWER_PARAMS,
        "community": "RE",
        "longitude": site["lon"],
        "latitude": site["lat"],
        "format": "JSON",
        "start": "2001",
        "end": "2020",
    }
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = requests.get(URL, params=params, timeout=60)
            response.raise_for_status()
            parameter = response.json()["properties"]["parameter"]
            series: dict[str, list[float | None]] = {}
            missing: list[str] = []
            for key in PARAMS:
                values: list[float | None] = []
                for month in MONTHS:
                    raw = parameter.get(key, {}).get(month)
                    try:
                        value = float(raw)
                    except (TypeError, ValueError):
                        value = None
                    if value is not None and value <= -900:
                        value = None
                    values.append(round(value, 3) if value is not None else None)
                    if value is None:
                        missing.append(f"{key}:{month}")
                series[key] = values
            return {"series": series, "missing": missing, "retrieved": time.strftime("%Y-%m-%d")}
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2.0 + attempt * 1.5)
    raise RuntimeError(f"NASA POWER failed for {site['id']}: {last_error}")


def main() -> None:
    sites = json.loads(ODYSSEY.read_text())["sites"]
    payload = {
        "source": "NASA POWER / MERRA-2 climatology",
        "dataset": "POWER monthly climatology, community RE",
        "period": "2001-2020",
        "temporalResolution": "monthly climatological normals",
        "spatialResolution": "0.5° x 0.625° reanalysis grid, sampled at the site point",
        "units": {
            "temp": "degC",
            "tempMax": "degC",
            "tempMin": "degC",
            "precip": "mm/day",
            "humidity": "%",
            "wind": "m/s",
            "solar": "kWh/m2/day",
            "aerosol": "unitless AOD",
            "soilWetnessTop": "unitless fraction",
            "pressure": "kPa",
        },
        "limitations": (
            "Monthly climatological normals, not observations or forecasts. "
            "Monthly means suppress daily and hourly extremes. Values are sampled "
            "from a reanalysis grid and are not a spatial field at the site."
        ),
        "sites": {},
    }
    for index, site in enumerate(sites, 1):
        print(f"[{index:02d}/{len(sites)}] {site['id']}")
        result = fetch(site)
        series = result["series"]
        payload["sites"][site["id"]] = {
            "retrieved": result["retrieved"],
            "complete": len(result["missing"]) == 0,
            "missing": result["missing"],
            "temp": series["T2M"],
            "tempMax": series["T2M_MAX"],
            "tempMin": series["T2M_MIN"],
            "precip": series["PRECTOTCORR"],
            "humidity": series["RH2M"],
            "wind": series["WS2M"],
            "solar": series["ALLSKY_SFC_SW_DWN"],
            "aerosol": series["AOD_55"],
            "soilWetnessTop": series["GWETTOP"],
            "soilWetnessRoot": series["GWETROOT"],
            "pressure": series["PS"],
        }
        OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"\nWrote {OUT} ({len(payload['sites'])} sites)")


if __name__ == "__main__":
    main()
