---
title: "GitHub Pages 靜態化遷移"
subtitle: "SDD × TDD × 資安驗證修改提案"
author: "SDD/TDD 專案技術提案"
date: "2026-07-24"
lang: "zh-TW"
description: "AI Studio 匯出的國防部標案儀表板，改造為 GitHub Actions 定時產生資料、GitHub Pages 發布的安全靜態網站。"
---

::: {.executive-summary}
## 決策摘要

**建議有條件採行方案 A。** 將目前的 React、Express 與即時 HTML 代理，改造成「GitHub Actions 定時擷取與驗證資料、Vite 建置、GitHub Pages 發布」的純靜態架構。這項改造會移除公開後端、任意 URL 代理與前端 API 金鑰，顯著縮小攻擊面。

**核准條件：** 資安測試若要求網站自行回傳完整 HTTP Security Headers，應採用「自訂網域＋可設定標頭的 CDN／反向代理」作為補償控制；純 GitHub Pages 無法由 repository 自訂所有 response headers。其餘應用程式、資料、供應鏈與 CI/CD 控制，均列為合併及發布前的強制閘門。
:::

::: {.status-grid}
::: {.status-card .good}
### 建議結論

**GO，附帶主機標頭條件**
:::

::: {.status-card}
### 預估工期

**8–10 個工程人日**
:::

::: {.status-card}
### 目標更新頻率

**平日每小時＋手動觸發**
:::

::: {.status-card}
### 主要基準

**OWASP ASVS 5.0.0 適用控制**
:::
:::

## 一、背景與問題定義

目前專案是從 Google AI Studio 匯出的 React 19／Vite 應用程式，另以 Express 提供 `/api/tenders`，伺服器接收前端傳入的完整 URL，再抓取政府採購網 HTML 並以 Cheerio 解析。此結構無法直接在 GitHub Pages 執行，因為 GitHub Pages 僅提供靜態 HTML、CSS 與 JavaScript。

現況另有四項必須在遷移時一併修正的問題：

1. `/api/tenders?url=...` 可要求伺服器存取任意網址，形成 SSRF 攻擊面。
2. `GEMINI_API_KEY` 經 Vite 注入瀏覽器，且 Gemini SDK 實際未參與資料處理。
3. 畫面宣稱「今日標案」，查詢卻使用 `dateType=isSpdt`，實際語意是「等標期內」。
4. 預設搜尋詞「綜合任務」會將成功取得的資料全部過濾掉，使初始 KPI 與圖表顯示為零。

### 1.1 本提案中的 SDD 定義

本案同時滿足 SDD 的兩種常見解讀：

- **Specification-Driven Development：** 先建立可驗證規格，再依規格設計、實作及驗收。
- **Software Design Description：** 將架構、資料契約、信任邊界、介面、錯誤處理與部署設計形成版本化文件。

所有需求均須具備唯一編號，並可追溯到設計決策、測試案例與驗收證據。

## 二、目標、非目標與成功定義

### 2.1 專案目標

- 將網站改為 GitHub Pages 可發布的純靜態 Vite 應用程式。
- 由 GitHub Actions 在固定排程或人工觸發時抓取政府採購網。
- 在發布前完成來源限制、大小限制、逾時、資料清理及 JSON Schema 驗證。
- 移除 Gemini SDK、API 金鑰、Express 與公開 API endpoint。
- 以 SDD 建立需求、設計、威脅模型及需求—測試追溯矩陣。
- 以 TDD 建立解析器、資料契約、前端行為與安全負向測試。
- 讓每次 Pull Request 與正式發布都有可稽核的自動化證據。

### 2.2 非目標

- 不提供使用者登入、個人化、付款或機敏資料儲存。
- 不在瀏覽器直接抓取政府採購網。
- 不保證秒級即時；排程可能受 GitHub Actions 平台延遲影響。
- 不以固定「100% 信心」宣稱資料正確；只呈現可驗證的擷取與驗證結果。
- 本案不代表政府採購網或國防部官方服務，頁尾須保留資料來源與非官方聲明。

