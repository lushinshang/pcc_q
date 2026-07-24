import { z } from "zod";

import { ORG_LABELS } from "./orgWhitelist";

export const SCHEMA_VERSION = "1.1.0" as const;
export const PCC_ORIGIN = "https://web.pcc.gov.tw" as const;
export const PCC_SOURCE = `${PCC_ORIGIN}/` as const;
export const QUERY_MODE = "isNow" as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FORBIDDEN_MARKUP = /[<>]/;

function hasForbiddenControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 8) ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        (codePoint >= 127 && codePoint <= 159) ||
        (codePoint >= 0x200b && codePoint <= 0x200f) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2060 && codePoint <= 0x206f) ||
        codePoint === 0xfeff)
    ) {
      return true;
    }
  }
  return false;
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined)
    return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function sanitizeText(
  value: string,
  field: "id" | "name" | "method",
): string {
  const limits = { id: 120, name: 500, method: 160 } as const;
  if (hasForbiddenControlCharacter(value)) {
    throw new Error(`${field} 含控制字元`);
  }

  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${field} 不得為空`);
  if (normalized.length > limits[field])
    throw new Error(`${field} 超過長度上限`);
  if (FORBIDDEN_MARKUP.test(normalized))
    throw new Error(`${field} 含不安全標記`);
  return normalized;
}

export function convertRocDate(value: string): string {
  const match = /^\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})\s*$/.exec(value);
  if (!match) throw new Error(`無效民國年日期：${value}`);

  const rocYear = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const year = rocYear + 1911;
  const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isRealIsoDate(isoDate)) throw new Error(`無效日期：${value}`);
  return isoDate;
}

export function parseBudget(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`無效預算：${value}`);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`預算不是安全整數：${value}`);
  if (parsed < 0) throw new Error(`預算不得為負數：${value}`);
  return parsed;
}

export function validatePccUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("標案連結不是有效 URL");
  }

  if (
    url.protocol !== "https:" ||
    url.origin !== PCC_ORIGIN ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.startsWith("/prkms/")
  ) {
    throw new Error("標案連結不在允許的 PCC HTTPS 範圍");
  }
  url.hash = "";
  return url.toString();
}

export const TenderSchema = z
  .object({
    id: z.string().transform((value) => sanitizeText(value, "id")),
    name: z.string().transform((value) => sanitizeText(value, "name")),
    method: z.string().transform((value) => sanitizeText(value, "method")),
    org: z.enum(ORG_LABELS),
    budget: z.number().int().nonnegative(),
    announcedDate: z
      .string()
      .refine(isRealIsoDate, "公告日期不是有效 ISO 日期"),
    deadlineDate: z.string().refine(isRealIsoDate, "截止日期不是有效 ISO 日期"),
    link: z.string().transform(validatePccUrl),
  })
  .strict();

export type Tender = z.infer<typeof TenderSchema>;

export const TenderDatasetSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    source: z.literal(PCC_SOURCE),
    queryMode: z.literal(QUERY_MODE),
    fetchedAt: z.string().refine((value) => {
      const time = Date.parse(value);
      return Number.isFinite(time) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    }, "fetchedAt 必須是含時區的 ISO 8601 時間"),
    recordCount: z.number().int().nonnegative(),
    sha256: z.string().regex(SHA256),
    tenders: z.array(TenderSchema),
  })
  .strict();

export type TenderDataset = z.infer<typeof TenderDatasetSchema>;

export function canonicalizeTenders(tenders: readonly Tender[]): string {
  const sorted = [...tenders].sort((left, right) =>
    `${left.id}\u0000${left.announcedDate}\u0000${left.link}`.localeCompare(
      `${right.id}\u0000${right.announcedDate}\u0000${right.link}`,
      "en",
    ),
  );
  return JSON.stringify(sorted);
}

export function parseTenderDataset(input: unknown): TenderDataset {
  const dataset = TenderDatasetSchema.parse(input);
  if (dataset.recordCount !== dataset.tenders.length) {
    throw new Error("recordCount 與 tenders.length 不一致");
  }

  const uniqueKeys = new Set(
    dataset.tenders.map(
      (tender) =>
        `${tender.id}\u0000${tender.announcedDate}\u0000${tender.link}`,
    ),
  );
  if (uniqueKeys.size !== dataset.tenders.length)
    throw new Error("資料含重複標案");
  return dataset;
}
