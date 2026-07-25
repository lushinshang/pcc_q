import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoLargeSameDayDrop,
  loadPreviousPagesDataset,
  mergeTenders,
  pruneOlderThanRollingWindow,
} from "./lib/baseline";
import { createTenderDataset } from "./lib/dataset";
import { fetchAllPccPages, fetchBootstrapPages } from "./lib/pccPagination";
import { assertParseQuality } from "./lib/quality";
import {
  MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP,
  parseTenderPages,
  type ParseTenderResult,
} from "./lib/tenderParser";
import type { Tender, TenderDataset } from "../src/contracts/tender";

const OUTPUT_DIRECTORY = path.resolve("public/data");

export interface RoutineFetchDependencies {
  fetchAllPccPages: () => Promise<string[]>;
  parseTenderPages: (
    htmlPages: readonly string[],
    maxTotalScannedRows?: number,
  ) => ParseTenderResult;
}

const DEFAULT_ROUTINE_FETCH_DEPENDENCIES: RoutineFetchDependencies = {
  fetchAllPccPages,
  parseTenderPages,
};

export async function fetchRoutine(
  dependencies: RoutineFetchDependencies = DEFAULT_ROUTINE_FETCH_DEPENDENCIES,
): Promise<ParseTenderResult> {
  return dependencies.parseTenderPages(await dependencies.fetchAllPccPages());
}

// 沒有可用的前一版資料（真的第一次部署，或前一版是不相容的舊 schema）時，
// 用日期區間查詢一次回填過去 30 天，而不是像例行查詢一樣只抓當日；
// 見 docs/specs/001-pages-migration/adr-first-run-backfill.md 的實測依據。
// 回填本身失敗（分頁異常、安全上限）時不讓整個 workflow 卡住，退回例行查詢，
// 缺口留給後續每日執行自然補齊。
export interface BootstrapFetchDependencies {
  fetchBootstrapPages: () => Promise<string[]>;
  parseTenderPages: (
    htmlPages: readonly string[],
    maxTotalScannedRows?: number,
  ) => ParseTenderResult;
  fetchRoutine: () => Promise<ParseTenderResult>;
  warn: (message: string) => void;
}

const DEFAULT_BOOTSTRAP_FETCH_DEPENDENCIES: BootstrapFetchDependencies = {
  fetchBootstrapPages,
  parseTenderPages,
  fetchRoutine,
  warn: console.warn,
};

export async function fetchBootstrapOrFallback(
  dependencies: BootstrapFetchDependencies = DEFAULT_BOOTSTRAP_FETCH_DEPENDENCIES,
): Promise<ParseTenderResult> {
  try {
    return dependencies.parseTenderPages(
      await dependencies.fetchBootstrapPages(),
      MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP,
    );
  } catch (error) {
    dependencies.warn(
      `首次 30 天回填失敗（${error instanceof Error ? error.message : "未知錯誤"}），改抓當日資料`,
    );
    return dependencies.fetchRoutine();
  }
}

export async function writeDatasetAtomically(
  dataset: TenderDataset,
  outputDirectory = OUTPUT_DIRECTORY,
): Promise<void> {
  const outputPath = path.join(outputDirectory, "tenders.json");
  const tempPath = path.join(outputDirectory, ".tenders.json.tmp");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(dataset, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });
  await rename(tempPath, outputPath);
}

export interface FetchPipelineDependencies {
  loadPreviousPagesDataset: (
    repository: string | undefined,
  ) => Promise<TenderDataset | null>;
  fetchBootstrapOrFallback: () => Promise<ParseTenderResult>;
  fetchRoutine: () => Promise<ParseTenderResult>;
  assertParseQuality: (parsed: ParseTenderResult) => void;
  createTenderDataset: (tenders: readonly Tender[]) => TenderDataset;
  assertNoLargeSameDayDrop: (
    current: TenderDataset,
    previous: TenderDataset | null,
  ) => void;
  pruneOlderThanRollingWindow: (tenders: readonly Tender[]) => Tender[];
  mergeTenders: (
    previous: readonly Tender[],
    incoming: readonly Tender[],
  ) => Tender[];
  writeDataset: (dataset: TenderDataset) => Promise<void>;
}

const DEFAULT_PIPELINE_DEPENDENCIES: FetchPipelineDependencies = {
  loadPreviousPagesDataset,
  fetchBootstrapOrFallback,
  fetchRoutine,
  assertParseQuality,
  createTenderDataset,
  assertNoLargeSameDayDrop,
  pruneOlderThanRollingWindow,
  mergeTenders,
  writeDataset: writeDatasetAtomically,
};

export interface RunFetchPipelineOptions {
  repository?: string;
  dependencies?: FetchPipelineDependencies;
}

export async function runFetchPipeline(
  options: RunFetchPipelineOptions = {},
): Promise<TenderDataset> {
  const dependencies = options.dependencies ?? DEFAULT_PIPELINE_DEPENDENCIES;
  const previousDataset = await dependencies.loadPreviousPagesDataset(
    options.repository,
  );
  // 「沒有前一版」與「前一版存在但累積 0 筆」效果上相同：都沒有可用的滾動視窗基礎，
  // 都該觸發回填。實際發生過：schema 版本切換那次剛好遇到零筆的日子，
  // 產生了一份有效但是空的前一版，導致回填條件永遠不成立、功能形同沒上線。
  const isBootstrap =
    previousDataset === null || previousDataset.tenders.length === 0;

  const parsed = isBootstrap
    ? await dependencies.fetchBootstrapOrFallback()
    : await dependencies.fetchRoutine();
  dependencies.assertParseQuality(parsed);

  // 「本次新增」資料集：只用於同日驟降異常檢查，不是最終輸出；
  // 首次回填時這裡實際涵蓋 30 天，不只是當日。
  const freshDataset = dependencies.createTenderDataset(parsed.tenders);
  dependencies.assertNoLargeSameDayDrop(freshDataset, previousDataset);

  // 最終輸出：把本次新增的（已過白名單）資料併入前一版累積的 30 天滾動視窗。
  const retainedPrevious = dependencies.pruneOlderThanRollingWindow(
    previousDataset?.tenders ?? [],
  );
  const dataset = dependencies.createTenderDataset(
    dependencies.mergeTenders(retainedPrevious, parsed.tenders),
  );

  await dependencies.writeDataset(dataset);
  return dataset;
}

export async function runCli(): Promise<number> {
  try {
    const dataset = await runFetchPipeline({
      repository: process.env.GITHUB_REPOSITORY,
    });
    // Pipeline 回傳已驗證且已原子寫入的資料集；只有成功時才回傳 exit code 0。
    // 本次新增筆數在累積模式下不是必要 metadata，因此 CLI 僅報告最終可信筆數。
    console.info(
      `已產生累積 ${String(dataset.recordCount)} 筆資料；schema=${dataset.schemaVersion} sha256=${dataset.sha256}`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "資料擷取失敗");
    return 1;
  }
}

export function isCliEntrypoint(
  scriptPath = process.argv[1],
  moduleUrl = import.meta.url,
): boolean {
  return (
    scriptPath !== undefined && moduleUrl === pathToFileURL(scriptPath).href
  );
}

if (isCliEntrypoint()) {
  void runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