### 2.3 成功定義

專案只有在下列條件全部成立時，才能標記完成：

- 初次載入顯示最近一次有效資料，不因預設搜尋詞而歸零。
- 「當日」需求使用 `dateType=isNow`；若產品決定採「等標期內」，所有文案同步修正。
- GitHub Pages 網站不包含 API 金鑰、存取權杖或可執行的公開後端。
- 發布資料通過 schema、來源網址、資料型別、筆數與大小上限驗證。
- 單元測試 statement／line coverage ≥ 90%，branch coverage ≥ 85%；解析核心 ≥ 95%。
- CodeQL、secret scan 與 dependency audit 無未處理的 Critical／High 弱點。
- E2E、可及性、CSP 與部署 smoke test 全數通過。
- 所有需求編號均至少對應一個自動化測試或人工驗收證據。

## 三、目標架構

::: {.architecture aria-label="目標架構資料流"}
::: {.arch-node}
**政府採購網**

不受信任 HTML
:::
::: {.arch-arrow}
→
:::
::: {.arch-node .accent}
**GitHub Actions**

固定來源擷取、解析、驗證
:::
::: {.arch-arrow}
→
:::
::: {.arch-node}
**tenders.json**

版本化資料契約
:::
::: {.arch-arrow}
→
:::
::: {.arch-node .accent}
**Vite Build**

測試、掃描、產生 artifact
:::
::: {.arch-arrow}
→
:::
::: {.arch-node .success}
**GitHub Pages**

同源靜態資產
:::
:::

### 3.1 發布流程

1. `schedule` 或 `workflow_dispatch` 啟動資料工作流程。
2. 擷取腳本只允許固定的 `https://web.pcc.gov.tw` host 與指定 path。
3. 使用逾時、最大回應大小、Content-Type 與 redirect 驗證取得 HTML。
4. 解析器將 HTML 轉成候選資料，逐筆進行 schema 與商業規則驗證。
5. 產生包含來源、查詢語意、擷取時間、schema 版本及資料雜湊的 JSON。
6. 執行 typecheck、lint、unit、contract、security、build 與 E2E 測試。
7. 僅部署 `dist/` artifact；工作流程不把產生資料自動 commit 回來源分支。
8. 瀏覽器從同一個 Pages origin 讀取 `data/tenders.json`。

### 3.2 建議目錄

```text
.
├── docs/specs/001-pages-migration/
│   ├── requirements.md
│   ├── design.md
│   ├── threat-model.md
│   ├── test-plan.md
│   └── traceability.md
├── scripts/
│   └── fetch-tenders.ts
├── src/
│   ├── contracts/tender.ts
│   ├── services/tenderService.ts
│   ├── features/tenders/
│   └── test/
├── tests/
│   ├── fixtures/
│   ├── integration/
│   ├── security/
│   └── e2e/
├── public/data/
│   └── tenders.json
└── .github/
    ├── workflows/ci.yml
    ├── workflows/data-and-pages.yml
    ├── workflows/codeql.yml
    └── dependabot.yml
```

## 四、規格驅動需求

### 4.1 功能需求

| ID | 規格 | 驗收條件 |
|---|---|---|
| REQ-F-001 | 系統應顯示最新成功發布的標案資料。 | 無資料時顯示明確狀態；有資料時初始 KPI 不因隱藏篩選歸零。 |
| REQ-F-002 | 使用者可依案名、案號與招標方式篩選。 | 大小寫及前後空白處理一致；清除篩選可恢復全資料。 |
| REQ-F-003 | 畫面應顯示資料擷取時間、查詢語意與來源。 | 使用 ISO 8601 時間與 `Asia/Taipei` 顯示；超過兩小時標示資料可能過期。 |
| REQ-F-004 | 「重新整理」只重新載入已發布 JSON。 | 不呼叫政府採購網、不呼叫不存在的 `/api/tenders`。 |
| REQ-F-005 | 資料工作流程支援排程與人工觸發。 | 平日每小時執行，亦可由有權限的人員手動啟動。 |
| REQ-F-006 | 查詢語意必須與 UI 文案一致。 | 「當日」對應 `isNow`；「等標期內」對應 `isSpdt`，由 ADR 記錄最終選擇。 |

