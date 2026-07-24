# 維運與事故處理

## 本機

```bash
npm ci
npm run data:sample
npm run fetch:data
npm run validate
npm run test:e2e
```

一般測試使用 fixtures；`fetch:data` 是需要網路的獨立 smoke／資料產生步驟。

## GitHub 上傳與首次部署

由另一個 AI／維護者接手 GitHub 時，必須依 [`docs/GITHUB-UPLOAD-HANDOFF.md`](../../GITHUB-UPLOAD-HANDOFF.md) 執行。核心原則是先確認既有 repository 與權限、保留遠端歷史、以 PR 觸發 dependency review／CodeQL、合併後才由 `data-and-pages` 發布。不得直接提交 `dist`、live JSON 或秘密，也不得 force push。

## 排程失敗

1. 開啟 `data-and-pages` workflow run。
2. 判斷為網路、Content-Type、redirect、大小、解析或 schema 失敗。
3. 不重新執行 deploy job；既有 Pages 版本應保持不變。
4. 若上游 HTML 改版，先保存去識別且不含 cookie 的最小 fixture，再以 failing regression test 修復。
5. 不得停用安全驗證換取發布。

## Rollback

GitHub Pages deployment 由 artifact 產生。回復已知良好 commit，重新執行 workflow；不得 force push 或修改既有 deployment artifact。

## GitHub Pages 標頭限制

純 Pages 可啟用 HTTPS，但不能由 repository 自訂完整 response headers。CSP meta 不提供 `frame-ancestors`／reporting，也不能設定 HSTS、`X-Frame-Options` 或 `Permissions-Policy` response headers。嚴格 header 稽核需另行核准外部層，不得標示為本方案已通過。

## 最近驗證

- 日期：2026-07-24；本機 Node 26.5.0、npm 12.0.1；CI 鎖定 Node 24。
- deterministic tests：74 tests／12 files 通過。
- coverage：statements 97.98%、lines 99.28%、branches 93.48%、functions 100%；`App.tsx` lines 100%，parser statements／lines 100%。
- live PCC smoke：成功產生 5 筆有效當日公告資料；隨後還原 deterministic sample。
- actionlint v1.7.12、workflow permission／SHA policy tests：通過；所有 Action SHA 另以官方 repository tag refs 核對。
- repository secret scan：71 檔案零發現。Production build、HTML validation、dist secret scan：通過；dist 4 檔案、零發現、無 source map。
- Full Git history scan：Gitleaks v8.30.1 CLI 與 command 已在隔離測試 repository 驗證；workflow 使用完整 checkout 與 redact。本專案目錄沒有 `.git`，故未聲稱已掃描本專案 Git history。
- `npm audit --audit-level=high`：0 vulnerabilities。
- Playwright：desktop 1440×1000 與 mobile 390×844 共 6 tests 通過；axe serious／critical 0、CSP console 0、無水平溢位。
- GitHub Pages base：`GITHUB_REPOSITORY=owner/project-name` 的 `/project-name/` Project Pages，以及同時設定 `PAGES_BASE_PATH=/` 的 custom-domain/root build，各自完成 production build、dist scan 與 6/6 E2E。
- 視覺證據：`qa/dashboard-desktop.png`、`qa/dashboard-mobile.png`。
- CodeQL 與 dependency review：workflow 已建立但未聲稱執行；需在 GitHub repository 事件中產生結果。
- Production URL：尚無。本目錄不是 Git repository，且兩個現有 `gh` credentials 都無效，因此未建立遠端、未 push、未部署。
