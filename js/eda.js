/**
 * Antigravity – AI Data Analysis Platform (js/eda.js)
 * High-performance statistical profiling, correlation discovery, and data hygiene.
 */

const EDA = {
  /**
   * Introspects column types and attributes from tabular array of objects
   */
  analyzeSchema(data) {
    if (!data || !data.length) return {};
    const sample = data[0];
    const columns = Object.keys(sample);
    const schema = {};

    columns.forEach(col => {
      let numCount = 0;
      let nonNullCount = 0;
      let dateCount = 0;
      const uniqueVals = new Set();

      data.forEach(row => {
        const val = row[col];
        if (val !== null && val !== undefined && val !== '') {
          nonNullCount++;
          uniqueVals.add(val);
          if (typeof val === 'number' || (!isNaN(val) && !isNaN(parseFloat(val)))) {
            numCount++;
          } else if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed.length > 5 && (trimmed.includes('-') || trimmed.includes('/')) && !isNaN(Date.parse(trimmed))) {
              dateCount++;
            }
          }
        }
      });

      const isNumeric = nonNullCount > 0 && (numCount / nonNullCount) > 0.75;
      const isDate = nonNullCount > 0 && (dateCount / nonNullCount) > 0.75;
      const colLower = col.toLowerCase();
      const isId = (colLower.includes('id') || colLower.includes('code') || colLower.includes('key')) && (uniqueVals.size === nonNullCount);

      let colType = 'categorical';
      if (isId) colType = 'id';
      else if (isNumeric) colType = 'numeric';
      else if (isDate) colType = 'datetime';

      schema[col] = {
        name: col,
        type: colType,
        nullCount: data.length - nonNullCount,
        uniqueCount: uniqueVals.size,
        completenessPct: data.length > 0 ? +((nonNullCount / data.length) * 100).toFixed(1) : 100.0
      };
    });

    return schema;
  },

  /**
   * Computes all 13 comprehensive descriptive statistics for numerical columns
   */
  computeNumericalStats(data, column) {
    const rawValues = data
      .map(r => parseFloat(r[column]))
      .filter(v => !isNaN(v) && v !== null);

    if (!rawValues.length) return null;

    const n = rawValues.length;
    const sorted = [...rawValues].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const mean = sum / n;

    // Median
    let median;
    const mid = Math.floor(n / 2);
    if (n % 2 === 0) {
      median = (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      median = sorted[mid];
    }

    // Min & Max
    const min = sorted[0];
    const max = sorted[n - 1];
    const range = max - min;

    // Percentiles (Q1 = 25th, Q3 = 75th)
    const q1 = this.percentile(sorted, 0.25);
    const q3 = this.percentile(sorted, 0.75);
    const iqr = q3 - q1;

    // Outlier bounds (Tukey's IQR method)
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outliers = sorted.filter(v => v < lowerBound || v > upperBound);

    // Variance & Standard Deviation (Sample)
    const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n > 1 ? n - 1 : 1);
    const stdDev = Math.sqrt(variance);

    // Skewness
    let skewness = 0;
    if (stdDev > 0 && n > 2) {
      const m3 = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 3), 0) / n;
      skewness = m3 / Math.pow(stdDev, 3);
    }

    // Kurtosis (Fisher-Pearson excess kurtosis)
    let kurtosis = 0;
    if (stdDev > 0 && n > 3) {
      const m4 = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 4), 0) / n;
      kurtosis = (m4 / Math.pow(variance, 2)) - 3.0;
    }

    // Mode
    const freq = {};
    let maxFreq = 0;
    let modeVal = sorted[0];
    sorted.forEach(v => {
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > maxFreq) {
        maxFreq = freq[v];
        modeVal = v;
      }
    });

    return {
      count: n,
      mean: +mean.toFixed(2),
      median: +median.toFixed(2),
      mode: +modeVal.toFixed(2),
      min: +min.toFixed(2),
      max: +max.toFixed(2),
      range: +range.toFixed(2),
      q1: +q1.toFixed(2),
      q3: +q3.toFixed(2),
      iqr: +iqr.toFixed(2),
      lowerBound: +lowerBound.toFixed(2),
      upperBound: +upperBound.toFixed(2),
      outlierCount: outliers.length,
      outlierPct: +((outliers.length / n) * 100).toFixed(1),
      variance: +variance.toFixed(2),
      stdDev: +stdDev.toFixed(2),
      skewness: +skewness.toFixed(3),
      kurtosis: +kurtosis.toFixed(3)
    };
  },

  percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const index = (sortedArr.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sortedArr[lower];
    return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
  },

  /**
   * Computes categorical frequencies and identifies rare categories
   */
  computeCategoricalStats(data, column) {
    const counts = {};
    let total = 0;

    data.forEach(row => {
      const val = row[column] !== undefined && row[column] !== null ? String(row[column]).trim() : '(Missing)';
      if (val) {
        counts[val] = (counts[val] || 0) + 1;
        total++;
      }
    });

    const entries = Object.keys(counts).map(key => ({
      category: key,
      count: counts[key],
      percentage: total > 0 ? +((counts[key] / total) * 100).toFixed(1) : 0
    })).sort((a, b) => b.count - a.count);

    const rareCategories = entries.filter(e => e.percentage <= 5.0 && e.count > 0);

    return {
      unique: entries.length,
      top: entries[0]?.category || 'N/A',
      topFreq: entries[0]?.count || 0,
      distribution: entries,
      rareCategories: rareCategories
    };
  },

  /**
   * Computes Pearson Correlation Coefficient between two numerical columns
   */
  computePearson(data, colX, colY) {
    const pairs = [];
    data.forEach(r => {
      const x = parseFloat(r[colX]);
      const y = parseFloat(r[colY]);
      if (!isNaN(x) && !isNaN(y)) {
        pairs.push([x, y]);
      }
    });

    const n = pairs.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const x = pairs[i][0];
      const y = pairs[i][1];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    const r = numerator / denominator;
    return +Math.max(-1, Math.min(1, r)).toFixed(3);
  },

  /**
   * Computes Spearman Rank Correlation Coefficient
   */
  computeSpearman(data, colX, colY) {
    const pairs = [];
    data.forEach(r => {
      const x = parseFloat(r[colX]);
      const y = parseFloat(r[colY]);
      if (!isNaN(x) && !isNaN(y)) {
        pairs.push({ x, y });
      }
    });

    const n = pairs.length;
    if (n < 2) return 0;

    // Rank X
    const sortedX = [...pairs].sort((a, b) => a.x - b.x);
    sortedX.forEach((item, idx) => item.rx = idx + 1);

    // Rank Y
    const sortedY = [...pairs].sort((a, b) => a.y - b.y);
    sortedY.forEach((item, idx) => item.ry = idx + 1);

    // Pearson on ranks
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const rx = pairs[i].rx;
      const ry = pairs[i].ry;
      sumX += rx;
      sumY += ry;
      sumXY += rx * ry;
      sumX2 += rx * rx;
      sumY2 += ry * ry;
    }

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0) return 0;
    return +Math.max(-1, Math.min(1, numerator / denominator)).toFixed(3);
  },

  /**
   * Computes Full Correlation Matrix (Pearson or Spearman)
   */
  computeCorrelationMatrix(data, numericColumns, method = 'pearson') {
    const matrix = {};
    numericColumns.forEach(col1 => {
      matrix[col1] = {};
      numericColumns.forEach(col2 => {
        if (col1 === col2) {
          matrix[col1][col2] = 1.0;
        } else if (matrix[col2] && matrix[col2][col1] !== undefined) {
          matrix[col1][col2] = matrix[col2][col1];
        } else {
          const val = method === 'spearman'
            ? this.computeSpearman(data, col1, col2)
            : this.computePearson(data, col1, col2);
          matrix[col1][col2] = val;
        }
      });
    });
    return matrix;
  },

  /**
   * Client-side Data Cleaning engine
   */
  cleanData(data, action, column, params = {}) {
    if (!data || !data.length) return data;
    let cleaned = JSON.parse(JSON.stringify(data));

    if (action === 'drop-duplicates') {
      const keep = params.keep || 'first';
      const seen = new Set();
      if (keep === 'first') {
        cleaned = cleaned.filter(row => {
          const key = JSON.stringify(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        // keep last
        for (let i = cleaned.length - 1; i >= 0; i--) {
          const key = JSON.stringify(cleaned[i]);
          if (seen.has(key)) {
            cleaned.splice(i, 1);
          } else {
            seen.add(key);
          }
        }
      }
      return cleaned;
    }

    if (action === 'drop-nulls') {
      if (column && column !== 'all') {
        return cleaned.filter(row => row[column] !== null && row[column] !== undefined && row[column] !== '');
      }
      return cleaned.filter(row => Object.values(row).every(v => v !== null && v !== undefined && v !== ''));
    }

    if (action === 'fill-mean' && column) {
      const stats = this.computeNumericalStats(cleaned, column);
      if (!stats) return cleaned;
      cleaned.forEach(row => {
        const val = parseFloat(row[column]);
        if (isNaN(val) || row[column] === null || row[column] === '') {
          row[column] = stats.mean;
        }
      });
      return cleaned;
    }

    if (action === 'fill-median' && column) {
      const stats = this.computeNumericalStats(cleaned, column);
      if (!stats) return cleaned;
      cleaned.forEach(row => {
        const val = parseFloat(row[column]);
        if (isNaN(val) || row[column] === null || row[column] === '') {
          row[column] = stats.median;
        }
      });
      return cleaned;
    }

    if (action === 'fill-mode' && column) {
      const catStats = this.computeCategoricalStats(cleaned, column);
      const modeVal = catStats.top;
      cleaned.forEach(row => {
        if (row[column] === null || row[column] === undefined || row[column] === '') {
          row[column] = modeVal;
        }
      });
      return cleaned;
    }

    if (action === 'fill-constant' && column) {
      const fillVal = params.value !== undefined ? params.value : '';
      cleaned.forEach(row => {
        if (row[column] === null || row[column] === undefined || row[column] === '') {
          row[column] = fillVal;
        }
      });
      return cleaned;
    }

    if (action === 'ffill' && column) {
      let lastVal = null;
      cleaned.forEach(row => {
        if (row[column] !== null && row[column] !== undefined && row[column] !== '') {
          lastVal = row[column];
        } else if (lastVal !== null) {
          row[column] = lastVal;
        }
      });
      return cleaned;
    }

    if (action === 'bfill' && column) {
      let nextVal = null;
      for (let i = cleaned.length - 1; i >= 0; i--) {
        const row = cleaned[i];
        if (row[column] !== null && row[column] !== undefined && row[column] !== '') {
          nextVal = row[column];
        } else if (nextVal !== null) {
          row[column] = nextVal;
        }
      }
      return cleaned;
    }

    if (action === 'remove-outliers' && column) {
      const stats = this.computeNumericalStats(cleaned, column);
      if (!stats) return cleaned;
      return cleaned.filter(row => {
        const v = parseFloat(row[column]);
        if (isNaN(v)) return true;
        return v >= stats.lowerBound && v <= stats.upperBound;
      });
    }

    if (action === 'cap-outliers' && column) {
      const stats = this.computeNumericalStats(cleaned, column);
      if (!stats) return cleaned;
      cleaned.forEach(row => {
        const v = parseFloat(row[column]);
        if (!isNaN(v)) {
          if (v < stats.lowerBound) row[column] = stats.lowerBound;
          else if (v > stats.upperBound) row[column] = stats.upperBound;
        }
      });
      return cleaned;
    }

    if (action === 'rename-column' && column && params.new_name) {
      cleaned.forEach(row => {
        row[params.new_name] = row[column];
        delete row[column];
      });
      return cleaned;
    }

    if (action === 'delete-column' && column) {
      cleaned.forEach(row => delete row[column]);
      return cleaned;
    }

    if (action === 'add-column' && params.name) {
      const newCol = params.name;
      const formula = (params.formula || '').trim();
      cleaned.forEach(row => {
        if (!formula) {
          row[newCol] = null;
        } else if (!isNaN(parseFloat(formula))) {
          row[newCol] = parseFloat(formula);
        } else {
          // simple single-col or two-col math
          try {
            let expr = formula;
            Object.keys(row).forEach(k => {
              if (expr.includes(k) && typeof row[k] === 'number') {
                expr = expr.split(k).join(row[k]);
              }
            });
            row[newCol] = eval(expr);
          } catch (e) {
            row[newCol] = formula;
          }
        }
      });
      return cleaned;
    }

    if (action === 'convert-type' && column && params.target_type) {
      cleaned.forEach(row => {
        const v = row[column];
        if (params.target_type === 'numeric') {
          const num = parseFloat(v);
          row[column] = isNaN(num) ? null : num;
        } else if (params.target_type === 'string') {
          row[column] = v !== null && v !== undefined ? String(v) : '';
        } else if (params.target_type === 'datetime') {
          const d = Date.parse(v);
          row[column] = isNaN(d) ? null : new Date(d).toISOString().split('T')[0];
        }
      });
      return cleaned;
    }

    if (action === 'edit-cell' && params.row_index !== undefined && params.col_name !== undefined) {
      const idx = params.row_index;
      if (cleaned[idx]) {
        cleaned[idx][params.col_name] = params.new_value;
      }
      return cleaned;
    }

    return cleaned;
  }
};