### 4.2 資料與可靠性需求

| ID | 規格 | 驗收條件 |
|---|---|---|
| REQ-D-001 | 發布資料必須符合版本化 JSON Schema。 | schema 不符即停止部署，保留上一版可用網站。 |
| REQ-D-002 | 每筆連結只能指向政府採購網 HTTPS URL。 | 非 HTTPS、非允許 host、含認證資訊或異常 port 一律拒絕。 |
| REQ-D-003 | 擷取失敗不得覆蓋上一版有效資料。 | pipeline 失敗且 Pages deployment 不執行。 |
| REQ-D-004 | 解析器應偵測上游 HTML 結構漂移。 | 掃描列數、有效列數與拒絕原因須被記錄；低於門檻即失敗。 |
| REQ-D-005 | 發布 JSON 不得含 HTML、script 或事件屬性。 | 惡意 fixture 經處理後只能以純文字呈現或被拒絕。 |
| REQ-D-006 | JSON 應包含 provenance metadata。 | 至少包含 `schemaVersion`、`source`、`queryMode`、`fetchedAt`、`recordCount`、`sha256`。 |

### 4.3 資安需求

| ID | 規格 | 強制控制 |
|---|---|---|
| REQ-S-001 | 不得接受任意 URL 或 redirect 到非允許來源。 | 固定 origin、固定 path、`redirect: manual`、逐跳驗證。 |
| REQ-S-002 | 不得在 repository、artifact 或 bundle 中存在秘密。 | 移除 Gemini key；secret scan；bundle 字串檢查。 |
| REQ-S-003 | 外部 HTML 一律視為不受信任輸入。 | schema allowlist、長度上限、React text rendering、禁止 `dangerouslySetInnerHTML`。 |
| REQ-S-004 | Actions 使用最小權限。 | CI `contents: read`；部署 job 才有 `pages: write` 與 `id-token: write`。 |
| REQ-S-005 | 所有 Actions 必須固定到完整 commit SHA。 | repository policy 與 workflow lint 同時阻擋 tag-based action。 |
| REQ-S-006 | 供應鏈弱點必須在合併前阻擋。 | lockfile、Dependabot、dependency review、`npm audit --audit-level=high`、CodeQL。 |
| REQ-S-007 | 瀏覽器端採同源資源與限制型 CSP。 | 禁止 inline script 與 `unsafe-eval`；`connect-src 'self'`；無第三方 runtime CDN。 |
| REQ-S-008 | 發布必須可追溯且不可由 PR 程式碼取得寫入權限。 | fork PR 不執行 privileged deploy；environment protection；artifact 與 run 可追溯。 |

## 五、資料契約

建議以 TypeScript schema library 建立單一真實來源，再輸出 JSON Schema。前端讀取時仍須驗證，避免錯誤 artifact 造成畫面失效。

```json
{
  "schemaVersion": "1.0.0",
  "source": "https://web.pcc.gov.tw/",
  "queryMode": "isNow",
  "fetchedAt": "2026-07-24T08:17:00+08:00",
  "recordCount": 5,
  "sha256": "<64 個十六進位字元>",
  "tenders": [
    {
      "id": "115HJ08530081300520",
      "name": "標案名稱",
      "method": "公開招標",
      "budget": 21389616,
      "announcedDate": "2026-07-24",
      "deadlineDate": "2026-08-07",
      "link": "https://web.pcc.gov.tw/prkms/..."
    }
  ]
}
```

必要限制：

- `id`、`name`、`method` 必須為去除控制字元後的非空純文字。
- `budget` 必須為有限、非負、安全整數；不得使用 `NaN` 或無限值。
- 日期轉換須明確處理民國年，不接受 JavaScript 自動猜測。
- `recordCount` 必須等於 `tenders.length`。
- `sha256` 針對 canonicalized tender array 計算，不包含自身欄位。
- 重複鍵建議採 `id + announcedDate + link`，重複資料應阻擋或明確去重。

