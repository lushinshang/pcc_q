# SRS — 軟體需求規格（Software Requirements Specification）

版本：1.0（整合 [`requirements.md`](../specs/001-pages-migration/requirements.md) v1.3 之工程需求，補充 IEEE 830 結構缺項）
狀態：已核准
最後更新：2026-07-25

> 需求編號（REQ-F/D/S）本身的權威來源仍是 [`requirements.md`](../specs/001-pages-migration/requirements.md)；本文件負責補齊該檔案沒有涵蓋的外部介面需求、正式非功能需求、假設與限制、優先序，並提供產品↔需求的對照。需求驗收條件如有異動，一律先改 `requirements.md`，本文件僅做結構性引用，不重複維護驗收條件文字本身。

## 1. 目的與範圍

本文件說明「國防部當日公告標案儀表板」的完整軟體需求，供開發、測試與驗收共同依循。範圍涵蓋資料擷取（GitHub Actions）、資料契約與驗證、前端展示三個子系統，對應 [PRD.md](PRD.md) 第 4 節之產品範圍。

## 2. 定義與縮寫

| 詞彙        | 說明                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| PCC         | 政府電子採購網（`web.pcc.gov.tw`），本系統唯一資料來源                             |
| Tender      | 一筆標案公告記錄                                                                   |
| isNow       | PCC 查詢模式：當日公告（例行擷取使用）                                             |
| isDate      | PCC 查詢模式：日期區間查詢（僅首次執行回填使用，見 ADR-002）                       |
| 白名單機關  | `src/contracts/orgWhitelist.ts` 中列舉的機關名稱，非白名單機關的資料列會被靜默排除 |
| 滾動視窗    | 發布資料集僅保留最近 30 天內公告的記錄，每次擷取後剪枝                             |
| Fail closed | 偵測到資料異常時中止發布流程、保留上一版，而非發布可疑資料                         |

## 3. 整體描述

### 3.1 產品情境

```text
web.pcc.gov.tw（外部、不受信任）
  → GitHub Actions（scripts/fetch-tenders.ts 及其 lib）
  → public/data/tenders.json（版本化、SHA-256 驗證）
  → GitHub Pages（純靜態 dist）
  → 使用者瀏覽器（React SPA，同源讀取）
```

系統情境圖與模組責任見 [SDD.md](SDD.md) 第 2、3 節。

### 3.2 使用者類別

見 [PRD.md](PRD.md) 第 2 節。系統不區分帳號或權限層級——所有訪客看到相同的公開資料與相同的篩選能力。

### 3.3 運作環境

- 資料擷取端：GitHub Actions runner（`ubuntu-latest`），Node.js 24。
- 發布端：GitHub Pages（純靜態，無伺服器端執行環境）。
- 使用端：現代桌面／行動瀏覽器，支援 ES Module。

### 3.4 設計與實作限制

- 不得引入後端伺服器、資料庫或需保管密鑰的第三方服務（PRD 產品原則 #3）。
- 擷取器不得接受任意 URL（REQ-S-001）——來源必須是程式內固定組裝的 PCC 查詢 URL。
- 所有 GitHub Actions 第三方 action 必須鎖定完整 commit SHA（REQ-S-005）。
- GitHub Pages 平台限制：無法自訂完整 HTTP response headers（見 [`threat-model.md`](../specs/001-pages-migration/threat-model.md) 殘餘風險段落）——本限制會影響 REQ-S-007 的實作方式（CSP 只能用 `<meta>`，非 response header）。

### 3.5 假設與依賴

見 [PRD.md](PRD.md) 第 7 節。

## 4. 外部介面需求

### 4.1 使用者介面（UI）

- 單頁 React 應用，主要區塊：KPI 摘要、來源/查詢模式/新鮮度狀態列、篩選列（機關下拉、日期範圍下拉、案名/案號搜尋框、招標方式下拉）、標案列表（表格）、資料來源說明可展開面板（`<details>`）。
- 無障礙：需通過 axe-core serious/critical 零違規（REQ-S-007 相關驗收，見 STP.md）。
- 響應式：桌機 1440×1000 與行動 390×844 兩種基準 viewport 皆不得水平溢位。

### 4.2 對外部系統的介面（唯一外部依賴：PCC）

| 介面                | 方向           | 說明                                                                                                                                          |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PCC 標案查詢頁 HTML | 讀取           | 固定 origin/path，`dateType=isNow`（例行）或 `isDate`（首次回填），逐頁跟隨回應中的「下一頁」連結；不接受硬編碼分頁參數或使用者提供的完整 URL |
| PCC 標案詳情連結    | 使用者點擊導出 | 每筆 Tender 的 `link` 欄位限定 PCC HTTPS scheme/host，`rel="noopener noreferrer"`                                                             |

