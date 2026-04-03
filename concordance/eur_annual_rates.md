# EUR Annual Exchange Rates (1999–2025)

**File:** `eur_annual_rates_1999_2025.csv`  
**Source:** European Central Bank (ECB) euro foreign exchange reference rates  
**Raw daily data:** https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip  
**Validation:** Deutsche Bundesbank Exchange Rate Statistics PDFs  
**Coverage:** 1999–2025 · 27 rows · 31 currencies · base: 1 EUR = X units

---

## Data provenance by year range

### 2012–2025 — Bundesbank PDFs (authoritative)

All values sourced directly from two Bundesbank sub-tables, fetched as PDFs:

- **Table II.2 — Annual and monthly averages** (`wk1e1011-data.pdf`, issued 30 Jan 2026): provides confirmed annual averages for 2024 and 2025.
- **Table II.3 — End-of-year rates and annual averages** (`wk1e1213-data.pdf`, issued 16 Feb 2026): provides confirmed annual averages for 2012–2025 across all covered currencies.

For currencies where Table II.3 shows no published annual row (PHP, SGD, ZAR, CHF, THB, TRY, GBP, USD in the 2024–2025 rows), the annual average was computed by averaging the 12 monthly averages from Table II.2 of the same document — consistent with the Bundesbank's own stated methodology.

### 1999–2011 — ECB records / training data (not directly from a Bundesbank PDF)

The Bundesbank's Table II.3 begins at 2012. For earlier years, values were derived from:

- **1999–2000:** The Bundesbank January 2001 annual exchange rate statistics PDF (German edition) confirms annual averages for USD, JPY, GBP, DKK, SEK, CHF, ISK, and NOK.
- **2001–2011, all other currencies:** Values from ECB Statistical Data Warehouse published records and training data. These match ECB-published figures but were **not validated against a fetched Bundesbank PDF**.

To fully validate 1999–2011, fetch and cross-check against the January issue of the Bundesbank Exchange Rate Statistics from each corresponding year (e.g., January 2002 for 2001 data). These are available at:  
`https://www.bundesbank.de/en/statistics/money-and-capital-markets/exchange-rates`

---

## Currencies in our CSV

All 32 columns and their Bundesbank PDF coverage. The **Bundesbank** column indicates the first year the currency appears in Bundesbank Table II.3 — meaning those values were read directly from a fetched PDF. Years before that entry, if populated, come from ECB records or training data (see provenance section above).

| Code | Currency | Bundesbank | Notes |
|------|----------|------------|-------|
| USD | US Dollar | From 2012 | |
| JPY | Japanese Yen | From 2012 | |
| GBP | British Pound | From 2012 | |
| CHF | Swiss Franc | From 2012 | |
| SEK | Swedish Krona | From 2012 | |
| NOK | Norwegian Krone | From 2012 | |
| DKK | Danish Krone | From 2012 | |
| CZK | Czech Koruna | From 2012 | |
| PLN | Polish Zloty | From 2012 | |
| HUF | Hungarian Forint | From 2012 | |
| BGN | Bulgarian Lev | From 2012 | Hard peg at 1.9558; adopted EUR 1 Jan 2026 - so 1 starting in 2026 |
| RON | Romanian Leu | From 2012 | |
| HRK | Croatian Kuna | From 2012 (ends 2022) | Croatia adopted EUR 1 Jan 2023 |
| TRY | Turkish Lira | From 2012 | |
| AUD | Australian Dollar | From 2012 | |
| CAD | Canadian Dollar | From 2012 | |
| HKD | Hong Kong Dollar | From 2012 | |
| SGD | Singapore Dollar | From 2012 | |
| KRW | South Korean Won | From 2012 | |
| ZAR | South African Rand | From 2012 | |
| MXN | Mexican Peso | From 2012 | |
| INR | Indian Rupee | From 2012 | |
| CNY | Chinese Renminbi | From 2012 | |
| BRL | Brazilian Real | From 2012 | |
| IDR | Indonesian Rupiah | From 2012 | |
| ILS | Israeli New Shekel | From 2012 | Listed as "ECB indicative rates" 2012–2018 |
| MYR | Malaysian Ringgit | From 2012 | |
| PHP | Philippine Peso | From 2012 | |
| THB | Thai Baht | From 2012 | |
| ISK | Icelandic Króna | From 2018 | ECB suspended publication Dec 2008–Jan 2018; blank for those years |
| NZD | New Zealand Dollar | From 2012 | |
| RUB | Russian Rouble | 2012–2021 | ECB suspended publication 2 Mar 2022; blank from 2022 onward. Bundesbank publishes indicative post-2022 rates (not ECB-sourced) — excluded here |

---

## Currencies not in our CSV

The following currencies appear in Bundesbank Tables II.2/II.3:

| Code | Currency | Available years | Notes |
|------|----------|-----------------|-------|
| LVL | Latvian Lats | 2012–2013 | Latvia adopted EUR 1 Jan 2014 |
| LTL | Lithuanian Litas | 2012–2014 | Lithuania adopted EUR 1 Jan 2015 |

---

## Annual refresh

**When:** The Bundesbank publishes its Exchange Rate Statistics PDF on the **15th of each month** (nearest working day). The **January 15** issue is the first to contain full prior-year annual averages in Table II.3.

**Steps:**
1. Download the January Bundesbank Exchange Rate Statistics PDF from:  
   `https://www.bundesbank.de/en/statistics/money-and-capital-markets/exchange-rates`
2. Fetch the `wk1e1213-data.pdf` sub-file for Table II.3 (end-of-year rates and annual averages).
3. Read the new annual row for year Y. For any currency without a dedicated annual row, average the 12 monthly rows from `wk1e1011-data.pdf` (Table II.2).
4. Append the new row to the CSV and rename the file.

**AI refresh prompt:**

> It is now January [YEAR]. Please update `eur_annual_rates_1999_[PREV_YEAR].csv` with validated annual averages for [PREV_YEAR].
>
> Fetch and read these two Bundesbank sub-PDFs:
> - Table II.3 (annual averages): `wk1e1213-data.pdf` at the current Bundesbank exchange rate statistics page
> - Table II.2 (monthly averages, for currencies missing an annual row): `wk1e1011-data.pdf`
>
> Both are linked from: https://www.bundesbank.de/en/statistics/money-and-capital-markets/exchange-rates
>
> For currencies with a published [PREV_YEAR] annual row in Table II.3, use that value directly. For any currency without one, compute the mean of the 12 monthly averages in Table II.2.
>
> Do not add new currency columns. Append the [PREV_YEAR] row and save as `eur_annual_rates_1999_[YEAR].csv`. Note the Bundesbank PDF date used as the validation source.

---

## Bundesbank PDF sub-file naming

The Bundesbank publishes each table as a standalone PDF alongside the full issue. The relevant sub-files follow this naming convention:

| Sub-file | Content |
|----------|---------|
| `wk1e1011-data.pdf` | Table II.2 — Annual and monthly averages (last 2 years + monthly detail) |
| `wk1e1213-data.pdf` | Table II.3 — End-of-year rates and annual averages (full history from 2012) |

These are accessible via the blob URLs embedded in the Bundesbank's exchange rate statistics page. The full-issue PDF URL pattern is:  
`https://www.bundesbank.de/resource/blob/{id}/{hash}/472B63F073F071307366337C94F8C870/{filename}-data.pdf`