## 六、威脅模型與安全設計

### 6.1 信任邊界

| 邊界 | 威脅 | 控制 |
|---|---|---|
| 政府網站 → Actions runner | 惡意／異常 HTML、結構漂移、超大回應、慢速回應 | 固定 host、逾時、大小上限、Content-Type、redirect 驗證、fixture regression |
| npm／Actions → Build | 套件或 Action 供應鏈遭竄改 | lockfile、完整 SHA、Dependabot、dependency review、CodeQL、最小權限 |
| Build → Pages artifact | 錯誤資料、秘密、source map、非預期檔案被發布 | artifact allowlist、bundle secret scan、禁止 production source map、manifest 稽核 |
| JSON → React DOM | XSS、惡意 URL、控制字元 | schema、URL allowlist、React escaping、禁止 raw HTML |
| 使用者 → Query string | DOM XSS、效能耗用、破壞初始狀態 | 長度限制、純字串處理、URLSearchParams、無 HTML 注入 |

### 6.2 主要安全測試案例

| ID | 攻擊／失敗情境 | 預期結果 |
|---|---|---|
| SEC-T-001 | tender link 為 `javascript:`、`data:` 或其他 host | 資料產生失敗，不發布。 |
| SEC-T-002 | 上游回傳 30x 到 localhost、私有 IP 或非 PCC host | redirect 被拒絕。 |
| SEC-T-003 | 回應超過設定大小或逾時 | 中止擷取，保留上一版。 |
| SEC-T-004 | 名稱含 `<script>`、事件屬性或 Unicode 控制字元 | 被拒絕或以不可執行純文字安全呈現。 |
| SEC-T-005 | JSON schema 欄位缺漏、負預算、無限值或錯誤日期 | contract test 失敗。 |
| SEC-T-006 | workflow 使用可移動 tag 或過寬權限 | workflow lint／policy 失敗。 |
| SEC-T-007 | bundle 含 `GEMINI_API_KEY`、token pattern 或 `.env` 內容 | CI 失敗且禁止部署。 |
| SEC-T-008 | Pull Request 嘗試修改擷取腳本並取得 Pages 寫入權限 | PR 僅執行 read-only CI，不執行 privileged deployment。 |

### 6.3 GitHub Pages 的標頭限制

GitHub Pages 支援 HTTPS enforcement，但 repository 目前無法自行定義完整的 response headers。使用 `<meta http-equiv="Content-Security-Policy">` 可提供大部分 XSS 防禦，但不能實作 `frame-ancestors`、sandbox 或 CSP reporting。

因此分成兩級驗收：

- **Level A—純 Pages 必過：** HTTPS、無 mixed content、CSP meta、無 inline script、無 `unsafe-eval`、同源資源、無秘密、XSS 負向測試、SAST／SCA／DAST 應用層測試。
- **Level B—嚴格標頭掃描：** 若稽核要求 CSP response header、HSTS、X-Frame-Options／`frame-ancestors`、Permissions-Policy、Cross-Origin policies，則在自訂網域前增加可設定標頭的 CDN／反向代理，或改採支援 `_headers` 的靜態主機。

此限制必須在 Sprint 0 由資安單位確認；不能在結案時才以風險接受補件。

## 七、TDD 實作策略

### 7.1 Red—Green—Refactor 規則

1. 每個需求先建立失敗測試，測試名稱包含需求 ID。
2. 只實作讓測試通過的最小程式碼。
3. 測試通過後才能重構；重構不得降低 coverage 或移除負向案例。
4. 每次解析規則修正，都先新增能重現上游變動的 fixture。
5. Bug 修正必須先有 regression test，不能只人工確認。

### 7.2 測試分層

