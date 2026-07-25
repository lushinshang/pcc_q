# SDD — 系統設計文件（System Design Description）

版本：1.0（延伸既有 [`design.md`](../specs/001-pages-migration/design.md)，補齊分層說明、介面設計、部署視圖）
狀態：已核准
最後更新：2026-07-25

> 本文件是設計文件的**擴充視圖**，聚焦在既有 `design.md`（架構圖＋元件責任，屬於精簡 ADR 風格）沒有展開的：系統情境圖、模組介面細節、資料設計、部署視圖、錯誤處理總覽。核心架構決策仍以 [`design.md`](../specs/001-pages-migration/design.md)、[ADR-001](../specs/001-pages-migration/adr-query-mode.md)、[ADR-002](../specs/001-pages-migration/adr-first-run-backfill.md) 為準；本文件不重複其架構圖，直接引用。

## 1. 設計目標與限制

延伸自 [SRS.md](SRS.md) 第 3.4 節：不得引入後端／資料庫、不得接受任意 URL、Action 必須鎖 SHA、GitHub Pages 無法自訂 response header（僅能用 CSP meta）。

## 2. 系統情境圖

```text
┌────────────────────┐        HTTPS GET (固定 origin/path)        ┌─────────────────────┐
│  使用者瀏覽器        │ ───────────────────────────────────────▶ │  GitHub Pages         │
│  (React SPA)         │ ◀─────────────────────────────────────── │  (dist/, 純靜態)       │
└────────────────────┘        同源 data/tenders.json               └─────────────────────┘
                                                                              ▲
                                                                              │ upload-pages-artifact
                                                                    ┌─────────────────────┐
                                                                    │  GitHub Actions       │
                                                                    │  data-and-pages.yml   │
                                                                    └─────────────────────┘
                                                                              │ HTTPS GET（manual redirect、逐頁跟隨）
                                                                              ▼
                                                                    ┌─────────────────────┐
                                                                    │  web.pcc.gov.tw       │
                                                                    │  （不受信任外部來源） │
                                                                    └─────────────────────┘
```

三個外部邊界：使用者瀏覽器 ↔ GitHub Pages（同源，唯讀靜態檔）；GitHub Actions ↔ PCC（唯讀，固定路徑，manual redirect）；GitHub Actions ↔ GitHub Pages（單向發布，只有 `deploy` job 有寫入權限）。詳細信任邊界與威脅對應見 [`threat-model.md`](../specs/001-pages-migration/threat-model.md)。

## 3. 邏輯架構（資料流管線）

完整管線圖見 [`design.md`](../specs/001-pages-migration/design.md) 第一節，此處僅摘要各階段輸入輸出：

| 階段             | 輸入                                    | 輸出                                        | 失敗處理                                                                                 |
| ---------------- | --------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. 判斷首次/例行 | `loadPreviousPagesDataset()` 回傳值     | `isBootstrap: boolean`                      | 回傳 `null` 或空資料集／schema 不相容 → 視為首次                                         |
| 2. 分頁擷取      | PCC 查詢 URL（`isNow` 或 `isDate`）     | HTML 頁面陣列                               | 逾時／redirect／Content-Type／分頁跳出固定路徑 → 非零退出；首次回填時 catch 後改例行查詢 |
| 3. Parser        | HTML 頁面陣列                           | `Tender[]`（已過白名單過濾）                | 結構漂移（非確認零筆）或拒絕比例過高 → 非零退出                                          |
| 4. 合併與剪枝    | 新 `Tender[]` ＋ 前一版 `TenderDataset` | 剪枝後合併的 `Tender[]`                     | 同日新增筆數驟降 > 50% → 非零退出                                                        |
| 5. Contract 化   | 合併後 `Tender[]`                       | `TenderDataset`（含 SHA-256）               | Zod 驗證失敗 → 非零退出                                                                  |
| 6. 寫入          | `TenderDataset`                         | `public/data/tenders.json`（atomic rename） | —                                                                                        |
| 7. Build         | `public/data/*`                         | `dist/`                                     | 任一品質閘門失敗 → 非零退出，不產出 artifact                                             |
| 8. Deploy        | `dist/` artifact                        | GitHub Pages                                | 僅 `deploy` job 有 `pages: write`                                                        |
| 9. 前端載入      | 同源 `data/tenders.json`                | React state                                 | schema/hash 驗證失敗且無舊資料 → invalid-data 狀態；有舊資料則保留並警告                 |

## 4. 模組設計

### 4.1 資料擷取端（`scripts/`）

| 模組                                                  | 職責                                                                              | 對外介面（重點函式）                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `scripts/fetch-tenders.ts`                            | CLI 進入點，orchestration；判斷 bootstrap 分支                                    | `main()`                                                                                                      |
| `scripts/lib/secureFetch.ts`                          | 建立固定 PCC 查詢 URL；單頁 HTTP 請求（manual redirect、timeout、size limit）     | `buildPccQueryUrl(overrides)`、`fetchPccHtml(options)`                                                        |
| `scripts/lib/pccPagination.ts`                        | 跟隨「下一頁」連結逐頁擷取；bootstrap 查詢 URL 組裝；重試/backoff                 | `fetchAllPccPages()`、`fetchBootstrapPages()`、`buildBootstrapQueryUrl()`、`extractNextPageUrl()`             |
| `scripts/lib/tenderParser.ts`                         | HTML → `Tender[]`；機關白名單過濾；結構漂移 vs 確認零筆判斷                       | `parseTenderHtml()`、`parseTenderPages()`                                                                     |
| `scripts/lib/quality.ts`                              | 拒絕比例、掃描列數等品質斷言                                                      | `assertParseQuality()`                                                                                        |
| `scripts/lib/baseline.ts`                             | 讀取前一版 Pages 資料（含 schema 版本容錯）、滾動視窗剪枝、合併去重、同日驟降偵測 | `loadPreviousPagesDataset()`、`pruneOlderThanRollingWindow()`、`mergeTenders()`、`assertNoLargeSameDayDrop()` |
| `scripts/lib/dataset.ts`                              | 建立含 hash 的 `TenderDataset`，寫入前驗證                                        | `createTenderDataset()`                                                                                       |
| `scripts/security/scan-repository.ts`、`scan-dist.ts` | 秘密掃描（repo／dist）                                                            | CLI                                                                                                           |

