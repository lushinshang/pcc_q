import {
  buildPccQueryUrl,
  fetchPccHtml,
  validateRedirectLocation,
} from "../../scripts/lib/secureFetch";

describe("REQ-S-001 fixed-origin fetch", () => {
  it("SEC-T-001 builds an isNow URL without accepting an arbitrary origin", () => {
    const url = buildPccQueryUrl();
    expect(url.origin).toBe("https://web.pcc.gov.tw");
    expect(url.pathname).toBe(
      "/prkms/tender/common/advanced/readTenderAdvanced",
    );
    expect(url.searchParams.get("dateType")).toBe("isNow");
    expect(url.search).not.toContain("isSpdt");
    expect(url.searchParams.get("orgId")).toBe("3.5");
  });

  it.each([
    "http://web.pcc.gov.tw/prkms/test",
    "https://localhost/internal",
    "https://127.0.0.1/internal",
    "https://evil.example/test",
    "https://web.pcc.gov.tw:444/test",
    "https://user:pass@web.pcc.gov.tw/prkms/test",
    "https://web.pcc.gov.tw/not-allowed",
  ])("SEC-T-002 rejects unsafe redirects: %s", (location) => {
    expect(() => validateRedirectLocation(location)).toThrow();
  });

  it("SEC-T-003 accepts only a PCC HTTPS redirect under the fixed path", () => {
    expect(validateRedirectLocation("/prkms/next").toString()).toBe(
      "https://web.pcc.gov.tw/prkms/next",
    );
  });

  it("SEC-T-004 returns a bounded HTML response with explicit non-cookie request options", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>ok</html>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": "15",
        },
      }),
    );

    await expect(fetchPccHtml({ fetchImpl: fakeFetch })).resolves.toBe(
      "<html>ok</html>",
    );
    const requestOptions = fakeFetch.mock.calls[0]?.[1];
    expect(requestOptions?.credentials).toBe("omit");
    expect(requestOptions?.redirect).toBe("manual");
    const requestHeaders = new Headers(requestOptions?.headers);
    expect(requestHeaders.get("User-Agent")).toContain("MOD-Tender-Dashboard");
    expect(requestHeaders.has("Cookie")).toBe(false);
  });

  it("SEC-T-005 rejects an oversized response", async () => {
    const body = new Uint8Array(1025);
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    await expect(
      fetchPccHtml({ fetchImpl: fakeFetch, maxBytes: 1024 }),
    ).rejects.toThrow(/大小上限/);
  });

  it("SEC-T-006 rejects a declared oversized response before reading its body", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("small", {
        headers: {
          "content-type": "text/html",
          "content-length": "2000",
        },
      }),
    );
    await expect(
      fetchPccHtml({ fetchImpl: fakeFetch, maxBytes: 1000 }),
    ).rejects.toThrow(/大小上限/);
  });

  it("SEC-T-007 rejects non-HTML content", async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("{}", { headers: { "content-type": "application/json" } }),
      );

    await expect(fetchPccHtml({ fetchImpl: fakeFetch })).rejects.toThrow(
      /Content-Type/,
    );
  });

  it("SEC-T-008 rejects HTTP errors and an empty body", async () => {
    const errorFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("error", { status: 503 }));
    await expect(fetchPccHtml({ fetchImpl: errorFetch })).rejects.toThrow(
      /HTTP 503/,
    );

    const noBodyFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(fetchPccHtml({ fetchImpl: noBodyFetch })).rejects.toThrow(
      /沒有內容/,
    );
  });

  it("SEC-T-009 rethrows network failures without logging response headers", async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("network down"));
    await expect(fetchPccHtml({ fetchImpl: fakeFetch })).rejects.toThrow(
      /network down/,
    );
  });

  it("SEC-T-010 aborts a request after the configured timeout", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    await expect(
      fetchPccHtml({ fetchImpl: fakeFetch, timeoutMs: 1 }),
    ).rejects.toThrow(/超過 1ms/);
  });

  it("SEC-T-011 does not automatically follow redirects", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://web.pcc.gov.tw/prkms/next" },
      }),
    );

    await expect(fetchPccHtml({ fetchImpl: fakeFetch })).rejects.toThrow(
      /重新導向/,
    );
    expect(fakeFetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
