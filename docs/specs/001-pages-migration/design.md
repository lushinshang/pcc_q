# Software Design Description

## 架構

```text
web.pcc.gov.tw（不限機關，逐頁分頁擷取；例行 isNow／首次回填 isDate 30 天）
  → scripts/fetch-tenders.ts（依 loadPreviousPagesDataset() 是否為 null 判斷首次或例行）
  → secureFetch + pccPagination（固定來源、逾時、大小、Content-Type、redirect、跟隨分頁連結）
  → tenderParser（Cheerio fixture 驗證 + orgWhitelist 名稱比對過濾）
  → 與前一版 Pages 資料集合併，剪枝超過 30 天的舊記錄（滾動累積）
  → TenderDataset Zod contract＋SHA-256
  → public/data/tenders.json
  → Vite dist artifact
  → GitHub Pages
  → tenderService 同源載入及再次驗證
  → React dashboard（機關／日期範圍/搜尋/招標方式皆為前端本地端篩選）
```

首次執行（沒有可用前一版基準）改用 `dateType=isDate` 日期區間查詢一次回填過去 30 天（見 ADR-002），而非逐日累積滿 30 天；日期參數要用**西元年格式**（`2026/06/25`），這點與畫面顯示的民國年不同，已用真實瀏覽器操作驗證。回填失敗時退回例行 `isNow` 查詢，不阻擋當次發布。

## 元件責任

- `src/contracts/tender.ts`：Tender／Dataset 契約、文字、日期、金額、URL 驗證與 canonicalization；`org` 欄位限定於 `ORG_LABELS` 列舉值。
- `src/contracts/orgWhitelist.ts`：機關白名單與 `resolveOrgLabel()`，依優先序（中央機關 > 直轄市 > 縣市政府 > 國營事業）用名稱字串比對收斂下轄單位，無命中回傳 `null`。
- `scripts/lib/secureFetch.ts`：建立不限機關的 PCC 查詢（`orgId` 為空字串），單頁請求邏輯；`buildPccQueryUrl()` 接受 `dateType`／`tenderStartDate`／`tenderEndDate`／`firstSearch` 覆寫，供例行 `isNow` 與首次回填 `isDate` 共用；`fetchPccHtml` 回傳 HTML 與合併後的 cookie 供分頁串接。
- `scripts/lib/pccPagination.ts`：跟隨回應 HTML 中的「下一頁」連結逐頁擷取，不硬編碼分頁參數；`fetchAllPccPages()` 的 `maxPages` 可覆寫（例行 `MAX_PCC_PAGES`／首次回填 `MAX_PCC_PAGES_BOOTSTRAP`）；`buildBootstrapQueryUrl()`／`fetchBootstrapPages()` 組出西元年格式的 30 天日期區間查詢。
- `scripts/lib/baseline.ts`：由受限的 `owner/repository` slug 推導既有 GitHub Pages JSON URL；`assertNoLargeSameDayDrop` 比較兩次同日「本次新增筆數」而非整份滾動累積後的 `recordCount`；`pruneOlderThanRollingWindow`／`mergeTenders` 提供 30 天滾動視窗的剪枝與去重合併；回傳 `null` 同時代表「真的第一次部署」與「前一版 schema 不相容」，兩者都觸發首次回填流程。
- `scripts/lib/tenderParser.ts`：把預期表格列轉為 validated Tender，不接受 raw HTML；`parseTenderPages` 合併多頁結果並套用可覆寫的總量安全上限（例行 `MAX_TOTAL_SCANNED_ROWS`／首次回填 `MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP`）；機關不在白名單時靜默排除（不計入解析拒絕率）。
- `scripts/lib/dataset.ts`：計算 hash、建立 dataset、寫入前驗證。
- `scripts/fetch-tenders.ts`：CLI orchestration；不接受完整 URL；依 `loadPreviousPagesDataset()` 是否為 `null` 決定走首次回填（`isDate` 30 天，失敗時退回例行查詢）或例行（`isNow`）分支，再串起白名單過濾、與前一版資料合併剪枝的完整流程。
- `src/services/tenderService.ts`：只讀取 `${BASE_URL}data/tenders.json` 並驗證。
- `src/utils/dateRange.ts`：前端「當日／一週／一個月」篩選的純函式，依 Taipei 日曆日比較 `announcedDate`，不觸發任何額外網路請求。
- `config/pagesBase.ts`：由 Vite 與 Playwright 共用。Project Pages 預設推導 `/<repository>/`；自訂網域／root 可用經嚴格路徑驗證的 `PAGES_BASE_PATH=/`，拒絕完整 URL、protocol-relative 值與 traversal。
- `src/App.tsx`：純 presentation／interaction，不直接接觸 PCC；機關與日期範圍篩選皆為對已載入資料的本地端 filter。

## 信任邊界

政府網站 HTML、產生的 JSON、query string 與第三方套件都不是信任來源。只有通過 allowlist、schema 與測試的資料能進入 Pages artifact。

## 故障設計

- 網路、redirect、Content-Type、大小或解析失敗：process 非零退出。
- 零有效資料或結構漂移：process 非零退出。
- 同一台北日期且上一版「當日新增筆數」至少四筆時，新一輪當日新增少於上一版當日新增的 50%：process 非零退出；跨日不比較。
- 多頁合計掃描列數超過安全上限（例行 `MAX_TOTAL_SCANNED_ROWS` 3,000／首次回填 `MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP` 40,000）：例行查詢 process 非零退出；首次回填時捕捉錯誤退回例行 `isNow` 查詢，不阻擋當次發布。
- 分頁連結跳出固定 PCC 查詢路徑：process 非零退出（首次回填時同樣退回例行查詢重試）。
- Actions 前置 job 失敗：deploy job 不執行，既有 Pages 版本保留。
- CI／data workflow 以完整 checkout 執行 Gitleaks v8.30.1；`--redact` 避免 finding 把秘密值寫回 log。
- 前端重新載入失敗且已有資料：保留既有資料並顯示警告。
- JSON 無效且沒有既有資料：顯示 invalid-data 狀態。

## CSP

Production 只使用 Vite 產生的同源 JS/CSS、同源 JSON 與 React 產生的 SVG icon。CSP meta 禁止外部 script、object、base 與 form，且沒有 inline script、`unsafe-inline` 或 `unsafe-eval`。GitHub Pages 不能由 repository 自訂 `frame-ancestors`、HSTS、`X-Frame-Options`、`Permissions-Policy` 等 response headers，此限制記錄於 threat model 與 runbook。
