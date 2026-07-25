# STP — 軟體測試計畫（Software Test Plan）

版本：1.0（延伸既有 [`test-plan.md`](../specs/001-pages-migration/test-plan.md)，補齊測試策略、環境、進入/退出準則、風險分級）
狀態：已核准
最後更新：2026-07-25

> 個別測試案例 ID 與其覆蓋的需求，權威來源是 [`traceability.md`](../specs/001-pages-migration/traceability.md)，本文件不重複列出逐案對照表。本文件負責回答「測試策略是什麼、什麼時候算測試完成、風險怎麼排序」。

## 1. 測試目標

驗證系統符合 [SRS.md](SRS.md) 所列全部功能、資料/可靠性、資安、非功能需求，並在每次變更後提供可重現的通過證據（依專案鐵律：AI 推論不算驗證，只接受實際執行結果）。

## 2. 測試範圍

### 範圍內

- 前端元件行為（篩選、排序、新鮮度、錯誤狀態）。
- 資料擷取管線（分頁、parser、品質斷言、滾動視窗合併）。
- 資料契約驗證（Zod schema、SHA-256）。
- GitHub Actions workflow 安全政策（權限、SHA pin、job 相依）。
- 端對端瀏覽器行為（無障礙、CSP、同源請求、響應式）。
- Repository／Git history／dist 產出的秘密掃描。
- 依賴弱點掃描（`npm audit`、Dependency Review、CodeQL）。

### 範圍外

- PCC 網站本身的正確性（外部系統，不受本專案控制）。
- 真實使用者的可用性測試（無使用者研究資源，見 PRD.md 第 8 節已知限制）。
- 負載測試／壓力測試（純靜態 Pages，無自建伺服器可測；GitHub Pages 平台層級效能不在專案控制範圍）。

## 3. 測試策略

採 TDD（測試先行）：每項需求先以 failing test 證明缺少行為，再實作最小修改，最後重構重跑。既有 Red/Green 執行證據見 [`test-plan.md`](../specs/001-pages-migration/test-plan.md)「TDD 規則」段落，本文件不重複列出。

### 3.1 測試層級與工具

| 層級                     | 工具                                            | 涵蓋範圍                                                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Unit                     | Vitest                                          | 日期/金額/文字/URL/hash 驗證、資料新鮮度、日期範圍篩選、機關比對、分頁 URL 組裝 |
| Component                | Vitest + Testing Library                        | `App.tsx` 互動行為（篩選、排序、錯誤狀態、說明面板）                            |
| Parser fixture           | Vitest（Cheerio fixture）                       | 正常/缺欄/結構漂移/確認零筆/惡意內容/機關白名單排除                             |
| Contract                 | Vitest                                          | Dataset schema、count、hash、`org` 列舉值                                       |
| Security（workflow）     | Vitest                                          | GitHub Actions 權限、SHA pin、job 相依                                          |
| Security（static）       | 自製 script（`security:repo`／`security:dist`） | Repository／dist 秘密掃描                                                       |
| Security（history）      | Gitleaks v8.30.1（`security:history`）          | 完整 Git history 秘密掃描，`--redact`                                           |
| Security（policy lint）  | actionlint v1.7.12（`workflow:lint`）           | Workflow YAML 語法與已知反樣式                                                  |
| Security（supply chain） | `npm audit`、CodeQL、Dependency Review          | 依賴弱點、程式碼掃描                                                            |
| E2E                      | Playwright（+ `@axe-core/playwright`）          | 桌機/行動響應式、a11y、CSP、同源請求、外部連結安全、篩選預設值                  |
| Smoke                    | `npm run fetch:data`（獨立指令）                | 真實連線 PCC，不納入 deterministic suite，用於變更後人工驗證                    |

### 3.2 測試環境

| 環境                   | 用途                            | 設定                                                                                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| 本機開發               | 開發期間快速回饋                | Node.js（本機任意 ≥ 專案需求版本）、`npm run data:sample` 產生 deterministic fixture，不連網 |
| CI（`build` job）      | 每次 push／PR 強制閘門          | `ubuntu-latest`、Node 24（鎖定版本，與本機可能不同，見第 6 節風險）                          |
| CI（`fetch-data` job） | 真實 PCC 連線，產生正式發布資料 | 同上，含真實網路請求，逾時 60 分鐘                                                           |
| Production             | Live 驗收                       | `https://lushinshang.github.io/pcc_q/`，Playwright 對正式網址執行同一組 E2E 案例             |

### 3.3 風險導向測試優先序

