#!/usr/bin/env node
// Chạy từ thư mục dự án. Mặc định chỉ kiểm tra; thêm --apply để ghi nhận.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const apply = process.argv.includes('--apply');
const workspace = process.argv.find((s) => s.startsWith('--workspace='))?.split('=')[1];
const prefix = 'MANUAL-PERSONAL-69992-PLUS-11000-20261118';
const codes = [prefix + '-OUT', prefix + '-IN', prefix + '-EXTRA'];
const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000 });

async function balance(id) {
  const { rows } = await client.query(`
    /* Tính số dư theo cùng quy tắc ứng dụng: đầu kỳ + thu trực tiếp/phân bổ - chi trực tiếp/phân bổ. */
    SELECT COALESCE((SELECT amount FROM "OpeningBalanceAllocation" WHERE "campaignId"=$1),0)
      + COALESCE((SELECT SUM("creditAmount"-"debitAmount") FROM "BankTransaction" WHERE "campaignId"=$1),0)
      + COALESCE((SELECT SUM(CASE WHEN t."creditAmount">0 THEN a.amount ELSE 0 END
          - CASE WHEN t."debitAmount">0 THEN a.amount ELSE 0 END)
        FROM "TransactionAllocation" a JOIN "BankTransaction" t ON t.id=a."transactionId"
        WHERE a."campaignId"=$1),0) AS balance`, [id]);
  return Number(rows[0].balance);
}

async function main() {
  if (!env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong .env.local.');
  await client.connect();
  await client.query('/* Bắt đầu giao dịch nguyên tử; mọi lỗi đều rollback. */ BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query(`/* Ngăn dữ liệu liên quan thay đổi trong lúc kiểm tra và điều chuyển. */
    LOCK TABLE "Campaign", "BankTransaction", "TransactionAllocation", "OpeningBalanceAllocation" IN SHARE ROW EXCLUSIVE MODE`);
  const { rows } = await client.query('/* Đọc tên và workspace để xác định chính xác thiện pháp nguồn và đích. */ SELECT id,code,name,workspace FROM "Campaign"');
  const sources = rows.filter((r) => normalize(r.name) === 'thu chi ca nhan' && (!workspace || r.workspace === workspace));
  const targets = rows.filter((r) => normalize(r.name) === 'cung duong chung' && (!workspace || r.workspace === workspace));
  if (sources.length !== 1 || targets.length !== 1) {
    console.table(rows.map(({code,name,workspace}) => ({code,name,workspace})));
    throw new Error('Không xác định được duy nhất hai thiện pháp. Kiểm tra tên; nếu trùng workspace, thêm --workspace=VIB hoặc --workspace=BIDV.');
  }
  const [source, target] = [sources[0], targets[0]];
  if (source.workspace !== target.workspace) throw new Error('Hai thiện pháp thuộc hai workspace khác nhau; dừng để tránh ghi nhầm.');
  const existing = (await client.query('/* Kiểm tra mã cố định để chống chạy trùng cả ba bút toán. */ SELECT "transactionCode", "campaignId", "creditAmount", "debitAmount" FROM "BankTransaction" WHERE workspace=$1 AND "transactionCode"=ANY($2::text[])', [source.workspace, codes])).rows;
  const entries = [
    { code: codes[0], campaign: source, debit: 69992, credit: 0, description: `Điều chuyển số dư Thu chi cá nhân sang ${target.name}: 69.992đ` },
    { code: codes[1], campaign: target, debit: 0, credit: 69992, description: 'Nhận điều chuyển số dư từ Thu chi cá nhân: 69.992đ' },
    { code: codes[2], campaign: target, debit: 0, credit: 11000, description: 'Khoản thu thủ công bổ sung Cúng dường chung: 11.000đ' },
  ];
  if (existing.length) {
    if (existing.length !== 3 || !entries.every((e) => existing.some((r) => r.transactionCode === e.code && r.campaignId === e.campaign.id && Number(r.creditAmount) === e.credit && Number(r.debitAmount) === e.debit))) throw new Error('Có bút toán trùng hoặc không khớp; dừng, không ghi thêm.');
    console.log('Đã có đủ ba bút toán đúng số tiền. Không ghi trùng.');
    await client.query('/* Kết thúc kiểm tra chống trùng, không thay đổi dữ liệu. */ ROLLBACK');
    return;
  }
  const beforeSource = await balance(source.id);
  const beforeTarget = await balance(target.id);
  console.table([{thienPhap:source.name,workspace:source.workspace,truoc:beforeSource,sau:beforeSource-69992},{thienPhap:target.name,workspace:target.workspace,truoc:beforeTarget,sau:beforeTarget+80992}]);
  if (beforeSource !== 69992) throw new Error(`Số dư nguồn hiện là ${beforeSource}đ, khác 69.992đ; chưa ghi nhận.`);
  if (!apply) {
    await client.query('/* Chế độ kiểm tra: không ghi dữ liệu. */ ROLLBACK');
    console.log('Kiểm tra hợp lệ. Thêm --apply để thực hiện.');
    return;
  }
  for (const e of entries) {
    await client.query(`/* Ghi bút toán điều chuyển nội bộ hoặc khoản thu thủ công, giữ rõ nguồn gốc để đối soát. */
      INSERT INTO "BankTransaction" (id,"campaignId","transactionDate",description,"normalizedDescription","transactionCode","debitAmount","creditAmount","classificationStatus",raw,"updatedAt",workspace)
      VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,'MANUAL',$8::jsonb,NOW(),$9)`,
    [randomUUID(),e.campaign.id,e.description,normalize(e.description),e.code,e.debit,e.credit,JSON.stringify({source:'manual',operation:prefix,kind:e.code===codes[2]?'manual_income':'internal_transfer',sourceCampaignId:source.id,targetCampaignId:target.id}),source.workspace]);
  }
  if (await balance(source.id) !== 0 || await balance(target.id) !== beforeTarget + 80992) throw new Error('Số dư sau ghi không đúng; rollback toàn bộ.');
  await client.query('/* Xác nhận đủ: nguồn còn 0đ, đích tăng đúng 80.992đ. */ COMMIT');
  console.log('THÀNH CÔNG: Thu chi cá nhân còn 0đ; Cúng dường chung tăng 80.992đ (69.992đ điều chuyển + 11.000đ thu thủ công).');
  console.log('Các bút toán điều chuyển làm tăng thu và chi nội bộ cùng 69.992đ; tổng số dư chỉ tăng 11.000đ.');
  console.log('Trang công khai có bộ nhớ đệm: cần làm mới cache qua ứng dụng để thấy số liệu mới.');
}

main().catch(async (e) => {
  try { await client.query('/* Hủy toàn bộ thao tác khi có lỗi, tránh ghi một phần. */ ROLLBACK'); } catch {}
  console.error('CHƯA HOÀN TẤT:', e.message);
  process.exitCode = 1;
}).finally(() => client.end());
