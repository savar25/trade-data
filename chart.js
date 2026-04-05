(function () {
  const manifest = window.TRADE_SANKEY_MANIFEST;
  const resourceManifest = window.TRADE_RESOURCE_DATA;
  const chartGrid = document.getElementById("chart-grid");
  const countrySelect = document.getElementById("country-select");
  const flowSelect = document.getElementById("flow-select");
  const yearSelect = document.getElementById("year-select");
  const topnSlider = document.getElementById("topn-slider");
  const topnLabel = document.getElementById("topn-label");
  const currencyControl = document.getElementById("currency-control");
  const currencySelect = document.getElementById("currency-select");
  const industryLabelSelect = document.getElementById("industry-label-select");
  const loadButton = document.getElementById("load-button");
  const statusText = document.getElementById("status-text");
  const selectionPill = document.getElementById("selection-pill");
  const hoverTooltip = document.getElementById("hover-tooltip");
  const clickTooltip = document.getElementById("click-tooltip");
  const pageRoot = document.documentElement;
  const runtimeConfig = window.TRADE_DASHBOARD_CONFIG || {};

  if (!manifest || !chartGrid || !countrySelect || !yearSelect || !flowSelect || !hoverTooltip || !clickTooltip) {
    return;
  }

  const panelConfigs = [
    {
      kind: "impact",
      title: "Impact Flow 1",
      selectable: true,
      defaultIndicatorIndex: 0,
      stats: [
        { key: "total", label: "Displayed Total" },
        { key: "largest", label: "Largest Link" },
        { key: "leader", label: "Trade Leader" }
      ]
    },
    {
      kind: "impact",
      title: "Impact Flow 2",
      selectable: true,
      defaultIndicatorIndex: 1,
      stats: [
        { key: "total", label: "Displayed Total" },
        { key: "largest", label: "Largest Link" },
        { key: "leader", label: "Trade Leader" }
      ]
    },
    {
      kind: "resource-flow",
      title: "Resource Flow",
      selectable: false,
      stats: [
        { key: "total", label: "Displayed Total" },
        { key: "largest", label: "Largest Link" }
      ]
    },
    {
      kind: "resource-mix",
      title: "Resource Mix",
      selectable: false,
      stats: [
        { key: "total", label: "Visible Buckets" },
        { key: "scope", label: "Dominant Bucket" },
        { key: "largest", label: "Spotlight Flow" }
      ]
    }
  ];

  const compactFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  });
  const exactFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  });
  const currencyExactFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  });

  const CURRENCY_NAMES = {
    EUR: "Euro",
    USD: "US Dollar",
    JPY: "Japanese Yen",
    GBP: "British Pound",
    CHF: "Swiss Franc",
    SEK: "Swedish Krona",
    NOK: "Norwegian Krone",
    DKK: "Danish Krone",
    CZK: "Czech Koruna",
    PLN: "Polish Zloty",
    HUF: "Hungarian Forint",
    RON: "Romanian Leu",
    HRK: "Croatian Kuna",
    BGN: "Bulgarian Lev",
    TRY: "Turkish Lira",
    AUD: "Australian Dollar",
    CAD: "Canadian Dollar",
    HKD: "Hong Kong Dollar",
    SGD: "Singapore Dollar",
    KRW: "South Korean Won",
    ZAR: "South African Rand",
    MXN: "Mexican Peso",
    INR: "Indian Rupee",
    CNY: "Chinese Renminbi",
    BRL: "Brazilian Real",
    IDR: "Indonesian Rupiah",
    ILS: "Israeli New Shekel",
    MYR: "Malaysian Ringgit",
    PHP: "Philippine Peso",
    THB: "Thai Baht",
    ISK: "Icelandic Krona",
    NZD: "New Zealand Dollar",
    RUB: "Russian Rouble"
  };

  let sankeyData = null;
  let activeDatasetScript = null;
  let selectedMark = null;
  let activeSelection = {
    country: manifest.defaultSelection.country,
    year: manifest.defaultSelection.year,
    flow: manifest.defaultSelection.flow || "domestic"
  };
  const panels = [];

  const industryNameByCode = {};
  const industryNameByYear = {};
  let hashSelections = [];
  let activeResourceSelection = null;
  let currentCurrency = "EUR";
  let currentIndustryLabelMode = "title";
  let availableCurrencyCodes = ["EUR"];
  let currencyRatesPromise = null;
  const impactDataCache = {};
  const resourceSelectionCache = {};
  const currencyRatesByYear = {};
  const impactBaseColumns = {
    trade_id: true,
    year: true,
    region1: true,
    region2: true,
    industry1: true,
    industry2: true,
    amount: true,
    total_level: true,
    factor_count: true,
    unique_factors: true
  };
  const impactIgnoredColumns = {
    level: true,
    total_impact_value: true
  };
  const resourceBaseColumns = {
    trade_id: true,
    year: true,
    region1: true,
    region2: true,
    industry1: true,
    industry2: true,
    amount: true
  };
  const resourceIgnoredColumns = {
    total_resources_value: true,
    resources_count: true,
    unique_resources_factors: true,
    resources_intensity: true
  };
  const summaryCategoryRules = {
    Water: [
      "natural_resource/water",
      "resources_Water_Consumption",
      "resources_Water_Withdrawal"
    ],
    Energy: [
      "natural_resource/energy",
      "resources_Energy"
    ],
    Land: [
      "natural_resource/land",
      "resources_Land_Crops",
      "resources_Land_Forest",
      "resources_Land_Other"
    ],
    Crops: [
      "resources_Crops"
    ],
    Air: [
      "emission/air"
    ]
  };

  function normalizeBasePath(path) {
    const value = String(path || "").trim();
    if (!value || value === ".") {
      return ".";
    }
    return value.replace(/\/+$/, "");
  }

  function joinPath(basePath, nextPath) {
    const base = normalizeBasePath(basePath);
    const next = String(nextPath || "").replace(/^\.?\//, "");
    if (!next) {
      return base;
    }
    if (!base || base === ".") {
      return "./" + next;
    }
    return base + "/" + next;
  }

  const yearBasePath = normalizeBasePath(runtimeConfig.yearBasePath || "./year");
  const datasetBasePath = normalizeBasePath(
    runtimeConfig.datasetBasePath ||
    (manifest && manifest.datasetBasePath ? manifest.datasetBasePath : "./sankey-datasets")
  );
  const dynamicTopNEnabled = Boolean(topnSlider);
  const defaultTopN = normalizeTopN(runtimeConfig.defaultTopN || manifest.sourceLimit || 5);

  function normalizeCode(code) {
    return String(code || "").trim();
  }

  function parseNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeTopN(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return 5;
    }
    return Math.max(5, Math.min(50, parsed));
  }

  function currentTopN() {
    return normalizeTopN(
      activeSelection && activeSelection.topn
        ? activeSelection.topn
        : (topnSlider ? topnSlider.value : defaultTopN)
    );
  }

  function syncTopNControl(value) {
    if (!topnSlider) {
      return;
    }
    const normalized = normalizeTopN(value);
    topnSlider.value = String(normalized);
    if (topnLabel) {
      topnLabel.textContent = String(normalized);
    }
  }

  function buildRawYearPath(relativePath) {
    const configured = runtimeConfig.rawYearBasePath;
    if (configured) {
      return joinPath(configured, relativePath);
    }
    return "https://raw.githubusercontent.com/savar25/trade-data/main/year/" + relativePath;
  }

  function currencyRatesPath() {
    if (runtimeConfig.currencyRatesPath) {
      return runtimeConfig.currencyRatesPath;
    }
    return "https://raw.githubusercontent.com/savar25/trade-data/main/concordance/eur_annual_rates.csv";
  }

  async function fetchTextWithFallback(paths) {
    for (let i = 0; i < paths.length; i += 1) {
      const path = paths[i];
      if (!path) {
        continue;
      }
      try {
        const response = await fetch(path);
        if (!response.ok) {
          continue;
        }
        return await response.text();
      } catch (err) {
        continue;
      }
    }
    return null;
  }

  function loadCurrencyRates() {
    if (currencyRatesPromise) {
      return currencyRatesPromise;
    }

    currencyRatesPromise = fetchTextWithFallback([
      currencyRatesPath(),
      "https://cdn.jsdelivr.net/gh/savar25/trade-data@main/concordance/eur_annual_rates.csv"
    ]).then(function (text) {
      if (!text) {
        return;
      }
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      if (!lines.length) {
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const yearIndex = headers.indexOf("Year");
      const currencyColumns = headers.filter(function (header) {
        return header !== "Year";
      });
      availableCurrencyCodes = ["EUR"].concat(currencyColumns);

      for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
        const row = parseCsvLine(lines[lineIndex]);
        const year = normalizeCode(row[yearIndex]);
        if (!year) {
          continue;
        }
        const rates = { EUR: 1 };
        currencyColumns.forEach(function (currencyCode) {
          const columnIndex = headers.indexOf(currencyCode);
          const rate = parseNumber(row[columnIndex]);
          if (rate > 0) {
            rates[currencyCode] = rate;
          }
        });
        currencyRatesByYear[year] = rates;
      }
    }).catch(function () {
      availableCurrencyCodes = ["EUR"];
    });

    return currencyRatesPromise;
  }

  function supportedFlows() {
    return manifest.supportedFlows && manifest.supportedFlows.length
      ? manifest.supportedFlows.slice()
      : ["domestic", "imports", "exports"];
  }

  function flowsForSelection(country, year) {
    const key = normalizeCode(country) + "|" + normalizeCode(year);
    const flows = manifest.flowsByCountryYear && manifest.flowsByCountryYear[key]
      ? manifest.flowsByCountryYear[key]
      : null;
    return flows && flows.length ? flows.slice() : supportedFlows();
  }

  function resolveIndustryNames(code) {
    const key = normalizeCode(code);
    const yearMap = activeSelection && activeSelection.year
      ? industryNameByYear[normalizeCode(activeSelection.year)]
      : null;
    const fullName = (yearMap && yearMap[key]) || industryNameByCode[key];
    const verbose = fullName && fullName !== key ? fullName : key;
    const title = String(verbose || "")
      .replace(/\s*\([^)]*\)\s*$/g, "")
      .split(";")[0]
      .trim() || key;
    return {
      short: key,
      title: title || key,
      verbose: verbose || title || key
    };
  }

  function resolveIndustryName(code) {
    const names = resolveIndustryNames(code);
    if (currentIndustryLabelMode === "short") {
      return names.short;
    }
    if (currentIndustryLabelMode === "verbose") {
      return names.verbose;
    }
    return names.title;
  }

  function parseCsvLine(row) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        result.push(current);
        current = "";
        continue;
      }
      current += char;
    }

    result.push(current);
    return result;
  }

  function loadIndustryNamesForYears(years) {
    const uniqueYears = Array.from(new Set(years.map(normalizeCode).filter(Boolean)));
    const promises = uniqueYears.map(async function (year) {
      if (industryNameByYear[year]) {
        return;
      }
      const relativeYearPath = encodeURIComponent(year) + "/industry.csv";
      const text = await fetchTextWithFallback([
        joinPath(yearBasePath, relativeYearPath),
        buildRawYearPath(relativeYearPath)
      ]);
      if (!text) {
        console.warn("Industry file not found for year", year);
        return;
      }

      const lines = text.trim().split(/\r?\n/);
      if (!lines.length) {
        return;
      }

      const head = parseCsvLine(lines[0]);
      const industryIdIndex = head.indexOf("industry_id");
      const nameIndex = head.indexOf("name");
      if (industryIdIndex === -1 || nameIndex === -1) {
        console.warn("industry.csv missing required columns:", year);
        return;
      }

      const yearMap = {};
      for (let i = 1; i < lines.length; i += 1) {
        if (!lines[i].trim()) {
          continue;
        }
        const row = parseCsvLine(lines[i]);
        const id = normalizeCode(row[industryIdIndex]);
        const name = String(row[nameIndex] || "").trim();
        if (id) {
          yearMap[id] = name || id;
          industryNameByCode[id] = name || id;
        }
      }
      industryNameByYear[year] = yearMap;
    });
    return Promise.all(promises);
  }

  function readHashState() {
    if (typeof window.getHash === "function") {
      return window.getHash() || {};
    }

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return {
      country: params.get("country") || "",
      year: params.get("year") || "",
      flow: params.get("flow") || "",
      topn: params.get("topn") || ""
    };
  }

  function parseHashSelections() {
    const hashState = readHashState();
    const topn = normalizeTopN(hashState.topn || defaultTopN);
    const countries = (hashState.country || manifest.defaultSelection.country)
      .split(",")
      .map(normalizeCode)
      .filter(Boolean);
    const years = (hashState.year || manifest.defaultSelection.year)
      .split(",")
      .map(normalizeCode)
      .filter(Boolean);
    const flows = (hashState.flow || manifest.defaultSelection.flow || "domestic")
      .split(",")
      .map(normalizeCode)
      .filter(Boolean);

    const selections = [];
    countries.forEach(function (country) {
      if (!manifest.countries.includes(country)) {
        return;
      }
      const availableYears = manifest.yearsByCountry[country] || [];
      years.forEach(function (year) {
        if (!availableYears.includes(year)) {
          return;
        }
        const availableFlows = flowsForSelection(country, year);
        flows.forEach(function (flow) {
          if (availableFlows.includes(flow)) {
            selections.push({ country: country, year: year, flow: flow, topn: topn });
          }
        });
        if (!flows.length && availableFlows.length) {
          selections.push({ country: country, year: year, flow: availableFlows[0], topn: topn });
        }
      });
    });

    if (!selections.length) {
      selections.push({
        country: manifest.defaultSelection.country,
        year: manifest.defaultSelection.year,
        flow: manifest.defaultSelection.flow || "domestic",
        topn: topn
      });
    }

    return selections;
  }

  function writeSelectionHash(co, yr, fl, notify, topnParam) {
    const normalizedCountry = normalizeCode(co || countrySelect.value);
    const normalizedYear = normalizeCode(yr || yearSelect.value);
    const normalizedFlow = normalizeCode(fl || flowSelect.value || manifest.defaultSelection.flow || "domestic");
    const normalizedTopN = normalizeTopN(topnParam || (topnSlider ? topnSlider.value : defaultTopN));
    const nextState = {
      country: normalizedCountry,
      year: normalizedYear,
      flow: normalizedFlow,
      topn: String(normalizedTopN)
    };

    if (
      typeof window.getHash === "function" &&
      typeof window.goHash === "function" &&
      typeof window.updateHash === "function"
    ) {
      if (notify) {
        window.goHash(nextState);
      } else {
        window.updateHash(nextState);
      }
      return;
    }

    const nextHash =
      "country=" + encodeURIComponent(normalizedCountry) +
      "&year=" + encodeURIComponent(normalizedYear) +
      "&flow=" + encodeURIComponent(normalizedFlow) +
      "&topn=" + encodeURIComponent(normalizedTopN);
    if (notify) {
      if (window.location.hash.replace(/^#/, "") !== nextHash) {
        window.location.hash = nextHash;
      }
      return;
    }

    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#" + nextHash);
    } else {
      window.location.hash = nextHash;
    }
  }

  function postToHost(type, detail) {
    if (!window.parent || window.parent === window) {
      return;
    }

    window.parent.postMessage({
      type: type,
      detail: detail
    }, "*");
  }

  function notifyHostSelection() {
    if (!activeSelection || !activeSelection.country || !activeSelection.year || !activeSelection.flow) {
      return;
    }

    postToHost("trade-data:selection", {
      country: activeSelection.country,
      year: activeSelection.year,
      flow: activeSelection.flow
    });
  }

  function notifyHostHeight() {
    postToHost("trade-data:height", {
      height: Math.ceil(pageRoot.scrollHeight)
    });
  }

  function displayIndName(code) {
    const resolved = resolveIndustryName(code);
    if (resolved && resolved !== code) {
      return resolved + " (" + code + ")";
    }
    return code;
  }

  function flowLabel(source, target) {
    return displayIndName(source) + " -> " + displayIndName(target);
  }

  function wrapTextLines(text, maxChars) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) {
      return [""];
    }
    const lines = [];
    let current = "";
    words.forEach(function (word) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) {
      lines.push(current);
    }
    return lines;
  }

  function buildImpactDatasetFromCsvText(text, country, year, flow, sourcePath) {
    const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) {
      return null;
    }

    const header = parseCsvLine(lines[0]);
    const indexByColumn = {};
    header.forEach(function (column, index) {
      indexByColumn[column] = index;
    });

    const indicatorColumns = header.filter(function (column) {
      return !impactBaseColumns[column] && !impactIgnoredColumns[column];
    });
    if (indicatorColumns.indexOf("amount") === -1) {
      indicatorColumns.push("amount");
    }
    const states = {};
    indicatorColumns.forEach(function (indicator) {
      states[indicator] = {
        sourceTotals: {},
        bestLinks: {}
      };
    });

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = parseCsvLine(lines[lineIndex]);
      const source = normalizeCode(row[indexByColumn.industry1]);
      const target = normalizeCode(row[indexByColumn.industry2]);
      if (!source || !target || (manifest.excludedSources || []).includes(source)) {
        continue;
      }

      const tradeId = parseNumber(row[indexByColumn.trade_id]);
      const amount = parseNumber(row[indexByColumn.amount]);
      const totalLevel = parseNumber(row[indexByColumn.total_level]);

      indicatorColumns.forEach(function (indicator) {
        const value = indicator === "amount"
          ? amount
          : parseNumber(row[indexByColumn[indicator]]);
        if (value <= 0) {
          return;
        }

        const state = states[indicator];
        state.sourceTotals[source] = (state.sourceTotals[source] || 0) + value;
        if (!state.bestLinks[source] || value > state.bestLinks[source].value) {
          state.bestLinks[source] = {
            trade_id: tradeId,
            source: source,
            target: target,
            value: value,
            amount: amount,
            total_impact_value: totalLevel
          };
        }
      });
    }

    const dataset = {};
    indicatorColumns.forEach(function (indicator) {
      const state = states[indicator];
      const rankedSources = Object.keys(state.sourceTotals)
        .sort(function (left, right) {
          return (state.sourceTotals[right] - state.sourceTotals[left]) || left.localeCompare(right);
        });

      dataset[indicator] = {
        source_totals: state.sourceTotals,
        links_by_source: state.bestLinks,
        ranked_sources: rankedSources
      };
    });

    const defaults = (manifest.defaults || []).filter(function (indicator) {
      return indicatorColumns.includes(indicator);
    });

    return {
      meta: {
        year: year,
        country: country,
        flow: flow,
        excluded_sources: manifest.excludedSources || [],
        source_limit: defaultTopN,
        source_csv: sourcePath
      },
      indicatorColumns: indicatorColumns,
      defaults: defaults.length ? defaults : indicatorColumns.slice(0, 2),
      dataset: dataset
    };
  }

  function buildResourceSelectionFromCsvText(text, sourcePath) {
    const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) {
      return null;
    }

    const header = parseCsvLine(lines[0]);
    const indexByColumn = {};
    header.forEach(function (column, index) {
      indexByColumn[column] = index;
    });
    const factorColumns = header.filter(function (column) {
      return !resourceBaseColumns[column] && !resourceIgnoredColumns[column];
    });

    const sourceTotals = {};
    const bestLinks = {};
    const factorTotals = {};
    const strongestFactors = {};
    let eligibleRows = 0;

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = parseCsvLine(lines[lineIndex]);
      const source = normalizeCode(row[indexByColumn.industry1]);
      const target = normalizeCode(row[indexByColumn.industry2]);
      const totalResourcesValue = parseNumber(row[indexByColumn.total_resources_value]);
      if (!source || !target || (manifest.excludedSources || []).includes(source) || totalResourcesValue <= 0) {
        continue;
      }

      eligibleRows += 1;
      const tradeId = parseNumber(row[indexByColumn.trade_id]);
      const amount = parseNumber(row[indexByColumn.amount]);

      sourceTotals[source] = (sourceTotals[source] || 0) + totalResourcesValue;
      if (!bestLinks[source] || totalResourcesValue > bestLinks[source].value) {
        bestLinks[source] = {
          trade_id: tradeId,
          source: source,
          target: target,
          value: totalResourcesValue,
          amount: amount
        };
      }

      factorColumns.forEach(function (factor) {
        const factorValue = parseNumber(row[indexByColumn[factor]]);
        if (factorValue <= 0) {
          return;
        }

        factorTotals[factor] = (factorTotals[factor] || 0) + factorValue;
        if (!strongestFactors[factor] || factorValue > strongestFactors[factor].value) {
          strongestFactors[factor] = {
            trade_id: tradeId,
            source: source,
            target: target,
            value: factorValue,
            amount: amount,
            factor: factor
          };
        }
      });
    }

    const rankedSources = Object.keys(sourceTotals)
      .sort(function (left, right) {
        return (sourceTotals[right] - sourceTotals[left]) || left.localeCompare(right);
      });

    const summaryMix = Object.keys(summaryCategoryRules).map(function (label) {
      const columns = summaryCategoryRules[label].filter(function (column) {
        return factorTotals[column] > 0;
      });
      if (!columns.length) {
        return null;
      }
      const preferredColumn = columns[0];
      return {
        name: label,
        value: factorTotals[preferredColumn],
        source_factor: preferredColumn,
        spotlight: strongestFactors[preferredColumn] || null
      };
    }).filter(Boolean).sort(function (left, right) {
      return (right.value - left.value) || left.name.localeCompare(right.name);
    });

    return {
      source_csv: sourcePath,
      eligible_rows: eligibleRows,
      source_totals: sourceTotals,
      links_by_source: bestLinks,
      ranked_sources: rankedSources,
      factor_mix: Object.keys(factorTotals).map(function (factor) {
        return {
          name: factor,
          value: factorTotals[factor]
        };
      }).sort(function (left, right) {
        return (right.value - left.value) || left.name.localeCompare(right.name);
      }),
      factor_spotlight: Object.keys(factorTotals)
        .sort(function (left, right) {
          return (factorTotals[right] - factorTotals[left]) || left.localeCompare(right);
        })
        .slice(0, 6)
        .map(function (factor) {
          return strongestFactors[factor];
        })
        .filter(Boolean),
      summary_mix: summaryMix
    };
  }

  function loadDatasetScript(path) {
    return new Promise(function (resolve) {
      if (activeDatasetScript && activeDatasetScript.parentNode) {
        activeDatasetScript.parentNode.removeChild(activeDatasetScript);
      }

      window.TRADE_SANKEY_DATA = null;
      const script = document.createElement("script");
      script.src = path;
      script.onload = function () {
        activeDatasetScript = script;
        resolve(window.TRADE_SANKEY_DATA && window.TRADE_SANKEY_DATA.dataset ? window.TRADE_SANKEY_DATA : null);
      };
      script.onerror = function () {
        activeDatasetScript = null;
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  async function loadImpactSelection(country, year, flow) {
    const cacheKey = year + "|" + country + "|" + flow;
    if (impactDataCache[cacheKey]) {
      return impactDataCache[cacheKey];
    }

    if (!dynamicTopNEnabled) {
      const scriptPaths = [
        joinPath(datasetBasePath, year + "/" + country + "/" + flow + ".js")
      ];
      if (flow === "domestic") {
        scriptPaths.push(joinPath(datasetBasePath, year + "/" + country + ".js"));
      }

      for (let index = 0; index < scriptPaths.length; index += 1) {
        const scripted = await loadDatasetScript(scriptPaths[index]);
        if (scripted) {
          impactDataCache[cacheKey] = scripted;
          return scripted;
        }
      }
    }

    const relativeCsvPath = year + "/" + country + "/" + flow + "/trade_impact.csv";
    const text = await fetchTextWithFallback([
      joinPath(yearBasePath, relativeCsvPath),
      buildRawYearPath(relativeCsvPath)
    ]);
    if (!text) {
      return null;
    }

    const built = buildImpactDatasetFromCsvText(text, country, year, flow, "year/" + relativeCsvPath);
    if (built) {
      impactDataCache[cacheKey] = built;
    }
    return built;
  }

  async function loadResourceSelection(country, year, flow) {
    const cacheKey = year + "|" + country + "|" + flow;
    if (resourceSelectionCache[cacheKey]) {
      return resourceSelectionCache[cacheKey];
    }

    if (!dynamicTopNEnabled && resourceManifest && resourceManifest.selections && resourceManifest.selections[cacheKey]) {
      resourceSelectionCache[cacheKey] = resourceManifest.selections[cacheKey];
      return resourceSelectionCache[cacheKey];
    }

    const relativeCsvPath = year + "/" + country + "/" + flow + "/trade_resource.csv";
    const text = await fetchTextWithFallback([
      joinPath(yearBasePath, relativeCsvPath),
      buildRawYearPath(relativeCsvPath)
    ]);
    if (!text) {
      return null;
    }

    const built = buildResourceSelectionFromCsvText(text, "year/" + relativeCsvPath);
    if (built) {
      resourceSelectionCache[cacheKey] = built;
    }
    return built;
  }

  function loadDataset(countryParam, yearParam, flowParam, topnParam) {
    const country = countryParam || countrySelect.value;
    const year = yearParam || yearSelect.value;
    const flow = flowParam || flowSelect.value || manifest.defaultSelection.flow || "domestic";
    const topn = normalizeTopN(topnParam || (topnSlider ? topnSlider.value : defaultTopN));

    if (!manifest.countries.includes(country)) {
      updateStatus("Unsupported country " + country + ".", true);
      return Promise.reject(new Error("Unsupported country"));
    }

    const yearsForCountry = manifest.yearsByCountry[country] || [];
    if (!yearsForCountry.includes(year)) {
      updateStatus("Unsupported year " + year + " for " + country + ".", true);
      return Promise.reject(new Error("Unsupported year"));
    }

    const availableFlows = flowsForSelection(country, year);
    if (!availableFlows.includes(flow)) {
      updateStatus("Unsupported flow " + flow + " for " + country + " " + year + ".", true);
      return Promise.reject(new Error("Unsupported flow"));
    }

    activeSelection = { country: country, year: year, flow: flow, topn: topn };

    countrySelect.value = country;
    updateYearOptions();
    yearSelect.value = year;
    updateFlowOptions(country, year);
    flowSelect.value = flow;
    syncTopNControl(topn);

    if (loadButton) {
      loadButton.disabled = true;
    }
    countrySelect.disabled = true;
    yearSelect.disabled = true;
    flowSelect.disabled = true;
    if (topnSlider) {
      topnSlider.disabled = true;
    }
    activeResourceSelection = null;
    updateHeroMeta();
    updateStatus("Loading " + country + " " + year + " " + flow + " impact dataset...", false);
    return Promise.all([
      loadIndustryNamesForYears([year]),
      loadCurrencyRates()
    ]).then(async function () {
      const nextImpactData = await loadImpactSelection(country, year, flow);
      const nextResourceSelection = await loadResourceSelection(country, year, flow);

      if (loadButton) {
        loadButton.disabled = false;
      }
      countrySelect.disabled = false;
      yearSelect.disabled = false;
      flowSelect.disabled = false;
      if (topnSlider) {
        topnSlider.disabled = false;
      }

      sankeyData = nextImpactData;
      activeResourceSelection = nextResourceSelection;
      syncCurrencyOptions(year, currentCurrency);
      syncGlobalOptionVisibility();

      if (!sankeyData || !sankeyData.dataset) {
        updateHeroMeta();
        renderAllPanels();
        updateStatus("No " + flow + " impact dataset file found for " + country + " " + year + ".", true);
        return;
      }

      panels.forEach(function (panelState) {
        if (!panelState.select) {
          return;
        }
        const nextIndicator =
          defaultIndicators()[panelState.config.defaultIndicatorIndex] ||
          indicatorColumns()[panelState.config.defaultIndicatorIndex] ||
          indicatorColumns()[0];
        if (!indicatorColumns().includes(panelState.select.value)) {
          setIndicatorOptions(panelState.select, nextIndicator);
        }
      });

      updateHeroMeta();
      renderAllPanels();
      updateStatus("Loaded " + sankeyData.meta.country + " " + sankeyData.meta.year + " " + sankeyData.meta.flow + " impact dataset.", false);
    });
  }

  function startCase(text) {
    return String(text || "")
      .split(" ")
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function titleizeLabel(label) {
    const replacements = {
      amount: "Amount Spent",
      air_emissions: "Air Emissions",
      employment: "Employment",
      energy: "Energy",
      land: "Land",
      material: "Material",
      water: "Water",
      CO2_total: "CO2 Total",
      CH4_total: "CH4 Total",
      N2O_total: "N2O Total",
      NOX_total: "NOX Total",
      Water_total: "Water Total",
      Employment_total: "Employment Total",
      Energy_total: "Energy Total",
      Land_total: "Land Total",
      impact_intensity: "Impact Intensity",
      "natural_resource/water": "Water",
      "natural_resource/energy": "Energy",
      "natural_resource/land": "Land",
      "resources_Water_Consumption": "Water Consumption",
      "resources_Water_Withdrawal": "Water Withdrawal",
      "resources_Energy": "Energy",
      "resources_Land_Crops": "Land Crops",
      "resources_Land_Forest": "Land Forest",
      "resources_Land_Other": "Land Other",
      "resources_Crops": "Crops",
      "emission/air": "Air Emissions"
    };

    if (replacements[label]) {
      return replacements[label];
    }

    return startCase(
      String(label || "")
        .replace(/^resources_/, "")
        .replace(/^materials_/, "")
        .replace(/^natural_resource\//, "")
        .replace(/^emission\//, "")
        .replace(/_/g, " ")
        .replace(/\//g, " ")
    );
  }

  function formatCompact(value) {
    return compactFormatter.format(Number(value) || 0);
  }

  function formatExact(value) {
    return exactFormatter.format(Number(value) || 0);
  }

  function currencyName(code) {
    const key = normalizeCode(code);
    return CURRENCY_NAMES[key] || key;
  }

  function currenciesForYear(year) {
    const yearRates = currencyRatesByYear[normalizeCode(year)] || { EUR: 1 };
    return availableCurrencyCodes.filter(function (currencyCode) {
      return currencyCode === "EUR" || parseNumber(yearRates[currencyCode]) > 0;
    });
  }

  function syncCurrencyOptions(year, preferredCurrency) {
    if (!currencySelect) {
      return;
    }

    const currencies = currenciesForYear(year);
    const options = currencies.length ? currencies : ["EUR"];
    currencySelect.innerHTML = "";
    options.forEach(function (currencyCode) {
      const option = document.createElement("option");
      option.value = currencyCode;
      option.textContent = currencyCode + " - " + currencyName(currencyCode);
      currencySelect.appendChild(option);
    });

    const fallbackCurrency = normalizeCode(preferredCurrency) || "EUR";
    currencySelect.value = options.includes(fallbackCurrency) ? fallbackCurrency : (options[0] || "EUR");
    currentCurrency = currencySelect.value || "EUR";
  }

  function selectedCurrency() {
    const amountVisible = activeImpactIndicators().some(function (indicator) {
      return indicator === "amount";
    });
    if (!amountVisible) {
      return "EUR";
    }
    return normalizeCode(currentCurrency || (currencySelect && currencySelect.value) || "EUR") || "EUR";
  }

  function currencyRateForYear(year, currencyCode) {
    const currency = normalizeCode(currencyCode) || "EUR";
    if (currency === "EUR") {
      return 1;
    }
    const yearRates = currencyRatesByYear[normalizeCode(year)] || {};
    return parseNumber(yearRates[currency]) || 1;
  }

  function convertAmountValue(value, year, currencyCode) {
    return parseNumber(value) * currencyRateForYear(year, currencyCode);
  }

  function formatAmountExact(value) {
    const currencyCode = selectedCurrency();
    return currencyExactFormatter.format(
      convertAmountValue(value, activeSelection && activeSelection.year, currencyCode)
    ) + " " + currencyCode;
  }

  function formatAmountCompact(value) {
    const currencyCode = selectedCurrency();
    return compactFormatter.format(
      convertAmountValue(value, activeSelection && activeSelection.year, currencyCode)
    ) + " " + currencyCode;
  }

  function formatMetricExact(value, indicator) {
    if (indicator === "amount") {
      return formatAmountExact(value);
    }
    return formatExact(value);
  }

  function formatMetricCompact(value, indicator) {
    if (indicator === "amount") {
      return formatAmountCompact(value);
    }
    return formatCompact(value);
  }

  function activeImpactIndicators() {
    return panels
      .filter(function (panelState) {
        return panelState.config.kind === "impact" && panelState.select;
      })
      .map(function (panelState) {
        return normalizeCode(panelState.select.value);
      })
      .filter(Boolean);
  }

  function syncGlobalOptionVisibility() {
    if (currencyControl) {
      const showCurrency = activeImpactIndicators().some(function (indicator) {
        return indicator === "amount";
      });
      currencyControl.style.display = showCurrency ? "flex" : "none";
    }
  }

  function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0%";
    }
    return (numeric * 100).toFixed(1).replace(/\.0$/, "") + "%";
  }

  function summarizeTradeLeader(flow, links, total) {
    if (!Array.isArray(links) || !links.length) {
      return null;
    }

    let actorKey = null;
    let actorLabel = null;
    if (flow === "imports") {
      actorKey = "target";
      actorLabel = "Largest Importer";
    } else if (flow === "exports") {
      actorKey = "source";
      actorLabel = "Largest Exporter";
    } else {
      return null;
    }

    const totalsByActor = {};
    links.forEach(function (link) {
      const actorCode = normalizeCode(link[actorKey]);
      if (!actorCode) {
        return;
      }
      totalsByActor[actorCode] = (totalsByActor[actorCode] || 0) + parseNumber(link.value);
    });

    const actorCodes = Object.keys(totalsByActor).sort(function (left, right) {
      return (totalsByActor[right] - totalsByActor[left]) || left.localeCompare(right);
    });
    if (!actorCodes.length) {
      return null;
    }

    const code = actorCodes[0];
    const value = totalsByActor[code];
    return {
      actorKey: actorKey,
      actorLabel: actorLabel,
      code: code,
      name: resolveIndustryName(code),
      value: value,
      share: total > 0 ? value / total : 0
    };
  }

  function buildLeaderRows(leader, link, indicator) {
    if (!leader) {
      return [];
    }

    const rows = [
      {
        label: leader.actorLabel,
        value: displayIndName(leader.code)
      },
      {
        label: "Leader Total",
        value: formatMetricCompact(leader.value, indicator) + " (" + formatMetricExact(leader.value, indicator) + ")"
      },
      {
        label: "Leader Share",
        value: formatPercent(leader.share) + " of displayed total"
      }
    ];

    if (link) {
      rows.push({
        label: "This Link Uses Leader",
        value: normalizeCode(link[leader.actorKey]) === leader.code ? "Yes" : "No"
      });
    }

    return rows;
  }

  function hashHue(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash) % 360;
  }

  function colorFor(label, alpha) {
    return "hsla(" + hashHue(label) + ", 62%, 48%, " + alpha + ")";
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (typeof text === "string") {
      element.textContent = text;
    }
    return element;
  }

  function appendTitle(node, text) {
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = text;
    node.appendChild(title);
  }

  function updateStatus(message, isError) {
    statusText.textContent = message;
    statusText.dataset.state = isError ? "error" : "default";
  }

  function renderTooltip(tooltip, title, rows) {
    const safeRows = rows || [];
    tooltip.innerHTML = "";

    const heading = createElement("div", "tooltip-title", title);
    const body = createElement("div", "tooltip-body");
    safeRows.forEach(function (row) {
      const tooltipRow = createElement("div", "tooltip-row");
      const key = createElement("div", "tooltip-key", row.label);
      const value = createElement("div", "tooltip-value", row.value);
      tooltipRow.append(key, value);
      body.appendChild(tooltipRow);
    });

    tooltip.append(heading, body);
  }

  function clampTooltipPosition(x, y, tooltip) {
    const margin = 14;
    const rect = tooltip.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    return {
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop))
    };
  }

  function showTooltip(tooltip, title, rows, x, y) {
    renderTooltip(tooltip, title, rows);
    tooltip.classList.add("is-visible");
    const position = clampTooltipPosition(x, y, tooltip);
    tooltip.style.left = position.left + "px";
    tooltip.style.top = position.top + "px";
    tooltip.setAttribute("aria-hidden", "false");
  }

  function hideTooltip(tooltip) {
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  function resetDetailPanels() {
    if (selectedMark) {
      selectedMark.classList.remove("is-selected");
      selectedMark = null;
    }
    hideTooltip(hoverTooltip);
    hideTooltip(clickTooltip);
  }

  function wireInteractiveMark(mark, hoverRowsFactory, clickRowsFactory) {
    mark.classList.add("interactive-mark");

    mark.addEventListener("mouseenter", function (event) {
      showTooltip(hoverTooltip, "Hover Preview", hoverRowsFactory(), event.clientX + 18, event.clientY + 18);
    });

    mark.addEventListener("mousemove", function (event) {
      showTooltip(hoverTooltip, "Hover Preview", hoverRowsFactory(), event.clientX + 18, event.clientY + 18);
    });

    mark.addEventListener("mouseleave", function () {
      hideTooltip(hoverTooltip);
    });

    mark.addEventListener("click", function (event) {
      if (selectedMark) {
        selectedMark.classList.remove("is-selected");
      }
      selectedMark = mark;
      selectedMark.classList.add("is-selected");
      showTooltip(clickTooltip, "Pinned Detail", clickRowsFactory(), event.clientX + 20, event.clientY + 20);
    });
  }

  function indicatorColumns() {
    return sankeyData && sankeyData.indicatorColumns
      ? sankeyData.indicatorColumns
      : manifest.indicatorColumns;
  }

  function defaultIndicators() {
    const defaults = sankeyData && sankeyData.defaults ? sankeyData.defaults : manifest.defaults;
    return defaults && defaults.length ? defaults.slice(0, 2) : indicatorColumns().slice(0, 2);
  }

  function setIndicatorOptions(select, selectedValue) {
    const columns = indicatorColumns();
    select.innerHTML = "";
    columns.forEach(function (column) {
      const option = document.createElement("option");
      option.value = column;
      option.textContent = titleizeLabel(column);
      if (column === selectedValue) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  function buildPanel(panelIndex, config) {
    const panel = createElement("article", "panel");
    panel.dataset.panel = String(panelIndex + 1);

    const head = createElement("div", "panel-head");
    const copy = createElement("div", "panel-copy");
    const title = createElement("h2", "", config.title);
    const subtitle = createElement("p", "", "Choose a country and year; data loads automatically.");
    copy.append(title, subtitle);

    let select = null;
    if (config.selectable) {
      const control = createElement("div", "control");
      const label = createElement("label", "", "Indicator");
      label.htmlFor = "indicator-" + panelIndex;
      select = createElement("select");
      select.id = "indicator-" + panelIndex;
      const preferred = defaultIndicators()[config.defaultIndicatorIndex] || indicatorColumns()[0];
      setIndicatorOptions(select, preferred);
      control.append(label, select);
      head.append(copy, control);
    } else {
      head.append(copy);
    }

    const stats = createElement("div", "stats");
    const statValues = {};
    config.stats.forEach(function (stat) {
      const statNode = createElement("div", "stat");
      statNode.innerHTML =
        '<span class="label">' + stat.label + '</span>' +
        '<span class="value" data-role="' + stat.key + '">Awaiting load</span>';
      stats.appendChild(statNode);
      statValues[stat.key] = statNode.querySelector('[data-role="' + stat.key + '"]');
    });

    const chartWrap = createElement("div", "chart-wrap");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 760 430");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    chartWrap.appendChild(svg);

    panel.append(head, stats, chartWrap);
    chartGrid.appendChild(panel);

    const panelState = {
      config: config,
      panel: panel,
      title: title,
      subtitle: subtitle,
      select: select,
      svg: svg,
      statValues: statValues
    };

    if (select) {
      select.addEventListener("change", function () {
        resetDetailPanels();
        syncGlobalOptionVisibility();
        renderPanel(panelState);
      });
    }

    panels.push(panelState);
  }

  function setPanelStats(panelState, values) {
    panelState.config.stats.forEach(function (stat) {
      panelState.statValues[stat.key].textContent = values[stat.key] || "Awaiting load";
    });
  }

  function showEmpty(panelState, message) {
    panelState.title.textContent = panelState.config.title;
    panelState.subtitle.textContent = message;
    setPanelStats(panelState, {});
    panelState.svg.innerHTML = "";

    const empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
    empty.setAttribute("x", "380");
    empty.setAttribute("y", "215");
    empty.setAttribute("text-anchor", "middle");
    empty.setAttribute("fill", "#59606d");
    empty.textContent = message;
    panelState.svg.appendChild(empty);
  }

  function distributeNodes(nodes, startY, endY, gap, minHeight) {
    const available = Math.max(endY - startY, 1);
    const desiredHeight = nodes.reduce(function (sum, node) {
      return sum + Math.max(node.height, minHeight);
    }, 0);
    const desiredGap = gap * Math.max(nodes.length - 1, 0);
    const compression = desiredHeight + desiredGap > available
      ? available / Math.max(desiredHeight + desiredGap, 1)
      : 1;
    const appliedGap = gap * compression;

    let cursor = startY;
    nodes.forEach(function (node) {
      node.height = Math.max(2, Math.max(node.height, minHeight) * compression);
      node.y = cursor;
      cursor += node.height + appliedGap;
    });
  }

  function assignLabelCenters(nodes, startY, endY, minGap) {
    if (!nodes.length) {
      return;
    }

    const maxCenter = endY;
    let previousCenter = startY - minGap;
    nodes.forEach(function (node) {
      const desired = node.y + node.height / 2;
      node.labelCenter = Math.max(desired, previousCenter + minGap);
      previousCenter = node.labelCenter;
    });

    let nextCenter = maxCenter;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      node.labelCenter = Math.min(node.labelCenter, nextCenter);
      nextCenter = node.labelCenter - minGap;
    }
  }

  function buildLayout(links) {
    const sourceTotals = new Map();
    const targetTotals = new Map();
    let totalValue = 0;

    links.forEach(function (link) {
      totalValue += link.value;
      sourceTotals.set(link.source, (sourceTotals.get(link.source) || 0) + link.value);
      targetTotals.set(link.target, (targetTotals.get(link.target) || 0) + link.value);
    });

    const width = 760;
    const height = 430;
    const top = 24;
    const bottom = 24;
    const nodeWidth = 18;
    const leftX = 190;
    const rightX = width - 190 - nodeWidth;
    const laneTop = top + 8;
    const laneBottom = height - bottom - 8;
    const padSource = Math.max(10, Math.min(22, 230 / Math.max(sourceTotals.size, 1)));
    const padTarget = Math.max(10, Math.min(22, 230 / Math.max(targetTotals.size, 1)));
    const innerHeightSources = laneBottom - laneTop - padSource * Math.max(sourceTotals.size - 1, 0);
    const innerHeightTargets = laneBottom - laneTop - padTarget * Math.max(targetTotals.size - 1, 0);
    const scale = Math.min(
      innerHeightSources / Math.max(totalValue, 1),
      innerHeightTargets / Math.max(totalValue, 1)
    );

    const sourceNodes = Array.from(sourceTotals.entries())
      .map(function (entry) {
        const code = entry[0];
        return {
          code: code,
          label: resolveIndustryName(code),
          total: entry[1]
        };
      })
      .sort(function (left, right) {
        return right.total - left.total || left.label.localeCompare(right.label);
      });

    const targetNodes = Array.from(targetTotals.entries())
      .map(function (entry) {
        const code = entry[0];
        return {
          code: code,
          label: resolveIndustryName(code),
          total: entry[1]
        };
      })
      .sort(function (left, right) {
        return right.total - left.total || left.label.localeCompare(right.label);
      });

    sourceNodes.forEach(function (node) {
      node.x = leftX;
      node.height = node.total * scale;
    });
    distributeNodes(sourceNodes, laneTop, laneBottom, padSource, 8);
    assignLabelCenters(sourceNodes, laneTop + 16, laneBottom - 16, 26);

    targetNodes.forEach(function (node) {
      node.x = rightX;
      node.height = node.total * scale;
    });
    distributeNodes(targetNodes, laneTop, laneBottom, padTarget, 8);
    assignLabelCenters(targetNodes, laneTop + 16, laneBottom - 16, 26);

    const sourceMap = new Map(sourceNodes.map(function (node) {
      return [node.code, node];
    }));
    const targetMap = new Map(targetNodes.map(function (node) {
      return [node.code, node];
    }));
    const sourceOffsets = new Map();
    const targetOffsets = new Map();

    const laidOutLinks = links.map(function (link) {
      const sourceNode = sourceMap.get(link.source);
      const targetNode = targetMap.get(link.target);
      const thickness = link.value * scale;
      const sourceOffset = sourceOffsets.get(link.source) || 0;
      const targetOffset = targetOffsets.get(link.target) || 0;
      const sourceCenter = sourceNode.y + sourceOffset + thickness / 2;
      const targetCenter = targetNode.y + targetOffset + thickness / 2;
      const curve = (rightX - leftX) * 0.42;

      sourceOffsets.set(link.source, sourceOffset + thickness);
      targetOffsets.set(link.target, targetOffset + thickness);

      return {
        data: link,
        thickness: thickness,
        path: [
          "M", leftX + nodeWidth, sourceCenter,
          "C", leftX + nodeWidth + curve, sourceCenter,
          rightX - curve, targetCenter,
          rightX, targetCenter
        ].join(" ")
      };
    });

    return {
      nodeWidth: nodeWidth,
      sourceNodes: sourceNodes,
      targetNodes: targetNodes,
      links: laidOutLinks
    };
  }

  function renderSankeyPanel(panelState, options) {
    panelState.title.textContent = options.title;
    panelState.subtitle.textContent = options.subtitle;
    setPanelStats(panelState, options.stats);
    panelState.svg.innerHTML = "";

    if (!options.links.length) {
      showEmpty(panelState, options.emptyMessage || "No eligible rows for this view.");
      return;
    }

    const layout = buildLayout(options.links);
    const exactValueFormatter = options.formatExactValue || formatExact;
    const compactValueFormatter = options.formatCompactValue || formatCompact;

    layout.links.forEach(function (link) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "sankey-link");
      path.setAttribute("d", link.path);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorFor(link.data.source, 0.38));
      path.setAttribute("stroke-width", Math.max(link.thickness, 1));
      path.setAttribute("stroke-linecap", "round");
      appendTitle(path, options.title + "\n" + options.buildTitle(link.data));
      wireInteractiveMark(
        path,
        function () {
          return options.buildHoverRows(link.data);
        },
        function () {
          return options.buildClickRows(link.data);
        }
      );
      panelState.svg.appendChild(path);
    });

    layout.sourceNodes.forEach(function (node) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "sankey-node");

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", node.x);
      rect.setAttribute("y", node.y);
      rect.setAttribute("width", layout.nodeWidth);
      rect.setAttribute("height", Math.max(node.height, 1));
      rect.setAttribute("rx", "0");
      rect.setAttribute("fill", colorFor(node.code, 0.9));
      rect.setAttribute("opacity", "0.92");
      appendTitle(rect, node.label + " (" + node.code + ") source total: " + exactValueFormatter(node.total));
      group.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", node.x - 10);
      label.setAttribute("text-anchor", "end");

      const lines = wrapTextLines(node.label, 24);
      const lineHeight = 14;
      const labelTop = node.labelCenter - ((lines.length - 1) * lineHeight) / 2;
      label.setAttribute("y", labelTop);

      lines.forEach(function (line, index) {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        if (index === 0) {
          tspan.setAttribute("dy", "0");
        } else {
          tspan.setAttribute("dy", lineHeight);
        }
        tspan.setAttribute("x", node.x - 10);
        tspan.textContent = line;
        label.appendChild(tspan);
      });

      group.appendChild(label);

      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("class", "node-value");
      value.setAttribute("x", node.x - 10);
      value.setAttribute("y", node.labelCenter + 12);
      value.setAttribute("text-anchor", "end");
      value.textContent = compactValueFormatter(node.total);
      group.appendChild(value);

      panelState.svg.appendChild(group);
    });

    layout.targetNodes.forEach(function (node) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "sankey-node");

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", node.x);
      rect.setAttribute("y", node.y);
      rect.setAttribute("width", layout.nodeWidth);
      rect.setAttribute("height", Math.max(node.height, 1));
      rect.setAttribute("rx", "0");
      rect.setAttribute("fill", colorFor(node.code, 0.9));
      rect.setAttribute("opacity", "0.92");
      appendTitle(rect, node.label + " (" + node.code + ") target total: " + exactValueFormatter(node.total));
      group.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", node.x + layout.nodeWidth + 10);
      label.setAttribute("text-anchor", "start");

      const lines = wrapTextLines(node.label, 24);
      const lineHeight = 14;
      const labelTop = node.labelCenter - ((lines.length - 1) * lineHeight) / 2;
      label.setAttribute("y", labelTop);

      lines.forEach(function (line, index) {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        if (index === 0) {
          tspan.setAttribute("dy", "0");
        } else {
          tspan.setAttribute("dy", lineHeight);
        }
        tspan.setAttribute("x", node.x + layout.nodeWidth + 10);
        tspan.textContent = line;
        label.appendChild(tspan);
      });

      group.appendChild(label);

      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("class", "node-value");
      value.setAttribute("x", node.x + layout.nodeWidth + 10);
      value.setAttribute("y", node.labelCenter + 9);
      value.setAttribute("text-anchor", "start");
      value.textContent = compactValueFormatter(node.total);
      group.appendChild(value);

      panelState.svg.appendChild(group);
    });
  }

  function renderBarPanel(panelState, options) {
    panelState.title.textContent = options.title;
    panelState.subtitle.textContent = options.subtitle;
    setPanelStats(panelState, options.stats);
    panelState.svg.innerHTML = "";

    if (!options.items.length) {
      showEmpty(panelState, options.emptyMessage || "No resource mix available for this selection.");
      return;
    }

    const width = 760;
    const height = 430;
    const left = 220;
    const right = 96;
    const top = 54;
    const barHeight = 28;
    const rowGap = 24;
    const plotWidth = width - left - right;
    const maxValue = Math.max.apply(
      null,
      options.items.map(function (item) {
        return item.value;
      }).concat([1])
    );

    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      const x = left + plotWidth * tick;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "bar-grid-line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", top - 26);
      line.setAttribute("x2", x);
      line.setAttribute("y2", height - 30);
      panelState.svg.appendChild(line);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "bar-grid-text");
      label.setAttribute("x", x);
      label.setAttribute("y", top - 32);
      label.setAttribute("text-anchor", tick === 1 ? "end" : tick === 0 ? "start" : "middle");
      label.textContent = formatCompact(maxValue * tick);
      panelState.svg.appendChild(label);
    });

    options.items.forEach(function (item, index) {
      const y = top + index * (barHeight + rowGap);
      const barWidth = Math.max(4, plotWidth * (item.value / maxValue));

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "bar-label");
      label.setAttribute("x", left - 14);
      label.setAttribute("y", y + barHeight / 2 - 3);
      label.setAttribute("text-anchor", "end");
      label.textContent = item.name;
      panelState.svg.appendChild(label);

      const hint = document.createElementNS("http://www.w3.org/2000/svg", "text");
      hint.setAttribute("class", "bar-hint");
      hint.setAttribute("x", left - 14);
      hint.setAttribute("y", y + barHeight / 2 + 12);
      hint.setAttribute("text-anchor", "end");
      hint.textContent = titleizeLabel(item.sourceFactor || "");
      panelState.svg.appendChild(hint);

      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("class", "bar-mark");
      bar.setAttribute("x", left);
      bar.setAttribute("y", y);
      bar.setAttribute("width", barWidth);
      bar.setAttribute("height", barHeight);
      bar.setAttribute("rx", "10");
      bar.setAttribute("fill", colorFor(item.name, 0.82));
      appendTitle(bar, item.name + ": " + formatExact(item.value));
      wireInteractiveMark(
        bar,
        function () {
          return options.buildHoverRows(item);
        },
        function () {
          return options.buildClickRows(item);
        }
      );
      panelState.svg.appendChild(bar);

      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("class", "bar-value");
      value.setAttribute("x", Math.min(left + barWidth + 10, width - 10));
      value.setAttribute("y", y + barHeight / 2 + 4);
      value.setAttribute("text-anchor", left + barWidth + 90 > width ? "end" : "start");
      if (left + barWidth + 90 > width) {
        value.setAttribute("x", width - 12);
      }
      value.textContent = formatCompact(item.value);
      panelState.svg.appendChild(value);
    });
  }

  function getResourceSelection() {
    return activeResourceSelection;
  }

  function renderImpactPanel(panelState) {
    if (!sankeyData || !sankeyData.dataset) {
      showEmpty(panelState, "Choose a country, flow, and year; data loads automatically.");
      return;
    }

    const fallbackIndicator =
      defaultIndicators()[panelState.config.defaultIndicatorIndex] ||
      indicatorColumns()[panelState.config.defaultIndicatorIndex] ||
      indicatorColumns()[0];
    const indicator = panelState.select && panelState.select.value ? panelState.select.value : fallbackIndicator;
    const indicatorData = sankeyData.dataset[indicator];
    const rankedSources = indicatorData && indicatorData.ranked_sources ? indicatorData.ranked_sources.slice(0, currentTopN()) : [];
    const rawLinks = rankedSources.length
      ? rankedSources.map(function (source) {
        return indicatorData.links_by_source[source];
      }).filter(Boolean).sort(function (left, right) {
        return (right.value - left.value) || left.source.localeCompare(right.source) || left.target.localeCompare(right.target);
      })
      : ((indicatorData && indicatorData.links ? indicatorData.links.slice(0, currentTopN()) : []));
    const links = rawLinks.map(function (link) {
      return {
        trade_id: Number(link.trade_id),
        source: link.source,
        target: link.target,
        value: Number(link.value),
        amount: Number(link.amount),
        total_impact_value: Number(link.total_impact_value)
      };
    });

    if (!links.length) {
      showEmpty(panelState, "No eligible rows for this indicator.");
      return;
    }

    const total = rankedSources.length
      ? rankedSources.reduce(function (sum, source) {
        return sum + (indicatorData.source_totals[source] || 0);
      }, 0)
      : links.reduce(function (sum, link) {
        return sum + link.value;
      }, 0);
    const topLink = links[0];
    const leader = summarizeTradeLeader(activeSelection && activeSelection.flow, links, total);
    const flowDescriptor = activeSelection && activeSelection.flow ? startCase(activeSelection.flow) : "Domestic";

    renderSankeyPanel(panelState, {
      title: panelState.config.title + ": " + titleizeLabel(indicator),
      subtitle: "",
      links: links,
      stats: {
        total: formatMetricCompact(total, indicator) + " (" + formatMetricExact(total, indicator) + ")",
        largest: flowLabel(topLink.source, topLink.target) + " (" + formatMetricCompact(topLink.value, indicator) + ")",
        leader: leader
          ? leader.actorLabel + ": " + displayIndName(leader.code) + " (" + formatMetricCompact(leader.value, indicator) + ")"
          : flowDescriptor + " flow"
      },
      formatExactValue: function (value) {
        return formatMetricExact(value, indicator);
      },
      formatCompactValue: function (value) {
        return formatMetricCompact(value, indicator);
      },
      buildTitle: function (link) {
        const lines = [
          titleizeLabel(indicator) + ": " + formatMetricExact(link.value, indicator),
          "Flow: " + flowLabel(link.source, link.target),
          "Trade ID: " + link.trade_id,
          "Amount Spent: " + formatAmountExact(link.amount),
          "Total Impact Value: " + formatExact(link.total_impact_value)
        ];
        if (leader) {
          lines.push(leader.actorLabel + ": " + displayIndName(leader.code));
          lines.push("Leader Share: " + formatPercent(leader.share) + " of displayed total");
        }
        return lines.join("\n");
      },
      buildHoverRows: function (link) {
        return [
          { label: "Chart", value: panelState.config.title },
          { label: "Indicator", value: titleizeLabel(indicator) },
          { label: "Selection Flow", value: flowDescriptor },
          { label: "Flow", value: flowLabel(link.source, link.target) },
          { label: "Value", value: formatMetricExact(link.value, indicator) }
        ].concat(buildLeaderRows(leader, link, indicator));
      },
      buildClickRows: function (link) {
        return [
          { label: "Chart", value: panelState.config.title },
          { label: "Indicator", value: titleizeLabel(indicator) },
          { label: "Selection Flow", value: flowDescriptor },
          { label: "Exporter", value: displayIndName(link.source) },
          { label: "Importer", value: displayIndName(link.target) },
          { label: "Flow", value: flowLabel(link.source, link.target) },
          { label: "Trade ID", value: String(link.trade_id) },
          { label: "Amount Spent", value: formatAmountExact(link.amount) },
          { label: "Value", value: formatMetricExact(link.value, indicator) },
          { label: "Impact", value: formatExact(link.total_impact_value) }
        ].concat(buildLeaderRows(leader, link, indicator));
      }
    });
  }

  function renderResourceFlowPanel(panelState) {
    const resourceSelection = getResourceSelection();
    if (!resourceSelection) {
      showEmpty(panelState, "No trade_resource.csv dataset found for this flow.");
      return;
    }

    const rankedSources = (resourceSelection.ranked_sources || []).slice(0, currentTopN());
    const rawLinks = rankedSources.length
      ? rankedSources.map(function (source) {
        return resourceSelection.links_by_source[source];
      }).filter(Boolean).sort(function (left, right) {
        return (right.value - left.value) || left.source.localeCompare(right.source) || left.target.localeCompare(right.target);
      })
      : ((resourceSelection.flow_links || []).slice(0, currentTopN()));
    const links = rawLinks.map(function (link) {
      return {
        trade_id: Number(link.trade_id),
        source: link.source,
        target: link.target,
        value: Number(link.value),
        amount: Number(link.amount)
      };
    });

    if (!links.length) {
      showEmpty(panelState, "No eligible resource flows for this selection.");
      return;
    }

    const total = rankedSources.length
      ? rankedSources.reduce(function (sum, source) {
        return sum + (resourceSelection.source_totals[source] || 0);
      }, 0)
      : links.reduce(function (sum, link) {
        return sum + link.value;
      }, 0);
    const topLink = links[0];

    renderSankeyPanel(panelState, {
      title: panelState.config.title,
      subtitle: "",
      links: links,
      stats: {
        total: formatCompact(total) + " (" + formatExact(total) + ")",
        largest: flowLabel(topLink.source, topLink.target) + " (" + formatCompact(topLink.value) + ")"
      },
      buildTitle: function (link) {
        return [
          "Total Resources: " + formatExact(link.value),
          "Flow: " + flowLabel(link.source, link.target),
          "Trade ID: " + link.trade_id,
          "Amount Spent: " + formatAmountExact(link.amount)
        ].join("\n");
      },
      buildHoverRows: function (link) {
        return [
          { label: "Chart", value: "Resource Flow" },
          { label: "Dataset", value: "trade_resource.csv" },
          { label: "Flow", value: flowLabel(link.source, link.target) },
          { label: "Value", value: formatExact(link.value) }
        ];
      },
      buildClickRows: function (link) {
        return [
          { label: "Chart", value: "Resource Flow" },
          { label: "Dataset", value: "trade_resource.csv" },
          { label: "Flow", value: flowLabel(link.source, link.target) },
          { label: "Trade ID", value: String(link.trade_id) },
          { label: "Amount Spent", value: formatAmountExact(link.amount) },
          { label: "Resources", value: formatExact(link.value) }
        ];
      }
    });
  }

  function renderResourceMixPanel(panelState) {
    const resourceSelection = getResourceSelection();
    if (!resourceSelection) {
      showEmpty(panelState, "No trade_resource.csv dataset found for this flow.");
      return;
    }

    const items = (resourceSelection.summary_mix || []).slice(0, 5).map(function (item, index) {
      return {
        name: item.name,
        value: Number(item.value),
        sourceFactor: item.source_factor,
        spotlight: item.spotlight || null,
        rank: index + 1
      };
    });

    if (!items.length) {
      showEmpty(panelState, "No resource category mix available for this selection.");
      return;
    }

    const mixTotal = items.reduce(function (sum, item) {
      return sum + item.value;
    }, 0);
    const dominant = items[0];
    const spotlight = dominant.spotlight;
    const spotlightText = spotlight
      ? flowLabel(spotlight.source, spotlight.target)
      : "No spotlight flow";

    renderBarPanel(panelState, {
      title: panelState.config.title,
      subtitle:
        "High-level resource buckets summarizing the selected " +
        resourceSelection.source_csv + " file.",
      items: items,
      stats: {
        total: items.length + " buckets",
        scope: dominant.name + " (" + formatCompact(dominant.value) + ")",
        largest: spotlightText
      },
      buildHoverRows: function (item) {
        const rows = [
          { label: "Chart", value: "Resource Mix" },
          { label: "Selection", value: activeSelection.country + " / " + activeSelection.year + " / " + startCase(activeSelection.flow) },
          { label: "Rank", value: String(item.rank) + " of " + String(items.length) },
          { label: "Bucket", value: item.name },
          { label: "Factor", value: titleizeLabel(item.sourceFactor) },
          { label: "Total", value: formatExact(item.value) },
          { label: "Share", value: formatPercent(mixTotal ? item.value / mixTotal : 0) }
        ];
        if (item.spotlight) {
          rows.push({ label: "Spotlight", value: flowLabel(item.spotlight.source, item.spotlight.target) });
          rows.push({ label: "Trade ID", value: String(item.spotlight.trade_id) });
        }
        return rows;
      },
      buildClickRows: function (item) {
        const rows = [
          { label: "Chart", value: "Resource Mix" },
          { label: "Selection", value: activeSelection.country + " / " + activeSelection.year + " / " + startCase(activeSelection.flow) },
          { label: "Source CSV", value: resourceSelection.source_csv || "trade_resource.csv" },
          { label: "Rank", value: String(item.rank) + " of " + String(items.length) },
          { label: "Bucket", value: item.name },
          { label: "Factor", value: titleizeLabel(item.sourceFactor) },
          { label: "Total", value: formatExact(item.value) },
          { label: "Share", value: formatPercent(mixTotal ? item.value / mixTotal : 0) }
        ];

        if (item.spotlight) {
          rows.push({ label: "Flow", value: flowLabel(item.spotlight.source, item.spotlight.target) });
          rows.push({ label: "Trade ID", value: String(item.spotlight.trade_id) });
          rows.push({ label: "Amount Spent", value: formatAmountExact(item.spotlight.amount) });
          rows.push({ label: "Spotlight Value", value: formatExact(item.spotlight.value) });
        }

        return rows;
      }
    });
  }

  function renderPanel(panelState) {
    if (panelState.config.kind === "impact") {
      renderImpactPanel(panelState);
      return;
    }

    if (panelState.config.kind === "resource-flow") {
      renderResourceFlowPanel(panelState);
      return;
    }

    renderResourceMixPanel(panelState);
  }

  function renderAllPanels() {
    resetDetailPanels();
    panels.forEach(function (panelState) {
      if (panelState.select) {
        const preferred =
          defaultIndicators()[panelState.config.defaultIndicatorIndex] ||
          indicatorColumns()[panelState.config.defaultIndicatorIndex] ||
          indicatorColumns()[0];
        if (!indicatorColumns().includes(panelState.select.value)) {
          setIndicatorOptions(panelState.select, preferred);
        }
      }
      renderPanel(panelState);
    });
  }

  function updateYearOptions() {
    const country = countrySelect.value;
    const years = manifest.yearsByCountry[country] || [];
    const currentYear = yearSelect.value;
    yearSelect.innerHTML = "";

    years.forEach(function (year) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    if (years.includes(currentYear)) {
      yearSelect.value = currentYear;
    } else if (years.length) {
      yearSelect.value = years[0];
    }
  }

  function updateFlowOptions(countryParam, yearParam) {
    const country = countryParam || countrySelect.value;
    const year = yearParam || yearSelect.value;
    const flows = flowsForSelection(country, year);
    const currentFlow = flowSelect.value;

    flowSelect.innerHTML = "";
    flows.forEach(function (flow) {
      const option = document.createElement("option");
      option.value = flow;
      option.textContent = startCase(flow);
      flowSelect.appendChild(option);
    });

    if (flows.includes(currentFlow)) {
      flowSelect.value = currentFlow;
    } else if (flows.length) {
      flowSelect.value = flows[0];
    }
  }

  function updateHeroMeta() {
    if (activeSelection && activeSelection.country && activeSelection.year && activeSelection.flow) {
      selectionPill.textContent =
        "Selection: " +
        activeSelection.country +
        " / " +
        activeSelection.year +
        " / " +
        startCase(activeSelection.flow) +
        " / Top " +
        currentTopN();
    } else {
      selectionPill.textContent = "Selection: --";
    }
    notifyHostSelection();
  }

  function syncSelectionFromHash() {
    const nextSelections = parseHashSelections();
    if (!nextSelections.length) {
      return;
    }

    const next = nextSelections[0];
    if (
      activeSelection &&
      activeSelection.country === next.country &&
      activeSelection.year === next.year &&
      activeSelection.flow === next.flow &&
      currentTopN() === normalizeTopN(next.topn)
    ) {
      return;
    }

    loadDataset(next.country, next.year, next.flow, next.topn);
  }

  manifest.countries.forEach(function (country) {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    countrySelect.appendChild(option);
  });

  hashSelections = parseHashSelections();

  if (hashSelections.length) {
    const first = hashSelections[0];
    countrySelect.value = first.country;
    updateYearOptions();
    updateFlowOptions(first.country, first.year);
    yearSelect.value = first.year;
    flowSelect.value = first.flow;
    syncTopNControl(first.topn);
    writeSelectionHash(first.country, first.year, first.flow, false, first.topn);
  } else {
    countrySelect.value = manifest.defaultSelection.country;
    updateYearOptions();
    updateFlowOptions(manifest.defaultSelection.country, manifest.defaultSelection.year);
    yearSelect.value = manifest.defaultSelection.year;
    flowSelect.value = manifest.defaultSelection.flow || "domestic";
    syncTopNControl(defaultTopN);
    writeSelectionHash(
      manifest.defaultSelection.country,
      manifest.defaultSelection.year,
      manifest.defaultSelection.flow || "domestic",
      false,
      defaultTopN
    );
    hashSelections = [{
      country: manifest.defaultSelection.country,
      year: manifest.defaultSelection.year,
      flow: manifest.defaultSelection.flow || "domestic",
      topn: defaultTopN
    }];
  }

  countrySelect.addEventListener("change", function () {
    updateYearOptions();
    updateFlowOptions(countrySelect.value, yearSelect.value);
    const selectedCountry = countrySelect.value;
    const selectedYear = yearSelect.value;
    const selectedFlow = flowSelect.value;
    const selectedTopN = currentTopN();
    writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN);
    loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN);
  });

  flowSelect.addEventListener("change", function () {
    const selectedCountry = countrySelect.value;
    const selectedYear = yearSelect.value;
    const selectedFlow = flowSelect.value;
    const selectedTopN = currentTopN();
    writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN);
    loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN);
  });

  yearSelect.addEventListener("change", function () {
    updateFlowOptions(countrySelect.value, yearSelect.value);
    const selectedCountry = countrySelect.value;
    const selectedYear = yearSelect.value;
    const selectedFlow = flowSelect.value;
    const selectedTopN = currentTopN();
    writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN);
    loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN);
  });

  if (topnSlider) {
    topnSlider.addEventListener("input", function () {
      const selectedTopN = normalizeTopN(topnSlider.value);
      syncTopNControl(selectedTopN);
      activeSelection.topn = selectedTopN;
      writeSelectionHash(countrySelect.value, yearSelect.value, flowSelect.value, false, selectedTopN);
      updateHeroMeta();
      renderAllPanels();
      updateStatus(
        "Showing top " + selectedTopN + " flows for " +
        activeSelection.country + " " + activeSelection.year + " " + activeSelection.flow + ".",
        false
      );
    });
  }

  if (currencySelect) {
    currencySelect.innerHTML = '<option value="EUR">EUR - Euro</option>';
    currencySelect.addEventListener("change", function () {
      currentCurrency = normalizeCode(currencySelect.value) || "EUR";
      renderAllPanels();
    });
  }

  if (industryLabelSelect) {
    industryLabelSelect.value = currentIndustryLabelMode;
    industryLabelSelect.addEventListener("change", function () {
      currentIndustryLabelMode = normalizeCode(industryLabelSelect.value) || "title";
      renderAllPanels();
    });
  }

  document.addEventListener("hashChangeEvent", syncSelectionFromHash);
  window.addEventListener("hashchange", syncSelectionFromHash);
  window.addEventListener("message", function (event) {
    const data = event.data || {};
    if (data.type !== "trade-data:set-selection" || !data.detail) {
      return;
    }

    const nextCountry = normalizeCode(data.detail.country);
    const nextYear = normalizeCode(data.detail.year);
    const nextFlow = normalizeCode(data.detail.flow || manifest.defaultSelection.flow || "domestic");
    if (!nextCountry || !nextYear || !nextFlow) {
      return;
    }

    if (
      activeSelection &&
      activeSelection.country === nextCountry &&
      activeSelection.year === nextYear &&
      activeSelection.flow === nextFlow
    ) {
      return;
    }

    writeSelectionHash(nextCountry, nextYear, nextFlow, false, currentTopN());
    loadDataset(nextCountry, nextYear, nextFlow, currentTopN());
  });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(function () {
      notifyHostHeight();
    });
    resizeObserver.observe(document.body);
  } else {
    window.addEventListener("resize", notifyHostHeight);
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest(".interactive-mark")) {
      return;
    }
    if (selectedMark) {
      selectedMark.classList.remove("is-selected");
      selectedMark = null;
    }
    hideTooltip(clickTooltip);
  });

  panelConfigs.forEach(function (config, index) {
    buildPanel(index, config);
  });

  syncGlobalOptionVisibility();
  updateHeroMeta();
  renderAllPanels();
  notifyHostHeight();

  (async function loadHashSelections() {
    const uniqueYears = Array.from(new Set(hashSelections.map(function (h) { return h.year; })));
    await loadIndustryNamesForYears(uniqueYears);
    for (let i = 0; i < hashSelections.length; i += 1) {
      const sel = hashSelections[i];
      await loadDataset(sel.country, sel.year, sel.flow, sel.topn);
    }
  }());
}());
