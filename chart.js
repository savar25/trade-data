(function () {
  const manifest = window.TRADE_SANKEY_MANIFEST;
  const resourceManifest = window.TRADE_RESOURCE_DATA;
  const chartGrid = document.getElementById("chart-grid");
  const countrySelect = document.getElementById("country-select");
  const yearSelect = document.getElementById("year-select");
  const loadButton = document.getElementById("load-button");
  const statusText = document.getElementById("status-text");
  const selectionPill = document.getElementById("selection-pill");
  const rulePill = document.getElementById("rule-pill");
  const hoverTooltip = document.getElementById("hover-tooltip");
  const clickTooltip = document.getElementById("click-tooltip");

  if (!manifest || !chartGrid || !countrySelect || !yearSelect || !hoverTooltip || !clickTooltip) {
    return;
  }

  const panelConfigs = [
    {
      kind: "impact",
      title: "Impact Flow 1",
      selectable: true,
      defaultIndicatorIndex: 0,
      note: "trade_impact.csv",
      stats: [
        { key: "total", label: "Displayed Total" },
        { key: "largest", label: "Largest Link" }
      ]
    },
    {
      kind: "impact",
      title: "Impact Flow 2",
      selectable: true,
      defaultIndicatorIndex: 1,
      note: "trade_impact.csv",
      stats: [
        { key: "total", label: "Displayed Total" },
        { key: "largest", label: "Largest Link" }
      ]
    },
    {
      kind: "resource-flow",
      title: "Resource Flow",
      selectable: false,
      note: "trade_resource.csv",
      stats: [
        { key: "total", label: "Displayed Total" },
        { key: "largest", label: "Largest Link" }
      ]
    },
    {
      kind: "resource-mix",
      title: "Resource Mix",
      selectable: false,
      note: "trade_resource.csv",
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

  let sankeyData = null;
  let activeDatasetScript = null;
  let selectedMark = null;
  let activeSelection = {
    country: manifest.defaultSelection.country,
    year: manifest.defaultSelection.year
  };
  const panels = [];

  const industryNameByCode = {};
  const industryNameByYear = {};
  let hashSelections = [];

  function normalizeCode(code) {
    return String(code || "").trim();
  }

  function truncateIndustryName(name) {
    const words = name.split(/\s+/);
    const result = [];
    for (let word of words) {
      if (word.toLowerCase() === 'service') break;
      result.push(word);
      if (result.length >= 2) break;
    }
    return result.join(' ');
  }

  function resolveIndustryName(code) {
    const key = normalizeCode(code);
    const fullName = industryNameByCode[key];
    if (fullName && fullName !== key) {
      return truncateIndustryName(fullName);
    }
    return key;
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

      async function fetchCsv(path) {
        try {
          const response = await fetch(path);
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }
          return await response.text();
        } catch (err) {
          return null;
        }
      }

      let text = await fetchCsv("./year/" + encodeURIComponent(year) + "/industry.csv");
      if (!text) {
        text = await fetchCsv("https://raw.githubusercontent.com/ModelEarth/trade-data/main/year/" + encodeURIComponent(year) + "/industry.csv");
      }
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

  function parseHashSelections() {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const countries = (params.get("country") || manifest.defaultSelection.country)
      .split(",")
      .map(normalizeCode)
      .filter(Boolean);
    const years = (params.get("year") || manifest.defaultSelection.year)
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
        if (availableYears.includes(year)) {
          selections.push({ country: country, year: year });
        }
      });
    });

    if (!selections.length) {
      selections.push({
        country: manifest.defaultSelection.country,
        year: manifest.defaultSelection.year
      });
    }

    return selections;
  }

  function updateHash(co, yr) {
    const normalizedCountry = normalizeCode(co || countrySelect.value);
    const normalizedYear = normalizeCode(yr || yearSelect.value);
    window.location.hash = "country=" + encodeURIComponent(normalizedCountry) + "&year=" + encodeURIComponent(normalizedYear);
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

  function loadDataset(countryParam, yearParam) {
    const country = countryParam || countrySelect.value;
    const year = yearParam || yearSelect.value;

    if (!manifest.countries.includes(country)) {
      updateStatus("Unsupported country " + country + ".", true);
      return Promise.reject(new Error("Unsupported country"));
    }

    const yearsForCountry = manifest.yearsByCountry[country] || [];
    if (!yearsForCountry.includes(year)) {
      updateStatus("Unsupported year " + year + " for " + country + ".", true);
      return Promise.reject(new Error("Unsupported year"));
    }

    activeSelection = { country: country, year: year };

    countrySelect.value = country;
    updateYearOptions();
    yearSelect.value = year;

    if (loadButton) {
      loadButton.disabled = true;
    }
    countrySelect.disabled = true;
    yearSelect.disabled = true;
    updateHeroMeta();
    updateStatus("Loading " + country + " " + year + " domestic impact dataset...", false);
    window.TRADE_SANKEY_DATA = null;

    if (activeDatasetScript && activeDatasetScript.parentNode) {
      activeDatasetScript.parentNode.removeChild(activeDatasetScript);
    }

    const datasetPath = manifest.datasetBasePath + "/" + year + "/" + country + ".js";

    return loadIndustryNamesForYears([year]).then(function () {
      return new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = datasetPath;

        script.onload = function () {
          if (loadButton) {
            loadButton.disabled = false;
          }
          countrySelect.disabled = false;
          yearSelect.disabled = false;

          if (!window.TRADE_SANKEY_DATA || !window.TRADE_SANKEY_DATA.dataset) {
            sankeyData = null;
            updateHeroMeta();
            renderAllPanels();
            updateStatus("Unable to load impact dataset for " + country + " " + year + ".", true);
            resolve();
            return;
          }

          sankeyData = window.TRADE_SANKEY_DATA;
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
          updateStatus("Loaded " + sankeyData.meta.country + " " + sankeyData.meta.year + " domestic impact dataset.", false);
          resolve();
        };

        script.onerror = function () {
          if (loadButton) {
            loadButton.disabled = false;
          }
          countrySelect.disabled = false;
          yearSelect.disabled = false;
          sankeyData = null;
          updateHeroMeta();
          renderAllPanels();
          updateStatus("No domestic impact dataset file found for " + country + " " + year + ".", true);
          resolve();
        };

        activeDatasetScript = script;
        document.head.appendChild(script);
      });
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
      const note = createElement("div", "panel-note", config.note);
      head.append(copy, note);
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
    const leftX = 120;
    const rightX = width - 120 - nodeWidth;
    const padSource = Math.max(8, Math.min(18, 220 / Math.max(sourceTotals.size, 1)));
    const padTarget = Math.max(8, Math.min(18, 220 / Math.max(targetTotals.size, 1)));
    const innerHeightSources = height - top - bottom - padSource * Math.max(sourceTotals.size - 1, 0);
    const innerHeightTargets = height - top - bottom - padTarget * Math.max(targetTotals.size - 1, 0);
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

    let sourceY = top;
    sourceNodes.forEach(function (node) {
      node.x = leftX;
      node.y = sourceY;
      node.height = node.total * scale;
      sourceY += node.height + padSource;
    });

    let targetY = top;
    targetNodes.forEach(function (node) {
      node.x = rightX;
      node.y = targetY;
      node.height = node.total * scale;
      targetY += node.height + padTarget;
    });

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
      rect.setAttribute("rx", "6");
      rect.setAttribute("fill", colorFor(node.code, 0.9));
      rect.setAttribute("opacity", "0.92");
      appendTitle(rect, node.label + " (" + node.code + ") source total: " + formatExact(node.total));
      group.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", node.x - 10);
      label.setAttribute("text-anchor", "end");

      const lines = wrapTextLines(node.label, 18);
      const lineHeight = 14;
      const top = node.y + node.height / 2 - ((lines.length - 1) * lineHeight) / 2;
      label.setAttribute("y", top);

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
      value.setAttribute("y", node.y + node.height / 2 + 9);
      value.setAttribute("text-anchor", "end");
      value.textContent = formatCompact(node.total);
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
      rect.setAttribute("rx", "6");
      rect.setAttribute("fill", colorFor(node.code, 0.9));
      rect.setAttribute("opacity", "0.92");
      appendTitle(rect, node.label + " (" + node.code + ") target total: " + formatExact(node.total));
      group.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", node.x + layout.nodeWidth + 10);
      label.setAttribute("text-anchor", "start");

      const lines = wrapTextLines(node.label, 18);
      const lineHeight = 14;
      const top = node.y + node.height / 2 - ((lines.length - 1) * lineHeight) / 2;
      label.setAttribute("y", top);

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
      value.setAttribute("y", node.y + node.height / 2 + 9);
      value.setAttribute("text-anchor", "start");
      value.textContent = formatCompact(node.total);
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
    if (!resourceManifest || !resourceManifest.selections || !activeSelection) {
      return null;
    }
    return resourceManifest.selections[activeSelection.year + "|" + activeSelection.country] || null;
  }

  function renderImpactPanel(panelState) {
    if (!sankeyData || !sankeyData.dataset) {
      showEmpty(panelState, "Choose a country and year; data loads automatically.");
      return;
    }

    const fallbackIndicator =
      defaultIndicators()[panelState.config.defaultIndicatorIndex] ||
      indicatorColumns()[panelState.config.defaultIndicatorIndex] ||
      indicatorColumns()[0];
    const indicator = panelState.select && panelState.select.value ? panelState.select.value : fallbackIndicator;
    const indicatorData = sankeyData.dataset[indicator];
    const links = indicatorData && indicatorData.links ? indicatorData.links.map(function (link) {
      return {
        trade_id: Number(link.trade_id),
        source: link.source,
        target: link.target,
        value: Number(link.value),
        amount: Number(link.amount),
        total_impact_value: Number(link.total_impact_value)
      };
    }) : [];

    if (!links.length) {
      showEmpty(panelState, "No eligible rows for this indicator.");
      return;
    }

    const total = links.reduce(function (sum, link) {
      return sum + link.value;
    }, 0);
    const topLink = links[0];
    const targetCount = new Set(links.map(function (link) {
      return link.target;
    })).size;
    const topSources = indicatorData.top_sources || [];
    const topSourceNames = topSources.map(resolveIndustryName);
    const topLinkSourceName = resolveIndustryName(topLink.source);
    const topLinkTargetName = resolveIndustryName(topLink.target);

    renderSankeyPanel(panelState, {
      title: panelState.config.title + ": " + titleizeLabel(indicator),
      subtitle:
        "Top " + manifest.sourceLimit + " industry1 sources, excluding " +
        manifest.excludedSources.join(" and ") + ", with strongest target flow.",
      links: links,
      stats: {
        total: formatCompact(total) + " (" + formatExact(total) + ")",
        largest: topLink.source + " -> " + topLink.target + " (" + formatCompact(topLink.value) + ")"
      },
      buildTitle: function (link) {
        return [
          titleizeLabel(indicator) + ": " + formatExact(link.value),
          "Flow: " + flowLabel(link.source, link.target),
          "Trade ID: " + link.trade_id,
          "Trade Amount: " + formatExact(link.amount),
          "Total Impact Value: " + formatExact(link.total_impact_value)
        ].join("\n");
      },
      buildHoverRows: function (link) {
        return [
          { label: "Chart", value: panelState.config.title },
          { label: "Indicator", value: titleizeLabel(indicator) },
          { label: "Flow", value: flowLabel(link.source, link.target) },
          { label: "Value", value: formatExact(link.value) }
        ];
      },
      buildClickRows: function (link) {
        return [
          { label: "Chart", value: panelState.config.title },
          { label: "Indicator", value: titleizeLabel(indicator) },
          { label: "Flow", value: flowLabel(link.source, link.target) },
          { label: "Trade ID", value: String(link.trade_id) },
          { label: "Amount", value: formatExact(link.amount) },
          { label: "Impact", value: formatExact(link.total_impact_value) }
        ];
      }
    });
  }

  function renderResourceFlowPanel(panelState) {
    const resourceSelection = getResourceSelection();
    if (!resourceSelection) {
      showEmpty(panelState, "No domestic trade_resource.csv dataset for this selection.");
      return;
    }

    const links = (resourceSelection.flow_links || []).map(function (link) {
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

    const total = links.reduce(function (sum, link) {
      return sum + link.value;
    }, 0);
    const topLink = links[0];
    const targetCount = new Set(links.map(function (link) {
      return link.target;
    })).size;

    renderSankeyPanel(panelState, {
      title: panelState.config.title,
      subtitle:
        "Strongest domestic resource-intensive links drawn from " +
        resourceSelection.source_csv + ".",
      links: links,
      stats: {
        total: formatCompact(total) + " (" + formatExact(total) + ")",
        largest: topLink.source + " -> " + topLink.target + " (" + formatCompact(topLink.value) + ")"
      },
      buildTitle: function (link) {
        return [
          "Total Resources: " + formatExact(link.value),
          "Flow: " + flowLabel(link.source, link.target),
          "Trade ID: " + link.trade_id,
          "Trade Amount: " + formatExact(link.amount)
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
          { label: "Amount", value: formatExact(link.amount) },
          { label: "Resources", value: formatExact(link.value) }
        ];
      }
    });
  }

  function renderResourceMixPanel(panelState) {
    const resourceSelection = getResourceSelection();
    if (!resourceSelection) {
      showEmpty(panelState, "No domestic trade_resource.csv dataset for this selection.");
      return;
    }

    const items = (resourceSelection.summary_mix || []).slice(0, 5).map(function (item) {
      return {
        name: item.name,
        value: Number(item.value),
        sourceFactor: item.source_factor,
        spotlight: item.spotlight || null
      };
    });

    if (!items.length) {
      showEmpty(panelState, "No resource category mix available for this selection.");
      return;
    }

    const dominant = items[0];
    const spotlight = dominant.spotlight;
    const spotlightText = spotlight
      ? spotlight.source + " -> " + spotlight.target
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
        return [
          { label: "Chart", value: "Resource Mix" },
          { label: "Bucket", value: item.name },
          { label: "Factor", value: titleizeLabel(item.sourceFactor) },
          { label: "Total", value: formatExact(item.value) }
        ];
      },
      buildClickRows: function (item) {
        const rows = [
          { label: "Chart", value: "Resource Mix" },
          { label: "Bucket", value: item.name },
          { label: "Factor", value: titleizeLabel(item.sourceFactor) },
          { label: "Total", value: formatExact(item.value) }
        ];

        if (item.spotlight) {
          rows.push({ label: "Flow", value: flowLabel(item.spotlight.source, item.spotlight.target) });
          rows.push({ label: "Trade ID", value: String(item.spotlight.trade_id) });
          rows.push({ label: "Amount", value: formatExact(item.spotlight.amount) });
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

  function updateHeroMeta() {
    if (activeSelection && activeSelection.country && activeSelection.year) {
      selectionPill.textContent = "Selection: " + activeSelection.country + " / " + activeSelection.year;
    } else {
      selectionPill.textContent = "Selection: --";
    }

    const sourceLimit = sankeyData && sankeyData.meta && sankeyData.meta.source_limit
      ? sankeyData.meta.source_limit
      : resourceManifest && resourceManifest.meta && resourceManifest.meta.sourceLimit
        ? resourceManifest.meta.sourceLimit
        : manifest.sourceLimit;
    const excludedSources = sankeyData && sankeyData.meta && sankeyData.meta.excluded_sources
      ? sankeyData.meta.excluded_sources
      : resourceManifest && resourceManifest.meta && resourceManifest.meta.excludedSources
        ? resourceManifest.meta.excludedSources
        : manifest.excludedSources;

    rulePill.textContent =
      "Top " + sourceLimit + " industry1 sources, excluding " +
      excludedSources.join(" and ");
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
    yearSelect.value = first.year;
    updateHash(first.country, first.year);
  } else {
    countrySelect.value = manifest.defaultSelection.country;
    updateYearOptions();
    yearSelect.value = manifest.defaultSelection.year;
    updateHash(manifest.defaultSelection.country, manifest.defaultSelection.year);
    hashSelections = [{
      country: manifest.defaultSelection.country,
      year: manifest.defaultSelection.year
    }];
  }

  countrySelect.addEventListener("change", function () {
    updateYearOptions();
    const selectedCountry = countrySelect.value;
    const selectedYear = yearSelect.value;
    updateHash(selectedCountry, selectedYear);
    loadDataset(selectedCountry, selectedYear);
  });

  yearSelect.addEventListener("change", function () {
    const selectedCountry = countrySelect.value;
    const selectedYear = yearSelect.value;
    updateHash(selectedCountry, selectedYear);
    loadDataset(selectedCountry, selectedYear);
  });

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

  updateHeroMeta();
  renderAllPanels();

  (async function loadHashSelections() {
    const uniqueYears = Array.from(new Set(hashSelections.map(function (h) { return h.year; })));
    await loadIndustryNamesForYears(uniqueYears);
    for (let i = 0; i < hashSelections.length; i += 1) {
      const sel = hashSelections[i];
      await loadDataset(sel.country, sel.year);
    }
  }());
}());
