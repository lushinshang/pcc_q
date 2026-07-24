import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertNoLargeSameDayDrop,
  loadPreviousPagesDataset,
  mergeTenders,
  pruneOlderThanRollingWindow,
} from "./lib/baseline";
import { createTenderDataset } from "./lib/dataset";
import { fetchAllPccPages } from "./lib/pccPagination";
import { assertParseQuality } from "./lib/quality";
import { parseTenderPages } from "./lib/tenderParser";

const OUTPUT_DIRECTORY = path.resolve("public/data");
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "tenders.json");
const TEMP_PATH = path.join(OUTPUT_DIRECTORY, ".tenders.json.tmp");
async function main(): Promise<void> {
  const htmlPages = await fetchAllPccPages();
  const parsed = parseTenderPages(htmlPages);
  assertParseQuality(parsed);

  // 「當日新增」資料集：只用於同日驟降異常檢查，不是最終輸出。
  const todayDataset = createTenderDataset(parsed.tenders);
  const previousDataset = await loadPreviousPagesDataset(
    process.env.GITHUB_REPOSITORY,
  );
  assertNoLargeSameDayDrop(todayDataset, previousDataset);

  // 最終輸出：把今天新增的（已過白名單）資料併入前一版累積的 30 天滾動視窗。
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
