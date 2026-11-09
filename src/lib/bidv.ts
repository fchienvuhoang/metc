import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { decrypt, isEncrypted } from "officecrypto-tool";
import type { BankStatementRow, ParsedBankStatement } from "@/lib/statement";
import { assertStatementBank } from "@/lib/statement-bank";
import { normalizeTransferText } from "@/lib/text";

export async function parseBidvStatement(input: Buffer, password?: string): Promise<ParsedBankStatement> {
  password = password || process.env.BIDV_STATEMENT_PASSWORD;
  let buffer = input;
  if (isEncrypted(input)) {
    if (!password) throw new Error("File sao kê BIDV có mật khẩu. Vui lòng nhập mật khẩu mở Excel.");
    if (password.length > 255) throw new Error("Mật khẩu mở Excel quá dài.");
    try {
      buffer = await decrypt(input, { password });
    } catch {
      throw new Error("Không mở được sao kê BIDV. Vui lòng kiểm tra mật khẩu Excel.");
    }
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel không có sheet dữ liệu.");
  let headerRow = 0;
  const columns: Record<string, number> = {};
  const headers: Record<string, string> = {
    stt: "index", "ngay giao dich": "date", "phat sinh no": "debit", "phat sinh co": "credit",
    "so du": "balance", "dien giai": "description", "so tham chieu": "reference",
  };
  for (let row = 1; row <= Math.min(sheet.rowCount, 100); row++) {
    const found: Record<string, number> = {};
    sheet.getRow(row).eachCell((cell, column) => {
      const key = headers[normalizeTransferText(text(cell.value))];
      if (key) found[key] = column;
    });
    if (["index", "date", "debit", "credit", "balance", "description", "reference"].every((key) => found[key])) {
      Object.assign(columns, found);
      headerRow = row;
      break;
    }
  }
  if (!headerRow) throw new Error("Không tìm thấy bảng giao dịch theo mẫu sao kê BIDV.");
  assertStatementBank(sheet, headerRow, "BIDV");
  const accountNumber = metadata(sheet, "so tai khoan account no");
  if (!/^\d+$/.test(accountNumber)) throw new Error("Không tìm thấy số tài khoản hợp lệ trong sao kê BIDV.");
  const accountName = metadata(sheet, "ten tai khoan account name");
  const openingBalance = labelledAmount(sheet, "so du dau ky", columns.balance);
  const closingBalance = labelledAmount(sheet, "so du cuoi ky", columns.balance);
  const rows: BankStatementRow[] = [];
  const occurrences = new Map<string, number>();
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const at = (key: string) => sheet.getCell(row, columns[key]).value;
    if (!/^\d+$/.test(text(at("index")).trim())) continue;
    const transactionDate = parseDate(at("date"), row);
    const description = text(at("description")).trim();
    if (!description) throw new Error(`Thiếu diễn giải ở dòng ${row}.`);
    const debitAmount = amount(at("debit"), row, true);
    const creditAmount = amount(at("credit"), row, true);
    const balanceAfter = amount(at("balance"), row);
    if (debitAmount < 0 || creditAmount < 0 || (debitAmount > 0) === (creditAmount > 0)) {
      throw new Error(`Dòng ${row} phải có đúng một khoản phát sinh nợ hoặc có dương.`);
    }
    const reference = text(at("reference")).trim();
    if (!reference) throw new Error(`Thiếu số tham chiếu BIDV ở dòng ${row}, không thể chống trùng an toàn.`);
    // BIDV can reuse a reference for distinct posting lines (e.g. interest).
    const fingerprint = [accountNumber, reference, transactionDate.toISOString(), debitAmount, creditAmount, balanceAfter, description].join("|");
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
    occurrences.set(fingerprint, occurrence);
    const transactionCode = `BIDV_${createHash("sha256").update(`${fingerprint}|${occurrence}`).digest("hex").slice(0, 32)}`;
    rows.push({ transactionDate, statementRow: row, description, transactionCode, debitAmount, creditAmount, balanceAfter,
      raw: { REFERENCE: reference, NGAY_GIAO_DICH: text(at("date")), NOI_DUNG: description, GHI_NO: debitAmount, GHI_CO: creditAmount, SO_DU_CUOI: balanceAfter },
    });
  }
  if (!rows.length) throw new Error("Không tìm thấy giao dịch hợp lệ trong sao kê BIDV.");
  let runningBalance = openingBalance;
  for (const row of rows) {
    runningBalance += row.creditAmount - row.debitAmount;
    // Some BIDV exports display the magnitude of an overdrawn balance without a minus sign.
    if (Math.abs(runningBalance - row.balanceAfter) > 0.01 && Math.abs(Math.abs(runningBalance) - row.balanceAfter) > 0.01) throw new Error(`Số dư không khớp phát sinh tại dòng ${row.statementRow}.`);
    row.balanceAfter = runningBalance;
  }
  if (Math.abs(runningBalance - closingBalance) > 0.01) throw new Error("Tổng phát sinh không khớp số dư cuối kỳ BIDV.");
  const dates = rows.map((row) => row.transactionDate.getTime());
  return { meta: { sourceBank: "BIDV", currency: "VND", accountNumber, accountName, openingBalance, closingBalance,
    fromDate: new Date(Math.min(...dates)), toDate: new Date(Math.max(...dates)) }, rows };
}

function text(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text);
  }
  return String(value);
}

function metadata(sheet: ExcelJS.Worksheet, label: string) {
  for (let row = 1; row <= Math.min(sheet.rowCount, 100); row++) {
    for (let column = 1; column <= sheet.columnCount; column++) {
      const value = sheet.getCell(row, column);
      if (value.isMerged && value.master.address !== value.address) continue;
      if (normalizeTransferText(text(value.value)) !== label) continue;
      for (let next = column + 1; next <= sheet.columnCount; next++) {
        const cell = sheet.getCell(row, next);
        if (cell.isMerged && cell.master.address !== cell.address) continue;
        const result = text(cell.value).trim();
        if (result) return result;
      }
    }
  }
  return "";
}

function labelledAmount(sheet: ExcelJS.Worksheet, label: string, column: number) {
  for (let row = 1; row <= sheet.rowCount; row++) {
    let found = false;
    sheet.getRow(row).eachCell((cell) => { if (normalizeTransferText(text(cell.value)) === label) found = true; });
    if (found) return amount(sheet.getCell(row, column).value, row);
  }
  throw new Error(`Thiếu ${label} trong sao kê BIDV.`);
}

function amount(value: ExcelJS.CellValue, row: number, blankIsZero = false) {
  const raw = text(value).trim();
  if (!raw && blankIsZero) return 0;
  const normalized = raw.replace(/[,\s]/g, "").replace(/VND$/i, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`Số tiền không hợp lệ ở dòng ${row}.`);
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`Số tiền không hợp lệ ở dòng ${row}.`);
  return result;
}

function parseDate(value: ExcelJS.CellValue, row: number) {
  const raw = text(value).trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Ngày giao dịch không hợp lệ ở dòng ${row}.`);
  const [, day, month, year, hour, minute, second] = match.map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error(`Ngày giao dịch không hợp lệ ở dòng ${row}.`);
  return new Date(local.getTime() - 7 * 60 * 60 * 1000);
}
