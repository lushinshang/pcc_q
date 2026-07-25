# 國防部當日公告標案儀表板

以「方案 A」運作的純靜態 React／Vite 儀表板。GitHub Actions 不限機關逐頁擷取政府電子採購網，例行查詢用 `dateType=isNow`（當日），首次執行（無可用前一版基準）改用 `dateType=isDate` 一次回填過去 30 天（見 [ADR-002](docs/specs/001-pages-migration/adr-first-run-backfill.md)）。資料經固定來源限制、HTML parser、機關白名單過濾、Zod 契約與 SHA-256 驗證後，與前一版合併、剪枝超過 30 天的舊記錄，發布到 GitHub Pages。瀏覽器只讀取同源 `data/tenders.json`，可用機關（預設國防部）與日期範圍（當日／一週／一個月，預設一週）在本地端篩選，結果依公告日期新到舊排序；頁面另有可展開的說明面板列出完整機關白名單與同步排程。瀏覽器不會直接存取政府採購網。

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

這是獨立 live smoke／資料產生指令。來源 URL 由程式固定建立，不接受 CLI 或環境變數傳入完整 URL。沒有可用前一版基準時（真的第一次執行，或前一版累積 0 筆／schema 不相容）會改用日期區間查詢一次回填過去 30 天，實測約需 20 分鐘且逐頁遞增，回填失敗時自動退回只抓當日；平常則只查當日並與前一版合併、剪枝超過 30 天的舊記錄。成功時以原子 rename 更新 JSON；逾時（含重試後）、redirect、錯誤 Content-Type、超量、拒絕比例過高、schema/hash 失敗、分頁連結跳出固定路徑，或同日新增筆數較最近 Pages 版本下降超過 50% 時，會以非零狀態停止。

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

`.github/workflows/data-and-pages.yml` 在 `main` push、手動觸發，以及平日 `Asia/Taipei` 每 3 小時（`0,3,6,9,12,15,18,21` 點）執行，分三個 job：

1. `fetch-data`（逾時 60 分鐘）：只做資料擷取與驗證，把 `public/data/tenders.json` 以 artifact 交給下一個 job；首次 30 天回填可能需要約 20 分鐘，因此獨立出來，不擠壓下面的品質閘門時限。
2. `build`（逾時 25 分鐘，`needs: fetch-data`）：下載該 artifact 後執行 format、lint、strict typecheck、coverage、workflow policy、build、HTML validation、dist scan、E2E 與 audit，全部通過才把只含 `dist` 的 artifact 交出去。
3. `deploy`（`needs: build`）：只有這個 job 取得 `pages: write` 與 `id-token: write`，發布到 GitHub Pages。

Repository 的 Pages Source 必須設為 **GitHub Actions**。部署 environment 固定為 `github-pages`，建議在 GitHub 設定 environment protection rules。CI、dependency review、CodeQL 與 Dependabot 設定均位於 `.github/`；所有 Actions 均鎖定已核對的完整 commit SHA。

Project Pages 預設使用 `/<repository>/`。若使用自訂網域、使用者 Pages 或其他根路徑部署，將 repository variable `PAGES_BASE_PATH` 設為 `/`；也可設為經驗證的同源目錄路徑（例如 `/portal/`）。完整 URL、`..` 與 protocol-relative 值會在 build 時被拒絕。

### 交接給負責上傳的 AI

目前交付目錄刻意不包含 `.git`、remote 或 GitHub credential。負責上傳者必須先取得使用者確認的**既有** `OWNER/REPOSITORY` 與有效登入，不得猜測或自行建立其他 repository。遠端已有歷史時應 clone 後以功能分支／PR 合併；遠端為空時也應先建立最小 `main`，再用 PR 讓 dependency review 與 CodeQL 實際執行。

完整的安全上傳、Pages 設定、workflow 監看與 production 驗收步驟見 [GitHub 上傳與 Production 交接手冊](docs/GITHUB-UPLOAD-HANDOFF.md)。

