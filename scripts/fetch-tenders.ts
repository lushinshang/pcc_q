import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

const OUTPUT_DIRECTORY = path.resolve("public/data");
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "tenders.json");
const TEMP_PATH = path.join(OUTPUT_DIRECTORY, ".tenders.json.tmp");

async function fetchRoutine(): Promise<ParseTenderResult> {
  return parseTenderPages(await fetchAllPccPages());
}

// 沒有可用的前一版資料（真的第一次部署，或前一版是不相容的舊 schema）時，
// 用日期區間查詢一次回填過去 30 天，而不是像例行查詢一樣只抓當日；
// 見 docs/specs/001-pages-migration/adr-first-run-backfill.md 的實測依據。
// 回填本身失敗（分頁異常、安全上限）時不讓整個 workflow 卡住，退回例行查詢，
// 缺口留給後續每日執行自然補齊。
async function fetchBootstrapOrFallback(): Promise<ParseTenderResult> {
  try {
    return parseTenderPages(
      await fetchBootstrapPages(),
      MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP,
    );
  } catch (error) {
    console.warn(
      `首次 30 天回填失敗（${error instanceof Error ? error.message : "未知錯誤"}），改抓當日資料`,
    );
    return fetchRoutine();
  }
}

async function main(): Promise<void> {
  const previousDataset = await loadPreviousPagesDataset(
    process.env.GITHUB_REPOSITORY,
  );
  // 「沒有前一版」與「前一版存在但累積 0 筆」效果上相同：都沒有可用的滾動視窗基礎，
  // 都該觸發回填。實際發生過：schema 版本切換那次剛好遇到零筆的日子，
  // 產生了一份有效但是空的前一版，導致回填條件永遠不成立、功能形同沒上線。
  const isBootstrap =
    previousDataset === null || previousDataset.tenders.length === 0;

  const parsed = isBootstrap
    ? await fetchBootstrapOrFallback()
    : await fetchRoutine();
  assertParseQuality(parsed);

  // 「本次新增」資料集：只用於同日驟降異常檢查，不是最終輸出；
  // 首次回填時這裡實際涵蓋 30 天，不只是當日。
  const freshDataset = createTenderDataset(parsed.tenders);
  assertNoLargeSameDayDrop(freshDataset, previousDataset);

  // 最終輸出：把本次新增的（已過白名單）資料併入前一版累積的 30 天滾動視窗。
  const retainedPrevious = pruneOlderThanRollingWindow(
    previousDataset?.tenders ?? [],
  );
  const dataset = createTenderDataset(
    mergeTenders(retainedPrevious, parsed.tenders),
  );

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(TEMP_PATH, `${JSON.stringify(dataset, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });
  await rename(TEMP_PATH, OUTPUT_PATH);

  console.info(
    `已產生累積 ${String(dataset.recordCount)} 筆資料（本次新增 ${String(parsed.tenders.length)} 筆）；schema=${dataset.schemaVersion} sha256=${dataset.sha256}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "資料擷取失敗");
  process.exitCode = 1;
});
