import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { createLoader } from './helpers/load-ts.mjs';

const { parseVibStatement } = createLoader()('src/lib/vib.ts');

// Synthetic copy of VIB's bank-name-free export layout; no customer data.
async function originalVibExport(change) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sao_ke_tai_khoan');
  for (const [cell, value] of Object.entries({
    B2: 'GIAO DỊCH TÀI KHOẢN', B3: 'ACCOUNT STATEMENT',
    B5: 'Số tài khoản (Account number)', C5: ': 000123456',
    B6: 'Loại tiền (Currency)', C6: ': VND',
    B7: 'Chủ tài khoản (Account holder)', C7: ': TEST USER',
    B8: 'Số CCCD (ID number)', C8: ': TEST ID',
    B9: 'Địa chỉ (Address)', C9: ': TEST ADDRESS',
    B10: 'Ngày in sao kê (Statement date)', C10: ': 10/11/2026',
    B11: 'Thời gian sao kê (Period covered)', C11: ': 08/11/2026 - 10/11/2026',
    B12: 'Phát sinh nợ (Total debit)', C12: ': 1,765,333 VND',
    D12: 'Số dư đầu kỳ (Opening balance)', E12: ': 122,000 VND',
    B13: 'Phát sinh có (Total credit)', C13: ': 1,643,333 VND',
    D13: 'Số dư cuối kỳ (Closing balance)', E13: ': 0 VND',
  })) sheet.getCell(cell).value = value;
  sheet.getRow(15).values = [null, 'Ngày giao dịch/Transaction date', 'Nội dung/Description', 'Ghi nợ/Debit', 'Ghi có/Credit', 'Số dư cuối/Running balance'];
  sheet.getRow(16).values = [null, '10/11/2026', 'Test debit', 200000, null, 0];
  sheet.getRow(17).values = [null, '09/11/2026', 'Test debit two', 1565333, null, 200000];
  sheet.getRow(18).values = [null, '08/11/2026', 'BIDV contribution', null, 1643333, 1765333];
  change?.(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('accepts the original VIB layout without requiring bank names in the heading or transactions', async () => {
  const buffer = await originalVibExport();
  const parsed = await parseVibStatement(buffer);
  assert.equal(parsed.meta.sourceBank, 'VIB');
  assert.equal(parsed.meta.accountNumber, '000123456');
  assert.equal(parsed.meta.closingBalance, 0);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows.reduce((sum, row) => sum + row.debitAmount, 0), 1765333);
  assert.equal(parsed.rows.reduce((sum, row) => sum + row.creditAmount, 0), 1643333);
  assert.deepEqual((await parseVibStatement(buffer)).rows.map(row => row.transactionCode), parsed.rows.map(row => row.transactionCode));
});

test('bank-name-free fallback still rejects foreign-bank headings and incomplete layouts', async () => {
  for (const change of [
    sheet => { sheet.getCell('B1').value = 'BIDV'; },
    sheet => { sheet.getCell('B10').value = null; },
    sheet => { sheet.name = 'Other bank'; },
  ]) await assert.rejects(parseVibStatement(await originalVibExport(change)), /không phải sao kê VIB/);
});

test('rejects altered debit/credit controls and inconsistent ending balances', async () => {
  await assert.rejects(parseVibStatement(await originalVibExport(sheet => { sheet.getCell('C12').value = ': 1 VND'; })), /Tổng phát sinh nợ/);
  await assert.rejects(parseVibStatement(await originalVibExport(sheet => { sheet.getCell('C13').value = ': 1 VND'; })), /Tổng phát sinh có/);
  await assert.rejects(parseVibStatement(await originalVibExport(sheet => { sheet.getCell('E13').value = ': 1 VND'; })), /không khớp số dư cuối kỳ/);
});
