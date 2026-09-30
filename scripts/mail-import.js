(function (root) {
  "use strict";

  const fields = [
    { key: "trackingNo", label: "掛號編號", aliases: ["掛號編號", "掛號號碼", "掛號單號", "郵件編號", "郵件號碼", "郵局條碼", "條碼號碼", "條碼", "單號", "trackingno", "trackingnumber", "trackingid"] },
    { key: "receiverName", label: "收件人／單位", aliases: ["收件人", "收件者", "收件人姓名", "收件單位", "收件人單位", "收件人姓名或單位", "收件人姓名單位", "收件人或單位", "受件人", "recipient", "receiver", "addressee"] },
    { key: "address", label: "寄達地址", aliases: ["寄達地址", "寄達地名", "收件地址", "收件人地址", "收件者地址", "收件地點", "地址", "寄送地址", "郵寄地址", "destination", "address"] },
    { key: "sendDate", label: "交寄日期", aliases: ["交寄日期", "寄件日期", "寄出日期", "郵寄日期", "日期", "senddate", "maildate"] },
    { key: "mailType", label: "郵件種類", aliases: ["郵件種類", "郵件類型", "郵件種別", "種類", "類型", "寄件種類", "mailtype", "type"] },
    { key: "senderName", label: "寄件公司名稱", aliases: ["寄件公司名稱", "公司名稱", "寄件人", "寄件者", "寄件單位", "寄件公司", "sender", "company"] },
    { key: "remark", label: "備註", aliases: ["備註", "說明", "附註", "remark", "note", "notes"] }
  ];

  function normalizeHeader(value) {
    return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\u3000／/()（）\[\]【】:_：.-]/g, "");
  }

  function guessColumns(header) {
    const normalized = header.map(normalizeHeader);
    const used = new Set();
    const result = {};
    for (const field of fields) {
      let index = normalized.findIndex((value, i) => !used.has(i) && field.aliases.some(alias => value === normalizeHeader(alias)));
      if (index < 0) index = normalized.findIndex((value, i) => !used.has(i) && value.length >= 3 && field.aliases.some(alias => value.includes(normalizeHeader(alias))));
      result[field.key] = index;
      if (index >= 0) used.add(index);
    }
    return result;
  }

  function findHeaderRow(matrix) {
    let best = { index: 0, score: -1 };
    for (let index = 0; index < Math.min(matrix.length, 30); index++) {
      const row = matrix[index] || [];
      const mapping = guessColumns(row);
      const score = (mapping.trackingNo >= 0 ? 3 : 0) + (mapping.receiverName >= 0 ? 3 : 0) + (mapping.address >= 0 ? 3 : 0) + fields.filter(field => mapping[field.key] >= 0).length;
      if (score > best.score) best = { index, score };
    }
    return best.score >= 4 ? best.index : 0;
  }

  function excelColumn(index) {
    let value = index + 1, label = "";
    while (value > 0) {
      value--;
      label = String.fromCharCode(65 + value % 26) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }

  function parseDate(value, fallback = "") {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    const yearFirst = text.match(/^(\d{3,4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/)
      || (Number(text.slice(0, 2)) > 12 ? text.match(/^(\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/) : null);
    const monthFirst = !yearFirst && text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (!yearFirst && !monthFirst) return "";
    let year = Number(yearFirst ? yearFirst[1] : monthFirst[3]);
    if (year < 100) year += 2000;
    else if (year < 1911) year += 1911;
    const month = Number(yearFirst ? yearFirst[2] : monthFirst[1]);
    const day = Number(yearFirst ? yearFirst[3] : monthFirst[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function normalizeMailType(value, fallback = "掛號") {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    if (/快捷|express/i.test(text)) return "快捷郵件";
    if (/限掛|限時掛號/.test(text)) return "限時掛號";
    if (/掛號|registered/i.test(text)) return "掛號";
    if (/平信/.test(text)) return "平信";
    return text;
  }

  function makeDraftRows(matrix, headerRow, mapping, defaults) {
    const rows = [];
    for (let index = Math.max(0, headerRow + 1); index < matrix.length; index++) {
      const source = matrix[index] || [];
      if (!source.some(value => String(value ?? "").trim())) continue;
      const get = key => mapping[key] >= 0 ? String(source[mapping[key]] ?? "").trim() : "";
      rows.push({
        sourceRow: index + 1,
        trackingNo: get("trackingNo"),
        receiverName: get("receiverName"),
        address: get("address"),
        sendDate: parseDate(get("sendDate"), defaults.sendDate),
        mailType: normalizeMailType(get("mailType"), defaults.mailType || "掛號"),
        senderName: get("senderName") || defaults.senderName || "",
        remark: get("remark"),
        excluded: false,
        imported: false
      });
    }
    return rows;
  }

  function trackingKey(value) {
    return String(value ?? "").normalize("NFKC").replace(/[\s\-]/g, "").toUpperCase();
  }

  const api = { fields, normalizeHeader, guessColumns, findHeaderRow, excelColumn, parseDate, normalizeMailType, makeDraftRows, trackingKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MailExcelImport = api;
})(typeof window !== "undefined" ? window : globalThis);
