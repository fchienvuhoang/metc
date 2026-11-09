import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { createLoader } from "./helpers/load-ts.mjs";
const load = createLoader();
const { parseVibStatement } = load("src/lib/vib.ts");
const { parseBidvStatement } = load("src/lib/bidv.ts");

async function vibStatement(bank = "Ngân hàng Quốc tế VIB", description = "BIDV chuyển tiền") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sao ke");
  sheet.addRow([bank]);
  sheet.addRow(["Số tài khoản / Account Number", "000123456"]);
  sheet.addRow(["Loại tiền / Currency", "VND"]);
  sheet.addRow(["Số dư cuối kỳ / Closing Balance", 100]);
  sheet.addRow([null, "Ngày giao dịch / Transaction Date", "Nội dung / Description", "Ghi nợ / Debit", "Ghi có / Credit", "Số dư cuối / Running Balance"]);
  sheet.addRow([null, "06/10/2026", description, 0, 100, 100]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("VIB validates bank identity before importing, independently of bank names in transactions", async () => {
  assert.equal((await parseVibStatement(await vibStatement())).meta.sourceBank, "VIB");
  for (const heading of ["BIDV", "Unknown bank", "", "VIB BIDV"]) {
    await assert.rejects(parseVibStatement(await vibStatement(heading, "VIB")), /không phải sao kê VIB/);
  }
  await assert.rejects(parseBidvStatement(await vibStatement()), /mẫu sao kê BIDV/);
});

test("wrong-bank files fail before database access even when named as the selected bank", async () => {
  const { importBankStatement } = createLoader({
    "@/lib/prisma": { getPrisma: () => { throw new Error("Database must not be reached"); } },
  })("src/lib/importer.ts");
  await assert.rejects(importBankStatement(await vibStatement("BIDV"), "VIB.xlsx", "VIB"), /không phải sao kê VIB/);
  await assert.rejects(importBankStatement(await vibStatement(), "BIDV.xlsx", "BIDV"), /mẫu sao kê BIDV/);
});
