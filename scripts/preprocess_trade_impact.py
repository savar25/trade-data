#!/usr/bin/env python3
"""
Preprocess `trade_impact.csv` into a JS file usable by the Sankey HTML page.

Usage (PowerShell):
  python .\scripts\preprocess_trade_impact.py --input year\2022\CN\domestic\trade_impact.csv --output bea-dashboard\chart_data.js

What it does:
 - Reads the CSV with pandas
 - Detects the column named like 'air emissions' and treats that column and all columns to the right as factor columns
 - Detects reasonable source/target columns from the header (heuristics)
 - For each factor, aggregates values by source->target and produces nodes/links
 - Writes a JS file that defines `window.tradeImpactChartData` with `factors` and `sankeyByFactor`

If your CSV uses different names for source/target, pass them via --src and --tgt.
"""
import argparse
import json
import os
import sys

try:
    import pandas as pd
except Exception:
    print("pandas is required. Install with: pip install pandas")
    raise

def find_air_index(columns):
    for i, c in enumerate(columns):
        if c is None:
            continue
        low = c.strip().lower()
        if 'air' in low and 'emiss' in low:
            return i
    # fallback: find a column that contains 'emiss' or 'air'
    for i, c in enumerate(columns):
        if c is None:
            continue
        low = c.strip().lower()
        if 'emiss' in low or 'air' in low:
            return i
    return None

def detect_src_tgt(columns, df, src_hint=None, tgt_hint=None):
    cols = [c for c in columns]
    # If hints provided and present, use them
    if src_hint and src_hint in cols:
        src = src_hint
    else:
        # heuristics: look for names with 'from','source','origin','export'
        src = None
        for c in cols:
            low = c.lower()
            if any(x in low for x in ['from', 'source', 'origin', 'exporter', 'export']):
                src = c
                break
    if tgt_hint and tgt_hint in cols:
        tgt = tgt_hint
    else:
        tgt = None
        for c in cols:
            low = c.lower()
            if any(x in low for x in ['to', 'target', 'dest', 'destination', 'importer', 'import']):
                tgt = c
                break

    # If not found, choose first two object/string columns
    if src is None or tgt is None or src == tgt:
        object_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(df[c])]
        if len(object_cols) >= 2:
            src = src or object_cols[0]
            tgt = tgt or object_cols[1]
        elif len(object_cols) == 1:
            src = src or object_cols[0]
            tgt = tgt or (cols[1] if cols[0] == object_cols[0] else cols[0])
        else:
            # last resort: use first two columns
            src = src or cols[0]
            tgt = tgt or (cols[1] if len(cols) > 1 else cols[0])

    return src, tgt

def build_sankey_for_factor(df, src_col, tgt_col, factor_col):
    sub = df[[src_col, tgt_col, factor_col]].dropna()
    # Convert factor to numeric (coerce)
    sub[factor_col] = pd.to_numeric(sub[factor_col], errors='coerce')
    sub = sub.dropna(subset=[factor_col])
    grouped = sub.groupby([src_col, tgt_col], dropna=False)[factor_col].sum().reset_index()

    nodes = []
    node_index = {}

    def add_node(n):
        if n not in node_index:
            node_index[n] = len(nodes)
            nodes.append({'id': node_index[n], 'label': str(n)})

    links = []
    for _, row in grouped.iterrows():
        s = row[src_col]
        t = row[tgt_col]
        v = float(row[factor_col])
        add_node(s)
        add_node(t)
        if v <= 0 or (v != v):
            continue
        links.append({'source': node_index[s], 'target': node_index[t], 'value': v, 'sourceLabel': str(s), 'targetLabel': str(t)})

    return {'nodes': nodes, 'links': links}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', '-i', required=True, help='Input CSV path')
    ap.add_argument('--output', '-o', default='bea-dashboard/chart_data.js', help='Output JS path')
    ap.add_argument('--src', help='Optional source column name')
    ap.add_argument('--tgt', help='Optional target column name')
    args = ap.parse_args()

    csv_path = args.input
    out_path = args.output

    if not os.path.exists(csv_path):
        print(f'Input file not found: {csv_path}')
        sys.exit(2)

    df = pd.read_csv(csv_path, dtype=object)
    columns = list(df.columns)

    air_idx = find_air_index(columns)

    if air_idx is not None:
        factors = columns[air_idx:]
    else:
        # fallback: take numeric columns as factors (sample-based)
        numeric_candidates = []
        for c in columns:
            try:
                if pd.to_numeric(df[c].dropna().head(20), errors='coerce').notna().any():
                    numeric_candidates.append(c)
            except Exception:
                continue
        factors = numeric_candidates

    src_col, tgt_col = detect_src_tgt(columns, df, src_hint=args.src, tgt_hint=args.tgt)

    sankey_by_factor = {}
    for f in factors:
        try:
            sankey = build_sankey_for_factor(df, src_col, tgt_col, f)
            sankey_by_factor[f] = sankey
        except Exception as e:
            print(f'Warning: failed to build sankey for factor {f}: {e}')

    out_obj = {
        'factors': factors,
        'src_col': src_col,
        'tgt_col': tgt_col,
        'sankeyByFactor': sankey_by_factor
    }

    # Write out as a JS file that sets window.tradeImpactChartData
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by preprocess_trade_impact.py\n')
        fh.write('window.tradeImpactChartData = ')
        json.dump(out_obj, fh, indent=2, ensure_ascii=False)
        fh.write(';\n')

    print(f'Wrote {out_path} with {len(factors)} factors and sankey data for each.')

if __name__ == '__main__':
    main()