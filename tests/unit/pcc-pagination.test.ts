import {
  extractNextPageUrl,
  fetchAllPccPages,
  MAX_PCC_PAGES,
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

  it("PAG-T-005 stops at MAX_PCC_PAGES even if every page claims to have a next page", async () => {
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

    const pages = await fetchAllPccPages({ fetchImpl });
    expect(pages).toHaveLength(MAX_PCC_PAGES);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PCC_PAGES);
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
});