| 層級 | 工具建議 | 重點 |
|---|---|---|
| Unit | Vitest | 日期轉換、金額解析、文字清理、URL allowlist、hash、統計計算。 |
| Parser fixture | Vitest＋Cheerio | 正常列、缺欄、欄位順序變動、惡意內容、零資料及 100 筆上限。 |
| Contract | JSON Schema／Zod | 生產者與消費者共用契約；錯誤資料必須 fail closed。 |
| Component | Testing Library | 初始全資料、篩選、空狀態、過期狀態、錯誤 JSON。 |
| E2E | Playwright | GitHub Pages base path、桌機／手機、重新載入、外部連結、安全 DOM。 |
| Accessibility | axe-core＋Playwright | WCAG 2.2 AA 自動化規則、鍵盤操作、語意標題與圖表替代資訊。 |
| Security | CodeQL／dependency review／ZAP baseline | SAST、SCA、DOM XSS、CSP、公開檔案與秘密檢查。 |

### 7.3 最低測試集合

- `REQ-F-001`：無 query parameter 時顯示全部 fixture 資料。
- `REQ-F-002`：搜尋案名、案號、方法與清除篩選。
- `REQ-F-003`：新鮮、過期及無效時間戳狀態。
- `REQ-F-004`：重新整理只請求 Pages 同源 JSON。
- `REQ-F-006`：`isNow`／`isSpdt` URL builder 快照與語意測試。
- `REQ-D-001`：正確 schema 通過；每個必要欄位缺失均失敗。
- `REQ-D-002`：scheme、host、port、username、redirect 負向測試。
- `REQ-D-003`：擷取失敗時 deploy job 不執行。
- `REQ-D-004`：解析成功率低於門檻時 fail closed。
- `REQ-D-005`：script、事件屬性、HTML entity、控制字元 fixture。
- `REQ-S-002`：dist 與 artifact secret pattern scan。
- `REQ-S-004`：workflow permission 靜態測試。
- `REQ-S-005`：Action reference 必須為 40 字元完整 SHA。
- `REQ-S-007`：CSP meta 存在且不含 `unsafe-eval`／inline script。
- 視覺回歸：1440×1000 與 390×844。
- Smoke：部署後 JSON、JS、CSS、404 與 base path 全部正確。

## 八、CI/CD 與發布閘門

### 8.1 Pull Request 閘門

以下任一失敗即禁止合併：

1. `npm ci` 與 lockfile immutable check。
2. format、ESLint、TypeScript strict typecheck。
3. unit、parser fixture、contract、component test。
4. coverage 門檻。
5. production build 與 bundle manifest／secret scan。
6. CodeQL `javascript-typescript` 與 GitHub Actions 分析。
7. dependency review 與 Critical／High vulnerability gate。
8. workflow permissions、完整 SHA 與危險 expression lint。
9. Playwright E2E、axe accessibility 與 CSP smoke test。

### 8.2 排程發布閘門

```text
fetch → validate source → parse → schema → security tests
      → build → E2E → artifact manifest → deploy
```

發布 job 僅在前面所有工作成功後執行，並使用：

- `contents: read`
- `pages: write`
- `id-token: write`
- GitHub `github-pages` environment
- `concurrency` 防止同時發布
- 完整 SHA 固定的官方 Actions
- artifact retention 與 deployment URL 紀錄

建議排程避開整點高峰，例如平日 `08:17–20:17 Asia/Taipei` 每小時執行；UI 顯示實際 `fetchedAt`，不能把排程時間當成成功時間。

### 8.3 失敗策略

- 上游不可用、零資料異常、schema 失敗或安全測試失敗：**不發布**。
- 解析筆數相較最近成功版本大幅下降：**阻擋並要求人工確認**。
- 僅 UI 建置失敗：**不影響既有 Pages 版本**。
- 連續三次失敗：建立 GitHub Issue 或通知維護者。
- 恢復時必須保留失敗 run、測試報告與資料摘要作為稽核證據。

## 九、執行階段與交付物

