import { mkdir, readFile, writeFile } from "node:fs/promises";

import { taipeiDate } from "./lib/baseline";
import { createTenderDataset } from "./lib/dataset";
import { parseTenderHtml } from "./lib/tenderParser";

const html = await readFile("tests/fixtures/pcc-normal.html", "utf8");
const parsed = parseTenderHtml(html);
// 前端預設篩選為「機關=國防部、日期範圍=當日」，樣本資料的 announcedDate
// 必須固定改成今天，否則本機開發與 E2E 會隨執行日期漂移而看不到資料。
const fetchedAt = new Date().toISOString();
const today = taipeiDate(fetchedAt);
const tenders = parsed.tenders.map((tender) => ({
  ...tender,
  announcedDate: today,
}));
const dataset = createTenderDataset(tenders, fetchedAt);

await mkdir("public/data", { recursive: true });
await writeFile(
  "public/data/tenders.json",
  `${JSON.stringify(dataset, null, 2)}\n`,
  "utf8",
);
