import { getDatasetFreshness, STALE_AFTER_MS } from "../../src/utils/freshness";

describe("REQ-F-003 dataset freshness", () => {
  const fetchedAt = "2026-07-24T08:00:00.000Z";
  const fetchedAtMs = Date.parse(fetchedAt);

  it("FRESH-T-001 is fresh through the two-hour boundary", () => {
    expect(
      getDatasetFreshness(fetchedAt, fetchedAtMs + STALE_AFTER_MS).isStale,
    ).toBe(false);
  });

  it("FRESH-T-002 is stale after two hours and clamps future timestamps to age zero", () => {
    expect(
      getDatasetFreshness(fetchedAt, fetchedAtMs + STALE_AFTER_MS + 1).isStale,
    ).toBe(true);
    expect(getDatasetFreshness(fetchedAt, fetchedAtMs - 1).ageMs).toBe(0);
  });

  it("FRESH-T-003 rejects an invalid timestamp", () => {
    expect(() => getDatasetFreshness("not-a-date")).toThrow(/擷取時間/);
  });
});
