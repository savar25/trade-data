(function () {
  const manifest = window.TRADE_SANKEY_MANIFEST;
  const resourceManifest = window.TRADE_RESOURCE_DATA;
  const chartGrid = document.getElementById("chart-grid");
  const countrySelect = document.getElementById("country-select");
  const otherCountryControl = document.getElementById("other-country-control");
  const otherCountryLabel = document.getElementById("other-country-label");
  const otherCountrySelect = document.getElementById("other-country");
  const flowSelect = document.getElementById("flow-select");
  const yearSelect = document.getElementById("year-select");
  const metricSelect = document.getElementById("metric-select");
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
  const fallbackIndicatorColumns = [
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
    "impact_intensity"
  ];
  const fallbackDefaultIndicators = ["amount", "CO2_total"];

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
        { key: "largest", label: "Largest Link" },
        { key: "leader", label: "Trade Leader" }
      ]
    },
    {
      kind: "resource-flow",
      title: "Resource Flow",
      selectable: false,
      stats: [
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
    },
    {
      kind: "partner-score",
      title: "Best Import/Export Score",
      selectable: true,
      defaultIndicatorIndex: 0,
      viewBoxHeight: 520,
      stats: [
        { key: "best", label: "Best Score" },
        { key: "strongest", label: "Strongest Trade" },
        { key: "coverage", label: "Visible Partners" }
      ]
    },
    {
      kind: "trade-map",
      title: "Trade Partner Map",
      selectable: false,
      viewBoxHeight: 520,
      stats: [
        { key: "best", label: "Top Partner" },
        { key: "mapped", label: "Mapped Countries" },
        { key: "unmapped", label: "Regional Aggregates" }
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
  let selectedMark = null;
  let activeSelection = {
    country: manifest.defaultSelection.country,
    year: manifest.defaultSelection.year,
    flow: manifest.defaultSelection.flow || "domestic",
    otherCountry: "",
    metric: fallbackDefaultIndicators[0]
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
  let countryLookupPromise = null;
  const impactDataCache = {};
  const resourceSelectionCache = {};
  const currencyRatesByYear = {};
  const countryLookupByCode = {};
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
  const aggregatePartnerLabels = {
    WA: "Asia-Pacific Aggregate",
    WE: "Europe Aggregate",
    WF: "Africa Aggregate",
    WL: "Americas Aggregate",
    WM: "Middle East Aggregate"
  };
  const partnerGeoCenters = {
    AT: { lon: 14.3, lat: 47.7 },
    AU: { lon: 134.0, lat: -25.0 },
    BE: { lon: 4.6, lat: 50.8 },
    BG: { lon: 25.4, lat: 42.7 },
    BR: { lon: -51.0, lat: -10.0 },
    CA: { lon: -106.0, lat: 57.0 },
    CH: { lon: 8.2, lat: 46.8 },
    CN: { lon: 104.0, lat: 35.0 },
    CY: { lon: 33.2, lat: 35.0 },
    CZ: { lon: 15.5, lat: 49.8 },
    DE: { lon: 10.4, lat: 51.2 },
    DK: { lon: 9.5, lat: 56.2 },
    EE: { lon: 25.0, lat: 58.7 },
    ES: { lon: -3.7, lat: 40.4 },
    FI: { lon: 25.7, lat: 63.4 },
    FR: { lon: 2.2, lat: 46.2 },
    GB: { lon: -2.8, lat: 54.5 },
    GR: { lon: 21.8, lat: 39.1 },
    HR: { lon: 15.2, lat: 45.1 },
    HU: { lon: 19.3, lat: 47.2 },
    ID: { lon: 117.0, lat: -2.0 },
    IE: { lon: -8.2, lat: 53.4 },
    IN: { lon: 78.9, lat: 21.0 },
    IT: { lon: 12.6, lat: 42.8 },
    JP: { lon: 138.0, lat: 37.0 },
    KR: { lon: 127.8, lat: 36.3 },
    LT: { lon: 23.9, lat: 55.2 },
    LU: { lon: 6.1, lat: 49.8 },
    LV: { lon: 24.6, lat: 56.9 },
    MT: { lon: 14.4, lat: 35.9 },
    MX: { lon: -102.0, lat: 23.0 },
    NL: { lon: 5.3, lat: 52.1 },
    NO: { lon: 8.5, lat: 61.5 },
    PL: { lon: 19.1, lat: 51.9 },
    PT: { lon: -8.0, lat: 39.5 },
    RO: { lon: 24.9, lat: 45.9 },
    RU: { lon: 90.0, lat: 60.0 },
    SE: { lon: 15.0, lat: 62.0 },
    SI: { lon: 14.9, lat: 46.1 },
    SK: { lon: 19.7, lat: 48.7 },
    TR: { lon: 35.2, lat: 39.0 },
    TW: { lon: 121.0, lat: 23.7 },
    US: { lon: -98.0, lat: 39.8 },
    WA: { lon: 105.0, lat: 20.0 },
    WE: { lon: 15.0, lat: 50.0 },
    WF: { lon: 20.0, lat: 3.0 },
    WL: { lon: -70.0, lat: 12.0 },
    WM: { lon: 45.0, lat: 24.0 },
    ZA: { lon: 24.0, lat: -29.0 }
  };
  const aggregateRegionRadiusMeters = {
    WA: 2300000,
    WE: 1800000,
    WF: 2300000,
    WL: 2600000,
    WM: 1700000
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

  function buildConcordancePath(relativePath) {
    const configured = runtimeConfig.concordanceBasePath;
    if (configured) {
      return joinPath(configured, relativePath);
    }
    return "./concordance/" + relativePath;
  }

  function buildRawConcordancePath(relativePath) {
    const configured = runtimeConfig.rawConcordanceBasePath;
    if (configured) {
      return joinPath(configured, relativePath);
    }
    return "https://raw.githubusercontent.com/savar25/trade-data/main/concordance/" + relativePath;
  }

  function currencyRatesPath() {
    if (runtimeConfig.currencyRatesPath) {
      return runtimeConfig.currencyRatesPath;
    }
    return buildRawConcordancePath("eur_annual_rates.csv");
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

  function chooseCountryLabel(countries) {
    return countries.slice().sort(function (left, right) {
      return left.length - right.length || left.localeCompare(right);
    })[0] || "";
  }

  function countryLabelForCode(code) {
    const key = normalizeCode(code);
    if (!key) {
      return "";
    }

    const lookup = countryLookupByCode[key];
    if (!lookup) {
      return key;
    }
    if (lookup.mappable && lookup.name) {
      return lookup.name;
    }
    return lookup.label || key;
  }

  function loadCountryLookup() {
    if (countryLookupPromise) {
      return countryLookupPromise;
    }

    countryLookupPromise = fetchTextWithFallback([
      buildConcordancePath("exio_country_concordance.csv"),
      buildRawConcordancePath("exio_country_concordance.csv")
    ]).then(function (text) {
      if (!text) {
        return;
      }

      const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        return;
      }

      const header = parseCsvLine(lines[0]);
      const indexByColumn = {};
      header.forEach(function (column, index) {
        indexByColumn[column] = index;
      });

      const pendingByCode = {};
      for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
        const row = parseCsvLine(lines[lineIndex]);
        const code = normalizeCode(row[indexByColumn.CountryCode]);
        const name = String(row[indexByColumn.Country] || "").trim();
        const iso = normalizeCode(row[indexByColumn.ISO_Code]);

        if (!code || !name) {
          continue;
        }

        if (!pendingByCode[code]) {
          pendingByCode[code] = {
            countries: new Set(),
            isos: new Set()
          };
        }
        pendingByCode[code].countries.add(name);
        if (iso) {
          pendingByCode[code].isos.add(iso);
        }
      }

      Object.keys(pendingByCode).forEach(function (code) {
        const entry = pendingByCode[code];
        const countries = Array.from(entry.countries);
        const isos = Array.from(entry.isos);
        const label = chooseCountryLabel(countries) || aggregatePartnerLabels[code] || code;
        const mappable = isos.length === 1;

        countryLookupByCode[code] = {
          code: code,
          iso: mappable ? isos[0] : "",
          name: mappable ? label : "",
          label: mappable ? label : (aggregatePartnerLabels[code] || label || (code + " Aggregate")),
          mappable: mappable,
          countryCount: countries.length
        };
      });
    }).catch(function () {
      return;
    });

    return countryLookupPromise;
  }

  function loadCurrencyRates() {
    if (currencyRatesPromise) {
      return currencyRatesPromise;
    }

    currencyRatesPromise = fetchTextWithFallback([
      currencyRatesPath(),
      buildConcordancePath("eur_annual_rates.csv")
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
      othercountry: params.get("othercountry") || "",
      year: params.get("year") || "",
      flow: params.get("flow") || "",
      topn: params.get("topn") || "",
      metric: params.get("metric") || ""
    };
  }

  function parseHashSelections() {
    const hashState = readHashState();
    const topn = normalizeTopN(hashState.topn || defaultTopN);
    const otherCountry = normalizeCode(hashState.othercountry || "");
    const metric = normalizeCode(hashState.metric || fallbackDefaultIndicators[0]);
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
            selections.push({ country: country, otherCountry: otherCountry, year: year, flow: flow, topn: topn, metric: metric });
          }
        });
        if (!flows.length && availableFlows.length) {
          selections.push({ country: country, otherCountry: otherCountry, year: year, flow: availableFlows[0], topn: topn, metric: metric });
        }
      });
    });

    if (!selections.length) {
      selections.push({
        country: manifest.defaultSelection.country,
        otherCountry: otherCountry,
        year: manifest.defaultSelection.year,
        flow: manifest.defaultSelection.flow || "domestic",
        topn: topn,
        metric: metric
      });
    }

    return selections;
  }

  function writeSelectionHash(co, yr, fl, notify, topnParam, otherCountryParam, metricParam) {
    const normalizedCountry = normalizeCode(co || countrySelect.value);
    const normalizedYear = normalizeCode(yr || yearSelect.value);
    const normalizedFlow = normalizeCode(fl || flowSelect.value || manifest.defaultSelection.flow || "domestic");
    const normalizedTopN = normalizeTopN(topnParam || (topnSlider ? topnSlider.value : defaultTopN));
    const normalizedOtherCountry = normalizeCode(otherCountryParam !== undefined ? otherCountryParam : (otherCountrySelect && !otherCountrySelect.disabled ? otherCountrySelect.value : ""));
    const normalizedMetric = normalizeCode(metricParam || (metricSelect && metricSelect.value) || fallbackDefaultIndicators[0]);
    const nextState = {
      country: normalizedCountry,
      othercountry: normalizedOtherCountry,
      year: normalizedYear,
      flow: normalizedFlow,
      topn: String(normalizedTopN),
      metric: normalizedMetric
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
      "&othercountry=" + encodeURIComponent(normalizedOtherCountry) +
      "&year=" + encodeURIComponent(normalizedYear) +
      "&flow=" + encodeURIComponent(normalizedFlow) +
      "&topn=" + encodeURIComponent(normalizedTopN) +
      "&metric=" + encodeURIComponent(normalizedMetric);
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
      otherCountry: activeSelection.otherCountry || "",
      year: activeSelection.year,
      flow: activeSelection.flow,
      metric: activeSelection.metric || ""
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

  function rowMatchesCountryPairCodes(origin, destination, country, otherCountry) {
    const selectedCountry = normalizeCode(country);
    const selectedOtherCountry = normalizeCode(otherCountry);
    if (!selectedOtherCountry) {
      return true;
    }

    return (
      (normalizeCode(origin) === selectedCountry && normalizeCode(destination) === selectedOtherCountry) ||
      (normalizeCode(origin) === selectedOtherCountry && normalizeCode(destination) === selectedCountry)
    );
  }

  function syncOtherCountryOptions(country, preferredOtherCountry, availablePartners) {
    if (!otherCountrySelect) {
      return "";
    }

    const selectedCountry = normalizeCode(country);
    const preferred = normalizeCode(preferredOtherCountry);
    const fallbackPartners = (manifest.countries || []).filter(function (code) {
      return normalizeCode(code) && normalizeCode(code) !== selectedCountry;
    });
    const basePartners = (availablePartners && availablePartners.length ? availablePartners : fallbackPartners).slice();
    if (preferred && preferred !== selectedCountry && basePartners.indexOf(preferred) === -1) {
      basePartners.push(preferred);
    }
    const partners = basePartners
      .map(normalizeCode)
      .filter(function (code, index, array) {
        return code && code !== selectedCountry && array.indexOf(code) === index;
      })
      .sort();

    otherCountrySelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All";
    otherCountrySelect.appendChild(allOption);

    partners.forEach(function (partner) {
      const option = document.createElement("option");
      option.value = partner;
      option.textContent = partner;
      otherCountrySelect.appendChild(option);
    });

    const resolved = partners.includes(preferred) ? preferred : "";
    otherCountrySelect.value = resolved;
    return resolved;
  }

  function buildImpactDatasetFromCsvText(text, country, year, flow, sourcePath, otherCountry) {
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
    const availablePartners = new Set();
    indicatorColumns.forEach(function (indicator) {
      states[indicator] = {
        sourceTotals: {},
        bestLinks: {},
        partnerTotals: {}
      };
    });

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = parseCsvLine(lines[lineIndex]);
      const source = normalizeCode(row[indexByColumn.industry1]);
      const target = normalizeCode(row[indexByColumn.industry2]);
      const origin = normalizeCode(row[indexByColumn.region1]);
      const destination = normalizeCode(row[indexByColumn.region2]);
      if (!source || !target || (manifest.excludedSources || []).includes(source)) {
        continue;
      }

      const tradeId = parseNumber(row[indexByColumn.trade_id]);
      const amount = parseNumber(row[indexByColumn.amount]);
      const totalLevel = parseNumber(row[indexByColumn.total_level]);
      const partner = partnerCountryCodeForSelection(origin, destination, country, flow);
      if (partner) {
        availablePartners.add(partner);
      }
      if (!rowMatchesCountryPairCodes(origin, destination, country, otherCountry)) {
        continue;
      }

      indicatorColumns.forEach(function (indicator) {
        const value = indicator === "amount"
          ? amount
          : parseNumber(row[indexByColumn[indicator]]);

        const state = states[indicator];
        if (value > 0) {
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
        }

        if (partner && (value > 0 || amount > 0)) {
          if (!state.partnerTotals[partner]) {
            state.partnerTotals[partner] = {
              partner: partner,
              metricValue: 0,
              amountValue: 0
            };
          }
          state.partnerTotals[partner].metricValue += value;
          state.partnerTotals[partner].amountValue += amount;
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
      const partnerRows = Object.keys(state.partnerTotals).map(function (partner) {
        const row = state.partnerTotals[partner];
        const amountValue = parseNumber(row.amountValue);
        const metricValue = parseNumber(row.metricValue);
        return {
          partner: partner,
          metricValue: metricValue,
          amountValue: amountValue,
          intensity: amountValue > 0 ? (metricValue / amountValue) : 0
        };
      });
      const maxAmount = partnerRows.length
        ? Math.max.apply(null, partnerRows.map(function (row) {
          return row.amountValue;
        }))
        : 0;
      const intensities = partnerRows.map(function (row) {
        return row.intensity;
      });
      const minIntensity = intensities.length ? Math.min.apply(null, intensities) : 0;
      const maxIntensity = intensities.length ? Math.max.apply(null, intensities) : 0;
      const invertIntensity = scoreDirectionForIndicator(indicator) === "lower";
      const partnerBreakdown = partnerRows
        .map(function (row) {
          const tradeStrength = maxAmount > 0 ? (row.amountValue / maxAmount) : 0;
          const impactEfficiency = indicator === "amount"
            ? tradeStrength
            : normalizeRange(row.intensity, minIntensity, maxIntensity, invertIntensity);
          const score = indicator === "amount"
            ? (tradeStrength * 100)
            : ((tradeStrength * 0.6 + impactEfficiency * 0.4) * 100);
          return Object.assign({}, row, {
            tradeStrength: tradeStrength,
            impactEfficiency: impactEfficiency,
            score: score
          });
        })
        .sort(function (left, right) {
          return (right.score - left.score) ||
            (right.amountValue - left.amountValue) ||
            left.partner.localeCompare(right.partner);
        });

      dataset[indicator] = {
        source_totals: state.sourceTotals,
        links_by_source: state.bestLinks,
        ranked_sources: rankedSources,
        partner_breakdown: partnerBreakdown
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
        other_country: normalizeCode(otherCountry),
        available_partners: Array.from(availablePartners).sort(),
        excluded_sources: manifest.excludedSources || [],
        source_limit: defaultTopN,
        source_csv: sourcePath
      },
      indicatorColumns: indicatorColumns,
      defaults: defaults.length ? defaults : indicatorColumns.slice(0, 2),
      dataset: dataset
    };
  }

  function buildResourceSelectionFromCsvText(text, sourcePath, country, flow, otherCountry) {
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
      const origin = normalizeCode(row[indexByColumn.region1]);
      const destination = normalizeCode(row[indexByColumn.region2]);
      const totalResourcesValue = parseNumber(row[indexByColumn.total_resources_value]);
      if (!source || !target || (manifest.excludedSources || []).includes(source) || totalResourcesValue <= 0) {
        continue;
      }
      if (!rowMatchesCountryPairCodes(origin, destination, country, otherCountry)) {
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

  async function loadImpactSelection(country, year, flow, otherCountry) {
    const cacheKey = year + "|" + country + "|" + flow + "|" + normalizeCode(otherCountry);
    if (impactDataCache[cacheKey]) {
      return impactDataCache[cacheKey];
    }

    const relativeCsvPath = year + "/" + country + "/" + flow + "/trade_impact.csv";
    const text = await fetchTextWithFallback([
      joinPath(yearBasePath, relativeCsvPath),
      buildRawYearPath(relativeCsvPath)
    ]);
    if (!text) {
      return null;
    }

    const built = buildImpactDatasetFromCsvText(text, country, year, flow, "year/" + relativeCsvPath, otherCountry);
    if (built) {
      impactDataCache[cacheKey] = built;
    }
    return built;
  }

  async function loadResourceSelection(country, year, flow, otherCountry) {
    const cacheKey = year + "|" + country + "|" + flow + "|" + normalizeCode(otherCountry);
    if (resourceSelectionCache[cacheKey]) {
      return resourceSelectionCache[cacheKey];
    }

    if (resourceManifest && resourceManifest.selections && resourceManifest.selections[cacheKey]) {
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

    const built = buildResourceSelectionFromCsvText(text, "year/" + relativeCsvPath, country, flow, otherCountry);
    if (built) {
      resourceSelectionCache[cacheKey] = built;
    }
    return built;
  }

  function loadDataset(countryParam, yearParam, flowParam, topnParam, otherCountryParam, metricParam) {
    const country = countryParam || countrySelect.value;
    const year = yearParam || yearSelect.value;
    const flow = flowParam || flowSelect.value || manifest.defaultSelection.flow || "domestic";
    const topn = normalizeTopN(topnParam || (topnSlider ? topnSlider.value : defaultTopN));
    const otherCountry = flow === "domestic"
      ? ""
      : normalizeCode(otherCountryParam !== undefined ? otherCountryParam : (otherCountrySelect ? otherCountrySelect.value : ""));
    const metric = normalizeCode(metricParam || (metricSelect && metricSelect.value) || fallbackDefaultIndicators[0]);

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

    activeSelection = { country: country, otherCountry: otherCountry, year: year, flow: flow, topn: topn, metric: metric };

    countrySelect.value = country;
    updateYearOptions();
    yearSelect.value = year;
    updateFlowOptions(country, year);
    flowSelect.value = flow;
    syncOtherCountryOptions(country, otherCountry);
    if (otherCountrySelect) {
      otherCountrySelect.value = flow === "domestic" ? "" : otherCountry;
    }
    syncTopNControl(topn);

    if (loadButton) {
      loadButton.disabled = true;
    }
    countrySelect.disabled = true;
    yearSelect.disabled = true;
    flowSelect.disabled = true;
    if (otherCountrySelect) {
      otherCountrySelect.disabled = true;
    }
    if (topnSlider) {
      topnSlider.disabled = true;
    }
    activeResourceSelection = null;
    updateHeroMeta();
    updateStatus("Loading " + country + " " + year + " " + flow + " impact dataset...", false);
    return Promise.all([
      loadIndustryNamesForYears([year]),
      loadCurrencyRates(),
      loadCountryLookup()
    ]).then(async function () {
      const nextImpactData = await loadImpactSelection(country, year, flow, otherCountry);
      const nextResourceSelection = await loadResourceSelection(country, year, flow, otherCountry);

      if (loadButton) {
        loadButton.disabled = false;
      }
      countrySelect.disabled = false;
      yearSelect.disabled = false;
      flowSelect.disabled = false;
      if (otherCountrySelect) {
        otherCountrySelect.disabled = flow === "domestic";
      }
      if (topnSlider) {
        topnSlider.disabled = false;
      }

      sankeyData = nextImpactData;
      activeResourceSelection = nextResourceSelection;
      if (topnSlider) {
        const availableTopN = normalizeTopN(
          (sankeyData && sankeyData.meta && sankeyData.meta.source_limit) ||
          (resourceManifest && resourceManifest.meta && resourceManifest.meta.sourceLimit) ||
          defaultTopN
        );
        topnSlider.max = String(availableTopN);
        if (currentTopN() > availableTopN) {
          activeSelection.topn = availableTopN;
          syncTopNControl(availableTopN);
          writeSelectionHash(country, year, flow, false, availableTopN, activeSelection.otherCountry, activeSelection.metric);
        }
      }
      const resolvedOtherCountry = syncOtherCountryOptions(
        country,
        otherCountry,
        sankeyData && sankeyData.meta ? sankeyData.meta.available_partners : null
      );
      activeSelection.otherCountry = flow === "domestic" ? "" : resolvedOtherCountry;
      syncMetricOptions(metric);
      activeSelection.metric = indicatorColumns().includes(metric)
        ? metric
        : (defaultIndicators()[0] || indicatorColumns()[0] || fallbackDefaultIndicators[0]);
      applyGlobalMetric(activeSelection.metric, false);
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
        if (!indicatorColumns().includes(panelState.select.value)) {
          setIndicatorOptions(panelState.select, activeSelection.metric);
        }
      });

      writeSelectionHash(country, year, flow, false, activeSelection.topn, activeSelection.otherCountry, activeSelection.metric);
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
      amount: "Total Amount",
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

  function convertIntensityPerCurrency(value) {
    const currencyCode = selectedCurrency();
    const rate = currencyRateForYear(activeSelection && activeSelection.year, currencyCode);
    return rate > 0 ? (parseNumber(value) / rate) : parseNumber(value);
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
        return panelState.select;
      })
      .map(function (panelState) {
        return normalizeCode(panelState.select.value);
      })
      .filter(Boolean);
  }

  function syncGlobalOptionVisibility() {
    if (otherCountryControl) {
      const flow = normalizeCode(flowSelect && flowSelect.value);
      const isTradeMode = flow === "imports" || flow === "exports";
      otherCountryControl.hidden = !isTradeMode;
      if (otherCountrySelect) {
        otherCountrySelect.disabled = !isTradeMode;
      }
      if (otherCountryLabel) {
        otherCountryLabel.textContent = flow === "exports" ? "To" : "From";
      }
    }
    if (currencyControl) {
      const selectedIndicators = activeImpactIndicators();
      const isAmountSelected =
        (metricSelect && normalizeCode(metricSelect.value) === "amount") ||
        selectedIndicators.includes("amount");
      currencyControl.style.display = isAmountSelected ? "flex" : "none";
    }
  }

  function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0%";
    }
    return (numeric * 100).toFixed(1).replace(/\.0$/, "") + "%";
  }

  function formatScore(value) {
    return parseNumber(value).toFixed(1);
  }

  function normalizeRange(value, minValue, maxValue, invert) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= minValue) {
      return 1;
    }
    const normalized = (value - minValue) / (maxValue - minValue);
    return invert ? (1 - normalized) : normalized;
  }

  function partnerCountryCodeForSelection(origin, destination, country, flow) {
    const selectedCountry = normalizeCode(country);

    if (flow === "exports") {
      if (destination && destination !== selectedCountry) {
        return destination;
      }
      if (origin && origin !== selectedCountry) {
        return origin;
      }
      return destination || origin;
    }

    if (flow === "imports") {
      if (origin && origin !== selectedCountry) {
        return origin;
      }
      if (destination && destination !== selectedCountry) {
        return destination;
      }
      return origin || destination;
    }

    return "";
  }

  function scoreDirectionForIndicator(indicator) {
    const key = normalizeCode(indicator).toLowerCase();
    if (!key || key === "amount") {
      return "higher";
    }
    if (key.indexOf("employment") !== -1 || key.indexOf("job") !== -1) {
      return "higher";
    }
    return "lower";
  }

  function projectGeoPoint(lon, lat, bounds) {
    return {
      x: bounds.left + ((lon + 180) / 360) * bounds.width,
      y: bounds.top + ((90 - lat) / 180) * bounds.height
    };
  }

  function buildGeoPolygonPath(points, bounds) {
    if (!Array.isArray(points) || !points.length) {
      return "";
    }

    return points.map(function (point, index) {
      const projected = projectGeoPoint(point[0], point[1], bounds);
      return (index === 0 ? "M" : "L") + projected.x + " " + projected.y;
    }).join(" ") + " Z";
  }

  function renderGeoBackdrop(panelState, bounds) {
    const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    frame.setAttribute("x", bounds.left);
    frame.setAttribute("y", bounds.top);
    frame.setAttribute("width", bounds.width);
    frame.setAttribute("height", bounds.height);
    frame.setAttribute("rx", "14");
    frame.setAttribute("fill", "rgba(239, 246, 255, 0.72)");
    frame.setAttribute("stroke", "rgba(84, 105, 129, 0.18)");
    panelState.svg.appendChild(frame);

    [-120, -60, 0, 60, 120].forEach(function (lon) {
      const point = projectGeoPoint(lon, 0, bounds);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", point.x);
      line.setAttribute("y1", bounds.top);
      line.setAttribute("x2", point.x);
      line.setAttribute("y2", bounds.top + bounds.height);
      line.setAttribute("stroke", "rgba(84, 105, 129, 0.12)");
      line.setAttribute("stroke-dasharray", "4 7");
      panelState.svg.appendChild(line);
    });

    [-60, -30, 0, 30, 60].forEach(function (lat) {
      const point = projectGeoPoint(0, lat, bounds);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", bounds.left);
      line.setAttribute("y1", point.y);
      line.setAttribute("x2", bounds.left + bounds.width);
      line.setAttribute("y2", point.y);
      line.setAttribute("stroke", "rgba(84, 105, 129, 0.12)");
      line.setAttribute("stroke-dasharray", "4 7");
      panelState.svg.appendChild(line);
    });

    [
      {
        points: [[-168, 72], [-150, 60], [-138, 57], [-128, 52], [-123, 45], [-117, 33], [-108, 24], [-98, 18], [-90, 20], [-83, 26], [-79, 33], [-85, 45], [-96, 55], [-110, 65], [-134, 72]]
      },
      {
        points: [[-82, 12], [-75, 7], [-71, -4], [-68, -14], [-64, -24], [-60, -36], [-54, -50], [-46, -54], [-40, -46], [-38, -28], [-44, -11], [-52, 2], [-66, 11]]
      },
      {
        points: [[-54, 60], [-47, 70], [-38, 78], [-24, 76], [-20, 68], [-28, 60], [-42, 57]]
      },
      {
        points: [[-11, 36], [-8, 43], [2, 47], [14, 52], [24, 58], [18, 66], [6, 61], [-2, 55], [-10, 48]]
      },
      {
        points: [[-17, 33], [-6, 35], [10, 36], [24, 32], [36, 20], [43, 6], [39, -13], [30, -26], [18, -35], [4, -33], [-8, -18], [-12, 2], [-10, 18]]
      },
      {
        points: [[24, 35], [36, 45], [54, 54], [78, 60], [102, 62], [124, 56], [146, 48], [154, 36], [146, 22], [126, 10], [110, 6], [96, 14], [84, 24], [68, 28], [50, 28], [36, 24], [28, 20]]
      },
      {
        points: [[69, 24], [79, 21], [86, 17], [82, 9], [77, 7], [72, 12]]
      },
      {
        points: [[112, -11], [116, -23], [128, -35], [144, -40], [154, -30], [151, -18], [139, -11], [124, -12]]
      },
      {
        points: [[48, -14], [50, -22], [47, -25], [44, -20]]
      }
    ].forEach(function (shape) {
      const land = document.createElementNS("http://www.w3.org/2000/svg", "path");
      land.setAttribute("d", buildGeoPolygonPath(shape.points, bounds));
      land.setAttribute("fill", "rgba(201, 217, 187, 0.92)");
      land.setAttribute("stroke", "rgba(92, 112, 88, 0.4)");
      land.setAttribute("stroke-width", "1");
      panelState.svg.appendChild(land);
    });

    [
      { label: "North America", lon: -110, lat: 48 },
      { label: "South America", lon: -62, lat: -20 },
      { label: "Europe", lon: 12, lat: 56 },
      { label: "Africa", lon: 22, lat: 2 },
      { label: "Asia", lon: 95, lat: 38 },
      { label: "Oceania", lon: 138, lat: -25 }
    ].forEach(function (region) {
      const point = projectGeoPoint(region.lon, region.lat, bounds);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", point.x);
      label.setAttribute("y", point.y);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "rgba(67, 86, 105, 0.45)");
      label.setAttribute("font-size", "12");
      label.setAttribute("font-weight", "700");
      label.textContent = region.label;
      panelState.svg.appendChild(label);
    });
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

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      if (char === "&") {
        return "&amp;";
      }
      if (char === "<") {
        return "&lt;";
      }
      if (char === ">") {
        return "&gt;";
      }
      if (char === '"') {
        return "&quot;";
      }
      return "&#39;";
    });
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
    if (sankeyData && Array.isArray(sankeyData.indicatorColumns) && sankeyData.indicatorColumns.length) {
      return sankeyData.indicatorColumns;
    }
    if (manifest && Array.isArray(manifest.indicatorColumns) && manifest.indicatorColumns.length) {
      return manifest.indicatorColumns;
    }
    return fallbackIndicatorColumns.slice();
  }

  function defaultIndicators() {
    const ordered = sankeyData && Array.isArray(sankeyData.defaults) && sankeyData.defaults.length
      ? sankeyData.defaults.slice()
      : (manifest && Array.isArray(manifest.defaults) && manifest.defaults.length
          ? manifest.defaults.slice()
          : fallbackDefaultIndicators.slice());
    if (ordered.indexOf("amount") === -1 && indicatorColumns().indexOf("amount") !== -1) {
      ordered.unshift("amount");
    }
    ordered.sort(function (left, right) {
      if (left === right) { return 0; }
      if (left === "amount") { return -1; }
      if (right === "amount") { return 1; }
      return left.localeCompare(right);
    });
    return ordered.slice(0, 2);
  }

  function setIndicatorOptions(select, selectedValue) {
    const columns = indicatorColumns().slice().sort(function (left, right) {
      if (left === right) { return 0; }
      if (left === "amount") { return -1; }
      if (right === "amount") { return 1; }
      return left.localeCompare(right);
    });
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

  function syncMetricOptions(selectedValue) {
    if (!metricSelect) {
      return;
    }
    setIndicatorOptions(metricSelect, selectedValue || fallbackDefaultIndicators[0]);
  }

  function applyGlobalMetric(metricValue, renderNow) {
    const normalizedMetric = normalizeCode(metricValue);
    const columns = indicatorColumns();
    const fallbackMetric =
      (columns.includes(normalizedMetric) ? normalizedMetric : "") ||
      defaultIndicators()[0] ||
      columns[0] ||
      fallbackDefaultIndicators[0];

    if (metricSelect) {
      syncMetricOptions(fallbackMetric);
      metricSelect.value = fallbackMetric;
    }

    panels.forEach(function (panelState) {
      if (panelState.select && columns.includes(fallbackMetric)) {
        setIndicatorOptions(panelState.select, fallbackMetric);
      }
    });

    if (activeSelection) {
      activeSelection.metric = fallbackMetric;
    }
    if (renderNow) {
      syncGlobalOptionVisibility();
      renderAllPanels();
    }
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
    const viewBoxWidth = config.viewBoxWidth || 760;
    const viewBoxHeight = config.viewBoxHeight || 430;
    svg.setAttribute("viewBox", "0 0 " + viewBoxWidth + " " + viewBoxHeight);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    chartWrap.appendChild(svg);

    let mapHost = null;
    if (config.kind === "trade-map") {
      mapHost = createElement("div", "map-host");
      mapHost.hidden = true;
      chartWrap.appendChild(mapHost);
    }

    panel.append(head, stats, chartWrap);
    chartGrid.appendChild(panel);

    const panelState = {
      config: config,
      panel: panel,
      title: title,
      subtitle: subtitle,
      select: select,
      svg: svg,
      mapHost: mapHost,
      mapChart: null,
      mapBubbleLayer: null,
      mapLabelLayer: null,
      mapRegionLayer: null,
      mapLegendControl: null,
      mapLegendElement: null,
      statValues: statValues,
      viewBoxWidth: viewBoxWidth,
      viewBoxHeight: viewBoxHeight
    };

    if (select) {
      select.addEventListener("change", function () {
        if (activeSelection) {
          activeSelection.metric = normalizeCode(select.value) || activeSelection.metric;
        }
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
    panelState.svg.style.display = "";

    if (panelState.mapHost) {
      panelState.mapHost.hidden = true;
    }
    clearPanelMap(panelState);

    const empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
    empty.setAttribute("x", "380");
    empty.setAttribute("y", "215");
    empty.setAttribute("text-anchor", "middle");
    empty.setAttribute("fill", "#59606d");
    empty.textContent = message;
    panelState.svg.appendChild(empty);
  }

  function clearPanelMap(panelState) {
    if (!panelState) {
      return;
    }
    if (panelState.mapBubbleLayer && typeof panelState.mapBubbleLayer.clearLayers === "function") {
      panelState.mapBubbleLayer.clearLayers();
    }
    if (panelState.mapLabelLayer && typeof panelState.mapLabelLayer.clearLayers === "function") {
      panelState.mapLabelLayer.clearLayers();
    }
    if (panelState.mapRegionLayer && typeof panelState.mapRegionLayer.clearLayers === "function") {
      panelState.mapRegionLayer.clearLayers();
    }
    if (panelState.mapChart && typeof panelState.mapChart.closePopup === "function") {
      panelState.mapChart.closePopup();
    }
  }

  function resizePanelMap(panelState) {
    if (!panelState || !panelState.mapChart) {
      return;
    }
    if (typeof panelState.mapChart.invalidateSize === "function") {
      panelState.mapChart.invalidateSize({
        pan: false,
        animate: false
      });
      return;
    }
    if (typeof panelState.mapChart.resize === "function") {
      panelState.mapChart.resize();
    }
  }

  function leafletPopupHtml(title, rows) {
    const body = (rows || []).map(function (row) {
      return (
        "<dt>" + escapeHtml(row.label) + "</dt>" +
        "<dd>" + escapeHtml(row.value) + "</dd>"
      );
    }).join("");

    return (
      '<div class="map-popup">' +
      "<h3>" + escapeHtml(title) + "</h3>" +
      "<dl>" + body + "</dl>" +
      "</div>"
    );
  }

  function ensureTradeMap(panelState) {
    if (!panelState || !panelState.mapHost || typeof window.L === "undefined") {
      return null;
    }

    if (!panelState.mapChart) {
      const map = window.L.map(panelState.mapHost, {
        zoomControl: true,
        scrollWheelZoom: true,
        boxZoom: true,
        doubleClickZoom: true,
        dragging: true,
        worldCopyJump: true,
        preferCanvas: true,
        zoomSnap: 0.25,
        minZoom: 1.25,
        maxZoom: 8
      });

      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);

      panelState.mapChart = map;
      panelState.mapRegionLayer = window.L.layerGroup().addTo(map);
      panelState.mapBubbleLayer = window.L.layerGroup().addTo(map);
      panelState.mapLabelLayer = window.L.layerGroup().addTo(map);

      const legendControl = window.L.control({ position: "bottomleft" });
      legendControl.onAdd = function () {
        const legend = window.L.DomUtil.create("div", "leaflet-map-legend");
        legend.innerHTML =
          "<strong>Map Guide</strong>" +
          "<span>Zoom in to separate nearby trade partners.</span>" +
          "<span>Bubble size shows total amount. Orange halos mark regional aggregates.</span>";
        return legend;
      };
      legendControl.addTo(map);

      panelState.mapLegendControl = legendControl;
      panelState.mapLegendElement = legendControl.getContainer();
    }

    return panelState.mapChart;
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
      path.setAttribute("stroke-linecap", "butt");
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

  function renderPartnerScorePanel(panelState) {
    if (!sankeyData || !sankeyData.dataset) {
      showEmpty(panelState, "Choose a country, flow, and year; data loads automatically.");
      return;
    }

    if (!activeSelection || activeSelection.flow === "domestic") {
      showEmpty(panelState, "Partner-country score is available for imports and exports.");
      return;
    }

    const fallbackIndicator =
      defaultIndicators()[panelState.config.defaultIndicatorIndex] ||
      indicatorColumns()[panelState.config.defaultIndicatorIndex] ||
      indicatorColumns()[0];
    const indicator = panelState.select && panelState.select.value ? panelState.select.value : fallbackIndicator;
    const indicatorData = sankeyData.dataset[indicator];
    const rows = indicatorData && indicatorData.partner_breakdown
      ? indicatorData.partner_breakdown.slice(0, 10)
      : [];

    if (!rows.length) {
      showEmpty(panelState, "No partner-country data available for this selection.");
      return;
    }

    panelState.title.textContent = panelState.config.title + ": " + titleizeLabel(indicator);
    panelState.subtitle.textContent = indicator === "amount"
      ? "Countries are ranked strongest to weakest by total amount relative to the largest visible partner."
      : "Score blends 60% trade-value strength with 40% indicator efficiency per total amount, ranked best to worst.";
    panelState.svg.innerHTML = "";

    const strongestTrade = rows.slice().sort(function (left, right) {
      return (right.amountValue - left.amountValue) || left.partner.localeCompare(right.partner);
    })[0];
    setPanelStats(panelState, {
      best: countryLabelForCode(rows[0].partner) + " (Score " + formatScore(rows[0].score) + ")",
      strongest: countryLabelForCode(strongestTrade.partner) + " (" + formatAmountCompact(strongestTrade.amountValue) + ")",
      coverage: rows.length + " of " + indicatorData.partner_breakdown.length + " partners"
    });

    const width = panelState.viewBoxWidth || 760;
    const height = panelState.viewBoxHeight || 520;
    const left = 210;
    const right = 150;
    const top = 56;
    const bottom = 28;
    const barHeight = 22;
    const rowGap = 22;
    const plotWidth = width - left - right;
    const maxScore = 100;

    [0, 25, 50, 75, 100].forEach(function (tick) {
      const x = left + plotWidth * (tick / maxScore);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "bar-grid-line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", top - 24);
      line.setAttribute("x2", x);
      line.setAttribute("y2", height - bottom);
      panelState.svg.appendChild(line);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "bar-grid-text");
      label.setAttribute("x", x);
      label.setAttribute("y", top - 30);
      label.setAttribute("text-anchor", tick === 100 ? "end" : tick === 0 ? "start" : "middle");
      label.textContent = String(tick);
      panelState.svg.appendChild(label);
    });

    rows.forEach(function (item, index) {
      const y = top + index * (barHeight + rowGap);
      const barWidth = Math.max(4, plotWidth * (item.score / maxScore));

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "bar-label");
      label.setAttribute("x", left - 14);
      label.setAttribute("y", y + barHeight / 2 - 3);
      label.setAttribute("text-anchor", "end");
      label.textContent = countryLabelForCode(item.partner);
      panelState.svg.appendChild(label);

      const hint = document.createElementNS("http://www.w3.org/2000/svg", "text");
      hint.setAttribute("class", "bar-hint");
      hint.setAttribute("x", left - 14);
      hint.setAttribute("y", y + barHeight / 2 + 12);
      hint.setAttribute("text-anchor", "end");
      hint.textContent = "Spent " + formatAmountCompact(item.amountValue);
      panelState.svg.appendChild(hint);

      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("class", "bar-mark");
      bar.setAttribute("x", left);
      bar.setAttribute("y", y);
      bar.setAttribute("width", barWidth);
      bar.setAttribute("height", barHeight);
      bar.setAttribute("rx", "6");
      bar.setAttribute("fill", colorFor(item.partner, 0.82));
      appendTitle(
        bar,
        countryLabelForCode(item.partner) + " score " + formatScore(item.score) +
        "\nTotal Amount: " + formatAmountExact(item.amountValue) +
        "\n" + titleizeLabel(indicator) + ": " + formatMetricExact(item.metricValue, indicator)
      );
      wireInteractiveMark(
        bar,
        function () {
          const rowsForHover = [
            { label: "Chart", value: "Partner Score" },
            { label: "Selection", value: activeSelection.country + " / " + activeSelection.year + " / " + startCase(activeSelection.flow) },
            { label: "Indicator", value: titleizeLabel(indicator) },
            { label: "Partner", value: countryLabelForCode(item.partner) },
            { label: "Score", value: formatScore(item.score) + " / 100" },
            { label: "Total Amount", value: formatAmountExact(item.amountValue) }
          ];
          if (indicator !== "amount") {
            rowsForHover.push({ label: titleizeLabel(indicator), value: formatMetricExact(item.metricValue, indicator) });
          }
          return rowsForHover;
        },
        function () {
          const rowsForClick = [
            { label: "Chart", value: "Partner Score" },
            { label: "Selection", value: activeSelection.country + " / " + activeSelection.year + " / " + startCase(activeSelection.flow) },
            { label: "Indicator", value: titleizeLabel(indicator) },
            { label: "Partner", value: countryLabelForCode(item.partner) },
            { label: "Score", value: formatScore(item.score) + " / 100" },
            { label: "Trade Strength", value: formatPercent(item.tradeStrength) + " of largest partner" },
            { label: "Efficiency", value: formatPercent(item.impactEfficiency) + " normalized" },
            { label: "Total Amount", value: formatAmountExact(item.amountValue) }
          ];
          if (indicator !== "amount") {
            rowsForClick.push({ label: titleizeLabel(indicator), value: formatMetricExact(item.metricValue, indicator) });
            rowsForClick.push({
              label: titleizeLabel(indicator) + " per " + selectedCurrency(),
              value: formatExact(convertIntensityPerCurrency(item.intensity))
            });
          }
          return rowsForClick;
        }
      );
      panelState.svg.appendChild(bar);

      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("class", "bar-value");
      value.setAttribute("x", Math.min(left + barWidth + 10, width - 12));
      value.setAttribute("y", y + barHeight / 2 - 2);
      value.setAttribute("text-anchor", left + barWidth + 110 > width ? "end" : "start");
      if (left + barWidth + 110 > width) {
        value.setAttribute("x", width - 12);
      }
      value.textContent = "Score " + formatScore(item.score);
      panelState.svg.appendChild(value);

      const detail = document.createElementNS("http://www.w3.org/2000/svg", "text");
      detail.setAttribute("class", "bar-hint");
      detail.setAttribute("x", Math.min(left + barWidth + 10, width - 12));
      detail.setAttribute("y", y + barHeight / 2 + 12);
      detail.setAttribute("text-anchor", left + barWidth + 110 > width ? "end" : "start");
      if (left + barWidth + 110 > width) {
        detail.setAttribute("x", width - 12);
      }
      detail.textContent = indicator === "amount"
        ? formatAmountCompact(item.metricValue)
        : titleizeLabel(indicator) + " " + formatMetricCompact(item.metricValue, indicator);
      panelState.svg.appendChild(detail);
    });
  }

  function renderTradeMapPanel(panelState) {
    if (!sankeyData || !sankeyData.dataset) {
      showEmpty(panelState, "Choose a country, flow, and year; data loads automatically.");
      return;
    }

    if (!activeSelection || activeSelection.flow === "domestic") {
      showEmpty(panelState, "Partner map is available for imports and exports.");
      return;
    }

    const indicatorData = sankeyData.dataset.amount;
    const rows = indicatorData && indicatorData.partner_breakdown
      ? indicatorData.partner_breakdown.slice()
      : [];

    if (!rows.length) {
      showEmpty(panelState, "No partner-country trade data available for this selection.");
      return;
    }

    const mappedRows = [];
    const unmappedRows = [];
    rows.forEach(function (row) {
      const point = partnerGeoCenters[row.partner];
      if (point) {
        mappedRows.push({
          code: row.partner,
          name: countryLabelForCode(row.partner),
          lon: point.lon,
          lat: point.lat,
          rawValue: row.amountValue,
          value: convertAmountValue(row.amountValue, activeSelection.year, selectedCurrency()),
          share: 0,
          isAggregate: Boolean(aggregatePartnerLabels[row.partner])
        });
      } else {
        unmappedRows.push(row);
      }
    });

    if (!mappedRows.length) {
      showEmpty(panelState, "Partner countries are only available as regional aggregates for this selection.");
      return;
    }

    const totalMappedValue = mappedRows.reduce(function (sum, row) {
      return sum + row.rawValue;
    }, 0);
    mappedRows.forEach(function (row) {
      row.share = totalMappedValue > 0 ? (row.rawValue / totalMappedValue) : 0;
    });

    const strongestMapped = mappedRows.slice().sort(function (left, right) {
      return (right.rawValue - left.rawValue) || left.name.localeCompare(right.name);
    })[0];
    const topLabelNames = new Set(mappedRows.slice().sort(function (left, right) {
      return (right.rawValue - left.rawValue) || left.name.localeCompare(right.name);
    }).slice(0, 6).map(function (row) {
      return row.name;
    }));

    panelState.title.textContent = panelState.config.title;
    panelState.subtitle.textContent =
      "Bubble positions approximate partner geography for the selected " + activeSelection.flow +
      " view. Larger circles indicate more trade spend, and EXIO regional aggregates are shown as grouped regional points.";
    setPanelStats(panelState, {
      best: strongestMapped.name + " (" + formatAmountCompact(strongestMapped.rawValue) + ")",
      mapped: mappedRows.filter(function (row) {
        return !row.isAggregate;
      }).length + " countries",
      unmapped: mappedRows.filter(function (row) {
        return row.isAggregate;
      }).length
        ? mappedRows.filter(function (row) {
          return row.isAggregate;
        }).slice(0, 3).map(function (row) {
          return row.name;
        }).join(", ")
        : (unmappedRows.length
        ? unmappedRows.slice(0, 3).map(function (row) {
          return countryLabelForCode(row.partner);
        }).join(", ")
        : "None")
    });

    panelState.svg.innerHTML = "";
    if (!panelState.mapHost || typeof window.L === "undefined") {
      showEmpty(panelState, "Interactive map tiles are unavailable, so the partner map cannot render.");
      return;
    }

    panelState.svg.style.display = "none";
    panelState.mapHost.hidden = false;

    const map = ensureTradeMap(panelState);
    if (!map) {
      showEmpty(panelState, "Interactive map tiles are unavailable, so the partner map cannot render.");
      return;
    }

    clearPanelMap(panelState);

    const maxValue = Math.max.apply(null, mappedRows.map(function (row) {
      return row.rawValue;
    }).concat([1]));
    const latLngs = [];

    if (panelState.mapLegendElement) {
      panelState.mapLegendElement.innerHTML =
        "<strong>Map Guide</strong>" +
        "<span>Bubble size = total amount in " + escapeHtml(selectedCurrency()) + ".</span>" +
        "<span>Zoom in to separate nearby bubbles. Orange halos mark EXIO regional aggregates.</span>";
    }

    mappedRows.forEach(function (row) {
      const latLng = [row.lat, row.lon];
      latLngs.push(latLng);

      if (row.isAggregate && panelState.mapRegionLayer) {
        const regionRadius = Math.max(
          650000,
          Math.round((aggregateRegionRadiusMeters[row.code] || 1400000) * (0.7 + row.share))
        );
        window.L.circle(latLng, {
          radius: regionRadius,
          color: "rgba(180, 83, 9, 0.6)",
          weight: 1.5,
          dashArray: "8 8",
          fillColor: "rgba(245, 158, 11, 0.15)",
          fillOpacity: 0.2
        }).addTo(panelState.mapRegionLayer);
      }

      const marker = window.L.circleMarker(latLng, {
        radius: 7 + (Math.sqrt(row.rawValue / maxValue) * 22),
        color: row.isAggregate ? "rgba(180, 83, 9, 0.85)" : colorFor(row.code, 0.95),
        weight: row.isAggregate ? 2.4 : 1.4,
        fillColor: row.isAggregate ? "rgba(245, 158, 11, 0.65)" : colorFor(row.code, 0.72),
        fillOpacity: row.isAggregate ? 0.78 : 0.66
      }).addTo(panelState.mapBubbleLayer);

      marker.bindTooltip(
        row.name + " • " + formatAmountExact(row.rawValue),
        {
          sticky: true,
          direction: "top",
          offset: [0, -6],
          className: "leaflet-partner-tooltip",
          opacity: 1
        }
      );
      marker.bindPopup(
        leafletPopupHtml(row.name, [
          { label: "Selection", value: activeSelection.country + " / " + activeSelection.year + " / " + startCase(activeSelection.flow) },
          { label: "Total Amount", value: formatAmountExact(row.rawValue) },
          { label: "Mapped Share", value: formatPercent(row.share) },
          { label: "Partner Code", value: row.code },
          { label: "Latitude", value: row.lat.toFixed(1) },
          { label: "Longitude", value: row.lon.toFixed(1) }
        ]),
        {
          className: "leaflet-partner-popup",
          maxWidth: 320
        }
      );
      marker.on("mouseover", function () {
        if (typeof marker.bringToFront === "function") {
          marker.bringToFront();
        }
      });

      if (topLabelNames.has(row.name)) {
        window.L.marker(latLng, {
          interactive: false,
          icon: window.L.divIcon({
            className: "",
            html: '<div class="leaflet-partner-label">' + escapeHtml(row.name) + "</div>",
            iconSize: null
          })
        }).addTo(panelState.mapLabelLayer);
      }
    });

    const homePoint = partnerGeoCenters[activeSelection.country];
    if (homePoint && panelState.mapLabelLayer) {
      const homeLatLng = [homePoint.lat, homePoint.lon];
      latLngs.push(homeLatLng);
      window.L.circleMarker(homeLatLng, {
        radius: 6,
        color: "#0f172a",
        weight: 2.4,
        fillColor: "#ffffff",
        fillOpacity: 1
      }).addTo(panelState.mapLabelLayer).bindTooltip(
        activeSelection.country + " selected",
        {
          direction: "right",
          offset: [10, 0],
          className: "leaflet-partner-label",
          opacity: 1
        }
      );
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 3.25);
    } else if (latLngs.length > 1) {
      map.fitBounds(window.L.latLngBounds(latLngs), {
        padding: [26, 26],
        maxZoom: 4.75
      });
    }

    setTimeout(function () {
      resizePanelMap(panelState);
    }, 0);
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
          "Total Amount: " + formatAmountExact(link.amount),
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
          { label: "Total Amount", value: formatAmountExact(link.amount) },
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
          "Total Amount: " + formatAmountExact(link.amount)
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
          { label: "Total Amount", value: formatAmountExact(link.amount) },
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
          rows.push({ label: "Total Amount", value: formatAmountExact(item.spotlight.amount) });
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

    if (panelState.config.kind === "partner-score") {
      renderPartnerScorePanel(panelState);
      return;
    }

    if (panelState.config.kind === "trade-map") {
      renderTradeMapPanel(panelState);
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
      const partnerContext = activeSelection.otherCountry
        ? ((activeSelection.flow === "exports" ? " to " : " from ") + activeSelection.otherCountry)
        : "";
      selectionPill.textContent =
        "Selection: " +
        activeSelection.country +
        " / " +
        activeSelection.year +
        " / " +
        startCase(activeSelection.flow) +
        partnerContext +
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
      activeSelection.otherCountry === (next.otherCountry || "") &&
      activeSelection.year === next.year &&
      activeSelection.flow === next.flow &&
      currentTopN() === normalizeTopN(next.topn) &&
      normalizeCode(activeSelection.metric) === normalizeCode(next.metric)
    ) {
      return;
    }

    loadDataset(next.country, next.year, next.flow, next.topn, next.otherCountry, next.metric);
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
    syncOtherCountryOptions(first.country, first.otherCountry);
    if (otherCountrySelect) {
      otherCountrySelect.value = first.flow === "domestic" ? "" : (first.otherCountry || "");
    }
    syncTopNControl(first.topn);
    syncMetricOptions(first.metric);
    if (metricSelect) {
      metricSelect.value = first.metric || fallbackDefaultIndicators[0];
    }
    writeSelectionHash(first.country, first.year, first.flow, false, first.topn, first.otherCountry, first.metric);
  } else {
    countrySelect.value = manifest.defaultSelection.country;
    updateYearOptions();
    updateFlowOptions(manifest.defaultSelection.country, manifest.defaultSelection.year);
    yearSelect.value = manifest.defaultSelection.year;
    flowSelect.value = manifest.defaultSelection.flow || "domestic";
    syncOtherCountryOptions(manifest.defaultSelection.country, "");
    syncTopNControl(defaultTopN);
    syncMetricOptions(fallbackDefaultIndicators[0]);
    if (metricSelect) {
      metricSelect.value = fallbackDefaultIndicators[0];
    }
    writeSelectionHash(
      manifest.defaultSelection.country,
      manifest.defaultSelection.year,
      manifest.defaultSelection.flow || "domestic",
      false,
      defaultTopN,
      "",
      fallbackDefaultIndicators[0]
    );
    hashSelections = [{
      country: manifest.defaultSelection.country,
      otherCountry: "",
      year: manifest.defaultSelection.year,
      flow: manifest.defaultSelection.flow || "domestic",
      topn: defaultTopN,
      metric: fallbackDefaultIndicators[0]
    }];
  }

  countrySelect.addEventListener("change", function () {
    updateYearOptions();
    updateFlowOptions(countrySelect.value, yearSelect.value);
    syncOtherCountryOptions(countrySelect.value, otherCountrySelect ? otherCountrySelect.value : "");
    syncGlobalOptionVisibility();
    const selectedCountry = countrySelect.value;
    const selectedOtherCountry = otherCountrySelect ? otherCountrySelect.value : "";
    const selectedYear = yearSelect.value;
    const selectedFlow = flowSelect.value;
    const selectedTopN = currentTopN();
    const selectedMetric = metricSelect ? metricSelect.value : fallbackDefaultIndicators[0];
    writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN, selectedOtherCountry, selectedMetric);
    loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN, selectedOtherCountry, selectedMetric);
  });

  flowSelect.addEventListener("change", function () {
    if (flowSelect.value === "domestic" && otherCountrySelect) {
      otherCountrySelect.value = "";
    }
    syncGlobalOptionVisibility();
    const selectedCountry = countrySelect.value;
    const selectedOtherCountry = flowSelect.value === "domestic" ? "" : (otherCountrySelect ? otherCountrySelect.value : "");
    const selectedYear = yearSelect.value;
    const selectedFlow = flowSelect.value;
    const selectedTopN = currentTopN();
    const selectedMetric = metricSelect ? metricSelect.value : fallbackDefaultIndicators[0];
    writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN, selectedOtherCountry, selectedMetric);
    loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN, selectedOtherCountry, selectedMetric);
  });

  yearSelect.addEventListener("change", function () {
    updateFlowOptions(countrySelect.value, yearSelect.value);
    syncOtherCountryOptions(countrySelect.value, otherCountrySelect ? otherCountrySelect.value : "");
    const selectedCountry = countrySelect.value;
    const selectedOtherCountry = flowSelect.value === "domestic" ? "" : (otherCountrySelect ? otherCountrySelect.value : "");
    const selectedYear = yearSelect.value;
    const selectedFlow = flowSelect.value;
    const selectedTopN = currentTopN();
    const selectedMetric = metricSelect ? metricSelect.value : fallbackDefaultIndicators[0];
    writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN, selectedOtherCountry, selectedMetric);
    loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN, selectedOtherCountry, selectedMetric);
  });

  if (otherCountrySelect) {
    otherCountrySelect.addEventListener("change", function () {
      const selectedCountry = countrySelect.value;
      const selectedOtherCountry = flowSelect.value === "domestic" ? "" : (otherCountrySelect.value || "");
      const selectedYear = yearSelect.value;
      const selectedFlow = flowSelect.value;
      const selectedTopN = currentTopN();
      const selectedMetric = metricSelect ? metricSelect.value : fallbackDefaultIndicators[0];
      writeSelectionHash(selectedCountry, selectedYear, selectedFlow, false, selectedTopN, selectedOtherCountry, selectedMetric);
      loadDataset(selectedCountry, selectedYear, selectedFlow, selectedTopN, selectedOtherCountry, selectedMetric);
    });
  }

  if (topnSlider) {
    topnSlider.addEventListener("input", function () {
      const selectedTopN = normalizeTopN(topnSlider.value);
      syncTopNControl(selectedTopN);
      activeSelection.topn = selectedTopN;
      writeSelectionHash(countrySelect.value, yearSelect.value, flowSelect.value, false, selectedTopN, activeSelection.otherCountry, activeSelection.metric);
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

  if (metricSelect) {
    metricSelect.addEventListener("change", function () {
      const selectedMetric = normalizeCode(metricSelect.value) || fallbackDefaultIndicators[0];
      applyGlobalMetric(selectedMetric, true);
      writeSelectionHash(countrySelect.value, yearSelect.value, flowSelect.value, false, currentTopN(), activeSelection && activeSelection.otherCountry, selectedMetric);
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

    writeSelectionHash(nextCountry, nextYear, nextFlow, false, currentTopN(), "", activeSelection && activeSelection.metric);
    loadDataset(nextCountry, nextYear, nextFlow, currentTopN(), "", activeSelection && activeSelection.metric);
  });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(function () {
      panels.forEach(function (panelState) {
        if (panelState.mapChart) {
          resizePanelMap(panelState);
        }
      });
      notifyHostHeight();
    });
    resizeObserver.observe(document.body);
  } else {
    window.addEventListener("resize", function () {
      panels.forEach(function (panelState) {
        if (panelState.mapChart) {
          resizePanelMap(panelState);
        }
      });
      notifyHostHeight();
    });
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
    try {
      const uniqueYears = Array.from(new Set(hashSelections.map(function (h) { return h.year; })));
      await loadIndustryNamesForYears(uniqueYears);
      for (let i = 0; i < hashSelections.length; i += 1) {
        const sel = hashSelections[i];
        await loadDataset(sel.country, sel.year, sel.flow, sel.topn, sel.otherCountry, sel.metric);
      }
    } catch (error) {
      console.error("Dashboard bootstrap failed:", error);
      updateStatus("Dashboard startup failed. Check the browser console for details.", true);
    }
  }());
}());
