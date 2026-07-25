# 需求—測試追溯

| 需求                          | 設計／程式元件                                                           | 測試檔案與 ID                                                        | 驗證指令                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| REQ-F-001／002                | `src/App.tsx`                                                            | APP-T-001～008                                                       | `npm test`                                                                   |
| REQ-F-003                     | `src/utils/freshness.ts`、App                                            | FRESH-T-001～003；APP-T-003                                          | `npm test`                                                                   |
| REQ-F-004                     | `src/services/tenderService.ts`                                          | SERVICE-T-001～005；E2E-T-001                                        | `npm test`、`npm run test:e2e`                                               |
| REQ-F-005／REQ-S-008          | `data-and-pages.yml`                                                     | `tests/security/workflows.test.ts` WF-T-001～005                     | `npm run security:workflows`                                                 |
| REQ-F-006                     | `secureFetch.ts`、ADR                                                    | SEC-T-001                                                            | `npm test`                                                                   |
| REQ-F-007／008                | `src/App.tsx`、`src/contracts/orgWhitelist.ts`、`src/utils/dateRange.ts` | APP-T-002；E2E-T-004                                                 | `npm test`、`npm run test:e2e`                                               |
| REQ-D-001／002／005／006／007 | `src/contracts/tender.ts`、`orgWhitelist.ts`                             | CONTRACT-T-001～008；SCHEMA-T-001；PAR-T-009                         | `npm run test:coverage`                                                      |
| REQ-D-003／004                | parser、quality、baseline、workflow                                      | PAR-T-001～009；PIPE-T-001～003；BASE-T-001～008；WF-T-005           | `npm test`                                                                   |
| REQ-D-008／009                | `pccPagination.ts`、`baseline.ts`                                        | PAG-T-001～007；BASE-T-007／008                                      | `npm test`                                                                   |
| REQ-D-010                     | `pccPagination.ts`、`tenderParser.ts`、`fetch-tenders.ts`、ADR-002       | PAG-T-008～011；PAR-T-012                                            | `npm test`；上線前另需 `workflow_dispatch` 手動驗證                          |
| REQ-S-001／003                | `secureFetch.ts`                                                         | SEC-T-001～012                                                       | `npm test`                                                                   |
| REQ-S-002／007                | CSP、secret scanners                                                     | STATIC-T-001～004；E2E-T-003；repo/history/dist scans                | `npm run security:repo`、`npm run security:history`、`npm run security:dist` |
| REQ-S-004／005／006           | GitHub workflows                                                         | `tests/security/workflows.test.ts`                                   | `npm run security:workflows`                                                 |
| GitHub Pages base path        | `config/pagesBase.ts`、Vite／Playwright config、`tenderService`          | BASEPATH-T-001；SERVICE-T-001／004；project 與 root production build | `npm test`、兩種 base 各自 `npm run build` 與 `npm run test:e2e`             |
| 響應式／可及性／CSP           | production build                                                         | E2E-T-001～003；`qa/dashboard-*.png`                                 | `npm run test:e2e`                                                           |
| 首次上傳／Production 驗收     | `docs/GITHUB-UPLOAD-HANDOFF.md`、runbook                                 | PR checks、Pages deployment run、production smoke                    | GitHub Actions 與 production URL 驗收                                        |

## 執行證據

最終執行結果、coverage 數字、audit 與視覺 QA 截圖記錄於 `runbook.md` 的「最近驗證」區段。提案中的全部 REQ-F-001～006、REQ-D-001～006、REQ-S-001～008 均由上表實際檔案與指令覆蓋，不使用待填模板。
