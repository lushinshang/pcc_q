import * as cheerio from "cheerio";

import { PCC_ORIGIN } from "../../src/contracts/tender";
import {
  buildPccQueryUrl,
  fetchPccHtml,
  type FetchPccOptions,
  type FetchPccPageResult,
} from "./secureFetch";

// 2026-07-25 對真實 PCC 網站實測發現：231 頁的序列請求偶爾會在單頁逾時或連線失敗
// （不同次測試分別在第 1 頁、第 16 頁發生，非固定門檻，判斷為間歇性網路／伺服器狀況）。
// 單頁失敗時重試幾次，避免整個多頁擷取因單一頁的短暫問題而整批放棄。
const PAGE_RETRY_DELAYS_MS = [500, 1500, 3000];

async function fetchPageWithRetry(
  url: URL,
  cookie: string | undefined,
  options: FetchPccOptions,
): Promise<FetchPccPageResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= PAGE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetchPccHtml({ ...options, url, cookie });
    } catch (error) {
      lastError = error;
      const delayMs = PAGE_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) break;
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
  throw lastError;
}

const PCC_QUERY_PATH = "/prkms/tender/common/advanced/readTenderAdvanced";
// 2026-07-24 實測全國當日公告共 13 頁（pageSize=100）；抓 40 頁緩衝防止分頁連結異常造成無限迴圈。
export const MAX_PCC_PAGES = 40;
// 2026-07-25 實測全國過去 30 天（日期區間查詢）共 23,091 筆、約 231 頁；抓約 1.7 倍緩衝。
export const MAX_PCC_PAGES_BOOTSTRAP = 400;
export const BOOTSTRAP_WINDOW_DAYS = 30;

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
  maxPages = MAX_PCC_PAGES,
): Promise<string[]> {
  const pages: string[] = [];
  let currentUrl = options.url ?? buildPccQueryUrl();
  let cookie = options.cookie;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await fetchPageWithRetry(currentUrl, cookie, options);
    pages.push(page.html);
    cookie = page.cookie;

    const nextUrl = extractNextPageUrl(page.html, currentUrl);
    if (!nextUrl) return pages;
    currentUrl = nextUrl;
  }

  throw new Error("分頁數超過安全上限，可能資料不完整");
}

// PCC 日期區間查詢欄位（tenderStartDate／tenderEndDate）要吃西元年格式（如 2026/06/25），
// 不是畫面顯示的民國年；2026-07-25 已用真實瀏覽器操作驗證過，不能用猜的改成民國年。
export function formatGregorianTaipei(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(nowMs))
    .replaceAll("-", "/");
}

export function buildBootstrapQueryUrl(
  nowMs = Date.now(),
  windowDays = BOOTSTRAP_WINDOW_DAYS,
): URL {
  return buildPccQueryUrl({
    dateType: "isDate",
    firstSearch: "true",
    tenderStartDate: formatGregorianTaipei(
      nowMs - windowDays * 24 * 60 * 60 * 1000,
    ),
    tenderEndDate: formatGregorianTaipei(nowMs),
  });
}

export async function fetchBootstrapPages(
  options: FetchPccOptions = {},
): Promise<string[]> {
  return fetchAllPccPages(
    { ...options, url: options.url ?? buildBootstrapQueryUrl() },
    MAX_PCC_PAGES_BOOTSTRAP,
  );
}