| 階段 | 工作內容 | 主要交付物 | Exit criteria | 工期 |
|---|---|---|---|---:|
| Sprint 0 | 確認「當日／等標期內」、Pages header 驗收與資料更新 SLA。 | requirements、ADR、風險接受／補償決策 | 產品、開發、資安共同核准。 | 1 日 |
| Sprint 1 | 建立 schema、固定來源 fetcher、parser fixture 與 provenance。 | contracts、fetch script、fixtures、unit tests | 解析核心 coverage ≥ 95%，所有安全負向測試通過。 | 2 日 |
| Sprint 2 | 改造前端讀取靜態 JSON，修正初始搜尋、錯誤與過期狀態。 | tenderService、UI components、component tests | 無 `/api/tenders`、無 Gemini、base path E2E 通過。 | 1.5 日 |
| Sprint 3 | 建立 CI、CodeQL、dependency review、secret scan 與 Pages workflow。 | workflows、Dependabot、artifact policy | PR read-only、deploy 最小權限、Actions 全部 SHA pin。 | 1.5 日 |
| Sprint 4 | DAST、可及性、響應式、故障演練與文件追溯。 | test reports、traceability、runbook | 所有驗收閘門通過，無 Critical／High 未結案。 | 1.5 日 |
| Cutover | 啟用 Pages、HTTPS、environment protection 與監測。 | production URL、release record、rollback evidence | 連續三次排程成功，rollback 演練完成。 | 0.5–1 日 |

**基準估算：8 個工程人日；含上游 HTML 變動、資安複測與審查緩衝後，建議排定 10 個工程人日。**

## 十、程式碼修改清單

### 10.1 移除

- `server.ts`
- `src/services/geminiService.ts`
- `@google/genai`、`express`、`dotenv` 與伺服器專用相依
- Vite 中 `process.env.GEMINI_API_KEY` 注入
- `/api/tenders` 呼叫及任意 URL 參數
- 固定 100% 信心分數與不正確的 debug 顯示
- production source map、外部 Google Fonts runtime 請求

### 10.2 新增

- `scripts/fetch-tenders.ts`
- `src/contracts/tender.ts`
- `src/services/tenderService.ts`
- `tests/fixtures/*.html`
- `tests/security/*.test.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/data-and-pages.yml`
- `.github/workflows/codeql.yml`
- `.github/dependabot.yml`
- CSP meta、資料過期提示、資料來源與非官方聲明
- `docs/specs/001-pages-migration/` 下的 SDD 文件

### 10.3 修改

- `vite.config.ts`：依 repository name 設定 GitHub Pages `base`。
- `src/App.tsx`：拆分資料載入、KPI、圖表及列表；預設搜尋改為空字串。
- `src/types.ts`：由 schema 推導型別，補齊 `link` 與 provenance。
- `package.json`：建立 `test`、`test:coverage`、`test:e2e`、`security`、`fetch:data` 與 `build:pages` scripts。
- `index.html`：`lang="zh-TW"`、CSP meta、referrer policy 與基本 SEO metadata。
- `README.md`：改為架構、開發、測試、部署、事故處理與資料來源說明。

## 十一、需求—測試追溯矩陣

| 需求 | 設計元件 | 測試證據 | 發布閘門 |
|---|---|---|---|
| REQ-F-001～006 | App、tenderService、query ADR | component＋E2E | CI／E2E |
| REQ-D-001～006 | schema、parser、provenance | contract＋fixture | data validation |
| REQ-S-001～003 | fixed fetcher、URL policy、React rendering | security unit＋ZAP | security job |
| REQ-S-004～006 | workflow、lockfile、Dependabot、CodeQL | workflow lint＋SCA | branch protection |
| REQ-S-007 | index CSP、same-origin assets | CSP smoke＋E2E | build／DAST |
| REQ-S-008 | environment、permissions、artifact | permission test＋deployment record | protected deploy |

完整追溯文件必須列出實際測試檔名、test ID、最後執行 run URL、結果及例外核准期限。

## 十二、驗收與資安測試清單

### 12.1 必過

