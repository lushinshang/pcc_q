# GitHub Pages 靜態化需求規格

版本：1.2  
狀態：已核准  
查詢模式：例行查詢 `isNow`（單次擷取；Pages 端另保留 30 天滾動累積視窗）；首次執行（無可用前一版基準）改用 `isDate` 日期區間一次回填過去 30 天，見 ADR-002

## 功能需求

| ID        | 規格                                                 | 驗收條件                                                                                                              |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| REQ-F-001 | 初始畫面依預設機關與日期範圍載入最新成功發布的標案。 | 預設機關＝國防部、日期範圍＝當日、搜尋固定為空且忽略任意 URL query；有效資料載入後 KPI 與列表顯示符合預設篩選的筆數。 |
| REQ-F-002 | 支援案名、案號及招標方式篩選。                       | 清除篩選後恢復全資料；搜尋忽略大小寫與前後空白。                                                                      |
| REQ-F-003 | 顯示來源、查詢模式、擷取時間、筆數與新鮮度。         | 超過兩小時顯示「資料可能過期」；擷取時間為最近一次成功同步時間。                                                      |
| REQ-F-004 | 重新整理只讀取同源靜態 JSON。                        | 不存在 `/api/tenders` 或瀏覽器到 PCC 的請求。                                                                         |
| REQ-F-005 | 資料工作流程支援平日每 3 小時排程與人工觸發。        | `0,3,6,9,12,15,18,21 點 Asia/Taipei` 與 `workflow_dispatch` 均存在。                                                  |
| REQ-F-006 | UI 文案與 `isNow` 查詢一致。                         | 畫面使用「當日公告」，不得稱「等標期內」；日期範圍篩選為前端顯示狀態，不得誤導為擷取範圍。                            |
| REQ-F-007 | 提供機關下拉篩選，白名單機關含所有下轄單位。         | 預設「國防部」；切換機關後列表與 KPI 更新為該機關名稱比對命中的資料。                                                 |
| REQ-F-008 | 提供「當日／一週／一個月」日期範圍篩選。             | 對已載入資料本地端篩選 `announcedDate`，不觸發任何額外網路請求；預設「當日」。                                        |

## 資料與可靠性需求

| ID        | 規格                                                               | 驗收條件                                                                                                                                     |
| --------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-D-001 | 發布資料符合版本化契約。                                           | 產生端與消費端均驗證；不符即 fail closed。                                                                                                   |
| REQ-D-002 | Tender link 僅允許 PCC HTTPS。                                     | 禁止其他 scheme、host、port、username、password。                                                                                            |
| REQ-D-003 | 擷取或驗證失敗不得部署。                                           | deploy job 依賴 fetch、validate、test、build 成功。                                                                                          |
| REQ-D-004 | 解析器偵測 HTML 結構漂移，並與 PCC 明確標示的確認零筆區分。        | 找不到預期列且無「無符合條件資料」標記、拒絕比例過高，或多頁合計掃描列數超過安全上限即失敗；確認零筆時正常回傳空結果，交由滾動累積合併處理。 |
| REQ-D-005 | 不受信任文字不可成為可執行 HTML。                                  | 控制字元與 markup 被拒絕；React 不使用 raw HTML。                                                                                            |
| REQ-D-006 | JSON 含可追溯 metadata。                                           | 包含 schema、source、mode、time、count、SHA-256。                                                                                            |
| REQ-D-007 | 每筆 Tender 含機關欄位，限定於白名單值域。                         | `org` 為 `ORG_LABELS` 列舉值之一；機關不在白名單時該列靜默排除，不計入拒絕率。                                                               |
| REQ-D-008 | 分頁擷取不得跳出固定 PCC 查詢路徑。                                | 逐頁跟隨回應 HTML 的下一頁連結；連結 origin/path 不符即失敗。                                                                                |
| REQ-D-009 | 發布資料為 30 天滾動累積，不得無限增長。                           | 剪枝超過 30 天的舊記錄；同 id／announcedDate／link 去重，新資料覆蓋舊資料。                                                                  |
| REQ-D-010 | 沒有可用前一版基準時，首次執行改用日期區間查詢一次回填過去 30 天。 | 判斷依據為 `loadPreviousPagesDataset()` 回傳 `null` **或**回傳的資料集累積 0 筆；回填失敗時退回例行單日查詢，不阻擋發布。                    |

## 資安需求

| ID        | 規格                                         | 驗收條件                                                        |
| --------- | -------------------------------------------- | --------------------------------------------------------------- |
| REQ-S-001 | 擷取器不能接受任意 URL。                     | 固定 origin/path，manual redirect，逐跳驗證。                   |
| REQ-S-002 | repository、bundle、artifact、log 不含秘密。 | Gemini 與環境注入移除；dist scan 零發現。                       |
| REQ-S-003 | 上游 HTML 一律視為不受信任。                 | 大小、逾時、Content-Type、schema、文字與 URL 驗證。             |
| REQ-S-004 | GitHub Actions 採最小權限。                  | PR 只讀；deploy job 才有 Pages 與 OIDC 寫入權限。               |
| REQ-S-005 | Actions 固定到完整 commit SHA。              | 所有 `uses:` 為 40 字元 SHA 並標註版本。                        |
| REQ-S-006 | Critical／High 供應鏈弱點阻擋發布。          | audit、dependency review、CodeQL 納入閘門。                     |
| REQ-S-007 | 靜態前端採同源 CSP Level A。                 | 無 inline script、`unsafe-eval`、runtime CDN 或 mixed content。 |
| REQ-S-008 | PR 程式碼不能取得部署權限。                  | privileged deploy 只由預設分支排程／手動事件執行。              |

## 非功能需求

- Statement／line coverage ≥ 90%，branch coverage ≥ 85%，parser 核心 ≥ 95%。
- 桌機 1440×1000 與手機 390×844 不得水平溢位。
- 自動化 axe 規則不得有 serious／critical violation。
- Production build 不產生 source map。
- GitHub Pages response headers 由平台控制；嚴格 header 稽核不在純 Pages Level A 保證內。
