import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertNoLargeSameDayDrop,
  loadPreviousPagesDataset,
} from "./lib/baseline";
import { createTenderDataset } from "./lib/dataset";
import { assertParseQuality } from "./lib/quality";
import { fetchPccHtml } from "./lib/secureFetch";
import { parseTenderHtml } from "./lib/tenderParser";

const OUTPUT_DIRECTORY = path.resolve("public/data");
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "tenders.json");
const TEMP_PATH = path.join(OUTPUT_DIRECTORY, ".tenders.json.tmp");
async function main(): Promise<void> {
  const html = await fetchPccHtml();
  const parsed = parseTenderHtml(html);
  assertParseQuality(parsed);

  const dataset = createTenderDataset(parsed.tenders);
  const previousDataset = await loadPreviousPagesDataset(
    process.env.GITHUB_REPOSITORY,
  );
  assertNoLargeSameDayDrop(dataset, previousDataset);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(TEMP_PATH, `${JSON.stringify(dataset, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });
  await rename(TEMP_PATH, OUTPUT_PATH);

  console.info(
    `已產生 ${String(dataset.recordCount)} 筆當日公告資料；schema=${dataset.schemaVersion} sha256=${dataset.sha256}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "資料擷取失敗");
  process.exitCode = 1;
});
