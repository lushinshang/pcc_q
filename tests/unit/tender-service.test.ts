import {
  loadTenderDataset,
  verifyTenderDatasetIntegrity,
} from "../../src/services/tenderService";

const emptyDataset = {
  schemaVersion: "1.1.0" as const,
  source: "https://web.pcc.gov.tw/" as const,
  queryMode: "isNow" as const,
  fetchedAt: "2026-07-24T08:17:00+08:00",
  recordCount: 0,
  sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  tenders: [],
};

describe("REQ-F-004 static data service", () => {
  it("SERVICE-T-001 loads only the Pages-safe same-origin JSON path", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(emptyDataset), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      loadTenderDataset({ fetchImpl, baseUrl: "/repo/" }),
    ).resolves.toMatchObject({
      recordCount: 0,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/repo/data/tenders.json",
      expect.objectContaining({ credentials: "omit", cache: "no-store" }),
    );
  });

  it("SERVICE-T-002 reports network errors without changing their type into trusted data", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    await expect(
      loadTenderDataset({ fetchImpl, baseUrl: "/" }),
    ).rejects.toThrow(/offline/);
  });

  it("SERVICE-T-003 rejects non-same-origin base paths", async () => {
    await expect(
      loadTenderDataset({ baseUrl: "https://evil.example/" }),
    ).rejects.toThrow(/同源/);
    await expect(
      loadTenderDataset({ baseUrl: "//evil.example/" }),
    ).rejects.toThrow(/同源/);
  });

  it("SERVICE-T-004 normalizes a base path without a trailing slash", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(emptyDataset), {
        headers: { "content-type": "application/json" },
      }),
    );
    await loadTenderDataset({ fetchImpl, baseUrl: "/project" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/project/data/tenders.json",
      expect.any(Object),
    );
  });

  it("SERVICE-T-005 rejects HTTP, content-type, and integrity failures", async () => {
    const httpFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("no", { status: 404 }));
    await expect(
      loadTenderDataset({ fetchImpl: httpFetch, baseUrl: "/" }),
    ).rejects.toThrow(/HTTP 404/);

    const htmlFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>", { headers: { "content-type": "text/html" } }),
      );
    await expect(
      loadTenderDataset({ fetchImpl: htmlFetch, baseUrl: "/" }),
    ).rejects.toThrow(/不是 JSON/);

    await expect(
      verifyTenderDatasetIntegrity({ ...emptyDataset, sha256: "0".repeat(64) }),
    ).rejects.toThrow(/SHA-256/);
  });
});
