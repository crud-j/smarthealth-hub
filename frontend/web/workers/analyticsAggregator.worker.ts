/**
 * analyticsAggregator.worker.ts — Browser Web Worker
 *
 * Reshapes raw API JSON (visit rows, immunization records) into chart-ready
 * series (grouped by week/month, coverage percentages) off the main thread
 * so the analytics dashboard never jank when a BHW changes date-range filters
 * over large datasets.
 *
 * Consumed via useWebWorker<AnalyticsAggregatorApi> in useAnalytics.ts and
 * chart components (VaccinationCoverageChart, IllnessTrendChart).
 */
import * as Comlink from "comlink";

export interface TimeSeriesPoint {
  label: string;
  value: number;
}

const analyticsAggregatorApi = {
  /**
   * Groups a flat array of dated records by ISO week label (YYYY-Www).
   * Returns an array of { label, value } points sorted chronologically.
   */
  groupByWeek(records: { date: string }[]): TimeSeriesPoint[] {
    const counts: Record<string, number> = {};
    for (const r of records) {
      const d = new Date(r.date);
      const year = d.getUTCFullYear();
      const startOfYear = new Date(Date.UTC(year, 0, 1));
      const week = Math.ceil(
        ((d.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getUTCDay() + 1) / 7
      );
      const key = `${year}-W${String(week).padStart(2, "0")}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
  },

  /**
   * Computes vaccination coverage percentage per vaccine name.
   * `total` is the denominator (eligible patient count for that vaccine).
   */
  coverageByVaccine(
    records: { vaccineName: string; status: string }[],
    total: number
  ): TimeSeriesPoint[] {
    const completed: Record<string, number> = {};
    for (const r of records) {
      if (r.status === "completed") {
        completed[r.vaccineName] = (completed[r.vaccineName] ?? 0) + 1;
      }
    }
    return Object.entries(completed).map(([label, count]) => ({
      label,
      value: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  },
};

export type AnalyticsAggregatorApi = typeof analyticsAggregatorApi;
Comlink.expose(analyticsAggregatorApi);
