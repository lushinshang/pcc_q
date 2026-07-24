import {
  canonicalizeTenders,
  parseTenderDataset,
  type TenderDataset,
} from "../contracts/tender";

export interface LoadTenderDatasetOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl.startsWith("/") || baseUrl.startsWith("//")) {
    throw new Error("BASE_URL 必須是同源絕對路徑");
  }
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyTenderDatasetIntegrity(
  dataset: TenderDataset,
): Promise<TenderDataset> {
  const actualHash = await sha256Hex(canonicalizeTenders(dataset.tenders));
  if (actualHash !== dataset.sha256)
    throw new Error("靜態資料 SHA-256 驗證失敗");
  return dataset;
}

export async function loadTenderDataset(
  options: LoadTenderDatasetOptions = {},
): Promise<TenderDataset> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? import.meta.env.BASE_URL);
  const response = await fetchImpl(`${baseUrl}data/tenders.json`, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`靜態資料載入失敗（HTTP ${String(response.status)}）`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json"))
    throw new Error("靜態資料格式不是 JSON");
  return verifyTenderDatasetIntegrity(
    parseTenderDataset(await response.json()),
  );
}
