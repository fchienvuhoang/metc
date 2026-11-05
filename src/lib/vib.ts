import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { normalizeTransferText } from "@/lib/text";

export type VibTransactionRow = {
  transactionDate: Date;
  statementRow: number;
  description: string;
  transactionCode: string;
  debitAmount: number;
  creditAmount: number;
  balanceAfter: number;
  raw: Record<string, unknown>;
};

export type ParsedVibStatement = {
  meta: {
    sourceBank: "VIB";
    currency: string;
    accountNumber: string;
    fromDate: Date;
    toDate: Date;
    closingBalance: number;
  };
  rows: VibTransactionRow[];
};

const EXPECTED_HEADER = [
  "ngay giao dich transaction date",
  "noi dung description",
  "ghi no debit",
  "ghi co credit",
  "so du cuoi running balance",
];

export async function parseVibStatement(buffer: Buffer): Promise<ParsedVibStatement> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("File Excel không có sheet dữ liệu.");

  let headerRow = 0;
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 100); rowNumber += 1) {
    const values = readCells(worksheet, rowNumber, 2, 6).map(normalizeTransferText);
    if (EXPECTED_HEADER.every((header, index) => values[index] === header)) {
      headerRow = rowNumber;
      break;
    }
  }
  if (!headerRow) {
    throw new Error("Không tìm thấy bảng giao dịch VIB trong file Excel.");
  }

  const accountNumber = metaValue(worksheet, "so tai khoan account number").replace(/^:\s*/, "").trim();
  const currency = metaValue(worksheet, "loai tien currency").replace(/^:\s*/, "").trim() || "VND";
  const closingBalanceText = metaValue(worksheet, "so du cuoi ky closing balance").replace(/^:\s*/, "").trim();
  if (!accountNumber) throw new Error("Không tìm thấy số tài khoản trong sao kê VIB.");

  const rows: VibTransactionRow[] = [];
  const occurrenceByFingerprint = new Map<string, number>();
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const [dateValue, descriptionValue, debitValue, creditValue, balanceValue] = readCells(
      worksheet,
      rowNumber,
      2,
      6,
    );
    if ([dateValue, descriptionValue, debitValue, creditValue, balanceValue].every(isBlank)) continue;

    const transactionDate = parseVibDate(dateValue);
    const description = cellText(descriptionValue).trim();
    if (!transactionDate) throw new Error(`Ngày giao dịch không hợp lệ ở dòng ${rowNumber}.`);
    if (!description) throw new Error(`Thiếu nội dung giao dịch ở dòng ${rowNumber}.`);

    const debitAmount = parseAmount(debitValue, rowNumber, "ghi nợ", true, true);
    const creditAmount = parseAmount(creditValue, rowNumber, "ghi có", true, true);
    const balanceAfter = parseAmount(balanceValue, rowNumber, "số dư cuối", false, false);
    if (debitAmount === 0 && creditAmount === 0) {
      throw new Error(`Dòng ${rowNumber} không có số tiền ghi nợ hoặc ghi có.`);
    }

    const fingerprint = [
      accountNumber,
      transactionDate.toISOString().slice(0, 10),
      normalizeTransferText(description),
      debitAmount,
      creditAmount,
      balanceAfter,
    ].join("|");
    const occurrence = (occurrenceByFingerprint.get(fingerprint) ?? 0) + 1;
    occurrenceByFingerprint.set(fingerprint, occurrence);
    const transactionCode = `VIB_${createHash("sha256").update(`${fingerprint}|${occurrence}`).digest("hex").slice(0, 24)}`;

    rows.push({
      transactionDate,
      statementRow: rowNumber,
      description,
      transactionCode,
      debitAmount,
      creditAmount,
      balanceAfter,
      raw: {
        NGAY_GIAO_DICH: cellText(dateValue),
        NOI_DUNG: description,
        GHI_NO: debitAmount,
        GHI_CO: creditAmount,
        SO_DU_CUOI: balanceAfter,
      },
    });
  }

  if (!rows.length) throw new Error("Không tìm thấy giao dịch hợp lệ trong sao kê VIB.");
  const timestamps = rows.map((row) => row.transactionDate.getTime());
  return {
    meta: {
      sourceBank: "VIB",
      currency,
      accountNumber,
      fromDate: new Date(Math.min(...timestamps)),
      toDate: new Date(Math.max(...timestamps)),
      closingBalance: closingBalanceText
        ? parseAmount(closingBalanceText, 0, "số dư cuối kỳ", false, false)
        : rows[rows.length - 1].balanceAfter,
    },
    rows,
  };
}

function readCells(worksheet: ExcelJS.Worksheet, row: number, startColumn: number, endColumn: number) {
  return Array.from({ length: endColumn - startColumn + 1 }, (_, index) =>
    worksheet.getCell(row, startColumn + index).value,
  );
}

function metaValue(worksheet: ExcelJS.Worksheet, normalizedLabel: string) {
  for (let row = 1; row <= Math.min(worksheet.rowCount, 100); row += 1) {
    for (let column = 1; column <= Math.min(worksheet.columnCount, 12); column += 1) {
      if (normalizeTransferText(cellText(worksheet.getCell(row, column).value)) === normalizedLabel) {
        return cellText(worksheet.getCell(row, column + 1).value);
      }
    }
  }
  return "";
}

function parseVibDate(value: ExcelJS.CellValue) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = cellText(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(
  value: ExcelJS.CellValue,
  row: number,
  field: string,
  blankIsZero: boolean,
  absolute: boolean,
) {
  if (isBlank(value)) {
    if (blankIsZero) return 0;
    throw new Error(`Thiếu ${field} ở dòng ${row}.`);
  }
  if (typeof value === "number" && Number.isFinite(value)) return absolute ? Math.abs(value) : value;
  const normalized = cellText(value).replace(/\s*VND\s*$/i, "").replace(/[,\s]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${field} không hợp lệ ở dòng ${row}: ${cellText(value)}`);
  }
  const amount = Number(normalized);
  return absolute ? Math.abs(amount) : amount;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function isBlank(value: ExcelJS.CellValue) {
  return value == null || cellText(value).trim() === "";
}
