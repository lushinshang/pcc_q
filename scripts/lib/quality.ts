import type { ParseTenderResult } from "./tenderParser";

export const MAX_REJECTION_RATIO = 0.2;

export function assertParseQuality(
  parsed: ParseTenderResult,
  maxRejectionRatio = MAX_REJECTION_RATIO,
): void {
  if (parsed.scannedRows <= 0 || parsed.tenders.length === 0) {
    throw new Error("零筆有效資料，拒絕覆蓋上一版");
  }
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
