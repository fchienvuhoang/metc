import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { BankStatementRow, ParsedBankStatement } from "@/lib/statement";
import { assertStatementBank } from "@/lib/statement-bank";
import { normalizeTransferText } from "@/lib/text";

// ACB's original export has no bank heading. Require the complete supported
// layout and statement metadata; never identify a bank from transaction text.
export async function parseAcbStatement(input: Buffer): Promise<ParsedBankStatement> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel không có sheet dữ liệu.");
  const layouts = [
    ["ngay hieu luc", "ngay giao dich", "so gd", "noi dung giao dich", "so tien rut ra", "so tien gui vao", "so du"],
    ["ngay hieu luc", "ngay giao dich", "so gd", "noi dung giao dich", "tai khoan dinh danh", "so tien rut ra", "so tien gui vao", "so du"],
  ];
  let header = 0;
  let debitColumn = 5;
  for (let r = 1; r <= Math.min(sheet.rowCount, 100); r++) {
    const headings = layouts.find(layout => layout.every((h, i) => normalizeTransferText(sheet.getCell(r, i + 1).text) === h));
    if (headings) { header = r; debitColumn = headings.length - 2; break; }
  }
  if (!header) throw new Error("Không tìm thấy bảng giao dịch theo mẫu sao kê ACB.");
  const metadata = Array.from({ length: header - 1 }, (_, i) => sheet.getCell(i + 1, 1).text.trim());
  const account = metadata.map(s => s.match(/^BẢNG SAO KÊ GIAO DỊCH\s*-\s*Số tài khoản \(VND\):\s*(\d+)$/i)).find(Boolean);
  const owner = metadata.map(s => s.match(/^Chủ tài khoản:\s*(.+)$/i)).find(Boolean);
  const period = metadata.map(s => s.match(/^Từ ngày:\s*(\d{2}\/\d{2}\/\d{4})\s+Đến ngày:\s*(\d{2}\/\d{2}\/\d{4})$/i)).find(Boolean);
  const summary = Array.from({ length: header - 1 }, (_, i) => i + 1).find(r =>
    ["so du dau", "tong tien rut ra", "tong tien gui vao", "so du cuoi"].every((h, i) => normalizeTransferText(sheet.getCell(r, i + debitColumn - 1).text) === h));
  if (!account || !owner || !period || !summary || summary + 1 >= header) throw new Error("Không xác định rõ mẫu sao kê ACB gốc hoặc thiếu thông tin tài khoản.");
  const number = (r: number, col: number, blank = false) => {
    const raw = sheet.getCell(r, col).text.trim().replace(/,/g, "");
    if (!raw && blank) return 0;
    if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error(`Số tiền ACB không hợp lệ ở dòng ${r}.`);
    return Number(raw);
  };
  assertStatementBank(sheet, header, "ACB", true);
  const openingBalance = number(summary + 1, debitColumn - 1);
  const totalDebit = number(summary + 1, debitColumn);
  const totalCredit = number(summary + 1, debitColumn + 1);
  const closingBalance = number(summary + 1, debitColumn + 2);
  const fromDate = parseDate(period[1]);
  const toDate = new Date(parseDate(period[2]).getTime() + 86400000 - 1);
  const rows: BankStatementRow[] = [];
  const references = new Set<string>();
  let running = openingBalance;
  for (let r = header + 1; r <= sheet.rowCount; r++) {
    if (!sheet.getRow(r).hasValues) continue;
    const effectiveDate = parseDate(sheet.getCell(r, 1).text.trim());
    const transactionDate = parseDate(sheet.getCell(r, 2).text.trim(), true);
    const reference = sheet.getCell(r, 3).text.trim();
    const description = sheet.getCell(r, 4).text.trim();
    if (!/^\d+$/.test(reference) || !description) throw new Error(`Thiếu số GD hoặc nội dung ACB ở dòng ${r}.`);
    if (references.has(reference)) throw new Error(`Số GD ACB bị trùng trong file: ${reference}.`);
    references.add(reference);
    // Evening transactions may become effective the next day, outside the export period.
    if (transactionDate < fromDate || transactionDate > toDate) throw new Error(`Ngày giao dịch ngoài kỳ sao kê ACB ở dòng ${r}.`);
    const debitAmount = number(r, debitColumn, true), creditAmount = number(r, debitColumn + 1, true), balanceAfter = number(r, debitColumn + 2);
    if ((debitAmount > 0) === (creditAmount > 0)) throw new Error(`Dòng ${r} phải có đúng một khoản tiền rút hoặc gửi dương.`);
    running += creditAmount - debitAmount;
    if (Math.abs(running - balanceAfter) > 0.01) throw new Error(`Số dư ACB không khớp tại dòng ${r}.`);
    // Account + posting ID stays stable across overlapping exports.
    const transactionCode = `ACB_${createHash("sha256").update(`${account[1]}|${reference}|${transactionDate.toISOString()}`).digest("hex").slice(0, 32)}`;
    rows.push({ transactionDate, statementRow: r, description, transactionCode, debitAmount, creditAmount, balanceAfter,
      raw: { SOURCE_BANK: "ACB", REFERENCE: reference, EFFECTIVE_DATE: effectiveDate.toISOString(), NGAY_GIAO_DICH: sheet.getCell(r, 2).text, NOI_DUNG: description, GHI_NO: debitAmount, GHI_CO: creditAmount, SO_DU_CUOI: balanceAfter } });
  }
  if (!rows.length || Math.abs(running - closingBalance) > 0.01 || Math.abs(rows.reduce((s, r) => s + r.debitAmount, 0) - totalDebit) > 0.01 || Math.abs(rows.reduce((s, r) => s + r.creditAmount, 0) - totalCredit) > 0.01) throw new Error("Tổng phát sinh không khớp số dư cuối kỳ ACB.");
  return { meta: { sourceBank: "ACB", currency: "VND", accountNumber: account[1], accountName: owner[1], fromDate, toDate, openingBalance, closingBalance }, rows };
}

function parseDate(raw: string, withTime = false) {
  const m = raw.match(withTime ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Ngày ACB không hợp lệ: ${raw}.`);
  const [, d, mo, y, h = 0, mi = 0, s = 0] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) throw new Error(`Ngày ACB không hợp lệ: ${raw}.`);
  return new Date(date.getTime() - 7 * 3600000);
}

export function isAcbOpeningTransfer(accountNumber: string, row: BankStatementRow) {
  const candidate = accountNumber === "28808031" && row.raw.REFERENCE === "2501"
    && row.transactionDate.toISOString() === "2026-11-18T07:52:36.000Z";
  if (!candidate) return false;
  if (row.creditAmount !== 39982039 || row.debitAmount !== 0 || !normalizeTransferText(row.description).includes("cd khoa thien chuyen tu tk bidv 8870155131")) {
    throw new Error("Bút toán chuyển số dư BIDV sang ACB không khớp dữ liệu đã đối soát.");
  }
  return true;
}

export function isAcbPersonalReceipt(accountNumber: string, row: BankStatementRow) {
  return accountNumber === "28808031" && row.raw.REFERENCE === "2500"
    && row.transactionDate.toISOString() === "2026-11-13T14:45:02.000Z"
    && row.creditAmount === 100000 && row.debitAmount === 0;
}
