import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './helpers/load-ts.mjs';

const { campaignStatementsText } = createLoader()('src/lib/campaign-statement.ts');
const first = { id: 'one', workspace: 'BIDV', code: 'tp01', name: 'Thiện pháp một', income: 1000000 };
const second = { id: 'two', workspace: 'BIDV', code: 'tp02', name: 'Thiện pháp hai', income: 2500000 };

test('empty selection produces no share text; a single selection preserves the original format', () => {
  assert.equal(campaignStatementsText([], 'https://example.test'), '');
  const text = campaignStatementsText([first], 'https://example.test/');
  assert.match(text, /CẬP NHẬT SAO KÊ THIỆN PHÁP TP01/);
  assert.ok(text.includes('1.000.000'));
  assert.ok(text.includes('https://example.test/thien-phap/bidv/tp01'));
  assert.ok(!text.includes('example.test//'));
  assert.ok(!text.includes('TP02'));
});

test('combo includes each campaign and URL once, counts duplicates once and totals only selected income', () => {
  const text = campaignStatementsText([first, second, first], 'https://example.test');
  assert.match(text, /CẬP NHẬT SAO KÊ 2 THIỆN PHÁP/);
  assert.equal(text.match(/KÍNH CHÚC QUÝ VỊ/g)?.length, 1);
  assert.equal(text.match(/https:\/\/example.test\/thien-phap\/bidv\/tp01/g)?.length, 1);
  assert.equal(text.match(/https:\/\/example.test\/thien-phap\/bidv\/tp02/g)?.length, 1);
  assert.ok(text.includes('1.000.000'));
  assert.ok(text.includes('2.500.000'));
  assert.ok(text.includes('3.500.000'));
});

test('VIB uses its own public path and cross-bank combinations are rejected', () => {
  const vib = { ...first, id: 'vib', workspace: 'VIB', income: 0 };
  assert.ok(campaignStatementsText([vib], 'https://example.test').includes('https://example.test/thien-phap/tp01'));
  assert.throws(() => campaignStatementsText([vib, second], 'https://example.test'), /cùng ngân hàng/);
});
