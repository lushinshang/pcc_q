# ADR-002：首次執行日期區間回填

狀態：Accepted
日期：2026-07-25

## 決策

第一次成功執行時（判斷依據：`loadPreviousPagesDataset()` 回傳 `null`，涵蓋「真的第一次部署」與「前一版 schema 不相容」兩種情況），改用 PCC 的日期區間查詢模式（`dateType=isDate`）一次回填過去 30 天資料，不限機關；之後每次執行維持 ADR-001 的 `dateType=isNow` 逐日累積機制，不受影響。

## 理由

現行機制不論是不是首次執行都只查當日，導致上線後資料要滿 30 天才會累積到完整一個月，不符合「第一次先抓所有，之後只抓差異、超過 30 天刪除」的需求。

## 實測依據（2026-07-25，對 web.pcc.gov.tw 真實請求，透過瀏覽器操作與請求擷取驗證）

- PCC 進階查詢表單的「日期區間」選項對應 `dateType=isDate`。
- **日期格式是西元年（Gregorian），不是原本假設的民國年**：`tenderStartDate`／`tenderEndDate` 實際送出值格式為 `2026/06/25`；畫面顯示的「115/07/19」只是視覺呈現，底層 `<input>` 的 `value` 屬性是西元年。這點單純組 URL 直接打 API 測不出來——用民國年格式送出時，伺服器會靜默忽略、回退成等同當日查詢的結果（回傳「無符合條件資料」，沒有任何錯誤訊息或 3xx 轉向），非常容易誤判為抓取失敗或上游異常。必須用真實瀏覽器操作表單、擷取實際送出的請求才驗證得出來。
- 除了日期格式，`firstSearch` 也必須是 `true`（既有 `isNow` 查詢固定用 `false`）才能讓伺服器真正套用新的查詢條件。
- `pageSize=100` 與 `isNow` 一樣正常運作，分頁機制（`#pagelinks` 的「下一頁」連結）跟既有 `pccPagination.ts` 完全相同，不需要另外處理。
- 未登入、未綁定狀態下，PCC 允許的日期區間查詢跨度上限是 186 天（前端 JS 驗證：`iDays > 186` 時會導向錯誤頁），30 天遠在範圍內。
- 實測範圍 2026-06-25～2026-07-25（30 天，不限機關）：**共 23,091 筆**，以 `pageSize=100` 計算約需 231 頁。這個量級遠超過現行 `MAX_TOTAL_SCANNED_ROWS`（3,000，針對單日全國設計），首次回填需要獨立、大幅提高的安全上限。

## 設計

1. **判斷首次執行**：沿用 `loadPreviousPagesDataset()` 回傳 `null` 的既有訊號。
2. **首次查詢改用 `dateType=isDate`**：
   - `orgId` 維持空字串（不限機關），沿用既有白名單過濾邏輯，不另外設計。
   - `tenderStartDate`／`tenderEndDate` 用西元年格式 `YYYY/MM/DD`，計算方式：以 Asia/Taipei 時區算出「今天往前 30 天」到「今天」。
   - `firstSearch=true`。
   - `pageSize=100`，沿用既有 `fetchAllPccPages()`／`extractNextPageUrl()` 分頁邏輯，不需修改分頁機制本身。
3. **獨立安全上限**：新增 bootstrap 專用的 `MAX_TOTAL_SCANNED_ROWS_BOOTSTRAP`（提案 40,000，約為實測值 23,091 的 1.7 倍緩衝）與 `MAX_PCC_PAGES_BOOTSTRAP`（提案 400 頁），只在首次回填路徑套用；例行 `isNow` 查詢繼續使用現行較低的上限（3,000／40）。這兩個數字是根據單次實測的起始值，之後可依實際情況調整。
4. **失敗處理**：使用者已確認採用「一次拓抓完整 30 天」為優先策略，但仍需要失敗退路——若首次回填因安全上限或任何原因中途失敗，不應該讓 workflow 直接失敗、卡住上線，應退回成「至少保留這次 `isNow` 查到的當日資料」這個最低限度成功條件，30 天回填沒抓完的部分留給後續每日執行自然補齊。
5. **耗時評估**：231 頁循序請求，抓取階段預估需要數分鐘，需確認落在 workflow 現有 `timeout-minutes: 25`（build job）時限內；先用循序抓取（簡單、可預期），不引入並發帶來的複雜度，若後續實測發現耗時逼近上限再評估是否需要調整 timeout。

## 要修改的檔案

- `scripts/lib/secureFetch.ts`：`buildPccQueryUrl()` 需要能接受 `dateType`／`tenderStartDate`／`tenderEndDate`／`firstSearch` 的覆寫參數，而不是像現在固定死。
- `scripts/lib/pccPagination.ts`：`fetchAllPccPages()` 的分頁上限需要能依「例行」或「首次回填」切換。
- `scripts/lib/tenderParser.ts`：`MAX_TOTAL_SCANNED_ROWS` 同樣需要能切換成 bootstrap 版本。
- `scripts/fetch-tenders.ts`：依 `loadPreviousPagesDataset()` 是否為 `null` 決定走「首次回填」或「例行 isNow」分支。
- `docs/specs/001-pages-migration/requirements.md`、`design.md`、`test-plan.md`、`traceability.md`：同步更新。

## 測試計畫

- 用實測抓到的真實回應整理成 `isDate` 模式的 fixture，驗證 `buildPccQueryUrl()` 產生的參數正確（西元年格式、`firstSearch=true`）。
- 針對「首次回填觸發安全上限」情境寫單元測試，確認會優雅降級成「至少保留這次 isNow 當日資料」，不會讓整個流程崩潰。
- 本機模擬「無可用基準」情境（例如指向沒有 Production 部署的假想 repository），驗證真的會走首次回填分支而非例行分支。
- 上線前用 `workflow_dispatch` 手動觸發一次，實際觀察 231 頁抓取的真實耗時與資料量，確認在 timeout 內完成，才依賴後續排程自動執行。

## 追記（2026-07-25）：判斷條件擴大為「無前一版或前一版為空」

實際上線後發現：schema 版本切換（新增 `org` 必填欄位）那次，剛好遇到零筆的日子，成功寫入了一份**格式相容但內容是空的**前一版資料集。原本的判斷條件（`loadPreviousPagesDataset()` 回傳 `null`）從此永遠不成立，回填功能上線後從未被觸發過，效果等同沒做這個功能。

「有前一版但累積 0 筆」跟「沒有前一版」在滾動視窗的意義上是一樣的——都沒有可用的歷史資料基礎。判斷條件改為：

```ts
const isBootstrap =
  previousDataset === null || previousDataset.tenders.length === 0;
```

這個修正不影響原本「回填失敗退回例行查詢」的安全網；一旦回填（或例行查詢）成功寫入非空資料集，之後就不會再觸發，不會造成重複的 22 分鐘回填。
