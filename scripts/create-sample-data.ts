import { mkdir, readFile, writeFile } from "node:fs/promises";

import { createTenderDataset } from "./lib/dataset";
import { parseTenderHtml } from "./lib/tenderParser";

const html = await readFile("tests/fixtures/pcc-normal.html", "utf8");
const parsed = parseTenderHtml(html);
const dataset = createTenderDataset(
  parsed.tenders,
  "2026-07-24T08:17:00+08:00",
);

await mkdir("public/data", { recursive: true });
await writeFile(
  "public/data/tenders.json",
  `${JSON.stringify(dataset, null, 2)}\n`,
  "utf8",
);
