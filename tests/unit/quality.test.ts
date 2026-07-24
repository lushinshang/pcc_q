import { assertParseQuality } from "../../scripts/lib/quality";
import type { ParseTenderResult } from "../../scripts/lib/tenderParser";

const tender = {
  id: "A",
  name: "測試標案",
  method: "公開招標",
  org: "國防部",
  budget: 1,
  announcedDate: "2026-07-24",
  deadlineDate: "2026-08-01",
  link: "https://web.pcc.gov.tw/prkms/a",
};

function result(
  scannedRows: number,
  tenderCount: number,
  rejectedCount: number,
): ParseTenderResult {
  return {
    scannedRows,
    tenders: Array.from({ length: tenderCount }, (_, index) => ({
      ...tender,
      id: `A-${String(index)}`,
      link: `https://web.pcc.gov.tw/prkms/${String(index)}`,
    })),
    rejectedRows: Array.from({ length: rejectedCount }, (_, index) => ({
      row: index + 1,
      reason: "invalid",
    })),
  };
}

describe("PIPE-T parser publication quality", () => {
  it("PIPE-T-001 accepts valid rows at the rejection boundary", () => {
    expect(() => {
      assertParseQuality(result(5, 4, 1));
    }).not.toThrow();
  });

  it("PIPE-T-002 rejects zero scanned or zero valid rows", () => {
    expect(() => {
      assertParseQuality(result(0, 0, 0));
    }).toThrow(/零筆/);
    expect(() => {
      assertParseQuality(result(1, 0, 1));
    }).toThrow(/零筆/);
  });

  it("PIPE-T-003 rejects excessive rejection ratios and invalid thresholds", () => {
    expect(() => {
      assertParseQuality(result(4, 3, 1));
    }).toThrow(/拒絕比例過高/);
    expect(() => {
      assertParseQuality(result(1, 1, 0), -1);
    }).toThrow(/拒絕比例過高/);
  });
});
