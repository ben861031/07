(function (root) {
  'use strict';
  const byId = id => document.getElementById(id);
  const format = new Intl.NumberFormat('zh-TW').format;
  const limits = [20, 50, 100, 250, 500, 1000, 2000];
  const letterFees = [8, 16, 24, 40, 72, 112, 160];
  const printFees = [6, 6, 11, 16, 32, 56, 88];
  const mail = {
    letter: {max: 20000, fees: letterFees, extra: 48},
    print: {max: 2000, fees: printFees},
    book: {max: 5000, fees: printFees, extra: 32},
    packet: {max: 1000, step: 100, fee: 12},
    postcard: {fee: 5, services: 2},
    aerogram: {fee: 6, services: 1},
    speedpost: {max: 20000, speedpost: true},
    parcel: {max: 20000, parcel: true}
  };
  const commonKinds = {
    plain_letter: ['letter', 0], express_letter: ['letter', 1],
    printed_plain: ['print', 0], registered_letter: ['letter', 2],
    express_registered_letter: ['letter', 3], return_letter: ['letter', 4],
    registered_packet: ['packet', 2]
  };
  // 國內快捷：寄送區域 0/1/2 × 宅配或 i 郵箱取貨／自郵領件，依中華郵政資費表。
  const speedpostLimits = [250, 1000, 5000, 10000, 15000, 20000];
  const speedpostFees = [
    [[80, 100, 130, 170, 210, 250], [58, 78, 108, 148, 188, 228]],
    [[120, 150, 190, 250, 320, 400], [98, 128, 168, 228, 298, 378]],
    [[140, 170, 200, 275, 350, 425], [118, 148, 178, 253, 328, 403]]
  ];
  // 國內掛號包裹：到郵局窗口交寄、重量計費之普通資費（未含尺寸與優惠）。
  const parcelLimits = [5000, 10000, 15000, 20000];
  const parcelFees = [
    [[70, 90, 110, 135], [48, 68, 88, 113]],
    [[80, 100, 120, 145], [58, 78, 98, 123]],
    [[100, 125, 150, 180], [78, 103, 128, 158]]
  ];
  const services = [
    ['普通（平信）', 0], ['限時', 7], ['普通掛號', 20], ['限時掛號', 27],
    ['普通掛號＋普通回執', 35], ['普通掛號＋掛號回執', 45],
    ['普通掛號＋限時掛號回執', 52], ['限時掛號＋普通回執', 42],
    ['限時掛號＋掛號回執', 52], ['限時掛號＋限時掛號回執', 59]
  ];
  function calculate(kind, serviceIndex, grams, copies, zone = '', delivery = '0') {
    const preset = commonKinds[kind];
    const type = mail[preset?.[0] ?? kind];
    if (!type) throw new Error('請選擇郵件類型。');
    const count = Number(copies);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('份數須為正整數。');
    const allowedServices = type.services ?? services.length;
    const selected = preset ? preset[1] : Number(serviceIndex);
    if (!type.speedpost && !type.parcel && (!Number.isInteger(selected) || selected < 0 || selected >= allowedServices)) throw new Error('請選擇寄送方式。');
    let base, tier;
    if (type.speedpost || type.parcel) {
      if (zone === '' || !['0', '1', '2'].includes(String(zone)) || !['0', '1'].includes(String(delivery))) throw new Error(`請選擇${type.parcel ? '包裹' : '快捷'}的寄送區域與交付方式。`);
      const weight = Number(grams);
      if (!Number.isFinite(weight) || weight <= 0 || weight > type.max) throw new Error(`${type.parcel ? '國內包裹' : '國內快捷'}單件重量須大於 0 且不超過 20,000 公克。`);
      const feeLimits = type.parcel ? parcelLimits : speedpostLimits;
      const feeTable = type.parcel ? parcelFees : speedpostFees;
      const bracket = feeLimits.findIndex(limit => weight <= limit);
      base = feeTable[Number(zone)][Number(delivery)][bracket];
      tier = bracket === 0 ? `不逾 ${format(feeLimits[0])} 公克` : `逾 ${format(feeLimits[bracket - 1])} 至 ${format(feeLimits[bracket])} 公克`;
    } else if (!type.max) {
      base = type.fee;
      tier = '按件計費';
    } else {
      const weight = Number(grams);
      if (!Number.isFinite(weight) || weight <= 0 || weight > type.max) throw new Error(`單件重量須大於 0 且不超過 ${format(type.max)} 公克。`);
      if (type.step) {
        const bracket = Math.ceil(weight / type.step);
        base = type.fee * bracket;
        tier = bracket === 1 ? '不逾 100 公克' : `逾 ${format((bracket - 1) * 100)} 至 ${format(bracket * 100)} 公克`;
      } else {
        const bracket = limits.findIndex(limit => weight <= limit);
        if (bracket >= 0) {
          base = type.fees[bracket];
          tier = bracket === 0 ? '不逾 20 公克' : `逾 ${format(limits[bracket - 1])} 至 ${format(limits[bracket])} 公克`;
        } else {
          const extraUnits = Math.ceil((weight - 2000) / 1000);
          base = type.fees.at(-1) + extraUnits * type.extra;
          tier = `逾 ${format(2000 + (extraUnits - 1) * 1000)} 至 ${format(2000 + extraUnits * 1000)} 公克`;
        }
      }
    }
    const surcharge = type.speedpost || type.parcel ? 0 : services[selected][1];
    const unit = base + surcharge;
    const total = unit * count;
    if (!Number.isSafeInteger(total)) throw new Error('總金額超出可計算範圍，請減少份數。');
    return {unit, total, count, tier, base, surcharge};
  }
  root.PostalTools = {calculate, mail, services, commonKinds};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PostalTools;
  if (typeof document === 'undefined') return;

  function setupPostage() {
    const kind = byId('postageKind');
    const service = byId('postageService');
    const weight = byId('postageWeight');
    const count = byId('postageQuantity');
    const zone = byId('postageZone');
    const delivery = byId('postageDelivery');
    function render() {
      try {
        const result = calculate(kind.value, service.value, weight.value, count.value, zone.value, delivery.value);
        byId('postageTotal').textContent = format(result.total);
        byId('postageUnit').textContent = `NT$ ${format(result.unit)}`;
        byId('postageCount').textContent = `${format(result.count)} 件`;
        byId('postageTier').textContent = result.tier;
        byId('postageError').hidden = true;
        weight.setAttribute('aria-invalid', 'false');
        count.setAttribute('aria-invalid', 'false');
      } catch (error) {
        for (const id of ['postageTotal', 'postageUnit', 'postageCount', 'postageTier']) byId(id).textContent = '—';
        byId('postageError').textContent = error.message;
        byId('postageError').hidden = false;
        weight.setAttribute('aria-invalid', !(Number(weight.value) > 0));
        count.setAttribute('aria-invalid', !Number.isSafeInteger(Number(count.value)));
      }
    }
    function updateKind() {
      const preset = commonKinds[kind.value];
      const type = mail[preset?.[0] ?? kind.value];
      service.replaceChildren(...services.slice(0, type.services ?? services.length).map(([name], index) => new Option(name, index)));
      service.value = String(preset?.[1] ?? 0);
      byId('postageServiceField').hidden = Boolean(preset || type.speedpost || type.parcel || service.length === 1);
      byId('postageSpeedpostFields').hidden = !(type.speedpost || type.parcel);
      byId('postageWeightField').hidden = !type.max;
      if (type.max) {
        weight.max = type.max;
        byId('postageWeightHelp').textContent = `含信封或包裝；上限 ${format(type.max)} 公克。`;
      }
      render();
    }
    kind.addEventListener('change', updateKind);
    service.addEventListener('change', render);
    zone.addEventListener('change', render);
    delivery.addEventListener('change', render);
    weight.addEventListener('input', render);
    count.addEventListener('input', render);
    updateKind();
  }

  function normalizePlace(value) {
    return String(value || '').normalize('NFKC').replaceAll('台', '臺');
  }
  function setupZip3() {
    const city = byId('postalZipCity');
    const area = byId('postalZipDistrict');
    const search = byId('postalZipQuery');
    const list = byId('postalZipList');
    const status = byId('postalZipStatus');
    const rows = districts;
    const cities = [...new Set(rows.map(([name]) => name.slice(0, 3)))];
    city.append(...cities.map(name => new Option(name, name)));
    function showSelected(name, code) {
      byId('postalZipCode').textContent = code || '—';
      byId('postalZipPlace').textContent = name || '選取行政區後顯示結果';
    }
    function fillAreas() {
      area.replaceChildren(new Option(city.value ? '選擇行政區' : '先選擇縣市', ''));
      area.disabled = !city.value;
      if (city.value) area.append(...rows.filter(([name]) => name.startsWith(city.value)).map(([name, code]) => new Option(`${name.slice(3)}　${code}`, code)));
      showSelected('', '');
      renderList();
    }
    function renderList() {
      const terms = normalizePlace(search.value).trim().split(/\s+/).filter(Boolean);
      if (!city.value && !terms.length) {
        list.hidden = true;
        list.replaceChildren();
        status.textContent = '選擇縣市、行政區，或輸入地名開始查詢。';
        return;
      }
      const matched = rows.filter(([name, code]) => {
        if (city.value && !name.startsWith(city.value)) return false;
        const compact = name.replace(/^(.{2})[縣市]/, '$1');
        return terms.every(term => name.includes(term) || compact.includes(term) || code.includes(term));
      });
      if (matched.length === 1) showSelected(matched[0][0], matched[0][1]);
      else showSelected('', '');
      status.textContent = matched.length ? `找到 ${matched.length} 個行政區；可直接點選結果。` : '查無結果，請改用完整行政區名稱或前三碼。';
      list.replaceChildren(...matched.map(([name, code]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'postal-zip-item';
        button.innerHTML = `<span></span><strong></strong>`;
        button.querySelector('span').textContent = name;
        button.querySelector('strong').textContent = code;
        button.addEventListener('click', () => {
          city.value = name.slice(0, 3);
          fillAreas();
          area.value = code;
          showSelected(name, code);
        });
        return button;
      }));
      list.hidden = !matched.length;
      list.scrollTop = 0;
    }
    city.addEventListener('change', fillAreas);
    area.addEventListener('change', () => {
      const selected = rows.find(([name, code]) => name.startsWith(city.value) && code === area.value);
      showSelected(selected?.[0], selected?.[1]);
    });
    search.addEventListener('input', renderList);
    renderList();
  }

  function setupAddressLookup() {
const addressField = byId('postalFullAddress');
const addressStatus = byId('postalAddressResult');
const rangeRequests = new Map();
let latestLookup = 0;

function normalizeAddress(text) {
  const digits = '零一二三四五六七八九';
  return normalizePlace(text).replace(/[\s,，、]/g, '')
    .replace(/^[0-9]{3}(?:[0-9]{2,3})?(?=[^0-9])/, '')
    .replace(/[零〇一二兩三四五六七八九十百千]+(?=[段巷弄號樓鄰])/g, value => {
      let number = 0;
      let digit = 0;
      for (const char of value.replaceAll('兩', '二').replaceAll('〇', '零')) {
        const unit = {十: 10, 百: 100, 千: 1000}[char];
        if (unit) {
          number += (digit || 1) * unit;
          digit = 0;
        } else {
          digit = digit * 10 + digits.indexOf(char);
        }
      }
      return String(number + digit);
    });
}

function parseAddress(text) {
  const clean = normalizeAddress(text);
  const district = districts.find(([name]) => clean.startsWith(name));
  if (!district) return null;
  const remainder = clean.slice(district[0].length);
  const parts = remainder.match(/^(.*?)(?:(\d+)巷)?(?:(\d+)弄)?(\d+)(?:[-之](\d+))?號(?:之(\d+))?(?:(?:地下|B)(\d+)樓?|([1-9]\d*)[樓F])?(?:[-之]\d+|\d+室)*$/i);
  if (!parts) return null;
  const [, road, lane, alley, number, beforeSub, afterSub, basement, floor] = parts;
  if (!Number(number) || (beforeSub && afterSub)) return null;
  const withoutVillage = road.replace(/^.{1,8}?[村里](?:\d+鄰)?(?=.+)/, '');
  return {
    district: district[0], zip3: district[1], roads: [road, withoutVillage],
    lane: Number(lane || 0), alley: Number(alley || 0), number: Number(number),
    sub: Number(beforeSub || afterSub || 0), floor: basement ? -Number(basement) : Number(floor || 0),
  };
}

function rangeScore(range) {
  const floor = Boolean(range.floorStart || range.floorEnd);
  return (range.lane ? 100 : 0) + (range.alley ? 50 : 0)
    + (floor ? 30 : 0) + (range.numStart && range.numEnd < 9999 ? 20 : 0)
    + (range.even ? 10 : 0);
}

function matchesAddress(range, address) {
  if (range.lane && (address.lane < range.lane || address.lane > (range.lane1 || range.lane))) return false;
  if (range.alley && (address.alley < range.alley || address.alley > (range.alley1 || range.alley))) return false;
  if (range.even && address.number % 2 !== range.even % 2) return false;
  const number = address.number + address.sub / 10000;
  const start = range.numStart + range.numStart1 / 10000;
  const end = range.numEnd + range.numEnd1 / 10000;
  if (number < start || (end && range.numEnd < 9999 && number > end)) return false;
  if (!end && range.numStart && address.number !== range.numStart) return false;
  return true;
}

function resolveZip(ranges, address) {
  for (const road of new Set(address.roads)) {
    const matches = ranges.filter(range => normalizePlace(range.road) === road && matchesAddress(range, address));
    if (!matches.length) continue;
    const floorRules = matches.filter(range => range.floorStart || range.floorEnd);
    const applicable = matches.filter(range => !address.floor
      || ((!range.floorStart || address.floor >= range.floorStart)
        && (!range.floorEnd || address.floor <= range.floorEnd)));
    if (!applicable.length) return {message: '查無符合的樓層。請核對地址或使用中華郵政官方查詢。'};
    const ranked = applicable.map(range => [range, rangeScore(range)]).sort((a, b) => b[1] - a[1]);
    const codes = new Set(ranked.filter(([, score]) => score === ranked[0][1]).map(([range]) => range.zip6));
    if (!address.floor && floorRules.length) {
      for (const range of floorRules) codes.add(range.zip6);
      if (codes.size > 1) return {message: '這個門牌的區號會依樓層而異。請補上樓層後再查。'};
    }
    if (codes.size === 1) return {code: [...codes][0]};
    return {message: '這個地址符合多筆區號。請核對巷、弄、門牌及樓層，或到中華郵政確認。'};
  }
  return {message: '查無符合的六碼。請核對路段及門牌，或到中華郵政確認。'};
}

function loadRanges(zip3) {
  const prefix = zip3.slice(0, 1);
  if (!rangeRequests.has(prefix)) {
    rangeRequests.set(prefix, fetch(`./assets/postal/zip-ranges/${prefix}.json`).then(response => {
      if (!response.ok) throw new Error('Postal data unavailable');
      return response.json();
    }).catch(error => {
      rangeRequests.delete(prefix);
      throw error;
    }));
  }
  return rangeRequests.get(prefix).then(areas => {
    const ranges = areas[zip3];
    if (!Array.isArray(ranges)) throw new Error('Postal district unavailable');
    return {ranges};
  });
}

addressField.addEventListener('input', () => {
  latestLookup++;
  addressStatus.textContent = '';
});
byId('postalAddressForm').addEventListener('submit', async event => {
  event.preventDefault();
  const lookup = ++latestLookup;
  const address = parseAddress(addressField.value);
  if (!address) {
    addressStatus.textContent = '請輸入縣市、行政區及門牌，例如「台北市大安區愛國東路216號2樓」。';
    return;
  }
  addressStatus.textContent = '查詢中…';
  try {
    const {ranges} = await loadRanges(address.zip3);
    if (lookup !== latestLookup) return;
    const result = resolveZip(ranges, address);
    if (result.code) {
      const code = document.createElement('strong');
      code.className = 'postal-address-code';
      code.textContent = result.code;
      addressStatus.replaceChildren('6 碼郵遞區號', code);
    } else {
      addressStatus.textContent = result.message;
    }
  } catch {
    if (lookup === latestLookup) addressStatus.textContent = '暫時無法載入區號資料。請再試一次，或使用中華郵政官方查詢。';
  }
});

  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!byId('postageKind')) return;
    setupPostage();
    setupZip3();
    setupAddressLookup();
  });
})(typeof window !== 'undefined' ? window : globalThis);
