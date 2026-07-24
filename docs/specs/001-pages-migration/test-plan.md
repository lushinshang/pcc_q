# 測試計畫

## TDD 規則

每一項需求先以 failing test 證明缺少行為，再實作最小修改，最後重構並重跑。首次 Red 證據為 `npm test` 對尚未存在的 contracts、parser、secure fetch 與 service 模組產生四個 import failure。本目錄沒有 Git history，故不虛構測試提交；本次額外 Red／Green 執行證據如下：

| 測試 ID   | Red 指令與預期失敗                                                                         | Green／重構證據                                                           |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| WF-T-003  | `npm run security:workflows`：缺少 `actions/configure-pages@983d…`，1 failed／4 passed     | 在 deploy job 加入固定 SHA 後 5／5 passed；`npm run workflow:lint` passed |
| APP-T-008 | `npm test -- tests/component/App.test.tsx`：`?q=綜合任務` 造成 0／2 筆，1 failed／7 passed | 移除 URL query 初始化後 8／8 passed；完整 suite 74／74 passed             |

## 測試層級

- Unit：日期、金額、文字、URL、hash、資料新鮮度。
- Parser fixture：正常、缺欄、欄位漂移、零列、惡意 scheme、script、event attribute、HTML entity 與 Unicode 控制字元。
- Contract：dataset 欄位、count、hash 與消費端驗證。
- Component：初始資料、篩選、stale、錯誤與重新整理。
- Security：workflow 權限、SHA pin、CSP、dist secret scan。
- Secret history：在 Git repository workflow 中以固定版本 Gitleaks 掃描完整 history，並強制 redact。
- E2E：桌機／手機、axe、CSP、請求目的地與水平溢位；GitHub Pages base path 另由 unit，以及 project 與 root/custom-domain production build 驗證。
- Smoke：獨立指令連線真實 PCC，不納入 deterministic unit suite。

## 門檻

- Statements／lines 90%，branches 85%，functions 90%。
- Coverage 納入全部前端業務程式、契約、服務、工具與擷取核心；只排除沒有業務分支的 React 掛載入口 `src/main.tsx`。
- `scripts/lib/tenderParser.ts` lines 95%。
- audit Critical／High 為零。
- axe serious／critical 為零。
- dist 不含 source map、fixture、`.env`、token 或 key。
