/**
 * NeuroData AI Studio - Visualization Controller (js/visualizer.js)
 * Manages modern Chart.js charts, responsive themes (Light & Dark), and PNG export.
 */

const Visualizer = {
  charts: {},

  currentTheme: 'corporate',

  themes: {
    corporate: {
      name: 'Corporate Clean',
      palette: ['#2563eb', '#0284c7', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#4f46e5'],
      darkPalette: ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#c084fc', '#f43f5e', '#22d3ee', '#a78bfa']
    },
    aurora: {
      name: 'Deep Aurora',
      palette: ['#059669', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#0891b2', '#10b981', '#65a30d'],
      darkPalette: ['#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#14b8a6', '#22d3ee', '#84cc16']
    },
    sunset: {
      name: 'Sunset Warmth',
      palette: ['#ea580c', '#e11d48', '#db2777', '#7c3aed', '#d97706', '#be123c', '#c026d3', '#f97316'],
      darkPalette: ['#f97316', '#f43f5e', '#ec4899', '#8b5cf6', '#f59e0b', '#e11d48', '#d946ef', '#fb923c']
    }
  },

  destroy(chartId) {
    if (this.charts[chartId]) {
      this.charts[chartId].destroy();
      delete this.charts[chartId];
    }
  },

  getDefaultOptions(title = '', isScatter = false) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipTitle = isDark ? '#f8fafc' : '#0f172a';
    const tooltipBody = isDark ? '#cbd5e1' : '#334155';
    const tooltipBorder = isDark ? 'rgba(56, 189, 248, 0.3)' : 'rgba(203, 213, 225, 0.8)';

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 600,
        easing: 'easeOutQuart'
      },
      plugins: {
        title: {
          display: Boolean(title),
          text: title,
          color: isDark ? '#f8fafc' : '#0f172a',
          font: { family: "'Plus Jakarta Sans', sans-serif", size: 14, weight: '600' },
          padding: { bottom: 12 }
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 12, weight: '500' },
            boxWidth: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          boxPadding: 5,
          usePointStyle: true,
          cornerRadius: 6,
          bodyFont: { family: "'Inter', sans-serif", size: 12 }
        }
      },
      scales: isScatter ? {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 11 } }
        }
      } : {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: "'Inter', sans-serif", size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 11 } }
        }
      }
    };
  },

  getPalette() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const th = this.themes[this.currentTheme] || this.themes.corporate;
    return isDark ? th.darkPalette : th.palette;
  },

  renderCustomChart(canvasId, type, labels, datasetConfigs, optionsOverride = {}) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const palette = this.getPalette();

    const isArea = type === 'area';
    const chartType = isArea ? 'line' : type;
    const isPolarOrPie = ['pie', 'doughnut', 'radar', 'polarArea'].includes(type);

    const datasets = datasetConfigs.map((ds, idx) => {
      const color = ds.color || palette[idx % palette.length];
      return {
        label: ds.label || `Series ${idx + 1}`,
        data: ds.data,
        backgroundColor: isPolarOrPie
          ? palette.slice(0, labels.length)
          : (isArea ? this.createGradient(ctx, color) : color),
        borderColor: isPolarOrPie ? (document.documentElement.getAttribute('data-theme') === 'dark' ? '#111827' : '#ffffff') : color,
        borderWidth: isPolarOrPie ? 2 : (type === 'line' || isArea ? 2.5 : 1),
        fill: isArea,
        tension: 0.3,
        pointBackgroundColor: color,
        pointRadius: type === 'line' || isArea ? 3.5 : undefined,
        pointHoverRadius: 6,
        borderRadius: type === 'bar' ? 4 : 0,
        ...ds
      };
    });

    const baseOpts = this.getDefaultOptions('', false);
    if (isPolarOrPie) {
      delete baseOpts.scales;
    }

    const mergedOpts = { ...baseOpts, ...optionsOverride };

    this.charts[canvasId] = new Chart(ctx, {
      type: chartType,
      data: { labels, datasets },
      options: mergedOpts
    });
  },

  createGradient(ctx, color) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(1, color + '00');
    return gradient;
  },

  renderRegressionChart(canvasId, regResult) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';

    const scatterData = regResult.points.map(p => ({ x: p.x, y: p.y }));
    const trendlineData = regResult.trendline.map(p => ({ x: p.x, y: p.y }));

    const datasets = [
      {
        type: 'scatter',
        label: `Observations (N=${regResult.points.length})`,
        data: scatterData,
        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(37, 99, 235, 0.65)',
        borderColor: isDark ? '#38bdf8' : '#2563eb',
        borderWidth: 1,
        pointRadius: 4.5,
        pointHoverRadius: 7
      },
      {
        type: 'line',
        label: `Model Fit (${regResult.equation})`,
        data: trendlineData,
        borderColor: '#e11d48',
        borderWidth: 2.5,
        pointRadius: 0,
        fill: false,
        tension: regResult.type === 'polynomial' ? 0.35 : 0
      }
    ];

    const options = this.getDefaultOptions('', true);
    options.scales.x.title = { display: true, text: regResult.featureX || regResult.feat_x, color: textColor };
    options.scales.y.title = { display: true, text: regResult.targetY || regResult.target_y, color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      data: { datasets },
      options
    });
  },

  renderClusteringChart(canvasId, clusterResult) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const palette = this.getPalette();

    const datasets = [];
    for (let c = 0; c < clusterResult.k; c++) {
      const clusterPts = clusterResult.points
        .filter(p => p.cluster === c)
        .map(p => ({ x: p.x, y: p.y, id: p.id }));

      const col = palette[c % palette.length];
      datasets.push({
        type: 'scatter',
        label: `Cluster ${c + 1} (${clusterPts.length} items)`,
        data: clusterPts,
        backgroundColor: col + 'bb',
        borderColor: col,
        borderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 8
      });
    }

    // Centroids
    const centroidPts = clusterResult.centroids.map(c => ({ x: c.x, y: c.y }));
    datasets.push({
      type: 'scatter',
      label: 'Centroids (Partition Centers)',
      data: centroidPts,
      backgroundColor: '#ffffff',
      borderColor: '#d97706',
      borderWidth: 2.5,
      pointRadius: 8,
      pointStyle: 'triangle',
      pointHoverRadius: 11
    });

    const options = this.getDefaultOptions('', true);
    options.scales.x.title = { display: true, text: clusterResult.featX, color: textColor };
    options.scales.y.title = { display: true, text: clusterResult.featY, color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      data: { datasets },
      options
    });
  },

  renderAnomalyChart(canvasId, anomalyResult) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';

    const normalPts = [];
    const anomalyPts = [];

    anomalyResult.allPoints.forEach((p, idx) => {
      const pt = { x: idx + 1, y: p.value, id: p.id };
      if (p.isAnomaly) anomalyPts.push(pt);
      else normalPts.push(pt);
    });

    const datasets = [
      {
        type: 'scatter',
        label: `Normal (${normalPts.length})`,
        data: normalPts,
        backgroundColor: isDark ? '#38bdf8' : '#2563eb',
        pointRadius: 4
      },
      {
        type: 'scatter',
        label: `Detected Outliers (${anomalyPts.length})`,
        data: anomalyPts,
        backgroundColor: '#e11d48',
        borderColor: '#fca5a5',
        borderWidth: 2,
        pointRadius: 7.5,
        pointHoverRadius: 10
      },
      {
        type: 'line',
        label: `Upper Threshold (${anomalyResult.upperBound})`,
        data: [
          { x: 1, y: anomalyResult.upperBound },
          { x: anomalyResult.allPoints.length, y: anomalyResult.upperBound }
        ],
        borderColor: '#d97706',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false
      },
      {
        type: 'line',
        label: `Lower Threshold (${anomalyResult.lowerBound})`,
        data: [
          { x: 1, y: anomalyResult.lowerBound },
          { x: anomalyResult.allPoints.length, y: anomalyResult.lowerBound }
        ],
        borderColor: '#d97706',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false
      }
    ];

    const options = this.getDefaultOptions('', true);
    options.scales.x.title = { display: true, text: 'Observation Index', color: textColor };
    options.scales.y.title = { display: true, text: anomalyResult.feature, color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      data: { datasets },
      options
    });
  },

  renderForecastChart(canvasId, forecastResult) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';

    const histLabels = forecastResult.historical.map((_, i) => `T-${i + 1}`);
    const futureLabels = forecastResult.forecasts.map(f => f.step);
    const allLabels = [...histLabels, ...futureLabels];

    const histData = [...forecastResult.historical, ...new Array(forecastResult.forecasts.length).fill(null)];
    const smoothData = [...forecastResult.smoothed, ...new Array(forecastResult.forecasts.length).fill(null)];

    const lastSmoothed = forecastResult.smoothed[forecastResult.smoothed.length - 1];
    const forecastLine = new Array(forecastResult.historical.length - 1).fill(null);
    forecastLine.push(lastSmoothed);
    forecastResult.forecasts.forEach(f => forecastLine.push(f.value));

    const datasets = [
      {
        label: 'Historical Actuals',
        data: histData,
        borderColor: isDark ? '#38bdf8' : '#2563eb',
        backgroundColor: isDark ? '#38bdf8' : '#2563eb',
        pointRadius: 3,
        tension: 0.15
      },
      {
        label: 'Smoothed Trend',
        data: smoothData,
        borderColor: '#7c3aed',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25
      },
      {
        label: 'Projected Forecast',
        data: forecastLine,
        borderColor: '#059669',
        backgroundColor: this.createGradient(ctx, '#059669'),
        borderDash: [5, 4],
        borderWidth: 2.5,
        pointRadius: 4.5,
        pointBackgroundColor: '#059669',
        pointBorderColor: '#ffffff',
        fill: true,
        tension: 0.15
      }
    ];

    const options = this.getDefaultOptions();
    options.scales.y.title = { display: true, text: forecastResult.feature, color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: allLabels, datasets },
      options
    });
  },

  renderCorrelationMatrixGrid(containerId, matrix, columns) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!columns || columns.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No numerical columns available for correlation analysis.</div>`;
      return;
    }

    let html = `<div class="heatmap-table-container"><table class="heatmap-table"><thead><tr><th>Feature</th>`;
    columns.forEach(col => {
      const shortCol = col.length > 14 ? col.substring(0, 12) + '...' : col;
      html += `<th title="${col}">${shortCol}</th>`;
    });
    html += `</tr></thead><tbody>`;

    columns.forEach(rCol => {
      html += `<tr><th style="text-align: left; background-color: var(--bg-card-subtle);">${rCol}</th>`;
      columns.forEach(cCol => {
        const val = matrix[rCol] ? matrix[rCol][cCol] : 0;
        const colorStyle = this.getCorrelationColor(val);
        html += `<td style="background-color: ${colorStyle.bg}; color: ${colorStyle.text};" title="${rCol} vs ${cCol}: ${val}">
          <strong>${val.toFixed(2)}</strong>
        </td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  },

  getCorrelationColor(val) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (val === 1) return { bg: isDark ? 'rgba(56, 189, 248, 0.85)' : 'rgba(37, 99, 235, 0.85)', text: '#ffffff' };
    if (val > 0) {
      const alpha = Math.min(0.85, Math.max(0.1, Math.abs(val) * 0.8));
      return {
        bg: isDark ? `rgba(56, 189, 248, ${alpha})` : `rgba(37, 99, 235, ${alpha})`,
        text: alpha > 0.4 ? '#ffffff' : (isDark ? '#cbd5e1' : '#334155')
      };
    } else {
      const alpha = Math.min(0.85, Math.max(0.1, Math.abs(val) * 0.8));
      return {
        bg: isDark ? `rgba(244, 63, 94, ${alpha})` : `rgba(225, 29, 72, ${alpha})`,
        text: alpha > 0.4 ? '#ffffff' : (isDark ? '#cbd5e1' : '#334155')
      };
    }
  },

  renderHistogram(canvasId, values, numBins = 10, colName = 'Value') {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const palette = this.getPalette();
    const primaryColor = palette[0] || '#2563eb';

    const validVals = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (!validVals.length) return;

    const min = Math.min(...validVals);
    const max = Math.max(...validVals);
    const span = max - min;
    const binWidth = span > 0 ? span / numBins : 1;

    const binCounts = new Array(numBins).fill(0);
    const binLabels = [];

    for (let i = 0; i < numBins; i++) {
      const bMin = min + i * binWidth;
      const bMax = i === numBins - 1 ? max : min + (i + 1) * binWidth;
      binLabels.push(`${bMin.toFixed(1)} - ${bMax.toFixed(1)}`);
    }

    validVals.forEach(v => {
      let binIdx = Math.floor((v - min) / binWidth);
      if (binIdx >= numBins) binIdx = numBins - 1;
      if (binIdx < 0) binIdx = 0;
      binCounts[binIdx]++;
    });

    const datasets = [{
      label: `Frequency (N=${validVals.length})`,
      data: binCounts,
      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(37, 99, 235, 0.7)',
      borderColor: isDark ? '#38bdf8' : '#2563eb',
      borderWidth: 1.5,
      borderRadius: 4
    }];

    const options = this.getDefaultOptions(`Frequency Histogram: ${colName}`);
    options.scales.x.title = { display: true, text: `${colName} Interval Buckets`, color: textColor };
    options.scales.y.title = { display: true, text: 'Observation Count', color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: binLabels, datasets },
      options
    });
  },

  renderBoxPlot(canvasId, colStatsList) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const palette = this.getPalette();

    const labels = colStatsList.map(s => s.column);
    const boxData = colStatsList.map(s => [s.q1, s.q3]);
    const medianData = colStatsList.map(s => s.median);
    const minMaxData = colStatsList.map(s => [s.min, s.max]);

    const datasets = [
      {
        type: 'bar',
        label: 'Interquartile Range (Q1 to Q3)',
        data: boxData,
        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.6)' : 'rgba(37, 99, 235, 0.6)',
        borderColor: isDark ? '#38bdf8' : '#2563eb',
        borderWidth: 2,
        borderRadius: 4,
        barPercentage: 0.5
      },
      {
        type: 'line',
        label: 'Median',
        data: medianData,
        borderColor: '#e11d48',
        backgroundColor: '#e11d48',
        pointRadius: 6,
        pointStyle: 'rectRot',
        showLine: false
      },
      {
        type: 'bar',
        label: 'Whiskers (Min to Max)',
        data: minMaxData,
        backgroundColor: 'transparent',
        borderColor: isDark ? '#94a3b8' : '#64748b',
        borderWidth: 1.5,
        borderDash: [3, 3],
        barPercentage: 0.15
      }
    ];

    const options = this.getDefaultOptions('Statistical Box Plot (5-Number Summary)');
    options.scales.x.title = { display: true, text: 'Feature', color: textColor };
    options.scales.y.title = { display: true, text: 'Value Range', color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      data: { labels, datasets },
      options
    });
  },

  renderMissingValuesChart(canvasId, schema, totalRows) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';

    const cols = Object.keys(schema);
    const nullCounts = cols.map(c => schema[c].nullCount || 0);
    const nullPcts = cols.map(c => totalRows > 0 ? +((schema[c].nullCount / totalRows) * 100).toFixed(1) : 0);

    const backgroundColors = nullCounts.map(count => 
      count > 0 ? (isDark ? 'rgba(244, 63, 94, 0.75)' : 'rgba(225, 29, 72, 0.75)') : (isDark ? 'rgba(52, 211, 153, 0.4)' : 'rgba(5, 150, 105, 0.4)')
    );

    const datasets = [{
      label: 'Missing Count',
      data: nullCounts,
      backgroundColor: backgroundColors,
      borderRadius: 4
    }];

    const options = this.getDefaultOptions('Missing Values Distribution Across Features');
    options.scales.x.title = { display: true, text: 'Dataset Columns', color: textColor };
    options.scales.y.title = { display: true, text: 'Missing Null Cells', color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: cols, datasets },
      options
    });
  },

  renderOutlierDetectionChart(canvasId, data, colName, lowerBound, upperBound) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';

    const normalPts = [];
    const outlierPts = [];

    data.forEach((r, idx) => {
      const v = parseFloat(r[colName]);
      if (!isNaN(v)) {
        const pt = { x: idx + 1, y: v };
        if (v < lowerBound || v > upperBound) {
          outlierPts.push(pt);
        } else {
          normalPts.push(pt);
        }
      }
    });

    const datasets = [
      {
        type: 'scatter',
        label: `In-Bounds Normal (${normalPts.length})`,
        data: normalPts,
        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.65)' : 'rgba(37, 99, 235, 0.65)',
        pointRadius: 3.5
      },
      {
        type: 'scatter',
        label: `Detected Outliers (${outlierPts.length})`,
        data: outlierPts,
        backgroundColor: '#e11d48',
        borderColor: '#fca5a5',
        borderWidth: 1.5,
        pointRadius: 7,
        pointHoverRadius: 9
      },
      {
        type: 'line',
        label: `Upper Threshold (${upperBound.toFixed(1)})`,
        data: [{ x: 1, y: upperBound }, { x: data.length, y: upperBound }],
        borderColor: '#d97706',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false
      },
      {
        type: 'line',
        label: `Lower Threshold (${lowerBound.toFixed(1)})`,
        data: [{ x: 1, y: lowerBound }, { x: data.length, y: lowerBound }],
        borderColor: '#d97706',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false
      }
    ];

    const options = this.getDefaultOptions(`Tukey's IQR Outlier Scanner: ${colName}`, true);
    options.scales.x.title = { display: true, text: 'Record Index', color: textColor };
    options.scales.y.title = { display: true, text: colName, color: textColor };

    this.charts[canvasId] = new Chart(ctx, {
      data: { datasets },
      options
    });
  },

  downloadChartAsPNG(canvasId, filename = 'antigravity-chart.png') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }
};

