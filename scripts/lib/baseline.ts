import {
  parseTenderDataset,
  type TenderDataset,
} from "../../src/contracts/tender";
import { sha256ForTenders } from "./dataset";

const REPOSITORY_SLUG = /^[A-Za-z0-9][A-Za-z0-9.-]*\/[A-Za-z0-9_.-]+$/;
const MAX_BASELINE_BYTES = 2 * 1024 * 1024;

function taipeiDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function buildPreviousPagesDataUrl(repository: string): URL {
  if (!REPOSITORY_SLUG.test(repository) || repository.includes("..")) {
    throw new Error("GITHUB_REPOSITORY 格式不合法");
  }
  const [owner, name] = repository.split("/");
  if (!owner || !name) throw new Error("GITHUB_REPOSITORY 格式不合法");
  const host = `${owner.toLowerCase()}.github.io`;
  const path =
    name.toLowerCase() === host
      ? "/data/tenders.json"
      : `/${name}/data/tenders.json`;
  return new URL(path, `https://${host}`);
}

export function assertNoLargeSameDayDrop(
  current: TenderDataset,
  previous: TenderDataset | null,
): void {
  if (
    !previous ||
    taipeiDate(current.fetchedAt) !== taipeiDate(previous.fetchedAt) ||
    previous.recordCount < 4
  ) {
    return;
  }
  if (current.recordCount < previous.recordCount * 0.5) {
    throw new Error(
      `當日筆數較最近成功版本大幅下降：${String(previous.recordCount)} → ${String(current.recordCount)}`,
    );
  }
}

export async function loadPreviousPagesDataset(
  repository: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TenderDataset | null> {
  if (!repository) return null;
  const response = await fetchImpl(buildPreviousPagesDataUrl(repository), {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (
    response.status === 404 ||
    (response.status >= 300 && response.status < 400)
  ) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `上一版 Pages 資料載入失敗（HTTP ${String(response.status)}）`,
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("上一版 Pages 資料格式不是 JSON");
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BASELINE_BYTES) {
    throw new Error("上一版 Pages 資料超過大小上限");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BASELINE_BYTES) {
    throw new Error("上一版 Pages 資料超過大小上限");
  }
  const dataset = parseTenderDataset(JSON.parse(text));
  if (sha256ForTenders(dataset.tenders) !== dataset.sha256) {
    throw new Error("上一版 Pages 資料 SHA-256 驗證失敗");
  }
  return dataset;
}
