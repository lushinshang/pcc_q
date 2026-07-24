import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import {
  PCC_ORIGIN,
  TenderSchema,
  convertRocDate,
  parseBudget,
  sanitizeText,
  validatePccUrl,
  type Tender,
} from "../../src/contracts/tender";

export const MAX_TENDER_ROWS = 100;

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

function parseRow($: cheerio.CheerioAPI, row: Element): Tender {
  const $row = $(row);
  const cells = $row.find("td");
  if (cells.length < 9) throw new Error("欄位數不足");

  const tenderCell = cells.eq(2);
  const linkElement = $row.find('a[title*="標案名稱:"]').first();
  const fallbackLink = tenderCell.find("a").first();
  const href = linkElement.attr("href") ?? fallbackLink.attr("href");
  if (!href) throw new Error("缺少標案連結");

  return TenderSchema.parse({
    id: sanitizeText(extractId(tenderCell), "id"),
    name: sanitizeText(extractName($row, tenderCell), "name"),
    method: sanitizeText(cells.eq(4).text(), "method"),
    budget: parseBudget(cells.eq(8).text()),
    announcedDate: convertRocDate(cells.eq(6).text()),
    deadlineDate: convertRocDate(cells.eq(7).text()),
    link: validatePccUrl(new URL(href, PCC_ORIGIN).toString()),
  });
}

export function parseTenderHtml(html: string): ParseTenderResult {
  const $ = cheerio.load(html);
  const rows = $("tr[class*='tb_b']");
  if (rows.length === 0)
    throw new Error("找不到標案資料列，可能為上游結構漂移");
  if (rows.length > MAX_TENDER_ROWS) {
    throw new Error(`標案資料列超過 ${String(MAX_TENDER_ROWS)} 筆上限`);
  }

  const tenders: Tender[] = [];
  const rejectedRows: RejectedRow[] = [];
  rows.each((index, row) => {
    try {
      tenders.push(parseRow($, row));
    } catch (error) {
      rejectedRows.push({
        row: index + 1,
        reason: error instanceof Error ? error.message : "未知解析錯誤",
      });
    }
  });

  return { tenders, scannedRows: rows.length, rejectedRows };
}
