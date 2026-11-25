const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const importApi = require('./scripts/mail-import.js');
const line = prefix => {
  const result = app.split(/\r?\n/).find(value => value.startsWith(prefix));
  assert.ok(result, `Missing ${prefix}`);
  return result;
};
const context = vm.createContext({ mailTypeList: [{ name: '收件專用類型' }], DEFAULT_MAIL_TYPES: ['收件預設'] });
vm.runInContext([
  line('const GENERAL_OUTGOING_TYPE_ORDER='),
  line('function currentMailTypes()'),
  line('function outgoingTypeGroup('),
  line('function generalOutgoingTypes()'),
  line('function requiresOutgoingTracking(')
].join('\n'), context);

const expected = ['平信', '限時', '印刷品', '掛號函件', '限時掛號', '快捷郵件', '雙掛號', '掛號小包', '掛號包裹', '其他'];
assert.deepEqual(Array.from(context.generalOutgoingTypes()), expected);
assert.deepEqual(Array.from(context.currentMailTypes()), ['收件專用類型']);
context.mailTypeList.push({ name: '新增收件種類' });
assert.deepEqual(Array.from(context.generalOutgoingTypes()), expected);

for (const [oldName, canonical] of [['掛號', '掛號函件'], ['掛號信函', '掛號函件'], ['限掛', '限時掛號'], ['快捷', '快捷郵件']]) {
  assert.equal(context.outgoingTypeGroup(oldName), canonical);
  assert.equal(importApi.normalizeMailType(oldName), canonical);
}
for (const name of ['雙掛號', '掛號小包', '掛號包裹', '平信', '限時', '印刷品']) {
  assert.equal(importApi.normalizeMailType(name), name);
}
for (const name of ['掛號函件', '限時掛號', '快捷郵件', '雙掛號', '掛號小包', '掛號包裹']) {
  assert.equal(context.requiresOutgoingTracking(name), true, name);
}
for (const name of ['平信', '限時', '印刷品']) {
  assert.equal(context.requiresOutgoingTracking(name), false, name);
}
const mapping = { trackingNo: 0, receiverName: 1, address: 2, mailType: 3 };
const matrix = [
  ['掛號號碼', '收件人', '地址', '郵件種類'],
  ['', '甲', '台北', '雙掛號'],
  ['', '乙', '台中', '限掛'],
  ['', '丙', '高雄', '']
];
const rows = importApi.makeDraftRows(matrix, 0, mapping, { sendDate: '2026-11-18', mailType: '掛號函件' });
assert.deepEqual(rows.map(row => row.mailType), ['雙掛號', '限時掛號', '掛號函件']);
assert.match(html, /收件類型維護/);
assert.match(html, /app\.js\?v=1\.9\.33/);
assert.match(html, /mail-import\.js\?v=1\.9\.22/);
assert.doesNotMatch(html, /郵件類型維護/);
console.log('PASS: 一般寄件種類獨立、舊稱相容、Excel 匯入及單號需求');
