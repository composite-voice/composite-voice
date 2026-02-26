/**
 * Statistical summary computation — Section 6 of METHODOLOGY.md
 *
 * Computes mean, median, percentiles, std dev, CV, and outlier detection
 * from raw measurement arrays. Outliers use the 3x IQR method and are
 * never silently removed.
 */

import type { MetricSummary, OutlierInfo } from '../types/schema.js';

/**
 * Sort a numeric array in ascending order (non-mutating).
 */
function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Compute a percentile value from a sorted array using linear interpolation.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/**
 * Compute arithmetic mean.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute standard deviation (population).
 */
function stdDev(values: number[], meanValue: number): number {
  if (values.length === 0) return 0;
  const squaredDiffs = values.map((v) => (v - meanValue) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Detect outliers using the 3x IQR method.
 *
 * An outlier is any value outside [P25 - 3*IQR, P75 + 3*IQR].
 * Returns the indices and values of outlier points in the ORIGINAL
 * (unsorted) array.
 */
function detectOutliers(values: number[], sortedValues: number[]): OutlierInfo {
  if (values.length < 4) {
    return { count: 0, method: '3x IQR', indices: [], values: [] };
  }

  const q25 = percentile(sortedValues, 25);
  const q75 = percentile(sortedValues, 75);
  const iqr = q75 - q25;
  const lowerBound = q25 - 3 * iqr;
  const upperBound = q75 + 3 * iqr;

  const outlierIndices: number[] = [];
  const outlierValues: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (values[i] < lowerBound || values[i] > upperBound) {
      outlierIndices.push(i);
      outlierValues.push(values[i]);
    }
  }

  return {
    count: outlierIndices.length,
    method: '3x IQR',
    indices: outlierIndices,
    values: outlierValues,
  };
}

/**
 * Compute a full MetricSummary from raw values.
 *
 * All values are included in statistics — outliers are flagged but
 * never removed (Section 6.2 of METHODOLOGY.md).
 */
export function computeSummary(values: number[], unit: string): MetricSummary {
  if (values.length === 0) {
    return {
      unit,
      mean: 0,
      median: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      cv: 0,
      sampleSize: 0,
      outliers: { count: 0, method: '3x IQR', indices: [], values: [] },
    };
  }

  const s = sorted(values);
  const m = mean(values);
  const sd = stdDev(values, m);

  return {
    unit,
    mean: round(m),
    median: round(percentile(s, 50)),
    p90: round(percentile(s, 90)),
    p95: round(percentile(s, 95)),
    p99: round(percentile(s, 99)),
    min: round(s[0]),
    max: round(s[s.length - 1]),
    stdDev: round(sd),
    cv: m !== 0 ? round(sd / m) : 0,
    sampleSize: values.length,
    outliers: detectOutliers(values, s),
  };
}

/**
 * Round to 3 decimal places to keep JSON sizes reasonable.
 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
