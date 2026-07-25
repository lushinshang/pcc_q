import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { resolveOrgLabel } from "../../src/contracts/orgWhitelist";
import {
  PCC_ORIGIN,
  TenderSchema,
  convertRocDate,
  parseBudget,
  sanitizeText,
  validatePccUrl,
  type Tender,
} from "../../src/contracts/tender";

// 對齊我們自訂的 pageSize=100；單頁列數超過視為上游異常（PCC 頁面結構或分頁參數被忽略）。
export const MAX_TENDER_ROWS_PER_PAGE = 100;
// 多頁合計安全網：2026-07-24 實測全國當日公告約 1,272 筆，取約 2.3 倍緩衝，
// 防止不設機關限制後的分頁擷取無限增長或上游異常暴增；非精確科學值，建議上線觀察後再調整。
export const MAX_TOTAL_SCANNED_ROWS = 3000;
// 首次執行日期區間回填專用安全網：2026-07-25 實測全國過去 30 天約 23,091 筆，取約 1.7 倍緩衝。
export const MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP = 40000;

export interface RejectedRow {
  row: number;
  reason: string;
}

export interface ParseTenderResult {
  tenders: Tender[];
  scannedRows: number;
  rejectedRows: RejectedRow[];
}

function extractName(
  $row: cheerio.Cheerio<Element>,
  $tenderCell: cheerio.Cheerio<Element>,
): string {
  const title = $row.find('a[title*="標案名稱:"]').first().attr("title") ?? "";
  const fromTitle = title.includes("標案名稱:")
    ? title.split("標案名稱:")[1]
    : undefined;
  if (fromTitle?.trim()) return fromTitle.trim();

  const script = $tenderCell.find("script").text();
  const fromScript = /pageCode2Img\("([^"]+)"\)/.exec(script)?.[1];
  if (fromScript?.trim()) return fromScript.trim();

  return $tenderCell.find("a").first().text().trim();
}

function extractId($tenderCell: cheerio.Cheerio<Element>): string {
  const directText = $tenderCell
    .contents()
    .filter((_, node) => node.nodeType === 3)
    .first()
    .text();
  const normalizedDirectText = directText.trim();
  if (normalizedDirectText) return normalizedDirectText;
  return $tenderCell.text().trim().split(/\s+/).at(0) ?? "";
}

function parseRow($: cheerio.CheerioAPI, row: Element): Tender | null {
  const $row = $(row);
  const cells = $row.find("td");
  if (cells.length < 9) throw new Error("欄位數不足");

  const org = resolveOrgLabel(cells.eq(1).text());
  if (org === null) return null; // 機關不在白名單，非解析錯誤，靜默排除

  const tenderCell = cells.eq(2);
  const linkElement = $row.find('a[title*="標案名稱:"]').first();
  const fallbackLink = tenderCell.find("a").first();
  const href = linkElement.attr("href") ?? fallbackLink.attr("href");
  if (!href) throw new Error("缺少標案連結");

  return TenderSchema.parse({
    id: sanitizeText(extractId(tenderCell), "id"),
    name: sanitizeText(extractName($row, tenderCell), "name"),
    method: sanitizeText(cells.eq(4).text(), "method"),
    org,
    budget: parseBudget(cells.eq(8).text()),
    announcedDate: convertRocDate(cells.eq(6).text()),
    deadlineDate: convertRocDate(cells.eq(7).text()),
    link: validatePccUrl(new URL(href, PCC_ORIGIN).toString()),
  });
}

export function parseTenderHtml(html: string): ParseTenderResult {
  const $ = cheerio.load(html);
  const rows = $("tr[class*='tb_b']");
  if (rows.length === 0) {
    // PCC 對零筆結果會明確顯示「無符合條件資料」，而不是省略表格；
    // 有這個標記時視為確認零筆（合法情況，例如剛跨日還沒有新公告），
    // 不是上游結構漂移，讓呼叫端可以安全地只合併前一版資料。
    if (html.includes("無符合條件資料")) {
      return { tenders: [], scannedRows: 0, rejectedRows: [] };
    }
    throw new Error("找不到標案資料列，可能為上游結構漂移");
  }
  if (rows.length > MAX_TENDER_ROWS_PER_PAGE) {
    throw new Error(
      `單頁標案資料列超過 ${String(MAX_TENDER_ROWS_PER_PAGE)} 筆上限`,
    );
  }

  const tenders: Tender[] = [];
  const rejectedRows: RejectedRow[] = [];
  rows.each((index, row) => {
    try {
      const tender = parseRow($, row);
      if (tender) tenders.push(tender);
    } catch (error) {
      rejectedRows.push({
        row: index + 1,
        reason: error instanceof Error ? error.message : "未知解析錯誤",
      });
    }
  });

  return { tenders, scannedRows: rows.length, rejectedRows };
}

export function parseTenderPages(
  htmlPages: readonly string[],
  maxTotalScannedRows = MAX_TOTAL_SCANNED_ROWS,
): ParseTenderResult {
  const combined: ParseTenderResult = {
    tenders: [],
    scannedRows: 0,
    rejectedRows: [],
  };
  for (const html of htmlPages) {
    const page = parseTenderHtml(html);
    const rowOffset = combined.scannedRows;
    combined.tenders.push(...page.tenders);
    combined.rejectedRows.push(
      ...page.rejectedRows.map((rejected) => ({
        ...rejected,
        row: rowOffset + rejected.row,
      })),
    );
    combined.scannedRows += page.scannedRows;
    if (combined.scannedRows > maxTotalScannedRows) {
      throw new Error(
        `多頁合計掃描列數超過 ${String(maxTotalScannedRows)} 筆安全上限`,
      );
    }
  }
  return combined;
}
