#!/usr/bin/env python3
"""
Aggregate trade_impact.csv files into browser-readable JS bundles.

Each country / year / flow selection receives its own JS payload so the
dashboard can read domestic, imports, and exports datasets even though the
CSV filenames are identical inside separate directories.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = ROOT / "sankey-datasets"
MANIFEST_PATH = ROOT / "sankey-data.js"
SUPPORTED_FLOWS = ("domestic", "imports", "exports")
EXCLUDED_SOURCES = {"WHOLE", "CONST"}
SOURCE_LIMIT = 5
DEFAULT_INDICATORS = ["air_emissions", "employment"]
BASE_COLUMNS = {
    "trade_id",
    "year",
    "region1",
    "region2",
    "industry1",
    "industry2",
    "amount",
    "total_level",
    "factor_count",
    "unique_factors",
}
IGNORED_COLUMNS = {
    "level",
    "total_impact_value",
}


def parse_number(value: str | None) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def identify_indicator_columns(fieldnames: list[str]) -> list[str]:
    return [
        column
        for column in fieldnames
        if column not in BASE_COLUMNS and column not in IGNORED_COLUMNS
    ]


def build_dataset(csv_path: Path) -> dict:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        indicator_columns = identify_indicator_columns(fieldnames)

        indicator_payload = {}
        for indicator in indicator_columns:
            source_totals: dict[str, float] = defaultdict(float)
            best_links: dict[str, dict] = {}

            handle.seek(0)
            reader = csv.DictReader(handle)
            for row in reader:
                source = (row.get("industry1") or "").strip()
                target = (row.get("industry2") or "").strip()
                value = parse_number(row.get(indicator))
                if not source or not target or source in EXCLUDED_SOURCES or value <= 0:
                    continue

                amount = parse_number(row.get("amount"))
                total_impact_value = parse_number(row.get("total_level"))
                trade_id = int(parse_number(row.get("trade_id")))

                source_totals[source] += value
                existing = best_links.get(source)
                if existing is None or value > existing["value"]:
                    best_links[source] = {
                        "trade_id": trade_id,
                        "source": source,
                        "target": target,
                        "value": value,
                        "amount": amount,
                        "total_impact_value": total_impact_value,
                    }

            top_sources = [
                source
                for source, _ in sorted(
                    source_totals.items(),
                    key=lambda item: (-item[1], item[0]),
                )[:SOURCE_LIMIT]
            ]

            links = [
                best_links[source]
                for source in top_sources
                if source in best_links
            ]
            links.sort(key=lambda item: (-item["value"], item["source"], item["target"]))

            indicator_payload[indicator] = {
                "display_total": sum(source_totals[source] for source in top_sources),
                "top_sources": top_sources,
                "links": links,
            }

    year = csv_path.parts[-4]
    country = csv_path.parts[-3]
    flow = csv_path.parts[-2]

    defaults = [indicator for indicator in DEFAULT_INDICATORS if indicator in indicator_payload]
    if not defaults:
        defaults = indicator_columns[:2]

    return {
        "meta": {
            "year": year,
            "country": country,
            "flow": flow,
            "excluded_sources": sorted(EXCLUDED_SOURCES),
            "source_limit": SOURCE_LIMIT,
            "source_csv": csv_path.relative_to(ROOT).as_posix(),
        },
        "indicatorColumns": indicator_columns,
        "defaults": defaults,
        "dataset": indicator_payload,
    }


def write_dataset(csv_path: Path) -> tuple[str, str, str]:
    payload = build_dataset(csv_path)
    year = csv_path.parts[-4]
    country = csv_path.parts[-3]
    flow = csv_path.parts[-2]

    output_dir = OUTPUT_ROOT / year / country
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{flow}.js"
    output_path.write_text(
        "window.TRADE_SANKEY_DATA = " + json.dumps(payload, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    return year, country, flow


def build_manifest(discovered: list[tuple[str, str, str]]) -> dict:
    countries = sorted({country for _, country, _ in discovered})
    years_by_country: dict[str, list[str]] = defaultdict(list)
    flows_by_country_year: dict[str, list[str]] = {}

    for year, country, flow in sorted(discovered):
        if year not in years_by_country[country]:
            years_by_country[country].append(year)
        key = f"{country}|{year}"
        flows = flows_by_country_year.setdefault(key, [])
        if flow not in flows:
            flows.append(flow)

    for country in years_by_country:
        years_by_country[country].sort()
    for key in flows_by_country_year:
        flows_by_country_year[key].sort(key=lambda flow: SUPPORTED_FLOWS.index(flow))

    default_country = countries[0] if countries else "US"
    default_years = years_by_country.get(default_country) or ["2019"]
    default_year = default_years[0]
    default_flow = (flows_by_country_year.get(f"{default_country}|{default_year}") or ["domestic"])[0]

    return {
        "countries": countries,
        "yearsByCountry": years_by_country,
        "flowsByCountryYear": flows_by_country_year,
        "supportedFlows": list(SUPPORTED_FLOWS),
        "indicatorColumns": [
            "air_emissions",
            "employment",
            "energy",
            "land",
            "material",
            "water",
            "CO2_total",
            "CH4_total",
            "N2O_total",
            "NOX_total",
            "Water_total",
            "Employment_total",
            "Energy_total",
            "Land_total",
            "impact_intensity",
        ],
        "defaults": DEFAULT_INDICATORS,
        "defaultSelection": {
            "country": default_country,
            "year": default_year,
            "flow": default_flow,
        },
        "excludedSources": sorted(EXCLUDED_SOURCES),
        "sourceLimit": SOURCE_LIMIT,
        "datasetBasePath": "./sankey-datasets",
    }


def main() -> None:
    discovered: list[tuple[str, str, str]] = []
    for flow in SUPPORTED_FLOWS:
        for csv_path in sorted(ROOT.glob(f"year/*/*/{flow}/trade_impact.csv")):
            discovered.append(write_dataset(csv_path))

    manifest = build_manifest(discovered)
    MANIFEST_PATH.write_text(
        "window.TRADE_SANKEY_MANIFEST = " + json.dumps(manifest, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    print(f"Wrote {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
