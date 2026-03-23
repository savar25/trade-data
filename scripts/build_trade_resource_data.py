#!/usr/bin/env python3
"""
Aggregate domestic trade_resource.csv files into a browser-readable JS bundle.

The dashboard loads this file directly from disk, so the page can still be
opened without running a local server.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "trade-resource-data.js"
EXCLUDED_SOURCES = {"WHOLE", "CONST"}
SOURCE_LIMIT = 5
BASE_COLUMNS = {
    "trade_id",
    "year",
    "region1",
    "region2",
    "industry1",
    "industry2",
    "amount",
}
IGNORED_RESOURCE_COLUMNS = {
    "total_resources_value",
    "resources_count",
    "unique_resources_factors",
    "resources_intensity",
}
SUMMARY_CATEGORY_RULES = {
    "Water": [
        "natural_resource/water",
        "resources_Water_Consumption",
        "resources_Water_Withdrawal",
    ],
    "Energy": [
        "natural_resource/energy",
        "resources_Energy",
    ],
    "Land": [
        "natural_resource/land",
        "resources_Land_Crops",
        "resources_Land_Forest",
        "resources_Land_Other",
    ],
    "Crops": [
        "resources_Crops",
    ],
    "Air": [
        "emission/air",
    ],
}


def parse_number(value: str | None) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def identify_factor_columns(fieldnames: list[str]) -> list[str]:
    return [
        column
        for column in fieldnames
        if column not in BASE_COLUMNS and column not in IGNORED_RESOURCE_COLUMNS
    ]


def build_dataset(csv_path: Path) -> dict:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        factor_columns = identify_factor_columns(fieldnames)

        source_totals: dict[str, float] = defaultdict(float)
        best_links: dict[str, dict] = {}
        factor_totals: dict[str, float] = defaultdict(float)
        strongest_factor_links: dict[str, dict] = {}
        eligible_rows = 0

        for row in reader:
            source = (row.get("industry1") or "").strip()
            target = (row.get("industry2") or "").strip()
            value = parse_number(row.get("total_resources_value"))

            if not source or not target or source in EXCLUDED_SOURCES or value <= 0:
                continue

            eligible_rows += 1
            trade_id = int(parse_number(row.get("trade_id")))
            amount = parse_number(row.get("amount"))

            source_totals[source] += value
            existing = best_links.get(source)
            if existing is None or value > existing["value"]:
                best_links[source] = {
                    "trade_id": trade_id,
                    "source": source,
                    "target": target,
                    "value": value,
                    "amount": amount,
                }

            for factor in factor_columns:
                factor_value = parse_number(row.get(factor))
                if factor_value <= 0:
                    continue
                factor_totals[factor] += factor_value
                current = strongest_factor_links.get(factor)
                if current is None or factor_value > current["value"]:
                    strongest_factor_links[factor] = {
                        "trade_id": trade_id,
                        "source": source,
                        "target": target,
                        "value": factor_value,
                        "amount": amount,
                        "factor": factor,
                    }

    top_sources = [
        source
        for source, _ in sorted(
            source_totals.items(),
            key=lambda item: (-item[1], item[0]),
        )[:SOURCE_LIMIT]
    ]
    flow_links = [
        best_links[source]
        for source in top_sources
        if source in best_links
    ]
    flow_links.sort(key=lambda item: (-item["value"], item["source"], item["target"]))

    factor_mix = [
        {"name": factor, "value": value}
        for factor, value in sorted(
            factor_totals.items(),
            key=lambda item: (-item[1], item[0]),
        )
        if value > 0
    ]

    factor_spotlight = [
        strongest_factor_links[factor]
        for factor, _ in sorted(
            factor_totals.items(),
            key=lambda item: (-item[1], item[0]),
        )[:6]
        if factor in strongest_factor_links
    ]

    summary_mix = []
    for label, columns in SUMMARY_CATEGORY_RULES.items():
        present_columns = [column for column in columns if factor_totals.get(column, 0) > 0]
        if not present_columns:
            continue

        preferred_column = next(
            (column for column in columns if factor_totals.get(column, 0) > 0),
            present_columns[0],
        )
        summary_mix.append(
            {
                "name": label,
                "value": factor_totals[preferred_column],
                "source_factor": preferred_column,
                "spotlight": strongest_factor_links.get(preferred_column),
            }
        )

    summary_mix.sort(key=lambda item: (-item["value"], item["name"]))

    return {
        "source_csv": csv_path.relative_to(ROOT).as_posix(),
        "eligible_rows": eligible_rows,
        "top_sources": top_sources,
        "top_source_total": sum(source_totals[source] for source in top_sources),
        "flow_links": flow_links,
        "factor_mix": factor_mix,
        "factor_spotlight": factor_spotlight,
        "summary_mix": summary_mix,
    }


def discover_selections() -> dict:
    selections: dict[str, dict] = {}
    for csv_path in sorted(ROOT.glob("year/*/*/domestic/trade_resource.csv")):
        year = csv_path.parts[-4]
        country = csv_path.parts[-3]
        selections[f"{year}|{country}"] = build_dataset(csv_path)
    return selections


def main() -> None:
    payload = {
        "meta": {
            "flow": "domestic",
            "excludedSources": sorted(EXCLUDED_SOURCES),
            "sourceLimit": SOURCE_LIMIT,
        },
        "selections": discover_selections(),
    }
    OUTPUT_PATH.write_text(
        "window.TRADE_RESOURCE_DATA = " + json.dumps(payload, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
