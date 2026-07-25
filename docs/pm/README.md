# 系統文件索引（PM／系統分析視角）

本目錄提供產品／系統分析層級的正式文件，補齊 [`docs/specs/001-pages-migration/`](../specs/001-pages-migration/) 既有工程規格的產品層與正式結構缺口。**這兩個目錄不是互相替代關係**。

完整內容以單一頁面呈現：**[index.html](index.html)** — 側欄可切換 PRD／SRS／SDD／STP 四份文件，含彩色 mermaid 架構與流程圖（系統情境圖、資料流管線、部署視圖、Epic backlog）。以瀏覽器直接開啟即可，需要網路載入 mermaid 渲染函式庫（CDN，含 SRI 完整性校驗）。

| 文件區塊 | 目的                                                     | 權威範圍                                                                                                        |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| PRD      | 產品需求：背景、目標使用者、成功指標、範圍、Epic backlog | 產品／商業層決策的唯一權威來源                                                                                  |
| SRS      | 軟體需求規格：外部介面、非功能需求、優先序               | 結構性補充；逐條需求編號與驗收條件仍以 [`requirements.md`](../specs/001-pages-migration/requirements.md) 為權威 |
| SDD      | 系統設計：情境圖、模組介面、資料設計、部署視圖           | 結構性補充；核心架構決策仍以 [`design.md`](../specs/001-pages-migration/design.md) 與 ADR 為權威                |
| STP      | 軟體測試計畫：策略、環境、進入/退出準則、風險分級        | 結構性補充；逐案測試 ID 對照仍以 [`traceability.md`](../specs/001-pages-migration/traceability.md) 為權威       |

## 更新原則

- 需求編號、驗收條件、測試案例 ID 的**內容本身**只改一個地方：`docs/specs/001-pages-migration/` 底下對應檔案。`index.html` 用文字引用對照，不重複維護逐條驗收條件。
- 產品層決策（範圍、優先序、成功指標）改在 `index.html` 的 PRD 區塊。
- 任何數字（測試數、coverage、URL、commit SHA）一律取當次實際執行輸出，不沿用舊快照；`index.html` STP §7 與專案根目錄 `README.md` 的驗收表明確標註「快照」性質。
- 修改 `index.html` 後，用瀏覽器（或 `open docs/pm/index.html`）實際打開確認排版與 mermaid 圖渲染正常，不能只憑原始碼判斷。
