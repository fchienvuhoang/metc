import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { createLoader } from "./helpers/load-ts.mjs";
const { parseAcbStatement, isAcbOpeningTransfer } = createLoader()("src/lib/acb.ts");
async function statement(change) {
  const w = new ExcelJS.Workbook(), s = w.addWorksheet("Statement");
  s.addRow(["Chủ tài khoản: TEST USER"]);
  s.addRow(["Địa chỉ: Test"]); s.addRow([]);
  s.addRow(["BẢNG SAO KÊ GIAO DỊCH - Số tài khoản (VND): 28808031"]);
  s.addRow(["Từ ngày: 18/10/2026    Đến ngày: 18/11/2026"]);
  s.addRow([null,null,null,"Số dư đầu","(-) Tổng tiền rút ra","(+) Tổng tiền gửi vào","Số dư cuối"]);
  s.addRow([null,null,null,0,0,40082039,40082039]);
  s.addRow(["Ngày hiệu lực","Ngày giao dịch","Số GD","Nội dung giao dịch","Số tiền rút ra","Số tiền gửi vào","Số dư"]);
  s.addRow(["14/11/2026","13/11/2026 21:45:02","2500","NGUYEN TIEN LUC CHUYEN TIEN",null,100000,100000]);
  s.addRow(["18/11/2026","18/11/2026 14:52:36","2501","CD KHOA THIEN CHUYEN TU TK BIDV 8870155131 NGUYEN TIEN LUC",null,39982039,40082039]);
  change?.(s); return Buffer.from(await w.xlsx.writeBuffer());
}
test("ACB validates the original layout and balances, preserves local posting times and stable IDs", async () => {
  const a = await parseAcbStatement(await statement());
  assert.equal(a.meta.sourceBank,"ACB"); assert.equal(a.meta.closingBalance,40082039);
  assert.equal(a.rows[0].transactionDate.toISOString(),"2026-11-13T14:45:02.000Z");
  assert.deepEqual((await parseAcbStatement(await statement())).rows.map(r=>r.transactionCode),a.rows.map(r=>r.transactionCode));
  const overlap=await parseAcbStatement(await statement(s=>{s.getCell("D7").value=100000;s.getCell("F7").value=39982039;s.spliceRows(9,1)}));
  assert.equal(overlap.rows[0].transactionCode,a.rows[1].transactionCode);
  assert.equal(isAcbOpeningTransfer(a.meta.accountNumber,a.rows[0]),false);
  assert.equal(isAcbOpeningTransfer(a.meta.accountNumber,a.rows[1]),true);
  assert.equal(isAcbOpeningTransfer("999999",a.rows[1]),false);
  assert.throws(()=>isAcbOpeningTransfer(a.meta.accountNumber,{...a.rows[1],creditAmount:39982040}),/không khớp/);
});
test("ACB rejects wrong bank headings, inconsistent controls, dates and missing IDs", async () => {
  for(const change of [s=>{s.getCell("A2").value="VIB"},s=>{s.getCell("G10").value=1},s=>{s.getCell("F7").value=1},s=>{s.getCell("B9").value="31/02/2026 21:45:02"},s=>{s.getCell("C9").value=null},s=>{s.getCell("A5").value="Từ ngày: 19/11/2026    Đến ngày: 20/11/2026"}]){
    await assert.rejects(parseAcbStatement(await statement(change)));
  }
});

test("ACB import preserves the tenant, excludes the carryover and classifies only the confirmed 100k receipt; repeat imports do not add income", async () => {
  let batch, saved=[], balance=0;
  const tx={
    bankAccount:{findUnique:async()=>null,upsert:async args=>{balance=args.create.currentBalance;return{id:"acb-account"}}},
    importBatch:{create:async({data})=>{batch=data;return{id:"batch"}},update:async()=>{}},
    bankTransaction:{findMany:async()=>saved.map(r=>({transactionCode:r.transactionCode})),createMany:async({data})=>{saved.push(...data);return{count:data.length}}},
    campaign:{findUnique:async({where})=>{assert.deepEqual(where,{workspace_code:{workspace:"BIDV",code:"ca-nhan"}});return{id:"existing-personal",code:"ca-nhan"}}},
  };
  const prisma={campaignKeyword:{findMany:async()=>[]},openingBalance:{findUnique:async()=>null},$transaction:async f=>f(tx)};
  const {importBankStatement}=createLoader({"@/lib/prisma":{getPrisma:()=>prisma}})("src/lib/importer.ts");
  const result=await importBankStatement(await statement(),"ACB.xlsx","BIDV");
  assert.equal(result.insertedRows,1);assert.equal(result.excludedRows,1);assert.equal(result.duplicateRows,0);
  assert.equal(batch.excludedTransactions[0].creditAmount,39982039);
  assert.equal(Number(balance),40082039);
  assert.equal(saved[0].workspace,"BIDV");assert.equal(saved[0].campaignId,"existing-personal");
  assert.equal(saved[0].accountingType,"PERSONAL");assert.equal(saved[0].classificationStatus,"MANUAL");
  assert.equal(Number(saved[0].creditAmount),100000);
  const repeat=await importBankStatement(await statement(),"ACB.xlsx","BIDV");
  assert.equal(repeat.insertedRows,0);assert.equal(repeat.excludedRows,1);assert.equal(repeat.duplicateRows,1);assert.equal(saved.length,1);
});
