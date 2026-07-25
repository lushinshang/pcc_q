export const DATE_RANGE_FILTERS = ["TODAY", "WEEK", "MONTH"] as const;
export type DateRangeFilter = (typeof DATE_RANGE_FILTERS)[number];

export const DEFAULT_DATE_RANGE_FILTER: DateRangeFilter = "WEEK";

export const DATE_RANGE_LABELS: Record<DateRangeFilter, string> = {
  TODAY: "當日",
  WEEK: "一週",
  MONTH: "一個月",
};

const DATE_RANGE_LOOKBACK_DAYS: Record<DateRangeFilter, number> = {
  TODAY: 0,
  WEEK: 7,
  MONTH: 30,
};

export function taipeiDate(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

export function matchesDateRange(
  announcedDate: string,
  range: DateRangeFilter,
  nowMs = Date.now(),
): boolean {
  const today = taipeiDate(nowMs);
  if (range === "TODAY") return announcedDate === today;

  const lookbackMs = DATE_RANGE_LOOKBACK_DAYS[range] * 24 * 60 * 60 * 1000;
  const cutoff = taipeiDate(nowMs - lookbackMs);
  return announcedDate >= cutoff;
}
