# 威脅模型

## 資產

- 發布資料完整性與來源可追溯性。
- GitHub Pages deployment 權限。
- GitHub Actions `GITHUB_TOKEN`／OIDC 權限。
- 使用者瀏覽器執行環境。

## 主要威脅與控制

| 威脅                                       | 控制                                                                                                                         | 測試                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| SSRF／私有網路存取                         | 固定 PCC origin/path，不接受 URL；manual redirect                                                                            | SEC-T-001～003、011                   |
| Slow／large response                       | AbortController timeout、stream byte limit                                                                                   | SEC-T-005／006／010                   |
| 上游惡意 HTML／XSS                         | 純文字 allowlist、禁止 markup/control chars、React escaping                                                                  | PAR-T-002／007、CONTRACT-T-003／004   |
| 無效資料污染 artifact                      | Zod contract、日期／金額／count／hash 驗證                                                                                   | CONTRACT-T-001～008、SCHEMA-T-001     |
| Action tag 被移動                          | 完整 commit SHA、workflow test                                                                                               | WF-T-001                              |
| Secret 進入 bundle                         | 移除 Gemini／env injection、repo/dist scan                                                                                   | STATIC-T-002、scan commands           |
| PR 權限提升                                | read-only CI、deploy job 分離、environment                                                                                   | WF-T-002／003                         |
| HTML 結構漂移                              | fixture regression、拒絕比例 fail closed；找不到列且無「無符合條件資料」標記時同樣 fail closed，有標記時視為確認零筆正常放行 | PAR-T-003／003b／006、PIPE-T-001～002 |
| 同日資料異常驟減                           | 驗證最近 Pages 契約與 hash；同日新增筆數下降超過 50% fail closed                                                             | BASE-T-001～008                       |
| 分頁擷取被導向任意頁面                     | 逐頁跟隨回應 HTML 內的下一頁連結並驗證 origin/path，不接受硬編碼分頁參數                                                     | PAG-T-001／003                        |
| 不設機關限制後的請求量／資料量暴增         | `MAX_PCC_PAGES`、`MAX_TOTAL_SCANNED_ROWS` 雙層安全上限；白名單過濾收斂發布範圍                                               | PAG-T-005、PAR-T-009                  |
| 機關名稱比對誤判（非安全邊界，屬資料品質） | `org` 限定 `ORG_LABELS` 列舉值，比對優先序固定；誤判為資料分類問題，不影響資料真實性與來源驗證                               | PAR-T-009                             |

不設機關限制屬公開資料存取範圍擴大，PCC 頁面本身不需登入即可查詢任意機關，因此不新增權限或機密性風險；核心信任邊界（固定 origin/path、manual redirect、輸出 schema 驗證）不變。

## 殘餘風險

GitHub Pages 不支援 repository 自訂完整 response headers。CSP meta 不支援 `frame-ancestors`、sandbox、reporting，也不能取代 HSTS、`X-Frame-Options`、`Permissions-Policy` 等 response headers；若外部稽核強制要求，需由另行核准的 CDN／反向代理或替代主機提供。此案只宣告純 Pages Level A 控制通過。
