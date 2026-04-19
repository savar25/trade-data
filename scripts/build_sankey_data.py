#!/usr/bin/env python3
"""
Build Sankey manifest metadata plus precomputed JS bundles for each selection.

The desktop dashboard should be able to open directly from disk without waiting
for large CSV fetches, so we generate per-selection JS payloads for every
country/year/flow combination in advance.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_JS_PATH = ROOT / "sankey-data.js"
MANIFEST_JSON_PATH = ROOT / "sankey-manifest.json"
DATASET_ROOT = ROOT / "sankey-datasets"
SUPPORTED_FLOWS = ("domestic", "imports", "exports")
EXCLUDED_SOURCES = {"WHOLE", "CONST"}
SOURCE_LIMIT = 15
IMPACT_BASE_COLUMNS = {
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
IMPACT_IGNORED_COLUMNS = {
    "level",
    "total_impact_value",
}
DEFAULT_INDICATORS = ("CO2_total", "Water_total")
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


def parse_number(value: str | None) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def normalize_code(value: str | None) -> str:
    return str(value or "").strip()


def normalize_range(value: float, min_value: float, max_value: float, invert: bool) -> float:
    if max_value <= min_value:
        return 1.0
    normalized = (value - min_value) / (max_value - min_value)
    return 1.0 - normalized if invert else normalized


def partner_country_code(origin: str, destination: str, country: str, flow: str) -> str:
    if flow == "exports":
        if destination and destination != country:
            return destination
        if origin and origin != country:
            return origin
        return destination or origin

    if flow == "imports":
        if origin and origin != country:
            return origin
        if destination and destination != country:
            return destination
        return origin or destination

    return ""


def score_direction_for_indicator(indicator: str) -> str:
    key = normalize_code(indicator).lower()
    if not key or key == "amount":
        return "higher"
    if "employment" in key or "job" in key:
        return "higher"
    return "lower"


def identify_indicator_columns(fieldnames: list[str]) -> list[str]:
    columns = [
        column
        for column in fieldnames
        if column not in IMPACT_BASE_COLUMNS and column not in IMPACT_IGNORED_COLUMNS
    ]
    if "amount" not in columns:
        columns.append("amount")
    return columns


def build_dataset(csv_path: Path, country: str, year: str, flow: str) -> dict:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        indicator_columns = identify_indicator_columns(fieldnames)
        states: dict[str, dict] = {
            indicator: {
                "sourceTotals": defaultdict(float),
                "bestLinks": {},
                "partnerTotals": {},
            }
            for indicator in indicator_columns
        }

        for row in reader:
            source = normalize_code(row.get("industry1"))
            target = normalize_code(row.get("industry2"))
            origin = normalize_code(row.get("region1"))
            destination = normalize_code(row.get("region2"))

            if not source or not target or source in EXCLUDED_SOURCES:
                continue

            trade_id = int(parse_number(row.get("trade_id")))
            amount = parse_number(row.get("amount"))
            total_level = parse_number(row.get("total_level"))
            partner = partner_country_code(origin, destination, country, flow)

            for indicator in indicator_columns:
                value = amount if indicator == "amount" else parse_number(row.get(indicator))
                state = states[indicator]

                if value > 0:
                    state["sourceTotals"][source] += value
                    current_best = state["bestLinks"].get(source)
                    if current_best is None or value > current_best["value"]:
                        state["bestLinks"][source] = {
                            "trade_id": trade_id,
                            "source": source,
                            "target": target,
                            "value": value,
                            "amount": amount,
                            "total_impact_value": total_level,
                        }

                if partner and (value > 0 or amount > 0):
                    current_partner = state["partnerTotals"].get(partner)
                    if current_partner is None:
                        current_partner = {
                            "partner": partner,
                            "metricValue": 0.0,
                            "amountValue": 0.0,
                        }
                        state["partnerTotals"][partner] = current_partner
                    current_partner["metricValue"] += value
                    current_partner["amountValue"] += amount

    dataset = {}
    for indicator in indicator_columns:
        state = states[indicator]
        ranked_sources = sorted(
            state["sourceTotals"].keys(),
            key=lambda source: (-state["sourceTotals"][source], source),
        )[:SOURCE_LIMIT]

        partner_rows = []
        for partner in state["partnerTotals"].values():
            amount_value = parse_number(partner["amountValue"])
            metric_value = parse_number(partner["metricValue"])
            partner_rows.append(
                {
                    "partner": partner["partner"],
                    "metricValue": metric_value,
                    "amountValue": amount_value,
                    "intensity": (metric_value / amount_value) if amount_value > 0 else 0.0,
                }
            )

        max_amount = max((row["amountValue"] for row in partner_rows), default=0.0)
        intensities = [row["intensity"] for row in partner_rows]
        min_intensity = min(intensities, default=0.0)
        max_intensity = max(intensities, default=0.0)
        invert_intensity = score_direction_for_indicator(indicator) == "lower"

        partner_breakdown = []
        for row in partner_rows:
            trade_strength = (row["amountValue"] / max_amount) if max_amount > 0 else 0.0
            impact_efficiency = (
                trade_strength
                if indicator == "amount"
                else normalize_range(row["intensity"], min_intensity, max_intensity, invert_intensity)
            )
            score = (
                trade_strength * 100.0
                if indicator == "amount"
                else (trade_strength * 0.6 + impact_efficiency * 0.4) * 100.0
            )
            enriched = dict(row)
            enriched["tradeStrength"] = trade_strength
            enriched["impactEfficiency"] = impact_efficiency
            enriched["score"] = score
            partner_breakdown.append(enriched)

        partner_breakdown.sort(
            key=lambda row: (-row["score"], -row["amountValue"], row["partner"])
        )

        dataset[indicator] = {
            "source_totals": dict(state["sourceTotals"]),
            "links_by_source": state["bestLinks"],
            "ranked_sources": ranked_sources,
            "partner_breakdown": partner_breakdown,
        }

    defaults = [indicator for indicator in DEFAULT_INDICATORS if indicator in indicator_columns]
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
        "dataset": dataset,
    }


def write_selection_dataset(csv_path: Path, year: str, country: str, flow: str) -> None:
    payload = build_dataset(csv_path, country, year, flow)
    output_dir = DATASET_ROOT / year / country
    output_dir.mkdir(parents=True, exist_ok=True)

    flow_output = output_dir / f"{flow}.js"
    flow_output.write_text(
        "window.TRADE_SANKEY_DATA = "
        + json.dumps(payload, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    if flow == "domestic":
        legacy_output = DATASET_ROOT / year / f"{country}.js"
        legacy_output.parent.mkdir(parents=True, exist_ok=True)
        legacy_output.write_text(flow_output.read_text(encoding="utf-8"), encoding="utf-8")


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
        "excludedSources": sorted(EXCLUDED_SOURCES),
        "sourceLimit": SOURCE_LIMIT,
        "defaultSelection": {
            "country": default_country,
            "year": default_year,
            "flow": default_flow,
        },
    }


def main() -> None:
    manifest = build_manifest()
    for csv_path in sorted(ROOT.glob("year/*/*/*/trade_impact.csv")):
        relative_path = csv_path.relative_to(ROOT).as_posix()
        match = TRADE_IMPACT_PATTERN.match(relative_path)
        if not match:
            continue
        write_selection_dataset(
            csv_path,
            match.group("year"),
            match.group("country"),
            match.group("flow"),
        )
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
