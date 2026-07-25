import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  fetchBootstrapOrFallback,
  fetchRoutine,
  isCliEntrypoint,
  runFetchPipeline,
  writeDatasetAtomically,
  type FetchPipelineDependencies,
} from "../../scripts/fetch-tenders";
import {
  mergeTenders,
  pruneOlderThanRollingWindow,
} from "../../scripts/lib/baseline";
import {
  createTenderDataset,
  sha256ForTenders,
} from "../../scripts/lib/dataset";
import { assertParseQuality } from "../../scripts/lib/quality";
import type { ParseTenderResult } from "../../scripts/lib/tenderParser";
import type { Tender, TenderDataset } from "../../src/contracts/tender";

const tender: Tender = {
  id: "BOOT-001",
  name: "首次回填測試標案",
  method: "公開招標",
  org: "國防部",
  budget: 123_456,
  announcedDate: "2026-07-25",
  deadlineDate: "2026-08-01",
  link: "https://web.pcc.gov.tw/prkms/bootstrap",
};

function parsed(tenders: Tender[] = [tender]): ParseTenderResult {
  return { tenders, scannedRows: tenders.length, rejectedRows: [] };
}

function pipelineDependencies(
  overrides: Partial<FetchPipelineDependencies> = {},
): FetchPipelineDependencies {
  return {
    loadPreviousPagesDataset: vi.fn().mockResolvedValue(null),
    fetchBootstrapOrFallback: vi.fn().mockResolvedValue(parsed()),
    fetchRoutine: vi.fn().mockResolvedValue(parsed()),
    assertParseQuality,
    createTenderDataset,
    assertNoLargeSameDayDrop: vi.fn(),
    pruneOlderThanRollingWindow,
    mergeTenders,
    writeDataset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("RT-002 bootstrap pipeline orchestration", () => {
  it("FETCH-T-000 adapts routine page fetching into a parsed result", async () => {
    const parsePages = vi.fn().mockReturnValue(parsed());
    const result = await fetchRoutine({
      fetchAllPccPages: vi.fn().mockResolvedValue(["<html></html>"]),
      parseTenderPages: parsePages,
    });

    expect(result).toEqual(parsed());
    expect(parsePages).toHaveBeenCalledWith(["<html></html>"]);
  });

  it("FETCH-T-001 uses bootstrap when no previous dataset exists", async () => {
    const fetchBootstrap = vi.fn().mockResolvedValue(parsed());
    const fetchRoutine = vi.fn().mockResolvedValue(parsed());
    const dependencies = pipelineDependencies({
      loadPreviousPagesDataset: vi.fn().mockResolvedValue(null),
      fetchBootstrapOrFallback: fetchBootstrap,
      fetchRoutine,
    });

    await runFetchPipeline({ repository: "owner/project", dependencies });

    expect(fetchBootstrap).toHaveBeenCalledOnce();
    expect(fetchRoutine).not.toHaveBeenCalled();
  });

  it("FETCH-T-002 uses bootstrap when the previous dataset is valid but empty", async () => {
    const emptyPrevious = createTenderDataset([], "2026-07-25T00:00:00+08:00");
    const fetchBootstrap = vi.fn().mockResolvedValue(parsed());
    const fetchRoutine = vi.fn().mockResolvedValue(parsed());
    const dependencies = pipelineDependencies({
      loadPreviousPagesDataset: vi.fn().mockResolvedValue(emptyPrevious),
      fetchBootstrapOrFallback: fetchBootstrap,
      fetchRoutine,
    });

    await runFetchPipeline({ repository: "owner/project", dependencies });

    expect(fetchBootstrap).toHaveBeenCalledOnce();
    expect(fetchRoutine).not.toHaveBeenCalled();
  });

  it("FETCH-T-003 falls back to the routine fetch when bootstrap fails", async () => {
    const fetchRoutine = vi.fn().mockResolvedValue(parsed());
    const warn = vi.fn();

    const result = await fetchBootstrapOrFallback({
      fetchBootstrapPages: vi.fn().mockRejectedValue(new Error("page limit")),
      parseTenderPages: vi.fn(),
      fetchRoutine,
      warn,
    });

    expect(result).toEqual(parsed());
    expect(fetchRoutine).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/改抓當日資料/));
  });

  it("FETCH-T-004 does not write a dataset when bootstrap and routine fetches both fail", async () => {
    const writeDataset = vi.fn().mockResolvedValue(undefined);
    const bootstrapAndFallback = () =>
      fetchBootstrapOrFallback({
        fetchBootstrapPages: vi
          .fn()
          .mockRejectedValue(new Error("bootstrap failed")),
        parseTenderPages: vi.fn(),
        fetchRoutine: vi
          .fn()
          .mockRejectedValue(new Error("routine also failed")),
        warn: vi.fn(),
      });
    const dependencies = pipelineDependencies({
      loadPreviousPagesDataset: vi.fn().mockResolvedValue(null),
      fetchBootstrapOrFallback: bootstrapAndFallback,
      writeDataset,
    });

    await expect(
      runFetchPipeline({ repository: "owner/project", dependencies }),
    ).rejects.toThrow("routine also failed");
    expect(writeDataset).not.toHaveBeenCalled();
  });

  it("FETCH-T-005 writes a complete validated dataset after a successful bootstrap", async () => {
    const previousTender: Tender = {
      ...tender,
      id: "PREVIOUS-001",
      link: "https://web.pcc.gov.tw/prkms/previous",
    };
    const previousDataset = createTenderDataset(
      [previousTender],
      "2026-07-24T12:00:00+08:00",
    );
    const writeDataset = vi
      .fn<(dataset: TenderDataset) => Promise<void>>()
      .mockResolvedValue(undefined);
    const dependencies = pipelineDependencies({
      // An empty previous dataset is what selects bootstrap. The merge assertion
      // is covered by making the injected prune step retain one prior record.
      loadPreviousPagesDataset: vi
        .fn()
        .mockResolvedValue(
          createTenderDataset([], "2026-07-25T00:00:00+08:00"),
        ),
      fetchBootstrapOrFallback: vi.fn().mockResolvedValue(parsed()),
      pruneOlderThanRollingWindow: vi
        .fn()
        .mockReturnValue(previousDataset.tenders),
      writeDataset,
    });

    const dataset = await runFetchPipeline({
      repository: "owner/project",
      dependencies,
    });

    expect(dataset.schemaVersion).toBe("1.1.0");
    expect(dataset.recordCount).toBe(2);
    expect(dataset.tenders.map(({ id }) => id).sort()).toEqual([
      "BOOT-001",
      "PREVIOUS-001",
    ]);
    expect(dataset.sha256).toBe(sha256ForTenders(dataset.tenders));
    expect(writeDataset).toHaveBeenCalledWith(dataset);
  });

  it("FETCH-T-006 atomically writes the validated dataset to an injectable directory", async () => {
    const outputDirectory = await mkdtemp(
      path.join(os.tmpdir(), "fetch-tenders-test-"),
    );
    const dataset = createTenderDataset([tender], "2026-07-25T12:00:00+08:00");

    try {
      await writeDatasetAtomically(dataset, outputDirectory);
      expect(
        JSON.parse(
          await readFile(path.join(outputDirectory, "tenders.json"), "utf8"),
        ),
      ).toEqual(dataset);
      await expect(
        stat(path.join(outputDirectory, ".tenders.json.tmp")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("FETCH-T-007 identifies the CLI entrypoint without running it on import", () => {
    const scriptPath = "/tmp/fetch-tenders.ts";
    expect(isCliEntrypoint(undefined, pathToFileURL(scriptPath).href)).toBe(
      false,
    );
    expect(isCliEntrypoint(scriptPath, pathToFileURL(scriptPath).href)).toBe(
      true,
    );
  });
});
