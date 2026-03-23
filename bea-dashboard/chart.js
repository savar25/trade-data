(function () {
  const manifest = window.TRADE_SANKEY_MANIFEST;
  const chartGrid = document.getElementById("chart-grid");
  const countrySelect = document.getElementById("country-select");
  const yearSelect = document.getElementById("year-select");
  const loadButton = document.getElementById("load-button");
  const statusText = document.getElementById("status-text");
  const selectionPill = document.getElementById("selection-pill");
  const rulePill = document.getElementById("rule-pill");
  const hoverTooltip = document.getElementById("hover-tooltip");
  const clickTooltip = document.getElementById("click-tooltip");

  if (!manifest || !chartGrid || !countrySelect || !yearSelect || !loadButton || !hoverTooltip || !clickTooltip) {
    return;
  }

  const panelCount = 2;
  const compactFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  });
  const exactFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  });

  let sankeyData = null;
  let activeDatasetScript = null;
  let selectedPath = null;
  const panels = [];

  function titleizeIndicator(indicator) {
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
      impact_intensity: "Impact Intensity"
    };

    return replacements[indicator] || indicator.replace(/_/g, " ");
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

  function showHoverTooltip(indicator, link, panelNumber, clientX, clientY) {
    showTooltip(
      hoverTooltip,
      "Hover Preview",
      buildHoverRows(indicator, link, panelNumber),
      clientX + 18,
      clientY + 18
    );
  }

  function showClickTooltip(indicator, link, panelNumber, clientX, clientY) {
    showTooltip(
      clickTooltip,
      "Pinned Line",
      buildClickRows(indicator, link, panelNumber),
      clientX + 20,
      clientY + 20
    );
  }

  function buildHoverRows(indicator, link, panelNumber) {
    return [
      { label: "Chart", value: "Chart " + panelNumber },
      { label: "Indicator", value: titleizeIndicator(indicator) },
      { label: "Flow", value: link.source + " -> " + link.target },
      { label: "Value", value: formatExact(link.value) }
    ];
  }

  function buildClickRows(indicator, link, panelNumber) {
    const rows = buildHoverRows(indicator, link, panelNumber);
    rows.push({ label: "Trade ID", value: String(link.trade_id) });
    rows.push({ label: "Amount", value: formatExact(link.amount) });
    rows.push({ label: "Impact", value: formatExact(link.total_impact_value) });
    return rows;
  }

  function indicatorColumns() {
    return sankeyData && sankeyData.indicatorColumns
      ? sankeyData.indicatorColumns
      : manifest.indicatorColumns;
  }

  function defaultIndicators() {
    const defaults = sankeyData && sankeyData.defaults ? sankeyData.defaults : manifest.defaults;
    return defaults && defaults.length ? defaults.slice(0, panelCount) : indicatorColumns().slice(0, panelCount);
  }

  function setIndicatorOptions(select, selectedValue) {
    const columns = indicatorColumns();
    select.innerHTML = "";
    columns.forEach(function (column) {
      const option = document.createElement("option");
      option.value = column;
      option.textContent = titleizeIndicator(column);
      if (column === selectedValue) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  function buildPanel(panelIndex, indicator) {
    const panel = createElement("article", "panel");
    panel.dataset.panel = String(panelIndex + 1);

    const head = createElement("div", "panel-head");
    const copy = createElement("div", "panel-copy");
    const title = createElement("h2", "", "Chart " + (panelIndex + 1));
    const subtitle = createElement("p", "", "Choose a country and year, then click Load.");
    copy.append(title, subtitle);

    const control = createElement("div", "control");
    const label = createElement("label", "", "Indicator");
    label.htmlFor = "indicator-" + panelIndex;
    const select = createElement("select");
    select.id = "indicator-" + panelIndex;
    setIndicatorOptions(select, indicator);
    control.append(label, select);
    head.append(copy, control);

    const stats = createElement("div", "stats");
    const totalStat = createElement("div", "stat");
    totalStat.innerHTML = '<span class="label">Displayed Total</span><span class="value" data-role="total">0</span>';
    const sourcesStat = createElement("div", "stat");
    sourcesStat.innerHTML = '<span class="label">Industry1 Scope</span><span class="value" data-role="sources">Awaiting load</span>';
    const topLinkStat = createElement("div", "stat");
    topLinkStat.innerHTML = '<span class="label">Largest Link</span><span class="value" data-role="top-link">Awaiting load</span>';
    stats.append(totalStat, sourcesStat, topLinkStat);

    const chartWrap = createElement("div", "chart-wrap");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 760 430");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    chartWrap.appendChild(svg);

    panel.append(head, stats, chartWrap);
    chartGrid.appendChild(panel);

    const panelState = {
      panel: panel,
      title: title,
      subtitle: subtitle,
      select: select,
      svg: svg,
      totalValue: totalStat.querySelector('[data-role="total"]'),
      sourceValue: sourcesStat.querySelector('[data-role="sources"]'),
      topLinkValue: topLinkStat.querySelector('[data-role="top-link"]')
    };

    select.addEventListener("change", function () {
      resetDetailPanels();
      renderPanel(panelState, select.value);
    });

    panels.push(panelState);
  }

  function showEmpty(panelState, message) {
    panelState.title.textContent = "Chart " + panelState.panel.dataset.panel;
    panelState.subtitle.textContent = message;
    panelState.totalValue.textContent = "0";
    panelState.sourceValue.textContent = "Awaiting load";
    panelState.topLinkValue.textContent = "Awaiting load";
    panelState.svg.innerHTML = "";

    const empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
    empty.setAttribute("x", "380");
    empty.setAttribute("y", "215");
    empty.setAttribute("text-anchor", "middle");
    empty.setAttribute("fill", "#59606d");
    empty.textContent = message;
    panelState.svg.appendChild(empty);
  }

  function resetDetailPanels() {
    if (selectedPath) {
      selectedPath.classList.remove("is-selected");
      selectedPath = null;
    }
    hideTooltip(hoverTooltip);
    hideTooltip(clickTooltip);
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
        return { label: entry[0], total: entry[1] };
      })
      .sort(function (left, right) {
        return right.total - left.total || left.label.localeCompare(right.label);
      });

    const targetNodes = Array.from(targetTotals.entries())
      .map(function (entry) {
        return { label: entry[0], total: entry[1] };
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

    const sourceMap = new Map(sourceNodes.map(function (node) { return [node.label, node]; }));
    const targetMap = new Map(targetNodes.map(function (node) { return [node.label, node]; }));
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
      width: width,
      height: height,
      nodeWidth: nodeWidth,
      sourceNodes: sourceNodes,
      targetNodes: targetNodes,
      links: laidOutLinks
    };
  }

  function renderPanel(panelState, indicator) {
    if (!sankeyData || !sankeyData.dataset) {
      showEmpty(panelState, "Choose country and year, then click Load.");
      return;
    }

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

    panelState.title.textContent = "Chart " + panelState.panel.dataset.panel + ": " + titleizeIndicator(indicator);
    panelState.subtitle.textContent =
      "Top " + manifest.sourceLimit + " industry1 sources, excluding " +
      manifest.excludedSources.join(" and ") + ", with strongest target flow.";

    panelState.svg.innerHTML = "";

    if (!links.length) {
      showEmpty(panelState, "No eligible rows for this indicator.");
      return;
    }

    const total = links.reduce(function (sum, link) {
      return sum + link.value;
    }, 0);
    const topLink = links[0];
    const targetSet = new Set(links.map(function (link) { return link.target; }));
    const layout = buildLayout(links);
    const topSources = indicatorData.top_sources || [];

    panelState.totalValue.textContent = formatCompact(total) + " (" + formatExact(total) + ")";
    panelState.sourceValue.textContent = topSources.join(", ") + " | " + targetSet.size + " targets";
    panelState.topLinkValue.textContent =
      topLink.source + " -> " + topLink.target + " (" + formatCompact(topLink.value) + ")";

    layout.links.forEach(function (link) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "sankey-link");
      path.setAttribute("d", link.path);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorFor(link.data.source, 0.38));
      path.setAttribute("stroke-width", Math.max(link.thickness, 1));
      path.setAttribute("stroke-linecap", "round");
      appendTitle(
        path,
        [
      titleizeIndicator(indicator) + ": " + formatExact(link.data.value),
          "Flow: " + link.data.source + " -> " + link.data.target,
          "Trade ID: " + link.data.trade_id,
          "Trade Amount: " + formatExact(link.data.amount),
          "Total Impact Value: " + formatExact(link.data.total_impact_value)
        ].join("\n")
      );
      path.addEventListener("mouseenter", function (event) {
        showHoverTooltip(indicator, link.data, panelState.panel.dataset.panel, event.clientX, event.clientY);
      });
      path.addEventListener("mousemove", function (event) {
        showHoverTooltip(indicator, link.data, panelState.panel.dataset.panel, event.clientX, event.clientY);
      });
      path.addEventListener("mouseleave", function () {
        hideTooltip(hoverTooltip);
      });
      path.addEventListener("click", function (event) {
        if (selectedPath) {
          selectedPath.classList.remove("is-selected");
        }
        selectedPath = path;
        selectedPath.classList.add("is-selected");
        showClickTooltip(indicator, link.data, panelState.panel.dataset.panel, event.clientX, event.clientY);
      });
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
      rect.setAttribute("fill", colorFor(node.label, 0.9));
      rect.setAttribute("opacity", "0.92");
      appendTitle(rect, node.label + " source total: " + formatExact(node.total));
      group.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", node.x - 10);
      label.setAttribute("y", node.y + node.height / 2 - 7);
      label.setAttribute("text-anchor", "end");
      label.textContent = node.label;
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
      rect.setAttribute("fill", colorFor(node.label, 0.9));
      rect.setAttribute("opacity", "0.92");
      appendTitle(rect, node.label + " target total: " + formatExact(node.total));
      group.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("x", node.x + layout.nodeWidth + 10);
      label.setAttribute("y", node.y + node.height / 2 - 7);
      label.setAttribute("text-anchor", "start");
      label.textContent = node.label;
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

  function renderAllPanels() {
    resetDetailPanels();
    panels.forEach(function (panelState, index) {
      const defaults = defaultIndicators();
      const preferred = defaults[index] || indicatorColumns()[index] || indicatorColumns()[0];
      if (!indicatorColumns().includes(panelState.select.value)) {
        setIndicatorOptions(panelState.select, preferred);
      }
      renderPanel(panelState, panelState.select.value || preferred);
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
    if (!sankeyData || !sankeyData.meta) {
      selectionPill.textContent = "Selection: --";
      rulePill.textContent = "Top 5 industry1 sources, excluding WHOLE and CONST";
      return;
    }

    selectionPill.textContent =
      "Selection: " + sankeyData.meta.country + " / " + sankeyData.meta.year;
    rulePill.textContent =
      "Top " + sankeyData.meta.source_limit + " industry1 sources, excluding " +
      sankeyData.meta.excluded_sources.join(" and ");
  }

  function loadDataset() {
    const country = countrySelect.value;
    const year = yearSelect.value;
    const datasetPath = manifest.datasetBasePath + "/" + year + "/" + country + ".js";

    loadButton.disabled = true;
    countrySelect.disabled = true;
    yearSelect.disabled = true;
    updateStatus("Loading " + country + " " + year + " domestic dataset...", false);
    window.TRADE_SANKEY_DATA = null;

    if (activeDatasetScript && activeDatasetScript.parentNode) {
      activeDatasetScript.parentNode.removeChild(activeDatasetScript);
    }

    const script = document.createElement("script");
    script.src = datasetPath;
    script.onload = function () {
      loadButton.disabled = false;
      countrySelect.disabled = false;
      yearSelect.disabled = false;

      if (!window.TRADE_SANKEY_DATA || !window.TRADE_SANKEY_DATA.dataset) {
        sankeyData = null;
        resetDetailPanels();
        updateHeroMeta();
        renderAllPanels();
        updateStatus("Unable to load dataset for " + country + " " + year + ".", true);
        return;
      }

      sankeyData = window.TRADE_SANKEY_DATA;
      resetDetailPanels();
      panels.forEach(function (panelState, index) {
        const defaults = defaultIndicators();
        const nextIndicator = defaults[index] || indicatorColumns()[index] || indicatorColumns()[0];
        setIndicatorOptions(panelState.select, nextIndicator);
      });
      updateHeroMeta();
      renderAllPanels();
      updateStatus("Loaded " + sankeyData.meta.country + " " + sankeyData.meta.year + " domestic dataset.", false);
    };
    script.onerror = function () {
      loadButton.disabled = false;
      countrySelect.disabled = false;
      yearSelect.disabled = false;
      sankeyData = null;
      resetDetailPanels();
      updateHeroMeta();
      renderAllPanels();
      updateStatus("No domestic dataset file found for " + country + " " + year + ".", true);
    };

    activeDatasetScript = script;
    document.head.appendChild(script);
  }

  manifest.countries.forEach(function (country) {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    countrySelect.appendChild(option);
  });

  countrySelect.value = manifest.defaultSelection.country;
  updateYearOptions();
  yearSelect.value = manifest.defaultSelection.year;
  countrySelect.addEventListener("change", updateYearOptions);
  loadButton.addEventListener("click", loadDataset);
  document.addEventListener("click", function (event) {
    if (event.target.closest(".sankey-link")) {
      return;
    }
    if (selectedPath) {
      selectedPath.classList.remove("is-selected");
      selectedPath = null;
    }
    hideTooltip(clickTooltip);
  });

  for (let index = 0; index < panelCount; index += 1) {
    buildPanel(index, defaultIndicators()[index] || indicatorColumns()[index] || indicatorColumns()[0]);
  }

  updateHeroMeta();
  renderAllPanels();
  loadDataset();
}());
