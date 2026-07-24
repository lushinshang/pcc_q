import { PCC_ORIGIN, QUERY_MODE } from "../../src/contracts/tender";

const PCC_QUERY_PATH = "/prkms/tender/common/advanced/readTenderAdvanced";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export function buildPccQueryUrl(): URL {
  const url = new URL(PCC_QUERY_PATH, PCC_ORIGIN);
  const parameters: Record<string, string> = {
    pageSize: "100",
    firstSearch: "false",
    searchType: "advanced",
    isBinding: "N",
    isLogIn: "N",
    level_1: "on",
    orgName: "",
    orgId: "",
    tenderName: "",
    tenderId: "",
    tenderType: "TENDER_DECLARATION",
    tenderWay: "TENDER_WAY_ALL_DECLARATION",
    dateType: QUERY_MODE,
    tenderStartDate: "",
    tenderEndDate: "",
    spdtStartDate: "",
    spdtEndDate: "",
    opdtStartDate: "",
    opdtEndDate: "",
    tenderYmStartY: "",
    tenderYmStartM: "",
    tenderYmEndY: "",
    tenderYmEndM: "",
    radProctrgCate: "",
    tenderRange: "TENDER_RANGE_ALL",
    minBudget: "",
    maxBudget: "",
    execLocation: "",
    location: "",
    priorityCate: "",
    radReConstruct: "",
    policyAdvocacy: "",
    isCpp: "",
  };
  for (const [key, value] of Object.entries(parameters))
    url.searchParams.set(key, value);
  return url;
}

export function validateRedirectLocation(value: string): URL {
  const url = new URL(value, PCC_ORIGIN);
  if (
    url.protocol !== "https:" ||
    url.origin !== PCC_ORIGIN ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.startsWith("/prkms/")
  ) {
    throw new Error("重新導向不在允許的 PCC HTTPS 範圍");
  }
  return url;
}

export interface FetchPccOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  url?: URL;
  cookie?: string;
}

export interface FetchPccPageResult {
  html: string;
  cookie: string | undefined;
}

function mergeCookies(
  existingCookie: string | undefined,
  setCookieHeaders: string[],
): string | undefined {
  if (setCookieHeaders.length === 0) return existingCookie;
  const jar = new Map<string, string>();
  for (const pair of (existingCookie ?? "").split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name && rest.length > 0) jar.set(name, rest.join("="));
  }
  for (const header of setCookieHeaders) {
    const [name, ...rest] = (header.split(";")[0] ?? "").trim().split("=");
    if (name && rest.length > 0) jar.set(name, rest.join("="));
  }
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function fetchPccHtml(
  options: FetchPccOptions = {},
): Promise<FetchPccPageResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(options.url ?? buildPccQueryUrl(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-TW,zh;q=0.9",
        "Cache-Control": "no-cache",
        "User-Agent":
          "MOD-Tender-Dashboard/1.0 (+GitHub Actions static data build)",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) validateRedirectLocation(location);
      throw new Error("PCC 回應重新導向；基於 fail-closed 政策中止");
    }
    if (!response.ok)
      throw new Error(`PCC 回應 HTTP ${String(response.status)}`);

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html"))
      throw new Error("PCC Content-Type 不是 HTML");

    const declaredLength = Number(
      response.headers.get("content-length") ?? "0",
    );
    if (declaredLength > maxBytes) throw new Error("PCC 回應超過大小上限");
    if (!response.body) throw new Error("PCC 回應沒有內容");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytesRead = 0;
    let html = "";
    let chunk = await reader.read();
    while (!chunk.done) {
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new Error("PCC 回應超過大小上限");
      }
      html += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }
    html += decoder.decode();
    const setCookieHeaders =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    return { html, cookie: mergeCookies(options.cookie, setCookieHeaders) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`PCC 擷取超過 ${String(timeoutMs)}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