| 風險等級 | 領域                                               | 理由                                                                  | 對應層級                                            |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| 高       | 資料完整性（parser、contract、hash、滾動視窗合併） | 錯誤會直接污染公開發布的資料，且不易被使用者發現                      | Unit + Parser fixture + Contract                    |
| 高       | 資安邊界（SSRF 防護、CSP、Action 權限、秘密外洩）  | 一旦失守影響範圍超出本專案（供應鏈、憑證外洩）                        | Security 全系列                                     |
| 中       | 前端篩選/排序邏輯                                  | 影響使用體驗但不影響底層資料正確性，且有 fail-closed 資料層做後盾     | Component + E2E                                     |
| 中       | Workflow job 相依與 timeout 設定                   | 設定錯誤會導致發布失敗或資料不完整回填，但不會發布錯誤資料（CI 會擋） | Security（workflow）+ 人工 `workflow_dispatch` 驗證 |
| 低       | 版面/樣式細節                                      | 不影響資料正確性與安全邊界                                            | E2E 視覺快照（`qa/*.png`）人工檢視                  |

## 4. 進入準則（Entry Criteria）

- 需求已記錄於 [`requirements.md`](../specs/001-pages-migration/requirements.md) 並取得需求編號。
- 對應的 failing test 已存在（TDD 要求）。

## 5. 退出準則（Exit Criteria）

一項變更視為測試完成，需同時滿足：

- `npm run validate:code`（format／lint／typecheck／`test:coverage`）全部通過。
- Coverage 達門檻：Statements/Lines ≥ 90%、Branches ≥ 85%、Functions ≥ 90%，`tenderParser.ts` lines ≥ 95%（現況見第 7 節）。
- `security:repo`／`security:workflows`／`workflow:lint`／`security:dist` 全部通過。
- `npm run build` 成功且 `validate:html` 通過。
- `npm run test:e2e`（8 案例：桌機/行動 × E2E-T-001～004）全部通過，axe serious/critical 為零。
- `npm run security:history`（Gitleaks 全歷史掃描）零發現。
- `npm audit --audit-level=high` 零筆 High/Critical。
- 涉及資料擷取邏輯變更時，額外要求一次 `workflow_dispatch` 手動觸發驗證（本機/CI 測試無法完全模擬真實 PCC 回應行為，過往曾發生本機全過但真實 CI 對 PCC 請求時踩到 3 個本機測不出來的邊界情況：確認零筆誤判 fail-closed、schema 遷移死結、E2E 對零筆不健壯）。

任何一項未通過，該次變更**不得**視為完成（對應專案鐵律「驗證後才能說完成」）。

## 6. 已知測試環境風險

- 本機 `go run` 對 `proxy.golang.org` 的模組下載偶發 TLS 憑證驗證失敗（本機網路環境問題，非程式問題），可用 `GOPROXY=off` 搭配既有 module cache 繞過；CI 環境不受影響。
- 本機 Node 版本可能與 CI 鎖定的 Node 24 不同，理論上可能導致本機通過但 CI 失敗（尚未實際發生，列為監控項）。

## 7. 現況測試結果快照

以下為 2026-07-25 最近一次完整驗證的實際輸出（非估計值），供本文件建立時的基準；後續每次驗證請以當次 CI 或本機執行的實際輸出為準，不沿用此處數字：

- Vitest：110/110 測試通過（15 個測試檔）。
- Coverage：Statements 98.13%、Branches 93.82%、Functions 97.8%、Lines 98.96%。
- Playwright E2E：8/8 通過（desktop + mobile × 4 案例）。
- `security:repo`：82 個檔案，零發現。
- `security:dist`：4 個檔案，零發現，無 source map。
- `security:history`（Gitleaks v8.30.1）：23 commits 掃描，零發現。
- `npm audit --audit-level=high`：0 vulnerabilities。
- `workflow:lint`（actionlint v1.7.12）：零發現。
- Production Live 驗收：見 README.md「14 項 Live Production 實體驗收對照表」。

## 8. 缺陷管理

本專案規模與流程尚未使用獨立的缺陷追蹤系統；缺陷等同於 failing test 或 CI 紅燈，修復流程比照第 3 節 TDD 策略（先重現為 failing test，再修復，再重跑全部退出準則）。歷史上發現並修復的重大缺陷案例（含根因）記錄於 [`adr-first-run-backfill.md`](../specs/001-pages-migration/adr-first-run-backfill.md) 附錄與 [`adr-query-mode.md`](../specs/001-pages-migration/adr-query-mode.md) 附錄，此處不重複。
