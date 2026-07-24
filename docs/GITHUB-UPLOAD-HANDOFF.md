# GitHub 上傳與 Production 交接手冊

本文件提供給負責上傳 GitHub 的 AI／維護者。工作目錄中的功能、SDD/TDD 文件與本機品質閘門已建置；遠端操作前仍必須由使用者提供或確認**既有** GitHub repository。不得自行猜測 owner、repository、可見性或建立新的遠端 repository。

## 給接手 AI 的執行要求

這是上傳、部署與驗收任務，不是只提供指令或分析。取得使用者確認的 repository 與有效登入後，應持續執行到下列結果都有可查證證據：

1. 專案透過非 force 的 commit／PR 進入既有 repository 的 `main`。
2. PR CI、dependency review 與 CodeQL 全部通過。
3. Git history Gitleaks、npm audit、workflow policy 與 artifact scan 沒有未處理的 Critical／High finding。
4. GitHub Pages Source 為 GitHub Actions，`github-pages` environment 與最小權限 workflow 生效。
5. `data-and-pages` 取得 live PCC 資料、建置並成功部署。
6. 實際開啟 production URL，完成同源 JSON、桌機、手機、axe、CSP、過期狀態與外部連結驗收。
7. 將 production URL、run URL、commit SHA、檢查結果與時間更新回 runbook。

測試或部署失敗時應自行診斷、修正、重新驗證，不可在只完成 push 後停止。若缺少必要外部權限，只詢問使用者一次且只索取既有 `OWNER/REPOSITORY` 或 GitHub 登入；其餘安全且在範圍內的工作直接繼續。

## 不可變更的安全邊界

- 不得 force push、重寫歷史、刪除既有分支或覆蓋遠端既有檔案。
- 不得把 token、cookie、JSESSIONID、`.env`、API key 或登入資訊寫入 commit、log、artifact 或前端。
- 不得提交 `node_modules/`、`dist/`、`coverage/`、`playwright-report/` 或 `test-results/`。
- `public/data/tenders.json` 應維持 `npm run data:sample` 產生的 deterministic sample；Actions 取得的 live JSON 只存在 runner 與 Pages artifact，不 commit 回 `main`。
- 不得移除或略過測試、降低 coverage、放寬 TypeScript、CSP、workflow permission 或 Action SHA pin。
- 不得加入 Cloudflare、Vercel、Netlify、Cloud Run 或其他主機／代理服務。

## 上傳前必要輸入

只向使用者取得：

1. 已存在的 GitHub repository，例如 `OWNER/REPOSITORY`。
2. 可對該 repository push、管理 Actions 與 Pages 的有效 GitHub 登入。
3. 部署型態：
   - 一般 Project Pages：不設定 `PAGES_BASE_PATH`。
   - 使用者 Pages、自訂網域或 root：repository variable `PAGES_BASE_PATH=/`。

先執行唯讀確認：

```bash
gh auth status
gh repo view OWNER/REPOSITORY
git ls-remote https://github.com/OWNER/REPOSITORY.git
```

若 repository 不存在、登入無效或使用者沒有權限，停止遠端操作；不得改建其他 repository。

## 路徑 A：遠端已有 main 或既有內容

1. 將既有 repository clone 到另一個安全工作目錄。
2. 檢查既有檔案、branch protection、default branch 與使用者變更。
3. 建立非 protected 的功能分支，例如 `feat/pages-scheme-a`。
4. 把本專案檔案合併進 clone；遇到同名檔案必須人工 review，不得整目錄覆蓋。
5. 執行下方「提交前驗證」。
6. commit 並 push 功能分支，建立 PR 到 `main`。
7. 等 CI、dependency review、CodeQL 全綠後才合併；不得 bypass required checks。

## 路徑 B：遠端 repository 已存在但完全沒有 branch

為了讓正式程式碼經過 PR 與 dependency review：

1. 在本工作目錄初始化 `main`，設定經使用者確認的 remote。
2. 建立並 push 一個不含專案檔案的空 bootstrap commit。
3. 建立 `feat/pages-scheme-a` 分支。
4. 執行 `npm run data:sample`，確認忽略檔案後再加入專案檔案。
5. 執行下方「提交前驗證」，commit 並 push 功能分支。
6. 建立 PR 到 `main`，待所有 checks 全綠後合併。

參考命令中的 placeholder 必須先換成使用者確認的值：

