import {
  canonicalizeTenders,
  convertRocDate,
  parseBudget,
  parseTenderDataset,
  sanitizeText,
  validatePccUrl,
} from "../../src/contracts/tender";

describe("REQ-D-001/002/005 data contract", () => {
  it("CONTRACT-T-001 converts ROC dates without relying on Date guessing", () => {
    expect(convertRocDate("115/07/24")).toBe("2026-07-24");
    expect(() => convertRocDate("115/02/30")).toThrow(/日期/);
    expect(() => convertRocDate("2026-07-24")).toThrow(/民國年/);
  });

  it("CONTRACT-T-002 parses only finite non-negative safe integer budgets", () => {
    expect(parseBudget("21,389,616")).toBe(21_389_616);
    expect(() => parseBudget("-1")).toThrow(/預算/);
    expect(() => parseBudget("Infinity")).toThrow(/預算/);
    expect(() => parseBudget("9007199254740992")).toThrow(/安全整數/);
  });

  it("CONTRACT-T-003 rejects control characters and markup in untrusted text", () => {
    expect(sanitizeText("  公開招標  ", "method")).toBe("公開招標");
    expect(() => sanitizeText("<script>alert(1)</script>", "name")).toThrow(
      /不安全/,
    );
    expect(() => sanitizeText(`安全\u0000文字`, "name")).toThrow(/控制字元/);
    expect(() => sanitizeText(`安全\u000b文字`, "name")).toThrow(/控制字元/);
    expect(() => sanitizeText(`安全\u007f文字`, "name")).toThrow(/控制字元/);
    expect(() => sanitizeText(`安全\u202e文字`, "name")).toThrow(/控制字元/);
    expect(() => sanitizeText(" ", "id")).toThrow(/不得為空/);
    expect(() => sanitizeText("x".repeat(501), "name")).toThrow(/長度上限/);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "http://web.pcc.gov.tw/prkms/test",
    "https://evil.example/prkms/test",
    "https://user:pass@web.pcc.gov.tw/prkms/test",
    "https://web.pcc.gov.tw:444/prkms/test",
  ])("CONTRACT-T-004 rejects disallowed tender URL: %s", (url) => {
    expect(() => validatePccUrl(url)).toThrow();
  });

  it("CONTRACT-T-005 accepts only the expected PCC HTTPS URL", () => {
    expect(validatePccUrl("https://web.pcc.gov.tw/prkms/test#fragment")).toBe(
      "https://web.pcc.gov.tw/prkms/test",
    );
  });

  it("CONTRACT-T-006 canonicalizes tenders deterministically", () => {
    const first = {
      id: "B",
      name: "B案",
      method: "公開招標",
      org: "國防部",
      budget: 2,
      announcedDate: "2026-07-24",
      deadlineDate: "2026-08-02",
      link: "https://web.pcc.gov.tw/prkms/b",
    };
    const second = {
      ...first,
      id: "A",
      name: "A案",
      link: "https://web.pcc.gov.tw/prkms/a",
    };
    expect(canonicalizeTenders([first, second])).toBe(
      canonicalizeTenders([second, first]),
    );
  });

  it("CONTRACT-T-007 rejects a dataset with a mismatched count or hash", () => {
    expect(() =>
      parseTenderDataset({
        schemaVersion: "1.1.0",
        source: "https://web.pcc.gov.tw/",
        queryMode: "isNow",
        fetchedAt: "2026-07-24T08:17:00+08:00",
        recordCount: 1,
        sha256: "0".repeat(64),
        tenders: [],
      }),
    ).toThrow();
  });

  it("CONTRACT-T-008 rejects malformed metadata and duplicate tenders", () => {
    const tender = {
      id: "A",
      name: "A案",
      method: "公開招標",
      org: "國防部",
      budget: 1,
      announcedDate: "2026-07-24",
      deadlineDate: "2026-08-01",
      link: "https://web.pcc.gov.tw/prkms/a",
    };
    const base = {
      schemaVersion: "1.1.0",
      source: "https://web.pcc.gov.tw/",
      queryMode: "isNow",
      fetchedAt: "2026-07-24T08:17:00+08:00",
      recordCount: 2,
      sha256: "0".repeat(64),
      tenders: [tender, tender],
    };
    expect(() => parseTenderDataset(base)).toThrow(/重複/);
    expect(() =>
      parseTenderDataset({ ...base, fetchedAt: "2026-07-24 08:17:00" }),
    ).toThrow();
    expect(() =>
      parseTenderDataset({ ...base, schemaVersion: "2.0.0" }),
    ).toThrow();
    expect(() =>
      parseTenderDataset({
        ...base,
        recordCount: 1,
        tenders: [{ ...tender, name: "<img onerror=alert(1)>" }],
      }),
    ).toThrow(/不安全標記/);
  });
});
