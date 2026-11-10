import type ExcelJS from "exceljs";
import { normalizeTransferText } from "@/lib/text";

// Only inspect the document heading, never transaction descriptions or the filename.
export function assertStatementBank(sheet: ExcelJS.Worksheet, headerRow: number, expected: "VIB" | "BIDV") {
  const markers = new Set<string>();
  for (let row = 1; row < headerRow; row++) {
    sheet.getRow(row).eachCell((cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const value = cell.value;
      const text = value && typeof value === "object" && "richText" in value
        ? value.richText.map((part) => part.text).join("")
        : cell.text;
      const normalized = normalizeTransferText(text);
      if (/\bvib\b|\bngan hang (?:tmcp )?quoc te\b|\bvietnam international bank\b/.test(normalized)) markers.add("VIB");
      if (/\bbidv\b|\bbank for investment and development\b|\bngan hang (?:tmcp )?dau tu va phat trien\b/.test(normalized)) markers.add("BIDV");
    });
  }
  const matchesVibExport = expected === "VIB" && markers.size === 0 && hasVibExportLayout(sheet, headerRow);
  if (!matchesVibExport && (markers.size !== 1 || !markers.has(expected))) {
    throw new Error(`File không phải sao kê ${expected} hoặc không xác định rõ ngân hàng. Vui lòng chọn đúng file sao kê ${expected} gốc do ngân hàng xuất.`);
  }
}

// VIB's original export has no bank name in its heading. Require its complete
// bilingual layout, not a bank name mentioned inside a transfer description.
function hasVibExportLayout(sheet: ExcelJS.Worksheet, headerRow: number) {
  if (sheet.name !== "Sao_ke_tai_khoan") return false;
  const headings = new Set<string>();
  for (let row = 1; row < headerRow; row++) {
    for (const column of [2, 4]) {
      headings.add(normalizeTransferText(sheet.getCell(row, column).text));
    }
  }
  return [
    "giao dich tai khoan", "account statement",
    "so tai khoan account number", "loai tien currency",
    "chu tai khoan account holder", "so cccd id number", "dia chi address",
    "ngay in sao ke statement date", "thoi gian sao ke period covered",
    "phat sinh no total debit", "phat sinh co total credit",
    "so du dau ky opening balance", "so du cuoi ky closing balance",
  ].every((heading) => headings.has(heading));
}
