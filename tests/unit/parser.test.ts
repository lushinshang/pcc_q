import { readFile } from "node:fs/promises";

import {
  MAX_TOTAL_SCANNED_ROWS,
  parseTenderHtml,
  parseTenderPages,
} from "../../scripts/lib/tenderParser";

describe("REQ-D-004 PCC parser fixtures", () => {
  function row(tenderCell: string, extraCells = 6, org = "國防部"): string {
    return `<table><tr class="tb_b_1"><td>x</td><td>${org}</td><td>${tenderCell}</td>${"<td>x</td>".repeat(Math.max(0, extraCells - 5))}<td>公開招標</td><td>x</td><td>115/07/24</td><td>115/08/07</td><td>1,000</td></tr></table>`;
  }

  it("PAR-T-001 extracts validated tenders from the stable fixture", async () => {
    const html = await readFile("tests/fixtures/pcc-normal.html", "utf8");
    const result = parseTenderHtml(html);

    expect(result.scannedRows).toBe(2);
    expect(result.rejectedRows).toEqual([]);
    expect(result.tenders).toHaveLength(2);
    expect(result.tenders[0]).toMatchObject({
      id: "115HJ08530081300520",
      name: "內湖院區醫療大樓整修工程",
      budget: 21_389_616,
      announcedDate: "2026-07-24",
      deadlineDate: "2026-08-07",
      link: "https://web.pcc.gov.tw/prkms/urlSelector/common/tpam?pk=ONE",
    });
  });

  it("PAR-T-002 records and rejects a malicious row instead of publishing it", async () => {
    const html = await readFile("tests/fixtures/pcc-malicious.html", "utf8");
    const result = parseTenderHtml(html);

    expect(result.scannedRows).toBe(1);
    expect(result.tenders).toEqual([]);
    expect(result.rejectedRows).toHaveLength(1);
  });

  it("PAR-T-003 fails closed for zero data and changed row selectors", async () => {
    for (const fixture of [
      "tests/fixtures/pcc-zero.html",
      "tests/fixtures/pcc-field-drift.html",
    ]) {
      const html = await readFile(fixture, "utf8");
      expect(() => parseTenderHtml(html)).toThrow(/找不到標案資料列/);
    }
  });

  it("PAR-T-003b accepts PCC's real confirmed-zero-result marker without throwing", async () => {
    const html = await readFile(
      "tests/fixtures/pcc-confirmed-zero.html",
      "utf8",
    );
    const result = parseTenderHtml(html);
    expect(result).toEqual({ tenders: [], scannedRows: 0, rejectedRows: [] });
  });

  it("PAR-T-004 supports the known script-name fallback while still sanitizing output", () => {
    const result = parseTenderHtml(
      row(
        'CASE-002 <a href="/prkms/script"><script>pageCode2Img("腳本提供案名")</script></a>',
      ),
    );
    expect(result.tenders[0]).toMatchObject({
      id: "CASE-002",
      name: "腳本提供案名",
    });
  });

  it("PAR-T-005 supports visible-link fallback and an id without a direct text node", () => {
    const result = parseTenderHtml(
      row('<a href="/prkms/fallback">可見文字案名</a>'),
    );
    expect(result.tenders[0]).toMatchObject({
      id: "可見文字案名",
      name: "可見文字案名",
    });
  });

  it("PAR-T-006 rejects missing columns and missing links as structure drift", async () => {
    const missingColumns = parseTenderHtml(
      await readFile("tests/fixtures/pcc-missing-field.html", "utf8"),
    );
    expect(missingColumns.tenders).toEqual([]);
    expect(missingColumns.rejectedRows[0]?.reason).toMatch(/欄位數不足/);

    const missingLink = parseTenderHtml(row("CASE-003 plain text"));
    expect(missingLink.tenders).toEqual([]);
    expect(missingLink.rejectedRows[0]?.reason).toMatch(/缺少標案連結/);
  });

  it("PAR-T-007 rejects decoded markup entities and discards event attributes", () => {
    const entity = parseTenderHtml(
      row(
        'ENTITY-1 <a href="/prkms/entity" title="檢視 標案名稱: &lt;script&gt;">檢視</a>',
      ),
    );
    expect(entity.tenders).toEqual([]);
    expect(entity.rejectedRows[0]?.reason).toMatch(/不安全標記/);

    const eventAttribute = parseTenderHtml(
      row(
        'EVENT-1 <a href="/prkms/event" onclick="alert(1)" title="檢視 標案名稱: 安全案名">檢視</a>',
      ),
    );
    expect(eventAttribute.tenders[0]?.name).toBe("安全案名");
    expect(JSON.stringify(eventAttribute.tenders)).not.toContain("onclick");
  });

  it("PAR-T-008 accepts at most 100 rows and rejects oversized row sets", () => {
    const makeRows = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        row(
          `LIMIT-${String(index)} <a href="/prkms/limit-${String(index)}" title="檢視 標案名稱: 上限測試 ${String(index)}">檢視</a>`,
        ),
      ).join("");

    expect(parseTenderHtml(makeRows(100)).tenders).toHaveLength(100);
    expect(() => parseTenderHtml(makeRows(101))).toThrow(/100 筆上限/);
  });

  it("PAR-T-009 silently excludes tenders whose org is outside the whitelist without counting them as rejected", () => {
    const inWhitelist = row(
      'IN-001 <a href="/prkms/in" title="檢視 標案名稱: 白名單內">檢視</a>',
      6,
      "國防部",
    );
    const outsideWhitelist = row(
      'OUT-001 <a href="/prkms/out" title="檢視 標案名稱: 白名單外">檢視</a>',
      6,
      "某某地方合作社",
    );
    const result = parseTenderHtml(`${inWhitelist}${outsideWhitelist}`);

    expect(result.scannedRows).toBe(2);
    expect(result.tenders).toHaveLength(1);
    expect(result.tenders[0]?.org).toBe("國防部");
    expect(result.rejectedRows).toEqual([]);
  });

  it("PAR-T-010 combines multiple pages and offsets rejected row numbers across pages", () => {
    const pageOne = row(
      'PAGE1-OK <a href="/prkms/p1" title="檢視 標案名稱: 第一頁">檢視</a>',
    );
    const pageTwoOk = row(
      'PAGE2-OK <a href="/prkms/p2" title="檢視 標案名稱: 第二頁">檢視</a>',
    );
    const pageTwoBad = row("PAGE2-BAD plain text");
    const result = parseTenderPages([pageOne, `${pageTwoOk}${pageTwoBad}`]);

    expect(result.scannedRows).toBe(3);
    expect(result.tenders).toHaveLength(2);
    expect(result.tenders.map((tender) => tender.id)).toEqual([
      "PAGE1-OK",
      "PAGE2-OK",
    ]);
    // page two's second row is scanned row #3 overall, not row #2 within its own page.
    expect(result.rejectedRows).toHaveLength(1);
    expect(result.rejectedRows[0]?.row).toBe(3);
    expect(result.rejectedRows[0]?.reason).toMatch(/缺少標案連結/);
  });

  it("PAR-T-011 fails closed when the combined multi-page row count exceeds the safety cap", () => {
    const makeFullPage = (prefix: string) =>
      Array.from({ length: 100 }, (_, index) =>
        row(
          `${prefix}-${String(index)} <a href="/prkms/${prefix}-${String(index)}" title="檢視 標案名稱: ${prefix} ${String(index)}">檢視</a>`,
        ),
      ).join("");

    const pageCount = Math.ceil(MAX_TOTAL_SCANNED_ROWS / 100) + 1;
    const pages = Array.from({ length: pageCount }, (_, index) =>
      makeFullPage(`P${String(index)}`),
    );

    expect(() => parseTenderPages(pages)).toThrow(/合計掃描列數超過/);
  });
});
