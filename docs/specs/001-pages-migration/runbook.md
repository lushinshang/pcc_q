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

- 日期：2026-07-25；RT-001～003 §10 改善本機驗證（全程 fixture／mock，未向 PCC 發出請求）。
- deterministic tests：122 tests／16 files 通過；coverage statements 95.77%、lines 96.27%、branches 92.28%、functions 96.03%；parser lines 100%、branches 94.59%。
- RT regression：`tests/unit/fetch-tenders.test.ts` 與 `pcc-pagination.test.ts` 22／22 通過；`parser.test.ts` 16／16 通過。
- 完整 `npm run validate` 的 code、repository scan、workflow policy、build、HTML 與 dist 閘門通過；actionlint 因沙箱 DNS 無法由 `go run ...@v1.7.12` 查詢 proxy，改以本機 module cache、`GOPROXY=off GOFLAGS=-mod=mod go run .` 離線驗證三份 workflow，通過。
- Gitleaks v8.30.1 同樣由本機 module cache 離線掃描 30 commits，零發現；repository secret scan 88 files、dist scan 4 files，皆零發現。
- `npm audit --offline --audit-level=high`：0 vulnerabilities。Playwright desktop／mobile、axe、CSP 與 overflow：8／8 通過。
- 尚待人工：在有 GitHub／PCC 網路權限的真實環境，以 `workflow_dispatch` 手動觸發一次 `data-and-pages`，確認 RT-002／RT-003 擷取管線與 production deployment；本次未觸發、未 push。
- 日期：2026-07-24；本機 Node 26.5.0、npm 12.0.1；CI 鎖定 Node 24。
- deterministic tests：74 tests／12 files 通過。
- coverage：statements 97.98%、lines 99.28%、branches 93.48%、functions 100%；`App.tsx` lines 100%，parser statements／lines 100%。
- live PCC smoke：成功產生 5 筆有效當日公告資料；隨後還原 deterministic sample。
- actionlint v1.7.12、workflow permission／SHA policy tests：通過；所有 Action SHA 另以官方 repository tag refs 核對。
- repository secret scan：71 檔案零發現。Production build、HTML validation、dist secret scan：通過；dist 4 檔案、零發現、無 source map。
- Full Git history scan：Gitleaks v8.30.1 於 `npm run security:history`（CI 每次 push 皆執行）在此專案 Git history 掃描通過，零發現（no leaks found）；掃描涵蓋的 commit 數會隨每次 push 增加，請以該次 CI run 的實際輸出為準，不在此固定數字。
- `npm audit --audit-level=high`：0 vulnerabilities。
- Playwright：desktop 1440×1000 與 mobile 390×844 共 6 tests 在本機與 Production URL 均 100% 通過；axe serious／critical 0、CSP console 0、無水平溢位。
- GitHub Pages base：Project Pages `https://lushinshang.github.io/pcc_q/` 完成 production build、dist scan 與 6/6 Live E2E。
- 視覺證據：`qa/dashboard-desktop.png`、`qa/dashboard-mobile.png`。
- CodeQL 與 dependency review：PR #1 CI / CodeQL (javascript-typescript & actions) 與 Dependency Review 全數通過且無未處理 Critical / High。
- Production URL：https://lushinshang.github.io/pcc_q/
- Deployment Run URL：https://github.com/lushinshang/pcc_q/actions/runs/30094478354
- Commit SHA（最新成功部署，對應上列 Deployment Run URL）：`9389654c9bdc2e90cd837f78cb951eca7e20eb57`；main HEAD 可能領先於此，請以 `gh api repos/lushinshang/pcc_q/deployments` 查詢的最新 deployment 為準。
- 驗證時間：2026-07-24T20:54:00+08:00