```bash
git init -b main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git commit --allow-empty -m "chore: initialize repository"
git push -u origin main
git switch -c feat/pages-scheme-a
npm run data:sample
git add .
git status --short
git commit -m "feat: migrate dashboard to secure GitHub Pages pipeline"
git push -u origin feat/pages-scheme-a
gh pr create --repo OWNER/REPOSITORY --base main --head feat/pages-scheme-a
```

執行 `git add .` 後必須先檢查 staged 清單；若出現任何秘密、`.env`、live 擷取資料、`dist` 或未預期檔案，取消提交並修正。

## 提交前驗證

```bash
npm ci
npm run data:sample
npm run format
npm run lint
npm run typecheck
npm run test:coverage
npm run security:workflows
npm run workflow:lint
npm run security:repo
npm run build
npm run validate:html
npm run security:dist
npm run test:e2e
npm audit --audit-level=high
```

建立至少一個 commit 後，再執行：

```bash
npm run security:history
```

全部指令必須成功。`npm run fetch:data` 是獨立 live smoke；若上傳前執行，完成後必須再執行 `npm run data:sample`，不可把 live JSON staged。

## GitHub Pages 與 repository 設定

1. Pages 的 Build and deployment Source 設為 **GitHub Actions**。
2. 確認 default branch 是 `main`。
3. 確認 Actions 可執行本 repository 的 workflow。
4. `github-pages` environment 啟用適合 repository 的 protection rules；部署 approval 是否啟用由 repository owner 決定。
5. 一般 Project Pages 不建立 `PAGES_BASE_PATH` variable。
6. root／使用者 Pages／自訂網域才設定：

   ```bash
   gh variable set PAGES_BASE_PATH --body "/" --repo OWNER/REPOSITORY
   ```

7. 自訂網域只能使用 GitHub Pages 原生 custom domain；憑證就緒後啟用 Enforce HTTPS。

若 Pages 尚未啟用，優先由 GitHub Settings → Pages 設定 Source。不得在未確認 repository 的情況下以 API 猜測設定。

## Workflow 驗收

PR 階段必須看到：

- `CI / Quality and security gates`
- `CI / Dependency review`
- `CodeQL / Analyze javascript-typescript`
- `CodeQL / Analyze actions`

合併到 `main` 後，必須看到：

- `Refresh data and deploy Pages / Fetch, validate, test, and build`
- `Refresh data and deploy Pages / Deploy verified Pages artifact`
- `CI`
- `CodeQL`

可使用：

```bash
gh run list --repo OWNER/REPOSITORY --limit 20
gh run watch RUN_ID --repo OWNER/REPOSITORY --exit-status
gh workflow run data-and-pages.yml --repo OWNER/REPOSITORY
```

若 fetch、test、scan 或 build 失敗，deploy job 必須沒有執行；修正原因後重新跑完整 pipeline，不得手動發布空資料。

## Production 驗收

取得 Pages URL：

```bash
gh api repos/OWNER/REPOSITORY/pages --jq .html_url
```

實際開啟 production URL，至少驗證：

- 首頁、JS、CSS 與 `data/tenders.json` 都回應成功，沒有 mixed content。
- 顯示真實 `fetchedAt`、`queryMode=isNow`、`recordCount` 與政府電子採購網來源。
- 初始搜尋固定為空；網址附加 `?q=綜合任務` 仍顯示全部資料。
- 超過兩小時顯示「資料可能過期」。
- 重新整理只請求同源 JSON；瀏覽器沒有 `/api/tenders` 或 PCC 資料請求。
- 外部 PCC 連結具有 `noopener noreferrer`。
- 1440×1000 與 390×844 均無水平溢位，axe serious／critical 為零。
- Production artifact 只含 `dist` 內容，沒有 source map、fixture、秘密或 `.env`。

記錄 production URL、deployment run URL、commit SHA、CodeQL 結果、dependency review 結果與驗證時間到 `docs/specs/001-pages-migration/runbook.md`。

## GitHub Pages 平台限制

GitHub Pages 不能由 repository 自訂完整 HTTP response headers。Production 驗收不得宣稱 response-header 形式的 CSP、`frame-ancestors`、HSTS、`X-Frame-Options` 或 `Permissions-Policy` 已由本專案設定。現行控制是 Pages 可實作的 CSP meta 與同源資產政策。