系統**沒有**對外提供任何 API（無 `/api/*` 端點）——這是刻意的架構決策，前端僅讀取同源靜態 JSON（REQ-F-004）。

### 4.3 軟體介面

- `public/data/tenders.json`：前端與資料擷取管線之間的唯一資料交換介面，schema 定義於 [`data-contract.schema.json`](../specs/001-pages-migration/data-contract.schema.json) 與 `src/contracts/tender.ts`。

### 4.4 通訊介面

- 全站僅 HTTPS。CSP 透過 `<meta http-equiv>` 落實，禁止 inline script、`unsafe-eval`、外部 script/object/base/form 來源。

## 5. 功能需求

功能需求（REQ-F-001～009）、資料與可靠性需求（REQ-D-001～010）、資安需求（REQ-S-001～008）的完整條列與驗收條件，權威來源為 [`requirements.md`](../specs/001-pages-migration/requirements.md)，不在本文件重複列出以避免雙重維護風險。本節僅補充該文件缺少的**優先序標記**：

### 5.1 優先序（MoSCoW）

| 需求群組              | Must have                    | Should have   | Could have |
| --------------------- | ---------------------------- | ------------- | ---------- |
| 功能（REQ-F）         | 001, 002, 003, 004, 005, 006 | 007, 008, 009 | —          |
| 資料／可靠性（REQ-D） | 001～006, 009                | 007, 008, 010 | —          |
| 資安（REQ-S）         | 001～008                     | —             | —          |

_判斷依據_：REQ-F-007/008/009（機關/日期篩選、說明面板）與 REQ-D-007/008/010（機關欄位、分頁安全、首次回填）屬於上線後才新增的體驗與資料完整性強化，移除後系統仍可運作（退化為單一機關、無篩選、無 30 天回填），故列為 Should have；REQ-S 全數為 Must have，因為本專案的產品原則明確以安全邊界為不可退讓底線（見 PRD 第 5 節原則 1、2）。

## 6. 非功能需求

| 類別                    | 需求                                                                                     | 驗收依據                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 效能                    | 首次執行 30 天回填在 60 分鐘 timeout 內完成；例行擷取與品質閘門在 25 分鐘 timeout 內完成 | `.github/workflows/data-and-pages.yml` job timeout-minutes 設定；實測 231 頁回填約需 20 分鐘（ADR-002） |
| 可靠性                  | 擷取或驗證任一環節失敗不得部署；既有 Pages 版本保留                                      | REQ-D-003；`deploy` job 依賴 `build` job 成功                                                           |
| 可維護性                | Statement/line coverage ≥ 90%，branch coverage ≥ 85%，parser 核心 ≥ 95%                  | `requirements.md` 非功能需求段落；實測見 STP.md                                                         |
| 可用性（Accessibility） | 自動化 axe 規則 serious/critical 零違規                                                  | E2E-T-002                                                                                               |
| 相容性                  | 支援 Project Pages（`/<repository>/`）與自訂網域/root 部署（`PAGES_BASE_PATH`）          | `config/pagesBase.ts`                                                                                   |
| 安全性                  | 見 REQ-S-001～008 與 [`threat-model.md`](../specs/001-pages-migration/threat-model.md)   | `security:*` 系列指令                                                                                   |
| 可觀測性                | 每次發布資料含 `fetchedAt`／`queryMode`／`recordCount`／SHA-256，前端顯示新鮮度狀態      | REQ-F-003、REQ-D-006                                                                                    |
| 部署頻率                | 平日（週一至週五）每 3 小時排程一次，另支援人工觸發                                      | REQ-F-005                                                                                               |

Production build 不得產生 source map（非功能需求，見 `requirements.md`）；dist artifact 僅含建置產出，不含 fixture、`.env`、密鑰。

## 7. 資料需求摘要

Tender 記錄欄位（`id`／`name`／`method`／`org`／`budget`／`announcedDate`／`deadlineDate`／`link`）與 Dataset 層 metadata（`schemaVersion`／`source`／`queryMode`／`fetchedAt`／`recordCount`／`sha256`）之完整 schema 定義見 [`data-contract.schema.json`](../specs/001-pages-migration/data-contract.schema.json)。目前 `schemaVersion = "1.1.0"`（`org` 欄位為 1.1.0 新增）。

## 8. 需求變更紀錄

| 版本 | 日期       | 變更                                                   |
| ---- | ---------- | ------------------------------------------------------ |
| 1.0  | 2026-07-25 | 首次整合既有 `requirements.md` v1.3，建立正式 SRS 結構 |

後續需求變更請先更新 [`requirements.md`](../specs/001-pages-migration/requirements.md) 與其版本號，再回頭補充本文件第 8 節與第 5.1 節優先序（若受影響）。
