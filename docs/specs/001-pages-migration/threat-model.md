# 威脅模型

## 資產

- 發布資料完整性與來源可追溯性。
- GitHub Pages deployment 權限。
- GitHub Actions `GITHUB_TOKEN`／OIDC 權限。
- 使用者瀏覽器執行環境。

## 主要威脅與控制

| 威脅                  | 控制                                                        | 測試                                |
| --------------------- | ----------------------------------------------------------- | ----------------------------------- |
| SSRF／私有網路存取    | 固定 PCC origin/path，不接受 URL；manual redirect           | SEC-T-001～003、011                 |
| Slow／large response  | AbortController timeout、stream byte limit                  | SEC-T-005／006／010                 |
| 上游惡意 HTML／XSS    | 純文字 allowlist、禁止 markup/control chars、React escaping | PAR-T-002／007、CONTRACT-T-003／004 |
| 無效資料污染 artifact | Zod contract、日期／金額／count／hash 驗證                  | CONTRACT-T-001～008、SCHEMA-T-001   |
| Action tag 被移動     | 完整 commit SHA、workflow test                              | WF-T-001                            |
| Secret 進入 bundle    | 移除 Gemini／env injection、repo/dist scan                  | STATIC-T-002、scan commands         |
| PR 權限提升           | read-only CI、deploy job 分離、environment                  | WF-T-002／003                       |
| HTML 結構漂移         | fixture regression、零列與拒絕比例 fail closed              | PAR-T-003／006、PIPE-T-002／003     |
| 同日資料異常驟減      | 驗證最近 Pages 契約與 hash；同日下降超過 50% fail closed    | BASE-T-001～006                     |

## 殘餘風險

GitHub Pages 不支援 repository 自訂完整 response headers。CSP meta 不支援 `frame-ancestors`、sandbox、reporting，也不能取代 HSTS、`X-Frame-Options`、`Permissions-Policy` 等 response headers；若外部稽核強制要求，需由另行核准的 CDN／反向代理或替代主機提供。此案只宣告純 Pages Level A 控制通過。