## 執行進度與 Production 部署驗收報告

本專案已完成從 Google AI Studio 原始版本（含 Express/Gemini/API Key）至純靜態 **Level A 安全架構** 的改造，並已順利完成 GitHub 上傳、PR 安全審查、Actions 自動化部署與 Production Live 驗收。

### 1. 架構改造與安全邊界

- **資料流轉**：政府電子採購網 (PCC)，不限機關逐頁擷取（例行 `isNow` 當日／首次回填 `isDate` 過去 30 天）→ GitHub Actions 於平日 Asia/Taipei 每 3 小時定時擷取 → HTML Secure Parser & 機關白名單過濾 & Zod 契約驗證 → 與前一版合併並剪枝超過 30 天的資料，產出版本化 `data/tenders.json` (含 SHA-256) → Vite Production Build → 部署至 GitHub Pages。
- **零公開 API / 無後端**：已徹底刪除 Express、Server.ts 與 Gemini SDK；瀏覽器僅讀取同源 `data/tenders.json`，不直接發出任何對外 PCC 或 API 請求。
- **純靜態 Pages 安全**：採純 GitHub Pages 原生安全控制，不掛載 Cloudflare、Vercel、Netlify 或代理服務。

### 2. GitHub 上傳與 CI/CD 安全管線紀錄

