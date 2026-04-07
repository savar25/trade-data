#!/usr/bin/env python3
"""
Build a lightweight Sankey manifest from the available trade_impact.csv files.

The Sankey page now reads trade_impact.csv directly in the browser and builds
the chart data on demand. This script keeps only the small country/year/flow
inventory as a fallback for static hosting environments where runtime GitHub
tree discovery is unavailable.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_JS_PATH = ROOT / "sankey-data.js"
MANIFEST_JSON_PATH = ROOT / "sankey-manifest.json"
SUPPORTED_FLOWS = ("domestic", "imports", "exports")
TRADE_IMPACT_PATTERN = re.compile(
    r"^year/(?P<year>[^/]+)/(?P<country>[^/]+)/(?P<flow>domestic|imports|exports)/trade_impact\.csv$"
)


def sort_years(values: list[str]) -> list[str]:
    def sort_key(value: str) -> tuple[int, int | str]:
        try:
            return (0, int(value))
        except ValueError:
            return (1, value)

    return sorted(values, key=sort_key)


def build_manifest() -> dict:
    countries: set[str] = set()
    years_by_country: dict[str, list[str]] = defaultdict(list)
    flows_by_country_year: dict[str, list[str]] = {}

    for csv_path in sorted(ROOT.glob("year/*/*/*/trade_impact.csv")):
        relative_path = csv_path.relative_to(ROOT).as_posix()
        match = TRADE_IMPACT_PATTERN.match(relative_path)
        if not match:
            continue

        year = match.group("year")
        country = match.group("country")
        flow = match.group("flow")

        countries.add(country)

        if year not in years_by_country[country]:
            years_by_country[country].append(year)

        country_year_key = f"{country}|{year}"
        flows = flows_by_country_year.setdefault(country_year_key, [])
        if flow not in flows:
            flows.append(flow)

    sorted_countries = sorted(countries)
    for country in sorted_countries:
        years_by_country[country] = sort_years(years_by_country[country])
    for country_year_key, flows in flows_by_country_year.items():
        flows_by_country_year[country_year_key] = sorted(
            flows,
            key=SUPPORTED_FLOWS.index,
        )

    default_country = "US" if "US" in sorted_countries else (sorted_countries[0] if sorted_countries else "US")
    default_years = years_by_country.get(default_country, ["2022"])
    default_year = default_years[-1]
    default_flows = flows_by_country_year.get(f"{default_country}|{default_year}", list(SUPPORTED_FLOWS))
    default_flow = "domestic" if "domestic" in default_flows else default_flows[0]

    return {
        "countries": sorted_countries or ["US"],
        "yearsByCountry": years_by_country or {"US": ["2022"]},
        "flowsByCountryYear": flows_by_country_year or {"US|2022": ["domestic"]},
        "supportedFlows": list(SUPPORTED_FLOWS),
        "defaultSelection": {
            "country": default_country,
            "year": default_year,
            "flow": default_flow,
        },
    }


def main() -> None:
    manifest = build_manifest()
    MANIFEST_JSON_PATH.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    MANIFEST_JS_PATH.write_text(
        "window.TRADE_SANKEY_MANIFEST = "
        + json.dumps(manifest, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {MANIFEST_JSON_PATH.relative_to(ROOT)}")
    print(f"Wrote {MANIFEST_JS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
