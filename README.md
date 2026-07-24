# 國防部當日公告標案儀表板

以「方案 A」運作的純靜態 React／Vite 儀表板。GitHub Actions 依 `dateType=isNow` 與國防部機關代碼 `orgId=3.5` 擷取政府電子採購網，經固定來源限制、HTML parser、Zod 契約與 SHA-256 驗證後，才把 `dist` 發布到 GitHub Pages。瀏覽器只讀取同源 `data/tenders.json`，不會直接存取政府採購網。

本站為非官方公開資料整理，內容以政府電子採購網公告為準。不使用 Gemini 或其他生成式 AI API，也不需要任何 API key。

## 本機開發

需求：Node.js 24 以上、npm。

```bash
npm ci
node --import tsx scripts/create-sample-data.ts
npm run dev
```

`public/data/tenders.json` 是 deterministic fixture 產生的開發資料；一般測試不依賴政府網站。

## 資料更新

```bash
npm run fetch:data
```

這是獨立 live smoke／資料產生指令。來源 URL 由程式固定建立，不接受 CLI 或環境變數傳入完整 URL。成功時以原子 rename 更新 JSON；逾時、redirect、錯誤 Content-Type、超量、零有效資料、拒絕比例過高、schema/hash 失敗或同日筆數較最近 Pages 版本下降超過 50% 時，會以非零狀態停止。

GitHub Actions 只在工作目錄產生資料並包入 Pages artifact，不會自動 commit 資料回 `main`。

## 測試與品質閘門

```bash
npm run format
npm run lint
npm run typecheck
npm run test:coverage
npm run security:workflows
npm run workflow:lint
npm run security:repo
npm run security:history
npm run build
npm run validate:html
npm run security:dist
npm run test:e2e
npm audit --audit-level=high
```

也可用 `npm run validate` 執行除瀏覽器 E2E、Git history scan 與需連網 audit 之外的本機閘門。`security:history` 必須在 Git repository 中執行。E2E 會啟動 production preview，驗證 1440×1000 桌機、390×844 手機、axe、CSP、同源請求與水平溢位。

## GitHub Pages 部署

`.github/workflows/data-and-pages.yml` 在 `main` push、手動觸發，以及平日 `Asia/Taipei` 08:17–20:17 每小時執行。只有 fetch、format、lint、strict typecheck、coverage、workflow policy、build、HTML validation、dist scan、E2E 與 audit 全部通過後，deploy job 才能取得 `pages: write` 與 `id-token: write`，並發布只含 `dist` 的 artifact。

Repository 的 Pages Source 必須設為 **GitHub Actions**。部署 environment 固定為 `github-pages`，建議在 GitHub 設定 environment protection rules。CI、dependency review、CodeQL 與 Dependabot 設定均位於 `.github/`；所有 Actions 均鎖定已核對的完整 commit SHA。

Project Pages 預設使用 `/<repository>/`。若使用自訂網域、使用者 Pages 或其他根路徑部署，將 repository variable `PAGES_BASE_PATH` 設為 `/`；也可設為經驗證的同源目錄路徑（例如 `/portal/`）。完整 URL、`..` 與 protocol-relative 值會在 build 時被拒絕。

### 交接給負責上傳的 AI

目前交付目錄刻意不包含 `.git`、remote 或 GitHub credential。負責上傳者必須先取得使用者確認的**既有** `OWNER/REPOSITORY` 與有效登入，不得猜測或自行建立其他 repository。遠端已有歷史時應 clone 後以功能分支／PR 合併；遠端為空時也應先建立最小 `main`，再用 PR 讓 dependency review 與 CodeQL 實際執行。

完整的安全上傳、Pages 設定、workflow 監看與 production 驗收步驟見 [GitHub 上傳與 Production 交接手冊](docs/GITHUB-UPLOAD-HANDOFF.md)。

## 執行進度與 Production 部署驗收報告

本專案已完成從 Google AI Studio 原始版本（含 Express/Gemini/API Key）至純靜態 **Level A 安全架構** 的改造，並已順利完成 GitHub 上傳、PR 安全審查、Actions 自動化部署與 Production Live 驗收。

### 1. 架構改造與安全邊界

- **資料流轉**：政府電子採購網 (PCC) `dateType=isNow` & `orgId=3.5` → GitHub Actions 於平日 Asia/Taipei 08:17–20:17 定時擷取 → HTML Secure Parser & Zod 契約驗證 → 產出版本化 `data/tenders.json` (含 SHA-256) → Vite Production Build → 部署至 GitHub Pages。
- **零公開 API / 無後端**：已徹底刪除 Express、Server.ts 與 Gemini SDK；瀏覽器僅讀取同源 `data/tenders.json`，不直接發出任何對外 PCC 或 API 請求。
- **純靜態 Pages 安全**：採純 GitHub Pages 原生安全控制，不掛載 Cloudflare、Vercel、Netlify 或代理服務。

### 2. GitHub 上傳與 CI/CD 安全管線紀錄