- **目標 Repository**：[lushinshang/pcc_q](https://github.com/lushinshang/pcc_q) (Public)
- **Pull Request**：[PR #1 (feat/pages-scheme-a -> main)](https://github.com/lushinshang/pcc_q/pull/1) - head commit 之 Quality and security gates、Dependency review、CodeQL 分析（javascript-typescript／actions）均為 success 後無衝突合併；main 分支目前未啟用 branch protection，因此這些 checks 屬於 CI 通過紀錄，非 GitHub 強制的 required status checks。
- **安全檢查通過項目**：
  - **CI / Quality & Security Gates**：ESLint 0 warnings、TypeScript Strict 0 errors、Vitest 122/122 測試全過 (Coverage: Stmts 95.77%, Branches 92.28%, Functions 96.03%, Lines 96.27%)。
  - **CodeQL 分析**：`javascript-typescript` 與 `actions` 雙軌分析通過，無未處理之 High/Critical 漏洞。
  - **Dependency Review**：已啟用 Dependency Graph 並完成依賴分析，0 vulnerabilities。
  - **Git History Secret Scan**：Gitleaks v8.30.1 於 `npm run security:history`（CI 每次 push 皆執行）完成全歷史掃描，零發現 (no leaks found)；掃描涵蓋的 commit 數會隨每次 push 增加，請以該次 CI run 的實際輸出為準，不在此固定數字。

### 3. Production 部署與 Live 驗收數據

- **Production URL**：[https://lushinshang.github.io/pcc_q/](https://lushinshang.github.io/pcc_q/)
- **Deployment Run URL**：[https://github.com/lushinshang/pcc_q/actions/runs/30152099903](https://github.com/lushinshang/pcc_q/actions/runs/30152099903)
- **最新成功部署 Commit SHA**：`fe41d054006399f5a5760e2df82c2c77c7762382`（此為 Deployment Run URL 對應的 commit；main HEAD 可能領先於此，請以 `gh api repos/lushinshang/pcc_q/deployments` 查詢的最新 deployment 為準）
- **最後驗收時間**：2026-07-25 17:04 (Asia/Taipei)

#### 14 項 Live Production 實體驗收對照表

| 驗收項目                       | 驗收規範細節                                                                    | Live 測試結果 | 證據 / 數據                                           |
| :----------------------------- | :------------------------------------------------------------------------------ | :------------ | :---------------------------------------------------- |
| **靜態資產載入**               | HTML、JS、CSS 及 `data/tenders.json` 回應 200 OK                                | **通過**      | 無 HTTP 錯誤或 Mixed content                          |
| **Base Path 正確性**           | Project Pages 資產載入路徑前綴為 `/pcc_q/`                                      | **通過**      | `dist` 靜態路徑完美對齊                               |
| **真實標案資料**               | 成功呈現 30 天滾動累積資料集（包含正確 `fetchedAt` 與 `recordCount`）           | **通過**      | 累積 `recordCount: 15892` 筆，SHA-256 驗證比對一致    |
| **查詢模式驗證**               | 例行查詢 `queryMode` 為 `isNow`；首次回填為 `isDate`                            | **通過**      | 正確顯示「當日公告 (isNow)」狀態                      |
| **預設篩選與網址搜尋**         | 預設機關＝國防部、日期範圍＝一週；網址包含 `?q=綜合任務` 仍安全顯示預設篩選結果 | **通過**      | 實測顯示「234／15892 筆」，搜尋條件正確解耦與獨立     |
| **排序**                       | 標案列表依公告日期由新到舊排序                                                  | **通過**      | Playwright DOM 檢查最新公告日期排在最前               |
| **新鮮度控管**                 | 資料在 2 小時新鮮度內顯示綠色新鮮標誌；超過 2 小時提示警示                      | **通過**      | 顯示「資料在兩小時新鮮度內」                          |
| **同源請求限制**               | 頁面重新載入與點擊重新載入僅發出同源 `data/tenders.json` 請求                   | **通過**      | 網路監聽 0 筆 `/api/tenders` 或 `web.pcc.gov.tw` 請求 |
| **外部連結安全**               | 點擊標案開啟政府採購網連結均具備 `rel="noopener noreferrer"`                    | **通過**      | Playwright DOM 檢查 100% 符合                         |
| **無障礙規範 (a11y)**          | 符合 WCAG / axe-core 規範                                                       | **通過**      | axe-core 檢測 serious / critical 違規數為 0           |
| **跨裝置響應式與無溢位**       | 桌機 1440×1000 與手機 390×844 Viewport 均零水平溢位                             | **通過**      | Playwright E2E 檢測 `scrollWidth == clientWidth` 通過 |
| **CSP 安全政策**               | 依據 Content-Security-Policy meta 規則運作                                      | **通過**      | Console 0 筆 CSP violation 違規警告                   |
| **Production Artifact 乾淨度** | Pages Artifact 僅含 `dist` 內容                                                 | **通過**      | 4 個建置檔案，無 Source Map / Fixture / `.env` / 秘密 |
| **維護手冊同步**               | 驗收結果已完整同步至 `docs/specs/001-pages-migration/runbook.md`                | **通過**      | Runbook 已完成即時紀錄                                |

### 4. 紅隊資安複查與改善紀錄（OPERATION LEDGERWATCH）

Production 上線後另做了一輪獨立紅隊視角複查，找到三項違反本專案「任何異常都該 fail closed」核心原則的具體缺口——不是臆測，都附檔案行號與可重現步驟。完整測試計畫、攻擊面地圖與逐項改善規劃（依 SDD 先定義設計變更、TDD 先寫失敗測試再實作的既有慣例）見 [紅隊資安測試計畫](docs/security/red-team-test-plan.html)。

| ID     | 缺口                                                                                                                                | 嚴重度 | 修復內容                                                                                                              | 狀態         |
| :----- | :---------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------------------------------------------------------------------------------------------------------------------- | :----------- |
| RT-001 | 確認零筆判斷用樸素子字串比對，標記文字塞進 `<script>`／註解也會被誤判為合法零筆                                                     | HIGH   | 改為 `td.tb_b2` 內容標記、沒有任何標案資料列及 `#pagebanner` 顯示「共有 0 筆資料」三項證據須同時成立                  | **VERIFIED** |
| RT-002 | `fetch-tenders.ts` 的 bootstrap／fallback 核心流程完全沒有測試與 coverage，正是先前「空資料集導致回填永遠不觸發」事故未被攔下的根因 | HIGH   | 抽出可注入依賴的 `runFetchPipeline()`，CLI 與 exit code 邏輯分離；新增 FETCH-T-001～007，含「雙重失敗不寫檔」安全邊界 | **VERIFIED** |
| RT-003 | 分頁擷取跑滿 `maxPages` 上限時靜默回傳，即使最後一頁仍有下一頁連結                                                                  | MEDIUM | 迴圈跑滿上限但仍偵測到下一頁時改為拋錯 fail closed，交由既有 bootstrap fallback 自動退回例行查詢                      | **VERIFIED** |

修復由 Codex CLI 在沙箱環境（無對外網路、未觸發 GitHub Actions、未連線 PCC）依既定優先序 RT-002 → RT-001 → RT-003 完成，每項獨立 commit；完成後重新執行全部本機品質閘門驗證（不僅採信執行方回報），結果一致：Vitest 122/122、Playwright E2E 8/8、ESLint／TypeScript／build／HTML validation 全過、`security:repo` 88 檔案零發現、`security:dist` 4 檔案零發現、修復文件階段 Gitleaks 30 commits 零洩漏、`npm audit --offline --audit-level=high` 0 vulnerabilities；README 歷程 commits 完成後再掃描 32 commits，仍為零洩漏。三項修復的程式碼改動亦逐一人工複核，確認邏輯與測試計畫規劃一致。

#### 4.1 執行前提與紀律

- 先完整閱讀紅隊計畫 §03、§04、§10，以及 `design.md`、`threat-model.md` 與現有程式碼；實作順序完全沿用既定改善規劃，沒有重新發明另一套設計。
- 一般測試只使用 repository 內 fixture／mock。RT-001 直接使用既有真實零筆 fixture `tests/fixtures/pcc-confirmed-zero.html` 的 `td.tb_b2` 與 `#pagebanner` 訊號，沒有猜測 PCC DOM，也沒有發出真實請求。
- `node_modules` 原先不存在；為了測試，以 `npm ci --offline` 從本機 npm cache 還原相依，完成後移除，不把暫時套件或 cache 納入 commit。
- 每一項修復都先保留 Red 證據，再做最小 Green 實作，重構後重跑 targeted tests、coverage、lint 與 typecheck；沒有刪除／skip 測試，也沒有放寬 coverage 門檻。

#### 4.2 RT-002：先把無法觀測的核心流程變成可測試介面

1. **Red**：先新增五個規劃要求的情境。舊程式沒有可匯入的 orchestration 函式，五項都因缺少 `runFetchPipeline()`／`fetchBootstrapOrFallback()` 而失敗。
2. **Green**：把 CLI `main()` 拆為可注入依賴的 `runFetchPipeline()`、`fetchRoutine()` 與 `fetchBootstrapOrFallback()`；pipeline 只回傳結果或拋錯，不直接 `process.exit()`。CLI 入口才把結果轉成 `process.exitCode`。
3. **安全寫入邊界**：只有解析品質、資料契約、同日驟降及最終 metadata 全部通過後，才以 temporary file + atomic rename 寫入 `tenders.json`。bootstrap 與 routine 都失敗時，測試明確確認 writer 不會被呼叫。
4. **Refactor／證據**：補上原子寫入與 ESM CLI guard 後形成 FETCH-T-001～007；`vitest.config.ts` 明確把 `scripts/fetch-tenders.ts` 納入 coverage。此階段 targeted suite 7/7 通過。
5. **Commit**：`1400b3c test(fetch): cover bootstrap orchestration for RT-002`。

#### 4.3 RT-001：零筆不是一段文字，而是多項獨立證據

1. **Red**：新增 `pcc-zero-marker-in-script.html`、`pcc-zero-marker-in-comment.html`，再加入「合法內容文字存在但缺少 `#pagebanner=0`」案例。舊 `html.includes()` 實作把三者都當成合法零筆，結果為 3 failed／13 passed。
2. **Green**：改用 Cheerio 查詢 DOM，要求：
   - 合法內容區塊 `td.tb_b2` 的可見文字正好是「無符合條件資料」；
   - 頁面沒有任何標案資料列；
   - 第一個 `#pagebanner` 的正規化文字正好是「共有 0 筆資料」。
3. **防止矯枉過正**：既有真實 fixture `pcc-confirmed-zero.html`（PAR-T-003b）仍被接受；`pcc-zero.html` 與 `pcc-field-drift.html` 仍 fail closed。
4. **Refactor／證據**：parser targeted suite 16/16；parser lines 100%、branches 94.59%。
5. **Commit**：`8396316 fix(parser): require zero-result evidence for RT-001`。

#### 4.4 RT-003：安全上限必須區分「剛好完成」與「遭到截斷」

1. **Red**：先反轉 PAG-T-005／PAG-T-011 的舊斷言。舊實作在最後允許頁仍有下一頁時錯誤 resolve，因此兩項如預期失敗。
2. **必要的測試修正**：第一版 FETCH-T-008 mock 重複回傳同一個已被消耗的 `Response`，造成 retry timeout。這是測試工具本身的缺陷，不是產品行為；改成每次 request 都建立新的 `Response` 後，才繼續驗證真正的分頁行為。這段過程保留下來，提醒後續維護者：測試也需要接受同等嚴格的因果檢查。
3. **Green**：`fetchAllPccPages()` 遇到「最後一頁沒有下一頁」立即正常回傳；只有迴圈跑滿 `maxPages` 且最後一頁仍有下一頁時，才拋出「分頁數超過安全上限，可能資料不完整」。
4. **整合證據**：PAG-T-007 確認總頁數剛好等於上限不會誤報；FETCH-T-008 製造 400 頁鏈，確認 bootstrap 捕捉錯誤、改走 routine，且不發布 `TRUNCATED-BOOTSTRAP` 資料。例行與 bootstrap 共用同一個 fail-closed 實作。
5. **Refactor／證據**：`fetch-tenders.test.ts` + `pcc-pagination.test.ts` targeted suite 22/22。
6. **Commit**：`7392440 fix(fetch): fail closed at pagination limits for RT-003`。

#### 4.5 完整驗證過程與沙箱例外

| 階段                      | 實際發生的事情                                                                                                                  | 處理與結果                                                                                                                                                                   |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 第一次 `npm run validate` | Prettier 找到 RT-003 測試檔排版差異                                                                                             | 修正後 amend 回 RT-003 commit，從頭重跑                                                                                                                                      |
| 第二次 `npm run validate` | format、lint、typecheck、122 tests、repo scan、workflow policy 均通過；actionlint 因沙箱 DNS 無法查詢 `proxy.golang.org` 而停止 | 依沙箱規則尋找 Go module cache，從 `actionlint@v1.7.12/cmd/actionlint` 以 `GOPROXY=off GOFLAGS=-mod=mod go run .` 離線驗證三份 workflow；再逐項完成 build、HTML 與 dist 閘門 |
| Gitleaks history          | 同樣不能依賴對外下載                                                                                                            | 由本機 `gitleaks/v8@v8.30.1` module cache 離線掃描；§10 文件 commit 後為 30 commits，README 歷程 commits 後最終重掃 32 commits，均為零洩漏                                   |
| Playwright 第一次啟動     | 沙箱禁止 Vite preview 綁定 `127.0.0.1:4173`，回傳 `EPERM`                                                                       | 只提升本機 loopback server 所需權限重跑；desktop／mobile、axe、CSP、overflow 8/8 通過，未連線 PCC                                                                            |
| Dependency audit          | 沙箱無網路                                                                                                                      | `npm audit --offline --audit-level=high`，0 vulnerabilities                                                                                                                  |
| 最終清理                  | 本輪暫時還原 255 MB `node_modules`                                                                                              | 全部驗證結束後移除；Git working tree 保持乾淨                                                                                                                                |

最終 coverage 為 statements 95.77%、lines 96.27%、branches 92.28%、functions 96.03%，高於既有 90%／90%／85%／90% 門檻。完整改善狀態與規格同步 commit 為 `13e6454 docs(security): verify RT-001 through RT-003 remediation`；初版 README 歷程整理為 `8797b8f docs(readme): record red-team remediation process (OPERATION LEDGERWATCH)`。本輪所有 commit 都只留在本機，沒有 push、force push、重寫既有歷史或觸發 GitHub Actions。

這次留下的工程教訓：

- coverage 數字再高，如果關鍵 CLI orchestration 根本不在 `include`，仍可能存在真正的測試盲區。
- fail closed 不能依賴容易被偽造或殘留的單一自由文字；安全判斷要建立在彼此獨立、結構化的證據上。
- 「安全上限」不是正常成功條件；到達上限時必須證明資料自然結束，否則就是截斷。
- Red test 本身也可能有 fixture／mock 缺陷；應修正測試因果，而不是把 timeout 誤稱為產品缺陷。
- 沙箱限制可以用離線 cache 與最小權限替代驗證，但必須如實記錄，不能把未執行項目假稱通過。

**尚待人工確認**：RT-002／RT-003 涉及擷取管線邏輯，需在有 GitHub 與 PCC 網路權限的真實環境手動執行一次 `data-and-pages` 的 `workflow_dispatch`，驗證真實擷取及 production deployment。這次本機工作沒有執行該步驟，也不能以 deterministic tests 取代它。

## 故障處理

- 擷取失敗：不要略過驗證或手動發布空資料；既有 Pages deployment 會保留。
- parser 因上游改版失敗：保存不含 cookie／secret 的最小 HTML fixture，先加入 regression test，再更新 parser。
- 前端重新載入失敗：已有資料時保留上一版並顯示警告；沒有有效資料時顯示明確錯誤狀態。
- 回復：回到已知良好 commit 後重新執行 workflow，不 force push、不改寫歷史。

完整操作與事故程序見 [runbook](docs/specs/001-pages-migration/runbook.md)。

## GitHub Pages 平台限制

純 GitHub Pages 無法由 repository 自訂完整 HTTP response headers。本方案的 CSP 以 `<meta http-equiv>` 落實，因此不能宣稱已設定 response-header 形式的 `Content-Security-Policy`，也不能用 meta 實作 `frame-ancestors`。HSTS、`X-Frame-Options`、`Permissions-Policy`、完整 `Referrer-Policy` response header 與 CSP reporting 同樣不在本專案控制範圍內。這是 Level A 的已知殘餘風險；未經另行授權不加入 CDN、反向代理或其他主機服務。

## 規格

權威設計與需求位於 [docs/specs/001-pages-migration](docs/specs/001-pages-migration/)，包含 requirements、Software Design Description、threat model、JSON Schema、test plan、traceability、[ADR-001（查詢模式）](docs/specs/001-pages-migration/adr-query-mode.md)、[ADR-002（首次執行日期區間回填）](docs/specs/001-pages-migration/adr-first-run-backfill.md) 與 runbook。

產品／系統分析層級的正式文件（PRD／SRS／SDD／STP）位於 [docs/pm](docs/pm/)，補齊產品層決策與正式文件結構，逐條需求與測試 ID 仍以上述 `docs/specs` 為權威來源，詳見 [docs/pm/README.md](docs/pm/README.md) 的文件關係說明。

紅隊資安測試計畫與改善規劃位於 [docs/security/red-team-test-plan.html](docs/security/red-team-test-plan.html)，見「執行進度與 Production 部署驗收報告」第 4 節。

## 目錄結構

- `src/`、`scripts/`、`tests/`、`config/`、`public/`、`docs/`：專案本體（程式碼、測試、規格文件）。
- `qa/`：E2E 測試產生的最新視覺驗證截圖（`npm run test:e2e` 會覆寫）。
- `_archive/`：與目前專案執行無關、僅供歷史參考的檔案（例如最初的 SDD/TDD/security 提案文件），不被任何 script、test 或 CI 引用。