### 4.2 前端（`src/`）

| 模組                            | 職責                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `src/contracts/tender.ts`       | Tender／Dataset Zod schema，文字/日期/金額/URL 驗證與 canonicalization |
| `src/contracts/orgWhitelist.ts` | 機關白名單、優先序比對、`resolveOrgLabel()`                            |
| `src/services/tenderService.ts` | 同源讀取並驗證 `data/tenders.json`                                     |
| `src/utils/dateRange.ts`        | 當日／一週／一個月篩選純函式（Taipei 日曆日比較）                      |
| `src/utils/freshness.ts`        | 資料新鮮度（2 小時門檻）判斷                                           |
| `src/App.tsx`                   | 主要 presentation／interaction，篩選、排序、說明面板                   |
| `config/pagesBase.ts`           | Base path 推導與驗證（Project Pages／自訂網域共用）                    |

## 5. 資料設計

Tender／Dataset 完整欄位定義見 [`data-contract.schema.json`](../specs/001-pages-migration/data-contract.schema.json)。關鍵設計決策：

- **去重鍵**：`id`／`announcedDate`／`link` 組合，新資料覆蓋舊資料（`mergeTenders()`）。
- **滾動視窗**：以 Taipei 日曆日計算，剪枝 `announcedDate` 早於（今日 − 30 天）的記錄，每次擷取後執行，避免資料集無限增長。
- **機關欄位**：`org` 限定 `ORG_LABELS` 列舉值；比對優先序固定（中央機關 > 直轄市 > 縣市政府 > 國營事業），非白名單機關的資料列在 parser 階段靜默排除，不計入拒絕率（避免大量非白名單機關公告誤觸發 fail-closed）。
- **Schema 版本容錯**：`loadPreviousPagesDataset()` 先 peek `schemaVersion`，不相符時視為「無可用基準」而非直接拋錯，避免新舊 schema 交接時系統死結（見 ADR-002 附錄）。

## 6. 部署視圖

`.github/workflows/data-and-pages.yml` 採三個循序 job（觸發：`main` push、`workflow_dispatch`、平日 Asia/Taipei 每 3 小時 cron）：

```text
fetch-data (timeout 60m)
  └─ 擷取＋驗證，upload-artifact(tender-dataset)
        ↓ needs
build (timeout 25m)
  └─ download-artifact → format/lint/typecheck/coverage/workflow policy/build/
     html validation/dist scan/E2E/audit → upload-pages-artifact
        ↓ needs
deploy
  └─ 唯一持有 pages: write／id-token: write 的 job → 發布 GitHub Pages
```

job 拆分理由：首次 30 天回填實測約 20 分鐘，若與品質閘門擠在同一個 25 分鐘 timeout 內風險過高，故拆成獨立 60 分鐘 timeout 的 `fetch-data` job（詳見 ADR-002）。

## 7. 錯誤處理與 Fail-closed 策略總覽

完整故障設計條列見 [`design.md`](../specs/001-pages-migration/design.md) 第 5 節「故障設計」；本節僅標注設計原則：**任何非預期狀態一律 fail closed（非零退出、不發布），已知的合法邊界情況（PCC 確認零筆標記、跨日不比較）明確排除在 fail-closed 條件之外**，避免誤將正常情況判定為異常。前端對應原則：擷取端已 fail closed，因此前端只需處理「舊資料 vs 完全無資料」兩種降級，不需要自行做資料正確性判斷。

## 8. 安全設計

資產、威脅、控制、對應測試的完整表格見 [`threat-model.md`](../specs/001-pages-migration/threat-model.md)。設計層面的關鍵原則：

- 最小權限：只有 `deploy` job 有 Pages／OIDC 寫入權限；PR 觸發的 CI 唯讀。
- 輸入不信任：PCC HTML 全程視為不受信任，純文字 allowlist、禁止 markup／control chars。
- 供應鏈：所有 Action 鎖定完整 commit SHA；CodeQL＋Dependency Review＋`npm audit` 納入發布閘門。
- CSP：僅 `<meta http-equiv>`（GitHub Pages 平台限制，無法用 response header），無 inline script／`unsafe-eval`／外部來源。

## 9. 設計決策紀錄索引

| ADR                                                               | 決策                                                                                              | 狀態     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| [ADR-001](../specs/001-pages-migration/adr-query-mode.md)         | 例行擷取採 `dateType=isNow` 當日查詢                                                              | Accepted |
| [ADR-002](../specs/001-pages-migration/adr-first-run-backfill.md) | 首次執行無基準時改用 `dateType=isDate` 回填過去 30 天，含西元年日期格式發現、job 拆分、安全網設計 | Accepted |

未來新增重大架構決策時，於此表新增一列並建立對應 `adr-*.md`，不直接修改本 SDD 的既有章節內容。
