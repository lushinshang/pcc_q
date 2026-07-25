import {
  buildBootstrapQueryUrl,
  extractNextPageUrl,
  fetchAllPccPages,
  fetchBootstrapPages,
  formatGregorianTaipei,
  MAX_PCC_PAGES,
  MAX_PCC_PAGES_BOOTSTRAP,
} from "../../scripts/lib/pccPagination";
import { buildPccQueryUrl } from "../../scripts/lib/secureFetch";

function pageHtml(hasNext: boolean): string {
  const nextAnchor = hasNext
    ? `<a href="?d-49738-p=2&pageSize=100">下一頁</a>`
    : `下一頁`;
  return `<!doctype html><html><body><table><tr class="tb_b_1"><td>1</td><td>國防部</td></tr></table><span id="pagelinks">【${nextAnchor}/最後一頁】</span></body></html>`;
}

describe("REQ-D-004 PCC pagination", () => {
  it("PAG-T-001 extracts the next page URL and keeps it on the fixed PCC query path", () => {
    const currentUrl = buildPccQueryUrl();
    const nextUrl = extractNextPageUrl(pageHtml(true), currentUrl);
    expect(nextUrl?.origin).toBe("https://web.pcc.gov.tw");
    expect(nextUrl?.pathname).toBe(
      "/prkms/tender/common/advanced/readTenderAdvanced",
    );
    expect(nextUrl?.searchParams.get("d-49738-p")).toBe("2");
  });

  it("PAG-T-002 returns null when the last page has no anchor for 下一頁", () => {
    const currentUrl = buildPccQueryUrl();
    expect(extractNextPageUrl(pageHtml(false), currentUrl)).toBeNull();
  });

  it("PAG-T-003 rejects a next-page link that escapes the fixed PCC query path", () => {
    const currentUrl = buildPccQueryUrl();
    const html = `<span id="pagelinks">【<a href="https://evil.example/steal">下一頁</a>/最後一頁】</span>`;
    expect(() => extractNextPageUrl(html, currentUrl)).toThrow(
      /分頁連結不在允許的 PCC 查詢路徑範圍/,
    );
  });

  it("PAG-T-004 follows pagination until the last page and stops", async () => {
    let call = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      call += 1;
      const hasNext = call < 3;
      return Promise.resolve(
        new Response(pageHtml(hasNext), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    });

    const pages = await fetchAllPccPages({ fetchImpl });
    expect(pages).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("PAG-T-005 fails closed when the final allowed page still has a next-page link", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolve(
            new Response(pageHtml(true), {
              headers: { "content-type": "text/html; charset=utf-8" },
            }),
          );
        }),
    );

    await expect(fetchAllPccPages({ fetchImpl }, 2)).rejects.toThrow(
      /分頁數超過安全上限，可能資料不完整/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("PAG-T-006 forwards the merged cookie across sequential page requests", async () => {
    let call = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      call += 1;
      const hasNext = call < 2;
      return Promise.resolve(
        new Response(pageHtml(hasNext), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "set-cookie": "JSESSIONID=abc; Path=/prkms; HttpOnly",
          },
        }),
      );
    });

    await fetchAllPccPages({ fetchImpl });
    const secondCallHeaders = new Headers(
      fetchImpl.mock.calls[1]?.[1]?.headers,
    );
    expect(secondCallHeaders.get("Cookie")).toBe("JSESSIONID=abc");
  });

  it("PAG-T-007 succeeds when maxPages exactly equals the real page count", async () => {
    let call = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      call += 1;
      return Promise.resolve(
        new Response(pageHtml(call < 3), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    });

    const pages = await fetchAllPccPages({ fetchImpl }, 3);
    expect(pages).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("ADR-002 first-run backfill date range", () => {
  it("PAG-T-008 formats an epoch millisecond value as an Asia/Taipei Gregorian date with slashes", () => {
    const nowMs = new Date("2026-07-25T04:00:00Z").getTime(); // 2026-07-25 12:00 Asia/Taipei
    expect(formatGregorianTaipei(nowMs)).toBe("2026/07/25");
  });

  it("PAG-T-009 handles a year boundary correctly", () => {
    const nowMs = new Date("2026-01-01T00:30:00Z").getTime(); // 2026-01-01 08:30 Asia/Taipei
    expect(formatGregorianTaipei(nowMs)).toBe("2026/01/01");
  });

  it("PAG-T-010 builds a date-range query URL using Gregorian dates, isDate, and firstSearch=true", () => {
    const nowMs = new Date("2026-07-25T04:00:00Z").getTime();
    const url = buildBootstrapQueryUrl(nowMs, 30);

    expect(url.searchParams.get("dateType")).toBe("isDate");
    expect(url.searchParams.get("firstSearch")).toBe("true");
    expect(url.searchParams.get("tenderStartDate")).toBe("2026/06/25");
    expect(url.searchParams.get("tenderEndDate")).toBe("2026/07/25");
    // 機關與分頁設定沿用例行查詢的預設值，不因為回填模式而改變。
    expect(url.searchParams.get("orgId")).toBe("");
    expect(url.searchParams.get("pageSize")).toBe("100");
  });

  it("PAG-T-011 fails closed at the bootstrap page-count safety limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolve(
            new Response(pageHtml(true), {
              headers: { "content-type": "text/html; charset=utf-8" },
            }),
          );
        }),
    );

    await expect(fetchBootstrapPages({ fetchImpl })).rejects.toThrow(
      /分頁數超過安全上限，可能資料不完整/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PCC_PAGES_BOOTSTRAP);
    expect(MAX_PCC_PAGES_BOOTSTRAP).toBeGreaterThan(MAX_PCC_PAGES);
  });
});

describe("REQ-D-010 per-page retry resilience", () => {
  // 2026-07-25 對真實 PCC 網站實測：231 頁的序列請求偶爾在單頁逾時或連線失敗
  // （不同次測試分別發生在第 1 頁、第 16 頁，非固定門檻），需要重試而不是整批放棄。
  afterEach(() => {
    vi.useRealTimers();
  });

  it("PAG-T-012 retries a failing page fetch and succeeds once a retry works", async () => {
    vi.useFakeTimers();
    let call = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      call += 1;
      if (call < 3) return Promise.reject(new TypeError("fetch failed"));
      return Promise.resolve(
        new Response(pageHtml(false), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    });

    const promise = fetchAllPccPages({ fetchImpl });
    await vi.runAllTimersAsync();
    const pages = await promise;

    expect(pages).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("PAG-T-013 exhausts retries and rethrows the last error when every attempt fails", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed"));

    const promise = fetchAllPccPages({ fetchImpl });
    const assertion = expect(promise).rejects.toThrow(/fetch failed/);
    await vi.runAllTimersAsync();
    await assertion;

    // 1 次初始嘗試 + 3 次重試。
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
