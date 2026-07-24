import { matchesDateRange, taipeiDate } from "../../src/utils/dateRange";

const NOW = new Date("2026-07-25T04:00:00Z").getTime(); // 2026-07-25 12:00 Asia/Taipei

describe("REQ-F-008 date range filter", () => {
  it("DATE-T-001 TODAY only matches the current Taipei calendar date", () => {
    expect(matchesDateRange("2026-07-25", "TODAY", NOW)).toBe(true);
    expect(matchesDateRange("2026-07-24", "TODAY", NOW)).toBe(false);
    expect(matchesDateRange("2026-07-26", "TODAY", NOW)).toBe(false);
  });

  it("DATE-T-002 WEEK matches within the trailing 7 days inclusive of the cutoff", () => {
    expect(matchesDateRange("2026-07-25", "WEEK", NOW)).toBe(true);
    expect(matchesDateRange("2026-07-18", "WEEK", NOW)).toBe(true);
    expect(matchesDateRange("2026-07-17", "WEEK", NOW)).toBe(false);
  });

  it("DATE-T-003 MONTH matches within the trailing 30 days inclusive of the cutoff", () => {
    expect(matchesDateRange("2026-07-25", "MONTH", NOW)).toBe(true);
    expect(matchesDateRange("2026-06-25", "MONTH", NOW)).toBe(true);
    expect(matchesDateRange("2026-06-24", "MONTH", NOW)).toBe(false);
  });

  it("DATE-T-004 taipeiDate formats an epoch millisecond value as an Asia/Taipei calendar date", () => {
    expect(taipeiDate(NOW)).toBe("2026-07-25");
  });
});
