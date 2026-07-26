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

### 2026-07-26：週末例行暫停同步提示優化（方案 B）

- **需求異動背景**：平日 Cron 每 3 小時執行定時同步，週六與週日屬於例行非同步時段。過去超過 2 小時一律標示「資料可能過期」，易於週末造成誤解。
- **異動內容**：
  - 在 `src/utils/freshness.ts` 新增 `isTaipeiWeekend(fetchedAt)` 判定擷取時間是否屬於台北時間的週六或週日。
  - 保留 `isStale` 判定（> 2 小時），在 `src/App.tsx` 中當資料過期且 `fetchedAt` 落在週末時，將警告文案替換為「週末例行暫停同步（下一版：週一 00:00）」。
  - 補齊 `freshness.test.ts` (FRESH-T-004) 與 `App.test.tsx` (APP-T-003) 測試案例，通過 123/123 單元與元件測試及 `npm run validate` 本機驗證門檻。

### 2026-07-25：RT-001～003 紅隊改善規劃執行紀錄

背景與完整測試計畫見 [紅隊資安測試計畫](../../security/red-team-test-plan.html)；本節記錄實際執行過程，供之後接手者或稽核參考，不是給一般讀者的摘要（摘要見 README「紅隊資安複查與改善紀錄」）。

**執行前提與紀律**

- 先完整閱讀紅隊計畫 §03、§04、§10，以及 `design.md`、`threat-model.md` 與現有程式碼；實作順序完全沿用既定改善規劃，沒有重新發明另一套設計。
- 全程只用 repository 內既有或新增的 fixture／mock，未向 PCC 發出真實請求。RT-001 直接使用既有真實零筆 fixture `tests/fixtures/pcc-confirmed-zero.html` 的 `td.tb_b2` 與 `#pagebanner` 訊號，沒有猜測 PCC DOM。
- `node_modules` 原先不存在；以 `npm ci --offline` 從本機 npm cache 還原相依，驗證完成後移除，未把暫時套件或 cache 納入 commit。
- 每一項修復先保留 Red 證據，再做最小 Green 實作，重構後重跑 targeted tests、coverage、lint 與 typecheck；沒有刪除／skip 既有測試，也沒有放寬 coverage 門檻。

**RT-002（Bootstrap 核心流程補測試）— commit `1400b3c`**

先新增五個規劃要求的情境，舊程式沒有可匯入的 orchestration 函式，五項都因缺少 `runFetchPipeline()`／`fetchBootstrapOrFallback()` 而 Red。Green：把 CLI `main()` 拆為可注入依賴的 `runFetchPipeline()`、`fetchRoutine()`、`fetchBootstrapOrFallback()`，pipeline 只回傳結果或拋錯、不直接 `process.exit()`，只有解析品質、資料契約、同日驟降及最終 metadata 全部通過後才以 atomic rename 寫入 `tenders.json`；bootstrap 與 routine 都失敗時測試明確確認 writer 不會被呼叫。補上後形成 FETCH-T-001～007，`vitest.config.ts` 明確把 `scripts/fetch-tenders.ts` 納入 coverage，targeted suite 7/7 通過。

**RT-001（確認零筆改多重證據）— commit `8396316`**

新增 `pcc-zero-marker-in-script.html`、`pcc-zero-marker-in-comment.html`，再加入「合法內容文字存在但缺少 `#pagebanner=0`」案例；舊 `html.includes()` 實作把三者都當成合法零筆，3 failed／13 passed。Green：改用 Cheerio 查詢 DOM，要求 `td.tb_b2` 可見文字正好是「無符合條件資料」、沒有任何標案資料列、且 `#pagebanner` 正規化文字正好是「共有 0 筆資料」三者同時成立。既有真實 fixture `pcc-confirmed-zero.html`（PAR-T-003b）仍被接受，`pcc-zero.html`／`pcc-field-drift.html` 仍 fail closed；parser targeted suite 16/16，parser lines 100%、branches 94.59%。

