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
  if (markers.size !== 1 || !markers.has(expected)) {
    throw new Error(`File không phải sao kê ${expected} hoặc không xác định rõ ngân hàng. Vui lòng chọn đúng file sao kê ${expected} gốc do ngân hàng xuất.`);
  }
}
