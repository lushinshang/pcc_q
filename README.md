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
