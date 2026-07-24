import {
  assertNoLargeSameDayDrop,
  buildPreviousPagesDataUrl,
  loadPreviousPagesDataset,
} from "../../scripts/lib/baseline";
import { createTenderDataset } from "../../scripts/lib/dataset";

const tender = {
  id: "A",
  name: "測試標案",
  method: "公開招標",
  budget: 1,
  announcedDate: "2026-07-24",
  deadlineDate: "2026-08-01",
  link: "https://web.pcc.gov.tw/prkms/a",
};

describe("REQ-D-003/004 previous deployment baseline", () => {
  it("BASE-T-001 derives only the standard GitHub Pages URL from a repository slug", () => {
    expect(buildPreviousPagesDataUrl("Owner/project").toString()).toBe(
      "https://owner.github.io/project/data/tenders.json",
    );
    expect(buildPreviousPagesDataUrl("owner/owner.github.io").toString()).toBe(
      "https://owner.github.io/data/tenders.json",
    );
    expect(() => buildPreviousPagesDataUrl("https://evil.example/x")).toThrow();
    expect(() => buildPreviousPagesDataUrl("owner/../evil")).toThrow();
  });

  it("BASE-T-002 blocks a greater-than-50-percent same-day drop from a meaningful baseline", () => {
    const previous = createTenderDataset(
      Array.from({ length: 6 }, (_, index) => ({
        ...tender,
        id: `P-${String(index)}`,
        link: `https://web.pcc.gov.tw/prkms/${String(index)}`,
      })),
      "2026-07-24T10:00:00+08:00",
    );
    const current = createTenderDataset(
      [tender, { ...tender, id: "B", link: "https://web.pcc.gov.tw/prkms/b" }],
      "2026-07-24T11:00:00+08:00",
    );
    expect(() => {
      assertNoLargeSameDayDrop(current, previous);
    }).toThrow(/大幅下降/);
  });

  it("BASE-T-003 does not compare a prior day, a small baseline, or an unavailable baseline", () => {
    const current = createTenderDataset([tender], "2026-07-25T08:17:00+08:00");
    const previousDay = createTenderDataset(
      Array.from({ length: 8 }, (_, index) => ({
        ...tender,
        id: `D-${String(index)}`,
        link: `https://web.pcc.gov.tw/prkms/d${String(index)}`,
      })),
      "2026-07-24T20:17:00+08:00",
    );
    const small = createTenderDataset(
      [tender, { ...tender, id: "B", link: "https://web.pcc.gov.tw/prkms/b" }],
      "2026-07-25T08:00:00+08:00",
    );
    expect(() => {
      assertNoLargeSameDayDrop(current, previousDay);
    }).not.toThrow();
    expect(() => {
      assertNoLargeSameDayDrop(current, small);
    }).not.toThrow();
    expect(() => {
      assertNoLargeSameDayDrop(current, null);
    }).not.toThrow();
  });

  it("BASE-T-004 validates the previous JSON contract and hash", async () => {
    const dataset = createTenderDataset([tender], "2026-07-24T10:00:00+08:00");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(dataset), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      loadPreviousPagesDataset("owner/project", fetchImpl),
    ).resolves.toEqual(dataset);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://owner.github.io/project/data/tenders.json"),
      expect.objectContaining({ redirect: "manual", credentials: "omit" }),
    );
  });

  it("BASE-T-005 handles first deployment and rejects invalid prior responses", async () => {
    await expect(loadPreviousPagesDataset(undefined)).resolves.toBeNull();
    for (const status of [302, 404]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      await expect(
        loadPreviousPagesDataset("owner/project", fetchImpl),
      ).resolves.toBeNull();
    }

    const errorFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("error", { status: 503 }));
    await expect(
      loadPreviousPagesDataset("owner/project", errorFetch),
    ).rejects.toThrow(/HTTP 503/);

    const htmlFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>", { headers: { "content-type": "text/html" } }),
      );
    await expect(
      loadPreviousPagesDataset("owner/project", htmlFetch),
    ).rejects.toThrow(/不是 JSON/);
  });

  it("BASE-T-006 rejects declared, streamed, and integrity-invalid baselines", async () => {
    const declaredLarge = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024 + 1),
        },
      }),
    );
    await expect(
      loadPreviousPagesDataset("owner/project", declaredLarge),
    ).rejects.toThrow(/大小上限/);

    const streamedLarge = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("x".repeat(2 * 1024 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      loadPreviousPagesDataset("owner/project", streamedLarge),
    ).rejects.toThrow(/大小上限/);

    const dataset = createTenderDataset([tender], "2026-07-24T10:00:00+08:00");
    const invalidHash = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...dataset, sha256: "0".repeat(64) }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      loadPreviousPagesDataset("owner/project", invalidHash),
    ).rejects.toThrow(/SHA-256/);
  });
});
