(function (root) {
  'use strict';
  const brackets = [20, 50, 100, 250, 500, 1000, 2000];
  const letter = [8, 16, 24, 40, 72, 112, 160];
  const printed = [6, 6, 11, 16, 32, 56, 88];
  const types = [
    { value: 'letter', label: '平信（信函）' },
    { value: 'letter_express', label: '限時信函' },
    { value: 'letter_registered', label: '掛號函件' },
    { value: 'letter_express_registered', label: '限時掛號函件' },
    { value: 'letter_return', label: '雙掛號（掛號附回執）' },
    { value: 'printed', label: '印刷物' },
    { value: 'printed_registered', label: '掛號印刷物' },
    { value: 'small_packet', label: '小包' },
    { value: 'small_packet_registered', label: '掛號小包' }
  ];
  function calculate(type, weight, quantity) {
    const grams = Number(weight), count = Number(quantity);
    if (!Number.isFinite(grams) || grams <= 0) throw new Error('重量須大於 0 公克');
    if (!Number.isInteger(count) || count < 1 || count > 100000) throw new Error('份數須為 1 至 100,000 的整數');
    let base, extra = 0;
    if (type.startsWith('letter')) {
      if (grams > 20000) throw new Error('信函超過 20 公斤，請向郵局確認');
      base = grams <= 2000 ? letter[brackets.findIndex(limit => grams <= limit)] : 160 + Math.ceil((grams - 2000) / 1000) * 48;
      if (type.includes('express')) extra += 7;
      if (type.includes('registered') || type === 'letter_return') extra += 20;
      if (type === 'letter_return') extra += 15;
    } else if (type.startsWith('printed')) {
      if (grams > 2000) throw new Error('印刷物超過 2 公斤或為單本書籍，請用官方資費查詢');
      base = printed[brackets.findIndex(limit => grams <= limit)];
      if (type.endsWith('registered')) extra = 20;
    } else if (type.startsWith('small_packet')) {
      if (grams > 1000) throw new Error('小包超過 1 公斤，請改查包裹資費');
      base = Math.ceil(grams / 100) * 12;
      if (type.endsWith('registered')) extra = 20;
    } else throw new Error('請選擇郵件種類');
    return { base, extra, unit: base + extra, quantity: count, total: (base + extra) * count };
  }
  const api = { types, calculate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PostalTools = api;
  if (typeof document !== 'undefined') {
    const update = () => {
      const type = document.getElementById('postageType')?.value;
      const weight = document.getElementById('postageWeight')?.value;
      const quantity = document.getElementById('postageQuantity')?.value;
      const set = (id, value) => { document.getElementById(id).textContent = value; };
      try {
        const result = calculate(type, weight, quantity);
        set('postageUnit', `NT$ ${result.unit.toLocaleString('zh-TW')}`);
        set('postageCount', `${result.quantity.toLocaleString('zh-TW')} 件`);
        set('postageTotal', `NT$ ${result.total.toLocaleString('zh-TW')}`);
        set('postageBreakdown', `每件基本郵資 ${result.base} 元${result.extra ? `＋附加費 ${result.extra} 元` : ''}，共 ${result.quantity} 件。`);
        set('postageError', '');
      } catch (error) {
        for (const id of ['postageUnit', 'postageCount', 'postageTotal']) set(id, '—');
        set('postageBreakdown', '');
        set('postageError', error.message);
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      for (const id of ['postageType', 'postageWeight', 'postageQuantity']) {
        const control = document.getElementById(id);
        control?.addEventListener('input', update);
        control?.addEventListener('change', update);
      }
      update();
      const zipInput = document.getElementById('postalZipQuery');
      const zipResults = document.getElementById('postalZipResults');
      if (zipInput && zipResults) {
        let records = [];
        const normalized = value => String(value || '').replace(/臺/g, '台').replace(/\s+/g, '').toLowerCase();
        const render = () => {
          const query = normalized(zipInput.value);
          if (!query) { zipResults.textContent = '輸入行政區或郵遞區號前 3 碼。'; return; }
          const matches = records.filter(item => normalized(item.name).includes(query) || item.code.startsWith(query));
          if (!matches.length) { zipResults.textContent = '查無相符的 3 碼資料；請試完整行政區名稱或使用官方查詢。'; return; }
          zipResults.replaceChildren(...matches.slice(0, 30).map(item => {
            const row = document.createElement('div');
            row.className = 'postal-zip-row';
            const code = document.createElement('strong');
            code.textContent = item.code;
            const name = document.createElement('span');
            name.textContent = item.name;
            row.append(code, name);
            return row;
          }));
          if (matches.length > 30) {
            const more = document.createElement('p');
            more.className = 'postal-tool-note';
            more.textContent = `另有 ${matches.length - 30} 筆，請輸入更完整的名稱。`;
            zipResults.append(more);
          }
        };
        zipResults.textContent = '正在載入中華郵政 3 碼資料…';
        fetch('./assets/postal-code3-source.xml').then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        }).then(xml => {
          const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
          if (documentXml.querySelector('parsererror')) throw new Error('XML 格式錯誤');
          records = [...documentXml.documentElement.children].map(entry => ({
            name: entry.getElementsByTagName('行政區名')[0]?.textContent?.trim() || '',
            code: entry.getElementsByTagName('_x0033_碼郵遞區號')[0]?.textContent?.trim() || ''
          })).filter(item => item.name && /^\d{3}$/.test(item.code));
          if (!records.length) throw new Error('資料內容為空');
          render();
        }).catch(() => { zipResults.textContent = '3 碼資料載入失敗，請使用下方的中華郵政官方查詢。'; });
        zipInput.addEventListener('input', render);
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
