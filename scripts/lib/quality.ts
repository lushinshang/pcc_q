import type { ParseTenderResult } from "./tenderParser";

export const MAX_REJECTION_RATIO = 0.2;

// 資料集在滾動累積架構下永遠是「與前一版合併」而非「覆蓋前一版」，
// 確認零筆（PCC 明確標示無符合條件資料，例如剛跨日還沒有新公告）不再是危險狀態，
// 不在此把它當成錯誤擋下；只有掃到列但解析失敗比例過高，才代表解析器可能有問題。
export function assertParseQuality(
  parsed: ParseTenderResult,
  maxRejectionRatio = MAX_REJECTION_RATIO,
): void {
  if (parsed.scannedRows <= 0) return;
  if (
    maxRejectionRatio < 0 ||
    maxRejectionRatio > 1 ||
    parsed.rejectedRows.length / parsed.scannedRows > maxRejectionRatio
  ) {
    throw new Error(
      `解析拒絕比例過高：${String(parsed.rejectedRows.length)}/${String(parsed.scannedRows)}`,
    );
  }
}
