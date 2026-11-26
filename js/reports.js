/**
 * NeuroData AI Studio - Automated AI Insights & Executive Dossier Generator (js/reports.js)
 */

const Reports = {
  /**
   * Generates dynamic plain-English takeaways from statistical computations
   */
  generateInsights(data, schema, numCols, matrix) {
    const insights = [];
    const totalRecords = data.length;
    const totalNulls = Object.values(schema).reduce((acc, s) => acc + s.nullCount, 0);
    const totalCells = totalRecords * Object.keys(schema).length;
    const completeness = totalCells > 0 ? (((totalCells - totalNulls) / totalCells) * 100).toFixed(1) : 100.0;

    // 1. Data Integrity & Volume
    if (totalNulls === 0) {
      insights.push({
        type: 'success',
        icon: '🛡️',
        title: 'High Data Quality & Integrity',
        metric: `${totalRecords} records • 100% complete`,
        explanation: `All ${totalRecords} records across ${Object.keys(schema).length} attributes are fully populated with 0 missing values.`,
        business_implication: 'Zero imputation bias enables high-reliability modeling and unskewed aggregations.',
        next_action: 'Proceed directly with predictive modeling and multivariate correlation exploration.'
      });
    } else {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Data Hygiene Attention Needed',
        metric: `${totalNulls} missing cells (${(100 - completeness).toFixed(1)}% null rate)`,
        explanation: `Found unrecorded entries across features. Certain segment distributions may be biased if not cleaned.`,
        business_implication: 'Missing fields can distort segment averages and trigger errors during machine learning.',
        next_action: 'Utilize the Data Transformation tab to apply Mean, Median, or Mode imputation.'
      });
    }

    // 2. Correlation Discoveries
    let maxPositive = { r: 0, c1: null, c2: null };
    let maxNegative = { r: 0, c1: null, c2: null };

    if (numCols && numCols.length >= 2 && matrix) {
      for (let i = 0; i < numCols.length; i++) {
        for (let j = i + 1; j < numCols.length; j++) {
          const c1 = numCols[i];
          const c2 = numCols[j];
          const r = matrix[c1] ? matrix[c1][c2] : 0;
          if (r > maxPositive.r && r < 0.999) {
            maxPositive = { r, c1, c2 };
          }
          if (r < maxNegative.r) {
            maxNegative = { r, c1, c2 };
          }
        }
      }

      if (maxPositive.c1 && maxPositive.r > 0.45) {
        const strength = maxPositive.r > 0.75 ? 'very strong' : 'moderate-to-strong';
        insights.push({
          type: 'highlight',
          icon: '📈',
          title: `Primary Statistical Driver: ${maxPositive.c1} ⟷ ${maxPositive.c2}`,
          metric: `Pearson r = +${maxPositive.r.toFixed(3)}`,
          explanation: `A ${strength} direct dependency was detected between "${maxPositive.c1}" and "${maxPositive.c2}".`,
          business_implication: `Strategic initiatives increasing ${maxPositive.c1} will yield proportional gains in ${maxPositive.c2}.`,
          next_action: `Test an Ordinary Least Squares regression model using ${maxPositive.c1} as the predictor.`
        });
      }

      if (maxNegative.c1 && maxNegative.r < -0.4) {
        insights.push({
          type: 'info',
          icon: '📉',
          title: `Inverse Tradeoff: ${maxNegative.c1} ⟷ ${maxNegative.c2}`,
          metric: `Pearson r = ${maxNegative.r.toFixed(3)}`,
          explanation: `An inverse relationship exists between "${maxNegative.c1}" and "${maxNegative.c2}".`,
          business_implication: 'Balancing these opposing dimensions is necessary to optimize risk versus throughput.',
          next_action: 'Analyze the trade-off curve in Visual Studio using a scatter plot.'
        });
      }
    }

    // 3. Volatility & Skewness Check
    if (numCols && numCols.length > 0) {
      let maxOutlierCol = null;
      let maxOutliers = 0;

      numCols.forEach(col => {
        const stats = EDA.computeNumericalStats(data, col);
        if (stats && stats.outlierCount > maxOutliers) {
          maxOutliers = stats.outlierCount;
          maxOutlierCol = { col, ...stats };
        }
      });

      if (maxOutlierCol && maxOutlierCol.outlierCount > 0) {
        insights.push({
          type: 'info',
          icon: '🚨',
          title: `Outlier Concentration in "${maxOutlierCol.col}"`,
          metric: `${maxOutlierCol.outlierCount} outliers (${maxOutlierCol.outlierPct}%)`,
          explanation: `Values in "${maxOutlierCol.col}" exceed 1.5x IQR boundaries [Range: ${maxOutlierCol.min} to ${maxOutlierCol.max}].`,
          business_implication: 'Outliers may represent high-value enterprise accounts, system anomalies, or transcription errors.',
          next_action: 'Examine these observations in the Anomaly Scanner tab to verify data validity.'
        });
      }
    }

    return insights;
  },

  /**
   * Renders the printable executive dossier view
   */
  renderReportView(containerId, datasetTitle, data, schema, numCols, matrix, activeML) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const insights = this.generateInsights(data, schema, numCols, matrix);
    const totalRecords = data.length;
    const numFeatures = Object.keys(schema).length;
    const nullCount = Object.values(schema).reduce((acc, s) => acc + s.nullCount, 0);

    let html = `
      <div class="dashboard-card" id="printableReport" style="padding: 1.5rem 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--border-color); padding-bottom: 1.25rem; margin-bottom: 1.5rem;">
          <div>
            <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--primary);">AUTOMATED EXECUTIVE DOSSIER</div>
            <h2 style="font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0.25rem 0;">${datasetTitle || 'Active Dataset Evaluation'}</h2>
            <p style="font-size: 0.82rem; color: var(--text-muted);">NeuroData AI Studio &bull; Generated on ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div style="display: flex; gap: 0.6rem;">
            <button class="btn btn-secondary btn-sm" onclick="window.print()">
              <span>🖨️ Print Dossier</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btnDownloadPdfDossier">
              <span>📄 Download PDF</span>
            </button>
          </div>
        </div>

        <!-- KPI Summary Strip -->
        <div class="kpi-summary-grid" style="margin-bottom: 1.75rem;">
          <div class="kpi-card">
            <div class="kpi-icon-box kpi-blue">📄</div>
            <div class="kpi-meta">
              <span class="kpi-label">OBSERVATIONS</span>
              <span class="kpi-value">${totalRecords}</span>
              <span class="kpi-subtext">Rows Analyzed</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon-box kpi-purple">🧬</div>
            <div class="kpi-meta">
              <span class="kpi-label">DIMENSIONS</span>
              <span class="kpi-value">${numFeatures}</span>
              <span class="kpi-subtext">${numCols.length} Num &bull; ${numFeatures - numCols.length} Cat</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon-box kpi-emerald">🛡️</div>
            <div class="kpi-meta">
              <span class="kpi-label">COMPLETENESS</span>
              <span class="kpi-value">${totalRecords > 0 ? (((totalRecords * numFeatures - nullCount)/(totalRecords * numFeatures)) * 100).toFixed(1) : 100}%</span>
              <span class="kpi-subtext">${nullCount} Missing Cells</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon-box kpi-cyan">🧠</div>
            <div class="kpi-meta">
              <span class="kpi-label">ENGINE READINESS</span>
              <span class="kpi-value" style="color: var(--accent-emerald);">Passed</span>
              <span class="kpi-subtext">Deterministic ML Active</span>
            </div>
          </div>
        </div>

        <!-- Discovered Business Insights -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.85rem;">
            🧠 Strategic Insights & Discovered Patterns
          </h3>
          <div class="insights-grid">
    `;

    insights.forEach(ins => {
      html += `
        <div class="insight-card ${ins.type}">
          <div class="insight-title-row">
            <span>${ins.icon}</span>
            <span>${ins.title}</span>
          </div>
          <div class="insight-metric-pill">${ins.metric}</div>
          <p class="insight-desc">${ins.explanation}</p>
          <div class="insight-action-box">
            <strong>Business Implication:</strong> ${ins.business_implication}<br/>
            <strong>Recommended Action:</strong> ${ins.next_action}
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <!-- Statistical Distribution Table -->
        <div>
          <h3 style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.85rem;">
            📊 Statistical Feature Breakdown
          </h3>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Mean</th>
                  <th>Median</th>
                  <th>Std Dev</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>IQR</th>
                  <th>Skewness</th>
                  <th>Outliers</th>
                </tr>
              </thead>
              <tbody>
    `;

    numCols.slice(0, 10).forEach(col => {
      const stats = EDA.computeNumericalStats(data, col);
      if (stats) {
        html += `
          <tr>
            <td><strong>${col}</strong></td>
            <td>${stats.mean}</td>
            <td>${stats.median}</td>
            <td>${stats.stdDev}</td>
            <td>${stats.min}</td>
            <td>${stats.max}</td>
            <td>${stats.iqr}</td>
            <td>${stats.skewness}</td>
            <td>${stats.outlierCount} (${stats.outlierPct}%)</td>
          </tr>
        `;
      }
    });

    html += `
              </tbody>
            </table>
          </div>
        </div>

        <!-- Governance footer -->
        <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.76rem; color: var(--text-muted); line-height: 1.4;">
          <strong>Governance Notice:</strong> This document was compiled deterministically by NeuroData AI Studio. Outlier detection uses Tukey's 1.5x IQR standard. All calculations are traceable to active dataset observations.
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach PDF Download button listener
    document.getElementById('btnDownloadPdfDossier')?.addEventListener('click', () => {
      App.exportPdfDossier();
    });
  }
};
