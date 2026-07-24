# Software Design Description

## 架構

```text
web.pcc.gov.tw
  → scripts/fetch-tenders.ts
  → secureFetch（固定來源、逾時、大小、Content-Type、redirect）
  → tenderParser（Cheerio fixture 驗證）
  → TenderDataset Zod contract＋SHA-256
  → public/data/tenders.json
  → Vite dist artifact
  → GitHub Pages
  → tenderService 同源載入及再次驗證
  → React dashboard
```

## 元件責任

- `src/contracts/tender.ts`：Tender／Dataset 契約、文字、日期、金額、URL 驗證與 canonicalization。
- `scripts/lib/secureFetch.ts`：只建立固定 PCC `isNow` 查詢，限制網路行為。
- `scripts/lib/baseline.ts`：由受限的 `owner/repository` slug 推導既有 GitHub Pages JSON URL；只在同一台北日期比較最近成功版本，下降超過 50% 時阻擋。
- `scripts/lib/tenderParser.ts`：把預期表格列轉為 validated Tender，不接受 raw HTML。
- `scripts/lib/dataset.ts`：計算 hash、建立 dataset、寫入前驗證。
- `scripts/fetch-tenders.ts`：CLI orchestration；不接受完整 URL。
- `src/services/tenderService.ts`：只讀取 `${BASE_URL}data/tenders.json` 並驗證。
- `config/pagesBase.ts`：由 Vite 與 Playwright 共用。Project Pages 預設推導 `/<repository>/`；自訂網域／root 可用經嚴格路徑驗證的 `PAGES_BASE_PATH=/`，拒絕完整 URL、protocol-relative 值與 traversal。
- `src/App.tsx`：純 presentation／interaction，不直接接觸 PCC。

## 信任邊界

政府網站 HTML、產生的 JSON、query string 與第三方套件都不是信任來源。只有通過 allowlist、schema 與測試的資料能進入 Pages artifact。

## 故障設計

- 網路、redirect、Content-Type、大小或解析失敗：process 非零退出。
- 零有效資料或結構漂移：process 非零退出。
- 同一台北日期且上一版至少四筆時，新資料少於上一版 50%：process 非零退出；跨日不比較。
- Actions 前置 job 失敗：deploy job 不執行，既有 Pages 版本保留。
- CI／data workflow 以完整 checkout 執行 Gitleaks v8.30.1；`--redact` 避免 finding 把秘密值寫回 log。
- 前端重新載入失敗且已有資料：保留既有資料並顯示警告。
- JSON 無效且沒有既有資料：顯示 invalid-data 狀態。

## CSP

Production 只使用 Vite 產生的同源 JS/CSS、同源 JSON 與 React 產生的 SVG icon。CSP meta 禁止外部 script、object、base 與 form，且沒有 inline script、`unsafe-inline` 或 `unsafe-eval`。GitHub Pages 不能由 repository 自訂 `frame-ancestors`、HSTS、`X-Frame-Options`、`Permissions-Policy` 等 response headers，此限制記錄於 threat model 與 runbook。
