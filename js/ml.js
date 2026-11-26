/**
 * NeuroData Studio - Client-Side Machine Learning & Predictive Analytics Engine (js/ml.js)
 * Implements Regression, K-Means Clustering, Anomaly Detection & Forecasting in pure JS.
 */

const ML = {
  /**
   * Linear Regression (OLS)
   */
  trainLinearRegression(data, featureX, targetY) {
    const points = [];
    data.forEach((r, idx) => {
      const x = parseFloat(r[featureX]);
      const y = parseFloat(r[targetY]);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y, id: r.Student_ID || r.Customer_ID || r.Property_ID || r.Timestamp_Seq || `Row-${idx + 1}` });
      }
    });

    const n = points.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += points[i].x;
      sumY += points[i].y;
      sumXY += points[i].x * points[i].y;
      sumX2 += points[i].x * points[i].x;
    }

    const denom = (n * sumX2 - sumX * sumX);
    if (denom === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // Evaluate Metrics
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0, sumAbsErr = 0;

    const predictions = points.map(pt => {
      const pred = slope * pt.x + intercept;
      const res = pt.y - pred;
      ssRes += res * res;
      ssTot += Math.pow(pt.y - meanY, 2);
      sumAbsErr += Math.abs(res);
      return { x: pt.x, y: pt.y, pred, residual: res, id: pt.id };
    });

    const mse = ssRes / n;
    const rmse = Math.sqrt(mse);
    const mae = sumAbsErr / n;
    const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - (ssRes / ssTot));

    // Generate trendline endpoints for chart
    const xVals = points.map(p => p.x).sort((a, b) => a - b);
    const minX = xVals[0];
    const maxX = xVals[xVals.length - 1];

    return {
      type: 'linear',
      featureX,
      targetY,
      slope: +slope.toFixed(4),
      intercept: +intercept.toFixed(4),
      equation: `y = ${slope.toFixed(3)}x + ${intercept.toFixed(3)}`,
      r2: +r2.toFixed(4),
      mse: +mse.toFixed(3),
      rmse: +rmse.toFixed(3),
      mae: +mae.toFixed(3),
      points,
      trendline: [
        { x: minX, y: +(slope * minX + intercept).toFixed(2) },
        { x: maxX, y: +(slope * maxX + intercept).toFixed(2) }
      ],
      predict: (xVal) => +(slope * xVal + intercept).toFixed(2)
    };
  },

  /**
   * Polynomial Regression (Degree 2: y = ax^2 + bx + c)
   */
  trainPolynomialRegression(data, featureX, targetY) {
    const points = [];
    data.forEach((r, idx) => {
      const x = parseFloat(r[featureX]);
      const y = parseFloat(r[targetY]);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y, id: r.Student_ID || r.Customer_ID || r.Property_ID || `Row-${idx + 1}` });
      }
    });

    const n = points.length;
    if (n < 3) return null;

    let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    let t0 = 0, t1 = 0, t2 = 0;

    for (let i = 0; i < n; i++) {
      const x = points[i].x;
      const y = points[i].y;
      const x2 = x * x;
      s1 += x;
      s2 += x2;
      s3 += x2 * x;
      s4 += x2 * x2;
      t0 += y;
      t1 += x * y;
      t2 += x2 * y;
    }

    // Solve 3x3 linear system using Gaussian Elimination:
    // [s4  s3  s2 | t2]
    // [s3  s2  s1 | t1]
    // [s2  s1  s0 | t0]
    const A = [
      [s4, s3, s2, t2],
      [s3, s2, s1, t1],
      [s2, s1, s0, t0]
    ];

    for (let i = 0; i < 3; i++) {
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < 3; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }
      for (let k = i; k < 4; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      for (let k = i + 1; k < 3; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < 4; j++) {
          if (i === j) A[k][j] = 0;
          else A[k][j] += c * A[i][j];
        }
      }
    }

    const sol = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      sol[i] = A[i][3] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        A[k][3] -= A[k][i] * sol[i];
      }
    }

    const a = sol[0];
    const b = sol[1];
    const c = sol[2];

    const meanY = t0 / n;
    let ssTot = 0, ssRes = 0;
    points.forEach(pt => {
      const pred = a * pt.x * pt.x + b * pt.x + c;
      const res = pt.y - pred;
      ssRes += res * res;
      ssTot += Math.pow(pt.y - meanY, 2);
    });

    const mse = ssRes / n;
    const rmse = Math.sqrt(mse);
    const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - (ssRes / ssTot));

    const xVals = points.map(p => p.x).sort((a, b) => a - b);
    const minX = xVals[0];
    const maxX = xVals[xVals.length - 1];
    const steps = 30;
    const curvePoints = [];
    for (let s = 0; s <= steps; s++) {
      const curX = minX + (s / steps) * (maxX - minX);
      curvePoints.push({ x: +curX.toFixed(2), y: +(a * curX * curX + b * curX + c).toFixed(2) });
    }

    return {
      type: 'polynomial',
      featureX,
      targetY,
      a: +a.toFixed(5),
      b: +b.toFixed(4),
      c: +c.toFixed(3),
      equation: `y = ${a.toFixed(4)}x² + ${b.toFixed(3)}x + ${c.toFixed(2)}`,
      r2: +r2.toFixed(4),
      mse: +mse.toFixed(3),
      rmse: +rmse.toFixed(3),
      points,
      trendline: curvePoints,
      predict: (xVal) => +(a * xVal * xVal + b * xVal + c).toFixed(2)
    };
  },

  /**
   * K-Means Clustering on 2 Features with Min-Max normalization
   */
  trainKMeans(data, featX, featY, k = 3, maxIter = 40) {
    const rawPoints = [];
    data.forEach((r, idx) => {
      const x = parseFloat(r[featX]);
      const y = parseFloat(r[featY]);
      if (!isNaN(x) && !isNaN(y)) {
        rawPoints.push({ x, y, id: r.Student_ID || r.Customer_ID || r.Property_ID || `Pt-${idx + 1}`, original: r });
      }
    });

    if (rawPoints.length < k) return null;

    // Normalization bounds
    const minX = Math.min(...rawPoints.map(p => p.x));
    const maxX = Math.max(...rawPoints.map(p => p.x));
    const minY = Math.min(...rawPoints.map(p => p.y));
    const maxY = Math.max(...rawPoints.map(p => p.y));

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    const normPoints = rawPoints.map(p => ({
      normX: (p.x - minX) / spanX,
      normY: (p.y - minY) / spanY,
      raw: p,
      cluster: 0
    }));

    // K-Means++ style initialization
    const centroids = [];
    // 1st centroid random
    const firstIdx = Math.floor(Math.random() * normPoints.length);
    centroids.push({ normX: normPoints[firstIdx].normX, normY: normPoints[firstIdx].normY });

    for (let c = 1; c < k; c++) {
      let maxDist = -1;
      let bestPt = normPoints[0];
      normPoints.forEach(p => {
        let minDistToCentroid = Infinity;
        centroids.forEach(cent => {
          const d = Math.pow(p.normX - cent.normX, 2) + Math.pow(p.normY - cent.normY, 2);
          if (d < minDistToCentroid) minDistToCentroid = d;
        });
        if (minDistToCentroid > maxDist) {
          maxDist = minDistToCentroid;
          bestPt = p;
        }
      });
      centroids.push({ normX: bestPt.normX, normY: bestPt.normY });
    }

    // Iterative Assignment and Update
    let iter = 0;
    let converged = false;

    while (iter < maxIter && !converged) {
      iter++;
      // Assign
      normPoints.forEach(p => {
        let minDist = Infinity;
        let chosenCluster = 0;
        centroids.forEach((cent, cIdx) => {
          const dist = Math.pow(p.normX - cent.normX, 2) + Math.pow(p.normY - cent.normY, 2);
          if (dist < minDist) {
            minDist = dist;
            chosenCluster = cIdx;
          }
        });
        p.cluster = chosenCluster;
      });

      // Update centroids
      let maxShift = 0;
      for (let c = 0; c < k; c++) {
        const clusterPts = normPoints.filter(p => p.cluster === c);
        if (clusterPts.length > 0) {
          const meanX = clusterPts.reduce((acc, p) => acc + p.normX, 0) / clusterPts.length;
          const meanY = clusterPts.reduce((acc, p) => acc + p.normY, 0) / clusterPts.length;
          const shift = Math.sqrt(Math.pow(centroids[c].normX - meanX, 2) + Math.pow(centroids[c].normY - meanY, 2));
          if (shift > maxShift) maxShift = shift;
          centroids[c].normX = meanX;
          centroids[c].normY = meanY;
        }
      }

      if (maxShift < 0.0001) converged = true;
    }

    // Compute Inertia (WCSS) & denormalize centroids
    let wcss = 0;
    const finalCentroids = centroids.map((cent, cIdx) => {
      const denormX = +(cent.normX * spanX + minX).toFixed(2);
      const denormY = +(cent.normY * spanY + minY).toFixed(2);
      const clusterMembers = normPoints.filter(p => p.cluster === cIdx);
      clusterMembers.forEach(p => {
        wcss += Math.pow(p.raw.x - denormX, 2) + Math.pow(p.raw.y - denormY, 2);
      });
      return {
        clusterId: cIdx,
        x: denormX,
        y: denormY,
        count: clusterMembers.length,
        percentage: +((clusterMembers.length / normPoints.length) * 100).toFixed(1)
      };
    });

    const clusterColors = [
      '#06b6d4', // Cyan
      '#8b5cf6', // Purple
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ec4899', // Pink
      '#3b82f6'  // Blue
    ];

    const labeledPoints = normPoints.map(p => ({
      x: p.raw.x,
      y: p.raw.y,
      id: p.raw.id,
      cluster: p.cluster,
      color: clusterColors[p.cluster % clusterColors.length]
    }));

    return {
      k,
      featX,
      featY,
      iterations: iter,
      wcss: +wcss.toFixed(1),
      centroids: finalCentroids,
      points: labeledPoints,
      clusterColors
    };
  },

  /**
   * Outlier & Anomaly Detection (IQR and Z-Score methods)
   */
  detectAnomalies(data, feature, method = 'iqr', sensitivity = 1.5) {
    const rawPoints = [];
    data.forEach((r, idx) => {
      const val = parseFloat(r[feature]);
      if (!isNaN(val)) {
        rawPoints.push({
          value: val,
          rowIdx: idx,
          id: r.Student_ID || r.Customer_ID || r.Property_ID || r.Timestamp_Seq || `Record #${idx + 1}`,
          fullRow: r
        });
      }
    });

    if (!rawPoints.length) return null;

    const values = rawPoints.map(p => p.value);
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    let lowerBound, upperBound, mean = 0, stdDev = 0;
    const anomalies = [];

    if (method === 'iqr') {
      const q1 = EDA.percentile(sorted, 0.25);
      const q3 = EDA.percentile(sorted, 0.75);
      const iqr = q3 - q1;
      lowerBound = q1 - (sensitivity * iqr);
      upperBound = q3 + (sensitivity * iqr);

      rawPoints.forEach(p => {
        const isAnomaly = p.value < lowerBound || p.value > upperBound;
        const score = p.value < lowerBound ? (lowerBound - p.value) / (iqr || 1) : (p.value - upperBound) / (iqr || 1);
        if (isAnomaly) {
          anomalies.push({
            ...p,
            score: +score.toFixed(2),
            reason: p.value < lowerBound ? `Below Lower Threshold (${lowerBound.toFixed(2)})` : `Above Upper Threshold (${upperBound.toFixed(2)})`
          });
        }
      });
    } else {
      // Z-Score method
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      mean = sum / n;
      const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1 || 1);
      stdDev = Math.sqrt(variance);

      const zThresh = sensitivity; // e.g. 2.5 or 3.0
      lowerBound = mean - (zThresh * stdDev);
      upperBound = mean + (zThresh * stdDev);

      rawPoints.forEach(p => {
        const zScore = stdDev > 0 ? (p.value - mean) / stdDev : 0;
        const isAnomaly = Math.abs(zScore) > zThresh;
        if (isAnomaly) {
          anomalies.push({
            ...p,
            score: +Math.abs(zScore).toFixed(2),
            reason: `Z-Score = ${zScore.toFixed(2)} (|Z| > ${zThresh})`
          });
        }
      });
    }

    return {
      feature,
      method,
      totalScanned: rawPoints.length,
      anomalyCount: anomalies.length,
      anomalyRatePct: +((anomalies.length / rawPoints.length) * 100).toFixed(1),
      lowerBound: +lowerBound.toFixed(2),
      upperBound: +upperBound.toFixed(2),
      anomalies: anomalies.sort((a, b) => b.score - a.score),
      allPoints: rawPoints.map(p => ({
        ...p,
        isAnomaly: p.value < lowerBound || p.value > upperBound
      }))
    };
  },

  /**
   * Trend Forecasting using Exponential Smoothing with Linear Trend (Holt's Linear)
   */
  forecastTrend(data, feature, horizon = 8, alpha = 0.4, beta = 0.2) {
    const series = [];
    data.forEach(r => {
      const val = parseFloat(r[feature]);
      if (!isNaN(val)) series.push(val);
    });

    if (series.length < 5) return null;

    let level = series[0];
    let trend = series[1] - series[0];
    const smoothed = [level];

    for (let t = 1; t < series.length; t++) {
      const lastLevel = level;
      level = alpha * series[t] + (1 - alpha) * (level + trend);
      trend = beta * (level - lastLevel) + (1 - beta) * trend;
      smoothed.push(+(level).toFixed(2));
    }

    // Project future values
    const forecasts = [];
    for (let h = 1; h <= horizon; h++) {
      const forecastVal = level + (h * trend);
      forecasts.push({
        step: `Forecast +${h}`,
        value: +forecastVal.toFixed(2)
      });
    }

    return {
      feature,
      historical: series,
      smoothed,
      forecasts,
      growthRatePct: +((trend / (level || 1)) * 100).toFixed(2)
    };
  }
};
