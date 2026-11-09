import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import officeCrypto from "officecrypto-tool";
import { createLoader } from "./helpers/load-ts.mjs";
const { parseBidvStatement } = createLoader()("src/lib/bidv.ts");

async function statement(change) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BIDV");
  sheet.addRow(["Bank for Investment and Development of VietNam JSC"]);
  sheet.addRow(["Số tài khoản /Account No:", "000123456"]);
  sheet.addRow(["Tên tài khoản /Account Name:", "TEST USER"]);
  sheet.addRow([]);
  sheet.addRow(["STT", "Ngày giao dịch", "Phát sinh nợ", "Phát sinh có", "Số dư", "Diễn giải", "Số tham chiếu"]);
  sheet.addRow(["Số dư đầu kỳ", null, null, null, 0]);
  sheet.addRow(["1", "06/10/2026 13:24:24", 0, 100, 100, "Test contribution", "ref1"]);
  sheet.addRow(["2", "06/10/2026 13:25:24", 150, 0, 50, "Test debit", "ref2"]);
  sheet.addRow(["3", "06/10/2026 13:26:24", 0, 100, 50, "Test interest", "ref2"]);
  sheet.addRow(["Số dư cuối kỳ", null, null, null, 50]);
  change?.(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("BIDV parses local times, metadata, split references and signed overdrawn balances", async () => {
  const buffer = await statement();
  const parsed = await parseBidvStatement(buffer);
  assert.equal(parsed.meta.accountNumber, "000123456");
  assert.equal(parsed.meta.accountName, "TEST USER");
  assert.equal(parsed.meta.sourceBank, "BIDV");
  assert.equal(parsed.rows[0].transactionDate.toISOString(), "2026-10-06T06:24:24.000Z");
  assert.equal(parsed.rows[1].balanceAfter, -50);
  assert.equal(parsed.meta.closingBalance, 50);
  assert.equal(new Set(parsed.rows.map((row) => row.transactionCode)).size, 3);
  assert.deepEqual((await parseBidvStatement(buffer)).rows.map((row) => row.transactionCode), parsed.rows.map((row) => row.transactionCode));
});

test("encrypted BIDV requires the correct password and supports the environment default", async () => {
  const encrypted = await officeCrypto.encrypt(await statement(), { password: "test-password" });
  const previous = process.env.BIDV_STATEMENT_PASSWORD;
  delete process.env.BIDV_STATEMENT_PASSWORD;
  try {
    await assert.rejects(parseBidvStatement(encrypted), /có mật khẩu/);
    await assert.rejects(parseBidvStatement(encrypted, "wrong"), /kiểm tra mật khẩu/);
    process.env.BIDV_STATEMENT_PASSWORD = "test-password";
    assert.equal((await parseBidvStatement(encrypted)).rows.length, 3);
    assert.equal((await parseBidvStatement(encrypted, "test-password")).rows.length, 3);
  } finally {
    if (previous == null) delete process.env.BIDV_STATEMENT_PASSWORD;
    else process.env.BIDV_STATEMENT_PASSWORD = previous;
  }
});

test("BIDV rejects wrong-bank files, invalid dates, missing references and inconsistent totals", async () => {
  await assert.rejects(parseBidvStatement(await statement((s) => { s.getCell("A1").value = "VIB"; })), /không phải sao kê BIDV/);
  await assert.rejects(parseBidvStatement(await statement((s) => { s.getCell("B7").value = "31/02/2026 10:00:00"; })), /Ngày giao dịch/);
  await assert.rejects(parseBidvStatement(await statement((s) => { s.getCell("G7").value = null; })), /số tham chiếu/);
  await assert.rejects(parseBidvStatement(await statement((s) => { s.getCell("E10").value = 51; })), /số dư cuối kỳ/);
});