**RT-003（分頁上限改 fail closed）— commit `7392440`**

先反轉 PAG-T-005／PAG-T-011 的舊斷言，舊實作在最後允許頁仍有下一頁時錯誤 resolve，兩項如預期失敗。過程中發現第一版 FETCH-T-008 mock 重複回傳同一個已被消耗的 `Response` 造成 retry timeout——這是測試工具本身的缺陷、不是產品行為，改成每次 request 都建立新的 `Response` 後才繼續驗證真正的分頁行為。Green：`fetchAllPccPages()` 遇到「最後一頁沒有下一頁」立即正常回傳，只有跑滿 `maxPages` 且最後一頁仍有下一頁時才拋出「分頁數超過安全上限，可能資料不完整」。PAG-T-007 確認總頁數剛好等於上限不會誤報；FETCH-T-008 製造 400 頁鏈確認 bootstrap 會捕捉錯誤、改走 routine，不發布截斷資料；例行與 bootstrap 共用同一套 fail-closed 實作。`fetch-tenders.test.ts` + `pcc-pagination.test.ts` targeted suite 22/22。

**沙箱環境例外處理**

| 階段               | 遇到的狀況                                                | 處理方式                                                                                                       |
| :----------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| `npm run validate` | actionlint 因沙箱 DNS 無法查詢 `proxy.golang.org`         | 尋找本機 Go module cache，以 `cd <module 目錄> && GOPROXY=off GOFLAGS=-mod=mod go run .` 離線驗證三份 workflow |
| Gitleaks history   | 同樣不能依賴對外下載                                      | 由本機 `gitleaks/v8@v8.30.1` module cache 離線掃描完整 git history，零發現                                     |
| Playwright 啟動    | 沙箱預設權限不足以綁定 loopback preview server（`EPERM`） | 提升本機 loopback server 所需權限後重跑，desktop／mobile／axe／CSP／overflow 8/8 通過，未連線 PCC              |
| Dependency audit   | 沙箱無對外網路                                            | 改用 `npm audit --offline --audit-level=high`，0 vulnerabilities                                               |
| 收尾               | 驗證用途暫時還原的 `node_modules`（約 255 MB）            | 全部驗證結束後移除，Git working tree 保持乾淨                                                                  |

**結果**：deterministic tests 122／122（16 個測試檔）；coverage statements 95.77%、lines 96.27%、branches 92.28%、functions 96.03%，parser lines 100%、branches 94.59%，皆高於既有 90%／90%／85%／90% 門檻。完整 `npm run validate` 的 code、repository scan（88 files）、workflow policy、build、HTML 與 dist scan（4 files）閘門通過；Gitleaks 離線掃描全歷史零發現（涵蓋 commit 數會隨每次提交增加，請以最近一次執行輸出為準，不在此固定數字）。狀態同步 commit：`13e6454 docs(security): verify RT-001 through RT-003 remediation`。全程只留在本機，沒有 push、force push、重寫既有歷史或觸發 GitHub Actions。

**工程教訓**：coverage 數字再高，如果關鍵 CLI orchestration 根本不在 `include` 範圍，仍可能存在真正的測試盲區；fail closed 不能依賴容易被偽造或殘留的單一自由文字，安全判斷要建立在彼此獨立、結構化的證據上；「安全上限」不是正常成功條件，到達上限時必須證明資料自然結束，否則就是截斷；Red test 本身也可能有 fixture／mock 缺陷，應修正測試因果而不是誤稱為產品缺陷；沙箱限制可以用離線 cache 與最小權限替代驗證，但必須如實記錄，不能把未執行項目假稱通過。

**尚待人工**：在有 GitHub／PCC 網路權限的真實環境，以 `workflow_dispatch` 手動觸發一次 `data-and-pages`，確認 RT-002／RT-003 擷取管線與 production deployment；本次未觸發、未 push。

### 2026-07-24

- 本機 Node 26.5.0、npm 12.0.1；CI 鎖定 Node 24。
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
