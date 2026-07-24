export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export interface DatasetFreshness {
  ageMs: number;
  isStale: boolean;
}

export function getDatasetFreshness(
  fetchedAt: string,
  nowMs = Date.now(),
): DatasetFreshness {
  const fetchedAtMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) throw new Error("無效擷取時間");
  const ageMs = Math.max(0, nowMs - fetchedAtMs);
  return { ageMs, isStale: ageMs > STALE_AFTER_MS };
}