- **目標 Repository**：[lushinshang/pcc_q](https://github.com/lushinshang/pcc_q) (Public)
- **Pull Request**：[PR #1 (feat/pages-scheme-a -> main)](https://github.com/lushinshang/pcc_q/pull/1) - head commit 之 Quality and security gates、Dependency review、CodeQL 分析（javascript-typescript／actions）均為 success 後無衝突合併；main 分支目前未啟用 branch protection，因此這些 checks 屬於 CI 通過紀錄，非 GitHub 強制的 required status checks。
- **安全檢查通過項目**：
  - **CI / Quality & Security Gates**：ESLint 0 warnings、TypeScript Strict 0 errors、Vitest 74/74 測試全過 (Coverage: Stmts 97.98%, Lines 99.28%)。
  - **CodeQL 分析**：`javascript-typescript` 與 `actions` 雙軌分析通過，無未處理之 High/Critical 漏洞。
  - **Dependency Review**：已啟用 Dependency Graph 並完成依賴分析，0 vulnerabilities。
  - **Git History Secret Scan**：Gitleaks v8.30.1 於 `npm run security:history`（CI 每次 push 皆執行）完成全歷史掃描，零發現 (no leaks found)；掃描涵蓋的 commit 數會隨每次 push 增加，請以該次 CI run 的實際輸出為準，不在此固定數字。

### 3. Production 部署與 Live 驗收數據

- **Production URL**：[https://lushinshang.github.io/pcc_q/](https://lushinshang.github.io/pcc_q/)
- **Deployment Run URL**：[https://github.com/lushinshang/pcc_q/actions/runs/30103033703](https://github.com/lushinshang/pcc_q/actions/runs/30103033703)
- **最新成功部署 Commit SHA**：`14e7bcb33980809958c8cc71eef153aa932ad285`（此為 Deployment Run URL 對應的 commit；main HEAD 可能領先於此，請以 `gh api repos/lushinshang/pcc_q/deployments` 查詢的最新 deployment 為準）
- **最後驗收時間**：2026-07-24 23:00 (Asia/Taipei)

#### 13 項 Live Production 實體驗收對照表

| 驗收項目                       | 驗收規範細節                                                     | Live 測試結果 | 證據 / 數據                                           |
| :----------------------------- | :--------------------------------------------------------------- | :------------ | :---------------------------------------------------- |
| **靜態資產載入**               | HTML、JS、CSS 及 `data/tenders.json` 回應 200 OK                 | **通過**      | 無 HTTP 錯誤或 Mixed content                          |
| **Base Path 正確性**           | Project Pages 資產載入路徑前綴為 `/pcc_q/`                       | **通過**      | `dist` 靜態路徑完美對齊                               |
| **真實標案資料**               | 成功呈現當日公告資料集（包含正確 `fetchedAt` 與 `recordCount`）  | **通過**      | 當日擷取 `recordCount: 5` 筆，SHA-256 驗證比對一致    |
| **查詢模式驗證**               | `queryMode` 為 `isNow`（當日公告）                               | **通過**      | 正確顯示「當日公告 (isNow)」狀態                      |
| **初始與網址搜尋**             | 初始搜尋固定為空；網址包含 `?q=綜合任務` 仍安全顯示當日全數資料  | **通過**      | 搜尋條件正確解耦與獨立                                |
| **新鮮度控管**                 | 資料在 2 小時新鮮度內顯示綠色新鮮標誌；超過 2 小時提示警示       | **通過**      | 顯示「資料在兩小時新鮮度內」                          |
| **同源請求限制**               | 頁面重新載入與點擊重新載入僅發出同源 `data/tenders.json` 請求    | **通過**      | 網路監聽 0 筆 `/api/tenders` 或 `web.pcc.gov.tw` 請求 |
| **外部連結安全**               | 點擊標案開啟政府採購網連結均具備 `rel="noopener noreferrer"`     | **通過**      | Playwright DOM 檢查 100% 符合                         |
| **無障礙規範 (a11y)**          | 符合 WCAG / axe-core 規範                                        | **通過**      | axe-core 檢測 serious / critical 違規數為 0           |
| **跨裝置響應式與無溢位**       | 桌機 1440×1000 與手機 390×844 Viewport 均零水平溢位              | **通過**      | Playwright E2E 檢測 `scrollWidth == clientWidth` 通過 |
| **CSP 安全政策**               | 依據 Content-Security-Policy meta 規則運作                       | **通過**      | Console 0 筆 CSP violation 違規警告                   |
| **Production Artifact 乾淨度** | Pages Artifact 僅含 `dist` 內容                                  | **通過**      | 4 個建置檔案，無 Source Map / Fixture / `.env` / 秘密 |
| **維護手冊同步**               | 驗收結果已完整同步至 `docs/specs/001-pages-migration/runbook.md` | **通過**      | Runbook 已完成即時紀錄                                |

## 故障處理

- 擷取失敗：不要略過驗證或手動發布空資料；既有 Pages deployment 會保留。
- parser 因上游改版失敗：保存不含 cookie／secret 的最小 HTML fixture，先加入 regression test，再更新 parser。
- 前端重新載入失敗：已有資料時保留上一版並顯示警告；沒有有效資料時顯示明確錯誤狀態。
- 回復：回到已知良好 commit 後重新執行 workflow，不 force push、不改寫歷史。

完整操作與事故程序見 [runbook](docs/specs/001-pages-migration/runbook.md)。

## GitHub Pages 平台限制

純 GitHub Pages 無法由 repository 自訂完整 HTTP response headers。本方案的 CSP 以 `<meta http-equiv>` 落實，因此不能宣稱已設定 response-header 形式的 `Content-Security-Policy`，也不能用 meta 實作 `frame-ancestors`。HSTS、`X-Frame-Options`、`Permissions-Policy`、完整 `Referrer-Policy` response header 與 CSP reporting 同樣不在本專案控制範圍內。這是 Level A 的已知殘餘風險；未經另行授權不加入 CDN、反向代理或其他主機服務。

## 規格

權威設計與需求位於 [docs/specs/001-pages-migration](docs/specs/001-pages-migration/)，包含 requirements、Software Design Description、threat model、JSON Schema、test plan、traceability、ADR 與 runbook。