- [ ] 功能需求與資料需求全部通過。
- [ ] 不存在公開應用程式後端、任意 URL fetch 或 SSRF 入口。
- [ ] repository、Git history、Actions log、dist 與 artifact 均無秘密。
- [ ] 所有外部連結均為允許的 PCC HTTPS URL。
- [ ] 無 `dangerouslySetInnerHTML`、inline script 或 `unsafe-eval`。
- [ ] CodeQL、dependency review、secret scan 無 Critical／High 未處理項目。
- [ ] coverage、E2E、axe、CSP、base path 與 smoke test 達標。
- [ ] GitHub Actions 最小權限、完整 SHA、protected environment 已啟用。
- [ ] HTTPS enforcement 已啟用，且不存在 mixed content。
- [ ] 失敗不發布、上一版保留與 rollback 已完成演練。

### 12.2 有條件項目

- [ ] 資安單位確認純 Pages 的 response header 限制是否可接受。
- [ ] 若不可接受，已完成自訂網域＋CDN header policy，並重新執行 header scan。
- [ ] 若 DAST 工具要求伺服器端 CSP reporting，已有替代主機或正式風險接受。
- [ ] 若 repository 為 public，確認發布 JSON 不含機敏、受限或不宜再散布內容。

### 12.3 不接受的結案方式

- 以「靜態網站所以沒有風險」取代威脅模型。
- 以 `@ts-ignore`、停用測試或降低 coverage 通過 CI。
- 將高風險弱點列為「之後處理」但沒有 owner、期限與正式核准。
- 將 API key 改名後繼續放在 Vite environment variable。
- 以 CSP meta 宣稱已涵蓋 `frame-ancestors` 或完整 security headers。

## 十三、風險與因應

| 風險 | 機率／影響 | 因應 |
|---|---|---|
| 政府採購網 HTML 改版 | 中／高 | fixture、結構漂移門檻、失敗不發布、維護 runbook。 |
| Actions 排程延遲或停用 | 中／中 | 顯示 `fetchedAt`、手動觸發、連續失敗告警、SLA 不承諾秒級。 |
| Pages 安全標頭不符掃描政策 | 高／中至高 | Sprint 0 決策；必要時加入可設定標頭的 CDN／反向代理。 |
| 供應鏈相依遭污染 | 低至中／高 | lockfile、SHA pin、最小權限、CodeQL、dependency review。 |
| 空資料被誤判為成功 | 中／高 | 與歷史基線比較、零筆異常門檻、人工核准。 |
| 公開資料被誤認為官方資訊 | 中／中 | 明確來源、更新時間、非官方聲明與原始標案連結。 |

## 十四、核准事項

專案開始前需取得以下決策：

1. 儀表板定義為「當日公告」或「目前等標期內」。
2. 可接受的資料更新頻率與過期門檻。
3. 資安測試是否強制要求可自訂的 HTTP response headers。
4. repository 採 public 或 private，以及 Pages 的公開可見性。
5. Critical／High 一律阻擋；Medium 例外的核准人、期限與複測規則。
6. 失敗通知的 owner 與最長處理時間。

::: {.approval-box}
### 建議核准文字

同意以 GitHub Actions 定時產生經驗證的靜態資料，並由 GitHub Pages 發布；同意移除 Express、Gemini SDK、前端 API 金鑰與任意 URL 代理。開發採 SDD 規格追溯及 TDD 測試先行，所有資安、品質與部署閘門通過後始得上線。若資安驗收要求 GitHub Pages 無法提供的 response headers，則啟用自訂網域前置 CDN／反向代理，或改採可設定標頭的靜態主機，不以風險未揭露方式結案。
:::

## 十五、參考基準

- [GitHub Pages 是靜態網站託管服務](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Vite 官方 GitHub Pages 部署指南](https://vite.dev/guide/static-deploy.html)
- [GitHub Actions 排程事件與限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Actions 安全使用與完整 SHA 固定](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub CodeQL code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning)
- [GitHub Pages HTTPS enforcement](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [GitHub Pages custom HTTP headers 現有限制](https://github.com/orgs/community/discussions/54257)

---

**文件版本：** 1.0  
**提案日期：** 2026-07-24  
**適用專案：** 國防部標案即時儀表板（AI Studio 匯出版）  
**下一步：** 核准 Sprint 0 決策項目後，建立 `docs/specs/001-pages-migration/` 規格套件並進入第一個 failing test。
