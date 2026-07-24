import * as cheerio from "cheerio";

import { PCC_ORIGIN } from "../../src/contracts/tender";
import {
  buildPccQueryUrl,
  fetchPccHtml,
  type FetchPccOptions,
} from "./secureFetch";

const PCC_QUERY_PATH = "/prkms/tender/common/advanced/readTenderAdvanced";
// 2026-07-24 實測全國當日公告共 13 頁（pageSize=100）；抓 40 頁緩衝防止分頁連結異常造成無限迴圈。
export const MAX_PCC_PAGES = 40;

export function extractNextPageUrl(html: string, currentUrl: URL): URL | null {
  const $ = cheerio.load(html);
  const nextLink = $("#pagelinks a")
    .filter((_, element) => $(element).text().trim() === "下一頁")
    .first();
  const href = nextLink.attr("href");
  if (!href) return null;

  const nextUrl = new URL(href, currentUrl);
  if (nextUrl.origin !== PCC_ORIGIN || nextUrl.pathname !== PCC_QUERY_PATH) {
    throw new Error("分頁連結不在允許的 PCC 查詢路徑範圍");
  }
  return nextUrl;
}

export async function fetchAllPccPages(
  options: FetchPccOptions = {},
): Promise<string[]> {
  const pages: string[] = [];
  let currentUrl = options.url ?? buildPccQueryUrl();
  let cookie = options.cookie;

  for (let pageIndex = 0; pageIndex < MAX_PCC_PAGES; pageIndex++) {
    const page = await fetchPccHtml({ ...options, url: currentUrl, cookie });
    pages.push(page.html);
    cookie = page.cookie;

    const nextUrl = extractNextPageUrl(page.html, currentUrl);
    if (!nextUrl) break;
    currentUrl = nextUrl;
  }

  return pages;
}
